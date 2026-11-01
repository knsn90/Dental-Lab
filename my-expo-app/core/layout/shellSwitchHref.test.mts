// node --test core/layout/shellSwitchHref.test.mts — kabuk geçişinde (masaüstü ↔ mobil) geri dönülecek adres
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupHref, splitHref, restoreStep } from './shellSwitchHref.ts';

test('grup öneki + yol + sorgu', () => {
  assert.equal(groupHref('(admin)', '/finance', '?tab=suppliers'), '/(admin)/finance?tab=suppliers');
});

test('kök yol grubun kendisi olur', () => {
  assert.equal(groupHref('(admin)', '/', ''), '/(admin)');
  assert.equal(groupHref('(lab)', '', ''), '/(lab)');
});

test('dinamik segmentli detay yolu aynen taşınır', () => {
  assert.equal(groupHref('(lab)', '/statement/abc-123', ''), '/(lab)/statement/abc-123');
});

test('soru işaretsiz sorgu düzeltilir, boş sorgu eklenmez', () => {
  assert.equal(groupHref('(clinic)', '/finance', 'tab=open'), '/(clinic)/finance?tab=open');
  assert.equal(groupHref('(clinic)', '/finance', '?'), '/(clinic)/finance');
});

test('grup yoksa yalnız yol + sorgu', () => {
  assert.equal(groupHref('', '/order/9', '?x=1'), '/order/9?x=1');
});

test('yol zaten grupla başlıyorsa grup tekrar eklenmez', () => {
  assert.equal(groupHref('(admin)', '/(admin)/orders', ''), '/(admin)/orders');
});

test('genel adres yol + sorguya ayrılır', () => {
  assert.deepEqual(splitHref('/finance?tab=suppliers'), ['/finance', '?tab=suppliers']);
  assert.deepEqual(splitHref('/statement/abc'), ['/statement/abc', '']);
  assert.deepEqual(splitHref(''), ['/', '']);
});

test('geri dönüş kararı: hedef yoksa izle, kurulmadıysa bekle', () => {
  assert.equal(restoreStep(null, '/(admin)/finance', true), 'track');
  assert.equal(restoreStep('/(admin)/finance', '/(admin)', false), 'hold');
});

test('geri dönüş kararı: adres sıfırlandıysa dön, aynıysa yerleşmesini bekle', () => {
  assert.equal(restoreStep('/(admin)/statement/x', '/(admin)', true), 'replace');
  assert.equal(restoreStep('/(admin)/statement/x', '/(admin)/statement/x', true), 'settle');
});
