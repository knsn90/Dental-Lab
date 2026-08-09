/**
 * F10 — Stock / inventory.
 *
 * `stock_movements` INSERT fires 6 triggers including `fifo_apply_movement`
 * (writes fifo_layers + fifo_allocations) and `trg_recompute_order_cost`.
 * FIFO takes row locks per stock item, so concurrent consumption of the SAME item
 * serialises — this is the most likely lock-contention point in the system
 * (analysis §6, userflows F10).
 *
 * `flowFifoContention` deliberately targets one shared item to measure that.
 */
import { check } from 'k6';
import { restGet, restCount, rpc, newTally } from '../lib/http.js';
import { measure, rowsCreated } from '../lib/metrics.js';
import { ALLOW_WRITES, RUN_TAG } from '../config.js';
import { randInt } from '../lib/data.js';

/** Read-only stock screen. */
export function flowStockList(session) {
  return measure('stock', () => {
    const t = newTally();
    const labId = session.user && session.user.lab_id;

    restGet(
      session,
      'stock_items?select=id,name,quantity,min_quantity,unit,currency,unit_cost' +
        (labId ? `&lab_id=eq.${labId}` : '') + '&order=name.asc&limit=200',
      { flow: 'stock', call: 'stock_items', tally: t },
    );
    restGet(
      session,
      'stock_movements?select=id,stock_item_id,movement_type,quantity,created_at' +
        '&order=created_at.desc&limit=50',
      { flow: 'stock', call: 'recent_movements', tally: t },
    );
    restCount(session, 'stock_items?select=id&quantity=lt.min_quantity', {
      flow: 'stock', call: 'low_stock_count', tally: t,
    });
    return t;
  });
}

/** Cache one stock item id per VU so the write flow has a target. */
const itemCache = {};
export function sampleStockItemId(session) {
  const key = session.userId;
  if (itemCache[key] && itemCache[key].expires > Date.now()) return itemCache[key].id;

  const t = newTally();
  const res = restGet(session, 'stock_items?select=id,quantity&quantity=gt.10&limit=20', {
    flow: 'stock', call: 'sample_stock_item', tally: t,
  });
  let id = null;
  try {
    const rows = res.json() || [];
    id = rows.length ? rows[randInt(0, rows.length - 1)].id : null;
  } catch { /* ignore */ }
  itemCache[key] = { id, expires: Date.now() + 120_000 };
  return id;
}

/**
 * A stock movement through the app's RPC. WRITE.
 * The RPC is used rather than a direct insert because
 * `trg_stock_qty_sync` owns `stock_items.quantity` — writing it directly would
 * double-count (project rule: never UPDATE stock_items.quantity by hand).
 */
export function flowStockMovement(session, opts = {}) {
  if (!ALLOW_WRITES) return { ok: true, skipped: 'writes disabled' };

  return measure('stock', () => {
    const t = newTally();
    const itemId = opts.stockItemId || sampleStockItemId(session);
    if (!itemId) return { ...t, ok: true, skipped: 'no stock item available' };

    const res = rpc(
      session,
      'create_stock_movement_with_snapshot',
      {
        p_stock_item_id: itemId,
        p_movement_type: 'cikis',
        p_quantity: opts.quantity ?? 0.1,
        p_notes: `${RUN_TAG} synthetic load-test movement`,
      },
      { flow: 'stock', call: 'create_movement', tally: t, expect: [200, 201, 204, 400, 404] },
    );

    if (res.status === 200 || res.status === 201) {
      rowsCreated.add(1, { table: 'stock_movements' });
    }
    return t;
  });
}

/**
 * FIFO lock-contention probe.
 *
 * Every VU consumes the SAME stock item, so `fifo_apply_movement` must serialise
 * them. Latency here vs. flowStockMovement (random items) is the direct measure
 * of lock-wait cost.
 *
 * Pass -e FIFO_ITEM_ID=<uuid> to pin the contended item.
 */
export function flowFifoContention(session) {
  if (!ALLOW_WRITES) return { ok: true, skipped: 'writes disabled' };
  const pinned = __ENV.FIFO_ITEM_ID;
  if (!pinned) return { ok: true, skipped: 'FIFO_ITEM_ID not set' };

  return measure('stock', () => {
    const t = newTally();
    const res = rpc(
      session,
      'create_stock_movement_with_snapshot',
      {
        p_stock_item_id: pinned,
        p_movement_type: 'cikis',
        p_quantity: 0.01,
        p_notes: `${RUN_TAG} FIFO contention probe`,
      },
      { flow: 'stock', call: 'fifo_contended', tally: t, expect: [200, 201, 204, 400, 404, 409] },
    );

    check(res, {
      'no deadlock (40P01)': (r) => String(r.body || '').indexOf('40P01') === -1,
      'no serialization failure (40001)': (r) => String(r.body || '').indexOf('40001') === -1,
      'fifo write under 2 s': (r) => r.timings.duration < 2000,
    });
    return t;
  });
}

/** Material consumption at a production stage — the other FIFO entry point. */
export function flowConfirmStageMaterials(session, stageId) {
  if (!ALLOW_WRITES || !stageId) return { ok: true, skipped: 'writes disabled or no stage' };

  return measure('stock', () => {
    const t = newTally();
    const itemId = sampleStockItemId(session);
    if (!itemId) return { ...t, ok: true, skipped: 'no stock item' };

    rpc(
      session,
      'confirm_stage_materials',
      { p_stage_id: stageId, p_materials: [{ stock_item_id: itemId, quantity: 0.1 }] },
      { flow: 'stock', call: 'confirm_stage_materials', tally: t, expect: [200, 204, 400, 404] },
    );
    return t;
  });
}
