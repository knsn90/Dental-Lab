-- Geri alma: 20261025160000_lab_finance_rls — kurallar 2026-10-25 canlı tanımına döner, yardımcılar düşer.
drop policy if exists invoice_items_lab_select on public.invoice_items;
drop policy if exists invoice_items_lab_write on public.invoice_items;
drop policy if exists invoice_orders_lab_select on public.invoice_orders;
drop policy if exists invoice_orders_lab_write on public.invoice_orders;
drop policy if exists payment_reminders_lab_select on public.payment_reminders;
drop policy if exists payment_reminders_lab_write on public.payment_reminders;
drop policy if exists invoices_lab_select on public.invoices;
create policy invoices_lab_select on public.invoices as permissive for select to public
  using ((lab_id = get_my_lab_id()));
drop policy if exists invoices_lab_insert on public.invoices;
create policy invoices_lab_insert on public.invoices as permissive for insert to public
  with check ((lab_id = get_my_lab_id()));
drop policy if exists invoices_lab_update on public.invoices;
create policy invoices_lab_update on public.invoices as permissive for update to public
  using ((lab_id = get_my_lab_id()))
  with check ((lab_id = get_my_lab_id()));
drop policy if exists invoices_lab_delete on public.invoices;
create policy invoices_lab_delete on public.invoices as permissive for delete to public
  using ((lab_id = get_my_lab_id()));
drop policy if exists invoice_items_lab_all on public.invoice_items;
create policy invoice_items_lab_all on public.invoice_items as permissive for all to public
  using ((invoice_id IN ( SELECT invoices.id
   FROM invoices
  WHERE (invoices.lab_id = get_my_lab_id()))))
  with check ((invoice_id IN ( SELECT invoices.id
   FROM invoices
  WHERE (invoices.lab_id = get_my_lab_id()))));
drop policy if exists invoice_orders_lab_all on public.invoice_orders;
create policy invoice_orders_lab_all on public.invoice_orders as permissive for all to public
  using ((lab_id = get_my_lab_id()))
  with check ((lab_id = get_my_lab_id()));
drop policy if exists payment_reminders_lab_all on public.payment_reminders;
create policy payment_reminders_lab_all on public.payment_reminders as permissive for all to public
  using ((lab_id = get_my_lab_id()))
  with check ((lab_id = get_my_lab_id()));
drop policy if exists payments_lab_select on public.payments;
create policy payments_lab_select on public.payments as permissive for select to public
  using ((lab_id = get_my_lab_id()));
drop policy if exists payment_submissions_lab_select on public.payment_submissions;
create policy payment_submissions_lab_select on public.payment_submissions as permissive for select to public
  using ((lab_id = get_my_lab_id()));
drop policy if exists payment_submissions_lab_update on public.payment_submissions;
create policy payment_submissions_lab_update on public.payment_submissions as permissive for update to public
  using ((lab_id = get_my_lab_id()))
  with check ((lab_id = get_my_lab_id()));
drop policy if exists payment_intents_lab_select on public.payment_intents;
create policy payment_intents_lab_select on public.payment_intents as permissive for select to authenticated
  using ((lab_id = ( SELECT get_my_lab_id() AS get_my_lab_id)));
drop policy if exists payment_intents_lab_insert on public.payment_intents;
create policy payment_intents_lab_insert on public.payment_intents as permissive for insert to authenticated
  with check ((lab_id = ( SELECT get_my_lab_id() AS get_my_lab_id)));
drop policy if exists payment_attempts_lab_select on public.payment_attempts;
create policy payment_attempts_lab_select on public.payment_attempts as permissive for select to authenticated
  using ((intent_id IN ( SELECT payment_intents.id
   FROM payment_intents
  WHERE (payment_intents.lab_id = ( SELECT get_my_lab_id() AS get_my_lab_id)))));
drop function if exists public.lab_can_view_finance();
drop function if exists public.lab_can_manage_invoices();
