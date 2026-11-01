// Luca canlıya geçiş kapısı: test ortamında 1 e-Fatura + 1 e-Arşiv ("Başarıyla Tamamlandı").
// Uygulamanın kullandığı istek kurucuyla (luca.ts → _shared/luca.ts sembolik bağı) gönderir.
//
//   node --experimental-strip-types tools/test-invoices.ts send   <base> <çıktı-dizini>
//   node --experimental-strip-types tools/test-invoices.ts status <base> <çıktı-dizini>   (+ PDF indirir)
// base: http://luca-proxy:8080 · sır: LUCA_PROXY_SECRET ortam değişkeni
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  buildGetTaxPayerEnvelope, buildSendEnvelope, buildSearchEnvelope,
  parseSendResponse, parseTaxPayerResponse, parseSearchResponse, signLucaRequest,
  type LucaEnvelope, type LucaInvoiceInput, type LucaKind,
} from './luca.ts';

const [mode, base = 'http://luca-proxy:8080', outDir = '/out'] = process.argv.slice(2);
const SECRET = process.env.LUCA_PROXY_SECRET ?? '';
// İki Luca demo firması. Varsayılan: Demo 1 → Demo 2. LUCA_TEST_REVERSE=1 → Demo 2 → Demo 1
// (Demo 1 = GİB'in ortak test VKN'si; kutuları tüm entegratörlerde aktif).
const DEMO1 = {
  taxCode: '1234567801', name: 'TÜRMOB LUCA TEST KULLANICISI', taxOffice: 'BEŞİKTAŞ',
  street: 'KOBİ ORGANİZE SANAYİ BÖLGESİ 103.CADDE NO:29', city: 'İstanbul', town: 'Şişli', postalCode: '34394',
};
const DEMO2 = {
  taxCode: '8810234738', name: '02-TÜRMOB LUCA TEST KULLANICISI', taxOffice: 'BEŞİKTAŞ',
  street: 'Esentepe Mahallesi, Bahar Sk.', buildingNumber: '1300', city: 'İstanbul', town: 'Şişli', postalCode: '34394',
};
const REVERSE = process.env.LUCA_TEST_REVERSE === '1';
const seller = REVERSE ? DEMO2 : DEMO1;
const buyer = REVERSE ? DEMO1 : DEMO2;
// Demo 2'nin üç PK'sı da (292/169/turmob) GİB testte "Adres_Bulunamadi" verdi (2026-10-17).
const BUYER_INBOX = process.env.LUCA_TEST_INBOX ?? 'urn:mail:169defaultpk@luca.com.tr';
const STATE = `${outDir}/test-invoices.json`;

async function call(env: LucaEnvelope): Promise<string> {
  const path = `/luca/test/${env.service}`;
  const ts = Math.floor(Date.now() / 1000);
  const res = await fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: env.soapAction,
      'X-Luca-Ts': String(ts),
      'X-Luca-Sig': await signLucaRequest(SECRET, ts, path, env.soapAction, env.body),
    },
    body: env.body,
  });
  const text = await res.text();
  if (res.status !== 200) console.log(`  HTTP ${res.status}: ${text.slice(0, 600)}`);
  return text;
}

const today = new Date().toISOString().slice(0, 10);
const lines = [
  { code: 'SMN-ZRK', name: 'Zirkonyum kron', quantity: 2, unitPrice: 1500, vatRate: 20 },
  { code: 'SMN-MDL', name: 'Çalışma modeli', quantity: 1, unitPrice: 250, vatRate: 20 },
];

async function send() {
  const tp = parseTaxPayerResponse(await call(buildGetTaxPayerEnvelope(buyer.taxCode)));
  console.log('Mükellef sorgusu', buyer.taxCode, tp.ok ? `${tp.inboxTags.length} PK` : tp.error);
  if (!tp.ok || !tp.registered) throw new Error(`${buyer.taxCode} e-Fatura mükellefi görünmüyor`);

  const efatura: LucaInvoiceInput = {
    kind: 'e_fatura', externalCode: randomUUID(), issueDate: today, currency: 'TRY', scenario: 'TEMELFATURA',
    seller, lines, notes: ['Siman entegrasyon testi — e-Fatura'],
    receiver: { ...buyer, inboxTag: tp.inboxTags.includes(BUYER_INBOX) ? BUYER_INBOX : tp.inboxTags[0] },
  };
  const earsiv: LucaInvoiceInput = {
    kind: 'e_arsiv', externalCode: randomUUID(), issueDate: today, currency: 'TRY',
    seller, lines, notes: ['Siman entegrasyon testi — e-Arşiv'],
    receiver: { taxCode: '11111111111', name: 'Test Alıcı', street: 'Atatürk Mah.', city: 'İstanbul', town: 'Ataşehir' },
  };

  // Kaldığı yerden devam: başarılı gönderilmiş türü tekrar gönderme (çift fatura olmasın).
  let out: Record<string, { ok?: boolean }> = {};
  try { out = JSON.parse(readFileSync(STATE, 'utf8')); } catch { /* ilk çalıştırma */ }
  for (const inv of [efatura, earsiv]) {
    if (out[inv.kind]?.ok) { console.log(`${inv.kind}: zaten gönderildi, atlanıyor`); continue; }
    const env = buildSendEnvelope(inv);
    const r = parseSendResponse(await call(env));
    console.log(`${inv.kind} (${env.op})`, JSON.stringify(r));
    out[inv.kind] = { sellerVkn: seller.taxCode, inboxTag: inv.receiver.inboxTag, externalCode: inv.externalCode, ...r };
  }
  writeFileSync(STATE, JSON.stringify(out, null, 2));
}

async function status() {
  const saved = JSON.parse(readFileSync(STATE, 'utf8')) as Record<LucaKind, { ettn?: string; externalCode: string; sellerVkn?: string }>;
  for (const kind of ['e_fatura', 'e_arsiv'] as LucaKind[]) {
    const s = saved[kind];
    const r = parseSearchResponse(await call(buildSearchEnvelope(kind, s.sellerVkn ?? DEMO1.taxCode, { ettn: s.ettn, externalCode: s.ettn ? undefined : s.externalCode, includePdf: true })));
    if (r.ok && r.found && r.pdfBase64) {
      const file = `${outDir}/${kind}-${r.invoiceNumber ?? s.ettn}.pdf`;
      writeFileSync(file, Buffer.from(r.pdfBase64, 'base64'));
      console.log(kind, JSON.stringify({ ...r, pdfBase64: undefined }), '→', file);
    } else {
      console.log(kind, JSON.stringify(r));
    }
  }
}

if (SECRET.length < 32) throw new Error('LUCA_PROXY_SECRET yok');
if (mode === 'send') await send();
else if (mode === 'status') await status();
else console.error('kullanım: test-invoices.ts <send|status> [base] [çıktı-dizini]');
