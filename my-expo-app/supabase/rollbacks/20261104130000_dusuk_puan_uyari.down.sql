-- Geri alma: 20261104130000_dusuk_puan_uyari
-- Önce 20261104150000 ve 20261104140000 geri alınmalı (değerlendiriciyi kullanırlar).
-- İki canlı fonksiyon before.txt tanımına döner; tetikleyici ve üç yeni fonksiyon düşer.
-- review_followups satırları kalır (tablo 20261104120000'in down'ında düşer).
BEGIN;

DROP TRIGGER IF EXISTS trg_order_reviews_low ON public.order_reviews;

-- review_wa_record_answer: canlı tanım (before.txt, md5 2b0705b1c3c0533c3c4913440605ea72)
CREATE OR REPLACE FUNCTION public.review_wa_record_answer(p_request uuid, p_score integer, p_from text, p_lab uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.review_requests; v_role text; v_rater uuid; v_alert text; v_lab_name text;
BEGIN
  SELECT * INTO r FROM public.review_requests WHERE id = p_request FOR UPDATE;
  IF r.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown');
  END IF;
  IF p_lab IS DISTINCT FROM r.lab_id OR public._review_phone_tr(p_from) IS DISTINCT FROM r.phone_to THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mismatch');
  END IF;
  IF p_score IS NULL OR p_score NOT IN (1, 3, 5) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'score');
  END IF;

  -- Hekimin kendi numarasıysa hekim adına; klinik hattıysa klinik adına.
  IF r.phone_source IN ('doctor_account', 'doctor') THEN
    v_role := 'doctor';
    SELECT p.id INTO v_rater
      FROM public.profiles p
     WHERE p.user_type = 'doctor' AND p.doctor_id = r.doctor_id AND coalesce(p.is_active, true)
     ORDER BY p.created_at
     LIMIT 1;
  ELSE
    v_role := 'clinic';
    v_rater := NULL;
  END IF;

  -- Uygulamadan verilmiş değerlendirme (source='app') ezilmez.
  INSERT INTO public.order_reviews (work_order_id, lab_id, overall, source, rater_role, rater_id, rater_doctor_id)
  VALUES (r.work_order_id, r.lab_id, p_score, 'whatsapp', v_role, v_rater, r.doctor_id)
  ON CONFLICT (work_order_id) DO UPDATE
     SET overall = EXCLUDED.overall, updated_at = now()
   WHERE order_reviews.source = 'whatsapp';

  UPDATE public.review_requests
     SET status = 'answered', answer = p_score, answered_at = now(),
         note_until = CASE WHEN p_score < 5 THEN now() + interval '24 hours' END,
         updated_at = now()
   WHERE id = r.id;

  -- Haber yalnız ilk cevapta ya da puan düştüğünde (3 → 1); iyileşmede (1 → 3) yok.
  IF r.answer IS NULL OR p_score < r.answer THEN
    v_alert := CASE p_score WHEN 1 THEN 'problem' WHEN 3 THEN 'minor' END;
  END IF;
  IF v_alert IS NOT NULL THEN
    BEGIN
      PERFORM public._review_alert_lab(r.id, v_alert);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'review_alert_lab %: %', r.id, SQLERRM;
    END;
  END IF;

  SELECT l.name INTO v_lab_name FROM public.labs l WHERE l.id = r.lab_id;
  RETURN jsonb_build_object('ok', true, 'score', p_score, 'lab_name', coalesce(v_lab_name, ''), 'alert', v_alert);
END; $function$;
REVOKE ALL ON FUNCTION public.review_wa_record_answer(uuid, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_wa_record_answer(uuid, integer, text, uuid) TO service_role;

-- trg_whatsapp_meta_notify: canlı tanım (before.txt, md5 cf620694c31b92e0ef21e1fcf8dcf18a)
CREATE OR REPLACE FUNCTION public.trg_whatsapp_meta_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_secret text; v_anon text; v_wa_ok boolean;
BEGIN
  IF NEW.category NOT IN ('new_order','delivery','approval','payment','account','review_problem') THEN RETURN NEW; END IF;
  -- Aşama/istasyon bildirimi → WhatsApp yok (uygulama içi + e-posta yeterli).
  IF NEW.payload ? 'stage_id' THEN RETURN NEW; END IF;
  IF NEW.category = 'payment' AND (NEW.payload ? 'reminder_id') THEN
    SELECT (payment_reminder_channels @> ARRAY['whatsapp']) INTO v_wa_ok FROM lab_settings WHERE lab_id = NEW.lab_id LIMIT 1;
    IF NOT COALESCE(v_wa_ok, false) THEN RETURN NEW; END IF;
  END IF;
  SELECT decrypted_secret INTO v_anon FROM vault.decrypted_secrets WHERE name='net_anon_key' LIMIT 1;
  BEGIN SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'notify_fn_secret' LIMIT 1; EXCEPTION WHEN OTHERS THEN v_secret := NULL; END;
  BEGIN
    PERFORM net.http_post(
      url := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/send-whatsapp-meta',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_anon,'apikey', v_anon,'x-notify-secret', COALESCE(v_secret,'')),
      body := jsonb_build_object('userIds', jsonb_build_array(NEW.user_id::text),'category', NEW.category,
        'resource_type', COALESCE(NEW.resource_type,''),'resource_id', COALESCE(NEW.resource_id::text,''),
        'payload', COALESCE(NEW.payload,'{}'::jsonb) || jsonb_build_object('__body', COALESCE(NEW.body,''), '__lab_id', COALESCE(NEW.lab_id::text,''))));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $function$;

DROP FUNCTION IF EXISTS public._trg_order_reviews_low();
DROP FUNCTION IF EXISTS public._review_low_evaluate(uuid);
DROP FUNCTION IF EXISTS public._review_low_alert(uuid, text);

COMMIT;
