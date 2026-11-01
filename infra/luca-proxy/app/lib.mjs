// Luca e-fatura proxy — saf doğrulama fonksiyonları (I/O yok, test: ../test).
//
// Luca'da şifre YOK: yetki = whitelist IP + istekteki CompanyTaxCode (VKN).
// Bu VPS'ten çıkan her istek o yetkiyi taşıdığı için buradaki kontroller
// tek savunma hattıdır — gevşetmeden önce iki kez düşün.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Proxy'nin geçirdiği işlemler. Yeni işlem = bilinçli ekleme (iptal vb. hâlâ kapalı). */
export const SERVICES = {
  InvoiceService: new Set([
    'HealthCheck',
    'GetCompanyBalance',
    'SendInvoice',
    'SendArchiveInvoice',
    'SearchInvoice',
    'SearchAllInvoice',
    'SearchArchiveInvoice',
    'GetDocumentViewerLink',
  ]),
  AddressBookService: new Set([
    'GetTaxPayer',
    'GetCityList',
    'GetTownList',
    'GetTaxOfficeList',
  ]),
};

/** Firma adına işlem yapmayan uçlar — CompanyTaxCode taşımaz (varsa yine kontrol edilir). */
const NO_COMPANY_OPS = new Set(['HealthCheck', 'GetTaxPayer', 'GetCityList', 'GetTownList', 'GetTaxOfficeList']);

export const SIG_WINDOW_SEC = 300;

const sha256hex = (body) => createHash('sha256').update(body).digest('hex');

/** İmzalanan metin: zaman · yol · SOAPAction · gövde özeti. Yol imzada → test imzası prod'a taşınamaz. */
export function signingString(ts, path, soapAction, body) {
  return `${ts}\n${path}\n${soapAction}\n${sha256hex(body)}`;
}

export function sign(secret, ts, path, soapAction, body) {
  return createHmac('sha256', secret).update(signingString(ts, path, soapAction, body)).digest('hex');
}

export function verifySignature({ secret, ts, sig, path, soapAction, body, now, windowSec = SIG_WINDOW_SEC }) {
  if (!/^\d{9,11}$/.test(ts ?? '')) return { ok: false, reason: 'zaman damgası yok/bozuk' };
  if (Math.abs(now - Number(ts)) > windowSec) return { ok: false, reason: 'zaman penceresi dışında' };
  if (!/^[0-9a-f]{64}$/.test(sig ?? '')) return { ok: false, reason: 'imza yok/bozuk' };
  const expected = Buffer.from(sign(secret, ts, path, soapAction, body), 'hex');
  if (!timingSafeEqual(expected, Buffer.from(sig, 'hex'))) return { ok: false, reason: 'imza uyuşmuyor' };
  return { ok: true };
}

/** /luca/<test|prod>/<Servis> → { env, service } | null */
export function parseRoute(pathname) {
  const m = /^\/luca\/(test|prod)\/(InvoiceService|AddressBookService)$/.exec(pathname);
  return m ? { env: m[1], service: m[2] } : null;
}

// Ad alanı öneki ASCII olmayabilir (Luca örnekleri `eın:` kullanıyor).
const PFX = '(?:[^\\s<>:/!?]+:)?';

/** SOAPAction + gövde + VKN izin listesi kontrolü. */
export function checkPolicy({ service, soapAction, body, allowedVkn }) {
  const allowedOps = SERVICES[service];
  if (!allowedOps) return { ok: false, reason: 'bilinmeyen servis' };

  const action = String(soapAction ?? '').trim().replace(/^"|"$/g, '');
  const am = new RegExp(`^http://tempuri\\.org/I${service}/(\\w+)$`).exec(action);
  if (!am) return { ok: false, reason: 'SOAPAction bu servise ait değil' };
  const op = am[1];
  if (!allowedOps.has(op)) return { ok: false, reason: `izinsiz işlem: ${op}` };

  if (/<!DOCTYPE|<!ENTITY/i.test(body)) return { ok: false, reason: 'DOCTYPE/ENTITY yasak' };

  const bm = new RegExp(`<${PFX}Body\\b[^>]*>\\s*<${PFX}(\\w+)\\b`).exec(body);
  if (!bm || bm[1] !== op) return { ok: false, reason: 'gövdedeki işlem SOAPAction ile uyuşmuyor' };

  const raw = [...body.matchAll(new RegExp(`<${PFX}CompanyTaxCode\\b[^>]*>([^<]*)<`, 'g'))].map((m) => m[1].trim());
  // Kendini kapatan <x:CompanyTaxCode/> da sayılır (boş değer = ret).
  const selfClosed = new RegExp(`<${PFX}CompanyTaxCode\\b[^>]*/>`).test(body);
  if (selfClosed) return { ok: false, reason: 'boş CompanyTaxCode' };
  if (raw.length === 0 && !NO_COMPANY_OPS.has(op)) return { ok: false, reason: 'CompanyTaxCode yok' };
  for (const v of raw) {
    if (!/^\d{10,11}$/.test(v)) return { ok: false, reason: 'CompanyTaxCode biçimi geçersiz' };
    if (!allowedVkn.has(v)) return { ok: false, reason: `izinsiz VKN: ${v}` };
  }
  return { ok: true, op, vkns: raw };
}
