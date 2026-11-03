-- 20261103100000_gunluk_takip_metni
-- Günlük iş takibi e-postası/bildirimi: başlık ve gövde metni daha doğal Türkçe.
--   • Başlık: 'Bugünün iş takibi' → 'Bugün takip edilecek işler'
--   • Gövde: "Bugün gözden geçirmen gereken birkaç iş var — …" yerine kısa, düz cümle;
--     tekil/çoğul ayrımı, gecikme günü yoksa gün kısmı hiç yazılmaz.
-- fn_daily_order_watch'ın geri kalanı canlı tanımla BİREBİR aynıdır (alıcılar, öğeler,
-- kanallar, cron dokunulmadı). Geri alma: rollbacks/20261103100000_gunluk_takip_metni.down.sql

CREATE OR REPLACE FUNCTION public._order_watch_body(p_overdue integer, p_hold integer, p_maxlate integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN COALESCE(p_overdue, 0) > 0 AND COALESCE(p_hold, 0) > 0 THEN
      p_overdue || ' sipariş gecikmiş'
      || CASE WHEN COALESCE(p_maxlate, 0) > 0 THEN
           CASE WHEN p_overdue = 1 THEN ' (' || p_maxlate || ' gün)'
                ELSE ' (en eskisi ' || p_maxlate || ' gün)' END
         ELSE '' END
      || ', ' || p_hold || ' sipariş de beklemede. Listesi aşağıda.'
    WHEN COALESCE(p_overdue, 0) > 0 THEN
      CASE
        WHEN p_overdue = 1 AND COALESCE(p_maxlate, 0) > 0 THEN
          '1 siparişin teslim tarihi ' || p_maxlate || ' gün önce geçti. Listesi aşağıda.'
        WHEN p_overdue = 1 THEN
          '1 siparişin teslim tarihi geçti. Listesi aşağıda.'
        WHEN COALESCE(p_maxlate, 0) > 0 THEN
          p_overdue || ' siparişin teslim tarihi geçti; en eskisi ' || p_maxlate || ' gün gecikmiş. Listesi aşağıda.'
        ELSE
          p_overdue || ' siparişin teslim tarihi geçti. Listesi aşağıda.'
      END
    ELSE
      'Bugün ' || COALESCE(p_hold, 0) || ' sipariş beklemede. '
      || CASE WHEN COALESCE(p_hold, 0) = 1 THEN 'Neyi beklediğini' ELSE 'Neyi beklediklerini' END
      || ' aşağıda görebilirsiniz.'
  END
$function$;

REVOKE ALL ON FUNCTION public._order_watch_body(integer, integer, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_daily_order_watch()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secret   text;
  v_lab      record;
  v_uid      uuid;
  v_utype    text;
  v_body     text;
  v_action   text;
  v_notif_id uuid;
  v_items    jsonb;
  v_maxlate  integer;
  v_sent     integer := 0;
  v_anon     text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqd2p4cWZkc3hreGdjZ29waGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODMwODYsImV4cCI6MjA5NDc1OTA4Nn0.JWYGFTRvepDfkfZlvSxqjOm5oEw6RfWwhoz070MBShU';
  v_base     text := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/';
  v_hdr      jsonb;
  v_fn       text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets WHERE name = 'notify_fn_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  v_hdr := jsonb_build_object(
    'Content-Type',    'application/json',
    'Authorization',   'Bearer ' || v_anon,
    'apikey',          v_anon,
    'x-notify-secret', COALESCE(v_secret, '')
  );

  FOR v_lab IN
    SELECT wo.lab_id,
           count(*) FILTER (WHERE wo.delivery_date < public.lab_today(wo.lab_id) AND wo.hold_status IS DISTINCT FROM 'on_hold') AS overdue_ct,
           count(*) FILTER (WHERE (wo.hold_status = 'on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova')) AS hold_ct
      FROM public.work_orders wo
     WHERE wo.lab_id IS NOT NULL
       AND wo.status NOT IN ('teslim_edildi', 'iptal') AND NOT COALESCE(wo.is_archived, false)
       AND (wo.delivery_date < public.lab_today(wo.lab_id) OR (wo.hold_status = 'on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova'))
     GROUP BY wo.lab_id
     HAVING count(*) FILTER (WHERE wo.delivery_date < public.lab_today(wo.lab_id) AND wo.hold_status IS DISTINCT FROM 'on_hold') > 0
         OR count(*) FILTER (WHERE (wo.hold_status = 'on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova')) > 0
  LOOP
    SELECT
      jsonb_agg(jsonb_build_object(
        'patient', COALESCE(NULLIF(trim(x.patient_name), ''), '—'),
        'clinic',  COALESCE(x.clinic_name, ''),
        'work',    COALESCE(x.work_type, ''),
        'kind',    x.kind,
        'tag',     x.tag,
        'note',    x.note
      ) ORDER BY x.sort_key),
      max(x.days_late) FILTER (WHERE x.kind = 'overdue')
    INTO v_items, v_maxlate
    FROM (
      SELECT wo.patient_name, wo.work_type, c.name AS clinic_name,
             (public.lab_today(wo.lab_id) - wo.delivery_date) AS days_late,
             CASE WHEN (wo.hold_status = 'on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova') THEN 'hold' ELSE 'overdue' END AS kind,
             CASE WHEN (wo.hold_status = 'on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova') THEN 'Beklemede'
                  ELSE (public.lab_today(wo.lab_id) - wo.delivery_date) || ' gün gecikti' END AS tag,
             CASE WHEN (wo.hold_status = 'on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova')
                  THEN COALESCE(NULLIF(trim(wo.hold_reason), ''),
                         CASE wo.hold_category WHEN 'material' THEN 'Malzeme / parça bekleniyor' ELSE 'Beklemede' END)
                  ELSE NULL END AS note,
             (CASE WHEN (wo.hold_status = 'on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova') THEN 1 ELSE 0 END) * 1000000 - (public.lab_today(wo.lab_id) - wo.delivery_date) AS sort_key
        FROM public.work_orders wo
        LEFT JOIN public.doctors d ON d.id = wo.doctor_id
        LEFT JOIN public.clinics c ON c.id = d.clinic_id
       WHERE wo.lab_id = v_lab.lab_id
         AND wo.status NOT IN ('teslim_edildi', 'iptal') AND NOT COALESCE(wo.is_archived, false)
         AND ((wo.delivery_date < public.lab_today(wo.lab_id) AND wo.hold_status IS DISTINCT FROM 'on_hold') OR (wo.hold_status = 'on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova'))
    ) x;

    -- 20261103100000: metin tek yardımcıda (_order_watch_body); tekil/çoğul ve gün kısmı orada.
    v_body := public._order_watch_body(v_lab.overdue_ct, v_lab.hold_ct, v_maxlate);

    FOR v_uid, v_utype IN
      SELECT p.id, p.user_type
        FROM public.profiles p
       WHERE p.lab_id = v_lab.lab_id
         AND (p.user_type = 'admin' OR (p.user_type = 'lab' AND p.role = 'manager'))
    LOOP
      IF EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = v_uid AND n.category = 'order_watch' AND n.created_at >= (public.lab_today(v_lab.lab_id)::timestamp AT TIME ZONE public.lab_tz(v_lab.lab_id))) THEN
        CONTINUE;
      END IF;

      v_action := CASE WHEN v_utype = 'admin' THEN '/(admin)' ELSE '/(lab)/orders' END;

      INSERT INTO public.notifications (user_id, lab_id, category, title, body, resource_type, action_url, payload)
      VALUES (v_uid, v_lab.lab_id, 'order_watch', 'Bugün takip edilecek işler', v_body, 'order_watch', v_action,
        jsonb_build_object('overdue', v_lab.overdue_ct, 'onHold', v_lab.hold_ct, 'items', COALESCE(v_items, '[]'::jsonb)))
      RETURNING id INTO v_notif_id;

      FOREACH v_fn IN ARRAY ARRAY['send-email-notification', 'send-expo-push', 'send-web-push', 'send-whatsapp-notification'] LOOP
        PERFORM net.http_post(
          url     := v_base || v_fn,
          headers := v_hdr,
          body    := jsonb_build_object(
            'userIds',        jsonb_build_array(v_uid::text),
            'category',       'order_watch',
            'notificationId', v_notif_id::text,
            'payload',        jsonb_build_object(
              'title', 'Bugün takip edilecek işler', 'body', v_body, 'actionUrl', v_action,
              'resourceType', 'order_watch', 'items', COALESCE(v_items, '[]'::jsonb)
            )
          )
        );
      END LOOP;

      v_sent := v_sent + 1;
    END LOOP;
  END LOOP;

  RETURN v_sent;
END;
$function$;
