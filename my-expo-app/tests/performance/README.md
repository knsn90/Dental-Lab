# Performance & Load Testing — Siman

k6 suite covering the whole system: PostgREST, GoTrue, Storage, Edge Functions and
Realtime. Every flow mirrors a real code path in the app, and every threshold is the
executable form of [`docs/performance-targets.md`](../../docs/performance-targets.md).

**Read first:** [`docs/performance-analysis.md`](../../docs/performance-analysis.md) —
it explains what these tests are looking for and why.

---

## Safety, before anything else

There is **one Supabase project and it is production** (`kjwjxqfdsxkxgcgophdy`,
serving live dental labs, `max_connections = 60`).

The suite has two default-closed interlocks in [`config.js`](config.js):

| Gate | Default | Effect |
|---|---|---|
| `ALLOW_WRITES` | `false` | Every write flow is skipped. Read-only run. |
| `TARGET_ENV=production` | requires `PROD_ACK=yes-i-accept-production-load` | Refuses to start otherwise. |

`ALLOW_WRITES=true` **with** `TARGET_ENV=production` is rejected outright — writes
create orders, stock movements and notifications that fan out to real e-mail,
WhatsApp and push for real customers.

`stress.js`, `spike.js` and `multitenant.js` refuse to run against production at all.

**Only `smoke.js` at 1–2 VUs is safe against production.** Everything else needs a
Supabase branch or a separate staging project.

---

## Install

```bash
brew install k6              # macOS
# or: https://k6.io/docs/get-started/installation/
```

## Set up credentials

```bash
cd my-expo-app/tests/performance
cp seed/users.json.example seed/users.json
$EDITOR seed/users.json      # real e-mail/password per role
```

`seed/users.json` is git-ignored. Never commit credentials.

## Run

```bash
cd my-expo-app

# Read-only smoke — safe anywhere
k6 run -e BASE_URL=https://<ref>.supabase.co \
       -e ANON_KEY=<anon-key> \
       tests/performance/smoke.js

# 100-user load against staging, writes on
k6 run -e BASE_URL=... -e ANON_KEY=... \
       -e LOAD_PROFILE=B -e ALLOW_WRITES=true \
       tests/performance/load.js

# Find the breaking point
k6 run -e BASE_URL=... -e ANON_KEY=... -e MAX_VUS=2000 \
       tests/performance/stress.js

# Spike: 5 → 200 → 600 req/s → 5, measure recovery
k6 run -e BASE_URL=... -e ANON_KEY=... tests/performance/spike.js

# 24-hour soak
k6 run -e BASE_URL=... -e ANON_KEY=... -e SOAK_HOURS=24 \
       tests/performance/soak.js

# 100 tenants × 10 users, RLS isolation + fairness
k6 run -e BASE_URL=... -e ANON_KEY=... -e TENANTS=100 -e USERS_PER_TENANT=10 \
       tests/performance/multitenant.js

# Remove everything a write-enabled run created
k6 run -e BASE_URL=... -e ANON_KEY=... -e ALLOW_WRITES=true \
       -e RUN_TAG=<tag-from-the-run> \
       tests/performance/lib/cleanup.js
```

Watch the database side in a second terminal:

```bash
watch -n10 'psql "$DATABASE_URL" -f scripts/perf-db-watch.sql'
# or
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/perf-db-watch.mjs
```

Build the report:

```bash
node scripts/perf-report.mjs        # → docs/performance-report.md
```

---

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | — | **required.** `https://<ref>.supabase.co` |
| `ANON_KEY` | — | **required.** Supabase anon key |
| `USERS_FILE` | `./seed/users.json` | Test accounts |
| `TARGET_ENV` | `staging` | `staging` or `production` |
| `PROD_ACK` | — | `yes-i-accept-production-load`, required when `TARGET_ENV=production` |
| `ALLOW_WRITES` | `false` | Enable write flows |
| `LOAD_PROFILE` | `A` | `A`=20 `B`=100 `C`=300 `D`=1000 `E`=3000 `F`=5000 VUs |
| `RUN_TAG` | timestamp | Stamped on every created row; cleanup targets it |
| `THINK_MIN` / `THINK_MAX` | `1` / `5` | Think time in seconds |
| `REQUEST_TIMEOUT` | `30s` | |
| `UPLOAD_TIMEOUT` | `180s` | |
| `VERBOSE` | `false` | One log line per flow |
| `SKIP_REALTIME` | `false` | Skip WebSocket flows |
| `MAX_VUS` | `1000` | stress.js ceiling |
| `SOAK_HOURS` / `SOAK_VUS` | `24` / `50` | soak.js |
| `TENANTS` / `USERS_PER_TENANT` | `100` / `10` | multitenant.js |
| `HEAVY_REPORTS` | `false` | Enable unbounded "all time" report probe |
| `FIFO_ITEM_ID` | — | Pin one stock item for the lock-contention probe |
| `EXPLICIT_OVERSIZE` | `false` | Enable the >bucket-limit upload probe |

---

## Layout

```
tests/performance/
├── config.js                 env, safety gates, profiles, thresholds
├── smoke.js                  every flow once — PR gate, prod-safe
├── load.js                   Scenarios A–F, production-weighted flow mix
├── stress.js                 step ramp to failure + breaking-point curve
├── spike.js                  arrival-rate spike + recovery measurement
├── soak.js                   24/48/72 h, per-hour drift detection
├── multitenant.js            100 labs × 10 users, RLS isolation + fairness
├── lib/
│   ├── auth.js               login, per-VU session cache, refresh
│   ├── http.js               PostgREST/Storage/Functions helpers + metrics
│   ├── data.js               realistic generators, unique IDs, synthetic files
│   ├── metrics.js            custom metrics + measure() wrapper
│   ├── summary.js            text + JSON summaries
│   └── cleanup.js            removes everything a run created
├── api/
│   ├── auth.js               F1 login / bootstrap / JWT claim check
│   ├── dashboard.js          F2 dashboard, F8 kanban
│   ├── orders.js             F3 list, F4 detail, F5 create, F6 status
│   ├── uploads.js            F7 STL/photo/PDF/ZIP, parallel, interrupted, retry
│   ├── notifications.js      F9 + Realtime WebSocket
│   ├── stock.js              F10 + FIFO lock contention
│   ├── reports.js            F11 report RPCs
│   └── finance.js            invoices, payments, statements
├── seed/
│   ├── seed-tenants.sql      100 labs × 5,000 orders
│   ├── make-users.mjs        creates auth users, writes users.json
│   └── users.json.example
└── results/                  JSON summaries (git-ignored)
```

---

## What each script is actually looking for

| Script | Phase | Question |
|---|---|---|
| `smoke.js` | 4 | Is every critical endpoint alive and within budget? |
| `load.js` | 5 | Do we hold the SLOs at 20 / 100 / 300 / 1000 / 3000 / 5000 users? |
| `stress.js` | 6 | Where does it break, and **which resource** ran out? |
| `spike.js` | 7 | Does it survive a stampede, and how fast does it recover? |
| `soak.js` | 8 | Does anything leak over 24–72 h? |
| `api/uploads.js` | 10 | Speed, parallel behaviour, interruption, retry |
| `multitenant.js` | 11 | Does RLS still isolate under load, and are tenants treated fairly? |

### Custom metrics worth watching

| Metric | Signal |
|---|---|
| `flow_duration{flow:…}` | Per-flow latency vs. the SLO |
| `flow_requests{flow:…}` | Round trips per flow — **N+1 regressions** |
| `payload_bytes{flow:…}` | **Unbounded-query regressions** (analysis §2.3) |
| `rows_returned{flow:…}` | Rows a list endpoint returned |
| `tenant_isolation_violations` | Must be exactly **0**. Any value fails the run. |
| `stress_latency_by_level{level:…}` | The breaking-point curve |
| `spike_phase_latency{phase:…}` | Baseline vs. spike vs. recovery |
| `soak_hourly_latency{hour:…}` | Drift over time |
| `upload_throughput_bps` | MB/s per upload |
| `db_pool_exhaustion_errors` | Connection-limit failures, attributed |

---

## Known limits of this suite

Stated explicitly so results are not over-read:

1. **Client-side cost is not measured.** k6 is not a browser. The base64 upload
   RAM amplification (analysis §5), JS bundle parse time, and render performance
   need a device profiler or RUM. `docs/performance-targets.md` §7 lists those
   targets as un-gated for that reason.
2. **k6 VUs are single-threaded**, so a flow's `Promise.all` fan-out runs
   sequentially here while the real app runs it in parallel. Flow *duration* is
   therefore the sum, not the max. Compare `api_duration{call:…}` per call when
   you need the app's real parallel behaviour.
3. **Realtime is under-represented.** Only `soak.js` and the explicit
   `flowRealtimeSubscribe` hold WebSockets. Real usage keeps 35 subscription
   sites open per client, and station wall boards hold them permanently — the
   #1 database cost (analysis §2.2) is therefore *understated* by HTTP-weighted
   runs.
4. **Results against the current production database are not predictive.** It
   holds 22 orders. The RLS Seq Scan cost is driven by total rows across all
   tenants, so meaningful numbers require `seed/seed-tenants.sql` first.
5. **Edge Functions that call the Anthropic API are not load-tested** — that
   would spend real money and hit provider rate limits. `parse-work-order` and
   friends need a separate, deliberately budgeted test.
