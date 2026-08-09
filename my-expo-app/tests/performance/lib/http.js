/**
 * PostgREST / Storage / Edge Function helpers with automatic metric recording,
 * 401 recovery, and per-flow request accounting.
 */
import http from 'k6/http';
import { check } from 'k6';
import { REST, STORAGE, FUNCTIONS, REQUEST_TIMEOUT, UPLOAD_TIMEOUT } from '../config.js';
import { authHeaders, writeHeaders, countHeaders, invalidateSession, getSession } from './auth.js';
import { apiDuration, uploadBytes, uploadThroughput } from './metrics.js';

/**
 * Tracks requests/bytes/rows for the flow currently executing, so `measure()` can
 * report N+1 and payload regressions without every flow counting by hand.
 */
export function newTally() {
  return { requests: 0, bytes: 0, rows: 0, ok: true, timedOut: false };
}

function record(tally, res, flow, call) {
  apiDuration.add(res.timings.duration, { flow, call });
  if (tally) {
    tally.requests += 1;
    tally.bytes += res.body ? res.body.length : 0;
    if (res.status === 0) tally.timedOut = true;
  }
  return res;
}

function countRows(res) {
  try {
    const j = res.json();
    return Array.isArray(j) ? j.length : j == null ? 0 : 1;
  } catch {
    return 0;
  }
}

/**
 * GET from PostgREST.
 *
 * @param {object} session
 * @param {string} path   e.g. "work_orders?select=id&limit=50"
 * @param {{flow:string, call:string, tally?:object, headers?:object, expect?:number[]}} opts
 */
export function restGet(session, path, opts) {
  const { flow, call, tally, headers = {}, expect = [200, 206] } = opts;
  let res = http.get(`${REST}/${path}`, {
    headers: authHeaders(session, headers),
    tags: { name: `rest:${call}`, flow },
    timeout: REQUEST_TIMEOUT,
  });

  // One transparent retry on 401 — mirrors the app's token-refresh behaviour.
  if (res.status === 401) {
    invalidateSession(session.user);
    const fresh = getSession(session.user);
    if (fresh) {
      Object.assign(session, fresh);
      res = http.get(`${REST}/${path}`, {
        headers: authHeaders(session, headers),
        tags: { name: `rest:${call}`, flow },
        timeout: REQUEST_TIMEOUT,
      });
    }
  }

  record(tally, res, flow, call);
  const ok = check(res, { [`${call} ok`]: (r) => expect.indexOf(r.status) !== -1 });
  if (!ok && tally) tally.ok = false;
  if (tally) tally.rows += countRows(res);
  return res;
}

/** HEAD-style exact count (`Prefer: count=exact`, `Range: 0-0`). */
export function restCount(session, path, opts) {
  const { flow, call, tally } = opts;
  const res = http.get(`${REST}/${path}`, {
    headers: countHeaders(session),
    tags: { name: `rest:${call}`, flow },
    timeout: REQUEST_TIMEOUT,
  });
  record(tally, res, flow, call);
  const ok = check(res, { [`${call} ok`]: (r) => r.status === 200 || r.status === 206 });
  if (!ok && tally) tally.ok = false;

  const cr = res.headers['Content-Range'] || res.headers['content-range'] || '';
  const total = Number(String(cr).split('/')[1]);
  return { res, count: Number.isFinite(total) ? total : null };
}

/** POST a row (or rows) to PostgREST. */
export function restInsert(session, table, payload, opts) {
  const { flow, call, tally, prefer } = opts;
  const res = http.post(`${REST}/${table}`, JSON.stringify(payload), {
    headers: writeHeaders(session, prefer ? { Prefer: prefer } : {}),
    tags: { name: `rest:${call}`, flow },
    timeout: REQUEST_TIMEOUT,
  });
  record(tally, res, flow, call);
  const ok = check(res, { [`${call} ok`]: (r) => r.status === 200 || r.status === 201 });
  if (!ok && tally) tally.ok = false;
  return res;
}

/** PATCH rows in PostgREST. */
export function restUpdate(session, path, payload, opts) {
  const { flow, call, tally } = opts;
  const res = http.patch(`${REST}/${path}`, JSON.stringify(payload), {
    headers: writeHeaders(session),
    tags: { name: `rest:${call}`, flow },
    timeout: REQUEST_TIMEOUT,
  });
  record(tally, res, flow, call);
  const ok = check(res, { [`${call} ok`]: (r) => r.status === 200 || r.status === 204 });
  if (!ok && tally) tally.ok = false;
  return res;
}

/** DELETE rows — used only by cleanup.js. */
export function restDelete(session, path, opts) {
  const { flow = 'cleanup', call, tally } = opts;
  const res = http.del(`${REST}/${path}`, null, {
    headers: authHeaders(session, { 'Content-Type': 'application/json' }),
    tags: { name: `rest:${call}`, flow },
    timeout: REQUEST_TIMEOUT,
  });
  record(tally, res, flow, call);
  return res;
}

/** Call a Postgres function through PostgREST. */
export function rpc(session, fn, args, opts) {
  const { flow, call = fn, tally, expect = [200, 204] } = opts;
  const res = http.post(`${REST}/rpc/${fn}`, JSON.stringify(args || {}), {
    headers: writeHeaders(session),
    tags: { name: `rpc:${call}`, flow },
    timeout: REQUEST_TIMEOUT,
  });
  record(tally, res, flow, call);
  const ok = check(res, { [`${call} ok`]: (r) => expect.indexOf(r.status) !== -1 });
  if (!ok && tally) tally.ok = false;
  if (tally) tally.rows += countRows(res);
  return res;
}

/** Invoke a Supabase Edge Function. */
export function invokeFunction(session, name, body, opts = {}) {
  const { flow = 'function', call = name, tally, timeout = REQUEST_TIMEOUT } = opts;
  const res = http.post(`${FUNCTIONS}/${name}`, JSON.stringify(body || {}), {
    headers: writeHeaders(session),
    tags: { name: `fn:${call}`, flow },
    timeout,
  });
  record(tally, res, flow, call);
  return res;
}

/** Upload bytes to a Storage bucket. Records throughput. */
export function storageUpload(session, bucket, path, bytes, contentType, opts = {}) {
  const { flow = 'upload', call = 'storage_upload', tally } = opts;
  const started = Date.now();
  const res = http.post(`${STORAGE}/object/${bucket}/${path}`, bytes, {
    headers: authHeaders(session, {
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': opts.upsert ? 'true' : 'false',
    }),
    tags: { name: `storage:${call}`, flow },
    timeout: UPLOAD_TIMEOUT,
  });
  const elapsed = Math.max(1, Date.now() - started);
  record(tally, res, flow, call);

  const size = bytes && bytes.byteLength ? bytes.byteLength : bytes ? bytes.length : 0;
  const ok = res.status === 200 || res.status === 201;
  if (ok) {
    uploadBytes.add(size);
    uploadThroughput.add((size / elapsed) * 1000);
  } else if (tally) {
    tally.ok = false;
  }
  check(res, { [`${call} ok`]: () => ok });
  return { res, ok, size, elapsed };
}

/** Ask Storage for a signed URL — the read side of every file the app shows. */
export function storageSignedUrl(session, bucket, path, expiresIn, opts = {}) {
  const { flow = 'upload', call = 'signed_url', tally } = opts;
  const res = http.post(
    `${STORAGE}/object/sign/${bucket}/${path}`,
    JSON.stringify({ expiresIn: expiresIn || 3600 }),
    {
      headers: writeHeaders(session),
      tags: { name: `storage:${call}`, flow },
      timeout: REQUEST_TIMEOUT,
    },
  );
  record(tally, res, flow, call);
  return res;
}

/** Remove an object — cleanup only. */
export function storageRemove(session, bucket, paths, opts = {}) {
  const { flow = 'cleanup', call = 'storage_remove', tally } = opts;
  const res = http.del(
    `${STORAGE}/object/${bucket}`,
    JSON.stringify({ prefixes: paths }),
    {
      headers: writeHeaders(session),
      tags: { name: `storage:${call}`, flow },
      timeout: REQUEST_TIMEOUT,
    },
  );
  record(tally, res, flow, call);
  return res;
}
