-- Geri alma: 20261028130000_revizyon_dis_secimi — 5 parametreli canlı tanım + yetkiler
drop function if exists public.create_revision_order(uuid, text, text, date, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.create_revision_order(p_order_id uuid, p_reason text, p_responsible text, p_delivery_date date DEFAULT NULL::date, p_fault_station_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid(); v_user_type text; v_role text;
  v_src public.work_orders%ROWTYPE; v_new_id uuid; v_free boolean; v_fault uuid;
  v_root text; v_cnt int; v_number text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_responsible IS NULL OR p_responsible NOT IN ('lab','client') THEN
    RAISE EXCEPTION 'Sorumluluk secilmeli: lab veya client'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Revizyon sebebi zorunlu'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))) THEN
    RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_src FROM public.work_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_user_type <> 'admin' AND v_src.lab_id IS DISTINCT FROM public.get_my_lab_id() THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  IF v_src.status <> 'teslim_edildi' THEN
    RAISE EXCEPTION 'Revizyon yalnizca teslim edilmis siparis icin acilabilir (mevcut: %)', v_src.status; END IF;

  v_free := (p_responsible = 'lab');
  v_fault := NULL;
  IF v_free AND p_fault_station_id IS NOT NULL THEN
    SELECT id INTO v_fault FROM public.lab_stations
     WHERE id = p_fault_station_id AND lab_profile_id = v_src.lab_id;
  END IF;

  v_root := regexp_replace(v_src.order_number, '-[0-9]+$', '');
  SELECT count(*) INTO v_cnt FROM public.work_orders
   WHERE lab_id = v_src.lab_id AND order_number ~ ('^' || v_root || '-[0-9]+$');
  v_number := v_root || '-' || (v_cnt + 1);

  INSERT INTO public.work_orders (
    order_number,
    lab_id, doctor_id, doctors_id, patient_name, patient_id, patient_gender, patient_dob, patient_age,
    patient_nationality, patient_country, patient_city, tooth_numbers, work_type, shade,
    machine_type, model_type, measurement_type, input_type, department, tags, complexity,
    notes, delivery_method, priority, is_urgent, requires_design_approval,
    doctor_approval_required, delivery_date, status,
    revision_of_id, revision_no, revision_reason, revision_responsible, revision_fault_station_id
  ) VALUES (
    v_number,
    v_src.lab_id, v_src.doctor_id, v_src.doctors_id, v_src.patient_name, v_src.patient_id,
    v_src.patient_gender, v_src.patient_dob, v_src.patient_age, v_src.patient_nationality, v_src.patient_country,
    v_src.patient_city, v_src.tooth_numbers, v_src.work_type, v_src.shade, v_src.machine_type,
    v_src.model_type, v_src.measurement_type, v_src.input_type, v_src.department, v_src.tags,
    v_src.complexity, v_src.notes, v_src.delivery_method, v_src.priority, v_src.is_urgent,
    v_src.requires_design_approval, v_src.doctor_approval_required,
    COALESCE(p_delivery_date, CURRENT_DATE + 7), 'alindi',
    p_order_id, COALESCE(v_src.revision_no, 0) + 1, trim(p_reason), p_responsible, v_fault
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.order_items (
    work_order_id, lab_id, service_id, name, quantity, notes, tooth_numbers, lane,
    price, currency, price_was_overridden
  )
  SELECT v_new_id, oi.lab_id, oi.service_id, oi.name, oi.quantity, oi.notes, oi.tooth_numbers, oi.lane,
         CASE WHEN v_free THEN 0 ELSE oi.price END,
         oi.currency,
         CASE WHEN v_free THEN TRUE ELSE oi.price_was_overridden END
  FROM public.order_items oi WHERE oi.work_order_id = p_order_id;

  UPDATE public.work_orders SET rework_count = COALESCE(rework_count,0) + 1 WHERE id = p_order_id;
  RETURN v_new_id;
END; $function$;

revoke all on function public.create_revision_order(uuid, text, text, date, uuid) from public;
grant execute on function public.create_revision_order(uuid, text, text, date, uuid) to anon, authenticated, service_role;
