/**
 * F11 — Reports.
 *
 * The 29 `report_*` / `profitability_*` RPCs have no server-side date-range cap
 * and `work_mem` is only 3.5 MB, so any real sort or hash spills to disk
 * (analysis §6). These flows deliberately exercise both a normal 30-day window
 * and an unbounded "all time" window so the difference is measurable.
 */
import { check } from 'k6';
import { rpc, newTally } from '../lib/http.js';
import { measure } from '../lib/metrics.js';
import { pick } from '../lib/data.js';

function range(days) {
  const to = new Date();
  const from = new Date(Date.now() - days * 86400000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** Reports that take (p_lab_id, p_from, p_to). */
const LAB_RANGE_REPORTS = [
  'profitability_summary',
  'profitability_revenue_ccy',
  'profitability_by_doctor',
  'report_technician_performance',
  'report_technician_usage',
  'report_technician_ratings',
  'report_material_waste',
];

/** Reports that take (p_lab_id) only. */
const LAB_ONLY_REPORTS = [
  'report_fifo_stock',
  'report_profile_coverage',
];

/** One randomly chosen report over a 30-day window — the common case. */
export function flowReport(session, opts = {}) {
  return measure('reports', () => {
    const t = newTally();
    const labId = (session.user && session.user.lab_id) || null;
    if (!labId) return { ...t, ok: true, skipped: 'no lab_id (clinic/doctor user)' };

    const { from, to } = range(opts.days ?? 30);
    const fn = opts.fn || pick(LAB_RANGE_REPORTS);

    rpc(session, fn, { p_lab_id: labId, p_from: from, p_to: to }, {
      flow: 'reports', call: fn, tally: t, expect: [200, 204, 404],
    });
    return t;
  });
}

/** The full finance dashboard: several reports in one screen load. */
export function flowFinanceReports(session) {
  return measure('reports', () => {
    const t = newTally();
    const labId = (session.user && session.user.lab_id) || null;
    if (!labId) return { ...t, ok: true, skipped: 'no lab_id' };

    const { from, to } = range(30);
    rpc(session, 'profitability_summary', { p_lab_id: labId, p_from: from, p_to: to }, {
      flow: 'reports', call: 'profitability_summary', tally: t, expect: [200, 204, 404],
    });
    rpc(session, 'profitability_revenue_ccy', { p_lab_id: labId, p_from: from, p_to: to }, {
      flow: 'reports', call: 'profitability_revenue_ccy', tally: t, expect: [200, 204, 404],
    });
    rpc(
      session,
      'profitability_top_orders',
      { p_lab_id: labId, p_limit: 10, p_order_by: 'profit', p_from: from, p_to: to },
      { flow: 'reports', call: 'profitability_top_orders', tally: t, expect: [200, 204, 404] },
    );
    return t;
  });
}

/**
 * Worst case: an unbounded date range. This is what a user clicking "all time"
 * does, and there is nothing in the RPC signatures stopping them.
 * Gated behind HEAVY_REPORTS so it does not run in the default load mix.
 */
export function flowUnboundedReport(session) {
  if (__ENV.HEAVY_REPORTS !== 'true') return { ok: true, skipped: 'heavy reports disabled' };

  return measure('reports', () => {
    const t = newTally();
    const labId = (session.user && session.user.lab_id) || null;
    if (!labId) return { ...t, ok: true, skipped: 'no lab_id' };

    const res = rpc(
      session,
      'profitability_summary',
      { p_lab_id: labId, p_from: '2000-01-01', p_to: new Date().toISOString().slice(0, 10) },
      { flow: 'reports', call: 'profitability_ALL_TIME', tally: t, expect: [200, 204, 404, 500, 504] },
    );
    check(res, {
      'all-time report did not time out': (r) => r.status !== 504 && r.status !== 0,
      'all-time report under 30 s': (r) => r.timings.duration < 30000,
    });
    return t;
  });
}

/** Inventory / consumption reports (no lab arg or different shapes). */
export function flowInventoryReports(session) {
  return measure('reports', () => {
    const t = newTally();
    const labId = (session.user && session.user.lab_id) || null;

    rpc(session, 'report_consumption_gaps', {}, {
      flow: 'reports', call: 'report_consumption_gaps', tally: t, expect: [200, 204, 404],
    });
    if (labId) {
      rpc(
        session,
        'report_reorder_suggestions',
        { p_lab_id: labId, p_window_days: 90, p_lead_days: 14, p_safety_days: 7 },
        { flow: 'reports', call: 'report_reorder_suggestions', tally: t, expect: [200, 204, 404] },
      );
      for (const fn of LAB_ONLY_REPORTS) {
        rpc(session, fn, { p_lab_id: labId }, {
          flow: 'reports', call: fn, tally: t, expect: [200, 204, 404],
        });
      }
    }
    return t;
  });
}

export { LAB_RANGE_REPORTS, LAB_ONLY_REPORTS };
