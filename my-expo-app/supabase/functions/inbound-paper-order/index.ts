// inbound-paper-order — Mesajlaşma kanalından gelen kağıt iş emri fotoğrafını işler.
//
// Vendor-bağımsız webhook. WhatsApp Business API, Twilio, n8n, Zapier, manual cURL
// hepsi aynı endpoint'i çağırabilir.
//
// Input  : {
//   lab_id:        string (zorunlu — labın UUID'si),
//   source:        'whatsapp'|'telegram'|'email'|'webhook'|'manual'|'courier' (default 'webhook'),
//   sender_phone?: string,
//   sender_name?:  string,
//   channel_msg_id?: string (gelen mesajın orijinal id'si, dedupe için),
//   photo_base64:  string (image/jpeg veya image/png base64),
//   photo_mime?:   string (default 'image/jpeg'),
//   /** Veya direkt photo_url */
//   photo_url?:    string,
// }
//
// Output : {
//   ok: boolean,
//   pending_order_id?: string,
//   confidence_avg?:   number,
//   error?: string,
// }
//
// Yetkilendirme: Authorization header şart değil — SERVICE_ROLE anahtarı ENV'den.
// Public webhook kullanılacaksa fonksiyon "Public" olarak deploy edilmeli (--no-verify-jwt).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InboundBody {
  lab_id: string;
  source?: 'whatsapp' | 'telegram' | 'email' | 'webhook' | 'manual' | 'courier';
  sender_phone?: string;
  sender_name?: string;
  channel_msg_id?: string;
  photo_base64?: string;
  photo_mime?: string;
  photo_url?: string;
}

interface OcrResponse {
  ok: boolean;
  data?: any;
  error?: string;
}

async function callParseWorkOrder(
  supabaseUrl: string,
  serviceRoleKey: string,
  fileBase64: string,
  mimeType: string,
): Promise<OcrResponse> {
  const resp = await fetch(`${supabaseUrl}/functions/v1/parse-work-order`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ file_base64: fileBase64, mime_type: mimeType }),
  });
  if (!resp.ok) {
    return { ok: false, error: `OCR HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
  }
  return await resp.json();
}

async function downloadAsBase64(url: string): Promise<{ b64: string; mime: string }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Photo fetch failed: ${resp.status}`);
  const mime = resp.headers.get('content-type') ?? 'image/jpeg';
  const buf = new Uint8Array(await resp.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)));
  }
  // @ts-ignore — Deno btoa global
  return { b64: btoa(binary), mime };
}

function avgConfidence(ocr: any): number {
  const conf = ocr?.confidence;
  if (!conf || typeof conf !== 'object') return 0;
  const score: Record<string, number> = { high: 100, medium: 60, low: 30, missing: 0 };
  const vals = Object.values(conf).map((c: any) => score[c as string] ?? 0);
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((s, x) => s + x, 0) / vals.length);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── Yetki: dış webhook — INBOUND_WEBHOOK_SECRET tanımlıysa header/query secret eşleşmeli ──
  const inboundSecret = Deno.env.get('INBOUND_WEBHOOK_SECRET') ?? '';
  if (inboundSecret) {
    const given = req.headers.get('x-webhook-secret') ?? new URL(req.url).searchParams.get('secret') ?? '';
    if (given !== inboundSecret) {
      return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tanımlı değil');

    const body = await req.json() as InboundBody;
    if (!body.lab_id) throw new Error('lab_id zorunlu');

    // Foto base64'a çevir (url verilmişse fetch et)
    let photoB64 = body.photo_base64;
    let photoMime = body.photo_mime ?? 'image/jpeg';
    if (!photoB64 && body.photo_url) {
      const r = await downloadAsBase64(body.photo_url);
      photoB64 = r.b64;
      photoMime = r.mime;
    }
    if (!photoB64) throw new Error('photo_base64 veya photo_url zorunlu');

    // Dedupe: aynı channel_msg_id daha önce işlendiyse atla
    if (body.channel_msg_id) {
      const dupCheck = await fetch(
        `${supabaseUrl}/rest/v1/pending_paper_orders?channel_msg_id=eq.${encodeURIComponent(body.channel_msg_id)}&select=id`,
        { headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` } },
      );
      if (dupCheck.ok) {
        const rows = await dupCheck.json();
        if (Array.isArray(rows) && rows.length > 0) {
          return new Response(JSON.stringify({
            ok: true, duplicate: true, pending_order_id: rows[0].id,
          }), { headers: { ...corsHeaders, 'content-type': 'application/json' } });
        }
      }
    }

    // 1) OCR
    const ocr = await callParseWorkOrder(supabaseUrl, serviceRoleKey, photoB64, photoMime);
    if (!ocr.ok) throw new Error(ocr.error ?? 'OCR başarısız');

    const ocrData = ocr.data;
    const confAvg = avgConfidence(ocrData);

    // 2) Storage'a fotoyu yükle
    const storagePath = `${body.lab_id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`;
    const photoBytes = Uint8Array.from(atob(photoB64), c => c.charCodeAt(0));
    const uploadResp = await fetch(
      `${supabaseUrl}/storage/v1/object/paper-orders/${storagePath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': photoMime,
        },
        body: photoBytes,
      },
    );
    const photoUrl = uploadResp.ok
      ? `${supabaseUrl}/storage/v1/object/authenticated/paper-orders/${storagePath}`
      : null;

    // 3) Klinik kontrolü — clinic_id OCR'da varsa
    let resolvedClinicId: string | null = null;
    if (ocrData?.clinic_id) {
      const cCheck = await fetch(
        `${supabaseUrl}/rest/v1/clinics?id=eq.${ocrData.clinic_id}&select=id&limit=1`,
        { headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` } },
      );
      if (cCheck.ok) {
        const rows = await cCheck.json();
        if (Array.isArray(rows) && rows.length > 0) resolvedClinicId = rows[0].id;
      }
    }

    // 4) pending_paper_orders'a insert
    const insertResp = await fetch(
      `${supabaseUrl}/rest/v1/pending_paper_orders`,
      {
        method: 'POST',
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          lab_id: body.lab_id,
          source: body.source ?? 'webhook',
          sender_phone: body.sender_phone ?? null,
          sender_name: body.sender_name ?? null,
          channel_msg_id: body.channel_msg_id ?? null,
          photo_url: photoUrl,
          photo_storage_path: storagePath,
          ocr_data: ocrData,
          clinic_id: resolvedClinicId,
          patient_name: ocrData?.patient_name ?? null,
          confidence_avg: confAvg,
          status: 'pending',
        }),
      },
    );
    if (!insertResp.ok) {
      throw new Error(`DB insert failed: ${(await insertResp.text()).slice(0, 200)}`);
    }
    const inserted = await insertResp.json();
    const pendingId = Array.isArray(inserted) ? inserted[0]?.id : inserted.id;

    return new Response(JSON.stringify({
      ok: true,
      pending_order_id: pendingId,
      confidence_avg: confAvg,
    }), { headers: { ...corsHeaders, 'content-type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) ?? 'unknown' }), {
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});
