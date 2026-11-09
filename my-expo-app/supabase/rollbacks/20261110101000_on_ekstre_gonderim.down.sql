-- 20261110101000_on_ekstre_gonderim — geri alma. Yalnız bu migration'ın eklediği nesneleri kaldırır.
-- email_notifications tablosunun kendisine (sütun / RLS / ACL) dokunulmaz; yalnız eklenen tetikleyici düşer.
-- statement_link_sends kayıtları silinir (gönderim günlüğü); bağlantılar (statement_approval_links) kalır.
BEGIN;

DROP TRIGGER IF EXISTS trg_email_notifications_redact_link ON public.email_notifications;
DROP FUNCTION IF EXISTS public._email_notifications_redact_link();

DROP FUNCTION IF EXISTS public.request_pre_statement_approval(uuid, text[]);
DROP FUNCTION IF EXISTS public.get_statement_request_contacts(uuid);
DROP FUNCTION IF EXISTS public._ps_request_message(uuid, text, text);
DROP FUNCTION IF EXISTS public._ps_pending_text(uuid);
DROP FUNCTION IF EXISTS public._ps_recipient_contacts(uuid);
DROP FUNCTION IF EXISTS public._ps_pick_recipient(uuid);

DROP TABLE IF EXISTS public.statement_link_sends;

DROP FUNCTION IF EXISTS public._ps_link_base_url();

COMMIT;
