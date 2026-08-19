/**
 * navlungo-dispatch — Navlungo Domestic API v2.1 köprüsü (lab-bazlı).
 *
 * Navlungo bir KARGO TOPLAYICISIDIR (Aras, Yurtiçi, PTT, Sürat, HepsiJet…),
 * BanaBiKurye gibi anlık motokurye değil. Pratik farkları:
 *   • Canlı GPS konumu YOK — yalnız durum kodu + takip numarası.
 *   • Kutuya yapıştırılacak BARKOD üretilir (pdf/zpl/html).
 *   • Alıcı adresi serbest metin DEĞİL: il ve ilçe ayrı ve zorunlu.
 *   • Gönderici adresi API'ye tek tek gönderilmez; adres defterine bir kez
 *     kaydedilir, sonra yalnız `addressId` geçilir.
 *
 * Yetkilendirme — BanaBiKurye'den farklı, dikkat:
 *   Sabit token yok. `POST /auth/api { username, password }` ile 8 SAAT geçerli
 *   bir bearer token alınır. Her istekte yeniden token almak hem yavaş hem de
 *   gereksiz yük olduğu için token provider_credentials.credentials içinde
 *   önbelleklenir (_token / _token_exp) ve süresi dolunca tazelenir.
 *   Bu alanları yalnız servis rolü yazar; istemci hiçbir zaman görmez.
 *
 * Action'lar:
 *   • test          → kimlik doğrula (kayıt öncesi; kimlik body'de gelir)
 *   • carriers      → GET /carrier/my-carriers (ayarlardaki taşıyıcı seçici)
 *   • address_sync  → lab alış adresini adres defterine yaz/güncelle → addressId
 *   • create        → POST /post/create (gönderi oluştur) + deliveries'e yaz
 *   • check         → GET /post/check/{no} → durum eşle + deliveries güncelle
 *   • cancel        → POST /post/cancel
 *   • barcode       → POST /barcode/getBarcode
 *
 * Deploy:
 *   supabase functions deploy navlungo-dispatch --project-ref kjwjxqfdsxkxgcgophdy \
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
  sandbox:    'https://domestic-api-qa.navlungo.com',
  production: 'https://domestic-api.navlungo.com',
};

/**
 * Postman koleksiyonu iki ayrı base değişkeni kullanıyor: auth/check/cancel
 * `{{api_url}}`, diğerleri `{{api_v2.1_url}}`. Değişkenlerin değeri koleksiyonda
 * tanımlı DEĞİL, yani `api_url`in v2 mi v2.1 mi olduğu belgeden anlaşılmıyor.
 * Gerçek anahtarla doğrulanana kadar önce v2.1 denenir, 404 gelirse v2'ye düşülür
 * ve hangisinin tuttuğu loglanır.
 */
const VERSIONS = ['/v2.1', '/v2'];

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SRV_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;

type Env = 'sandbox' | 'production';

interface ReqBody {
  action: 'test' | 'carriers' | 'address_sync' | 'create' | 'check' | 'cancel' | 'barcode';
  environment?: Env;
  /** yalnız 'test' — kayıt öncesi doğrulama, kimlik henüz DB'de yok */
  username?: string;
  password?: string;
  /** create */
  work_order_id?: string;
  delivery_id?: string;
  recipient_city?: string;
  recipient_district?: string;
  recipient_address?: string;
  recipient_name?: string;
  recipient_phone?: string;
  desi?: number;
  package_count?: number;
  carrier_id?: number;
  post_type?: number;      // 1 = aynı gün, 2 = standart
  note?: string;
  /** check / cancel / barcode */
  post_number?: string;
  barcode_type?: string;   // pdf | zpl | html
}

// ── Navlungo durum kodu → bizim delivery_status enum'u ───────────────────────
// Enum değerleri: atandi, teslim_alindi, yolda, teslim_edildi, iade, beklemede, iptal
const STATUS_MAP: Record<number, string> = {
  1:  'beklemede',      // Teslim Alınacak
  14: 'beklemede',      // Ön İzleme
  16: 'teslim_alindi',  // Teslim Alındı
  17: 'yolda',          // Transfer Aşamasında
  3:  'yolda',          // Teslim Edilecek
  4:  'yolda',          // Dağıtıma Çıktı
  5:  'yolda',          // Tekrar Sevk
  6:  'yolda',          // Dağıtım Planlandı
  18: 'yolda',          // Şubede Beklemede
  2:  'teslim_edildi',  // Teslim Edildi
  10: 'iptal',          // İptal
  7:  'iade',           // İade Edilecek
  9:  'iade',           // İade Edildi
  21: 'iade',           // Depoya İade Edildi
  // 19/20 (tazmin süreci) bilinçli olarak eşlenmedi — teslimatın statüsünü
  // değiştirmez, yalnız not olarak yazılır.
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  let body: ReqBody;
  try { body = await req.json() as ReqBody; }
  catch { return json({ ok: false, message: 'invalid json' }); }

  const env: Env = body.environment === 'production' ? 'production' : 'sandbox';

  // ── test: kimlik body'de gelir (kayıt öncesi doğrulama) ──
  if (body.action === 'test') {
    const u = (body.username ?? '').trim();
    const p = (body.password ?? '').trim();
    if (!u || !p) return json({ ok: false, message: 'Kullanıcı adı ve parola gerekli' });
    const t = await fetchToken(env, u, p);
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

  // Kimliği doğrudan okuyoruz — get_active_provider('courier') "aktif olan tek
  // kurye"yi döndürüyor; BanaBiKurye ile Navlungo aynı anda açık olabilsin diye
  // sağlayıcı adıyla arıyoruz. RLS (lab_id = get_my_lab_id()) kiracıyı sınırlar.
  const { data: cred, error: credErr } = await userClient
    .from('provider_credentials')
    .select('id, lab_id, environment, credentials')
    .eq('type', 'courier').eq('provider', 'navlungo').eq('is_active', true)
    .maybeSingle();

  if (credErr) return json({ ok: false, message: 'Kimlik okunamadı: ' + credErr.message });
  if (!cred) return json({ ok: false, message: 'Aktif Navlungo entegrasyonu yok. Ayarlar → Entegrasyonlar → Kurye.' });

  const cEnv: Env = cred.environment === 'production' ? 'production' : 'sandbox';
  const c = (cred.credentials ?? {}) as Record<string, any>;

  const tok = await getToken(admin, cred.id, cEnv, c);
  if (!tok.ok) return json({ ok: false, message: tok.message });
  const token = tok.token!;

  // ── carriers: ayarlardaki taşıyıcı seçicisini doldurur ──
  if (body.action === 'carriers') {
    const r = await call(cEnv, token, 'GET', '/carrier/my-carriers');
    if (!r.ok) return json({ ok: false, message: errText(r) });
    return json({ ok: true, carriers: r.data?.data ?? r.data ?? [] });
  }

  // ── address_sync: lab alış adresini adres defterine yaz, id'yi sakla ──
  if (body.action === 'address_sync') {
    const payload = {
      address_type:     'sender',
      location_name:    c.pickup_location_name || c.pickup_contact_name || 'Laboratuvar',
      address_name:     c.pickup_contact_name || 'Laboratuvar',
      address_email:    c.pickup_email || '',
      address_phone:    c.pickup_phone || '',
      address_line:     c.pickup_address || '',
      address_country:  'tr',
      address_city:     c.pickup_city || '',
      address_district: c.pickup_district || '',
      is_main_warehouse: 1,
    };
    const missing = ['address_name', 'address_phone', 'address_line', 'address_city', 'address_district']
      .filter((k) => !String((payload as any)[k] ?? '').trim());
    if (missing.length) {
      return json({ ok: false, message: `Alış adresi eksik: ${missing.join(', ')}. Ayarlar → Entegrasyonlar → Kurye → Navlungo.` });
    }

    const existing = c.sender_address_id;
    const r = existing
      ? await call(cEnv, token, 'PUT', `/address-book/update/${existing}`, payload)
      : await call(cEnv, token, 'POST', '/address-book/create', payload);
    if (!r.ok) return json({ ok: false, message: errText(r) });

    const id = r.data?.data?.id ?? r.data?.id ?? existing ?? null;
    if (id && String(id) !== String(existing)) {
      await patchCreds(admin, cred.id, { sender_address_id: id });
    }
    return json({ ok: true, sender_address_id: id });
  }

  // ── create: gönderi oluştur ──
  if (body.action === 'create') {
    if (!c.sender_address_id) {
      return json({ ok: false, message: 'Gönderici adresi henüz Navlungo adres defterine kaydedilmemiş. Önce "Alış adresini gönder" adımını çalıştırın.' });
    }
    if (!body.work_order_id) return json({ ok: false, message: 'work_order_id gerekli' });

    const dest = await resolveDest(admin, body.work_order_id);
    const city     = (body.recipient_city ?? '').trim();
    const district = (body.recipient_district ?? '').trim();
    // Navlungo il/ilçeyi ZORUNLU ve AYRI ister; serbest metin adresten ayrıştırmak
    // Türkçe adreslerde güvenilir değil, o yüzden çağıran taraf vermek zorunda.
    if (!city || !district) {
      return json({ ok: false, message: 'Alıcı için il ve ilçe zorunlu.' });
    }

    const payload = {
      platform: 'siman',
      posts: [{
        reference_id: dest.order_number ? String(dest.order_number) : body.work_order_id,
        carrier_id:   Number(body.carrier_id ?? c.carrier_id ?? 1),
        post_type:    Number(body.post_type ?? c.post_type ?? 2),
        cod_payment_type: '',
        sender:    { addressId: Number(c.sender_address_id) },
        recipient: {
          name:      (body.recipient_name  ?? dest.name  ?? '').trim(),
          phone:     (body.recipient_phone ?? dest.phone ?? '').trim(),
          email:     '',
          address:   (body.recipient_address ?? dest.address ?? '').trim(),
          country:   'tr',
          city, district,
          post_code: '',
        },
        post: {
          desi:          Number(body.desi ?? c.default_desi ?? 1),
          package_count: Number(body.package_count ?? 1),
          price:         '',
          note:          (body.note ?? '').slice(0, 250),
        },
        barcode_format: c.barcode_format || 'pdf-A5',
      }],
    };

    const r = await call(cEnv, token, 'POST', '/post/create', payload);
    if (!r.ok) return json({ ok: false, message: errText(r) });

    const created = firstPost(r.data);
    const postNo  = created?.post_number ?? null;
    if (!postNo) return json({ ok: false, message: 'Navlungo takip numarası dönmedi', raw: r.data });

    if (body.delivery_id) {
      await admin.from('deliveries').update({
        mode: 'external',
        external_provider: 'navlungo',
        external_tracking_no: postNo,
        status: 'beklemede',
      }).eq('id', body.delivery_id);
    }

    return json({
      ok: true,
      post_number:  postNo,
      tracking_url: created?.tracking_url ?? null,
      barcode_url:  created?.barcode_url ?? null,
      carrier_name: created?.carrier_name ?? null,
    });
  }

  // ── check: durum sorgula + teslimatı güncelle ──
  if (body.action === 'check') {
    const no = (body.post_number ?? '').trim();
    if (!no) return json({ ok: false, message: 'post_number gerekli' });
    const r = await call(cEnv, token, 'GET', `/post/check/${encodeURIComponent(no)}`);
    if (!r.ok) return json({ ok: false, message: errText(r) });

    const post   = firstPost(r.data) ?? r.data?.data ?? r.data;
    const code   = Number(post?.status_id ?? post?.status?.id ?? post?.status ?? 0);
    const mapped = STATUS_MAP[code] ?? null;

    if (body.delivery_id && mapped) {
      const patch: Record<string, any> = { status: mapped };
      if (mapped === 'teslim_alindi') patch.picked_up_at = new Date().toISOString();
      if (mapped === 'teslim_edildi') patch.delivered_at = new Date().toISOString();
      if (mapped === 'iptal')         patch.cancelled_at = new Date().toISOString();
      await admin.from('deliveries').update(patch).eq('id', body.delivery_id);
    }

    return json({
      ok: true,
      status_code: code,
      status: mapped,
      status_name: post?.status_name ?? null,
      carrier_name: post?.carrier_name ?? null,
      carrier_tracking_code: post?.carrier_tracking_code ?? null,
      tracking_url: post?.tracking_url ?? null,
      logs: post?.logs ?? null,
    });
  }

  // ── cancel ──
  if (body.action === 'cancel') {
    const no = (body.post_number ?? '').trim();
    if (!no) return json({ ok: false, message: 'post_number gerekli' });
    const r = await call(cEnv, token, 'POST', '/post/cancel', { post_number: no });
    if (!r.ok) return json({ ok: false, message: errText(r) });
    if (body.delivery_id) {
      await admin.from('deliveries')
        .update({ status: 'iptal', cancelled_at: new Date().toISOString() })
        .eq('id', body.delivery_id);
    }
    return json({ ok: true });
  }

  // ── barcode ──
  if (body.action === 'barcode') {
    const no = (body.post_number ?? '').trim();
    if (!no) return json({ ok: false, message: 'post_number gerekli' });
    const r = await call(cEnv, token, 'POST', '/barcode/getBarcode', {
      post_number: no,
      barcode_type: body.barcode_type || 'pdf',
    });
    if (!r.ok) return json({ ok: false, message: errText(r) });
    return json({ ok: true, barcode: r.data?.data ?? r.data });
  }

  return json({ ok: false, message: `bilinmeyen action: ${body.action}` });
});

// ─── Token ────────────────────────────────────────────────────────────────────

/** Kimlikle yeni token al. 8 saat geçerli. */
async function fetchToken(env: Env, username: string, password: string) {
  for (const v of VERSIONS) {
    let res: Response;
    try {
      res = await fetch(`${HOST[env]}${v}/auth/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-localization': 'tr' },
        body: JSON.stringify({ username, password }),
      });
    } catch (e) { return { ok: false as const, message: String(e) }; }

    if (res.status === 404) continue;          // bu sürümde yok, diğerini dene
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false as const, message: data?.message ?? `HTTP ${res.status}` };
    }
    const d = data?.data ?? data;
    const access = d?.access_token;
    if (!access) return { ok: false as const, message: 'access_token dönmedi' };
    return { ok: true as const, token: String(access), expires_in: d?.expires_in ?? null, version: v };
  }
  return { ok: false as const, message: 'auth ucu bulunamadı (v2.1 ve v2 denendi)' };
}

/** Önbellekli token — süresi dolmadıysa yeniden almaz. */
async function getToken(admin: any, credId: string, env: Env, c: Record<string, any>) {
  const cached = c._token as string | undefined;
  const exp    = c._token_exp ? Date.parse(String(c._token_exp)) : 0;
  // 5 dakika pay: istek uçarken token sönmesin.
  if (cached && exp && exp - Date.now() > 5 * 60_000) {
    return { ok: true as const, token: cached };
  }
  const u = String(c.username ?? '').trim();
  const p = String(c.password ?? '').trim();
  if (!u || !p) return { ok: false as const, message: 'Navlungo kullanıcı adı/parola eksik.' };

  const t = await fetchToken(env, u, p);
  if (!t.ok) return { ok: false as const, message: t.message };

  // expires_in bir tarih string'i olarak dönüyor; parse edilemezse 8 saat varsay.
  const parsed = t.expires_in ? Date.parse(String(t.expires_in)) : NaN;
  const expIso = Number.isFinite(parsed)
    ? new Date(parsed).toISOString()
    : new Date(Date.now() + 8 * 3600_000).toISOString();

  await patchCreds(admin, credId, { _token: t.token, _token_exp: expIso, _api_version: t.version });
  return { ok: true as const, token: t.token! };
}

/** credentials jsonb'sini kısmi günceller (servis rolü — istemci bu alanları yazamaz). */
async function patchCreds(admin: any, credId: string, patch: Record<string, any>) {
  const { data } = await admin.from('provider_credentials').select('credentials').eq('id', credId).maybeSingle();
  const next = { ...(data?.credentials ?? {}), ...patch };
  await admin.from('provider_credentials').update({ credentials: next }).eq('id', credId);
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function call(env: Env, token: string, method: string, path: string, payload?: unknown) {
  let last: any = null;
  for (const v of VERSIONS) {
    let res: Response;
    try {
      res = await fetch(`${HOST[env]}${v}${path}`, {
        method,
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
          'X-localization': 'tr',
        },
        body: payload !== undefined ? JSON.stringify(payload) : undefined,
      });
    } catch (e) { return { ok: false, status: 0, data: null, error: String(e) }; }

    if (res.status === 404) { last = { ok: false, status: 404, data: null }; continue; }
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }
  return last ?? { ok: false, status: 404, data: null };
}

function errText(r: { status: number; data: any; error?: string }) {
  if (r.error) return r.error;
  const d = r.data;
  if (d?.message) return String(d.message);
  if (d?.errors)  return JSON.stringify(d.errors);
  return `HTTP ${r.status}`;
}

/** Cevap şekli sürüme göre { data: { posts: [...] } } veya { data: {...} } olabiliyor. */
function firstPost(data: any) {
  const d = data?.data ?? data;
  if (Array.isArray(d?.posts)) return d.posts[0] ?? null;
  if (Array.isArray(d))        return d[0] ?? null;
  return d ?? null;
}

// ─── Alıcı çözümü ─────────────────────────────────────────────────────────────

async function resolveDest(admin: any, workOrderId: string) {
  const out = { name: 'Alıcı', phone: '', address: '', clinic: '', order_number: null as any };
  const { data: wo } = await admin.from('work_orders').select('order_number, doctor_id').eq('id', workOrderId).maybeSingle();
  if (!wo) return out;
  out.order_number = wo.order_number;
  const { data: doc } = await admin.from('doctors').select('full_name, phone, clinic_id').eq('id', wo.doctor_id).maybeSingle();
  if (doc) {
    out.name  = doc.full_name ?? out.name;
    out.phone = doc.phone ?? '';
    if (doc.clinic_id) {
      const { data: cl } = await admin.from('clinics').select('name, address, phone').eq('id', doc.clinic_id).maybeSingle();
      if (cl) {
        out.address = cl.address ?? '';
        out.clinic  = cl.name ?? '';
        if (!out.phone) out.phone = cl.phone ?? '';
      }
    }
  } else {
    const { data: pr } = await admin.from('profiles').select('full_name, phone').eq('id', wo.doctor_id).maybeSingle();
    if (pr) { out.name = pr.full_name ?? out.name; out.phone = pr.phone ?? ''; }
  }
  return out;
}

function json(b: unknown, status = 200): Response {
  return new Response(JSON.stringify(b), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
