-- ============================================================================
-- P0-2b · R-02 — Tenant-scope the work-order-photos bucket
-- ============================================================================
-- BEFORE (live predicates, both policies):
--     bucket_id = 'work-order-photos' AND auth.role() = 'authenticated'
-- i.e. ANY authenticated user of ANY tenant could read and write EVERY object:
-- intra-oral photographs, STL/PLY/OBJ scans, DICOM. No lab_id, no order check,
-- no ownership check — and no DELETE policy at all, so erasure was impossible.
--
-- The work_order_photos TABLE policies are already correct; this migration
-- mirrors them onto the storage layer via can_access_work_order().
--
-- Path shapes (verified against live objects):
--     orders/{work_order_id}/…   → order-scoped
--     drafts/{user_id}/…         → owner-scoped
--     {uuid}/… (7 legacy objects) → matches NOTHING by design; inventoried in
--                                   20260724000300 and awaiting disposition.
--
-- BREAKING: 149 orphaned `orders/` objects + 7 legacy objects become
-- unreadable. No UI references them (no DB row points at them), so there is no
-- functional regression — but the data is now correctly unreachable rather
-- than world-readable.
-- ============================================================================

-- ── Authorisation helper ───────────────────────────────────────────────────
-- Mirrors the work_order_photos table policies exactly: lab staff in the owning
-- lab, the ordering doctor, a clinic admin over that doctor's clinic, or a
-- platform admin.
create or replace function public.can_access_work_order(p_order uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from work_orders wo
     where wo.id = p_order
       and (
            (is_lab_user() and wo.lab_id = get_my_lab_id())
         or wo.doctor_id = auth.uid()
         or (
              is_clinic_admin()
              and my_clinic_id() is not null
              and (
                   exists (select 1 from profiles p_doc
                            where p_doc.id = wo.doctor_id
                              and p_doc.clinic_id = my_clinic_id())
                or exists (select 1 from doctors d_doc
                            where d_doc.id = wo.doctor_id
                              and d_doc.clinic_id = my_clinic_id())
              )
            )
         or is_platform_admin()
       )
  );
$$;

comment on function public.can_access_work_order(uuid) is
  'R-02: single source of truth for order-scoped storage access. Mirrors the '
  'work_order_photos table RLS policies.';

revoke all on function public.can_access_work_order(uuid) from public, anon;
grant execute on function public.can_access_work_order(uuid) to authenticated, service_role;

-- Safe uuid coercion: a malformed path must fail the policy, not raise 22P02
-- and turn a policy evaluation into a 500.
create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

revoke all on function public.try_uuid(text) from public, anon;
grant execute on function public.try_uuid(text) to authenticated, service_role;

-- ── Replace the blanket policies ───────────────────────────────────────────
drop policy if exists "Authenticated users can upload photos"     on storage.objects;
drop policy if exists "Users can view photos of accessible orders" on storage.objects;
drop policy if exists wop_select_orders on storage.objects;
drop policy if exists wop_insert_orders on storage.objects;
drop policy if exists wop_select_drafts on storage.objects;
drop policy if exists wop_insert_drafts on storage.objects;
drop policy if exists wop_delete        on storage.objects;

-- orders/{work_order_id}/…
create policy wop_select_orders on storage.objects
  for select to authenticated
  using (
    bucket_id = 'work-order-photos'
    and split_part(name,'/',1) = 'orders'
    and public.can_access_work_order(public.try_uuid(split_part(name,'/',2)))
  );

create policy wop_insert_orders on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'work-order-photos'
    and split_part(name,'/',1) = 'orders'
    and public.can_access_work_order(public.try_uuid(split_part(name,'/',2)))
  );

-- drafts/{user_id}/… — a draft belongs to the user who is composing it.
create policy wop_select_drafts on storage.objects
  for select to authenticated
  using (
    bucket_id = 'work-order-photos'
    and split_part(name,'/',1) = 'drafts'
    and split_part(name,'/',2) = auth.uid()::text
  );

create policy wop_insert_drafts on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'work-order-photos'
    and split_part(name,'/',1) = 'drafts'
    and split_part(name,'/',2) = auth.uid()::text
  );

-- DELETE did not exist before. Required so erasure (P1-5) can actually reach files.
create policy wop_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'work-order-photos'
    and (
         (split_part(name,'/',1) = 'orders'
          and is_lab_user()
          and public.can_access_work_order(public.try_uuid(split_part(name,'/',2))))
      or (split_part(name,'/',1) = 'drafts'
          and split_part(name,'/',2) = auth.uid()::text)
      or is_platform_admin()
    )
  );

-- ── Assertions ─────────────────────────────────────────────────────────────
do $$
declare v_blanket int; v_new int; v_del int;
begin
  select count(*) into v_blanket from pg_policies
   where schemaname='storage'
     and policyname in ('Authenticated users can upload photos',
                        'Users can view photos of accessible orders');
  select count(*) into v_new from pg_policies
   where schemaname='storage'
     and policyname in ('wop_select_orders','wop_insert_orders','wop_delete');
  select count(*) into v_del from pg_policies
   where schemaname='storage' and cmd='DELETE' and qual like '%work-order-photos%';

  if v_blanket > 0 then raise exception 'P0-2b FAILED: blanket policies remain'; end if;
  if v_new < 3    then raise exception 'P0-2b FAILED: expected >=3 scoped policies, got %', v_new; end if;
  if v_del < 1    then raise exception 'P0-2b FAILED: no DELETE policy'; end if;

  raise notice 'P0-2b complete: work-order-photos is order-scoped and deletable';
end $$;
