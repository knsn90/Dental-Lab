// node --test modules/cash/drawerModel.test.mts — nakit kasa (çekmece) saf kuralları
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countDiff, drawerFor, movementSource, isEditable, parseAmount, canSeeDrawers } from './drawerModel.ts';

test('countDiff: sayılan beklenenden az → çıkış farkı', () => {
  assert.deepEqual(countDiff(950, 1000), { diff: -50, direction: 'cikis' });
});

test('countDiff: kuruş altı fark yok sayılır', () => {
  assert.deepEqual(countDiff(1000.004, 1000), { diff: 0, direction: null });
});

test('countDiff: sayılan fazla → giriş farkı', () => {
  assert.deepEqual(countDiff(1200, 1000), { diff: 200, direction: 'giris' });
});

test('countDiff: ondalık kayan nokta hatası farka sızmaz', () => {
  assert.deepEqual(countDiff(0.3, 0.1 + 0.2), { diff: 0, direction: null });
});

test('drawerFor: pasif çekmece ve çekmece olmayan kasa yok sayılır', () => {
  const accounts = [
    { id: 'a', currency: 'TRY', is_drawer: false, is_active: true },
    { id: 'b', currency: 'TRY', is_drawer: true, is_active: false },
    { id: 'c', currency: 'EUR', is_drawer: true, is_active: true },
  ];
  assert.equal(drawerFor(accounts, 'TRY'), null);
  assert.equal(drawerFor(accounts, 'EUR')?.id, 'c');
});

test('movementSource: kaynak türleri', () => {
  assert.equal(movementSource({ ref_type: 'payment' }), 'tahsilat');
  assert.equal(movementSource({ ref_type: 'clinic_receipt_line' }), 'makbuz');
  assert.equal(movementSource({ ref_type: 'expense' }), 'gider');
  assert.equal(movementSource({ ref_type: 'cash_count' }), 'sayim');
  assert.equal(movementSource({ ref_type: null }), 'elle');
});

test('isEditable: yalnız elle hareket silinir/düzenlenir', () => {
  assert.equal(isEditable({ ref_type: 'expense' }), false);
  assert.equal(isEditable({ ref_type: 'cash_count' }), false);
  assert.equal(isEditable({ ref_type: null }), true);
});

test('parseAmount: virgül ondalık, nokta binlik (TR) ve düz nokta ondalık', () => {
  assert.equal(parseAmount('1.250,50'), 1250.5);
  assert.equal(parseAmount('1,5'), 1.5);
  assert.equal(parseAmount('1250.5'), 1250.5);
  assert.equal(parseAmount('12.50'), 12.5);
  assert.equal(parseAmount('1.250'), 1250);
  assert.equal(parseAmount('12.500.000'), 12500000);
  assert.equal(parseAmount(' 950 '), 950);
});

test('parseAmount: boş ya da sayı olmayan → NaN', () => {
  assert.ok(Number.isNaN(parseAmount('')));
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount('1,2,3')));
});

test('parseAmount: iki ayraç birlikte → sondaki ondalık (EN/DE biçimi de doğru okunur)', () => {
  assert.equal(parseAmount('1,250.50'), 1250.5);
  assert.equal(parseAmount('12,500,000.75'), 12500000.75);
  assert.equal(parseAmount('1.250,50'), 1250.5);
});

test('canSeeDrawers: görme ya da yönetme izni olan kasayı görür', () => {
  assert.equal(canSeeDrawers({ canView: false, canManage: false }), false);
  assert.equal(canSeeDrawers({ canView: true, canManage: false }), true);
  assert.equal(canSeeDrawers({ canView: false, canManage: true }), true);
});
