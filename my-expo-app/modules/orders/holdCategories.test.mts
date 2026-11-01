// node --test my-expo-app/modules/orders/holdCategories.test.mts   (.mts → tsc kapsamı dışında)
// Bekleme kategorileri (saf) — prova beklemesi her yerde "Provada" görünür, "Duraklatıldı" değil (2. dalga 4, spec 5.6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdBadgeText, isProvaHold, holdCategoryLabel, HOLD_PICKABLE, HOLD_CATEGORIES } from './holdCategories.ts';

test('prova beklemesi "Provada", diğer beklemeler "Duraklatıldı"', () => {
  assert.equal(holdBadgeText({ hold_status: 'on_hold', hold_category: 'client_prova' }), 'Provada');
  assert.equal(holdBadgeText({ hold_status: 'on_hold', hold_category: 'material' }), 'Duraklatıldı');
  assert.equal(holdBadgeText({ hold_status: 'on_hold', hold_category: null }), 'Duraklatıldı');
});

test('isProvaHold yalnız açık prova beklemesinde doğru', () => {
  assert.equal(isProvaHold({ hold_status: 'on_hold', hold_category: 'client_prova' }), true);
  assert.equal(isProvaHold({ hold_status: null, hold_category: 'client_prova' }), false);
  assert.equal(isProvaHold({ hold_status: 'on_hold', hold_category: 'client_missing_file' }), false);
  assert.equal(isProvaHold(null), false);
});

test('prova kategorisi etiketlenir ama elle bekletme listesinde yok', () => {
  assert.equal(holdCategoryLabel('client_prova'), 'Provada');
  assert.equal(HOLD_PICKABLE.some((c) => c.key === 'client_prova'), false);
  assert.equal(HOLD_PICKABLE.length, HOLD_CATEGORIES.length - 1);
  assert.equal(holdCategoryLabel('bilinmeyen'), 'Beklemede');
});
