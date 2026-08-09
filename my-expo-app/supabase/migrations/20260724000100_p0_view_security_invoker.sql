-- ============================================================================
-- P0-1 · R-03 — Force every public view to enforce the caller's RLS
-- ============================================================================
-- Postgres views run with the DEFINER's privileges unless security_invoker is
-- set. 20 of 31 public views had it unset, so they bypassed RLS entirely and
-- returned cross-tenant rows (payroll, patient names, sick-leave counts).
--
-- This migration is BREAKING BY DESIGN: screens that were silently relying on
-- the leak will now see only their own tenant's rows.
--
-- Ordering: MUST run before 20260724000200 (grant revocation). Flipping the
-- invoker flag first means that even mid-deploy an anon caller gets zero rows,
-- because RLS then applies and auth.uid() is null.
--
-- Idempotent: setting the option twice is a no-op.
-- ============================================================================

do $$
declare
  v_name text;
  v_count int := 0;
begin
  for v_name in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'v'
       and coalesce(
             (select option_value from pg_options_to_table(c.reloptions)
               where option_name = 'security_invoker'),
             'off') not in ('on','true')
  loop
    execute format('alter view public.%I set (security_invoker = on)', v_name);
    v_count := v_count + 1;
    raise notice 'security_invoker enabled on view: %', v_name;
  end loop;

  raise notice 'P0-1 complete: % view(s) converted', v_count;
end $$;

-- Assert the end state: zero views may bypass RLS.
do $$
declare v_left int;
begin
  select count(*) into v_left
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'v'
     and coalesce(
           (select option_value from pg_options_to_table(c.reloptions)
             where option_name = 'security_invoker'),
           'off') not in ('on','true');

  if v_left > 0 then
    raise exception 'P0-1 FAILED: % view(s) still bypass RLS', v_left;
  end if;
end $$;
