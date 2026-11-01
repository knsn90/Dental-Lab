-- 20261025160000_lab_finance_rls.sql
-- Rol görünürlüğü paketi A (spec: docs/superpowers/specs/2026-10-25-rol-gorunurlugu-design.md §4 A).
-- Lab tarafı finans tabloları bugün lab'daki HERKESE (teknisyen, kurye dahil) açık: faturayı okuyup
-- ekleyip değiştirip SİLEBİLİYORLAR. Okuma → Finans yetkisi (menüdeki view_financials; istemci
-- eşlemesi view_finance; manage_finance), yazma → fatura yönetimi (manage_invoices / manage_finance).
-- Klinik/hekim dalları değişmez (paket C). DEFINER yollar (taslak fatura tetikleyicisi, toplu fatura,
-- e-fatura/ödeme edge'leri) RLS'ten etkilenmez. Geri alma: supabase/rollbacks/20261025160000_lab_finance_rls.down.sql

-- Yalnız lab kullanıcıları (admin/lab): klinik yöneticisi rolünde de manage_invoices var; lab dalında
-- lab_id = get_my_lab_id() zaten süzer, yine de açıkça lab tarafına bağlanır.
create or replace function public.lab_can_view_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or (
    exists (select 1 from public.profiles where id = auth.uid() and user_type in ('admin', 'lab'))
    and (public.has_permission('view_financials') or public.has_permission('view_finance')
         or public.has_permission('manage_finance')))
$$;

create or replace function public.lab_can_manage_invoices()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or (
    exists (select 1 from public.profiles where id = auth.uid() and user_type in ('admin', 'lab'))
    and (public.has_permission('manage_invoices') or public.has_permission('manage_finance')))
$$;

revoke all on function public.lab_can_view_finance() from public, anon;
revoke all on function public.lab_can_manage_invoices() from public, anon;
grant execute on function public.lab_can_view_finance() to authenticated;
grant execute on function public.lab_can_manage_invoices() to authenticated;

-- invoices
drop policy if exists invoices_lab_select on public.invoices;
create policy invoices_lab_select on public.invoices as permissive for select to public
  using (lab_id = get_my_lab_id() and public.lab_can_view_finance());
drop policy if exists invoices_lab_insert on public.invoices;
create policy invoices_lab_insert on public.invoices as permissive for insert to public
  with check (lab_id = get_my_lab_id() and public.lab_can_manage_invoices());
drop policy if exists invoices_lab_update on public.invoices;
create policy invoices_lab_update on public.invoices as permissive for update to public
  using (lab_id = get_my_lab_id() and public.lab_can_manage_invoices())
  with check (lab_id = get_my_lab_id() and public.lab_can_manage_invoices());
drop policy if exists invoices_lab_delete on public.invoices;
create policy invoices_lab_delete on public.invoices as permissive for delete to public
  using (lab_id = get_my_lab_id() and public.lab_can_manage_invoices());

-- invoice_items (ALL → okuma + yazma)
drop policy if exists invoice_items_lab_all on public.invoice_items;
drop policy if exists invoice_items_lab_select on public.invoice_items;
create policy invoice_items_lab_select on public.invoice_items as permissive for select to public
  using (invoice_id in (select invoices.id from invoices where invoices.lab_id = get_my_lab_id()) and public.lab_can_view_finance());
drop policy if exists invoice_items_lab_write on public.invoice_items;
create policy invoice_items_lab_write on public.invoice_items as permissive for all to public
  using (invoice_id in (select invoices.id from invoices where invoices.lab_id = get_my_lab_id()) and public.lab_can_manage_invoices())
  with check (invoice_id in (select invoices.id from invoices where invoices.lab_id = get_my_lab_id()) and public.lab_can_manage_invoices());

-- invoice_orders
drop policy if exists invoice_orders_lab_all on public.invoice_orders;
drop policy if exists invoice_orders_lab_select on public.invoice_orders;
create policy invoice_orders_lab_select on public.invoice_orders as permissive for select to public
  using (lab_id = get_my_lab_id() and public.lab_can_view_finance());
drop policy if exists invoice_orders_lab_write on public.invoice_orders;
create policy invoice_orders_lab_write on public.invoice_orders as permissive for all to public
  using (lab_id = get_my_lab_id() and public.lab_can_manage_invoices())
  with check (lab_id = get_my_lab_id() and public.lab_can_manage_invoices());

-- payment_reminders
drop policy if exists payment_reminders_lab_all on public.payment_reminders;
drop policy if exists payment_reminders_lab_select on public.payment_reminders;
create policy payment_reminders_lab_select on public.payment_reminders as permissive for select to public
  using (lab_id = get_my_lab_id() and public.lab_can_view_finance());
drop policy if exists payment_reminders_lab_write on public.payment_reminders;
create policy payment_reminders_lab_write on public.payment_reminders as permissive for all to public
  using (lab_id = get_my_lab_id() and public.lab_can_manage_invoices())
  with check (lab_id = get_my_lab_id() and public.lab_can_manage_invoices());

-- payments (yazma kuralları zaten manage_finance)
drop policy if exists payments_lab_select on public.payments;
create policy payments_lab_select on public.payments as permissive for select to public
  using (lab_id = get_my_lab_id() and public.lab_can_view_finance());

-- payment_submissions (self_cancel ve klinik dalları aynen)
drop policy if exists payment_submissions_lab_select on public.payment_submissions;
create policy payment_submissions_lab_select on public.payment_submissions as permissive for select to public
  using (lab_id = get_my_lab_id() and public.lab_can_view_finance());
drop policy if exists payment_submissions_lab_update on public.payment_submissions;
create policy payment_submissions_lab_update on public.payment_submissions as permissive for update to public
  using (lab_id = get_my_lab_id() and public.lab_can_manage_invoices())
  with check (lab_id = get_my_lab_id() and public.lab_can_manage_invoices());

-- payment_intents / payment_attempts
drop policy if exists payment_intents_lab_select on public.payment_intents;
create policy payment_intents_lab_select on public.payment_intents as permissive for select to authenticated
  using (lab_id = (select get_my_lab_id()) and public.lab_can_view_finance());
drop policy if exists payment_intents_lab_insert on public.payment_intents;
create policy payment_intents_lab_insert on public.payment_intents as permissive for insert to authenticated
  with check (lab_id = (select get_my_lab_id()) and public.lab_can_manage_invoices());
drop policy if exists payment_attempts_lab_select on public.payment_attempts;
create policy payment_attempts_lab_select on public.payment_attempts as permissive for select to authenticated
  using (intent_id in (select payment_intents.id from payment_intents where payment_intents.lab_id = (select get_my_lab_id())) and public.lab_can_view_finance());
