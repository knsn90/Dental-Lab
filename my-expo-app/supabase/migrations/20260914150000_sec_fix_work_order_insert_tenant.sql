-- =====================================================================
-- STAGE 02.2-EMERGENCY — C-3: cross-tenant work_order INSERT via forged lab_id.
--
-- ROOT CAUSE: the doctor / clinic_admin INSERT policies verify the doctor identity but NOT
-- that the chosen lab_id is a lab the caller is authorized for; `auto_set_lab_id` only fills
-- lab_id when NULL, so an attacker-supplied non-NULL lab_id (a victim lab) survives → a doctor
-- (or clinic_admin) injects a work_order into ANY lab's queue.
--
-- FIX: require the target lab_id to be a lab the caller legitimately belongs to, mirroring
-- `my_lab_memberships()` (an active/pending clinic↔lab membership by member_profile_id OR the
-- caller's clinic). NULL lab_id is still permitted (an order with no tenant is not a cross-tenant
-- attack and legitimate drafts may fill lab later). Lab/admin creators are unchanged (already
-- tenant-safe via wo_lab_insert `lab_id = get_my_lab_id()`).
--
-- INVARIANT: an unauthenticated/relationship-less caller cannot create a work_order inside a
-- lab they have no membership with.
-- =====================================================================
BEGIN;

-- helper: is p_lab a lab the current caller (doctor / clinic user) is a member of?
CREATE OR REPLACE FUNCTION public._caller_belongs_to_lab(p_lab uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM clinic_lab_memberships m
    WHERE m.lab_id = p_lab
      AND m.status IN ('active','pending')
      AND ( m.member_profile_id = auth.uid()
            OR m.member_clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()) )
  );
$function$;

-- Doctor create: keep identity check, ADD lab-membership requirement.
DROP POLICY IF EXISTS "Doctors can create orders" ON public.work_orders;
CREATE POLICY "Doctors can create orders" ON public.work_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    my_user_type() = 'doctor'
    AND doctor_owns_order_doctor(doctor_id)
    AND (lab_id IS NULL OR public._caller_belongs_to_lab(lab_id))
  );

-- Clinic_admin create: keep clinic↔doctor check, ADD lab-membership requirement.
DROP POLICY IF EXISTS clinic_admin_insert_clinic_orders ON public.work_orders;
CREATE POLICY clinic_admin_insert_clinic_orders ON public.work_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    is_clinic_admin() AND my_clinic_id() IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM profiles p_doc WHERE p_doc.id = work_orders.doctor_id AND p_doc.clinic_id = my_clinic_id())
      OR EXISTS (SELECT 1 FROM doctors d_doc WHERE d_doc.id = work_orders.doctor_id AND d_doc.clinic_id = my_clinic_id())
    )
    AND (lab_id IS NULL OR public._caller_belongs_to_lab(lab_id))
  );

COMMIT;
