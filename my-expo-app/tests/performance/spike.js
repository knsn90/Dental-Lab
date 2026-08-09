/**
 * SPIKE — Phase 7. 10 → 1000 → 3000 → 10 VUs, instantly.
 *
 * Models the real-world 08:30 stampede: every lab in Turkey opens the app inside
 * a few minutes. The interesting number is not peak latency — it is **recovery
 * time**: how long after the spike ends before p95 is back to baseline.
 *
 *   k6 run -e BASE_URL=... -e ANON_KEY=... tests/performance/spike.js
 *
 * Uses `ramping-arrival-rate` rather than `ramping-vus`: a VU-based spike is
 * self-throttling (slow responses hold VUs back and the real arrival rate never
 * reaches the target), which is exactly the wrong behaviour when you are trying
 * to measure overload.
 */
import { sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { userForVU, getSession } from './lib/auth.js';
import { flowDashboard } from './api/dashboard.js';
import { flowOrdersList, flowOrderDetail, sampleOrderId } from './api/orders.js';
import { flowNotifications } from './api/notifications.js';
import { TARGET_ENV } from './config.js';
import { textSummary, jsonSummary } from './lib/summary.js';

const BASELINE_RPS = Number(__ENV.SPIKE_BASELINE_RPS || 5);
const PEAK1_RPS = Number(__ENV.SPIKE_PEAK1_RPS || 200);
const PEAK2_RPS = Number(__ENV.SPIKE_PEAK2_RPS || 600);
const MAX_VUS = Number(__ENV.SPIKE_MAX_VUS || 3000);

/** Phase-tagged latency: baseline / spike1 / spike2 / recovery. */
const phaseLatency = new Trend('spike_phase_latency', true);
const phaseErrors = new Rate('spike_phase_errors');

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-arrival-rate',
      startRate: BASELINE_RPS,
      timeUnit: '1s',
      preAllocatedVUs: Math.min(500, MAX_VUS),
      maxVUs: MAX_VUS,
      stages: [
        { duration: '1m', target: BASELINE_RPS },  // baseline — establishes "normal"
        { duration: '10s', target: PEAK1_RPS },    // instant spike to ~1000 users
        { duration: '1m', target: PEAK1_RPS },
        { duration: '10s', target: PEAK2_RPS },    // second, larger spike
        { duration: '1m', target: PEAK2_RPS },
        { duration: '10s', target: BASELINE_RPS }, // instant drop
        { duration: '3m', target: BASELINE_RPS },  // recovery observation window
      ],
    },
  },
  thresholds: {
    // Recovery is the gate. Baseline must be healthy before AND after the spike.
    'spike_phase_latency{phase:baseline}': ['p(95)<800'],
    'spike_phase_latency{phase:recovery}': [
      { threshold: 'p(95)<1200', abortOnFail: false },
    ],
    'spike_phase_errors{phase:recovery}': ['rate<0.02'],
    // During the spike we accept degradation but not a total collapse.
    'spike_phase_errors{phase:spike2}': [{ threshold: 'rate<0.5', abortOnFail: false }],
    http_req_failed: [{ threshold: 'rate<0.5', abortOnFail: false }],
  },
  tags: { scenario: 'spike', target_env: TARGET_ENV },
};

let testStart = 0;

export function setup() {
  if (TARGET_ENV === 'production') {
    throw new Error('spike.js must never run against production.');
  }
  console.log(
    `── SPIKE ── ${BASELINE_RPS} → ${PEAK1_RPS} → ${PEAK2_RPS} → ${BASELINE_RPS} req/s ` +
      `(maxVUs ${MAX_VUS})`,
  );
  return { startedAt: Date.now() };
}

/** Which stage of the spike we are in, derived from elapsed time. */
function phaseAt(elapsedMs) {
  const s = elapsedMs / 1000;
  if (s < 60) return 'baseline';
  if (s < 130) return 'spike1';
  if (s < 200) return 'spike2';
  return 'recovery';
}

export default function (data) {
  if (!testStart) testStart = data.startedAt;
  const phase = phaseAt(Date.now() - data.startedAt);

  const user = userForVU();
  const started = Date.now();
  const session = getSession(user);
  if (!session) {
    phaseErrors.add(1, { phase });
    return;
  }

  const r = Math.random();
  let res;
  if (r < 0.5) res = flowDashboard(session);
  else if (r < 0.8) res = flowOrdersList(session);
  else if (r < 0.92) {
    const id = sampleOrderId(session);
    res = id ? flowOrderDetail(session, id) : { ok: true };
  } else res = flowNotifications(session);

  phaseLatency.add(Date.now() - started, { phase });
  phaseErrors.add(res && res.ok === false ? 1 : 0, { phase });

  sleep(0.2);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, 'SPIKE') + recoveryReport(data),
    'tests/performance/results/spike-summary.json': jsonSummary(data, 'spike'),
    'tests/performance/results/spike-recovery.json': JSON.stringify(recoveryData(data), null, 2),
  };
}

function recoveryData(data) {
  const phase = (p, f) => {
    const m = data.metrics[`spike_phase_latency{phase:${p}}`];
    return m && m.values ? m.values[f] : null;
  };
  const err = (p) => {
    const m = data.metrics[`spike_phase_errors{phase:${p}}`];
    return m && m.values ? m.values.rate : null;
  };

  const base95 = phase('baseline', 'p(95)');
  const rec95 = phase('recovery', 'p(95)');
  const recovered = base95 !== null && rec95 !== null ? rec95 <= base95 * 1.5 : null;

  return {
    baseline: { p50: phase('baseline', 'med'), p95: base95, error_rate: err('baseline') },
    spike1: { p50: phase('spike1', 'med'), p95: phase('spike1', 'p(95)'), error_rate: err('spike1') },
    spike2: { p50: phase('spike2', 'med'), p95: phase('spike2', 'p(95)'), error_rate: err('spike2') },
    recovery: { p50: phase('recovery', 'med'), p95: rec95, error_rate: err('recovery') },
    degradation_factor_spike2: base95 && phase('spike2', 'p(95)') ? phase('spike2', 'p(95)') / base95 : null,
    recovered_to_baseline: recovered,
    note:
      'Recovery window is the 3 min after the drop back to baseline rate. ' +
      'recovered_to_baseline = recovery p95 within 1.5x of pre-spike baseline p95.',
  };
}

function recoveryReport(data) {
  const r = recoveryData(data);
  const f = (n) => (n === null || !isFinite(n) ? '—' : `${Math.round(n)}ms`);
  const p = (n) => (n === null || !isFinite(n) ? '—' : `${(n * 100).toFixed(2)}%`);
  return [
    '',
    '  SPIKE PHASES',
    '  ' + '─'.repeat(86),
    '  phase        p50        p95       error%',
    `  baseline  ${f(r.baseline.p50).padStart(9)} ${f(r.baseline.p95).padStart(10)} ${p(r.baseline.error_rate).padStart(11)}`,
    `  spike1    ${f(r.spike1.p50).padStart(9)} ${f(r.spike1.p95).padStart(10)} ${p(r.spike1.error_rate).padStart(11)}`,
    `  spike2    ${f(r.spike2.p50).padStart(9)} ${f(r.spike2.p95).padStart(10)} ${p(r.spike2.error_rate).padStart(11)}`,
    `  recovery  ${f(r.recovery.p50).padStart(9)} ${f(r.recovery.p95).padStart(10)} ${p(r.recovery.error_rate).padStart(11)}`,
    '',
    `  Peak degradation : ${r.degradation_factor_spike2 ? r.degradation_factor_spike2.toFixed(1) + '×' : '—'}`,
    `  Recovered        : ${r.recovered_to_baseline === null ? '—' : r.recovered_to_baseline ? '✅ yes' : '❌ NO — system did not return to baseline'}`,
    '',
  ].join('\n');
}
