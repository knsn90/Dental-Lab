import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogKey, cleanCatalogName, findByKey, suggestSimilar, filterByQuery, brandWithModel } from './implantCatalogModel.ts';

test('catalogKey: harf/TR/noktalama farkını yok sayar', () => {
  assert.equal(catalogKey('STRAUMANN'), 'straumann');
  assert.equal(catalogKey('Yeni-Marka'), catalogKey('  yeni   MARKA '));
  assert.equal(catalogKey('İmplad'), 'implad');
  assert.equal(catalogKey('Sweden & Martina'), 'swedenmartina');
  assert.equal(catalogKey(''), '');
});

test('cleanCatalogName boşlukları sadeleştirir', () => {
  assert.equal(cleanCatalogName('  yeni   MARKA '), 'yeni MARKA');
});

test('findByKey birebir anahtar eşleşmesi', () => {
  const list = [{ name: 'Straumann' }, { name: 'Nobel Biocare' }];
  assert.equal(findByKey(list, 'straumann')?.name, 'Straumann');
  assert.equal(findByKey(list, 'nobel-biocare')?.name, 'Nobel Biocare');
  assert.equal(findByKey(list, 'Osstem'), undefined);
});

test('suggestSimilar: yazım hatası ve önek', () => {
  const names = ['Straumann', 'Nobel Biocare', 'Osstem', 'Megagen'];
  assert.equal(suggestSimilar(names, 'Straumman'), 'Straumann');
  assert.equal(suggestSimilar(names, 'strauman'), 'Straumann');
  assert.equal(suggestSimilar(names, 'Osstemm'), 'Osstem');
  assert.equal(suggestSimilar(names, 'Nobel'), 'Nobel Biocare');
});

test('suggestSimilar: birebir eşleşmede ve alakasız adda öneri yok', () => {
  const names = ['Straumann', 'Osstem'];
  assert.equal(suggestSimilar(names, 'STRAUMANN'), null);
  assert.equal(suggestSimilar(names, 'Tamamen Yeni'), null);
  assert.equal(suggestSimilar(names, 'ab'), null);
});

test('filterByQuery anahtar üzerinden süzer', () => {
  assert.deepEqual(filterByQuery(['Nobel Biocare', 'Osstem'], 'nobelbio'), ['Nobel Biocare']);
  assert.deepEqual(filterByQuery(['A', 'B'], ''), ['A', 'B']);
});

test('brandWithModel', () => {
  assert.equal(brandWithModel('Straumann', 'BLX'), 'Straumann BLX');
  assert.equal(brandWithModel('Straumann', ''), 'Straumann');
  assert.equal(brandWithModel('', ''), '');
});
