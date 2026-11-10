import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canApprove, canLabWrite, invoiceHasOpenDispute, approvalPayload, undisputedCount,
  disputeLabel, preStatementErrorText, summarizeApproval, invoiceDisputeStatus, approvalBadgeText,
  buildStatementLinkUrl, linkOrigin, sendStatusText, sendStatusTone, channelDisabledReason,
  filterPreStatement, groupItemsByDoctorOrder, workTypes, statementLinkStatusLine, linkApproveState,
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
  assert.equal(sendStatusText('unavailable', 'WA_TEMPLATE'), 'Laboratuvarın WhatsApp hattı bağlı değil');
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
  assert.equal(channelDisabledReason('whatsapp', { ...ok, whatsapp_available: false }), 'Laboratuvarın WhatsApp hattı bağlı değil');
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

// ─── Çok işli ekstre: süzme ve gruplama (plan 4 Task 7) ─────────────────

const mk = (id: string, total: number, rows: [string, string | null, string | null, string | null, number][]) => ({
  id, subtotal: total, tax: 0, invoice_number: null, currency: 'TRY', issue_date: null,
  created_at: 'x', updated_at: 'x', total,
  items: rows.map(([desc, ini, ord, doc, amt], n) => ({
    id: `${id}-${n}`, description: desc, quantity: 1, unit_price: amt, total: amt, gross_total: amt,
    order_no: ord, patient_initials: ini, doctor_name: doc, dispute_status: null, notes: [],
  })),
}) as any;

const sample = () => [
  mk('a', 600, [
    ['Zirkonya', 'A.Y.', 'S-100', 'Dr. Ali', 200],
    ['E-max', 'M.K.', 'S-101', 'Dr. Ali', 100],
    ['Zirkonya', 'İ.T.', 'S-102', 'Dr. Veli', 300],
  ]),
  mk('b', 50, [['Gece plağı', 'Z.Z.', 'S-200', null, 50]]),
];

test('filterPreStatement: metin hasta baş harfi ve sipariş no içinde, boş fatura düşer', () => {
  const r = filterPreStatement(sample(), { text: 'a.y' });
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].items.map((i: any) => i.order_no), ['S-100']);
  assert.equal(r[0].total, 600); // fatura toplamı değişmez
  assert.equal(filterPreStatement(sample(), { text: 's-20' }).length, 1);
  assert.equal(filterPreStatement(sample(), { text: 'yok-böyle' }).length, 0);
});

test('filterPreStatement: Türkçe İ/i eşleşir', () => {
  const r = filterPreStatement(sample(), { text: 'i.t' });
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].items.map((i: any) => i.order_no), ['S-102']);
  assert.equal(filterPreStatement(sample(), { text: 'İ.T' }).length, 1);
});

test('filterPreStatement: work açıklamayla tam eşleşir; boş süzme aynı listeyi döner', () => {
  const r = filterPreStatement(sample(), { work: 'Zirkonya' });
  assert.equal(r[0].items.length, 2);
  assert.equal(filterPreStatement(sample(), { work: 'Zirk' }).length, 0);
  const all = sample();
  assert.equal(filterPreStatement(all, { text: '  ', work: null }), all);
  const both = filterPreStatement(sample(), { text: 'a.y', work: 'E-max' });
  assert.equal(both.length, 0);
});

test('groupItemsByDoctorOrder: ara toplamlar kalem toplamına eşit, hekimsiz "—"', () => {
  const g = groupItemsByDoctorOrder(sample()[0]);
  assert.deepEqual(g.map(x => x.doctor), ['Dr. Ali', 'Dr. Veli']);
  assert.equal(g[0].orders.length, 2);
  assert.equal(g[0].subtotal, 300);
  assert.equal(g[0].orders[0].subtotal, 200);
  assert.equal(g.reduce((s, x) => s + x.subtotal, 0), 600);
  const g2 = groupItemsByDoctorOrder(sample()[1]);
  assert.equal(g2[0].doctor, '—');
  assert.equal(g2[0].orders[0].order_no, 'S-200');
  const noOrder = groupItemsByDoctorOrder(mk('c', 5, [['x', null, null, 'Dr. A', 5]]));
  assert.equal(noOrder[0].orders[0].order_no, '—');
});

test('workTypes: benzersiz ve sıralı', () => {
  assert.deepEqual(workTypes(sample()), ['E-max', 'Gece plağı', 'Zirkonya']);
});

test('filterPreStatement: I/ı/İ/i harf katlama (büyük I küçük i ile eşleşir)', () => {
  const x = [mk('k', 10, [['x', 'I.K.', 'SIP-100', 'Dr. A', 10], ['y', 'ı.z.', 'S-5', 'Dr. A', 0]])];
  assert.equal(filterPreStatement(x, { text: 'sip' })[0].items.length, 1);
  assert.equal(filterPreStatement(x, { text: 'i.k' })[0].items[0].patient_initials, 'I.K.');
  assert.equal(filterPreStatement(x, { text: 'ı.k' })[0].items.length, 1);
  assert.equal(filterPreStatement(x, { text: 'İ.Z' })[0].items[0].patient_initials, 'ı.z.');
  assert.equal(filterPreStatement(x, { text: 'ı' }).length, 1);
});

// ─── Bağlantı / gönderim durumu (plan 4 son düzeltme I2) ───────────────

const fd = (iso: string) => iso.slice(8, 10) + '.' + iso.slice(5, 7);
const tr = (x: string) => x;
const send = (status: string, error: string | null = null, channel = 'email', trigger = 'manual') => ({
  created_at: '2026-12-01T06:30:00+00:00', trigger, channel, status, error, period: '2026-11',
});
const link = (used = false) => ({
  created_at: '2026-11-09T10:00:00+00:00', expires_at: '2026-12-24T10:00:00+00:00', used, used_at: used ? '2026-11-10T10:00:00+00:00' : null,
});

test('statementLinkStatusLine: hiçbir şey yoksa "Gönderim yok"', () => {
  assert.deepEqual(statementLinkStatusLine(null, fd, tr), { text: 'Gönderim yok', tone: 'neutral' });
  assert.deepEqual(statementLinkStatusLine({ active_link: null, last_send: null }, fd, tr), { text: 'Gönderim yok', tone: 'neutral' });
});

test('statementLinkStatusLine: yalnız elle bağlantı (gönderim satırı yok)', () => {
  assert.deepEqual(statementLinkStatusLine({ active_link: link(), last_send: null }, fd, tr),
    { text: 'Etkin bağlantı · Son geçerlilik: 24.12', tone: 'neutral' });
});

test('statementLinkStatusLine: son gönderim + etkin bağlantı', () => {
  assert.deepEqual(statementLinkStatusLine({ active_link: link(), last_send: send('queued') }, fd, tr),
    { text: 'Son gönderim: 01.12 · E-posta: Gönderim sıraya alındı · Etkin bağlantı · Son geçerlilik: 24.12', tone: 'success' });
});

test('statementLinkStatusLine: başarısız / tercih kapalı gönderim mevcut metinle', () => {
  assert.deepEqual(statementLinkStatusLine({ active_link: null, last_send: send('failed', 'HTTP_ERR') }, fd, tr),
    { text: 'Son gönderim: 01.12 · E-posta: Gönderilemedi', tone: 'danger' });
  assert.deepEqual(statementLinkStatusLine({ active_link: null, last_send: send('skipped', 'EMAIL_OPTOUT') }, fd, tr),
    { text: 'Son gönderim: 01.12 · E-posta: Alıcının e-posta bildirimleri kapalı', tone: 'warning' });
  assert.deepEqual(statementLinkStatusLine({ active_link: null, last_send: send('unavailable', 'WA_TEMPLATE', 'whatsapp') }, fd, tr),
    { text: 'Son gönderim: 01.12 · WhatsApp: Laboratuvarın WhatsApp hattı bağlı değil', tone: 'warning' });
});

test('statementLinkStatusLine: ay sonu gönderimi ve kullanılmış bağlantı', () => {
  assert.deepEqual(statementLinkStatusLine({ active_link: link(true), last_send: send('queued', null, 'email', 'month_end') }, fd, tr),
    { text: 'Son gönderim: 01.12 · Ay sonu · E-posta: Gönderim sıraya alındı · Bağlantıyla onaylandı: 10.11', tone: 'success' });
});

test('statementLinkStatusLine: çeviri işlevi her parçaya uygulanır, ham kod sızmaz', () => {
  const up = (x: string) => `[${x}]`;
  assert.deepEqual(statementLinkStatusLine({ active_link: null, last_send: send('weird', 'X_Y', 'pigeon') }, fd, up),
    { text: '[Son gönderim]: 01.12 · [Kanal]: [Gönderilemedi]', tone: 'danger' });
});

// ─── Bağlantı sayfası onay durumu (plan 4 son düzeltme I3) ─────────────

test('linkApproveState: alıcı artık onaylayıcı değilse "blocked" (sayfa okunur, düğme yok)', () => {
  assert.equal(linkApproveState({ enabled: true, approved: false, can_approve: true }), 'approve');
  assert.equal(linkApproveState({ enabled: true, approved: false, can_approve: false }), 'blocked');
  assert.equal(linkApproveState({ enabled: true, approved: true, can_approve: false }), 'approved');
  assert.equal(linkApproveState({ enabled: false, approved: false, can_approve: false }), 'disabled');
  assert.equal(linkApproveState(null), 'disabled');
});
