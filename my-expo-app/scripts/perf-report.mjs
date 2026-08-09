#!/usr/bin/env node
/**
 * Assemble docs/performance-report.md from the JSON summaries in
 * tests/performance/results/.
 *
 *   node scripts/perf-report.mjs
 *   node scripts/perf-report.mjs --baseline results/baseline --out docs/performance-report.md
 *
 * With --baseline it also renders a before/after comparison, which is what
 * Phase 14 needs after applying db-optimizations.sql.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = parseArgs(process.argv.slice(2));
const RESULTS = args.results ?? join(ROOT, 'tests/performance/results');
const BASELINE = args.baseline ? join(ROOT, args.baseline) : null;
// Writes a GENERATED artifact. docs/performance-report.md is hand-curated and
// must not be clobbered by a test run — pass --out explicitly to override.
const OUT = args.out ?? join(ROOT, 'docs/performance-runs.md');

const SLO = {
  login: 1000, dashboard: 500, orders_list: 400, order_detail: 700,
  create_order: 2000, status_update: 600, kanban: 600, notifications: 300,
  stock: 800, reports: 3000, courier_ping: 300, search: 400, upload: 5000,
};

const runs = loadRuns(RESULTS);
if (!runs.length) {
  console.error(`No *-summary.json files found in ${RESULTS}.`);
  console.error('Run a scenario first, e.g.:');
  console.error('  k6 run -e BASE_URL=... -e ANON_KEY=... tests/performance/smoke.js');
  process.exit(1);
}
const baseline = BASELINE ? loadRuns(BASELINE) : [];

writeFileSync(OUT, render(runs, baseline));
console.log(`✅ ${OUT} written from ${runs.length} run(s): ${runs.map((r) => r.scenario).join(', ')}`);

// ── rendering ───────────────────────────────────────────────────────────────

function render(runs, baseline) {
  const L = [];
  const w = (s = '') => L.push(s);

  w('# Performance Run Results — Siman (generated)');
  w('');
  w(`> Generated ${new Date().toISOString()} by \`scripts/perf-report.mjs\` from`);
  w(`> ${runs.length} k6 run(s). Every number below is measured, not estimated.`);
  w('>');
  w('> This file is regenerated on every run. The curated analysis lives in');
  w('> [performance-report.md](performance-report.md).');
  w('');

  // ── Executive summary ─────────────────────────────────────────────────────
  w('## Executive summary');
  w('');
  const worst = worstOffenders(runs);
  const totalFails = runs.reduce((n, r) => n + countFailedThresholds(r), 0);
  const allPassed = totalFails === 0;

  w(`| | |`);
  w(`|---|---|`);
  w(`| Scenarios executed | ${runs.map((r) => `\`${r.scenario}\``).join(', ')} |`);
  w(`| Threshold breaches | ${allPassed ? '**0** ✅' : `**${totalFails}** ❌`} |`);
  w(`| Peak throughput | ${fmt(Math.max(...runs.map((r) => r.global.rps || 0)), 1)} req/s |`);
  w(`| Peak VUs | ${fmt(Math.max(...runs.map((r) => r.global.vus_max || 0)), 0)} |`);
  w(`| Worst flow (p95) | ${worst.length ? `\`${worst[0].flow}\` ${ms(worst[0].p95)}` : '—'} |`);
  const leaks = runs.reduce((n, r) => n + (r.tenant_isolation_violations || 0), 0);
  w(`| Tenant isolation violations | ${leaks === 0 ? '**0** ✅' : `**${leaks}** ❌`} |`);
  w('');

  // ── Per-scenario results ──────────────────────────────────────────────────
  w('## Results by scenario');
  w('');
  for (const r of runs) {
    w(`### \`${r.scenario}\`${r.profile ? ` — profile ${r.profile}` : ''}`);
    w('');
    w(`*target: ${r.target_env ?? '?'} · ${r.generated_at ?? ''}*`);
    w('');
    w('| Metric | Value |');
    w('|---|---|');
    w(`| Requests | ${fmt(r.global.requests, 0)} (${fmt(r.global.rps, 1)} req/s) |`);
    w(`| Iterations | ${fmt(r.global.iterations, 0)} |`);
    w(`| Max VUs | ${fmt(r.global.vus_max, 0)} |`);
    w(`| p50 / p90 / p95 / p99 | ${ms(r.global.p50)} / ${ms(r.global.p90)} / ${ms(r.global.p95)} / ${ms(r.global.p99)} |`);
    w(`| Max latency | ${ms(r.global.max)} |`);
    w(`| Failure rate | ${pct(r.global.failure_rate)} |`);
    w(`| Timeout rate | ${pct(r.global.timeout_rate)} |`);
    w(`| Check pass rate | ${pct(r.global.check_rate)} |`);
    w(`| Data received | ${bytes(r.global.data_received)} |`);
    w(`| Thresholds | ${r.thresholds_passed ? '✅ all passed' : `❌ ${countFailedThresholds(r)} breached`} |`);
    w('');

    const flows = Object.entries(r.flows || {});
    if (flows.length) {
      w('| Flow | p50 | p90 | p95 | p99 | max | err% | reqs | payload | SLO |');
      w('|---|---|---|---|---|---|---|---|---|---|');
      for (const [name, f] of flows.sort((a, b) => (b[1].p95 || 0) - (a[1].p95 || 0))) {
        const slo = SLO[name];
        const verdict = slo == null ? '—' : f.p95 == null ? '—' : f.p95 <= slo ? `✅ <${slo}ms` : `❌ >${slo}ms`;
        w(
          `| \`${name}\` | ${ms(f.p50)} | ${ms(f.p90)} | **${ms(f.p95)}** | ${ms(f.p99)} | ` +
          `${ms(f.max)} | ${pct(f.error_rate)} | ${fmt(f.avg_requests, 1)} | ` +
          `${bytes(f.avg_payload_bytes)} | ${verdict} |`,
        );
      }
      w('');
    }

    if (r.uploads && r.uploads.throughput_p50_bps) {
      w(`**Uploads** — p50 ${(r.uploads.throughput_p50_bps / 1048576).toFixed(2)} MB/s, ` +
        `p95 ${(r.uploads.throughput_p95_bps / 1048576).toFixed(2)} MB/s, ` +
        `total ${bytes(r.uploads.total_bytes)}`);
      w('');
    }

    const failed = failedThresholds(r);
    if (failed.length) {
      w('**Breached thresholds**');
      w('');
      for (const f of failed) w(`- \`${f}\``);
      w('');
    }
  }

  // ── Worst endpoints ───────────────────────────────────────────────────────
  w('## Worst flows across all runs');
  w('');
  w('| Rank | Flow | Worst p95 | Scenario | SLO | Over budget |');
  w('|---|---|---|---|---|---|');
  worst.slice(0, 12).forEach((x, i) => {
    const slo = SLO[x.flow];
    const over = slo && x.p95 ? `${(x.p95 / slo).toFixed(2)}×` : '—';
    w(`| ${i + 1} | \`${x.flow}\` | ${ms(x.p95)} | \`${x.scenario}\` | ${slo ? ms(slo) : '—'} | ${over} |`);
  });
  w('');

  // ── N+1 and payload signals ───────────────────────────────────────────────
  const chatty = [];
  const heavy = [];
  for (const r of runs) {
    for (const [name, f] of Object.entries(r.flows || {})) {
      if (f.avg_requests > 8) chatty.push({ flow: name, n: f.avg_requests, scenario: r.scenario });
      if (f.avg_payload_bytes > 200 * 1024) {
        heavy.push({ flow: name, b: f.avg_payload_bytes, rows: f.max_rows, scenario: r.scenario });
      }
    }
  }
  if (chatty.length || heavy.length) {
    w('## Query-shape findings');
    w('');
    if (chatty.length) {
      w('**Chatty flows** (>8 HTTP round trips — N+1 candidates)');
      w('');
      w('| Flow | Avg requests | Scenario |');
      w('|---|---|---|');
      for (const c of chatty.sort((a, b) => b.n - a.n)) {
        w(`| \`${c.flow}\` | ${fmt(c.n, 1)} | \`${c.scenario}\` |`);
      }
      w('');
    }
    if (heavy.length) {
      w('**Heavy payloads** (>200 KB — unbounded-query candidates, see analysis §2.3)');
      w('');
      w('| Flow | Avg payload | Max rows | Scenario |');
      w('|---|---|---|---|');
      for (const h of heavy.sort((a, b) => b.b - a.b)) {
        w(`| \`${h.flow}\` | ${bytes(h.b)} | ${fmt(h.rows, 0)} | \`${h.scenario}\` |`);
      }
      w('');
    }
  }

  // ── Breaking point / spike / soak / isolation add-ons ─────────────────────
  appendSidecar(w, 'stress-breaking-point.json', 'Breaking point (Phase 6)', renderBreaking);
  appendSidecar(w, 'spike-recovery.json', 'Spike recovery (Phase 7)', renderSpike);
  appendSidecar(w, 'soak-drift.json', 'Soak drift (Phase 8)', renderSoak);
  appendSidecar(w, 'multitenant-isolation.json', 'Multi-tenant isolation (Phase 11)', renderIsolation);

  // ── Before/after ──────────────────────────────────────────────────────────
  if (baseline.length) {
    w('## Before / after comparison');
    w('');
    w('| Flow | Before p95 | After p95 | Change |');
    w('|---|---|---|---|');
    const before = mergeFlows(baseline);
    const after = mergeFlows(runs);
    for (const flow of Object.keys(after).sort()) {
      const b = before[flow];
      const a = after[flow];
      if (!b || !a || b.p95 == null || a.p95 == null) continue;
      const delta = ((a.p95 - b.p95) / b.p95) * 100;
      const arrow = delta < -5 ? '🟢' : delta > 5 ? '🔴' : '⚪️';
      w(`| \`${flow}\` | ${ms(b.p95)} | ${ms(a.p95)} | ${arrow} ${delta > 0 ? '+' : ''}${delta.toFixed(1)}% |`);
    }
    w('');
  }

  w('---');
  w('');
  w('*Related: [performance-analysis.md](performance-analysis.md) · ' +
    '[performance-userflows.md](performance-userflows.md) · ' +
    '[performance-targets.md](performance-targets.md) · ' +
    '[db-optimizations.sql](db-optimizations.sql)*');
  w('');

  return L.join('\n');
}

function appendSidecar(w, file, title, renderer) {
  const p = join(RESULTS, file);
  if (!existsSync(p)) return;
  let data;
  try { data = JSON.parse(readFileSync(p, 'utf8')); } catch { return; }
  w(`## ${title}`);
  w('');
  renderer(w, data);
  w('');
}

function renderBreaking(w, d) {
  w('| VUs | p50 | p95 | p99 | max | error% |');
  w('|---|---|---|---|---|---|');
  for (const r of d.levels || []) {
    w(`| ${r.level} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.p99)} | ${ms(r.max)} | ${pct(r.error_rate)} |`);
  }
  w('');
  w(`- **Last healthy level:** ${d.last_healthy_level ? `${d.last_healthy_level.level} VUs` : 'none'}`);
  w(`- **Breaking point:** ${d.breaking_point ? `${d.breaking_point.level} VUs` : `not reached at ${d.max_vus_configured} VUs`}`);
  w(`- **Peak throughput:** ${fmt(d.peak_rps, 1)} req/s`);
  w(`- **Connection-pool exhaustion errors:** ${d.pool_exhaustion_errors}`);
  w(`- **Gateway 5xx:** ${d.gateway_5xx} · **429s:** ${d.rate_limited_429}`);
}

function renderSpike(w, d) {
  w('| Phase | p50 | p95 | error% |');
  w('|---|---|---|---|');
  for (const p of ['baseline', 'spike1', 'spike2', 'recovery']) {
    const v = d[p] || {};
    w(`| ${p} | ${ms(v.p50)} | ${ms(v.p95)} | ${pct(v.error_rate)} |`);
  }
  w('');
  w(`- **Peak degradation:** ${d.degradation_factor_spike2 ? `${d.degradation_factor_spike2.toFixed(1)}×` : '—'}`);
  w(`- **Recovered to baseline:** ${d.recovered_to_baseline === null ? '—' : d.recovered_to_baseline ? '✅ yes' : '❌ no'}`);
}

function renderSoak(w, d) {
  w('| Hour | p50 | p95 | error% | avg payload |');
  w('|---|---|---|---|---|');
  for (const h of d.hours || []) {
    w(`| ${h.hour} | ${ms(h.p50)} | ${ms(h.p95)} | ${pct(h.error_rate)} | ${bytes(h.avg_payload_bytes)} |`);
  }
  w('');
  w(`- **p95 drift:** ${d.latency_drift_p95 === null ? '—' : `${(d.latency_drift_p95 * 100).toFixed(1)}%`} → ${d.verdict_latency}`);
  w(`- **Payload drift:** ${d.payload_drift === null ? '—' : `${(d.payload_drift * 100).toFixed(1)}%`}`);
  w(`- **Realtime messages received:** ${d.realtime_messages}`);
}

function renderIsolation(w, d) {
  w(`- **Verdict:** ${d.isolation_violations === 0 ? '✅ ' : '❌ '}${d.isolation_verdict}`);
  w(`- **Cross-tenant probes issued:** ${d.cross_tenant_probes}`);
  w(`- **p95 spread across tenants:** ${d.p95_spread_ratio ? `${d.p95_spread_ratio.toFixed(2)}×` : '—'}`);
  w(`- **Fairness:** ${d.stability_verdict}`);
  if (d.per_tenant_latency && d.per_tenant_latency.length) {
    w('');
    w('| Tenant | p50 | p95 |');
    w('|---|---|---|');
    for (const t of d.per_tenant_latency.slice(0, 10)) {
      w(`| ${t.tenant} | ${ms(t.p50)} | ${ms(t.p95)} |`);
    }
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function loadRuns(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('-summary.json'))
    .map((f) => {
      try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => String(a.scenario).localeCompare(String(b.scenario)));
}

function mergeFlows(runs) {
  const out = {};
  for (const r of runs) {
    for (const [name, f] of Object.entries(r.flows || {})) {
      if (!out[name] || (f.p95 || 0) > (out[name].p95 || 0)) out[name] = f;
    }
  }
  return out;
}

function worstOffenders(runs) {
  const rows = [];
  for (const r of runs) {
    for (const [flow, f] of Object.entries(r.flows || {})) {
      if (f.p95 != null) rows.push({ flow, p95: f.p95, scenario: r.scenario });
    }
  }
  return rows.sort((a, b) => b.p95 - a.p95);
}

function failedThresholds(r) {
  return Object.entries(r.thresholds || {}).filter(([, ok]) => !ok).map(([k]) => k);
}
function countFailedThresholds(r) { return failedThresholds(r).length; }

function ms(n) { return n == null || !isFinite(n) ? '—' : `${Math.round(n)} ms`; }
function pct(n) { return n == null || !isFinite(n) ? '—' : `${(n * 100).toFixed(2)}%`; }
function fmt(n, d = 1) { return n == null || !isFinite(n) ? '—' : Number(n).toFixed(d); }
function bytes(n) {
  if (n == null || !isFinite(n)) return '—';
  if (n > 1048576) return `${(n / 1048576).toFixed(2)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${Math.round(n)} B`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    }
  }
  return out;
}
