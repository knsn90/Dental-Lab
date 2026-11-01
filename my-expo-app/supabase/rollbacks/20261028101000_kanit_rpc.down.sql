-- Geri alma: 20261028101000_kanit_rpc

CREATE OR REPLACE FUNCTION public.trg_work_order_notify_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_label TEXT; v_admin RECORD; v_clinic_id UUID; v_clinic_user RECORD;
  v_ready BOOLEAN; v_doctor_id UUID; v_rd_title TEXT; v_rd_body TEXT;
  v_clinic_name TEXT; v_patient TEXT; v_cr_title TEXT; v_cr_body TEXT; v_cr_payload JSONB;
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
  v_ready     := (NEW.status::TEXT = 'teslimata_hazir');
  v_doctor_id := NEW.doctor_id;
  v_clinic_id := public._resolve_wo_clinic_id(NEW.id);

  -- ═══ KURYE YOLA ÇIKTI ═══════════════════════════════════════════════
  IF NEW.status::TEXT = 'kuryede' THEN
    v_patient := COALESCE(NULLIF(trim(NEW.patient_name), ''), 'Hasta');
    SELECT name INTO v_clinic_name FROM public.clinics WHERE id = v_clinic_id;

    v_cr_title := 'Kurye yola çıktı';
    v_cr_body  := v_patient || ' · #' || COALESCE(NEW.order_number, '?')
                  || ' kuryeye teslim edildi. Kuryeyi haritada canlı izleyebilirsiniz.';
    v_cr_payload := jsonb_build_object(
      'status',      NEW.status::text,
      'patient',     v_patient,
      'orderNumber', COALESCE(NEW.order_number, '—'),
      'clinic',      COALESCE(NULLIF(trim(v_clinic_name), ''), '—')
    );

    -- Lab + yönetici (yalnız yönetici rolleri)
    FOR v_admin IN SELECT id FROM public.profiles
                    WHERE lab_id = NEW.lab_id AND user_type IN ('lab','admin')
                      AND COALESCE(role,'manager') IN ('manager','admin')
                      AND COALESCE(is_active, true) = true LOOP
      PERFORM public._notify_channels(v_admin.id, 'delivery', v_cr_title, v_cr_body,
        'work_order', NEW.id, '/courier-tracking', v_cr_payload);
    END LOOP;

    -- Hekim (doctor_id bir kullanıcı profili ise)
    FOR v_clinic_user IN SELECT id FROM public.profiles
                          WHERE id = v_doctor_id AND COALESCE(is_active, true) = true LOOP
      PERFORM public._notify_channels(v_clinic_user.id, 'delivery', v_cr_title, v_cr_body,
        'work_order', NEW.id, '/courier-tracking', v_cr_payload);
    END LOOP;

    -- Klinik yöneticisi + sekreteri (hekimle çakışmasın)
    IF v_clinic_id IS NOT NULL THEN
      FOR v_clinic_user IN SELECT id FROM public.profiles
                            WHERE clinic_id = v_clinic_id
                              AND user_type IN ('clinic_admin','clinic_secretary')
                              AND COALESCE(is_active, true) = true
                              AND id IS DISTINCT FROM v_doctor_id LOOP
        PERFORM public._notify_channels(v_clinic_user.id, 'delivery', v_cr_title, v_cr_body,
          'work_order', NEW.id, '/courier-tracking', v_cr_payload);
      END LOOP;
    END IF;

    RETURN NEW;   -- genel statü bildirimini ATLA (çift satır olmasın)
  END IF;

  -- ═══ DİĞER STATÜLER (değişmedi) ═════════════════════════════════════
  FOR v_admin IN SELECT id FROM public.profiles
                  WHERE lab_id = NEW.lab_id AND user_type IN ('lab','admin')
                    AND COALESCE(role,'manager') IN ('manager','admin')
                    AND COALESCE(is_active, true) = true LOOP
    PERFORM public._notify_inapp(v_admin.id, 'order_status',
      'Sipariş statüsü: ' || v_label, '#' || COALESCE(NEW.order_number, '?'),
      'work_order', NEW.id, '/order/' || NEW.id::text,
      jsonb_build_object('status', NEW.status::text));
  END LOOP;

  IF v_ready THEN
    v_rd_title := 'Teslimata hazır';
    v_rd_body  := COALESCE(NULLIF(trim(NEW.patient_name), ''), 'Hasta')
                  || ' · #' || COALESCE(NEW.order_number, '?');

    FOR v_clinic_user IN SELECT id FROM public.profiles
                          WHERE id = v_doctor_id AND COALESCE(is_active, true) = true LOOP
      PERFORM public._notify_channels(v_clinic_user.id, 'ready_for_delivery', v_rd_title, v_rd_body,
        'work_order', NEW.id, '/order/' || NEW.id::text,
        jsonb_build_object('status', NEW.status::text));
    END LOOP;

    IF v_clinic_id IS NOT NULL THEN
      FOR v_clinic_user IN SELECT id FROM public.profiles
                            WHERE clinic_id = v_clinic_id
                              AND user_type IN ('clinic_admin','clinic_secretary')
                              AND COALESCE(is_active, true) = true
                              AND id IS DISTINCT FROM v_doctor_id LOOP
        PERFORM public._notify_channels(v_clinic_user.id, 'ready_for_delivery', v_rd_title, v_rd_body,
          'work_order', NEW.id, '/order/' || NEW.id::text,
          jsonb_build_object('status', NEW.status::text));
      END LOOP;
    END IF;

  ELSIF v_clinic_id IS NOT NULL THEN
    FOR v_clinic_user IN SELECT id FROM public.profiles
                          WHERE clinic_id = v_clinic_id AND user_type = 'clinic_admin'
                            AND COALESCE(is_active, true) = true LOOP
      PERFORM public._notify_inapp(v_clinic_user.id, 'order_status',
        'Sipariş statüsü: ' || v_label, '#' || COALESCE(NEW.order_number, '?'),
        'work_order', NEW.id, '/order/' || NEW.id::text,
        jsonb_build_object('status', NEW.status::text));
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

drop function if exists public.deliver_with_proof(jsonb, text, text);
drop function if exists public.close_delivery_without_proof(uuid, text);
drop function if exists public.delivery_proof_siblings(uuid);
drop function if exists public.bbk_apply_delivery_proof(text, text, text, timestamptz, text, text);
drop function if exists public._delivery_proof_notice(uuid);
drop function if exists public._delivery_proof_file_ok(uuid, uuid, text);
drop function if exists public._delivery_proof_close(uuid);
