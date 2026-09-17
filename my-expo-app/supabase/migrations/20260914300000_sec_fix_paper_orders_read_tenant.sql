-- =====================================================================
-- STAGE 02.8-EMERGENCY — H-1: paper-orders storage cross-tenant read leak.
--
-- ROOT CAUSE: the `paper-orders-read` SELECT policy on storage.objects allowed access when
-- `profiles.user_type = 'admin'` UNCONDITIONALLY (no lab-folder match). Since user_type='admin'
-- is a PER-LAB role (not only platform admin), a lab-scoped admin could read every lab's
-- paper-order objects (inbound order photos / patient-clinic PII). Live in prod (28 objects).
-- Proven: a Lab-A admin (is_platform_admin()=false) read a Lab-B paper-order object.
--
-- FIX: replace the unconditional user_type='admin' branch with is_platform_admin() (true
-- platform-admin bypass), keeping the lab-folder match for lab users. Mirrors the Stage-02.7
-- H-2 fix pattern (platform admin global; lab users bound to their own lab folder).
--
-- SCOPE: paper-orders has only this SELECT policy; INSERT/UPDATE/DELETE are deny-direct
-- (service-role writes via the inbound-paper-order edge). Only the read policy needs the fix.
--
-- INVARIANT: a paper-orders object is readable only by a platform admin or a member of the lab
-- whose id is the object's first path segment.
-- =====================================================================
BEGIN;

DROP POLICY IF EXISTS "paper-orders-read" ON storage.objects;
CREATE POLICY "paper-orders-read" ON storage.objects
  FOR SELECT
  TO public
  USING (
    bucket_id = 'paper-orders'
    AND (
      is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (p.lab_id)::text = (storage.foldername(objects.name))[1]
      )
    )
  );

COMMIT;
