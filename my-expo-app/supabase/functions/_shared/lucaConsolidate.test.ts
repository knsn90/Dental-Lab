// node --test my-expo-app/supabase/functions/_shared/lucaConsolidate.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consolidateLucaLines } from './lucaConsolidate.ts';
import type { LucaLine } from './luca.ts';

const L = (over: Partial<LucaLine> = {}): LucaLine => ({ code: 'SMN-A', name: 'Zirkonyum kron', quantity: 1, unitPrice: 1530, vatRate: 20, discountAmount: 0, ...over });

test('same_service_price_rate_merge', () => {
  const out = consolidateLucaLines([L({ discountAmount: 10.5 }), L({ quantity: 2, discountAmount: 20.25 }), L({ discountAmount: 0.1 })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].quantity, 4);
  assert.equal(out[0].discountAmount, 30.85);
  assert.equal(out[0].code, 'SMN-A');
  assert.equal(out[0].unitPrice, 1530);
});

test('quantity_sum_decimal_r4', () => {
  const out = consolidateLucaLines([L({ quantity: 0.1 }), L({ quantity: 0.2 })]);
  assert.equal(out[0].quantity, 0.3);
});

test('different_price_not_merged', () => {
  assert.equal(consolidateLucaLines([L(), L({ unitPrice: 1500 })]).length, 2);
});

test('different_vat_not_merged', () => {
  assert.equal(consolidateLucaLines([L(), L({ vatRate: 10 })]).length, 2);
});

test('different_unit_not_merged_and_default_unit_equals_c62', () => {
  assert.equal(consolidateLucaLines([L(), L({ unit: 'MTR' })]).length, 2);
  assert.equal(consolidateLucaLines([L(), L({ unit: 'C62' })]).length, 1);
});

test('name_trim_is_part_of_key', () => {
  assert.equal(consolidateLucaLines([L(), L({ name: '  Zirkonyum kron ' })]).length, 1);
  assert.equal(consolidateLucaLines([L(), L({ name: 'Zirkonyum köprü' })]).length, 2);
});

test('list_price_lines_merge_with_summed_discount', () => {
  // Liste fiyatı Luca'ya giden birim fiyat; iskontolar farklı olsa da birleşir, iskonto toplanır.
  const out = consolidateLucaLines([L({ unitPrice: 2000, discountAmount: 470 }), L({ unitPrice: 2000, discountAmount: 200 })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].quantity, 2);
  assert.equal(out[0].discountAmount, 670);
});

test('line_note_kept_only_if_uniform', () => {
  assert.equal(consolidateLucaLines([L({ note: 'X' }), L({ note: 'X' })])[0].note, 'X');
  const diff = consolidateLucaLines([L({ note: 'X' }), L({ note: 'Y' })])[0];
  assert.equal('note' in diff, false);
  const oneMissing = consolidateLucaLines([L({ note: 'X' }), L()])[0];
  assert.equal('note' in oneMissing, false);
});

test('order_preserved', () => {
  const out = consolidateLucaLines([L({ name: 'B', unitPrice: 5 }), L({ name: 'A', unitPrice: 7 }), L({ name: 'B', unitPrice: 5 }), L({ name: 'C' })]);
  assert.deepEqual(out.map((l) => l.name), ['B', 'A', 'C']);
  assert.equal(out[0].quantity, 2);
});

test('single_line_unchanged_and_input_not_mutated', () => {
  const a = L({ note: 'N' });
  const copy = JSON.parse(JSON.stringify(a));
  assert.deepEqual(consolidateLucaLines([a]), [copy]);
  const b = L();
  consolidateLucaLines([a, b, L()]);
  assert.equal(b.quantity, 1);
});
