// node --test my-expo-app/modules/orders/history/historyModel.test.mts   (.mts → tsc kapsamı dışında)
// Sipariş Geçmiş sekmesinin saf modeli; satırlar order_history() RPC'sinden gelir (20261027100000/110000).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fmtStamp, fmtDay, fmtTime, fmtDayHeader, groupByDay, chipCounts,
  filterRows, historyTitle, historyParts, HISTORY_KINDS, type HistoryRow, type Part,
} from './historyModel.ts';

const NOW = '2026-10-27T09:00:00Z';
const row = (kind: string, detail: Record<string, any> = {}, category: HistoryRow['category'] = 'diger'): HistoryRow => ({
  at: '2026-10-12T11:14:00Z', kind, category, actor_name: null, detail, link_order_id: null, link_order_no: null,
});
const texts = (ps: Part[]) => ps.map((p) => p.v);

test('saat lab saat diliminde, "12 Eki 14:14" biçiminde', () => {
  assert.equal(fmtStamp('2026-10-12T11:14:00Z', 'Europe/Istanbul', 'tr', NOW), '12 Eki 14:14');
  assert.equal(fmtStamp('2026-10-12T11:14:00Z', 'Asia/Tehran', 'tr', NOW), '12 Eki 14:44');
  assert.equal(fmtStamp('2026-10-12T22:30:00Z', 'Europe/Istanbul', 'tr', NOW), '13 Eki 01:30');
});

test('başka yıldaki satır yılı da yazar; saat dilimi yoksa İstanbul', () => {
  assert.equal(fmtStamp('2025-12-30T10:00:00Z', 'Europe/Istanbul', 'tr', NOW), '30 Ara 2025 13:00');
  assert.equal(fmtStamp('2026-10-12T11:14:00Z', null, 'tr', NOW), '12 Eki 14:14');
});

test('gün değeri (YYYY-MM-DD) kaydırılmadan gün olarak yazılır', () => {
  assert.equal(fmtDay('2026-10-18', 'Europe/Istanbul', 'tr', NOW), '18 Eki');
  assert.equal(fmtDay('2026-10-17T21:00:00Z', 'Europe/Istanbul', 'tr', NOW), '18 Eki');
});

test('çipler kategoriye göre süzer; "diğer" yalnız Tümü\'de', () => {
  const rows = [row('created', {}, 'teslim'), row('message', {}, 'notlar_sohbet'), row('stage_started', {}, 'uretim'), row('photo', {}, 'diger')];
  assert.equal(filterRows(rows, 'all').length, 4);
  assert.deepEqual(filterRows(rows, 'teslim').map((r) => r.kind), ['created']);
  assert.deepEqual(filterRows(rows, 'notlar_sohbet').map((r) => r.kind), ['message']);
  assert.deepEqual(filterRows(rows, 'uretim').map((r) => r.kind), ['stage_started']);
});

test('her tür kodunun başlığı var ve genel başlık değil', () => {
  for (const k of HISTORY_KINDS) {
    const t = historyTitle(row(k, { step: 'requested' }));
    assert.ok(t && t.length > 0, k);
    assert.notEqual(t, 'Kayıt', k);
  }
  assert.equal(historyTitle(row('bilinmeyen_tur')), 'Kayıt');
});

test('teslim tarihi değişikliği eski → yeni gösterir', () => {
  const ps = historyParts(row('delivery_date_changed', { old: '2026-10-18', new: '2026-10-19' }));
  assert.deepEqual(ps.filter((p) => p.t === 'date').map((p) => p.v), ['2026-10-18', '2026-10-19']);
  assert.ok(texts(ps).includes('→'));
});

test('oluşturma satırı söz verilen teslim gününü taşır', () => {
  const ps = historyParts(row('created', { delivery_date: '2026-10-18', is_urgent: true }));
  assert.ok(ps.some((p) => p.t === 'text' && p.v === 'Söz verilen teslim:'));
  assert.ok(ps.some((p) => p.t === 'date' && p.v === '2026-10-18'));
  assert.ok(ps.some((p) => p.t === 'text' && p.v === 'Acil'));
});

test('hasta adı değişikliği değer taşımaz', () => {
  const ps = historyParts(row('field_changed', { fields: [{ field: 'patient_name', changed: true }, { field: 'shade', old: 'A2', new: 'A3' }] }));
  assert.ok(ps.some((p) => p.t === 'field' && p.v === 'patient_name'));
  assert.deepEqual(ps.filter((p) => p.t === 'raw').map((p) => p.v), ['A2', 'A3']);
});

test('lab kaynaklı bekleme nedeni yoksa yalnız kaynak yazılır', () => {
  const ps = historyParts(row('hold_started', { responsible: 'lab' }));
  assert.deepEqual(ps, [{ t: 'text', v: 'Lab kaynaklı' }]);
  const pc = historyParts(row('hold_started', { responsible: 'client', category: 'client_missing_file', reason: 'tarama eksik' }));
  assert.ok(pc.some((p) => p.t === 'holdCat' && p.v === 'client_missing_file'));
  assert.ok(pc.some((p) => p.t === 'raw' && p.v === 'tarama eksik'));
});

test('kalem değişikliği fiyat yoksa fiyat parçası üretmez', () => {
  const noPrice = historyParts(row('items_changed', { items: [{ op: 'changed', service: 'Zirkon', qty_old: 1, qty_new: 2 }] }));
  assert.ok(!noPrice.some((p) => p.t === 'money'));
  const withPrice = historyParts(row('items_changed', { items: [{ op: 'changed', service: 'Zirkon', qty_old: 1, qty_new: 1, price_old: 100, price_new: 120, currency: 'EUR' }] }));
  assert.deepEqual(withPrice.filter((p) => p.t === 'money').map((p) => p.v), ['100 EUR', '120 EUR']);
});

test('durum adımı kodları taşır; türetilmiş teslimde eski durum yok', () => {
  const ps = historyParts(row('status_changed', { old: 'alindi', new: 'uretimde' }));
  assert.deepEqual(ps.filter((p) => p.t === 'status').map((p) => p.v), ['alindi', 'uretimde']);
  const d = historyParts(row('status_changed', { new: 'teslim_edildi', derived: true }));
  assert.deepEqual(d.filter((p) => p.t === 'status').map((p) => p.v), ['teslim_edildi']);
});

test('dosya adı depolama önekleri (zaman damgası + rastgele kimlik) olmadan yazılır', () => {
  const ps = historyParts(row('photo', { name: '1786542409515-1786542409456-5fmq5e66bf3-Tarama_Arsivi.zip' }));
  assert.deepEqual(ps.filter((p) => p.t === 'raw').map((p) => p.v), ['Tarama_Arsivi.zip']);
  const plain = historyParts(row('photo', { name: 'model-ust.stl' }));
  assert.deepEqual(plain.filter((p) => p.t === 'raw').map((p) => p.v), ['model-ust.stl']);
});

test('klinik görünümü: lab kaynaklı beklemede kaynak gelmez → ayrıntı boş (yalnız "Beklemeye alındı")', () => {
  assert.deepEqual(historyParts(row('hold_started', {})), []);
  assert.deepEqual(historyParts(row('hold_ended', {})), []);
});

test('popup satırı yalnız saat gösterir; gün başlığı tam gün + hafta günü', () => {
  assert.equal(fmtTime('2026-10-12T11:14:00Z', 'Europe/Istanbul', 'tr'), '14:14');
  assert.equal(fmtTime('2026-10-12T22:30:00Z', 'Europe/Istanbul', 'tr'), '01:30');
  assert.equal(fmtDayHeader('2026-10-12T11:14:00Z', 'Europe/Istanbul', 'tr', NOW), '12 Ekim, Pazartesi');
  assert.equal(fmtDayHeader('2025-12-30T10:00:00Z', 'Europe/Istanbul', 'tr', NOW), '30 Aralık 2025, Salı');
});

test('satırlar lab gününe göre gruplanır, sıra korunur (gece yarısından sonrası ertesi gün)', () => {
  const a = { ...row('created'), at: '2026-10-12T11:14:00Z' };
  const b = { ...row('message'), at: '2026-10-12T22:30:00Z' };
  const c = { ...row('photo'), at: '2026-10-13T08:00:00Z' };
  const g = groupByDay([a, b, c], 'Europe/Istanbul');
  assert.deepEqual(g.map((x) => x.key), ['2026-10-12', '2026-10-13']);
  assert.deepEqual(g.map((x) => x.rows.map((r) => r.kind)), [['created'], ['message', 'photo']]);
});

test('çip sayıları kategoriye göre', () => {
  const rows = [row('created', {}, 'teslim'), row('message', {}, 'notlar_sohbet'), row('stage_started', {}, 'uretim'),
    row('stage_completed', {}, 'uretim'), row('photo', {}, 'diger')];
  assert.deepEqual(chipCounts(rows), { all: 5, teslim: 1, notlar_sohbet: 1, uretim: 2 });
});

// 2. dalga 4 (prova takibi, 20261027163000): randevu kayıtları + hekimin "geri gönderdim" işareti
test('randevu kaydı başlığı eyleme göre; parçalar tür + eski → yeni gün + saat', () => {
  assert.ok((HISTORY_KINDS as readonly string[]).includes('appointment'));
  assert.equal(historyTitle(row('appointment', { action: 'Randevu ekledi' })), 'Randevu eklendi');
  assert.equal(historyTitle(row('appointment', { action: 'Randevu önerdi' })), 'Randevu önerildi');
  assert.equal(historyTitle(row('appointment', { action: 'Randevu önerisini reddetti' })), 'Randevu önerisi reddedildi');
  const ps = historyParts(row('appointment', { action: 'Randevu değiştirdi', kind: 'takma', date: '2026-11-13', old_date: '2026-11-06', time: '14:30:00' }));
  assert.ok(ps.some((p) => p.t === 'text' && p.v === 'Takma randevusu'));
  assert.deepEqual(ps.filter((p) => p.t === 'date').map((p) => p.v), ['2026-11-06', '2026-11-13']);
  assert.ok(texts(ps).includes('14:30'));
  const sil = historyParts(row('appointment', { action: 'Randevu önerdi', kind: 'prova', date: '2026-10-30', proposal: 'sil' }));
  assert.ok(sil.some((p) => p.t === 'text' && p.v === 'Silinmesi önerildi'));
});

test('hekimin provayı geri gönderme işareti prova numarasını taşır', () => {
  assert.ok((HISTORY_KINDS as readonly string[]).includes('prova_client_returned'));
  assert.equal(historyTitle(row('prova_client_returned', { number: 2 })), 'Hekim provayı geri gönderdi');
  assert.ok(texts(historyParts(row('prova_client_returned', { number: 2, item: 'Üst köprü' }))).includes('#2'));
});

test('tarama satırı: karar türüne göre başlık, randevu etiketi ayrıntıda', () => {
  const lbl = 'Klinik A · 28.10 09:30';
  assert.equal(historyTitle(row('scan', { action: 'Tarama kararı verdi', decision: 'siparise_baglandi', label: lbl })), 'Tarama siparişe bağlandı');
  assert.equal(historyTitle(row('scan', { action: 'Tarama kararı verdi', decision: 'yeni_siparis', label: lbl })), 'Taramadan sipariş açıldı');
  assert.equal(historyTitle(row('scan', { action: 'Tarama kararını geri aldı', decision: 'siparise_baglandi' })), 'Tarama kararı geri alındı');
  assert.equal(historyTitle(row('scan', { action: 'Tarama yeniden karar bekliyor · sipariş iptal edildi' })), 'Tarama yeniden karar bekliyor');
  assert.deepEqual(texts(historyParts(row('scan', { action: 'Tarama kararı verdi', decision: 'yeni_siparis', label: lbl }))), [lbl]);
  assert.ok((HISTORY_KINDS as readonly string[]).includes('scan'));
});

test('bekleme başlangıcı sonradan girildiyse "Sonradan girildi" + giriş anı yazılır', () => {
  const ps = historyParts(row('hold_started', { responsible: 'client', category: 'client_approval', recorded_at: '2026-10-25T09:00:00Z' }));
  assert.ok(ps.some((p) => p.t === 'text' && p.v === 'Sonradan girildi'));
  assert.ok(ps.some((p) => p.t === 'date' && p.v === '2026-10-25T09:00:00Z'));
  assert.ok(ps.some((p) => p.t === 'holdCat' && p.v === 'client_approval'));
});

test('recorded_at yoksa "Sonradan girildi" yazılmaz', () => {
  const ps = historyParts(row('hold_started', { responsible: 'client', category: 'client_approval' }));
  assert.ok(!ps.some((p) => p.v === 'Sonradan girildi'));
  const pe = historyParts(row('hold_ended', { extended_days: 3 }));
  assert.ok(!pe.some((p) => p.v === 'Sonradan girildi'));
});

test('bitiş sonradan girildiyse uzatma parçaları + "Sonradan girildi" + tarih', () => {
  const ps = historyParts(row('hold_ended', { extended_days: 7, recorded_at: '2026-10-26T08:00:00Z' }));
  assert.ok(ps.some((p) => p.t === 'text' && p.v === 'Teslim süresi uzatıldı:'));
  assert.ok(ps.some((p) => p.t === 'raw' && p.v === '+7'));
  assert.ok(ps.some((p) => p.t === 'text' && p.v === 'Sonradan girildi'));
  assert.ok(ps.some((p) => p.t === 'date' && p.v === '2026-10-26T08:00:00Z'));
});

test('teslimde kapanan bekleme başlığı "Bekleme teslimde kapandı"', () => {
  assert.equal(historyTitle(row('hold_ended', { on_delivery: true })), 'Bekleme teslimde kapandı');
  assert.equal(historyTitle(row('hold_ended', {})), 'Devam ettirildi');
});

test('başlangıç devamda düzeltildiyse "Sonradan girildi" yanında giren kişinin adı yazılır', () => {
  const ps = historyParts(row('hold_started', {
    responsible: 'client', category: 'client_approval', recorded_at: '2026-11-02T09:00:00Z', recorded_by: 'Yönetici Bir',
  }));
  const i = ps.findIndex((p) => p.t === 'text' && p.v === 'Sonradan girildi');
  assert.ok(i >= 0);
  assert.deepEqual(ps.slice(i, i + 3), [
    { t: 'text', v: 'Sonradan girildi' }, { t: 'date', v: '2026-11-02T09:00:00Z' }, { t: 'raw', v: 'Yönetici Bir' },
  ]);
  // recorded_by yoksa ad parçası eklenmez
  const pn = historyParts(row('hold_started', { responsible: 'client', category: 'client_approval', recorded_at: '2026-11-02T09:00:00Z' }));
  assert.equal(pn[pn.length - 1].t, 'date');
});
