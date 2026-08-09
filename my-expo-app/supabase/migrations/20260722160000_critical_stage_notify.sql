-- ════════════════════════════════════════════════════════════════════════════
-- Kritik aşama tamamlandı bildirimi — hekim + klinik + müdür + admin
--
-- İSTEK: lab_stations.is_critical (order_stages.is_critical'e kopyalanır) işaretli
-- bir aşama TAMAMLANINCA, siparişin hekimine + kliniğine + lab müdürüne + admin'e
-- belirgin bildirim (in-app + push + email) gitsin.
--
-- MEVCUT DURUM: trg_stage_notify_lab HER aşama tamamlanınca müdür+admin+klinik_admin'e
-- 'order_status' (email varsayılan KAPALI) in-app atıyor; HEKİM'e atmıyor.
-- Çift bildirim olmasın diye o trigger artık KRİTİK tamamlanmaları yeni trigger'a
-- bırakır (non-kritik + reddedildi'de aynı kalır).
--
-- GÜVENLİK: yeni trigger tüm bildirim işini EXCEPTION bloğuna alır → bildirim
-- hatası aşama tamamlamayı ASLA bloke etmez (hot tablo).
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Yardımcı: bir kullanıcıya TÜM kanallardan bildir (in-app + 4 edge fn) ──
CREATE OR REPLACE FUNCTION public._notify_channels(
  p_user_id uuid, p_category text, p_title text, p_body text,
  p_resource_type text, p_resource_id uuid, p_action_url text, p_payload jsonb
) RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab_id uuid;
  v_id     uuid;
  v_secret text;
  v_anon   text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqd2p4cWZkc3hreGdjZ29waGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODMwODYsImV4cCI6MjA5NDc1OTA4Nn0.JWYGFTRvepDfkfZlvSxqjOm5oEw6RfWwhoz070MBShU';
  v_hdr    jsonb;
  v_fn     text;
BEGIN
  SELECT lab_id INTO v_lab_id FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.notifications (
    user_id, lab_id, category, title, body, resource_type, resource_id, action_url, payload
  ) VALUES (
    p_user_id, v_lab_id, p_category, p_title, p_body, p_resource_type, p_resource_id, p_action_url, COALESCE(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  BEGIN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'notify_fn_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  v_hdr := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_anon,
    'apikey', v_anon,
    'x-notify-secret', COALESCE(v_secret, '')
  );

  FOREACH v_fn IN ARRAY ARRAY['send-email-notification','send-expo-push','send-web-push','send-whatsapp-notification'] LOOP
    PERFORM net.http_post(
      url     := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/' || v_fn,
      headers := v_hdr,
      body    := jsonb_build_object(
        'userIds', jsonb_build_array(p_user_id::text),
        'category', p_category,
        'notificationId', v_id::text,
        'payload', jsonb_build_object(
          'title', p_title, 'body', COALESCE(p_body, ''),
          'actionUrl', COALESCE(p_action_url, ''),
          'resourceType', COALESCE(p_resource_type, ''),
          'resourceId', COALESCE(p_resource_id::text, '')
        )
      )
    );
  END LOOP;

  RETURN v_id;
END;
$function$;

-- ── Yeni trigger: kritik aşama tamamlandı → hekim + klinik + müdür + admin ──
CREATE OR REPLACE FUNCTION public.trg_notify_critical_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_station   text;
  v_order_num text;
  v_lab_id    uuid;
  v_doctor_id uuid;
  v_clinic_id uuid;
  v_patient   text;
  v_title     text;
  v_body      text;
  v_rec       record;
BEGIN
  -- yalnız KRİTİK aşama İLK kez 'tamamlandi'ya geçince
  IF NOT COALESCE(NEW.is_critical, false) THEN RETURN NEW; END IF;
  IF NEW.status <> 'tamamlandi' OR OLD.status IS NOT DISTINCT FROM 'tamamlandi' THEN RETURN NEW; END IF;

  BEGIN
    SELECT name INTO v_station FROM public.lab_stations WHERE id = NEW.station_id;
    SELECT order_number, lab_id, doctor_id, patient_name
      INTO v_order_num, v_lab_id, v_doctor_id, v_patient
      FROM public.work_orders WHERE id = NEW.work_order_id;
    v_clinic_id := public._resolve_wo_clinic_id(NEW.work_order_id);

    v_title := 'Kritik aşama tamamlandı: ' || COALESCE(v_station, '—');
    v_body  := COALESCE(NULLIF(trim(v_patient), ''), 'Hasta') || ' · #' || COALESCE(v_order_num, '?');

    -- Hekim (siparişin doctor_id'si bir profile/login ise)
    FOR v_rec IN
      SELECT id FROM public.profiles WHERE id = v_doctor_id AND COALESCE(is_active, true) = true
    LOOP
      PERFORM public._notify_channels(v_rec.id, 'stage_critical', v_title, v_body,
        'work_order', NEW.work_order_id, '/(doctor)/order/' || NEW.work_order_id::text,
        jsonb_build_object('stage_id', NEW.id, 'station', v_station));
    END LOOP;

    -- Klinik kullanıcıları (hekim zaten ayrı bildirildi → hariç)
    IF v_clinic_id IS NOT NULL THEN
      FOR v_rec IN
        SELECT id FROM public.profiles
         WHERE clinic_id = v_clinic_id
           AND user_type IN ('clinic_admin','clinic_secretary')
           AND COALESCE(is_active, true) = true
           AND id IS DISTINCT FROM v_doctor_id
      LOOP
        PERFORM public._notify_channels(v_rec.id, 'stage_critical', v_title, v_body,
          'work_order', NEW.work_order_id, '/(clinic)/order/' || NEW.work_order_id::text,
          jsonb_build_object('stage_id', NEW.id, 'station', v_station));
      END LOOP;
    END IF;

    -- Lab müdürü + admin
    FOR v_rec IN
      SELECT id FROM public.profiles
       WHERE lab_id = v_lab_id
         AND (user_type = 'admin' OR (user_type = 'lab' AND role = 'manager'))
         AND COALESCE(is_active, true) = true
    LOOP
      PERFORM public._notify_channels(v_rec.id, 'stage_critical', v_title, v_body,
        'work_order', NEW.work_order_id, '/(lab)/order/' || NEW.work_order_id::text,
        jsonb_build_object('stage_id', NEW.id, 'station', v_station));
    END LOOP;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_critical_stage failed for stage %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS stages_notify_critical ON public.order_stages;
CREATE TRIGGER stages_notify_critical
  AFTER UPDATE OF status ON public.order_stages
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_critical_stage();

-- ── Mevcut trigger: KRİTİK tamamlanmaları yeni trigger'a bırak (çift bildirim yok) ──
CREATE OR REPLACE FUNCTION public.trg_stage_notify_lab()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_station_name TEXT;
  v_tech_name    TEXT;
  v_order_num    TEXT;
  v_wo_lab_id    UUID;
  v_clinic_id    UUID;
  v_title        TEXT;
  v_body         TEXT;
  v_admin        RECORD;
  v_clinic_user  RECORD;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  IF NEW.status = 'tamamlandi' THEN
    -- Kritik aşama tamamlanmaları stages_notify_critical ile (daha belirgin +
    -- hekim dahil + email) bildirilir → burada atla, çift bildirim olmasın.
    IF COALESCE(NEW.is_critical, false) THEN RETURN NEW; END IF;
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
      v_admin.id, 'order_status', v_title, v_body, 'work_order',
      NEW.work_order_id, '/(lab)/order/' || NEW.work_order_id::text,
      jsonb_build_object('stage_id', NEW.id)
    );
  END LOOP;

  v_clinic_id := public._resolve_wo_clinic_id(NEW.work_order_id);
  IF v_clinic_id IS NOT NULL THEN
    FOR v_clinic_user IN
      SELECT id FROM public.profiles
       WHERE clinic_id = v_clinic_id
         AND user_type = 'clinic_admin'
         AND COALESCE(is_active, true) = true
    LOOP
      PERFORM public._notify_dedup(
        v_clinic_user.id, 'order_status', v_title, '#' || COALESCE(v_order_num,'?'),
        'work_order', NEW.work_order_id, '/(clinic)/order/' || NEW.work_order_id::text,
        jsonb_build_object('stage_id', NEW.id, 'station', v_station_name)
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
