// node --test my-expo-app/modules/auth/lib/signupConsents.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signupConsentMeta } from './signupConsents.ts';

test('form onayları metadata biçimine çevrilir', () => {
  const m = signupConsentMeta(
    { privacy_policy: true, terms: true, ai_processing: false, marketing_whatsapp: true, international_transfer: false },
    '2.0', 'Mozilla/5.0',
  );
  assert.deepEqual(m, {
    version: '2.0',
    ua: 'Mozilla/5.0',
    items: { privacy_policy: true, terms: true, ai_processing: false, marketing_whatsapp: true, international_transfer: false },
  });
});

test('onay yoksa metadata eklenmez', () => {
  assert.equal(signupConsentMeta(undefined, '2.0', 'x'), undefined);
});

test('boolean olmayan değer false sayılır, kullanıcı ajanı kısaltılır', () => {
  const m = signupConsentMeta({ terms: 'yes' as unknown as boolean }, '2.0', 'a'.repeat(900));
  assert.equal(m!.items.terms, false);
  assert.equal(m!.ua.length, 400);
});
