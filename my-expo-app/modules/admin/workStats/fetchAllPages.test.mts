// node --test modules/admin/workStats/fetchAllPages.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllPages } from './fetchAllPages.ts';

function source(total: number) {
  const calls: Array<[number, number]> = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    const data: number[] = [];
    for (let i = from; i <= Math.min(to, total - 1); i++) data.push(i);
    return { data, error: null };
  };
  return { page, calls };
}

test('2500 öğe, size 1000 → 3 çağrı', async () => {
  const { page, calls } = source(2500);
  const out = await fetchAllPages(page, 1000);
  assert.equal(out.length, 2500);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1], [1000, 1999]);
});

test('tam 2000 öğe → 3 çağrı (son boş sayfa)', async () => {
  const { page, calls } = source(2000);
  const out = await fetchAllPages(page, 1000);
  assert.equal(out.length, 2000);
  assert.equal(calls.length, 3);
});

test('ikinci sayfada hata → reject', async () => {
  let n = 0;
  await assert.rejects(fetchAllPages(async () => {
    n++;
    return n === 2 ? { data: null, error: new Error('boom') } : { data: new Array(1000).fill(1), error: null };
  }, 1000), /boom/);
});

test('data null (hatasız) → boş sayfa gibi durur', async () => {
  assert.deepEqual(await fetchAllPages(async () => ({ data: null, error: null })), []);
});
