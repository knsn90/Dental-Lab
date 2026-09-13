-- ============================================================================
-- SIMAN — Privacy & Security Regression Harness
-- ============================================================================
-- Re-runnable assertion suite covering every machine-checkable finding from
-- legal/06-risk-report.md and legal/08-remediation-roadmap.md.
--
-- Usage:  psql "$SUPABASE_DB_URL" -f legal/audit/regression-harness.sql
--    or:  paste into the Supabase SQL editor
--
-- Each row returns: finding, check, expected, actual, status (PASS/FAIL)
-- A finding is only "fixed" when every one of its checks reports PASS.
--
-- NOTE: checks marked [CODE] cannot be evaluated from the database and are
--       covered by legal/audit/regression-harness.sh instead.
-- ============================================================================

with checks as (

-- ── R-01 · Consent is never recorded ────────────────────────────────────────
select 'R-01' finding, 'user_consents table exists' chk,
       'exists' expected,
       (select count(*)::text from information_schema.tables
         where table_schema='public' and table_name='user_consents') actual,
       (select count(*) from information_schema.tables
         where table_schema='public' and table_name='user_consents') > 0 ok
union all
select 'R-01', 'consent rows recorded for active users',
       '>0',
       (select count(*)::text from public.profiles where kvkk_accepted_at is not null),
       (select count(*) from public.profiles where kvkk_accepted_at is not null) > 0
union all
select 'R-01', 'user_consents is append-only (no UPDATE/DELETE policy)',
       '0 mutating policies',
       (select count(*)::text from pg_policies
         where schemaname='public' and tablename='user_consents' and cmd in ('UPDATE','DELETE')),
       coalesce((select count(*) from pg_policies
         where schemaname='public' and tablename='user_consents' and cmd in ('UPDATE','DELETE')),0) = 0

-- ── R-02 · Storage tenant isolation ─────────────────────────────────────────
union all
select 'R-02', 'no public bucket holds health data',
       'chat-attachments + occlusion-screenshots private',
       (select coalesce(string_agg(id,', '),'none')::text from storage.buckets
         where public and id in ('chat-attachments','occlusion-screenshots')),
       (select count(*) from storage.buckets
         where public and id in ('chat-attachments','occlusion-screenshots')) = 0
union all
select 'R-02', 'work-order-photos blanket auth.role() policies removed',
       '0 blanket policies',
       (select count(*)::text from pg_policies where schemaname='storage'
         and policyname in ('Authenticated users can upload photos',
                            'Users can view photos of accessible orders')),
       (select count(*) from pg_policies where schemaname='storage'
         and policyname in ('Authenticated users can upload photos',
                            'Users can view photos of accessible orders')) = 0
union all
select 'R-02', 'order-scoped storage policies present',
       '>=3 (select/insert/delete)',
       (select count(*)::text from pg_policies where schemaname='storage'
         and policyname in ('wop_select_orders','wop_insert_orders','wop_select_drafts',
                            'wop_insert_drafts','wop_delete')),
       (select count(*) from pg_policies where schemaname='storage'
         and policyname in ('wop_select_orders','wop_insert_orders','wop_delete')) >= 3
union all
select 'R-02', 'can_access_work_order() helper exists',
       'exists',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='can_access_work_order'),
       (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='can_access_work_order') > 0
union all
select 'R-02', 'work-order-photos DELETE possible (erasure prerequisite)',
       '>=1 delete policy',
       (select count(*)::text from pg_policies where schemaname='storage'
         and cmd='DELETE' and qual like '%work-order-photos%'),
       (select count(*) from pg_policies where schemaname='storage'
         and cmd='DELETE' and qual like '%work-order-photos%') >= 1
union all
select 'R-02', 'lab-logos writes scoped to owning lab',
       'no unscoped authenticated write',
       (select count(*)::text from pg_policies where schemaname='storage'
         and policyname in ('lab_logos_upload_authenticated','lab_logos_update_authenticated',
                            'lab_logos_delete_authenticated')),
       (select count(*) from pg_policies where schemaname='storage'
         and policyname in ('lab_logos_upload_authenticated','lab_logos_update_authenticated',
                            'lab_logos_delete_authenticated')) = 0

-- ── R-03 · Views bypass RLS / granted to anon ───────────────────────────────
union all
select 'R-03', 'all public views enforce security_invoker',
       '0 bypassing',
       (select count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind='v'
           and coalesce((select option_value from pg_options_to_table(c.reloptions)
                         where option_name='security_invoker'),'off') not in ('on','true')),
       (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind='v'
           and coalesce((select option_value from pg_options_to_table(c.reloptions)
                         where option_name='security_invoker'),'off') not in ('on','true')) = 0
union all
select 'R-03', 'anon holds no SELECT on any public view',
       '0 grants',
       (select count(*)::text from information_schema.role_table_grants g
         join pg_class c on c.relname=g.table_name
         join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
         where g.table_schema='public' and g.grantee='anon'
           and g.privilege_type='SELECT' and c.relkind='v'),
       (select count(*) from information_schema.role_table_grants g
         join pg_class c on c.relname=g.table_name
         join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
         where g.table_schema='public' and g.grantee='anon'
           and g.privilege_type='SELECT' and c.relkind='v') = 0
union all
select 'R-03', 'anon holds no write grants in public schema',
       '0 grants',
       (select count(*)::text from information_schema.role_table_grants
         where table_schema='public' and grantee='anon'
           and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')),
       (select count(*) from information_schema.role_table_grants
         where table_schema='public' and grantee='anon'
           and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')) = 0

-- ── R-05 · Retention ────────────────────────────────────────────────────────
union all
select 'R-05', 'a retention/purge cron job exists',
       '>=1',
       (select count(*)::text from cron.job
         where command ~* '(delete|purge|retention|anonymi)'),
       (select count(*) from cron.job
         where command ~* '(delete|purge|retention|anonymi)') >= 1
-- NOTE: the next two checks are VACUOUS while their tables are empty — a purge
-- assertion that passes because there is no data is not evidence of retention.
-- They report VACUOUS unless the table actually holds rows.
union all
select 'R-05', 'phone_verifications not retained beyond 24h'
       || case when (select count(*) from public.phone_verifications) = 0
               then ' [VACUOUS: table empty]' else '' end,
       '0 stale rows',
       (select count(*)::text from public.phone_verifications
         where created_at < now() - interval '24 hours')
       || ' of ' || (select count(*)::text from public.phone_verifications) || ' rows',
       (select count(*) from public.phone_verifications) > 0
        and (select count(*) from public.phone_verifications
              where created_at < now() - interval '24 hours') = 0
union all
select 'R-05', 'gps_pings not retained beyond 90d'
       || case when (select count(*) from public.gps_pings) = 0
               then ' [VACUOUS: table empty]' else '' end,
       '0 stale rows',
       (select count(*)::text from public.gps_pings
         where recorded_at < now() - interval '90 days')
       || ' of ' || (select count(*)::text from public.gps_pings) || ' rows',
       (select count(*) from public.gps_pings) > 0
        and (select count(*) from public.gps_pings
              where recorded_at < now() - interval '90 days') = 0
union all
select 'R-05', 'storage_cleanup_queue is being consumed',
       'no unprocessed backlog',
       (select count(*)::text from public.storage_cleanup_queue where processed_at is null),
       (select count(*) from public.storage_cleanup_queue where processed_at is null) = 0

-- ── R-06 · Erasure completeness ─────────────────────────────────────────────
union all
select 'R-06', 'admin_anonymize_user clears identifiers beyond name/phone',
       'clears email/tckn/dob',
       case when (select pg_get_functiondef(p.oid) from pg_proc p
                  join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='admin_anonymize_user' limit 1)
                 ~* 'tc_kimlik_no' then 'yes' else 'no (name+phone only)' end,
       coalesce((select pg_get_functiondef(p.oid) from pg_proc p
                 join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='admin_anonymize_user' limit 1)
                ~* 'tc_kimlik_no', false)
union all
select 'R-06', 'admin_purge_lab_pii covers messages/logs/notifications',
       'covers order_messages',
       case when (select pg_get_functiondef(p.oid) from pg_proc p
                  join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='admin_purge_lab_pii' limit 1)
                 ~* 'order_messages' then 'yes' else 'no' end,
       coalesce((select pg_get_functiondef(p.oid) from pg_proc p
                 join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='admin_purge_lab_pii' limit 1)
                ~* 'order_messages', false)
union all
select 'R-06', 'unified erase_subject() routine exists',
       'exists',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='erase_subject'),
       (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='erase_subject') > 0

-- ── R-07 · Names embedded in free-text audit logs ───────────────────────────
union all
select 'R-07', 'activity_logs.action free of embedded personal names',
       '0 rows with "Label: Name" shape',
       (select count(*)::text from public.activity_logs
         where action ~ ':\s*\S+\s+\S+'),
       (select count(*) from public.activity_logs
         where action ~ ':\s*\S+\s+\S+') = 0
union all
select 'R-07', 'log_activity() no longer swallows all exceptions',
       'no bare WHEN OTHERS',
       case when (select pg_get_functiondef(p.oid) from pg_proc p
                  join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='log_activity' limit 1)
                 ~* 'WHEN OTHERS THEN RETURN NULL' then 'swallows' else 'ok' end,
       not coalesce((select pg_get_functiondef(p.oid) from pg_proc p
                     join pg_namespace n on n.oid=p.pronamespace
                     where n.nspname='public' and p.proname='log_activity' limit 1)
                    ~* 'WHEN OTHERS THEN RETURN NULL', true)

-- ── R-09 · AI governance ────────────────────────────────────────────────────
union all
select 'R-09', 'per-tenant AI kill switch present',
       'ai_assistant flag key in use',
       (select count(*)::text from public.lab_feature_flags where key='ai_assistant'),
       (select count(*) from public.lab_feature_flags where key='ai_assistant') > 0
union all
select 'R-09', 'AI disclosure log exists (Art.15 answerability)',
       'exists',
       (select count(*)::text from information_schema.tables
         where table_schema='public' and table_name='ai_disclosure_log'),
       (select count(*) from information_schema.tables
         where table_schema='public' and table_name='ai_disclosure_log') > 0

-- ── R-15 · Plaintext secrets ────────────────────────────────────────────────
union all
select 'R-15', 'phone_verifications.code plaintext column dropped',
       'column absent',
       (select count(*)::text from information_schema.columns
         where table_schema='public' and table_name='phone_verifications' and column_name='code'),
       (select count(*) from information_schema.columns
         where table_schema='public' and table_name='phone_verifications' and column_name='code') = 0
union all
select 'R-15', 'phone_verifications.code_hash present',
       'column exists',
       (select count(*)::text from information_schema.columns
         where table_schema='public' and table_name='phone_verifications' and column_name='code_hash'),
       (select count(*) from information_schema.columns
         where table_schema='public' and table_name='phone_verifications' and column_name='code_hash') > 0

-- ── R-19 · Broken / undetermined storage paths ──────────────────────────────
union all
select 'R-19', 'purchase-invoices bucket exists (referenced in code)',
       'exists',
       (select count(*)::text from storage.buckets where id='purchase-invoices'),
       (select count(*) from storage.buckets where id='purchase-invoices') > 0

-- ── R-21 · Orphaned storage objects ─────────────────────────────────────────
union all
select 'R-21', 'no orphaned objects under work-order-photos/orders/',
       '0 orphans',
       (select count(*)::text from storage.objects o
         where o.bucket_id='work-order-photos' and split_part(o.name,'/',1)='orders'
           and not exists (select 1 from public.work_orders w
                           where w.id::text = split_part(o.name,'/',2))),
       (select count(*) from storage.objects o
         where o.bucket_id='work-order-photos' and split_part(o.name,'/',1)='orders'
           and not exists (select 1 from public.work_orders w
                           where w.id::text = split_part(o.name,'/',2))) = 0
union all
select 'R-21', 'no unattributable legacy-prefix objects',
       '0 legacy',
       (select count(*)::text from storage.objects
         where bucket_id='work-order-photos'
           and split_part(name,'/',1) not in ('orders','drafts')),
       (select count(*) from storage.objects
         where bucket_id='work-order-photos'
           and split_part(name,'/',1) not in ('orders','drafts')) = 0
union all
select 'R-21', 'no orphaned chat-attachments',
       '0 orphans',
       (select count(*)::text from storage.objects o
         where o.bucket_id='chat-attachments'
           and not exists (select 1 from public.work_orders w
                           where w.id::text = split_part(o.name,'/',1))),
       (select count(*) from storage.objects o
         where o.bucket_id='chat-attachments'
           and not exists (select 1 from public.work_orders w
                           where w.id::text = split_part(o.name,'/',1))) = 0
)
select finding,
       chk        as check_name,
       expected,
       actual,
       case when ok then 'PASS' else 'FAIL' end as status
from checks
order by finding, chk;
