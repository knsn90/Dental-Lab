-- ════════════════════════════════════════════════════════════════════════════
-- Günlük iş takibi — geciken + duraklamada (beklemede) siparişler için
-- her gün 11:00 TR (08:00 UTC) admin & lab-manager'lara TÜM kanallardan bildirim.
--
-- Kanal dağıtımı client'ta (core/notifications/dispatch.ts) yaşıyor; cron
-- server-side olduğu için burada aynı fan-out'u pg_net ile yeniden kuruyoruz:
--   • in-app  → notifications tablosuna satır (feed)
--   • email / native push / web push / whatsapp → 4 kanal edge fn'ine net.http_post
-- Kişi-bazında tercih (notification_prefs) süzmesi zaten her kanal fn'inin içinde
-- yapılıyor; burada yalnız ALICI + İÇERİK hesaplanır, kanallar POST edilir.
--
-- İÇERİK: her lab için tek tek işler (hasta · klinik · iş · gün/durum) `items`
-- jsonb'sinde toplanır (e-posta bunu liste kartı olarak render eder) + samimi
-- özet metin (push/in-app/whatsapp + e-posta girişi).
--
-- Paylaşılan gizli Vault'tan ('notify_fn_secret') — değer bu dosyada YOK.
-- (bkz. 20260711120000_notify_dedup_shared_secret.sql)
--
-- "geciken"      = delivery_date < bugün AND status ∉ (teslim_edildi,iptal) AND hold_status ≠ on_hold
-- "duraklamada"  = hold_status = 'on_hold' AND status ∉ (teslim_edildi,iptal)
-- Klinik adı     = doctor_id → doctors.clinic_id → clinics.name
-- Alıcı          = user_type='admin' VEYA (user_type='lab' AND role='manager'), lab bazında
-- Anti-spam      : iki liste de boşsa lab atlanır; aynı gün ikinci kez çalışırsa
--                  aynı kullanıcıya tekrar order_watch bildirimi eklenmez (POST da atlanır).
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net;

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
           count(*) FILTER (
             WHERE wo.delivery_date < CURRENT_DATE
               AND wo.hold_status IS DISTINCT FROM 'on_hold'
           ) AS overdue_ct,
           count(*) FILTER (WHERE wo.hold_status = 'on_hold') AS hold_ct
      FROM public.work_orders wo
     WHERE wo.lab_id IS NOT NULL
       AND wo.status NOT IN ('teslim_edildi', 'iptal')
       AND (wo.delivery_date < CURRENT_DATE OR wo.hold_status = 'on_hold')
     GROUP BY wo.lab_id
     HAVING count(*) FILTER (
              WHERE wo.delivery_date < CURRENT_DATE
                AND wo.hold_status IS DISTINCT FROM 'on_hold'
            ) > 0
         OR count(*) FILTER (WHERE wo.hold_status = 'on_hold') > 0
  LOOP
    -- Tek tek işler (hasta · klinik · iş · durum) + en gecikmiş gün
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
             (CURRENT_DATE - wo.delivery_date) AS days_late,
             CASE WHEN wo.hold_status = 'on_hold' THEN 'hold' ELSE 'overdue' END AS kind,
             CASE WHEN wo.hold_status = 'on_hold' THEN 'Beklemede'
                  ELSE (CURRENT_DATE - wo.delivery_date) || ' gün gecikti' END AS tag,
             CASE WHEN wo.hold_status = 'on_hold'
                  THEN COALESCE(NULLIF(trim(wo.hold_reason), ''),
                         CASE wo.hold_category
                           WHEN 'material' THEN 'Malzeme / parça bekleniyor'
                           ELSE 'Beklemede' END)
                  ELSE NULL END AS note,
             (CASE WHEN wo.hold_status = 'on_hold' THEN 1 ELSE 0 END) * 1000000
               - (CURRENT_DATE - wo.delivery_date) AS sort_key
        FROM public.work_orders wo
        LEFT JOIN public.doctors d ON d.id = wo.doctor_id
        LEFT JOIN public.clinics c ON c.id = d.clinic_id
       WHERE wo.lab_id = v_lab.lab_id
         AND wo.status NOT IN ('teslim_edildi', 'iptal')
         AND ((wo.delivery_date < CURRENT_DATE AND wo.hold_status IS DISTINCT FROM 'on_hold')
              OR wo.hold_status = 'on_hold')
    ) x;

    -- Samimi, doğal özet metin (tüm kanallarda: e-posta girişi + push/in-app/whatsapp)
    IF v_lab.overdue_ct > 0 AND v_lab.hold_ct > 0 THEN
      v_body := 'Bugün gözden geçirmen gereken birkaç iş var — ' || v_lab.overdue_ct || ' tanesi gecikmiş'
        || CASE WHEN v_maxlate IS NOT NULL AND v_maxlate > 0 THEN ' (en fazla ' || v_maxlate || ' gün)' ELSE '' END
        || ', ' || v_lab.hold_ct || ' tanesi de beklemede. Hepsini aşağıya çıkardım.';
    ELSIF v_lab.overdue_ct > 0 THEN
      v_body := 'Bugün ' || v_lab.overdue_ct || ' sipariş gecikmiş durumda'
        || CASE WHEN v_maxlate IS NOT NULL AND v_maxlate > 0 THEN ' (en gecikmişi ' || v_maxlate || ' gün)' ELSE '' END
        || '. Aşağıda tek tek bulabilirsin:';
    ELSE
      v_body := 'Bugün ' || v_lab.hold_ct || ' sipariş beklemede. Neyi beklediklerini aşağıya çıkardım:';
    END IF;

    FOR v_uid, v_utype IN
      SELECT p.id, p.user_type
        FROM public.profiles p
       WHERE p.lab_id = v_lab.lab_id
         AND (p.user_type = 'admin' OR (p.user_type = 'lab' AND p.role = 'manager'))
    LOOP
      -- Aynı gün zaten gönderildiyse atla (manuel tekrar çalıştırmaya karşı)
      IF EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.user_id = v_uid
           AND n.category = 'order_watch'
           AND n.created_at >= CURRENT_DATE
      ) THEN
        CONTINUE;
      END IF;

      v_action := CASE WHEN v_utype = 'admin' THEN '/(admin)' ELSE '/(lab)/orders' END;

      -- in-app feed (items payload'da → ileride zengin in-app render için hazır)
      INSERT INTO public.notifications (
        user_id, lab_id, category, title, body, resource_type, action_url, payload
      ) VALUES (
        v_uid, v_lab.lab_id, 'order_watch', 'Bugünün iş takibi', v_body,
        'order_watch', v_action,
        jsonb_build_object('overdue', v_lab.overdue_ct, 'onHold', v_lab.hold_ct, 'items', COALESCE(v_items, '[]'::jsonb))
      )
      RETURNING id INTO v_notif_id;

      -- 4 kanala POST (kişi tercihi her fn'in içinde süzülür; e-posta items'ı liste kartı yapar)
      FOREACH v_fn IN ARRAY ARRAY[
        'send-email-notification', 'send-expo-push', 'send-web-push', 'send-whatsapp-notification'
      ] LOOP
        PERFORM net.http_post(
          url     := v_base || v_fn,
          headers := v_hdr,
          body    := jsonb_build_object(
            'userIds',        jsonb_build_array(v_uid::text),
            'category',       'order_watch',
            'notificationId', v_notif_id::text,
            'payload',        jsonb_build_object(
              'title',        'Bugünün iş takibi',
              'body',         v_body,
              'actionUrl',    v_action,
              'resourceType', 'order_watch',
              'items',        COALESCE(v_items, '[]'::jsonb)
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

-- ── Zamanlama: her gün 08:00 UTC = 11:00 TR ──
SELECT cron.unschedule('daily-order-watch')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-order-watch');

SELECT cron.schedule(
  'daily-order-watch',
  '0 8 * * *',
  $$ SELECT public.fn_daily_order_watch(); $$
);

NOTIFY pgrst, 'reload schema';
