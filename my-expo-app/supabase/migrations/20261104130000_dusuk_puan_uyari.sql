-- 20261104130000_dusuk_puan_uyari
-- Değerlendirmeler ekranı ve düşük puan takibi (spec 2026-11-04 §5) — uyarı tek yoldan.
--   • _review_low_alert: lab yöneticilerine düşük puan / "Sorun var" / hatırlatma bildirimi.
--   • _review_low_evaluate: etkin en düşük puanı takip satırına işler; gerekiyorsa uyarır (idempotent).
--   • trg_order_reviews_low: her değerlendirme değişiminde değerlendiriciyi çağırır, kaydı asla engellemez.
--   • review_wa_record_answer: eski _review_alert_lab yerine değerlendirici (WhatsApp cevabı birleşti).
--   • trg_whatsapp_meta_notify: review_low / review_low_reminder de WhatsApp'a gider.
-- Geri alma: rollbacks/20261104130000_dusuk_puan_uyari.down.sql

-- ── Uyarı: lab yöneticisi kümesine bildirim ────────────────────────────────
-- Gövde ve payload'da hasta adı ve hekim yorumu YOK (spec §5.5).
CREATE OR REPLACE FUNCTION public._review_low_alert(p_work_order uuid, p_category text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record; u record; n integer := 0;
  v_label text; v_doc text; v_clinic text; v_place text; v_scores text;
  v_title text; v_body text; v_payload jsonb;
BEGIN
  IF p_category IS NULL OR p_category NOT IN ('review_low', 'review_problem', 'review_low_reminder') THEN
    RETURN 0;
  END IF;
  SELECT wo.lab_id, wo.order_number, wo.work_type, d.full_name AS doctor, c.name AS clinic
    INTO r
    FROM public.work_orders wo
    LEFT JOIN public.doctors d ON d.id = wo.doctor_id
    LEFT JOIN public.clinics c ON c.id = d.clinic_id
   WHERE wo.id = p_work_order;
  IF NOT FOUND OR r.lab_id IS NULL THEN RETURN 0; END IF;

  v_label  := public._review_work_type_label(r.work_type);
  v_doc    := nullif(btrim(r.doctor), '');
  v_clinic := nullif(btrim(r.clinic), '');
  v_place  := coalesce(v_clinic, v_doc, 'Hekim');          -- kliniği yoksa hekimin adı
  v_scores := public._review_low_scores_text(p_work_order);

  IF p_category = 'review_low_reminder' THEN
    v_title := 'Düşük puan 2 gündür aranmadı';
    v_body  := concat_ws(' · ', r.order_number, v_place, v_scores);
  ELSE
    v_title := CASE p_category WHEN 'review_problem' THEN 'Hekim sorun bildirdi' ELSE 'Düşük puan' END;
    -- Kliniği olmayan hekimde ad iki kez yazılmasın.
    v_body  := concat_ws(' · ', r.order_number, v_clinic, v_doc, nullif(v_label, '—'), v_scores);
  END IF;
  v_payload := jsonb_build_object('orderNumber', coalesce(r.order_number, ''),
                                  'clinic', v_place,
                                  'doctor', coalesce(v_doc, 'Hekim'),
                                  'workType', v_label,
                                  'scores', coalesce(v_scores, ''));

  FOR u IN
    SELECT p.id, p.user_type FROM public.profiles p
     WHERE p.lab_id = r.lab_id
       AND coalesce(p.is_active, true)
       AND (p.user_type = 'admin' OR (p.user_type = 'lab' AND p.role = 'manager'))
  LOOP
    -- Bir alıcıdaki hata diğerlerini engellemez.
    BEGIN
      IF p_category = 'review_problem' THEN
        PERFORM public._notify_channels(u.id, p_category, v_title, v_body, 'review_followup', p_work_order,
                                        public._review_low_url(u.user_type, p_work_order), v_payload);
      ELSE
        PERFORM public._notify_inapp_push(u.id, p_category, v_title, v_body, 'review_followup', p_work_order,
                                          public._review_low_url(u.user_type, p_work_order), v_payload);
      END IF;
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '_review_low_alert % %: %', p_work_order, u.id, SQLERRM;
    END;
  END LOOP;
  RETURN n;
END; $function$;
REVOKE ALL ON FUNCTION public._review_low_alert(uuid, text) FROM PUBLIC, anon, authenticated;

-- ── Değerlendirici ─────────────────────────────────────────────────────────
-- Dönüş: alerted | unchanged | cleared | none. Aynı durumda tekrar çağrılırsa yeni bildirim gitmez.
CREATE OR REPLACE FUNCTION public._review_low_evaluate(p_work_order uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_min smallint; v_lab uuid; f public.review_followups; v_open boolean; v_cat text;
BEGIN
  IF p_work_order IS NULL THEN RETURN 'none'; END IF;
  v_min := public._review_low_min(p_work_order);

  IF v_min IS NOT NULL AND v_min <= 3 THEN
    SELECT wo.lab_id INTO v_lab FROM public.work_orders wo WHERE wo.id = p_work_order;
    IF v_lab IS NULL THEN RETURN 'none'; END IF;
    INSERT INTO public.review_followups (work_order_id, lab_id) VALUES (p_work_order, v_lab)
    ON CONFLICT (work_order_id) DO NOTHING;
  END IF;

  SELECT * INTO f FROM public.review_followups WHERE work_order_id = p_work_order FOR UPDATE;
  IF NOT FOUND THEN RETURN 'none'; END IF;

  -- Düşük değil (ya da değerlendirme silindi): uyarı durumu sıfırlanır, arama kaydı kalır.
  IF v_min IS NULL OR v_min > 3 THEN
    UPDATE public.review_followups
       SET cur_min = v_min, alert_min = NULL, updated_at = now()
     WHERE work_order_id = p_work_order;
    RETURN CASE WHEN f.alert_min IS NOT NULL THEN 'cleared' ELSE 'unchanged' END;
  END IF;

  -- Düşük ama daha önce uyarılandan kötü değil: yalnız güncel puan.
  IF f.alert_min IS NOT NULL AND v_min >= f.alert_min THEN
    UPDATE public.review_followups SET cur_min = v_min, updated_at = now()
     WHERE work_order_id = p_work_order;
    RETURN 'unchanged';
  END IF;

  -- Uyarı. İş açıksa ("Aranmadı") dönem değişmez; değilse yeni dönem başlar.
  v_open := coalesce(f.cur_min <= 3 AND (f.called_at IS NULL OR f.called_at < f.period_started_at), false);
  UPDATE public.review_followups
     SET cur_min           = v_min,
         alert_min         = v_min,
         first_alert_at    = coalesce(first_alert_at, now()),
         last_alert_at     = now(),
         period_started_at = CASE WHEN v_open THEN period_started_at ELSE now() END,
         reminder_sent_at  = CASE WHEN v_open THEN reminder_sent_at ELSE NULL END,
         updated_at        = now()
   WHERE work_order_id = p_work_order;

  -- WhatsApp "Sorun var" (1) cevabı bu işlemde geldiyse review_problem.
  v_cat := CASE WHEN current_setting('siman.review_wa_answer', true) = '1' THEN 'review_problem' ELSE 'review_low' END;
  PERFORM public._review_low_alert(p_work_order, v_cat);
  RETURN 'alerted';
END; $function$;
REVOKE ALL ON FUNCTION public._review_low_evaluate(uuid) FROM PUBLIC, anon, authenticated;

-- ── Tetikleyici: puan değişince değerlendir ────────────────────────────────
CREATE OR REPLACE FUNCTION public._trg_order_reviews_low()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_wo uuid;
BEGIN
  v_wo := CASE WHEN TG_OP = 'DELETE' THEN OLD.work_order_id ELSE NEW.work_order_id END;
  BEGIN
    PERFORM public._review_low_evaluate(v_wo);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_trg_order_reviews_low %: %', v_wo, SQLERRM;
  END;
  RETURN NULL;
END; $function$;
REVOKE ALL ON FUNCTION public._trg_order_reviews_low() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_reviews_low ON public.order_reviews;
CREATE TRIGGER trg_order_reviews_low
  AFTER INSERT OR DELETE OR UPDATE OF overall, fit, occlusion, contacts, esthetics, surface, on_time
  ON public.order_reviews
  FOR EACH ROW EXECUTE FUNCTION public._trg_order_reviews_low();

-- ── review_wa_record_answer: canlı tanım (before.txt) + iki değişiklik ─────
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
  -- Düşük puan değerlendiricisi "Sorun var"ı (1) review_problem kategorisiyle duyurur (20261104130000).
  PERFORM set_config('siman.review_wa_answer', p_score::text, true);
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
  -- Lab'a haber artık tek yoldan: düşük puan değerlendiricisi (uyarı, dönem, iyileşme).
  -- Uygulama değerlendirmesi ezilmediğinde tetikleyici çalışmaz; bu yüzden burada her zaman çağrılır.
  BEGIN
    PERFORM public._review_low_evaluate(r.work_order_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'review_low_evaluate %: %', r.work_order_id, SQLERRM;
  END;

  SELECT l.name INTO v_lab_name FROM public.labs l WHERE l.id = r.lab_id;
  RETURN jsonb_build_object('ok', true, 'score', p_score, 'lab_name', coalesce(v_lab_name, ''), 'alert', v_alert);
END; $function$;
REVOKE ALL ON FUNCTION public.review_wa_record_answer(uuid, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_wa_record_answer(uuid, integer, text, uuid) TO service_role;

-- ── trg_whatsapp_meta_notify: canlı tanım (before.txt) + iki kategori ──────
CREATE OR REPLACE FUNCTION public.trg_whatsapp_meta_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_secret text; v_anon text; v_wa_ok boolean;
BEGIN
  IF NEW.category NOT IN ('new_order','delivery','approval','payment','account','review_problem','review_low','review_low_reminder') THEN RETURN NEW; END IF;
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
