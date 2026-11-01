// node --test my-expo-app/modules/logs/logTarget.test.mts   (.mts → tsc kapsamı dışında)
// Loglar satırı → açılacak sipariş (Geçmiş sekmesi). Son inceleme #5: malzeme satırı malzeme adına gidiyordu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderTarget } from './logTarget.ts';

const L = (o: Record<string, any>) => ({ entity_type: null, entity_id: null, entity_label: null, metadata: null, ...o });

test('sipariş kaydı / mesaj / dosya → entity_id; metadata.order_id önce gelir', () => {
  assert.equal(orderTarget(L({ entity_type: 'work_order', entity_id: 'w1' })), 'w1');
  assert.equal(orderTarget(L({ entity_type: 'message', entity_id: 'w2' })), 'w2');
  assert.equal(orderTarget(L({ entity_type: 'stage', entity_id: 's1', metadata: { order_id: 'w3' } })), 'w3');
});

test('metadata.order_no varsa o', () => {
  assert.equal(orderTarget(L({ entity_type: 'stage', entity_id: 's1', metadata: { order_no: 'NEX-2026-0167' } })), 'NEX-2026-0167');
});

test('eski aşama etiketi "NO · istasyon" → NO', () => {
  assert.equal(orderTarget(L({ entity_type: 'stage', entity_id: 's1', entity_label: 'NEX-2026-0167 · CAD Tasarım' })), 'NEX-2026-0167');
});

test('malzeme etiketi "malzeme · miktar · NO" → son parçadaki NO (malzeme adı değil)', () => {
  assert.equal(orderTarget(L({ entity_type: 'material', entity_id: 's1', entity_label: 'Zirkon Blok 98-14 · 1 Adet · NEX-2026-0204' })), 'NEX-2026-0204');
});

test('sipariş no taşımayan etiket (materials_none) → yok; süzgeçteki no yedek olur, büyük harfle', () => {
  assert.equal(orderTarget(L({ entity_type: 'order_stage', entity_id: 's1', entity_label: 'Sinterleme · malzeme kullanılmadı' })), null);
  assert.equal(orderTarget(L({ entity_type: 'order_stage', entity_id: 's1', entity_label: 'Sinterleme · malzeme kullanılmadı' }), 'nex-2026-0167'), 'NEX-2026-0167');
  assert.equal(orderTarget(L({ entity_type: 'auth' }), '  '), null);
});
