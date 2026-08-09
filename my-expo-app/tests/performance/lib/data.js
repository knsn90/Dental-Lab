/**
 * Realistic test-data generators.
 *
 * Values match the real schema: `work_order_status`, `machine_type` and
 * `order_input_type` are Postgres enums, and `work_orders` requires
 * order_number / tooth_numbers / work_type / machine_type / delivery_date.
 *
 * Every generated record is:
 *   - unique  (VU + iteration + monotonic counter + run tag — no collisions even
 *              across parallel k6 instances)
 *   - identifiable (patient_name always starts with SYNTHETIC_PREFIX so cleanup
 *              can find it and a human can spot it in the UI)
 */
import exec from 'k6/execution';
import { RUN_TAG, SYNTHETIC_PREFIX, THINK_MIN, THINK_MAX } from '../config.js';

// ── Domain vocabularies (from the real schema / UI) ──────────────────────────

/** public.work_order_status */
export const ORDER_STATUSES = [
  'alindi', 'kutu_atandi', 'atama_bekleniyor', 'asamada', 'uretimde',
  'kalite_kontrol', 'teslimata_hazir', 'kurye_bekleniyor', 'kuryede',
  'teslim_edildi', 'tasarim_onayi_bekleniyor', 'iptal',
];

/** Statuses safe to transition an order into during a load test. */
export const SAFE_TRANSITIONS = ['alindi', 'kutu_atandi', 'atama_bekleniyor', 'uretimde'];

/** public.machine_type */
export const MACHINE_TYPES = ['milling', '3d_printing'];

/** public.order_input_type */
export const INPUT_TYPES = ['dijital', 'model', 'ikisi'];

/** public.stage_status */
export const STAGE_STATUSES = [
  'bekliyor', 'aktif', 'tamamlandi', 'onaylandi', 'reddedildi', 'skipped',
  'durakladi', 'makine_bekliyor', 'onay_bekliyor', 'bloklu', 'yeniden',
];

export const WORK_TYPES = [
  'Zirkonyum Kron', 'Metal Destekli Porselen', 'E-max Laminate', 'Tam Protez',
  'Bölümlü Protez', 'İmplant Üstü Kron', 'Hibrit Protez', 'Gece Plağı',
  'Geçici Kron', 'Post Core', 'Ortodontik Aparey', 'Cerrahi Rehber',
];

export const SHADES = [
  'A1', 'A2', 'A3', 'A3.5', 'A4', 'B1', 'B2', 'B3', 'B4',
  'C1', 'C2', 'C3', 'D2', 'D3', 'D4', 'BL1', 'BL2', 'BL3',
];

export const PRIORITIES = ['low', 'normal', 'high'];
export const COMPLEXITIES = ['low', 'medium', 'high'];
export const MODEL_TYPES = ['plaster', 'printed', 'digital', 'none'];

const FIRST_NAMES = [
  'Ahmet', 'Mehmet', 'Ayşe', 'Fatma', 'Mustafa', 'Emine', 'Ali', 'Hatice',
  'Hüseyin', 'Zeynep', 'Hasan', 'Elif', 'İbrahim', 'Meryem', 'Murat', 'Şerife',
  'Osman', 'Sultan', 'Yusuf', 'Havva', 'Kemal', 'Selin', 'Burak', 'Deniz',
];

const LAST_NAMES = [
  'Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk',
  'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara',
  'Koç', 'Kurt', 'Özkan', 'Şimşek', 'Polat', 'Korkmaz', 'Erdoğan', 'Bulut',
];

const CITIES = [
  'İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Konya',
  'Gaziantep', 'Mersin', 'Kayseri', 'Eskişehir', 'Samsun',
];

/** FDI notation — the numbering the app actually uses. */
export const FDI_TEETH = [
  11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48,
];

// ── Uniqueness ───────────────────────────────────────────────────────────────

let counter = 0;

/**
 * Globally unique suffix. Combines VU id, iteration and a per-VU counter, so two
 * VUs in the same millisecond cannot collide, and neither can two k6 instances
 * started with different RUN_TAGs.
 */
export function uniqueSuffix() {
  counter += 1;
  const vu = exec.vu.idInTest;
  const iter = exec.scenario.iterationInTest;
  return `${vu}-${iter}-${counter}-${Date.now().toString(36)}`;
}

/** Deterministic-ish pseudo random helpers. */
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickN(arr, n) {
  const pool = arr.slice();
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Think time in seconds, uniformly distributed between THINK_MIN and THINK_MAX. */
export function thinkTime() {
  return THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN);
}

// ── Generators ───────────────────────────────────────────────────────────────

/**
 * A synthetic patient name. Always prefixed so it is unmistakable in the UI and
 * findable by cleanup.
 */
export function patientName() {
  return `${SYNTHETIC_PREFIX} ${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

export function isoDate(daysFromNow) {
  const d = new Date(Date.now() + daysFromNow * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * A complete, insertable work_orders row.
 *
 * `order_number` is left out on purpose — the `set_order_number` BEFORE INSERT
 * trigger generates it, and BEFORE triggers run ahead of the NOT NULL check.
 *
 * `lab_id` is also omitted: `auto_set_lab_id()` derives it from the caller, which
 * is exactly the multi-tenant path we want to exercise.
 */
export function newWorkOrder(opts = {}) {
  const toothCount = opts.toothCount ?? randInt(1, 6);
  return {
    patient_name: patientName(),
    patient_id: `${SYNTHETIC_PREFIX}-${uniqueSuffix()}`,
    patient_gender: pick(['erkek', 'kadın']),
    patient_city: pick(CITIES),
    tooth_numbers: pickN(FDI_TEETH, toothCount).sort((a, b) => a - b),
    work_type: opts.workType ?? pick(WORK_TYPES),
    shade: pick(SHADES),
    machine_type: opts.machineType ?? pick(MACHINE_TYPES),
    input_type: pick(INPUT_TYPES),
    model_type: pick(MODEL_TYPES),
    delivery_date: isoDate(randInt(3, 21)),
    priority: opts.priority ?? pick(PRIORITIES),
    complexity: pick(COMPLEXITIES),
    is_urgent: Math.random() < 0.12,
    is_rush: Math.random() < 0.06,
    notes: `${RUN_TAG} synthetic load-test order — safe to delete`,
    external_source: RUN_TAG,
    external_id: uniqueSuffix(),
    ...(opts.doctorId ? { doctor_id: opts.doctorId } : {}),
    ...(opts.extra || {}),
  };
}

/** An order_items row for a given work order. */
export function newOrderItem(workOrderId, opts = {}) {
  return {
    work_order_id: workOrderId,
    service_id: opts.serviceId ?? null,
    quantity: opts.quantity ?? randInt(1, 4),
    unit_price: opts.unitPrice ?? randInt(200, 4000),
    currency: opts.currency ?? 'TRY',
    ...(opts.extra || {}),
  };
}

/** An order_messages row (chat). */
export function newOrderMessage(workOrderId, opts = {}) {
  const bodies = [
    'Renk seçimi onaylandı, üretime geçebilirsiniz.',
    'Model tarama dosyası yüklendi.',
    'Prova randevusu için uygun tarih rica ederim.',
    'Oklüzyon kontrolü yapıldı, sorun yok.',
    'Teslim tarihi bir gün öne alınabilir mi?',
  ];
  return {
    work_order_id: workOrderId,
    content: `[${RUN_TAG}] ${opts.content ?? pick(bodies)}`,
    ...(opts.extra || {}),
  };
}

/** A stock_movements row. */
export function newStockMovement(stockItemId, opts = {}) {
  return {
    stock_item_id: stockItemId,
    movement_type: opts.type ?? 'cikis',
    quantity: opts.quantity ?? Number((Math.random() * 3 + 0.1).toFixed(2)),
    notes: `${RUN_TAG} synthetic`,
    ...(opts.extra || {}),
  };
}

// ── Synthetic binary payloads for upload tests ───────────────────────────────

/**
 * Build an ArrayBuffer of `bytes` length with a deterministic, non-compressible
 * pattern. Non-compressible matters: a buffer of zeros would sail through gzip
 * and give you a throughput number that has nothing to do with a real STL.
 */
export function syntheticBytes(bytes) {
  const buf = new Uint8Array(bytes);
  let x = 0x9e3779b9;
  for (let i = 0; i < bytes; i++) {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    buf[i] = x & 0xff;
  }
  return buf.buffer;
}

/**
 * A valid binary STL of roughly `targetBytes`.
 * Header (80) + triangle count (4) + N × 50 bytes.
 * Real STLs are what the labs actually upload, and the format matters for any
 * server-side sniffing.
 */
export function syntheticStl(targetBytes) {
  const triangles = Math.max(1, Math.floor((targetBytes - 84) / 50));
  const size = 84 + triangles * 50;
  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  const header = `Siman k6 synthetic STL ${RUN_TAG}`;
  for (let i = 0; i < header.length && i < 80; i++) bytes[i] = header.charCodeAt(i);
  view.setUint32(80, triangles, true);

  let off = 84;
  for (let t = 0; t < triangles; t++) {
    // normal + 3 vertices = 12 floats, then a 2-byte attribute count
    for (let f = 0; f < 12; f++) {
      view.setFloat32(off, ((t * 12 + f) % 1000) / 10, true);
      off += 4;
    }
    view.setUint16(off, 0, true);
    off += 2;
  }
  return buf;
}

/** A minimal valid JPEG of approximately `targetBytes` (padded in a comment segment). */
export function syntheticJpeg(targetBytes) {
  const head = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
                0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const tail = [0xff, 0xd9];
  const padLen = Math.max(0, targetBytes - head.length - tail.length - 4);
  const total = head.length + 4 + padLen + tail.length;
  const out = new Uint8Array(total);
  out.set(head, 0);
  // COM marker with a length that covers the padding
  out[head.length] = 0xff;
  out[head.length + 1] = 0xfe;
  out[head.length + 2] = ((padLen + 2) >> 8) & 0xff;
  out[head.length + 3] = (padLen + 2) & 0xff;
  let x = 0x2545f491;
  for (let i = 0; i < padLen; i++) {
    x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
    out[head.length + 4 + i] = x & 0x7f; // keep out of marker range
  }
  out.set(tail, total - 2);
  return out.buffer;
}

/** A minimal valid PDF of approximately `targetBytes`. */
export function syntheticPdf(targetBytes) {
  const body =
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n';
  const trailer = '\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF\n';
  const padLen = Math.max(0, targetBytes - body.length - trailer.length - 10);
  const pad = `\n% ${'k6'.repeat(Math.ceil(padLen / 2)).slice(0, padLen)}`;
  const text = body + pad + trailer;
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out.buffer;
}

/** Standard upload sizes used by the upload suite (Phase 10). */
export const UPLOAD_SIZES = {
  thumb: 64 * 1024,
  photo: 2 * 1024 * 1024,
  photo_large: 5 * 1024 * 1024,
  stl_small: 5 * 1024 * 1024,
  stl_medium: 20 * 1024 * 1024,
  stl_large: 50 * 1024 * 1024,
  pdf: 512 * 1024,
  zip: 10 * 1024 * 1024,
};
