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
  action:        'test' | 'places_search' | 'calculate' | 'create' | 'edit' | 'cancel' | 'track' | 'bank_cards';
  auth_token?:   string;                 // yalnız 'test'
  environment?:  'sandbox' | 'production';
  work_order_id?: string;
  extra_work_order_ids?: string[];       // aynı kuryeyle gönderilen ek işler (aynı klinik): tek sipariş, çok teslimat satırı; matter'a no'ları yazılır
  order_id?:     string;
  query?:        string;                 // places_search: arama metni (boşsa klinik ünvanı)
  dest_address?: string;                 // calculate/create override
  dest_lat?:     string;
  dest_lng?:     string;
  dest_phone?:   string;
  notes?:        string;
  // ── Gönderi seçenekleri (panel formunun karşılığı) ──
  service_type?:  string;                // order.type: 'standard' | 'endofday' | 'vip_delivery'
  vehicle_type_id?: number;              // 8 = motor (20kg). Araba id'si henüz doğrulanmadı.
  total_weight_kg?: number;              // toplam ağırlık
  insurance_amount?: number;             // güvence bedeli (₺)
  promo_code?:    string;                // indirim kodu
  content_note?:  string;                // içerik etiketi ("Lab sarf malzemesi" vb.) → teslim noktası notu
  required_start_datetime?:  string;     // İleri zamanlı: en erken varış (ISO 8601 +03:00)
  required_finish_datetime?: string;     // İleri zamanlı: en geç varış
  dest_name?:      string;               // teslim noktası alıcı adı override
  dest_building_no?: string;             // teslim adres detayı
  dest_floor?:     string;
  dest_apartment?: string;
  dest_intercom?:  string;
  loaders_count?:  number;               // yükleme/boşaltma yardımcı sayısı
  notify_recipient?: boolean;            // SMS ile alıcıyı bildir (varsayılan true)
  payment_method?: string;               // 'cash' (varsayılan) | 'bank_card'
  bank_card_id?:   number;               // bank_card seçilince zorunlu (/bank-cards'tan)
  direction?:      string;               // 'lab_to_clinic' (alım lab) | 'clinic_to_lab' (alım klinik)
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
  // Sağlayıcı ADIYLA okunuyor: kurye tipinde birden çok entegrasyon aynı anda
  // aktif olabilir (BanaBiKurye + Shipink/Navlungo) ve get_active_provider
  // tipteki İLK aktif satırı döndürür — yanlış sağlayıcının kaydına düşmemek
  // için filtre burada. RLS (lab_id = get_my_lab_id()) kiracıyı sınırlar.
  const { data: prov, error: provErr } = await userClient
    .from('provider_credentials')
    .select('id, environment, credentials')
    .eq('type', 'courier').eq('provider', 'banabikurye').eq('is_active', true)
    .maybeSingle();
  if (provErr) return json({ ok: false, message: 'Kimlik okunamadı: ' + provErr.message });
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
    // /courier → CANLI konum + kimlik. /orders → sipariş + NOKTALAR (alım/teslim
    // ziyaret zamanları). İkisi ayrı: /courier nokta taşımaz, o yüzden /orders da çekilir.
    const r = await bbkGet(env, token, `/courier?order_id=${encodeURIComponent(body.order_id)}`);
    let courier = r.data?.courier ?? (r.data?.order?.courier ?? null);

    const o = await bbkGet(env, token, '/orders');
    const list = o.data?.orders ?? (Array.isArray(o.data) ? o.data : []);
    const found = Array.isArray(list)
      ? list.find((x: any) => x?.order_id === body.order_id || x?.order_name === body.order_id)
      : null;
    let bbkStatus: string | null = found?.status ?? r.data?.order?.status ?? r.data?.status ?? null;
    courier = courier ?? found?.courier ?? null;

    // ── Gerçek ALIM / TESLİM zamanları (noktaların ziyaret damgasından) ──
    // BanaBiKurye sipariş statüsü kabadır: kurye alıma GİDERKEN de 'active' raporlar,
    // callback bunu 'yolda'ya çevirir ama picked_up_at boş kalır → çizelge yanlış "alındı"
    // gösterirdi. Doğru sinyal noktaların `courier_visit_datetime`'ıdır: nokta 0 = alım,
    // son nokta = teslim. Ziyaret damgası dolduysa gerçek alım/teslim gerçekleşmiştir.
    const pts: any[] = Array.isArray(found?.points) ? found.points : [];
    const pickupVisit = pts.length ? (pts[0]?.courier_visit_datetime ?? null) : null;
    const dropVisit   = pts.length > 1 ? (pts[pts.length - 1]?.courier_visit_datetime ?? null) : null;
    if (pickupVisit) {
      // Yalnız boşken yaz — üzerine yazma (idempotent). teslim_alindi'ye de yükselt ki
      // liste rozeti "ALINDI" göstersin (callback 'completed' gelince teslim_edildi'ye çeker).
      try {
        await admin.from('deliveries')
          .update({ picked_up_at: pickupVisit })
          .eq('external_tracking_no', String(body.order_id)).eq('mode', 'external')
          .is('picked_up_at', null);
      } catch { /* takip yanıtını bozma */ }
    }
    if (dropVisit) {
      try {
        await admin.from('deliveries')
          .update({ delivered_at: dropVisit })
          .eq('external_tracking_no', String(body.order_id)).eq('mode', 'external')
          .is('delivered_at', null);
      } catch { /* takip yanıtını bozma */ }
    }

    // Kurye kimliğini teslimat kaydına kalıcılaştır — geçmiş gönderilerde
    // (teslim/iptal) API'siz gösterim için. Konum bilerek yazılmaz (bayat olur),
    // yalnız ad/telefon/avatar. Service role → RLS'i atlar, kim bakarsa baksın dolar.
    if (courier) {
      const name = [courier.name, courier.surname].filter(Boolean).join(' ').trim() || null;
      const phone = courier.phone ?? null;
      const photo = courier.photo_url ?? null;
      if (name || phone || photo) {
        try {
          await admin.from('deliveries')
            .update({ ext_courier_name: name, ext_courier_phone: phone, ext_courier_photo: photo })
            .eq('external_tracking_no', String(body.order_id))
            .eq('mode', 'external');
        } catch { /* kalıcılaştırma başarısız olsa da takip yanıtı bozulmasın */ }
      }
    }

    return json({
      ok: true,
      bbk_status: bbkStatus,
      delivery_status: mapStatus(bbkStatus),
      picked_up_at: pickupVisit,
      delivered_at: dropVisit,
      courier,
    });
  }

  // ── bank_cards ── hesabın kayıtlı banka kartlarını listeler (bank_card ödemesi için).
  if (body.action === 'bank_cards') {
    const r = await bbkGet(env, token, '/bank-cards');
    if (r.ok && r.data?.is_successful !== false) {
      const raw = r.data?.bank_cards ?? r.data?.cards ?? (Array.isArray(r.data) ? r.data : []);
      const cards = (Array.isArray(raw) ? raw : []).map((c: any) => ({
        id:    c?.id ?? c?.bank_card_id ?? c?.card_id ?? null,
        name:  c?.name ?? c?.title ?? c?.card_name ?? c?.holder_name ?? null,
        last4: c?.last_four ?? c?.last4 ?? (c?.number ? String(c.number).replace(/\s/g, '').slice(-4) : (c?.masked_number ? String(c.masked_number).slice(-4) : null)),
        brand: c?.brand ?? c?.type ?? c?.bank_name ?? null,
      })).filter((c: any) => c.id != null);
      return json({ ok: true, cards });
    }
    return json({ ok: false, message: bbkErr(r) });
  }

  // ── calculate / create ──
  if (!body.work_order_id) return json({ ok: false, message: 'work_order_id gerekli' });
  const dst = await resolveDest(admin, body.work_order_id);

  // Aynı kuryeyle giden ek işler (aynı klinik): rota/fiyat değişmez, sadece
  // sipariş konusuna (matter) tüm sipariş no'ları yazılır ki kurye ne taşıdığını görsün.
  let orderLabel = String(dst.order_number ?? body.work_order_id);
  const extraIds = Array.isArray(body.extra_work_order_ids) ? body.extra_work_order_ids.filter(Boolean) : [];
  if (extraIds.length) {
    const { data: extras } = await admin.from('work_orders').select('order_number').in('id', extraIds);
    const nums = (extras ?? []).map((x: any) => x.order_number).filter(Boolean);
    if (nums.length) orderLabel += ', ' + nums.join(', ');
  }

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

  // İçerik notu + serbest not → sipariş KONUSUNA (matter) yazılır.
  // NOT: BanaBiKurye point objesinde `comment` alanı YOK (API "unknown" der →
  // invalid_parameters, tüm sipariş reddedilir). Bu yüzden nota matter'a taşınır.
  const pointComment = [body.content_note?.trim(), body.notes?.trim()].filter(Boolean).join(' · ') || undefined;

  // İki uç: klinik/hekim (adres aramasından çözülen değişken uç) ve laboratuvar (sabit).
  // Adres detayı / alıcı override / içerik notu klinik ucuna aittir.
  const clinicPoint: any = {
    address: destAddr,
    contact_person: { name: (body.dest_name?.trim() || destName), phone: destPhone },
  };
  if (body.dest_lat && body.dest_lng) { clinicPoint.latitude = body.dest_lat; clinicPoint.longitude = body.dest_lng; }
  if (body.dest_building_no?.trim()) clinicPoint.building_number  = body.dest_building_no.trim();
  if (body.dest_floor?.trim())       clinicPoint.floor_number     = body.dest_floor.trim();
  if (body.dest_apartment?.trim())   clinicPoint.apartment_number = body.dest_apartment.trim();
  if (body.dest_intercom?.trim())    clinicPoint.intercom_code    = body.dest_intercom.trim();

  const labPoint: any = {
    address: cred.pickup_address,
    contact_person: { name: cred.pickup_contact_name || 'Laboratuvar', phone: pickupPhone },
    ...(cred.pickup_lat && cred.pickup_lng ? { latitude: cred.pickup_lat, longitude: cred.pickup_lng } : {}),
  };

  // Yön: klinikten alım → alım klinik, teslim lab (noktalar ters). Aksi → lab→klinik.
  const incoming = body.direction === 'clinic_to_lab';
  const pickupPoint   = incoming ? clinicPoint : labPoint;
  const deliveryPoint = incoming ? labPoint    : clinicPoint;

  // İleri zamanlı: zaman penceresi TESLİM noktasına. endofday bunu YASAKLAR (API kuralı).
  const svcType = body.service_type || 'standard';
  if (svcType !== 'endofday' && body.required_start_datetime) {
    deliveryPoint.required_start_datetime = body.required_start_datetime;
    if (body.required_finish_datetime) deliveryPoint.required_finish_datetime = body.required_finish_datetime;
  }

  const orderBody: any = {
    type: svcType,
    matter: [`Siman teslimat — ${orderLabel}${dst.clinic ? ' · ' + dst.clinic : ''}`, pointComment].filter(Boolean).join(' · ').slice(0, 250),
    vehicle_type_id: body.vehicle_type_id ?? 8,
    is_contact_person_notification_enabled: body.notify_recipient !== false,
    points: [pickupPoint, deliveryPoint],
  };
  if (body.total_weight_kg != null)  orderBody.total_weight_kg = body.total_weight_kg;
  if (body.insurance_amount != null) orderBody.insurance_amount = body.insurance_amount;
  if (body.promo_code?.trim())       orderBody.promo_code = body.promo_code.trim();
  if (body.loaders_count && body.loaders_count > 0) orderBody.loaders_count = body.loaders_count;
  // Ödeme şekli: yalnız varsayılandan farklıysa gönder (cash zaten hesap varsayılanı).
  if (body.payment_method && body.payment_method !== 'cash') {
    orderBody.payment_method = body.payment_method;
    if (body.bank_card_id != null) orderBody.bank_card_id = body.bank_card_id;
  }

  const path = body.action === 'create' ? '/create-order' : '/calculate-order';
  const r = await bbkPost(env, token, path, orderBody);
  if (!r.ok || r.data?.is_successful === false) {
    console.error('[bbk] ' + path + ' FAILED status=', r.status, ' resp=', JSON.stringify(r.data)?.slice(0, 800), ' sent=', JSON.stringify(orderBody)?.slice(0, 800));
    return json({ ok: false, message: bbkErr(r), debug: { status: r.status, resp: r.data, sent: orderBody } });
  }
  const order = r.data?.order ?? r.data;
  // Kalem dökümü — panelin fiyat satırlarının karşılığı (calculate-order breakdown).
  const num = (v: any) => (v == null ? null : Number(v));
  const breakdown = order ? {
    delivery:       num(order.delivery_fee_amount),
    weight:         num(order.weight_fee_amount),
    insurance:      num(order.insurance_fee_amount),
    loading:        num(order.loading_fee_amount),
    money_transfer: num(order.money_transfer_fee_amount),
    cod:            num(order.cod_fee_amount),
    return:         num(order.return_fee_amount),
    waiting:        num(order.waiting_fee_amount),
  } : null;
  return json({
    ok: true,
    environment: env,
    price:      order?.payment_amount ?? null,
    breakdown,
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
  const d = r?.data;
  if (d && typeof d === 'object') {
    // BanaBiKurye çeşitli şekiller döndürebilir: errors[], error, messages,
    // validation_errors{field:[msg]}. Hepsini "alan: mesaj" olarak düzleştir.
    const parts: string[] = [];
    const push = (e: any, key?: string) => {
      if (e == null) return;
      if (typeof e === 'string' || typeof e === 'number') { parts.push(key ? `${key}: ${e}` : String(e)); return; }
      if (Array.isArray(e)) { e.forEach((x) => push(x, key)); return; }
      if (typeof e === 'object') {
        const msg = e.message ?? e.msg ?? e.detail ?? e.description ?? null;
        const fld = e.field ?? e.parameter ?? e.name ?? key ?? null;
        if (msg) parts.push(fld ? `${fld}: ${msg}` : String(msg));
        else Object.entries(e).forEach(([k, v]) => push(v, k));
      }
    };
    push(d.errors ?? d.error ?? d.messages ?? null);
    // Alan bazlı hatalar: { points: [null, {comment:["unknown"]}] } gibi → "comment: unknown"
    push(d.parameter_errors ?? d.validation_errors ?? null);
    if (parts.length) return parts.slice(0, 8).join(' · ');
    if (d.message) return String(d.message);
    // Bilinmeyen şekil → ham JSON (kısaltılmış) ki hangi alanın sorunlu olduğu görülsün.
    try { return JSON.stringify(d).slice(0, 500); } catch { /* */ }
  }
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
