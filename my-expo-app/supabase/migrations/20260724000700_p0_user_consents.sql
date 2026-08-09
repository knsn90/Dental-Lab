-- ============================================================================
-- P0-5 · R-01 — Versioned consent recording
-- ============================================================================
-- Baseline: profiles.kvkk_accepted_at existed, was typed in lib/types.ts:37,
-- and was NEVER written — 0 of 14 rows populated. Every activity requiring
-- consent (AI transfer of health data, WhatsApp, international transfer) had
-- no lawful basis and GDPR Art. 7(1) demonstrability was unmet.
--
-- A single nullable timestamp cannot express WHICH version was accepted, cannot
-- carry granular per-purpose opt-ins, and cannot survive withdraw-then-reconsent.
-- This table is APPEND-ONLY: consent history is evidence and must not be edited.
-- profiles.kvkk_accepted_at is retained and back-filled by trigger so existing
-- readers keep working, but user_consents is the record of truth.
-- ============================================================================

create table if not exists public.user_consents (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  kind             text not null check (kind in (
                      'privacy_policy',
                      'terms',
                      'ai_processing',
                      'marketing_whatsapp',
                      'marketing_sms',
                      'international_transfer')),
  granted          boolean not null,
  document_version text,
  granted_at       timestamptz not null default now(),
  ip               inet,
  user_agent       text,
  withdrawn_at     timestamptz,
  -- Required consents must carry the version of the document that was shown.
  constraint user_consents_version_required
    check (kind not in ('privacy_policy','terms')
           or (granted is false or document_version is not null))
);

comment on table public.user_consents is
  'R-01: append-only consent ledger. One row per decision. Never UPDATE or '
  'DELETE — withdrawal is a new row with granted=false.';

create index if not exists user_consents_user_kind_idx
  on public.user_consents (user_id, kind, granted_at desc);

alter table public.user_consents enable row level security;

drop policy if exists consents_self_read   on public.user_consents;
drop policy if exists consents_self_insert on public.user_consents;

create policy consents_self_read on public.user_consents
  for select to authenticated
  using (user_id = auth.uid() or is_platform_admin());

create policy consents_self_insert on public.user_consents
  for insert to authenticated
  with check (user_id = auth.uid());

-- Deliberately NO update/delete policy: the ledger is immutable to clients.
-- Enforced defensively at the table level too, so even a future permissive
-- policy cannot rewrite history.
create or replace function public.tg_user_consents_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'user_consents is append-only (attempted %)', tg_op
    using errcode = '42501';
end $$;

drop trigger if exists user_consents_no_mutate on public.user_consents;
create trigger user_consents_no_mutate
  before update or delete on public.user_consents
  for each row execute function public.tg_user_consents_immutable();

-- ── Read helper ────────────────────────────────────────────────────────────
create or replace function public.current_consent(p_user uuid, p_kind text)
returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select granted and withdrawn_at is null
      from user_consents
     where user_id = p_user and kind = p_kind
     order by granted_at desc
     limit 1
  ), false);
$$;

revoke all on function public.current_consent(uuid, text) from public, anon;
grant execute on function public.current_consent(uuid, text) to authenticated, service_role;

-- ── Write RPC ──────────────────────────────────────────────────────────────
-- Called immediately after sign-up. SECURITY INVOKER so the RLS insert policy
-- applies: a caller can only ever write consent rows for themselves.
create or replace function public.record_consents(p_consents jsonb)
returns integer
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_item    jsonb;
  v_count   int := 0;
  v_privacy boolean := false;
  v_terms   boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_consents is null or jsonb_typeof(p_consents) <> 'array' then
    raise exception 'p_consents must be a json array' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_consents) loop
    insert into public.user_consents
      (user_id, kind, granted, document_version, user_agent)
    values (
      auth.uid(),
      v_item->>'kind',
      coalesce((v_item->>'granted')::boolean, false),
      v_item->>'document_version',
      v_item->>'user_agent'
    );
    v_count := v_count + 1;

    if v_item->>'kind' = 'privacy_policy'
       and coalesce((v_item->>'granted')::boolean, false) then
      v_privacy := true;
    end if;
    if v_item->>'kind' = 'terms'
       and coalesce((v_item->>'granted')::boolean, false) then
      v_terms := true;
    end if;
  end loop;

  -- Keep the legacy column meaningful for existing readers.
  if v_privacy and v_terms then
    update public.profiles
       set kvkk_accepted_at = coalesce(kvkk_accepted_at, now())
     where id = auth.uid();
  end if;

  return v_count;
end $$;

revoke all on function public.record_consents(jsonb) from public, anon;
grant execute on function public.record_consents(jsonb) to authenticated;

-- ── Gate helper: has this user accepted the CURRENT required documents? ────
create or replace function public.has_required_consents(p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path to 'public' as $$
  select public.current_consent(p_user, 'privacy_policy')
     and public.current_consent(p_user, 'terms');
$$;

revoke all on function public.has_required_consents(uuid) from public, anon;
grant execute on function public.has_required_consents(uuid) to authenticated, service_role;

do $$
declare v_mut int;
begin
  select count(*) into v_mut from pg_policies
   where schemaname='public' and tablename='user_consents' and cmd in ('UPDATE','DELETE');
  if v_mut > 0 then
    raise exception 'P0-5 FAILED: user_consents has % mutating policy/policies', v_mut;
  end if;
  raise notice 'P0-5 complete: append-only versioned consent ledger installed';
end $$;
