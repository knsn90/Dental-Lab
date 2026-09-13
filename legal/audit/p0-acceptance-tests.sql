-- ============================================================================
-- P0 Acceptance Tests — R-01 / R-02 / R-03
-- ============================================================================
-- CI-runnable. Every assertion RAISEs on failure, so a non-zero exit means a
-- P0 control regressed. Run AFTER the 20260724* migrations:
--
--   psql "$SUPABASE_DB_URL" -f legal/audit/p0-acceptance-tests.sql
--
-- These are behavioural assertions about the security model, not schema
-- snapshots — they are written to keep failing if someone re-introduces a
-- blanket grant, un-sets security_invoker, or makes a bucket public again.
-- ============================================================================

\set ON_ERROR_STOP on

do $$
declare
  v int;
  v_txt text;
begin
  raise notice '── R-03 · views enforce caller RLS ──────────────────────────';

  -- T1: no public view may bypass RLS.
  select count(*) into v
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relkind='v'
     and coalesce((select option_value from pg_options_to_table(c.reloptions)
                   where option_name='security_invoker'),'off') not in ('on','true');
  if v <> 0 then
    raise exception 'T1 FAILED: % view(s) bypass RLS', v;
  end if;
  raise notice 'T1 ok — all views run security_invoker';

  -- T2: anon may not read any view.
  select count(*) into v
    from information_schema.role_table_grants g
    join pg_class c on c.relname = g.table_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname='public'
   where g.table_schema='public' and g.grantee='anon'
     and g.privilege_type='SELECT' and c.relkind='v';
  if v <> 0 then
    raise exception 'T2 FAILED: anon holds SELECT on % view(s)', v;
  end if;
  raise notice 'T2 ok — anon has no view reads';

  -- T3: anon holds no write grant anywhere in public.
  select count(*) into v
    from information_schema.role_table_grants
   where table_schema='public' and grantee='anon'
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if v <> 0 then
    raise exception 'T3 FAILED: anon holds % write grant(s)', v;
  end if;
  raise notice 'T3 ok — anon cannot write';

  -- T4: the two REQUIRED pre-login reads survived. A regression here breaks
  -- registration (address autocomplete) or the public payment page.
  select count(*) into v
    from information_schema.role_table_grants
   where table_schema='public' and grantee='anon' and privilege_type='SELECT'
     and table_name in ('tr_mahalleler','payment_intents');
  if v <> 2 then
    raise exception 'T4 FAILED: expected 2 preserved anon reads, found %', v;
  end if;
  raise notice 'T4 ok — tr_mahalleler + payment_intents still anon-readable';

  raise notice '── R-02 · storage isolation ─────────────────────────────────';

  -- T5: no health-data bucket is public.
  select coalesce(string_agg(id, ', '), '') into v_txt
    from storage.buckets
   where public and id in ('chat-attachments','occlusion-screenshots','work-order-photos');
  if v_txt <> '' then
    raise exception 'T5 FAILED: public health bucket(s): %', v_txt;
  end if;
  raise notice 'T5 ok — health buckets are private';

  -- T6: the blanket auth.role() policies are gone.
  select count(*) into v from pg_policies
   where schemaname='storage'
     and policyname in ('Authenticated users can upload photos',
                        'Users can view photos of accessible orders',
                        'lab_logos_upload_authenticated',
                        'lab_logos_update_authenticated',
                        'lab_logos_delete_authenticated',
                        'chat_attach_select','chat_attach_insert');
  if v <> 0 then
    raise exception 'T6 FAILED: % blanket storage policy/policies remain', v;
  end if;
  raise notice 'T6 ok — blanket storage policies removed';

  -- T7: every replacement policy is present.
  select count(*) into v from pg_policies
   where schemaname='storage'
     and policyname in ('wop_select_orders','wop_insert_orders','wop_select_drafts',
                        'wop_insert_drafts','wop_delete',
                        'chat_select','chat_insert','chat_delete',
                        'lab_logos_write','lab_logos_update','lab_logos_delete');
  if v <> 11 then
    raise exception 'T7 FAILED: expected 11 scoped storage policies, found %', v;
  end if;
  raise notice 'T7 ok — 11 scoped storage policies installed';

  -- T8: erasure is physically possible — a DELETE policy must exist per bucket.
  select count(distinct policyname) into v from pg_policies
   where schemaname='storage' and cmd='DELETE'
     and (qual like '%work-order-photos%' or qual like '%chat-attachments%');
  if v < 2 then
    raise exception 'T8 FAILED: DELETE policies missing (found %)', v;
  end if;
  raise notice 'T8 ok — clinical files are deletable';

  -- T9: the authorisation helper exists and is not callable by anon.
  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='can_access_work_order';
  if v = 0 then raise exception 'T9 FAILED: can_access_work_order() missing'; end if;
  if has_function_privilege('anon','public.can_access_work_order(uuid)','EXECUTE') then
    raise exception 'T9 FAILED: anon can execute can_access_work_order()';
  end if;
  raise notice 'T9 ok — order-access helper present, anon cannot call it';

  raise notice '── R-01 · consent ledger ────────────────────────────────────';

  -- T10: the ledger exists with RLS on.
  select count(*) into v from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='user_consents' and c.relrowsecurity;
  if v <> 1 then raise exception 'T10 FAILED: user_consents missing or RLS off'; end if;
  raise notice 'T10 ok — user_consents exists with RLS';

  -- T11: append-only — no UPDATE/DELETE policy may exist.
  select count(*) into v from pg_policies
   where schemaname='public' and tablename='user_consents' and cmd in ('UPDATE','DELETE');
  if v <> 0 then
    raise exception 'T11 FAILED: user_consents has % mutating policy/policies', v;
  end if;
  raise notice 'T11 ok — no mutating policy on the ledger';

  -- T12: immutability is enforced by trigger, not only by policy absence.
  select count(*) into v from pg_trigger
   where tgrelid = 'public.user_consents'::regclass and tgname = 'user_consents_no_mutate';
  if v <> 1 then raise exception 'T12 FAILED: immutability trigger missing'; end if;
  raise notice 'T12 ok — append-only trigger installed';

  -- T13: versioned acceptance is structurally required for the legal documents.
  select count(*) into v from pg_constraint
   where conrelid='public.user_consents'::regclass and conname='user_consents_version_required';
  if v <> 1 then raise exception 'T13 FAILED: version constraint missing'; end if;
  raise notice 'T13 ok — document_version required for privacy_policy/terms';

  -- T14: the consent API exists and anon cannot call it.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='record_consents') then
    raise exception 'T14 FAILED: record_consents() missing';
  end if;
  if has_function_privilege('anon','public.record_consents(jsonb)','EXECUTE') then
    raise exception 'T14 FAILED: anon can execute record_consents()';
  end if;
  raise notice 'T14 ok — record_consents() present, anon cannot call it';

  -- T15: record_consents must be SECURITY INVOKER, so the RLS insert policy
  -- (user_id = auth.uid()) applies. A DEFINER version would let any caller
  -- forge consent for another user — the exact failure this guards.
  select p.prosecdef::int into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='record_consents';
  if v <> 0 then
    raise exception 'T15 FAILED: record_consents() is SECURITY DEFINER — consent could be forged';
  end if;
  raise notice 'T15 ok — record_consents() runs as invoker';

  raise notice '';
  raise notice '✅ ALL P0 ACCEPTANCE TESTS PASSED (T1-T15)';
end $$;

-- ── T16 · Behavioural check: the ledger really rejects mutation ────────────
-- Inserts a probe row, proves UPDATE and DELETE are refused, then removes the
-- probe with the trigger temporarily lifted. Wrapped so the probe never leaks.
do $$
declare
  v_user uuid;
  v_id   uuid;
  v_upd_blocked boolean := false;
  v_del_blocked boolean := false;
begin
  select id into v_user from auth.users limit 1;
  if v_user is null then
    raise notice 'T16 skipped — no auth.users row to attach a probe to';
    return;
  end if;

  insert into public.user_consents (user_id, kind, granted, document_version)
  values (v_user, 'privacy_policy', true, '__t16_probe__')
  returning id into v_id;

  begin
    update public.user_consents set granted = false where id = v_id;
  exception when sqlstate '42501' then
    v_upd_blocked := true;
  end;

  begin
    delete from public.user_consents where id = v_id;
  exception when sqlstate '42501' then
    v_del_blocked := true;
  end;

  -- Clean up the probe with the immutability trigger disabled for this session.
  alter table public.user_consents disable trigger user_consents_no_mutate;
  delete from public.user_consents where id = v_id;
  alter table public.user_consents enable trigger user_consents_no_mutate;

  if not v_upd_blocked then raise exception 'T16 FAILED: UPDATE was allowed'; end if;
  if not v_del_blocked then raise exception 'T16 FAILED: DELETE was allowed'; end if;

  raise notice 'T16 ok — UPDATE and DELETE on the ledger are both refused';
  raise notice '';
  raise notice '✅ BEHAVIOURAL TEST PASSED (T16)';
end $$;
