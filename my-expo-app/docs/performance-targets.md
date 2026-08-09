# Performance Targets (SLOs) — Siman

> Every threshold here is enforced in code. The k6 `thresholds` blocks in
> `tests/performance/` are the executable version of this document; CI fails when
> they are breached. If you change a number here, change it in
> `tests/performance/config.js` too.

---

## 0. How to read these

- **SLI** — what is measured, and where.
- **Target** — the SLO. Breaching it in CI **fails the build**.
- **Alert** — the production paging threshold (looser than the CI gate, so CI catches
  regressions before users do).
- Latency is **server-side response time** (k6 `http_req_duration`), excluding client
  render. Client render budgets are listed separately in §7 and are *not* CI-gated
  yet (no RUM instrumentation exists — see §9).

Percentiles are computed per scenario over the steady-state window only (ramp-up and
ramp-down excluded via `gracefulRampDown` + a tagged steady phase).

---

## 1. API latency

Measured with `LOAD_PROFILE=B` (100 VU) against a **seeded staging** database at the
reference scale (100 tenants × 5,000 orders). Numbers in parentheses are the
degraded-but-acceptable ceiling at Scenario D (1,000 VU).

| Flow | P50 | P90 | **P95 (gate)** | P99 | Max |
|---|---|---|---|---|---|
| **Global (all requests)** | 120 ms | 250 ms | **300 ms** (600 ms) | 800 ms | 3,000 ms |
| F1 Login (`/auth/v1/token`) | 400 ms | 700 ms | **1,000 ms** | 1,800 ms | 5,000 ms |
| F2 Dashboard (full flow) | 200 ms | 400 ms | **500 ms** (1,200 ms) | 1,200 ms | 4,000 ms |
| F3 Orders list | 150 ms | 300 ms | **400 ms** | 900 ms | 3,000 ms |
| F4 Order detail | 250 ms | 500 ms | **700 ms** | 1,500 ms | 4,000 ms |
| F5 Create order | 700 ms | 1,400 ms | **2,000 ms** | 3,500 ms | 8,000 ms |
| F6 Status update | 200 ms | 450 ms | **600 ms** | 1,200 ms | 4,000 ms |
| F8 Kanban | 200 ms | 450 ms | **600 ms** | 1,200 ms | 4,000 ms |
| F9 Notifications list | 100 ms | 220 ms | **300 ms** | 700 ms | 2,000 ms |
| F10 Stock movement | 300 ms | 600 ms | **800 ms** | 1,600 ms | 5,000 ms |
| F11 Reports / finance RPC | 900 ms | 2,000 ms | **3,000 ms** | 6,000 ms | 15,000 ms |
| F12 Courier GPS ping | 80 ms | 200 ms | **300 ms** | 600 ms | 2,000 ms |
| Search (order no / patient) | 150 ms | 300 ms | **400 ms** | 800 ms | 3,000 ms |

**Alert (production):** global P95 > 500 ms for 5 min → warning; > 1,000 ms for 5 min
→ page.

---

## 2. File upload

| SLI | Target | Alert |
|---|---|---|
| Photo ≤ 5 MB, end-to-end | **< 5 s** P95 | > 10 s |
| STL 10 MB | **< 15 s** P95 | > 30 s |
| STL 50 MB | **< 60 s** P95 | > 120 s |
| Effective throughput | **≥ 1.5 MB/s** P50 on a 20 Mbps link | < 0.5 MB/s |
| Upload success rate | **≥ 99.0 %** | < 97 % |
| Client peak RAM during upload | **≤ 1.2 × file size** | ✅ met — all paths stream (`FormData`/XHR/Blob) as of 2026-08-02 |
| Client-side size cap enforced before upload starts | **100 MB** on every path | any path without a cap |
| Parallel uploads per client | ≤ 3 concurrent, no failure increase | any 5xx |
| Interrupted upload | resumable **or** clean error + retry affordance | silent data loss |

---

## 3. Database

| SLI | Target | Alert | Current (measured) |
|---|---|---|---|
| Active connections | **< 40 / 60** (67 %) | > 50 (83 %) | n/a — never load-tested |
| Connection acquire wait | **< 50 ms** P95 | > 200 ms | — |
| Slowest single statement | **< 500 ms** P95 | > 2,000 ms | ❌ **5,572 ms** (realtime walrus) |
| Statements > 1 s | **< 0.1 %** of calls | > 1 % | — |
| Seq scans on `work_orders` per query | **0** for tenant-filtered reads | ≥ 1 | ❌ **always 1** (§2.1) |
| Buffer hit ratio | **> 99 %** | < 95 % | — |
| Deadlocks | **0** | ≥ 1/hour | 0 |
| Lock wait (FIFO path) | **< 100 ms** P95 | > 1 s | — |
| Replication slot lag | **< 10 MB** | > 100 MB | — |
| Longest transaction | **< 5 s** | > 30 s | — |
| `statement_timeout` hits | **0** | ≥ 1 | 0 |
| RLS overhead vs. no-RLS on the same query | **< 3×** | > 5× | ❌ **14.6×** (§2.1) |

---

## 4. Realtime / WebSocket

| SLI | Target | Alert | Current |
|---|---|---|---|
| Change → client delivery | **< 2 s** P95 | > 5 s | — |
| WS connect handshake | **< 1 s** P95 | > 3 s | — |
| Concurrent channels/instance | **< 500** | > 800 | — |
| Realtime share of total DB time | **< 20 %** | > 35 % | ❌ **~58 %** (§2.2) |
| WS reconnect after foreground | **< 5 s** | > 15 s | — |
| Dropped-message rate | **0** | ≥ 1 | — |

---

## 5. Queue / background jobs

There is no queue today (§1.10). These targets define the bar for the pgmq migration
recommended in the analysis, and gate the current pg_net path in the meantime.

| SLI | Target | Alert |
|---|---|---|
| Notification dispatch delay (insert → sent) | **< 10 s** P95 | > 60 s |
| pg_net pending backlog | **< 100** | > 1,000 |
| Failed dispatches | **< 0.5 %** | > 2 % |
| Retry / DLQ coverage | **100 %** of outbound calls | *currently 0 % — gap G4* |
| pg_cron job overrun (runtime > interval) | **0** | ≥ 1 |

---

## 6. Resources

| SLI | Target | Alert |
|---|---|---|
| DB CPU | **< 70 %** sustained | > 85 % for 5 min |
| DB memory | **< 80 %** | > 90 % |
| Disk usage | **< 70 %** | > 85 % |
| Disk IOPS | **< 70 %** of burst budget | credit depletion |
| Edge Function P95 (non-AI) | **< 1,000 ms** | > 3,000 ms |
| Edge Function P95 (AI: `parse-work-order`) | **< 15,000 ms** | > 30,000 ms |
| Edge Function memory | **< 128 MB** | OOM |
| Storage egress / lab / month | **< 50 GB** | > 100 GB (cost) |

---

## 7. Client-side (not CI-gated — see §9)

| SLI | Target |
|---|---|
| LCP (web dashboard, cable) | < 2.5 s |
| INP | < 200 ms |
| CLS | < 0.1 |
| Cold start (native) | < 3 s |
| JS bundle (initial, web) | < 2 MB gz |
| Dashboard payload | **< 200 KB** (currently unbounded — §2.3) |
| Peak client RAM | < 300 MB |

---

## 8. Reliability

| SLI | Target | Alert |
|---|---|---|
| **Error rate (5xx)** | **< 0.1 %** | > 1 % |
| Error rate incl. 4xx (excl. 401/404) | < 0.5 % | > 2 % |
| Timeout rate | **< 0.05 %** | > 0.5 % |
| **Availability** | **99.9 %** (43 min/month) | 2 consecutive failed probes |
| Failed checks in k6 | **< 1 %** | any in smoke |
| **Tenant isolation violations** | **exactly 0** | **any → page immediately** |

Tenant isolation is not a percentage. `tests/performance/multitenant.js` asserts
`rate == 0` and any single leak fails the build.

---

## 9. Load-scenario acceptance

| Scenario | VUs | Duration | Must hold |
|---|---|---|---|
| **A** | 20 | 5 min | All §1 targets. Zero errors. |
| **B** | 100 | 10 min | All §1 targets. Errors < 0.1 %. **This is the CI gate.** |
| **C** | 300 | 15 min | P95 ≤ 1.5× §1. Errors < 0.5 %. |
| **D** | 1,000 | 20 min | P95 ≤ 2× §1. Errors < 1 %. No connection exhaustion. |
| **E** | 3,000 | 20 min | Graceful degradation: elevated latency **without** 5xx cascade. |
| **F** | 5,000 | 20 min | Documented breaking point + recovery within 5 min of ramp-down. |
| **Spike** | 10 → 3,000 → 10 | 8 min | Recovery to baseline P95 **< 60 s** after the spike ends. |
| **Soak** | 50 | 24 / 48 / 72 h | Memory growth **< 5 %**, no connection leak, no latency drift > 10 %. |

---

## 10. Known gaps between target and reality

These are the deltas the analysis measured. They are listed here so the SLO document
is honest about what currently fails.

| ID | Target | Current | Ref |
|---|---|---|---|
| **G1** | RLS overhead < 3× | **14.6×** | analysis §2.1 |
| **G2** | Realtime < 20 % of DB time | **~58 %** | analysis §2.2 |
| ~~G3~~ | ~~Upload RAM ≤ 1.2× file~~ | ✅ **Closed 2026-08-02** — the 2.33× claim was wrong for 18 of 19 call sites, and the one base64 path was replaced with streaming | analysis §5 |
| **G4** | 100 % retry/DLQ coverage | **0 %** — no queue | analysis §1.10 |
| **G5** | Dashboard payload < 200 KB | **unbounded** | analysis §2.3 |
| **G6** | Slowest statement < 500 ms | **5,572 ms** | analysis §3 |
| **G7** | Connections < 40 | ceiling is **60 total**, shared with all Supabase services | analysis §1.2 |
| **G8** | Client RUM | **no instrumentation exists** — §7 cannot be measured today | — |

G1, G2 and G7 are the ones that determine the maximum concurrent-user count.

---

*Next: [performance-report.md](performance-report.md) · Tests: [`tests/performance/`](../tests/performance/README.md)*
