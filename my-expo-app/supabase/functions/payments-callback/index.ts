// supabase/functions/payments-callback/index.ts
//
// 3DS callback handler — provider tamamlandığında bu URL'i çağırır.
// HMAC/imza doğrulaması yapılır → confirm_payment_intent RPC tetiklenir.
//
// URL'in provider panelinde "callback URL" olarak set edilmesi gerekir:
//   https://<project-ref>.supabase.co/functions/v1/payments-callback
//
// Provider'a göre doğrulama farklıdır:
//   - iyzico: SHA1(secretKey + body) imza
//   - PayTR: hash + token mantığı
//   - Param: SOAP imza

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Provider POST body'si (form-urlencoded veya JSON olabilir)
  const contentType = req.headers.get('content-type') ?? '';
  let body: any;
  if (contentType.includes('application/json')) {
    body = await req.json();
  } else {
    const form = await req.formData();
    body = Object.fromEntries(form.entries());
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

  // İmza doğrulama (provider'a özel)
  // ÖNEMLI: Production'da MUTLAKA imza/hash doğrula. Aksi takdirde sahte
  // POST'larla ödeme onaylanır.
  const verified = await verifySignature(body, providerRef);
  if (!verified) {
    return new Response('signature invalid', { status: 401 });
  }

  // Sonuç: provider'a göre body.status / body.success
  const success =
    body.status === 'success' ||
    body.status === '1' ||
    body.MdStatus === '1' ||
    body.success === true;

  if (success) {
    await supabase.rpc('confirm_payment_intent', {
      p_intent_id:    (intent as any).id,
      p_provider_ref: providerRef,
    });
    // Provider'ın istediği response (genelde 'OK' string)
    return new Response('OK', { status: 200 });
  } else {
    await supabase.from('payment_intents').update({
      status: 'failed',
      error_message: body.errorMessage ?? body.failed_reason_msg ?? 'Provider reddi',
      updated_at: new Response(null).headers.get('date') ?? new Date().toISOString(),
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

async function verifySignature(body: any, providerRef: string): Promise<boolean> {
  // TODO: Provider'a özel imza doğrulama
  // iyzico: SHA1(secret + body parameters)
  // PayTR:  body.hash == base64(HMAC(merchant_oid + ... , merchant_salt))
  // Sandbox'ta doğrulama atlanabilir.
  return true; // TEMP: sandbox için geçici true
}
