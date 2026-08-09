// supabase/functions/banabikurye-callback/index.ts
//
// BanaBiKurye "Gönderi Durumu Bilgisi İçin Callback URL" ucu.
// Sağlayıcı gönderi durumu değiştikçe buraya POST eder; biz deliveries kaydını
// güncelleriz. Böylece durum için sürekli sorgu (polling) atmaya gerek kalmaz.
//
// Kurulum (BanaBiKurye paneli → API Ayarları):
//   Callback URL : https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/banabikurye-callback?token=<BBK_CALLBACK_TOKEN>
//   Callback token: aynı <BBK_CALLBACK_TOKEN> değeri (başlıkta gelirse de kabul edilir)
//
// Auth: medit-webhook ile aynı desen — ?token=... query parametresi.
//       Ek olarak x-callback-token / x-dv-callback-token başlıkları ve gövdedeki
//       token alanı da kabul edilir (sağlayıcının hangisini yolladığı dokümante değil).
//
// Deploy:
//   supabase functions deploy banabikurye-callback \
//     --project-ref kjwjxqfdsxkxgcgophdy --workdir my-expo-app --use-api --no-verify-jwt
//   (--no-verify-jwt şart: BanaBiKurye Supabase JWT'si göndermez.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SRV_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPECTED      = (Deno.env.get('BBK_CALLBACK_TOKEN') ?? '').trim();

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-callback-token, x-dv-callback-token',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}

/** BanaBiKurye durum kodu → deliveries.delivery_status. dispatch fn ile birebir aynı. */
function mapStatus(s: string | null): string | null {
  switch ((s ?? '').toLowerCase()) {
    case 'new': case 'available': return 'atandi';
    case 'active': case 'delayed': return 'yolda';
    case 'completed': return 'teslim_edildi';
    case 'canceled': case 'cancelled': return 'iptal';
    default: return null;
  }
}

/**
 * Gövde şekli dokümante değil — bilinen tüm sarmalayıcıları tolere et.
 * Kimlik için TÜM adayları döndürürüz: sağlayıcı bildirimde order_id (7148715) yerine
 * order_name (48715) gönderebiliyor; hangisini sakladıysak o tutsun diye sırayla denenir.
 */
function pick(body: any): { orderIds: string[]; status: string | null } {
  const o = body?.order ?? body?.data?.order ?? body?.data ?? body ?? {};
  const raw = [
    o.order_id, o.orderId, o.order_name, o.orderName, o.id,
    body?.order_id, body?.orderId, body?.order_name,
  ];
  const orderIds = Array.from(new Set(
    raw.filter(v => v != null && String(v).trim() !== '').map(v => String(v).trim()),
  ));
  const status =
    o.status ?? o.order_status ?? o.state ??
    body?.status ?? null;
  return { orderIds, status: status != null ? String(status) : null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Sağlayıcılar bazen URL doğrulaması için GET atar — 200 dön.
  if (req.method === 'GET') return json({ ok: true, service: 'banabikurye-callback' });

  if (req.method !== 'POST') return json({ ok: false, message: 'method not allowed' }, 405);

  // ── Auth ──
  if (!EXPECTED) {
    console.error('BBK_CALLBACK_TOKEN tanımlı değil — callback reddedildi.');
    return json({ ok: false, message: 'not configured' }, 503);
  }
  const url = new URL(req.url);
  const raw = await req.text();
  let body: any = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* form-encoded olabilir */ }

  const supplied =
    (url.searchParams.get('token') ?? '').trim() ||
    (req.headers.get('x-callback-token') ?? '').trim() ||
    (req.headers.get('x-dv-callback-token') ?? '').trim() ||
    String(body?.token ?? body?.callback_token ?? '').trim();

  if (supplied !== EXPECTED) {
    console.warn('banabikurye-callback: geçersiz token');
    return json({ ok: false, message: 'unauthorized' }, 401);
  }

  // ── Gövde ──
  const { orderIds, status } = pick(body);
  const mapped = mapStatus(status);

  // Bilinmeyen/eşlenemeyen durumda 200 dön ki sağlayıcı tekrar tekrar denemesin;
  // ne geldiğini logla ki eşlemeyi genişletebilelim.
  if (orderIds.length === 0) {
    console.warn('banabikurye-callback: order_id yok. body=', raw.slice(0, 500));
    return json({ ok: true, ignored: 'order_id_missing' });
  }
  if (!mapped) {
    console.warn(`banabikurye-callback: eşlenemeyen durum "${status}" (order ${orderIds[0]})`);
    return json({ ok: true, ignored: 'unmapped_status', received: status });
  }

  const admin = createClient(SUPABASE_URL, SRV_KEY, { auth: { persistSession: false } });

  // Kimlik adaylarını sırayla dene — ilk eşleşen kazanır.
  let lastResult: any = null;
  for (const candidate of orderIds) {
    const { data, error } = await admin.rpc('bbk_apply_delivery_status', {
      p_tracking_no: candidate,
      p_status: mapped,
      p_note: null,
    });
    if (error) {
      console.error('bbk_apply_delivery_status hata:', error.message);
      return json({ ok: false, message: error.message }, 500);
    }
    lastResult = data;
    if ((data as any)?.ok === true) {
      console.log(`banabikurye-callback: ${candidate} → ${mapped}`, JSON.stringify(data));
      return json({ ok: true, matched: candidate, result: data });
    }
  }

  console.warn(`banabikurye-callback: eşleşen teslimat yok. adaylar=${orderIds.join(',')} durum=${mapped}`);
  return json({ ok: true, ignored: 'delivery_not_found', tried: orderIds, result: lastResult });
});
