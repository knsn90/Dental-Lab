-- ════════════════════════════════════════════════════════════════════════════
-- whatsapp_notifications — WhatsApp (Twilio) gönderim audit log.
--
--   send-whatsapp-notification edge function bu tabloya pending → sent/failed
--   yazar. email_notifications ile birebir aynı desen (idempotency + retry +
--   kullanıcı kendi kayıtlarını okuyabilir).
--
--   Kanal akışı (dispatch.ts):
--     dispatchNotification(...)
--       → notifications.insert (in-app)
--       → send-web-push / send-expo-push / send-email-notification
--       → send-whatsapp-notification (YENİ)  → Twilio Messages API
--
--   Pref kontrolü: profiles.notification_prefs.categories[cat].whatsapp == true
--   Alıcı numarası: profiles.whatsapp_phone (E.164, örn. +905551112233)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.whatsapp_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone_to        text NOT NULL,         -- E.164 (whatsapp: öneki edge fn'de eklenir)
  category        text,                  -- new_order | order_status | payment | approval | ...
  template        text,                  -- Twilio Content SID veya 'freeform'
  payload         jsonb NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'pending',  -- pending | sent | failed | skipped
  provider        text DEFAULT 'twilio',
  provider_id     text,                  -- Twilio Message SID (SMxxxx)
  error           text,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_pending
  ON public.whatsapp_notifications (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_user
  ON public.whatsapp_notifications (user_id, created_at DESC);

ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

-- Kullanıcı yalnız kendi WhatsApp gönderim kayıtlarını görebilir.
-- Insert/update edge function (service role) ile yapılır → RLS bypass.
DROP POLICY IF EXISTS whatsapp_notifications_select_own ON public.whatsapp_notifications;
CREATE POLICY whatsapp_notifications_select_own ON public.whatsapp_notifications
  FOR SELECT USING (user_id = auth.uid());
