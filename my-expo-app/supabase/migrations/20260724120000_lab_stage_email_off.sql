-- 20260724120000_lab_stage_email_off.sql
--
-- Teknisyen + lab geri bildirimi: "her aşama her iş için mail alıyoruz, rahatsız edici."
-- Karar (kullanıcı onaylı — "Normal sipariş sitesi"): iç personel panelden çalışır;
-- mail yalnız aksiyon gerektirenlere gelir, aşama/statü ilerlemeleri uygulama içi döner.
--
-- Bu migration 4 trigger fonksiyonunda yalnız BİLDİRİM KANALINI değiştirir
-- (_notify_dedup/_notify_channels → _notify_inapp). Hedef kitle, metin, tetik
-- koşulları AYNI. _notify_inapp yalnız notifications satırı yazar (mail/push YOK).
--
--   1) trg_stage_notify_technician  → teknisyen atama maili KALKAR (uygulama içi kalır)
--   2) trg_stage_notify_lab         → müdür/admin "aşama tamamlandı/reddedildi" maili KALKAR
--   3) trg_work_order_notify_status → müdür/admin statü ilerleme maili KALKAR
--                                     (klinik/hekim "teslimata hazır" maili KORUNUR)
--   4) trg_notify_critical_stage    → müdür/admin kritik aşama maili KALKAR
--
-- DOKUNULMAYAN (mail devam): trg_work_order_notify_triage (planlama onayı),
--   trg_notify_design_approval_pending (tasarım onayı bekliyor), günlük iş özeti
--   (order_watch), klinik/hekim teslimata_hazir. Bunlar aksiyon/özet nitelikli.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Teknisyen: yeni iş atama → SADECE uygulama içi
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_stage_notify_technician()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_station_name TEXT;
  v_order_num    TEXT;
  v_patient      TEXT;
  v_should       BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_should := NEW.technician_id IS NOT NULL AND NEW.status IN ('aktif', 'bekliyor');
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.technician_id IS NOT NULL
       AND COALESCE(OLD.technician_id::text,'') <> COALESCE(NEW.technician_id::text,'') THEN
      v_should := TRUE;
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

  -- Değişiklik: _notify_dedup → _notify_inapp (mail yok, uygulama içi kalır)
  PERFORM public._notify_inapp(
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
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Aşama tamamlandı/reddedildi: müdür/admin → uygulama içi (klinik zaten uygulama içi)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_stage_notify_lab()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_station_name TEXT; v_tech_name TEXT; v_order_num TEXT; v_wo_lab_id UUID; v_clinic_id UUID;
  v_title TEXT; v_body TEXT; v_admin RECORD; v_clinic_user RECORD;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status = 'tamamlandi' THEN
    IF COALESCE(NEW.is_critical, false) THEN RETURN NEW; END IF;
    v_title := 'Aşama tamamlandı';
  ELSIF NEW.status = 'reddedildi' THEN
    v_title := 'Aşama reddedildi';
  ELSE
    RETURN NEW;
  END IF;
  SELECT name INTO v_station_name FROM public.lab_stations WHERE id = NEW.station_id;
  SELECT full_name INTO v_tech_name FROM public.profiles WHERE id = NEW.technician_id;
  SELECT order_number, lab_id INTO v_order_num, v_wo_lab_id FROM public.work_orders WHERE id = NEW.work_order_id;
  v_title := v_title || ': ' || COALESCE(v_station_name, '—');
  v_body  := COALESCE(v_tech_name, 'Teknisyen') || ' · #' || COALESCE(v_order_num, '?');

  -- Değişiklik: müdür/admin _notify_dedup → _notify_inapp (mail yok)
  FOR v_admin IN SELECT id FROM public.profiles
                  WHERE lab_id = v_wo_lab_id AND user_type IN ('lab','admin')
                    AND COALESCE(role,'manager') IN ('manager','admin')
                    AND COALESCE(is_active, true) = true LOOP
    PERFORM public._notify_inapp(v_admin.id, 'order_status', v_title, v_body, 'work_order', NEW.work_order_id,
      '/(lab)/order/' || NEW.work_order_id::text, jsonb_build_object('stage_id', NEW.id));
  END LOOP;

  -- Klinik — SADECE uygulama içi (değişmedi)
  v_clinic_id := public._resolve_wo_clinic_id(NEW.work_order_id);
  IF v_clinic_id IS NOT NULL THEN
    FOR v_clinic_user IN SELECT id FROM public.profiles
                          WHERE clinic_id = v_clinic_id AND user_type = 'clinic_admin'
                            AND COALESCE(is_active, true) = true LOOP
      PERFORM public._notify_inapp(v_clinic_user.id, 'order_status', v_title,
        '#' || COALESCE(v_order_num,'?'), 'work_order', NEW.work_order_id,
        '/(clinic)/order/' || NEW.work_order_id::text,
        jsonb_build_object('stage_id', NEW.id, 'station', v_station_name));
    END LOOP;
  END IF;
  RETURN NEW;
END; $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Statü ilerleme: müdür/admin → uygulama içi. Klinik/hekim "teslimata hazır" mail KORUNUR.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_work_order_notify_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_label TEXT; v_admin RECORD; v_clinic_id UUID; v_clinic_user RECORD;
  v_ready BOOLEAN; v_doctor_id UUID; v_rd_title TEXT; v_rd_body TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  v_label := CASE NEW.status::TEXT
    WHEN 'alindi'           THEN 'Alındı'
    WHEN 'asamada'          THEN 'Üretimde'
    WHEN 'uretimde'         THEN 'Üretimde'
    WHEN 'kalite_kontrol'   THEN 'Final QC'
    WHEN 'teslimata_hazir'  THEN 'Teslime Hazır'
    WHEN 'kurye_bekleniyor' THEN 'Kurye Bekleniyor'
    WHEN 'kuryede'          THEN 'Kuryede'
    WHEN 'teslim_edildi'    THEN 'Teslim Edildi'
    ELSE NEW.status::TEXT
  END;

  v_ready := (NEW.status::TEXT = 'teslimata_hazir');

  -- Değişiklik: müdür/admin _notify_dedup → _notify_inapp (statü ilerleme maili kalkar)
  FOR v_admin IN SELECT id FROM public.profiles
                  WHERE lab_id = NEW.lab_id AND user_type IN ('lab','admin')
                    AND COALESCE(role,'manager') IN ('manager','admin')
                    AND COALESCE(is_active, true) = true LOOP
    PERFORM public._notify_inapp(v_admin.id, 'order_status',
      'Sipariş statüsü: ' || v_label, '#' || COALESCE(NEW.order_number, '?'),
      'work_order', NEW.id, '/(lab)/order/' || NEW.id::text,
      jsonb_build_object('status', NEW.status::text));
  END LOOP;

  v_clinic_id := public._resolve_wo_clinic_id(NEW.id);

  IF v_ready THEN
    -- Teslimata hazır → hekim + klinik, MAİL DAHİL (korunuyor)
    v_rd_title := 'Teslimata hazır';
    v_rd_body  := COALESCE(NULLIF(trim(NEW.patient_name), ''), 'Hasta')
                  || ' · #' || COALESCE(NEW.order_number, '?');
    v_doctor_id := NEW.doctor_id;

    FOR v_clinic_user IN SELECT id FROM public.profiles
                          WHERE id = v_doctor_id AND COALESCE(is_active, true) = true LOOP
      PERFORM public._notify_channels(v_clinic_user.id, 'ready_for_delivery', v_rd_title, v_rd_body,
        'work_order', NEW.id, '/(doctor)/order/' || NEW.id::text,
        jsonb_build_object('status', NEW.status::text));
    END LOOP;

    IF v_clinic_id IS NOT NULL THEN
      FOR v_clinic_user IN SELECT id FROM public.profiles
                            WHERE clinic_id = v_clinic_id
                              AND user_type IN ('clinic_admin','clinic_secretary')
                              AND COALESCE(is_active, true) = true
                              AND id IS DISTINCT FROM v_doctor_id LOOP
        PERFORM public._notify_channels(v_clinic_user.id, 'ready_for_delivery', v_rd_title, v_rd_body,
          'work_order', NEW.id, '/(clinic)/order/' || NEW.id::text,
          jsonb_build_object('status', NEW.status::text));
      END LOOP;
    END IF;

  ELSIF v_clinic_id IS NOT NULL THEN
    -- Diğer statüler → klinik SADECE uygulama içi (değişmedi)
    FOR v_clinic_user IN SELECT id FROM public.profiles
                          WHERE clinic_id = v_clinic_id AND user_type = 'clinic_admin'
                            AND COALESCE(is_active, true) = true LOOP
      PERFORM public._notify_inapp(v_clinic_user.id, 'order_status',
        'Sipariş statüsü: ' || v_label, '#' || COALESCE(NEW.order_number, '?'),
        'work_order', NEW.id, '/(clinic)/order/' || NEW.id::text,
        jsonb_build_object('status', NEW.status::text));
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Kritik aşama: müdür/admin → uygulama içi (hekim/klinik zaten uygulama içi)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_notify_critical_stage()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_station text; v_order_num text; v_lab_id uuid; v_doctor_id uuid; v_clinic_id uuid; v_patient text;
  v_title text; v_body text; v_rec record;
BEGIN
  IF NOT COALESCE(NEW.is_critical, false) THEN RETURN NEW; END IF;
  IF NEW.status <> 'tamamlandi' OR OLD.status IS NOT DISTINCT FROM 'tamamlandi' THEN RETURN NEW; END IF;
  BEGIN
    SELECT name INTO v_station FROM public.lab_stations WHERE id = NEW.station_id;
    SELECT order_number, lab_id, doctor_id, patient_name INTO v_order_num, v_lab_id, v_doctor_id, v_patient
      FROM public.work_orders WHERE id = NEW.work_order_id;
    v_clinic_id := public._resolve_wo_clinic_id(NEW.work_order_id);
    v_title := 'Kritik aşama tamamlandı: ' || COALESCE(v_station, '—');
    v_body  := COALESCE(NULLIF(trim(v_patient), ''), 'Hasta') || ' · #' || COALESCE(v_order_num, '?');

    -- Hekim → uygulama içi (değişmedi)
    FOR v_rec IN SELECT id FROM public.profiles WHERE id = v_doctor_id AND COALESCE(is_active, true) = true LOOP
      PERFORM public._notify_inapp(v_rec.id, 'stage_critical', v_title, v_body, 'work_order', NEW.work_order_id,
        '/(doctor)/order/' || NEW.work_order_id::text, jsonb_build_object('stage_id', NEW.id, 'station', v_station));
    END LOOP;

    -- Klinik → uygulama içi (değişmedi)
    IF v_clinic_id IS NOT NULL THEN
      FOR v_rec IN SELECT id FROM public.profiles
                    WHERE clinic_id = v_clinic_id
                      AND user_type IN ('clinic_admin','clinic_secretary')
                      AND COALESCE(is_active, true) = true
                      AND id IS DISTINCT FROM v_doctor_id LOOP
        PERFORM public._notify_inapp(v_rec.id, 'stage_critical', v_title, v_body, 'work_order', NEW.work_order_id,
          '/(clinic)/order/' || NEW.work_order_id::text, jsonb_build_object('stage_id', NEW.id, 'station', v_station));
      END LOOP;
    END IF;

    -- Değişiklik: müdür/admin _notify_channels → _notify_inapp (kritik aşama maili kalkar)
    FOR v_rec IN SELECT id FROM public.profiles
                  WHERE lab_id = v_lab_id
                    AND (user_type = 'admin' OR (user_type = 'lab' AND role = 'manager'))
                    AND COALESCE(is_active, true) = true LOOP
      PERFORM public._notify_inapp(v_rec.id, 'stage_critical', v_title, v_body, 'work_order', NEW.work_order_id,
        '/(lab)/order/' || NEW.work_order_id::text, jsonb_build_object('stage_id', NEW.id, 'station', v_station));
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_critical_stage failed for stage %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END; $function$;
