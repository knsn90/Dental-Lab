import test from 'node:test';
import assert from 'node:assert/strict';
import { maskRoute } from './maskRoute.ts';

test('maskRoute — jetonlu public rotalar maskelenir', () => {
  assert.equal(maskRoute('/s/Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWo'), '/s/:token');
  assert.equal(maskRoute('/s/abc/extra'), '/s/:token');
  assert.equal(maskRoute('/doctor-approval/tok-123'), '/doctor-approval/:token');
  assert.equal(maskRoute('/doctor-approval/tok/x'), '/doctor-approval/:token');
});

test('maskRoute — diğer rotalar aynen', () => {
  assert.equal(maskRoute('/statement/123'), '/statement/123');
  assert.equal(maskRoute('/s'), '/s');
  assert.equal(maskRoute('/settings/x'), '/settings/x');
  assert.equal(maskRoute('/doctor-approvals/x'), '/doctor-approvals/x');
  assert.equal(maskRoute(null), null);
  assert.equal(maskRoute(''), '');
});
