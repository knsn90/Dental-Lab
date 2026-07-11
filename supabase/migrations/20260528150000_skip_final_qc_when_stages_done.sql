-- Sorun: bir iş emrinin tüm aşamaları tamamlandığında work_orders.status
-- 'kalite_kontrol' (Final QC) olarak ayarlanıyordu ve manuel bir aksiyon olmadan
-- orada kalıyordu. Klinik ve lab paneli bu siparişleri "Final QC" olarak
-- gösteriyor, kullanıcıyı kafa karıştırıyordu.
--
-- Çözüm: tüm aşamalar bittiğinde doğrudan 'teslimata_hazir' (Kuryeye Teslim
-- Edildi / Hazır) durumuna geçilsin. Kalite Kontrol artık ayrı bir
-- order_stages aşaması olarak yürütülür (lab "Kalite Kontrol" istasyonu
-- ekleyebilir). work_orders.status üzerinde ayrı bir Final QC adımına
-- gerek yok.
--
-- Geriye dönük temizlik: hâlâ 'kalite_kontrol' durumunda takılı kalan
-- siparişleri 'teslimata_hazir'e taşı (current_stage_id NULL ise — yani
-- artık bekleyen aşama yoksa).

BEGIN;

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
      UPDATE public.order_stages
         SET status='tamamlandi',
             technician_id = COALESCE(technician_id, v_caller),
             assigned_at=COALESCE(assigned_at, NOW()),
             started_at=COALESCE(started_at, NOW()),
             completed_at=NOW()
       WHERE id = v_next_id;
    ELSE
      UPDATE public.order_stages
         SET status='aktif',
             assigned_at=COALESCE(assigned_at, NOW()),
             started_at = NULL
       WHERE id = v_next_id;
      UPDATE public.work_orders
         SET current_stage_id = v_next_id,
             status = 'asamada'
       WHERE id = v_work_order_id;
      RETURN TRUE;
    END IF;
  END LOOP;

  -- DEĞİŞTİ: Tüm aşamalar bitti → 'kalite_kontrol' yerine doğrudan 'teslimata_hazir'
  UPDATE public.work_orders
     SET current_stage_id = NULL, status = 'teslimata_hazir'
   WHERE id = v_work_order_id;
  RETURN TRUE;
END;
$$;

-- Eski 'kalite_kontrol' takılı siparişleri ileri taşı
-- (current_stage_id NULL → bekleyen aşama yok → hazır)
UPDATE public.work_orders
   SET status = 'teslimata_hazir'
 WHERE status = 'kalite_kontrol'
   AND current_stage_id IS NULL;

COMMIT;
