// supabase/functions/payments-callback/index.ts
//
// 3DS callback handler — provider tamamlandığında bu URL'i çağırır.
// HMAC/imza doğrulaması yapılır → confirm_payment_intent RPC tetiklenir.
//
// URL'in provider panelinde "callback URL" olarak set edilmesi gerekir:
//   https://<project-ref>.supabase.co/functions/v1/payments-callback
//
// GÜVENLIK (2026 remediation):
//   • İmza HAM gövde (req.text()) üzerinden doğrulanır; parse SONRA yapılır.
//   • Sabit-zamanlı karşılaştırma (timingSafeEqualStr).
//   • FAIL CLOSED: provider secret env yoksa VEYA imza eksik/yanlış → 401.
//     (Asla `return true` yok.)
//   • Idempotency: intent zaten 'paid' ise tekrar uygulanmaz (DB tarafı
//     confirm_payment_intent da 'paid' iken erken döner — çift koruma).
//
// Provider'a göre doğrulama farklıdır:
//   - PayTR: hash = base64(HMAC_SHA256(merchant_oid + merchant_salt + status +
//            total_amount, merchant_key))  → gövdedeki `hash` ile karşılaştırılır.
//   - iyzico / param / diğer: sağlayıcıya özel alan/algoritma KOD'dan kesin
//     çıkarılamadı → HAM gövde üzerinden HMAC-SHA256 (provider secret ile) genel
//     doğrulaması uygulanır. Aşağıdaki TODO'larda kesinleştirilmesi gereken
//     provider-özel ayrıntı açıkça işaretlidir. Her hâlükârda FAIL CLOSED.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { timingSafeEqualStr, hmacSha256Hex, hmacSha256Base64 } from '../_shared/security.ts';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── 1) HAM gövdeyi ÖNCE oku (imza tam bu bytes üzerinden doğrulanır) ──
  const rawBody = await req.text();
  const contentType = req.headers.get('content-type') ?? '';
  let body: Record<string, any>;
  try {
    if (contentType.includes('application/json')) {
      body = rawBody ? JSON.parse(rawBody) : {};
    } else {
      // form-urlencoded (PayTR vb.)
      body = Object.fromEntries(new URLSearchParams(rawBody).entries());
    }
  } catch {
    return new Response('bad body', { status: 400 });
  }

  // ── 2) provider_ref → intent eşleştir ──
  const providerRef = body.conversationId ?? body.merchant_oid ?? body.OrderId;
  if (!providerRef) {
    return new Response('missing provider_ref', { status: 400 });
  }

  const { data: intent } = await supabase
    .from('payment_intents')
    .select('id, lab_id, status, provider, provider_ref')
    .eq('provider_ref', providerRef)
    .maybeSingle();

  if (!intent) {
    return new Response('intent not found', { status: 404 });
  }

  // ── 3) Idempotency: zaten ödenmiş callback'i tekrar uygulama ──
  if ((intent as any).status === 'paid') {
    return new Response('OK', { status: 200 });
  }

  // ── 4) Provider'ı belirle (intent → yoksa lab'ın aktif payment sağlayıcısı) ──
  let provider: string | null = (intent as any).provider ?? null;
  if (!provider) {
    const { data: cred } = await supabase
      .from('provider_credentials')
      .select('provider')
      .eq('lab_id', (intent as any).lab_id)
      .eq('type', 'payment')
      .eq('is_active', true)
      .maybeSingle();
    provider = (cred as any)?.provider ?? null;
  }

  // ── 5) İMZA DOĞRULAMA (fail closed) ──
  const verified = await verifySignature(provider, body, rawBody);
  if (!verified) {
    return new Response('signature invalid', { status: 401 });
  }

  // ── 6) Sonuç: provider'a göre body.status / body.success ──
  const success =
    body.status === 'success' ||
    body.status === '1' ||
    body.MdStatus === '1' ||
    body.success === true;

  if (success) {
    // confirm_payment_intent DB tarafında da idempotent (status='paid' → erken döner)
    await supabase.rpc('confirm_payment_intent', {
      p_intent_id:    (intent as any).id,
      p_provider_ref: String(providerRef),
    });
    return new Response('OK', { status: 200 });
  } else {
    await supabase.from('payment_intents').update({
      status: 'failed',
      error_message: body.errorMessage ?? body.failed_reason_msg ?? 'Provider reddi',
      updated_at: new Date().toISOString(),
    }).eq('id', (intent as any).id);

    await supabase.from('payment_attempts').insert({
      intent_id: (intent as any).id,
      action: 'callback',
      response_body: body,
      error_message: body.errorMessage ?? body.failed_reason_msg,
    });
    return new Response('FAILED', { status: 200 });
  }
});

/**
 * Provider imza doğrulaması. HER YOL FAIL CLOSED:
 *   • İlgili secret env tanımlı değilse → false
 *   • İmza alanı eksik/boş → false
 *   • İmza uyuşmazsa (yanlış imza veya kurcalanmış gövde) → false
 * Karşılaştırmalar sabit-zamanlı.
 */
async function verifySignature(
  provider: string | null,
  body: Record<string, any>,
  rawBody: string,
): Promise<boolean> {
  switch ((provider ?? '').toLowerCase()) {
    case 'paytr': {
      // PayTR callback: hash = base64(HMAC_SHA256(merchant_oid + merchant_salt +
      //   status + total_amount, merchant_key)).
      // TODO(paytr): Canlıya almadan önce merchant panelindeki güncel hash
      //   formülünü (alan sırası) doğrula.
      const key  = Deno.env.get('PAYTR_MERCHANT_KEY')  ?? '';
      const salt = Deno.env.get('PAYTR_MERCHANT_SALT') ?? '';
      if (!key || !salt) return false;                       // fail closed
      const given = String(body.hash ?? '');
      if (!given) return false;
      const data = `${body.merchant_oid ?? ''}${salt}${body.status ?? ''}${body.total_amount ?? ''}`;
      const expected = await hmacSha256Base64(key, data);
      return timingSafeEqualStr(expected, given);
    }

    case 'iyzico': {
      // TODO(iyzico): iyzico 3DS callback için KESİN imza alanı/algoritması bu
      //   koddan çıkarılamadı. Aşağıda HAM gövde üzerinden HMAC-SHA256 (IYZICO_SECRET)
      //   genel doğrulaması uygulanıyor; gerçek entegrasyonda iyzico'nun döndürdüğü
      //   imza alanı ve imzalanan veri (ör. paymentId + conversationId) ile
      //   değiştirilmeli. Şu an FAIL CLOSED çalışır.
      const secret = Deno.env.get('IYZICO_SECRET') ?? '';
      if (!secret) return false;                             // fail closed
      const given = String(body.signature ?? body.hash ?? '');
      if (!given) return false;
      const expected = await hmacSha256Hex(secret, rawBody);
      return timingSafeEqualStr(expected, given);
    }

    default: {
      // Bilinmeyen/param vb. → genel HMAC-SHA256(HAM gövde, PAYMENTS_CALLBACK_SECRET).
      // TODO(provider): Bu provider için imza alanı/algoritması netleştirilmeli.
      const secret = Deno.env.get('PAYMENTS_CALLBACK_SECRET') ?? '';
      if (!secret) return false;                             // fail closed
      const given = String(body.signature ?? body.hash ?? '');
      if (!given) return false;
      const expected = await hmacSha256Hex(secret, rawBody);
      return timingSafeEqualStr(expected, given);
    }
  }
}
