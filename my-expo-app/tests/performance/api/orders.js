/**
 * F3 Orders list · F4 Order detail · F5 Create order · F6 Status update.
 *
 * Mirrors modules/orders/* — including the four sequential doctor-resolution round
 * trips in NewOrderScreen.tsx:2100-2150 that precede the actual insert.
 */
import { check } from 'k6';
import { restGet, restCount, restInsert, restUpdate, rpc, newTally } from '../lib/http.js';
import { measure, rowsCreated } from '../lib/metrics.js';
import { ALLOW_WRITES } from '../config.js';
import {
  newWorkOrder, newOrderItem, newOrderMessage, pick, randInt,
  ORDER_STATUSES, SAFE_TRANSITIONS,
} from '../lib/data.js';

const LIST_SELECT =
  'id,order_number,work_type,status,delivery_date,patient_name,doctor_id,is_urgent,' +
  'created_at,current_stage_name,hold_status';

/** F3 — Orders list, with a filter and an exact count (what the UI renders). */
export function flowOrdersList(session, opts = {}) {
  return measure('orders_list', () => {
    const t = newTally();
    const page = opts.page ?? randInt(0, 2);
    const pageSize = opts.pageSize ?? 50;
    const from = page * pageSize;
    const to = from + pageSize - 1;

    restGet(
      session,
      `work_orders?select=${LIST_SELECT}&order=created_at.desc&limit=${pageSize}&offset=${from}`,
      { flow: 'orders_list', call: 'list_page', tally: t, headers: { Range: `${from}-${to}` } },
    );

    // Status facet counts — the badge queries that dominate observed traffic
    // (16,960 calls at mean 11 ms, analysis §3 row 5).
    const status = opts.status ?? pick(['alindi', 'uretimde', 'kalite_kontrol', 'teslimata_hazir']);
    restCount(session, `work_orders?select=id&status=eq.${status}`, {
      flow: 'orders_list', call: 'count_by_status', tally: t,
    });

    return t;
  });
}

/** Search by order number or patient name — the `ilike` path. */
export function flowSearch(session, term) {
  return measure('search', () => {
    const t = newTally();
    const q = term || `ZZK6`;
    restGet(
      session,
      `work_orders?select=${LIST_SELECT}&or=(order_number.ilike.*${q}*,patient_name.ilike.*${q}*)&limit=25`,
      { flow: 'search', call: 'search_orders', tally: t },
    );
    return t;
  });
}

/** Pick a random order id this session can actually see. Cached per VU. */
const orderIdCache = {};
export function sampleOrderId(session) {
  const key = session.userId;
  const cached = orderIdCache[key];
  if (cached && cached.expires > Date.now() && cached.ids.length) {
    return cached.ids[Math.floor(Math.random() * cached.ids.length)];
  }
  const t = newTally();
  const res = restGet(session, 'work_orders?select=id&order=created_at.desc&limit=50', {
    flow: 'orders_list', call: 'sample_ids', tally: t,
  });
  let ids = [];
  try { ids = (res.json() || []).map((o) => o.id).filter(Boolean); } catch { /* ignore */ }
  orderIdCache[key] = { ids, expires: Date.now() + 60_000 };
  return ids.length ? ids[Math.floor(Math.random() * ids.length)] : null;
}

/**
 * F4 — Order detail. 8–12 round trips.
 * Several of these hit tables with unindexed FKs (`work_order_photos.work_order_id`,
 * `status_history.work_order_id`) — analysis §2.4.
 */
export function flowOrderDetail(session, orderId) {
  return measure('order_detail', () => {
    const t = newTally();
    const id = orderId || sampleOrderId(session);
    if (!id) return { ...t, ok: false, skipped: 'no visible order' };

    // The 35 ms embed query (analysis §3 row 11).
    restGet(
      session,
      `work_orders?id=eq.${id}&select=*,current_stage:current_stage_id(*),` +
        `all_stages:order_stages(id,sequence_order,status,station_id,started_at,completed_at)`,
      { flow: 'order_detail', call: 'order_with_stages', tally: t },
    );
    restGet(session, `order_items?select=*&work_order_id=eq.${id}`, {
      flow: 'order_detail', call: 'items', tally: t,
    });
    restGet(session, `order_stages?select=*&work_order_id=eq.${id}&order=sequence_order.asc`, {
      flow: 'order_detail', call: 'stages', tally: t,
    });
    // Unindexed FK — full scan of work_order_photos (5,287 seq scans observed).
    restGet(session, `work_order_photos?select=*&work_order_id=eq.${id}`, {
      flow: 'order_detail', call: 'photos_UNINDEXED_FK', tally: t,
    });
    restGet(
      session,
      `order_messages?select=*,sender:sender_id(id,full_name)&work_order_id=eq.${id}` +
        '&order=created_at.desc&limit=50',
      { flow: 'order_detail', call: 'messages', tally: t },
    );
    // Unindexed FK.
    restGet(session, `status_history?select=*&work_order_id=eq.${id}&order=created_at.desc&limit=20`, {
      flow: 'order_detail', call: 'status_history_UNINDEXED_FK', tally: t,
    });
    restGet(session, `approvals?select=*&work_order_id=eq.${id}`, {
      flow: 'order_detail', call: 'approvals', tally: t,
    });
    restGet(session, `deliveries?select=*&work_order_id=eq.${id}`, {
      flow: 'order_detail', call: 'deliveries', tally: t,
    });

    check(t, { 'order detail <= 12 requests': (x) => x.requests <= 12 });
    return t;
  });
}

/**
 * F5 — Create order. WRITE. Skipped unless ALLOW_WRITES=true.
 *
 * Replays NewOrderScreen.tsx's actual sequence, including the 1–4 sequential
 * doctor-resolution round trips before the insert. The 13-trigger cascade fires
 * server-side; its cost shows up in this flow's duration.
 */
export function flowCreateOrder(session, opts = {}) {
  if (!ALLOW_WRITES) return { ok: true, skipped: 'writes disabled' };

  return measure('create_order', () => {
    const t = newTally();

    // Step 1–3: polymorphic doctor resolution (NewOrderScreen.tsx:2103-2126).
    let doctorId = opts.doctorId || null;
    if (!doctorId) {
      const docRes = restGet(session, 'doctors?select=id&is_active=eq.true&limit=1', {
        flow: 'create_order', call: 'resolve_doctor', tally: t,
      });
      try {
        const rows = docRes.json() || [];
        doctorId = rows.length ? rows[0].id : null;
      } catch { /* ignore */ }
    }

    // Step 5: price resolution per item.
    const itemCount = opts.itemCount ?? randInt(1, 3);
    rpc(session, 'resolve_item_price', { p_service_id: null, p_quantity: itemCount }, {
      flow: 'create_order', call: 'resolve_item_price', tally: t, expect: [200, 204, 400, 404],
    });

    // Step 6: the insert — 13 triggers fire inside this transaction.
    const payload = newWorkOrder({ doctorId, ...opts });
    const created = restInsert(session, 'work_orders', payload, {
      flow: 'create_order', call: 'insert_order', tally: t,
    });

    let orderId = null;
    try {
      const rows = created.json();
      orderId = Array.isArray(rows) ? rows[0] && rows[0].id : rows && rows.id;
    } catch { /* ignore */ }

    const ok = check(created, {
      'order created': (r) => r.status === 201 || r.status === 200,
      'order has id': () => !!orderId,
    });
    if (!ok) return { ...t, ok: false };
    rowsCreated.add(1, { table: 'work_orders' });

    // Step 7: items.
    if (orderId) {
      const items = [];
      for (let i = 0; i < itemCount; i++) items.push(newOrderItem(orderId));
      restInsert(session, 'order_items', items, {
        flow: 'create_order', call: 'insert_items', tally: t, prefer: 'return=minimal',
      });
      rowsCreated.add(itemCount, { table: 'order_items' });
    }

    return { ...t, orderId };
  });
}

/**
 * F6 — Status update / stage transition. WRITE.
 *
 * Writes to `work_orders`, which is a published realtime table, so this also
 * exercises the WAL fan-out path (analysis §2.2).
 */
export function flowStatusUpdate(session, orderId) {
  if (!ALLOW_WRITES) return { ok: true, skipped: 'writes disabled' };

  return measure('status_update', () => {
    const t = newTally();
    const id = orderId || sampleOrderId(session);
    if (!id) return { ...t, ok: false, skipped: 'no visible order' };

    // Prefer the RPC the app uses; fall back to a direct PATCH if it is absent.
    const res = rpc(
      session,
      'update_work_order_status',
      { p_work_order_id: id, p_status: pick(SAFE_TRANSITIONS) },
      { flow: 'status_update', call: 'update_status_rpc', tally: t, expect: [200, 204, 404] },
    );

    if (res.status === 404) {
      restUpdate(session, `work_orders?id=eq.${id}`, { status: pick(SAFE_TRANSITIONS) }, {
        flow: 'status_update', call: 'update_status_patch', tally: t,
      });
    }
    return t;
  });
}

/** Post a chat message on an order. WRITE. */
export function flowPostMessage(session, orderId) {
  if (!ALLOW_WRITES) return { ok: true, skipped: 'writes disabled' };

  return measure('order_detail', () => {
    const t = newTally();
    const id = orderId || sampleOrderId(session);
    if (!id) return { ...t, ok: false, skipped: 'no visible order' };

    const res = restInsert(session, 'order_messages', newOrderMessage(id), {
      flow: 'order_detail', call: 'post_message', tally: t,
    });
    if (res.status === 201 || res.status === 200) rowsCreated.add(1, { table: 'order_messages' });
    return t;
  });
}

export { ORDER_STATUSES };
