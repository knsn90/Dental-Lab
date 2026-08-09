/**
 * SMOKE — minimal load, maximum coverage.
 *
 * Runs every flow exactly once per VU with 1–2 VUs. Answers one question:
 * "is every critical endpoint alive and roughly within budget?"
 *
 * This is the only script safe to run against production, and it is what CI runs
 * on every PR (see .github/workflows/performance.yml).
 *
 *   k6 run -e BASE_URL=... -e ANON_KEY=... tests/performance/smoke.js
 */
import { sleep } from 'k6';
import { userForVU, getSession } from './lib/auth.js';
import { checkJwtClaims } from './api/auth.js';
import { flowDashboard, flowClinicDashboard, flowKanban } from './api/dashboard.js';
import {
  flowOrdersList, flowOrderDetail, flowSearch, sampleOrderId,
  flowCreateOrder, flowStatusUpdate,
} from './api/orders.js';
import { flowNotifications, flowRealtimeSubscribe } from './api/notifications.js';
import { flowStockList } from './api/stock.js';
import { flowFinanceOverview } from './api/finance.js';
import { flowReport } from './api/reports.js';
import { flowUpload } from './api/uploads.js';
import { ALLOW_WRITES, TARGET_ENV, observedSubmetrics } from './config.js';
import { textSummary, jsonSummary } from './lib/summary.js';

const SMOKE_FLOWS = [
  'login', 'dashboard', 'orders_list', 'order_detail', 'search',
  'notifications', 'kanban', 'stock', 'reports', 'realtime', 'upload',
];

export const options = {
  vus: Number(__ENV.SMOKE_VUS || 2),
  iterations: Number(__ENV.SMOKE_ITERATIONS || 2) * Number(__ENV.SMOKE_VUS || 2),
  // Smoke gates are absolute: nothing may fail, and nothing may be slow.
  // Per-flow duration thresholds are generous here (smoke runs at 1–2 VUs, so a
  // breach means something is genuinely broken, not merely loaded).
  thresholds: Object.assign(
    {},
    // 1. Observation-only sub-metrics first — these exist purely so the N+1
    //    (requests) and unbounded-query (payload/rows) columns render in the
    //    summary. k6 does not materialise a tagged sub-metric unless some
    //    threshold references it.
    ...SMOKE_FLOWS.map(observedSubmetrics),
    // 2. A loose duration gate on every flow, so all of them appear in the table.
    ...SMOKE_FLOWS.map((f) => ({ [`flow_duration{flow:${f}}`]: ['p(95)<10000'] })),
    // 3. Real gates last, so they override the loose ones above.
    {
      http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '10s' }],
      http_req_duration: ['p(95)<1500'],
      checks: ['rate>0.95'],
      login_failures: ['rate<0.01'],
      'flow_duration{flow:dashboard}': ['p(95)<3000'],
      'flow_duration{flow:orders_list}': ['p(95)<2000'],
      'flow_duration{flow:order_detail}': ['p(95)<3000'],
      'flow_duration{flow:notifications}': ['p(95)<1500'],
      'flow_errors{flow:dashboard}': ['rate<0.01'],
      'flow_errors{flow:orders_list}': ['rate<0.01'],
      'flow_errors{flow:order_detail}': ['rate<0.01'],
      'flow_errors{flow:notifications}': ['rate<0.01'],
    },
  ),
  tags: { scenario: 'smoke', target_env: TARGET_ENV },
};

export function setup() {
  console.log(`── SMOKE ── target=${TARGET_ENV} writes=${ALLOW_WRITES ? 'ON' : 'off'}`);
  return {};
}

export default function () {
  const user = userForVU();
  const session = getSession(user);
  if (!session) {
    console.error(`smoke: could not authenticate ${user.email}`);
    return;
  }

  // Documents whether the JWT carries lab_id — the analysis §2.1 root cause.
  checkJwtClaims(session);

  const type = (session.profile && session.profile.user_type) || user.user_type || 'lab';

  // Read flows — always safe.
  flowNotifications(session);

  if (type === 'doctor' || type === 'clinic_admin') {
    flowClinicDashboard(session);
  } else {
    flowDashboard(session);
    flowKanban(session);
    flowStockList(session);
    flowFinanceOverview(session);
    flowReport(session, { days: 30 });
  }

  flowOrdersList(session);
  flowSearch(session);

  const orderId = sampleOrderId(session);
  if (orderId) flowOrderDetail(session, orderId);

  // Realtime: short hold, just proving the socket and channel joins work.
  if (__ENV.SKIP_REALTIME !== 'true') {
    flowRealtimeSubscribe(session, { holdMs: 3000 });
  }

  // Write flows — only when explicitly enabled and never against production.
  if (ALLOW_WRITES) {
    const created = flowCreateOrder(session);
    if (created && created.orderId) {
      flowStatusUpdate(session, created.orderId);
      flowUpload(session, 'thumb');
    }
  }

  sleep(1);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, 'SMOKE'),
    'tests/performance/results/smoke-summary.json': jsonSummary(data, 'smoke'),
  };
}
