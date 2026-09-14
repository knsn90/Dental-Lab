// whatsapp-webhook — Meta WhatsApp Cloud API gelen mesaj adapteri.
//
// Kliniklerin WhatsApp'tan gönderdiği iş emri fotoğrafını alır, Meta Graph
// API'den medyayı indirir, `inbound-paper-order` fonksiyonuna normalize JSON
// olarak iletir (OCR + pending_paper_orders insert orada yapılır).
//
// ── Meta webhook sözleşmesi ────────────────────────────────────────────────
//  • GET  ?hub.mode=subscribe&hub.verify_token=XXX&hub.challenge=123
//         → verify_token bir lab'ın kayıtlı token'ıyla eşleşirse challenge'ı
//           düz metin döner (Meta doğrulaması). Global WHATSAPP_VERIFY_TOKEN
//           env'i de kabul edilir.
//  • POST { object, entry[].changes[].value: { metadata.phone_number_id,
//           contacts[], messages[] } }
//         → image mesajı: phone_number_id'den lab bulunur, o lab'ın
//           access_token'ıyla medya indirilir, inbound-paper-order çağrılır.
//
// ── Çok-kiracılı ────────────────────────────────────────────────────────────
//  Tüm lablar AYNI webhook URL'ini kullanır. Lab ayrımı gelen phone_number_id
//  ile provider_credentials(type='messaging', provider='whatsapp-cloud')
//  üzerinden yapılır. Her lab kendi Meta numarasının token'ını Entegrasyonlar
//  ekranından girer.
//
// Deploy: public (--no-verify-jwt) — Meta JWT göndermez.
//   supabase functions deploy whatsapp-webhook --no-verify-jwt \
//     --project-ref kjwjxqfdsxkxgcgophdy --workdir .../my-expo-app --use-api
//
// GÜVENLIK (2026 remediation): Gelen Meta POST'ları X-Hub-Signature-256 ile
//   HAM gövde üzerinden doğrulanır (WHATSAPP_APP_SECRET / META_APP_SECRET).
//   İmza eksik/yanlış → 401 ve HİÇBİR işlem (sipariş açma / mesaj gönderme) yok.
//   Secret tanımsızsa FAIL CLOSED. Siman UI'dan gelen action:* yönetim çağrıları
//   Meta imzalı değildir (kendi access_token'larını taşırlar) → ayrı yolda.

import { verifyMetaSignature, timingSafeEqualStr } from '../_shared/security.ts';

const GRAPH_VERSION = 'v20.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WaCredential {
  lab_id: string;
  credentials: {
    phone_number_id?: string;
    business_account_id?: string;
    access_token?: string;
    verify_token?: string;
  };
}

// provider_credentials'tan aktif whatsapp-cloud kayıtlarını çek (service role).
async function fetchWaCredentials(
  supabaseUrl: string,
  serviceRoleKey: string,
  onlyActive: boolean,
): Promise<WaCredential[]> {
  const activeFilter = onlyActive ? '&is_active=eq.true' : '';
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/provider_credentials?type=eq.messaging&provider=eq.whatsapp-cloud${activeFilter}&select=lab_id,credentials`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  if (!resp.ok) return [];
  const rows = await resp.json();
  return Array.isArray(rows) ? rows as WaCredential[] : [];
}

// Lab adı (webhook paketi başına bir kez okunur; kısa süreli bellek içi önbellek).
const labNameCache = new Map<string, { name: string; at: number }>();
const LAB_NAME_TTL_MS = 10 * 60 * 1000;
async function fetchLabName(supabaseUrl: string, serviceRoleKey: string, labId: string): Promise<string> {
  const hit = labNameCache.get(labId);
  if (hit && Date.now() - hit.at < LAB_NAME_TTL_MS) return hit.name;
  let name = 'Laboratuvar';
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/labs?id=eq.${labId}&select=name&limit=1`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (r.ok) {
      const rows = await r.json();
      if (Array.isArray(rows) && rows[0]?.name) name = String(rows[0].name);
    }
  } catch (e) { console.error('[wa] fetchLabName err:', e); }
  labNameCache.set(labId, { name, at: Date.now() });
  return name;
}

// Meta medya-ID → indirilebilir URL (access_token gerekir)
async function resolveMediaUrl(mediaId: string, accessToken: string): Promise<{ url: string; mime: string } | null> {
  const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) return null;
  const j = await resp.json();
  return j?.url ? { url: j.url, mime: j.mime_type ?? 'image/jpeg' } : null;
}

async function downloadMediaBase64(url: string, accessToken: string): Promise<{ b64: string; mime: string } | null> {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) return null;
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

// Basit metin yanıtı gönder (opsiyonel — başarısız olursa yutulur)
async function sendText(phoneNumberId: string, accessToken: string, to: string, body: string): Promise<string | null> {
  try {
    const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    });
    // wamid döndürülür: "bu mesajı BİZ gönderdik" kararının tek güvenilir
    // dayanağı. Coexistence açıldığında Meta bizim gönderdiğimiz mesajları da
    // echo'layacak; wamid olmadan bot kendi mesajını "insan yazdı" sanıp
    // kendini susturur.
    const d = await r.json().catch(() => null);
    return d?.messages?.[0]?.id ?? null;
  } catch { return null; /* gönderim sessiz kalabilir, akışı kırmaz */ }
}

// Fotoğraftan AYRI gelen metinlerin eşleştirme penceresi (dk).
const NOTE_WINDOW_MIN = 20;

// Düz metin BAŞLI BAŞINA bir iş emri mi (fotoğrafsız oluşturulmalı) yoksa kısa not mu?
// İş emri: birden çok alan etiketi VEYA çok satırlı + alan sinyalleri içerir.
function looksLikeWorkOrder(t: string): boolean {
  const s = t.toLocaleLowerCase('tr');
  const labels = [
    'klinik', 'hasta', 'hekim', 'doktor', 'diş', 'renk', 'iş ', 'implant', 'zirkon',
    'kron', 'köprü', 'protez', 'ölçü', 'tarih', 'emri', 'abutment', 'veneer', 'inlay',
    'onlay', 'e-max', 'emax', 'seramik', 'shade', 'ölçü', 'model',
  ];
  const hits = labels.filter(l => s.includes(l)).length;
  const lines = t.split(/\n/).filter(x => x.trim()).length;
  return hits >= 3 || (lines >= 3 && hits >= 2);
}

// Ayrı gelen metni tampona yaz (ileride gelecek fotoğrafla eşlensin diye).
async function storeInboundText(url: string, key: string, labId: string, phone: string | null, body: string): Promise<void> {
  try {
    await fetch(`${url}/rest/v1/whatsapp_inbound_texts`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ lab_id: labId, sender_phone: phone, body: body.slice(0, 2000) }),
    });
  } catch (e) { console.error('[wa] storeInboundText err:', e); }
}

// Son NOTE_WINDOW_MIN dk içindeki tüketilmemiş metinleri çek + tüketildi işaretle.
async function pullInboundTexts(url: string, key: string, labId: string, phone: string | null): Promise<string[]> {
  if (!phone) return [];
  try {
    const since = new Date(Date.now() - NOTE_WINDOW_MIN * 60_000).toISOString();
    const q = `${url}/rest/v1/whatsapp_inbound_texts?lab_id=eq.${labId}`
      + `&sender_phone=eq.${encodeURIComponent(phone)}&consumed_at=is.null`
      + `&created_at=gte.${encodeURIComponent(since)}&select=id,body&order=created_at.asc`;
    const r = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return [];
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const ids = rows.map((x: any) => x.id).filter(Boolean);
    if (ids.length) {
      await fetch(`${url}/rest/v1/whatsapp_inbound_texts?id=in.(${ids.join(',')})`, {
        method: 'PATCH',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ consumed_at: new Date().toISOString() }),
      });
    }
    return rows.map((x: any) => String(x.body ?? '').trim()).filter(Boolean);
  } catch (e) { console.error('[wa] pullInboundTexts err:', e); return []; }
}

// Fotoğraf-sonrası gelen metni, gönderenin son ~20 dk'daki bekleyen siparişine iliştir.
async function attachNoteToRecentOrder(url: string, key: string, labId: string, phone: string | null, body: string): Promise<boolean> {
  if (!phone) return false;
  try {
    const since = new Date(Date.now() - NOTE_WINDOW_MIN * 60_000).toISOString();
    const q = `${url}/rest/v1/pending_paper_orders?lab_id=eq.${labId}`
      + `&sender_phone=eq.${encodeURIComponent(phone)}&status=eq.pending`
      + `&created_at=gte.${encodeURIComponent(since)}&select=id,ocr_data&order=created_at.desc&limit=1`;
    const r = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return false;
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) return false;
    const cur = (rows[0]?.ocr_data && typeof rows[0].ocr_data === 'object') ? rows[0].ocr_data : {};
    const prev = String(cur.sender_note ?? '').trim();
    cur.sender_note = (prev ? prev + '\n' : '') + body.slice(0, 2000);
    const pr = await fetch(`${url}/rest/v1/pending_paper_orders?id=eq.${rows[0].id}`, {
      method: 'PATCH',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ocr_data: cur }),
    });
    return pr.ok;
  } catch (e) { console.error('[wa] attachNoteToRecentOrder err:', e); return false; }
}

// Interactive butonlu mesaj (en çok 3 buton: {id,title}).
async function sendButtons(phoneNumberId: string, accessToken: string, to: string, bodyText: string,
  buttons: { id: string; title: string }[]): Promise<void> {
  try {
    await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText.slice(0, 1024) },
          action: { buttons: buttons.slice(0, 3).map(b => ({ type: 'reply', reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })) },
        },
      }),
    });
  } catch (e) { console.error('[wa] sendButtons err:', e); }
}

// Görsel base64'ünü paper-orders bucket'ına GEÇİCİ yükle → path (belirsiz karar beklerken).
// NOT: burada AYRI ve daha dar bir uzantı listesi vardı; jpg/png/webp/pdf
// dışındaki her şey `.jpg` olarak kaydediliyordu (HTML tasarım önizlemesi de).
// Tek kaynak extFromMime olsun ki iki yer birbirinden ayrışmasın.
async function uploadTempMedia(url: string, key: string, labId: string, b64: string, mime: string, filename?: string): Promise<string | null> {
  try {
    const ext = extFromMime(mime, filename);
    const path = `${labId}/wa-pending/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const up = await fetch(`${url}/storage/v1/object/paper-orders/${path}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': mime, 'x-upsert': 'true' },
      body: bytes,
    });
    return up.ok ? path : null;
  } catch (e) { console.error('[wa] uploadTempMedia err:', e); return null; }
}

// Storage objesini indirip base64'e çevir (service role) — tampondaki görseli geri almak için.
async function downloadStorageBase64(url: string, key: string, bucket: string, path: string): Promise<{ b64: string; mime: string } | null> {
  try {
    const enc = path.split('/').map(encodeURIComponent).join('/');
    const r = await fetch(`${url}/storage/v1/object/${bucket}/${enc}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return null;
    const mime = r.headers.get('content-type') ?? 'image/jpeg';
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = ''; const ch = 0x8000;
    for (let i = 0; i < buf.length; i += ch) bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + ch)));
    // @ts-ignore btoa global
    return { b64: btoa(bin), mime };
  } catch (e) { console.error('[wa] downloadStorageBase64 err:', e); return null; }
}

// Görsel İŞ EMRİ FORMU mu yoksa (klinik/tasarım) FOTOĞRAF mı? → parse-work-order mode:classify
async function classifyMedia(url: string, key: string, b64: string, mime: string): Promise<'form' | 'photo'> {
  try {
    const r = await fetch(`${url}/functions/v1/parse-work-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ mode: 'classify', file_base64: b64, mime_type: mime }),
    });
    const j = await r.json().catch(() => ({}));
    console.log('[wa] classify kind=', j?.kind, ' raw=', j?.raw);
    return j?.kind === 'photo' ? 'photo' : 'form';
  } catch (e) { console.error('[wa] classifyMedia err:', e); return 'form'; }
}

// Fotoğrafı mevcut bir siparişin SOHBETİNE (resim eki) bağlamayı dener.
async function routePhotoToOrder(url: string, key: string, labId: string, from: string | null,
  senderName: string | null, corrText: string, ctxId: string | null,
  dl: { b64: string; mime: string }): Promise<any> {
  try {
    const r = await fetch(`${url}/functions/v1/inbound-order-message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        lab_id: labId, sender_phone: from, sender_name: senderName,
        text: corrText, context_wamid: ctxId,
        attachment_b64: dl.b64, attachment_mime: dl.mime,
      }),
    });
    return await r.json().catch(() => ({}));
  } catch (e) { console.error('[wa] routePhotoToOrder err:', e); return {}; }
}

// ═══════════════════════════════════════════════════════════════════════════
//  KONUŞMA OTURUMU — menü + akış durum makinesi (FSM) + destek (insan) devri
// ═══════════════════════════════════════════════════════════════════════════

// Aktif akışta bu kadar sessizlik sonrası akış "bayat" sayılır (bilgi amaçlı).
const FINAL_STATUSES = ['teslim_edildi', 'iptal', 'iptal_edildi', 'reddedildi', 'tamamlandi'];

// İnsan devrini normalde LAB bitirir:
//   • WhatsApp'ta sohbete "/bot" yazarak, ya da
//   • Siman › Ayarlar › Destek Sohbetleri'ndeki "Sohbeti bitir" düğmesiyle.
//
// Eski 15/30 dakikalık pencere çok dardı — müşteriler saatler sonra yanıtlıyor,
// bot da insanın başlattığı konuşmanın ortasına giriyordu. Yine de unutulan
// oturumlar sonsuza dek kilitli kalmasın diye 12 saatlik bir emniyet var:
// 12 saat boyunca (iki taraftan da) hiç mesaj gelmezse konuşma bitmiş sayılır.
const HUMAN_IDLE_MS = 12 * 60 * 60 * 1000;   // 12 saat
const BOT_RELEASE_WORDS = ['/bot', '#bot', '/devret', 'bot devral', 'bota devret'];

// ── BOT VARSAYILAN OLARAK KAPALI ────────────────────────────────────────────
//
// Simanty kendiliğinden konuşmaya girmez. Müşteri aşağıdaki kelimelerden birini
// yazana (ya da eski bir menüye dokunana) kadar bot susar; mesaj Siman'daki
// Destek Sohbetleri'ne düşer ve bir insan yanıtlar.
//
// NEDEN: hatta gelen her mesaja botun atlaması, bir insanın yürüttüğü
// konuşmanın ortasına girmesine ve müşterinin robotla muhatap olmak zorunda
// kalmasına yol açıyordu. Varsayılan sessizlik "güvenli taraf": bot yalnız
// açıkça istendiğinde devreye girer.
const BOT_WAKE_WORDS = [
  'sipariş', 'siparis', 'siparişim', 'siparisim',
  'simanty', 'siman',
  'menü', 'menu', 'bot', 'asistan',
];

// Botu bırakıp insana bağlanma komutu. TAM eşleşme aranır (aksan sadeleşmiş):
// "yetkili" tek başına niyettir, ama "yetkili biriyle mi konuşuyorum acaba"
// cümlesinde devretmek yanlış olurdu — orası modelin işi.
const SUPPORT_WORDS = [
  'yetkili', 'destek', 'insan', 'temsilci', 'musteri temsilcisi',
  'yetkiliye baglan', 'birine baglan', 'canli destek',
];

// Labın kendi adı da uyandırır ("nexadent"). Sabit yazılmaz — çok kiracılı
// üründe her lab kendi adıyla çağrılabilmeli. Aşağıdaki genel sözcükler
// ayıklanır, yoksa "laboratuvar" gibi bir kelime her mesajda botu uyandırırdı.
const LAB_NAME_STOPWORDS = new Set([
  'dis', 'disi', 'dental', 'lab', 'laboratuvar', 'laboratuvari', 'laboratuar',
  'klinik', 'dijital', 'as', 'ltd', 'sti', 've',
]);

/**
 * Türkçe aksanları sadeleştirir — "SİPARİŞ", "Siparis", "sipariş" hepsi eşleşsin.
 * `toLocaleLowerCase('tr')` tek başına yetmez: kullanıcı çoğu zaman aksansız
 * yazar (siparis), bazen de klavyesi İngilizce olur (siparis/siparish).
 */
function normalizeTr(s: string): string {
  return String(s ?? '')
    .toLocaleLowerCase('tr')
    .replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/İ/g, 'i');
}

const BASE_WAKE_SET = new Set(BOT_WAKE_WORDS.map(normalizeTr));

/** Lab adından uyandırma kelimeleri: "NexaDent Diş Laboratuvarı" → ["nexadent"]. */
function labWakeWords(labName: string): string[] {
  return normalizeTr(labName)
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 4 && !LAB_NAME_STOPWORDS.has(w));
}

/**
 * Mesajda botu uyandıran bir kelime geçiyor mu?
 *
 * Kelime SINIRIYLA aranır: "sipariş" tetikler ama "siparişleriniz berbat"
 * cümlesindeki gibi bir şikâyette de tetikler — bu kabul edilmiş bir ödünç.
 * Alternatifi (tam eşleşme) "siparişim ne oldu" gibi en yaygın kullanımı
 * kaçırırdı ki botun asıl işi tam olarak o.
 */
function hasWakeWord(text: string, labName?: string): boolean {
  const norm = normalizeTr(text);
  if (!norm) return false;
  // Aksan sadeleştirmesinden sonra metin ASCII olduğu için \b güvenli.
  const words = [...BASE_WAKE_SET, ...(labName ? labWakeWords(labName) : [])];
  for (const w of words) {
    if (new RegExp(`\\b${w}\\b`).test(norm)) return true;
  }
  return false;
}

/**
 * Bot uyanmadığında müşteri sessizlikte kalmasın — oturumda BİR KEZ.
 *
 * İkinci paragraf yalnız "sipariş aç" demiyor: asistanın ne yapabildiğini
 * sayıyor. Tek bir kullanım anlatılırsa müşteri asistanı yalnız o iş için
 * kullanır, geri kalan yetenekleri hiç keşfedilmez. Aynı zamanda uyandırma
 * kelimesini de öğretir — bilinmezse hiç kullanılamaz.
 *
 * Fiyat bilerek yok: model fiyat/indirim taahhüdü vermiyor (whatsapp-brain
 * kural 2), burada vaat edilirse müşteri boşuna sorar.
 */
function humanAck(cx: Cx): string {
  const first = labWakeWords(cx.labName)[0];
  const call = first
    ? `*Simanty* ya da *${first.charAt(0).toLocaleUpperCase('tr') + first.slice(1)}*`
    : '*Simanty*';
  return (
    'Mesajınızı aldık 🙏 Ekibimizden biri en kısa sürede size dönecek.\n\n'
    + `Beklemek istemezseniz ${call} yazmanız yeterli — dijital asistanımız hemen devreye girer:\n`
    + '• Yeni sipariş oluşturma\n'
    + '• Siparişinizin hangi aşamada olduğunu ve teslim tarihini öğrenme\n'
    + '• Ölçü, fotoğraf ya da STL dosyası gönderme\n'
    + '• Aklınıza takılan soruları sorma\n\n'
    + 'Dilediğiniz an *yetkili* yazarak yine ekibimize dönebilirsiniz.'
  );
}

const RESET_WORDS = ['menü', 'menu', 'iptal', 'vazgeç', 'vazgec', 'baştan', 'basta', 'geri', 'ana menü', 'ana menu'];
// "Bir siparişe dosya eklemek istiyorum" gibi serbest metinler LLM'e düşüyordu.
// Model dosya EKLEYEMEZ (bilinçli: yazma yetkisi yok) — yalnız "menüden yapın"
// diyebiliyor, üstelik gönderenin telefonuna bağlı sipariş yoksa "sipariş
// göremiyorum" deyip insana devrediyordu. Niyet artık burada yakalanıp
// deterministik add_media akışına giriyor; o akış sipariş NUMARASINI da kabul
// ediyor, yani numaranın kayıtlı olması şart değil.
const MEDIA_NOUNS = ['dosya', 'foto', 'fotograf', 'resim', 'gorsel', 'olcu', 'stl', 'tarama', 'ply', 'zip'];
const MEDIA_VERBS = ['ekle', 'eklemek', 'gonder', 'gondermek', 'yukle', 'yuklemek', 'atmak', 'iletmek', 'paylas'];
function wantsAddMedia(text: string): boolean {
  const t = normalizeTr(text);
  if (t.length > 120) return false;              // uzun anlatım → niyet belirsiz, LLM baksın
  return MEDIA_NOUNS.some((n) => t.includes(n)) && MEDIA_VERBS.some((v) => t.includes(v));
}
const DONE_WORDS  = ['tamam', 'bitti', 'bitir', 'bitirdim', 'tamamdır', 'tamamdir', 'ok', 'okey', 'done'];
const NONE_WORDS  = ['yok', 'yoktur', 'hayır', 'hayir', 'no', '-', 'geç', 'gec'];

const STATUS_TR: Record<string, string> = {
  yeni: 'Yeni', beklemede: 'Beklemede', onay_bekliyor: 'Onay bekliyor',
  planlama: 'Planlamada', planlandi: 'Planlandı', tasarim: 'Tasarımda',
  uretimde: 'Üretimde', uretim: 'Üretimde', imalat: 'Üretimde',
  kalite: 'Kalite kontrolde', kalite_kontrol: 'Kalite kontrolde',
  hazir: 'Teslime hazır', teslime_hazir: 'Teslime hazır',
  kargoda: 'Kargoda', kuryede: 'Kuryede', teslim_edildi: 'Teslim edildi',
  tamamlandi: 'Tamamlandı', iptal: 'İptal', iptal_edildi: 'İptal edildi', reddedildi: 'Reddedildi',
};
function statusLabel(s: string): string { return STATUS_TR[s] ?? (s ? String(s) : 'Bilinmiyor'); }

interface Cx {
  url: string; key: string;
  phoneId: string; accessToken: string;
  labId: string; senderName: string | null;
  /** Laboratuvarın kendi adı — mesajlarda kullanılır (çok kiracılı: sabit ad yasak). */
  labName: string;
  H: Record<string, string>; HJmin: Record<string, string>;
}

interface WaSession {
  id: string; lab_id: string; sender_phone: string;
  mode: 'bot' | 'human';
  flow: string | null; step: string | null;
  draft: any; context: any;
  human_since: string | null; last_msg_at: string;
}

// ── Meta interactive LIST mesajı (en çok 10 satır) ──
async function sendList(phoneNumberId: string, accessToken: string, to: string, opts: {
  header?: string; body: string; footer?: string; button: string;
  rows: { id: string; title: string; description?: string }[];
}): Promise<string | null> {
  try {
    const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'interactive',
        interactive: {
          type: 'list',
          ...(opts.header ? { header: { type: 'text', text: opts.header.slice(0, 60) } } : {}),
          body: { text: opts.body.slice(0, 1024) },
          ...(opts.footer ? { footer: { text: opts.footer.slice(0, 60) } } : {}),
          action: {
            button: opts.button.slice(0, 20),
            sections: [{
              rows: opts.rows.slice(0, 10).map(r => ({
                id: r.id.slice(0, 200),
                title: r.title.slice(0, 24),
                ...(r.description ? { description: r.description.slice(0, 72) } : {}),
              })),
            }],
          },
        },
      }),
    });
    const d = await r.json().catch(() => null);
    return d?.messages?.[0]?.id ?? null;
  } catch (e) { console.error('[wa] sendList err:', e); return null; }
}


// ── Serbest metin yanıtlayıcı (LLM) ──────────────────────────────────────
//
// Menüye ve akışlara UYMAYAN mesajlar buraya düşer. İşlemsel adımlar (sipariş
// oluşturma, diş no, tarih, foto) buraya HİÇ gelmez — onlar deterministik
// akışta kalır, çünkü oradaki bir yanlış anlama bozuk iş emri üretir.
//
// Başarısız olursa (kota, LLM hatası, zaman aşımı) çağıran taraf eski
// davranışa — menüye — döner. Yani bu katman sadece iyileştirir, akışı kırmaz.
const BRAIN_TIMEOUT_MS = 8000;

async function askBrain(
  cx: Cx, phone: string, text: string,
  who: { doctorId?: string; clinicId?: string; clinicName?: string | null; doctorName?: string | null } | null,
): Promise<{ reply: string; handoff: boolean } | null> {
  try {
    // Sipariş listesini BURADA çözüp gönderiyoruz. Beyin kendisi yalnız
    // doctor_id ile sorgulayabiliyordu; lab yöneticisi yazınca doctor_id null
    // olduğu için "size bağlı sipariş yok" diyordu. Kapsam kuralı (yönetici →
    // hepsi, hekim → kendi, klinik → kliniğin) tek yerde: listSenderOrders.
    const scoped = await listSenderOrders(cx, phone);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), BRAIN_TIMEOUT_MS);
    const r = await fetch(`${cx.url}/functions/v1/whatsapp-brain`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cx.key}`,
        'x-wa-secret': Deno.env.get('WA_BRAIN_SECRET') ?? '',
      },
      body: JSON.stringify({
        lab_id: cx.labId, phone, text,
        sender_name: cx.senderName,
        doctor_id:   who?.doctorId ?? null,
        clinic_id:   who?.clinicId ?? null,
        clinic_name: who?.clinicName ?? null,
        doctor_name: who?.doctorName ?? null,
        orders: scoped.map((x) => ({ order_number: x.order_number, patient_name: x.patient_name, status: x.status, work_type: x.work_type ?? null, delivery_date: x.delivery_date ?? null })),
      }),
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d?.ok || !d?.reply) return null;
    return { reply: String(d.reply), handoff: d.handoff === true };
  } catch (e) {
    console.error('[wa] askBrain err:', (e as any)?.message);
    return null;
  }
}

/**
 * Ana menü — TEK mesaj.
 *
 * Eskiden yanıt ile menü ayrı ayrı gidiyordu: kullanıcı üst üste iki balon
 * görüyordu ("Ben Simanty…" + "Aşağıdaki menüden bir işlem seçin"). WhatsApp
 * interactive-list mesajının kendi `body`'si olduğu için ikisi tek balonda
 * birleşebiliyor — hem daha az gürültü hem daha sohbet gibi.
 *
 * `greet` yalnız oturumun ilk temasında true olur: Simanty kendini tanıtır ve
 * yapay zekâ olduğunu söyler (her mesajda tekrarlarsa gürültü, hiç söylenmezse
 * kullanıcı insan sanır). İşaret oturum context'inde (`ai_notified`) tutulur.
 *
 * Hitap "siz" — müşteriler hekim/klinik, botun geri kalanı da "siz" kullanıyor.
 * Samimiyet ton ve cümle kuruluşundan geliyor, senli-benli olmaktan değil.
 */
const MENU_TAIL =
  'Aşağıdan bir işlem seçebilirsiniz — ya da ne istediğinizi bana yazın, '
  + 'ben halledeyim. 🙂';

const AI_NOTE =
  '_Simanty yapay zekâ asistanıdır. Dilediğiniz an *yetkili* yazarsanız sizi ekipten birine bağlarım._';

async function sendMenu(
  cx: Cx,
  to: string,
  intro?: string,
  opts?: { greet?: boolean },
): Promise<void> {
  const parts: string[] = [];
  if (opts?.greet) parts.push(`Selam! 👋 Ben *Simanty*, ${cx.labName} ekibinin dijital asistanıyım.`);
  if (intro?.trim()) parts.push(intro.trim());
  parts.push(MENU_TAIL);
  if (opts?.greet) parts.push(AI_NOTE);

  const body = parts.join('\n\n').slice(0, 1024);   // Meta sınırı
  const wamid = await sendList(cx.phoneId, cx.accessToken, to, {
    header: cx.labName,
    body,
    button: 'Menüyü aç',
    rows: [
      { id: 'menu_new_order', title: '🆕 Yeni sipariş',    description: 'Yeni iş emri oluşturun' },
      { id: 'menu_status',    title: '📊 Sipariş durumu',   description: 'Siparişinizin aşamasını görün' },
      { id: 'menu_add_media', title: '📎 Dosya/foto ekle',  description: 'Mevcut siparişe dosya ekleyin' },
      { id: 'menu_support',   title: '🎧 Destek ekibi',     description: 'Bir yetkiliyle görüşün' },
    ],
  });
  await logMessage(cx, { peer: to, direction: 'out', body, wamid, source: 'bot' });
}

/**
 * Botun düz metin yanıtı — gönder VE sohbet geçmişine yaz.
 *
 * Tüm `sendText(cx.phoneId, cx.accessToken, …)` çağrıları buna taşındı; kayıt
 * gönderimin yanına elle eklenirse er geç bir çağrı unutulur ve sohbet
 * geçmişinde delik açılır.
 */
async function say(cx: Cx, to: string, body: string): Promise<void> {
  const wamid = await sendText(cx.phoneId, cx.accessToken, to, body);
  await logMessage(cx, { peer: to, direction: 'out', body, wamid, source: 'bot' });
}

// ── Sohbet geçmişi (whatsapp_messages) ───────────────────────────────────
//
// Cloud API hattında labın gelen kutusu YOK — müşteri mesajlarını okuyabildiği
// tek yer Siman. Bu yüzden hem gelen hem giden her mesaj buraya yazılır.
// Kayıt best-effort: hata akışı kırmaz, botun cevap vermesini engellemez.
async function logMessage(cx: Cx, row: {
  peer: string;
  direction: 'in' | 'out';
  body: string | null;
  wamid?: string | null;
  source: 'customer' | 'bot' | 'human' | 'echo';
}): Promise<void> {
  try {
    await fetch(`${cx.url}/rest/v1/whatsapp_messages`, {
      method: 'POST',
      // wamid'de kısmi UNIQUE var; Meta webhook'u yeniden denerse çift kayıt
      // olmasın diye çakışma yok sayılır.
      headers: { ...cx.HJmin, Prefer: 'return=minimal,resolution=ignore-duplicates' },
      body: JSON.stringify({
        lab_id: cx.labId, peer_phone: row.peer, direction: row.direction,
        body: row.body ?? null, wamid: row.wamid ?? null, source: row.source,
      }),
    });
  } catch (e) { console.error('[wa] logMessage err:', e); }
}

/**
 * Bu wamid bizim gönderdiğimiz bir mesaja mı ait?
 *
 * Coexistence açıldığında Meta, İŞ NUMARASINDAN çıkan her mesajı echo'lar —
 * botun kendi mesajları dâhil. Ayrım yapılmazsa bot kendi cevabını "insan
 * yazdı" sanıp kendini susturur. Tek güvenilir ayraç: gönderirken kaydettiğimiz
 * wamid. Listede YOKSA mesajı bir insan elle yazmıştır.
 */
async function isOurOutbound(cx: Cx, wamid: string): Promise<boolean> {
  if (!wamid) return false;
  try {
    const r = await fetch(
      `${cx.url}/rest/v1/whatsapp_messages?wamid=eq.${encodeURIComponent(wamid)}&select=id&limit=1`,
      { headers: cx.H },
    );
    if (!r.ok) return false;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) { console.error('[wa] isOurOutbound err:', e); return false; }
}

// ── Oturum CRUD (service role) ──
async function getSession(cx: Cx, phone: string): Promise<WaSession | null> {
  try {
    const r = await fetch(`${cx.url}/rest/v1/whatsapp_sessions?lab_id=eq.${cx.labId}&sender_phone=eq.${encodeURIComponent(phone)}&select=*&limit=1`, { headers: cx.H });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] as WaSession : null;
  } catch (e) { console.error('[wa] getSession err:', e); return null; }
}

// UPSERT (merge-duplicates). draft/context değiştiriyorsan TAM halini geçir.
async function saveSession(cx: Cx, phone: string, patch: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${cx.url}/rest/v1/whatsapp_sessions?on_conflict=lab_id,sender_phone`, {
      method: 'POST',
      headers: { ...cx.H, 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ lab_id: cx.labId, sender_phone: phone, ...patch, last_msg_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    });
  } catch (e) { console.error('[wa] saveSession err:', e); }
}

async function resetSession(cx: Cx, phone: string): Promise<void> {
  await saveSession(cx, phone, { mode: 'bot', flow: null, step: null, draft: {}, context: {}, human_since: null });
}

// Labın MANUEL yanıtı (echo) geldi → o müşteriyi 'human'a çevir. Bot, lab
// açıkça bırakana kadar susar (zaman aşımı yok — bkz. BOT_RELEASE_WORDS).
// Mevcut context korunur; eski idle_min penceresi artık okunmuyor.
async function markHumanFromLab(cx: Cx, phone: string): Promise<void> {
  const s = await getSession(cx, phone);
  const ctx = (s?.context && typeof s.context === 'object') ? s.context : {};
  await saveSession(cx, phone, {
    mode: 'human',
    human_since: s?.human_since ?? new Date().toISOString(),
    context: { ...ctx, human_lab: true },
  });
}

// ── Mesaj yardımcıları ──
function interactiveId(msg: any): string | null {
  const i = msg?.interactive;
  return i?.list_reply?.id ?? i?.button_reply?.id ?? null;
}
function msgText(msg: any): string {
  return String(msg?.text?.body ?? msg?.interactive?.list_reply?.title ?? msg?.interactive?.button_reply?.title ?? '').trim();
}
function mediaOf(msg: any): { id: string; caption: string; kind: 'image' | 'document' | 'video'; mime: string; filename?: string } | null {
  if (msg?.type === 'image' && msg?.image?.id) return { id: msg.image.id, caption: String(msg.image.caption ?? '').trim(), kind: 'image', mime: msg.image.mime_type ?? 'image/jpeg' };
  if (msg?.type === 'document' && msg?.document?.id) return { id: msg.document.id, caption: String(msg.document.caption ?? '').trim(), kind: 'document', mime: msg.document.mime_type ?? 'application/octet-stream', filename: msg.document.filename };
  if (msg?.type === 'video' && msg?.video?.id) return { id: msg.video.id, caption: String(msg.video.caption ?? '').trim(), kind: 'video', mime: msg.video.mime_type ?? 'video/mp4' };
  return null;
}
// Dosya uzantısı MIME'dan türetilir. 'html' listede yoktu: exocad/3Shape
// tasarım ÖNİZLEMELERİ text/html olarak gelir ve dosya `.bin` diye kaydediliyordu
// — tarayıcı onu açmıyor, kullanıcı "tasarımı göremiyorum" diyor. Alt satırdaki
// 'bin' yalnız gerçekten bilinmeyen türler için kalmalı.
function extFromMime(mime: string, filename?: string): string {
  if (filename && filename.includes('.')) return filename.split('.').pop()!.slice(0, 8).toLowerCase();
  const m = String(mime).toLowerCase();
  if (m.includes('html')) return 'html';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('zip')) return 'zip';
  if (m.includes('rar')) return 'rar';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('heic')) return 'heic';
  if (m.includes('xml'))  return 'xml';
  if (m.includes('json')) return 'json';
  if (m.includes('csv'))  return 'csv';
  if (m.includes('plain')) return 'txt';
  return 'bin';
}

async function fetchWaMedia(cx: Cx, mediaId: string): Promise<{ b64: string; mime: string } | null> {
  const resolved = await resolveMediaUrl(mediaId, cx.accessToken);
  if (!resolved) return null;
  return await downloadMediaBase64(resolved.url, cx.accessToken);
}

// ── Sipariş çözümleme (gönderen telefon → profil → aktif siparişler) ──
async function resolveProfileByPhone(cx: Cx, phone: string): Promise<string | null> {
  const digits = String(phone).replace(/[^\d]/g, '');
  if (!digits) return null;
  try {
    let r = await fetch(`${cx.url}/rest/v1/profiles?whatsapp_phone=eq.%2B${digits}&select=id&limit=1`, { headers: cx.H });
    let rows = r.ok ? await r.json() : [];
    if (!(Array.isArray(rows) && rows[0])) {
      r = await fetch(`${cx.url}/rest/v1/profiles?whatsapp_phone=eq.${digits}&select=id&limit=1`, { headers: cx.H });
      rows = r.ok ? await r.json() : [];
    }
    return Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
  } catch { return null; }
}

type OrderLite = { id: string; order_number: string; patient_name: string; status: string; work_type?: string | null; delivery_date?: string | null };

/** Gönderenin görebileceği sipariş kümesi.
 *  Karar: numaraya bağlı olmayan kimse sipariş ARAYAMAZ (numara doğrulaması
 *  güvenliğin kendisi). Tek istisna laboratuvarın kendi yöneticileri —
 *  user_type='admin' ya da lab/manager — onlar tüm siparişleri görür.
 *  Teknisyen/kurye kasten dışarıda: onların WhatsApp'tan sipariş taramasına
 *  gerek yok, panelleri var. */
type SenderScope =
  | { kind: 'staff' }
  | { kind: 'clinic'; clinicId: string }
  | { kind: 'doctor'; doctorId: string };

/** Telefon → profil. Kayıtlı numaralar "+9053…" ya da "053…" biçiminde
 *  olabiliyor; WhatsApp ise hep "9053…" gönderiyor. Eşit-karşılaştırma bu
 *  yüzden lab yöneticilerinin yarısını ıskalıyordu → son 10 haneyle de dene. */
async function profileByPhone(cx: Cx, phone: string): Promise<any | null> {
  const digits = String(phone).replace(/[^\d]/g, '');
  if (!digits) return null;
  const sel = 'select=id,user_type,role,lab_id,clinic_id,full_name&limit=1';
  const tail = digits.slice(-10);
  const tries = [
    `whatsapp_phone=eq.%2B${digits}&${sel}`,
    `whatsapp_phone=eq.${digits}&${sel}`,
    tail.length === 10 ? `whatsapp_phone=like.*${tail}&${sel}` : null,
  ].filter(Boolean) as string[];
  for (const q of tries) {
    try {
      const r = await fetch(`${cx.url}/rest/v1/profiles?${q}`, { headers: cx.H });
      const rows = r.ok ? await r.json() : [];
      if (Array.isArray(rows) && rows[0]) return rows[0];
    } catch { /* sıradaki biçimi dene */ }
  }
  return null;
}

async function senderScope(cx: Cx, phone: string): Promise<SenderScope | null> {
  const prof = await profileByPhone(cx, phone);
  if (!prof) return null;
  const isStaff = (prof.user_type === 'admin' || (prof.user_type === 'lab' && prof.role === 'manager'))
    && prof.lab_id === cx.labId;
  if (isStaff) return { kind: 'staff' };
  if (prof.user_type === 'doctor') {
    const d = await resolveDoctorForPhone(cx, phone);
    if (d) return { kind: 'doctor', doctorId: d.doctorId };
  }
  if (prof.clinic_id) return { kind: 'clinic', clinicId: prof.clinic_id };
  return null;
}

/** Kapsamı PostgREST filtresine çevirir; klinik için hekim listesi çözülür. */
async function scopeFilter(cx: Cx, scope: SenderScope): Promise<string | null> {
  if (scope.kind === 'staff')  return '';
  if (scope.kind === 'doctor') return `&doctor_id=eq.${scope.doctorId}`;
  try {
    const r = await fetch(`${cx.url}/rest/v1/doctors?clinic_id=eq.${scope.clinicId}&select=id`, { headers: cx.H });
    const rows = r.ok ? await r.json() : [];
    const ids = Array.isArray(rows) ? rows.map((x: any) => x.id).filter(Boolean) : [];
    if (!ids.length) return null;
    return `&doctor_id=in.(${ids.join(',')})`;
  } catch { return null; }
}

async function listSenderOrders(cx: Cx, phone: string): Promise<OrderLite[]> {
  const scope = await senderScope(cx, phone);
  if (!scope) return [];
  const filter = await scopeFilter(cx, scope);
  if (filter == null) return [];
  try {
    // NOT: work_orders.doctor_id → doctors.id'dir, profiles.id DEĞİL. Burada
    // profil kimliği kullanılıyordu; kayıtlı hekimler için bile liste hep boş
    // dönüyor, bot "size ait sipariş göremiyorum" diyordu.
    const r = await fetch(`${cx.url}/rest/v1/work_orders?lab_id=eq.${cx.labId}${filter}&select=id,order_number,patient_name,status,work_type,delivery_date&order=created_at.desc&limit=40`, { headers: cx.H });
    if (!r.ok) return [];
    const rows = await r.json();
    if (!Array.isArray(rows)) return [];
    return rows.filter((o: any) => !FINAL_STATUSES.includes(o.status)).slice(0, 10);
  } catch { return []; }
}

async function getOrderById(cx: Cx, id: string): Promise<OrderLite | null> {
  try {
    const r = await fetch(`${cx.url}/rest/v1/work_orders?id=eq.${id}&lab_id=eq.${cx.labId}&select=id,order_number,patient_name,status&limit=1`, { headers: cx.H });
    const rows = r.ok ? await r.json() : [];
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch { return null; }
}

/** Numara/hasta adıyla sipariş arar — YALNIZ gönderenin kapsamı içinde.
 *  Eskiden lab genelinde arıyordu: hatta yazan herkes numarayı bilirse (ya da
 *  denerse) yabancı bir siparişin hasta adını görebiliyor, dosya ekleyebiliyordu. */
async function findOrderByRef(cx: Cx, phone: string, ref: string): Promise<OrderLite | null> {
  const t = String(ref).trim();
  if (!t) return null;
  const scope = await senderScope(cx, phone);
  if (!scope) return null;
  const filter = await scopeFilter(cx, scope);
  if (filter == null) return null;
  try {
    const r = await fetch(`${cx.url}/rest/v1/work_orders?lab_id=eq.${cx.labId}${filter}&select=id,order_number,patient_name,status&order=created_at.desc&limit=200`, { headers: cx.H });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows)) return null;
    const digits = t.replace(/\D/g, '');
    let hit = digits.length >= 3 ? rows.find((o: any) => String(o.order_number ?? '').replace(/\D/g, '').includes(digits)) : null;
    if (!hit) {
      const low = t.toLocaleLowerCase('tr');
      if (low.length >= 3) hit = rows.find((o: any) => String(o.patient_name ?? '').toLocaleLowerCase('tr').includes(low));
    }
    return hit ? { id: hit.id, order_number: hit.order_number, patient_name: hit.patient_name, status: hit.status } : null;
  } catch { return null; }
}

async function orderStatusText(cx: Cx, order: OrderLite): Promise<string> {
  let stageLine = '';
  try {
    const r = await fetch(`${cx.url}/rest/v1/order_stages?work_order_id=eq.${order.id}&select=status,completed_at,sequence_order,lab_stations(name)&order=sequence_order.asc`, { headers: cx.H });
    if (r.ok) {
      const st = await r.json();
      if (Array.isArray(st) && st.length) {
        const isDone = (x: any) => x.status === 'tamamlandi' || x.status === 'completed' || !!x.completed_at;
        const total = st.length;
        const done = st.filter(isDone).length;
        const cur = st.find((x: any) => !isDone(x));
        const curName = cur?.lab_stations?.name ?? null;
        stageLine = curName
          ? `\n🔧 Şu an: *${curName}*  (${done}/${total} aşama tamam)`
          : `\n✅ Tüm aşamalar tamamlandı (${done}/${total})`;
      }
    }
  } catch { /* aşama yoksa yalnız statü */ }
  const pn = order.patient_name ? ` · ${order.patient_name}` : '';
  return `📊 *${order.order_number}*${pn}\nDurum: *${statusLabel(order.status)}*${stageLine}`;
}

// ── Medyayı siparişin DOSYALAR bölümüne (work_order_photos) ekle ──
async function attachMediaToOrder(cx: Cx, workOrderId: string, b64: string, mime: string, filename: string | undefined, caption: string): Promise<boolean> {
  try {
    const ext = extFromMime(mime, filename);
    // RLS (wop_select_orders) YALNIZ 'orders/<work_order_id>/...' yolunu lab tarafına açar.
    // Öneksiz yol hiçbir politikayla eşleşmez → dosya yüklenir ama lab GÖREMEZ.
    const path = `orders/${workOrderId}/wa-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const up = await fetch(`${cx.url}/storage/v1/object/work-order-photos/${path}`, {
      method: 'POST',
      headers: { apikey: cx.key, Authorization: `Bearer ${cx.key}`, 'Content-Type': mime, 'x-upsert': 'true', 'Cache-Control': '3600' },
      body: bytes,
    });
    if (!up.ok) { console.error('[wa] order-photo upload fail', up.status, (await up.text()).slice(0, 150)); return false; }
    // DİKKAT: `caption` kolonu arayüzde HEM dosya adı HEM kategori anahtarı.
    // OrderDetailScreenV2 adı `caption ?? storage_path` ile gösteriyor,
    // kategoriyi de `fileCategoryOf(caption || storage_path)` ile UZANTIDAN
    // çözüyor. Buraya gönderenin profil adı ya da boş metin yazılınca dosya
    // "." adıyla ve "Diğer" grubunda görünüyordu. Bu yüzden caption'a her zaman
    // UZANTILI, anlamlı bir ad yazılır.
    const typed = (caption || '').trim();
    const docName = (filename || '').trim();
    let displayName: string;
    if (docName && docName !== '.') {
      displayName = docName;                       // belgede gerçek dosya adı var
    } else if (typed && typed !== '.') {
      displayName = typed;                         // kullanıcının yazdığı açıklama
    } else {
      const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
      displayName = `WhatsApp ${ts}`;
    }
    // Kategori uzantıdan çözüldüğü için ad mutlaka uzantıyla bitmeli.
    if (!new RegExp(`\\.${ext}$`, 'i').test(displayName)) displayName = `${displayName}.${ext}`;

    const ins = await fetch(`${cx.url}/rest/v1/work_order_photos`, {
      method: 'POST', headers: cx.HJmin,
      body: JSON.stringify({ work_order_id: workOrderId, storage_path: path, lab_id: cx.labId, caption: displayName.slice(0, 200), external_source: 'whatsapp' }),
    });
    return ins.ok;
  } catch (e) { console.error('[wa] attachMediaToOrder err:', e); return false; }
}

// Soğuk-başlangıç tamponundaki (cold_stash) medyayı çek + tüket.
async function takeColdStash(cx: Cx, phone: string): Promise<{ storage_path: string; mime: string; caption: string }[]> {
  try {
    const since = new Date(Date.now() - 30 * 60_000).toISOString();
    const q = `${cx.url}/rest/v1/whatsapp_pending_media?lab_id=eq.${cx.labId}`
      + `&sender_phone=eq.${encodeURIComponent(phone)}&state=eq.cold_stash&consumed_at=is.null`
      + `&created_at=gte.${encodeURIComponent(since)}&select=id,storage_path,mime,caption&order=created_at.asc`;
    const r = await fetch(q, { headers: cx.H });
    const rows = r.ok ? await r.json() : [];
    if (!Array.isArray(rows) || !rows.length) return [];
    const ids = rows.map((x: any) => x.id).filter(Boolean);
    if (ids.length) {
      await fetch(`${cx.url}/rest/v1/whatsapp_pending_media?id=in.(${ids.join(',')})`, {
        method: 'PATCH', headers: cx.HJmin, body: JSON.stringify({ consumed_at: new Date().toISOString() }),
      });
    }
    return rows.map((x: any) => ({ storage_path: x.storage_path, mime: x.mime ?? 'image/jpeg', caption: x.caption ?? '' }));
  } catch { return []; }
}

// ── Destek personeline bildirim (labın yönetici/admin profilleri) ──
async function notifyLabSupport(cx: Cx, phone: string, opts?: { title?: string; body?: string }): Promise<void> {
  const num = String(phone).replace(/[^\d]/g, '');
  try {
    const r = await fetch(`${cx.url}/rest/v1/profiles?lab_id=eq.${cx.labId}&user_type=eq.lab&role=in.(manager,admin)&select=id`, { headers: cx.H });
    const rows = r.ok ? await r.json() : [];
    const ids: string[] = Array.isArray(rows) ? rows.map((x: any) => x.id).filter(Boolean) : [];
    if (ids.length) {
      const payload = ids.map((uid) => ({
        user_id: uid, lab_id: cx.labId, category: 'support',
        title: opts?.title ?? 'WhatsApp destek talebi',
        body: opts?.body ?? `+${num} bir yetkiliyle görüşmek istiyor. WhatsApp hattından yanıtlayın.`,
        resource_type: 'whatsapp_session',
      }));
      await fetch(`${cx.url}/rest/v1/notifications`, { method: 'POST', headers: cx.HJmin, body: JSON.stringify(payload) });
    }
  } catch (e) { console.error('[wa] notifyLabSupport err:', e); }
  try {
    await fetch(`${cx.url}/rest/v1/rpc/log_activity`, {
      method: 'POST', headers: cx.HJmin,
      body: JSON.stringify({ p_action: 'wa_support_request', p_entity_type: 'whatsapp_session', p_entity_label: `+${num} destek istedi`, p_metadata: { phone: num }, p_lab_id: cx.labId }),
    });
  } catch { /* opsiyonel denetim izi */ }
}

// ═══════════════════════════════════════════════════════════════════════════
//  AKIŞLAR
// ═══════════════════════════════════════════════════════════════════════════

async function enterFlow(cx: Cx, from: string, iid: string): Promise<void> {
  if (iid === 'menu_new_order') return startNewOrder(cx, from);
  if (iid === 'menu_status')    return startStatus(cx, from);
  if (iid === 'menu_add_media') return startAddMedia(cx, from);
  if (iid === 'menu_support')   return startSupport(cx, from);
  await sendMenu(cx, from);
}

// ── Destek (insan devri) ──
async function startSupport(cx: Cx, from: string): Promise<void> {
  await saveSession(cx, from, { mode: 'human', flow: null, step: null, draft: {}, context: {}, human_since: new Date().toISOString() });
  await say(cx, from, '🎧 Talebinizi aldık. Destek ekibimiz en kısa sürede *bu WhatsApp hattından* size dönüş yapacak. Teşekkürler! 🙏');
  await notifyLabSupport(cx, from);
}

/** Numarası sistemde tanımlı olmayan gönderen. Sipariş numarası sorup lab
 *  genelinde aramak bir zamanlar buradaki davranıştı; yabancıya hasta adı
 *  sızdırdığı için bırakıldı — bunun yerine insana devrediyoruz. */
async function sayUnregistered(cx: Cx, from: string): Promise<void> {
  await say(cx, from, 'Bu numara sistemimizde kayıtlı görünmüyor, o yüzden sipariş bilgisi paylaşamıyorum. Sizi bir yetkiliye aktarıyorum — birazdan bu hattan dönüş yapılacak. 🙏');
  await startSupport(cx, from);
}

// ── Sipariş durumu ──
async function startStatus(cx: Cx, from: string): Promise<void> {
  if (!(await senderScope(cx, from))) return sayUnregistered(cx, from);
  const orders = await listSenderOrders(cx, from);
  if (orders.length === 0) {
    await saveSession(cx, from, { flow: 'status', step: 'ask_ref', draft: {}, context: {} });
    await say(cx, from, 'Adınıza kayıtlı aktif sipariş bulamadım. Lütfen *sipariş numarasını* (örn. LAB-2026-0120) veya *hasta adını* yazın. 🔢');
    return;
  }
  await saveSession(cx, from, { flow: 'status', step: 'pick', draft: {}, context: {} });
  await sendList(cx.phoneId, cx.accessToken, from, {
    header: 'Sipariş durumu',
    body: 'Durumunu görmek istediğiniz siparişi seçin:',
    button: 'Siparişi seç',
    rows: orders.map((o) => ({ id: `ord:${o.id}`, title: (o.order_number || 'Sipariş').slice(0, 24), description: `${o.patient_name ?? ''} · ${statusLabel(o.status)}`.slice(0, 72) })),
  });
}

async function flowStatus(cx: Cx, from: string, sess: WaSession, iid: string | null, text: string): Promise<void> {
  let order: OrderLite | null = null;
  if (iid && iid.startsWith('ord:')) order = await getOrderById(cx, iid.slice(4));
  else if (text) order = await findOrderByRef(cx, from, text);

  if (order) {
    await say(cx, from, await orderStatusText(cx, order));
    await resetSession(cx, from);
    await sendMenu(cx, from);
    return;
  }
  await say(cx, from, 'O siparişi bulamadım. *Tam sipariş numarası* (LAB-2026-0120) veya *hasta adını* yazın. Baştan başlamak için *"menü"* yazabilirsiniz.');
}

// ── Mevcut siparişe dosya/foto ekle ──
async function startAddMedia(cx: Cx, from: string): Promise<void> {
  if (!(await senderScope(cx, from))) return sayUnregistered(cx, from);
  const orders = await listSenderOrders(cx, from);
  if (orders.length === 0) {
    await saveSession(cx, from, { flow: 'add_media', step: 'ask_ref', draft: {}, context: {} });
    await say(cx, from, 'Hangi siparişe eklemek istersiniz? *Sipariş numarasını* veya *hasta adını* yazın. 🔢');
    return;
  }
  await saveSession(cx, from, { flow: 'add_media', step: 'pick', draft: {}, context: {} });
  await sendList(cx.phoneId, cx.accessToken, from, {
    header: 'Dosya/foto ekle',
    body: 'Hangi siparişe ekleyelim?',
    button: 'Siparişi seç',
    // Son satır kaçış deliği: liste yalnız GÖNDEREN numaraya bağlı siparişleri
    // gösteriyor; başkasının siparişine dosya eklemek isteyen kilitli kalıyordu.
    rows: [
      ...orders.map((o) => ({ id: `ord:${o.id}`, title: (o.order_number || 'Sipariş').slice(0, 24), description: `${o.patient_name ?? ''} · ${statusLabel(o.status)}`.slice(0, 72) })),
      { id: 'ord_ref', title: 'Başka sipariş', description: 'Sipariş numarasını yazarak seçin' },
    ],
  });
}

async function beginCollect(cx: Cx, from: string, o: OrderLite): Promise<void> {
  await saveSession(cx, from, { flow: 'add_media', step: 'collect', draft: {}, context: { order_id: o.id, order_number: o.order_number } });
  // Soğuk-tamponda bekleyen medya varsa hemen ekle.
  const stash = await takeColdStash(cx, from);
  let added = 0;
  for (const s of stash) {
    const dl = await downloadStorageBase64(cx.url, cx.key, 'paper-orders', s.storage_path);
    if (dl && await attachMediaToOrder(cx, o.id, dl.b64, dl.mime, undefined, s.caption)) added++;
  }
  const extra = added ? ` Az önce gönderdiğiniz ${added} dosya eklendi.` : '';
  await say(cx, from, `✅ *${o.order_number}* seçildi.${extra}\nŞimdi eklemek istediğiniz *foto / ölçü / STL / ZIP* dosyalarını gönderin. Bittiğinde *"menü"* yazın.`);
}

/** Seri sayacını atomik artırır; dönen değer bu dosyanın sıra numarasıdır. */
async function burstBump(cx: Cx, phone: string): Promise<number> {
  try {
    const r = await fetch(`${cx.url}/rest/v1/rpc/wa_media_burst_bump`, {
      method: 'POST',
      headers: { ...cx.H, 'content-type': 'application/json' },
      body: JSON.stringify({ p_lab: cx.labId, p_phone: phone }),
    });
    const v = await r.json().catch(() => 0);
    return Number(v) || 0;
  } catch { return 0; }
}

/** Sayacı okuyup sıfırlar; dönen değer o seride eklenen dosya sayısıdır. */
async function burstFlush(cx: Cx, phone: string): Promise<number> {
  try {
    const r = await fetch(`${cx.url}/rest/v1/rpc/wa_media_burst_flush`, {
      method: 'POST',
      headers: { ...cx.H, 'content-type': 'application/json' },
      body: JSON.stringify({ p_lab: cx.labId, p_phone: phone }),
    });
    const v = await r.json().catch(() => 0);
    return Number(v) || 0;
  } catch { return 0; }
}

/**
 * Serinin ilk dosyasında çağrılır: kısa süre bekler, bu sırada gelen dosyalar
 * sayacı artırır, sonra TEK bir özet mesajı gönderir.
 *
 * Neden bekleme: WhatsApp çoklu gönderimde her dosyayı ayrı webhook olarak
 * yolluyor; 6 fotoğraf = 6 çağrı = eskiden 6 ayrı "eklendi" mesajı.
 * Bekleme süresince yeni dosya gelmezse tek mesaj çıkar. Daha uzun süren
 * gönderimlerde sayaç sıfırlandığı için yeni bir seri başlar — nadiren iki
 * özet olur, altı tane değil.
 */
function scheduleBurstAck(cx: Cx, to: string, orderNo: string): void {
  const job = (async () => {
    await new Promise((r) => setTimeout(r, 6000));
    const n = await burstFlush(cx, to);
    if (n <= 0) return;
    const adet = n === 1 ? '1 dosya' : `${n} dosya`;
    await say(cx, to, `📎 *${orderNo}* siparişine ${adet} eklendi. Başka dosya gönderin ya da *"menü"* yazın.`);
  })().catch((e) => console.error('[wa] burst ack error:', e));
  // @ts-ignore — EdgeRuntime global (Supabase Edge)
  if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any)?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(job);
  }
}

async function flowAddMedia(cx: Cx, from: string, sess: WaSession, iid: string | null, text: string, media: ReturnType<typeof mediaOf>): Promise<void> {
  const step = sess.step;
  if (step === 'pick' && iid && iid.startsWith('ord:')) {
    const o = await getOrderById(cx, iid.slice(4));
    if (!o) { await say(cx, from, 'Siparişi bulamadım. *"menü"* yazın.'); return; }
    await beginCollect(cx, from, o);
    return;
  }
  // Listeden seçmek yerine numara/isim YAZDIYSA: eskiden bu dal yoktu, mesaj
  // en alttaki sendMenu'ye düşüyor ve akış sıfırlanıyordu. Kendi listesinde
  // olmayan bir siparişe (ör. asistan başka numaradan yazıyor) dosya eklemenin
  // hiçbir yolu kalmıyordu.
  if (step === 'pick' && iid === 'ord_ref') {
    await saveSession(cx, from, { flow: 'add_media', step: 'ask_ref', draft: {}, context: {} });
    await say(cx, from, 'Sipariş numarasını (örn. *LAB-2026-0162*) veya *hasta adını* yazın. 🔢');
    return;
  }
  if ((step === 'pick' || step === 'ask_ref') && text && !media) {
    const o = await findOrderByRef(cx, from, text);
    if (!o) {
      await say(cx, from, 'O siparişi bulamadım. *Tam sipariş numarasını* (örn. LAB-2026-0162) veya *hasta adını* yazın ya da *"menü"*.');
      await saveSession(cx, from, { flow: 'add_media', step: 'ask_ref', draft: {}, context: {} });
      return;
    }
    await beginCollect(cx, from, o);
    return;
  }
  if (step === 'collect') {
    const orderId = sess.context?.order_id;
    const orderNo = sess.context?.order_number ?? 'sipariş';
    if (media && orderId) {
      const dl = await fetchWaMedia(cx, media.id);
      if (!dl) { await say(cx, from, '⚠️ Dosya indirilemedi, tekrar gönderin.'); return; }
      const ok = await attachMediaToOrder(cx, orderId, dl.b64, dl.mime, media.filename, media.caption || '');
      // NOT: `context` BİLEREK yazılmıyor — sayaç orada tutuluyor ve buradan
      // eski kopyayı geri yazmak onu ezerdi. PostgREST merge yalnız gönderilen
      // kolonları günceller, context olduğu gibi kalır.
      await saveSession(cx, from, { flow: 'add_media', step: 'collect' });
      if (!ok) { await say(cx, from, '⚠️ Eklenemedi, tekrar deneyin.'); return; }

      // Toplu gönderimde her dosyaya ayrı onay atmak yerine TEK özet:
      // her dosya ayrı webhook çağrısı olduğu için sayaç DB'de atomik artar;
      // yalnız serinin İLK dosyası kısa bir bekleme sonrası özeti gönderir.
      const n = await burstBump(cx, from);
      if (n === 1) scheduleBurstAck(cx, from, orderNo);
      return;
    }
    await say(cx, from, `Fotoğraf/dosya bekliyorum (*${orderNo}*). Bitirdiyseniz *"menü"* yazın.`);
    return;
  }
  await sendMenu(cx, from);
}

// ── Yeni sipariş (form fotoğrafı VEYA adım adım) ──
// ── Yeni sipariş yardımcıları: diş/tarih parse, hizmet/fiyat, hekim çözümleme ──
function archCount(teeth: number[]): number {
  const up = teeth.some(t => t >= 11 && t <= 28);
  const lo = teeth.some(t => t >= 31 && t <= 48);
  return (up ? 1 : 0) + (lo ? 1 : 0);
}
// Fiyat birimi çarpanı (uygulamayla birebir): Çene→çene sayısı, Vaka/Seans→1, diğer→diş sayısı.
function priceUnitQty(unit: string | null | undefined, teeth: number[]): number {
  const u = String(unit ?? '').toLocaleLowerCase('tr');
  if (u === 'çene') return Math.max(1, archCount(teeth));
  if (u === 'vaka' || u === 'seans') return 1;
  return Math.max(1, teeth.length);
}
function parseTeeth(text: string): number[] {
  const t = String(text).replace(/[–—]/g, '-');
  const set = new Set<number>();
  for (const m of t.matchAll(/(\d{2})\s*-\s*(\d{2})/g)) {
    let a = +m[1], b = +m[2]; if (a > b) { const x = a; a = b; b = x; }
    if (b - a <= 16) for (let i = a; i <= b; i++) set.add(i);
  }
  for (const m of t.replace(/(\d{2})\s*-\s*(\d{2})/g, ' ').matchAll(/\d{2}/g)) set.add(+m[0]);
  return Array.from(set).filter(n => n >= 11 && n <= 48 && n % 10 >= 1 && n % 10 <= 8).sort((a, b) => a - b);
}
function parseDeliveryDate(text: string): string {
  const t = String(text).trim().toLocaleLowerCase('tr');
  const today = new Date();
  const plus = (d: number) => { const x = new Date(today); x.setDate(x.getDate() + d); return x.toISOString().split('T')[0]; };
  if (/acil|en yak|yarin|yarın/.test(t)) return plus(1);
  const m = t.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, +m[2] - 1, +m[1]));
    if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
  }
  return plus(7);
}
function parseBirthDate(text: string): string | null {
  const m = String(text).match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (!m) return null;
  let y = +m[3]; if (y < 100) y += (y > 30 ? 1900 : 2000);
  const dt = new Date(Date.UTC(y, +m[2] - 1, +m[1]));
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString().split('T')[0];
}

type WaService = { id: string; name: string; unit: string | null; price: number | null; currency: string | null; category: string };
async function fetchActiveServices(cx: Cx): Promise<WaService[]> {
  try {
    const r = await fetch(`${cx.url}/rest/v1/lab_services?lab_id=eq.${cx.labId}&is_active=eq.true&select=id,name,unit,price,currency,category,sort_order&order=sort_order.asc,name.asc`, { headers: cx.H });
    const rows = r.ok ? await r.json() : [];
    if (!Array.isArray(rows)) return [];
    return rows.map((s: any) => ({ id: s.id, name: String(s.name ?? ''), unit: s.unit ?? null, price: s.price, currency: s.currency ?? null, category: String(s.category ?? '').trim() || 'Diğer' }));
  } catch { return []; }
}
async function resolveItemPrice(cx: Cx, serviceId: string, clinicId: string | null): Promise<{ price: number; currency: string | null }> {
  try {
    const r = await fetch(`${cx.url}/rest/v1/rpc/resolve_item_price`, {
      method: 'POST', headers: { ...cx.H, 'content-type': 'application/json' },
      body: JSON.stringify({ p_lab_id: cx.labId, p_service_id: serviceId, p_clinic_id: clinicId }),
    });
    const rows = r.ok ? await r.json() : [];
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { price: Number(row?.price ?? 0), currency: row?.currency ?? null };
  } catch { return { price: 0, currency: null }; }
}
async function sendCategoryList(cx: Cx, from: string, cats: string[]): Promise<void> {
  await sendList(cx.phoneId, cx.accessToken, from, {
    header: 'İş türü', body: 'Önce bir *kategori* seçin:', button: 'Kategori seç',
    rows: cats.slice(0, 10).map(c => ({ id: `cat:${c}`.slice(0, 200), title: c.slice(0, 24) })),
  });
}
async function sendServiceList(cx: Cx, from: string, category: string, svcs?: WaService[]): Promise<void> {
  const all = svcs ?? await fetchActiveServices(cx);
  const inCat = all.filter(s => s.category === category).slice(0, 10);
  await sendList(cx.phoneId, cx.accessToken, from, {
    header: category.slice(0, 60), body: 'Bir *hizmet* seçin:', button: 'Hizmet seç',
    rows: inCat.map(s => ({ id: `svc:${s.id}`, title: s.name.slice(0, 24), description: `${s.price != null ? s.price : ''} ${s.currency ?? ''} · ${s.unit ?? ''}`.trim().slice(0, 72) })),
  });
}

// Gönderen telefonu → sistemdeki HEKİM (doctors.id). Yoksa null → manuel kutuya düşer.
async function resolveDoctorForPhone(cx: Cx, phone: string): Promise<{ doctorId: string; clinicId: string; clinicName: string | null; doctorName: string | null } | null> {
  const digits = String(phone).replace(/[^\d]/g, '');
  if (!digits) return null;
  try {
    let r = await fetch(`${cx.url}/rest/v1/profiles?whatsapp_phone=eq.%2B${digits}&select=id,user_type,clinic_id,full_name&limit=1`, { headers: cx.H });
    let rows = r.ok ? await r.json() : [];
    if (!(Array.isArray(rows) && rows[0])) {
      r = await fetch(`${cx.url}/rest/v1/profiles?whatsapp_phone=eq.${digits}&select=id,user_type,clinic_id,full_name&limit=1`, { headers: cx.H });
      rows = r.ok ? await r.json() : [];
    }
    const prof = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!prof || prof.user_type !== 'doctor' || !prof.clinic_id) return null;

    let doctorId: string | null = null;
    if (prof.full_name) {
      const dq = await fetch(`${cx.url}/rest/v1/doctors?clinic_id=eq.${prof.clinic_id}&full_name=ilike.${encodeURIComponent(prof.full_name)}&select=id&limit=1`, { headers: cx.H });
      const drows = dq.ok ? await dq.json() : [];
      if (Array.isArray(drows) && drows[0]) doctorId = drows[0].id;
    }
    if (!doctorId && prof.full_name) {
      const ins = await fetch(`${cx.url}/rest/v1/doctors`, {
        method: 'POST', headers: { ...cx.H, 'content-type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ clinic_id: prof.clinic_id, full_name: prof.full_name, is_active: true }),
      });
      const irows = ins.ok ? await ins.json() : [];
      doctorId = Array.isArray(irows) && irows[0] ? irows[0].id : null;
    }
    if (!doctorId) return null;

    let clinicName: string | null = null;
    const cq = await fetch(`${cx.url}/rest/v1/clinics?id=eq.${prof.clinic_id}&select=name&limit=1`, { headers: cx.H });
    const crows = cq.ok ? await cq.json() : [];
    if (Array.isArray(crows) && crows[0]) clinicName = crows[0].name ?? null;
    return { doctorId, clinicId: prof.clinic_id, clinicName, doctorName: prof.full_name ?? null };
  } catch (e) { console.error('[wa] resolveDoctorForPhone err:', e); return null; }
}

// Doğrudan NORMAL work_order + order_items (fiyatlı) oluştur → planlamaya düşer. order_number
// trigger'la; status default 'alindi' + triaged_at null = "planlama bekliyor". lab_id AÇIKÇA
// verilir (auto_set_lab_id yalnız NULL iken doldurur → korunur).
async function createNormalOrder(cx: Cx, draft: any, resolved: { doctorId: string; clinicId: string; clinicName: string | null } | null, media: any[]): Promise<string | null> {
  const teeth: number[] = Array.isArray(draft.teeth) ? draft.teeth : [];
  const svc = draft.service;
  try {
    const wr = await fetch(`${cx.url}/rest/v1/work_orders`, {
      method: 'POST', headers: { ...cx.H, 'content-type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        lab_id: cx.labId,
        doctor_id: resolved?.doctorId ?? null,   // tanınmazsa null → lab planlamada atar
        patient_name: draft.patient_name ?? null,
        patient_gender: draft.patient_gender ?? null,
        patient_dob: draft.patient_dob ?? null,
        tooth_numbers: teeth,
        work_type: svc?.name || 'Belirtilmedi',
        machine_type: 'milling',
        shade: draft.shade || null,
        measurement_type: media.length ? 'digital' : 'manual',
        delivery_date: draft.delivery_date,
        clinic_name: resolved?.clinicName ?? null,
        is_urgent: false,
      }),
    });
    if (!wr.ok) { console.error('[wa] work_order insert fail', wr.status, (await wr.text()).slice(0, 250)); return null; }
    const orow = (await wr.json())[0];
    const orderId = orow?.id; const orderNumber = orow?.order_number ?? '';
    if (!orderId) return null;

    if (svc?.id) {
      const qty = priceUnitQty(svc.unit, teeth);
      const pr = await resolveItemPrice(cx, svc.id, resolved?.clinicId ?? null);
      await fetch(`${cx.url}/rest/v1/order_items`, {
        method: 'POST', headers: cx.HJmin,
        body: JSON.stringify({ work_order_id: orderId, service_id: svc.id, name: svc.name, price: pr.price, currency: pr.currency, quantity: qty, tooth_numbers: teeth }),
      });
    }
    for (const m of media) {
      const dl = await downloadStorageBase64(cx.url, cx.key, 'paper-orders', m.path);
      if (dl) await attachMediaToOrder(cx, orderId, dl.b64, dl.mime, undefined, m.caption || '');
    }
    return orderNumber || '(numara)';
  } catch (e) { console.error('[wa] createNormalOrder err:', e); return null; }
}

// Tanınmayan gönderen / oluşturma hatası → manuel (pending) kutusu, lab onaylar.
async function createPendingOrder(cx: Cx, from: string, draft: any, media: any[]): Promise<void> {
  const composed = [
    draft.patient_name ? `Hasta: ${draft.patient_name}` : '',
    Array.isArray(draft.teeth) && draft.teeth.length ? `Dişler: ${draft.teeth.join(', ')}` : '',
    draft.service?.name ? `İş: ${draft.service.name}` : '',
    draft.shade ? `Renk: ${draft.shade}` : '',
    draft.delivery_date ? `Teslim: ${draft.delivery_date}` : '',
  ].filter(Boolean).join('\n');
  const inb = await fetch(`${cx.url}/functions/v1/inbound-paper-order`, {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${cx.key}` },
    body: JSON.stringify({ lab_id: cx.labId, source: 'whatsapp', sender_phone: from, sender_name: cx.senderName, text: composed }),
  });
  let pendingId: string | null = null;
  try { const j = await inb.json(); pendingId = j?.pending_order_id ?? null; } catch { /* */ }
  if (pendingId && media.length) {
    try {
      const gr = await fetch(`${cx.url}/rest/v1/pending_paper_orders?id=eq.${pendingId}&select=ocr_data,photo_storage_path&limit=1`, { headers: cx.H });
      const cur = gr.ok ? (await gr.json())[0] : null;
      const ocr = (cur?.ocr_data && typeof cur.ocr_data === 'object') ? cur.ocr_data : {};
      ocr.wa_media = media.map((m: any) => ({ storage_path: m.path, mime: m.mime, caption: m.caption }));
      const patch: any = { ocr_data: ocr };
      if (!cur?.photo_storage_path) {
        const firstImg = media.find((m: any) => String(m.mime).startsWith('image/'));
        if (firstImg) { patch.photo_storage_path = firstImg.path; patch.photo_url = `${cx.url}/storage/v1/object/authenticated/paper-orders/${firstImg.path}`; }
      }
      await fetch(`${cx.url}/rest/v1/pending_paper_orders?id=eq.${pendingId}`, { method: 'PATCH', headers: cx.HJmin, body: JSON.stringify(patch) });
    } catch (e) { console.error('[wa] attach wa_media err:', e); }
  }
  const cnt = media.length ? ` ${media.length} dosya eklendi.` : '';
  await say(cx, from, inb.ok
    ? `📋 Siparişiniz alındı!${cnt} Numaranız sistemde bir hekime bağlı olmadığından laboratuvar *onayladıktan sonra* oluşturulacak. Teşekkürler! 🙏`
    : '⚠️ Kaydederken sorun oldu, lütfen tekrar deneyin.');
  await resetSession(cx, from);
  await sendMenu(cx, from);
}

async function startNewOrder(cx: Cx, from: string): Promise<void> {
  await saveSession(cx, from, { flow: 'new_order', step: 'ask_mode', draft: {}, context: { media: [] } });
  await sendButtons(cx.phoneId, cx.accessToken, from,
    '🆕 *Yeni sipariş* — nasıl ilerleyelim?',
    [{ id: 'no_photo', title: '📸 Form fotoğrafı' }, { id: 'no_steps', title: '📝 Adım adım' }]);
}

async function finalizeNewOrder(cx: Cx, from: string, draft: any, media: any[]): Promise<void> {
  // Adım-adım sipariş HER ZAMAN normal sipariş olur → planlamaya düşer (kullanıcı kararı).
  // Hekim/klinik telefondan çözülürse atanır; çözülmezse null → lab planlamada düzeltir.
  const resolved = await resolveDoctorForPhone(cx, from);
  const orderNo = await createNormalOrder(cx, draft, resolved, media);
  if (orderNo) {
    const cnt = media.length ? ` ${media.length} dosya eklendi.` : '';
    const who = resolved ? '' : ' Hekim/klinik bilgisi laboratuvarca atanacak.';
    await say(cx, from,
      `✅ Siparişiniz oluşturuldu: *${orderNo}* — laboratuvarın *planlama* kuyruğuna alındı.${cnt}${who} Teşekkürler! 🙏`);
    await resetSession(cx, from);
    await sendMenu(cx, from);
    return;
  }
  // Yalnız TEKNİK hata (insert başarısız) → güvenlik için manuel kutuya düş.
  await createPendingOrder(cx, from, draft, media);
}

async function flowNewOrder(cx: Cx, from: string, sess: WaSession, msg: any, iid: string | null, text: string, media: ReturnType<typeof mediaOf>): Promise<void> {
  const step = sess.step;
  const fields = (sess.draft && typeof sess.draft === 'object') ? sess.draft : {};
  const ctx = (sess.context && typeof sess.context === 'object') ? sess.context : { media: [] };
  const lower = text.toLocaleLowerCase('tr');

  if (step === 'ask_mode') {
    if (iid === 'no_photo') {
      await saveSession(cx, from, { flow: 'new_order', step: 'photo_wait', draft: fields, context: ctx });
      await say(cx, from, '📸 İş emri *formunun fotoğrafını* gönderin. Sistem okuyup laboratuvara iletecek.');
      return;
    }
    if (iid === 'no_steps') {
      await saveSession(cx, from, { flow: 'new_order', step: 'patient', draft: fields, context: ctx });
      await say(cx, from, '📝 Başlayalım. *Hasta adı soyadı* nedir?');
      return;
    }
    await sendButtons(cx.phoneId, cx.accessToken, from, 'Lütfen bir yöntem seçin:', [{ id: 'no_photo', title: '📸 Form fotoğrafı' }, { id: 'no_steps', title: '📝 Adım adım' }]);
    return;
  }

  if (step === 'photo_wait') {
    if (!media) { await say(cx, from, 'İş emri formunun *fotoğrafını* bekliyorum. 📸'); return; }
    const dl = await fetchWaMedia(cx, media.id);
    if (!dl) { await say(cx, from, '⚠️ Görsel indirilemedi, tekrar gönderin.'); return; }
    const inb = await fetch(`${cx.url}/functions/v1/inbound-paper-order`, {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${cx.key}` },
      body: JSON.stringify({ lab_id: cx.labId, source: 'whatsapp', sender_phone: from, sender_name: cx.senderName, channel_msg_id: msg?.id ?? null, photo_base64: dl.b64, photo_mime: dl.mime, sender_note: media.caption ?? '' }),
    });
    await say(cx, from, inb.ok
      ? '📋 İş emri formu olarak alındı, laboratuvar onaylayacak. Teşekkürler! 🙏'
      : '⚠️ Okurken sorun oldu, tekrar gönderin.');
    await resetSession(cx, from);
    await sendMenu(cx, from);
    return;
  }

  if (step === 'patient') {
    if (!text) { await say(cx, from, 'Lütfen *hasta adını* yazın.'); return; }
    fields.patient_name = text.slice(0, 120);
    await saveSession(cx, from, { flow: 'new_order', step: 'gender', draft: fields, context: ctx });
    await sendButtons(cx.phoneId, cx.accessToken, from, 'Hastanın *cinsiyeti?*',
      [{ id: 'g_erkek', title: '♂ Erkek' }, { id: 'g_kadin', title: '♀ Kadın' }]);
    return;
  }

  if (step === 'gender') {
    if (iid === 'g_erkek') fields.patient_gender = 'erkek';
    else if (iid === 'g_kadin') fields.patient_gender = 'kadın';
    else {
      await sendButtons(cx.phoneId, cx.accessToken, from, 'Lütfen cinsiyeti seçin:',
        [{ id: 'g_erkek', title: '♂ Erkek' }, { id: 'g_kadin', title: '♀ Kadın' }]);
      return;
    }
    await saveSession(cx, from, { flow: 'new_order', step: 'dob', draft: fields, context: ctx });
    await say(cx, from, '🎂 Hastanın *doğum tarihi?* (örn 01.01.1990). Bilmiyorsanız *"yok"* yazın.');
    return;
  }

  if (step === 'dob') {
    if (text && !NONE_WORDS.includes(lower)) {
      const d = parseBirthDate(text);
      if (d) fields.patient_dob = d;
      else { await say(cx, from, 'Tarihi anlayamadım. *GG.AA.YYYY* yazın (örn 01.01.1990) veya *"yok"*.'); return; }
    }
    await saveSession(cx, from, { flow: 'new_order', step: 'teeth', draft: fields, context: ctx });
    await say(cx, from, '🦷 *Diş numaraları?* (FDI) — örn: "24-26" veya "11, 21".');
    return;
  }

  if (step === 'teeth') {
    const teeth = parseTeeth(text);
    if (!teeth.length) { await say(cx, from, 'Diş numarasını anlayamadım. Örn: *"24-26"* veya *"11, 21"* yazın.'); return; }
    fields.teeth = teeth;
    const svcs = await fetchActiveServices(cx);
    if (!svcs.length) {
      await saveSession(cx, from, { flow: 'new_order', step: 'work_free', draft: fields, context: ctx });
      await say(cx, from, `🦷 ${teeth.length} diş seçildi. *İş türünü yazın* (örn: Zirkonyum kron).`);
      return;
    }
    const cats = Array.from(new Set(svcs.map(s => s.category)));
    if (cats.length === 1) {
      await saveSession(cx, from, { flow: 'new_order', step: 'work_svc', draft: fields, context: { ...ctx, category: cats[0] } });
      await sendServiceList(cx, from, cats[0], svcs);
    } else {
      await saveSession(cx, from, { flow: 'new_order', step: 'work_cat', draft: fields, context: ctx });
      await sendCategoryList(cx, from, cats);
    }
    return;
  }

  if (step === 'work_cat') {
    if (iid && iid.startsWith('cat:')) {
      const category = iid.slice(4);
      await saveSession(cx, from, { flow: 'new_order', step: 'work_svc', draft: fields, context: { ...ctx, category } });
      await sendServiceList(cx, from, category);
      return;
    }
    const svcs = await fetchActiveServices(cx);
    await sendCategoryList(cx, from, Array.from(new Set(svcs.map(s => s.category))));
    return;
  }

  if (step === 'work_svc') {
    if (iid && iid.startsWith('svc:')) {
      const sid = iid.slice(4);
      const svcs = await fetchActiveServices(cx);
      const svc = svcs.find(s => s.id === sid);
      if (!svc) { await say(cx, from, 'Hizmeti bulamadım, tekrar seçin.'); return; }
      fields.service = { id: svc.id, name: svc.name, unit: svc.unit };
      await saveSession(cx, from, { flow: 'new_order', step: 'shade', draft: fields, context: ctx });
      await say(cx, from, '🎨 *Renk?* (örn A2). Gerekmiyorsa *"yok"* yazın.');
      return;
    }
    await sendServiceList(cx, from, String(ctx.category ?? ''));
    return;
  }

  if (step === 'work_free') {
    if (!text) { await say(cx, from, 'Lütfen *iş türünü* yazın.'); return; }
    fields.service = { id: null, name: text.slice(0, 120), unit: null };
    await saveSession(cx, from, { flow: 'new_order', step: 'shade', draft: fields, context: ctx });
    await say(cx, from, '🎨 *Renk?* (örn A2). Gerekmiyorsa *"yok"* yazın.');
    return;
  }

  if (step === 'shade') {
    if (text && !NONE_WORDS.includes(lower)) fields.shade = text.slice(0, 40);
    await saveSession(cx, from, { flow: 'new_order', step: 'delivery', draft: fields, context: ctx });
    await say(cx, from, '📅 *Teslim tarihi?* (örn 05.08.2026). Acil için *"acil"* yazın.');
    return;
  }

  if (step === 'delivery') {
    fields.delivery_date = parseDeliveryDate(text);
    await saveSession(cx, from, { flow: 'new_order', step: 'media', draft: fields, context: ctx });
    await say(cx, from, `📎 Varsa *ağız içi foto / ölçü / STL / ZIP* gönderin. Bittiğinde *"tamam"* yazın (dosya yoksa yine "tamam").\n📅 Teslim: ${fields.delivery_date}`);
    return;
  }

  if (step === 'media') {
    if (media) {
      const dl = await fetchWaMedia(cx, media.id);
      if (dl) {
        const path = await uploadTempMedia(cx.url, cx.key, cx.labId, dl.b64, dl.mime, media.filename);
        if (path) {
          const arr = Array.isArray(ctx.media) ? ctx.media : [];
          arr.push({ path, mime: dl.mime, ext: extFromMime(dl.mime, media.filename), caption: media.caption ?? '' });
          await saveSession(cx, from, { flow: 'new_order', step: 'media', draft: fields, context: { ...ctx, media: arr } });
          await say(cx, from, `📎 Eklendi (${arr.length}). Başka dosya gönderin ya da *"tamam"* yazın.`);
          return;
        }
      }
      await say(cx, from, '⚠️ Dosya alınamadı, tekrar deneyin ya da *"tamam"* yazın.');
      return;
    }
    if (DONE_WORDS.includes(lower)) {
      await finalizeNewOrder(cx, from, fields, Array.isArray(ctx.media) ? ctx.media : []);
      return;
    }
    await say(cx, from, 'Dosya bekliyorum. Bitirmek için *"tamam"* yazın.');
    return;
  }

  await sendMenu(cx, from);
}

// ── Tek mesaj yönlendirici (oturum-farkında) ──
/**
 * Bot uykudayken gelen mesaj → insana devret.
 *
 * ÜÇ İŞ YAPAR ve üçü de gerekli:
 *   1. Oturumu 'human' yapar → mesaj Siman'daki Destek Sohbetleri'ne düşer.
 *   2. Laba bildirim atar (oturumda BİR KEZ) → kimse bakmıyorsa haber olsun.
 *   3. Müşteriye tek seferlik "aldık" mesajı yollar.
 *
 * (3) olmadan bu tasarım müşteriyi sessizlikte bırakırdı: bot kapalı, kimse de
 * ekrana bakmıyorsa mesaj boşluğa düşmüş gibi görünür. Eskiden en azından bot
 * bir şey diyordu. Tek sefer — her mesaja tekrarlarsa botun kendisi olur.
 * Ayrıca uyandırma kelimesini de öğretir; müşteri bilmiyorsa hiç kullanamaz.
 */
async function sleepingReply(
  cx: Cx, from: string, session: WaSession | null,
  media?: { id: string; mime: string; caption: string; filename?: string } | null,
): Promise<void> {
  const ctx = (session?.context && typeof session.context === 'object') ? session.context : {};
  const acked = ctx.human_acked === true;

  // Gelen dosyayı KAYBETME. Bot uykudayken de müşteri ölçü/foto gönderiyor;
  // stash edilmezse Meta'daki medya kimliği kısa sürede geçersizleşir ve dosya
  // bir daha erişilemez. Akış başlayınca bu havuzdan tüketilir.
  if (media) {
    try {
      const dl = await fetchWaMedia(cx, media.id);
      if (dl) {
        const path = await uploadTempMedia(cx.url, cx.key, cx.labId, dl.b64, dl.mime, media.filename);
        if (path) {
          await fetch(`${cx.url}/rest/v1/whatsapp_pending_media`, {
            method: 'POST', headers: cx.HJmin,
            body: JSON.stringify({
              lab_id: cx.labId, sender_phone: from, sender_name: cx.senderName,
              storage_path: path, mime: dl.mime, caption: media.caption ?? '', state: 'cold_stash',
            }),
          });
        }
      }
    } catch (e) { console.error('[wa] uyku modunda medya stash hatası:', e); }
  }

  await saveSession(cx, from, {
    mode: 'human',
    flow: null, step: null,
    human_since: session?.human_since ?? new Date().toISOString(),
    context: { ...ctx, human_acked: true },
  });

  if (!acked) {
    await say(cx, from, humanAck(cx));
    await notifyLabSupport(cx, from, {
      title: 'WhatsApp: yeni mesaj',
      body: `+${String(from).replace(/[^\d]/g, '')} yazdı. Bot kapalı — Destek Sohbetleri'nden yanıtlayın.`,
    });
  }
}

async function handleMessage(msg: any, cx: Cx): Promise<void> {
  const from = msg?.from ?? null;
  if (!from) return;
  const iid = interactiveId(msg);
  const text = msgText(msg);
  const media = mediaOf(msg);
  const lower = text.toLocaleLowerCase('tr');

  // Gelen her müşteri mesajı sohbet geçmişine — bot sussa da yazılmalı, çünkü
  // Cloud API hattında labın bunları okuyabileceği başka bir yer yok.
  await logMessage(cx, {
    peer: from, direction: 'in',
    body: text || (media ? `[${media.mime ?? 'dosya'}]` : (iid ? `[menü: ${iid}]` : null)),
    wamid: msg?.id ?? null, source: 'customer',
  });

  let session = await getSession(cx, from);

  // 1) BOT UYANIK MI? ────────────────────────────────────────────────────────
  //
  // Varsayılan: KAPALI. Bot yalnız müşteri açıkça istediğinde konuşur —
  // bir uyandırma kelimesi yazınca ya da eski bir menüye dokununca.
  // Diğer her mesaj insana gider: Siman › Destek Sohbetleri'ne düşer.
  //
  // `mode='bot'` = uyanık, `mode='human'` (ya da oturum yok) = varsayılan sessiz.
  // Uyanık oturum 12 saat sessizlikte kendiliğinden uykuya döner; yoksa bir kez
  // "sipariş" yazan müşteriye bot sonsuza dek yapışırdı.
  const wake = !!iid || hasWakeWord(text, cx.labName);

  if (session?.mode === 'bot') {
    const idle = Date.now() - new Date(session.last_msg_at ?? 0).getTime();
    if (idle >= HUMAN_IDLE_MS) {
      await saveSession(cx, from, { mode: 'human', flow: null, step: null, draft: {}, context: {} });
      session = null;
      if (!wake) { await sleepingReply(cx, from, null, media); return; }
    }
  } else if (!wake) {
    // Bot uykuda ve uyandırma yok → insana devret, müşteriyi sessizlikte bırakma.
    await sleepingReply(cx, from, session, media);
    return;
  } else if (session) {
    // Uyandırma geldi → oturumu bot moduna al, akış baştan başlasın.
    await resetSession(cx, from);
    session = null;
  }

  // 2) Global komut — menü/iptal (yalnız metin) → sıfırla + menü.
  if (!media && !iid && RESET_WORDS.includes(lower)) {
    await resetSession(cx, from);
    await sendMenu(cx, from);
    return;
  }

  // 2b) "yetkili" → doğrudan insana. İki yerde (AI_NOTE ve karşılama mesajı)
  //     vaat ediliyordu ama HİÇBİR YERDE İŞLENMİYORDU: kelime serbest metin
  //     olarak modele düşüyor, model devretmeyi seçerse devrediyordu — yani
  //     vaat edilen şey şansa kalmıştı. Artık deterministik.
  if (!media && !iid && SUPPORT_WORDS.includes(normalizeTr(text))) {
    await startSupport(cx, from);
    return;
  }

  // 3) Menü seçimi her zaman gezinir (akış içindeyken bile).
  if (iid && iid.startsWith('menu_')) { await enterFlow(cx, from, iid); return; }

  // 4) Aktif akış → ilgili işleyici.
  if (session?.flow === 'new_order') { await flowNewOrder(cx, from, session, msg, iid, text, media); return; }
  if (session?.flow === 'status')    { await flowStatus(cx, from, session, iid, text); return; }
  if (session?.flow === 'add_media') { await flowAddMedia(cx, from, session, iid, text, media); return; }

  // 5) Soğuk başlangıç — önce MENÜ. Medya geldiyse 30 dk tampona al (akış seçilince kullanılır).
  if (media) {
    const dl = await fetchWaMedia(cx, media.id);
    if (dl) {
      const path = await uploadTempMedia(cx.url, cx.key, cx.labId, dl.b64, dl.mime, media.filename);
      if (path) {
        await fetch(`${cx.url}/rest/v1/whatsapp_pending_media`, {
          method: 'POST', headers: cx.HJmin,
          body: JSON.stringify({ lab_id: cx.labId, sender_phone: from, sender_name: cx.senderName, storage_path: path, mime: dl.mime, caption: media.caption ?? '', state: 'cold_stash' }),
        });
      }
    }
    await sendMenu(cx, from, '📎 Dosyanızı aldım, siparişe ekledim.');
    return;
  }

  // 5b) "dosya/foto eklemek istiyorum" → LLM'e sorma, akışı doğrudan aç.
  if (text.trim() && wantsAddMedia(text)) { await startAddMedia(cx, from); return; }

  // 6) Serbest metin → LLM. Menü/akış hiçbirine uymadıysa buraya düşer.
  //    Eskiden burada koşulsuz sendMenu vardı; kullanıcı ne yazarsa yazsın
  //    aynı menüyü görüyordu. Artık önce bağlamlı bir yanıt denenir,
  //    başarısız olursa (kota/hata/zaman aşımı) eski davranışa dönülür.
  if (text.trim()) {
    const who = await resolveDoctorForPhone(cx, from);
    const ans = await askBrain(cx, from, text, who);
    if (ans) {
      const seen = session?.context?.ai_notified === true;
      if (ans.handoff) {
        // Model devretmek istedi → yanıt düz metin gider, menü gösterilmez
        // (birazdan insan devralacak; menü kafa karıştırır).
        // startSupport oturumu 'human' yapar, laba bildirim düşer ve bot susar.
        await say(cx, from, ans.reply);
        await startSupport(cx, from);
      } else {
        // Yanıt + menü TEK balonda — eskiden iki ayrı mesaj gidiyordu.
        await sendMenu(cx, from, ans.reply, { greet: !seen });
      }
      if (!seen) {
        await saveSession(cx, from, { context: { ...(session?.context ?? {}), ai_notified: true } });
      }
      return;
    }
  }

  // LLM yoksa/başarısızsa düz menü. Tanıtım burada da bir kez yapılır ve
  // işaretlenir — yoksa her mesajda "Ben Simanty…" tekrar ederdi.
  const greet = session?.context?.ai_notified !== true;
  await sendMenu(cx, from, undefined, { greet });
  if (greet) await saveSession(cx, from, { context: { ...(session?.context ?? {}), ai_notified: true } });
}

// Gelen Meta mesajlarını arka planda işler (Meta'ya 200 zaten dönüldü).
async function processIncoming(payload: any): Promise<void> {
  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const active = await fetchWaCredentials(supabaseUrl, serviceRoleKey, true);

  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value    = change?.value ?? {};
      const phoneId  = value?.metadata?.phone_number_id;
      const bizNumber = String(value?.metadata?.display_phone_number ?? '').replace(/[^\d]/g, '');
      const allMsgs  = Array.isArray(value?.messages) ? value.messages : [];
      const echoes   = Array.isArray(value?.message_echoes) ? value.message_echoes : [];
      // Giden-echo (labın MANUEL yanıtı): message_echoes alanı VEYA messages[] içinde from==iş numarası.
      const isEcho = (m: any) => !!bizNumber && String(m?.from ?? '').replace(/[^\d]/g, '') === bizNumber;
      const messages = allMsgs.filter((m: any) => !isEcho(m));       // yalnız MÜŞTERİ girişleri
      // human-işaretleme YALNIZ message_echoes ile (Coexistence manuel yanıt; API bot mesajı
      // echo OLMAZ → bot kendini susturmaz). messages[]-from-biz sadece müşteri döngüsünden çıkarılır.
      const echoMsgs = echoes;
      // Teslim durumu callback'leri (sent/delivered/read/failed) — takip/teşhis için loglanır.
      const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
      console.log('[wa] change value:', JSON.stringify({ phoneId, msgCount: messages.length, echoCount: echoMsgs.length, statusCount: statuses.length, types: messages.map((m: any) => m?.type) }));

      if (statuses.length > 0) {
        const H0 = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'content-type': 'application/json', Prefer: 'return=minimal' };
        for (const st of statuses) {
          try {
            await fetch(`${supabaseUrl}/rest/v1/whatsapp_delivery_log`, {
              method: 'POST', headers: H0,
              body: JSON.stringify({
                wamid: st?.id ?? null,
                recipient: st?.recipient_id ?? null,
                status: st?.status ?? null,
                error_code: (st?.errors?.[0]?.code != null) ? String(st.errors[0].code) : null,
                error_title: st?.errors?.[0]?.title ?? null,
                error_message: st?.errors?.[0]?.error_data?.details ?? st?.errors?.[0]?.message ?? null,
                raw: st,
              }),
            });
          } catch (e) { console.error('[wa] status log err:', e); }
        }
      }

      if (!phoneId || (messages.length === 0 && echoMsgs.length === 0)) continue;

      const cred = active.find(c => c.credentials?.phone_number_id === phoneId);
      if (!cred?.credentials?.access_token) {
        console.error('[wa] no active credential for phone_number_id=', phoneId, ' known=', active.map(c => c.credentials?.phone_number_id));
        continue;
      }
      const accessToken = cred.credentials.access_token;
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
      const senderName = contacts[0]?.profile?.name ?? null;

      const H = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
      const HJmin = { ...H, 'content-type': 'application/json', Prefer: 'return=minimal' };
      // Lab adı — mesaj başlıklarında ve Simanty'nin tanıtımında kullanılır.
      // Sabit "Siman Laboratuvar" yazılıydı; çok kiracılı üründe her lab kendi
      // adını görmeli. Webhook paketi başına tek sorgu.
      const labName = await fetchLabName(supabaseUrl, serviceRoleKey, cred.lab_id);
      const cx: Cx = { url: supabaseUrl, key: serviceRoleKey, phoneId, accessToken, labId: cred.lab_id, senderName, labName, H, HJmin };

      // ── İŞ NUMARASINDAN ÇIKAN MESAJLAR ────────────────────────────────────
      //
      // Coexistence açıkken Meta, iş numarasından çıkan HER mesajı echo'lar —
      // botun kendi cevapları dâhil. Ayrım wamid ile yapılır: gönderirken
      // kaydettiğimiz wamid listede varsa mesaj bize aittir, yoksa bir insan
      // elle yazmıştır. (Eskiden "echo geldiyse insandır" varsayılıyordu; o
      // hâliyle Coexistence açılır açılmaz bot kendi mesajıyla kendini
      // susturacaktı.)
      //
      // `messages[]` içinden gelen biz-kaynaklı satırlar da aynı yoldan geçer:
      // bazı kurulumlarda echo ayrı alanda değil, messages içinde geliyor.
      // Son mesaj kazanır — aynı pakette önce yanıt sonra "/bot" gelirse
      // sonuç 'bot' olmalı.
      const outbound = [...echoMsgs, ...allMsgs.filter(isEcho)];
      const echoLast = new Map<string, { body: string; wamid: string | null }>();
      for (const e of outbound) {
        const to = String(e?.to ?? e?.recipient_id ?? '').replace(/[^\d]/g, '');
        if (to && to !== bizNumber) echoLast.set(to, { body: msgText(e), wamid: e?.id ?? null });
      }
      for (const [to, e] of echoLast) {
        try {
          // Bizim gönderdiğimiz mesajın echo'su → hiçbir şey yapma.
          if (e.wamid && await isOurOutbound(cx, e.wamid)) continue;

          await logMessage(cx, { peer: to, direction: 'out', body: e.body || null, wamid: e.wamid, source: 'echo' });

          if (BOT_RELEASE_WORDS.includes(e.body.trim().toLocaleLowerCase('tr'))) {
            await resetSession(cx, to);
            console.log('[wa] bota devredildi:', to);
          } else {
            await markHumanFromLab(cx, to);
            console.log('[wa] insan devri (elle yazıldı):', to);
          }
        } catch (err) { console.error('[wa] echo işleme hatası:', err); }
      }

      // ── Müşteri girişleri → oturum-farkında dağıtım (menü + FSM handleMessage'da) ──
      for (const msg of messages) {
        try { await handleMessage(msg, cx); }
        catch (e) { console.error('[wa] handleMessage err:', e); }
      }
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const globalVerify   = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';

  // ── GET: Meta webhook doğrulaması ──────────────────────────────────────────
  if (req.method === 'GET') {
    const u = new URL(req.url);
    const mode      = u.searchParams.get('hub.mode');
    const token     = u.searchParams.get('hub.verify_token') ?? '';
    const challenge = u.searchParams.get('hub.challenge') ?? '';
    if (mode !== 'subscribe' || !token) {
      return new Response('Bad Request', { status: 400 });
    }
    // Global env VEYA herhangi bir lab'ın kayıtlı verify_token'ı ile eşleş
    // (sabit-zamanlı). Yalnız hub.challenge düz metin döner — secret sızmaz.
    let ok = !!globalVerify && timingSafeEqualStr(token, globalVerify);
    if (!ok) {
      const creds = await fetchWaCredentials(supabaseUrl, serviceRoleKey, false);
      ok = creds.some(c => {
        const vt = c.credentials?.verify_token ?? '';
        return vt !== '' && timingSafeEqualStr(token, vt);
      });
    }
    if (!ok) return new Response('Forbidden', { status: 403 });
    return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // ── POST: gelen mesaj(lar) ─────────────────────────────────────────────────
  // Meta non-200'de tekrar dener → her durumda 200 dön, işi dedupe'a bırak.
  try {
    // HAM gövdeyi ÖNCE oku — Meta imzası tam bu bytes üzerinden doğrulanır.
    const rawBody = await req.text();
    let payload: any;
    try { payload = rawBody ? JSON.parse(rawBody) : {}; }
    catch { return new Response('bad body', { status: 400 }); }

    // ── Action allow-list — `action` ATTACKER-CONTROLLED kabul edilir (B-01) ──
    // Bilinen yönetim action'ları (Siman UI) Meta-imzalı DEĞİLDİR; kendi
    // access_token'larını taşır ve aşağıdaki KENDİ dallarında ele alınır
    // (processIncoming'e ULAŞMAZ). Meta mesaj payload'ında action YOKTUR → İMZA
    // ZORUNLU. Bilinmeyen/geçersiz-tip action imzayı ATLAYAMAZ, İŞLENMEZ.
    const KNOWN_ACTIONS = new Set(['test', 'send_test', 'subscribe', 'sub_status']);
    const rawAction = (payload as any)?.action;
    const hasActionField = rawAction !== undefined && rawAction !== null && rawAction !== '';
    const isKnownAction = typeof rawAction === 'string' && KNOWN_ACTIONS.has(rawAction);

    // Bilinmeyen action VEYA string olmayan action tipi → 4xx, ASLA bypass/işleme.
    if (hasActionField && !isKnownAction) {
      console.error('[whatsapp-webhook] unsupported action — rejected');
      return new Response('unsupported action', { status: 400, headers: corsHeaders });
    }

    // Meta mesaj payload'ı (bilinen bir action DEĞİL) → İMZA ZORUNLU (fail-closed).
    if (!isKnownAction) {
      const appSecret = Deno.env.get('WHATSAPP_APP_SECRET')
        ?? Deno.env.get('META_APP_SECRET')
        ?? '';
      const sigHeader = req.headers.get('x-hub-signature-256')
        ?? req.headers.get('X-Hub-Signature-256');
      const sigOk = await verifyMetaSignature(rawBody, sigHeader, appSecret);
      if (!sigOk) {
        // İmza yok/yanlış/gövde kurcalanmış VEYA secret tanımsız → FAIL CLOSED.
        // Doğrulanmamış payload için sipariş açma / mesaj gönderme YAPILMAZ.
        console.error('[whatsapp-webhook] invalid X-Hub-Signature-256 — rejected');
        return new Response('signature invalid', { status: 401 });
      }
    }

    // ── action:'test' → Siman Entegrasyonlar "Test" butonu (Meta payload'ı değil) ──
    // Graph API'den numarayı sorgulayarak token + phone_number_id geçerliliğini doğrular.
    if (payload?.action === 'test') {
      const pnid  = String(payload?.phone_number_id ?? '').trim();
      const token = String(payload?.access_token ?? '').trim();
      if (!pnid || !token) {
        return new Response(JSON.stringify({ ok: false, message: 'Phone Number ID ve Access Token zorunlu' }),
          { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
      }
      try {
        const r = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/${pnid}?fields=verified_name,display_phone_number,quality_rating`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const j = await r.json();
        if (r.ok && j?.id) {
          const name = j?.verified_name ?? j?.display_phone_number ?? pnid;
          return new Response(JSON.stringify({ ok: true, message: `Bağlantı başarılı — ${name}` }),
            { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
        }
        const em = j?.error?.message ?? `Graph API HTTP ${r.status}`;
        return new Response(JSON.stringify({ ok: false, message: em }),
          { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, message: 'Graph API hatası: ' + String(e) }),
          { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
      }
    }

    // ── action:'send_test' → Siman "Test mesajı gönder" (outbound doğrulama) ──
    // Güvenlik: access_token çağrıda verilir (kayıtlı secret okunmaz); token'ı
    // bilen zaten Graph API'yi doğrudan çağırabilir → ek risk yok.
    if (payload?.action === 'send_test') {
      const pnid  = String(payload?.phone_number_id ?? '').trim();
      const token = String(payload?.access_token ?? '').trim();
      const to    = String(payload?.to ?? '').replace(/[^\d]/g, '');   // yalnız rakam: 905342649620
      const text  = String(payload?.text ?? '').trim();
      const useTemplate = payload?.template === true || !text;
      if (!pnid || !token || !to) {
        return new Response(JSON.stringify({ ok: false, message: 'Numara / kimlik eksik' }),
          { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
      }
      // Şablon adı/dili parametrik — kendi onaylı şablonun (yoksa hello_world demo)
      const tplName = String(payload?.template_name ?? '').trim() || 'hello_world';
      const tplLang = String(payload?.template_lang ?? '').trim()
        || (tplName === 'hello_world' ? 'en_US' : 'tr');
      const bodyObj = useTemplate
        ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: tplName, language: { code: tplLang } } }
        : { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };
      try {
        const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pnid}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(bodyObj),
        });
        const j = await r.json();
        if (r.ok && Array.isArray(j?.messages)) {
          return new Response(JSON.stringify({ ok: true, message: useTemplate ? 'Şablon (hello_world) gönderildi ✅' : 'Mesaj gönderildi ✅' }),
            { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({ ok: false, message: j?.error?.message ?? `Graph API HTTP ${r.status}`, code: j?.error?.code ?? null }),
          { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, message: 'Graph API hatası: ' + String(e) }),
          { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
      }
    }

    // ── action:'subscribe' → WABA'yı webhook'a otomatik bağla + messages abone ──
    // Graph API subscribed_apps + override_callback_uri: callback URL'i ve verify
    // token'ı doğrudan WABA'ya yazar, uygulamayı WABA'ya abone eder. Meta UI gerekmez.
    if (payload?.action === 'subscribe') {
      const waba  = String(payload?.business_account_id ?? '').trim();
      const token = String(payload?.access_token ?? '').trim();
      const vtok  = String(payload?.verify_token ?? '').trim();
      if (!waba || !token) {
        return new Response(JSON.stringify({ ok: false, message: 'Business Account ID ve Access Token zorunlu' }),
          { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
      }
      const cbUrl = 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/whatsapp-webhook';
      try {
        const body = new URLSearchParams({ override_callback_uri: cbUrl });
        if (vtok) body.set('verify_token', vtok);
        const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${waba}/subscribed_apps`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        const j = await r.json();
        if (r.ok && j?.success === true) {
          return new Response(JSON.stringify({ ok: true, message: 'Webhook bağlandı ve messages aboneliği açıldı ✅' }),
            { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({ ok: false, message: j?.error?.message ?? `HTTP ${r.status}`, code: j?.error?.code ?? null }),
          { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, message: 'Abonelik hatası: ' + String(e) }),
          { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
      }
    }

    // ── action:'sub_status' → mevcut abonelikleri göster (teşhis) ──
    if (payload?.action === 'sub_status') {
      const waba  = String(payload?.business_account_id ?? '').trim();
      const token = String(payload?.access_token ?? '').trim();
      if (!waba || !token) {
        return new Response(JSON.stringify({ ok: false, message: 'Business Account ID / token eksik' }),
          { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
      }
      try {
        const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${waba}/subscribed_apps`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await r.json();
        return new Response(JSON.stringify({ ok: r.ok, data: j }),
          { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, message: String(e) }),
          { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
      }
    }

    // Meta mesaj payload'ı → Meta'ya HEMEN 200 dön, işlemeyi ARKA PLANDA yap.
    // Böylece Meta zaman aşımına uğrayıp mesajı 3 kez yeniden GÖNDERMEZ
    // (retry = tekrar yanıt + inbox'a mükerrer kayıt sebebiydi).
    const bg = processIncoming(payload).catch((e) => console.error('[wa] bg error:', e));
    // @ts-ignore — EdgeRuntime global (Supabase Edge); yoksa promise yine de çalışır
    if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any)?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(bg);
    }
    return new Response(JSON.stringify({ ok: true, queued: true }), {
      status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (e) {
    // Meta'nın sonsuz retry'ını önlemek için 200 dön; hatayı logla.
    console.error('[whatsapp-webhook] error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});
