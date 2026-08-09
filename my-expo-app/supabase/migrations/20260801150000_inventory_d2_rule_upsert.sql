-- ============================================================================
-- Envanter D2 / Adım 6 — Kural düzenleme + profil okuma
--
-- upsert_consumption_rule(): labın AKTİF profil sürümünde kural ekler/günceller/
--   siler. Yönetici bir değeri elle düzenlediğinde `is_assumption = false` olur
--   — artık SIMAN'ın varsayımı değil, laboratuvarın onayladığı değerdir.
--   Aktif lab profili yoksa hata verir (önce clone_consumption_profile).
--
-- get_lab_consumption_profile(): aktif profil + kural sayısı + kaç tanesinin
--   hâlâ varsayım olduğu.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_consumption_rule(
  p_production_material_id uuid,
  p_station_id             uuid,
  p_calc_model             text,
  p_qty                    numeric,
  p_unit                   text DEFAULT NULL,
  p_delete                 boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lab uuid := public.get_my_lab_id();
  v_ver uuid; v_rule uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND (user_type='admin' OR (user_type='lab' AND role IN ('manager','admin'))))
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT v.id INTO v_ver
    FROM public.consumption_profile_versions v
    JOIN public.consumption_profiles p ON p.id = v.profile_id
   WHERE p.lab_id = v_lab AND NOT p.is_template AND v.status = 'active'
   ORDER BY v.version DESC LIMIT 1;
  IF v_ver IS NULL THEN
    RAISE EXCEPTION 'aktif lab profili yok — once sablondan kopyalayin';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.production_materials
                  WHERE id = p_production_material_id AND lab_id = v_lab) THEN
    RAISE EXCEPTION 'material not in lab';
  END IF;

  SELECT id INTO v_rule FROM public.consumption_rules
   WHERE version_id = v_ver
     AND production_material_id = p_production_material_id
     AND station_id IS NOT DISTINCT FROM p_station_id
   LIMIT 1;

  IF p_delete THEN
    DELETE FROM public.consumption_rules WHERE id = v_rule;
    RETURN NULL;
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'qty > 0 olmali'; END IF;
  IF p_calc_model NOT IN ('fixed','per_tooth','per_jaw','per_unit','disc_yield') THEN
    RAISE EXCEPTION 'gecersiz calc_model: %', p_calc_model;
  END IF;

  IF v_rule IS NULL THEN
    INSERT INTO public.consumption_rules
      (version_id, station_id, production_material_id, calc_model, qty, unit, is_assumption)
    VALUES (v_ver, p_station_id, p_production_material_id, p_calc_model, p_qty, p_unit, false)
    RETURNING id INTO v_rule;
  ELSE
    UPDATE public.consumption_rules
       SET calc_model = p_calc_model, qty = p_qty, unit = COALESCE(p_unit, unit),
           is_assumption = false
     WHERE id = v_rule;
  END IF;

  RETURN v_rule;
END; $function$;

COMMENT ON FUNCTION public.upsert_consumption_rule(uuid,uuid,text,numeric,text,boolean) IS
  'Aktif lab profil surumunde kural ekler/gunceller/siler. Elle duzenlenen kural artik varsayim degildir.';
GRANT EXECUTE ON FUNCTION public.upsert_consumption_rule(uuid,uuid,text,numeric,text,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_lab_consumption_profile(p_lab_id uuid DEFAULT NULL)
RETURNS TABLE (
  profile_id   uuid,
  profile_name text,
  version_id   uuid,
  version_no   int,
  rule_count   int,
  assumption_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH lab AS (SELECT COALESCE(p_lab_id, public.get_my_lab_id()) AS id)
  SELECT p.id, p.name, v.id, v.version,
         (SELECT count(*)::int FROM public.consumption_rules cr WHERE cr.version_id = v.id),
         (SELECT count(*)::int FROM public.consumption_rules cr WHERE cr.version_id = v.id AND cr.is_assumption)
    FROM public.consumption_profiles p
    JOIN lab ON p.lab_id = lab.id
    JOIN public.consumption_profile_versions v ON v.profile_id = p.id AND v.status = 'active'
   WHERE NOT p.is_template
   ORDER BY v.version DESC
   LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_lab_consumption_profile(uuid) TO authenticated, service_role;
