-- ============================================================================
-- Envanter D2 / Adım 1 — Üretim malzemesi soyutlaması + sürümlü tüketim profili
--
-- Tasarım notu: docs/inventory-v2/d2-design.md
-- Tamamen ADDITIVE: hiçbir kolon/tablo düşürülmez, hiçbir davranış değişmez.
-- Miktarsız akış `lab_settings.inventory_qtyless_enabled` ile açılır (default false).
--
-- Kilitli kararlar:
--   K1 teknisyen miktar girmez        K2 miktarı kimse düzeltemez
--   K3 fire = ikinci kullanım olayı   K4 profil yoksa stok DÜŞMEZ, seçim beklemede kalır
-- ============================================================================

-- ── 0) Yardımcı: diş numaralarından çene sayısı ─────────────────────────────
-- work_orders'ta çene/ark kolonu yok; FDI numaralarından türetiyoruz.
-- Üst çene 11-28, alt çene 31-48.
CREATE OR REPLACE FUNCTION public.jaw_count(p_teeth int[])
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(
    (CASE WHEN EXISTS (SELECT 1 FROM unnest(COALESCE(p_teeth,'{}')) t WHERE t BETWEEN 11 AND 28) THEN 1 ELSE 0 END)
  + (CASE WHEN EXISTS (SELECT 1 FROM unnest(COALESCE(p_teeth,'{}')) t WHERE t BETWEEN 31 AND 48) THEN 1 ELSE 0 END)
  , 0);
$function$;

COMMENT ON FUNCTION public.jaw_count(int[]) IS
  'FDI dis numaralarindan cene sayisi (0-2). per_jaw tuketim kurallari icin.';

-- ── 1) Üretim malzemesi (marka bağımsız) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.production_materials (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id               uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  code                 text NOT NULL,
  name                 text NOT NULL,
  allowed_stations     uuid[] NOT NULL DEFAULT '{}',
  default_unit         text,
  consumption_behavior text NOT NULL DEFAULT 'standard'
                         CHECK (consumption_behavior IN ('standard','single_use','untracked')),
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lab_id, code)
);

COMMENT ON TABLE public.production_materials IS
  'Marka bagimsiz uretim malzemesi (ZIRCON_BLOCK, GLAZE...). Receteler SKU degil bunu referanslar.';
COMMENT ON COLUMN public.production_materials.allowed_stations IS
  'Bu malzemenin secilebilecegi lab_stations.id listesi. Bos = her istasyon.';
COMMENT ON COLUMN public.production_materials.consumption_behavior IS
  'standard | single_use | untracked. Acik disk/blok kapasitesi icin ileride kullanilacak.';

CREATE INDEX IF NOT EXISTS ix_prod_materials_lab ON public.production_materials(lab_id) WHERE is_active;

-- Ticari ürün → üretim malzemesi eşleştirmesi (ilk sürümde N:1)
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS production_material_id uuid REFERENCES public.production_materials(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_stock_items_prod_material
  ON public.stock_items(production_material_id) WHERE production_material_id IS NOT NULL;

COMMENT ON COLUMN public.stock_items.production_material_id IS
  'Bu ticari urunun hangi soyut uretim malzemesi oldugu. NULL = henuz eslenmemis (miktarsiz akista secilemez).';

-- ── 2) Tüketim profilleri + sürümler ───────────────────────────────────────
-- lab_id NULL = global salt-okunur şablon. Lab kopyalayıp kendi sürümünü açar.
CREATE TABLE IF NOT EXISTS public.consumption_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id      uuid REFERENCES public.labs(id) ON DELETE CASCADE,
  name        text NOT NULL,
  is_template boolean NOT NULL DEFAULT false,
  source_profile_id uuid REFERENCES public.consumption_profiles(id) ON DELETE SET NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (is_template = (lab_id IS NULL))
);

COMMENT ON TABLE public.consumption_profiles IS
  'Tuketim profili. lab_id NULL + is_template = global salt-okunur sablon.';

CREATE TABLE IF NOT EXISTS public.consumption_profile_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES public.consumption_profiles(id) ON DELETE CASCADE,
  version      int  NOT NULL,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  valid_from   date,
  published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, version)
);

-- Profil başına en fazla bir aktif sürüm
CREATE UNIQUE INDEX IF NOT EXISTS ux_profile_single_active
  ON public.consumption_profile_versions(profile_id) WHERE status = 'active';

COMMENT ON TABLE public.consumption_profile_versions IS
  'Bir iste kullanilan surum sonradan degistirilemez; yeni surum yalniz yeni hesaplamalarda kullanilir.';

-- ── 3) Kurallar ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consumption_rules (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id             uuid NOT NULL REFERENCES public.consumption_profile_versions(id) ON DELETE CASCADE,
  station_id             uuid REFERENCES public.lab_stations(id) ON DELETE CASCADE,
  production_material_id uuid NOT NULL REFERENCES public.production_materials(id) ON DELETE CASCADE,
  calc_model             text NOT NULL CHECK (calc_model IN ('fixed','per_tooth','per_jaw','per_unit')),
  qty                    numeric NOT NULL CHECK (qty > 0),
  unit                   text,
  conditions             jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order             int NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.consumption_rules.calc_model IS
  'fixed = qty (is basina) | per_tooth = qty x dis | per_jaw = qty x cene | per_unit = qty x order_item.quantity';
COMMENT ON COLUMN public.consumption_rules.conditions IS
  'Ornek: {"work_type":"zirkonyum"}. Bos = her ise uyar. En cok kosul eslesen kural kazanir.';

CREATE INDEX IF NOT EXISTS ix_consumption_rules_lookup
  ON public.consumption_rules(version_id, station_id, production_material_id);

-- ── 4) Aşama malzeme seçimi (miktarsız) ────────────────────────────────────
-- K4: profil yoksa satir burada 'pending_no_profile' olarak kalir, stok hareketi YAZILMAZ.
CREATE TABLE IF NOT EXISTS public.stage_material_selections (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id                 uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  stage_id               uuid REFERENCES public.order_stages(id) ON DELETE SET NULL,
  work_order_id          uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  stock_item_id          uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  production_material_id uuid REFERENCES public.production_materials(id) ON DELETE SET NULL,
  usage_seq              int  NOT NULL DEFAULT 1,
  usage_kind             text NOT NULL DEFAULT 'normal' CHECK (usage_kind IN ('normal','fire','rework')),
  technician_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_rule_id       uuid REFERENCES public.consumption_rules(id) ON DELETE SET NULL,
  resolved_version_id    uuid REFERENCES public.consumption_profile_versions(id) ON DELETE SET NULL,
  computed_qty           numeric,
  computed_basis         text,
  status                 text NOT NULL DEFAULT 'applied'
                           CHECK (status IN ('applied','pending_no_profile','reversed')),
  movement_id            uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  idempotency_key        text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stage_material_selections IS
  'Teknisyenin miktarsiz malzeme secimi. Tuketim (stock_movements) bundan TURETILIR; profil yoksa hareket yazilmaz.';
COMMENT ON COLUMN public.stage_material_selections.usage_seq IS
  'Ayni asamada ayni kalemin kacinci kullanim olayi. Fire = ikinci olay (K3).';
COMMENT ON COLUMN public.stage_material_selections.computed_basis IS
  'Insan okunur hesap aciklamasi: "3 dis x 0.4 g". Spec §4.10 aciklanabilirlik.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_selection_idem
  ON public.stage_material_selections(lab_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_selection_stage   ON public.stage_material_selections(stage_id);
CREATE INDEX IF NOT EXISTS ix_selection_order   ON public.stage_material_selections(work_order_id);
CREATE INDEX IF NOT EXISTS ix_selection_pending ON public.stage_material_selections(lab_id, created_at)
  WHERE status = 'pending_no_profile';

-- Hareket → seçim geri bağlantısı (izlenebilirlik zinciri)
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS selection_id uuid REFERENCES public.stage_material_selections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_stock_movements_selection
  ON public.stock_movements(selection_id) WHERE selection_id IS NOT NULL;

-- ── 5) Özellik bayrağı ─────────────────────────────────────────────────────
ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS inventory_qtyless_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lab_settings.inventory_qtyless_enabled IS
  'true = miktarsiz teknisyen akisi (D2). Kapaliyken bugunku miktar girisli akis calisir.';

-- ── 6) RLS — mevcut kalıp: is_lab_user() + get_my_lab_id() ─────────────────
ALTER TABLE public.production_materials         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_profile_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_rules            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_material_selections    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lab users manage production_materials" ON public.production_materials;
CREATE POLICY "Lab users manage production_materials" ON public.production_materials
  FOR ALL USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

-- Global şablonlar herkese okunur, yalnız lab kendi profilini yazar
DROP POLICY IF EXISTS "Lab users read profiles and templates" ON public.consumption_profiles;
CREATE POLICY "Lab users read profiles and templates" ON public.consumption_profiles
  FOR SELECT USING (is_lab_user() AND (lab_id IS NULL OR lab_id = get_my_lab_id()));

DROP POLICY IF EXISTS "Lab users write own profiles" ON public.consumption_profiles;
CREATE POLICY "Lab users write own profiles" ON public.consumption_profiles
  FOR ALL USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

DROP POLICY IF EXISTS "Lab users access profile versions" ON public.consumption_profile_versions;
CREATE POLICY "Lab users access profile versions" ON public.consumption_profile_versions
  FOR ALL USING (
    is_lab_user() AND EXISTS (
      SELECT 1 FROM public.consumption_profiles p
      WHERE p.id = profile_id AND (p.lab_id IS NULL OR p.lab_id = get_my_lab_id())))
  WITH CHECK (
    is_lab_user() AND EXISTS (
      SELECT 1 FROM public.consumption_profiles p
      WHERE p.id = profile_id AND p.lab_id = get_my_lab_id()));

DROP POLICY IF EXISTS "Lab users access consumption rules" ON public.consumption_rules;
CREATE POLICY "Lab users access consumption rules" ON public.consumption_rules
  FOR ALL USING (
    is_lab_user() AND EXISTS (
      SELECT 1 FROM public.consumption_profile_versions v
      JOIN public.consumption_profiles p ON p.id = v.profile_id
      WHERE v.id = version_id AND (p.lab_id IS NULL OR p.lab_id = get_my_lab_id())))
  WITH CHECK (
    is_lab_user() AND EXISTS (
      SELECT 1 FROM public.consumption_profile_versions v
      JOIN public.consumption_profiles p ON p.id = v.profile_id
      WHERE v.id = version_id AND p.lab_id = get_my_lab_id()));

DROP POLICY IF EXISTS "Lab users manage stage_material_selections" ON public.stage_material_selections;
CREATE POLICY "Lab users manage stage_material_selections" ON public.stage_material_selections
  FOR ALL USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

-- ── 7) updated_at dokunuşları ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$;

DROP TRIGGER IF EXISTS trg_prod_materials_touch ON public.production_materials;
CREATE TRIGGER trg_prod_materials_touch BEFORE UPDATE ON public.production_materials
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_consumption_profiles_touch ON public.consumption_profiles;
CREATE TRIGGER trg_consumption_profiles_touch BEFORE UPDATE ON public.consumption_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
