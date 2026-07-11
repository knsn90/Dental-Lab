-- ============================================================
-- 20260509070000 — complete_stage_simple: teknisyen mirasını kaldır
--
-- Sebep: Önceki sürüm bir sonraki manuel aşamaya
--   technician_id = COALESCE(technician_id, v_prev_tech)
-- yazıyordu. Sonuç: ilk teknisyen rotanın tamamına yapışıyordu.
--
-- Yeni davranış:
--   • auto_progress aşamalar → caller (bir audit aktörü gerekli)
--   • manuel aşamalar          → technician_id NULL kalır;
--     istasyon havuzundaki herhangi teknisyen alır.
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_stage_simple(
  p_stage_id UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller        UUID := auth.uid();
  v_stage_tech    UUID; v_status stage_status;
  v_user_type     TEXT; v_role TEXT;
  v_work_order_id UUID; v_seq INT; v_next_id UUID; v_next_seq INT;
  v_auto_prog     BOOLEAN;
  v_safety_loop   INT := 0;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT technician_id, status, work_order_id, sequence_order
    INTO v_stage_tech, v_status, v_work_order_id, v_seq
    FROM public.order_stages WHERE id = p_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stage not found'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF v_stage_tech <> v_caller AND NOT (v_user_type='admin')
     AND NOT (v_user_type='lab' AND v_role IN ('manager','admin'))
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF v_status <> 'aktif' THEN
    RAISE EXCEPTION 'stage must be aktif (current: %)', v_status;
  END IF;

  -- Mevcut aşamayı tamamla
  UPDATE public.order_stages
     SET status='tamamlandi', completed_at=NOW()
   WHERE id = p_stage_id;

  v_next_seq := v_seq;

  LOOP
    v_safety_loop := v_safety_loop + 1;
    EXIT WHEN v_safety_loop > 20;

    SELECT os.id, ls.auto_progress, os.sequence_order
      INTO v_next_id, v_auto_prog, v_next_seq
      FROM public.order_stages os
      JOIN public.lab_stations ls ON ls.id = os.station_id
     WHERE os.work_order_id = v_work_order_id
       AND os.sequence_order > v_next_seq
       AND os.status = 'bekliyor'
     ORDER BY os.sequence_order
     LIMIT 1;

    EXIT WHEN v_next_id IS NULL;

    IF v_auto_prog THEN
      -- Otomatik aşama: caller'ı audit aktörü olarak yaz, hemen tamamla
      UPDATE public.order_stages
         SET status='tamamlandi',
             technician_id = COALESCE(technician_id, v_caller),
             assigned_at=COALESCE(assigned_at, NOW()),
             started_at=COALESCE(started_at, NOW()),
             completed_at=NOW()
       WHERE id = v_next_id;
    ELSE
      -- Manuel aşama: aktif et — teknisyen MİRAS YOK.
      -- order_stages.technician_id NULL kalır → istasyon havuzunda görünür.
      UPDATE public.order_stages
         SET status='aktif',
             assigned_at=COALESCE(assigned_at, NOW())
       WHERE id = v_next_id;
      UPDATE public.work_orders
         SET current_stage_id = v_next_id,
             status = 'asamada'
       WHERE id = v_work_order_id;
      RETURN TRUE;
    END IF;
  END LOOP;

  UPDATE public.work_orders
     SET current_stage_id = NULL, status = 'kalite_kontrol'
   WHERE id = v_work_order_id;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_stage_simple(UUID) TO authenticated;
