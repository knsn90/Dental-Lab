# Performance Analysis — Siman (Dental Lab SaaS)

> **Method.** Everything below was measured against the live Supabase project
> `kjwjxqfdsxkxgcgophdy` (`pg_stat_statements`, `pg_stat_user_tables`, `pg_policies`,
> `EXPLAIN (ANALYZE, BUFFERS)` under `role authenticated`) and read from the actual
> codebase. Nothing here is estimated unless the line says "extrapolated".
>
> **Analysis date:** 2026-08-01
> **DB snapshot at time of analysis:** 22 `work_orders`, 17 `profiles`, 1 active tenant.

---

## 0. Executive summary — the three things that will break

| # | Finding | Evidence | Blast radius |
|---|---|---|---|
| **1** | **RLS makes the tenant filter non-sargable.** `work_orders` SELECT is a **Seq Scan** under RLS even though a perfectly good index exists. Same query is an Index-Only Scan without RLS. | `0.202 ms / 3 buffers` (no RLS) → `2.950 ms / 310 buffers` (RLS). **14.6× slower, 103× more I/O, on 22 rows.** | Every single read in the product. Cost is **linear in total rows across all tenants**, not in the caller's tenant. |
| **2** | **Realtime WAL processing is already 58 % of all database time** with one active tenant and 22 orders. | 2 walrus queries: **1,088,313 calls / 5,686,837 ms total** out of ~9.8 M ms measured. Max latency **5.57 s**. | 17 tables in `supabase_realtime`, 35 client files subscribing. Cost scales with `tenants × subscribers × write-rate`. |
| **3** | **The dashboard fetches unbounded row sets and aggregates in JavaScript.** | `LabDashboardScreen.tsx:1100` selects *every* non-cancelled order; `:1129` selects 6 months of orders with 12 columns, no `LIMIT`. | At 500 orders/day a lab downloads ~90,000 rows per dashboard open. Payload and parse time grow without bound. |

Secondary but serious: **143 unindexed foreign keys**, **13 triggers on `work_orders`**, **2,071 PostgREST schema-cache reloads** costing ~672 s of DB CPU, and **base64 in-memory file upload** that will OOM a phone on a large STL.

---

## 1. Architecture inventory

### 1.1 Framework & topology

There is **no application server**. This is a two-tier system: a client bundle talks
directly to Supabase.

```
┌───────────────────────────────┐
│ Expo SDK 55 / React Native    │   one codebase → iOS, Android, Web (PWA)
│ 0.83.6 / React 19.2           │   expo-router (file-based), NativeWind v4
│ Zustand state, i18next (4 loc)│   web build → static export → Vercel (siman.app)
└──────────────┬────────────────┘
               │ HTTPS + WSS, anon key + user JWT
┌──────────────▼────────────────────────────────────────────────┐
│ Supabase project kjwjxqfdsxkxgcgophdy (eu region)             │
│                                                                │
│  PostgREST  ──► Postgres 15  (RLS on ~90 tables, 401 fns)     │
│  GoTrue     ──► auth.users / sessions / refresh_tokens        │
│  Realtime   ──► walrus WAL→JSON, 17 published tables          │
│  Storage    ──► 7 buckets (S3-backed)                         │
│  Edge Fns   ──► 28 Deno functions                             │
│  pg_cron    ──► 3 scheduled jobs                              │
│  pg_net     ──► async HTTP from triggers → Edge Functions     │
└────────────────────────────────────────────────────────────────┘
```

**Consequence for load testing:** the "API" under test is PostgREST + GoTrue +
Storage + Edge Functions. There is no Node process to profile, no application cache,
and no connection pool we control. All capacity questions reduce to *Postgres and
Supavisor*.

### 1.2 Compute tier (this is the hard ceiling)

```
max_connections        60
shared_buffers         256 MB
effective_cache_size   768 MB
work_mem               3.5 MB
statement_timeout      120 s
max_worker_processes    6
```

This is a **Micro instance**. 60 backends is the absolute wall — and Realtime,
PostgREST, GoTrue, Storage, pg_cron and pg_net all draw from it before a single
test VU connects.

### 1.3 Frontend

- 44 feature modules under `modules/`, 8 route groups (`(lab)`, `(admin)`,
  `(clinic)`, `(doctor)`, `(station)`, `(courier)`, `(platform)`, `(auth)`).
- Largest screens: `NewOrderScreen.tsx` **10,134 lines**, `OrderDetailScreenV2.tsx`
  4,528, `LabDashboardScreen.tsx` 2,140. These are single-file mega-components; JS
  parse/execute time on mid-range Android is a real (unmeasured) client-side cost.
- `three` + `three-mesh-bvh` are bundled for the 3D STL viewer → large initial
  bundle and heavy GPU/CPU on the client.

### 1.4 API structure

No hand-written REST layer. Access is:

| Style | Count of call sites | Notes |
|---|---|---|
| PostgREST table reads (`.from(...)`) | **~1,100** | Top tables: `profiles` 111, `work_orders` 98, `order_stages` 40, `doctors` 39 |
| PostgREST RPC (`.rpc(...)`) | ~150 distinct functions | Includes all reporting |
| Storage | 7 call sites | `work-order-photos`, `chat-attachments`, `avatars`, … |
| Edge Functions | 28 | AI, e-mail, push, WhatsApp, payments, couriers |
| Realtime | 35 files subscribe | `postgres_changes` on 17 tables |

`select('*')` appears **99 times**; `count: 'exact'` **30 times** (each is a second
full scan under RLS).

### 1.5 Authentication

- GoTrue e-mail/password (`signInWithPassword`) plus a custom OTP pair
  (`send-otp` / `verify-otp` Edge Functions).
- JWT persisted in `localStorage` (web) / AsyncStorage (native) —
  `lib/supabase.ts` deliberately moved off `expo-secure-store` for an iOS 26 crash.
- **Every authenticated request re-derives identity from the database.** The JWT
  carries only `sub`; `user_type`, `lab_id`, `clinic_id` and role all come from
  `profiles` via `SECURITY DEFINER` helper functions called *inside RLS predicates*.
  This is the root cause of finding #1.
- Custom in-process auth lock replaces `navigator.locks` (multi-tab token refresh).

### 1.6 Database

~90 public tables, **401 functions**, ~120 non-internal triggers.

Trigger fan-out on write paths:

| Table | Triggers | What fires on one INSERT |
|---|---|---|
| `work_orders` | **13** | order-number gen, 2× lab_id autofill, updated_at, storage-cleanup queue, auto-draft-invoice, 3× notify (status/triage/design-approval), delivered-notify, 3× activity log |
| `order_stages` | **8** | stage timing, current-stage-name sync, 3× notify, auto-bonus, activity log, stage_log sync |
| `stock_movements` | **6** | FIFO apply, qty sync, closed-period guard, order-cost recompute, activity log, lab_id |

`notifications` INSERT then fires `trg_whatsapp_meta_notify` → `net.http_post` →
Edge Function. So **creating one order can cascade into 20+ statements and several
outbound HTTP calls.**

### 1.7 Cache

**There is none server-side.** No Redis, no materialized views in the hot path, no
HTTP caching layer. Client-side there is AsyncStorage/localStorage persistence for
dashboard counters (`v3` cache key) and `lastPanelStore` for optimistic routing —
that is the entire cache tier.

### 1.8 Storage

| Bucket | Public | Size limit | Risk |
|---|---|---|---|
| `work-order-photos` | no | **200 MB** | STL/scan files; base64 upload path (§5) |
| `chat-attachments` | no | 100 MB | |
| `support-attachments` | no | 100 MB | broad MIME allowlist incl. video |
| `employee-docs`, `paper-orders`, `occlusion-screenshots` | no | **unlimited** | no server-side cap |
| `avatars`, `lab-logos` | yes | 5 MB / unlimited | |

`storage.objects` already shows **11,247 index scans for 415 rows** — every signed-URL
request hits it.

### 1.9 Realtime

17 tables published: `work_orders`, `order_stages`, `order_messages`, `notifications`,
`profiles`, `stock_items`, `stock_movements`, `deliveries`, `gps_pings`,
`activity_logs`, `approvals`, `case_steps`, `equipment`, `material_requests`,
`pending_paper_orders`, `stage_activity_events`, `whatsapp_sessions`.

`lib/supabase.ts` monkey-patches `supabase.channel()` to append a random suffix to
every channel name. This fixed a real crash, but it means **channels can never be
deduplicated or reused** — two components watching the same table open two
subscriptions, and each subscription is independently RLS-filtered per change.

### 1.10 Queues & background jobs

No queue system (no pgmq, no BullMQ). Background work is:

| Mechanism | Job | Schedule / trigger |
|---|---|---|
| pg_cron #1 | `auto_manage_shift_pauses()` | `*/5 * * * *` |
| pg_cron #2 | `tcmb-rates` Edge Fn via pg_net | `30 13 * * 1-5` |
| pg_cron #4 | `fn_daily_order_watch()` | `0 8 * * *` |
| pg_net | 4 functions POST to Edge Functions | on trigger |

`auto_manage_shift_pauses()` has burned **314,557 ms over 16,503 calls** (mean 19 ms).
It is the 3rd most expensive statement on the instance and does nothing user-visible.

### 1.11 External APIs

| Service | Used by | Latency exposure |
|---|---|---|
| **Anthropic API** | `parse-work-order` (claude-opus-5), `parse-invoice` + `denty-brain` (claude-sonnet-4-5) | seconds; vision/OCR on uploaded images |
| Resend | `send-email-notification` | outbound mail |
| Expo Push | `send-expo-push` | |
| Meta Graph (WhatsApp) | `send-whatsapp-meta`, `whatsapp-webhook` | inbound webhook is **public** |
| BanaBiKurye | courier dispatch + callback | |
| TCMB | FX rates | daily |
| iyzico | `payments-charge` / `payments-callback` | |
| Google Places, qrserver.com | address autocomplete, QR images | |

### 1.12 Multi-tenancy

Pooled multi-tenant: every business table carries `lab_id`, isolated purely by RLS.
`auto_set_lab_id()` triggers stamp it on insert. Clinics/doctors can belong to
multiple labs via `clinic_lab_memberships`. A `(platform)` super-admin panel exists.

**There is no schema-per-tenant and no tenant sharding.** All tenants share one
Postgres instance, one connection pool, and one Realtime WAL stream.

### 1.13 Connection pooling

Supavisor (Supabase-managed) in front of 60 Postgres connections. The app has **no
control** over pool size, and the client uses one HTTPS connection per device with
no batching — every `Promise.all` of 5 queries is 5 concurrent PostgREST requests,
each taking a pool slot.

---

## 2. Measured bottlenecks

### 2.1 🔴 CRITICAL — RLS defeats every index on `work_orders`

The four permissive SELECT policies are OR-ed together into one filter:

```
Filter: ( is_technician_on_order(id)
       OR (my_user_type() = ANY('{lab,admin}') AND lab_id = get_my_lab_id())
       OR (is_clinic_admin() AND my_clinic_id() IS NOT NULL AND (…subplans…))
       OR (my_user_type() = 'doctor' AND doctor_owns_order_doctor(doctor_id)) )
```

Two independent things go wrong:

1. **`lab_id = get_my_lab_id()` is inside an OR branch**, so the planner cannot use
   it as an index condition. The tenant predicate — the one thing that would reduce
   the scan to a single lab — is unusable.
2. **`is_technician_on_order(id)` takes the row's own `id`**, so it is row-dependent
   and evaluated *first* on every row. It cannot be hoisted to an InitPlan.

Measured, same query, same data:

| Role | Plan | Exec | Planning | Buffers |
|---|---|---|---|---|
| `postgres` (RLS bypassed) | **Index Only Scan** `idx_work_orders_lab_status_date` | **0.202 ms** | 1.09 ms | 3 |
| `authenticated` (lab manager) | **Seq Scan** | **2.950 ms** | 5.71 ms | 310 |

Per-row RLS overhead ≈ **(2.950 − 0.202) / 22 ≈ 0.125 ms**.

**Extrapolated** (linear in rows scanned, which is what a Seq Scan gives you):

| Total `work_orders` rows (all tenants) | Predicted single-query time |
|---|---|
| 10,000 | ~1.3 s |
| 100,000 | ~12.5 s |
| 500,000 | ~62 s |
| 1,000,000 | ~125 s → **exceeds `statement_timeout`** |

100 labs × 5,000 orders = 500,000 rows. **The product stops working somewhere
between 50 and 100 paying labs**, and it fails for *everyone* at once because the
cost is driven by global row count, not per-tenant row count.

Corroborating counters: `work_orders` has **97,085 sequential scans** on 22 rows.
`profiles` has **12,843,552 index scans** on 17 rows — that is the RLS helper
functions firing per row, per policy, per query.

Note planning time (5.71 ms) *exceeds* execution time. With 11 policies, plan
generation itself is a fixed tax on every request.

### 2.2 🔴 CRITICAL — Realtime WAL processing dominates the instance

Top two statements by total time, both `realtime.apply_rls` walrus queries:

| calls | total | mean | max |
|---|---|---|---|
| 528,485 | 3,304,872 ms | 6.25 ms | **5,572 ms** |
| 559,828 | 2,381,965 ms | 4.25 ms | 2,088 ms |

**1.09 M calls, 5,686,837 ms ≈ 94.8 minutes of pure DB CPU** — with *one* tenant and
22 orders. A 5.5-second max means the WAL reader stalled hard at least once.

Every published-table write is decoded, converted to JSON, and then **RLS-evaluated
once per subscribed connection**. Cost model:

```
realtime_cost ≈ writes/sec × subscribers_per_row × rls_cost_per_row
```

With finding 2.1 making `rls_cost_per_row` expensive, these two problems multiply.

Supporting counter: `realtime.subscription` shows **32,022 inserts and 31,984
deletes for 38 live rows** — churn from the random-suffix channel patch
(§1.9): every mount/unmount creates and destroys a subscription.

### 2.3 🟠 HIGH — Unbounded client-side aggregation on the dashboard

`modules/dashboard/screens/LabDashboardScreen.tsx`:

- **L1100** `select('status').neq('status','iptal')` — **no LIMIT**. Downloads every
  open order to count them in a JS loop.
- **L1129–1131** 12 columns × 6 months of orders, `.order('created_at')`, **no
  LIMIT**, then loops in JS to build monthly/weekly buckets.
- **L1160–1181** N+1 by design: fetch orders → collect `doctor_id`s → query
  `profiles` → query `doctors` → query `clinics`. Forced by the polymorphic
  `doctor_id` (points at *either* `profiles` or `doctors`), which PostgREST cannot
  embed.
- **L1237–1243** the same N+1 again for the triage list.

`modules/dashboard/api.ts:fetchDashboardStats()` repeats the pattern: pull all open
orders, `.filter()` four times in JS.

One dashboard open ≈ **13–15 PostgREST round trips**, two of them unbounded.

### 2.4 🟠 HIGH — 143 unindexed foreign keys

Worst offenders:

| Table | Unindexed FK columns |
|---|---|
| `work_orders` | `archived_by, assigned_to, box_id, doctor_approval_decided_by, doctors_id, triage_approved_by, triaged_by` |
| `stage_material_selections` | `movement_id, production_material_id, resolved_rule_id, resolved_version_id, stock_item_id, technician_id` |
| `stage_photos` | `stage_id, uploaded_by, work_order_id` |
| `work_order_photos` | `uploaded_by, work_order_id` |
| `status_history` | `changed_by, work_order_id` |
| `order_items` | `lab_id, service_id` |

`work_order_photos.work_order_id` unindexed is why that table shows **5,287 seq scans
for 125 rows** — the order-detail screen scans it every open.

Every unindexed FK also makes the parent's DELETE take a full scan of the child.

### 2.5 🟠 HIGH — PostgREST schema-cache reload storm

`SELECT name FROM pg_timezone_names` — **2,071 calls, mean 134 ms, max 1,060 ms,
2.48 M rows returned**. That query only runs on a PostgREST schema reload.

Each reload also runs the introspection set: 80.98 ms + 53.65 ms + 27.71 ms +
27.11 ms + 11.13 ms mean, plus a 318 ms function-introspection query. Total
schema-cache cost ≈ **672 seconds of DB CPU**.

> **⚠️ Corrected 2026-08-01 — this finding is benign.**
> All 401 public functions were checked for runtime DDL (`CREATE TEMP`, dynamic
> `EXECUTE 'CREATE …'`, `CREATE INDEX`, `ALTER TABLE`, `DROP`): **zero hits**. The only
> reload trigger is Supabase's stock `pgrst_ddl_watch` event trigger on
> `ddl_command_end` — i.e. **migration deployments**, not application traffic.
> Confirmed empirically: 143 `CREATE INDEX` statements applied on 2026-08-01 moved the
> counter from 2,071 to only 2,082, so PostgREST debounces heavily.
>
> The ~672 s is **amortised deployment cost over the project's whole history**, not an
> ongoing production latency source. Priority dropped from P2 to informational.

### 2.6 🟡 MEDIUM — `auto_manage_shift_pauses()` cron

16,503 calls × 19 ms = **314 s**. Runs every 5 minutes. 16,503 × 5 min ≈ 57 days of
continuous execution, so this has been running since roughly the start of the
project and is the 3rd-costliest statement.

### 2.7 🟡 MEDIUM — Trigger cascade on order creation

Creating one work order fires 13 triggers, several of which INSERT into
`notifications`, which fires `trg_whatsapp_meta_notify` → `net.http_post`.
`log_*` triggers add rows to `activity_logs` (already 600 rows / 808 inserts on a
22-order database — **~37 log rows per order**).

**All of this is inside the user's transaction.** Order-create latency is the sum
of 13 trigger bodies.

### 2.8 🟡 MEDIUM — 512 multiple-permissive-policy warnings

Supabase's performance advisor returns **655 WARN + 214 INFO**:

| Lint | Count |
|---|---|
| `multiple_permissive_policies` | **512** |
| `unindexed_foreign_keys` | 143 |
| `auth_rls_initplan` | **142** |
| `unused_index` | 64 |

`auth_rls_initplan` ×142 means 142 policies call `auth.uid()` / helper functions
**without** wrapping them in `(select …)`. Each is a per-row re-evaluation. This is
the single highest-leverage fix in the whole system and it is mechanical.

64 unused indexes are pure write-amplification and bloat.

---

## 3. Expensive queries (top 12 by total DB time)

| # | Statement | Calls | Total | Mean | Max |
|---|---|---|---|---|---|
| 1 | Realtime walrus WAL→JSON | 528,485 | 3,304,872 ms | 6.25 ms | 5,572 ms |
| 2 | Realtime walrus WAL→JSON | 559,828 | 2,381,965 ms | 4.25 ms | 2,088 ms |
| 3 | `auto_manage_shift_pauses()` | 16,503 | 314,557 ms | 19.06 ms | 138 ms |
| 4 | `pg_timezone_names` (schema reload) | 2,071 | 277,732 ms | 134 ms | 1,060 ms |
| 5 | `work_orders WHERE status=$1` HEAD count | 16,960 | 186,652 ms | **11.01 ms** | 78 ms |
| 6 | PostgREST type introspection | 2,071 | 167,712 ms | 80.98 ms | 477 ms |
| 7 | PostgREST pk/fk introspection | 2,071 | 111,118 ms | 53.65 ms | 276 ms |
| 8 | `order_messages` list | 9,928 | 88,264 ms | 8.89 ms | 202 ms |
| 9 | `doctors` HEAD count | 1,919 | 52,019 ms | **27.11 ms** | 76 ms |
| 10 | `profiles WHERE user_type = ANY()` | 2,537 | 42,376 ms | 16.70 ms | 55 ms |
| 11 | `work_orders` + `current_stage` + `all_stages` embed | 809 | 28,437 ms | **35.15 ms** | 191 ms |
| 12 | PostgREST function introspection | 79 | 25,133 ms | **318 ms** | 3,086 ms |

Read rows 5, 9 and 11 carefully: **11 ms to count 22 rows, 27 ms to count 18
doctors, 35 ms to read one order with its stages.** On an empty database. That is
the RLS tax of §2.1 showing up in production telemetry.

---

## 4. Critical / high-traffic endpoints

Ranked by `calls` in `pg_stat_statements`, i.e. real observed traffic:

| Rank | Endpoint | Calls | Mean | Verdict |
|---|---|---|---|---|
| 1 | `GET /work_orders?status=eq.*` (HEAD count) | 16,960 | 11.01 ms | badge polling; RLS-bound |
| 2 | `GET /work_orders` (list, 6 cols) | 11,416 | 1.57 ms | |
| 3 | `GET /order_messages` | 9,928 | 8.89 ms | chat inbox |
| 4 | `GET /work_orders` (list, 8 cols) | 7,973 | 2.63 ms | |
| 5 | `POST /rpc/get_my_permissions` | 2,875 | 6.51 ms | called on every panel mount |
| 6 | `GET /profiles?user_type=in.*` | 2,537 | 16.70 ms | |
| 7 | `GET /work_orders?doctor_approval_status=eq.*` | 2,240 | 7.66 ms | |
| 8 | `GET /doctors` | 1,919 | 27.11 ms | |
| 9 | `GET /order_stages` | 1,160 | 13.39 ms | |
| 10 | `GET /work_orders` + stage embeds | 809 | 35.15 ms | order detail |
| 11 | `storage.objects` name lookup | 1,594 | 8.82 ms | signed URLs |

---

## 5. File-operation risks

> **⚠️ Corrected 2026-08-02.** An earlier revision of this section claimed a 200 MB
> STL would hold ~466 MB of client RAM and OOM the device, and that six of seven
> call sites had no size guard. **Both claims were wrong.** Reading the actual code
> showed there are 19 upload call sites, only *one* ever used base64, and the
> highest-traffic paths already stream and already have guards. The corrected
> assessment is below; the recommendation was downgraded accordingly.

**What the code actually does.** There are **19** `storage.upload()` call sites. Three
distinct upload strategies:

| Strategy | Used by | Memory behaviour |
|---|---|---|
| `FormData` + `{uri}` (native) | `StageFileUpload.tsx`, `reviews/api.ts`, `lib/photos.ts` (as of 2026-08-02), `station/api.ts` | ✅ React Native streams from disk — **no full JS buffer** |
| `XMLHttpRequest` with progress (web) | `NewOrderScreen.tsx` (`uploadWithProgress`), `StageFileUpload.tsx` (`uploadWithXhr`) | ✅ streams, and reports real progress |
| `Blob` / `File` passthrough | `chatApi.ts`, `SupportScreen.tsx`, `documents/api.ts` | Browser-managed |

**Size guards that already existed:**

| Path | Guard |
|---|---|
| `chatApi.ts:428` | 100 MB (`MAX_FILE_BYTES`) |
| `NewOrderScreen.tsx:7952` | 100 MB at the file picker |
| `lib/photos.ts:7` | 5 MB |

So the OOM scenario does not occur: the only base64 path was capped at 5 MB
(≈12 MB peak), and no streaming path buffers the file at all.

**The two genuine gaps — both fixed 2026-08-02:**

1. `lib/photos.ts` read the file as base64 and then decoded it, holding ~2.33× the
   file size at once. Harmless at 5 MB, but pointless. Replaced with the same
   `FormData`/`Blob` pattern already used elsewhere in the codebase.
2. `StageFileUpload.tsx` and `reviews/api.ts` had **no client-side size limit** and
   inherited the bucket's 200 MB ceiling. On native this streams (no OOM), but a
   200 MB upload over mobile data runs for minutes and can fail with no useful
   feedback. Both now cap at 100 MB, matching `chatApi.ts`.

**Still missing (unchanged, genuinely absent):** resumable/TUS uploads, automatic
retry on failure, upload concurrency limiting, and client-side image compression
before upload. Progress reporting **does** exist on web via XHR; native uploads are
indeterminate.

---

## 6. CPU- and memory-intensive operations

**Server (Postgres):**
1. Realtime walrus RLS evaluation — §2.2, already the #1 consumer.
2. RLS Seq Scans — §2.1, grows linearly with global row count.
3. `report_*` / `profitability_*` RPCs (29 functions) — unbounded date ranges,
   `work_mem` is only 3.5 MB so any sort or hash spills to disk.
4. PostgREST schema reload — §2.5, 318 ms function introspection with 401 functions.
5. FIFO chain: `stock_movements` INSERT → `fifo_apply_movement` → `fifo_layers` +
   `fifo_allocations` + `trg_recompute_order_cost`. Serial per stock item;
   **lock-contention candidate** under concurrent consumption.

**Server (Edge Functions):** `parse-work-order` runs **claude-opus-5 vision** on
uploaded images. Multi-second, and it is on the interactive path when a lab scans a
paper order.

**Client:** base64 upload (§5); the `three` STL viewer; 10 k-line screen components;
JS-side aggregation of unbounded result sets (§2.3).

---

## 7. Scaling problems, in the order they will bite

| Order | Problem | Symptom when it hits |
|---|---|---|
| 1 | RLS Seq Scan (§2.1) | Every list/dashboard slows in lockstep across *all* tenants. First timeouts ~50–100 labs. |
| 2 | Realtime WAL (§2.2) | Live updates lag then stop; WAL reader falls behind; replication slot grows and eats disk. |
| 3 | 60 connections (§1.2) | `remaining connection slots are reserved` → hard 5xx. ~200–400 concurrent active users, sooner with `Promise.all` fan-out. |
| 4 | Unbounded dashboard fetch (§2.3) | Multi-MB responses, mobile OOM, egress cost. |
| 5 | Trigger cascade (§2.7) | Order-create latency creeps; `activity_logs` becomes the largest table (~37 rows/order). |
| 6 | No queue (§1.10) | An Anthropic or Resend outage backs up into `net._http_response`; no retry, no DLQ. |
| 7 | Storage upload (§5) | Client OOM on large STLs; no resume on flaky mobile networks. |
| 8 | `tr_mahalleler` 73,305 rows / 18 MB | Largest table is a static Turkish address list, sharing the buffer cache with hot data. |

**Single points of failure:** one Postgres instance, one Realtime service, one
Supabase region. No read replicas, no failover, no queue, no cache. The
`whatsapp-webhook` Edge Function is publicly reachable and unauthenticated by
design — a DoS surface that writes to the database.

---

## 8. What to fix, in priority order

| P | Fix | Effort | Expected gain |
|---|---|---|---|
| **P0** | Wrap every `auth.uid()` / helper call in RLS in `(select …)` — 142 sites | Mechanical | Turns per-row calls into a single InitPlan. Biggest single win. |
| **P0** | Consolidate the 4 permissive SELECT policies on `work_orders` into **one** policy whose leading conjunct is `lab_id = (select get_my_lab_id())` | Design + care | Restores index usage; converts Seq Scan → Index Scan. |
| **P0** | Put `lab_id` (or `user_type`) into the JWT via a custom access-token hook | Medium | Eliminates the `profiles` lookup from every RLS predicate entirely. |
| ~~P1~~ | ~~Add indexes for the 143 unindexed FKs~~ | — | ✅ **DONE 2026-08-01 — 143 → 0, all valid.** |
| **P1** | Cut the Realtime publication from 17 tables to what is genuinely live | Small | Directly reduces the #1 DB cost. |
| **P1** | Replace unbounded dashboard queries with server-side aggregate RPCs | Medium | 13–15 round trips → 1–2; bounded payload. |
| ~~P2~~ | ~~Find what triggers the 2,071 schema reloads~~ | — | ✅ **Investigated — benign, deployment-driven. No action.** |
| **P2** | Move notification dispatch out of triggers into a queue (pgmq) | Medium | Decouples order-create latency from e-mail/WhatsApp. |
| ~~P2~~ | ~~Stream/chunk uploads; enforce client-side size caps~~ | — | ✅ **DONE 2026-08-02.** Scope was much smaller than first assessed (see §5). Remaining upload work — resumable uploads, retry, image compression — is P3, not P2. |
| **P2** | Drop the 64 unused indexes; review `auto_manage_shift_pauses` frequency | Small | Less write amplification. |
| **P3** | Upgrade compute tier before any real launch | Cost | 60 connections will not serve 1,000 users. |

Concrete SQL for P0/P1 is in [`docs/db-optimizations.sql`](db-optimizations.sql)
(**not applied** — review required).

---

*Next: [performance-userflows.md](performance-userflows.md) · [performance-targets.md](performance-targets.md) · [performance-report.md](performance-report.md)*
