// supabase/functions/payments-charge/index.ts
//
// Edge Function — Online ödeme 3DS başlatma (production)
//
// Body: { action?: 'charge' | 'confirm', intent_id, public_token, card?, installment?, provider_ref? }
//   action='charge' (varsayılan) → 3DS başlatır
//   action='confirm'             → YALNIZ 'demo' POS tanımlı labda; 3DS sonrası onay
// Döner: { ok, threeds_html?, threeds_url?, status, provider_ref?, error? }
//
// GÜVENLİK (2026-08-02): bir ödemeyi "paid" yapabilen tek yol bu function ve
// payments-callback. confirm_payment_intent RPC'sinin EXECUTE yetkisi anon ve
// authenticated rollerinden alındı — eskiden ödeme linkini alan herkes, RPC'yi
// intent_id ile çağırıp kart girmeden faturayı ödenmiş işaretleyebiliyordu
// (fetch_public_payment_intent zaten intent_id döndürüyor).
// Gerçek sağlayıcılarda onay YALNIZCA imzası doğrulanmış payments-callback'ten
// gelir; buradaki 'confirm' eylemi laba açıkça 'demo' POS tanımlıysa çalışır.
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
    const body = await req.json();
    const { intent_id, public_token, card, installment, provider_ref } = body;
    const action: 'charge' | 'confirm' = body.action === 'confirm' ? 'confirm' : 'charge';

    if (!intent_id || !public_token) {
      return new Response(JSON.stringify({ ok: false, error: 'Eksik alanlar' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (action === 'charge' && !card?.number) {
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

    // 3a) Onay eylemi — yalnız demo POS'ta. Gerçek sağlayıcıda onay istemciden
    //     gelemez; imzalı payments-callback'ten gelir.
    if (action === 'confirm') {
      if ((cred as any).provider !== 'demo') {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Onay yalnızca sağlayıcı callback\'i ile alınır',
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (!provider_ref || !String(provider_ref).startsWith('demo_')) {
        return new Response(JSON.stringify({ ok: false, error: 'Geçersiz provider_ref' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if ((intent as any).provider_ref && (intent as any).provider_ref !== provider_ref) {
        return new Response(JSON.stringify({ ok: false, error: 'provider_ref eşleşmiyor' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: confErr } = await supabase.rpc('confirm_payment_intent', {
        p_intent_id:    (intent as any).id,
        p_provider_ref: provider_ref,
      });
      await supabase.from('payment_attempts').insert({
        intent_id: (intent as any).id, action: 'callback',
        response_body: { source: 'demo-confirm', provider_ref },
        error_message: confErr?.message ?? null,
      });
      if (confErr) {
        return new Response(JSON.stringify({ ok: false, error: confErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, status: 'paid', provider_ref }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3b) Provider'a göre dispatch
    let result: any;
    switch ((cred as any).provider) {
      case 'demo':
        result = await chargeViaDemo(intent, card, installment ?? 1);
        break;
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

    // 6) Sağlayıcı anında 'paid' döndüyse faturaya yansıt. Bunu eskiden istemci
    //    yapıyordu (confirm_payment_intent'i doğrudan çağırarak); artık burada.
    if (result.ok && result.status === 'paid' && result.provider_ref) {
      const { error: confErr } = await supabase.rpc('confirm_payment_intent', {
        p_intent_id:    (intent as any).id,
        p_provider_ref: result.provider_ref,
      });
      if (confErr) {
        result = { ...result, ok: false, status: 'failed', error: confErr.message };
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? 'Sunucu hatası' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ─── Provider implementasyonları ───────────────────────────────────────────

/**
 * Demo/sandbox POS. İstemcideki DemoPaymentProvider'ın sunucu karşılığı —
 * ödeme durumunu belirleyen mantığın tarayıcıda kalmaması için buraya taşındı.
 * YALNIZ provider_credentials'ta type='payment', provider='demo' satırı olan
 * labda çalışır; yani laba kasten tanımlanması gerekir.
 *
 * Test kuralları (istemci sürümüyle birebir):
 *   CVC '000' → başarısız · CVC '999' → 3DS bekleyen · diğer → anında paid
 */
async function chargeViaDemo(intent: any, card: any, _installment: number) {
  if (!card?.holder_name || !card?.number || !card?.cvc) {
    return { ok: false, error: 'Kart bilgileri eksik', error_code: 'MISSING_FIELDS' };
  }
  if (String(card.number).replace(/\s/g, '').length < 15) {
    return { ok: false, error: 'Geçersiz kart numarası', error_code: 'INVALID_CARD' };
  }
  if (card.cvc === '000') {
    return { ok: false, error: 'Yetersiz bakiye (sandbox)', error_code: 'INSUFFICIENT_FUNDS', status: 'failed' };
  }

  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const providerRef = 'demo_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

  if (card.cvc === '999') {
    return {
      ok: true,
      provider_ref: providerRef,
      status: 'awaiting_3ds',
      threeds_html: `
        <html><body style="font-family:sans-serif;padding:24px;text-align:center">
          <h2>Sandbox 3DS Doğrulama</h2>
          <p>SMS kodu: <b>123456</b></p>
          <button onclick="parent.postMessage({type:'demo-3ds-success',ref:'${providerRef}'},'*')"
            style="padding:12px 24px;background:#10B981;color:#fff;border:0;border-radius:8px;font-size:16px;cursor:pointer">
            Onayla
          </button>
        </body></html>`,
    };
  }

  return { ok: true, provider_ref: providerRef, status: 'paid' };
}

// ─── Gerçek sağlayıcılar (skeleton) ────────────────────────────────────────

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
