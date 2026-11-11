// node --test modules/admin/users/userWorkStats.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUserWorkStats, workStatsView, isUnregisteredUserId, workStatsErrorText } from './userWorkStats.ts';

test('parse: bozuk/eksik yanıt 0 ve boş listeye düşer', () => {
  const s = parseUserWorkStats(null);
  assert.equal(s.kind, 'lab');
  assert.equal(s.total, 0);
  assert.deepEqual(s.items, []);
  assert.equal(parseUserWorkStats({ kind: 'uzayli', total: 'x' }).kind, 'lab');
});

test('parse: sunucu alanlarını eşler, null sayılar 0 olur', () => {
  const s = parseUserWorkStats({
    kind: 'doctor', total: 11, active: 9, overdue: 9, done_month: 1, queued: null, cancelled: null,
    items: [{ id: 'a', order_number: 'S-1', label: 'Zirkon', overdue: true }, { id: null, order_number: null, label: null }],
  });
  assert.equal(s.doneMonth, 1);
  assert.equal(s.queued, 0);
  assert.deepEqual(s.items[0], { id: 'a', orderNumber: 'S-1', label: 'Zirkon', overdue: true });
  assert.deepEqual(s.items[1], { id: null, orderNumber: '—', label: '', overdue: false });
});

test('view: hekim/klinik/lab sipariş metrikleri', () => {
  for (const kind of ['doctor', 'clinic', 'lab'] as const) {
    const v = workStatsView(parseUserWorkStats({ kind, total: 5, active: 3, overdue: 1, done_month: 2 }));
    assert.deepEqual(v.metrics.map(m => [m.label, m.value]), [['Toplam İş', 5], ['Aktif', 3], ['Geciken', 1], ['Bu Ay Teslim', 2]]);
    assert.equal(v.listTitle, 'AKTİF İŞLER');
  }
});

test('view: teknisyen aşama metrikleri', () => {
  const v = workStatsView(parseUserWorkStats({ kind: 'technician', total: 40, active: 2, queued: 3, done_month: 7 }));
  assert.deepEqual(v.metrics.map(m => [m.label, m.value]),
    [['Elindeki', 2], ['Sırada', 3], ['Bu Ay Tamamlanan', 7], ['Toplam Tamamlanan', 40]]);
  assert.equal(v.emptyText, 'Elinde iş yok');
});

test('view: kurye teslimat metrikleri, iptal kırmızı', () => {
  const v = workStatsView(parseUserWorkStats({ kind: 'courier', total: 8, active: 1, done_month: 2, cancelled: 1 }));
  assert.deepEqual(v.metrics.map(m => [m.label, m.value]),
    [['Aktif Teslimat', 1], ['Bu Ay Teslim', 2], ['Toplam Teslim', 8], ['İptal / İade', 1]]);
  assert.equal(v.metrics[3].tone, 'danger');
});

test('emp- kimlikleri sorgulanmaz; hata metni yetki/genel ayrımı yapar', () => {
  assert.equal(isUnregisteredUserId('emp-123'), true);
  assert.equal(isUnregisteredUserId('8f0c…'), false);
  assert.equal(workStatsErrorText({ code: '42501', message: 'US_SCOPE' }), 'Bu kullanıcının istatistiğini görme yetkin yok');
  assert.equal(workStatsErrorText({ code: 'PGRST202', message: 'not found' }), 'İstatistik yüklenemedi');
  assert.equal(workStatsErrorText(null), '');
});
