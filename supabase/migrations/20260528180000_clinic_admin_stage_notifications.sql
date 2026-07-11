-- ════════════════════════════════════════════════════════════════════════════
-- 20260528 — Klinik müdürlerine aşama / sipariş statüsü bildirimleri
--
-- Önceki davranış:
--   • trg_stage_notify_lab + trg_work_order_notify_status sadece lab manager
--     ve admin kullanıcılarına bildirim atıyordu.
--
-- Yeni davranış:
--   • Aynı olaylar (aşama tamamlandı/reddedildi, sipariş statüsü değişti)
--     siparişin ait olduğu kliniğin clinic_admin kullanıcılarına da gider.
--   • action_url klinik paneline yönlendirir: /(clinic)/order/<id>
--
-- Doctor → clinic_id resolution:
--   work_orders.doctor_id polymorphic:
--     • profiles.id (doctor profile) — profiles.clinic_id
--     • doctors.id                   — doctors.clinic_id
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Helper: bir work_order için clinic_id'yi çöz
CREATE OR REPLACE FUNCTION public._resolve_wo_clinic_id(p_work_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_id uuid;
  v_clinic_id uuid;
BEGIN
  SELECT doctor_id INTO v_doctor_id FROM public.work_orders WHERE id = p_work_order_id;
  IF v_doctor_id IS NULL THEN RETURN NULL; END IF;

  SELECT clinic_id INTO v_clinic_id FROM public.profiles WHERE id = v_doctor_id;
  IF v_clinic_id IS NOT NULL THEN RETURN v_clinic_id; END IF;

  SELECT clinic_id INTO v_clinic_id FROM public.doctors WHERE id = v_doctor_id;
  RETURN v_clinic_id;
END;
$$;

-- 1) Stage tamamlandı/reddedildi → klinik admin'lerini de bilgilendir
CREATE OR REPLACE FUNCTION public.trg_stage_notify_lab()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- Lab manager + admin
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

  -- Klinik admin (siparişin kliniği)
  v_clinic_id := public._resolve_wo_clinic_id(NEW.work_order_id);
  IF v_clinic_id IS NOT NULL THEN
    FOR v_clinic_user IN
      SELECT id FROM public.profiles
       WHERE clinic_id = v_clinic_id
         AND user_type = 'clinic_admin'
         AND COALESCE(is_active, true) = true
    LOOP
      PERFORM public._notify_dedup(
        v_clinic_user.id,
        'order_status',
        v_title,
        '#' || COALESCE(v_order_num,'?'),
        'work_order',
        NEW.work_order_id,
        '/(clinic)/order/' || NEW.work_order_id::text,
        jsonb_build_object('stage_id', NEW.id, 'station', v_station_name)
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Work order status değişti → klinik admin'lerini de bilgilendir
CREATE OR REPLACE FUNCTION public.trg_work_order_notify_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_label       TEXT;
  v_admin       RECORD;
  v_clinic_id   UUID;
  v_clinic_user RECORD;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  v_label := CASE NEW.status::TEXT
    WHEN 'alindi'          THEN 'Alındı'
    WHEN 'asamada'         THEN 'Üretimde'
    WHEN 'uretimde'        THEN 'Üretimde'
    WHEN 'kalite_kontrol'  THEN 'Final QC'
    WHEN 'teslimata_hazir' THEN 'Teslime Hazır'
    WHEN 'kurye_bekleniyor' THEN 'Kurye Bekleniyor'
    WHEN 'kuryede'         THEN 'Kuryede'
    WHEN 'teslim_edildi'   THEN 'Teslim Edildi'
    ELSE NEW.status::TEXT
  END;

  -- Lab manager + admin
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

  -- Klinik admin
  v_clinic_id := public._resolve_wo_clinic_id(NEW.id);
  IF v_clinic_id IS NOT NULL THEN
    FOR v_clinic_user IN
      SELECT id FROM public.profiles
       WHERE clinic_id = v_clinic_id
         AND user_type = 'clinic_admin'
         AND COALESCE(is_active, true) = true
    LOOP
      PERFORM public._notify_dedup(
        v_clinic_user.id,
        'order_status',
        'Sipariş statüsü: ' || v_label,
        '#' || COALESCE(NEW.order_number, '?'),
        'work_order',
        NEW.id,
        '/(clinic)/order/' || NEW.id::text,
        jsonb_build_object('status', NEW.status::text)
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
