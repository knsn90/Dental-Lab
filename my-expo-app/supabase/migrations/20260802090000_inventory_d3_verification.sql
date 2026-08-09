-- ============================================================================
-- Envanter D3 — Envanter Doğrulama + sapma + dönem kapanışı
--
-- Canlıya üç adımda uygulandı (apply_migration):
--   inventory_d3_verification_schema · _rpcs · _reads
-- Bu dosya üçünün birleşimidir; sıfırdan kurulumda tek başına çalışır.
--
-- Spec §7.6: adı "Envanter Doğrulama" olmalı, yalnız "stok sayımı" değil.
-- Kullanıcıya "bu ay ne kadar kullandın?" SORULMAZ; yalnız fiziksel miktar
-- girilir, farkı sistem hesaplar. Kapanan dönemin hareketleri değiştirilemez.
--
-- Düzeltme hareketi: type='ADJUST' + İŞARETLİ miktar. stock_effect ADJUST'ı
-- +1 yönünde uygular, dolayısıyla eksi fark stoğu doğru biçimde azaltır
-- (doğrulandı: 1000 → 970).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_verifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id       uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end   date NOT NULL,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','closed')),
  note         text,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  approved_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at  timestamptz,
  closed_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at    timestamptz,
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS public.inventory_verification_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id   uuid NOT NULL REFERENCES public.inventory_verifications(id) ON DELETE CASCADE,
  stock_item_id     uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  system_qty        numeric NOT NULL,
  physical_qty      numeric,
  unit              text,
  unit_cost_at_time numeric,
  currency          text,
  note              text,
  counted_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  counted_at        timestamptz,
  movement_id       uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  UNIQUE (verification_id, stock_item_id)
);

COMMENT ON COLUMN public.inventory_verification_lines.system_qty IS
  'Taslak acilirkenki teorik miktar. Snapshot — sayim surerken olan hareketler farki bozmaz.';

CREATE INDEX IF NOT EXISTS ix_verif_lines_verif ON public.inventory_verification_lines(verification_id);

CREATE TABLE IF NOT EXISTS public.period_closures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  verification_id uuid REFERENCES public.inventory_verifications(id) ON DELETE SET NULL,
  closed_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at       timestamptz NOT NULL DEFAULT now(),
  reopened_at     timestamptz,
  reopened_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reopen_reason   text
);

CREATE INDEX IF NOT EXISTS ix_period_closures_lab
  ON public.period_closures(lab_id, period_start, period_end) WHERE reopened_at IS NULL;

ALTER TABLE public.inventory_verifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_verification_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_closures              ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lab users manage verifications" ON public.inventory_verifications;
CREATE POLICY "Lab users manage verifications" ON public.inventory_verifications
  FOR ALL USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

DROP POLICY IF EXISTS "Lab users manage verification lines" ON public.inventory_verification_lines;
CREATE POLICY "Lab users manage verification lines" ON public.inventory_verification_lines
  FOR ALL USING (is_lab_user() AND EXISTS (
    SELECT 1 FROM public.inventory_verifications v
     WHERE v.id = verification_id AND v.lab_id = get_my_lab_id()))
  WITH CHECK (is_lab_user() AND EXISTS (
    SELECT 1 FROM public.inventory_verifications v
     WHERE v.id = verification_id AND v.lab_id = get_my_lab_id()));

DROP POLICY IF EXISTS "Lab users read period closures" ON public.period_closures;
CREATE POLICY "Lab users read period closures" ON public.period_closures
  FOR SELECT USING (is_lab_user() AND lab_id = get_my_lab_id());

-- Kapali donem kilidi — "Sessiz guncelleme kesinlikle yasaktir" (spec 7.6)
CREATE OR REPLACE FUNCTION public.guard_closed_period()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v_row record; v_when date;
BEGIN
  v_row := COALESCE(OLD, NEW);
  v_when := (v_row.created_at)::date;
  IF EXISTS (
    SELECT 1 FROM public.period_closures pc
     WHERE pc.lab_id = v_row.lab_id
       AND pc.reopened_at IS NULL
       AND v_when BETWEEN pc.period_start AND pc.period_end
  ) THEN
    RAISE EXCEPTION 'Kapali doneme ait stok hareketi degistirilemez (%). Donemi yeniden acin veya guncel doneme duzeltme kaydi girin.', v_when;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $function$;

DROP TRIGGER IF EXISTS trg_guard_closed_period ON public.stock_movements;
CREATE TRIGGER trg_guard_closed_period
  BEFORE UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_period();
