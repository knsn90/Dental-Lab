-- update_delivery_status: siparişe bağlı olmayan (serbest) gönderi 'delivery not found' veriyordu.
-- Varlık kontrolü NOT FOUND ile yapılır; iş emri güncellemesi v_wo NULL iken zaten 0 satır.
CREATE OR REPLACE FUNCTION public.update_delivery_status(p_delivery_id uuid, p_status delivery_status, p_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller    UUID := auth.uid();
  v_user_type TEXT; v_role TEXT;
  v_courier   UUID;
  v_wo        UUID;
  v_dir       TEXT;
  v_purpose   TEXT;
  v_lab       UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT courier_id, work_order_id, direction, purpose, lab_id
    INTO v_courier, v_wo, v_dir, v_purpose, v_lab
    FROM public.deliveries WHERE id = p_delivery_id;
  -- Serbest gönderinin (work_order_id NULL) da iptal/teslim edilebilmesi için
  -- satırın varlığına bakılır; eskiden v_wo NULL'ı 'bulunamadı' sayıyordu.
  IF NOT FOUND THEN RAISE EXCEPTION 'delivery not found'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  -- role AND tenant: platform admin, OR own-lab manager/admin, OR the assigned courier
  IF NOT (
    is_platform_admin()
    OR (v_lab = get_my_lab_id()
        AND (v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))))
    OR v_caller = v_courier
  ) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  UPDATE public.deliveries
     SET status        = p_status,
         picked_up_at  = CASE WHEN p_status = 'teslim_alindi' AND picked_up_at IS NULL THEN NOW() ELSE picked_up_at END,
         delivered_at  = CASE WHEN p_status = 'teslim_edildi' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END,
         cancelled_at  = CASE WHEN p_status = 'iptal'         AND cancelled_at IS NULL THEN NOW() ELSE cancelled_at END,
         cancel_reason = CASE WHEN p_status = 'iptal' THEN COALESCE(p_note, cancel_reason) ELSE cancel_reason END,
         notes         = CASE WHEN p_note IS NOT NULL AND p_status <> 'iptal' THEN p_note ELSE notes END
   WHERE id = p_delivery_id;

  IF p_status = 'teslim_edildi'
     AND COALESCE(v_dir, 'lab_to_clinic') = 'lab_to_clinic'
     AND COALESCE(v_purpose, 'teslimat') = 'teslimat' THEN
    UPDATE public.work_orders SET
        status           = 'teslim_edildi',
        delivered_at     = COALESCE(delivered_at, NOW()),
        hold_status      = NULL, hold_reason = NULL, hold_category = NULL,
        hold_responsible = NULL, hold_started_at = NULL, hold_by = NULL
     WHERE id = v_wo
       AND status IN ('kuryede', 'kurye_bekleniyor', 'teslimata_hazir');
  END IF;

  RETURN TRUE;
END;
$function$;
