-- ════════════════════════════════════════════════════════════════════════════
-- 20260528 — System mesajlarını chat'ten kaldır, notifications'a yönlendir
--
-- Önceki davranış:
--   • order_stages/work_orders/deliveries triggerları order_messages'a
--     "system" tipi mesaj yazıyordu → chat ekranı bunlarla doluyordu.
--
-- Yeni davranış:
--   • Chat sadece kullanıcı mesajlarını barındırır.
--   • Sistem olayları (aşama atandı/başladı/tamamlandı, sipariş statüsü,
--     planlama onayı) ilgili kişilere `notifications` tablosuna yazılır.
--
-- Bildirim alıcıları:
--   • Aşama teknisyene atandı           → teknisyen
--   • Aşama tamamlandı                  → lab manager + admin
--   • Sipariş statüsü değişti           → lab manager + admin
--   • Planlama onaylandı                → lab manager + admin
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Eski chat-poller triggerlarını kaldır
DROP TRIGGER IF EXISTS deliveries_system_msg_insert  ON public.deliveries;
DROP TRIGGER IF EXISTS deliveries_system_msg_update  ON public.deliveries;
DROP TRIGGER IF EXISTS stages_system_msg_update      ON public.order_stages;
DROP TRIGGER IF EXISTS work_orders_system_msg_status ON public.work_orders;
DROP TRIGGER IF EXISTS work_orders_system_msg_triage ON public.work_orders;

-- post_system_message fonksiyonunu da kaldırıyoruz (artık kullanılmıyor)
DROP FUNCTION IF EXISTS public.trg_delivery_inserted();
DROP FUNCTION IF EXISTS public.trg_delivery_status_changed();
DROP FUNCTION IF EXISTS public.trg_stage_status_changed();
DROP FUNCTION IF EXISTS public.trg_work_order_status_changed();
DROP FUNCTION IF EXISTS public.trg_triage_approved();
DROP FUNCTION IF EXISTS public.post_system_message(uuid, text);

-- 2) Mevcut sistem mesajlarını chat'ten temizle
DELETE FROM public.order_messages WHERE message_type = 'system';

-- 3) Internal helper: aynı user'a aynı resource için son 30sn'de aynı kategoride
--    bildirim varsa tekrar yazma (idempotency / spam koruması)
CREATE OR REPLACE FUNCTION public._notify_dedup(
  p_user_id      uuid,
  p_category     text,
  p_title        text,
  p_body         text,
  p_resource_type text,
  p_resource_id  uuid,
  p_action_url   text,
  p_payload      jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_lab_id   uuid;
  v_id       uuid;
BEGIN
  -- Aynı user'a aynı resource için son 30sn içinde benzer bildirim var mı?
  SELECT id INTO v_existing
    FROM public.notifications
   WHERE user_id = p_user_id
     AND category = p_category
     AND resource_id IS NOT DISTINCT FROM p_resource_id
     AND title = p_title
     AND created_at > now() - interval '30 seconds'
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT lab_id INTO v_lab_id FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.notifications (
    user_id, lab_id, category, title, body,
    resource_type, resource_id, action_url, payload
  ) VALUES (
    p_user_id, v_lab_id, p_category, p_title, p_body,
    p_resource_type, p_resource_id, p_action_url, COALESCE(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public._notify_dedup(uuid,text,text,text,text,uuid,text,jsonb) FROM public;

-- 4) Trigger: stage atandı / aktif oldu → teknisyene bildirim
CREATE OR REPLACE FUNCTION public.trg_stage_notify_technician()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_station_name TEXT;
  v_order_num    TEXT;
  v_patient      TEXT;
  v_should       BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_should := NEW.technician_id IS NOT NULL AND NEW.status IN ('aktif', 'bekliyor');
  ELSIF TG_OP = 'UPDATE' THEN
    -- Teknisyen değiştiyse veya yeni atandıysa
    IF NEW.technician_id IS NOT NULL
       AND COALESCE(OLD.technician_id::text,'') <> COALESCE(NEW.technician_id::text,'') THEN
      v_should := TRUE;
    -- Veya teknisyen var, status yeni aktif oldu
    ELSIF NEW.technician_id IS NOT NULL
          AND NEW.status = 'aktif'
          AND COALESCE(OLD.status::text,'') <> 'aktif' THEN
      v_should := TRUE;
    END IF;
  END IF;

  IF NOT v_should THEN RETURN NEW; END IF;

  SELECT name INTO v_station_name FROM public.lab_stations WHERE id = NEW.station_id;
  SELECT order_number, COALESCE(patient_name,'—')
    INTO v_order_num, v_patient
    FROM public.work_orders WHERE id = NEW.work_order_id;

  PERFORM public._notify_dedup(
    NEW.technician_id,
    'new_order',
    'Yeni iş: ' || COALESCE(v_station_name, 'İstasyon'),
    'Sipariş #' || COALESCE(v_order_num,'?') || ' · ' || v_patient,
    'work_order',
    NEW.work_order_id,
    '/(station)/jobs',
    jsonb_build_object('stage_id', NEW.id, 'station', v_station_name)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stages_notify_technician ON public.order_stages;
CREATE TRIGGER stages_notify_technician
  AFTER INSERT OR UPDATE OF technician_id, status ON public.order_stages
  FOR EACH ROW EXECUTE FUNCTION public.trg_stage_notify_technician();

-- 5) Trigger: stage tamamlandı / reddedildi → lab manager + admin'lere bildirim
CREATE OR REPLACE FUNCTION public.trg_stage_notify_lab()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_station_name TEXT;
  v_tech_name    TEXT;
  v_order_num    TEXT;
  v_wo_lab_id    UUID;
  v_title        TEXT;
  v_body         TEXT;
  v_admin        RECORD;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  IF NEW.status = 'tamamlandi' THEN
    v_title := 'Aşama tamamlandı';
  ELSIF NEW.status = 'reddedildi' THEN
    v_title := 'Aşama reddedildi';
  ELSE
    RETURN NEW;
  END IF;

  SELECT name INTO v_station_name FROM public.lab_stations WHERE id = NEW.station_id;
  SELECT full_name INTO v_tech_name FROM public.profiles WHERE id = NEW.technician_id;
  SELECT order_number, lab_id
    INTO v_order_num, v_wo_lab_id
    FROM public.work_orders WHERE id = NEW.work_order_id;

  v_title := v_title || ': ' || COALESCE(v_station_name, '—');
  v_body  := COALESCE(v_tech_name, 'Teknisyen') || ' · #' || COALESCE(v_order_num, '?');

  FOR v_admin IN
    SELECT id FROM public.profiles
     WHERE lab_id = v_wo_lab_id
       AND user_type IN ('lab','admin')
       AND COALESCE(role,'manager') IN ('manager','admin')
       AND COALESCE(is_active, true) = true
  LOOP
    PERFORM public._notify_dedup(
      v_admin.id,
      'order_status',
      v_title,
      v_body,
      'work_order',
      NEW.work_order_id,
      '/(lab)/order/' || NEW.work_order_id::text,
      jsonb_build_object('stage_id', NEW.id)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stages_notify_lab ON public.order_stages;
CREATE TRIGGER stages_notify_lab
  AFTER UPDATE OF status ON public.order_stages
  FOR EACH ROW EXECUTE FUNCTION public.trg_stage_notify_lab();

-- 6) Trigger: work_order status değişti → lab manager + admin'lere bildirim
CREATE OR REPLACE FUNCTION public.trg_work_order_notify_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_label  TEXT;
  v_admin  RECORD;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  v_label := CASE NEW.status::TEXT
    WHEN 'alindi'          THEN 'Alındı'
    WHEN 'asamada'         THEN 'Üretimde'
    WHEN 'uretimde'        THEN 'Üretimde'
    WHEN 'kalite_kontrol'  THEN 'Final QC'
    WHEN 'teslimata_hazir' THEN 'Kuryeye Teslim Edildi'
    WHEN 'teslim_edildi'   THEN 'Teslim Edildi'
    ELSE NEW.status::TEXT
  END;

  FOR v_admin IN
    SELECT id FROM public.profiles
     WHERE lab_id = NEW.lab_id
       AND user_type IN ('lab','admin')
       AND COALESCE(role,'manager') IN ('manager','admin')
       AND COALESCE(is_active, true) = true
  LOOP
    PERFORM public._notify_dedup(
      v_admin.id,
      'order_status',
      'Sipariş statüsü: ' || v_label,
      '#' || COALESCE(NEW.order_number, '?'),
      'work_order',
      NEW.id,
      '/(lab)/order/' || NEW.id::text,
      jsonb_build_object('status', NEW.status::text)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_orders_notify_status ON public.work_orders;
CREATE TRIGGER work_orders_notify_status
  AFTER UPDATE OF status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_work_order_notify_status();

-- 7) Trigger: planlama onaylandı (triage_approved_at) → lab manager + admin'lere
CREATE OR REPLACE FUNCTION public.trg_work_order_notify_triage()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_approver TEXT;
  v_admin    RECORD;
BEGIN
  IF OLD.triage_approved_at IS NOT NULL OR NEW.triage_approved_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_approver FROM public.profiles WHERE id = NEW.triage_approved_by;

  FOR v_admin IN
    SELECT id FROM public.profiles
     WHERE lab_id = NEW.lab_id
       AND user_type IN ('lab','admin')
       AND COALESCE(role,'manager') IN ('manager','admin')
       AND COALESCE(is_active, true) = true
  LOOP
    PERFORM public._notify_dedup(
      v_admin.id,
      'approval',
      'Planlama onaylandı',
      COALESCE(v_approver, '—') || ' · #' || COALESCE(NEW.order_number, '?'),
      'work_order',
      NEW.id,
      '/(lab)/order/' || NEW.id::text,
      jsonb_build_object('approved_by', NEW.triage_approved_by)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_orders_notify_triage ON public.work_orders;
CREATE TRIGGER work_orders_notify_triage
  AFTER UPDATE OF triage_approved_at ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_work_order_notify_triage();

COMMIT;

NOTIFY pgrst, 'reload schema';
