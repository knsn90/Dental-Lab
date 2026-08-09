/**
 * F9 — Notifications, and the realtime WebSocket path.
 *
 * `notifications` is the 2nd-largest live table and a published realtime table.
 * Insert fan-out (order-delivered → N recipient rows → N WAL events → N ×
 * subscribers RLS evaluations → trg_whatsapp_meta_notify → pg_net) is the
 * multiplier described in analysis §2.2 / §2.7.
 */
import ws from 'k6/ws';
import { check } from 'k6';
import { restGet, restCount, restUpdate, newTally } from '../lib/http.js';
import { measure, apiDuration } from '../lib/metrics.js';
import { ALLOW_WRITES, ANON_KEY, BASE_URL } from '../config.js';

/** The notification bell: list + unread count. Runs on every panel mount. */
export function flowNotifications(session) {
  return measure('notifications', () => {
    const t = newTally();

    restGet(
      session,
      'notifications?select=id,title,body,category,is_read,created_at&order=created_at.desc&limit=20',
      { flow: 'notifications', call: 'list', tally: t },
    );
    restCount(session, 'notifications?select=id&is_read=eq.false', {
      flow: 'notifications', call: 'unread_count', tally: t,
    });
    return t;
  });
}

/** Mark notifications read. WRITE — but low-risk, so still gated. */
export function flowMarkRead(session) {
  if (!ALLOW_WRITES) return { ok: true, skipped: 'writes disabled' };

  return measure('notifications', () => {
    const t = newTally();
    const res = restGet(session, 'notifications?select=id&is_read=eq.false&limit=1', {
      flow: 'notifications', call: 'find_unread', tally: t,
    });
    let id = null;
    try {
      const rows = res.json() || [];
      id = rows.length ? rows[0].id : null;
    } catch { /* ignore */ }
    if (!id) return { ...t, skipped: 'nothing unread' };

    restUpdate(session, `notifications?id=eq.${id}`, { is_read: true }, {
      flow: 'notifications', call: 'mark_read', tally: t,
    });
    return t;
  });
}

/**
 * Open a Realtime WebSocket and subscribe to the tables the app subscribes to,
 * then hold it for `holdMs`.
 *
 * This is what actually loads the Realtime service — HTTP-only load tests
 * systematically understate this system's cost because 35 client files hold
 * subscriptions and wall boards hold them 24/7 (analysis §1.9, F8).
 *
 * Measures: handshake time, join-ack time, and messages received.
 */
export function flowRealtimeSubscribe(session, opts = {}) {
  const holdMs = opts.holdMs ?? 30000;
  const tables = opts.tables || ['work_orders', 'order_stages', 'notifications'];
  const wsUrl =
    `${BASE_URL.replace(/^http/, 'ws')}/realtime/v1/websocket` +
    `?apikey=${ANON_KEY}&vsn=1.0.0`;

  return measure('realtime', () => {
    const t = newTally();
    const started = Date.now();
    let joined = 0;
    let messages = 0;
    let joinAckMs = null;

    const res = ws.connect(wsUrl, {}, function (socket) {
      socket.on('open', function () {
        apiDuration.add(Date.now() - started, { flow: 'realtime', call: 'ws_handshake' });

        tables.forEach(function (table, i) {
          socket.send(JSON.stringify({
            topic: `realtime:public:${table}`,
            event: 'phx_join',
            payload: {
              config: {
                postgres_changes: [{ event: '*', schema: 'public', table }],
              },
              access_token: session.token,
            },
            ref: String(i + 1),
          }));
        });

        // Heartbeat every 25 s, exactly like supabase-js.
        socket.setInterval(function () {
          socket.send(JSON.stringify({
            topic: 'phoenix', event: 'heartbeat', payload: {}, ref: '0',
          }));
        }, 25000);

        socket.setTimeout(function () { socket.close(); }, holdMs);
      });

      socket.on('message', function (msg) {
        messages += 1;
        try {
          const m = JSON.parse(msg);
          if (m.event === 'phx_reply' && m.payload && m.payload.status === 'ok') {
            joined += 1;
            if (joinAckMs === null) {
              joinAckMs = Date.now() - started;
              apiDuration.add(joinAckMs, { flow: 'realtime', call: 'ws_join_ack' });
            }
          }
        } catch { /* non-JSON frame */ }
      });

      socket.on('error', function (e) {
        if (e && e.error() !== 'websocket: close sent') {
          t.ok = false;
        }
      });
    });

    t.requests += 1;
    check(res, { 'ws connected (101)': (r) => r && r.status === 101 });
    check({ joined, tables: tables.length, joinAckMs }, {
      'all channels joined': (x) => x.joined >= x.tables,
      'join ack < 1 s': (x) => x.joinAckMs !== null && x.joinAckMs < 1000,
    });

    return { ...t, ok: t.ok && res && res.status === 101, messages, joined };
  });
}
