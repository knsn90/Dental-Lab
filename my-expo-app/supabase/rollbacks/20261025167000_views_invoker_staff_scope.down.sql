-- Geri alma: 20261025167000 — görünümler sahip yetkisine, field_staff_scope önceki koşula döner.
alter view public.v_active_orders_kanban reset (security_invoker);
alter view public.v_monthly_finance_summary reset (security_invoker);
alter view public.v_monthly_finance_summary_ccy reset (security_invoker);

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
