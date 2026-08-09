-- ============================================================================
-- P0-1b · R-03 — Remove excessive `anon` grants, preserving required access
-- ============================================================================
-- Baseline (measured 2026-07-23):
--   • 664 anon grants across schema public, 414 of them writes on base tables
--   • 28 anon SELECT grants on views; all 20 RLS-bypassing views were included
--
-- Base-table writes were contained by RLS (RLS is enabled on all 138 tables),
-- so this is primarily a defence-in-depth cleanup — WITH ONE EXCEPTION that is
-- a live hole and the reason this migration is P0:
--
--   public.labs has policy `labs_authenticated_all`  cmd=ALL  qual=true  role=public
--   `public` includes `anon`. Combined with the anon INSERT/UPDATE/DELETE grant,
--   an unauthenticated caller could mutate ANY lab row in ANY tenant.
--   Revoking the grant closes the anonymous half immediately.
--   (The authenticated half of that policy is tracked separately as R-22 — it
--    still lets any signed-in user of any tenant read/write all labs. Out of P0
--    scope; do not fix silently here.)
--
-- REQUIRED ANONYMOUS ACCESS — deliberately preserved:
--   • public.tr_mahalleler   — address autocomplete runs on the REGISTRATION
--                              screen, before any session exists.
--                              (modules/auth/components/AddressFields.tsx)
--   • public.payment_intents — the public payment page resolves an intent by
--                              public_token with no session (app/pay/*).
--                              Policy `payment_intents_public_token_read` already
--                              constrains this to non-expired, payable statuses.
--
-- Everything else loses anon access entirely.
-- ============================================================================

do $$
declare
  r record;
  -- Tables that MUST keep anon SELECT. Adding to this list is a security
  -- decision: the table's RLS policy must independently constrain the rows.
  keep_select constant text[] := array['tr_mahalleler','payment_intents'];
begin
  for r in
    select c.relname, c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r','v','m')
  loop
    -- Writes: revoked everywhere, no exceptions.
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on public.%I from anon',
      r.relname);

    if r.relname = any(keep_select) then
      -- Preserve the pre-login read, nothing more.
      execute format('grant select on public.%I to anon', r.relname);
      raise notice 'anon SELECT preserved (pre-login flow): %', r.relname;
    else
      execute format('revoke select on public.%I from anon', r.relname);
    end if;

    -- `authenticated` keeps read access but loses blanket write on VIEWS.
    -- Base-table writes stay as-is: they are governed by RLS policies and
    -- narrowing them here would break the application.
    if r.relkind = 'v' then
      execute format(
        'revoke insert, update, delete, truncate on public.%I from authenticated',
        r.relname);
      execute format('grant select on public.%I to authenticated', r.relname);
    end if;
  end loop;
end $$;

-- Stop the pattern from silently returning on the next `grant all` sweep.
alter default privileges in schema public revoke all on tables from anon;

-- ── Assertions ─────────────────────────────────────────────────────────────
do $$
declare
  v_anon_view_select int;
  v_anon_writes      int;
  v_kept             int;
begin
  select count(*) into v_anon_view_select
    from information_schema.role_table_grants g
    join pg_class c on c.relname = g.table_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where g.table_schema = 'public' and g.grantee = 'anon'
     and g.privilege_type = 'SELECT' and c.relkind = 'v';

  select count(*) into v_anon_writes
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');

  select count(*) into v_kept
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'
     and privilege_type = 'SELECT'
     and table_name in ('tr_mahalleler','payment_intents');

  if v_anon_view_select > 0 then
    raise exception 'P0-1b FAILED: anon still holds SELECT on % view(s)', v_anon_view_select;
  end if;
  if v_anon_writes > 0 then
    raise exception 'P0-1b FAILED: anon still holds % write grant(s)', v_anon_writes;
  end if;
  if v_kept <> 2 then
    raise exception 'P0-1b FAILED: required anon SELECT missing (expected 2, got %)', v_kept;
  end if;

  raise notice 'P0-1b complete: anon writes revoked, 2 required reads preserved';
end $$;
