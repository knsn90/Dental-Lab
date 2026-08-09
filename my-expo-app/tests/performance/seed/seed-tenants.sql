-- ============================================================================
--  Seed a realistic multi-tenant dataset for load testing.
--
--  ⚠️  STAGING ONLY. This inserts hundreds of thousands of rows.
--      Run it against a Supabase branch or a separate project — never against
--      kjwjxqfdsxkxgcgophdy (production).
--
--  Why the scale matters: the RLS Seq Scan cost (docs/performance-analysis.md
--  §2.1) is driven by TOTAL rows across all tenants, not by the caller's own
--  tenant. Load-testing against 22 orders measures nothing. The default here —
--  100 labs × 5,000 orders = 500,000 work_orders — is the scale at which the
--  analysis predicts the system stops working, so it is the scale worth testing.
--
--  Runtime: roughly 10–30 minutes on a small instance, dominated by the 13
--  triggers on work_orders. That trigger cost IS the point; do not disable them
--  or you will seed a database that behaves nothing like production.
--
--  Usage (psql):
--    \set tenants 100
--    \set orders_per_tenant 5000
--    \i tests/performance/seed/seed-tenants.sql
-- ============================================================================

\set ON_ERROR_STOP on

-- Guard: refuse to run on the production project.
DO $$
BEGIN
  IF current_database() = 'postgres'
     AND EXISTS (SELECT 1 FROM public.labs WHERE created_at < now() - interval '30 days')
     AND coalesce(current_setting('app.seed_force', true), '') <> 'yes'
  THEN
    RAISE WARNING 'This database has labs older than 30 days — it may be production.';
    RAISE WARNING 'If you are sure, run:  SET app.seed_force = ''yes'';  and re-run.';
    RAISE EXCEPTION 'Aborting seed for safety.';
  END IF;
END $$;

\set tenants 100
\set orders_per_tenant 5000

-- Everything seeded is tagged so teardown is exact.
\set seed_tag 'k6-seed'

BEGIN;

-- ── 1. Labs ─────────────────────────────────────────────────────────────────
INSERT INTO public.labs (id, name, created_at)
SELECT
  gen_random_uuid(),
  'K6 Seed Lab ' || g,
  now() - (g || ' days')::interval
FROM generate_series(0, :tenants - 1) g
ON CONFLICT DO NOTHING;

-- ── 2. Clinics — 25 per lab ─────────────────────────────────────────────────
INSERT INTO public.clinics (id, name, lab_id, created_at)
SELECT
  gen_random_uuid(),
  'K6 Clinic ' || l.idx || '-' || c,
  l.id,
  now() - (c || ' days')::interval
FROM (
  SELECT id, row_number() OVER (ORDER BY name) - 1 AS idx
  FROM public.labs WHERE name LIKE 'K6 Seed Lab %'
) l
CROSS JOIN generate_series(1, 25) c
ON CONFLICT DO NOTHING;

-- ── 3. Doctors — 60 per lab, spread across its clinics ──────────────────────
INSERT INTO public.doctors (id, full_name, clinic_id, lab_id, is_active, created_at)
SELECT
  gen_random_uuid(),
  'K6 Dr. ' || d,
  c.id,
  c.lab_id,
  true,
  now()
FROM (
  SELECT id, lab_id, row_number() OVER (PARTITION BY lab_id ORDER BY name) AS n
  FROM public.clinics WHERE name LIKE 'K6 Clinic %'
) c
CROSS JOIN generate_series(1, 3) d
WHERE c.n <= 20
ON CONFLICT DO NOTHING;

-- ── 4. Stock items — 40 per lab ─────────────────────────────────────────────
INSERT INTO public.stock_items (id, name, lab_id, quantity, min_quantity, unit, created_at)
SELECT
  gen_random_uuid(),
  'K6 Material ' || s,
  l.id,
  1000,
  50,
  (ARRAY['adet', 'gr', 'ml', 'paket'])[1 + (s % 4)],
  now()
FROM public.labs l
CROSS JOIN generate_series(1, 40) s
WHERE l.name LIKE 'K6 Seed Lab %'
ON CONFLICT DO NOTHING;

COMMIT;

-- ── 5. Work orders ──────────────────────────────────────────────────────────
--  Committed in batches per lab so a failure does not roll back hours of work,
--  and so the 13 triggers per row do not build one enormous transaction.
DO $seed$
DECLARE
  lab      record;
  n        int := :orders_per_tenant;
  statuses text[] := ARRAY['alindi','kutu_atandi','atama_bekleniyor','asamada','uretimde',
                           'kalite_kontrol','teslimata_hazir','kurye_bekleniyor','kuryede',
                           'teslim_edildi'];
  types    text[] := ARRAY['Zirkonyum Kron','Metal Destekli Porselen','E-max Laminate',
                           'Tam Protez','Bölümlü Protez','İmplant Üstü Kron','Hibrit Protez'];
  done     int := 0;
BEGIN
  FOR lab IN SELECT id, name FROM public.labs WHERE name LIKE 'K6 Seed Lab %' ORDER BY name
  LOOP
    INSERT INTO public.work_orders (
      order_number, lab_id, doctor_id, patient_name, tooth_numbers, work_type,
      machine_type, status, delivery_date, created_at, updated_at,
      priority, complexity, is_urgent, external_source, notes
    )
    SELECT
      'K6-' || substr(lab.id::text, 1, 8) || '-' || lpad(g::text, 6, '0'),
      lab.id,
      (SELECT d.id FROM public.doctors d
        JOIN public.clinics c ON c.id = d.clinic_id
       WHERE c.lab_id = lab.id ORDER BY random() LIMIT 1),
      'ZZK6 Patient ' || g,
      ARRAY[11 + (g % 8), 21 + (g % 8)]::int[],
      types[1 + (g % array_length(types, 1))],
      (CASE WHEN g % 2 = 0 THEN 'milling' ELSE '3d_printing' END)::machine_type,
      (statuses[1 + (g % array_length(statuses, 1))])::work_order_status,
      current_date + ((g % 30) - 10),
      -- Spread over 12 months so date-range reports have something to scan.
      now() - ((g % 365) || ' days')::interval - ((g % 24) || ' hours')::interval,
      now() - ((g % 365) || ' days')::interval,
      (ARRAY['low','normal','high'])[1 + (g % 3)],
      (ARRAY['low','medium','high'])[1 + (g % 3)],
      (g % 9 = 0),
      :'seed_tag',
      'Seeded by seed-tenants.sql — safe to delete'
    FROM generate_series(1, n) g;

    done := done + 1;
    RAISE NOTICE 'seeded lab % (%/%)', lab.name, done, :tenants;
  END LOOP;
END
$seed$;

-- ── 6. Order items — 1–3 per order ──────────────────────────────────────────
INSERT INTO public.order_items (work_order_id, lab_id, quantity, unit_price, currency)
SELECT w.id, w.lab_id, 1 + (i % 3), 500 + (i * 137) % 4000, 'TRY'
FROM public.work_orders w
CROSS JOIN generate_series(1, 2) i
WHERE w.external_source = :'seed_tag';

-- ── 7. Statistics ───────────────────────────────────────────────────────────
--  Without this the planner has stale estimates and EXPLAIN output is misleading.
ANALYZE public.work_orders;
ANALYZE public.order_items;
ANALYZE public.doctors;
ANALYZE public.clinics;
ANALYZE public.labs;
ANALYZE public.stock_items;

-- ── 8. Emit tenants.json for make-users.mjs ─────────────────────────────────
--  Save this output to tests/performance/seed/tenants.json.
SELECT json_agg(
         json_build_object(
           'tenant', idx,
           'lab_id', id,
           'clinic_id', (SELECT c.id FROM public.clinics c WHERE c.lab_id = l.id LIMIT 1)
         ) ORDER BY idx
       ) AS tenants_json
FROM (
  SELECT id, name, row_number() OVER (ORDER BY name) - 1 AS idx
  FROM public.labs WHERE name LIKE 'K6 Seed Lab %'
) l;

-- ── 9. Verify the scale you actually got ────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.labs        WHERE name LIKE 'K6 Seed Lab %') AS labs,
  (SELECT count(*) FROM public.clinics     WHERE name LIKE 'K6 Clinic %')   AS clinics,
  (SELECT count(*) FROM public.doctors     WHERE full_name LIKE 'K6 Dr. %') AS doctors,
  (SELECT count(*) FROM public.work_orders WHERE external_source = :'seed_tag') AS orders,
  (SELECT count(*) FROM public.stock_items WHERE name LIKE 'K6 Material %') AS stock_items,
  pg_size_pretty(pg_total_relation_size('public.work_orders')) AS work_orders_size;


-- ============================================================================
--  TEARDOWN — run this to remove everything seeded above.
--
--  Slow by construction: 143 unindexed FKs (analysis §2.4) mean every parent
--  DELETE sequentially scans each child table. Apply the P1 indexes from
--  docs/db-optimizations.sql first and this gets dramatically faster.
-- ============================================================================
--
-- BEGIN;
--   DELETE FROM public.order_items
--    WHERE work_order_id IN (SELECT id FROM public.work_orders WHERE external_source = 'k6-seed');
--   DELETE FROM public.work_order_photos
--    WHERE work_order_id IN (SELECT id FROM public.work_orders WHERE external_source = 'k6-seed');
--   DELETE FROM public.order_messages
--    WHERE work_order_id IN (SELECT id FROM public.work_orders WHERE external_source = 'k6-seed');
--   DELETE FROM public.order_stages
--    WHERE work_order_id IN (SELECT id FROM public.work_orders WHERE external_source = 'k6-seed');
--   DELETE FROM public.status_history
--    WHERE work_order_id IN (SELECT id FROM public.work_orders WHERE external_source = 'k6-seed');
--   DELETE FROM public.work_orders WHERE external_source = 'k6-seed';
--   DELETE FROM public.stock_items WHERE name LIKE 'K6 Material %';
--   DELETE FROM public.doctors     WHERE full_name LIKE 'K6 Dr. %';
--   DELETE FROM public.clinics     WHERE name LIKE 'K6 Clinic %';
--   DELETE FROM public.labs        WHERE name LIKE 'K6 Seed Lab %';
-- COMMIT;
--
-- Auth users created by make-users.mjs are removed separately:
--   DELETE FROM auth.users WHERE email LIKE 'k6.t%@perf.invalid';
