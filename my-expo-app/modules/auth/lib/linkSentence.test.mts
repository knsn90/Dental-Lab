// node --test my-expo-app/modules/auth/lib/linkSentence.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitLinkSentence } from './linkSentence.ts';

test('bağlantı başta (Türkçe ek, Farsça)', () => {
  assert.deepEqual(splitLinkSentence('{link}’nı kabul ediyorum.'), ['', '’nı kabul ediyorum.']);
  assert.deepEqual(splitLinkSentence('{link} را می‌پذیرم.'), ['', ' را می‌پذیرم.']);
});

test('bağlantı ortada (İngilizce/Almanca söz dizimi)', () => {
  assert.deepEqual(
    splitLinkSentence('I have read the {link} and consent to the processing of my personal data.'),
    ['I have read the ', ' and consent to the processing of my personal data.'],
  );
});

test('yer tutucu yoksa cümle bağlantıdan sonra gelir', () => {
  assert.deepEqual(splitLinkSentence('kabul ediyorum.'), ['', ' kabul ediyorum.']);
});
