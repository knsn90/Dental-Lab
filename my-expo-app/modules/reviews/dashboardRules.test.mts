// node --test modules/reviews/dashboardRules.test.mts
// Değerlendirmeler ekranı — saf kurallar (spec 2026-11-04-degerlendirmeler-ekrani).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_LOW_MAX, SCORE_SHORT_LABELS, waButtonLabel, lowChips, canSeeReviewDashboard, avgDelta,
  sortClinicRows, sparkSegments, sortLows, defaultLowFilter, daysUncalled, callPhone,
  shiftMonth, isFutureMonth, formatAvg,
} from './dashboardRules.ts';

// Testlerde yalnız ilgili alanlar dolu; geri kalanı boş.
const row = (p: Record<string, unknown>): any => ({
  work_order_id: 'w', order_number: '1', clinic_key: 'c:1', clinic_name: 'K', doctor_name: 'H',
  work_type_label: 'Zirkonya', created_at: '2026-11-01T10:00:00Z', source: 'app',
  overall: 5, fit: null, occlusion: null, contacts: null, esthetics: null, surface: null, on_time: null,
  comment: null, wa_answer: null, cur_min: null, ...p,
});
const low = (p: Record<string, unknown>): any => row({
  phone: null, period_started_at: null, called_at: null, called_by_name: null, call_note: null,
  note_updated_at: null, note_updated_by_name: null, is_open: true, previous_call: false, ...p,
});
const clinic = (p: Record<string, unknown>): any => ({
  key: p.name, kind: 'clinic', series: [null, null, null, null, null, null], counts: [0, 0, 0, 0, 0, 0],
  month_avg: null, month_count: 0, month_low: 0, prev3_avg: null, ...p,
});

test('sabitler', () => {
  assert.equal(REVIEW_LOW_MAX, 3);
  assert.deepEqual(SCORE_SHORT_LABELS, {
    overall: 'Genel', fit: 'Uyum', occlusion: 'Oklüzyon', contacts: 'Kontakt',
    esthetics: 'Estetik', surface: 'Yüzey', on_time: 'Zamanında teslim',
  });
});

test('WhatsApp düğme etiketi', () => {
  assert.equal(waButtonLabel(5), 'Sorunsuz');
  assert.equal(waButtonLabel(3), 'Küçük düzeltme');
  assert.equal(waButtonLabel(1), 'Sorun var');
  assert.equal(waButtonLabel(null), null);
  assert.equal(waButtonLabel(2), null);
});

test('düşük puan rozetleri', () => {
  const labels = (r: any) => lowChips(r).map((c) => c.label);
  assert.deepEqual(labels(row({ overall: 3, fit: 2, on_time: 3, source: 'app' })), ['Genel 3', 'Uyum 2', 'Zamanında teslim 3']);
  assert.deepEqual(labels(row({ overall: 5, source: 'app', wa_answer: 1 })), ['WhatsApp 1']);
  assert.deepEqual(labels(row({ overall: 1, source: 'whatsapp', wa_answer: 1 })), ['Genel 1']);
  assert.deepEqual(labels(row({ overall: 4 })), []);
  assert.deepEqual(lowChips(row({ overall: 5, fit: 2, wa_answer: 3 })),
    [{ key: 'fit', label: 'Uyum 2', score: 2 }, { key: 'whatsapp', label: 'WhatsApp 3', score: 3 }]);
});

test('panoyu yalnız lab yöneticisi görür', () => {
  assert.equal(canSeeReviewDashboard({ user_type: 'admin' }), true);
  assert.equal(canSeeReviewDashboard({ user_type: 'lab', role: 'manager' }), true);
  assert.equal(canSeeReviewDashboard({ user_type: 'lab', role: 'technician' }), false);
  assert.equal(canSeeReviewDashboard({ user_type: 'lab', role: 'accountant' }), false);
  assert.equal(canSeeReviewDashboard({ user_type: 'doctor' }), false);
  assert.equal(canSeeReviewDashboard({ user_type: 'clinic_admin' }), false);
  assert.equal(canSeeReviewDashboard(null), false);
});

test('ortalama farkı bir ondalık', () => {
  assert.equal(avgDelta(3.4, 4.6), -1.2);
  assert.equal(avgDelta(4.6, 4.4), 0.2);
  assert.equal(avgDelta(null, 4), null);
  assert.equal(avgDelta(4, null), null);
});

test('klinik sırası: en çok düşen önce, sonra yeni, en sonda bu ay puansız', () => {
  const rows = [
    clinic({ name: 'A', month_count: 2, month_avg: 4.0, prev3_avg: 4.3 }),
    clinic({ name: 'B', month_count: 1, month_avg: 3.0, prev3_avg: 4.2 }),
    clinic({ name: 'C', month_count: 3, month_avg: 4.6, prev3_avg: 4.4 }),
    clinic({ name: 'E', month_count: 0, prev3_avg: 4.0 }),
    clinic({ name: 'D', month_count: 1, month_avg: 5, prev3_avg: null }),
  ];
  assert.deepEqual(sortClinicRows(rows).map((r) => r.name), ['B', 'A', 'C', 'D', 'E']);
  assert.equal(rows[0].name, 'A', 'girdi dizisi değişmez');
});

test('mini grafik: boş ay segmenti böler, 5 üstte 1 altta', () => {
  const segs = sparkSegments([4, null, 5, 5, null, 3], 60, 20);
  assert.equal(segs.length, 3);
  assert.deepEqual(segs[1].map((p) => p.y), [0, 0]);
  assert.equal(sparkSegments([1], 60, 20)[0][0].y, 20);
  assert.equal(segs[0][0].x, 0);
  assert.equal(segs[2][0].x, 60);
  assert.deepEqual(sparkSegments([null, null], 60, 20), []);
});

test('düşük liste sırası', () => {
  const rows = [
    low({ work_order_id: 'calledOld', is_open: false, called_at: '2026-11-01T10:00:00Z', period_started_at: '2026-10-01T00:00:00Z' }),
    low({ work_order_id: 'openNew', is_open: true, period_started_at: '2026-11-03T00:00:00Z' }),
    low({ work_order_id: 'calledNew', is_open: false, called_at: '2026-11-03T10:00:00Z', period_started_at: '2026-10-02T00:00:00Z' }),
    low({ work_order_id: 'openOld', is_open: true, period_started_at: '2026-11-01T00:00:00Z' }),
  ];
  assert.deepEqual(sortLows(rows).map((r) => r.work_order_id), ['openOld', 'openNew', 'calledNew', 'calledOld']);
});

test('varsayılan süzgeç: açık varsa açıklar', () => {
  assert.equal(defaultLowFilter([low({ is_open: false }), low({ is_open: true })]), 'open');
  assert.equal(defaultLowFilter([low({ is_open: false })]), 'all');
  assert.equal(defaultLowFilter([]), 'all');
});

test('aranmadan geçen gün', () => {
  const now = new Date('2026-11-04T12:00:00Z');
  const ago = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
  assert.equal(daysUncalled(ago(47), now), null);
  assert.equal(daysUncalled(ago(49), now), 2);
  assert.equal(daysUncalled(ago(73), now), 3);
  assert.equal(daysUncalled(null, now), null);
});

test('aranacak numara', () => {
  assert.equal(callPhone(low({ phone: ' 0532 000 00 00 ' })), '0532 000 00 00');
  assert.equal(callPhone(low({ phone: '  ' })), null);
  assert.equal(callPhone(low({ phone: null })), null);
});

test('ay kaydırma ve gelecek ay (TR saati)', () => {
  assert.equal(shiftMonth('2026-01-01', -1), '2025-12-01');
  assert.equal(shiftMonth('2026-12-01', 1), '2027-01-01');
  assert.equal(shiftMonth('2026-11-01', -6), '2026-05-01');
  assert.equal(isFutureMonth('2026-12-01', new Date('2026-11-30T20:30:00Z')), true);
  assert.equal(isFutureMonth('2026-12-01', new Date('2026-11-30T21:30:00Z')), false);
  assert.equal(isFutureMonth('2026-11-01', new Date('2026-11-04T12:00:00Z')), false);
});

test('ortalama biçimi', () => {
  assert.equal(formatAvg(4.56, 'tr'), '4,6');
  assert.equal(formatAvg(4.56, 'en'), '4.6');
  assert.equal(formatAvg(4, 'de'), '4,0');
  assert.equal(formatAvg(null, 'tr'), '—');
});
