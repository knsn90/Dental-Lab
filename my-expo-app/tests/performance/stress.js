/**
 * STRESS — Phase 6. Push until it breaks, then say exactly how it broke.
 *
 * Ramps in steps and holds at each level so the breaking point is attributable to
 * a specific concurrency, not to a ramp artefact. Thresholds are intentionally
 * NOT abort-on-fail: the whole point is to run past the failure point and record
 * what happens on the other side.
 *
 *   k6 run -e BASE_URL=... -e ANON_KEY=... -e MAX_VUS=2000 tests/performance/stress.js
 *
 * What to correlate with, on the database side, while this runs:
 *   select count(*), state from pg_stat_activity group by state;
 *   select wait_event_type, wait_event, count(*) from pg_stat_activity
 *     where wait_event is not null group by 1,2 order by 3 desc;
 *   select * from pg_locks where not granted;
 * `scripts/perf-db-watch.mjs` samples these automatically.
 */
import { sleep } from 'k6';
import exec from 'k6/execution';
import { Trend, Counter, Rate } from 'k6/metrics';
import { userForVU, getSession } from './lib/auth.js';
import { flowDashboard, flowKanban } from './api/dashboard.js';
import { flowOrdersList, flowOrderDetail, sampleOrderId, flowCreateOrder } from './api/orders.js';
import { flowNotifications } from './api/notifications.js';
import { flowStockList } from './api/stock.js';
import { TARGET_ENV, ALLOW_WRITES } from './config.js';
import { textSummary, jsonSummary } from './lib/summary.js';

const MAX_VUS = Number(__ENV.MAX_VUS || 1000);
const STEP_HOLD = __ENV.STEP_HOLD || '2m';
const STEP_RAMP = __ENV.STEP_RAMP || '1m';

/** Latency and error rate bucketed by the VU level in effect — the breaking-point curve. */
const latencyAtLevel = new Trend('stress_latency_by_level', true);
const errorsAtLevel = new Rate('stress_errors_by_level');
const poolExhaustion = new Counter('db_pool_exhaustion_errors');
const gatewayErrors = new Counter('gateway_5xx');
const rateLimited = new Counter('rate_limited_429');

/** Step through 5 %, 10 %, 25 %, 50 %, 75 %, 100 %, 150 % of MAX_VUS. */
function stressStages() {
  const levels = [0.05, 0.1, 0.25, 0.5, 0.75, 1.0, 1.5];
  const stages = [];
  for (const l of levels) {
    const target = Math.max(1, Math.round(MAX_VUS * l));
    stages.push({ duration: STEP_RAMP, target });
    stages.push({ duration: STEP_HOLD, target });
  }
  stages.push({ duration: '2m', target: 0 }); // recovery observation
  return stages;
}

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: stressStages(),
      gracefulRampDown: '30s',
    },
  },
  // Recorded, not enforced. A stress test that aborts at the first 500 tells you
  // nothing about the shape of the failure.
  thresholds: {
    http_req_failed: [{ threshold: 'rate<1', abortOnFail: false }],
    http_req_duration: [{ threshold: 'p(95)<60000', abortOnFail: false }],
  },
  tags: { scenario: 'stress', target_env: TARGET_ENV },
};

export function setup() {
  if (TARGET_ENV === 'production') {
    throw new Error('stress.js must never run against production. Use a staging project.');
  }
  console.log(`── STRESS ── max=${MAX_VUS} VUs, steps of ${STEP_RAMP}+${STEP_HOLD}`);
  console.log('   Run scripts/perf-db-watch.mjs in parallel to capture DB-side state.');
  return {};
}

/** Bucket the current VU count so results are attributable to a load level. */
function level() {
  const v = exec.instance.vusActive;
  if (v <= 25) return '25';
  if (v <= 50) return '50';
  if (v <= 100) return '100';
  if (v <= 250) return '250';
  if (v <= 500) return '500';
  if (v <= 1000) return '1000';
  if (v <= 2000) return '2000';
  if (v <= 3000) return '3000';
  if (v <= 5000) return '5000';
  return '5000+';
}

export default function () {
  const lvl = level();
  const user = userForVU();
  const started = Date.now();

  const session = getSession(user);
  if (!session) {
    errorsAtLevel.add(1, { level: lvl });
    sleep(2);
    return;
  }

  // Read-heavy mix; at extreme VU counts writes would pollute the DB faster than
  // cleanup can keep up, so they stay behind ALLOW_WRITES.
  const r = Math.random();
  let res;
  if (r < 0.45) res = flowDashboard(session);
  else if (r < 0.7) res = flowOrdersList(session);
  else if (r < 0.82) {
    const id = sampleOrderId(session);
    res = id ? flowOrderDetail(session, id) : { ok: true };
  } else if (r < 0.9) res = flowNotifications(session);
  else if (r < 0.96) res = flowKanban(session);
  else if (r < 0.99) res = flowStockList(session);
  else res = ALLOW_WRITES ? flowCreateOrder(session) : flowStockList(session);

  latencyAtLevel.add(Date.now() - started, { level: lvl });
  errorsAtLevel.add(res && res.ok === false ? 1 : 0, { level: lvl });

  classifyFailure(res, lvl);

  // Aggressive: stress tests model a stampede, not leisurely browsing.
  sleep(Math.random() * 1.5);
}

/**
 * Attribute failures to a cause. These strings are what Supavisor/PostgREST/
 * Postgres actually return when each resource runs out.
 */
function classifyFailure(res, lvl) {
  if (!res || res.ok !== false) return;
  const body = String((res.lastBody || res.body || '')).toLowerCase();

  if (
    body.indexOf('remaining connection slots') !== -1 ||
    body.indexOf('too many clients') !== -1 ||
    body.indexOf('max client connections reached') !== -1 ||
    body.indexOf('sorry, too many clients') !== -1
  ) {
    poolExhaustion.add(1, { level: lvl });
  }
  if (body.indexOf('429') !== -1 || body.indexOf('too many requests') !== -1) {
    rateLimited.add(1, { level: lvl });
  }
  if (body.indexOf('502') !== -1 || body.indexOf('503') !== -1 || body.indexOf('504') !== -1) {
    gatewayErrors.add(1, { level: lvl });
  }
}

export function handleSummary(data) {
  return {
    stdout:
      textSummary(data, `STRESS — up to ${MAX_VUS} VUs`) + breakingPointReport(data),
    'tests/performance/results/stress-summary.json': jsonSummary(data, 'stress'),
    'tests/performance/results/stress-breaking-point.json': JSON.stringify(
      breakingPointData(data), null, 2,
    ),
  };
}

/** Find the lowest VU level where p95 or error rate crosses the SLO. */
function breakingPointData(data) {
  const levels = ['25', '50', '100', '250', '500', '1000', '2000', '3000', '5000', '5000+'];
  const rows = [];
  for (const l of levels) {
    const d = data.metrics[`stress_latency_by_level{level:${l}}`];
    const e = data.metrics[`stress_errors_by_level{level:${l}}`];
    if (!d && !e) continue;
    rows.push({
      level: Number(l.replace('+', '')),
      p50: d && d.values ? d.values.med : null,
      p95: d && d.values ? d.values['p(95)'] : null,
      p99: d && d.values ? d.values['p(99)'] : null,
      max: d && d.values ? d.values.max : null,
      error_rate: e && e.values ? e.values.rate : null,
    });
  }

  const breaking = rows.find((r) => (r.error_rate ?? 0) > 0.05 || (r.p95 ?? 0) > 3000) || null;
  const lastGood = (() => {
    let g = null;
    for (const r of rows) {
      if ((r.error_rate ?? 0) <= 0.01 && (r.p95 ?? 0) <= 1000) g = r;
      else break;
    }
    return g;
  })();

  return {
    max_vus_configured: MAX_VUS,
    levels: rows,
    breaking_point: breaking,
    last_healthy_level: lastGood,
    pool_exhaustion_errors: data.metrics.db_pool_exhaustion_errors
      ? data.metrics.db_pool_exhaustion_errors.values.count : 0,
    gateway_5xx: data.metrics.gateway_5xx ? data.metrics.gateway_5xx.values.count : 0,
    rate_limited_429: data.metrics.rate_limited_429 ? data.metrics.rate_limited_429.values.count : 0,
    peak_rps: data.metrics.http_reqs ? data.metrics.http_reqs.values.rate : null,
  };
}

function breakingPointReport(data) {
  const bp = breakingPointData(data);
  const L = ['', '  BREAKING-POINT CURVE', '  ' + '─'.repeat(86)];
  L.push('  VUs        p50       p95       p99       max      error%');
  for (const r of bp.levels) {
    L.push(
      `  ${String(r.level).padEnd(10)} ${fmtMs(r.p50)} ${fmtMs(r.p95)} ${fmtMs(r.p99)} ` +
      `${fmtMs(r.max)} ${r.error_rate === null ? '  —' : `${(r.error_rate * 100).toFixed(2)}%`.padStart(8)}`,
    );
  }
  L.push('');
  L.push(`  Last healthy level : ${bp.last_healthy_level ? bp.last_healthy_level.level + ' VUs' : 'none — failed immediately'}`);
  L.push(`  Breaking point     : ${bp.breaking_point ? bp.breaking_point.level + ' VUs' : 'not reached at this MAX_VUS'}`);
  L.push(`  Peak throughput    : ${bp.peak_rps ? bp.peak_rps.toFixed(1) + ' req/s' : '—'}`);
  L.push('');
  L.push('  Failure attribution');
  L.push(`    connection-pool exhaustion : ${bp.pool_exhaustion_errors}`);
  L.push(`    gateway 5xx                : ${bp.gateway_5xx}`);
  L.push(`    rate limited (429)         : ${bp.rate_limited_429}`);
  L.push('');
  return L.join('\n');
}

function fmtMs(n) {
  return n === null || n === undefined || !isFinite(n) ? '     —' : `${Math.round(n)}ms`.padStart(9);
}
