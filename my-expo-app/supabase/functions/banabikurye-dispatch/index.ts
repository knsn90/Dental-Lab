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
 *     • cancel        → POST /cancel-order. Çok noktalıda yalnız delivery_id'li (o nokta)
 *                       ya da cancel_all:true ile (tüm sipariş).
 *     • cancel_point  → çok noktalı siparişte TEK teslim noktasını /edit-order ile çıkarır.
 *     • track         → /courier + sipariş durumu → delivery_status'a maplenir.
 *
 *   Adres: teslim noktası varsayılan olarak work_order → klinik/hekim'den çözülür.
 *   Ama BanaBiKurye'de ünvan-arama yok (serbest metin + Google geocode). Bu yüzden
 *   places_search ile Google Places'ten doğru adres+konum bulunur, lab onaylar ve
 *   calculate/create'e dest_address/dest_lat/dest_lng OVERRIDE olarak geçilir.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { applyBbkProof, runInBackground } from '../_shared/bbkProofApply.ts';
import { makePointRef, applyPointsFromOrder, hasPointRows } from '../_shared/bbkMultiDrop.ts';

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
  action:        'test' | 'places_search' | 'calculate' | 'create' | 'edit' | 'cancel' | 'cancel_point' | 'track' | 'bank_cards';
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
  direction?:      string;               // 'lab_to_clinic' (alım lab) | 'clinic_to_lab' (alım klinik) | 'other_to_other' (A→B, lab yok)
  // A→B (other_to_other): alım noktası — lab adresi yerine bu kullanılır. dest_* teslim noktasıdır.
  origin_name?:    string;
  origin_address?: string;
  origin_phone?:   string;
  origin_lat?:     string;
  origin_lng?:     string;
  // ── Çok noktalı teslimat (multi-drop): 1 alım (lab) + N teslim ──
  // drops ≥ 2 verilirse calculate/create tek siparişte çok nokta kurar; create ayrıca
  // her nokta için teslimat satırını AYNI istekte açar (create_multi_drop_deliveries).
  drops?: Array<{
    work_order_id?: string;
    direction?: 'lab_to_clinic' | 'lab_to_other';
    dest_name?: string;
    dest_address?: string;
    dest_lat?: string;
    dest_lng?: string;
    dest_phone?: string;
    note?: string;                       // kuryeye nokta notu (point.note)
    stage_snapshot?: string;
  }>;
  optimize_route?: boolean;              // is_route_optimizer_enabled
  delivery_id?: string;                  // cancel/cancel_point/track: hangi nokta satırı
  cancel_all?: boolean;                  // cancel: çok noktalı siparişin TAMAMI
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

  // ── Kiracı doğrulaması ──────────────────────────────────────────────────────
  // Gövdeden gelen work_order_id / extra_work_order_ids çağıranın lab'ına ait mi?
  // Kontrol RLS-kapsamlı userClient ile yapılır: satır YALNIZ çağıranın kiracısına
  // aitse döner (tenant yoksa/başka lab'sa boş) → servis-rol (admin) çağrısı
  // YAPILMADAN 403 ile reddedilir. Böylece başka bir lab'ın work_order_id'siyle
  // hekim/klinik PII'si (ad/telefon/adres) sızdırılamaz.
  const denyTenant = () => json({ ok: false, error: 'Bu kayıt sizin laboratuvarınıza ait değil', message: 'Bu kayıt sizin laboratuvarınıza ait değil' }, 403);
  const ownsWorkOrder = async (id?: string): Promise<boolean> => {
    if (!id) return false;
    const { data } = await userClient.from('work_orders').select('id').eq('id', id).maybeSingle();
    return !!data;
  };
  const ownsWorkOrders = async (ids: string[]): Promise<boolean> => {
    const uniq = [...new Set(ids.filter(Boolean))];
    if (!uniq.length) return true;
    const { data } = await userClient.from('work_orders').select('id').in('id', uniq);
    return (data?.length ?? 0) === uniq.length;
  };

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
      if (!(await ownsWorkOrder(body.work_order_id))) return denyTenant();
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
  if (body.action === 'cancel' || body.action === 'cancel_point') {
    if (!body.order_id) return json({ ok: false, message: 'order_id gerekli' });
    const orderId = String(body.order_id);
    // Çok noktalı siparişte düz iptal TÜM noktaları öldürür → yalnız açık niyetle.
    const multi = await hasPointRows(userClient, orderId);
    if (multi && body.delivery_id && !body.cancel_all) {
      return await cancelPoint(orderId, String(body.delivery_id));
    }
    if (body.action === 'cancel_point') return json({ ok: false, message: 'delivery_id gerekli' });
    if (multi && !body.cancel_all) {
      return json({ ok: false, multi_drop: true, message: 'Bu gönderi çok noktalı — yalnız ilgili teslim noktasını iptal edin ya da tümünü iptali onaylayın.' });
    }
    const r = await bbkPost(env, token, '/cancel-order', { order_id: body.order_id });
    if (r.ok && r.data?.is_successful !== false) {
      if (multi) {
        try { await admin.rpc('bbk_apply_delivery_status', { p_tracking_no: orderId, p_status: 'iptal', p_note: 'Tüm sipariş iptal edildi' }); } catch { /* callback de getirir */ }
      }
      return json({ ok: true, order: r.data?.order ?? null });
    }
    return json({ ok: false, message: bbkErr(r) });
  }

  /**
   * Çok noktalı siparişten TEK teslim noktasını çıkar. BBK'da nokta iptal ucu yok:
   * /edit-order'a kalan noktalar yalnız {point_id} ile gönderilir, gönderilmeyen silinir.
   * Kalan tek teslim noktasıysa sipariş /cancel-order ile iptal edilir. Kurye noktaya
   * uğradıysa / teslim ettiyse reddedilir. Sonra ücret yeni toplamla yeniden bölünür.
   */
  async function cancelPoint(orderId: string, deliveryId: string): Promise<Response> {
    const { data: row } = await userClient.from('deliveries')
      .select('id, status, external_point_ref, external_tracking_no')
      .eq('id', deliveryId).maybeSingle();
    if (!row || String(row.external_tracking_no) !== orderId || !row.external_point_ref) {
      return json({ ok: false, message: 'Teslim noktası bulunamadı.' });
    }
    if (['teslim_edildi', 'iade', 'iptal'].includes(String(row.status))) {
      return json({ ok: false, message: 'Bu teslim noktası zaten kapanmış.' });
    }
    const found: any = (await fetchOrder(orderId));
    if (!found) return json({ ok: false, message: 'Sipariş BanaBiKurye\'de bulunamadı.' });
    const pts: any[] = Array.isArray(found.points) ? found.points : [];
    const drops = pts.slice(1).filter((p: any) => p && p.is_return_point !== true);
    const target = drops.find((p: any) => String(p.client_order_id ?? '') === row.external_point_ref);
    if (!target) return json({ ok: false, message: 'Nokta siparişte bulunamadı (zaten çıkarılmış olabilir).' });
    const tSt = String(target.delivery?.status ?? '').toLowerCase();
    if (target.courier_visit_datetime || ['finished', 'courier_arrived', 'reattempt_finished'].includes(tSt)) {
      return json({ ok: false, message: 'Kurye bu noktaya ulaştı — nokta artık iptal edilemez.' });
    }
    const others = drops.filter((p: any) => p !== target
      && !['canceled', 'deleted'].includes(String(p.delivery?.status ?? '').toLowerCase()));

    let newTotal: number | null = null;
    if (others.length === 0) {
      const c = await bbkPost(env, token, '/cancel-order', { order_id: orderId });
      if (!c.ok || c.data?.is_successful === false) return json({ ok: false, message: bbkErr(c) });
    } else {
      const keep = [pts[0], ...drops.filter((p: any) => p !== target)]
        .map((p: any) => ({ point_id: p.point_id }));
      const e = await bbkPost(env, token, '/edit-order', { order_id: orderId, points: keep });
      if (!e.ok || e.data?.is_successful === false) {
        console.error('[bbk] cancel_point edit FAILED', JSON.stringify(e.data)?.slice(0, 600));
        return json({ ok: false, message: bbkErr(e) });
      }
      const amt = Number(e.data?.order?.payment_amount);
      newTotal = isFinite(amt) && amt > 0 ? amt : null;
    }
    await admin.rpc('bbk_apply_point_status', {
      p_ref: row.external_point_ref, p_status: 'iptal', p_at: null,
      p_point_id: null, p_delivery_id: null, p_tracking_url: null, p_note: 'Nokta iptal edildi',
    });
    if (newTotal != null) await admin.rpc('bbk_split_point_fee', { p_tracking_no: orderId, p_total: newTotal });
    return json({ ok: true, multi_drop: true, cancelled_whole_order: others.length === 0, price: newTotal });
  }

  /** /orders'tan tek siparişi oku (önce order_id filtresi, sonra filtresiz). */
  async function fetchOrder(orderId: string): Promise<any | null> {
    const pick = (d: any) => {
      const l = d?.orders ?? (Array.isArray(d) ? d : []);
      return Array.isArray(l)
        ? (l.find((x: any) => String(x?.order_id) === orderId || String(x?.order_name) === orderId) ?? null)
        : null;
    };
    return pick((await bbkGet(env, token, `/orders?order_id=${encodeURIComponent(orderId)}`)).data)
      ?? pick((await bbkGet(env, token, '/orders')).data);
  }

  // ── edit ── çağrılmış siparişin teslim adresini/notunu düzenle (/edit-order)
  // edit-order point-ID ile çalışır: mevcut noktaları çekip ID'leriyle geri gönderir,
  // sadece teslim (son) noktanın adresini/konumunu/notunu değiştirir.
  if (body.action === 'edit') {
    if (!body.order_id) return json({ ok: false, message: 'order_id gerekli' });
    // Çok noktalıda "son noktayı düzenle" yanlış noktayı değiştirir.
    if (await hasPointRows(userClient, String(body.order_id))) {
      return json({ ok: false, multi_drop: true, message: 'Çok noktalı gönderide adres düzenleme desteklenmiyor — noktayı iptal edip yeniden ekleyin.' });
    }
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

    // Önce doğrudan order_id filtresiyle (bbkProofApply ile aynı) — filtresiz /orders
    // sayfalı döner ve eski/kalabalık hesapta sipariş listede hiç bulunmayabiliyordu.
    const pickOrder = (d: any) => {
      const l = d?.orders ?? (Array.isArray(d) ? d : []);
      return Array.isArray(l)
        ? (l.find((x: any) => String(x?.order_id) === String(body.order_id) || String(x?.order_name) === String(body.order_id)) ?? null)
        : null;
    };
    let found: any = pickOrder((await bbkGet(env, token, `/orders?order_id=${encodeURIComponent(body.order_id)}`)).data);
    if (!found) found = pickOrder((await bbkGet(env, token, '/orders')).data);
    let bbkStatus: string | null = found?.status ?? r.data?.order?.status ?? r.data?.status ?? null;
    courier = courier ?? found?.courier ?? null;

    // ── Gerçek ALIM / TESLİM zamanları (noktaların ziyaret damgasından) ──
    // BanaBiKurye sipariş statüsü kabadır: kurye alıma GİDERKEN de 'active' raporlar,
    // callback bunu 'yolda'ya çevirir ama picked_up_at boş kalır → çizelge yanlış "alındı"
    // gösterirdi. Doğru sinyal noktaların `courier_visit_datetime`'ıdır: nokta 0 = alım,
    // son nokta = teslim. Ziyaret damgası dolduysa gerçek alım/teslim gerçekleşmiştir.
    const pts: any[] = Array.isArray(found?.points) ? found.points : [];

    // ── Çok noktalı sipariş: her nokta kendi satırına, ref ile ──
    // Sipariş düzeyi alım/teslim damgası (son nokta → tüm satırlar) burada YANLIŞ
    // olurdu; ilk teslim edilen noktanın zamanı herkese yazılırdı.
    if (await hasPointRows(admin, String(body.order_id))) {
      const applied = found ? await applyPointsFromOrder(admin, found) : {};
      if (courier) {
        const name = [courier.name, courier.surname].filter(Boolean).join(' ').trim() || null;
        if (name || courier.phone || courier.photo_url) {
          try {
            await admin.from('deliveries')
              .update({ ext_courier_name: name, ext_courier_phone: courier.phone ?? null, ext_courier_photo: courier.photo_url ?? null })
              .eq('external_tracking_no', String(body.order_id)).eq('mode', 'external');
          } catch { /* takip yanıtını bozma */ }
        }
      }
      // İstemci döndürülen durumu satıra geri yazıyordu — çok noktalıda bunu
      // yalnız sorulan noktanın kendi durumu için yap (sunucu zaten uyguladı).
      let own: string | null = null;
      if (body.delivery_id) {
        const { data: me } = await admin.from('deliveries').select('status')
          .eq('id', body.delivery_id).eq('external_tracking_no', String(body.order_id)).maybeSingle();
        own = me?.status ?? null;
      }
      return json({
        ok: true, multi_drop: true,
        bbk_status: bbkStatus,
        delivery_status: own,
        points: Object.keys(applied).length,
        courier,
      });
    }
    // İkinci sinyal: teslim noktasının teslimat durumu. Kurye alım noktasında
    // check-in yapmadan paketi alıp çıkabiliyor (ziyaret damgası boş kalıyor); bu
    // durumda teslim noktası 'parcel_picked_up' → 'courier_arrived' → 'finished' ilerler.
    const dropPt: any = pts.length > 1 ? pts[pts.length - 1] : null;
    const dropDelivStatus = String(dropPt?.delivery?.status ?? dropPt?.delivery_status ?? '').toLowerCase();
    const pickedByStatus = ['parcel_picked_up', 'courier_arrived', 'finished', 'completed'].includes(dropDelivStatus);
    // Teşhis — kişisel veri YOK: yalnız durum kodları ve zaman damgaları.
    console.log('[bbk track]', JSON.stringify({
      order: String(body.order_id), found: !!found, status: found?.status ?? null,
      points: pts.map((p: any) => ({ visit: p?.courier_visit_datetime ?? null, delivery: p?.delivery?.status ?? p?.delivery_status ?? null })),
    }));
    const pickupVisit = pts.length
      ? (pts[0]?.courier_visit_datetime ?? (pickedByStatus ? new Date().toISOString() : null))
      : null;
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

    // 2. dalga 5: sağlayıcı "completed" diyorsa teslimi (callback ile aynı fonksiyonla) uygula,
    // sonra teslim kanıtını yaz — callback gelmese de "Durumu Güncelle" kanıtı getirir.
    if (found && String(found.status ?? '').toLowerCase() === 'completed') {
      try {
        await admin.rpc('bbk_apply_delivery_status', { p_tracking_no: String(body.order_id), p_status: 'teslim_edildi', p_note: null });
      } catch { /* takip yanıtını bozma */ }
      await runInBackground(applyBbkProof(admin, String(body.order_id), found));
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

  // ── çok noktalı calculate / create ──
  if ((body.action === 'calculate' || body.action === 'create') && Array.isArray(body.drops) && body.drops.length >= 2) {
    return await multiDrop();
  }

  async function multiDrop(): Promise<Response> {
    const drops = body.drops!;
    if (drops.length > 98) return json({ ok: false, message: 'En çok 98 teslim noktası olabilir.' });
    const svc = body.service_type || 'standard';
    // API kuralı: endofday yalnız 2 nokta (1 alım + 1 teslim).
    if (svc === 'endofday') return json({ ok: false, message: 'Gün sonu teslimat çok noktalı gönderide kullanılamaz.' });
    const pickupPhone = normPhone(cred.pickup_phone ?? '');
    if (!cred.pickup_address || !pickupPhone) {
      return json({ ok: false, message: 'Alış adresi/telefonu eksik — Entegrasyonlar → Kurye ayarından girin.' });
    }
    const woIds = drops.map(d => d.work_order_id).filter(Boolean) as string[];
    if (new Set(woIds).size !== woIds.length) return json({ ok: false, message: 'Aynı sipariş iki noktada olamaz.' });
    if (!(await ownsWorkOrders(woIds))) return denyTenant();

    const labContactName = cred.pickup_contact_name || 'Laboratuvar';
    const labels: string[] = [];
    const points: any[] = [];
    const rows: any[] = [];
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      const dst = d.work_order_id
        ? await resolveDest(admin, d.work_order_id)
        : { name: '', phone: '', address: '', clinic: '', order_number: null as any };
      const overridden = !!(d.dest_address ?? '').trim();
      const addr  = (d.dest_address ?? '').trim() || dst.address;
      const phone = normPhone((d.dest_phone ?? '').trim() || (overridden ? '' : dst.phone));
      const name  = (d.dest_name ?? '').trim() || (overridden ? '' : dst.name) || labContactName;
      const tag = `${i + 1}. nokta`;
      if (!addr)  return json({ ok: false, message: `${tag}: teslim adresi yok.` });
      if (!phone) return json({ ok: false, message: `${tag}: teslim telefonu yok.` });
      const ref = makePointRef();
      const pt: any = {
        address: addr,
        contact_person: { name, phone },
        client_order_id: ref,
      };
      if (d.dest_lat && d.dest_lng) { pt.latitude = d.dest_lat; pt.longitude = d.dest_lng; }
      if (d.note?.trim()) pt.note = d.note.trim().slice(0, 250);
      if (body.required_start_datetime) {
        pt.required_start_datetime = body.required_start_datetime;
        if (body.required_finish_datetime) pt.required_finish_datetime = body.required_finish_datetime;
      }
      points.push(pt);
      labels.push(dst.order_number ? String(dst.order_number) : (name || tag));
      // Tek noktalı yolla aynı: siparişli nokta adres override'lı olsa da kliniğe
      // TESLİMATTIR (işi kapatır). Dış servise gidiyorsa istemci lab_to_other verir.
      const direction = d.direction ?? (d.work_order_id ? 'lab_to_clinic' : 'lab_to_other');
      rows.push({
        ref,
        work_order_id: d.work_order_id ?? null,
        direction,
        // Siparişli dış adres / serbest nokta: karşı taraf formdan.
        party_name: direction === 'lab_to_other' ? name : null,
        party_address: direction === 'lab_to_other' ? addr : null,
        party_phone: direction === 'lab_to_other' ? phone : null,
        party_lat: direction === 'lab_to_other' ? (d.dest_lat ?? null) : null,
        party_lng: direction === 'lab_to_other' ? (d.dest_lng ?? null) : null,
        note: d.note?.trim() || null,
        stage_snapshot: d.stage_snapshot ?? null,
      });
    }

    const labPoint: any = {
      address: cred.pickup_address,
      contact_person: { name: labContactName, phone: pickupPhone },
      ...(cred.pickup_lat && cred.pickup_lng ? { latitude: cred.pickup_lat, longitude: cred.pickup_lng } : {}),
    };
    const note = [body.content_note?.trim(), body.notes?.trim()].filter(Boolean).join(' · ');
    const base = [`Siman çok noktalı teslimat — ${labels.join(', ')}`, note].filter(Boolean).join(' · ');
    const orderBody: any = {
      type: svc,
      matter: body.action === 'create'
        ? `${base.slice(0, 240)} · #${attemptTag(labels.join('|'))}`
        : base.slice(0, 250),
      vehicle_type_id: body.vehicle_type_id ?? 8,
      is_contact_person_notification_enabled: body.notify_recipient !== false,
      is_route_optimizer_enabled: body.optimize_route === true,
      points: [labPoint, ...points],
    };
    if (body.total_weight_kg != null)  orderBody.total_weight_kg = body.total_weight_kg;
    if (body.insurance_amount != null) orderBody.insurance_amount = body.insurance_amount;
    if (body.promo_code?.trim())       orderBody.promo_code = body.promo_code.trim();
    if (body.loaders_count && body.loaders_count > 0) orderBody.loaders_count = body.loaders_count;
    if (body.payment_method && body.payment_method !== 'cash') {
      orderBody.payment_method = body.payment_method;
      if (body.bank_card_id != null) orderBody.bank_card_id = body.bank_card_id;
    }

    const path = body.action === 'create' ? '/create-order' : '/calculate-order';
    const r = await bbkPost(env, token, path, orderBody);
    if (!r.ok || r.data?.is_successful === false) {
      console.error('[bbk multi] ' + path + ' FAILED status=', r.status, ' resp=', JSON.stringify(r.data)?.slice(0, 800));
      return json({ ok: false, message: bbkErr(r) });
    }
    const order = r.data?.order ?? r.data;
    const price = Number(order?.payment_amount);
    if (body.action !== 'create') {
      return json({ ok: true, environment: env, multi_drop: true, price: isFinite(price) ? price : null, drops: points.length });
    }

    const orderId = order?.order_id != null ? String(order.order_id) : null;
    if (!orderId) return json({ ok: false, message: 'BanaBiKurye sipariş numarası dönmedi — paneli kontrol edin.' });
    // Yanıttaki noktaları ref ile eşle (sıra değil): point_id / delivery_id / takip linki.
    const resPts: any[] = Array.isArray(order?.points) ? order.points : [];
    for (const row of rows) {
      const p = resPts.find((x: any) => String(x?.client_order_id ?? '') === row.ref);
      row.point_id = p?.point_id != null ? String(p.point_id) : null;
      row.delivery_id = p?.delivery_id != null ? String(p.delivery_id) : null;
      row.tracking_url = p?.tracking_url ?? null;
    }
    // Satırlar AYNI istekte — ödenmiş sipariş satırsız kalmasın. Açılamazsa sipariş iptal.
    const { data: made, error: mkErr } = await userClient.rpc('create_multi_drop_deliveries', {
      p_tracking_no: orderId,
      p_fee_total: isFinite(price) && price > 0 ? price : null,
      p_fee_currency: 'TRY',
      p_notes: note || null,
      p_drops: rows,
    });
    if (mkErr) {
      console.error('[bbk multi] satırlar açılamadı, sipariş iptal ediliyor:', mkErr.message);
      const c = await bbkPost(env, token, '/cancel-order', { order_id: orderId });
      const undone = c.ok && c.data?.is_successful !== false;
      return json({
        ok: false,
        message: `Teslimat kayıtları açılamadı (${mkErr.message}). ` + (undone
          ? 'BanaBiKurye siparişi iptal edildi.'
          : `BanaBiKurye siparişi İPTAL EDİLEMEDİ (#${orderId}) — panelden iptal edin.`),
      });
    }
    return json({
      ok: true, environment: env, multi_drop: true,
      order_id: orderId, order_name: order?.order_name ?? null,
      price: isFinite(price) ? price : null,
      deliveries: made,
      refs_echoed: rows.filter(x => x.point_id).length,
    });
  }

  // ── calculate / create ──
  // SERBEST GÖNDERİ: sipariş olmadan da çağrılabilir. O durumda teslim noktası
  // gövdeden gelen dest_* alanlarından kurulur; adres yoksa anlamlı hata döner.
  if (!body.work_order_id && !(body.dest_address ?? '').trim()) {
    return json({ ok: false, message: 'work_order_id ya da dest_address gerekli' });
  }
  // SERBEST GÖNDERİ'de work_order_id YOKTUR — guard yalnız id verilmişse çalışır.
  // Koşulsuz çağrılınca `ownsWorkOrder(undefined)` false dönüyor ve siparişsiz
  // her kurye çağrısı 403 ile reddediliyordu ("non-2xx status code").
  if (body.work_order_id && !(await ownsWorkOrder(body.work_order_id))) return denyTenant();
  const dst = body.work_order_id
    ? await resolveDest(admin, body.work_order_id)
    : { name: 'Alıcı', phone: '', address: '', clinic: '', order_number: null as any };

  // Aynı kuryeyle giden ek işler (aynı klinik): rota/fiyat değişmez, sadece
  // sipariş konusuna (matter) tüm sipariş no'ları yazılır ki kurye ne taşıdığını görsün.
  let orderLabel = String(dst.order_number ?? body.work_order_id ?? 'serbest gönderi');
  const extraIds = Array.isArray(body.extra_work_order_ids) ? body.extra_work_order_ids.filter(Boolean) : [];
  if (extraIds.length) {
    if (!(await ownsWorkOrders(extraIds))) return denyTenant();
    const { data: extras } = await admin.from('work_orders').select('order_number').in('id', extraIds);
    const nums = (extras ?? []).map((x: any) => x.order_number).filter(Boolean);
    if (nums.length) orderLabel += ', ' + nums.join(', ');
  }

  // Teslim adresi: override (lab Google Places'ten onayladı) > klinik kaydı
  const destAddr  = (body.dest_address ?? '').trim() || dst.address;
  // Adres OVERRIDE edilmişse alıcı, siparişin kliniği DEĞİLDİR (dış servis, milling
  // merkezi, serbest gönderi…). O durumda ad/telefon klinikten düşerse kurye yanlış
  // kişiyi arar (2026-09-16, gönderi 7276572: adres Pi Milling, alıcı klinikti).
  // Bilinmiyorsa kliniğe değil LABA düş — en azından gönderiyi yapan taraf.
  const addrOverridden = !!(body.dest_address ?? '').trim();
  const labContactName = cred.pickup_contact_name || 'Laboratuvar';
  const destPhone = normPhone(
    (body.dest_phone ?? '').trim() || (addrOverridden ? (cred.pickup_phone ?? '') : dst.phone),
  );
  const destName  = addrOverridden ? labContactName : dst.name;

  if (!destAddr) return json({ ok: false, message: 'Teslim adresi yok — Google Places ile arayıp seçin ya da kliniğe adres girin.' });
  if (!destPhone) return json({ ok: false, message: 'Teslim telefonu yok — hekim telefonu tanımlı değil.' });

  // A→B: lab hiçbir uçta değil — alım noktası gövdeden gelir, lab alış ayarı gerekmez.
  const outside = body.direction === 'other_to_other';
  const pickupPhone = normPhone(cred.pickup_phone ?? '');
  if (outside) {
    // Siparişe bağlı A→B de olur (ör. klinikten milling'e, sipariş adına): o durumda
    // teslim ucu klinikten VARSAYILMAZ — formdan gelen dest_* zorunlu.
    if (!(body.dest_address ?? '').trim()) return json({ ok: false, message: 'Teslim adresi yok — adres arayıp seçin.' });
    if (!(body.origin_address ?? '').trim()) return json({ ok: false, message: 'Alım adresi yok — adres arayıp seçin.' });
    if (!normPhone(body.origin_phone ?? '')) return json({ ok: false, message: 'Alım noktası telefonu zorunlu.' });
  } else if (!cred.pickup_address || !pickupPhone) {
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

  // A→B: alım = gövdedeki origin_*, teslim = dest_* (clinicPoint). Lab noktası kullanılmaz.
  const outsidePoint: any = outside ? {
    address: (body.origin_address ?? '').trim(),
    contact_person: { name: (body.origin_name ?? '').trim() || 'Gönderen', phone: normPhone(body.origin_phone ?? '') },
    ...(body.origin_lat && body.origin_lng ? { latitude: body.origin_lat, longitude: body.origin_lng } : {}),
  } : null;

  // Yön: klinikten alım → alım klinik, teslim lab (noktalar ters). Aksi → lab→klinik.
  const incoming = body.direction === 'clinic_to_lab';
  const pickupPoint   = outside ? outsidePoint : (incoming ? clinicPoint : labPoint);
  const deliveryPoint = outside ? clinicPoint  : (incoming ? labPoint    : clinicPoint);

  // İleri zamanlı: zaman penceresi TESLİM noktasına. endofday bunu YASAKLAR (API kuralı).
  const svcType = body.service_type || 'standard';
  if (svcType !== 'endofday' && body.required_start_datetime) {
    deliveryPoint.required_start_datetime = body.required_start_datetime;
    if (body.required_finish_datetime) deliveryPoint.required_finish_datetime = body.required_finish_datetime;
  }

  const orderBody: any = {
    type: svcType,
    matter: (() => {
      const base = [`Siman teslimat — ${orderLabel}${dst.clinic ? ' · ' + dst.clinic : ''}`, pointComment]
        .filter(Boolean).join(' · ');
      if (body.action !== 'create') return base.slice(0, 250);
      const tag = attemptTag(`${body.work_order_id ?? ''}|${orderLabel}`);
      return `${base.slice(0, 240)} · #${tag}`;
    })(),
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
/**
 * Çağrı eki — aynı DAKİKA içinde aynı iş için aynı değer, dakika değişince yeni.
 *
 * BanaBiKurye aynı konu + aynı noktalarla gelen ikinci siparişi `order_is_duplicate`
 * ile reddediyor. Bu koruma çift tıklamada işimize yarıyor, ama ödeme hatası gibi
 * GERÇEK bir başarısızlıktan sonra tekrar denemeyi de imkânsız kılıyordu. Dakika
 * kovası ikisini ayırır: saniyeler içindeki tekrar hâlâ engellenir, sonraki
 * dakikadaki yeniden deneme geçer.
 */
function attemptTag(seed: string): string {
  const bucket = Math.floor(Date.now() / 60000);
  let h = 2166136261;
  for (const ch of `${seed}|${bucket}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 4);
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
    // Ham kodlar ("order_is_duplicate") kullanıcıya bir şey anlatmıyor.
    const TR: Record<string, string> = {
      order_is_duplicate:  'Aynı içerikli sipariş az önce gönderilmiş; BanaBiKurye ikincisini engelledi. Bir dakika bekleyip tekrar deneyin ya da panelde bekleyen sipariş varsa iptal edin.',
      card_payment_failed: 'Kart ödemesi başarısız oldu. Kartı kontrol edin ya da ödeme şeklini Nakit seçin.',
    };
    if (parts.length) return parts.map(p => TR[p] ?? p).slice(0, 8).join(' · ');
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
