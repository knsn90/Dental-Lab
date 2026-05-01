// supabase/functions/efatura-send/index.ts
//
// Edge Function — e-Fatura gönderimi (production)
//
// Bu fonksiyon, production API anahtarlarını client'a göstermeden
// e-Fatura/e-Arşiv entegratörünü çağırır.
//
// Çağrı örneği (client'tan):
//   const { data, error } = await supabase.functions.invoke('efatura-send', {
//     body: { invoice_id: '...' }
//   });
//
// Deploy:
//   supabase functions deploy efatura-send --project-ref <REF>
//
// Secrets ekle (production key'ler):
//   supabase secrets set NILVERA_USERNAME=... NILVERA_PASSWORD=...
// Veya provider_credentials tablosundan service role ile okunur.

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
    const { invoice_id } = await req.json();
    if (!invoice_id) {
      return new Response(JSON.stringify({ ok: false, error: 'invoice_id gerekli' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service role ile DB'ye eriş (RLS bypass)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1) Faturayı + lab_id'yi çek
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('*, clinic:clinics(*), doctor:doctors(*), lab:labs(*), items:invoice_items(*)')
      .eq('id', invoice_id)
      .single();
    if (invErr || !invoice) {
      return new Response(JSON.stringify({ ok: false, error: invErr?.message ?? 'Fatura bulunamadı' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Aktif e-Fatura sağlayıcı + credentials
    const { data: cred } = await supabase
      .from('provider_credentials')
      .select('*')
      .eq('lab_id', (invoice as any).lab_id)
      .eq('type', 'efatura')
      .eq('is_active', true)
      .maybeSingle();

    if (!cred) {
      return new Response(JSON.stringify({ ok: false, error: 'Aktif e-Fatura sağlayıcı yok' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3) Provider'a göre dispatch
    let result: any;
    switch ((cred as any).provider) {
      case 'nilvera':
        result = await sendViaNilvera(invoice, (cred as any).credentials, (cred as any).environment);
        break;
      case 'efinans':
        result = await sendViaEfinans(invoice, (cred as any).credentials, (cred as any).environment);
        break;
      case 'foriba':
        result = await sendViaForiba(invoice, (cred as any).credentials, (cred as any).environment);
        break;
      default:
        return new Response(JSON.stringify({ ok: false, error: `Provider implementasyonu yok: ${(cred as any).provider}` }), {
          status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 4) Log + invoice güncelle (uuid, status, vs.)
    await supabase.from('efatura_logs').insert({
      lab_id:         (invoice as any).lab_id,
      invoice_id:     (invoice as any).id,
      provider:       (cred as any).provider,
      action:         'send',
      response_body:  result.raw_response ?? null,
      http_status:    result.http_status ?? null,
      efatura_uuid:   result.uuid ?? null,
      efatura_status: result.status ?? null,
      error_message:  result.error ?? null,
    });

    if (result.ok) {
      await supabase.from('invoices').update({
        efatura_uuid:    result.uuid,
        efatura_status:  result.status ?? 'sent',
        efatura_provider:(cred as any).provider,
        efatura_sent_at: new Date().toISOString(),
        efatura_error:   null,
      }).eq('id', (invoice as any).id);
    } else {
      await supabase.from('invoices').update({
        efatura_status: 'error',
        efatura_error:  result.error ?? 'Bilinmeyen hata',
      }).eq('id', (invoice as any).id);
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

// ─── Provider implementasyonları (skeleton) ────────────────────────────────
// Her provider için resmi dokümantasyona göre doldur.

async function sendViaNilvera(invoice: any, creds: any, env: string) {
  // TODO: Nilvera API çağrısı
  // const baseUrl = env === 'production' ? 'https://api.nilvera.com' : 'https://sandbox-api.nilvera.com';
  // const ublXml  = buildUblXml(invoice);  // shared helper'dan import
  // const res = await fetch(`${baseUrl}/efatura/send`, {
  //   method: 'POST',
  //   headers: { 'Authorization': `Basic ${btoa(creds.username + ':' + creds.password)}`, 'Content-Type': 'application/xml' },
  //   body: ublXml,
  // });
  // const body = await res.json();
  // return { ok: res.ok, uuid: body.uuid, status: res.ok ? 'sent' : 'error', http_status: res.status, raw_response: body, error: !res.ok ? body.message : undefined };
  return { ok: false, error: 'Nilvera implementasyonu henüz tamamlanmadı' };
}

async function sendViaEfinans(invoice: any, creds: any, env: string) {
  return { ok: false, error: 'eFinans implementasyonu henüz tamamlanmadı' };
}

async function sendViaForiba(invoice: any, creds: any, env: string) {
  return { ok: false, error: 'Foriba implementasyonu henüz tamamlanmadı' };
}
