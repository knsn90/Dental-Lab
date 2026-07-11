-- ════════════════════════════════════════════════════════════════════════════
-- Support Modülü — Destek talebi (ticket) sistemi
--   • support_tickets   : Ana talep kaydı
--   • support_messages  : Talep içi mesaj/yanıt thread'i
--   • RLS              : Kullanıcı kendi talebini görür, admin (teknik ekip) hepsini
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Ticket'lar ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lab_id          uuid REFERENCES public.labs(id) ON DELETE SET NULL,
  subject         text NOT NULL,
  category        text NOT NULL DEFAULT 'genel'
                  CHECK (category IN (
                    'genel', 'hata', 'ozellik', 'fatura',
                    'entegrasyon', 'egitim', 'guvenlik', 'diger'
                  )),
  priority        text NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('dusuk', 'normal', 'yuksek', 'acil')),
  status          text NOT NULL DEFAULT 'acik'
                  CHECK (status IN ('acik', 'beklemede', 'cozuldu', 'kapali')),
  assignee_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- support staff
  resolved_at     timestamptz,
  closed_at       timestamptz,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  unread_for_user  boolean NOT NULL DEFAULT false,  -- admin yanıtladıysa user için yeni
  unread_for_admin boolean NOT NULL DEFAULT true,   -- yeni ticket admin için okunmamış
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user
  ON public.support_tickets (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_priority
  ON public.support_tickets (status, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_admin_unread
  ON public.support_tickets (last_message_at DESC)
  WHERE unread_for_admin = true;

-- ── 2. Ticket içi mesajlar ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_role text NOT NULL DEFAULT 'user'
              CHECK (sender_role IN ('user', 'support')),
  body        text NOT NULL CHECK (length(body) > 0),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{ url, name, size }]
  is_internal boolean NOT NULL DEFAULT false,       -- support staff için iç not (user görmez)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket
  ON public.support_messages (ticket_id, created_at);

-- ── 3. Trigger: yeni mesaj geldiğinde ticket güncelle ──────────────────────
CREATE OR REPLACE FUNCTION public.support_msg_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_user_msg BOOLEAN;
BEGIN
  -- Kim gönderdi? Profil user_type'a göre.
  v_is_user_msg := NEW.sender_role = 'user';

  UPDATE public.support_tickets
     SET last_message_at   = NEW.created_at,
         updated_at        = NEW.created_at,
         -- User mesajı → admin için unread; Admin mesajı → user için unread
         unread_for_admin  = CASE WHEN v_is_user_msg     THEN true  ELSE unread_for_admin END,
         unread_for_user   = CASE WHEN NOT v_is_user_msg AND NOT NEW.is_internal THEN true ELSE unread_for_user END,
         -- Açık ticket'a yeni mesaj → 'beklemede' veya 'acik' tutarsız bırakma
         status            = CASE
                                WHEN status = 'cozuldu' AND v_is_user_msg THEN 'acik'  -- user re-open
                                WHEN status = 'kapali'  AND v_is_user_msg THEN 'acik'
                                ELSE status
                              END
   WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_msg_after_insert ON public.support_messages;
CREATE TRIGGER trg_support_msg_after_insert
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_msg_after_insert();

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.support_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Helper: user admin mi?
-- (my_user_type() helper'ı önceki migration'da var — kullan)

-- TICKETS: user kendi talebini görür, admin hepsini
DROP POLICY IF EXISTS support_tickets_select  ON public.support_tickets;
CREATE POLICY support_tickets_select ON public.support_tickets
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

DROP POLICY IF EXISTS support_tickets_insert  ON public.support_tickets;
CREATE POLICY support_tickets_insert ON public.support_tickets
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS support_tickets_update  ON public.support_tickets;
CREATE POLICY support_tickets_update ON public.support_tickets
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

-- MESSAGES: ticket'ın görülebileceği kişiler okuyabilir
DROP POLICY IF EXISTS support_messages_select ON public.support_messages;
CREATE POLICY support_messages_select ON public.support_messages
  FOR SELECT USING (
    -- Internal not'ları user görmez
    (NOT is_internal OR EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.user_type = 'admin'
    ))
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
       WHERE t.id = ticket_id
         AND (
           t.user_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM public.profiles p
              WHERE p.id = auth.uid() AND p.user_type = 'admin'
           )
         )
    )
  );

DROP POLICY IF EXISTS support_messages_insert ON public.support_messages;
CREATE POLICY support_messages_insert ON public.support_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
       WHERE t.id = ticket_id
         AND (
           t.user_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM public.profiles p
              WHERE p.id = auth.uid() AND p.user_type = 'admin'
           )
         )
    )
    -- Internal not sadece admin yazabilir
    AND (NOT is_internal OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.user_type = 'admin'
    ))
  );

COMMENT ON TABLE public.support_tickets IS 'Kullanıcı destek talepleri (ticket) — teknik ekibe sorun/talep bildirimi.';
COMMENT ON TABLE public.support_messages IS 'Ticket içi mesajlaşma thread''i — kullanıcı ↔ destek ekibi.';
