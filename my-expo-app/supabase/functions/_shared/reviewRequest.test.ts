// node --test my-expo-app/supabase/functions/_shared/reviewRequest.test.ts
// WhatsApp puan isteği: düğme yükü, gelen mesaj sınıflandırma, hekime yanıt, şablon gövdesi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reviewButtonPayload, parseReviewPayload, classifyInbound, doctorReplyFor,
  workTypeLabel, normalizePhoneTR, buildReviewTemplateMessage,
} from './reviewRequest.ts';

const ID = '3f2b8c1e-7d4a-4f6b-9a2c-1e5d7f9b0a3c';

test('düğme yükü üç puan için gidiş-dönüş', () => {
  for (const s of [5, 3, 1] as const) {
    const p = reviewButtonPayload(ID, s);
    assert.equal(p, `review:${ID}:${s}`);
    assert.deepEqual(parseReviewPayload(p), { requestId: ID, score: s });
  }
});

test('geçersiz yük null döner', () => {
  assert.equal(parseReviewPayload('review:abc:5'), null);
  assert.equal(parseReviewPayload(`review:${ID}:4`), null);
  assert.equal(parseReviewPayload(`review:${ID}:5:x`), null);
  assert.equal(parseReviewPayload(null), null);
  assert.equal(parseReviewPayload(42), null);
});

test('gelen düğme cevabı review_button', () => {
  assert.deepEqual(classifyInbound({ type: 'button', button: { payload: `review:${ID}:1` } }),
    { kind: 'review_button', requestId: ID, score: 1 });
  assert.deepEqual(classifyInbound({ type: 'interactive', interactive: { button_reply: { id: `review:${ID}:3` } } }),
    { kind: 'review_button', requestId: ID, score: 3 });
});

test('review: önekli bozuk yük review_invalid, başka düğme other', () => {
  assert.deepEqual(classifyInbound({ type: 'button', button: { payload: 'review:x' } }), { kind: 'review_invalid' });
  assert.deepEqual(classifyInbound({ type: 'button', button: { payload: 'menu' } }), { kind: 'other' });
});

test('metin mesajı kırpılır; boş metin ve görsel other', () => {
  assert.deepEqual(classifyInbound({ type: 'text', text: { body: '  diş uymadı ' } }), { kind: 'text', text: 'diş uymadı' });
  assert.deepEqual(classifyInbound({ type: 'text', text: { body: '  ' } }), { kind: 'other' });
  assert.deepEqual(classifyInbound({ type: 'image' }), { kind: 'other' });
  assert.deepEqual(classifyInbound(null), { kind: 'other' });
});

test('hekime yanıt metinleri (spec §10)', () => {
  assert.equal(doctorReplyFor(5, 'Nexadent'), 'Teşekkür ederiz. Cevabınızı Nexadent ekibine ilettik.');
  assert.equal(doctorReplyFor(1, 'Nexadent'),
    'Teşekkür ederiz, cevabınızı Nexadent ekibine ilettik. Ekip sizinle iletişime geçecek. İsterseniz sorunu kısaca bu mesaja yazın; siparişe eklenir.');
  assert.equal(doctorReplyFor(3, 'Nexadent'), doctorReplyFor(1, 'Nexadent'));
  assert.ok(doctorReplyFor(3, '').includes('laboratuvar ekibine'));
  assert.ok(doctorReplyFor(5, '   ').includes('laboratuvar ekibine'));
});

test('iş türü etiketi tekilleşir, 60 karakterde kesilir', () => {
  assert.equal(workTypeLabel('Zirkonya Kron, Zirkonya Kron, Zirkonya Kron'), 'Zirkonya Kron');
  assert.equal(workTypeLabel('Zirkonya,  E-max , Zirkonya'), 'Zirkonya, E-max');
  const long = workTypeLabel('x'.repeat(80));
  assert.equal(long, 'x'.repeat(60) + '…');
  assert.equal(workTypeLabel(null), '—');
  assert.equal(workTypeLabel(' , '), '—');
});

test('telefon Meta biçimine çevrilir', () => {
  assert.equal(normalizePhoneTR('0535 524 48 59'), '905355244859');
  assert.equal(normalizePhoneTR('5355244859'), '905355244859');
  assert.equal(normalizePhoneTR('+90 535 524 48 59'), '905355244859');
  assert.equal(normalizePhoneTR(''), '');
  assert.equal(normalizePhoneTR(null), '');
});

test('şablon gövdesi: ad, değişkenler, düğme sırası', () => {
  const m: any = buildReviewTemplateMessage({ to: '905355244859', requestId: ID, patient: null,
    orderNumber: 'NX-1042', workType: 'Zirkonya Kron, Zirkonya Kron' });
  assert.equal(m.messaging_product, 'whatsapp');
  assert.equal(m.to, '905355244859');
  assert.equal(m.type, 'template');
  assert.equal(m.template.name, 'is_degerlendirme');
  assert.equal(m.template.language.code, 'tr');
  const body = m.template.components.find((c: any) => c.type === 'body');
  assert.deepEqual(body.parameters.map((p: any) => p.parameter_name), ['hasta_adi', 'siparis_no', 'is_turu']);
  assert.deepEqual(body.parameters.map((p: any) => p.text), ['—', 'NX-1042', 'Zirkonya Kron']);
  const buttons = m.template.components.filter((c: any) => c.type === 'button');
  assert.deepEqual(buttons.map((b: any) => [b.sub_type, b.index]), [['quick_reply', '0'], ['quick_reply', '1'], ['quick_reply', '2']]);
  assert.deepEqual(buttons.map((b: any) => b.parameters[0].payload),
    [`review:${ID}:5`, `review:${ID}:3`, `review:${ID}:1`]);
});

test('şablon değişkeni sekme/yeni satır taşımaz, 200 karakterde kesilir', () => {
  const m: any = buildReviewTemplateMessage({ to: '90', requestId: ID, patient: 'Ali\tVeli\n  Can',
    orderNumber: 'A'.repeat(250), workType: '' });
  const p = m.template.components[0].parameters;
  assert.equal(p[0].text, 'Ali Veli Can');
  assert.equal(p[1].text.length, 200);
  assert.equal(p[2].text, '—');
});
