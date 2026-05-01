// supabase/functions/payments-charge/index.ts
//
// Edge Function — Online ödeme 3DS başlatma (production)
//
// Body: { intent_id, public_token, card: { holder_name, number, expire_month, expire_year, cvc }, installment? }
// Döner: { ok, threeds_html?, threeds_url?, status, provider_ref?, error? }
//
// Deploy:
//   supabase functions deploy payments-charge --project-ref <REF>
//
// Secrets (Dashboard → Edge Functions → Manage Secrets):
//   IYZICO_API_KEY=...  IYZICO_SECRET=...  IYZICO_BASE_URL=https://sandbox-api.iyzipay.com
//   PAYTR_MERCHANT_ID=...  PAYTR_MERCHANT_KEY=...  PAYTR_MERCHANT_SALT=...

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { intent_id, public_token, card, installment } = await req.json();
    if (!intent_id || !public_token || !card?.number) {
      return new Response(JSON.stringify({ ok: false, error: 'Eksik alanlar' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1) Intent + public token doğrulama
    const { data: intent } = await supabase
      .from('payment_intents')
      .select('*')
      .eq('id', intent_id)
      .eq('public_token', public_token)
      .maybeSingle();

    if (!intent) {
      return new Response(JSON.stringify({ ok: false, error: 'Geçersiz ödeme linki' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if ((intent as any).status === 'paid') {
      return new Response(JSON.stringify({ ok: false, error: 'Zaten ödendi' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (new Date((intent as any).expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ ok: false, error: 'Link süresi dolmuş' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Aktif POS sağlayıcı + credentials
    const { data: cred } = await supabase
      .from('provider_credentials')
      .select('*')
      .eq('lab_id', (intent as any).lab_id)
      .eq('type', 'payment')
      .eq('is_active', true)
      .maybeSingle();

    if (!cred) {
      return new Response(JSON.stringify({ ok: false, error: 'Aktif POS sağlayıcı yok' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3) Provider'a göre dispatch
    let result: any;
    switch ((cred as any).provider) {
      case 'iyzico':
        result = await chargeViaIyzico(intent, card, installment ?? 1, (cred as any).credentials);
        break;
      case 'paytr':
        result = await chargeViaPaytr(intent, card, installment ?? 1, (cred as any).credentials);
        break;
      case 'param':
        result = await chargeViaParam(intent, card, installment ?? 1, (cred as any).credentials);
        break;
      default:
        return new Response(JSON.stringify({ ok: false, error: `Provider implementasyonu yok: ${(cred as any).provider}` }), {
          status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 4) Log
    await supabase.from('payment_attempts').insert({
      intent_id:     (intent as any).id,
      action:        '3ds_redirect',
      response_body: result.raw_response ?? null,
      http_status:   result.http_status ?? null,
      error_code:    result.error_code ?? null,
      error_message: result.error ?? null,
    });

    // 5) Intent güncelle
    await supabase.from('payment_intents').update({
      status:       result.status ?? (result.ok ? 'awaiting_3ds' : 'failed'),
      provider_ref: result.provider_ref ?? null,
      installments: installment ?? 1,
      error_code:   result.error_code ?? null,
      error_message:result.error ?? null,
      updated_at:   new Date().toISOString(),
    }).eq('id', (intent as any).id);

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? 'Sunucu hatası' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ─── Provider implementasyonları (skeleton) ────────────────────────────────

async function chargeViaIyzico(intent: any, card: any, installment: number, creds: any) {
  // TODO: iyzico 3DS init endpoint
  // POST {base_url}/payment/3dsecure/initialize
  // Body: { locale, conversationId, price, paidPrice, currency, basketId, paymentChannel, installment, paymentCard, buyer, billingAddress, basketItems }
  // Imza HMAC-SHA256 ile auth header
  // Response: { status: 'success', threeDSHtmlContent: '...' }
  return { ok: false, error: 'iyzico implementasyonu henüz tamamlanmadı' };
}

async function chargeViaPaytr(intent: any, card: any, installment: number, creds: any) {
  // TODO: PayTR direkt API
  return { ok: false, error: 'PayTR implementasyonu henüz tamamlanmadı' };
}

async function chargeViaParam(intent: any, card: any, installment: number, creds: any) {
  // TODO: Garanti BBVA Param SOAP
  return { ok: false, error: 'Param implementasyonu henüz tamamlanmadı' };
}
