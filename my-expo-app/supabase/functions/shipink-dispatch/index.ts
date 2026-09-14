/**
 * shipink-dispatch — Shipink REST API köprüsü (lab-bazlı).
 *
 * Shipink bir KARGO TOPLAYICISIDIR (Navlungo'ya benzer), BanaBiKurye gibi anlık
 * motokurye değil. Navlungo'dan ayrılan yanları:
 *   • Gönderi TEK adımda oluşmaz: önce `POST /orders` ile bir sipariş, sonra o
 *     siparişin id'siyle `POST /shipments`. Sipariş yaratılmadan gönderi olmaz.
 *   • Gönderici adresi "warehouse" (depo) kaydıdır; bir kez oluşturulup dönen
 *     uuid saklanır — Navlungo'daki adres defteri mantığının karşılığı.
 *   • Taşıyıcı seçimi iki kimlikle yapılır: carrier_service_id (hizmet) +
 *     carrier_account_id (labın Shipink'e bağladığı taşıyıcı hesabı). Kullanıcı
 *     yalnız hizmeti seçer; hesabı bu fonksiyon /carrier-accounts içinden çözer.
 *   • Shipink'in KENDİ taşıyıcı hesabıyla (provider='shipink') gönderide ödeme
 *     kartı zorunlu → card_id. Labın kendi anlaşmalı hesabında gerekmez.
 *
 * TÜRKÇE ADRES TUZAĞI: Shipink'te `state` = İL, `city` = İLÇE
 * (dokümandaki örnek: city "Maltepe", state "İstanbul"). Ters yazılırsa taşıyıcı
 * gönderiyi reddeder. Google Places'ten gelen il→state, ilçe→city eşlenir.
 *
 * Yetkilendirme: sabit anahtar yok. `POST /token { username, password }` ile
 * ~1 saatlik access_token + refresh_token alınır. Token provider_credentials
 * .credentials içinde önbelleklenir (_token/_token_exp/_refresh) ve süresi
 * dolunca önce refresh_token ile, o da olmazsa parolayla tazelenir. Bu alanları
 * yalnız servis rolü yazar; istemci hiçbir zaman görmez.
 *
 * Action'lar:
 *   • test            → kimlik doğrula (kayıt öncesi; kimlik body'de gelir)
 *   • carrier_accounts→ GET /carrier-accounts (bağlı taşıyıcılar + hizmetleri)
 *   • cards           → GET /cards (Shipink hesabıyla gönderide gerekli)
 *   • warehouses      → GET /warehouses
 *   • warehouse_sync  → lab alış adresini depo olarak yaz/güncelle → warehouse_id
 *   • rates           → POST /rates (fiyat sorgula, gönderi oluşturmaz)
 *   • create          → POST /orders + POST /shipments → takip no + etiket
 *   • check           → GET /trackings/{no} → durum eşle + deliveries güncelle
 *   • cancel          → DELETE /shipments/{id}
 *   • label           → GET /shipments/{id} → etiket bağlantıları
 *
 * Deploy:
 *   supabase functions deploy shipink-dispatch --project-ref kjwjxqfdsxkxgcgophdy \
 *     --workdir ~/Desktop/DentalSoftware/my-expo-app --use-api
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const HOST: Record<string, string> = {
  sandbox:    'https://api.dev.shipink.io',
  production: 'https://api.shipink.io',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SRV_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;

type Env = 'sandbox' | 'production';

interface Pkg {
  weight?: number; weight_unit?: string;
  length?: number; width?: number; height?: number; dimension_unit?: string;
}

interface ReqBody {
  action:
    | 'test' | 'carrier_accounts' | 'cards' | 'warehouses' | 'warehouse_sync'
    | 'rates' | 'create' | 'check' | 'cancel' | 'label';
  /** yalnız 'test' — kayıt öncesi doğrulama, kimlik henüz DB'de yok */
  username?: string;
  password?: string;
  environment?: Env;
  /** rates / create — alıcı (Shipink: state=il, city=ilçe) */
  work_order_id?: string;
  delivery_id?: string;
  recipient_name?: string;
  recipient_phone?: string;
  recipient_email?: string;
  recipient_street?: string;
  recipient_city?: string;      // İLÇE
  recipient_state?: string;     // İL
  recipient_zip?: string;
  recipient_country?: string;
  /** paket ölçüleri; verilmezse ayarlardaki varsayılanlar */
  packages?: Pkg[];
  /** create */
  carrier_service_id?: string;
  /** rates cevabındaki hesap id'si — verilirse /carrier-accounts sorgusu atlanır */
  carrier_account_id?: string;
  /** rates cevabındaki carrier_service.provider — 'shipink' ise kart zorunlu */
  carrier_provider?: string;
  card_id?: string;
  declared_value?: number;
  currency?: string;
  note?: string;
  /** 'clinic_to_lab' → Shipink direction 'incoming' */
  direction?: string;
  /** check */
  tracking_number?: string;
  /** cancel / label */
  shipment_id?: string;
}

// ── Shipink durum metni → bizim delivery_status enum'u ───────────────────────
// Enum: atandi, teslim_alindi, yolda, teslim_edildi, iade, beklemede, iptal
// Doküman tüm durum değerlerini saymıyor (yalnız picked_up / in_transit örnek
// veriliyor), o yüzden eşleme normalize edilmiş metin üzerinden ve ihtiyatlı:
// tanınmayan durum NULL döner — yanlış statü yazmaktansa kayıt dokunulmaz kalır.
function mapStatus(raw: unknown): string | null {
  const s = String(raw ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (!s) return null;
  if (/(^|_)(created|pending|ready|label_created|awaiting|processing|new)(_|$)/.test(s)) return 'beklemede';
  if (/(picked_up|collected|pickup_completed|received)/.test(s))                          return 'teslim_alindi';
  if (/(in_transit|transit|out_for_delivery|shipped|on_the_way|dispatched|transfer)/.test(s)) return 'yolda';
  if (/(delivered|completed|teslim)/.test(s))                                             return 'teslim_edildi';
  if (/(cancel)/.test(s))                                                                 return 'iptal';
  if (/(return|iade|refused|undeliverable)/.test(s))                                      return 'iade';
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  let body: ReqBody;
  try { body = await req.json() as ReqBody; }
  catch { return json({ ok: false, message: 'invalid json' }); }

  // ── test: kimlik body'de gelir (kayıt öncesi doğrulama) ──
  if (body.action === 'test') {
    const env: Env = body.environment === 'sandbox' ? 'sandbox' : 'production';
    const u = (body.username ?? '').trim();
    const p = (body.password ?? '').trim();
    if (!u || !p) return json({ ok: false, message: 'Kullanıcı adı (e-posta) ve parola gerekli' });
    const t = await fetchToken(env, { username: u, password: p });
    if (!t.ok) return json({ ok: false, message: `Bağlantı reddedildi: ${t.message}` });
    return json({ ok: true, environment: env, expires_in: t.expires_in });
  }

  // ── Buradan sonrası oturum ister ──
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ ok: false, message: 'auth required' });

  // ANON key + kullanıcı JWT → RLS devrede, lab_id kullanıcının kendi lab'ı.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(SUPABASE_URL, SRV_KEY, { auth: { persistSession: false } });

  // Kimliği sağlayıcı adıyla arıyoruz (get_active_provider tek aktif kuryeyi
  // döndürür; BanaBiKurye/Navlungo/Shipink aynı anda açık olabilmeli).
  const { data: cred, error: credErr } = await userClient
    .from('provider_credentials')
    .select('id, lab_id, environment, credentials')
    .eq('type', 'courier').eq('provider', 'shipink').eq('is_active', true)
    .maybeSingle();

  if (credErr) return json({ ok: false, message: 'Kimlik okunamadı: ' + credErr.message });
  if (!cred)   return json({ ok: false, message: 'Aktif Shipink entegrasyonu yok. Ayarlar → Entegrasyonlar → Kurye.' });

  const cEnv: Env = cred.environment === 'sandbox' ? 'sandbox' : 'production';
  const c = (cred.credentials ?? {}) as Record<string, any>;

  // ── Kiracı doğrulaması ──────────────────────────────────────────────────────
  // Gövdeden gelen work_order_id / delivery_id çağıranın lab'ına ait mi? Kontrol
  // RLS-kapsamlı userClient ile yapılır: satır YALNIZ çağıranın kiracısına aitse
  // döner (tenant yoksa/başka lab'sa boş) → servis-rol (admin) okuma/yazması
  // YAPILMADAN 403 ile reddedilir. Böylece başka lab'ın work_order'ından hekim/
  // klinik PII'si okunamaz veya başka lab'ın teslimat kaydı değiştirilemez.
  const denyTenant = () => json({ ok: false, error: 'Bu kayıt sizin laboratuvarınıza ait değil', message: 'Bu kayıt sizin laboratuvarınıza ait değil' }, 403);
  const ownsWorkOrder = async (id?: string): Promise<boolean> => {
    if (!id) return true;   // work_order_id opsiyonel akışlarda (rates) admin okuması yapılmaz
    const { data } = await userClient.from('work_orders').select('id').eq('id', id).maybeSingle();
    return !!data;
  };
  const ownsDelivery = async (id?: string): Promise<boolean> => {
    if (!id) return true;
    const { data } = await userClient.from('deliveries').select('id').eq('id', id).maybeSingle();
    return !!data;
  };

  const tok = await getToken(admin, cred.id, cEnv, c);
  if (!tok.ok) return json({ ok: false, message: tok.message });
  const token = tok.token!;

  // ── carrier_accounts: bağlı taşıyıcılar + hizmetleri ──
  if (body.action === 'carrier_accounts') {
    const r = await call(cEnv, token, 'GET', '/carrier-accounts?limit=100');
    if (!r.ok) return json({ ok: false, message: errText(r), debug: dbg(r) });
    return json({ ok: true, accounts: listOf(r.data) });
  }

  // ── cards: Shipink taşıyıcı hesabıyla gönderide gerekli ──
  if (body.action === 'cards') {
    const r = await call(cEnv, token, 'GET', '/cards');
    if (!r.ok) return json({ ok: false, message: errText(r), debug: dbg(r) });
    return json({ ok: true, cards: listOf(r.data) });
  }

  // ── warehouses ──
  if (body.action === 'warehouses') {
    const r = await call(cEnv, token, 'GET', '/warehouses?limit=100');
    if (!r.ok) return json({ ok: false, message: errText(r), debug: dbg(r) });
    return json({ ok: true, warehouses: listOf(r.data) });
  }

  // ── warehouse_sync: lab alış adresini depo olarak yaz/güncelle ──
  if (body.action === 'warehouse_sync') {
    const w = await ensureWarehouse(admin, cEnv, token, cred.id, c, true);
    if (!w.ok) return json({ ok: false, message: w.message, debug: w.debug });
    return json({ ok: true, warehouse_id: w.id });
  }

  // ── rates: fiyat sorgula (gönderi oluşturmaz) ──
  if (body.action === 'rates') {
    if (!(await ownsWorkOrder(body.work_order_id))) return denyTenant();
    const w = await ensureWarehouse(admin, cEnv, token, cred.id, c, false);
    if (!w.ok) return json({ ok: false, message: w.message, debug: w.debug });

    const dest = await resolveRecipient(admin, body);
    const miss = missingAddress(dest);
    if (miss) return json({ ok: false, message: miss });

    const payload = {
      warehouse_id: w.id,
      is_return:    body.direction === 'clinic_to_lab',
      packages:     buildPackages(body.packages, c),
      recipient: [{
        city:         dest.city,
        state:        dest.state,
        state_code:   '',
        zip:          dest.zip,
        country_code: dest.country,
      }],
    };

    const r = await call(cEnv, token, 'POST', '/rates', payload);
    if (!r.ok) return json({ ok: false, message: errText(r), debug: dbg(r, payload) });
    return json({ ok: true, rates: listOf(r.data).map(normalizeRate) });
  }

  // ── create: sipariş + gönderi ──
  if (body.action === 'create') {
    if (!body.work_order_id)      return json({ ok: false, message: 'work_order_id gerekli' });
    if (!body.carrier_service_id) return json({ ok: false, message: 'Taşıyıcı hizmeti seçilmedi' });
    if (!(await ownsWorkOrder(body.work_order_id))) return denyTenant();
    if (!(await ownsDelivery(body.delivery_id)))    return denyTenant();

    const w = await ensureWarehouse(admin, cEnv, token, cred.id, c, false);
    if (!w.ok) return json({ ok: false, message: w.message, debug: w.debug });

    const dest = await resolveRecipient(admin, body);
    const miss = missingAddress(dest);
    if (miss) return json({ ok: false, message: miss });
    if (!dest.name)  return json({ ok: false, message: 'Alıcı adı boş — hekim/klinik kaydında ad yok, elle girin.' });
    if (!dest.street) return json({ ok: false, message: 'Alıcı açık adresi boş.' });

    // Taşıyıcı hesabı: /rates cevabı her tarifenin kendi carrier_account_id'sini
    // ve carrier_service.provider'ını taşıyor — istemci seçtiği tarifeninkileri
    // geçtiğinde ek bir /carrier-accounts turuna gerek kalmaz. Eksikse (ör.
    // ayarlardan sabit hesap) hizmet id'sinden çözülür.
    let accountId = String(body.carrier_account_id ?? c.carrier_account_id ?? '').trim();
    let needsCard = String(body.carrier_provider ?? '').toLowerCase() === 'shipink';
    if (!accountId || !body.carrier_provider) {
      const acc = await resolveCarrierAccount(cEnv, token, accountId || null, body.carrier_service_id);
      if (!acc.ok) return json({ ok: false, message: acc.message, debug: acc.debug });
      accountId = acc.accountId;
      needsCard = needsCard || acc.needsCard;
    }

    // Shipink'in kendi taşıyıcı hesabında ödeme kartı zorunlu.
    let cardId: string | null = body.card_id ?? c.card_id ?? null;
    if (needsCard && !cardId) {
      const rc = await call(cEnv, token, 'GET', '/cards');
      const cards = listOf(rc.data);
      const def = cards.find((x: any) => x?.default) ?? cards[0];
      cardId = def?.id ?? null;
      if (!cardId) {
        return json({ ok: false, message: 'Shipink taşıyıcı hesabıyla gönderi için kayıtlı ödeme kartı gerekli — Shipink panelinden kart ekleyin.' });
      }
    }

    const currency = (body.currency ?? c.currency ?? 'TRY').toUpperCase();
    const value    = Number(body.declared_value ?? c.declared_value ?? 0) || 0;

    // 1) Sipariş — gönderi bir siparişe bağlanmak zorunda.
    const orderPayload = {
      sales_channel: 'siman',
      customer: {
        name:  dest.name,
        email: { main: dest.email, work: '' },
        phone: { main: dest.phone, work: '', cell: '', code: '' },
        address: {
          street:       dest.street,
          city:         dest.city,     // İLÇE
          state:        dest.state,    // İL
          zip:          dest.zip,
          country_code: dest.country,
        },
      },
      items: [{
        name:     dest.orderNumber ? `Dental iş #${dest.orderNumber}` : 'Dental laboratuvar işi',
        quantity: 1,
        price:    value,
      }],
      note:     (body.note ?? '').slice(0, 500),
      currency,
      price:    value,
    };

    const ro = await call(cEnv, token, 'POST', '/orders', orderPayload);
    if (!ro.ok) return json({ ok: false, message: 'Sipariş oluşturulamadı: ' + errText(ro), debug: dbg(ro, orderPayload) });
    const orderId = ro.data?.id ?? ro.data?.data?.id ?? null;
    if (!orderId) return json({ ok: false, message: 'Shipink sipariş id dönmedi', debug: dbg(ro, orderPayload) });

    // 2) Gönderi
    const shipPayload: Record<string, any> = {
      order_id:           String(orderId),
      carrier_service_id: String(body.carrier_service_id),
      carrier_account_id: accountId,
      warehouse_id:       w.id,
      direction:          body.direction === 'clinic_to_lab' ? 'incoming' : 'outgoing',
      packages:           buildPackages(body.packages, c),
    };
    if (cardId) shipPayload.card_id = cardId;

    const rs = await call(cEnv, token, 'POST', '/shipments', shipPayload);
    if (!rs.ok) {
      // Sipariş oluştu ama gönderi olmadı → yarım kayıt Shipink panelinde
      // görünmesin diye siparişi geri al (başarısız olursa sessiz geç).
      await call(cEnv, token, 'DELETE', `/orders/${encodeURIComponent(String(orderId))}`);
      return json({ ok: false, message: 'Gönderi oluşturulamadı: ' + errText(rs), debug: dbg(rs, shipPayload) });
    }

    const sh   = rs.data?.data ?? rs.data ?? {};
    const info = extractShipment(sh);

    if (body.delivery_id) {
      await admin.from('deliveries').update({
        mode: 'external',
        external_provider: 'Shipink',
        external_tracking_no:   info.tracking ?? String(info.shipmentId ?? ''),
        external_tracking_code: info.shipmentId ? String(info.shipmentId) : null,
        external_label_url:     info.labelUrl,
        status: 'beklemede',
      }).eq('id', body.delivery_id);
    }

    return json({
      ok: true,
      shipink_order_id: String(orderId),
      shipment_id:      info.shipmentId,
      tracking_number:  info.tracking,
      label_url:        info.labelUrl,
      carrier_name:     info.carrierName,
      price:            info.price,
      currency:         info.currency ?? currency,
    });
  }

  // ── check: takip + teslimatı güncelle ──
  if (body.action === 'check') {
    const no = (body.tracking_number ?? '').trim();
    if (!no) return json({ ok: false, message: 'tracking_number gerekli' });
    if (!(await ownsDelivery(body.delivery_id))) return denyTenant();
    const r = await call(cEnv, token, 'GET', `/trackings/${encodeURIComponent(no)}`);
    if (!r.ok) return json({ ok: false, message: errText(r), debug: dbg(r) });

    const d      = r.data?.data ?? r.data ?? {};
    const events = Array.isArray(d.events) ? d.events : [];
    // Kök `status` bazen boş gelebiliyor → en son olayın durumuna düş.
    const raw    = d.status || events[events.length - 1]?.status || '';
    const mapped = mapStatus(raw);

    if (body.delivery_id && mapped) {
      const patch: Record<string, any> = { status: mapped };
      if (mapped === 'teslim_alindi') patch.picked_up_at = new Date().toISOString();
      if (mapped === 'teslim_edildi') patch.delivered_at = new Date().toISOString();
      if (mapped === 'iptal')         patch.cancelled_at = new Date().toISOString();
      await admin.from('deliveries').update(patch).eq('id', body.delivery_id);
    }

    return json({
      ok: true,
      status: mapped,
      status_raw: String(raw ?? ''),
      carrier: d.carrier ?? null,
      events,
    });
  }

  // ── cancel ──
  if (body.action === 'cancel') {
    const id = (body.shipment_id ?? '').trim();
    if (!id) return json({ ok: false, message: 'shipment_id gerekli' });
    if (!(await ownsDelivery(body.delivery_id))) return denyTenant();
    const r = await call(cEnv, token, 'DELETE', `/shipments/${encodeURIComponent(id)}`);
    if (!r.ok) return json({ ok: false, message: errText(r), debug: dbg(r) });
    if (body.delivery_id) {
      await admin.from('deliveries')
        .update({ status: 'iptal', cancelled_at: new Date().toISOString() })
        .eq('id', body.delivery_id);
    }
    return json({ ok: true });
  }

  // ── label: etiket bağlantıları (gönderi kaydından okunur) ──
  if (body.action === 'label') {
    const id = (body.shipment_id ?? '').trim();
    if (!id) return json({ ok: false, message: 'shipment_id gerekli' });
    const r = await call(cEnv, token, 'GET', `/shipments/${encodeURIComponent(id)}`);
    if (!r.ok) return json({ ok: false, message: errText(r), debug: dbg(r) });
    const sh = r.data?.data ?? r.data ?? {};
    const info = extractShipment(sh);
    return json({
      ok: true,
      labels: sh?.document?.labels ?? [],
      label_url: info.labelUrl,
      tracking_number: info.tracking,
    });
  }

  return json({ ok: false, message: `bilinmeyen action: ${body.action}` });
});

// ─── Token ────────────────────────────────────────────────────────────────────

/** POST /token — parola veya refresh_token ile. */
async function fetchToken(env: Env, creds: { username?: string; password?: string; refresh_token?: string }) {
  let res: Response;
  try {
    res = await fetch(`${HOST[env]}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        creds.refresh_token
          ? { refresh_token: creds.refresh_token }
          : { username: creds.username, password: creds.password },
      ),
    });
  } catch (e) { return { ok: false as const, message: String(e) }; }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false as const, message: data?.message ?? data?.error ?? `HTTP ${res.status}` };
  }
  const d = data?.data ?? data;
  const access = d?.access_token;
  if (!access) return { ok: false as const, message: 'access_token dönmedi' };
  return {
    ok: true as const,
    token: String(access),
    refresh: d?.refresh_token ? String(d.refresh_token) : null,
    expires_in: Number(d?.expires_in ?? 3600),
  };
}

/**
 * Önbellekli token. Süresi dolduysa ÖNCE refresh_token denenir (parola ağa
 * çıkmasın), o da reddedilirse kullanıcı adı/parolayla yeniden alınır.
 */
async function getToken(admin: any, credId: string, env: Env, c: Record<string, any>) {
  const cached = c._token as string | undefined;
  const exp    = c._token_exp ? Date.parse(String(c._token_exp)) : 0;
  // 2 dakika pay: istek uçarken token sönmesin (ömrü yalnız 1 saat).
  if (cached && exp && exp - Date.now() > 2 * 60_000) {
    return { ok: true as const, token: cached };
  }

  let t = c._refresh ? await fetchToken(env, { refresh_token: String(c._refresh) }) : { ok: false as const, message: '' };
  if (!t.ok) {
    const u = String(c.username ?? '').trim();
    const p = String(c.password ?? '').trim();
    if (!u || !p) return { ok: false as const, message: 'Shipink kullanıcı adı/parola eksik.' };
    t = await fetchToken(env, { username: u, password: p });
    if (!t.ok) return { ok: false as const, message: 'Shipink oturumu açılamadı: ' + t.message };
  }

  await patchCreds(admin, credId, {
    _token:     t.token,
    _token_exp: new Date(Date.now() + Math.max(60, t.expires_in) * 1000).toISOString(),
    ...(t.refresh ? { _refresh: t.refresh } : {}),
  });
  return { ok: true as const, token: t.token! };
}

/** credentials jsonb'sini kısmi günceller (servis rolü — istemci bu alanları yazamaz). */
async function patchCreds(admin: any, credId: string, patch: Record<string, any>) {
  const { data } = await admin.from('provider_credentials').select('credentials').eq('id', credId).maybeSingle();
  const next = { ...(data?.credentials ?? {}), ...patch };
  await admin.from('provider_credentials').update({ credentials: next }).eq('id', credId);
}

// ─── Depo (gönderici adresi) ──────────────────────────────────────────────────

/**
 * Gönderici deposu. Kayıtlıysa doğrudan id döner; yoksa ayarlardaki alış
 * adresinden oluşturur ve id'yi credentials'a yazar (tembel senkron —
 * kullanıcının ayrıca "adresi gönder" düğmesine basması gerekmesin).
 * `force=true` ise var olan kayıt da güncellenir.
 */
async function ensureWarehouse(
  admin: any, env: Env, token: string, credId: string, c: Record<string, any>, force: boolean,
): Promise<{ ok: true; id: string } | { ok: false; message: string; debug?: any }> {
  const existing = c.warehouse_id ? String(c.warehouse_id) : null;
  if (existing && !force) return { ok: true, id: existing };

  const payload = {
    name:        c.pickup_name || c.pickup_contact_name || 'Laboratuvar',
    person_name: c.pickup_contact_name || c.pickup_name || 'Laboratuvar',
    company: {
      name:       c.company_name || c.pickup_name || '',
      tax_id:     c.tax_id || '',
      tax_office: c.tax_office || '',
    },
    phone: { main: c.pickup_phone || '', work: '', cell: '', code: '' },
    email: { main: c.pickup_email || '', work: '' },
    address: {
      street:       c.pickup_street || '',
      city:         c.pickup_district || '',   // İLÇE
      state:        c.pickup_city || '',       // İL
      zip:          c.pickup_zip || '',
      country_code: (c.pickup_country || 'TR').toUpperCase(),
    },
  };

  const missing: string[] = [];
  if (!payload.person_name.trim())        missing.push('gönderici adı');
  if (!payload.phone.main.trim())         missing.push('telefon');
  if (!payload.address.street.trim())     missing.push('açık adres');
  if (!payload.address.city.trim())       missing.push('ilçe');
  if (!payload.address.state.trim())      missing.push('il');
  if (missing.length) {
    return { ok: false, message: `Alış adresi eksik: ${missing.join(', ')}. Ayarlar → Entegrasyonlar → Kurye → Shipink.` };
  }

  const r = existing
    ? await call(env, token, 'PUT', `/warehouses/${encodeURIComponent(existing)}`, payload)
    : await call(env, token, 'POST', '/warehouses', payload);
  if (!r.ok) return { ok: false, message: 'Alış adresi (depo) kaydedilemedi: ' + errText(r), debug: dbg(r, payload) };

  const id = r.data?.id ?? r.data?.data?.id ?? existing ?? null;
  if (!id) return { ok: false, message: 'Shipink depo id dönmedi', debug: dbg(r, payload) };
  if (String(id) !== String(existing)) await patchCreds(admin, credId, { warehouse_id: String(id) });
  return { ok: true, id: String(id) };
}

// ─── Taşıyıcı hesabı ──────────────────────────────────────────────────────────

/**
 * Gönderi için carrier_account_id çözer. Kullanıcı arayüzde yalnız HİZMET
 * seçiyor (rates öyle dönüyor); hesabı, hizmeti içeren aktif taşıyıcı
 * hesabından buluyoruz. Ayarlarda sabit hesap girilmişse o kullanılır.
 */
async function resolveCarrierAccount(
  env: Env, token: string, fixedId: string | undefined | null, serviceId: string,
): Promise<{ ok: true; accountId: string; needsCard: boolean } | { ok: false; message: string; debug?: any }> {
  const r = await call(env, token, 'GET', '/carrier-accounts?limit=100');
  if (!r.ok) return { ok: false, message: 'Taşıyıcı hesapları okunamadı: ' + errText(r), debug: dbg(r) };
  const accounts = listOf(r.data);

  if (fixedId) {
    const a = accounts.find((x: any) => String(x?.id) === String(fixedId));
    return { ok: true, accountId: String(fixedId), needsCard: String(a?.provider ?? '').toLowerCase() === 'shipink' };
  }

  const match = accounts.find((a: any) =>
    Array.isArray(a?.carrier_services) &&
    a.carrier_services.some((s: any) => String(s?.id) === String(serviceId)));

  if (!match) {
    return {
      ok: false,
      message: 'Seçilen hizmete bağlı taşıyıcı hesabı bulunamadı — Shipink panelinden taşıyıcıyı hesabınıza bağlayın.',
    };
  }
  return { ok: true, accountId: String(match.id), needsCard: String(match?.provider ?? '').toLowerCase() === 'shipink' };
}

// ─── Alıcı / paket ────────────────────────────────────────────────────────────

interface Dest {
  name: string; phone: string; email: string;
  street: string; city: string; state: string; zip: string; country: string;
  orderNumber: string | null;
}

/**
 * Alıcı bilgisi: istemciden gelen değerler önceliklidir (kullanıcı adresi
 * Google Places'ten seçmiş olabilir), boş kalanlar iş emrindeki hekim/klinik
 * kaydından tamamlanır.
 */
async function resolveRecipient(admin: any, body: ReqBody): Promise<Dest> {
  const dest: Dest = {
    name:    (body.recipient_name    ?? '').trim(),
    phone:   (body.recipient_phone   ?? '').trim(),
    email:   (body.recipient_email   ?? '').trim(),
    street:  (body.recipient_street  ?? '').trim(),
    city:    (body.recipient_city    ?? '').trim(),
    state:   (body.recipient_state   ?? '').trim(),
    zip:     (body.recipient_zip     ?? '').trim(),
    country: (body.recipient_country ?? 'TR').trim().toUpperCase(),
    orderNumber: null,
  };
  if (!body.work_order_id) return dest;

  const { data: wo } = await admin.from('work_orders')
    .select('order_number, doctor_id').eq('id', body.work_order_id).maybeSingle();
  if (!wo) return dest;
  dest.orderNumber = wo.order_number != null ? String(wo.order_number) : null;

  const { data: doc } = await admin.from('doctors')
    .select('full_name, phone, email, clinic_id').eq('id', wo.doctor_id).maybeSingle();
  if (doc) {
    if (!dest.name)  dest.name  = doc.full_name ?? '';
    if (!dest.phone) dest.phone = doc.phone ?? '';
    if (!dest.email) dest.email = doc.email ?? '';
    if (doc.clinic_id) {
      const { data: cl } = await admin.from('clinics')
        .select('name, address, phone').eq('id', doc.clinic_id).maybeSingle();
      if (cl) {
        if (!dest.name)  dest.name  = cl.name ?? dest.name;
        if (!dest.phone) dest.phone = cl.phone ?? '';
        // clinics.address polimorfik (düz metin veya {il, ilce, ...} JSON).
        // Yalnız istemci adres göndermediyse kullanılır.
        if (!dest.street || !dest.city || !dest.state) {
          const a = cl.address;
          if (a && typeof a === 'object') {
            if (!dest.state)  dest.state  = String(a.il ?? a.city ?? '');
            if (!dest.city)   dest.city   = String(a.ilce ?? a.district ?? '');
            if (!dest.zip)    dest.zip    = String(a.posta_kodu ?? a.zip ?? '');
            if (!dest.street) dest.street = [a.mahalle, a.sokak, a.adres, a.street].filter(Boolean).join(' ').trim();
          } else if (typeof a === 'string' && !dest.street) {
            dest.street = a;
          }
        }
      }
    }
  } else {
    const { data: pr } = await admin.from('profiles')
      .select('full_name, phone').eq('id', wo.doctor_id).maybeSingle();
    if (pr) {
      if (!dest.name)  dest.name  = pr.full_name ?? '';
      if (!dest.phone) dest.phone = pr.phone ?? '';
    }
  }
  return dest;
}

/** Adres zorunlularını kontrol eder — eksikse kullanıcıya okunur mesaj. */
function missingAddress(d: Dest): string | null {
  const miss: string[] = [];
  if (!d.city.trim())  miss.push('ilçe');
  if (!d.state.trim()) miss.push('il');
  if (!miss.length) return null;
  return `Alıcı adresinde ${miss.join(' ve ')} eksik — adresi listeden seçin veya elle girin.`;
}

/** Paket listesi; boşsa ayarlardaki varsayılan tek paket. */
function buildPackages(pkgs: Pkg[] | undefined, c: Record<string, any>): Required<Pkg>[] {
  const src = (pkgs && pkgs.length) ? pkgs : [{}];
  return src.map((p) => ({
    weight:         Number(p.weight ?? c.default_weight ?? 1) || 1,
    weight_unit:    String(p.weight_unit ?? 'kg'),
    length:         Number(p.length ?? c.default_length ?? 20) || 20,
    width:          Number(p.width  ?? c.default_width  ?? 15) || 15,
    height:         Number(p.height ?? c.default_height ?? 10) || 10,
    dimension_unit: String(p.dimension_unit ?? 'cm'),
  }));
}

/**
 * /rates satırını sabit bir şekle indirger.
 *
 * Doküman düz alanlar vaat ediyor (carrier_service_id, carrier_name, price…),
 * GERÇEK cevap ise iç içe: { id, carrier_id, carrier_account_id, cheapest,
 * fastest, carrier_service: { id, name, price, currency, provider,
 * delivery_time } }. İkisi de kabul ediliyor ki API düzelirse/değişirse
 * istemci kırılmasın. Ayrı bir `carrier_name` YOK — hizmet adı taşıyıcıyı
 * zaten içeriyor ("HepsiJET Standart").
 */
function normalizeRate(r: any) {
  const svc = r?.carrier_service ?? {};
  const carrierId = r?.carrier_id ?? null;
  return {
    carrier_service_id: String(svc.id ?? r?.carrier_service_id ?? r?.id ?? ''),
    carrier_id:         carrierId,
    /**
     * Taşıyıcı logosu. /carriers ucu her taşıyıcı için `logo_url` döndürüyor ve
     * hepsi tek kalıba uyuyor (17 kimliğin tamamı doğrulandı), o yüzden URL'i
     * kimlikten türetiyoruz — her fiyat sorgusunda ikinci bir API turu olmasın.
     * Dosya bulunamazsa istemci ikon yedeğine düşer, gönderi akışı etkilenmez.
     */
    logo_url:           carrierId ? `https://shipink.io/img/logo/${carrierId}-original-colored.svg` : null,
    name:               svc.name ?? r?.service_name ?? r?.carrier_name ?? null,
    price:              svc.price ?? r?.price ?? null,
    currency:           svc.currency ?? r?.currency ?? 'TRY',
    /** saat cinsinden tahmini teslim süresi */
    delivery_time:      svc.delivery_time ?? null,
    /** gönderi oluştururken gereken hesap — tarifeyle birlikte geliyor */
    carrier_account_id: r?.carrier_account_id ?? null,
    /** 'shipink' → gönderide card_id zorunlu */
    provider:           svc.provider ?? null,
    cheapest:           r?.cheapest === true,
    fastest:            r?.fastest === true,
  };
}

/** Gönderi cevabından takip no / etiket / ücret çıkarır (şekil esnek). */
function extractShipment(sh: any) {
  const labels = sh?.document?.labels;
  const first  = Array.isArray(labels) ? labels[0] : null;
  return {
    shipmentId:  sh?.id ?? null,
    tracking:    sh?.tracking_number ?? sh?.tracking?.number ?? sh?.carrier_tracking_number ?? null,
    labelUrl:    first?.pdf ?? first?.png ?? first?.zpl ?? null,
    carrierName: sh?.carrier_name ?? sh?.carrier?.name ?? null,
    price:       sh?.price ?? sh?.rate?.price ?? null,
    currency:    sh?.currency ?? sh?.rate?.currency ?? null,
  };
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function call(env: Env, token: string, method: string, path: string, payload?: unknown) {
  let res: Response;
  try {
    res = await fetch(`${HOST[env]}${path}`, {
      method,
      headers: {
        'Content-Type':  'application/json',
        Accept:          'application/json',
        Authorization:   `Bearer ${token}`,
      },
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
    });
  } catch (e) { return { ok: false, status: 0, data: null, error: String(e) }; }

  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
  return { ok: res.ok, status: res.status, data };
}

function errText(r: { status: number; data: any; error?: string }) {
  if (r.error) return r.error;
  const d = r.data;
  if (d?.meta?.message) return String(d.meta.message);
  if (d?.message)       return String(d.message);
  if (d?.error)         return String(d.error);
  if (d?.errors)        return JSON.stringify(d.errors);
  return `HTTP ${r.status}`;
}

/** Hata ayıklama gövdesi — istemci "Teknik detay"da gösterir. */
function dbg(r: { status: number; data: any }, sent?: unknown) {
  return { status: r.status, resp: r.data, ...(sent !== undefined ? { sent } : {}) };
}

/** Liste cevapları { data: [...] } veya düz dizi olabiliyor. */
function listOf(data: any): any[] {
  const d = data?.data ?? data;
  return Array.isArray(d) ? d : [];
}

function json(b: unknown, status = 200): Response {
  return new Response(JSON.stringify(b), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
