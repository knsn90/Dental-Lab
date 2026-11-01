-- Geri alma: 20261025164000 — field_staff_scope kuralları düşer, iki yardımcı önceki tanımına döner.

drop policy if exists field_staff_scope on public.approvals;
drop policy if exists field_staff_scope on public.case_steps;
drop policy if exists field_staff_scope on public.checklist_log;
drop policy if exists field_staff_scope on public.delay_log;
drop policy if exists field_staff_scope on public.design_qc_checks;
drop policy if exists field_staff_scope on public.order_ai_reports;
drop policy if exists field_staff_scope on public.order_cancellation_requests;
drop policy if exists field_staff_scope on public.order_change_requests;
drop policy if exists field_staff_scope on public.order_events;
drop policy if exists field_staff_scope on public.order_implant_notes;
drop policy if exists field_staff_scope on public.order_implant_parts;
drop policy if exists field_staff_scope on public.order_items;
drop policy if exists field_staff_scope on public.order_messages;
drop policy if exists field_staff_scope on public.order_reviews;
drop policy if exists field_staff_scope on public.order_scan_annotations;
drop policy if exists field_staff_scope on public.provas;
drop policy if exists field_staff_scope on public.reject_log;
drop policy if exists field_staff_scope on public.stage_log;
drop policy if exists field_staff_scope on public.stage_material_consumptions;
drop policy if exists field_staff_scope on public.stage_material_selections;
drop policy if exists field_staff_scope on public.stage_photos;
drop policy if exists field_staff_scope on public.status_history;
drop policy if exists field_staff_scope on public.work_order_holds;
drop policy if exists field_staff_scope on public.work_order_photos;

CREATE OR REPLACE FUNCTION public.can_access_work_order(p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from work_orders wo where wo.id = p_order and (
      (is_lab_user() and wo.lab_id = get_my_lab_id())
   or wo.doctor_id = auth.uid()
   or (is_clinic_admin() and my_clinic_id() is not null and (
        exists (select 1 from profiles p_doc where p_doc.id = wo.doctor_id and p_doc.clinic_id = my_clinic_id())
     or exists (select 1 from doctors d_doc where d_doc.id = wo.doctor_id and d_doc.clinic_id = my_clinic_id())))
   or is_platform_admin()));
$function$
;

CREATE OR REPLACE FUNCTION public._implant_parts_actor(p_order uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.is_lab_user() AND EXISTS (
      SELECT 1 FROM work_orders wo WHERE wo.id = p_order AND wo.lab_id = public.get_my_lab_id()
    ) THEN 'lab'
    WHEN EXISTS (SELECT 1 FROM work_orders wo WHERE wo.id = p_order AND wo.doctor_id = auth.uid())
      THEN 'clinic'
    WHEN public.is_my_doctor_order(p_order) THEN 'clinic'
    WHEN EXISTS (
      SELECT 1 FROM profiles pr
       WHERE pr.id = auth.uid()
         AND pr.user_type IN ('clinic_admin','clinic_secretary')
         AND public._resolve_wo_clinic_id(p_order) IS NOT NULL
         AND (pr.clinic_id = public._resolve_wo_clinic_id(p_order)
              OR public._resolve_wo_clinic_id(p_order) IN (SELECT public.my_clinic_ids()))
    ) THEN 'clinic'
    ELSE NULL
  END;
$function$
;

drop function if exists public.can_see_work_order_id(uuid);
