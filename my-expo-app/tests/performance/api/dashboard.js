/**
 * F2 — Dashboard.
 *
 * A faithful replay of modules/dashboard/screens/LabDashboardScreen.tsx:
 *   loadPipeline (L1091), loadExtra (L1112), loadAnalytics (L1273)
 * including the two UNBOUNDED queries and the polymorphic doctor_id N+1.
 *
 * The unbounded queries are the point: `rows_returned` and `payload_bytes` on this
 * flow are the regression signal for analysis §2.3.
 */
import { check } from 'k6';
import { restGet, restCount, newTally } from '../lib/http.js';
import { measure } from '../lib/metrics.js';

const SIX_MONTHS_MS = 182 * 86400000;

/** Full lab/admin dashboard load — 13–15 round trips. */
export function flowDashboard(session) {
  return measure('dashboard', () => {
    const t = newTally();
    const today = new Date().toISOString().slice(0, 10);
    const sixMonthsAgo = new Date(Date.now() - SIX_MONTHS_MS).toISOString();

    // ── loadPipeline (L1100) — UNBOUNDED, counts client-side ────────────────
    const pipeline = restGet(session, 'work_orders?select=status&status=neq.iptal', {
      flow: 'dashboard', call: 'pipeline_all_statuses', tally: t,
    });

    // ── loadExtra (L1118) — 5 parallel in the app; k6 VUs are single-threaded
    //    so these run sequentially. Latency here is the SUM, not the MAX; the
    //    per-call `api_duration{call:...}` metric is what to compare against the
    //    app's real parallel behaviour.
    const mainSelect =
      'id,order_number,work_type,status,hold_status,delivery_date,created_at,' +
      'patient_name,doctor_id,tooth_numbers,revision_of_id,revision_no,continues_order_id';

    // UNBOUNDED (L1129): six months of orders, no LIMIT.
    const main = restGet(
      session,
      `work_orders?select=${mainSelect}&created_at=gte.${sixMonthsAgo}&order=created_at.desc`,
      { flow: 'dashboard', call: 'six_month_orders_UNBOUNDED', tally: t },
    );

    restCount(session, `work_orders?select=id&created_at=gte.${today}T00:00:00`, {
      flow: 'dashboard', call: 'count_today', tally: t,
    });
    restCount(session, 'work_orders?select=id&status=eq.kalite_kontrol', {
      flow: 'dashboard', call: 'count_qc', tally: t,
    });
    restGet(
      session,
      'work_orders?select=id,order_number,work_type,patient_name,created_at,is_urgent,doctor_id' +
        '&status=eq.alindi&triaged_at=is.null&or=(is_archived.is.null,is_archived.eq.false)' +
        '&order=created_at.desc&limit=5',
      { flow: 'dashboard', call: 'triage_pending', tally: t },
    );
    restCount(
      session,
      `work_orders?select=id&status=eq.teslim_edildi&updated_at=gte.${today}T00:00:00`,
      { flow: 'dashboard', call: 'count_delivered_today', tally: t },
    );

    // ── Polymorphic doctor_id N+1 (L1160–1181) ──────────────────────────────
    let orders = [];
    try { orders = main.json() || []; } catch { orders = []; }
    const docIds = uniq(orders.slice(0, 5).map((o) => o.doctor_id).filter(Boolean));

    if (docIds.length) {
      const inList = `(${docIds.join(',')})`;
      restGet(session, `profiles?select=id,full_name,clinic_id&id=in.${inList}`, {
        flow: 'dashboard', call: 'resolve_doctor_profiles', tally: t,
      });
      const docs = restGet(session, `doctors?select=id,full_name,clinic_id&id=in.${inList}`, {
        flow: 'dashboard', call: 'resolve_doctor_doctors', tally: t,
      });

      let clinicIds = [];
      try {
        clinicIds = uniq((docs.json() || []).map((d) => d.clinic_id).filter(Boolean));
      } catch { /* ignore */ }
      if (clinicIds.length) {
        restGet(session, `clinics?select=id,logo_url&id=in.(${clinicIds.join(',')})`, {
          flow: 'dashboard', call: 'resolve_clinic_logos', tally: t,
        });
      }
    }

    // ── loadAnalytics (L1277) ───────────────────────────────────────────────
    const labId = session.user && session.user.lab_id;
    if (labId) {
      restGet(
        session,
        'v_station_analytics?select=station_name,station_color,avg_duration_hours,active_count,' +
          `total_processed&lab_id=eq.${labId}&order=avg_duration_hours.desc&limit=4`,
        { flow: 'dashboard', call: 'station_analytics', tally: t },
      );
      restGet(
        session,
        'v_technician_performance?select=technician_name,approval_rate,avg_work_duration_hours,' +
          `total_assigned&lab_id=eq.${labId}&order=approval_rate.desc&limit=3`,
        { flow: 'dashboard', call: 'technician_performance', tally: t },
      );
      restGet(session, `stock_items?select=id,name,quantity,min_quantity&lab_id=eq.${labId}`, {
        flow: 'dashboard', call: 'stock_alerts', tally: t,
      });
    }

    // Regression guards on the unbounded queries themselves.
    check(pipeline, {
      'dashboard pipeline returned data': (r) => r.status === 200 || r.status === 206,
    });
    check(t, {
      'dashboard made <= 16 requests (N+1 guard)': (x) => x.requests <= 16,
      'dashboard payload < 2 MB (unbounded-query guard)': (x) => x.bytes < 2 * 1024 * 1024,
    });

    return t;
  });
}

/** Doctor/clinic dashboard — a smaller, different query set. */
export function flowClinicDashboard(session) {
  return measure('dashboard', () => {
    const t = newTally();
    const today = new Date().toISOString().slice(0, 10);

    restGet(
      session,
      'work_orders?select=id,order_number,work_type,status,delivery_date,patient_name,created_at' +
        '&order=created_at.desc&limit=20',
      { flow: 'dashboard', call: 'clinic_recent_orders', tally: t },
    );
    restCount(session, 'work_orders?select=id&status=neq.teslim_edildi&status=neq.iptal', {
      flow: 'dashboard', call: 'clinic_count_open', tally: t,
    });
    restCount(session, `work_orders?select=id&delivery_date=lt.${today}&status=neq.teslim_edildi`, {
      flow: 'dashboard', call: 'clinic_count_overdue', tally: t,
    });
    restGet(session, 'notifications?select=id,title,created_at,is_read&order=created_at.desc&limit=10', {
      flow: 'dashboard', call: 'clinic_notifications', tally: t,
    });
    return t;
  });
}

/** Station wall board (F8) — the always-on client. */
export function flowKanban(session) {
  return measure('kanban', () => {
    const t = newTally();
    const labId = session.user && session.user.lab_id;

    restGet(
      session,
      'order_stages?select=id,sequence_order,status,is_critical,station_id,work_order_id,' +
        'started_at,assigned_to&status=in.(bekliyor,aktif,makine_bekliyor,onay_bekliyor)' +
        '&order=sequence_order.asc&limit=200',
      { flow: 'kanban', call: 'active_stages', tally: t },
    );
    if (labId) {
      restGet(session, `lab_stations?select=id,name,color,sort_order&lab_id=eq.${labId}&order=sort_order.asc`, {
        flow: 'kanban', call: 'stations', tally: t,
      });
    }
    restGet(
      session,
      'work_orders?select=id,order_number,work_type,patient_name,is_urgent,delivery_date,' +
        'current_stage_name&status=in.(asamada,uretimde,kalite_kontrol)&limit=100',
      { flow: 'kanban', call: 'board_orders', tally: t },
    );
    return t;
  });
}

function uniq(arr) {
  const seen = {};
  const out = [];
  for (const v of arr) if (!seen[v]) { seen[v] = 1; out.push(v); }
  return out;
}
