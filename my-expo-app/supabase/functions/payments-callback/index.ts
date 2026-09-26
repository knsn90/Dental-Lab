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
//   - iyzico: callback İMZALI BİR WEBHOOK DEĞİLDİR — kullanıcının tarayıcısı
//            banka 3DS ekranından buraya POST eder. Bu yüzden gövdeye hiç
//            güvenilmez: ödeme sunucudan /payment/v2/3dsecure/auth çağrılarak
//            tamamlanır ve yalnız O yanıtın imzası (paymentId:currency:basketId:
//            conversationId:paidPrice:price) doğrulanır. Ayrı akış: 1b.
//   - param / diğer: sağlayıcıya özel alan/algoritma KOD'dan kesin çıkarılamadı
//     → HAM gövde üzerinden HMAC-SHA256 genel doğrulaması. Her hâlükârda FAIL CLOSED.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { timingSafeEqualStr, hmacSha256Hex, hmacSha256Base64 } from '../_shared/security.ts';
import { iyzicoPost, iyziPrice, verifyAuthSignature, IYZICO_SANDBOX, type IyzicoCreds } from '../_shared/iyzico.ts';

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

  // ── 1b) iyzico: ayrı akış ──
  // iyzico'nun callback'i imzalı bir webhook DEĞİL; kullanıcının TARAYICISI
  // banka 3DS ekranından buraya POST eder. Dolayısıyla gövdeye güvenilmez:
  // ödemeyi biz sunucudan /payment/v2/3dsecure/auth çağırarak tamamlarız ve
  // yalnız O yanıtın imzasına güveniriz. Gövde sadece paymentId +
  // conversationData taşıyıcısıdır.
  if ((new URL(req.url).searchParams.get('provider') ?? '') === 'iyzico'
      || body.conversationData !== undefined || body.mdStatus !== undefined) {
    return await handleIyzicoCallback(supabase, body);
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


// ═══════════════════════════════════════════════════════════════════════
// iyzico 3DS tamamlama
// ═══════════════════════════════════════════════════════════════════════

/** Tarayıcıya dönen sayfa: üst pencereye haber verir, sonra ödeme sayfasına döner. */
function iyzicoResultPage(payUrl: string, ok: boolean, message: string): Response {
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ok ? 'Ödeme tamamlandı' : 'Ödeme başarısız'}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;
justify-content:center;min-height:100vh;margin:0;background:#F8F9FB;color:#0B1220;text-align:center;padding:24px}
a{color:#314F7E}</style></head><body>
<div><p>${message}</p><p><a href="${payUrl}">Ödeme sayfasına dön</a></p></div>
<script>
  // 3DS ekranı iframe içinde açıldığı için sonucu üst pencereye bildiriyoruz;
  // iframe'in sandbox'ında top-navigation yok, postMessage ise serbest.
  try { parent.postMessage({ type: 'iyzico-3ds-done', ok: ${ok ? 'true' : 'false'} }, '*'); } catch (e) {}
  // iframe değilsek (bazı bankalar tam sayfa yönlendirir) kendimiz dönüyoruz.
  if (window.top === window.self) setTimeout(function () { location.href = ${JSON.stringify(payUrl)}; }, 1200);
</script></body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function handleIyzicoCallback(supabase: any, body: Record<string, any>): Promise<Response> {
  const conversationId = String(body.conversationId ?? '');   // = payment_intents.id
  const paymentId      = String(body.paymentId ?? '');
  const appUrl = (Deno.env.get('APP_PUBLIC_URL') ?? 'https://siman.app').replace(/\/+$/, '');

  if (!conversationId || !paymentId) {
    return iyzicoResultPage(appUrl, false, 'Ödeme doğrulaması eksik veriyle döndü.');
  }

  const { data: intent } = await supabase
    .from('payment_intents')
    .select('id, lab_id, invoice_id, amount, currency, status, public_token')
    .eq('id', conversationId)
    .maybeSingle();

  if (!intent) return iyzicoResultPage(appUrl, false, 'Ödeme kaydı bulunamadı.');

  const payUrl = `${appUrl}/pay/${(intent as any).public_token}`;

  // Idempotency: aynı callback iki kez gelirse ikinci kez para çekilmez.
  if ((intent as any).status === 'paid') {
    return iyzicoResultPage(payUrl, true, 'Ödemeniz zaten alınmıştı.');
  }

  // mdStatus 1 = başarılı doğrulama; diğer her değer başarısızdır ve auth
  // çağrısı yapılmaz (banka doğrulaması geçmemiştir).
  const md = String(body.mdStatus ?? '');
  if (body.status !== 'success' || (md && md !== '1')) {
    await supabase.from('payment_intents').update({
      status: 'failed',
      error_code: md ? `mdStatus_${md}` : 'IYZICO_3DS_FAILED',
      error_message: '3DS doğrulaması başarısız',
      updated_at: new Date().toISOString(),
    }).eq('id', (intent as any).id);
    await supabase.from('payment_attempts').insert({
      intent_id: (intent as any).id, action: 'callback', response_body: body,
      error_message: '3DS doğrulaması başarısız',
    });
    return iyzicoResultPage(payUrl, false, '3DS doğrulaması tamamlanamadı.');
  }

  const { data: cred } = await supabase
    .from('provider_credentials')
    .select('credentials')
    .eq('lab_id', (intent as any).lab_id)
    .eq('type', 'payment').eq('provider', 'iyzico').eq('is_active', true)
    .maybeSingle();

  const creds: IyzicoCreds = {
    api_key:    String((cred as any)?.credentials?.api_key ?? ''),
    secret_key: String((cred as any)?.credentials?.secret_key ?? ''),
    base_url:   String((cred as any)?.credentials?.base_url ?? '') || IYZICO_SANDBOX,
  };
  if (!creds.api_key || !creds.secret_key) {
    return iyzicoResultPage(payUrl, false, 'Ödeme sağlayıcı ayarları eksik.');
  }

  // v2 tamamlama: paidPrice/basketId/currency INIT ile BİREBİR aynı olmalı.
  // Alan listesi resmî SDK'daki CreateThreedsV2PaymentRequest ile birebir:
  // locale, conversationId, paymentId, paidPrice, basketId, currency.
  // conversationData v1 uca aittir, v2'de GÖNDERİLMEZ.
  const res = await iyzicoPost(creds, '/payment/v2/3dsecure/auth', {
    locale: 'tr',
    conversationId,
    paymentId,
    paidPrice: iyziPrice((intent as any).amount),
    basketId: String((intent as any).invoice_id),
    currency: String((intent as any).currency ?? 'TRY'),
  });
  const d: any = res.data ?? {};

  await supabase.from('payment_attempts').insert({
    intent_id: (intent as any).id,
    action: 'callback',
    http_status: res.http_status,
    response_body: { status: d.status, paymentId: d.paymentId, errorCode: d.errorCode, errorMessage: d.errorMessage },
    error_code: d.errorCode ?? null,
    error_message: d.errorMessage ?? res.error ?? null,
  });

  // Yanıt imzası tutmuyorsa "ödendi" saymayız — fail closed.
  if (!res.ok || !(await verifyAuthSignature(creds.secret_key, d))) {
    await supabase.from('payment_intents').update({
      status: 'failed',
      error_code: d.errorCode ?? (res.ok ? 'IYZICO_BAD_SIGNATURE' : 'IYZICO_AUTH_FAILED'),
      error_message: d.errorMessage ?? res.error ?? 'Ödeme tamamlanamadı',
      updated_at: new Date().toISOString(),
    }).eq('id', (intent as any).id);
    return iyzicoResultPage(payUrl, false, d.errorMessage ?? 'Ödeme tamamlanamadı.');
  }

  const { error: confErr } = await supabase.rpc('confirm_payment_intent', {
    p_intent_id:    (intent as any).id,
    p_provider_ref: String(d.paymentId ?? paymentId),
  });
  if (confErr) {
    return iyzicoResultPage(payUrl, false, 'Ödeme alındı ancak faturaya işlenemedi. Lütfen laboratuvarla iletişime geçin.');
  }

  return iyzicoResultPage(payUrl, true, 'Ödemeniz alındı. Teşekkürler.');
}
