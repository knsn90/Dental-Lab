/**
 * Cleanup — remove everything a write-enabled run created.
 *
 * Every synthetic row is findable two ways:
 *   · work_orders.external_source = RUN_TAG   (exact, preferred)
 *   · patient_name LIKE 'ZZK6%'               (belt and braces)
 * Uploads live under storage path `k6/<RUN_TAG>/…`.
 *
 * Run as a standalone k6 script:
 *   k6 run -e BASE_URL=... -e ANON_KEY=... -e RUN_TAG=k6-20260801T1200 \
 *          -e ALLOW_WRITES=true tests/performance/lib/cleanup.js
 *
 * Or with -e CLEANUP_ALL=true to remove every synthetic row this suite has ever
 * created, regardless of run tag.
 *
 * Deletion order matters: children before parents, or FK constraints reject the
 * delete. Note that 143 FKs are unindexed (analysis §2.4), so parent deletes do a
 * sequential scan of each child table — cleanup on a large staging DB is slow by
 * construction, and that slowness is itself a finding.
 */
import { check } from 'k6';
import { userForVU, getSession } from './auth.js';
import { restGet, restDelete, storageRemove, newTally } from './http.js';
import { RUN_TAG, SYNTHETIC_PREFIX, ALLOW_WRITES } from '../config.js';

const CLEANUP_ALL = __ENV.CLEANUP_ALL === 'true';
const BUCKET = __ENV.UPLOAD_BUCKET || 'work-order-photos';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: { checks: ['rate>0.9'] },
  tags: { scenario: 'cleanup' },
};

/** PostgREST filter selecting this run's (or all) synthetic orders. */
function orderFilter() {
  return CLEANUP_ALL
    ? `patient_name=like.${SYNTHETIC_PREFIX}*`
    : `external_source=eq.${RUN_TAG}`;
}

export default function () {
  if (!ALLOW_WRITES) {
    console.log('cleanup: ALLOW_WRITES is not true — nothing to do (read-only run).');
    return;
  }

  const session = getSession(userForVU());
  if (!session) {
    console.error('cleanup: authentication failed');
    return;
  }

  const t = newTally();
  console.log(`cleanup: scope=${CLEANUP_ALL ? 'ALL synthetic rows' : `run ${RUN_TAG}`}`);

  // ── 1. Find the orders to remove ─────────────────────────────────────────
  const found = restGet(session, `work_orders?select=id&${orderFilter()}&limit=2000`, {
    flow: 'cleanup', call: 'find_orders', tally: t,
  });
  let ids = [];
  try { ids = (found.json() || []).map((o) => o.id).filter(Boolean); } catch { /* ignore */ }
  console.log(`cleanup: ${ids.length} synthetic work_orders found`);

  if (ids.length) {
    const inList = `(${ids.join(',')})`;

    // ── 2. Children first ──────────────────────────────────────────────────
    // Ordered so no FK is left dangling. Each of these is a seq scan on the
    // child table because the FK is unindexed (analysis §2.4).
    const childTables = [
      'work_order_photos',
      'order_messages',
      'order_items',
      'status_history',
      'order_stages',
      'approvals',
      'deliveries',
      'invoice_orders',
    ];
    for (const table of childTables) {
      const res = restDelete(session, `${table}?work_order_id=in.${inList}`, {
        call: `delete_${table}`, tally: t,
      });
      check(res, {
        [`${table} cleanup ok`]: (r) => r.status === 200 || r.status === 204 || r.status === 404,
      });
    }

    // ── 3. Parents ─────────────────────────────────────────────────────────
    const res = restDelete(session, `work_orders?id=in.${inList}`, {
      call: 'delete_work_orders', tally: t,
    });
    check(res, {
      'work_orders cleanup ok': (r) => r.status === 200 || r.status === 204,
    });
  }

  // ── 4. Synthetic stock movements ─────────────────────────────────────────
  const mvFilter = CLEANUP_ALL ? 'notes=like.*k6-*' : `notes=like.*${RUN_TAG}*`;
  restDelete(session, `stock_movements?${mvFilter}`, { call: 'delete_stock_movements', tally: t });

  // ── 5. Storage objects ───────────────────────────────────────────────────
  // The Storage API deletes by explicit key list, so enumerate first.
  const objects = restGet(
    session,
    `objects?select=name&bucket_id=eq.${BUCKET}&name=like.k6/${CLEANUP_ALL ? '*' : RUN_TAG}*&limit=1000`,
    { flow: 'cleanup', call: 'list_objects', tally: t, expect: [200, 206, 404] },
  );
  let names = [];
  try { names = (objects.json() || []).map((o) => o.name).filter(Boolean); } catch { /* ignore */ }

  if (names.length) {
    // Chunk — a single delete with thousands of keys times out.
    for (let i = 0; i < names.length; i += 100) {
      storageRemove(session, BUCKET, names.slice(i, i + 100), { call: 'remove_objects', tally: t });
    }
    console.log(`cleanup: removed ${names.length} storage objects`);
  } else {
    console.log('cleanup: no storage objects matched (or storage.objects is not REST-readable)');
  }

  // ── 6. Verify ────────────────────────────────────────────────────────────
  const remaining = restGet(session, `work_orders?select=id&${orderFilter()}&limit=1`, {
    flow: 'cleanup', call: 'verify', tally: t,
  });
  let left = [];
  try { left = remaining.json() || []; } catch { /* ignore */ }

  check({ left: left.length }, {
    'cleanup left no synthetic orders behind': (x) => x.left === 0,
  });

  console.log(
    left.length === 0
      ? 'cleanup: ✅ complete'
      : `cleanup: ⚠️  ${left.length}+ synthetic orders remain — check RLS delete policies`,
  );
}

/**
 * Callable from another script's teardown().
 * Note: k6's teardown runs once, in its own VU, with a fresh session.
 */
export function cleanupRun(session) {
  if (!ALLOW_WRITES) return { ok: true, skipped: true };
  const t = newTally();
  const found = restGet(session, `work_orders?select=id&external_source=eq.${RUN_TAG}&limit=2000`, {
    flow: 'cleanup', call: 'find_orders', tally: t,
  });
  let ids = [];
  try { ids = (found.json() || []).map((o) => o.id); } catch { return t; }
  if (!ids.length) return t;

  const inList = `(${ids.join(',')})`;
  for (const table of ['work_order_photos', 'order_messages', 'order_items', 'status_history', 'order_stages']) {
    restDelete(session, `${table}?work_order_id=in.${inList}`, { call: `delete_${table}`, tally: t });
  }
  restDelete(session, `work_orders?id=in.${inList}`, { call: 'delete_work_orders', tally: t });
  return t;
}
