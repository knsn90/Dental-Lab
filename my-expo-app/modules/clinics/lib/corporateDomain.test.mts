import { test } from 'node:test';
import assert from 'node:assert/strict';

import { corporateDomainOf } from './corporateDomain';

test('kurumsal e-posta alan adı', () => {
  assert.equal(corporateDomainOf('info@allianoi.com'), 'allianoi.com');
  assert.equal(corporateDomainOf(' Info@Turkuazdent.NET '), 'turkuazdent.net');
});
test('ücretsiz posta / boş → null', () => {
  for (const e of ['a@gmail.com', 'b@hotmail.com.tr', 'c@yahoo.com', 'd@icloud.com', '', null, 'bozuk'])
    assert.equal(corporateDomainOf(e as any), null);
});
