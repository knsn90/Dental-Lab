// node --test my-expo-app/modules/delivery/proof/proofModel.test.mts   (.mts → tsc kapsamı dışında)
// Kurye teslim kanıtının saf modeli: hangi teslimde ne istenir, ipucu, "Tara" seçimi, siparişteki kanıt türü.
// Kurallar spec 4.1–4.4 (docs/superpowers/specs/2026-10-27-kurye-teslim-kaniti-design.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateProof, needsSignature, pickOpenDelivery, proofKindOf, overrideReasonOk, proofPath,
  proofErrorText, pruneSiblings, SIBLINGS_CHANGED_TEXT,
  SKIP_REASONS, OTHER_REASON, OVERRIDE_MIN_LEN, type ProofDraft,
} from './proofModel.ts';

const EMPTY: ProofDraft = { hasPhoto: false, recipientName: '', hasSignature: false, skip: false, reason: null, otherText: '' };

test('kliniğe teslim: boş taslakta önce fotoğraf istenir, üç adımın hiçbiri tamam değil', () => {
  const r = evaluateProof(EMPTY, 'lab_to_clinic');
  assert.equal(r.ok, false);
  assert.equal(r.hint, 'Önce fotoğraf çekin');
  assert.deepEqual(r.steps, [false, false, false]);
});

test('kliniğe teslim: fotoğraf + ad varken imza yoksa imza istenir; tek harflik ad yetmez', () => {
  assert.equal(evaluateProof({ ...EMPTY, hasPhoto: true, recipientName: 'Ay' }, 'lab_to_clinic').hint,
    'İmza alın ya da "İmza alınamadı"yı açın');
  assert.equal(evaluateProof({ ...EMPTY, hasPhoto: true, recipientName: 'A' }, 'lab_to_clinic').hint,
    'Teslim alanın adını yazın');
});

test('kliniğe teslim: fotoğraf + ad + imza → tamam; ad kırpılır, neden yok', () => {
  const r = evaluateProof({ ...EMPTY, hasPhoto: true, recipientName: '  Ayşe Y. ', hasSignature: true }, 'lab_to_clinic');
  assert.equal(r.ok, true);
  assert.equal(r.hint, null);
  assert.equal(r.recipientName, 'Ayşe Y.');
  assert.equal(r.skipReason, null);
  assert.deepEqual(r.steps, [true, true, true]);
});

test('imza alınamadı: neden seçilmeden olmaz; "Diğer" kısa notla olmaz, notla olur ve ad isteğe bağlıdır', () => {
  const base = { ...EMPTY, hasPhoto: true, skip: true };
  assert.equal(evaluateProof(base, 'lab_to_clinic').hint, 'İmzanın neden alınamadığını seçin');
  assert.equal(evaluateProof({ ...base, reason: OTHER_REASON, otherText: 'ab' }, 'lab_to_clinic').ok, false);
  const r = evaluateProof({ ...base, reason: OTHER_REASON, otherText: ' kapı kilitli ' }, 'lab_to_clinic');
  assert.equal(r.ok, true);
  assert.equal(r.skipReason, 'kapı kilitli');
  assert.equal(r.recipientName, null);
  const p = evaluateProof({ ...base, reason: 'Resepsiyonda kimse yoktu' }, 'lab_to_clinic');
  assert.equal(p.ok, true);
  assert.equal(p.skipReason, 'Resepsiyonda kimse yoktu');
  assert.deepEqual(p.steps, [true, true, true]);
});

test("lab'a ve dış taraflara teslim: yalnız fotoğraf, tek adım", () => {
  for (const dir of ['clinic_to_lab', 'lab_to_other', 'other_to_lab']) {
    assert.equal(evaluateProof(EMPTY, dir).hint, 'Önce fotoğraf çekin');
    const r = evaluateProof({ ...EMPTY, hasPhoto: true }, dir);
    assert.equal(r.ok, true, dir);
    assert.equal(r.steps.length, 1);
    assert.equal(r.recipientName, null);
  }
});

test('needsSignature: yön yoksa kliniğe teslim sayılır (DB coalesce kuralı)', () => {
  assert.equal(needsSignature(null), true);
  assert.equal(needsSignature(undefined), true);
  assert.equal(needsSignature('lab_to_clinic'), true);
  assert.equal(needsSignature('lab_to_other'), false);
  assert.equal(needsSignature('clinic_to_lab'), false);
});

test('nedenler sabit sırada; kanıtsız kapatma en az 6 karakter', () => {
  assert.deepEqual([...SKIP_REASONS], ['Resepsiyonda kimse yoktu', 'İmzalamak istemedi', 'Paket kapıya bırakıldı', 'Diğer']);
  assert.equal(OVERRIDE_MIN_LEN, 6);
  assert.equal(overrideReasonOk('  12345 '), false);
  assert.equal(overrideReasonOk('123456'), true);
});

test('pickOpenDelivery: önce yolda, sonra aldı, sonra atandı; aynı durumda en eski; kapalılar yok sayılır', () => {
  assert.equal(pickOpenDelivery([
    { id: 'a', status: 'atandi', created_at: '2026-10-01T08:00:00Z' },
    { id: 'b', status: 'yolda', created_at: '2026-10-02T08:00:00Z' },
    { id: 'c', status: 'teslim_edildi', created_at: '2026-09-01T08:00:00Z' },
  ]), 'b');
  assert.equal(pickOpenDelivery([
    { id: 'x', status: 'atandi', created_at: '2026-10-03T08:00:00Z' },
    { id: 'y', status: 'beklemede', created_at: '2026-10-01T08:00:00Z' },
  ]), 'y');
  assert.equal(pickOpenDelivery([
    { id: 'p', status: 'atandi', created_at: '2026-10-03T08:00:00Z' },
    { id: 'q', status: 'teslim_alindi', created_at: '2026-10-05T08:00:00Z' },
  ]), 'q');
  assert.equal(pickOpenDelivery([
    { id: 'z', status: 'iptal', created_at: '2026-10-01T08:00:00Z' },
    { id: 'w', status: 'teslim_edildi', created_at: '2026-10-01T08:00:00Z' },
  ]), null);
  assert.equal(pickOpenDelivery([]), null);
});

test('proofKindOf: teslim edilmeyende yok; kaynağa ve nedene göre tür', () => {
  assert.equal(proofKindOf({ status: 'yolda' }), 'none');
  assert.equal(proofKindOf({ status: 'teslim_edildi', proof_source: 'manager_override' }), 'override');
  assert.equal(proofKindOf({ status: 'teslim_edildi', proof_source: 'courier', signature_skipped_reason: 'x' }), 'nosig');
  assert.equal(proofKindOf({ status: 'teslim_edildi', proof_source: 'courier' }), 'courier');
  assert.equal(proofKindOf({ status: 'teslim_edildi', proof_source: 'provider' }), 'provider');
  assert.equal(proofKindOf({ status: 'teslim_edildi', mode: 'external', provider_proof_checked_at: '2026-10-28T10:00:00Z' }), 'provider_empty');
  assert.equal(proofKindOf({ status: 'teslim_edildi', mode: 'external' }), 'none');
  assert.equal(proofKindOf({ status: 'teslim_edildi', mode: 'internal' }), 'none');
});

test('proofPath: <lab>/<teslimat>/<tür>-<zaman>.<uzantı>', () => {
  assert.equal(proofPath('L', 'D', 'photo', 'jpg', 5), 'L/D/photo-5.jpg');
  assert.equal(proofPath('L', 'D', 'signature', 'png', 7), 'L/D/signature-7.png');
});

// Son inceleme (2026-10-28) — kardeş yarışı: kurye yeniden deneyebilmeli, ham İngilizce hata görmemeli.
test('proofErrorText: depolama RLS/403 → Türkçe; çok büyük dosya → Türkçe; ağ → Türkçe; sunucu Türkçesi aynen', () => {
  assert.equal(proofErrorText('new row violates row-level security policy'), 'Kanıt yüklenemedi: teslimat kapanmış ya da size atanmamış');
  assert.equal(proofErrorText('Unauthorized (403)'), 'Kanıt yüklenemedi: teslimat kapanmış ya da size atanmamış');
  assert.equal(proofErrorText('The object exceeded the maximum allowed size'), 'Fotoğraf çok büyük; yeniden çekin');
  assert.equal(proofErrorText('Payload too large'), 'Fotoğraf çok büyük; yeniden çekin');
  assert.equal(proofErrorText('TypeError: Failed to fetch'), 'Bağlantı yok; yeniden deneyin');
  assert.equal(proofErrorText('Network request failed'), 'Bağlantı yok; yeniden deneyin');
  assert.equal(proofErrorText('Teslimat kapanmış ya da iptal edilmiş'), 'Teslimat kapanmış ya da iptal edilmiş');
  assert.equal(proofErrorText(''), 'Teslimat bulunamadı');
});

test('pruneSiblings: tazelenen listede olmayan kardeş düşer ve değişiklik bildirilir; aynıysa değişmez', () => {
  const prev = [{ delivery_id: 'a', order_number: '1' }, { delivery_id: 'b', order_number: '2' }];
  const r1 = pruneSiblings(prev, [{ delivery_id: 'a', order_number: '1' }]);
  assert.deepEqual(r1.next.map((x) => x.delivery_id), ['a']);
  assert.equal(r1.changed, true);
  const r2 = pruneSiblings(prev, [...prev]);
  assert.equal(r2.changed, false);
  assert.equal(r2.next.length, 2);
  const r3 = pruneSiblings(prev, [{ delivery_id: 'a', order_number: '1' }, { delivery_id: 'c', order_number: '3' }]);
  assert.deepEqual(r3.next.map((x) => x.delivery_id), ['a'], 'kurye seçmediği yeni teslimatı kendiliğinden eklemez');
  assert.equal(SIBLINGS_CHANGED_TEXT, 'Birlikte kapatılacak teslimatlardan biri kapandı; liste yenilendi, yeniden deneyin');
});
