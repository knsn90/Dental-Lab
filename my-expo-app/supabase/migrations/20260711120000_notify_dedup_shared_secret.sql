-- ============================================================
-- 20260711 — _notify_dedup: send-email-notification çağrısına paylaşılan gizli
--
-- Bildirim edge function'ları artık çağıran doğrulaması yapıyor (K5).
-- DB trigger yolu anon key ile çağırıyordu (anon key public → yetki sayılmaz).
-- Fonksiyon artık Vault'taki 'notify_fn_secret' değerini x-notify-secret
-- header'ıyla gönderir; edge fn aynı değeri NOTIFY_FN_SECRET env'inden doğrular.
--
-- Gizli değerin KENDİSİ bu dosyada YOKTUR — canlıda Vault'a ayrıca yazılır:
--   select vault.create_secret('<değer>', 'notify_fn_secret');
-- ve edge tarafında: supabase secrets set NOTIFY_FN_SECRET=<değer>
--
-- Secret henüz yokken davranış değişmez (boş header + mevcut anon Bearer korunur).
-- Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION public._notify_dedup(p_user_id uuid, p_category text, p_title text, p_body text, p_resource_type text, p_resource_id uuid, p_action_url text, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing uuid;
  v_lab_id   uuid;
  v_id       uuid;
  v_secret   text;
BEGIN
  -- Aynı user'a aynı resource için son 30sn içinde benzer bildirim var mı?
  SELECT id INTO v_existing
    FROM public.notifications
   WHERE user_id = p_user_id
     AND category = p_category
     AND resource_id IS NOT DISTINCT FROM p_resource_id
     AND title = p_title
     AND created_at > now() - interval '30 seconds'
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT lab_id INTO v_lab_id FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.notifications (
    user_id, lab_id, category, title, body,
    resource_type, resource_id, action_url, payload
  ) VALUES (
    p_user_id, v_lab_id, p_category, p_title, p_body,
    p_resource_type, p_resource_id, p_action_url, COALESCE(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  -- Paylaşılan gizli — Vault'tan (fonksiyon SECURITY DEFINER, gövdede değer yok)
  BEGIN
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets WHERE name = 'notify_fn_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  -- Email: pg_net async HTTP — trigger'ı bloke etmez.
  -- notification_prefs filtresi (channels.email, categories[cat].email) edge fn içinde.
  PERFORM net.http_post(
    url     := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/send-email-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqd2p4cWZkc3hreGdjZ29waGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODMwODYsImV4cCI6MjA5NDc1OTA4Nn0.JWYGFTRvepDfkfZlvSxqjOm5oEw6RfWwhoz070MBShU',
      'x-notify-secret', COALESCE(v_secret, '')
    ),
    body := jsonb_build_object(
      'userIds',  jsonb_build_array(p_user_id::text),
      'category', p_category,
      'payload',  jsonb_build_object(
        'title',        p_title,
        'body',         COALESCE(p_body, ''),
        'actionUrl',    COALESCE(p_action_url, ''),
        'resourceType', COALESCE(p_resource_type, ''),
        'resourceId',   COALESCE(p_resource_id::text, '')
      )
    )
  );

  RETURN v_id;
END;
$function$;
