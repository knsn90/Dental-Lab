-- Geri alma: 20261103140000_puan_istegi_yeniden_deneme
-- Canlı önceki durum: rollbacks/20261103140000_puan_istegi_yeniden_deneme.before.txt
-- İki fonksiyon 20261103120000'deki tanımına döner; attempts sütunu düşer.

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

ALTER TABLE public.review_requests DROP COLUMN IF EXISTS attempts;
