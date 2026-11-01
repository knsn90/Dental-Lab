// node --test modules/invoices/lib/statementRevision.test.mts — ekstrede revizyon faturası notu
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revisionDetail } from './statementRevision.ts';

test('revizyon değilse not yok', () => {
  assert.equal(revisionDetail({ revisionOf: null, revisionResponsible: null }, 100), null);
});

test('lab kaynaklı, tutarsız revizyon: asıl sipariş + ücretsiz', () => {
  assert.equal(
    revisionDetail({ revisionOf: 'NEX-2026-0192', revisionResponsible: 'lab' }, 0),
    'Asıl sipariş NEX-2026-0192 · Lab kaynaklı, ücretsiz',
  );
});

test('lab kaynaklı ama tutarlı revizyon: ücretsiz yazılmaz', () => {
  assert.equal(
    revisionDetail({ revisionOf: 'NEX-2026-0192', revisionResponsible: 'lab' }, 50),
    'Asıl sipariş NEX-2026-0192 · Lab kaynaklı',
  );
});

test('hekim kaynaklı revizyon', () => {
  assert.equal(
    revisionDetail({ revisionOf: 'NEX-2026-0192', revisionResponsible: 'client' }, 120),
    'Asıl sipariş NEX-2026-0192 · Hekim kaynaklı',
  );
});

test('çeviri işlevi metin parçalarına uygulanır, sipariş no çevrilmez', () => {
  const tr = (s: string) => `[${s}]`;
  assert.equal(
    revisionDetail({ revisionOf: 'NEX-2026-0192', revisionResponsible: 'lab' }, 0, tr),
    '[Asıl sipariş] NEX-2026-0192 · [Lab kaynaklı, ücretsiz]',
  );
});
