// parse-receipt — Banka dekontu / makbuzu OCR ile structured JSON'a çevirir.
//
// Input  : { file_base64: string, mime_type: string ('application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp') }
// Output : {
//   ok: boolean,
//   data?: {
//     amount: number | null,            // tutar
//     currency: 'TRY'|'USD'|'EUR'|null,
//     transaction_date: string | null,  // YYYY-MM-DD
//     payment_method: 'transfer'|'cash'|'card'|'check'|null,
//     bank_name: string | null,         // gönderen banka
//     reference_no: string | null,      // dekont/ref no
//     recipient_iban: string | null,
//     recipient_name: string | null,
//     sender_name: string | null,
//     description: string | null,       // açıklama / not (banka notu)
//   },
//   error?: string,
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { timingSafeEqualStr, isServiceRoleBearer } from '../_shared/security.ts';

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
  if (NOTIFY_FN_SECRET && secret != null && timingSafeEqualStr(secret, NOTIFY_FN_SECRET)) return true;
  const auth = req.headers.get('Authorization') ?? '';
  if (isServiceRoleBearer(auth, SERVICE_ROLE_KEY)) return true;
  try {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const userClient = createClient(SUPABASE_URL, anonKey, { global: { headers: { Authorization: auth } } });
    const { data, error } = await userClient.auth.getUser();
    return !error && !!data?.user;
  } catch { return false; }
}


interface ParsedReceipt {
  amount: number | null;
  currency: 'TRY' | 'USD' | 'EUR' | null;
  transaction_date: string | null;
  payment_method: 'transfer' | 'cash' | 'card' | 'check' | null;
  bank_name: string | null;
  reference_no: string | null;
  recipient_iban: string | null;
  recipient_name: string | null;
  sender_name: string | null;
  description: string | null;
}

async function callClaudeFile(fileBase64: string, mimeType: string, apiKey: string, prompt: string, maxTokens = 2048): Promise<string> {
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

async function parseWithClaude(
  fileBase64: string,
  mimeType: string,
  apiKey: string,
): Promise<ParsedReceipt | null> {
  // ─── PASS 1: Pure OCR with banking dictionary ────────────────
  const ocrPrompt = `Bu bir TÜRKİYE BANKACILIK dekontu / havale makbuzu / EFT belgesi.

ÖNEMLİ — BANKACILIK TERMİNOLOJİ SÖZLÜĞÜ:
Zor okunan alanlarda aşağıdaki Türkçe bankacılık terimlerini referans al:

  İŞLEM TÜRLERİ:
    "EFT" → Elektronik Fon Transferi (transfer)
    "Havale" / "Para Transferi" → transfer
    "FAST" → anlık transfer (transfer)
    "Swift" → uluslararası transfer
    "Nakit Yatırma" / "Para Yatırma" → cash
    "Kart Çekim" / "POS" / "Kredi Kartı" → card
    "Çek/Senet Tahsil" → check
    "Ödeme Talimatı" → genelde transfer

  TUTAR ETİKETLERİ:
    "İşlem Tutarı", "Tutar", "Gönderilen Tutar", "Yatırılan Tutar"
    "Toplam Tutar", "Net Tutar", "Ödenen"
    "Masraf", "Komisyon", "BSMV", "Vergi" → ANA TUTAR DEĞİL
    "Bakiye" → bilgi amaçlı, ana işlem tutarı değil

  TARİH:
    "İşlem Tarihi", "Valör Tarihi", "Düzenleme Tarihi"
    Türkçe format: GG.AA.YYYY veya GG/AA/YYYY → YYYY-MM-DD'ye çevir

  PARA BİRİMİ:
    "₺" / "TL" / "TRY" / "Türk Lirası" → TRY
    "$" / "USD" / "ABD Doları" → USD
    "€" / "EUR" / "Euro" → EUR

  GÖNDEREN / ALICI:
    "Gönderen", "Borçlu", "Müşteri" → sender
    "Alıcı", "Lehdar", "Alacaklı" → recipient
    "IBAN" → 26 haneli, TR ile başlar (örn. TR12 0001 5001 5800 7360 9777 04)

  BANKA İSİMLERİ (yaygın):
    "T.İş Bankası" / "İş Bankası", "Ziraat Bankası", "Garanti BBVA",
    "Yapı Kredi", "Akbank", "Vakıf Bank" / "VakıfBank",
    "Halkbank", "QNB Finansbank", "Denizbank", "ING Bank", "TEB"

  REFERANS / DEKONT NO:
    "Dekont No", "Referans No", "İşlem No", "İşlem Kodu", "İşlem ID"
    Genelde 10-20 haneli sayı

  AÇIKLAMA:
    "Açıklama", "Not", "Açıklama 1", "Fatura ödemesi" gibi serbest metin
    Genelde fatura numarası içerir (örn. "IS12...ödemesi", "Fatura: ABC-2026/00123")

GÖREVİN: Dekontun TÜM metnini transkribe et.

Format:
=== BANKA / GÖNDEREN ===
[Banka adı, gönderen ad/firma]

=== ALICI ===
[Alıcı ad, IBAN, alıcı banka varsa]

=== İŞLEM DETAYI ===
[İşlem türü (EFT/Havale/FAST/...), tarih, tutar, para birimi]

=== REFERANS ===
[Dekont no, işlem ref no]

=== AÇIKLAMA ===
[Serbest açıklama metni — varsa fatura no içeriğiyle]

=== GENEL NOT ===
[Dekontun okunabilirlik durumu — 1 cümle]

ÖNEMLİ: Tahmin etme. Tutarlarda komisyon ile ANA tutarı karıştırma. Boş alanları "(boş)" olarak işaretle.`;

  let transcription = '';
  try {
    transcription = await callClaudeFile(fileBase64, mimeType, apiKey, ocrPrompt, 1500);
  } catch (e: any) {
    transcription = '[transcription failed: ' + (e?.message ?? 'unknown') + ']';
  }

  // ─── PASS 2: Structured extraction with transcription context ─
  const prompt = `Bu bir banka dekontu / havale makbuzu / EFT belgesi.

═══════════════════════════════════════════════════════════════
ÖNCEKİ AŞAMA — Bu dekontun ham OCR transkripsiyonu (Pass 1):
═══════════════════════════════════════════════════════════════
${transcription}
═══════════════════════════════════════════════════════════════

Şimdi yukarıdaki transkripsiyonu ve dekontu birlikte kullanarak structured JSON üret. Sadece JSON döndür.

Şema:
{
  "amount": number|null,            // ANA gönderilen/yatırılan tutar (komisyon DEĞİL!) - decimal, örn 18235.44
  "currency": "TRY"|"USD"|"EUR"|null,
  "transaction_date": string|null,  // YYYY-MM-DD
  "payment_method": "transfer"|"cash"|"card"|"check"|null,
                                    // havale/EFT/FAST → "transfer"
                                    // nakit → "cash"
                                    // kart/POS → "card"
                                    // çek/senet → "check"
  "bank_name": string|null,         // GÖNDEREN banka adı (Vakıf, Ziraat, İş Bankası, vb.)
  "reference_no": string|null,      // dekont no / referans / işlem numarası
  "recipient_iban": string|null,    // alıcı IBAN (TR + 24 hane = 26 toplam)
  "recipient_name": string|null,    // alıcı (lehdar) ad/firma
  "sender_name": string|null,       // gönderen ad/firma
  "description": string|null        // açıklama / not (varsa fatura no içeriğiyle)
}

ÖNEMLİ:
- Sayıları decimal olarak yaz (1234.56), virgül DEĞİL nokta.
- Tutar: ANA işlem tutarı, komisyon/BSMV/vergi DEĞİL.
- Tarih bulunamazsa null.
- Bulamadığın alanı null yap, tahmin etme.`;

  let structuredText = '';
  try {
    structuredText = await callClaudeFile(fileBase64, mimeType, apiKey, prompt, 2048);
  } catch (e: any) {
    throw new Error('Structured extraction failed: ' + (e?.message ?? 'unknown'));
  }

  const m = structuredText.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as ParsedReceipt; } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!(await assertCallerAuthorized(req))) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  try {
    const body = await req.json();
    const fileBase64: string | undefined = body.file_base64 ?? body.pdf_base64;
    const mimeType: string = body.mime_type ?? 'application/pdf';
    if (!fileBase64) throw new Error('file_base64 zorunlu');

    const validMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!validMimes.includes(mimeType)) {
      throw new Error(`Desteklenmeyen dosya tipi: ${mimeType}`);
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY tanımlı değil — Supabase Secrets\'a ekle');

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
