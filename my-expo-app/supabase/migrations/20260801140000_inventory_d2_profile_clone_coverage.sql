-- ============================================================================
-- Envanter D2 / Adım 5 — Profil kopyalama + kapsama raporu
--
-- clone_consumption_profile(): global şablonu laba kopyalar. Şablon SALT OKUNUR
--   kalır (spec §7.4). Kurallar id ile DEĞİL, üretim malzemesi KODU + istasyon
--   ADI ile yeniden bağlanır → çok laboratuvarlı kurulumda da doğru çalışır.
--   Idempotent: aynı şablondan ikinci kopya oluşturmaz.
--
-- report_profile_coverage(): hangi (malzeme × istasyon) kombinasyonunda kural
--   var? K4 gereği kuralsız seçim stok DÜŞÜRMEZ. mapped_items = o malzemeye
--   bağlanmış aktif stok kalemi sayısı — eşleştirme yoksa kural olsa bile
--   tüketim oluşmaz, iki sütun birlikte okunmalıdır.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.clone_consumption_profile(p_template_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lab uuid := public.get_my_lab_id();
  v_tpl uuid; v_tpl_ver uuid; v_new_profile uuid; v_new_ver uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND (user_type='admin' OR (user_type='lab' AND role IN ('manager','admin'))))
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'lab not resolved'; END IF;

  SELECT p.id INTO v_tpl FROM public.consumption_profiles p
   WHERE p.is_template AND (p_template_id IS NULL OR p.id = p_template_id)
   ORDER BY p.created_at LIMIT 1;
  IF v_tpl IS NULL THEN RAISE EXCEPTION 'template not found'; END IF;

  SELECT v.id INTO v_tpl_ver FROM public.consumption_profile_versions v
   WHERE v.profile_id = v_tpl ORDER BY v.version DESC LIMIT 1;

  SELECT id INTO v_new_profile FROM public.consumption_profiles
   WHERE lab_id = v_lab AND source_profile_id = v_tpl LIMIT 1;
  IF v_new_profile IS NOT NULL THEN RETURN v_new_profile; END IF;

  INSERT INTO public.consumption_profiles (lab_id, name, is_template, source_profile_id)
  SELECT v_lab, p.name || ' (lab kopyası)', false, v_tpl
    FROM public.consumption_profiles p WHERE p.id = v_tpl
  RETURNING id INTO v_new_profile;

  INSERT INTO public.consumption_profile_versions
    (profile_id, version, status, valid_from, published_by, published_at)
  VALUES (v_new_profile, 1, 'active', CURRENT_DATE, auth.uid(), now())
  RETURNING id INTO v_new_ver;

  INSERT INTO public.consumption_rules
    (version_id, station_id, production_material_id, calc_model, qty, unit,
     conditions, sort_order, is_assumption, note)
  SELECT v_new_ver,
         (SELECT s2.id FROM public.lab_stations s2
           WHERE s2.lab_profile_id = v_lab AND s2.name = s1.name LIMIT 1),
         (SELECT pm2.id FROM public.production_materials pm2
           WHERE pm2.lab_id = v_lab AND pm2.code = pm1.code LIMIT 1),
         cr.calc_model, cr.qty, cr.unit, cr.conditions, cr.sort_order, cr.is_assumption, cr.note
    FROM public.consumption_rules cr
    JOIN public.production_materials pm1 ON pm1.id = cr.production_material_id
    LEFT JOIN public.lab_stations s1 ON s1.id = cr.station_id
   WHERE cr.version_id = v_tpl_ver
     AND EXISTS (SELECT 1 FROM public.production_materials pm2
                  WHERE pm2.lab_id = v_lab AND pm2.code = pm1.code);

  RETURN v_new_profile;
END; $function$;

COMMENT ON FUNCTION public.clone_consumption_profile(uuid) IS
  'Global sablonu laba kopyalar. Idempotent. Yalniz yonetici/admin.';
GRANT EXECUTE ON FUNCTION public.clone_consumption_profile(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.report_profile_coverage(p_lab_id uuid DEFAULT NULL)
RETURNS TABLE (
  production_code   text,
  production_name   text,
  station_name      text,
  mapped_items      int,
  has_rule          boolean,
  calc_model        text,
  qty               numeric,
  unit              text,
  is_assumption     boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH lab AS (SELECT COALESCE(p_lab_id, public.get_my_lab_id()) AS id),
active_ver AS (
  SELECT v.id FROM public.consumption_profile_versions v
    JOIN public.consumption_profiles p ON p.id = v.profile_id
    JOIN lab ON p.lab_id = lab.id
   WHERE v.status = 'active' AND NOT p.is_template
   ORDER BY v.version DESC LIMIT 1
),
mat_station AS (
  SELECT pm.id AS pm_id, pm.code, pm.name, s.id AS station_id, s.name AS station_name
    FROM public.production_materials pm
    JOIN lab ON pm.lab_id = lab.id
    JOIN public.lab_stations s ON s.id = ANY(pm.allowed_stations)
   WHERE pm.is_active AND s.consumes_materials
)
SELECT ms.code, ms.name, ms.station_name,
  (SELECT count(*)::int FROM public.stock_items si
    WHERE si.production_material_id = ms.pm_id AND si.is_active),
  cr.id IS NOT NULL,
  cr.calc_model, cr.qty, cr.unit, cr.is_assumption
FROM mat_station ms
LEFT JOIN public.consumption_rules cr
       ON cr.version_id = (SELECT id FROM active_ver)
      AND cr.production_material_id = ms.pm_id
      AND (cr.station_id IS NULL OR cr.station_id = ms.station_id)
ORDER BY (cr.id IS NULL) DESC, ms.name, ms.station_name;
$function$;

COMMENT ON FUNCTION public.report_profile_coverage(uuid) IS
  'Uretim malzemesi x istasyon icin kural var mi? Kuralsiz kombinasyonda stok dusmez (K4).';
GRANT EXECUTE ON FUNCTION public.report_profile_coverage(uuid) TO authenticated, service_role;
