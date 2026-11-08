-- 20261109100000_on_ekstre_sema.down.sql — önceki canlı duruma döner (.before.txt ile birebir).
-- Yeni RPC'ler, not/itiraz tabloları ve lab_settings.invoice_approval_enabled düşer.
-- UYARI: down, uygulama sonrası yazılmış not/itiraz satırlarını ve ayar değerlerini SİLER (tanımla birlikte veri gider).
-- lab_settings politikaları ve ACL'si migration'da değişmediği için dokunulmaz.
BEGIN;
SET LOCAL lock_timeout = '3s';

DROP FUNCTION IF EXISTS public.resolve_statement_dispute(uuid);
DROP FUNCTION IF EXISTS public.add_statement_note(uuid, text);
DROP FUNCTION IF EXISTS public.get_pre_statement(uuid);

DROP TABLE IF EXISTS public.statement_item_notes;
DROP TABLE IF EXISTS public.statement_item_disputes;

DROP FUNCTION IF EXISTS public._ps_can_see_item(uuid, uuid);
DROP FUNCTION IF EXISTS public._ps_item_order_mine(uuid);
DROP FUNCTION IF EXISTS public._ps_full_scope(uuid);
DROP FUNCTION IF EXISTS public._ps_actor(uuid);

ALTER TABLE public.lab_settings DROP COLUMN IF EXISTS invoice_approval_enabled;

COMMIT;
