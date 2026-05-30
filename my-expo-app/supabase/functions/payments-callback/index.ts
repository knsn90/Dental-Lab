// supabase/functions/payments-callback/index.ts
//
// 3DS callback handler — provider tamamlandığında bu URL'i çağırır.
// Provider kimlik bilgileri DB'den okunur; provider'a özgü HMAC/imza doğrulanır.
//
// URL'i provider panelinde "callback URL" olarak set et:
//   https://<project-ref>.supabase.co/functions/v1/payments-callback
//
// Provider doğrulama yöntemi:
//   - paytr:  HMAC-SHA256(merchant_oid + merchant_key + total_amount + status + merchant_salt, merchant_key)
//   - iyzico: paymentId varlığı + TODO: retrieve payment API çağrısı ile tam doğrulama

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Provider POST body'si (form-urlencoded veya JSON olabilir)
  const contentType = req.headers.get('content-type') ?? '';
  let body: Record<string, string>;
  if (contentType.includes('application/json')) {
    body = await req.json() as Record<string, string>;
  } else {
    const form = await req.formData();
    body = Object.fromEntries(form.entries()) as Record<string, string>;
  }

  // provider_ref → intent eşleştir
  const providerRef = body.conversationId ?? body.merchant_oid ?? body.OrderId;
  if (!providerRef) {
    return new Response('missing provider_ref', { status: 400 });
  }

  const { data: intent } = await supabase
    .from('payment_intents')
    .select('id, lab_id, status')
    .eq('provider_ref', providerRef)
    .maybeSingle();

  if (!intent) {
    return new Response('intent not found', { status: 404 });
  }

  // İdempotency: zaten işlenmiş callback'i tekrar işleme
  const intentData = intent as { id: string; lab_id: string; status: string };
  if (intentData.status === 'paid' || intentData.status === 'failed') {
    return new Response('OK', { status: 200 });
  }

  // Provider kimlik bilgilerini DB'den al (imza doğrulama için gerekli)
  const { data: cred } = await supabase
    .from('provider_credentials')
    .select('provider, credentials')
    .eq('lab_id', intentData.lab_id)
    .eq('type', 'payment')
    .eq('is_active', true)
    .maybeSingle();

  if (!cred) {
    return new Response('provider not configured', { status: 400 });
  }

  const credData = cred as { provider: string; credentials: Record<string, string> };

  // Idempotency: aynı (provider_ref, provider) çiftini bir kez işle.
  // Eş zamanlı duplicate callback → UNIQUE violation → 200 (zaten işlendi).
  const { error: dedupeError } = await supabase
    .from('webhook_events')
    .insert({ provider_ref: providerRef, provider: credData.provider });
  if (dedupeError) {
    return new Response('OK', { status: 200 });
  }

  // Provider'a özgü imza doğrulama — doğrulanamayan callback'ler reddedilir
  const verified = await verifySignature(body, credData.provider, credData.credentials);
  if (!verified) {
    return new Response('signature invalid', { status: 401 });
  }

  // Sonuç: provider'a göre body.status / body.success
  const success =
    body.status === 'success' ||
    body.status === '1'       ||
    body.MdStatus === '1'     ||
    body.success === 'true';

  if (success) {
    await supabase.rpc('confirm_payment_intent', {
      p_intent_id:    intentData.id,
      p_provider_ref: providerRef,
    });
    return new Response('OK', { status: 200 });
  } else {
    await supabase.from('payment_intents').update({
      status:        'failed',
      error_message: body.errorMessage ?? body.failed_reason_msg ?? 'Provider reddi',
      updated_at:    new Date().toISOString(),
    }).eq('id', intentData.id);

    await supabase.from('payment_attempts').insert({
      intent_id:     intentData.id,
      action:        'callback',
      response_body: body,
      error_message: body.errorMessage ?? body.failed_reason_msg,
    });
    return new Response('FAILED', { status: 200 });
  }
});

// ─── Provider imza doğrulama ────────────────────────────────────────────────

async function verifySignature(
  body: Record<string, string>,
  provider: string,
  credentials: Record<string, string>,
): Promise<boolean> {
  switch (provider) {
    case 'paytr':
      return verifyPaytr(body, credentials);

    case 'iyzico':
      return verifyIyzico(body, credentials);

    default:
      // Bilinmeyen provider → güvenli varsayılan: reddet
      return false;
  }
}

// PayTR IPN doğrulama
// hash = base64(HMAC-SHA256(merchant_oid + merchant_key + total_amount + status + merchant_salt, merchant_key))
async function verifyPaytr(
  body: Record<string, string>,
  creds: Record<string, string>,
): Promise<boolean> {
  const { merchant_oid, total_amount, status, hash: receivedHash } = body;
  const { merchant_key, merchant_salt } = creds;
  if (!merchant_oid || !total_amount || !status || !receivedHash || !merchant_key || !merchant_salt) {
    return false;
  }
  const raw     = `${merchant_oid}${merchant_key}${total_amount}${status}${merchant_salt}`;
  const encoder = new TextEncoder();
  const key     = await crypto.subtle.importKey(
    'raw', encoder.encode(merchant_key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig      = await crypto.subtle.sign('HMAC', key, encoder.encode(raw));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return expected === receivedHash;
}

// iyzico 3DS callback doğrulama
// iyzico 3DS dönüş POST'unda standalone imza yoktur — paymentId varlığı minimal kontrol.
// TAM güvenlik için: Deno.env.get('IYZICO_*') ile retrieve_payment API çağrısı yapılmalı.
// bkz: https://dev.iyzipay.com/en/api/iyzico-3ds-payment
async function verifyIyzico(
  body: Record<string, string>,
  _creds: Record<string, string>,
): Promise<boolean> {
  // conversationId ve paymentId her iki başarı ve başarısızlık callback'inde mevcut olmalı
  const hasRequiredFields = Boolean(body.conversationId) && Boolean(body.paymentId);
  // TODO: tam doğrulama için iyzico retrieve_payment API'sini çağır ve
  // dönen status/paymentId değerlerini body ile karşılaştır
  return hasRequiredFields;
}
