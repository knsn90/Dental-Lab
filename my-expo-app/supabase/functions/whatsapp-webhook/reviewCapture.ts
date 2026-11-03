// whatsapp-webhook/reviewCapture.ts
//
// WhatsApp puan isteğine gelen düğme cevabını ve hemen ardından yazılan notu
// sohbet botu kapısından ÖNCE yakalar (spec: docs/superpowers/specs/
// 2026-11-03-whatsapp-puan-istegi-design.md). Bot kapalı lab'da da çalışır;
// yakalanmayan her mesaj bugünkü yoldan (bot / insan devri) devam eder.
//
// Kararlar DB'de: review_wa_record_answer (eşleşme, puan, lab'a haber) ve
// review_wa_add_note (24 saatlik not penceresi). Burada yalnız yönlendirme var.

import { classifyInbound, doctorReplyFor } from '../_shared/reviewRequest.ts';

export interface ReviewCaptureCtx {
  labId: string;
  botOn: boolean;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<any>;   // PostgREST /rpc, servis rolü
  sendText: (to: string, body: string) => Promise<string | null>;     // wamid
  logMessage: (row: {
    peer: string; direction: 'in' | 'out'; body: string | null; wamid: string | null; source: 'customer' | 'bot';
  }) => Promise<void>;
}

function inboundBody(msg: any): string | null {
  if (msg?.type === 'button') return msg?.button?.text ?? null;
  if (msg?.type === 'interactive') return msg?.interactive?.button_reply?.title ?? null;
  if (msg?.type === 'text') return msg?.text?.body ?? null;
  return null;
}

export async function captureReviewMessages(messages: any[], ctx: ReviewCaptureCtx): Promise<Set<any>> {
  const captured = new Set<any>();
  for (const msg of messages) {
    try {
      const c = classifyInbound(msg);
      const from = String(msg?.from ?? '');

      if (c.kind === 'review_invalid') { captured.add(msg); continue; }

      if (c.kind === 'review_button') {
        const r = await ctx.rpc('review_wa_record_answer', {
          p_request: c.requestId, p_score: c.score, p_from: from, p_lab: ctx.labId,
        });
        captured.add(msg);
        if (ctx.botOn) {
          await ctx.logMessage({ peer: from, direction: 'in', body: inboundBody(msg), wamid: msg?.id ?? null, source: 'customer' });
        }
        if (!r?.ok) continue;
        const reply = doctorReplyFor(c.score, String(r?.lab_name ?? ''));
        const wamid = await ctx.sendText(from, reply);
        if (ctx.botOn) {
          await ctx.logMessage({ peer: from, direction: 'out', body: reply, wamid, source: 'bot' });
        }
        continue;
      }

      if (c.kind === 'text') {
        const r = await ctx.rpc('review_wa_add_note', { p_from: from, p_lab: ctx.labId, p_text: c.text });
        if (!r?.ok) continue;
        captured.add(msg);
        if (ctx.botOn) {
          await ctx.logMessage({ peer: from, direction: 'in', body: inboundBody(msg), wamid: msg?.id ?? null, source: 'customer' });
        }
      }
    } catch (e) {
      console.error('[wa] review capture err:', String(e));
      captured.delete(msg);
    }
  }
  return captured;
}
