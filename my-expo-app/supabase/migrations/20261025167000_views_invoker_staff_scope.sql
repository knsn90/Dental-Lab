-- 20261025167000_views_invoker_staff_scope.sql
-- Rol görünürlüğü son incelemesi (Important 3-4 kısmı + yeniden derecelenen Minor 6):
--  * v_active_orders_kanban, v_monthly_finance_summary(_ccy): sahip (postgres) yetkisiyle çalışan
--    görünümlerdi → kurye/teknisyen aktif siparişleri (hasta adıyla), finans yetkisizler aylık
--    gelir/gider/kârı görüyordu. security_invoker=on → çağıranın RLS'i (paket A, D, E) uygulanır.
--    Kullananlar: ProductionKanbanScreen (lab/admin), FinanceReportScreen (finans) — etkilenmez.
--  * field_staff_scope: my_role_key() bilinmeyen tipte 'technician' döndürdüğü için klinik
--    sekreterini de teknisyen gibi kısıtlıyordu → koşul yalnız lab kullanıcılarına (admin/lab) bağlanır.
-- Geri alma: rollbacks/20261025167000_views_invoker_staff_scope.down.sql

alter view public.v_active_orders_kanban set (security_invoker = on);
alter view public.v_monthly_finance_summary set (security_invoker = on);
alter view public.v_monthly_finance_summary_ccy set (security_invoker = on);

drop policy if exists field_staff_scope on public.approvals;
create policy field_staff_scope on public.approvals as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.case_steps;
create policy field_staff_scope on public.case_steps as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.checklist_log;
create policy field_staff_scope on public.checklist_log as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.delay_log;
create policy field_staff_scope on public.delay_log as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.design_qc_checks;
create policy field_staff_scope on public.design_qc_checks as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_ai_reports;
create policy field_staff_scope on public.order_ai_reports as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_cancellation_requests;
create policy field_staff_scope on public.order_cancellation_requests as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_change_requests;
create policy field_staff_scope on public.order_change_requests as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_events;
create policy field_staff_scope on public.order_events as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_implant_notes;
create policy field_staff_scope on public.order_implant_notes as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_implant_parts;
create policy field_staff_scope on public.order_implant_parts as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_items;
create policy field_staff_scope on public.order_items as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_messages;
create policy field_staff_scope on public.order_messages as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_reviews;
create policy field_staff_scope on public.order_reviews as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.order_scan_annotations;
create policy field_staff_scope on public.order_scan_annotations as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.provas;
create policy field_staff_scope on public.provas as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.reject_log;
create policy field_staff_scope on public.reject_log as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.stage_log;
create policy field_staff_scope on public.stage_log as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.stage_material_consumptions;
create policy field_staff_scope on public.stage_material_consumptions as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.stage_material_selections;
create policy field_staff_scope on public.stage_material_selections as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.stage_photos;
create policy field_staff_scope on public.stage_photos as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.status_history;
create policy field_staff_scope on public.status_history as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.work_order_holds;
create policy field_staff_scope on public.work_order_holds as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));

drop policy if exists field_staff_scope on public.work_order_photos;
create policy field_staff_scope on public.work_order_photos as restrictive for all to authenticated
  using (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id))
  with check (((select public.my_user_type()) <> all (array['lab', 'admin'])) or ((select public.my_role_key()) <> all (array['technician', 'courier'])) or public.can_see_work_order_id(work_order_id));
