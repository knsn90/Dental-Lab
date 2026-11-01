// node --test my-expo-app/modules/auth/lib/signupHost.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signupHostFor } from './signupHost.ts';

test('lab alan adı sunucuya sorulur', () => {
  assert.equal(signupHostFor('www.nexadent.net', '', false), 'www.nexadent.net');
  assert.equal(signupHostFor('NexaDent.net', '', false), 'nexadent.net');
});

test('platform ve yerel adresler hiçbir lab\'a bağlanmaz', () => {
  assert.equal(signupHostFor('siman.app', '', false), null);
  assert.equal(signupHostFor('www.siman.app', '', false), null);
  assert.equal(signupHostFor('localhost', '', false), null);
  assert.equal(signupHostFor('127.0.0.1', '', false), null);
  assert.equal(signupHostFor('', '', false), null);
});

test('?signup_host yalnız geliştirmede geçerli', () => {
  assert.equal(signupHostFor('localhost', '?signup_host=www.nexadent.net', true), 'www.nexadent.net');
  assert.equal(signupHostFor('localhost', '?signup_host=www.nexadent.net', false), null);
  assert.equal(signupHostFor('siman.app', '?signup_host=evil.com', false), null);
});
