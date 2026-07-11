-- ════════════════════════════════════════════════════════════════════════════
-- Support modülü için notifications entegrasyonu
--   • Yeni mesaj → karşı tarafa in-app bildirim
--   • Yeni ticket → tüm admin'lere bildirim
-- ════════════════════════════════════════════════════════════════════════════

-- Helper: kullanıcının full_name ve email'ini al
CREATE OR REPLACE FUNCTION public._support_user_label(p_user_id uuid)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(p.full_name, u.email, 'Kullanıcı')
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE u.id = p_user_id;
$$;

-- ─── Trigger: yeni mesaj → karşı tarafa bildirim ─────────────────────────
CREATE OR REPLACE FUNCTION public.support_msg_notify()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ticket    RECORD;
  v_sender    TEXT;
  v_preview   TEXT;
  v_action_url TEXT;
BEGIN
  -- İç notlar bildirim üretmez
  IF NEW.is_internal THEN RETURN NEW; END IF;

  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF v_ticket IS NULL THEN RETURN NEW; END IF;

  v_sender  := public._support_user_label(NEW.sender_id);
  v_preview := LEFT(NEW.body, 140);
  v_action_url := '/support';  -- panel agnostic — frontend route'a yönlendirir

  IF NEW.sender_role = 'user' THEN
    -- Tüm admin'lere bildirim (kendi gönderen hariç)
    INSERT INTO public.notifications
      (user_id, lab_id, category, title, body, resource_type, resource_id, action_url, payload)
    SELECT
      p.id,
      v_ticket.lab_id,
      'support_ticket',
      'Yeni destek mesajı · ' || COALESCE(v_ticket.subject, 'Talep'),
      v_sender || ': ' || v_preview,
      'support_ticket',
      v_ticket.id,
      v_action_url,
      jsonb_build_object(
        'ticket_id', v_ticket.id,
        'category',  v_ticket.category,
        'priority',  v_ticket.priority,
        'status',    v_ticket.status,
        'sender_name', v_sender
      )
    FROM public.profiles p
    WHERE p.user_type = 'admin'
      AND p.id <> NEW.sender_id;
  ELSE
    -- Support yanıtı → ticket sahibine bildirim
    INSERT INTO public.notifications
      (user_id, lab_id, category, title, body, resource_type, resource_id, action_url, payload)
    VALUES
      (v_ticket.user_id,
       v_ticket.lab_id,
       'support_ticket',
       'Destek ekibi yanıt verdi · ' || COALESCE(v_ticket.subject, 'Talep'),
       v_sender || ': ' || v_preview,
       'support_ticket',
       v_ticket.id,
       v_action_url,
       jsonb_build_object(
         'ticket_id', v_ticket.id,
         'category',  v_ticket.category,
         'priority',  v_ticket.priority,
         'status',    v_ticket.status,
         'sender_name', v_sender
       ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_msg_notify ON public.support_messages;
CREATE TRIGGER trg_support_msg_notify
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_msg_notify();

-- ─── Trigger: yeni ticket → admin'lere bildirim ──────────────────────────
CREATE OR REPLACE FUNCTION public.support_ticket_created_notify()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_label TEXT;
BEGIN
  v_user_label := public._support_user_label(NEW.user_id);

  INSERT INTO public.notifications
    (user_id, lab_id, category, title, body, resource_type, resource_id, action_url, payload)
  SELECT
    p.id,
    NEW.lab_id,
    'support_ticket',
    'Yeni destek talebi · ' || NEW.subject,
    v_user_label || ' yeni bir talep açtı · ' || COALESCE(NEW.priority, 'normal'),
    'support_ticket',
    NEW.id,
    '/support',
    jsonb_build_object(
      'ticket_id', NEW.id,
      'category',  NEW.category,
      'priority',  NEW.priority,
      'status',    NEW.status,
      'sender_name', v_user_label,
      'is_new_ticket', true
    )
  FROM public.profiles p
  WHERE p.user_type = 'admin'
    AND p.id <> NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_ticket_created_notify ON public.support_tickets;
CREATE TRIGGER trg_support_ticket_created_notify
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_created_notify();

COMMENT ON FUNCTION public.support_msg_notify() IS
  'Yeni destek mesajı geldiğinde karşı tarafa (user veya admin'lere) in-app bildirim üretir. İç not'lar bildirim üretmez.';
COMMENT ON FUNCTION public.support_ticket_created_notify() IS
  'Yeni destek talebi açıldığında tüm admin kullanıcılara bildirim gönderir.';
