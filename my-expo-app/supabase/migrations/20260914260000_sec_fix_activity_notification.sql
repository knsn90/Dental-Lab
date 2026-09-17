-- =====================================================================
-- STAGE 02.5-EMERGENCY — H-2: log_activity audit forgery · M-1: create_notification injection.
--
-- H-2 ROOT CAUSE: log_activity trusted caller-supplied p_actor_id / p_lab_id and was anon-callable
-- → any (even unauthenticated) caller could forge activity_logs rows attributing arbitrary actions
-- to any user/lab (proven with anon). FIX: an authenticated caller's actor and lab are derived
-- SERVER-SIDE (auth.uid() + that profile's lab); p_actor_id/p_lab_id are honored ONLY in a trusted
-- context (auth.uid() IS NULL: triggers / service_role / cron). REVOKE anon EXECUTE.
--   Preserves: the one legit client caller (relies on auth.uid()) and all trigger/service logging.
--
-- M-1 ROOT CAUSE: create_notification had no authorization and was client-EXECUTE-able → a user
-- could inject notifications into any user's feed cross-tenant (proven). It has NO direct client
-- caller; it is invoked only by server-side SECURITY DEFINER _notify_* helpers. FIX: REVOKE EXECUTE
-- from anon + authenticated + PUBLIC. Internal SECDEF callers run as definer (postgres) and are
-- unaffected. Body unchanged.
--
-- INVARIANT: activity_logs actor/lab reflect the real authenticated caller (unforgeable); a
-- notification can be created only by a trusted server path, never directly by a client.
-- =====================================================================
BEGIN;

-- H-2: log_activity — server-derive actor/lab for authenticated callers.
CREATE OR REPLACE FUNCTION public.log_activity(p_action text, p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_entity_label text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb, p_lab_id uuid DEFAULT NULL::uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_authed uuid := auth.uid();
  v_actor  uuid;
  v_name text; v_ut text; v_role text; v_plab uuid; v_id uuid;
BEGIN
  IF p_action IS NULL OR btrim(p_action) = '' THEN RETURN NULL; END IF;

  -- Authenticated caller: actor is ALWAYS the JWT subject (cannot be forged).
  -- Trusted server context (auth.uid() IS NULL: triggers / service_role / cron): may name the actor.
  IF v_authed IS NOT NULL THEN
    v_actor := v_authed;
  ELSE
    v_actor := p_actor_id;
  END IF;

  SELECT full_name, user_type, role, lab_id INTO v_name, v_ut, v_role, v_plab
    FROM public.profiles WHERE id = v_actor;

  INSERT INTO public.activity_logs
    (actor_id, actor_name, actor_type, action, entity_type, entity_id, entity_label, metadata, lab_id)
  VALUES (v_actor, COALESCE(NULLIF(v_name,''),'Sistem'),
     public._log_actor_type(v_ut, v_role),
     p_action, p_entity_type, p_entity_id, p_entity_label, p_metadata,
     -- authenticated: lab is derived from the actor's own profile (p_lab_id ignored);
     -- trusted context: honor p_lab_id, else the actor's profile lab.
     CASE WHEN v_authed IS NOT NULL THEN v_plab ELSE COALESCE(p_lab_id, v_plab) END)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.log_activity(text,text,uuid,text,jsonb,uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_activity(text,text,uuid,text,jsonb,uuid,uuid) FROM PUBLIC;
-- authenticated keeps EXECUTE (identity now server-derived); service_role/postgres unaffected.

-- M-1: create_notification — internal-only (no client caller). Revoke client EXECUTE.
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid,text,text,text,text,uuid,text,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid,text,text,text,text,uuid,text,jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid,text,text,text,text,uuid,text,jsonb) FROM PUBLIC;
-- internal _notify_* SECURITY DEFINER callers run as definer (postgres) → unaffected.

COMMIT;
