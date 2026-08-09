-- ============================================================================
--  Siman — Database performance optimisations (Phase 9)
--
--  STATUS:  P1 ✅ applied · P0 (work_orders) ✅ applied · P6 ✅ investigated, benign
--           P0b (JWT hook), P2, P3, P4, P5 ⏸ NOT applied — still need review.
--           Details in the dated blocks below.
--
--  Every statement was derived from measurements on the live project
--  (pg_stat_statements, pg_stat_user_tables, pg_stat_user_indexes, pg_policies,
--  EXPLAIN ANALYZE under `role authenticated`). Evidence is cited inline.
--
--  ⚠️  Sections P0 and P2 change RLS policies and therefore change who can see
--  what. Per the project's change-safety rule they must be reviewed and approved
--  before being run, and verified afterwards (visibility diff on live data +
--  tests/performance/multitenant.js with isolation violations at exactly 0).
--  The work_orders part of P0 has been through exactly that; P2 has not.
--
--  Recommended order:  P1 (safe) → P0 (high value, needs review) → P3 → P4
--
--  ── APPLIED 2026-08-01 ─────────────────────────────────────────────────────
--  Section P1 (missing indexes) is FULLY APPLIED to production, with approval.
--    · Pass 1: 33 hot-path indexes, CREATE INDEX CONCURRENTLY (no lock)
--    · Pass 2: 110 remaining indexes, plain CREATE INDEX (all tables < 600 rows)
--    · Unindexed foreign keys: 143 → 0.  Invalid indexes: 0.
--    · Verified plan change on the order-detail hot path:
--        work_order_photos WHERE work_order_id = …
--          before: Seq Scan   (5,297 seq scans for 125 rows)
--          after:  Index Scan using idx_work_order_photos_work_order
--    · idx_work_orders_lab_created was deliberately NOT created — it would be
--      unused until P0 makes lab_id sargable (same reason idx_work_orders_active
--      has 0 scans today).
--    · FOLLOW-UP: re-check pg_stat_user_indexes in a few weeks and drop what is
--      still unused. 64 indexes were already unused before this change.
--
--  ── P0 APPLIED 2026-08-02 ───────────────────────────────────────────────────
--  Section P0 (RLS consolidation) IS NOW LIVE, with approval, plus two dashboard
--  aggregate RPCs (dashboard_pipeline_counts / dashboard_activity_series).
--
--    work_orders SELECT policies : 4 permissive → 1
--    production plan (22 rows)   : 2.950 ms / 310 buf → 0.931 ms / 13 buf
--    helper functions            : per-row → InitPlan (once per query)
--
--  Post-apply visibility check against LIVE RLS, per user type:
--    lab/technician 19=19 · doctor 15=15 · clinic_admin 15=15 ·
--    second-lab admin 3=3 (isolated) · clinic_admin-no-orders 0=0
--
--  RPC tenant guard verified by execution:
--    lab 19 · other lab 3 · doctor 0 rows · clinic_admin 0 rows
--
--  P0 pre-flight checks (run on LIVE production data before applying):
--    · technicians with a stage outside their own lab            : 0
--    · orders with NULL lab_id or NULL doctor_id                 : 0
--    · (user, order) pairs that would LOSE access                : 0
--    · total visible pairs, old vs new                           : 210 = 210
--  And on the branch: 260× faster, 465× less I/O, 0 isolation violations
--  across 222 active cross-tenant probes.
--
--  STILL NOT APPLIED from P0: the JWT access-token hook (§P0b) and the
--  (select …) wrapping for the OTHER tables (profiles, order_stages,
--  payment_submissions, doctors) — only work_orders was consolidated.
--
--  ── DOWNGRADED 2026-08-01 ───────────────────────────────────────────────────
--  Section P6 (schema-cache reloads) turned out to be BENIGN — see the note in
--  that section. No action required.
--
--  Sections P2, P3, P4, P5 are NOT applied and still require review.
-- ============================================================================


-- ============================================================================
--  P1 · MISSING INDEXES  (safe, additive, no behaviour change)
--
--  143 foreign keys have no covering index. Every one of them makes a lookup by
--  that column a sequential scan, and makes a parent DELETE scan the whole child
--  table. Below are the ones on measured hot paths; the full list is in
--  docs/performance-analysis.md §2.4.
--
--  CONCURRENTLY avoids taking a write lock. It cannot run inside a transaction,
--  so run these one at a time, not as a migration block.
-- ============================================================================

-- work_order_photos.work_order_id
--   Evidence: 5,297 seq scans for 125 rows, avg 53 rows read per scan.
--   Hit on every order-detail open (userflows F4).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_order_photos_work_order
  ON public.work_order_photos (work_order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_order_photos_uploaded_by
  ON public.work_order_photos (uploaded_by);

-- status_history.work_order_id — order-detail timeline
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_status_history_work_order
  ON public.status_history (work_order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_status_history_changed_by
  ON public.status_history (changed_by);

-- order_messages — 11,463 seq scans for 66 rows; chat inbox is 17 % of traffic
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_messages_sender
  ON public.order_messages (sender_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_messages_approved_by
  ON public.order_messages (approved_by);

-- work_orders — 7 unindexed FKs on the hottest table in the system
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_orders_assigned_to
  ON public.work_orders (assigned_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_orders_triaged_by
  ON public.work_orders (triaged_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_orders_box
  ON public.work_orders (box_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_orders_doctors_id
  ON public.work_orders (doctors_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_orders_archived_by
  ON public.work_orders (archived_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_orders_triage_approved_by
  ON public.work_orders (triage_approved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_orders_approval_decided_by
  ON public.work_orders (doctor_approval_decided_by);

-- order_stages — 39,527 seq scans; the production board reads this constantly
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_stages_approved_by
  ON public.order_stages (approved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_stages_skipped_by
  ON public.order_stages (skipped_by);

-- order_items
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_lab
  ON public.order_items (lab_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_service
  ON public.order_items (service_id);

-- stage_photos — 3 unindexed FKs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stage_photos_work_order
  ON public.stage_photos (work_order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stage_photos_stage
  ON public.stage_photos (stage_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stage_photos_uploaded_by
  ON public.stage_photos (uploaded_by);

-- stage_material_selections — 6 unindexed FKs, all on the material-consumption path
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sms_stock_item
  ON public.stage_material_selections (stock_item_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sms_movement
  ON public.stage_material_selections (movement_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sms_technician
  ON public.stage_material_selections (technician_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sms_production_material
  ON public.stage_material_selections (production_material_id);

-- notifications.lab_id + activity_logs.lab_id — tenant-scoped reads on growing tables
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_lab
  ON public.notifications (lab_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_logs_lab
  ON public.activity_logs (lab_id, created_at DESC);

-- fifo — lock-contention path (userflows F10)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fifo_layers_lab
  ON public.fifo_layers (lab_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fifo_allocations_layer
  ON public.fifo_allocations (layer_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fifo_allocations_lab
  ON public.fifo_allocations (lab_id);

-- support_tickets.lab_id, payment_intents, payment_submissions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_support_tickets_lab
  ON public.support_tickets (lab_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_submissions_doctor
  ON public.payment_submissions (doctor_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_intents_clinic
  ON public.payment_intents (clinic_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_intents_doctor
  ON public.payment_intents (doctor_id);

-- Composite covering the actual dashboard access pattern
--   (lab_id, status, created_at DESC) serves both the pipeline count and the
--   six-month list — but ONLY once P0 makes lab_id sargable. Adding it before
--   P0 will leave it unused, exactly like idx_work_orders_active is today.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_orders_lab_created
  ON public.work_orders (lab_id, created_at DESC)
  WHERE is_archived = false;


-- ============================================================================
--  P0 · RLS INITPLAN  (highest value; changes plans, not semantics)
--
--  142 policies call auth.uid() / helper functions WITHOUT wrapping them in a
--  scalar subquery. Postgres treats an unwrapped STABLE function reference in a
--  policy as row-dependent and re-evaluates it PER ROW. Wrapping it in
--  `(select …)` turns it into a one-shot InitPlan.
--
--  Evidence: profiles has 12,864,046 index scans for 17 rows — that is the
--  helper functions firing per row, per policy, per query.
--
--  This is semantically identical: the function is STABLE, so its value cannot
--  change within a statement. What changes is how many times it is called.
--
--  Below is the pattern plus the two highest-traffic tables done explicitly.
--  Apply the same transform to the remaining 140 (list them with the query at
--  the bottom of this file).
-- ============================================================================

-- Pattern:
--   BEFORE:  USING ( my_user_type() = 'lab' AND lab_id = get_my_lab_id() )
--   AFTER:   USING ( (select my_user_type()) = 'lab' AND lab_id = (select get_my_lab_id()) )

-- ── work_orders ─────────────────────────────────────────────────────────────
-- Current SELECT policies (4, all PERMISSIVE → OR-ed together):
--   wo_lab_select, "Doctors see own orders",
--   clinic_admin_view_clinic_orders, work_orders_assigned_technician_read
--
-- Measured, same query, same 22 rows:
--   role postgres        → Index Only Scan  0.202 ms,  3 buffers
--   role authenticated   → Seq Scan         2.950 ms, 310 buffers   (14.6× slower)
--
-- Two defects, both fixed by the consolidation below:
--   (a) `lab_id = get_my_lab_id()` sits inside an OR branch, so the planner
--       cannot use it as an index condition — the tenant filter is unusable.
--   (b) `is_technician_on_order(id)` takes the row's own id, is evaluated first,
--       and can never be hoisted out of the per-row filter.

BEGIN;

DROP POLICY IF EXISTS "wo_lab_select"                        ON public.work_orders;
DROP POLICY IF EXISTS "Doctors see own orders"               ON public.work_orders;
DROP POLICY IF EXISTS "clinic_admin_view_clinic_orders"      ON public.work_orders;
DROP POLICY IF EXISTS "work_orders_assigned_technician_read" ON public.work_orders;

-- ONE policy. The tenant predicate is the leading, index-usable conjunct for the
-- lab/admin/technician case; the clinic/doctor cases are separated so their
-- branches never force a scan for lab users.
CREATE POLICY wo_select_consolidated ON public.work_orders
  FOR SELECT
  USING (
    -- Lab staff, admins and technicians: pure tenant match. Index-usable.
    (
      (select my_user_type()) = ANY (ARRAY['lab', 'admin'])
      AND lab_id = (select get_my_lab_id())
    )
    OR
    -- Doctor: own orders only.
    (
      (select my_user_type()) = 'doctor'
      AND doctor_owns_order_doctor(doctor_id)
    )
    OR
    -- Clinic admin: orders from doctors in their clinic.
    (
      (select is_clinic_admin())
      AND (select my_clinic_id()) IS NOT NULL
      AND (
        doctor_id IN (SELECT p.id FROM public.profiles p WHERE p.clinic_id = (select my_clinic_id()))
        OR
        doctor_id IN (SELECT d.id FROM public.doctors  d WHERE d.clinic_id = (select my_clinic_id()))
      )
    )
  );

-- NOTE on technicians: the old policy allowed a technician to read ANY order
-- they had a stage on, via is_technician_on_order(id). The consolidated policy
-- covers technicians through the lab branch, because a technician's profile has
-- user_type='lab'. VERIFY THIS against your data before applying:
--
--   select user_type, role, count(*) from profiles group by 1,2;
--
-- If technicians must be restricted to *only* their assigned orders rather than
-- the whole lab, keep a separate RESTRICTIVE policy instead of a permissive one:
--
--   CREATE POLICY wo_technician_scope ON public.work_orders
--     AS RESTRICTIVE FOR SELECT
--     USING ( (select my_role()) <> 'technician' OR is_technician_on_order(id) );
--
-- A RESTRICTIVE policy is AND-ed, so it narrows without destroying the index
-- condition in the permissive policy above.

COMMIT;

-- ── profiles ────────────────────────────────────────────────────────────────
-- 8 policies, 4 of them SELECT. This table is read by every RLS predicate on
-- every other table, so its own policy cost is multiplied system-wide.
-- Inspect and rewrite with the same (select …) transform:
--
--   select policyname, cmd, qual from pg_policies
--   where schemaname='public' and tablename='profiles' order by cmd;


-- ============================================================================
--  P0b · PUT lab_id IN THE JWT  (removes the profiles lookup entirely)
--
--  The real fix. Today the JWT carries only `sub`; user_type / lab_id / clinic_id
--  are read from `profiles` inside every RLS predicate. A custom access-token
--  hook puts them in the token, so the helper functions become pure claim reads
--  with no table access at all.
--
--  Supabase: Dashboard → Authentication → Hooks → Customize Access Token (JWT).
--  Register the function below, then rewrite the helpers to read the claim first
--  and fall back to profiles (so existing sessions keep working during rollout).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  claims jsonb;
  p      record;
BEGIN
  SELECT user_type, role, lab_id, clinic_id
    INTO p
    FROM public.profiles
   WHERE id = (event->>'user_id')::uuid;

  claims := COALESCE(event->'claims', '{}'::jsonb);

  IF p IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_type}', to_jsonb(COALESCE(p.user_type, '')));
    claims := jsonb_set(claims, '{user_role}', to_jsonb(COALESCE(p.role, '')));
    claims := jsonb_set(claims, '{lab_id}',    to_jsonb(COALESCE(p.lab_id::text, '')));
    claims := jsonb_set(claims, '{clinic_id}', to_jsonb(COALESCE(p.clinic_id::text, '')));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;

-- Claim-first helper. Falls back to the table so sessions issued before the hook
-- was enabled continue to work. Delete the fallback once all tokens have rotated
-- (max session lifetime).
CREATE OR REPLACE FUNCTION public.get_my_lab_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'lab_id', '')::uuid,
    (SELECT lab_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
  );
$$;

-- Verify with tests/performance/smoke.js — api/auth.js:checkJwtClaims() asserts
-- the claim is present.


-- ============================================================================
--  P2 · MULTIPLE PERMISSIVE POLICIES  (512 advisor warnings)
--
--  Permissive policies for the same (table, command, role) are OR-ed, and EVERY
--  one is evaluated for EVERY row. Merging N permissive policies into 1 reduces
--  per-row work by roughly N×.
--
--  Find the worst offenders:
-- ============================================================================

-- SELECT tablename, cmd, count(*) AS permissive_policies,
--        string_agg(policyname, ', ' ORDER BY policyname) AS policies
--   FROM pg_policies
--  WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
--  GROUP BY tablename, cmd
-- HAVING count(*) > 1
--  ORDER BY count(*) DESC;

-- Known counts (analysis §1.6): work_orders 11 policies (4 SELECT),
-- order_stages 9 (5 SELECT), payment_submissions 9 (4 SELECT),
-- doctors 8 (2 SELECT), profiles 8 (4 SELECT).


-- ============================================================================
--  P3 · UNUSED INDEXES  (64 with zero scans — pure write amplification)
--
--  Each one is maintained on every INSERT/UPDATE and occupies buffer cache.
--  DROP CONCURRENTLY is safe and reversible.
--
--  ⚠️  Two caveats before dropping:
--    1. idx_scan counters reset on restart / pg_stat_reset(). Confirm the counter
--       has been accumulating long enough to be meaningful.
--    2. Some are unused BECAUSE of the RLS problem, not because the query pattern
--       is wrong — idx_work_orders_active and idx_invoices_lab are exactly that.
--       Re-check them AFTER P0; they will likely start being used.
-- ============================================================================

-- Largest first. tr_mahalleler is a static Turkish address table (73,305 rows,
-- 18 MB) — its 6 MB of unused indexes are the single biggest easy win in bytes.
DROP INDEX CONCURRENTLY IF EXISTS public.idx_tr_mah_mahalle;   -- 5192 kB, 0 scans
DROP INDEX CONCURRENTLY IF EXISTS public.idx_tr_mah_pk;        --  840 kB, 0 scans

-- DO NOT drop these until P0 is applied and re-measured:
--   idx_work_orders_active   -- 0 scans, but RLS is why (see §2.1)
--   idx_invoices_lab         -- 0 scans while invoices does 32,118 seq scans

-- Full list:
-- SELECT s.relname, s.indexrelname, pg_size_pretty(pg_relation_size(s.indexrelid))
--   FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
--  WHERE s.idx_scan = 0 AND NOT i.indisprimary AND NOT i.indisunique
--    AND s.schemaname = 'public'
--  ORDER BY pg_relation_size(s.indexrelid) DESC;


-- ============================================================================
--  P4 · REALTIME PUBLICATION  (58 % of all DB time — analysis §2.2)
--
--  17 tables are published. Every write to any of them is WAL-decoded, converted
--  to JSON, and RLS-evaluated once per subscribed connection.
--
--  Measured: 1,088,313 walrus calls, 5,686,837 ms total, max 5,572 ms — with ONE
--  tenant and 22 orders.
--
--  Ask of each table: does the UI genuinely need a live push, or would a refetch
--  on focus (core/hooks/useAppResume) do? Candidates to remove:
--    · activity_logs        — an audit log; nobody watches it live
--    · profiles             — changes are rare; refetch on focus
--    · stock_movements      — stock_items already publishes the resulting qty
--    · equipment            — low change rate
--    · whatsapp_sessions    — server-side only
--    · gps_pings            — highest write rate in the system; consider a
--                             dedicated lower-frequency channel or polling
-- ============================================================================

-- ALTER PUBLICATION supabase_realtime DROP TABLE public.activity_logs;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.stock_movements;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.equipment;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.whatsapp_sessions;

-- Current state:
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
--  ORDER BY tablename;

-- Also: lib/supabase.ts appends a random suffix to every channel name, so channels
-- can never be reused. realtime.subscription shows 32,022 inserts / 31,984 deletes
-- for 38 live rows — pure mount/unmount churn. Fixing the underlying duplicate-
-- channel bug and removing the patch would cut this at the source.


-- ============================================================================
--  P5 · CRON & TRIGGER LOAD
-- ============================================================================

-- auto_manage_shift_pauses(): 16,503 calls × 19.06 ms = 314,557 ms — the 3rd most
-- expensive statement on the instance, running every 5 minutes.
-- Consider */15 or */30 if the business rule tolerates it:
--
--   SELECT cron.alter_job(1, schedule => '*/15 * * * *');
--
-- Current jobs:
--   SELECT jobid, schedule, command, active FROM cron.job ORDER BY jobid;

-- work_orders has 13 triggers; order_stages 8; stock_movements 6. Order creation
-- writes ~37 activity_logs rows (600 rows for 22 orders). All inside the user's
-- transaction. Moving notification dispatch to pgmq would decouple order-create
-- latency from e-mail/WhatsApp/push:
--
--   SELECT c.relname, count(*) AS triggers
--     FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--     JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND NOT t.tgisinternal
--    GROUP BY 1 ORDER BY 2 DESC;


-- ============================================================================
--  P6 · POSTGREST SCHEMA-CACHE RELOADS  (~672 s of DB CPU)
--
--  `SELECT name FROM pg_timezone_names` ran 2,071 times at mean 134 ms — that
--  query only executes on a schema reload. Each reload also runs the full
--  introspection set (81 + 54 + 28 + 27 + 11 ms means, plus a 318 ms function
--  introspection over 401 functions), and PostgREST STALLS while it happens.
--
--  ⚠️  INVESTIGATED 2026-08-01 — BENIGN. NO ACTION REQUIRED.
--
--  All 401 public functions were checked for runtime DDL (CREATE TEMP, dynamic
--  EXECUTE 'CREATE …', CREATE INDEX, ALTER TABLE, DROP): ZERO hits. The only
--  reload trigger is Supabase's stock `pgrst_ddl_watch` on ddl_command_end —
--  i.e. migration deployments, not application traffic.
--
--  Confirmed empirically: applying 143 CREATE INDEX statements today moved the
--  counter from 2,071 to only 2,082, so PostgREST debounces heavily.
--
--  Conclusion: the ~672 s is amortised deployment cost across the project's
--  entire history, NOT an ongoing production latency source. The queries below
--  are kept for reference only.
-- ============================================================================

-- Look for the event trigger and what fires it:
-- SELECT evtname, evtevent, evtfoid::regproc FROM pg_event_trigger;

-- Look for functions that execute DDL at runtime (temp tables are the usual
-- culprit — they are DDL and they fire the reload notification):
-- SELECT n.nspname, p.proname
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public'
--    AND (p.prosrc ILIKE '%create temp%' OR p.prosrc ILIKE '%create temporary%'
--         OR p.prosrc ILIKE '%execute ''create%');


-- ============================================================================
--  VERIFICATION — run before and after, compare
-- ============================================================================

-- 1. The headline measurement. Replace the uuid with a real lab-user id.
--    Expect: Seq Scan → Index Scan, and execution time to drop by ~10×.
--
-- BEGIN;
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<lab-user-uuid>","role":"authenticated"}';
--   EXPLAIN (ANALYZE, BUFFERS)
--     SELECT status, delivery_date FROM work_orders WHERE status <> 'iptal';
-- ROLLBACK;

-- 2. Per-row helper calls should collapse to a handful.
--    profiles.idx_scan was 12,864,046 for 17 rows before P0.
-- SELECT relname, seq_scan, idx_scan, n_live_tup FROM pg_stat_user_tables
--  WHERE relname IN ('profiles','work_orders','order_stages','invoices');

-- 3. Advisor counts should fall from 655 WARN.
--    (Supabase Dashboard → Advisors → Performance)

-- 4. Reset counters, run tests/performance/load.js, compare:
-- SELECT pg_stat_statements_reset();
-- SELECT pg_stat_reset();

-- 5. Isolation must be unchanged. Any non-zero result here is a P0 regression:
--    k6 run tests/performance/multitenant.js   → tenant_isolation_violations == 0
