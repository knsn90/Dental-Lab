-- 20261025164000_technician_order_children.sql
-- Rol görünürlüğü paketi D (5b): siparişe bağlı veriler de teknisyenin "kendi işi" kuralına uyar
-- (spec §3 "Siparişe bağlı veriler"). Yöntem: mevcut kurallara dokunmadan her tabloya RESTRICTIVE
-- field_staff_scope eklenir — yalnız teknisyen/kurye rolünde sipariş görünürlüğü (_field_staff_sees)
-- şartı koşar, diğer roller aynen geçer. Dosya deposu (work-order-photos, chat-attachments) ve
-- yaşam döngüsü koruması can_access_work_order / _implant_parts_actor üzerinden aynı kurala bağlanır.
-- Kurye dalı _field_staff_sees'te hâlâ true (paket E). Geri alma: rollbacks/20261025164000_technician_order_children.down.sql

create or replace function public.can_see_work_order_id(p_wo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.work_orders wo
                  where wo.id = p_wo and wo.lab_id = public.get_my_lab_id()
                    and public._field_staff_sees(wo.id, wo.assigned_to))
$$;
revoke all on function public.can_see_work_order_id(uuid) from public, anon;
grant execute on function public.can_see_work_order_id(uuid) to authenticated;

-- ortak yardımcılar (depo, sohbet ekleri, implant parçaları, yaşam döngüsü koruması)
CREATE OR REPLACE FUNCTION public.can_access_work_order(p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from work_orders wo where wo.id = p_order and (
      (is_lab_user() and wo.lab_id = get_my_lab_id() and public._field_staff_sees(wo.id, wo.assigned_to))
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
        AND public._field_staff_sees(wo.id, wo.assigned_to)
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

-- siparişe bağlı 24 tablo
drop policy if exists field_staff_scope on public.approvals;
create policy field_staff_scope on public.approvals as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.case_steps;
create policy field_staff_scope on public.case_steps as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.checklist_log;
create policy field_staff_scope on public.checklist_log as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.delay_log;
create policy field_staff_scope on public.delay_log as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.design_qc_checks;
create policy field_staff_scope on public.design_qc_checks as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_ai_reports;
create policy field_staff_scope on public.order_ai_reports as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_cancellation_requests;
create policy field_staff_scope on public.order_cancellation_requests as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_change_requests;
create policy field_staff_scope on public.order_change_requests as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_events;
create policy field_staff_scope on public.order_events as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_implant_notes;
create policy field_staff_scope on public.order_implant_notes as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_implant_parts;
create policy field_staff_scope on public.order_implant_parts as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_items;
create policy field_staff_scope on public.order_items as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_messages;
create policy field_staff_scope on public.order_messages as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_reviews;
create policy field_staff_scope on public.order_reviews as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_scan_annotations;
create policy field_staff_scope on public.order_scan_annotations as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.provas;
create policy field_staff_scope on public.provas as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.reject_log;
create policy field_staff_scope on public.reject_log as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.stage_log;
create policy field_staff_scope on public.stage_log as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.stage_material_consumptions;
create policy field_staff_scope on public.stage_material_consumptions as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.stage_material_selections;
create policy field_staff_scope on public.stage_material_selections as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.stage_photos;
create policy field_staff_scope on public.stage_photos as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.status_history;
create policy field_staff_scope on public.status_history as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.work_order_holds;
create policy field_staff_scope on public.work_order_holds as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.work_order_photos;
create policy field_staff_scope on public.work_order_photos as restrictive for all to authenticated
  using (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));
