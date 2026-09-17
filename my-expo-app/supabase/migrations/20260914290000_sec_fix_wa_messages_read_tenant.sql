-- =====================================================================
-- STAGE 02.7-EMERGENCY — H-2: cross-tenant WhatsApp message read (conversation/PII leak).
--
-- ROOT CAUSE: whatsapp_messages' only policy (PERMISSIVE SELECT wa_messages_lab_read) has
-- an UNCONDITIONAL user_type='admin' branch (no lab match), and the table has NO RESTRICTIVE
-- tenant_guard (unlike whatsapp_sessions). Since user_type='admin' is a PER-LAB role, a
-- lab-scoped admin could read every lab's whatsapp_messages. Proven: a Lab-A admin
-- (is_platform_admin()=false) read a Lab-B message.
--
-- FIX: add a RESTRICTIVE tenant_guard mirroring whatsapp_sessions — every access must be
-- platform admin OR the row's own lab. RESTRICTIVE intersects with the existing PERMISSIVE
-- policy, so the admin escape-hatch branch can no longer cross tenants; legitimate own-lab
-- reads are unaffected (they satisfy both).
--
-- INVARIANT: whatsapp_messages rows are visible only within their own lab (or to a platform admin).
-- =====================================================================
BEGIN;

DROP POLICY IF EXISTS tenant_guard ON public.whatsapp_messages;
CREATE POLICY tenant_guard ON public.whatsapp_messages
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (is_platform_admin() OR (get_my_lab_id() IS NOT NULL AND lab_id = get_my_lab_id()))
  WITH CHECK (is_platform_admin() OR (get_my_lab_id() IS NOT NULL AND lab_id = get_my_lab_id()));

COMMIT;
