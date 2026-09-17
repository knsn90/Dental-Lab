-- =====================================================================
-- STAGE 02.7-EMERGENCY — H-1: cross-tenant outbound-message approval + M-1: media-burst.
--
-- H-1 ROOT CAUSE: approve_message / reject_message / approve_all_pending_messages are
-- SECURITY DEFINER (bypass order_messages RLS), EXECUTE to authenticated+anon, and check
-- ROLE only — the UPDATE has no tenant filter. Proven: a Lab-A manager approved a Lab-B
-- pending order_message. FIX: bind the UPDATE to the caller's lab
-- (is_platform_admin() OR lab_id = get_my_lab_id()); revoke anon EXECUTE.
--
-- M-1 ROOT CAUSE: wa_media_burst_flush/bump take a caller-supplied p_lab with no ownership
-- check and are anon-callable → cross-tenant whatsapp_sessions counter manipulation. FIX:
-- an authenticated caller's p_lab must equal get_my_lab_id() (auth.uid() NULL = trusted
-- webhook/service); revoke anon EXECUTE.
--
-- INVARIANT: a message's approval state may be changed only by a manager/admin of the
-- message's own lab (or platform admin); the media-burst counter of a lab may be changed
-- only by that lab's own context or a trusted server.
-- =====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.approve_message(p_message_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_type TEXT; v_role TEXT; v_n INT;
BEGIN
  SELECT user_type, role INTO v_user_type, v_role FROM profiles WHERE id = auth.uid();
  IF v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role = 'manager') THEN
    UPDATE order_messages
       SET approval_status = 'approved', approved_by = auth.uid(), approved_at = NOW()
     WHERE id = p_message_id
       AND approval_status = 'pending'
       AND (is_platform_admin() OR lab_id = get_my_lab_id());   -- 02.7 tenant bind
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'mesaj bulunamadı veya bu iş emrine erişiminiz yok' USING errcode = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Only managers and admins can approve messages';
  END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.reject_message(p_message_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_type TEXT; v_role TEXT; v_n INT;
BEGIN
  SELECT user_type, role INTO v_user_type, v_role FROM profiles WHERE id = auth.uid();
  IF v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role = 'manager') THEN
    UPDATE order_messages
       SET approval_status = 'rejected', approved_by = auth.uid(), approved_at = NOW()
     WHERE id = p_message_id
       AND approval_status = 'pending'
       AND (is_platform_admin() OR lab_id = get_my_lab_id());   -- 02.7 tenant bind
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'mesaj bulunamadı veya bu iş emrine erişiminiz yok' USING errcode = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Only managers and admins can reject messages';
  END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.approve_all_pending_messages(p_work_order_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_type TEXT; v_role TEXT; v_count INT;
BEGIN
  SELECT user_type, role INTO v_user_type, v_role FROM profiles WHERE id = auth.uid();
  IF v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role = 'manager') THEN
    UPDATE order_messages
       SET approval_status = 'approved', approved_by = auth.uid(), approved_at = NOW()
     WHERE work_order_id = p_work_order_id
       AND approval_status = 'pending'
       AND (is_platform_admin() OR lab_id = get_my_lab_id());   -- 02.7 tenant bind
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
  ELSE
    RAISE EXCEPTION 'Only managers and admins can approve messages';
  END IF;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.approve_message(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_message(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_message(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_message(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_all_pending_messages(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_all_pending_messages(uuid) FROM PUBLIC;

-- M-1: media-burst counter — bind caller-supplied p_lab to the caller's lab (trusted service when auth.uid() NULL).
CREATE OR REPLACE FUNCTION public.wa_media_burst_flush(p_lab uuid, p_phone text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_old integer;
begin
  IF auth.uid() IS NOT NULL AND NOT (is_platform_admin() OR p_lab = get_my_lab_id()) THEN
    RAISE EXCEPTION 'yetkisiz' USING errcode = '42501';
  END IF;
  select coalesce((context->>'media_burst')::int, 0) into v_old
    from whatsapp_sessions where lab_id = p_lab and sender_phone = p_phone for update;
  update whatsapp_sessions
     set context = jsonb_set(coalesce(context,'{}'::jsonb), '{media_burst}', to_jsonb(0), true)
   where lab_id = p_lab and sender_phone = p_phone;
  return coalesce(v_old, 0);
end $function$;

CREATE OR REPLACE FUNCTION public.wa_media_burst_bump(p_lab uuid, p_phone text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_new integer;
begin
  IF auth.uid() IS NOT NULL AND NOT (is_platform_admin() OR p_lab = get_my_lab_id()) THEN
    RAISE EXCEPTION 'yetkisiz' USING errcode = '42501';
  END IF;
  update whatsapp_sessions
     set context = jsonb_set(coalesce(context,'{}'::jsonb),'{media_burst}',
           to_jsonb(coalesce((context->>'media_burst')::int,0)+1), true),
         updated_at = now()
   where lab_id = p_lab and sender_phone = p_phone
   returning (context->>'media_burst')::int into v_new;
  return coalesce(v_new, 0);
end $function$;

REVOKE EXECUTE ON FUNCTION public.wa_media_burst_flush(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.wa_media_burst_flush(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wa_media_burst_bump(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.wa_media_burst_bump(uuid, text) FROM PUBLIC;

COMMIT;
