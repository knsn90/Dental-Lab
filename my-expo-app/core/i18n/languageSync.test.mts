// node --test my-expo-app/core/i18n/languageSync.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideLanguageSync } from './languageSync.ts';

test('hesapta dil var, cihazda bekleyen seçim yok → hesabın dili uygulanır', () => {
  assert.deepEqual(
    decideLanguageSync({ profileLang: 'tr', localLang: 'en', localExplicit: false, pending: false }),
    { action: 'apply', lang: 'tr' },
  );
});

test('hesaptaki dil zaten açıksa bir şey yapılmaz', () => {
  assert.deepEqual(
    decideLanguageSync({ profileLang: 'de', localLang: 'de', localExplicit: true, pending: false }),
    { action: 'none' },
  );
});

test('girişten önce seçilen dil (bekleyen) hesaptakini ezer ve hesaba yazılır', () => {
  assert.deepEqual(
    decideLanguageSync({ profileLang: 'tr', localLang: 'fa', localExplicit: true, pending: true }),
    { action: 'push', lang: 'fa' },
  );
});

test('bekleyen seçim hesaptakiyle aynıysa yalnız bekleme kaldırılır', () => {
  assert.deepEqual(
    decideLanguageSync({ profileLang: 'fa', localLang: 'fa', localExplicit: true, pending: true }),
    { action: 'clearPending' },
  );
});

test('hesapta dil yok, cihazda bilinçli seçim var → mevcut seçim hesaba taşınır', () => {
  assert.deepEqual(
    decideLanguageSync({ profileLang: null, localLang: 'fa', localExplicit: true, pending: false }),
    { action: 'push', lang: 'fa' },
  );
});

test('hesapta dil yok, cihaz dili yalnız tahmin (seçilmemiş) → hesaba yazılmaz', () => {
  assert.deepEqual(
    decideLanguageSync({ profileLang: null, localLang: 'en', localExplicit: false, pending: false }),
    { action: 'none' },
  );
});

test('desteklenmeyen değerler yok sayılır', () => {
  assert.deepEqual(
    decideLanguageSync({ profileLang: 'xx', localLang: 'en', localExplicit: false, pending: false }),
    { action: 'none' },
  );
  assert.deepEqual(
    decideLanguageSync({ profileLang: 'de', localLang: 'xx', localExplicit: true, pending: true }),
    { action: 'apply', lang: 'de' },
  );
});

test('cihazdaki seçim bu kullanıcının mı: sahibi aynı ya da eski kayıt (sahipsiz "1")', async () => {
  const { isOwnExplicitChoice } = await import('./languageSync.ts');
  assert.equal(isOwnExplicitChoice('user-a', 'user-a'), true);
  assert.equal(isOwnExplicitChoice('1', 'user-a'), true);        // bu sürümden önceki seçimler
  assert.equal(isOwnExplicitChoice('user-b', 'user-a'), false);  // ortak tablette başkasının seçimi
  assert.equal(isOwnExplicitChoice(null, 'user-a'), false);
});
