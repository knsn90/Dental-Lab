/**
 * LOAD — realistic sustained traffic (Phase 5, Scenarios A–F).
 *
 * The flow mix is weighted by *observed* production traffic from
 * pg_stat_statements (see docs/performance-userflows.md § Traffic model), not by
 * guesswork. Change the weights and you are no longer testing this app.
 *
 *   k6 run -e LOAD_PROFILE=B -e BASE_URL=... -e ANON_KEY=... tests/performance/load.js
 *
 * LOAD_PROFILE:  A=20  B=100  C=300  D=1000  E=3000  F=5000 VUs
 */
import { sleep } from 'k6';
import exec from 'k6/execution';
import { userForVU, getSession } from './lib/auth.js';
import { flowDashboard, flowClinicDashboard, flowKanban } from './api/dashboard.js';
import {
  flowOrdersList, flowOrderDetail, flowSearch, sampleOrderId,
  flowCreateOrder, flowStatusUpdate, flowPostMessage,
} from './api/orders.js';
import { flowNotifications, flowMarkRead } from './api/notifications.js';
import { flowStockList, flowStockMovement } from './api/stock.js';
import { flowFinanceOverview } from './api/finance.js';
import { flowReport } from './api/reports.js';
import {
  PROFILE, PROFILE_KEY, rampingStages, thresholdsFor, ALLOW_WRITES, TARGET_ENV,
} from './config.js';
import { thinkTime } from './lib/data.js';
import { activeFlows } from './lib/metrics.js';
import { textSummary, jsonSummary } from './lib/summary.js';

const FLOWS = [
  'dashboard', 'orders_list', 'order_detail', 'status_update',
  'notifications', 'create_order', 'stock', 'reports', 'search',
];

export const options = {
  scenarios: {
    steady: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: rampingStages(),
      gracefulRampDown: '30s',
      tags: { scenario: 'load', profile: PROFILE_KEY },
    },
  },
  thresholds: thresholdsFor(FLOWS),
  tags: { scenario: 'load', profile: PROFILE_KEY, target_env: TARGET_ENV },
  // Under high VU counts, do not let a slow DNS/TLS handshake serialise VUs.
  noConnectionReuse: false,
  discardResponseBodies: false,
};

export function setup() {
  console.log(
    `── LOAD ── profile=${PROFILE_KEY} (${PROFILE.label}) ` +
      `target=${TARGET_ENV} writes=${ALLOW_WRITES ? 'ON' : 'off'}`,
  );
  return { startedAt: Date.now() };
}

/**
 * Weighted flow selection. Weights come from observed call counts:
 * order list/count queries are ~66 % of real traffic.
 */
function pickFlow() {
  const r = Math.random() * 100;
  if (r < 40) return 'dashboard';
  if (r < 65) return 'orders_list';
  if (r < 77) return 'order_detail';
  if (r < 85) return 'status_update';
  if (r < 90) return 'notifications';
  if (r < 94) return 'create_order';
  if (r < 97) return 'stock';
  if (r < 99) return 'reports';
  return 'search';
}

export default function () {
  const user = userForVU();
  const session = getSession(user);
  if (!session) {
    sleep(5);
    return;
  }

  activeFlows.add(exec.instance.vusActive);
  const type = (session.profile && session.profile.user_type) || user.user_type || 'lab';
  const isClientSide = type === 'doctor' || type === 'clinic_admin';
  const flow = pickFlow();

  switch (flow) {
    case 'dashboard':
      if (isClientSide) flowClinicDashboard(session);
      else if (type === 'lab' && user.role === 'technician') flowKanban(session);
      else flowDashboard(session);
      break;

    case 'orders_list':
      flowOrdersList(session);
      break;

    case 'order_detail': {
      const id = sampleOrderId(session);
      if (id) {
        flowOrderDetail(session, id);
        // 20 % of detail views post a message.
        if (ALLOW_WRITES && Math.random() < 0.2) flowPostMessage(session, id);
      }
      break;
    }

    case 'status_update':
      // Clients cannot advance production stages; they read instead.
      if (isClientSide) flowOrdersList(session);
      else flowStatusUpdate(session);
      break;

    case 'notifications':
      flowNotifications(session);
      if (ALLOW_WRITES && Math.random() < 0.3) flowMarkRead(session);
      break;

    case 'create_order':
      flowCreateOrder(session);
      break;

    case 'stock':
      if (isClientSide) flowNotifications(session);
      else {
        flowStockList(session);
        if (ALLOW_WRITES && Math.random() < 0.25) flowStockMovement(session);
      }
      break;

    case 'reports':
      if (isClientSide) flowClinicDashboard(session);
      else {
        flowFinanceOverview(session);
        if (Math.random() < 0.4) flowReport(session, { days: 30 });
      }
      break;

    case 'search':
      flowSearch(session);
      break;
  }

  sleep(thinkTime());
}

export function handleSummary(data) {
  const tag = (__ENV.LOAD_PROFILE || 'A').toLowerCase();
  return {
    stdout: textSummary(data, `LOAD — profile ${PROFILE_KEY} (${PROFILE.label})`),
    [`tests/performance/results/load-${tag}-summary.json`]: jsonSummary(data, `load-${tag}`),
  };
}
