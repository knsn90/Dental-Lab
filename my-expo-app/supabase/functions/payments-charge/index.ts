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
import { iyzicoPost, iyziPrice, verifyInitSignature, IYZICO_SANDBOX, type IyzicoCreds } from '../_shared/iyzico.ts';

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

    // ── BAĞLANTI TESTİ (Entegrasyonlar → "Test") ──
    // Ayrı bir akış: intent yok, kart yok. Sağlayıcının kimlik bilgileri
    // gerçekten çalışıyor mu diye iyzico'nun /payment/test ucu çağrılır.
    // YETKİ ŞART: bu uç, çalınmış anahtarları denemek için proxy'ye
    // dönüşmesin diye yalnız manage_settings yetkisi olan lab kullanıcısına
    // açıktır (ödeme akışı anon anahtarla çağrılabiliyor, bu çağrılamaz).
    if (body.action === 'test') {
      return await handleCredentialTest(req, body);
    }

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
        result = await chargeViaIyzico(supabase, intent, card, installment ?? 1, (cred as any).credentials);
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

// ─── Bağlantı testi ────────────────────────────────────────────────────────

const jsonResp = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/**
 * Entegrasyonlar ekranındaki "Test" düğmesi.
 *
 * Kimlik bilgileri İKİ kaynaktan gelebilir:
 *  • `credentials` — formda yeni girilen, henüz kaydedilmemiş değerler
 *  • `credential_id` — kayıtlı satır (service role ile okunur, lab eşleşmesi
 *    doğrulanır; anahtarlar istemciye geri DÖNMEZ)
 */
async function handleCredentialTest(req: Request, body: any): Promise<Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResp({ ok: false, message: 'Yetkisiz erişim' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const caller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: authErr } = await caller.auth.getUser();
  if (authErr || !userData?.user) return jsonResp({ ok: false, message: 'Yetkisiz erişim' }, 401);

  // Yetki KULLANICININ oturumunda sorulur; service role ile sorulsaydı
  // her zaman true dönerdi.
  const { data: allowed } = await caller.rpc('has_permission', { p_key: 'manage_settings' });
  if (allowed !== true) {
    return jsonResp({ ok: false, message: 'Bu işlem için ayar yönetimi yetkisi gerekir' }, 403);
  }

  const { data: profile } = await admin
    .from('profiles').select('lab_id').eq('id', userData.user.id).maybeSingle();
  const labId = (profile as any)?.lab_id ?? null;
  if (!labId) return jsonResp({ ok: false, message: 'Hesabınıza bağlı laboratuvar yok' }, 403);

  let creds: any = body.credentials ?? null;
  let provider: string = String(body.provider ?? '');

  if (body.credential_id) {
    const { data: row } = await admin
      .from('provider_credentials')
      .select('lab_id, provider, credentials')
      .eq('id', body.credential_id)
      .maybeSingle();
    if (!row || (row as any).lab_id !== labId) {
      return jsonResp({ ok: false, message: 'Kayıt bulunamadı' }, 404);
    }
    creds = (row as any).credentials;
    provider = String((row as any).provider);
  }

  if (provider !== 'iyzico') {
    return jsonResp({ ok: false, message: `Bu sağlayıcı için test yok: ${provider || '?'}` }, 400);
  }

  const c: IyzicoCreds = {
    api_key:    String(creds?.api_key ?? ''),
    secret_key: String(creds?.secret_key ?? ''),
    base_url:   String(creds?.base_url ?? '') || IYZICO_SANDBOX,
  };
  if (!c.api_key || !c.secret_key) {
    return jsonResp({ ok: false, message: 'API Key ve Secret Key zorunlu' }, 400);
  }

  // DİKKAT: /payment/test KİMLİK DOĞRULAMAZ — sahte anahtarla bile
  // {"status":"success"} döner (ölçüldü: sandbox, 2026-09-26). Test için
  // imzayı gerçekten doğrulayan bir uç gerekir: BIN sorgulama. Yanlış
  // anahtarda errorCode 1001 "api bilgileri bulunamadı" döner.
  const res = await iyzicoPost(c, '/payment/bin/check', {
    locale: 'tr',
    conversationId: 'siman-credential-test',
    binNumber: '554960',
  });
  const d: any = res.data ?? {};
  const isSandbox = c.base_url!.includes('sandbox');

  if (!res.ok) {
    const hint = d.errorCode === '1001' || d.errorCode === 1001
      ? ' — API Key/Secret Key ve ortam (sandbox ↔ canlı) eşleşmiyor olabilir'
      : '';
    return jsonResp({
      ok: false,
      message: d.errorMessage
        ? `Bağlantı reddedildi: ${d.errorMessage}${hint}`
        : (res.error ?? `Bağlantı başarısız (HTTP ${res.http_status})`),
    });
  }

  return jsonResp({
    ok: true,
    message: `Bağlantı başarılı — iyzico ${isSandbox ? 'sandbox' : 'canlı'} ortamı`,
  });
}

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

/**
 * iyzico 3DS başlatma — POST {base}/payment/3dsecure/initialize
 *
 * Akış: burada 3DS ekranının HTML'i (base64) alınır, tarayıcıda iframe'de
 * gösterilir; kullanıcı SMS kodunu girince banka bizim callbackUrl'imize POST
 * eder ve ödeme ORADA tamamlanır (payments-callback → /payment/v2/3dsecure/auth).
 * Yani bu fonksiyon parayı ÇEKMEZ, yalnız doğrulamayı başlatır.
 *
 * conversationId = intent.id → callback intent'i bununla bulur.
 * basketId       = invoice_id → 3DS v2 tamamlamada birebir aynısı gönderilir.
 */
async function chargeViaIyzico(supabase: any, intent: any, card: any, installment: number, creds: any) {
  const c: IyzicoCreds = {
    api_key:    String(creds?.api_key ?? ''),
    secret_key: String(creds?.secret_key ?? ''),
    base_url:   String(creds?.base_url ?? '') || IYZICO_SANDBOX,
  };
  if (!c.api_key || !c.secret_key) {
    return { ok: false, error: 'iyzico API anahtarları eksik', error_code: 'NO_CREDENTIALS' };
  }
  if (!card?.holder_name || !card?.number || !card?.cvc || !card?.expire_month || !card?.expire_year) {
    return { ok: false, error: 'Kart bilgileri eksik', error_code: 'MISSING_FIELDS' };
  }

  // İstemci CardInput'u ay/yıl AYRI tutar (expire_month 'MM', expire_year 'YY'
  // ya da 'YYYY'); iyzico dört haneli yıl ister.
  const expireMonth = String(card.expire_month).padStart(2, '0');
  const expireYear  = String(card.expire_year).length === 2
    ? `20${card.expire_year}` : String(card.expire_year);
  if (expireMonth.length !== 2 || expireYear.length !== 4) {
    return { ok: false, error: 'Son kullanma tarihi geçersiz', error_code: 'INVALID_EXPIRY' };
  }

  // Alıcı bilgisi faturadan çözülür. iyzico bu alanları ZORUNLU tutar;
  // boş bırakılırsa istek 400 döner. Eksik veride nötr varsayılanlar.
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, invoice_number, currency, clinic:clinics(name, address, phone, email), doctor:doctors(full_name, phone)')
    .eq('id', intent.invoice_id)
    .maybeSingle();

  const clinic: any = (inv as any)?.clinic ?? null;
  const doctor: any = (inv as any)?.doctor ?? null;
  const rawName = String(doctor?.full_name || clinic?.name || 'Musteri').trim();
  const parts = rawName.split(/\s+/);
  const buyerName = parts.length > 1 ? parts.slice(0, -1).join(' ') : rawName;
  const buyerSurname = parts.length > 1 ? parts[parts.length - 1] : rawName;

  // Adres jsonb olabilir ({il, ilce, acik_adres…}) ya da düz metin.
  const addrObj = clinic?.address;
  const addrText = typeof addrObj === 'string'
    ? addrObj
    : [addrObj?.acik_adres ?? addrObj?.address, addrObj?.ilce ?? addrObj?.district, addrObj?.il ?? addrObj?.city]
        .filter(Boolean).join(', ');
  const address = (addrText || 'Adres bilgisi yok').slice(0, 250);
  const city = String(addrObj?.il ?? addrObj?.city ?? 'Istanbul').slice(0, 50);

  const phone = String(doctor?.phone || clinic?.phone || '').replace(/[^0-9+]/g, '');
  const email = String(clinic?.email || '').trim() || 'noreply@siman.app';
  const price = iyziPrice(intent.amount);

  const body = {
    locale: 'tr',
    conversationId: String(intent.id),
    price,
    paidPrice: price,               // taksit komisyonu müşteriye yansıtılmıyor
    currency: String(intent.currency ?? 'TRY'),
    installment: Math.max(1, Number(installment) || 1),
    basketId: String(intent.invoice_id),
    paymentChannel: 'WEB',
    paymentGroup: 'PRODUCT',
    callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/payments-callback?provider=iyzico`,
    paymentCard: {
      cardHolderName: String(card.holder_name).slice(0, 100),
      cardNumber: String(card.number).replace(/\s/g, ''),
      expireMonth,
      expireYear,
      cvc: String(card.cvc),
      registerCard: 0,
    },
    buyer: {
      id: String(intent.clinic_id ?? intent.id),
      name: buyerName.slice(0, 50),
      surname: buyerSurname.slice(0, 50),
      // TCKN zorunlu alan; kurumsal alıcıda gerçek kimlik tutmuyoruz.
      identityNumber: '11111111111',
      email,
      gsmNumber: phone || '+905000000000',
      registrationAddress: address,
      city,
      country: 'Turkey',
      ip: '85.34.78.112',
    },
    billingAddress: {
      contactName: rawName.slice(0, 100),
      city, country: 'Turkey', address,
    },
    // Sanal ürün için zorunlu değil, ama bazı hesaplarda doğrulama arıyor;
    // fatura adresinin aynısı gönderiliyor (fiziksel teslimat yok).
    shippingAddress: {
      contactName: rawName.slice(0, 100),
      city, country: 'Turkey', address,
    },
    // Laboratuvar hizmeti fiziksel teslimat içermez → VIRTUAL, shipping yok.
    basketItems: [{
      id: String(intent.invoice_id),
      name: `Fatura ${(inv as any)?.invoice_number ?? ''}`.trim().slice(0, 100),
      category1: 'Dis Laboratuvari',
      itemType: 'VIRTUAL',
      price,
    }],
  };

  const res = await iyzicoPost(c, '/payment/3dsecure/initialize', body);
  const d: any = res.data ?? {};

  if (!res.ok) {
    return {
      ok: false,
      status: 'failed',
      error: d.errorMessage ?? res.error ?? 'iyzico 3DS başlatılamadı',
      error_code: d.errorCode ?? 'IYZICO_INIT_FAILED',
      http_status: res.http_status,
      raw_response: d,
    };
  }

  // Yanıt imzası doğrulanır (paymentId:conversationId). İmza tutmazsa yanıtın
  // iyzico'dan geldiğine güvenemeyiz → akışı başlatmıyoruz.
  if (!(await verifyInitSignature(c.secret_key, d))) {
    return {
      ok: false, status: 'failed',
      error: 'iyzico yanıt imzası doğrulanamadı',
      error_code: 'IYZICO_BAD_SIGNATURE',
      http_status: res.http_status,
      raw_response: { paymentId: d.paymentId, conversationId: d.conversationId },
    };
  }

  const html = d.threeDSHtmlContent ? atob(String(d.threeDSHtmlContent)) : null;
  if (!html) {
    return { ok: false, status: 'failed', error: '3DS içeriği boş döndü', error_code: 'IYZICO_NO_3DS_HTML', raw_response: d };
  }

  return {
    ok: true,
    status: 'awaiting_3ds',
    provider_ref: String(d.paymentId),
    threeds_html: html,
    http_status: res.http_status,
    raw_response: { paymentId: d.paymentId, conversationId: d.conversationId, signature: d.signature },
  };
}

async function chargeViaPaytr(intent: any, card: any, installment: number, creds: any) {
  // TODO: PayTR direkt API
  return { ok: false, error: 'PayTR implementasyonu henüz tamamlanmadı' };
}

async function chargeViaParam(intent: any, card: any, installment: number, creds: any) {
  // TODO: Garanti BBVA Param SOAP
  return { ok: false, error: 'Param implementasyonu henüz tamamlanmadı' };
}
