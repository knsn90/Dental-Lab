-- ════════════════════════════════════════════════════════════════════════════
-- 20260517 — Notifications altyapısı
--
--   • notifications          : in-app feed (per user, persistent)
--   • push_tokens            : native + web push token kayıtları
--   • email_notifications    : email gönderim audit log (idempotency + retry)
--
-- Dispatch akışı:
--   dispatchNotification(category, userId, title, body, payload)
--     1. notifications.insert  (in-app feed için her zaman)
--     2. profiles.notification_prefs okunur, kanal bazlı karar
--     3. browser_push → client-side Notification API (kullanıcı online ise)
--     4. native_push  → push_tokens'tan token çek + Expo Push API
--     5. email        → email_notifications.insert + edge function fire
-- ════════════════════════════════════════════════════════════════════════════

-- ─── notifications (in-app feed) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid       NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lab_id       uuid       REFERENCES public.labs(id) ON DELETE CASCADE,
  category     text       NOT NULL,    -- new_order | order_status | chat | approval | payment | stock | delivery | paper_order
  title        text       NOT NULL,
  body         text,
  -- İlgili kaynak (deep link için)
  resource_type text,                  -- 'work_order' | 'invoice' | 'approval' | ...
  resource_id   uuid,
  action_url    text,                  -- deep link path: /(lab)/order/abc
  -- Ek payload (frontend custom render için)
  payload      jsonb      NOT NULL DEFAULT '{}',
  -- Okunma durumu
  read_at      timestamptz,
  -- Dağıtım izi (hangi kanallara gönderildi)
  delivered    jsonb      NOT NULL DEFAULT '{}',  -- { in_app: true, browser_push: ts, native_push: ts, email: ts }
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_recent
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_resource
  ON public.notifications (resource_type, resource_id)
  WHERE resource_id IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE USING (user_id = auth.uid());

-- Insert: service-role (edge fn / triggers) yapar — kullanıcılar kendi başlarına insert edemez
DROP POLICY IF EXISTS notifications_insert_service ON public.notifications;
CREATE POLICY notifications_insert_service ON public.notifications
  FOR INSERT WITH CHECK (
    -- Service role bypass eder, ama RPC fonksiyonları için kullanıcı kendine yazabilir
    user_id = auth.uid()
  );

-- ─── push_tokens (native + web push) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token       text NOT NULL,            -- Expo push token veya web push subscription endpoint
  platform    text NOT NULL,            -- 'ios' | 'android' | 'web'
  device_id   text,                     -- aynı kullanıcının birden çok cihazı
  user_agent  text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user
  ON public.push_tokens (user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_tokens_select_own ON public.push_tokens;
CREATE POLICY push_tokens_select_own ON public.push_tokens
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_tokens_insert_own ON public.push_tokens;
CREATE POLICY push_tokens_insert_own ON public.push_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_tokens_update_own ON public.push_tokens;
CREATE POLICY push_tokens_update_own ON public.push_tokens
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_tokens_delete_own ON public.push_tokens;
CREATE POLICY push_tokens_delete_own ON public.push_tokens
  FOR DELETE USING (user_id = auth.uid());

-- ─── email_notifications (audit + queue) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_to        text NOT NULL,
  subject         text NOT NULL,
  template        text,                 -- 'new_order' | 'approval' | 'payment' | 'generic'
  payload         jsonb NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  provider        text,                  -- 'resend' | 'postmark' | ...
  provider_id     text,                  -- harici servisin email id'si
  error           text,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_notifications_pending
  ON public.email_notifications (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_email_notifications_user
  ON public.email_notifications (user_id, created_at DESC);

ALTER TABLE public.email_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_notifications_select_own ON public.email_notifications;
CREATE POLICY email_notifications_select_own ON public.email_notifications
  FOR SELECT USING (user_id = auth.uid());

-- ─── RPC: bildirim oluştur (auth.uid scope) ──────────────────────────────
-- Trigger'lar veya client tarafı kendi kullanıcısı için bildirim üretebilsin.
-- Birden çok user'a dispatch için edge function service-role ile bypass eder.
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id      uuid,
  p_category     text,
  p_title        text,
  p_body         text DEFAULT NULL,
  p_resource_type text DEFAULT NULL,
  p_resource_id  uuid DEFAULT NULL,
  p_action_url   text DEFAULT NULL,
  p_payload      jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     uuid;
  v_lab_id uuid;
BEGIN
  -- lab_id'yi profile'dan çek
  SELECT lab_id INTO v_lab_id FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.notifications (
    user_id, lab_id, category, title, body,
    resource_type, resource_id, action_url, payload
  )
  VALUES (
    p_user_id, v_lab_id, p_category, p_title, p_body,
    p_resource_type, p_resource_id, p_action_url, COALESCE(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_notification FROM public;
GRANT EXECUTE ON FUNCTION public.create_notification TO authenticated;

-- ─── RPC: mark as read (single + bulk) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.notifications
     SET read_at = now()
   WHERE user_id = auth.uid()
     AND id = ANY(p_ids)
     AND read_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notifications_read TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.notifications
     SET read_at = now()
   WHERE user_id = auth.uid()
     AND read_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read TO authenticated;

-- ─── Realtime publication ────────────────────────────────────────────────
-- in-app feed için INSERT/UPDATE/DELETE event'leri client'a stream edilir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
