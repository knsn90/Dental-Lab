// node --test my-expo-app/core/ui/commandPaletteModel.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPageCommands, recordRows, GROUP_LABEL } from './commandPaletteModel.ts';
import { foldTR } from '../../modules/search/lib/fold.ts';

const PAGES = [
  { label: 'Faturalar', group: 'Finans' },
  { label: 'Stok', group: 'Depo' },
  { label: 'Sağlık Kurumları', group: 'Müşteriler' },
];

test('sayfa araması bugünkü gibi; Türkçe harf katlamasıyla', () => {
  assert.deepEqual(buildPageCommands(PAGES, '', foldTR), PAGES);
  assert.deepEqual(buildPageCommands(PAGES, 'fatura', foldTR).map((p) => p.label), ['Faturalar']);
  assert.deepEqual(buildPageCommands(PAGES, 'FİNANS', foldTR).map((p) => p.label), ['Faturalar']);
  assert.deepEqual(buildPageCommands(PAGES, 'saglik', foldTR).map((p) => p.label), ['Sağlık Kurumları']);
  assert.deepEqual(buildPageCommands(PAGES, 'yok-boyle', foldTR), []);
});

const R = {
  orders: [{ id: 'o1' }, { id: 'o2' }],
  orders_more: true,
  clinics: [{ id: 'c1' }],
  doctors: [],
  invoices: [{ id: 'i1' }],
} as any;

test('kayıt satırları grup sırasıyla: Siparişler · Klinikler · Hekimler · Faturalar; boş grup atlanır', () => {
  assert.deepEqual(recordRows(R).map((r) => `${r.kind}:${r.id}`), ['orders:o1', 'orders:o2', 'clinics:c1', 'invoices:i1']);
  assert.deepEqual(GROUP_LABEL, { orders: 'Siparişler', clinics: 'Klinikler', doctors: 'Hekimler', invoices: 'Faturalar' });
});

test('"daha fazla" ipucu seçilebilir satır değildir', () => {
  assert.equal(recordRows(R).length, 4);
  assert.equal(recordRows({ ...R, orders_more: false }).length, 4);
});
