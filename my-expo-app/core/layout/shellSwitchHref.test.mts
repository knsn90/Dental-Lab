// node --test core/layout/shellSwitchHref.test.mts — kabuk geçişinde (masaüstü ↔ mobil) geri dönülecek adres
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupHref, splitHref, restoreStep, panelNavigator } from './shellSwitchHref.ts';

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

test('navigator: profil yüklenirken mobilde hiçbiri, masaüstünde Slot', () => {
  assert.equal(panelNavigator(false, true), 'slot');
  assert.equal(panelNavigator(false, false), 'none');
  assert.equal(panelNavigator(false, null), 'none');
});

test('navigator: profil gelince kabuğa göre Slot / Tabs, geçiş karesinde hiçbiri', () => {
  assert.equal(panelNavigator(true, true), 'slot');
  assert.equal(panelNavigator(true, false), 'tabs');
  assert.equal(panelNavigator(true, null), 'none');
});

// Slot (yığın) → Tabs aynı karede değişirse yeni navigator eskisinin yığın durumunu
// devralır → TabRouter `state.history.filter` → "reading 'filter'" çökmesi. Profil
// HER karede gelebilir; kabuk ise true ↔ false arasında hep null'dan geçer (Y5 kancası).
test('navigator: Slot ile Tabs arasında hep boş kare var (profil ya da genişlik değişse de)', () => {
  const shells = [true, false, null] as const;
  for (const prevProfile of [false, true]) for (const prevShell of shells)
  for (const nextProfile of [false, true]) for (const nextShell of shells) {
    if (prevShell !== null && nextShell !== null && prevShell !== nextShell) continue;
    const pair = [panelNavigator(prevProfile, prevShell), panelNavigator(nextProfile, nextShell)].sort().join('→');
    assert.notEqual(pair, 'slot→tabs', `profil ${prevProfile}→${nextProfile}, kabuk ${prevShell}→${nextShell}`);
  }
});
