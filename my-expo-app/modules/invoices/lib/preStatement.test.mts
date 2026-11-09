import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canApprove, canLabWrite, invoiceHasOpenDispute, approvalPayload, undisputedCount,
  disputeLabel, preStatementErrorText, summarizeApproval, invoiceDisputeStatus, approvalBadgeText,
  buildStatementLinkUrl, linkOrigin, sendStatusText, sendStatusTone, channelDisabledReason,
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

test('approvalBadgeText — lab kaydı ayrı görünür (anti-hedef 2)', () => {
  const fmt = (iso: string) => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4);
  const tr = (s: string) => s;
  assert.equal(
    approvalBadgeText({ via: 'lab', reason: '05.11.2026 telefon görüşmesine göre', created_at: '2026-11-05T09:00:00+00:00' }, fmt, tr),
    'Lab tarafından kaydedildi · 05.11.2026 · 05.11.2026 telefon görüşmesine göre',
  );
  assert.equal(
    approvalBadgeText({ via: 'panel', reason: null, created_at: '2026-11-05T09:00:00+00:00' }, fmt, tr),
    'Klinik onayladı · 05.11.2026',
  );
});

test('approvalBadgeText — panel gerekçeyi göstermez, lab boş gerekçede sonda ayraç bırakmaz, tr uygulanır', () => {
  const fmt = () => '05.11.2026';
  assert.equal(approvalBadgeText({ via: 'panel', reason: 'x', created_at: '' }, fmt, (s) => s), 'Klinik onayladı · 05.11.2026');
  assert.equal(approvalBadgeText({ via: 'lab', reason: '  ', created_at: '' }, fmt, (s) => s), 'Lab tarafından kaydedildi · 05.11.2026');
  assert.equal(approvalBadgeText({ via: 'lab', reason: 'r', created_at: '' }, fmt, (s) => '[' + s + ']'), '[Lab tarafından kaydedildi] · 05.11.2026 · r');
  // bilinmeyen yol (ileride bağlantı/PDF) lab gibi GÖRÜNMEZ
  assert.equal(approvalBadgeText({ via: 'link', reason: null, created_at: '' }, fmt, (s) => s), 'Klinik onayladı · 05.11.2026');
});

test('preStatementErrorText — bağlantı kodları', () => {
  assert.equal(preStatementErrorText('PS_LINK_INVALID'), "Bu bağlantı artık geçerli değil. Lab'dan yeni bağlantı isteyin.");
  assert.equal(preStatementErrorText('ERROR: PS_NO_RECIPIENT'), 'Kliniğin onay verecek yönetici hesabı yok');
});

test('buildStatementLinkUrl', () => {
  const tok = 'AbC-_0123456789abcdefghijklmnopqrstuvwxyzAB';
  assert.equal(buildStatementLinkUrl(tok, 'https://siman.app'), `https://siman.app/s/${tok}`);
  // Sondaki eğik çizgi çift "//" üretmez
  assert.equal(buildStatementLinkUrl(tok, 'http://localhost:8081/'), `http://localhost:8081/s/${tok}`);
  assert.equal(buildStatementLinkUrl(tok, 'https://siman.app///'), `https://siman.app/s/${tok}`);
});

test('linkOrigin — yerel/önizleme alan adında canlı alan adı', () => {
  assert.equal(linkOrigin('localhost', 'http://localhost:8081'), 'https://siman.app');
  assert.equal(linkOrigin('127.0.0.1', 'http://127.0.0.1:8081'), 'https://siman.app');
  assert.equal(linkOrigin('my-app-git-x.vercel.app', 'https://my-app-git-x.vercel.app'), 'https://siman.app');
  assert.equal(linkOrigin('', ''), 'https://siman.app');
});

test('linkOrigin — gerçek alan adı korunur', () => {
  assert.equal(linkOrigin('siman.app', 'https://siman.app'), 'https://siman.app');
  assert.equal(linkOrigin('nexadent.net', 'https://nexadent.net'), 'https://nexadent.net');
  assert.equal(linkOrigin('vercel.app.example.com', 'https://vercel.app.example.com'), 'https://vercel.app.example.com');
});

test('sendStatusText: kanal durumu → okunur metin', () => {
  assert.equal(sendStatusText('queued', null), 'Gönderim sıraya alındı');
  assert.equal(sendStatusText('skipped_probe', null), 'Deneme modu: gönderilmedi');
  assert.equal(sendStatusText('skipped', 'NO_CONTACT'), 'Alıcının iletişim bilgisi yok');
  assert.equal(sendStatusText('skipped', 'EMAIL_OPTOUT'), 'Alıcının e-posta bildirimleri kapalı');
  assert.equal(sendStatusText('unavailable', 'WA_TEMPLATE'), 'WhatsApp şablonu onay bekliyor');
  assert.equal(sendStatusText('failed', 'NO_SECRET'), 'Gönderim ayarı eksik');
  assert.equal(sendStatusText('failed', 'HTTP_ERR'), 'Gönderilemedi');
  // bilinmeyen durum / hata: güvenli varsayılan, ham kod sızmaz
  assert.equal(sendStatusText('weird', 'X_Y'), 'Gönderilemedi');
  assert.equal(sendStatusText('skipped', null), 'Gönderilmedi');
  assert.equal(sendStatusText('unavailable', null), 'Kanal kullanılamıyor');
});

test('sendStatusTone', () => {
  assert.equal(sendStatusTone('queued'), 'success');
  assert.equal(sendStatusTone('skipped_probe'), 'neutral');
  assert.equal(sendStatusTone('skipped'), 'warning');
  assert.equal(sendStatusTone('unavailable'), 'warning');
  assert.equal(sendStatusTone('failed'), 'danger');
  assert.equal(sendStatusTone('???'), 'danger');
});

test('channelDisabledReason: alıcı bilgisi yoksa kanal pasif ve nedeni yazılı', () => {
  const ok = { has_recipient: true, recipient_name: 'x', has_email: true, email_optout: false, has_phone: true, whatsapp_available: true };
  assert.equal(channelDisabledReason('email', ok), null);
  assert.equal(channelDisabledReason('whatsapp', ok), null);
  assert.equal(channelDisabledReason('email', { ...ok, has_email: false }), 'Alıcının e-posta adresi yok');
  assert.equal(channelDisabledReason('email', { ...ok, email_optout: true }), 'Alıcının e-posta bildirimleri kapalı');
  assert.equal(channelDisabledReason('whatsapp', { ...ok, has_phone: false }), 'Alıcının telefon numarası yok');
  assert.equal(channelDisabledReason('whatsapp', { ...ok, whatsapp_available: false }), 'WhatsApp şablonu onay bekliyor');
  // telefon yoksa önce o söylenir
  assert.equal(channelDisabledReason('whatsapp', { ...ok, has_phone: false, whatsapp_available: false }), 'Alıcının telefon numarası yok');
  const none = { ...ok, has_recipient: false };
  assert.equal(channelDisabledReason('email', none), 'Kliniğin onay verecek yönetici hesabı yok');
  assert.equal(channelDisabledReason('whatsapp', none), 'Kliniğin onay verecek yönetici hesabı yok');
  assert.equal(channelDisabledReason('email', null), 'Alıcı bilgisi yükleniyor');
});

test('preStatementErrorText: PS_CHANNELS', () => {
  assert.equal(preStatementErrorText('PS_CHANNELS'), 'En az bir gönderim kanalı seçin');
});

test('preStatementErrorText: PS_RATE (sunucu soğuma süresi)', () => {
  assert.equal(preStatementErrorText('PS_RATE'),
    'Bu kliniğe az önce onay isteği gönderildi. Lütfen birkaç dakika sonra tekrar deneyin.');
});
