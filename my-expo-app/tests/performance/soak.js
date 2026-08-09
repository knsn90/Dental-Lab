/**
 * SOAK — Phase 8. Constant moderate load for 24 / 48 / 72 h.
 *
 * Looking for slow leaks, not peak capacity:
 *   · latency drift          → memory pressure / cache degradation / table bloat
 *   · connection growth      → leaked sessions or unclosed Realtime channels
 *   · rising error rate      → resource exhaustion accumulating
 *   · payload growth         → unbounded queries as data accumulates (§2.3)
 *   · realtime message decay → WAL reader falling behind
 *
 *   k6 run -e SOAK_HOURS=24 -e BASE_URL=... -e ANON_KEY=... tests/performance/soak.js
 *
 * Latency is bucketed per hour, so drift is visible as a curve rather than one
 * averaged-out number. Run scripts/perf-db-watch.mjs alongside to capture
 * pg_stat_activity, table sizes and replication-slot lag over the same window.
 */
import { sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { userForVU, getSession } from './lib/auth.js';
import { flowDashboard, flowKanban } from './api/dashboard.js';
import {
  flowOrdersList, flowOrderDetail, sampleOrderId, flowCreateOrder, flowStatusUpdate,
} from './api/orders.js';
import { flowNotifications, flowRealtimeSubscribe } from './api/notifications.js';
import { flowStockList } from './api/stock.js';
import { flowFinanceOverview } from './api/finance.js';
import { TARGET_ENV, ALLOW_WRITES } from './config.js';
import { thinkTime } from './lib/data.js';
import { textSummary, jsonSummary } from './lib/summary.js';

const HOURS = Number(__ENV.SOAK_HOURS || 24);
const VUS = Number(__ENV.SOAK_VUS || 50);

/** Per-hour buckets — the drift signal. */
const hourlyLatency = new Trend('soak_hourly_latency', true);
const hourlyErrors = new Rate('soak_hourly_errors');
const hourlyPayload = new Trend('soak_hourly_payload_bytes');
const realtimeMessages = new Counter('soak_realtime_messages');

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: VUS,
      duration: `${HOURS}h`,
      gracefulStop: '2m',
    },
    /**
     * A small pool of permanently-connected Realtime clients — the wall-mounted
     * station boards (userflows F8). These are what actually accumulate channel
     * state over days, and an HTTP-only soak would miss the leak entirely.
     */
    realtime_holders: {
      executor: 'constant-vus',
      vus: Number(__ENV.SOAK_WS_VUS || 5),
      duration: `${HOURS}h`,
      exec: 'realtimeHolder',
      gracefulStop: '1m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    // Drift gates: hour 0 vs the final hour are compared in handleSummary; these
    // catch outright degradation during the run.
    soak_hourly_errors: ['rate<0.02'],
  },
  tags: { scenario: 'soak', target_env: TARGET_ENV },
};

export function setup() {
  console.log(`── SOAK ── ${VUS} VUs for ${HOURS}h, writes=${ALLOW_WRITES ? 'ON' : 'off'}`);
  console.log('   Run scripts/perf-db-watch.mjs in parallel for DB-side leak detection.');
  return { startedAt: Date.now() };
}

function hourBucket(startedAt) {
  return String(Math.floor((Date.now() - startedAt) / 3600000));
}

export default function (data) {
  const hour = hourBucket(data.startedAt);
  const user = userForVU();
  const started = Date.now();

  const session = getSession(user);
  if (!session) {
    hourlyErrors.add(1, { hour });
    sleep(10);
    return;
  }

  const r = Math.random();
  let res;
  if (r < 0.35) res = flowDashboard(session);
  else if (r < 0.6) res = flowOrdersList(session);
  else if (r < 0.72) {
    const id = sampleOrderId(session);
    res = id ? flowOrderDetail(session, id) : { ok: true };
  } else if (r < 0.82) res = flowNotifications(session);
  else if (r < 0.88) res = flowKanban(session);
  else if (r < 0.93) res = flowStockList(session);
  else if (r < 0.97) res = flowFinanceOverview(session);
  else if (ALLOW_WRITES) {
    const created = flowCreateOrder(session);
    if (created && created.orderId) flowStatusUpdate(session, created.orderId);
    res = created;
  } else res = flowOrdersList(session);

  hourlyLatency.add(Date.now() - started, { hour });
  hourlyErrors.add(res && res.ok === false ? 1 : 0, { hour });
  if (res && typeof res.bytes === 'number') hourlyPayload.add(res.bytes, { hour });

  sleep(thinkTime() * 2); // soak is gentler than load
}

/** Long-lived Realtime subscribers — 10-minute holds, reconnecting forever. */
export function realtimeHolder() {
  const user = userForVU();
  const session = getSession(user);
  if (!session) {
    sleep(30);
    return;
  }
  const res = flowRealtimeSubscribe(session, {
    holdMs: 600000,
    tables: ['work_orders', 'order_stages', 'notifications', 'stock_items'],
  });
  if (res && res.messages) realtimeMessages.add(res.messages);
  sleep(5);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, `SOAK — ${HOURS}h × ${VUS} VUs`) + driftReport(data),
    'tests/performance/results/soak-summary.json': jsonSummary(data, 'soak'),
    'tests/performance/results/soak-drift.json': JSON.stringify(driftData(data), null, 2),
  };
}

function driftData(data) {
  const hours = [];
  for (let h = 0; h < HOURS + 1; h++) {
    const lat = data.metrics[`soak_hourly_latency{hour:${h}}`];
    const err = data.metrics[`soak_hourly_errors{hour:${h}}`];
    const pay = data.metrics[`soak_hourly_payload_bytes{hour:${h}}`];
    if (!lat && !err) continue;
    hours.push({
      hour: h,
      p50: lat && lat.values ? lat.values.med : null,
      p95: lat && lat.values ? lat.values['p(95)'] : null,
      error_rate: err && err.values ? err.values.rate : null,
      avg_payload_bytes: pay && pay.values ? pay.values.avg : null,
    });
  }

  const first = hours[0];
  const last = hours[hours.length - 1];
  const drift = (a, b) => (a && b && a > 0 ? (b - a) / a : null);

  return {
    hours,
    latency_drift_p95: first && last ? drift(first.p95, last.p95) : null,
    payload_drift: first && last ? drift(first.avg_payload_bytes, last.avg_payload_bytes) : null,
    error_drift: first && last ? (last.error_rate ?? 0) - (first.error_rate ?? 0) : null,
    realtime_messages: data.metrics.soak_realtime_messages
      ? data.metrics.soak_realtime_messages.values.count : 0,
    verdict_latency: (() => {
      const d = first && last ? drift(first.p95, last.p95) : null;
      if (d === null) return 'insufficient data';
      return d <= 0.1 ? 'stable (≤10 % drift)' : `DRIFT ${(d * 100).toFixed(1)} % — investigate`;
    })(),
    note:
      'Correlate latency_drift_p95 with perf-db-watch output: rising connection count ' +
      'points at a session/channel leak; rising table size + stable connections points ' +
      'at unbounded-query growth (analysis §2.3).',
  };
}

function driftReport(data) {
  const d = driftData(data);
  const L = ['', '  SOAK DRIFT (per hour)', '  ' + '─'.repeat(86)];
  L.push('  hour      p50       p95      error%     avg payload');
  for (const h of d.hours) {
    L.push(
      `  ${String(h.hour).padEnd(9)} ${fmtMs(h.p50)} ${fmtMs(h.p95)} ` +
      `${h.error_rate === null ? '     —' : `${(h.error_rate * 100).toFixed(2)}%`.padStart(9)} ` +
      `${h.avg_payload_bytes === null ? '     —' : `${(h.avg_payload_bytes / 1024).toFixed(1)} KB`.padStart(14)}`,
    );
  }
  L.push('');
  L.push(`  p95 drift        : ${d.latency_drift_p95 === null ? '—' : `${(d.latency_drift_p95 * 100).toFixed(1)}%`}  → ${d.verdict_latency}`);
  L.push(`  payload drift    : ${d.payload_drift === null ? '—' : `${(d.payload_drift * 100).toFixed(1)}%`}`);
  L.push(`  realtime msgs    : ${d.realtime_messages}`);
  L.push('');
  return L.join('\n');
}

function fmtMs(n) {
  return n === null || !isFinite(n) ? '     —' : `${Math.round(n)}ms`.padStart(9);
}
