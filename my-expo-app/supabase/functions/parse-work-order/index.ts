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
  /** Her alan için güven seviyesi — UI sarı/kırmızı uyarı için */
  confidence: Record<
    'clinic_id' | 'doctor_name' | 'patient_name' | 'order_date' | 'delivery_date' |
    'urgency' | 'tooth_numbers' | 'work_type' | 'shade' |
    'impression_type' | 'notes',
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
        model: 'claude-sonnet-4-5',
        max_tokens: maxTokens,
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
  "work_type": "Zirkonyum"|"Metal-Porselen"|"E-max"|"Tam Seramik"|"İmplant Üstü"|"Hareketli Protez"|"Geçici Kron"|"Onlay/Inlay"|null,
                      // Transkripsiyondaki "İŞARETLİ KUTULAR"da İşlem Tipi bölümünden al.
                      // "Metal Seramik Kron" gibi varyasyonlar da Metal-Porselen kabul et.
  "shade": string|null,
                      // Vita renk skalası — A1/A2/A3/A3.5/A4/B1/B2/B3/C1/C2/D2/D3 veya el yazısı renk.
  "impression_type": "Klasik"|"Dijital"|"Putty"|null,
                      // Ölçü yöntemi.
  "notes": string|null,
                      // Özel notlar — el yazısı. Transkripsiyondaki notları kullan.
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
    "notes":           "high"|"medium"|"low"|"missing"
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

  let structuredText = '';
  try {
    structuredText = await callClaude(fileBase64, mimeType, apiKey, structPrompt, 2048);
  } catch (e: any) {
    throw new Error('Structured extraction failed: ' + (e?.message ?? 'unknown'));
  }

  const m = structuredText.match(/\{[\s\S]*\}/);
  if (!m) return null;

  let parsedPass2: ParsedWorkOrder;
  try {
    parsedPass2 = JSON.parse(m[0]) as ParsedWorkOrder;
  } catch {
    return null;
  }

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
      const criticText = await callClaude(fileBase64, mimeType, apiKey, criticPrompt, 2048);
      const cm = criticText.match(/\{[\s\S]*\}/);
      if (cm) {
        try {
          const refined = JSON.parse(cm[0]) as ParsedWorkOrder;
          // Pass 3 sonucu Pass 2'nin üstüne yazar — daha güvenilir kabul edilir
          parsedPass2 = refined;
        } catch { /* fallback Pass 2'ye */ }
      }
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
    if (!fileBase64) throw new Error('file_base64 zorunlu');

    const validMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!validMimes.includes(mimeType)) throw new Error(`Desteklenmeyen dosya tipi: ${mimeType}`);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY tanımlı değil');

    const data = await parseWithClaude(fileBase64, mimeType === 'image/jpg' ? 'image/jpeg' : mimeType, apiKey);
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
