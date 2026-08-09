-- 20260720160000 — Revizyonda hatalı istasyon (yeniden-yapım KPI kırılımı)
-- ─────────────────────────────────────────────────────────────────────────────
-- Yeniden-yapım ORANI tek başına aksiyon üretmez; "nerede hata oluyor?" lazım.
-- Orijinal siparişin tüm aşamalarını suçlamak gürültülü (bir işte 8-10 istasyon
-- çalışıyor). Bunun yerine revizyon açılırken — YALNIZ lab kaynaklıysa —
-- hatalı istasyon OPSİYONEL işaretlenir. İşaretlenmeyenler raporda
-- "belirtilmemiş" grubunda kalır (zorunlu değil, akışı yavaşlatmaz).
--
-- p_fault_station_id EKLENDİĞİ için 4-arg sürüm DROP edilip 5-arg olarak
-- yaratılır (CREATE OR REPLACE parametre ekleyemez; trailing DEFAULT'lu yeni
-- overload bırakılsa 4 adlı argümanla çağrı "function is not unique" verirdi).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS revision_fault_station_id uuid REFERENCES public.lab_stations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS work_orders_revision_fault_station_idx
  ON public.work_orders(revision_fault_station_id) WHERE revision_fault_station_id IS NOT NULL;

COMMENT ON COLUMN public.work_orders.revision_fault_station_id IS
  'Lab kaynaklı revizyonda hatanın kaynaklandığı istasyon (opsiyonel) — yeniden-yapım KPI kırılımı.';

DROP FUNCTION IF EXISTS public.create_revision_order(uuid, text, text, date);

CREATE OR REPLACE FUNCTION public.create_revision_order(
  p_order_id         uuid,
  p_reason           text,
  p_responsible      text,
  p_delivery_date    date DEFAULT NULL,
  p_fault_station_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller    uuid := auth.uid();
  v_user_type text;
  v_role      text;
  v_src       public.work_orders%ROWTYPE;
  v_new_id    uuid;
  v_free      boolean;
  v_fault     uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  IF p_responsible IS NULL OR p_responsible NOT IN ('lab','client') THEN
    RAISE EXCEPTION 'Sorumluluk secilmeli: lab veya client';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Revizyon sebebi zorunlu';
  END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_src FROM public.work_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  IF v_user_type <> 'admin' AND v_src.lab_id IS DISTINCT FROM public.get_my_lab_id() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_src.status <> 'teslim_edildi' THEN
    RAISE EXCEPTION 'Revizyon yalnizca teslim edilmis siparis icin acilabilir (mevcut: %)', v_src.status;
  END IF;

  v_free := (p_responsible = 'lab');
  -- Hatalı istasyon yalnız lab kaynaklıda anlamlı + aynı laba ait olmalı
  v_fault := NULL;
  IF v_free AND p_fault_station_id IS NOT NULL THEN
    SELECT id INTO v_fault FROM public.lab_stations
     WHERE id = p_fault_station_id AND lab_profile_id = v_src.lab_id;
  END IF;

  INSERT INTO public.work_orders (
    lab_id, doctor_id, doctors_id,
    patient_name, patient_id, patient_gender, patient_dob,
    patient_nationality, patient_country, patient_city,
    tooth_numbers, work_type, shade, machine_type, model_type,
    measurement_type, input_type, department, tags, complexity,
    notes, delivery_method, priority, is_urgent,
    requires_design_approval, doctor_approval_required,
    delivery_date, status,
    revision_of_id, revision_no, revision_reason, revision_responsible,
    revision_fault_station_id
  ) VALUES (
    v_src.lab_id, v_src.doctor_id, v_src.doctors_id,
    v_src.patient_name, v_src.patient_id, v_src.patient_gender, v_src.patient_dob,
    v_src.patient_nationality, v_src.patient_country, v_src.patient_city,
    v_src.tooth_numbers, v_src.work_type, v_src.shade, v_src.machine_type, v_src.model_type,
    v_src.measurement_type, v_src.input_type, v_src.department, v_src.tags, v_src.complexity,
    v_src.notes, v_src.delivery_method, v_src.priority, v_src.is_urgent,
    v_src.requires_design_approval, v_src.doctor_approval_required,
    COALESCE(p_delivery_date, CURRENT_DATE + 7), 'alindi',
    p_order_id, COALESCE(v_src.revision_no, 0) + 1, trim(p_reason), p_responsible,
    v_fault
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.order_items (
    work_order_id, lab_id, service_id, name, quantity, notes,
    tooth_numbers, lane, price, price_was_overridden
  )
  SELECT v_new_id, oi.lab_id, oi.service_id, oi.name, oi.quantity, oi.notes,
         oi.tooth_numbers, oi.lane,
         CASE WHEN v_free THEN 0 ELSE oi.price END,
         CASE WHEN v_free THEN TRUE ELSE oi.price_was_overridden END
  FROM public.order_items oi
  WHERE oi.work_order_id = p_order_id;

  UPDATE public.work_orders SET rework_count = COALESCE(rework_count, 0) + 1
   WHERE id = p_order_id;

  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_revision_order(uuid, text, text, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_revision_order(uuid, text, text, date, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
