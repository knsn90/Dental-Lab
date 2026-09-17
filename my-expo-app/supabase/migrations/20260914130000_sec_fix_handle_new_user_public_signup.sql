-- =====================================================================
-- STAGE 02.1-EMERGENCY — FIX CRITICAL public-signup tenant privilege escalation
--
-- VULNERABILITY (proven, sandbox): public.handle_new_user() (fired by the
-- on_auth_user_created AFTER INSERT trigger on auth.users) copied
-- user_type / lab_id / clinic_id / approval_status / is_active VERBATIM from
-- NEW.raw_user_meta_data. That metadata is set by the PUBLIC, UNAUTHENTICATED
-- supabase.auth.signUp({ data }) call → an attacker self-provisioned an
-- approved lab manager inside a VICTIM lab (get_my_lab_id() → victim; full
-- cross-tenant read + manager-gated payment writes).
--
-- SECURITY INVARIANT (enforced here):
--   Untrusted public signup metadata CANNOT create authorized tenant
--   membership, approval, or privileged authorization.
--   Tenant/approval assignment happens ONLY through the authenticated,
--   server-derived paths: create_lab_tenant (requires caller already
--   user_type='lab' AND role='manager'; creates a NEW lab), admin-create-user
--   (clinicInCallerLab gate), clinic_accept_invite / lab_approve_clinic.
--
-- FIX (trust boundary): in handle_new_user, NEVER derive the following from
-- metadata — use safe server defaults instead:
--   lab_id        -> NULL      (legit lab assigned later by authorized flow)
--   clinic_id     -> NULL      (legit clinic assigned later by authorized flow)
--   approval_status -> 'pending'  (approved later by authorized flow)
--   is_active     -> lab=TRUE / clinic-side=FALSE (matches the app model;
--                    NOT taken from metadata). Not an authz gate on its own —
--                    the real gates are lab_id (NULL) + approval ('pending').
--   user_type     -> constrained to the public-registerable set; never 'admin'
--   role          -> existing whitelist; HARMLESS without a lab_id (forced NULL)
--                    and REQUIRED for the legit lab-owner flow (create_lab_tenant
--                    demands role='manager'), so it is preserved, not dropped.
--
-- Legit public flows (modules/auth/api.ts signUpDoctor/Clinic/LabUser) pass ONLY
-- user_type/role/full_name/clinic_name/phone in metadata and set approval/active
-- via AUTHENTICATED follow-up updates — so forcing the fields above does not
-- break them. SECURITY DEFINER + search_path preserved. Idempotent.
-- =====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_type TEXT;
  v_role      TEXT;
BEGIN
  -- user_type: only self-registerable public types; anything else (incl. 'admin',
  -- 'platform', garbage) collapses to the safe default 'doctor'.
  v_user_type := COALESCE(NEW.raw_user_meta_data->>'user_type', 'doctor');
  IF v_user_type NOT IN ('doctor','clinic_admin','clinic_secretary','lab') THEN
    v_user_type := 'doctor';
  END IF;

  -- role: whitelist (unchanged set); NULL otherwise. Inert here because lab_id is
  -- forced NULL below — a privileged role has no tenant to act on. Preserved so the
  -- legitimate lab-owner registration (role='manager') can later call create_lab_tenant.
  v_role := NULLIF(NEW.raw_user_meta_data->>'role', '');
  IF v_role NOT IN ('manager','technician','accounting','courier','service','receptionist','intern') THEN
    v_role := NULL;
  END IF;

  INSERT INTO profiles (
    id, user_type, full_name, clinic_name, clinic_id,
    role, phone, is_active, approval_status, lab_id, email
  )
  VALUES (
    NEW.id,
    v_user_type,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'clinic_name',
    NULL,                               -- clinic_id: NEVER from public metadata
    v_role,
    NEW.raw_user_meta_data->>'phone',
    (v_user_type = 'lab'),              -- is_active: lab TRUE, clinic-side FALSE; NEVER from metadata
    'pending',                          -- approval_status: NEVER from public metadata
    NULL,                               -- lab_id: NEVER from public metadata
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

COMMIT;
