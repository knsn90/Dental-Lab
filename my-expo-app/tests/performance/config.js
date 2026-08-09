/**
 * Shared configuration for the Siman k6 performance suite.
 *
 * Everything is environment-driven. Nothing is hardcoded to a project ref, and
 * nothing writes to a database unless you explicitly opt in.
 *
 *   k6 run -e BASE_URL=... -e ANON_KEY=... tests/performance/smoke.js
 *
 * See tests/performance/README.md for the full variable list.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Environment
// ─────────────────────────────────────────────────────────────────────────────

export const BASE_URL = (__ENV.BASE_URL || '').replace(/\/+$/, '');
export const ANON_KEY = __ENV.ANON_KEY || '';

/** Supabase sub-service base URLs. */
export const REST = `${BASE_URL}/rest/v1`;
export const AUTH = `${BASE_URL}/auth/v1`;
export const STORAGE = `${BASE_URL}/storage/v1`;
export const FUNCTIONS = `${BASE_URL}/functions/v1`;

if (!BASE_URL || !ANON_KEY) {
  throw new Error(
    'BASE_URL and ANON_KEY are required.\n' +
      '  k6 run -e BASE_URL=https://<ref>.supabase.co -e ANON_KEY=<anon> <script>',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Safety interlocks
//
// A load test that silently writes to production is an incident, not a test.
// Two independent gates, both default-closed.
// ─────────────────────────────────────────────────────────────────────────────

/** Write flows (create order, status update, stock, uploads) are skipped unless true. */
export const ALLOW_WRITES = __ENV.ALLOW_WRITES === 'true';

/**
 * Set to the literal string 'yes-i-accept-production-load' to run against a
 * database you have flagged as production via TARGET_ENV=production.
 */
export const TARGET_ENV = __ENV.TARGET_ENV || 'staging';
const PROD_ACK = __ENV.PROD_ACK || '';

if (TARGET_ENV === 'production' && PROD_ACK !== 'yes-i-accept-production-load') {
  throw new Error(
    'Refusing to run: TARGET_ENV=production without PROD_ACK.\n' +
      'Load testing production degrades service for real tenants and this instance\n' +
      'has max_connections=60. If you truly mean it, pass:\n' +
      "  -e PROD_ACK=yes-i-accept-production-load",
  );
}

if (TARGET_ENV === 'production' && ALLOW_WRITES) {
  throw new Error(
    'Refusing to run: ALLOW_WRITES=true against TARGET_ENV=production.\n' +
      'Write flows create orders, stock movements and notifications that fan out to\n' +
      'e-mail/WhatsApp/push for real customers. Use a staging project.',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Run identity — lets cleanup.js find exactly what this run created
// ─────────────────────────────────────────────────────────────────────────────

/** Stamped into every row this suite writes. Unique per run. */
export const RUN_TAG =
  __ENV.RUN_TAG || `k6-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`;

/** Prefix used for all synthetic patient names, so cleanup can pattern-match. */
export const SYNTHETIC_PREFIX = 'ZZK6';

// ─────────────────────────────────────────────────────────────────────────────
// Load profiles (Phase 5 Scenarios A–F)
// ─────────────────────────────────────────────────────────────────────────────

export const PROFILES = {
  A: { target: 20, ramp: '1m', hold: '5m', label: '20 users' },
  B: { target: 100, ramp: '2m', hold: '10m', label: '100 users' },
  C: { target: 300, ramp: '3m', hold: '15m', label: '300 users' },
  D: { target: 1000, ramp: '5m', hold: '20m', label: '1000 users' },
  E: { target: 3000, ramp: '8m', hold: '20m', label: '3000 users' },
  F: { target: 5000, ramp: '10m', hold: '20m', label: '5000 users' },
};

export const PROFILE_KEY = (__ENV.LOAD_PROFILE || 'A').toUpperCase();
export const PROFILE = PROFILES[PROFILE_KEY] || PROFILES.A;

/** Gradual ramp: 25 % → 50 % → 100 % → hold → down. Never a step function. */
export function rampingStages(profile = PROFILE) {
  const t = profile.target;
  const quarter = divideDuration(profile.ramp, 4);
  return [
    { duration: quarter, target: Math.max(1, Math.round(t * 0.25)) },
    { duration: quarter, target: Math.max(1, Math.round(t * 0.5)) },
    { duration: divideDuration(profile.ramp, 2), target: t },
    { duration: profile.hold, target: t },
    { duration: '1m', target: 0 },
  ];
}

function divideDuration(d, by) {
  const m = /^(\d+)([smh])$/.exec(d);
  if (!m) return d;
  const seconds = Number(m[1]) * (m[2] === 'h' ? 3600 : m[2] === 'm' ? 60 : 1);
  return `${Math.max(10, Math.round(seconds / by))}s`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds — the executable form of docs/performance-targets.md
//
// Keep these in sync with that document. A change here without a change there
// means the SLO doc is lying.
// ─────────────────────────────────────────────────────────────────────────────

/** §1 per-flow P95 gates, in ms. */
export const P95 = {
  login: 1000,
  dashboard: 500,
  orders_list: 400,
  order_detail: 700,
  create_order: 2000,
  status_update: 600,
  kanban: 600,
  notifications: 300,
  stock: 800,
  reports: 3000,
  courier_ping: 300,
  search: 400,
  global: 300,
};

/**
 * Degradation multiplier per profile. §9 of performance-targets.md allows P95 to
 * grow with load; C ≤ 1.5×, D ≤ 2×, E/F are exploratory (no gate).
 */
export const DEGRADATION = { A: 1, B: 1, C: 1.5, D: 2, E: 6, F: 12 };

/** Allowed error rate per profile (§9). */
export const MAX_ERROR_RATE = { A: 0.0, B: 0.001, C: 0.005, D: 0.01, E: 0.05, F: 0.15 };

/** Build a k6 `thresholds` object for the flows a script actually exercises. */
export function thresholdsFor(flows, profileKey = PROFILE_KEY) {
  const mult = DEGRADATION[profileKey] ?? 1;
  const errRate = MAX_ERROR_RATE[profileKey] ?? 0.01;

  const t = {
    // Global gates
    http_req_failed: [{ threshold: `rate<${errRate}`, abortOnFail: false }],
    http_req_duration: [`p(95)<${Math.round(P95.global * mult)}`, `p(99)<${Math.round(800 * mult)}`],
    checks: [`rate>${1 - Math.max(errRate, 0.01)}`],
    // Timeout budget (§8)
    flow_timeouts: ['rate<0.005'],
  };

  for (const flow of flows) {
    const base = P95[flow];
    if (!base) continue;

    // Observation-only sub-metrics FIRST, real gates second — the real gates
    // must win. Assigning them the other way round silently replaces the error
    // threshold with the permissive `rate<=1` placeholder.
    Object.assign(t, observedSubmetrics(flow));

    t[`flow_duration{flow:${flow}}`] = [
      `p(50)<${Math.round(base * 0.5 * mult)}`,
      `p(90)<${Math.round(base * 0.8 * mult)}`,
      `p(95)<${Math.round(base * mult)}`,
      `p(99)<${Math.round(base * 2 * mult)}`,
    ];
    t[`flow_errors{flow:${flow}}`] = [`rate<${Math.max(errRate, 0.001)}`];
  }
  return t;
}

/**
 * k6 only materialises a tagged sub-metric if some threshold references it.
 * These are observation-only — the bounds are deliberately unreachable so they
 * never gate a build, but they make `flow_requests{flow:X}`,
 * `payload_bytes{flow:X}` and `rows_returned{flow:X}` appear in the summary.
 *
 * Without this the N+1 and unbounded-query columns render as "—", which is the
 * one thing this suite most needs to show.
 */
export function observedSubmetrics(flow) {
  return {
    [`flow_errors{flow:${flow}}`]: [{ threshold: 'rate<=1', abortOnFail: false }],
    [`flow_requests{flow:${flow}}`]: [{ threshold: 'avg<100000', abortOnFail: false }],
    [`payload_bytes{flow:${flow}}`]: [{ threshold: 'avg<1000000000', abortOnFail: false }],
    [`rows_returned{flow:${flow}}`]: [{ threshold: 'avg<100000000', abortOnFail: false }],
    [`api_duration{flow:${flow}}`]: [{ threshold: 'p(95)<3600000', abortOnFail: false }],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP defaults
// ─────────────────────────────────────────────────────────────────────────────

export const REQUEST_TIMEOUT = __ENV.REQUEST_TIMEOUT || '30s';
export const UPLOAD_TIMEOUT = __ENV.UPLOAD_TIMEOUT || '180s';

/** Think time between flow iterations, seconds. Real users are not a tight loop. */
export const THINK_MIN = Number(__ENV.THINK_MIN || 1);
export const THINK_MAX = Number(__ENV.THINK_MAX || 5);

/** Whether to print a one-line summary per iteration (debugging only). */
export const VERBOSE = __ENV.VERBOSE === 'true';
