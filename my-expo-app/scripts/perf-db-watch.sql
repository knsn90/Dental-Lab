-- Read-only database snapshot, for running alongside a k6 load test.
--
--   watch -n10 'psql "$DATABASE_URL" -f scripts/perf-db-watch.sql'
--
-- The psql form of scripts/perf-db-watch.mjs, for when you have a direct
-- connection string and no exec_sql RPC. Safe against production.

\pset border 2
\pset title 'connection headroom'
SELECT
  (SELECT count(*) FROM pg_stat_activity)                                   AS used,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections')     AS max_conn,
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'active')            AS active,
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle')              AS idle,
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction') AS idle_in_txn,
  round(100.0 * (SELECT count(*) FROM pg_stat_activity)
        / (SELECT setting::int FROM pg_settings WHERE name = 'max_connections'), 1) AS pct_used;

\pset title 'wait events'
SELECT wait_event_type, wait_event, count(*) AS n
  FROM pg_stat_activity
 WHERE wait_event IS NOT NULL AND datname = current_database()
 GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10;

\pset title 'blocked locks'
SELECT l.locktype, l.relation::regclass AS rel, l.mode, a.pid,
       round(extract(epoch FROM now() - a.query_start)::numeric, 1) AS waiting_s,
       left(regexp_replace(a.query, '\s+', ' ', 'g'), 70) AS query
  FROM pg_locks l
  LEFT JOIN pg_stat_activity a ON a.pid = l.pid
 WHERE NOT l.granted
 ORDER BY waiting_s DESC NULLS LAST LIMIT 10;

\pset title 'longest running queries'
SELECT pid, state,
       round(extract(epoch FROM now() - query_start)::numeric, 1) AS running_s,
       wait_event_type, wait_event,
       left(regexp_replace(query, '\s+', ' ', 'g'), 90) AS query
  FROM pg_stat_activity
 WHERE state = 'active' AND datname = current_database()
   AND query NOT ILIKE '%pg_stat_activity%'
 ORDER BY query_start LIMIT 10;

\pset title 'slowest statements (mean)'
SELECT calls,
       round(mean_exec_time::numeric, 2)  AS mean_ms,
       round(total_exec_time::numeric, 0) AS total_ms,
       round(max_exec_time::numeric, 0)   AS max_ms,
       left(regexp_replace(query, '\s+', ' ', 'g'), 90) AS query
  FROM pg_stat_statements
 WHERE query NOT ILIKE '%pg_stat%'
 ORDER BY mean_exec_time DESC LIMIT 10;

\pset title 'hot tables — seq scans are the RLS signal'
SELECT relname, n_live_tup, seq_scan, idx_scan,
       CASE WHEN seq_scan > 0 THEN round(seq_tup_read::numeric / seq_scan, 0) END AS rows_per_seqscan,
       pg_size_pretty(pg_total_relation_size(relid)) AS size
  FROM pg_stat_user_tables
 WHERE schemaname = 'public'
 ORDER BY seq_scan DESC LIMIT 12;

\pset title 'replication slots (realtime lag)'
SELECT slot_name, active,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS lag
  FROM pg_replication_slots;

\pset title 'cache hit ratio'
SELECT round(sum(heap_blks_hit) * 100.0
             / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) AS heap_hit_pct
  FROM pg_statio_user_tables;
