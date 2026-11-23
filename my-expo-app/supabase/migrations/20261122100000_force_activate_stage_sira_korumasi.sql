-- force_activate_stage: sıra koruması
-- Sorun: "Teknisyene gönder" (bekleyen aşama) başka bir aşama aktifken çağrılınca
-- iki aşama aynı anda aktif kalıyordu; önceki bekleyen aşamaları da sessizce
-- atlıyordu (sonradan tamamlanmadan kalırlardı).
-- Kural (aynı şerit = lane içinde, aynı parallel_group'taki eşzamanlı aşamalar hariç):
--   1) Daha önceki bir aşama bitmemişse (tamamlandi/onaylandi/skipped değilse) → hata.
--   2) Başka bir aşama hâlihazırda işlemdeyse (aktif/duraklamış/makine/onay/bloklu/yeniden) → hata.
-- Geri kalan davranış birebir aynı.

CREATE OR REPLACE FUNCTION public.force_activate_stage(p_stage_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller       UUID := auth.uid();
  v_user_type    TEXT; v_role TEXT;
  v_status       stage_status;
  v_default_tech UUID;
  v_work_order   UUID;
  v_lane         INT;
  v_seq          INT;
  v_pg           INT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  PERFORM public.assert_my_stage(p_stage_id);  -- 20261104110000: yalnız aşamanın lab'ı

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (v_user_type = 'admin'
          OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT os.status, ls.default_technician_id, os.work_order_id,
         COALESCE(os.lane, 1), os.sequence_order, os.parallel_group
    INTO v_status, v_default_tech, v_work_order, v_lane, v_seq, v_pg
    FROM public.order_stages os
    JOIN public.lab_stations ls ON ls.id = os.station_id
   WHERE os.id = p_stage_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'stage not found'; END IF;
  IF v_status <> 'bekliyor' THEN
    RAISE EXCEPTION 'stage must be bekliyor (current: %)', v_status;
  END IF;

  -- 1) Önceki aşamalar bitmeden ileri atlanamaz
  IF EXISTS (
    SELECT 1 FROM public.order_stages o
     WHERE o.work_order_id = v_work_order
       AND COALESCE(o.lane, 1) = v_lane
       AND o.id <> p_stage_id
       AND o.sequence_order < v_seq
       AND (v_pg IS NULL OR o.parallel_group IS DISTINCT FROM v_pg)
       AND o.status NOT IN ('tamamlandi','onaylandi','skipped')
  ) THEN
    RAISE EXCEPTION 'Önceki aşamalar henüz bitmedi. Önce onları tamamla veya atla.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2) Aynı şeritte işlemde olan başka aşama varken ikinci aşama aktif edilemez
  IF EXISTS (
    SELECT 1 FROM public.order_stages o
     WHERE o.work_order_id = v_work_order
       AND COALESCE(o.lane, 1) = v_lane
       AND o.id <> p_stage_id
       AND (v_pg IS NULL OR o.parallel_group IS DISTINCT FROM v_pg)
       AND o.status IN ('aktif','durakladi','makine_bekliyor','onay_bekliyor','bloklu','yeniden')
  ) THEN
    RAISE EXCEPTION 'Bu siparişte işlemde olan başka bir aşama var.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.order_stages
     SET status        = 'aktif',
         technician_id = COALESCE(technician_id, v_default_tech),
         assigned_at   = COALESCE(assigned_at, NOW()),
         started_at    = NULL
   WHERE id = p_stage_id;

  UPDATE public.work_orders
     SET current_stage_id = p_stage_id,
         status           = 'asamada'
   WHERE id = v_work_order;

  RETURN TRUE;
END;
$function$;
