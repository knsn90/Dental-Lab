import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canApprove, canLabWrite, invoiceHasOpenDispute, approvalPayload, undisputedCount,
  disputeLabel, preStatementErrorText, summarizeApproval, invoiceDisputeStatus,
} from './preStatement.ts';

const inv = (id: string, statuses: (string | null)[], updated_at = '2026-11-09T10:00:00+00:00') => ({
  id, subtotal: 0, tax: 0, invoice_number: null, currency: 'TRY', issue_date: null,
  created_at: updated_at, updated_at, total: 0,
  items: statuses.map((s, n) => ({
    id: id + n, description: null, quantity: 1, unit_price: 0, total: 0, gross_total: 0,
    order_no: null, patient_initials: null, doctor_name: null, dispute_status: s, notes: [],
  })),
}) as any;

test('canApprove', () => {
  assert.equal(canApprove('approver', true), true);
  assert.equal(canApprove('viewer', true), false);
  assert.equal(canApprove('approver', false), false);
  assert.equal(canApprove(null, true), false);
  assert.equal(canApprove('lab', true), false);
});

test('canLabWrite', () => {
  assert.equal(canLabWrite('lab', true), true);
  assert.equal(canLabWrite('lab', false), false);
  assert.equal(canLabWrite('approver', true), false);
  assert.equal(canLabWrite(null, true), false);
});

test('invoiceHasOpenDispute', () => {
  assert.equal(invoiceHasOpenDispute(inv('a', [null, 'acik'])), true);
  assert.equal(invoiceHasOpenDispute(inv('a', ['yanitlandi'])), true);
  assert.equal(invoiceHasOpenDispute(inv('a', ['cozuldu', null])), false);
  assert.equal(invoiceHasOpenDispute(inv('a', [])), false);
});

test('approvalPayload keeps id and updated_at', () => {
  const p = approvalPayload([inv('x', [], '2026-11-09T10:00:00.123456+00:00')]);
  assert.deepEqual(p, [{ id: 'x', updated_at: '2026-11-09T10:00:00.123456+00:00' }]);
});

test('approvalPayload preserves microsecond timestamp byte-for-byte', () => {
  const ts = '2026-11-09T07:12:45.987654+00:00';
  const out = approvalPayload([inv('x', [], ts)])[0].updated_at;
  assert.equal(out, ts);
  assert.equal(JSON.stringify(approvalPayload([inv('x', [], ts)])), `[{"id":"x","updated_at":"${ts}"}]`);
});

test('undisputedCount', () => {
  assert.equal(undisputedCount([inv('a', ['acik']), inv('b', ['cozuldu']), inv('c', [])]), 2);
  assert.equal(undisputedCount([inv('a', ['acik'])]), 0);
});

test('disputeLabel', () => {
  assert.equal(disputeLabel('acik'), 'İtiraz');
  assert.equal(disputeLabel('yanitlandi'), 'Yanıtlandı');
  assert.equal(disputeLabel('cozuldu'), 'Çözüldü');
});

test('preStatementErrorText', () => {
  assert.equal(preStatementErrorText('error: PS_REASON_REQUIRED (x)'), 'Gerekçe zorunlu');
  assert.equal(preStatementErrorText('PS_SCOPE'), 'Bu ekstreye erişiminiz yok');
  assert.equal(preStatementErrorText('PS_NOT_DRAFT'), 'Bu kalemin faturası kesinleşmiş');
  assert.equal(preStatementErrorText('PS_BODY'), 'Not 1–2000 karakter olmalı');
  assert.equal(preStatementErrorText('PS_DISABLED'), 'Lab bu ayarı kapattı');
  assert.equal(preStatementErrorText('PS_MODE'), 'Geçersiz onay türü');
  assert.equal(preStatementErrorText('PS_EMPTY'), 'Onaylanacak fatura seçilmedi');
  assert.match(preStatementErrorText('INV_APPROVAL_REQUIRED')!, /Klinik adına onay kaydet/);
  assert.equal(preStatementErrorText('something else'), null);
  assert.equal(preStatementErrorText(''), null);
});

test('summarizeApproval', () => {
  const r = {
    approval_id: null,
    issued: [{ invoice_id: 'a', invoice_number: null, currency: 'TRY', total: 1 }],
    skipped: [
      { invoice_id: 'b', reason: 'changed' as const },
      { invoice_id: 'c', reason: 'disputed' as const },
      { invoice_id: 'd', reason: 'disputed' as const },
    ],
  };
  assert.deepEqual(summarizeApproval(r), { issued: 1, changed: 1, disputed: 2 });
  assert.deepEqual(summarizeApproval({ approval_id: null, issued: [], skipped: [] }), { issued: 0, changed: 0, disputed: 0 });
});

test('invoiceDisputeStatus — fatura rozeti en güçlü açık durumu gösterir', () => {
  assert.equal(invoiceDisputeStatus(inv('a', ['yanitlandi', 'acik', null])), 'acik');
  assert.equal(invoiceDisputeStatus(inv('b', ['yanitlandi', 'cozuldu'])), 'yanitlandi');
  assert.equal(invoiceDisputeStatus(inv('c', ['cozuldu', null])), null);
  assert.equal(invoiceDisputeStatus(inv('d', [])), null);
  assert.equal(invoiceDisputeStatus({ items: undefined } as any), null);
});
