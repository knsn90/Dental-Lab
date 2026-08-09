/**
 * Custom metrics shared by every script.
 *
 * Everything is tagged with `flow` so one metric definition serves all flows and
 * thresholds can target `flow_duration{flow:dashboard}` etc.
 */
import { Trend, Rate, Counter, Gauge } from 'k6/metrics';
import { VERBOSE } from '../config.js';

/** Wall-clock duration of a complete user flow (all its requests). */
export const flowDuration = new Trend('flow_duration', true);

/** Duration of a single logical API call inside a flow. */
export const apiDuration = new Trend('api_duration', true);

/** Failure rate per flow. */
export const flowErrors = new Rate('flow_errors');

/** Requests that hit the client-side timeout (distinct from 5xx). */
export const flowTimeouts = new Rate('flow_timeouts');

/** Number of HTTP round trips a flow made — catches N+1 regressions. */
export const flowRequests = new Trend('flow_requests');

/** Response payload size — catches unbounded-query regressions (§2.3). */
export const payloadBytes = new Trend('payload_bytes');

/** Rows returned by a list endpoint — the direct unbounded-query signal. */
export const rowsReturned = new Trend('rows_returned');

/** Completed business operations, for throughput reporting. */
export const flowsCompleted = new Counter('flows_completed');

/** Rows this run created, so cleanup can be verified. */
export const rowsCreated = new Counter('rows_created');

/** Upload throughput, bytes/sec. */
export const uploadThroughput = new Trend('upload_throughput_bps');
export const uploadBytes = new Counter('upload_bytes');

/** Tenant isolation: must stay at exactly 0. */
export const tenantLeaks = new Rate('tenant_isolation_violations');
export const tenantLeakCount = new Counter('tenant_isolation_violation_count');

/** Auth. */
export const loginFailures = new Rate('login_failures');
export const tokenRefreshes = new Counter('token_refreshes');

/** Observed concurrency, for correlating with DB connection counts. */
export const activeFlows = new Gauge('active_flows');

/**
 * Wrap a flow function so its duration, error rate, request count and payload are
 * recorded automatically.
 *
 * @param {string} name  flow tag, e.g. 'dashboard'
 * @param {() => {ok:boolean, requests?:number, bytes?:number, rows?:number}} fn
 */
export function measure(name, fn) {
  const tags = { flow: name };
  const started = Date.now();
  let result;
  try {
    result = fn() || {};
  } catch (e) {
    flowErrors.add(1, tags);
    flowDuration.add(Date.now() - started, tags);
    if (VERBOSE) console.error(`[${name}] threw: ${e && e.message}`);
    return { ok: false, error: e };
  }

  const elapsed = Date.now() - started;
  flowDuration.add(elapsed, tags);
  flowErrors.add(result.ok === false ? 1 : 0, tags);
  flowTimeouts.add(result.timedOut ? 1 : 0, tags);
  if (typeof result.requests === 'number') flowRequests.add(result.requests, tags);
  if (typeof result.bytes === 'number') payloadBytes.add(result.bytes, tags);
  if (typeof result.rows === 'number') rowsReturned.add(result.rows, tags);
  if (result.ok !== false) flowsCompleted.add(1, tags);

  if (VERBOSE) {
    console.log(
      `[${name}] ${result.ok === false ? 'FAIL' : 'ok'} ${elapsed}ms ` +
        `req=${result.requests ?? '?'} bytes=${result.bytes ?? '?'} rows=${result.rows ?? '?'}`,
    );
  }
  return result;
}
