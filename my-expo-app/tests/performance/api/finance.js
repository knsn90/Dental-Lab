/**
 * Finance — invoices, payments, expenses, current account (cari).
 *
 * `invoices` shows 32,118 sequential scans for 16 rows in production telemetry —
 * this flow is the regression guard for that.
 *
 * Multi-currency note: the project rule is strict per-currency accounting (no
 * implicit ₺). These queries therefore never assume a currency; they read what
 * the rows carry.
 */
import { check } from 'k6';
import { restGet, restCount, rpc, newTally } from '../lib/http.js';
import { measure } from '../lib/metrics.js';

/** The finance landing screen. */
export function flowFinanceOverview(session) {
  return measure('reports', () => {
    const t = newTally();
    const labId = session.user && session.user.lab_id;

    restGet(
      session,
      'invoices?select=id,invoice_number,total_amount,currency,status,due_date,created_at' +
        '&order=created_at.desc&limit=50',
      { flow: 'reports', call: 'invoices_list', tally: t },
    );
    restCount(session, 'invoices?select=id&status=neq.paid', {
      flow: 'reports', call: 'invoices_unpaid_count', tally: t,
    });
    restGet(
      session,
      'payments?select=id,amount,currency,payment_date,method&order=payment_date.desc&limit=50',
      { flow: 'reports', call: 'payments_list', tally: t },
    );
    restGet(
      session,
      'expenses?select=id,amount,currency,category,expense_date&order=expense_date.desc&limit=50',
      { flow: 'reports', call: 'expenses_list', tally: t },
    );
    if (labId) {
      restGet(session, `currency_rates?select=currency,rate,rate_date&lab_id=eq.${labId}&order=rate_date.desc&limit=10`, {
        flow: 'reports', call: 'currency_rates', tally: t,
      });
    }

    check(t, { 'finance overview <= 6 requests': (x) => x.requests <= 6 });
    return t;
  });
}

/** Clinic current-account statement — a join-heavy read. */
export function flowClinicStatement(session, clinicId) {
  return measure('reports', () => {
    const t = newTally();

    const res = restGet(session, 'clinics?select=id&limit=1', {
      flow: 'reports', call: 'sample_clinic', tally: t,
    });
    let id = clinicId;
    if (!id) {
      try {
        const rows = res.json() || [];
        id = rows.length ? rows[0].id : null;
      } catch { /* ignore */ }
    }
    if (!id) return { ...t, ok: true, skipped: 'no visible clinic' };

    restGet(
      session,
      `invoices?select=id,invoice_number,total_amount,currency,status,created_at,` +
        `invoice_orders(work_order_id)&clinic_id=eq.${id}&order=created_at.desc&limit=100`,
      { flow: 'reports', call: 'statement_invoices', tally: t },
    );
    restGet(
      session,
      `payments?select=id,amount,currency,payment_date&clinic_id=eq.${id}&order=payment_date.desc&limit=100`,
      { flow: 'reports', call: 'statement_payments', tally: t },
    );
    return t;
  });
}

/** Cash / bank movements. */
export function flowCash(session) {
  return measure('reports', () => {
    const t = newTally();
    restGet(
      session,
      'cash_movements?select=id,amount,currency,direction,created_at&order=created_at.desc&limit=50',
      { flow: 'reports', call: 'cash_movements', tally: t },
    );
    restGet(session, 'checks?select=id,amount,currency,due_date,status&order=due_date.asc&limit=50', {
      flow: 'reports', call: 'checks', tally: t,
    });
    return t;
  });
}

/** Order profitability — recomputes cost server-side, so it is a write-ish read. */
export function flowOrderProfit(session, orderId) {
  if (!orderId) return { ok: true, skipped: 'no order' };
  return measure('reports', () => {
    const t = newTally();
    rpc(session, 'calculate_order_profit', { p_work_order_id: orderId }, {
      flow: 'reports', call: 'calculate_order_profit', tally: t, expect: [200, 204, 404],
    });
    return t;
  });
}
