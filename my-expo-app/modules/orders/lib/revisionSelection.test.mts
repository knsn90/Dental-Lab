// node --test my-expo-app/modules/orders/lib/revisionSelection.test.mts   (.mts → tsc kapsamı dışında)
// Revizyon penceresi: işlem yapılmış dişleri şerit/işlem gruplarına ayırır, seçimi RPC girişine çevirir.
// Kural (kullanıcı 2026-10-28): "hangi şeritte ve hangi dişlerde revizyon olacak" sorulur; başta hiçbiri seçili değil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revisionToothGroups, revisionItemsPayload, toggleTooth, toggleGroup, selectedToothCount } from './revisionSelection.ts';

const items = [
  { id: 'b', name: 'Zirkon Kron / Köprü', tooth_numbers: [45, 44], lane: 2 },
  { id: 'a', name: 'Ti-Base Zirkon Kron / Köprü', tooth_numbers: [47, 46], lane: 1 },
  { id: 'k', name: 'Kurye', tooth_numbers: [], lane: 1 },
];

test('gruplar: yalnız dişli kalemler, şerit sonra ad sırası, dişler sıralı; şerit numarası yalnız birden çok şeritte', () => {
  const g = revisionToothGroups(items);
  assert.deepEqual(g.map(x => x.itemId), ['a', 'b']);
  assert.deepEqual(g[0].teeth, [46, 47]);
  assert.equal(g[0].lane, 1);
  assert.equal(g[1].lane, 2);
  assert.equal(g[0].showLane, true);
  const single = revisionToothGroups([{ id: 'x', name: 'A', tooth_numbers: [11], lane: 1 }, { id: 'y', name: 'B', tooth_numbers: [21], lane: null }]);
  assert.equal(single.every(x => x.showLane === false), true);
});

test('başta hiçbiri seçili değil; tek diş ve grup seçimi', () => {
  let sel: Record<string, number[]> = {};
  assert.equal(selectedToothCount(sel), 0);
  assert.deepEqual(revisionItemsPayload(sel), []);
  sel = toggleTooth(sel, 'a', 46);
  assert.deepEqual(revisionItemsPayload(sel), [{ item_id: 'a', teeth: [46] }]);
  sel = toggleTooth(sel, 'a', 46);
  assert.deepEqual(revisionItemsPayload(sel), []);
  const g = revisionToothGroups(items);
  sel = toggleGroup(sel, g[1]);
  assert.deepEqual(revisionItemsPayload(sel), [{ item_id: 'b', teeth: [44, 45] }]);
  assert.equal(selectedToothCount(sel), 2);
  // grubun hepsi seçiliyse grup dokunuşu temizler
  sel = toggleGroup(sel, g[1]);
  assert.deepEqual(revisionItemsPayload(sel), []);
  // kısmi seçimde grup dokunuşu hepsini seçer
  sel = toggleTooth(sel, 'b', 45);
  sel = toggleGroup(sel, g[1]);
  assert.deepEqual(revisionItemsPayload(sel), [{ item_id: 'b', teeth: [44, 45] }]);
});
