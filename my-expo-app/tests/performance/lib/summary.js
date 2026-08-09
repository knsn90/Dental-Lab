/**
 * Summary rendering shared by every scenario.
 *
 * k6's built-in summary is fine for humans but useless for CI comparison, so we
 * emit a stable JSON shape alongside a readable table. `docs/performance-report.md`
 * is generated from these JSON files by scripts/perf-report.mjs.
 */

/** Pull a metric value defensively — k6 metric shapes differ by type. */
function val(data, name, field) {
  const m = data.metrics && data.metrics[name];
  if (!m || !m.values) return null;
  const v = m.values[field];
  return typeof v === 'number' ? v : null;
}

function fmt(n, digits = 1) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(digits)}k`;
  return n.toFixed(digits);
}

function ms(n) {
  return n === null || n === undefined || !isFinite(n) ? '—' : `${Math.round(n)}ms`;
}

function pct(n) {
  return n === null || n === undefined || !isFinite(n) ? '—' : `${(n * 100).toFixed(2)}%`;
}

function bytes(n) {
  if (n === null || !isFinite(n)) return '—';
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${Math.round(n)} B`;
}

/** Every `flow` tag that appeared in this run. */
function flowsIn(data) {
  const flows = {};
  for (const name of Object.keys(data.metrics || {})) {
    const m = /^flow_duration\{flow:([^}]+)\}$/.exec(name);
    if (m) flows[m[1]] = true;
  }
  // Sub-metrics only exist when a threshold referenced them; fall back to the
  // submetrics k6 records on the parent.
  const parent = data.metrics && data.metrics.flow_duration;
  if (parent && parent.submetrics) {
    for (const s of Object.keys(parent.submetrics)) {
      const m = /flow:([^,}]+)/.exec(s);
      if (m) flows[m[1]] = true;
    }
  }
  return Object.keys(flows).sort();
}

/** Human-readable summary printed to stdout at the end of a run. */
export function textSummary(data, title) {
  const L = [];
  const line = (s = '') => L.push(s);
  const rule = (c = '─') => line(c.repeat(88));

  rule('═');
  line(`  ${title}  —  Siman performance suite`);
  rule('═');
  line();

  // ── Global ────────────────────────────────────────────────────────────────
  line('  GLOBAL');
  rule();
  line(`  Requests          ${fmt(val(data, 'http_reqs', 'count'), 0)}  ` +
       `(${fmt(val(data, 'http_reqs', 'rate'), 1)} req/s)`);
  line(`  Iterations        ${fmt(val(data, 'iterations', 'count'), 0)}  ` +
       `(${fmt(val(data, 'iterations', 'rate'), 2)} /s)`);
  line(`  Flows completed   ${fmt(val(data, 'flows_completed', 'count'), 0)}`);
  line(`  Data received     ${bytes(val(data, 'data_received', 'count'))}`);
  line(`  Data sent         ${bytes(val(data, 'data_sent', 'count'))}`);
  line(`  Max VUs           ${fmt(val(data, 'vus_max', 'value'), 0)}`);
  line();
  line(`  http_req_duration  p50 ${ms(val(data, 'http_req_duration', 'med'))}` +
       `  p90 ${ms(val(data, 'http_req_duration', 'p(90)'))}` +
       `  p95 ${ms(val(data, 'http_req_duration', 'p(95)'))}` +
       `  p99 ${ms(val(data, 'http_req_duration', 'p(99)'))}` +
       `  max ${ms(val(data, 'http_req_duration', 'max'))}`);
  line(`  Failure rate       ${pct(val(data, 'http_req_failed', 'rate'))}` +
       `   Timeouts ${pct(val(data, 'flow_timeouts', 'rate'))}` +
       `   Checks ${pct(val(data, 'checks', 'rate'))}`);
  line();

  // ── Per flow ──────────────────────────────────────────────────────────────
  const flows = flowsIn(data);
  if (flows.length) {
    line('  PER FLOW');
    rule();
    line('  flow             p50      p90      p95      p99      max      err%    reqs  payload');
    for (const f of flows) {
      const k = (field) => val(data, `flow_duration{flow:${f}}`, field);
      line(
        `  ${f.padEnd(15)} ${ms(k('med')).padStart(8)} ${ms(k('p(90)')).padStart(8)} ` +
        `${ms(k('p(95)')).padStart(8)} ${ms(k('p(99)')).padStart(8)} ${ms(k('max')).padStart(8)} ` +
        `${pct(val(data, `flow_errors{flow:${f}}`, 'rate')).padStart(7)} ` +
        `${fmt(val(data, `flow_requests{flow:${f}}`, 'avg'), 1).padStart(6)} ` +
        `${bytes(val(data, `payload_bytes{flow:${f}}`, 'avg')).padStart(9)}`,
      );
    }
    line();
  }

  // ── Specialised ───────────────────────────────────────────────────────────
  const up = val(data, 'upload_throughput_bps', 'med');
  if (up !== null) {
    line('  UPLOADS');
    rule();
    line(`  Throughput p50 ${(up / 1024 / 1024).toFixed(2)} MB/s   ` +
         `p95 ${((val(data, 'upload_throughput_bps', 'p(95)') || 0) / 1024 / 1024).toFixed(2)} MB/s`);
    line(`  Total uploaded ${bytes(val(data, 'upload_bytes', 'count'))}`);
    line();
  }

  const leaks = val(data, 'tenant_isolation_violation_count', 'count');
  if (leaks !== null) {
    line('  TENANT ISOLATION');
    rule();
    line(`  Violations: ${leaks === 0 ? '0  ✅ clean' : `${leaks}  ❌ LEAK DETECTED`}`);
    line();
  }

  const rows = val(data, 'rows_returned', 'max');
  if (rows !== null) {
    line('  QUERY SHAPE');
    rule();
    line(`  Max rows returned by a single flow: ${fmt(rows, 0)}  ` +
         `(unbounded-query signal — see analysis §2.3)`);
    line();
  }

  // ── Thresholds ────────────────────────────────────────────────────────────
  const failed = [];
  for (const [name, m] of Object.entries(data.metrics || {})) {
    if (!m.thresholds) continue;
    for (const [expr, t] of Object.entries(m.thresholds)) {
      if (t.ok === false) failed.push(`${name} → ${expr}`);
    }
  }
  line('  THRESHOLDS');
  rule();
  if (failed.length === 0) {
    line('  ✅ all thresholds passed');
  } else {
    line(`  ❌ ${failed.length} threshold(s) breached:`);
    for (const f of failed) line(`     · ${f}`);
  }
  line();
  rule('═');
  line();

  return L.join('\n');
}

/** Stable JSON for CI diffing and report generation. */
export function jsonSummary(data, scenario) {
  const flows = {};
  for (const f of flowsIn(data)) {
    flows[f] = {
      p50: val(data, `flow_duration{flow:${f}}`, 'med'),
      p90: val(data, `flow_duration{flow:${f}}`, 'p(90)'),
      p95: val(data, `flow_duration{flow:${f}}`, 'p(95)'),
      p99: val(data, `flow_duration{flow:${f}}`, 'p(99)'),
      max: val(data, `flow_duration{flow:${f}}`, 'max'),
      error_rate: val(data, `flow_errors{flow:${f}}`, 'rate'),
      avg_requests: val(data, `flow_requests{flow:${f}}`, 'avg'),
      avg_payload_bytes: val(data, `payload_bytes{flow:${f}}`, 'avg'),
      max_rows: val(data, `rows_returned{flow:${f}}`, 'max'),
    };
  }

  const thresholds = {};
  for (const [name, m] of Object.entries(data.metrics || {})) {
    if (!m.thresholds) continue;
    for (const [expr, t] of Object.entries(m.thresholds)) {
      thresholds[`${name}::${expr}`] = t.ok !== false;
    }
  }

  return JSON.stringify(
    {
      scenario,
      profile: __ENV.LOAD_PROFILE || 'A',
      target_env: __ENV.TARGET_ENV || 'staging',
      run_tag: __ENV.RUN_TAG || null,
      generated_at: new Date().toISOString(),
      global: {
        requests: val(data, 'http_reqs', 'count'),
        rps: val(data, 'http_reqs', 'rate'),
        iterations: val(data, 'iterations', 'count'),
        vus_max: val(data, 'vus_max', 'value'),
        data_received: val(data, 'data_received', 'count'),
        data_sent: val(data, 'data_sent', 'count'),
        p50: val(data, 'http_req_duration', 'med'),
        p90: val(data, 'http_req_duration', 'p(90)'),
        p95: val(data, 'http_req_duration', 'p(95)'),
        p99: val(data, 'http_req_duration', 'p(99)'),
        max: val(data, 'http_req_duration', 'max'),
        failure_rate: val(data, 'http_req_failed', 'rate'),
        timeout_rate: val(data, 'flow_timeouts', 'rate'),
        check_rate: val(data, 'checks', 'rate'),
      },
      flows,
      uploads: {
        throughput_p50_bps: val(data, 'upload_throughput_bps', 'med'),
        throughput_p95_bps: val(data, 'upload_throughput_bps', 'p(95)'),
        total_bytes: val(data, 'upload_bytes', 'count'),
      },
      tenant_isolation_violations: val(data, 'tenant_isolation_violation_count', 'count'),
      rows_created: val(data, 'rows_created', 'count'),
      thresholds,
      thresholds_passed: Object.values(thresholds).every(Boolean),
    },
    null,
    2,
  );
}
