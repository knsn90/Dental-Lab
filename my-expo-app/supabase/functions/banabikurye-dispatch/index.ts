/**
 * banabikurye-dispatch — BanaBiKurye Business API 1.8 köprüsü (lab-bazlı).
 *
 *   Her lab KENDİ üyeliğinin `X-DV-Auth-Token`'ını kullanır (provider_credentials,
 *   type='courier', provider='banabikurye'). Token tarayıcıdan doğrudan çağrılamaz
 *   (CORS + gizlilik) → tüm istekler bu edge function üzerinden server-side gider.
 *
 *   Action'lar:
 *     • test          → GET /client (bağlantı doğrulama). Token body'de gelir.
 *     • places_search → Google Places (lab maps anahtarı) ile ünvandan adres ara.
 *     • calculate     → POST /calculate-order (fiyat teklifi).
 *     • create        → POST /create-order (kurye çağır).
 *     • cancel        → POST /cancel-order.
 *     • track         → /courier + sipariş durumu → delivery_status'a maplenir.
 *
 *   Adres: teslim noktası varsayılan olarak work_order → klinik/hekim'den çözülür.
 *   Ama BanaBiKurye'de ünvan-arama yok (serbest metin + Google geocode). Bu yüzden
 *   places_search ile Google Places'ten doğru adres+konum bulunur, lab onaylar ve
 *   calculate/create'e dest_address/dest_lat/dest_lng OVERRIDE olarak geçilir.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BASE: Record<string, string> = {
  sandbox:    'https://robotapitest.banabikurye.com/api/business/1.8',
  production: 'https://robot.banabikurye.com/api/business/1.8',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SRV_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;

interface ReqBody {
  action:        'test' | 'places_search' | 'calculate' | 'create' | 'edit' | 'cancel' | 'track';
  auth_token?:   string;                 // yalnız 'test'
  environment?:  'sandbox' | 'production';
  work_order_id?: string;
  order_id?:     string;
  query?:        string;                 // places_search: arama metni (boşsa klinik ünvanı)
  dest_address?: string;                 // calculate/create override
  dest_lat?:     string;
  dest_lng?:     string;
  dest_phone?:   string;
  notes?:        string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  let body: ReqBody;
  try { body = await req.json() as ReqBody; }
  catch { return json({ ok: false, message: 'invalid json' }); }

  // ── test: token body'de (kayıt öncesi doğrulama) ──
  if (body.action === 'test') {
    const env = body.environment === 'production' ? 'production' : 'sandbox';
    const token = (body.auth_token ?? '').trim();
    if (!token) return json({ ok: false, message: 'auth_token gerekli' });
    const r = await bbkGet(env, token, '/client');
    if (r.ok && r.data?.is_successful !== false) {
      const c = r.data?.client ?? r.data;
      return json({ ok: true, environment: env, client_name: c?.name ?? c?.company_name ?? c?.title ?? null });
    }
    return json({ ok: false, message: `Bağlantı reddedildi: ${bbkErr(r)}` });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ ok: false, message: 'auth required' });
  // ANON key + kullanıcı JWT → auth.uid() çözülür, get_my_lab_id() çalışır.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(SUPABASE_URL, SRV_KEY, { auth: { persistSession: false } });

  // ── places_search: Google Places ile ünvandan adres ara (lab maps anahtarı) ──
  if (body.action === 'places_search') {
    const { data: mapsRows } = await userClient.rpc('get_active_provider', { p_type: 'maps' });
    const maps = Array.isArray(mapsRows) ? mapsRows[0] : mapsRows;
    const apiKey = maps?.provider === 'google-maps' ? maps?.credentials?.api_key : null;
    if (!apiKey) {
      return json({ ok: false, message: 'Google Maps anahtarı yok. Ayarlar → Entegrasyonlar → Harita → Google Maps (Places API açık) ekleyin.' });
    }
    let q = (body.query ?? '').trim();
    if (!q && body.work_order_id) {
      const dst = await resolveDest(admin, body.work_order_id);
      q = [dst.clinic, dst.address].filter(Boolean).join(' ').trim() || dst.name;
    }
    if (!q) return json({ ok: false, message: 'Arama için klinik ünvanı/adres gerekli' });
    const places = await googlePlacesSearch(apiKey, q);
    return json({ ok: true, query: q, results: places });
  }

  // ── courier kimliği (cancel/track/calculate/create) ──
  const { data: provRows, error: provErr } = await userClient.rpc('get_active_provider', { p_type: 'courier' });
  if (provErr) return json({ ok: false, message: 'Kimlik okunamadı: ' + provErr.message });
  const prov = Array.isArray(provRows) ? provRows[0] : provRows;
  if (!prov?.credentials?.auth_token) {
    return json({ ok: false, message: 'Aktif BanaBiKurye entegrasyonu yok. Ayarlar → Entegrasyonlar → Kurye.' });
  }
  const env   = prov.environment === 'production' ? 'production' : 'sandbox';
  const token = String(prov.credentials.auth_token).trim();
  const cred  = prov.credentials as Record<string, string>;

  // ── cancel ──
  if (body.action === 'cancel') {
    if (!body.order_id) return json({ ok: false, message: 'order_id gerekli' });
    const r = await bbkPost(env, token, '/cancel-order', { order_id: body.order_id });
    if (r.ok && r.data?.is_successful !== false) return json({ ok: true, order: r.data?.order ?? null });
    return json({ ok: false, message: bbkErr(r) });
  }

  // ── edit ── çağrılmış siparişin teslim adresini/notunu düzenle (/edit-order)
  // edit-order point-ID ile çalışır: mevcut noktaları çekip ID'leriyle geri gönderir,
  // sadece teslim (son) noktanın adresini/konumunu/notunu değiştirir.
  if (body.action === 'edit') {
    if (!body.order_id) return json({ ok: false, message: 'order_id gerekli' });
    const o = await bbkGet(env, token, '/orders');
    const list = o.data?.orders ?? (Array.isArray(o.data) ? o.data : []);
    const found = Array.isArray(list)
      ? list.find((x: any) => x?.order_id === body.order_id || x?.order_name === body.order_id)
      : null;
    if (!found) return json({ ok: false, message: 'Sipariş bulunamadı (düzenleme için). İptal edip yeniden çağırın.', debug_sample: list?.[0] ?? null });
    const points = found.points ?? found.route?.points ?? [];
    if (!Array.isArray(points) || points.length < 2) {
      return json({ ok: false, message: 'Sipariş noktaları okunamadı — iptal edip yeniden çağırın.', debug_points: points });
    }
    const lastIdx = points.length - 1; // teslim noktası
    const newPoints = points.map((p: any, i: number) => {
      const cp = p.contact_person ?? { name: p.contact_person_name, phone: p.contact_person_phone };
      const pt: any = { id: p.id, address: p.address, contact_person: cp };
      if (p.latitude && p.longitude) { pt.latitude = p.latitude; pt.longitude = p.longitude; }
      if (i === lastIdx) {
        if (body.dest_address) pt.address = body.dest_address;
        if (body.dest_lat && body.dest_lng) { pt.latitude = body.dest_lat; pt.longitude = body.dest_lng; }
        if (body.dest_phone) pt.contact_person = { ...cp, phone: normPhone(body.dest_phone) };
        if (body.notes != null) pt.comment = body.notes;
      }
      return pt;
    });
    const r = await bbkPost(env, token, '/edit-order', { order_id: body.order_id, points: newPoints });
    if (!r.ok || r.data?.is_successful === false) return json({ ok: false, message: bbkErr(r), debug_sent: newPoints });
    const order = r.data?.order ?? r.data;
    return json({ ok: true, price: order?.payment_amount ?? null, order_id: order?.order_id ?? body.order_id, status: order?.status ?? null });
  }

  // ── track ──
  if (body.action === 'track') {
    if (!body.order_id) return json({ ok: false, message: 'order_id gerekli' });
    const r = await bbkGet(env, token, `/courier?order_id=${encodeURIComponent(body.order_id)}`);
    let bbkStatus: string | null = r.data?.order?.status ?? r.data?.status ?? null;
    let courier = r.data?.courier ?? (r.data?.order?.courier ?? null);
    if (!bbkStatus) {
      const o = await bbkGet(env, token, '/orders');
      const list = o.data?.orders ?? (Array.isArray(o.data) ? o.data : []);
      const found = Array.isArray(list)
        ? list.find((x: any) => x?.order_id === body.order_id || x?.order_name === body.order_id)
        : null;
      if (found) { bbkStatus = found.status ?? null; courier = courier ?? found.courier ?? null; }
    }
    return json({ ok: true, bbk_status: bbkStatus, delivery_status: mapStatus(bbkStatus), courier });
  }

  // ── calculate / create ──
  if (!body.work_order_id) return json({ ok: false, message: 'work_order_id gerekli' });
  const dst = await resolveDest(admin, body.work_order_id);

  // Teslim adresi: override (lab Google Places'ten onayladı) > klinik kaydı
  const destAddr  = (body.dest_address ?? '').trim() || dst.address;
  const destPhone = normPhone((body.dest_phone ?? '').trim() || dst.phone);
  const destName  = dst.name;

  if (!destAddr) return json({ ok: false, message: 'Teslim adresi yok — Google Places ile arayıp seçin ya da kliniğe adres girin.' });
  if (!destPhone) return json({ ok: false, message: 'Teslim telefonu yok — hekim telefonu tanımlı değil.' });

  const pickupPhone = normPhone(cred.pickup_phone ?? '');
  if (!cred.pickup_address || !pickupPhone) {
    return json({ ok: false, message: 'Alış adresi/telefonu eksik — Entegrasyonlar → Kurye ayarından girin.' });
  }

  const destPoint: any = { address: destAddr, contact_person: { name: destName, phone: destPhone } };
  if (body.dest_lat && body.dest_lng) { destPoint.latitude = body.dest_lat; destPoint.longitude = body.dest_lng; }
  if (body.notes) destPoint.comment = body.notes;

  const orderBody: any = {
    type: 'standard',
    matter: `Siman teslimat — ${dst.order_number ?? body.work_order_id}${dst.clinic ? ' · ' + dst.clinic : ''}`,
    vehicle_type_id: 8,
    is_contact_person_notification_enabled: true,
    points: [
      {
        address: cred.pickup_address,
        contact_person: { name: cred.pickup_contact_name || 'Laboratuvar', phone: pickupPhone },
        ...(cred.pickup_lat && cred.pickup_lng ? { latitude: cred.pickup_lat, longitude: cred.pickup_lng } : {}),
      },
      destPoint,
    ],
  };

  const path = body.action === 'create' ? '/create-order' : '/calculate-order';
  const r = await bbkPost(env, token, path, orderBody);
  if (!r.ok || r.data?.is_successful === false) return json({ ok: false, message: bbkErr(r) });
  const order = r.data?.order ?? r.data;
  return json({
    ok: true,
    environment: env,
    price:      order?.payment_amount ?? null,
    order_id:   order?.order_id ?? null,
    order_name: order?.order_name ?? null,
    status:     order?.status ?? null,
    order,
  });
});

// ── Teslim noktası çöz (create_delivery ile aynı kaynak) ────────────────────
async function resolveDest(admin: any, workOrderId: string) {
  const out = { name: 'Alıcı', phone: '', address: '', clinic: '', order_number: null as any };
  const { data: wo } = await admin.from('work_orders').select('order_number, doctor_id').eq('id', workOrderId).maybeSingle();
  if (!wo) return out;
  out.order_number = wo.order_number;
  const { data: doc } = await admin.from('doctors').select('full_name, phone, clinic_id').eq('id', wo.doctor_id).maybeSingle();
  if (doc) {
    out.name = doc.full_name ?? out.name;
    out.phone = doc.phone ?? '';
    if (doc.clinic_id) {
      const { data: cl } = await admin.from('clinics').select('name, address').eq('id', doc.clinic_id).maybeSingle();
      if (cl) { out.address = cl.address ?? ''; out.clinic = cl.name ?? ''; }
    }
  } else {
    const { data: pr } = await admin.from('profiles').select('full_name, phone').eq('id', wo.doctor_id).maybeSingle();
    if (pr) { out.name = pr.full_name ?? out.name; out.phone = pr.phone ?? ''; }
  }
  return out;
}

// ── Google Places API (New) — searchText (server-side, lab anahtarı) ────────
async function googlePlacesSearch(apiKey: string, query: string) {
  try {
    const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify({ textQuery: query, languageCode: 'tr', regionCode: 'TR' }),
    });
    const data: any = await resp.json().catch(() => null);
    if (!resp.ok) return [];
    return (data?.places ?? []).slice(0, 6).map((p: any) => ({
      name:    p?.displayName?.text ?? '',
      address: p?.formattedAddress ?? '',
      lat:     p?.location?.latitude != null ? String(p.location.latitude) : null,
      lng:     p?.location?.longitude != null ? String(p.location.longitude) : null,
    })).filter((x: any) => x.address);
  } catch { return []; }
}

// ── BanaBiKurye HTTP ────────────────────────────────────────────────────────
async function bbkGet(env: string, token: string, path: string) {
  try {
    const resp = await fetch(`${BASE[env]}${path}`, {
      method: 'GET',
      headers: { 'X-DV-Auth-Token': token, 'content-type': 'application/json' },
    });
    let data: any = null; try { data = await resp.json(); } catch { /* */ }
    return { ok: resp.ok, status: resp.status, data };
  } catch (e: any) { return { ok: false, status: 0, data: null, netErr: e?.message ?? String(e) }; }
}
async function bbkPost(env: string, token: string, path: string, payload: unknown) {
  try {
    const resp = await fetch(`${BASE[env]}${path}`, {
      method: 'POST',
      headers: { 'X-DV-Auth-Token': token, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let data: any = null; try { data = await resp.json(); } catch { /* */ }
    return { ok: resp.ok, status: resp.status, data };
  } catch (e: any) { return { ok: false, status: 0, data: null, netErr: e?.message ?? String(e) }; }
}
function bbkErr(r: any): string {
  if (r?.netErr) return 'Ağ hatası: ' + r.netErr;
  if (Array.isArray(r?.data?.errors) && r.data.errors.length) return String(r.data.errors[0]?.message ?? r.data.errors[0]);
  return `HTTP ${r?.status ?? '?'}`;
}
function normPhone(raw: string): string {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10) d = '90' + d;
  return d;
}
function mapStatus(s: string | null): string | null {
  switch (s) {
    case 'new': case 'available': return 'atandi';
    case 'active': case 'delayed': return 'yolda';
    case 'completed': return 'teslim_edildi';
    case 'canceled': return 'iptal';
    default: return null;
  }
}
function json(b: unknown, status = 200): Response {
  return new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', ...CORS } });
}
