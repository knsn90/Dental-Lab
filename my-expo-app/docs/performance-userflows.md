# Performance-Critical User Flows — Siman

> Derived from the actual code paths (file:line references throughout), not from
> assumptions about what a dental-lab app "probably" does.
>
> **Reference tenant** used for concurrency modelling: a mid-size lab —
> 1 admin, 2 managers, 8 technicians, 1 courier, 25 connected clinics, 60 doctors,
> ~120 orders/day, ~3,500 open orders at steady state.
>
> `Reads` / `Writes` = **statements reaching Postgres**, including RLS helper-function
> calls and triggers, not just the round trips the client makes.

---

## Traffic model

Observed call counts from `pg_stat_statements` give the real ratios:

| Flow | Observed calls | Share |
|---|---|---|
| Order status/badge polling | 16,960 + 11,416 + 7,973 + 2,240 | **~66 %** |
| Chat / order messages | 9,928 + 1,826 | ~17 %|
| Permissions bootstrap | 2,875 | ~5 % |
| People lookups (profiles/doctors) | 2,537 + 1,919 + 5,142 | ~8 % |
| Order detail (with embeds) | 809 | ~1 % |
| Everything else | — | ~3 % |

**The system is overwhelmingly read-heavy and dominated by list/count queries on
`work_orders`.** Any load profile that does not reflect that is not testing this app.

Load-test mix used in `tests/performance/load.js`:

| Weight | Flow |
|---|---|
| 40 % | F2 Dashboard |
| 25 % | F3 Orders list + filter |
| 12 % | F4 Order detail |
| 8 % | F6 Status update (write) |
| 5 % | F9 Notifications |
| 4 % | F5 Create order (write) |
| 3 % | F10 Stock |
| 3 % | F11 Finance / reports |

---

## F1 — Login / session bootstrap

**Path:** `app/(auth)/*` → `lib/supabase.ts` → `core/store/authStore.ts:fetchProfile`
→ panel `_layout.tsx` → `rpc/get_my_permissions`

| Step | Call | Notes |
|---|---|---|
| 1 | `POST /auth/v1/token?grant_type=password` | bcrypt verify + JWT sign — intentionally slow |
| 2 | `GET /profiles?id=eq.<uid>&select=*` | `select('*')`, 5 s timeout + 2 retries (`authStore.ts`) |
| 3 | `POST /rpc/get_my_permissions` | mean **6.51 ms**, 2,875 observed calls |
| 4 | panel guard re-reads profile | `_layout.tsx` self-heal, 5 layouts |
| 5 | notification store subscribes | opens WebSocket |

| Metric | Value |
|---|---|
| API calls | **4–6** |
| Reads | ~8 (RLS helpers on `profiles` fire per policy) |
| Writes | 2 (`auth.sessions`, `auth.refresh_tokens`) |
| Payload | < 10 KB |
| Expected P95 | **< 1,000 ms** (bcrypt dominates) |
| Concurrency | Spiky — 08:00–09:00 TR, ~80 % of a tenant's DAU inside 30 min |

**Risk:** step 2's 5 s timeout with 2 retries means a slow DB turns one login into
**15 s and 3 connections held**. Under load this is a connection-pool amplifier.

---

## F2 — Dashboard (highest-traffic screen)

**Path:** `modules/dashboard/screens/LabDashboardScreen.tsx`
(`loadPipeline` L1091, `loadExtra` L1112, `loadAnalytics` L1273)

| # | Query | Bounded? |
|---|---|---|
| 1 | `work_orders.select('status').neq(status,'iptal')` (L1100) | ❌ **no LIMIT** |
| 2 | `work_orders` 12 cols, `created_at >= now()-6mo`, ordered (L1129) | ❌ **no LIMIT** |
| 3 | `work_orders` count today | ✅ head |
| 4 | `work_orders` count `kalite_kontrol` | ✅ head |
| 5 | `work_orders` triage list | ✅ limit 5 |
| 6 | `work_orders` count delivered today | ✅ head |
| 7–9 | `profiles` + `doctors` + `clinics` by `in(docIds)` (L1168–1179) | N+1 for the 5 recent orders |
| 10–11 | `profiles` + `doctors` again for triage (L1240) | N+1 again |
| 12–13 | `v_station_analytics`, `v_technician_performance` | ✅ limit 4 / 3 |
| 14–15 | `stock_items`, `stock_movements` (L1303) | partial |

| Metric | Value |
|---|---|
| API calls | **13–15** |
| Reads | 15 statements + RLS helper calls per scanned row |
| Writes | 0 |
| Payload today | ~15 KB |
| **Payload at 3,500 open orders / 21,600 in 6 months** | **~2.5 MB** (query 2: 21,600 rows × ~120 B) |
| Expected P95 | **< 500 ms** |
| Concurrency | Every user, every app open + every foreground resume (`useAppResume`) |

**Risk:** queries 1 and 2 are unbounded. This is the flow that turns a slow database
into an unusable one, and it is also the most frequently executed.

---

## F3 — Orders list + filter

**Path:** `modules/orders/screens/OrdersListScreenV2.tsx` + `hooks/useOrders.ts`

Realtime subscription on `work_orders` (`useOrders.ts:61`) refetches the list on
**every** change to the table within the tenant.

| Metric | Value |
|---|---|
| API calls | 2–4 (list + count + filter facets) |
| Reads | list is the 11,416-call / 7,973-call statement pair |
| Writes | 0 |
| Payload | 50–200 KB per page |
| Expected P95 | **< 400 ms** |
| Concurrency | ~60 % of active users have this open |

**Risk:** realtime-triggered refetch. 10 users on the list + 1 status change = 10
full list re-queries. This is an **N× write amplification into reads**.

---

## F4 — Order detail

**Path:** `modules/orders/screens/OrderDetailScreenV2.tsx` (4,528 lines) +
`hooks/useOrderDetail.ts` (realtime channel per order, L49)

Observed: the `work_orders` + `current_stage` + `all_stages` embed query is
**809 calls at mean 35.15 ms** — the slowest per-call read in the system.

| Metric | Value |
|---|---|
| API calls | **8–12** (order, items, stages, photos, messages, approvals, deliveries, materials) |
| Reads | 12+, several against tables with **unindexed FKs** (`work_order_photos.work_order_id`, `status_history.work_order_id`, `stage_photos.work_order_id`) |
| Writes | 0 (1 if marking messages read) |
| Payload | 30–150 KB + signed URLs |
| Expected P95 | **< 700 ms** |
| Concurrency | ~30 % of technicians continuously |

**Risk:** `work_order_photos` shows **5,287 seq scans for 125 rows** — that is this
screen, scanning the whole photo table on every open because `work_order_id` has no
index.

---

## F5 — Create order (heaviest write)

**Path:** `modules/orders/screens/NewOrderScreen.tsx` (10,134 lines), submit at L2100+

Sequential, not parallel:

| # | Call | L |
|---|---|---|
| 1 | `doctors.select(id).eq(id)` | 2103 |
| 2 | `profiles.select(...)` if not found | 2109 |
| 3 | `doctors.ilike(full_name)` match | 2117 |
| 4 | `doctors.insert(...)` if still not found | 2132 |
| 5 | `rpc/resolve_item_price` **× N items** | 1508 |
| 6 | `work_orders.insert(...)` | — |
| 7 | `order_items.insert(...)` bulk | — |
| 8..n | photo uploads + `work_order_photos.insert` **× M files** | 2327–2400 |

Trigger cascade on step 6 (13 triggers, §2.7 of the analysis): order-number
generation, 2× lab_id autofill, storage-cleanup queue, auto-draft-invoice,
3× notification insert, delivered-notify, 3× activity log, updated_at.
Each `notifications` INSERT then fires `trg_whatsapp_meta_notify` → `net.http_post`.

| Metric | Value |
|---|---|
| API calls | **6 + N items + M files** (typ. 10–14) |
| Reads | ~10 |
| Writes | **~25–35 statements** (1 order + N items + 13 triggers + ~37 activity_log rows/order observed + notifications) |
| Upload | 0–10 files; photos ~2–5 MB, STL **10–200 MB** |
| Expected P95 | **< 2,000 ms** excluding uploads |
| Concurrency | ~120/day/lab, bursty 09:00–11:00 |

**Risk:** 4 sequential round trips before the insert even starts. The whole trigger
cascade is inside the user's transaction, so latency is the sum of 13 trigger bodies.

---

## F6 — Update status / advance production stage

**Path:** `rpc/update_work_order_status`, `rpc/start_stage_simple`,
`rpc/admin_complete_stage`, `rpc/transition_stage_state`

| Metric | Value |
|---|---|
| API calls | 1–2 |
| Reads | 3–5 (RLS + stage lookups) |
| Writes | **8–12** (`order_stages` 8 triggers → notify ×3, bonus, activity log, stage_log sync, current-stage-name sync back onto `work_orders`) |
| Expected P95 | **< 600 ms** |
| Concurrency | 8 technicians × ~15 transitions/day = ~120/day/lab, plus fan-out |

**Risk:** each transition writes to `work_orders` (`current_stage_name` sync), which
is a **published realtime table** → every subscriber in the tenant gets a WAL event →
every list screen refetches (F3). One button press can cost 10+ downstream reads.

---

## F7 — File upload (STL / photo / ZIP / PDF)

**Path:** `lib/photos.ts:uploadPhoto` (5 MB guard) and 6 other call sites with **no
guard** — `chatApi.ts:506`, `NewOrderScreen.tsx:1869/2327/2398`,
`StageFileUpload.tsx:453`, `uploadFaceScanResult.ts:79`.

| Metric | Value |
|---|---|
| API calls | 1 upload + 1 `work_order_photos.insert` + 1 signed-URL |
| Client RAM | **≈ 2.33 × file size** (base64 string + decoded buffer both live) |
| Typical photo | 2–5 MB |
| Typical STL | 10–50 MB |
| Bucket ceiling | **200 MB** (`work-order-photos`) → ~466 MB peak client RAM |
| Expected | **< 5 s for ≤ 10 MB on a 20 Mbps link** |
| Concurrency | 2–5 files per order, ~120 orders/day/lab |

**Risk:** single-shot, no resume, no retry, no progress, no concurrency cap.
A dropped mobile connection at 90 % restarts from zero.

---

## F8 — Production board / station kanban

**Path:** `modules/station/hooks/useKanbanData.ts` (realtime), `app/(station)/stats.tsx`

| Metric | Value |
|---|---|
| API calls | 4–6 |
| Reads | `order_stages` (mean 13.39 ms observed) + `lab_stations` + `work_orders` |
| Writes | 0 |
| Expected P95 | **< 600 ms** |
| Concurrency | **Always-on wall displays** — the only permanently-connected clients |

**Risk:** wall-mounted screens hold realtime subscriptions 24/7. They are the base
load under which everything else runs, and they never disconnect.

---

## F9 — Notifications

**Path:** `core/store/notificationsStore.ts` (realtime on `notifications`) +
`core/notifications/dispatch.ts`

`notifications` is the 2nd-largest live table (1,784 rows) and shows **4,892 index
scans**; `email_notifications` shows 572 rows / 561 updates.

| Metric | Value |
|---|---|
| API calls | 1 list + 1 unread count + realtime |
| Writes | 1 per read-marking; fan-out on insert |
| Expected P95 | **< 300 ms** list, **< 2 s** end-to-end delivery |
| Concurrency | every logged-in user, permanently subscribed |

**Risk:** insert fan-out. One order-delivered event → N recipient rows → N WAL events
→ N × subscribers RLS evaluations → `trg_whatsapp_meta_notify` → pg_net → Edge Fn →
Meta API. **No queue, no retry, no dead-letter.**

---

## F10 — Stock / inventory

**Path:** `modules/stock/*`, `rpc/create_stock_movement_with_snapshot`,
`rpc/confirm_stage_materials`

`stock_movements` INSERT fires **6 triggers** including `fifo_apply_movement`
(writes `fifo_layers` + `fifo_allocations`) and `trg_recompute_order_cost`.

| Metric | Value |
|---|---|
| API calls | 3–5 read, 1–2 write |
| Writes | **6–15 statements** per movement (FIFO layer walk is variable) |
| Expected P95 | **< 800 ms** |
| Concurrency | low volume, but **serialized per stock item** |

**Risk:** FIFO consumption takes row locks on `fifo_layers` for the item. Two
technicians consuming the same material concurrently serialize. This is the most
likely place to see **lock contention** under load.

---

## F11 — Finance / reports

**Path:** 29 `report_*` / `profitability_*` RPCs

| Metric | Value |
|---|---|
| API calls | 1–3 per report |
| Reads | full scans over `invoices`, `payments`, `expenses`, `work_orders`, `stock_movements` for the date range |
| `work_mem` | **3.5 MB** — any real sort or hash **spills to disk** |
| Expected P95 | **< 3,000 ms** (explicitly a slower tier) |
| Concurrency | low (1–2 users), but expensive and unbounded by date |

**Risk:** no date-range cap in the signatures (`p_from`, `p_to` are free). One
"all time" report on a large tenant can hold a connection for a minute.

---

## F12 — Courier tracking

**Path:** `modules/courier/CourierLiveMap.tsx`, `CourierTrackingMap.tsx` (realtime on
`gps_pings` + `deliveries`)

| Metric | Value |
|---|---|
| Writes | 1 GPS ping per courier per interval — **the highest-frequency write in the system** |
| Reads | map subscribers × ping rate |
| Expected P95 | **< 300 ms** ping write, **< 2 s** map update |
| Concurrency | 1–3 couriers/lab, but continuous |

**Risk:** `gps_pings` is in the realtime publication. At 1 ping / 10 s / courier ×
100 labs × 2 couriers = **20 writes/s**, each fanning out to every map viewer with a
full RLS evaluation. This is a direct multiplier on the §2.2 bottleneck.

---

## Summary table

| Flow | API calls | Reads | Writes | Payload | Target P95 | Concurrency |
|---|---|---|---|---|---|---|
| F1 Login | 4–6 | ~8 | 2 | < 10 KB | 1,000 ms | spiky, 08:00–09:00 |
| **F2 Dashboard** | **13–15** | 15+ | 0 | **2.5 MB at scale** | **500 ms** | **every user, every open** |
| F3 Orders list | 2–4 | 2–4 | 0 | 50–200 KB | 400 ms | ~60 % of users |
| F4 Order detail | 8–12 | 12+ | 0–1 | 30–150 KB | 700 ms | ~30 % of techs |
| **F5 Create order** | 10–14 | ~10 | **25–35** | + uploads | 2,000 ms | 120/day/lab |
| F6 Status update | 1–2 | 3–5 | 8–12 | < 5 KB | 600 ms | 120/day/lab + fan-out |
| F7 Upload | 3 | 1 | 2 | **10–200 MB** | 5 s / 10 MB | 2–5 per order |
| F8 Kanban | 4–6 | 6 | 0 | 20–80 KB | 600 ms | **always-on** |
| F9 Notifications | 2 + WS | 2 | 1 | < 20 KB | 300 ms | every user, always |
| F10 Stock | 4–7 | 5 | 6–15 | < 50 KB | 800 ms | low, **lock-prone** |
| F11 Reports | 1–3 | full scans | 0 | 10–500 KB | 3,000 ms | low, expensive |
| F12 Courier GPS | 1 + WS | 1 | 1 | < 1 KB | 300 ms | continuous |

---

*Next: [performance-targets.md](performance-targets.md)*
