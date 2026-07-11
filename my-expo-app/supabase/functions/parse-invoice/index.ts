// parse-invoice — Satın alma faturasını PDF'den structured JSON'a çevirir.
//
// Strateji:
//   1. PDF içinde e-Fatura UBL-TR XML var mı? → varsa parse et (kesin sonuç)
//   2. Yoksa Claude Vision (anthropic) ile OCR + extraction
//
// Input  : { pdf_base64: string, filename?: string }
// Output : {
//   ok: boolean,
//   source: 'efatura' | 'vision',
//   data?: {
//     supplier_name: string,
//     invoice_number: string | null,
//     invoice_date: string | null,   // YYYY-MM-DD
//     currency: string,              // TRY/USD/EUR
//     vat_rate: number | null,       // %
//     lines: { item_name: string, quantity: number, unit: string|null, unit_price: number }[],
//     subtotal: number | null,
//     vat_amount: number | null,
//     total: number | null,
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


interface ParsedInvoice {
  supplier_name: string;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string;
  vat_rate: number | null;
  exchange_rate: number | null;   // faturada belirtilen kur (1 [currency] = X TRY). Yoksa null.
  lines: { item_name: string; quantity: number; unit: string | null; unit_price: number; vat_rate?: number | null; brand?: string | null; category?: string | null }[];
  subtotal: number | null;
  vat_amount: number | null;
  total: number | null;
}

// ── 1. UBL-TR XML extractor ────────────────────────────────────────────────
async function inflate(data: Uint8Array): Promise<string | null> {
  try {
    const ds = new DecompressionStream('deflate');
    const stream = new Blob([data]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buf));
  } catch {
    // raw deflate vs zlib header farkı olabilir — raw deneme
    try {
      const ds = new DecompressionStream('deflate-raw' as any);
      const stream = new Blob([data]).stream().pipeThrough(ds);
      const buf = await new Response(stream).arrayBuffer();
      return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buf));
    } catch { return null; }
  }
}

async function tryExtractUblXml(pdfBytes: Uint8Array): Promise<string | null> {
  // 1) Düz metin olarak gömülmüş mü? (bazı küçük entegratörler böyle yapar)
  const txt = new TextDecoder('utf-8', { fatal: false }).decode(pdfBytes);
  const plain = txt.match(/<Invoice[\s\S]*?<\/Invoice>/);
  if (plain && /xmlns[^>]*ubl/i.test(plain[0])) return plain[0];

  // 2) Sıkıştırılmış stream'leri tara (PDF/A-3 e-fatura)
  // Her "stream ... endstream" bloğunu bul, decompress et, UBL ara
  const STREAM_MARKER  = new TextEncoder().encode('stream');
  const ENDSTREAM_MARKER = new TextEncoder().encode('endstream');
  let i = 0;
  while (i < pdfBytes.length - 6) {
    // 'stream' literal'ini ara
    const start = indexOf(pdfBytes, STREAM_MARKER, i);
    if (start < 0) break;
    // 'stream' sonrası newline'ı atla
    let dataStart = start + 6;
    if (pdfBytes[dataStart] === 0x0D) dataStart++; // \r
    if (pdfBytes[dataStart] === 0x0A) dataStart++; // \n
    const end = indexOf(pdfBytes, ENDSTREAM_MARKER, dataStart);
    if (end < 0) break;
    const blob = pdfBytes.subarray(dataStart, end);
    const decoded = await inflate(blob);
    if (decoded) {
      const m = decoded.match(/<Invoice[\s\S]*?<\/Invoice>/);
      if (m && /xmlns[^>]*ubl/i.test(m[0])) return m[0];
    }
    i = end + 9;
  }
  return null;
}

function indexOf(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function parseUblInvoice(xml: string): ParsedInvoice | null {
  try {
    const tag = (re: RegExp): string | null => {
      const m = xml.match(re);
      return m ? m[1].trim() : null;
    };
    const num = (s: string | null): number | null => {
      if (!s) return null;
      const n = parseFloat(s.replace(/[^0-9.,-]/g, '').replace(',', '.'));
      return isFinite(n) ? n : null;
    };

    const supplier =
      tag(/<cac:AccountingSupplierParty>[\s\S]*?<cbc:Name>([^<]+)<\/cbc:Name>/)
      ?? tag(/<cac:PartyName>[\s\S]*?<cbc:Name>([^<]+)<\/cbc:Name>/)
      ?? '';

    const invoiceNumber = tag(/<cbc:ID>([^<]+)<\/cbc:ID>/);
    const invoiceDate   = tag(/<cbc:IssueDate>([^<]+)<\/cbc:IssueDate>/);
    const currency      = tag(/<cbc:DocumentCurrencyCode>([^<]+)<\/cbc:DocumentCurrencyCode>/) ?? 'TRY';

    const subtotal = num(tag(/<cbc:LineExtensionAmount[^>]*>([^<]+)<\/cbc:LineExtensionAmount>/));
    const vatAmount = num(tag(/<cbc:TaxAmount[^>]*>([^<]+)<\/cbc:TaxAmount>/));
    const total    = num(tag(/<cbc:PayableAmount[^>]*>([^<]+)<\/cbc:PayableAmount>/))
                  ?? num(tag(/<cbc:TaxInclusiveAmount[^>]*>([^<]+)<\/cbc:TaxInclusiveAmount>/));
    const vatRate = subtotal && vatAmount ? Math.round((vatAmount / subtotal) * 100) : null;

    // Kur (UBL): cbc:CalculationRate veya cac:PricingExchangeRate → cbc:CalculationRate
    const exchangeRate =
      num(tag(/<cac:PricingExchangeRate>[\s\S]*?<cbc:CalculationRate>([^<]+)<\/cbc:CalculationRate>/))
      ?? num(tag(/<cac:PaymentExchangeRate>[\s\S]*?<cbc:CalculationRate>([^<]+)<\/cbc:CalculationRate>/))
      ?? num(tag(/<cbc:CalculationRate>([^<]+)<\/cbc:CalculationRate>/));

    // Lines (cac:InvoiceLine bloklarını topla)
    const lines: ParsedInvoice['lines'] = [];
    const lineRegex = /<cac:InvoiceLine>([\s\S]*?)<\/cac:InvoiceLine>/g;
    let m: RegExpExecArray | null;
    while ((m = lineRegex.exec(xml)) !== null) {
      const block = m[1];
      const name = (block.match(/<cbc:Name>([^<]+)<\/cbc:Name>/)?.[1] ?? '').trim();
      const qty  = num(block.match(/<cbc:InvoicedQuantity[^>]*>([^<]+)<\/cbc:InvoicedQuantity>/)?.[1] ?? null);
      const unit = block.match(/<cbc:InvoicedQuantity[^>]*unitCode="([^"]+)"/i)?.[1] ?? null;
      const unitPrice = num(block.match(/<cbc:PriceAmount[^>]*>([^<]+)<\/cbc:PriceAmount>/)?.[1] ?? null);
      // Satır KDV oranı: TaxCategory → Percent (UBL-TR std), yoksa LineExtension/TaxAmount oranı
      const linePercent = num(block.match(/<cac:TaxCategory>[\s\S]*?<cbc:Percent>([^<]+)<\/cbc:Percent>/)?.[1] ?? null);
      const lineTaxAmount = num(block.match(/<cac:TaxTotal>[\s\S]*?<cbc:TaxAmount[^>]*>([^<]+)<\/cbc:TaxAmount>/)?.[1] ?? null);
      const lineExt = num(block.match(/<cbc:LineExtensionAmount[^>]*>([^<]+)<\/cbc:LineExtensionAmount>/)?.[1] ?? null);
      let lineVat = linePercent;
      if (lineVat == null && lineTaxAmount != null && lineExt && lineExt > 0) {
        lineVat = Math.round((lineTaxAmount / lineExt) * 100);
      }
      if (name && (qty ?? 0) > 0) {
        lines.push({ item_name: name, quantity: qty!, unit, unit_price: unitPrice ?? 0, vat_rate: lineVat });
      }
    }

    return {
      supplier_name: supplier,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate ? invoiceDate.slice(0, 10) : null,
      currency,
      vat_rate: vatRate,
      exchange_rate: exchangeRate,
      lines,
      subtotal,
      vat_amount: vatAmount,
      total,
    };
  } catch { return null; }
}

// ── 2. Claude Vision OCR — 2 aşamalı (Pass 1: transcription, Pass 2: structured) ──
async function callClaudePdf(pdfBase64: string, apiKey: string, prompt: string, maxTokens = 4096): Promise<string> {
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
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: prompt },
          ],
        }],
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

async function parseWithClaude(pdfBase64: string, apiKey: string): Promise<ParsedInvoice | null> {
  // ─── PASS 1: Pure OCR transcription with sector dictionary ────────────
  const ocrPrompt = `Bu bir TÜRKİYE'DEN bir satın alma FATURASI (e-fatura/PDF) — dental laboratuvar için malzeme/cihaz/sarf alımı.

ÖNEMLİ — DENTAL/TİCARİ TERMİNOLOJİ SÖZLÜĞÜ:
El yazısı veya zor okunan kısımlarda aşağıdaki terimleri kullan (uydurma — sadece harf deseni uyuyorsa varsay):

  FİRMA / FATURA:
    "Fatura No", "Seri", "Sıra No", "Tarih", "Vade Tarihi"
    "Müşteri", "Alıcı", "Satıcı", "Tedarikçi"
    "VKN" (Vergi Kimlik No), "TCKN", "Vergi Dairesi"
    "Adres", "Telefon", "E-posta"

  TUTARLAR:
    "Ara Toplam", "Mal Hizmet Toplamı", "KDV Matrahı"
    "KDV %20", "KDV %10", "KDV %8", "KDV %1"
    "Vergiler Toplamı", "Vergiler Dahil Toplam"
    "Genel Toplam", "Ödenecek Tutar", "Net Tutar"
    "İskonto", "İndirim", "ÖTV"

  PARA BİRİMİ:
    "₺" / "TL" / "TRY" / "Türk Lirası" → TRY
    "$" / "USD" / "Dolar" → USD
    "€" / "EUR" / "Euro" → EUR

  KUR:
    "Döviz Kuru", "Kur", "1 EUR = X TRY", "Çapraz Kur"

  DENTAL MALZEME ÖRNEKLERİ:
    Sarf: "Zirkonyum blok", "Akrilik", "Seramik tozu", "İmplant vidası",
          "Parlatma diski", "Frez", "Polisaj kiti", "Wax/mum",
          "Alçı", "Silikon ölçü", "Yapıştırıcı simon", "Bonding ajan"
    Cihaz: "CAD/CAM tezgah", "Frezeleme", "Sinterleme fırını", "3D Printer",
           "Tarayıcı/Scanner", "Polisaj cihazı", "Artikülatör", "Kompresör"
    Markalar: "Ivoclar", "3M", "Dentsply", "Sirona", "Roland", "Zirkonzahn",
              "VITA", "Renfert", "Bredent", "Amann Girrbach"

GÖREVİN: Fatura içeriğindeki HER METNİ aynen transkribe et.

Format:
=== FATURA BAŞLIĞI ===
[Tedarikçi adı, fatura no, tarih, vade, müşteri/alıcı bilgileri]

=== SATIR KALEMLERİ ===
[Her satır için: ürün adı | miktar | birim | birim fiyat | KDV% | satır toplam
 Sırasıyla, tablo şeklinde transkribe et.]

=== TUTARLAR ===
[Ara toplam, KDV (oranlara göre), genel toplam, varsa indirim/iskonto]

=== KUR / PARA BİRİMİ ===
[Para birimi sembolü ve döviz kuru varsa]

=== GENEL NOT ===
[Faturanın okunabilirliği hakkında 1 cümle]

ÖNEMLİ: Tahmin etme. Okuyamadığın yere "[okunamadı]" yaz. Boşsa "(boş)".`;

  let transcription = '';
  try {
    transcription = await callClaudePdf(pdfBase64, apiKey, ocrPrompt, 2000);
  } catch (e: any) {
    transcription = '[transcription failed: ' + (e?.message ?? 'unknown') + ']';
  }

  // ─── PASS 2: Structured extraction with transcription ────────────────
  const prompt = `Bu bir satın alma faturası PDF'idir. Aşağıdaki bilgileri JSON olarak çıkar. Sadece JSON döndür, başka metin ekleme.

═══════════════════════════════════════════════════════════════
ÖNCEKİ AŞAMA — Bu faturanın ham OCR transkripsiyonu (Pass 1):
═══════════════════════════════════════════════════════════════
${transcription}
═══════════════════════════════════════════════════════════════

Şimdi yukarıdaki transkripsiyonu ve PDF'i birlikte kullanarak structured JSON üret.

Şema:
{
  "supplier_name": string,       // tedarikçi firma adı
  "invoice_number": string|null, // fatura numarası
  "invoice_date": string|null,   // YYYY-MM-DD formatında
  "currency": "TRY"|"USD"|"EUR", // para birimi
  "vat_rate": number|null,       // KDV oranı (sadece %)
  "exchange_rate": number|null,  // Faturada belirtilen DÖVİZ KURU (1 [currency] = X TRY). Yoksa null.
  "lines": [                     // satır kalemleri
    { "item_name": string, "quantity": number, "unit": string|null, "unit_price": number, "vat_rate": number|null, "brand": string|null, "category": string|null, "item_kind": "consumable"|"equipment"|"unknown", "model": string|null, "equipment_category": "cad_cam"|"scanner"|"furnace"|"milling"|"printer"|"sintering"|"polishing"|"articulator"|"compressor"|"other"|null }
  ],
  "subtotal": number|null,       // ara toplam (KDV hariç)
  "vat_amount": number|null,     // toplam KDV tutarı
  "total": number|null           // genel toplam
}

Sayıları decimal olarak (1234.56), virgül DEĞİL nokta kullan. Tarih bulunamadıysa null koy.

exchange_rate: Fatura yabancı para birimindeyse (USD/EUR) ve faturada DÖVİZ KURU yazıyorsa (örn: "Kur: 38,5024" veya "1 EUR = 38,5024 TRY"), bu kuru çıkar. TRY faturalarda veya kur yazmıyorsa null bırak. Sayıyı 1 birim yabancı paranın TL karşılığı olarak ver.

vat_rate: SATIR bazlı KDV oranı (%) — ZORUNLU, her kalem için ayrı oku.
  - Faturada satır KDV sütunu (KDV%, VAT%, Vergi%) varsa o satırın oranını yaz.
  - Farklı satırlarda farklı oranlar olabilir (örn: 10, 18, 20). Her satırın kendi oranını bul.
  - Sadece tüm satırlar için tek bir genel KDV oranı varsa hepsine aynı oranı yaz.
  - Hiçbir KDV bilgisi yoksa null bırak.
brand: ürün üzerinde marka adı görünüyorsa yaz (örn: "Ivoclar", "3M", "Dentsply"). Tahmin etme, sadece açıkça yazılmışsa.
category: ürün tipi/kategori (örn: "Implant", "Akrilik", "Zirkonyum", "Seramik"). Yine sadece açıksa.

item_kind: Bu kalem bir CIHAZ/DEMIRBAŞ (durable equipment) mı yoksa SARF MALZEMESİ mi?
  - "equipment" → CAD/CAM, freze, fırın, tarayıcı, 3D printer, sinterleme, polisaj makinesi, artikülatör, kompresör vb. dayanıklı cihazlar.
  - "consumable" → akrilik, seramik, zirkonyum blok, implant vidası, parlatma diski, sarf kimyasallar, küçük el aletleri.
  - "unknown" → emin değilsen (örn: pahalı ama net olmayan kalem). Kullanıcıya soracağız.
model: equipment ise model adı (örn: "M5 Heavy")
equipment_category: equipment ise alt kategori (cad_cam / scanner / furnace / milling / printer / sintering / polishing / articulator / compressor / other)
Sarf malzemesi için model ve equipment_category alanlarını null bırak.`;

  let structuredText = '';
  try {
    structuredText = await callClaudePdf(pdfBase64, apiKey, prompt, 4096);
  } catch (e: any) {
    throw new Error('Structured extraction failed: ' + (e?.message ?? 'unknown'));
  }

  const m = structuredText.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as ParsedInvoice; } catch { return null; }
}

// ── Handler ────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!(await assertCallerAuthorized(req))) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  try {
    const { pdf_base64 } = await req.json();
    if (!pdf_base64) throw new Error('pdf_base64 zorunlu');

    // base64 → bytes
    const pdfBytes = Uint8Array.from(atob(pdf_base64), c => c.charCodeAt(0));

    // 1) UBL-TR XML var mı?
    const xml = await tryExtractUblXml(pdfBytes);
    if (xml) {
      const data = parseUblInvoice(xml);
      if (data && data.lines.length > 0) {
        return new Response(JSON.stringify({ ok: true, source: 'efatura', data }), {
          headers: { ...corsHeaders, 'content-type': 'application/json' },
        });
      }
    }

    // 2) Claude Vision fallback
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY tanımlı değil — Supabase Secrets\'a ekle');
    const data = await parseWithClaude(pdf_base64, apiKey);
    if (!data) throw new Error('OCR sonuçtan JSON çıkarılamadı');

    return new Response(JSON.stringify({ ok: true, source: 'vision', data }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (e: any) {
    // 200 dön ki Supabase client error body'sini doğru iletsin
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) ?? 'unknown' }), {
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});
