-- 20261112120000_implant_marka_katalogu — lab başına implant marka/model kataloğu (kullanıcı kararı 2026-11-12).
-- Tasarım: docs/superpowers/specs/2026-11-12-implant-marka-katalogu-design.md
-- NEDEN: yeni sipariş formundaki marka listesi kodda sabitti; yeni marka/model eklenemiyordu.
--   * Okuma + ekleme: sipariş girebilen herkes (lab kullanıcısı get_my_lab_id(), hekim/klinik
--     my_connected_lab_ids() ya da profiles.lab_id) — YALNIZ kendi lab'ının listesi.
--   * Yeniden adlandırma / gizleme / birleştirme: yalnız can_manage_lab_settings() + aynı lab.
--   * Tablolara doğrudan yazma YOK (insert/update/delete politikası yok); hepsi RPC ile.
--   * Sipariş marka/model'i METİN saklar → katalog düzeltmesi eski siparişleri değiştirmez.
--   * İlk okumada lab'ın satırı yoksa varsayılan marka + yaygın modeller yüklenir (tembel tohum).
BEGIN;

-- ── Ad anahtarı: büyük/küçük harf, TR karakter ve noktalama farkını yok sayar ──
CREATE OR REPLACE FUNCTION public._implant_catalog_key(p text)
 RETURNS text LANGUAGE sql IMMUTABLE
AS $$
  SELECT lower(regexp_replace(
           translate(coalesce(p, ''), 'İIıŞşĞğÜüÖöÇçÅå', 'iiissgguuooccaa'),
           '[^[:alnum:]]', '', 'g'));
$$;

CREATE TABLE public.implant_brands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id      uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  name_key    text NOT NULL,
  is_hidden   boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lab_id, name_key)
);

CREATE TABLE public.implant_models (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id      uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  brand_id    uuid NOT NULL REFERENCES public.implant_brands(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  name_key    text NOT NULL,
  is_hidden   boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name_key)
);
CREATE INDEX implant_models_lab_idx ON public.implant_models(lab_id);

-- ── Erişim kapıları ──
CREATE OR REPLACE FUNCTION public._implant_catalog_can_use(p_lab uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p_lab IS NOT NULL AND auth.uid() IS NOT NULL AND (
    p_lab = get_my_lab_id()
    OR p_lab IN (SELECT my_connected_lab_ids())
  );
$$;

CREATE OR REPLACE FUNCTION public._implant_catalog_can_manage(p_lab uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p_lab IS NOT NULL AND p_lab = get_my_lab_id() AND can_manage_lab_settings();
$$;

ALTER TABLE public.implant_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY implant_brands_select ON public.implant_brands FOR SELECT TO authenticated
  USING (public._implant_catalog_can_use(lab_id));
CREATE POLICY implant_models_select ON public.implant_models FOR SELECT TO authenticated
  USING (public._implant_catalog_can_use(lab_id));
REVOKE ALL ON public.implant_brands, public.implant_models FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.implant_brands, public.implant_models FROM authenticated;

-- ── Tembel tohum: lab'ın hiç satırı yoksa varsayılanlar ──
CREATE OR REPLACE FUNCTION public._implant_catalog_seed(p_lab uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_brands text[] := ARRAY[
    'Implance','Bilimplant','NucleOSS','AGS Medikal','Mode Medikal','Mode Implant',
    'Trinon Q-Implant','Implassis','Tekka','Medentika TR','İmplad',
    'Surgikor','Dynamic Implant','Maxer Implant','Mr. Curette Tech',
    'Straumann','Nobel Biocare','Osstem','Zimmer Biomet','Dentsply Sirona',
    'Megagen','Neodent','BioHorizons','Camlog','Astra Tech (Dentsply)',
    'Ankylos','Bicon','Biomet 3i','Blue Sky Bio','Dentium','DIO Implant',
    'Hi-Sen','IMZ','Keystone Dental','Lifecore','MIS Implants','Neway',
    'OsteoCare','Phibo','Replace (Nobel)','Seven Implant','SPI Element',
    'Touareg','Xive (Dentsply)','Southern Implants','Bredent','Cortex',
    'Alpha-Bio Tec','Euroteknika','Implant Direct','Adin',
    'Thommen Medical','Implant Swiss','Bionika','T-Plus',
    'Hiossen','Anthogyr','Sweden & Martina','Noris Medical','Paltop',
    'Ditron Dental','TBR','C-Tech','GDT Dental','Cowellmedi','Dentis',
    'Warantec','Shinhung','Z-Systems','SGS Dental','Global D','Leader Italia',
    'Neobiotech','Dentegris','BEGO Semados','Carlo de Chiesa','Ace Surgical'];
  v_models jsonb := '{
    "Straumann": ["BLX","BLT","TLX","Bone Level","Tissue Level"],
    "Nobel Biocare": ["NobelActive","NobelParallel CC","NobelReplace"],
    "Osstem": ["TS III","SS III","MS"],
    "Megagen": ["AnyRidge","AnyOne","BlueDiamond"],
    "Neodent": ["Grand Morse","Titamax","Drive"],
    "Dentium": ["SuperLine","NR Line"],
    "Zimmer Biomet": ["Tapered Screw-Vent","T3","TSX"],
    "Dentsply Sirona": ["Astra Tech EV","Ankylos","Xive"],
    "BioHorizons": ["Tapered Pro","Tapered Internal"],
    "MIS Implants": ["C1","V3","Seven"],
    "Camlog": ["Screw-Line","Conelog"],
    "Bredent": ["copaSKY","blueSKY"],
    "Hiossen": ["ET III"],
    "Alpha-Bio Tec": ["SPI","NeO"]
  }'::jsonb;
  v_b text; v_m text; v_bid uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM implant_brands WHERE lab_id = p_lab) THEN RETURN; END IF;
  FOREACH v_b IN ARRAY v_brands LOOP
    INSERT INTO implant_brands(lab_id, name, name_key)
    VALUES (p_lab, v_b, _implant_catalog_key(v_b))
    ON CONFLICT (lab_id, name_key) DO NOTHING;
  END LOOP;
  FOR v_b IN SELECT jsonb_object_keys(v_models) LOOP
    SELECT id INTO v_bid FROM implant_brands WHERE lab_id = p_lab AND name_key = _implant_catalog_key(v_b);
    IF v_bid IS NULL THEN CONTINUE; END IF;
    FOR v_m IN SELECT jsonb_array_elements_text(v_models -> v_b) LOOP
      INSERT INTO implant_models(lab_id, brand_id, name, name_key)
      VALUES (p_lab, v_bid, v_m, _implant_catalog_key(v_m))
      ON CONFLICT (brand_id, name_key) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

-- ── Liste (görünür marka + modelleri) ──
CREATE OR REPLACE FUNCTION public.implant_catalog_list(p_lab uuid, p_include_hidden boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_hidden boolean;
BEGIN
  IF NOT _implant_catalog_can_use(p_lab) THEN
    RAISE EXCEPTION 'IMPLANT_SCOPE' USING ERRCODE = '42501';
  END IF;
  PERFORM _implant_catalog_seed(p_lab);
  -- gizlileri yalnız yönetici görür (ayar ekranı)
  v_hidden := p_include_hidden AND _implant_catalog_can_manage(p_lab);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', b.id, 'name', b.name, 'hidden', b.is_hidden,
             'models', coalesce((
               SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'hidden', m.is_hidden)
                                ORDER BY lower(m.name))
                 FROM implant_models m
                WHERE m.brand_id = b.id AND (v_hidden OR NOT m.is_hidden)), '[]'::jsonb))
           ORDER BY lower(b.name))
      FROM implant_brands b
     WHERE b.lab_id = p_lab AND (v_hidden OR NOT b.is_hidden)), '[]'::jsonb);
END;
$$;

-- ── Marka ekle (aynı anahtar varsa mevcut döner; gizliyse yeniden görünür olur) ──
CREATE OR REPLACE FUNCTION public.implant_catalog_add_brand(p_lab uuid, p_name text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
        v_key text := _implant_catalog_key(p_name); v_row implant_brands;
BEGIN
  IF NOT _implant_catalog_can_use(p_lab) THEN
    RAISE EXCEPTION 'IMPLANT_SCOPE' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 60 OR v_key = '' THEN
    RAISE EXCEPTION 'IMPLANT_NAME_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM _implant_catalog_seed(p_lab);
  SELECT * INTO v_row FROM implant_brands WHERE lab_id = p_lab AND name_key = v_key;
  IF FOUND THEN
    IF v_row.is_hidden THEN UPDATE implant_brands SET is_hidden = false WHERE id = v_row.id; END IF;
    RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name, 'existed', true);
  END IF;
  INSERT INTO implant_brands(lab_id, name, name_key, created_by)
  VALUES (p_lab, v_name, v_key, auth.uid()) RETURNING * INTO v_row;
  RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name, 'existed', false);
END;
$$;

-- ── Model ekle ──
CREATE OR REPLACE FUNCTION public.implant_catalog_add_model(p_brand uuid, p_name text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
        v_key text := _implant_catalog_key(p_name); v_lab uuid; v_row implant_models;
BEGIN
  SELECT lab_id INTO v_lab FROM implant_brands WHERE id = p_brand;
  IF v_lab IS NULL OR NOT _implant_catalog_can_use(v_lab) THEN
    RAISE EXCEPTION 'IMPLANT_SCOPE' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 60 OR v_key = '' THEN
    RAISE EXCEPTION 'IMPLANT_NAME_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM implant_models WHERE brand_id = p_brand AND name_key = v_key;
  IF FOUND THEN
    IF v_row.is_hidden THEN UPDATE implant_models SET is_hidden = false WHERE id = v_row.id; END IF;
    RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name, 'existed', true);
  END IF;
  INSERT INTO implant_models(lab_id, brand_id, name, name_key, created_by)
  VALUES (v_lab, p_brand, v_name, v_key, auth.uid()) RETURNING * INTO v_row;
  RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name, 'existed', false);
END;
$$;

-- ── Yönetici: yeniden adlandır / gizle-göster (p_kind: 'brand' | 'model') ──
CREATE OR REPLACE FUNCTION public.implant_catalog_update(p_kind text, p_id uuid, p_name text DEFAULT NULL, p_hidden boolean DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_lab uuid; v_parent uuid; v_name text; v_key text;
BEGIN
  IF p_kind = 'brand' THEN
    SELECT lab_id INTO v_lab FROM implant_brands WHERE id = p_id;
  ELSIF p_kind = 'model' THEN
    SELECT lab_id, brand_id INTO v_lab, v_parent FROM implant_models WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'IMPLANT_KIND' USING ERRCODE = '22023';
  END IF;
  IF v_lab IS NULL OR NOT _implant_catalog_can_manage(v_lab) THEN
    RAISE EXCEPTION 'IMPLANT_SCOPE' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NOT NULL THEN
    v_name := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
    v_key := _implant_catalog_key(p_name);
    IF length(v_name) NOT BETWEEN 1 AND 60 OR v_key = '' THEN
      RAISE EXCEPTION 'IMPLANT_NAME_INVALID' USING ERRCODE = '22023';
    END IF;
    IF p_kind = 'brand' AND EXISTS (SELECT 1 FROM implant_brands WHERE lab_id = v_lab AND name_key = v_key AND id <> p_id)
       OR p_kind = 'model' AND EXISTS (SELECT 1 FROM implant_models WHERE brand_id = v_parent AND name_key = v_key AND id <> p_id) THEN
      RAISE EXCEPTION 'IMPLANT_NAME_TAKEN' USING ERRCODE = '23505';
    END IF;
  END IF;
  IF p_kind = 'brand' THEN
    UPDATE implant_brands SET name = coalesce(v_name, name), name_key = coalesce(v_key, name_key),
                              is_hidden = coalesce(p_hidden, is_hidden) WHERE id = p_id;
  ELSE
    UPDATE implant_models SET name = coalesce(v_name, name), name_key = coalesce(v_key, name_key),
                              is_hidden = coalesce(p_hidden, is_hidden) WHERE id = p_id;
  END IF;
END;
$$;

-- ── Yönetici: markayı başka markaya birleştir (modeller taşınır, kaynak gizlenir) ──
CREATE OR REPLACE FUNCTION public.implant_catalog_merge_brand(p_from uuid, p_into uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_lab uuid; v_lab2 uuid;
BEGIN
  SELECT lab_id INTO v_lab FROM implant_brands WHERE id = p_from;
  SELECT lab_id INTO v_lab2 FROM implant_brands WHERE id = p_into;
  IF v_lab IS NULL OR v_lab IS DISTINCT FROM v_lab2 OR p_from = p_into
     OR NOT _implant_catalog_can_manage(v_lab) THEN
    RAISE EXCEPTION 'IMPLANT_SCOPE' USING ERRCODE = '42501';
  END IF;
  -- hedefte aynı adlı model varsa kaynaktaki gizlenir, yoksa hedefe taşınır
  UPDATE implant_models m SET is_hidden = true
   WHERE m.brand_id = p_from
     AND EXISTS (SELECT 1 FROM implant_models t WHERE t.brand_id = p_into AND t.name_key = m.name_key);
  UPDATE implant_models m SET brand_id = p_into
   WHERE m.brand_id = p_from
     AND NOT EXISTS (SELECT 1 FROM implant_models t WHERE t.brand_id = p_into AND t.name_key = m.name_key);
  UPDATE implant_brands SET is_hidden = true WHERE id = p_from;
END;
$$;

REVOKE ALL ON FUNCTION public._implant_catalog_seed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.implant_catalog_list(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.implant_catalog_add_brand(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.implant_catalog_add_model(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.implant_catalog_update(text, uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.implant_catalog_merge_brand(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.implant_catalog_list(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.implant_catalog_add_brand(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.implant_catalog_add_model(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.implant_catalog_update(text, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.implant_catalog_merge_brand(uuid, uuid) TO authenticated;

COMMIT;
