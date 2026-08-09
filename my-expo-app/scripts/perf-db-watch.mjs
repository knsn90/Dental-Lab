#!/usr/bin/env node
/**
 * Sample database-side state while a k6 run is in progress.
 *
 * k6 measures what the client sees. This measures what the database is doing —
 * connections, wait events, locks, table growth, replication lag and the slowest
 * statements — so a latency spike can be attributed to a cause rather than
 * guessed at.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   node scripts/perf-db-watch.mjs --interval 10 --out tests/performance/results/db-watch.jsonl
 *
 * Read-only. Safe to run against production while a smoke test executes.
 *
 * Requires an `exec_sql`-style RPC, or run it through psql instead:
 *   watch -n10 'psql "$DATABASE_URL" -f scripts/perf-db-watch.sql'
 */

import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERVAL = Number(args.interval ?? 10) * 1000;
const OUT = args.out ?? 'tests/performance/results/db-watch.jsonl';
const RPC = args.rpc ?? 'exec_sql';

if (!URL || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  console.error('');
  console.error('If you do not have an exec_sql RPC, use the psql form instead:');
  console.error('  watch -n10 \'psql "$DATABASE_URL" -f scripts/perf-db-watch.sql\'');
  process.exit(1);
}

if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });

/** Each probe is one small read-only query. */
const PROBES = {
  connections: `
    select state, count(*)::int as n
      from pg_stat_activity
     where datname = current_database()
     group by state`,

  connection_headroom: `
    select
      (select count(*)::int from pg_stat_activity) as used,
      (select setting::int from pg_settings where name = 'max_connections') as max_conn,
      (select count(*)::int from pg_stat_activity where state = 'active') as active,
      (select count(*)::int from pg_stat_activity where state = 'idle in transaction') as idle_in_txn`,

  wait_events: `
    select wait_event_type, wait_event, count(*)::int as n
      from pg_stat_activity
     where wait_event is not null and datname = current_database()
     group by 1,2 order by 3 desc limit 10`,

  blocked_locks: `
    select count(*)::int as not_granted,
           coalesce(max(extract(epoch from now() - a.query_start)), 0)::numeric(10,2) as longest_wait_s
      from pg_locks l
      left join pg_stat_activity a on a.pid = l.pid
     where not l.granted`,

  longest_query: `
    select coalesce(max(extract(epoch from now() - query_start)), 0)::numeric(10,2) as longest_s,
           count(*) filter (where now() - query_start > interval '5 seconds')::int as over_5s
      from pg_stat_activity
     where state = 'active' and datname = current_database()`,

  slow_statements: `
    select left(regexp_replace(query, '\\s+', ' ', 'g'), 90) as q,
           calls, round(mean_exec_time::numeric, 2) as mean_ms,
           round(total_exec_time::numeric, 0) as total_ms
      from pg_stat_statements
     where query not ilike '%pg_stat%'
     order by mean_exec_time desc limit 5`,

  table_growth: `
    select relname, n_live_tup, seq_scan, idx_scan,
           pg_total_relation_size(relid) as bytes
      from pg_stat_user_tables
     where relname in ('work_orders','order_stages','notifications','activity_logs',
                       'order_messages','stock_movements','profiles')`,

  replication_lag: `
    select slot_name, active,
           pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) as lag_bytes
      from pg_replication_slots`,

  cache_hit: `
    select round(sum(heap_blks_hit) * 100.0
                 / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) as hit_pct
      from pg_statio_user_tables`,
};

let ticks = 0;
console.log(`db-watch: sampling every ${INTERVAL / 1000}s → ${OUT}`);
console.log('Ctrl-C to stop.\n');

const timer = setInterval(sample, INTERVAL);
sample();

process.on('SIGINT', () => {
  clearInterval(timer);
  console.log(`\ndb-watch: stopped after ${ticks} samples. Output: ${OUT}`);
  process.exit(0);
});

async function sample() {
  const at = new Date().toISOString();
  const row = { at, tick: ticks++ };

  for (const [name, sql] of Object.entries(PROBES)) {
    try {
      row[name] = await query(sql);
    } catch (e) {
      row[name] = { error: String(e && e.message).slice(0, 200) };
    }
  }

  appendFileSync(OUT, JSON.stringify(row) + '\n');
  printLine(row);
}

async function query(sql) {
  const res = await fetch(`${URL}/rest/v1/rpc/${RPC}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

/** One compact line per sample, so a terminal beside the k6 run is readable. */
function printLine(row) {
  const h = first(row.connection_headroom) || {};
  const locks = first(row.blocked_locks) || {};
  const longest = first(row.longest_query) || {};
  const cache = first(row.cache_hit) || {};

  const used = h.used ?? '?';
  const max = h.max_conn ?? '?';
  const pctConn = h.used && h.max_conn ? Math.round((h.used / h.max_conn) * 100) : null;

  console.log(
    `${row.at.slice(11, 19)}  ` +
      `conn ${String(used).padStart(3)}/${max}${pctConn !== null ? ` (${pctConn}%)` : ''}  ` +
      `active ${String(h.active ?? '?').padStart(3)}  ` +
      `idle-in-txn ${String(h.idle_in_txn ?? '?').padStart(2)}  ` +
      `blocked ${String(locks.not_granted ?? '?').padStart(2)}  ` +
      `longest ${String(longest.longest_s ?? '?').padStart(6)}s  ` +
      `cache ${cache.hit_pct ?? '?'}%` +
      (pctConn !== null && pctConn > 80 ? '   ⚠️  CONNECTION PRESSURE' : ''),
  );
}

function first(v) {
  return Array.isArray(v) ? v[0] : v;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    }
  }
  return out;
}
