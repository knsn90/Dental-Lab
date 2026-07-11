-- ════════════════════════════════════════════════════════════════════════════
-- 20260528 — triage_order: ilk aktif stage'i otomatik başlatma
--
-- Sorun:
--   Planlama onaylandığında (triage_order RPC) ilk aktif aşamanın `started_at`
--   alanı `NOW()` ile dolduruluyordu. Bu, teknisyen "Başla" demeden sürenin
--   işlemeye başlamasına ve "Tamamla" CTA'nın aktif görünmesine yol açıyordu.
--
-- Çözüm:
--   `started_at = NULL` bırakılır. Teknisyen UI'dan "Başla" basınca
--   `start_stage_simple` RPC'si `started_at = NOW()` yapacak.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- triage_order fonksiyonunu yeniden tanımla — sadece started_at davranışı değişiyor
-- (UPDATE ve INSERT path'lerinin ikisinde de started_at NULL'a çekildi)
CREATE OR REPLACE FUNCTION public.triage_order(
  p_order_id  UUID,
  p_lines     JSONB,        -- [{ stage_id?, sequence_order, station_id, technician_id?, status, is_critical?, skipped_reason? }]
  p_due_date  DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller        UUID := auth.uid();
  v_lab_id        UUID;
  v_user_type     TEXT;
  v_role          TEXT;
  v_line          JSONB;
  v_existing_id   UUID;
  v_stage_id      UUID;
  v_status        TEXT;
  v_first_active  UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT lab_id INTO v_lab_id FROM public.work_orders WHERE id = p_order_id;
  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'work order not found';
  END IF;

  SELECT user_type, role INTO v_user_type, v_role
    FROM public.profiles WHERE id = v_caller;

  IF NOT (
       v_user_type = 'admin'
    OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_line IN SELECT jsonb_array_elements(p_lines)
  LOOP
    v_status := v_line->>'status';
    v_existing_id := NULLIF(v_line->>'stage_id', '')::uuid;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.order_stages
      SET sequence_order  = (v_line->>'sequence_order')::int,
          status          = v_status::stage_status,
          technician_id   = NULLIF(v_line->>'technician_id', '')::uuid,
          is_critical     = COALESCE((v_line->>'is_critical')::boolean, FALSE),
          skipped_reason  = NULLIF(v_line->>'skipped_reason', ''),
          skipped_at      = CASE WHEN v_status = 'skipped' THEN NOW() ELSE NULL END,
          skipped_by      = CASE WHEN v_status = 'skipped' THEN auth.uid() ELSE NULL END,
          assigned_at     = CASE WHEN v_status = 'aktif' THEN COALESCE(assigned_at, NOW()) ELSE assigned_at END,
          -- DEĞİŞTİ: aktif statuse geçildiğinde started_at'i otomatik set ETME.
          -- Teknisyen "Başla" basınca start_stage_simple bunu dolduracak.
          started_at      = NULL
      WHERE id = v_existing_id
      RETURNING id INTO v_stage_id;
    ELSE
      INSERT INTO public.order_stages (
        work_order_id, station_id, technician_id, sequence_order,
        status, is_critical,
        skipped_reason, skipped_at, skipped_by,
        assigned_at, started_at
      ) VALUES (
        p_order_id,
        (v_line->>'station_id')::uuid,
        NULLIF(v_line->>'technician_id', '')::uuid,
        (v_line->>'sequence_order')::int,
        v_status::stage_status,
        COALESCE((v_line->>'is_critical')::boolean, FALSE),
        NULLIF(v_line->>'skipped_reason', ''),
        CASE WHEN v_status = 'skipped' THEN NOW() END,
        CASE WHEN v_status = 'skipped' THEN auth.uid() END,
        CASE WHEN v_status = 'aktif' THEN NOW() END,
        -- DEĞİŞTİ: started_at her zaman NULL — teknisyen Başla basınca dolacak
        NULL
      )
      RETURNING id INTO v_stage_id;
    END IF;

    IF v_status = 'aktif' AND v_first_active IS NULL THEN
      v_first_active := v_stage_id;
    END IF;
  END LOOP;

  UPDATE public.work_orders
  SET triaged_at = NOW(),
      triaged_by = v_caller,
      current_stage_id = v_first_active,
      delivery_date = COALESCE(p_due_date, delivery_date),
      status = CASE WHEN v_first_active IS NOT NULL THEN 'asamada' ELSE status END
  WHERE id = p_order_id;

  RETURN p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.triage_order(UUID, JSONB, DATE) TO authenticated;

-- Mevcut otomatik başlatılmış aşamaları geri al: eğer started_at varsa AMA
-- hiç aktivite kaydı yoksa, started_at'i NULL'a çek (kullanıcı henüz Başla
-- basmamış olabilir).
-- DİKKAT: zaten gerçekten çalışılan stage'lere dokunmayalım — sadece aktif
-- olan ve hiç completed_at olmayan, paused_seconds=0, active_work_seconds=0
-- olanları sıfırla.
UPDATE public.order_stages
   SET started_at = NULL,
       queue_waiting_seconds = COALESCE(queue_waiting_seconds, 0)
 WHERE status = 'aktif'
   AND started_at IS NOT NULL
   AND completed_at IS NULL
   AND COALESCE(active_work_seconds, 0) = 0
   AND COALESCE(paused_seconds_total, 0) = 0;

COMMIT;

NOTIFY pgrst, 'reload schema';
