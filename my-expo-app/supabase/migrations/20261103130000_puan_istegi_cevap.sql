-- 20261103130000_puan_istegi_cevap
-- WhatsApp'tan puan isteği (spec §5.2, §5.4, §5.5, §10) — cevap yolu, lab'a haber, ayar RPC'leri.
--   • review_wa_record_answer: düğme cevabını order_reviews'e yazar (uygulamadan verilmiş
--     değerlendirmeyi EZMEZ), isteği 'answered' yapar, puan düştüyse lab yöneticilerine haber verir.
--   • review_wa_add_note: cevaptan sonraki 24 saatte gelen serbest metni yoruma ekler.
--   • _review_alert_lab: "Sorun var" → review_problem (tüm kanallar), "Küçük düzeltme" → review_minor (uygulama içi).
--   • trg_whatsapp_meta_notify: yalnız kategori listesine 'review_problem' eklenir.
--   • get_/set_review_wa_settings: lab yöneticisinin ayar kartı.
-- Yalnız servis rolü (whatsapp-webhook) cevap yazabilir.
-- Geri alma: rollbacks/20261103130000_puan_istegi_cevap.down.sql

-- ── Lab'a haber ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._review_alert_lab(p_request uuid, p_kind text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record; u uuid; n integer := 0; v_label text; v_doc text; v_body text; v_payload jsonb; v_url text;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('problem', 'minor') THEN RETURN 0; END IF;
  SELECT rr.lab_id, rr.work_order_id, wo.order_number, wo.work_type, d.full_name AS doctor
    INTO r
    FROM public.review_requests rr
    JOIN public.work_orders wo ON wo.id = rr.work_order_id
    LEFT JOIN public.doctors d ON d.id = rr.doctor_id
   WHERE rr.id = p_request;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_label := public._review_work_type_label(r.work_type);
  v_doc := nullif(btrim(r.doctor), '');
  -- Gövde: <sipariş no> · <hekim adı> · <iş türü> (spec §10)
  v_body := concat_ws(' · ', r.order_number, v_doc, nullif(v_label, '—'));
  v_payload := jsonb_build_object('orderNumber', coalesce(r.order_number, ''),
                                  'doctor', coalesce(v_doc, 'Hekim'),
                                  'workType', v_label);
  v_url := '/order/' || r.work_order_id::text;

  FOR u IN
    SELECT p.id FROM public.profiles p
     WHERE p.lab_id = r.lab_id
       AND (p.user_type = 'admin' OR (p.user_type = 'lab' AND p.role = 'manager'))
       AND coalesce(p.is_active, true)
  LOOP
    IF p_kind = 'problem' THEN
      PERFORM public._notify_channels(u, 'review_problem', 'Hekim sorun bildirdi', v_body,
                                      'work_order', r.work_order_id, v_url, v_payload);
    ELSE
      PERFORM public.create_notification(u, 'review_minor', 'Hekim küçük düzeltme istedi', v_body,
                                         'work_order', r.work_order_id, v_url, v_payload);
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END; $function$;
REVOKE ALL ON FUNCTION public._review_alert_lab(uuid, text) FROM PUBLIC, anon, authenticated;

-- ── Düğme cevabı ───────────────────────────────────────────────────────────
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

-- ── Cevap sonrası serbest metin ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.review_wa_add_note(p_from text, p_lab uuid, p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.review_requests; v_text text := left(btrim(coalesce(p_text, '')), 1000);
BEGIN
  IF v_text = '' THEN RETURN jsonb_build_object('ok', false); END IF;
  SELECT * INTO r
    FROM public.review_requests
   WHERE phone_to = public._review_phone_tr(p_from) AND lab_id = p_lab AND note_until > now()
   ORDER BY answered_at DESC NULLS LAST
   LIMIT 1
   FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;

  UPDATE public.order_reviews
     SET comment = coalesce(comment || E'\n', '') || v_text, updated_at = now()
   WHERE work_order_id = r.work_order_id;
  UPDATE public.review_requests SET note_until = NULL, updated_at = now() WHERE id = r.id;
  RETURN jsonb_build_object('ok', true, 'work_order_id', r.work_order_id);
END; $function$;
REVOKE ALL ON FUNCTION public.review_wa_add_note(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_wa_add_note(text, uuid, text) TO service_role;

-- ── Ayar kartı ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_review_wa_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab uuid := public.get_my_lab_id(); v_en boolean; v_at timestamptz; v_days integer;
BEGIN
  IF v_lab IS NULL OR NOT (coalesce(public.my_user_type(), '') = 'admin' OR public.is_lab_manager()) THEN
    RAISE EXCEPTION 'Bu ayarı yalnız lab yöneticisi görebilir' USING ERRCODE = '42501';
  END IF;
  SELECT ls.review_wa_enabled, ls.review_wa_enabled_at, ls.review_wa_delay_days
    INTO v_en, v_at, v_days
    FROM public.lab_settings ls WHERE ls.lab_id = v_lab;
  RETURN jsonb_build_object(
    'enabled', coalesce(v_en, false),
    'enabled_at', v_at,
    'delay_days', coalesce(v_days, 3),
    'has_whatsapp', EXISTS (SELECT 1 FROM public.provider_credentials pc
                             WHERE pc.lab_id = v_lab AND pc.type = 'messaging'
                               AND pc.provider = 'whatsapp-cloud' AND pc.is_active));
END; $function$;
REVOKE ALL ON FUNCTION public.get_review_wa_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_review_wa_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_review_wa_settings(p_enabled boolean, p_delay_days integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab uuid := public.get_my_lab_id(); v_on boolean := coalesce(p_enabled, false);
BEGIN
  IF v_lab IS NULL OR NOT (coalesce(public.my_user_type(), '') = 'admin' OR public.is_lab_manager()) THEN
    RAISE EXCEPTION 'Bu ayarı yalnız lab yöneticisi değiştirebilir' USING ERRCODE = '42501';
  END IF;
  IF p_delay_days IS NULL OR p_delay_days NOT BETWEEN 1 AND 14 THEN
    RAISE EXCEPTION 'Gün sayısı 1 ile 14 arasında olmalı' USING ERRCODE = '22023';
  END IF;
  IF v_on AND NOT EXISTS (SELECT 1 FROM public.provider_credentials pc
                           WHERE pc.lab_id = v_lab AND pc.type = 'messaging'
                             AND pc.provider = 'whatsapp-cloud' AND pc.is_active) THEN
    RAISE EXCEPTION 'Önce WhatsApp bağlantısını kurun' USING ERRCODE = '22023';
  END IF;

  -- Açılış anı yalnız kapalıdan açığa geçişte yazılır; açılıştan önceki teslimlere gönderilmez.
  INSERT INTO public.lab_settings (lab_id, review_wa_enabled, review_wa_enabled_at, review_wa_delay_days)
  VALUES (v_lab, v_on, CASE WHEN v_on THEN now() END, p_delay_days)
  ON CONFLICT (lab_id) DO UPDATE
     SET review_wa_enabled = EXCLUDED.review_wa_enabled,
         review_wa_enabled_at = CASE WHEN NOT EXCLUDED.review_wa_enabled THEN NULL
                                     WHEN lab_settings.review_wa_enabled THEN coalesce(lab_settings.review_wa_enabled_at, now())
                                     ELSE now() END,
         review_wa_delay_days = EXCLUDED.review_wa_delay_days;
  RETURN public.get_review_wa_settings();
END; $function$;
REVOKE ALL ON FUNCTION public.set_review_wa_settings(boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_review_wa_settings(boolean, integer) TO authenticated;

-- ── Meta WhatsApp tetikleyicisi: yalnız 'review_problem' eklenir ───────────
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
