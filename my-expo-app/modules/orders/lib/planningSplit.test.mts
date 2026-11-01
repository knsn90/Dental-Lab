// node --test my-expo-app/modules/orders/lib/planningSplit.test.mts   (.mts → tsc kapsamı dışında)
// Siparişler ekranı: "Planlama bekliyor" bloğu ile ana liste ayrımı.
// Kural (kullanıcı 2026-10-28): revizyon açılınca ASIL sipariş planlama listesine taşınmaz;
// yalnız gerçekten planlama bekleyen iş o bloğa girer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPlanning } from './planningSplit.ts';

const parent = { id: 'p', order_number: 'NEX-0192', status: 'teslim_edildi', triaged_at: '2026-10-14T10:00:00Z' };
const rev = { id: 'r', order_number: 'NEX-42', status: 'alindi', triaged_at: null, revision_of_id: 'p' };

test('revizyon planlama bekliyor: asıl sipariş ana listede kalır, planlamaya taşınmaz', () => {
  const { planning, main } = splitPlanning([parent, rev]);
  assert.deepEqual(planning.map(o => o.id), ['r']);
  assert.deepEqual(main.map(o => o.id), ['p']);
});

test('planlamadaki revizyon ilişki etiketini taşır (asıl sipariş no)', () => {
  const { planning } = splitPlanning([parent, rev]);
  assert.equal(planning[0].__relType, 'revizyon');
  assert.equal(planning[0].__parentNo, 'NEX-0192');
  assert.equal(planning[0].__revChild, undefined);
  assert.equal(planning[0].__revParent, undefined);
});

test('devam siparişi planlamada: asıl iş yerinde kalır, etiket "devam"', () => {
  const cont = { id: 'c', order_number: 'NEX-43', status: 'alindi', triaged_at: null, continues_order_id: 'p' };
  const { planning, main } = splitPlanning([parent, cont]);
  assert.deepEqual(planning.map(o => o.id), ['c']);
  assert.equal(planning[0].__relType, 'devam');
  assert.deepEqual(main.map(o => o.id), ['p']);
  assert.equal(main[0].__revParent, undefined);
});

test('asıl sipariş listede yoksa revizyon etiketi asıl no olmadan', () => {
  const { planning } = splitPlanning([rev]);
  assert.equal(planning[0].__relType, 'revizyon');
  assert.equal(planning[0].__parentNo, null);
});

test('ana listedeki revizyon da ilişki etiketini taşır; planlanmış iş ana listede', () => {
  const planned = { ...rev, triaged_at: '2026-10-28T11:00:00Z' };
  const { planning, main } = splitPlanning([parent, planned]);
  assert.equal(planning.length, 0);
  assert.deepEqual(main.map(o => o.id), ['p', 'r']);
  assert.equal(main[1].__relType, 'revizyon');
  assert.equal(main[1].__parentNo, 'NEX-0192');
});

test('ilişkisiz siparişler olduğu gibi; sıra korunur', () => {
  const a = { id: 'a', status: 'alindi', triaged_at: null };
  const b = { id: 'b', status: 'uretimde', triaged_at: '2026-10-01T00:00:00Z' };
  const c = { id: 'c', status: 'alindi', triaged_at: null };
  const { planning, main } = splitPlanning([a, b, c]);
  assert.deepEqual(planning, [a, c]);
  assert.deepEqual(main, [b]);
});
