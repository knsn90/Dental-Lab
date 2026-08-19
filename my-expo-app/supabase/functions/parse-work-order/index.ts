// parse-work-order — Klinikten gelen kağıt iş emri formunu OCR ile parse eder.
//
// Input  : { file_base64: string, mime_type: string }
// Output : {
//   ok: boolean,
//   data?: {
//     clinic_id: string | null,        // QR kodundan
//     patient_name: string | null,
//     order_date:   string | null,     // YYYY-MM-DD
//     delivery_date: string | null,    // YYYY-MM-DD
//     urgency: 'normal'|'acil'|'cok_acil'|null,
//     tooth_numbers: number[],         // FDI [11,12,...]
//     work_type:   string | null,      // 'Zirkonyum', 'E-max', ...
//     shade:       string | null,      // 'A2'
//     impression_type: string | null,
//     notes: string | null,
//   },
//   error?: string,
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Yetki: iç çağrı (paylaşılan gizli / service-role) veya oturumlu kullanıcı ──
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const NOTIFY_FN_SECRET = Deno.env.get('NOTIFY_FN_SECRET') ?? '';
async function assertCallerAuthorized(req: Request): Promise<boolean> {
  const secret = req.headers.get('x-notify-secret');
  if (NOTIFY_FN_SECRET && secret === NOTIFY_FN_SECRET) return true;
  const auth = req.headers.get('Authorization') ?? '';
  if (auth === `Bearer ${SERVICE_ROLE_KEY}`) return true;
  try {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const userClient = createClient(SUPABASE_URL, anonKey, { global: { headers: { Authorization: auth } } });
    const { data, error } = await userClient.auth.getUser();
    return !error && !!data?.user;
  } catch { return false; }
}


type Confidence = 'high' | 'medium' | 'low' | 'missing';

interface ParsedWorkOrder {
  clinic_id: string | null;
  doctor_name: string | null;       // Yeni — formda doktor adı varsa
  patient_name: string | null;
  order_date: string | null;
  delivery_date: string | null;
  urgency: 'normal' | 'acil' | 'cok_acil' | null;
  tooth_numbers: number[];
  work_type: string | null;
  shade: string | null;
  impression_type: string | null;
  notes: string | null;
  // ── Yeni form alanları (2026-08 redesign) ──
  // Eski formlarda yoklar; okunamazsa null döner ve akış aynen çalışır.
  patient_gender: 'kadın' | 'erkek' | null;
  patient_dob: string | null;          // YYYY-MM-DD
  delivery_method: 'kurye' | 'elden' | 'kargo' | null;
  scan_bodies_delivered: boolean | null;
  form_no: string | null;              // mükerrer fotoğrafı ayırt etmek için
  /** "İşlem Satırları" tablosu — bir siparişte farklı dişe farklı işlem. */
  items: Array<{ work_type: string | null; tooth_numbers: number[]; shade: string | null }>;
  /** Her alan için güven seviyesi — UI sarı/kırmızı uyarı için */
  confidence: Record<
    'clinic_id' | 'doctor_name' | 'patient_name' | 'order_date' | 'delivery_date' |
    'urgency' | 'tooth_numbers' | 'work_type' | 'shade' |
    'impression_type' | 'notes' | 'patient_gender' | 'patient_dob' |
    'delivery_method' | 'items',
    Confidence
  >;
  /** Genel okunabilirlik notu (varsa kullanıcıya gösterilir) */
  overall_note?: string | null;
  /** PASS 1 OCR — formdaki tüm okunabilir metin (debug + verification için) */
  raw_transcription?: string | null;
  /** Düşük güvenli alanlar için 2-3 aday okuma — UI'da chip olarak gösterilir */
  alternatives?: Partial<Record<
    'patient_name' | 'doctor_name' | 'shade' | 'work_type' | 'notes' |
    'order_date' | 'delivery_date',
    string[]
  >>;
}

/**
 * Claude API'sini tek bir istekle çağırır.
 */
async function callClaude(
  fileBase64: string,
  mimeType: string,
  apiKey: string,
  prompt: string,
  maxTokens = 2048,
): Promise<string> {
  const isImage = mimeType.startsWith('image/');
  const content: any[] = [
    { type: isImage ? 'image' : 'document', source: { type: 'base64', media_type: mimeType, data: fileBase64 } },
    { type: 'text', text: prompt },
  ];

  let resp: Response | null = null;
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        // El yazısı + işaretli kutu okumasında en yüksek doğruluk için Opus 5.
        model: 'claude-opus-5',
        max_tokens: maxTokens,
        // NOT: Opus 5'te `temperature` DEPRECATED (400 verir) → gönderilmez.
        // Determinizm için tool_use şeması + net promptla en-olası okuma zorlanır.
        messages: [{ role: 'user', content }],
      }),
    });
    if (resp.ok) break;
    lastErr = `${resp.status}: ${(await resp.text()).slice(0, 300)}`;
    if (resp.status < 500 && resp.status !== 429) break;
    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
  }
  if (!resp || !resp.ok) throw new Error(`Claude API error ${lastErr}`);
  const json = await resp.json();
  return json?.content?.[0]?.text ?? '';
}

// ── Yapısal çıktı şeması (tool_use) ──────────────────────────────────────────
// Pass 2/3'te serbest-metin JSON + regex yerine Claude'u bu şemayı doldurmaya
// ZORLARIZ (tool_choice). Böylece geçersiz-JSON riski biter ve alan tipleri
// (tooth_numbers integer[], urgency/confidence enum) şemayla garanti edilir.
const CONF_ENUM = { type: 'string', enum: ['high', 'medium', 'low', 'missing'] };
const WORK_ORDER_TOOL = {
  name: 'emit_work_order',
  description: 'Diş laboratuvarı iş emri formundan çıkarılan yapısal veri.',
  input_schema: {
    type: 'object',
    properties: {
      clinic_id:       { type: ['string', 'null'], description: 'QR kodundaki uuid (WORKORDER:<uuid>) veya null' },
      doctor_name:     { type: ['string', 'null'] },
      patient_name:    { type: ['string', 'null'] },
      order_date:      { type: ['string', 'null'], description: 'YYYY-MM-DD' },
      delivery_date:   { type: ['string', 'null'], description: 'YYYY-MM-DD' },
      urgency:         { type: ['string', 'null'], enum: ['normal', 'acil', 'cok_acil', null] },
      tooth_numbers:   { type: 'array', items: { type: 'integer' }, description: 'FDI diş numaraları; işaretli yoksa []' },
      work_type:       { type: ['string', 'null'] },
      shade:           { type: ['string', 'null'], description: 'Vita kodu (A1/A2/…) veya el yazısı renk' },
      // "Manuel" yeni formun etiketi ("Manuel (Ölçü)"); Klasik/Putty eski
      // formlar ve serbest metin için korunuyor.
      impression_type: { type: ['string', 'null'], enum: ['Manuel', 'Klasik', 'Dijital', 'Putty', null] },
      notes:           { type: ['string', 'null'] },
      patient_gender:  { type: ['string', 'null'], enum: ['kadın', 'erkek', null] },
      patient_dob:     { type: ['string', 'null'], description: 'YYYY-MM-DD (form YYYY/AA/GG sırasıyla basar)' },
      delivery_method: { type: ['string', 'null'], enum: ['kurye', 'elden', 'kargo', null] },
      scan_bodies_delivered: { type: ['boolean', 'null'] },
      form_no:         { type: ['string', 'null'], description: 'Sağ üstteki Form No hanesi' },
      items: {
        type: 'array',
        description: '"İşlem Satırları" tablosundaki dolu satırlar; tablo boşsa []',
        items: {
          type: 'object',
          properties: {
            work_type:     { type: ['string', 'null'] },
            tooth_numbers: { type: 'array', items: { type: 'integer' } },
            shade:         { type: ['string', 'null'] },
          },
          required: ['work_type', 'tooth_numbers', 'shade'],
        },
      },
      confidence: {
        type: 'object',
        properties: {
          clinic_id: CONF_ENUM, doctor_name: CONF_ENUM, patient_name: CONF_ENUM,
          order_date: CONF_ENUM, delivery_date: CONF_ENUM, urgency: CONF_ENUM,
          tooth_numbers: CONF_ENUM, work_type: CONF_ENUM, shade: CONF_ENUM,
          impression_type: CONF_ENUM, notes: CONF_ENUM,
          patient_gender: CONF_ENUM, patient_dob: CONF_ENUM,
          delivery_method: CONF_ENUM, items: CONF_ENUM,
        },
        required: ['clinic_id', 'doctor_name', 'patient_name', 'order_date', 'delivery_date',
                   'urgency', 'tooth_numbers', 'work_type', 'shade', 'impression_type', 'notes',
                   'patient_gender', 'patient_dob', 'delivery_method', 'items'],
      },
      overall_note: { type: ['string', 'null'] },
      alternatives: {
        type: 'object',
        description: 'Düşük güvenli alanlar için 2-3 aday okuma (olasılığa göre sıralı)',
        properties: {
          patient_name:  { type: 'array', items: { type: 'string' } },
          doctor_name:   { type: 'array', items: { type: 'string' } },
          shade:         { type: 'array', items: { type: 'string' } },
          work_type:     { type: 'array', items: { type: 'string' } },
          notes:         { type: 'array', items: { type: 'string' } },
          order_date:    { type: 'array', items: { type: 'string' } },
          delivery_date: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    required: ['clinic_id', 'doctor_name', 'patient_name', 'order_date', 'delivery_date',
               'urgency', 'tooth_numbers', 'work_type', 'shade', 'impression_type', 'notes',
               'patient_gender', 'patient_dob', 'delivery_method', 'items', 'confidence'],
  },
};

/**
 * Claude Vision'ı YAPISAL çıktıya zorlar (tool_use). Dönen `input` doğrudan
 * ParsedWorkOrder şeklindedir — regex/JSON.parse yok. Model callClaude ile
 * aynı (temperature GÖNDERİLMEZ); sadece tools + tool_choice eklenir.
 */
async function callClaudeTool(
  fileBase64: string,
  mimeType: string,
  apiKey: string,
  prompt: string,
  maxTokens = 2048,
): Promise<ParsedWorkOrder | null> {
  const isImage = mimeType.startsWith('image/');
  const content: any[] = [
    { type: isImage ? 'image' : 'document', source: { type: 'base64', media_type: mimeType, data: fileBase64 } },
    { type: 'text', text: prompt },
  ];

  let resp: Response | null = null;
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: maxTokens,
        // Opus 5: `temperature` DEPRECATED → gönderilmez (bkz. callClaude).
        tools: [WORK_ORDER_TOOL],
        tool_choice: { type: 'tool', name: WORK_ORDER_TOOL.name },
        messages: [{ role: 'user', content }],
      }),
    });
    if (resp.ok) break;
    lastErr = `${resp.status}: ${(await resp.text()).slice(0, 300)}`;
    if (resp.status < 500 && resp.status !== 429) break;
    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
  }
  if (!resp || !resp.ok) throw new Error(`Claude API error ${lastErr}`);
  const json = await resp.json();
  const toolBlock = (json?.content ?? []).find((b: any) => b?.type === 'tool_use' && b?.name === WORK_ORDER_TOOL.name);
  return (toolBlock?.input as ParsedWorkOrder) ?? null;
}

/**
 * DÜZ METİN iş emri (WhatsApp'tan fotoğrafsız, yazıyla gelen) → yapısal JSON.
 * Görüntü YOK; tek Claude çağrısı, WORK_ORDER_TOOL şemasıyla zorunlu yapısal çıktı.
 * Metin okunaklı olduğundan confidence genelde "high" olur.
 */
async function parseTextOrder(orderText: string, apiKey: string, senderNote = ''): Promise<ParsedWorkOrder | null> {
  const prompt = `Aşağıdaki DÜZ METİN bir diş laboratuvarı İŞ EMRİ (WhatsApp'tan yazıyla geldi, fotoğraf YOK).
Metindeki bilgileri WORK_ORDER şemasındaki alanlara çıkar. Metin okunaklı yazıldığından
okunan alanların confidence'ı genelde "high"; metinde HİÇ geçmeyen alan null + "missing".

Kurallar:
- shade/renk: "A2", "3M3" (3D-Master), "BL2" gibi kodlar geçerli — aynen yaz.
- tooth_numbers: FDI numaraları; metinde yazılan diş no'larını al ("36-46" → metindeki haliyle
  geçen numaraları ver, uydurma/aralık şişirme yapma).
- work_type: metinde geçen işlem adını olabildiğince AYNEN yaz ("zirkon kron",
  "screw retained" gibi). Jenerik kategoriye çevirme — sistemdeki hizmet adıyla
  eşleştirilecek.
- items: metin birden fazla işlem/diş grubu tarif ediyorsa her birini ayrı ver;
  tek bir iş varsa [] bırak ve work_type/tooth_numbers alanlarını kullan.
- İmplant sistemi/marka (ör. Neodent), özel istekler → notes alanına yaz.
- clinic_id yalnızca metinde uuid varsa; klinik ADI clinic_id DEĞİLDİR (adı doctor/notes bağlamında bırak).
${senderNote ? '\nGönderenin ek notu (dikkate al): ' + senderNote : ''}

=== İŞ EMRİ METNİ ===
${orderText}`;

  let resp: Response | null = null;
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 2048,
        tools: [WORK_ORDER_TOOL],
        tool_choice: { type: 'tool', name: WORK_ORDER_TOOL.name },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (resp.ok) break;
    lastErr = `${resp.status}: ${(await resp.text()).slice(0, 300)}`;
    if (resp.status < 500 && resp.status !== 429) break;
    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
  }
  if (!resp || !resp.ok) throw new Error(`Claude API error ${lastErr}`);
  const json = await resp.json();
  const toolBlock = (json?.content ?? []).find((b: any) => b?.type === 'tool_use' && b?.name === WORK_ORDER_TOOL.name);
  const parsed = (toolBlock?.input as ParsedWorkOrder) ?? null;
  if (parsed) parsed.raw_transcription = orderText;
  return parsed;
}

/**
 * Iki aşamalı Claude Vision OCR.
 *
 *   PASS 1 — Pure OCR transcription:
 *     Claude'a yalnızca metni transkribe ettiriyoruz (yapısal extraction YOK).
 *     Bu sayede el yazısı + işaretli kutu + QR + matbu metin tek tek okunur.
 *     Sonuç: ham metin bloğu.
 *
 *   PASS 2 — Structured extraction with transcription context:
 *     Claude'a hem orijinal görüntü hem Pass 1 transcription'u veriliyor.
 *     Görüntüde gördüğünü Pass 1 metnine bağlayarak yapısal JSON üretir.
 *     Bu chain-of-thought yaklaşımı el yazısı sorunlarını ~3x azaltır.
 */
async function parseWithClaude(
  fileBase64: string,
  mimeType: string,
  apiKey: string,
  senderNote = '',
): Promise<ParsedWorkOrder | null> {
  // ─── PASS 1: Pure OCR transcription ─────────────────────────
  const ocrPrompt = `Bu bir DENTAL LAB (diş laboratuvarı) iş emri formu — el yazısı + matbu içerik karışık.

ÖNEMLİ — DENTAL TERMİNOLOJİ:
El yazısında zor okunuyorsa aşağıdaki sık geçen dental terimleri SÖZLÜK olarak kullan, ama uydurma — sadece harf desenleri uyuyorsa varsay:

  KONUM/YÜZ TERİMLERİ:
    "oklüzal" / "occlusal" → dişin çiğneme yüzeyi (üst kron yüzeyi)
    "bukkal" / "buccal" → yanak tarafı
    "lingual" / "palatinal" → dil/damak tarafı
    "mezial" / "distal" → ön/arka kenarlar
    "servikal" / "cervical" → diş eti hizası
    "insizal" / "incisal" → kesici kenar
    "apikal" → kök ucu

  PROTEZ TÜRLERİ:
    "kron" (crown), "köprü" (bridge), "implant", "abutment", "vida" (screw),
    "vida deliği" → implant kronunda erişim deliği (yaygın istek!)
    "zirkonyum" / "zirkon", "metal seramik", "porselen", "akrilik",
    "lamine veneer", "e-max", "feldspatik"

  ÖLÇÜ / DİĞER:
    "ölçü", "model", "wax-up", "try-in", "shade" (renk), "Vita skalası",
    "A1/A2/A3/A3.5/A4/B1/B2/B3/C1/C2/D2/D3" → renk kodları,
    "ısırma kaydı", "çene ilişkisi", "kapanış"

  🎨 RENK OKURKEN — ÇOK DİKKAT:
    Renk kodu 2 karakter (örn. A2): bir harf (A/B/C/D) + bir rakam (1/2/3/3.5/4).
    El yazısında 1-2-3 rakamları kolayca KARIŞIR. Şu kuralları kullan:
      • "2" sayısı: üstte yatay düz çizgi + altta yatay çizgi, ortasında "z" benzeri eğri
      • "3" sayısı: iki yarım daire (üstte küçük, altta büyük) — açık ağız gibi
      • "1" sayısı: tek dik çizgi, opsiyonel üst başlık/alt kaide
      • "A2" en yaygın renk (default beyaz-bej), "A3" de yaygın ama daha sarı
    Kutudaki yazı KÜÇÜK olabilir — yakınlaştırarak harf/rakamı tek tek çöz, tahmin etme.
    Eğer rakam belirsizse confidence: "low" ver ve UI'ya kullanıcının doğrulamasını söyle.

  YAYGIN İFADELER:
    "rica ediyoruz" / "rica ediyor" → request ediyor anlamında
    "lütfen" → please
    "acil" / "çok acil" → urgency

  YAYGIN TÜRKÇE İSİMLER (büyük harfle yazılır genelde):
    Erkek: AHMET, MEHMET, MUSTAFA, ALİ, HASAN, HÜSEYİN, HALUK, BURAK,
           EMRE, OZAN, KEREM, BARIŞ, CAN, DENİZ, ENES, EMİR, KAAN
    Kadın: AYŞE, FATMA, ZEYNEP, GÜLCİN, GÜLGÜN, GÜLŞEN, ELİF, NAZ,
           CEYDA, NESLİHAN, AYÇA, AYÇIN, BERFİN, DİLAY, ECRİN
    Soyad: YILMAZ, ÖZTÜRK, DEMİR, ŞAHİN, KAYA, ÇELİK, KILIÇ, BABACAN,
           KAZAZ, KARAGALAN, AKSU, KAYAR, DOĞAN, ARSLAN, AYDIN

    Türkçe karakterler: Ç Ş İ Ğ Ü Ö dikkat — özellikle başharfler.
    Büyük harf yazılmış el yazısı isim → genelde 2 kelime (ad + soyad).

  EL YAZISI KISALTMALAR:
    "Z." / "Zr." → Zirkonyum
    "MS" / "M.S." → Metal Seramik
    "Em" / "Emax" → E-max
    "Tep." / "Tepe" → tepe (oklüzal)
    "Vd." → vida
    "Klv." → kullanmadık ama: klıvüze gibi terimler

GÖREVİN: Form üzerinde GÖRDÜĞÜN HER METNİ aynen transkribe et. Yapılandırma YAPMA, sadece kelime kelime yaz.

Format:
=== MATBU METİN (basılı) ===
[basılı başlıklar, etiketler — kelime kelime. Ayrıca üst köşede klinik adı/logo var mı yaz.]

=== EL YAZISI / DOLDURULMUŞ ALANLAR ===
[el ile doldurulmuş hasta adı, doktor adı, tarih, renk vb. — okuyabildiğin kadar.
 Eğer el yazısı bir dental terime benziyorsa (örn. "okluzal", "vida", "zirkon"), büyük olasılıkla odur.]

=== FORM YERLEŞİMİ (2026-08 sürümü — bölümleri bu sırayla ara) ===
  1. ÜST BANT: solda lab adı/logosu, ortada "İŞ EMRİ FORMU" + KLİNİK adı,
     sağda QR ("WORKORDER:<uuid>") ve altında "FORM NO" tarağı.
  2. KÜNYE KUTUSU: "Hekim" satırı (klinik hekimleri kutucuk olarak basılı +
     "Diğer:" yazma satırı), altında Hasta Adı · Cinsiyet (K/E) ·
     Doğum Tar. (YYYY/AA/GG) · Tarih (GG/AA/YYYY) · Teslim Tar. (GG/AA/YYYY).
     ⚠ Doğum tarihi ile diğer iki tarihin hane sırası FARKLI.
  3. ACİLİYET bandı: Normal / Acil / Çok Acil.
  4. DİŞ ŞEMASI: iki anatomik ark YAN YANA — SOLDA üst çene (11-28),
     SAĞDA alt çene (31-48). Her dişin üstünde FDI numarası yazılı.
     İşaretli = boyanmış/daire içine alınmış diş.
  5. İŞLEM TİPİ: laboratuvarın hizmet kataloğu, KATEGORİ BAŞLIKLARI altında
     (ör. "DİŞ ÜSTÜ HİZMETLER", "İMPLANT ÜSTÜ HİZMETLER"). Etiketleri
     BİREBİR yaz — bunlar sistemdeki hizmet adlarıdır.
  6. İŞLEM SATIRLARI: üç sütunlu tablo (İşlem | Diş No | Renk), el yazısı.
  7. RENK: Vita Classic (A1…D4) + Vita 3D-Master (0M1…5M3) kutucukları,
     altında "Diğer renk" yazma satırı.
  8. ÖLÇÜ YÖNTEMİ: Manuel (Ölçü) / Dijital (Tarama).
  9. TESLİM: Kurye / Elden / Kargo + "Scan body teslim edildi".
 10. ÖZEL NOTLAR: çizgili yazma alanı.

=== İŞARETLİ KUTULAR ===
[hangi checkbox işaretli — örn: "İşlem Tipi: Metal-Porselen işaretli", "Aciliyet: Acil işaretli", vb.
 İşaretler X, ✓, dolu kutu, daire içine alma olabilir — hepsini "işaretli" say.]

=== DİŞ ŞEMASI ===
[hangi diş numaraları işaretlenmiş — FDI numarası ver. Üst: 18-11 sağ, 21-28 sol. Alt: 48-41 sağ, 31-38 sol.
 Dişin üstüne X, daire, taranmış alan, ok işareti varsa "işaretli" say.
 Şemanın ortasındaki dikey çizgi midline'dır — ürün değil, atla.]

=== HEKİM NOTLARI / NOTLAR ===
[Notlar bölümündeki el yazısını TAM AYNEN transkribe et — yukarıdaki dental sözlüğü kullan.
 "Oklüzal vida deliği rica ediyoruz" gibi yaygın ifadeleri tanı.
 Kısaltmalar olabilir: "Okl." → Oklüzal, "Z" → Zirkonyum, "MS" → Metal Seramik.]

=== QR KOD ===
[QR varsa içeriği oku, yoksa "yok" yaz]

=== GENEL NOT ===
[Formun okuma kalitesi hakkında 1 cümle: "temiz", "bazı alanlar silik", "el yazısı çok karışık" gibi]

ÖNEMLİ: Tahmin etme — ama el yazısı yukarıdaki dental terim sözlüğündeki bir kelimeye HARF DESENİ olarak yakınsa o kelimeyi yaz (dental bağlamda büyük olasılıkla odur). Hiç okuyamadığın yere "[okunamadı]" yaz. Boş alanlara "(boş)" yaz.`;

  let transcription = '';
  try {
    transcription = await callClaude(fileBase64, mimeType, apiKey, ocrPrompt, 1500);
  } catch (e: any) {
    // Pass 1 başarısız olursa Pass 2'ye direkt git, transcription olmadan
    transcription = '[transcription failed: ' + (e?.message ?? 'unknown') + ']';
  }

  // ─── PASS 2: Structured extraction with transcription context ─
  const structPrompt = `Bu bir DENTAL LAB iş emri formudur — klinik elle doldurmuş, lab dijital sisteme alacak.
Form yapılandırılmış: işaretlenmiş kutular (☐ → ☑), elle yazılmış hasta adı, tarih kutuları, diş şeması.
Sadece JSON döndür, başka metin yazma.

═══════════════════════════════════════════════════════════════
ÖNCEKİ AŞAMA — Bu görselin ham OCR transkripsiyonu (Pass 1 çıktısı):
═══════════════════════════════════════════════════════════════
${transcription}
═══════════════════════════════════════════════════════════════
${senderNote ? `
═══════════════════════════════════════════════════════════════
GÖNDERENİN WHATSAPP MESAJI (fotoğrafın yanında/ayrı yazdığı metin — forma AİT DEĞİL,
ek talep/bilgi):
═══════════════════════════════════════════════════════════════
${senderNote}
═══════════════════════════════════════════════════════════════
Bu mesajı DA dikkate al: içinde aciliyet ("acil"/"çok acil"), renk (A2, B1…),
teslim tarihi, hasta/doktor adı, iş tipi veya özel talep varsa ilgili alanları buradan
DOLDUR/DÜZELT (formda işaretli değer varsa onunla çelişme; mesaj ek bilgi verir).
Mesajdaki serbest talepleri "notes" alanına da EKLE (formdaki notlarla birleştir).
` : ''}
Şimdi yukarıdaki transkripsiyon BİLGİSİNİ ve doğrudan GÖRÜNTÜYÜ birlikte kullanarak structured JSON üret.
Transkripsiyon Pass 1 olarak yapıldı — okunan metni yapısal alanlara map et.
Görüntüyü de göz önünde bulundur (transkripsiyondaki olası hataları görüntüden düzelt).

Sadece JSON döndür, başka metin yazma.

Şema:
{
  "clinic_id": string|null,
                      // Form üzerinde QR kod varsa içeriği "WORKORDER:<uuid>" formatında — sadece uuid'yi yaz.
                      // Transkripsiyondaki "QR KOD" bölümüne bak. QR okunamadıysa null.
  "doctor_name": string|null,
                      // Doktor / Hekim adı varsa (formda "Doktor:", "Hekim:" gibi etiketler).
                      // El yazısı doktor adını burada ver. Klinikten hekim adı transkripsiyonda yazıyorsa kullan.
  "patient_name": string|null,
                      // El yazısı hasta adı. Doktor adıyla karıştırma — formdaki "Hasta" etiketli alandan al.
  "order_date": string|null,
                      // YYYY-MM-DD. Sipariş/form tarihi.
  "delivery_date": string|null,
                      // YYYY-MM-DD. Teslim tarihi.
  "urgency": "normal"|"acil"|"cok_acil"|null,
                      // Aciliyet bölümünde işaretli kutu (transkripsiyondaki "İŞARETLİ KUTULAR" bölümüne bak).
  "tooth_numbers": number[],
                      // FDI numaraları — transkripsiyondaki "DİŞ ŞEMASI" bölümünden al.
                      // İşaretli olan dişler. Hiçbir şey işaretli değilse [].
  "work_type": string|null,
                      // İŞARETLİ olan işlem kutusunun etiketini BİREBİR kopyala.
                      // ⚠ KRİTİK: Form, laboratuvarın KENDİ hizmet kataloğunu basar
                      // (kategori başlıkları altında, ör. "İMPLANT ÜSTÜ HİZMETLER" →
                      // "Screw Retained Kron", "DİŞ ÜSTÜ HİZMETLER" → "Zirkon Kron / Köprü").
                      // Bu adlar sistemdeki hizmet kayıtlarıyla eşleştirilecek; kendi
                      // kelimenle YAZMA, jenerik kategoriye ÇEVİRME. "Zirkon Kron / Köprü"
                      // gördüysen aynen "Zirkon Kron / Köprü" yaz — "Zirkonyum" DEĞİL.
  "shade": string|null,
                      // Renk. Form iki skalayı da basar:
                      //   Vita Classic: A1 A2 A3 A3.5 A4 B1 B2 B3 B4 C1 C2 C3 C4 D2 D3 D4
                      //   Vita 3D-Master: 0M1…5M3 (ör. 2M2, 3L1.5, 4R2.5)
                      // İşaretli kutunun kodunu aynen ver. Altındaki "Diğer renk" yazma
                      // satırı doluysa onu kullan.
  "impression_type": "Manuel"|"Dijital"|null,
                      // "Ölçü Yöntemi" bölümünde işaretli kutu:
                      // "Manuel (Ölçü)" → "Manuel", "Dijital (Tarama)" → "Dijital".
  "notes": string|null,
                      // Özel notlar — el yazısı. Transkripsiyondaki notları kullan.
                      // İmplant sistemi/markası da buraya yazılıyor.
  "patient_gender": "kadın"|"erkek"|null,
                      // Künyedeki "Cinsiyet" alanında K veya E kutusu işaretli.
  "patient_dob": string|null,
                      // YYYY-MM-DD. Künyedeki "Doğum Tar." tarağı — form YYYY/AA/GG
                      // sırasıyla basar (diğer iki tarih GG/AA/YYYY, karıştırma).
  "delivery_method": "kurye"|"elden"|"kargo"|null,
                      // "Teslim" bölümünde işaretli kutu.
  "scan_bodies_delivered": boolean|null,
                      // "Teslim" bölümündeki "Scan body teslim edildi" kutusu.
  "form_no": string|null,
                      // Sağ üstte, QR altındaki "Form No" tarağına yazılan numara.
  "items": [ { "work_type": string|null, "tooth_numbers": number[], "shade": string|null } ],
                      // "İŞLEM SATIRLARI" tablosu (sütunlar: İşlem | Diş No | Renk).
                      // Farklı dişlere farklı işlem yapılacaksa hekim buraya yazar.
                      // SADECE DOLU satırları ver; tablo boşsa []. work_type yine
                      // katalog etiketiyle birebir olmalı.
  "confidence": {
    "clinic_id":       "high"|"medium"|"low"|"missing",
    "doctor_name":     "high"|"medium"|"low"|"missing",
    "patient_name":    "high"|"medium"|"low"|"missing",
    "order_date":      "high"|"medium"|"low"|"missing",
    "delivery_date":   "high"|"medium"|"low"|"missing",
    "urgency":         "high"|"medium"|"low"|"missing",
    "tooth_numbers":   "high"|"medium"|"low"|"missing",
    "work_type":       "high"|"medium"|"low"|"missing",
    "shade":           "high"|"medium"|"low"|"missing",
    "impression_type": "high"|"medium"|"low"|"missing",
    "notes":           "high"|"medium"|"low"|"missing",
    "patient_gender":  "high"|"medium"|"low"|"missing",
    "patient_dob":     "high"|"medium"|"low"|"missing",
    "delivery_method": "high"|"medium"|"low"|"missing",
    "items":           "high"|"medium"|"low"|"missing"
  },
  "overall_note": string|null
                      // Genel okunabilirlik özeti — transkripsiyondaki "GENEL NOT" bölümünden esinlen.
}

GÜVEN SEVİYESİ:
  - "high"    → transkripsiyonda net okundu + görüntüde teyit edildi
  - "medium"  → büyük ihtimalle doğru ama tereddüt var
  - "low"     → tahmin, kontrol edilmeli (el yazısı zor)
  - "missing" → alan boş/işaretsiz, null verdin

ÖNEMLİ:
- Transkripsiyondaki "[okunamadı]" işaretli alanlara confidence: "low" ver, değer tahmin etme.
- Doktor adı ve hasta adı KARIŞTIRMA — formda iki ayrı etiket olmalı.
- Hiçbir alanı uydurma. Emin değilsen null + confidence düşük.
- confidence alanı ZORUNLU — her field için doldur.`;

  let parsedPass2: ParsedWorkOrder | null;
  try {
    // tool_use → şema-garantili obje; regex/JSON.parse yok.
    parsedPass2 = await callClaudeTool(fileBase64, mimeType, apiKey, structPrompt, 2048);
  } catch (e: any) {
    throw new Error('Structured extraction failed: ' + (e?.message ?? 'unknown'));
  }
  if (!parsedPass2) return null;

  // ─── PASS 3: SELF-VERIFICATION (Critic) ───────────────────────
  // Claude'a kendi extraction'unu görüntüye karşı doğrulattır.
  // Özellikle "low" / "medium" confidence alanlar için faydalı.
  const lowOrMedFields = Object.entries(parsedPass2.confidence ?? {})
    .filter(([_, c]) => c === 'low' || c === 'medium')
    .map(([k]) => k);

  // Yalnızca şüpheli alan varsa critic pass çalıştır (cost optimization)
  if (lowOrMedFields.length > 0) {
    const criticPrompt = `Aşağıda bu formdan çıkarılmış JSON var. Görüntüyü TEKRAR incele ve denetle.

ÇIKARILMIŞ JSON:
${JSON.stringify(parsedPass2, null, 2)}

ŞÜPHELİ ALANLAR (confidence: low/medium):
${lowOrMedFields.join(', ')}

GÖREVİN İKİ AŞAMADA:

▶ AŞAMA A — Görüntüye TEKRAR baktığın için EXTRA dikkatle oku:
1. Yanlış değer varsa düzelt
2. Doğruysa confidence'i "high"'a yükselt
3. Hâlâ okunamıyorsa null + "missing"

▶ AŞAMA B — Düşük güvenli her alan için 2-3 ADAY OKUMA üret:
   Aday okuma = "Bu el yazısı şöyle de okunabilir" şeklinde alternatif yorumlar.
   Örnek: Renk kutusunda silik bir karakter varsa: ["A2", "A3", "B2"]
   Örnek: Hasta adı için: ["GÜLCİN KAZAZ", "GÜLGÜN KAZAZ", "GÜLDEN KAZAZ"]
   Adayları olasılığa göre sırala (en olası → en az olası).
   En olası aday HEM "value"'ya hem "alternatives"'in ilk elemanına yazılmalı.

ÖZEL DİKKAT NOKTALARI:
- VITA renk kodları (A1/A2/A3/A3.5/A4 vs B1-D3) — rakam karakteri tek tek çöz
- Doktor adı vs Hasta adı — etiketleri karıştırma
- Diş numaraları — şemada işaretli olanlar (boş dişlere işaret koyma)
- Tarih kutucukları — eksik rakam varsa null
- El yazısı notlar — dental sözlük (oklüzal, vida deliği, vb.) kullan
- Türkçe isim okuma — yaygın isimler ("HALUK", "GÜLCİN", "GÜLGÜN", "AYÇA", "AYÇIN") arasındaki ufak farklara dikkat

ÇIKTI FORMATI — aynı JSON şeması + ek alan:
{
  ...orijinal alanlar (düzeltilmiş),
  "alternatives": {
    "shade": ["A2", "A3"],
    "patient_name": ["GÜLCİN KAZAZ", "GÜLGÜN KAZAZ"]
    // ... düşük güvenli alanlar için en az 2 aday. high olanlar için alan yok.
  }
}

SADECE JSON döndür.`;

    try {
      const refined = await callClaudeTool(fileBase64, mimeType, apiKey, criticPrompt, 2048);
      // Pass 3 sonucu Pass 2'nin üstüne yazar — daha güvenilir kabul edilir
      if (refined) parsedPass2 = refined;
    } catch {
      // Pass 3 başarısız → Pass 2 sonucuyla devam
    }
  }

  try {
    const parsed = parsedPass2;
    // Pass 1 ham transcription'u da response'a ekle (debugging + verification için)
    parsed.raw_transcription = transcription;
    return parsed;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!(await assertCallerAuthorized(req))) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  try {
    const body = await req.json();
    const fileBase64: string | undefined = body.file_base64;
    const mimeType: string = body.mime_type ?? 'application/pdf';
    // Fotoğrafsız, DÜZ METİN iş emri (WhatsApp yazısı). file_base64 yoksa buradan üretilir.
    const orderText = String(body.text ?? '').trim();
    // Gönderenin fotoğrafla birlikte/ayrı yazdığı serbest metin (opsiyonel bağlam).
    const senderNote = String(body.sender_note ?? '').replace(/[\t\r]+/g, ' ').trim().slice(0, 2000);
    if (!fileBase64 && !orderText) throw new Error('file_base64 veya text zorunlu');

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY tanımlı değil');

    // ── mode:'classify' → görsel bir İŞ EMRİ FORMU mu yoksa FOTOĞRAF mı? (tek hızlı çağrı) ──
    if (String(body.mode ?? '') === 'classify') {
      if (!fileBase64) throw new Error('classify için file_base64 gerekli');
      const nmime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
      const CLASSIFY_PROMPT = `Bu görsel bir diş laboratuvarı İŞ EMRİ FORMU mu, yoksa bir FOTOĞRAF / EKRAN GÖRÜNTÜSÜ mü?
FORM = matbu başlıklar + elle doldurulmuş alanlar / işaretli kutucuklar olan kağıt iş emri belgesi.
FOTO = ağız içi klinik fotoğraf, diş/alçı model fotoğrafı, CAD tasarım ekran görüntüsü, panoramik/periapikal röntgen,
       ya da forma benzemeyen herhangi bir görsel.
SADECE tek kelime yaz: form   VEYA   foto`;
      let kindRaw = '';
      try { kindRaw = (await callClaude(fileBase64, nmime, apiKey, CLASSIFY_PROMPT, 16)).toLowerCase(); }
      catch { kindRaw = ''; }
      const kind = /foto|photo|görüntü|goruntu|ekran|röntgen|rontgen|model|ağız|agiz/.test(kindRaw) ? 'photo'
                 : /form|emri|belge/.test(kindRaw) ? 'form'
                 : 'form'; // belirsizse güvenli taraf: iş emri say (sipariş kaybolmasın)
      return new Response(JSON.stringify({ ok: true, kind, raw: kindRaw.slice(0, 40) }), {
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    let data: ParsedWorkOrder | null;
    if (fileBase64) {
      const validMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
      if (!validMimes.includes(mimeType)) throw new Error(`Desteklenmeyen dosya tipi: ${mimeType}`);
      data = await parseWithClaude(fileBase64, mimeType === 'image/jpg' ? 'image/jpeg' : mimeType, apiKey, senderNote);
    } else {
      // Düz metin → fotoğrafsız iş emri
      data = await parseTextOrder(orderText, apiKey, senderNote);
    }
    if (!data) throw new Error('OCR sonuçtan JSON çıkarılamadı');

    return new Response(JSON.stringify({ ok: true, data }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) ?? 'unknown' }), {
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});
