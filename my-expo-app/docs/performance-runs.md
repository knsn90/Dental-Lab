# Performance Run Results — Siman (generated)

> Generated 2026-08-01T18:44:09.522Z by `scripts/perf-report.mjs` from
> 2 k6 run(s). Every number below is measured, not estimated.
>
> This file is regenerated on every run. The curated analysis lives in
> [performance-report.md](performance-report.md).

## Executive summary

| | |
|---|---|
| Scenarios executed | `multitenant`, `smoke` |
| Threshold breaches | **7** ❌ |
| Peak throughput | 28.0 req/s |
| Peak VUs | 20 |
| Worst flow (p95) | `dashboard` 3976 ms |
| Tenant isolation violations | **0** ✅ |

## Results by scenario

### `multitenant` — profile A

*target: staging · 2026-08-01T18:43:40.345Z*

| Metric | Value |
|---|---|
| Requests | 2404 (20.5 req/s) |
| Iterations | 222 |
| Max VUs | 20 |
| p50 / p90 / p95 / p99 | 109 ms / 296 ms / 367 ms / — |
| Max latency | 8113 ms |
| Failure rate | 10.19% |
| Timeout rate | 0.00% |
| Check pass rate | 92.74% |
| Data received | 25.61 MB |
| Thresholds | ❌ 4 breached |

| Flow | p50 | p90 | p95 | p99 | max | err% | reqs | payload | SLO |
|---|---|---|---|---|---|---|---|---|---|
| `dashboard` | 2065 ms | 2681 ms | **3976 ms** | — | 32036 ms | — | — | — | ❌ >500ms |
| `orders_list` | 379 ms | 865 ms | **1575 ms** | — | 16215 ms | — | — | — | ❌ >400ms |

**Breached thresholds**

- `flow_duration{flow:dashboard}::p(95)<1000`
- `tenant_errors::rate<0.01`
- `http_req_failed::rate<0.01`
- `flow_duration{flow:orders_list}::p(95)<800`

### `smoke` — profile A

*target: staging · 2026-08-01T18:36:50.702Z*

| Metric | Value |
|---|---|
| Requests | 312 (28.0 req/s) |
| Iterations | 8 |
| Max VUs | 4 |
| p50 / p90 / p95 / p99 | 95 ms / 157 ms / 199 ms / — |
| Max latency | 343 ms |
| Failure rate | 38.46% |
| Timeout rate | 0.00% |
| Check pass rate | 66.32% |
| Data received | 2.52 MB |
| Thresholds | ❌ 3 breached |

| Flow | p50 | p90 | p95 | p99 | max | err% | reqs | payload | SLO |
|---|---|---|---|---|---|---|---|---|---|
| `dashboard` | 1603 ms | 1685 ms | **1688 ms** | — | 1691 ms | 0.00% | 12.0 | 250.7 KB | ❌ >500ms |
| `order_detail` | 730 ms | 765 ms | **766 ms** | — | 768 ms | 100.00% | 8.0 | 899 B | ❌ >700ms |
| `reports` | 272 ms | 471 ms | **474 ms** | — | 479 ms | 50.00% | 3.0 | 482 B | ✅ <3000ms |
| `kanban` | 303 ms | 321 ms | **321 ms** | — | 322 ms | 100.00% | 3.0 | 21.4 KB | ✅ <600ms |
| `stock` | 282 ms | 287 ms | **288 ms** | — | 288 ms | 100.00% | 3.0 | 6.2 KB | ✅ <800ms |
| `orders_list` | 274 ms | 282 ms | **282 ms** | — | 282 ms | 0.00% | 2.0 | 17.5 KB | ✅ <400ms |
| `notifications` | 194 ms | 202 ms | **203 ms** | — | 203 ms | 0.00% | 2.0 | 4 B | ✅ <300ms |
| `search` | 101 ms | 112 ms | **113 ms** | — | 115 ms | 0.00% | 1.0 | 8.7 KB | ✅ <400ms |
| `login` | 0 ms | 0 ms | **0 ms** | — | 0 ms | 0.00% | 0.0 | 0 B | ✅ <1000ms |
| `realtime` | 0 ms | 0 ms | **0 ms** | — | 0 ms | 0.00% | 0.0 | 0 B | — |
| `upload` | 0 ms | 0 ms | **0 ms** | — | 0 ms | 0.00% | 0.0 | 0 B | ✅ <5000ms |

**Breached thresholds**

- `http_req_failed::rate<0.01`
- `checks::rate>0.95`
- `flow_errors{flow:order_detail}::rate<0.01`

## Worst flows across all runs

| Rank | Flow | Worst p95 | Scenario | SLO | Over budget |
|---|---|---|---|---|---|
| 1 | `dashboard` | 3976 ms | `multitenant` | 500 ms | 7.95× |
| 2 | `dashboard` | 1688 ms | `smoke` | 500 ms | 3.38× |
| 3 | `orders_list` | 1575 ms | `multitenant` | 400 ms | 3.94× |
| 4 | `order_detail` | 766 ms | `smoke` | 700 ms | 1.09× |
| 5 | `reports` | 474 ms | `smoke` | 3000 ms | 0.16× |
| 6 | `kanban` | 321 ms | `smoke` | 600 ms | 0.54× |
| 7 | `stock` | 288 ms | `smoke` | 800 ms | 0.36× |
| 8 | `orders_list` | 282 ms | `smoke` | 400 ms | 0.70× |
| 9 | `notifications` | 203 ms | `smoke` | 300 ms | 0.68× |
| 10 | `search` | 113 ms | `smoke` | 400 ms | 0.28× |
| 11 | `login` | 0 ms | `smoke` | 1000 ms | — |
| 12 | `realtime` | 0 ms | `smoke` | — | — |

## Query-shape findings

**Chatty flows** (>8 HTTP round trips — N+1 candidates)

| Flow | Avg requests | Scenario |
|---|---|---|
| `dashboard` | 12.0 | `smoke` |

**Heavy payloads** (>200 KB — unbounded-query candidates, see analysis §2.3)

| Flow | Avg payload | Max rows | Scenario |
|---|---|---|---|
| `dashboard` | 250.7 KB | 1603 | `smoke` |

## Multi-tenant isolation (Phase 11)

- **Verdict:** ✅ PASS — no tenant leakage observed
- **Cross-tenant probes issued:** 222
- **p95 spread across tenants:** —
- **Fairness:** insufficient data

---

*Related: [performance-analysis.md](performance-analysis.md) · [performance-userflows.md](performance-userflows.md) · [performance-targets.md](performance-targets.md) · [db-optimizations.sql](db-optimizations.sql)*
