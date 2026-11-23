-- ============================================================
-- my_clinic_doctors: clinic owner (clinic_admin) also counts as a dentist
-- ============================================================
-- Problem (2026-11-23, Dt. Can Vurgun / Dentamasya): in a single-dentist
-- practice the account owner is user_type='clinic_admin'. The view only
-- returned 'doctor' profiles and doctors rows, so the clinic-panel new-order
-- dentist list was empty, while the "add new dentist" form rejected the same
-- person as "already registered, pick from the list". Dead end.
-- 10 active clinic_admin accounts were in the same state.
--
-- The client (modules/clinic/api.ts fetchMyClinicDoctors, commit 8e24141)
-- already merges admins in; this migration makes the view itself the
-- source of truth. The client dedupes by id, so it works with this
-- migration applied and without it.
--
-- Changes (columns and order UNCHANGED, so CREATE OR REPLACE is safe):
--   1) A new branch: the clinic's clinic_admin profiles, source='clinic_admin'.
--   2) In the doctors-table branch, rows with the same name as a clinic_admin
--      profile are hidden too (the first order creates a doctors row for the
--      admin; without this they would appear twice).
-- The base definition was taken from the live pg_get_viewdef (2026-11-23).
-- security_invoker=on is kept → profiles/doctors RLS still applies.
-- ============================================================

CREATE OR REPLACE VIEW public.my_clinic_doctors
WITH (security_invoker = on) AS
 SELECT p.id,
    p.full_name,
    p.phone,
    p.avatar_url,
    p.is_active,
    p.clinic_id,
    c.name AS clinic_name,
    'profile'::text AS source
   FROM profiles p
     LEFT JOIN clinics c ON c.id = p.clinic_id
  WHERE p.user_type = 'doctor'::text AND p.clinic_id IS NOT NULL AND p.clinic_id = my_clinic_id()
UNION ALL
 SELECT p.id,
    p.full_name,
    p.phone,
    p.avatar_url,
    p.is_active,
    p.clinic_id,
    c.name AS clinic_name,
    'clinic_admin'::text AS source
   FROM profiles p
     LEFT JOIN clinics c ON c.id = p.clinic_id
  WHERE p.user_type = 'clinic_admin'::text AND p.clinic_id IS NOT NULL AND p.clinic_id = my_clinic_id()
    -- If a 'doctor' profile with the same name already exists in the clinic, do not list the person twice
    AND NOT (EXISTS ( SELECT 1
           FROM profiles p3
          WHERE p3.user_type = 'doctor'::text AND lower(TRIM(BOTH FROM p3.full_name)) = lower(TRIM(BOTH FROM p.full_name)) AND p3.clinic_id = p.clinic_id))
UNION ALL
 SELECT d.id,
    d.full_name,
    d.phone,
    NULL::text AS avatar_url,
    d.is_active,
    d.clinic_id,
    c.name AS clinic_name,
    'doctors'::text AS source
   FROM doctors d
     LEFT JOIN clinics c ON c.id = d.clinic_id
  WHERE d.clinic_id IS NOT NULL AND d.clinic_id = my_clinic_id() AND NOT (EXISTS ( SELECT 1
           FROM profiles p2
          WHERE p2.user_type = ANY (ARRAY['doctor'::text, 'clinic_admin'::text]) AND lower(TRIM(BOTH FROM p2.full_name)) = lower(TRIM(BOTH FROM d.full_name)) AND p2.clinic_id = d.clinic_id));

-- Grants are kept by CREATE OR REPLACE; repeated defensively.
GRANT SELECT ON public.my_clinic_doctors TO authenticated;
