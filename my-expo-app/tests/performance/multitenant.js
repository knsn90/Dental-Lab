/**
 * MULTI-TENANT — Phase 11. 100 laboratories × 10 users = 1,000 concurrent users.
 *
 * Two questions, answered simultaneously:
 *
 *   1. CORRECTNESS — does RLS still isolate tenants when the database is busy?
 *      Every read is checked: no row may carry a `lab_id` other than the caller's,
 *      and directly requesting another tenant's row by id must return nothing.
 *      `tenant_isolation_violations` must be exactly 0. One leak fails the run.
 *
 *   2. PERFORMANCE — are response times stable across tenants?
 *      Latency is tagged per tenant. Because the RLS predicate is not sargable
 *      (analysis §2.1), cost is driven by TOTAL rows across all tenants, not by
 *      the caller's own row count — so a big tenant should slow down small ones.
 *      `tenant_latency` per tenant is the direct measurement of that claim.
 *
 *   k6 run -e TENANTS=100 -e USERS_PER_TENANT=10 \
 *          -e BASE_URL=... -e ANON_KEY=... tests/performance/multitenant.js
 *
 * Requires a users.json containing users from many tenants — see
 * seed/seed-tenants.sql and seed/make-users.mjs.
 */
import { check, fail, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import exec from 'k6/execution';
import { USERS, getSession, tenantIndices } from './lib/auth.js';
import { restGet, restCount, newTally } from './lib/http.js';
import { flowDashboard } from './api/dashboard.js';
import { flowOrdersList, flowOrderDetail, sampleOrderId } from './api/orders.js';
import { tenantLeaks, tenantLeakCount, measure } from './lib/metrics.js';
import { TARGET_ENV } from './config.js';
import { thinkTime } from './lib/data.js';
import { textSummary, jsonSummary } from './lib/summary.js';

const TENANTS = Number(__ENV.TENANTS || 100);
const USERS_PER_TENANT = Number(__ENV.USERS_PER_TENANT || 10);
const TOTAL_VUS = Number(__ENV.MT_VUS || TENANTS * USERS_PER_TENANT);

/** Latency per tenant — the cross-tenant interference measurement. */
const tenantLatency = new Trend('tenant_latency', true);
const tenantErrors = new Rate('tenant_errors');
const crossTenantProbes = new Counter('cross_tenant_probes');
/** Probe could not be evaluated. Must never be silently treated as a pass. */
const probeInconclusive = new Counter('tenant_probe_inconclusive');

export const options = {
  scenarios: {
    tenants: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: Math.round(TOTAL_VUS * 0.25) },
        { duration: '2m', target: Math.round(TOTAL_VUS * 0.5) },
        { duration: '3m', target: TOTAL_VUS },
        { duration: '10m', target: TOTAL_VUS },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // Isolation is absolute. Any leak aborts the run immediately.
    tenant_isolation_violations: [
      { threshold: 'rate==0', abortOnFail: true, delayAbortEval: '5s' },
    ],
    tenant_isolation_violation_count: [
      { threshold: 'count==0', abortOnFail: true, delayAbortEval: '5s' },
    ],
    // An inconclusive probe is a failed verification, not a pass.
    tenant_probe_inconclusive: [{ threshold: 'count==0', abortOnFail: false }],
    // Performance must stay within 2× the single-tenant SLO at 1,000 users.
    'flow_duration{flow:dashboard}': [{ threshold: 'p(95)<1000', abortOnFail: false }],
    'flow_duration{flow:orders_list}': [{ threshold: 'p(95)<800', abortOnFail: false }],
    http_req_failed: ['rate<0.01'],
    tenant_errors: ['rate<0.01'],
  },
  tags: { scenario: 'multitenant', target_env: TARGET_ENV },
};

export function setup() {
  if (TARGET_ENV === 'production') {
    throw new Error('multitenant.js must never run against production.');
  }
  const tenants = tenantIndices();
  if (tenants.length < 2) {
    fail(
      `multitenant.js needs users from at least 2 tenants; users.json has ${tenants.length}. ` +
        'Run seed/seed-tenants.sql and regenerate users.json with seed/make-users.mjs.',
    );
  }
  console.log(
    `── MULTI-TENANT ── ${tenants.length} tenants, ${USERS.length} users, ${TOTAL_VUS} VUs`,
  );

  // Build the cross-tenant probe map: for each tenant, one lab_id belonging to a
  // DIFFERENT tenant. VUs use this to attempt a read they must not be allowed.
  const labByTenant = {};
  for (const u of USERS) {
    if (u.tenant !== undefined && u.lab_id && !labByTenant[u.tenant]) {
      labByTenant[u.tenant] = u.lab_id;
    }
  }

  // users.json often has no lab_id (it is a server-side value). Discover it by
  // logging in one lab user per tenant and reading their own profile. Without
  // this the ACTIVE cross-tenant probe silently does nothing — which would make
  // the test look like it passed when it never actually ran.
  const missing = tenants.filter((t) => !labByTenant[t]);
  if (missing.length) {
    console.log(`setup: discovering lab_id for ${missing.length} tenant(s) …`);
    for (const t of missing) {
      const u = USERS.find(
        (x) => x.tenant === t && (x.user_type === 'lab' || x.user_type === 'admin'),
      );
      if (!u) continue;
      const s = getSession(u);
      if (s && s.profile && s.profile.lab_id) labByTenant[t] = s.profile.lab_id;
    }
  }

  const discovered = Object.keys(labByTenant).length;
  if (discovered < 2) {
    fail(
      `Could not determine lab_id for at least 2 tenants (found ${discovered}). ` +
        'The cross-tenant probe cannot run, so isolation would go unverified.',
    );
  }
  console.log(`setup: cross-tenant probe armed for ${discovered} tenants`);

  return { tenants, labByTenant };
}

export default function (data) {
  const user = USERS[(exec.vu.idInTest - 1) % USERS.length];
  const tenant = String(user.tenant ?? 0);
  const started = Date.now();

  const session = getSession(user);
  if (!session) {
    tenantErrors.add(1, { tenant });
    return;
  }

  const myLabId = (session.profile && session.profile.lab_id) || user.lab_id || null;

  // ── Normal work, tagged by tenant ─────────────────────────────────────────
  const r = Math.random();
  let res;
  if (r < 0.5) res = flowDashboard(session);
  else if (r < 0.8) res = flowOrdersList(session);
  else {
    const id = sampleOrderId(session);
    res = id ? flowOrderDetail(session, id) : { ok: true };
  }

  tenantLatency.add(Date.now() - started, { tenant });
  tenantErrors.add(res && res.ok === false ? 1 : 0, { tenant });

  // ── Isolation assertions ──────────────────────────────────────────────────
  assertNoForeignRows(session, myLabId, tenant);
  probeForeignTenant(session, data.labByTenant, user, tenant);

  sleep(thinkTime());
}

/**
 * Read rows the caller IS allowed to see, and verify every one of them belongs
 * to the caller's lab. This catches a policy that is too permissive.
 */
function assertNoForeignRows(session, myLabId, tenant) {
  if (!myLabId) return; // clinic/doctor users are scoped differently

  const t = newTally();
  const res = restGet(session, 'work_orders?select=id,lab_id&limit=100', {
    flow: 'orders_list', call: 'isolation_scan', tally: t,
  });

  let rows = [];
  try { rows = res.json() || []; } catch { return; }

  const foreign = rows.filter((row) => row.lab_id && row.lab_id !== myLabId);
  const leaked = foreign.length > 0;

  tenantLeaks.add(leaked ? 1 : 0, { tenant, probe: 'own_rows' });
  if (leaked) {
    tenantLeakCount.add(foreign.length, { tenant });
    console.error(
      `TENANT LEAK: user ${session.user.email} (lab ${myLabId}) saw ${foreign.length} ` +
        `rows from other labs: ${foreign.slice(0, 3).map((f) => f.lab_id).join(', ')}`,
    );
  }
  check({ foreign: foreign.length }, {
    'no foreign lab_id in visible rows': (x) => x.foreign === 0,
  });
}

/**
 * Actively request another tenant's data. Correct behaviour is an empty result
 * (RLS filters it), NOT a 403 — PostgREST + RLS returns [] for rows you cannot
 * see. Anything non-empty is a hard leak.
 */
function probeForeignTenant(session, labByTenant, user, tenant) {
  const others = Object.keys(labByTenant).filter((t) => t !== String(user.tenant));
  if (!others.length) return;

  const victimTenant = others[Math.floor(Math.random() * others.length)];
  const victimLabId = labByTenant[victimTenant];
  if (!victimLabId) return;

  const t = newTally();
  crossTenantProbes.add(1, { tenant });

  // Probe 1: filter explicitly by the other tenant's lab_id.
  const res = restGet(session, `work_orders?select=id,lab_id&lab_id=eq.${victimLabId}&limit=5`, {
    flow: 'orders_list', call: 'cross_tenant_probe', tally: t, expect: [200, 206, 401, 403],
  });

  let rows = [];
  try { rows = res.json() || []; } catch { rows = []; }
  const leaked = Array.isArray(rows) && rows.length > 0;

  tenantLeaks.add(leaked ? 1 : 0, { tenant, probe: 'cross_tenant' });
  if (leaked) {
    tenantLeakCount.add(rows.length, { tenant });
    console.error(
      `TENANT LEAK (cross-probe): ${session.user.email} (tenant ${tenant}) read ` +
        `${rows.length} rows from lab ${victimLabId} (tenant ${victimTenant})`,
    );
  }

  // Probe 2..N: every other tenant-scoped table.
  //
  // ⚠️ LESSON (2026-08-02): this used to probe only work_orders + stock_items and
  // reported "0 violations". A real cross-tenant leak in `order_stages` went
  // undetected for exactly that reason — a lab admin could read every other lab's
  // production stages. Narrow probe coverage produces false confidence, which is
  // worse than no probe at all.
  //
  // Two probe shapes are needed, because tables scope tenancy differently:
  //   · direct    — the table has its own lab_id column
  //   · indirect  — tenancy comes through work_orders (order_stages, order_items,
  //                 work_order_photos …). These CANNOT be filtered by lab_id, so
  //                 we read a page and assert nothing belongs to another tenant.
  let leakedAny = 0;

  for (const table of DIRECT_TENANT_TABLES) {
    const r = restGet(session, `${table}?select=id,lab_id&lab_id=eq.${victimLabId}&limit=5`, {
      flow: 'orders_list', call: `xt_direct_${table}`, tally: t, expect: [200, 206, 401, 403, 404],
    });
    let rr = [];
    try { rr = r.json() || []; } catch { rr = []; }
    const leak = Array.isArray(rr) && rr.length > 0;
    tenantLeaks.add(leak ? 1 : 0, { tenant, probe: `direct:${table}` });
    if (leak) {
      leakedAny += rr.length;
      tenantLeakCount.add(rr.length, { tenant });
      console.error(`TENANT LEAK (${table}): ${session.user.email} read ${rr.length} rows of lab ${victimLabId}`);
    }
  }

  // Indirect tables: the leak signature is "I can read the child row but NOT its
  // parent work order" — an ORPHAN.
  //
  // Detected by comparing two exact counts, NOT by sampling rows:
  //   plain  = children the child policy lets me read
  //   inner  = children whose parent work order is ALSO visible to me (!inner is
  //            resolved through the parent's RLS)
  //   orphans = plain − inner  →  any positive value is a cross-tenant leak
  //
  // ⚠️ Two earlier attempts failed, both worth remembering:
  //   1. `!inner` alone reported "clean" — an inner join hides exactly the rows
  //      that leak. That is why the real `order_stages` leak survived a
  //      "0 violations" run on 2026-08-02.
  //   2. A LEFT embed with `limit=200` also reported "clean" — sampling bias.
  //      PostgREST returns rows in physical order, and the first 200 happened to
  //      belong to the caller's own lab while 9,500 foreign rows sat further in.
  //
  // Counting has neither weakness. Verified on staging with the leaky policy
  // deliberately restored: plain=10000, inner=500, orphans=9500 → detected.
  for (const { table, fk } of INDIRECT_TENANT_TABLES) {
    const plain = restCount(session, `${table}?select=id`, {
      flow: 'orders_list', call: `xt_orphan_plain_${table}`, tally: t,
    });
    const joined = restCount(session, `${table}?select=id,${fk}!inner(id)`, {
      flow: 'orders_list', call: `xt_orphan_inner_${table}`, tally: t,
    });

    // A probe that cannot run must NOT look like a probe that passed. Silent
    // skips are how the first two versions of this check reported "clean" while
    // a live leak was open — count it as an inconclusive run and say so.
    if (plain.count == null || joined.count == null) {
      probeInconclusive.add(1, { tenant, probe: `orphan:${table}` });
      console.warn(
        `PROBE INCONCLUSIVE (${table}): count unavailable ` +
        `(plain=${plain.count}, inner=${joined.count}) — isolation NOT verified for this table`,
      );
      continue;
    }

    const orphans = plain.count - joined.count;
    tenantLeaks.add(orphans > 0 ? 1 : 0, { tenant, probe: `orphan:${table}` });
    if (orphans > 0) {
      leakedAny += orphans;
      tenantLeakCount.add(orphans, { tenant });
      console.error(
        `TENANT LEAK (${table}): ${session.user.email} can read ${plain.count} rows but only ` +
        `${joined.count} have a visible parent — ${orphans} orphaned rows belong to other tenants`,
      );
    }
  }

  check({ a: rows.length, b: leakedAny }, {
    'cross-tenant work_orders probe returned nothing': (x) => x.a === 0,
    'no cross-tenant rows on any other table': (x) => x.b === 0,
  });
}

/** Tables carrying their own `lab_id` — probe by filtering on the victim's lab. */
const DIRECT_TENANT_TABLES = [
  'stock_items',
  'order_items',
  'work_order_photos',
  'notifications',
  'invoices',
  'expenses',
  'deliveries',
  'activity_logs',
];

/**
 * Tables whose tenancy is inherited through a work order. `order_stages` is first
 * on purpose — that is the one the old, narrower probe missed.
 */
const INDIRECT_TENANT_TABLES = [
  { table: 'order_stages', fk: 'work_orders' },
  { table: 'order_messages', fk: 'work_orders' },
  { table: 'status_history', fk: 'work_orders' },
];

export function handleSummary(data) {
  return {
    stdout: textSummary(data, `MULTI-TENANT — ${TENANTS} labs × ${USERS_PER_TENANT} users`) +
      tenantReport(data),
    'tests/performance/results/multitenant-summary.json': jsonSummary(data, 'multitenant'),
    'tests/performance/results/multitenant-isolation.json': JSON.stringify(
      isolationData(data), null, 2,
    ),
  };
}

function isolationData(data) {
  const violations = data.metrics.tenant_isolation_violation_count
    ? data.metrics.tenant_isolation_violation_count.values.count : 0;
  const probes = data.metrics.cross_tenant_probes
    ? data.metrics.cross_tenant_probes.values.count : 0;

  // Spread of per-tenant p95 — the cross-tenant interference measure.
  const perTenant = [];
  for (const [name, m] of Object.entries(data.metrics)) {
    const match = /^tenant_latency\{tenant:([^}]+)\}$/.exec(name);
    if (match && m.values) {
      perTenant.push({ tenant: match[1], p50: m.values.med, p95: m.values['p(95)'] });
    }
  }
  perTenant.sort((a, b) => (b.p95 || 0) - (a.p95 || 0));

  const p95s = perTenant.map((t) => t.p95).filter((v) => isFinite(v));
  const spread = p95s.length > 1 ? Math.max(...p95s) / Math.min(...p95s) : null;

  return {
    tenants_configured: TENANTS,
    users_per_tenant: USERS_PER_TENANT,
    total_vus: TOTAL_VUS,
    isolation_violations: violations,
    cross_tenant_probes: probes,
    isolation_verdict: violations === 0
      ? 'PASS — no tenant leakage observed'
      : `FAIL — ${violations} rows leaked across tenants`,
    per_tenant_latency: perTenant.slice(0, 20),
    p95_spread_ratio: spread,
    stability_verdict: spread === null
      ? 'insufficient data'
      : spread <= 2
        ? 'stable across tenants (≤2× spread)'
        : `UNSTABLE — slowest tenant is ${spread.toFixed(1)}× the fastest; ` +
          'consistent with the non-sargable RLS predicate in analysis §2.1',
  };
}

function tenantReport(data) {
  const d = isolationData(data);
  return [
    '',
    '  TENANT ISOLATION & FAIRNESS',
    '  ' + '─'.repeat(86),
    `  Cross-tenant probes issued : ${d.cross_tenant_probes}`,
    `  Isolation violations       : ${d.isolation_violations}`,
    `  Verdict                    : ${d.isolation_violations === 0 ? '✅ ' : '❌ '}${d.isolation_verdict}`,
    '',
    `  p95 spread across tenants  : ${d.p95_spread_ratio ? d.p95_spread_ratio.toFixed(2) + '×' : '—'}`,
    `  Fairness verdict           : ${d.stability_verdict}`,
    '',
  ].join('\n');
}
