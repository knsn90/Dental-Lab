-- 20261103120000_puan_istegi_gorev
-- WhatsApp'tan puan isteği (spec §5.1, §5.3, §5.4, §5.6) — teslimde istek satırı ve saatlik görev.
--   • notify_order_delivered: teslime geçişte review_requests satırı yazar (due_on = lab günü + N).
--     Eski "İşinizi değerlendirin" çağrısı kalkar: doctor_id artık doctors.id olduğu için
--     koşulu hiç tutmuyordu (120 günde sıfır bildirim). Hata teslimi ASLA engellemez.
--   • fn_review_request_tick (saatlik, cron 'review-request-tick'):
--       housekeeping → uygulama içi istek (due_on gününde, WhatsApp ayarından bağımsız)
--       → WhatsApp uygunluğu + günde 1 / numara sınırı + Pzt–Cmt 10–18 penceresi
--       → _review_dispatch (send-review-request edge fonksiyonu).
--   Lab ayarı (review_wa_enabled) kapalıyken WhatsApp'a hiçbir şey gitmez.
-- Geri alma: rollbacks/20261103120000_puan_istegi_gorev.down.sql

-- ── Telefon normalleştirme (send-whatsapp-meta normalizePhoneTR ile aynı kural) ──
CREATE OR REPLACE FUNCTION public._review_phone_tr(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
           WHEN d = '' THEN NULL
           WHEN left(d, 2) = '90' AND length(d) = 12 THEN d
           WHEN left(d, 1) = '0' AND length(d) = 11 THEN '90' || substr(d, 2)
           WHEN left(d, 1) = '5' AND length(d) = 10 THEN '90' || d
           ELSE d
         END
    FROM (SELECT regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') AS d) x;
$function$;
REVOKE ALL ON FUNCTION public._review_phone_tr(text) FROM PUBLIC, anon, authenticated;

-- ── İş türü etiketi: virgüllü parçalar tekilleşir, 60 karakterde kesilir ─────
CREATE OR REPLACE FUNCTION public._review_work_type_label(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
           WHEN s IS NULL OR s = '' THEN '—'
           WHEN length(s) > 60 THEN left(s, 60) || '…'
           ELSE s
         END
    FROM (SELECT string_agg(t, ', ' ORDER BY o) AS s
            FROM (SELECT btrim(x) AS t, min(ord) AS o
                    FROM unnest(string_to_array(coalesce(p, ''), ',')) WITH ORDINALITY AS u(x, ord)
                   WHERE btrim(x) <> ''
                   GROUP BY btrim(x)) parts) agg;
$function$;
REVOKE ALL ON FUNCTION public._review_work_type_label(text) FROM PUBLIC, anon, authenticated;

-- ── Alıcı numarası: hekim önce (spec §5.1) ─────────────────────────────────
--   1 hesaplı hekimin profiles.whatsapp_phone · 2 doctors.phone
--   3 clinics.whatsapp_phone · 4 clinics.phone
CREATE OR REPLACE FUNCTION public._review_pick_phone(p_doctor uuid)
 RETURNS TABLE(phone text, source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.phone, c.source
    FROM (
      SELECT public._review_phone_tr(p.whatsapp_phone) AS phone, 'doctor_account'::text AS source, 1 AS ord
        FROM public.profiles p
       WHERE p_doctor IS NOT NULL AND p.user_type = 'doctor' AND p.doctor_id = p_doctor
         AND coalesce(p.is_active, true)
      UNION ALL
      SELECT public._review_phone_tr(d.phone), 'doctor', 2
        FROM public.doctors d WHERE d.id = p_doctor
      UNION ALL
      SELECT public._review_phone_tr(cl.whatsapp_phone), 'clinic_whatsapp', 3
        FROM public.doctors d JOIN public.clinics cl ON cl.id = d.clinic_id WHERE d.id = p_doctor
      UNION ALL
      SELECT public._review_phone_tr(cl.phone), 'clinic_phone', 4
        FROM public.doctors d JOIN public.clinics cl ON cl.id = d.clinic_id WHERE d.id = p_doctor
    ) c
   WHERE c.phone IS NOT NULL AND length(c.phone) BETWEEN 10 AND 15
   ORDER BY c.ord
   LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public._review_pick_phone(uuid) FROM PUBLIC, anon, authenticated;

-- ── Teslimde istek satırı ──────────────────────────────────────────────────
-- Teslim anı: aynı UPDATE'te yazılan delivered_at; yoksa tetikleyicinin anı. Teslim RPC'leri
-- delivered_at'i coalesce ile yazar ve geri alma onu temizlemez — yeniden teslimde eski tarih
-- kalır, o yüzden değişmeyen delivered_at'e bakılmaz.
CREATE OR REPLACE FUNCTION public.notify_order_delivered()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_at timestamptz; v_delay integer; v_doc uuid;
BEGIN
  IF NEW.status = 'teslim_edildi' AND COALESCE(OLD.status::text, '') <> 'teslim_edildi'
     AND NEW.lab_id IS NOT NULL THEN
    BEGIN
      v_at := CASE WHEN NEW.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
                   THEN NEW.delivered_at ELSE now() END;
      SELECT ls.review_wa_delay_days INTO v_delay FROM public.lab_settings ls WHERE ls.lab_id = NEW.lab_id;
      -- doctor_id doctors.id'dir; eski satırlarda profil kimliği olabilir → profilin hekim kaydı
      v_doc := (SELECT x.id FROM (
                  SELECT d.id, 1 AS o FROM public.doctors d WHERE d.id = NEW.doctor_id
                  UNION ALL
                  SELECT p.doctor_id, 2 FROM public.profiles p
                   WHERE p.id = NEW.doctor_id AND p.doctor_id IS NOT NULL) x
                ORDER BY x.o LIMIT 1);
      INSERT INTO public.review_requests (work_order_id, lab_id, doctor_id, delivered_at, due_on)
      VALUES (NEW.id, NEW.lab_id, v_doc, v_at, public.lab_today(NEW.lab_id, v_at) + coalesce(v_delay, 3))
      ON CONFLICT (work_order_id) DO UPDATE
         SET lab_id = EXCLUDED.lab_id, doctor_id = EXCLUDED.doctor_id,
             delivered_at = EXCLUDED.delivered_at, due_on = EXCLUDED.due_on,
             status = 'queued', skip_reason = NULL, app_notified_at = NULL,
             phone_to = NULL, phone_source = NULL, updated_at = now()
       WHERE review_requests.status IN ('queued', 'skipped') AND review_requests.sent_at IS NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'review_request: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END; $function$;

-- ── Bakım: artık uygun olmayan / süresi dolan / takılan satırlar ───────────
CREATE OR REPLACE FUNCTION public._review_requests_housekeeping(p_now timestamptz DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.review_requests rr
     SET status = 'skipped', skip_reason = 'not_delivered', updated_at = p_now
    FROM public.work_orders wo
   WHERE wo.id = rr.work_order_id AND rr.status = 'queued' AND wo.status <> 'teslim_edildi';

  UPDATE public.review_requests rr
     SET status = 'skipped', skip_reason = 'reviewed', updated_at = p_now
   WHERE rr.status = 'queued'
     AND EXISTS (SELECT 1 FROM public.order_reviews r WHERE r.work_order_id = rr.work_order_id);

  UPDATE public.review_requests
     SET status = 'expired', updated_at = p_now
   WHERE status = 'sent' AND sent_at < p_now - interval '7 days';

  UPDATE public.review_requests
     SET status = 'failed', error = 'timeout', updated_at = p_now
   WHERE status = 'sending' AND claimed_at < p_now - interval '1 hour';
END; $function$;
REVOKE ALL ON FUNCTION public._review_requests_housekeeping(timestamptz) FROM PUBLIC, anon, authenticated;

-- ── Uygulama içi istek: due_on gününde hekim/klinik hesaplarına ───────────
CREATE OR REPLACE FUNCTION public._review_requests_notify_app(p_now timestamptz DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record; u uuid; n integer := 0; v_body text; v_label text;
BEGIN
  FOR r IN
    SELECT rr.id, rr.work_order_id, rr.lab_id, wo.patient_name, wo.order_number, wo.work_type
      FROM public.review_requests rr
      JOIN public.work_orders wo ON wo.id = rr.work_order_id
     WHERE rr.app_notified_at IS NULL
       AND wo.status = 'teslim_edildi'
       AND rr.due_on <= public.lab_today(rr.lab_id, p_now)
       AND rr.due_on >= public.lab_today(rr.lab_id, p_now) - 7
       AND NOT EXISTS (SELECT 1 FROM public.order_reviews o WHERE o.work_order_id = rr.work_order_id)
  LOOP
    BEGIN
      v_label := public._review_work_type_label(r.work_type);
      v_body := coalesce(nullif(btrim(r.patient_name), ''), r.order_number)
                || CASE WHEN v_label = '—' THEN '' ELSE ' · ' || v_label END;
      FOR u IN SELECT public._order_client_recipients(r.work_order_id) LOOP
        PERFORM public.create_notification(u, 'review_request', 'İşinizi değerlendirin', v_body,
                  'work_order', r.work_order_id, '/order/' || r.work_order_id::text,
                  jsonb_build_object('lab_id', r.lab_id));
        n := n + 1;
      END LOOP;
      UPDATE public.review_requests SET app_notified_at = p_now, updated_at = p_now WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'review_request notify_app %: %', r.id, SQLERRM;
    END;
  END LOOP;
  RETURN n;
END; $function$;
REVOKE ALL ON FUNCTION public._review_requests_notify_app(timestamptz) FROM PUBLIC, anon, authenticated;

-- ── WhatsApp: uygunluk kararı + sıklık sınırı + pencere → sahiplenme ───────
CREATE OR REPLACE FUNCTION public._review_requests_claim(p_now timestamptz DEFAULT now())
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record; v_reason text; v_phone text; v_src text;
BEGIN
  -- 1) due_on günü gelmiş kuyruk satırları için karar
  UPDATE public.review_requests rr
     SET status = 'skipped', skip_reason = 'stale', updated_at = p_now
   WHERE rr.status = 'queued' AND public.lab_today(rr.lab_id, p_now) > rr.due_on + 7;

  FOR r IN
    SELECT rr.id, rr.lab_id, rr.doctor_id, rr.delivered_at,
           coalesce(ls.review_wa_enabled, false) AS en, ls.review_wa_enabled_at AS en_at,
           coalesce(d.review_wa_opt_out, false) AS opt
      FROM public.review_requests rr
      LEFT JOIN public.lab_settings ls ON ls.lab_id = rr.lab_id
      LEFT JOIN public.doctors d ON d.id = rr.doctor_id
     WHERE rr.status = 'queued' AND rr.due_on <= public.lab_today(rr.lab_id, p_now)
  LOOP
    v_phone := NULL; v_src := NULL;
    v_reason := CASE
      WHEN NOT r.en OR r.en_at IS NULL THEN 'wa_off'
      WHEN r.delivered_at < r.en_at THEN 'before_enabled'
      WHEN r.opt THEN 'opted_out'
      WHEN NOT EXISTS (SELECT 1 FROM public.provider_credentials pc
                        WHERE pc.lab_id = r.lab_id AND pc.type = 'messaging'
                          AND pc.provider = 'whatsapp-cloud' AND pc.is_active) THEN 'no_wa_cred'
      ELSE NULL END;
    IF v_reason IS NULL THEN
      SELECT pp.phone, pp.source INTO v_phone, v_src FROM public._review_pick_phone(r.doctor_id) pp;
      IF v_phone IS NULL THEN v_reason := 'no_phone'; END IF;
    END IF;
    IF v_reason IS NOT NULL THEN
      UPDATE public.review_requests
         SET status = 'skipped', skip_reason = v_reason, phone_to = NULL, phone_source = NULL, updated_at = p_now
       WHERE id = r.id;
    ELSE
      UPDATE public.review_requests
         SET phone_to = v_phone, phone_source = v_src, updated_at = p_now
       WHERE id = r.id;
    END IF;
  END LOOP;

  -- 2) Pencere içindeki lab'larda, numara başına en eski teslim; o gün o numaraya
  --    (hangi lab'dan olursa olsun) istek çıktıysa numara atlanır.
  RETURN QUERY
  WITH cand AS (
    SELECT rr.id, rr.phone_to, rr.delivered_at
      FROM public.review_requests rr
     WHERE rr.status = 'queued' AND rr.phone_to IS NOT NULL
       AND rr.due_on <= public.lab_today(rr.lab_id, p_now)
       AND extract(isodow FROM (p_now AT TIME ZONE public.lab_tz(rr.lab_id))) BETWEEN 1 AND 6
       AND (p_now AT TIME ZONE public.lab_tz(rr.lab_id))::time >= time '10:00'
       AND (p_now AT TIME ZONE public.lab_tz(rr.lab_id))::time <  time '18:00'
       AND NOT EXISTS (
         SELECT 1 FROM public.review_requests o
          WHERE o.phone_to = rr.phone_to AND o.id <> rr.id
            AND coalesce(o.sent_at, o.claimed_at) IS NOT NULL
            AND public.lab_today(rr.lab_id, coalesce(o.sent_at, o.claimed_at)) = public.lab_today(rr.lab_id, p_now))
  ), pick AS (
    SELECT DISTINCT ON (c.phone_to) c.id FROM cand c ORDER BY c.phone_to, c.delivered_at, c.id
  ), upd AS (
    UPDATE public.review_requests rr
       SET status = 'sending', claimed_at = p_now, updated_at = p_now
      FROM pick
     WHERE rr.id = pick.id AND rr.status = 'queued'
    RETURNING rr.id
  )
  SELECT upd.id FROM upd;
END; $function$;
REVOKE ALL ON FUNCTION public._review_requests_claim(timestamptz) FROM PUBLIC, anon, authenticated;

-- ── Tek gönderici: send-review-request edge fonksiyonu ─────────────────────
CREATE OR REPLACE FUNCTION public._review_dispatch(p_request uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqd2p4cWZkc3hreGdjZ29waGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODMwODYsImV4cCI6MjA5NDc1OTA4Nn0.JWYGFTRvepDfkfZlvSxqjOm5oEw6RfWwhoz070MBShU';
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'notify_fn_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_secret := NULL; END;
  PERFORM net.http_post(
    url := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/send-review-request',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon,
                                  'apikey', v_anon, 'x-notify-secret', coalesce(v_secret, '')),
    body := jsonb_build_object('requestId', p_request::text));
END; $function$;
REVOKE ALL ON FUNCTION public._review_dispatch(uuid) FROM PUBLIC, anon, authenticated;

-- ── Saatlik görev ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_review_request_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid; n integer := 0;
BEGIN
  PERFORM public._review_requests_housekeeping(now());
  PERFORM public._review_requests_notify_app(now());
  FOR v_id IN SELECT public._review_requests_claim(now()) LOOP
    PERFORM public._review_dispatch(v_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END; $function$;
REVOKE ALL ON FUNCTION public.fn_review_request_tick() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN PERFORM cron.unschedule('review-request-tick'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('review-request-tick', '7 * * * *', 'SELECT public.fn_review_request_tick()');
