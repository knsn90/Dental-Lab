-- ============================================================================
-- P0-2a · R-21 — Inventory orphaned storage objects BEFORE tightening policies
-- ============================================================================
-- Baseline (measured 2026-07-23) in bucket work-order-photos (266 objects):
--   orders/{work_order_id}/…   194 objects — only  45 resolve to a work_orders row
--   drafts/{user_id}/…          67 objects —      67 resolve to a profiles row
--   {uuid}/… (legacy)            7 objects —       0 resolve to anything
--   chat-attachments            21 objects —       9 do not resolve to an order
--
-- 165 files of patient scans, DICOM and clinical photographs have no owning
-- database record. They are unreachable by any erasure routine, and the
-- order-scoped policy in the next migration will make them unreadable.
--
-- This migration is READ-ONLY with respect to storage: it deletes nothing.
-- It records what exists so a human can set `disposition` before anything is
-- destroyed. Deleting patient imagery is a legal decision, not a cleanup task.
--
-- Idempotent: re-running refreshes the snapshot without duplicating rows.
-- ============================================================================

create table if not exists public.storage_orphan_audit (
  id           bigserial primary key,
  bucket_id    text        not null,
  object_name  text        not null,
  path_shape   text        not null,   -- 'orders' | 'drafts' | 'legacy'
  resolves     boolean     not null,
  size_bytes   bigint,
  object_created_at timestamptz,
  disposition  text,                   -- human-set: 'keep' | 'delete' | 'reattach'
  disposed_by  uuid,
  disposed_at  timestamptz,
  noted_at     timestamptz not null default now(),
  unique (bucket_id, object_name)
);

comment on table public.storage_orphan_audit is
  'R-21: storage objects with no owning DB record. `disposition` must be set by a '
  'human before any destructive cleanup. Populated by fn_refresh_storage_orphan_audit().';

alter table public.storage_orphan_audit enable row level security;

-- Platform admins only: this table lists paths to patient imagery.
drop policy if exists storage_orphan_audit_admin on public.storage_orphan_audit;
create policy storage_orphan_audit_admin on public.storage_orphan_audit
  for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

create or replace function public.fn_refresh_storage_orphan_audit()
returns table(bucket text, shape text, orphans bigint)
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.storage_orphan_audit
    (bucket_id, object_name, path_shape, resolves, size_bytes, object_created_at)
  select
    o.bucket_id,
    o.name,
    case
      when o.bucket_id = 'chat-attachments' then 'orders'
      when split_part(o.name,'/',1) in ('orders','drafts') then split_part(o.name,'/',1)
      else 'legacy'
    end,
    case
      when o.bucket_id = 'chat-attachments'
        then exists (select 1 from public.work_orders w
                      where w.id::text = split_part(o.name,'/',1))
      when split_part(o.name,'/',1) = 'orders'
        then exists (select 1 from public.work_orders w
                      where w.id::text = split_part(o.name,'/',2))
      when split_part(o.name,'/',1) = 'drafts'
        then exists (select 1 from public.profiles p
                      where p.id::text = split_part(o.name,'/',2))
      else false
    end,
    (o.metadata->>'size')::bigint,
    o.created_at
  from storage.objects o
  where o.bucket_id in ('work-order-photos','chat-attachments')
  on conflict (bucket_id, object_name) do update
    set resolves   = excluded.resolves,
        size_bytes = excluded.size_bytes,
        noted_at   = now();

  return query
    select a.bucket_id, a.path_shape, count(*)
      from public.storage_orphan_audit a
     where not a.resolves
     group by a.bucket_id, a.path_shape
     order by a.bucket_id, a.path_shape;
end $$;

revoke all on function public.fn_refresh_storage_orphan_audit() from public, anon;
grant execute on function public.fn_refresh_storage_orphan_audit() to service_role;

-- Take the initial snapshot.
do $$
declare v_orphans int;
begin
  perform public.fn_refresh_storage_orphan_audit();
  select count(*) into v_orphans from public.storage_orphan_audit where not resolves;
  raise notice 'P0-2a complete: % orphaned object(s) inventoried and awaiting disposition',
    v_orphans;
end $$;
