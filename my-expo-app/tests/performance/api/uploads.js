/**
 * F7 — File upload (Phase 10).
 *
 * Covers: large STL, ZIP, images, PDF, multiple sequential, parallel, interrupted
 * and retried uploads. Measures speed, success rate and recovery.
 *
 * Note on memory: k6 measures *server-side* behaviour. The client-side
 * 2.33 × file-size RAM amplification in lib/photos.ts (analysis §5) is a
 * device-side defect that a load generator cannot reproduce — it needs a device
 * profiler. What we CAN assert here is that the server accepts, stores and serves
 * the file within budget, and that oversized uploads are rejected rather than
 * silently accepted.
 */
import http from 'k6/http';
import { check } from 'k6';
import {
  storageUpload, storageSignedUrl, storageRemove, restInsert, newTally,
} from '../lib/http.js';
import { measure, rowsCreated } from '../lib/metrics.js';
import { ALLOW_WRITES, RUN_TAG, UPLOAD_TIMEOUT } from '../config.js';
import { authHeaders } from '../lib/auth.js';
import {
  syntheticStl, syntheticJpeg, syntheticPdf, syntheticBytes, UPLOAD_SIZES, uniqueSuffix,
} from '../lib/data.js';

const BUCKET = __ENV.UPLOAD_BUCKET || 'work-order-photos';

/** Every path this suite writes lives under this prefix so cleanup is exact. */
export function uploadPrefix() {
  return `k6/${RUN_TAG}`;
}

function pathFor(kind, ext) {
  return `${uploadPrefix()}/${kind}-${uniqueSuffix()}.${ext}`;
}

/** Single upload of a given kind + size, then a signed-URL read-back. */
export function flowUpload(session, kind = 'photo', opts = {}) {
  if (!ALLOW_WRITES) return { ok: true, skipped: 'writes disabled' };

  return measure('upload', () => {
    const t = newTally();
    const { bytes, contentType, ext } = payloadFor(kind, opts.size);

    const { ok, size, elapsed } = storageUpload(session, BUCKET, pathFor(kind, ext), bytes, contentType, {
      flow: 'upload', call: `upload_${kind}`, tally: t,
    });

    if (!ok) return { ...t, ok: false };

    const mbps = size / 1024 / 1024 / (elapsed / 1000);
    check({ mbps, elapsed, size }, {
      'upload throughput >= 0.5 MB/s': (x) => x.mbps >= 0.5,
      'photo <= 5 MB uploads in < 5 s': (x) => x.size > 5 * 1024 * 1024 || x.elapsed < 5000,
    });

    return t;
  });
}

/** Upload + the DB row the app writes alongside it (`work_order_photos`). */
export function flowUploadWithRecord(session, workOrderId, kind = 'photo', opts = {}) {
  if (!ALLOW_WRITES) return { ok: true, skipped: 'writes disabled' };

  return measure('upload', () => {
    const t = newTally();
    const { bytes, contentType, ext } = payloadFor(kind, opts.size);
    const path = pathFor(kind, ext);

    const { ok } = storageUpload(session, BUCKET, path, bytes, contentType, {
      flow: 'upload', call: `upload_${kind}`, tally: t,
    });
    if (!ok) return { ...t, ok: false };

    if (workOrderId) {
      const res = restInsert(
        session,
        'work_order_photos',
        { work_order_id: workOrderId, storage_path: path, caption: `${RUN_TAG} synthetic` },
        { flow: 'upload', call: 'insert_photo_row', tally: t },
      );
      if (res.status === 201 || res.status === 200) rowsCreated.add(1, { table: 'work_order_photos' });
    }

    storageSignedUrl(session, BUCKET, path, 3600, {
      flow: 'upload', call: 'signed_url', tally: t,
    });
    return t;
  });
}

/** Several files for one order, sequentially — the real "attach 5 photos" flow. */
export function flowMultipleUploads(session, count = 3, kind = 'photo') {
  if (!ALLOW_WRITES) return { ok: true, skipped: 'writes disabled' };

  return measure('upload', () => {
    const t = newTally();
    let failures = 0;
    for (let i = 0; i < count; i++) {
      const { bytes, contentType, ext } = payloadFor(kind);
      const { ok } = storageUpload(session, BUCKET, pathFor(kind, ext), bytes, contentType, {
        flow: 'upload', call: `upload_multi_${kind}`, tally: t,
      });
      if (!ok) failures++;
    }
    check({ failures }, { 'all sequential uploads succeeded': (x) => x.failures === 0 });
    return { ...t, ok: failures === 0 };
  });
}

/**
 * Parallel uploads via http.batch — the browser genuinely does this when a user
 * drops several files at once.
 */
export function flowParallelUploads(session, count = 3, kind = 'photo') {
  if (!ALLOW_WRITES) return { ok: true, skipped: 'writes disabled' };

  return measure('upload', () => {
    const t = newTally();
    const requests = [];
    for (let i = 0; i < count; i++) {
      const { bytes, contentType, ext } = payloadFor(kind);
      requests.push({
        method: 'POST',
        url: `${__ENV.BASE_URL.replace(/\/+$/, '')}/storage/v1/object/${BUCKET}/${pathFor(kind, ext)}`,
        body: bytes,
        params: {
          headers: authHeaders(session, { 'Content-Type': contentType, 'x-upsert': 'false' }),
          tags: { name: 'storage:upload_parallel', flow: 'upload' },
          timeout: UPLOAD_TIMEOUT,
        },
      });
    }

    const responses = http.batch(requests);
    let failures = 0;
    for (const r of responses) {
      t.requests += 1;
      if (!(r.status === 200 || r.status === 201)) failures++;
    }
    check({ failures, count }, {
      'parallel uploads all succeeded': (x) => x.failures === 0,
      'parallel uploads produced no 5xx': (x) => x.failures === 0,
    });
    return { ...t, ok: failures === 0 };
  });
}

/**
 * Interrupted upload: send a large body with a timeout short enough to abort
 * mid-transfer, then verify the server did not persist a partial object and that
 * an immediate retry succeeds.
 *
 * This is the mobile-network case — analysis §5 notes there is no resume support,
 * so the expected (and asserted) behaviour is "clean failure + successful retry",
 * not "resume".
 */
export function flowInterruptedUpload(session, kind = 'stl_medium') {
  if (!ALLOW_WRITES) return { ok: true, skipped: 'writes disabled' };

  return measure('upload', () => {
    const t = newTally();
    const { bytes, contentType, ext } = payloadFor(kind);
    const path = pathFor('interrupted', ext);
    const url = `${__ENV.BASE_URL.replace(/\/+$/, '')}/storage/v1/object/${BUCKET}/${path}`;

    // Abort mid-flight.
    const aborted = http.post(url, bytes, {
      headers: authHeaders(session, { 'Content-Type': contentType }),
      tags: { name: 'storage:upload_interrupted', flow: 'upload' },
      timeout: '900ms',
    });
    t.requests += 1;

    // The object must not be readable after an aborted upload.
    const probe = storageSignedUrl(session, BUCKET, path, 60, {
      flow: 'upload', call: 'probe_after_abort', tally: t,
    });

    check({ aborted, probe }, {
      'interrupted upload did not return success': (x) =>
        x.aborted.status !== 200 && x.aborted.status !== 201,
      'no partial object is readable after abort': (x) =>
        x.probe.status === 400 || x.probe.status === 404,
    });

    // Retry must succeed cleanly.
    const retry = storageUpload(session, BUCKET, path, bytes, contentType, {
      flow: 'upload', call: 'upload_retry', tally: t, upsert: true,
    });
    check(retry, { 'retry after interruption succeeded': (r) => r.ok });

    return { ...t, ok: retry.ok };
  });
}

/**
 * Oversized upload must be rejected by the bucket's file_size_limit rather than
 * accepted. `work-order-photos` is configured at 200 MB; we probe just over the
 * limit only when EXPLICIT_OVERSIZE=true, because generating 200 MB in a VU is
 * itself expensive.
 */
export function flowOversizeRejected(session) {
  if (!ALLOW_WRITES || __ENV.EXPLICIT_OVERSIZE !== 'true') {
    return { ok: true, skipped: 'oversize probe disabled' };
  }
  return measure('upload', () => {
    const t = newTally();
    const limit = Number(__ENV.BUCKET_LIMIT_BYTES || 200 * 1024 * 1024);
    const bytes = syntheticBytes(limit + 1024);
    const res = storageUpload(session, BUCKET, pathFor('oversize', 'bin'), bytes, 'application/octet-stream', {
      flow: 'upload', call: 'upload_oversize', tally: t,
    });
    check(res, { 'oversize upload rejected': (r) => !r.ok });
    return { ...t, ok: true }; // rejection IS the pass condition
  });
}

/** Delete everything this run uploaded. */
export function cleanupUploads(session, paths) {
  const t = newTally();
  if (!paths || !paths.length) return t;
  storageRemove(session, BUCKET, paths, { flow: 'cleanup', call: 'remove_uploads', tally: t });
  return t;
}

// ── payload factory ─────────────────────────────────────────────────────────

function payloadFor(kind, sizeOverride) {
  const size = sizeOverride || UPLOAD_SIZES[kind] || UPLOAD_SIZES.photo;
  switch (kind) {
    case 'stl_small':
    case 'stl_medium':
    case 'stl_large':
    case 'stl':
      return { bytes: syntheticStl(size), contentType: 'model/stl', ext: 'stl' };
    case 'pdf':
      return { bytes: syntheticPdf(size), contentType: 'application/pdf', ext: 'pdf' };
    case 'zip':
      return { bytes: syntheticBytes(size), contentType: 'application/zip', ext: 'zip' };
    case 'thumb':
    case 'photo':
    case 'photo_large':
    default:
      return { bytes: syntheticJpeg(size), contentType: 'image/jpeg', ext: 'jpg' };
  }
}

export { BUCKET, UPLOAD_SIZES };
