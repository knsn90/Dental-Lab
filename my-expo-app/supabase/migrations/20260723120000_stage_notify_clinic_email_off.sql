-- 20260723120000_stage_notify_clinic_email_off.sql
--
-- Klinik geri bildirimi: "her aşamada mail geliyor, rahatsız edici. Ara aşamalar
-- gelmeyip sadece teslimata hazır maili yeterli."
--
-- Teşhis:
--   • Mail trafiğinin TEK kaynağı 'stage_critical' kategorisiydi. trg_notify_critical_stage
--     klinik/hekime _notify_channels ile gidiyordu; o fonksiyon 4 kanalı birden
--     (mail + expo push + web push + whatsapp) dedup'suz tetikliyor.
--   • Üstelik kapatılamıyordu: send-email-notification filtresi "sadece açıkça false ise
--     engelle" mantığında ve 'stage_critical' anahtarı prefs varsayılanında yok →
--     undefined → false değil → mail her hâlükârda gidiyordu.
--   • Diğer aşama/durum bildirimleri zaten 'order_status' kategorisinde ve onun mail
--     tercihi kapalı → sadece uygulama içi. Onlara dokunulmuyor.
--
-- Karar (kullanıcı onaylı): global (tüm lab'lar), mail kalksın + uygulama içi kalsın.
--
-- Bu migration:
--   1) _notify_inapp() — sadece notifications satırı yazan yardımcı (kanal fan-out YOK)
--   2) trg_notify_critical_stage → klinik/hekim artık _notify_inapp (mail/push yok);
--      LAB müdürü/admin eskisi gibi tam kanal alır (lab tarafı hiçbir şey kaybetmez)
--   3) trg_work_order_notify_status → status 'teslimata_hazir' olduğunda hekim + klinik
--      kullanıcılarına MAİL DAHİL bildirim ('ready_for_delivery'); aynı statüde klinik
--      için tekrar eden 'order_status' bildirimi bastırılır (çift bildirim olmasın)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Sadece uygulama içi bildirim yardımcısı
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._notify_inapp(
  p_user_id uuid, p_category text, p_title text, p_body text,
  p_resource_type text, p_resource_id uuid, p_action_url text, p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_lab_id uuid; v_id uuid;
BEGIN
  SELECT lab_id INTO v_lab_id FROM public.profiles WHERE id = p_user_id;
  INSERT INTO public.notifications (user_id, lab_id, category, title, body,
                                    resource_type, resource_id, action_url, payload)
  VALUES (p_user_id, v_lab_id, p_category, p_title, p_body,
          p_resource_type, p_resource_id, p_action_url, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

COMMENT ON FUNCTION public._notify_inapp IS
  'Sadece notifications satırı yazar; mail/push/whatsapp fan-out YAPMAZ. Klinik tarafı ara aşama bildirimleri için.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Kritik aşama: klinik/hekim → uygulama içi; lab → tam kanal
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

    -- Hekim → SADECE uygulama içi (mail/push yok)
    FOR v_rec IN SELECT id FROM public.profiles WHERE id = v_doctor_id AND COALESCE(is_active, true) = true LOOP
      PERFORM public._notify_inapp(v_rec.id, 'stage_critical', v_title, v_body, 'work_order', NEW.work_order_id,
        '/(doctor)/order/' || NEW.work_order_id::text, jsonb_build_object('stage_id', NEW.id, 'station', v_station));
    END LOOP;

    -- Klinik kullanıcıları → SADECE uygulama içi (mail/push yok)
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

    -- Lab müdürü/admin → DEĞİŞMEDİ, tam kanal
    FOR v_rec IN SELECT id FROM public.profiles
                  WHERE lab_id = v_lab_id
                    AND (user_type = 'admin' OR (user_type = 'lab' AND role = 'manager'))
                    AND COALESCE(is_active, true) = true LOOP
      PERFORM public._notify_channels(v_rec.id, 'stage_critical', v_title, v_body, 'work_order', NEW.work_order_id,
        '/(lab)/order/' || NEW.work_order_id::text, jsonb_build_object('stage_id', NEW.id, 'station', v_station));
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_critical_stage failed for stage %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END; $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Sipariş statüsü: 'teslimata_hazir' → hekim + klinik, MAİL DAHİL
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_work_order_notify_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_label       TEXT;
  v_admin       RECORD;
  v_clinic_id   UUID;
  v_clinic_user RECORD;
  v_ready       BOOLEAN;
  v_doctor_id   UUID;
  v_rd_title    TEXT;
  v_rd_body     TEXT;
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

  -- Lab manager + admin — DEĞİŞMEDİ
  FOR v_admin IN
    SELECT id FROM public.profiles
     WHERE lab_id = NEW.lab_id
       AND user_type IN ('lab','admin')
       AND COALESCE(role,'manager') IN ('manager','admin')
       AND COALESCE(is_active, true) = true
  LOOP
    PERFORM public._notify_dedup(
      v_admin.id, 'order_status',
      'Sipariş statüsü: ' || v_label, '#' || COALESCE(NEW.order_number, '?'),
      'work_order', NEW.id, '/(lab)/order/' || NEW.id::text,
      jsonb_build_object('status', NEW.status::text)
    );
  END LOOP;

  v_clinic_id := public._resolve_wo_clinic_id(NEW.id);

  IF v_ready THEN
    -- ── Teslime hazır: hekim + TÜM klinik kullanıcıları, mail dahil ──
    v_rd_title := 'Teslimata hazır';
    v_rd_body  := COALESCE(NULLIF(trim(NEW.patient_name), ''), 'Hasta')
                  || ' · #' || COALESCE(NEW.order_number, '?');

    SELECT doctor_id INTO v_doctor_id FROM public.work_orders WHERE id = NEW.id;

    FOR v_clinic_user IN
      SELECT id FROM public.profiles WHERE id = v_doctor_id AND COALESCE(is_active, true) = true
    LOOP
      PERFORM public._notify_channels(
        v_clinic_user.id, 'ready_for_delivery', v_rd_title, v_rd_body,
        'work_order', NEW.id, '/(doctor)/order/' || NEW.id::text,
        jsonb_build_object('status', NEW.status::text)
      );
    END LOOP;

    IF v_clinic_id IS NOT NULL THEN
      FOR v_clinic_user IN
        SELECT id FROM public.profiles
         WHERE clinic_id = v_clinic_id
           AND user_type IN ('clinic_admin','clinic_secretary')
           AND COALESCE(is_active, true) = true
           AND id IS DISTINCT FROM v_doctor_id
      LOOP
        PERFORM public._notify_channels(
          v_clinic_user.id, 'ready_for_delivery', v_rd_title, v_rd_body,
          'work_order', NEW.id, '/(clinic)/order/' || NEW.id::text,
          jsonb_build_object('status', NEW.status::text)
        );
      END LOOP;
    END IF;

  ELSIF v_clinic_id IS NOT NULL THEN
    -- ── Diğer statüler: klinik yöneticisine sadece uygulama içi (eskisi gibi) ──
    FOR v_clinic_user IN
      SELECT id FROM public.profiles
       WHERE clinic_id = v_clinic_id
         AND user_type = 'clinic_admin'
         AND COALESCE(is_active, true) = true
    LOOP
      PERFORM public._notify_dedup(
        v_clinic_user.id, 'order_status',
        'Sipariş statüsü: ' || v_label, '#' || COALESCE(NEW.order_number, '?'),
        'work_order', NEW.id, '/(clinic)/order/' || NEW.id::text,
        jsonb_build_object('status', NEW.status::text)
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;
