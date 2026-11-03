// node --test my-expo-app/supabase/functions/whatsapp-webhook/reviewCapture.test.ts
// Webhook: WhatsApp puan isteğine gelen düğme cevabı ve sonrasındaki not, sohbet
// botu kapısından ÖNCE yakalanır; ilgisiz mesajlar bugünkü yoldan devam eder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureReviewMessages, type ReviewCaptureCtx } from './reviewCapture.ts';
import { doctorReplyFor } from '../_shared/reviewRequest.ts';

const ID = '3f2b8c1e-7d4a-4f6b-9a2c-1e5d7f9b0a3c';
const LAB = 'lab-1';
const FROM = '905321112233';

function fakeCtx(opts: { botOn?: boolean; rpc?: (fn: string, args: any) => any } = {}) {
  const calls = { rpc: [] as any[], send: [] as any[], log: [] as any[] };
  const ctx: ReviewCaptureCtx = {
    labId: LAB,
    botOn: opts.botOn ?? false,
    rpc: async (fn, args) => {
      calls.rpc.push({ fn, args });
      return opts.rpc ? opts.rpc(fn, args) : { ok: true, score: args.p_score, lab_name: 'Nexadent', alert: null };
    },
    sendText: async (to, body) => { calls.send.push({ to, body }); return 'wamid.OUT1'; },
    logMessage: async (row) => { calls.log.push(row); },
  };
  return { ctx, calls };
}

const button = (score: number) => ({ id: 'wamid.IN1', from: FROM, type: 'button', button: { payload: `review:${ID}:${score}`, text: 'Sorun var' } });

test('düğme: rpc bir kez doğru argümanla, hekime yanıt, mesaj yakalandı', async () => {
  const { ctx, calls } = fakeCtx();
  const m = button(1);
  const captured = await captureReviewMessages([m], ctx);
  assert.equal(calls.rpc.length, 1);
  assert.deepEqual(calls.rpc[0], { fn: 'review_wa_record_answer', args: { p_request: ID, p_score: 1, p_from: FROM, p_lab: LAB } });
  assert.deepEqual(calls.send, [{ to: FROM, body: doctorReplyFor(1, 'Nexadent') }]);
  assert.ok(captured.has(m));
});

test('bot kapalıyken düğme: sohbet kaydı yok', async () => {
  const { ctx, calls } = fakeCtx({ botOn: false });
  await captureReviewMessages([button(5)], ctx);
  assert.equal(calls.log.length, 0);
});

test('bot açıkken gelen ve giden kaydedilir; giden wamid\'li ve bot kaynaklı', async () => {
  const { ctx, calls } = fakeCtx({ botOn: true });
  await captureReviewMessages([button(5)], ctx);
  assert.equal(calls.log.length, 2);
  const inRow = calls.log.find((r) => r.direction === 'in');
  const outRow = calls.log.find((r) => r.direction === 'out');
  assert.deepEqual(inRow, { peer: FROM, direction: 'in', body: 'Sorun var', wamid: 'wamid.IN1', source: 'customer' });
  assert.deepEqual(outRow, { peer: FROM, direction: 'out', body: doctorReplyFor(5, 'Nexadent'), wamid: 'wamid.OUT1', source: 'bot' });
});

test('eşleşmeyen yanıt: hekime yanıt yok, mesaj yine yakalandı', async () => {
  const { ctx, calls } = fakeCtx({ rpc: () => ({ ok: false, reason: 'mismatch' }) });
  const m = button(3);
  const captured = await captureReviewMessages([m], ctx);
  assert.equal(calls.send.length, 0);
  assert.ok(captured.has(m));
});

test('bozuk review: yükü yakalanır, rpc yok', async () => {
  const { ctx, calls } = fakeCtx();
  const m = { from: FROM, type: 'button', button: { payload: 'review:bozuk' } };
  const captured = await captureReviewMessages([m], ctx);
  assert.equal(calls.rpc.length, 0);
  assert.ok(captured.has(m));
});

test('not: ok → yakalandı, yanıt yok; ok:false → yakalanmadı', async () => {
  const t = { id: 'wamid.T1', from: FROM, type: 'text', text: { body: '  kenar uyumsuz ' } };
  const okCtx = fakeCtx({ rpc: () => ({ ok: true, work_order_id: 'wo-1' }) });
  const c1 = await captureReviewMessages([t], okCtx.ctx);
  assert.deepEqual(okCtx.calls.rpc[0], { fn: 'review_wa_add_note', args: { p_from: FROM, p_lab: LAB, p_text: 'kenar uyumsuz' } });
  assert.ok(c1.has(t));
  assert.equal(okCtx.calls.send.length, 0);

  const noCtx = fakeCtx({ rpc: () => ({ ok: false }) });
  const c2 = await captureReviewMessages([t], noCtx.ctx);
  assert.equal(c2.has(t), false);
});

test('bot açıkken yakalanan not gelen olarak kaydedilir', async () => {
  const t = { id: 'wamid.T2', from: FROM, type: 'text', text: { body: 'renk koyu' } };
  const { ctx, calls } = fakeCtx({ botOn: true, rpc: () => ({ ok: true }) });
  await captureReviewMessages([t], ctx);
  assert.deepEqual(calls.log, [{ peer: FROM, direction: 'in', body: 'renk koyu', wamid: 'wamid.T2', source: 'customer' }]);
});

test('other: görsel ve menu düğmesi → rpc yok, yakalanmaz', async () => {
  const { ctx, calls } = fakeCtx();
  const img = { from: FROM, type: 'image', image: { id: 'm1' } };
  const menu = { from: FROM, type: 'button', button: { payload: 'menu' } };
  const captured = await captureReviewMessages([img, menu], ctx);
  assert.equal(calls.rpc.length, 0);
  assert.equal(captured.size, 0);
});

test('hata: rpc fırlatırsa mesaj yakalanmaz, sonraki mesaj işlenir', async () => {
  let n = 0;
  const { ctx, calls } = fakeCtx({ rpc: () => { n++; if (n === 1) throw new Error('ağ'); return { ok: true, score: 5, lab_name: 'Nexadent' }; } });
  const a = button(1);
  const b = { ...button(5), id: 'wamid.IN2' };
  const captured = await captureReviewMessages([a, b], ctx);
  assert.equal(captured.has(a), false);
  assert.ok(captured.has(b));
  assert.equal(calls.rpc.length, 2);
});
