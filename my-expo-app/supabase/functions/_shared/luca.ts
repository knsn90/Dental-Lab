// supabase/functions/_shared/luca.ts
//
// TÜRMOB Luca e-fatura — SOAP istek kurucu + yanıt çözücü (saf, I/O yok).
// Testler: luca.test.ts (`node --test`). Çağrılar infra/luca-proxy üzerinden gider.
//
// ⚠ WCF DataContract alanları ŞEMA SIRASINDA (bayt-sıralı alfabetik) bekler;
// sırası kayan alan hata vermeden boş okunur. `node()` anahtarları bu yüzden
// her zaman sıralar — Luca'nın kendi örnekleri bile bu sırayı bozuyor.
// Tutarlar: satır LineExtensionAmount = adet×fiyat − iskonto (net),
// TotalLineExtensionAmount = Σ net, TotalDiscountAmount = Σ iskonto (bilgi).

export type LucaKind = 'e_fatura' | 'e_arsiv';
export type LucaService = 'InvoiceService' | 'AddressBookService';

export interface LucaParty {
  taxCode: string;
  name: string;
  taxOffice?: string | null;
  street?: string | null;
  buildingNumber?: string | null;
  city?: string | null;
  town?: string | null;
  postalCode?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface LucaReceiver extends LucaParty {
  /** e-Fatura alıcısının GİB posta kutusu (urn:mail:…pk@…) — GetTaxPayer'dan */
  inboxTag?: string | null;
}

export interface LucaLine {
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  discountAmount?: number;
  /** UN/ECE birim kodu — varsayılan C62 (adet) */
  unit?: string;
  note?: string | null;
}

export interface LucaInvoiceInput {
  kind: LucaKind;
  /** Bizim tarafın benzersiz kodu (fatura uuid'i) — Luca her yeni faturada yeni ister */
  externalCode: string;
  /** YYYY-MM-DD */
  issueDate: string;
  currency: string;
  /** TRY dışı para biriminde zorunlu: 1 birim = ? TRY */
  crossRate?: number;
  scenario?: 'TEMELFATURA' | 'TICARIFATURA';
  seller: LucaParty;
  receiver: LucaReceiver;
  lines: LucaLine[];
  notes?: string[];
}

export interface LucaEnvelope {
  service: LucaService;
  op: string;
  soapAction: string;
  body: string;
}

const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
const NS_MODEL = 'http://schemas.datacontract.org/2004/07/EInvoice.Service.Model';
const NS_ARR = 'http://schemas.microsoft.com/2003/10/Serialization/Arrays';

// ─── Tutarlar ─────────────────────────────────────────────────────────────
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeTotals(lines: LucaLine[]) {
  const out = lines.map((l) => {
    const gross = r2(l.quantity * l.unitPrice);
    const discount = r2(l.discountAmount ?? 0);
    const lineExtension = r2(gross - discount);
    const vat = r2((lineExtension * l.vatRate) / 100);
    return { gross, discount, lineExtension, vat };
  });
  const sum = (k: 'discount' | 'lineExtension' | 'vat') => r2(out.reduce((a, x) => a + x[k], 0));
  const lineExtension = sum('lineExtension');
  const vat = sum('vat');
  const taxInclusive = r2(lineExtension + vat);
  return { lines: out, lineExtension, discount: sum('discount'), vat, taxInclusive, payable: taxInclusive };
}

// ─── XML yazıcı ───────────────────────────────────────────────────────────
const LIST = Symbol('list');
const STRINGS = Symbol('strings');
type Fields = Record<string, unknown>;
type ListVal = { [LIST]: string; items: Fields[] };
type StringsVal = { [STRINGS]: string[] };

const listOf = (item: string, items: Fields[]): ListVal => ({ [LIST]: item, items });
const strings = (items: string[]): StringsVal => ({ [STRINGS]: items });

export function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const ordinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function value(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'object') {
    if (LIST in (v as object)) {
      const l = v as ListVal;
      return l.items.map((it) => `<ein:${l[LIST]}>${node(it)}</ein:${l[LIST]}>`).join('');
    }
    if (STRINGS in (v as object)) {
      return (v as StringsVal)[STRINGS].map((s) => `<arr:string>${xmlEscape(s)}</arr:string>`).join('');
    }
    return node(v as Fields);
  }
  return xmlEscape(String(v));
}

/** Alanları şema (bayt) sırasında yazar; boş/undefined alanı atlar. */
function node(fields: Fields): string {
  return Object.keys(fields)
    .sort(ordinal)
    .map((k) => {
      const inner = value(fields[k]);
      return inner === null ? '' : `<ein:${k}>${inner}</ein:${k}>`;
    })
    .join('');
}

function envelope(service: LucaService, op: string, request: Fields): LucaEnvelope {
  const body =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${NS_SOAP}" xmlns:tem="http://tempuri.org/" xmlns:ein="${NS_MODEL}" xmlns:arr="${NS_ARR}">` +
    `<soapenv:Header/><soapenv:Body><tem:${op}><tem:request>${node(request)}</tem:request></tem:${op}></soapenv:Body></soapenv:Envelope>`;
  return { service, op, soapAction: `http://tempuri.org/I${service}/${op}`, body };
}

// ─── Biçimleyiciler ───────────────────────────────────────────────────────
const amt = (n: number) => r2(n).toFixed(2);
const qty = (n: number) => String(Number(n.toFixed(4)));
const rate = (n: number) => String(Number(n.toFixed(6)));
const digits = (s?: string | null) => (s && /^\d+$/.test(s.trim()) ? s.trim() : undefined);

function address(p: LucaParty): Fields {
  return {
    BoulevardAveneuStreetName: p.street,
    BuildingNumber: p.buildingNumber,
    CityName: p.city,
    EMail: p.email,
    PostalCode: digits(p.postalCode),
    TaxOfficeName: p.taxOffice,
    TelephoneNumber: p.phone,
    TownName: p.town,
  };
}

// ─── Fatura gönderimi ─────────────────────────────────────────────────────
export function buildSendEnvelope(inv: LucaInvoiceInput): LucaEnvelope {
  if (!inv.lines.length) throw new Error('Faturada kalem yok');
  const currency = inv.currency.toUpperCase();
  const foreign = currency !== 'TRY';
  if (foreign && !(inv.crossRate && inv.crossRate > 0)) throw new Error(`${currency} fatura için TRY kuru (crossRate) gerekli`);
  if (inv.kind === 'e_fatura' && !inv.receiver.inboxTag) throw new Error('e-Fatura alıcısının posta kutusu (inboxTag) yok');

  const t = computeTotals(inv.lines);
  const details = inv.lines.map((l, i) => {
    const c = t.lines[i];
    return {
      CurrencyCode: currency,
      DiscountAmount: amt(c.discount),
      DiscountRate: c.gross > 0 ? rate(r2((c.discount / c.gross) * 100)) : '0',
      LineExtensionAmount: amt(c.lineExtension),
      Note: l.note,
      Product: {
        ExternalProductCode: l.code,
        MeasureUnit: l.unit ?? 'C62',
        ProductCode: l.code,
        ProductName: l.name,
        UnitPrice: rate(l.unitPrice),
      },
      Quantity: qty(l.quantity),
      VATAmount: amt(c.vat),
      VATRate: amt(l.vatRate),
    };
  });

  const isArchive = inv.kind === 'e_arsiv';
  const common: Fields = {
    CompanyBranchAddress: address(inv.seller),
    CrossRate: foreign ? rate(inv.crossRate!) : undefined,
    CrossRateDate: foreign ? inv.issueDate : undefined,
    CurrencyCode: currency,
    InvoiceDate: inv.issueDate,
    InvoiceDetails: listOf(isArchive ? 'ArchiveInvoiceDetail' : 'InvoiceDetail', details),
    InvoiceType: 'SATIS',
    Notes: inv.notes?.length ? strings(inv.notes) : undefined,
    Receiver: {
      Address: address(inv.receiver),
      ReceiverName: inv.receiver.name,
      ReceiverTaxCode: inv.receiver.taxCode,
      RecipientType: isArchive ? undefined : 'NONE',
      // e-Arşiv: ELEKTRONIK gönderimde Luca alıcı e-postası ister; yoksa KAGIT.
      SendingType: isArchive ? (inv.receiver.email ? 'ELEKTRONIK' : 'KAGIT') : 'NONE',
    },
    ReceiverBranchAddress: address(inv.receiver),
    TotalDiscountAmount: amt(t.discount),
    TotalLineExtensionAmount: amt(t.lineExtension),
    TotalPayableAmount: amt(t.payable),
    TotalTaxInclusiveAmount: amt(t.taxInclusive),
    TotalVATAmount: amt(t.vat),
  };

  if (isArchive) {
    return envelope('InvoiceService', 'SendArchiveInvoice', {
      ArchiveInvoices: listOf('ArchiveInvoice', [{
        ...common,
        ExternalArchiveInvoiceCode: inv.externalCode,
        SendMailAutomatically: inv.receiver.email ? 'true' : 'false',
      }]),
      CompanyTaxCode: inv.seller.taxCode,
    });
  }
  return envelope('InvoiceService', 'SendInvoice', {
    CompanyTaxCode: inv.seller.taxCode,
    Invoices: listOf('Invoice', [{
      ...common,
      ExternalInvoiceCode: inv.externalCode,
      ReceiverInboxTag: inv.receiver.inboxTag,
      ScenarioType: inv.scenario ?? 'TEMELFATURA',
    }]),
  });
}

/** Alıcı e-Fatura mükellefi mi + posta kutuları */
export function buildGetTaxPayerEnvelope(taxCode: string): LucaEnvelope {
  return envelope('AddressBookService', 'GetTaxPayer', { TaxPayerTaxCode: taxCode });
}

/**
 * Faturayı ETTN ya da bizim kodumuzla bul (isteğe bağlı PDF ile). Varsayılan: giden.
 * Gelen faturalar (tedarikçilerin bize kestikleri): direction 'Incoming' + sayfalama.
 */
export function buildSearchEnvelope(
  kind: LucaKind,
  companyTaxCode: string,
  by: {
    ettn?: string; externalCode?: string; includePdf?: boolean;
    direction?: 'Outgoing' | 'Incoming'; page?: number; perPage?: number; includeDetail?: boolean;
  },
): LucaEnvelope {
  const resultSet = {
    IsAdditionalTaxIncluded: 'false',
    IsHtmlIncluded: 'false',
    IsInvoiceDetailIncluded: by.includeDetail ? 'true' : 'false',
    IsPDFIncluded: by.includePdf ? 'true' : 'false',
    IsXMLIncluded: 'false',
  };
  const paging = { PageNumber: String(by.page ?? 1), RecordsPerPage: String(by.perPage ?? 10) };
  if (kind === 'e_arsiv') {
    return envelope('InvoiceService', 'SearchArchiveInvoice', {
      CompanyTaxCode: companyTaxCode,
      Ettn: by.ettn,
      ExternalArchiveInvoiceCode: by.externalCode,
      PagingRequest: paging,
      ResultSet: resultSet,
    });
  }
  return envelope('InvoiceService', 'SearchInvoice', {
    CompanyTaxCode: companyTaxCode,
    Ettn: by.ettn,
    ExternalInvoiceCode: by.externalCode,
    InvoiceDirection: by.direction ?? 'Outgoing',
    PagingRequest: paging,
    ResultSet: resultSet,
  });
}

// ─── İmza (infra/luca-proxy/app/lib.mjs ile birebir) ─────────────────────
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function signLucaRequest(secret: string, ts: number, path: string, soapAction: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const bodyHash = hex(await crypto.subtle.digest('SHA-256', enc.encode(body)));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}\n${path}\n${soapAction}\n${bodyHash}`)));
}

// ─── Yanıt çözümleme (ad alanı önekinden bağımsız) ────────────────────────
function unescapeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function tagRe(tag: string, flags = '') {
  return new RegExp(`<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?(?<!/)>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`, flags);
}
function first(xml: string, tag: string): string | undefined {
  const m = tagRe(tag).exec(xml);
  return m ? unescapeXml(m[1].trim()) : undefined;
}
function all(xml: string, tag: string): string[] {
  return [...xml.matchAll(tagRe(tag, 'g'))].map((m) => unescapeXml(m[1].trim()));
}
function fault(xml: string): string | undefined {
  return first(xml, 'faultstring');
}

export function parseSendResponse(xml: string): { ok: true; ettn: string; invoiceNumber?: string } | { ok: false; error: string } {
  const f = fault(xml);
  if (f) return { ok: false, error: f };
  const result = first(xml, 'Result');
  const ettn = first(xml, 'Ettn');
  if (result === 'Success' && ettn) {
    const invoiceNumber = first(xml, 'InvoiceNumber') ?? first(xml, 'ArchiveInvoiceNumber');
    return invoiceNumber ? { ok: true, ettn, invoiceNumber } : { ok: true, ettn };
  }
  return { ok: false, error: first(xml, 'ErrorMessage') || (result === 'Success' ? 'Luca ETTN döndürmedi' : 'Luca işlemi reddetti') };
}

export function parseTaxPayerResponse(xml: string): { ok: true; registered: boolean; name?: string; inboxTags: string[] } | { ok: false; error: string } {
  const f = fault(xml);
  if (f) return { ok: false, error: f };
  if (first(xml, 'Result') !== 'Success') return { ok: false, error: first(xml, 'ErrorMessage') || 'Mükellef sorgusu başarısız' };
  const payer = first(xml, 'TaxPayer');
  if (!payer) return { ok: true, registered: false, inboxTags: [] };
  const inbox = first(payer, 'InboxTagList') ?? '';
  const rank = (t: string) => (/pk@/i.test(t) ? 0 : /gb@/i.test(t) ? 2 : 1);
  const inboxTags = all(inbox, 'string').sort((a, b) => rank(a) - rank(b));
  const name = first(payer, 'TaxPayerName');
  const out = { ok: true as const, registered: inboxTags.length > 0, inboxTags };
  return name ? { ...out, name, inboxTags } : out;
}

export function parseSearchResponse(xml: string):
  | { ok: true; found: boolean; status?: string; detailStatus?: string; reportStatus?: string; ettn?: string; invoiceNumber?: string; pdfBase64?: string }
  | { ok: false; error: string } {
  const f = fault(xml);
  if (f) return { ok: false, error: f };
  if (first(xml, 'Result') !== 'Success') return { ok: false, error: first(xml, 'ErrorMessage') || 'Arama başarısız' };
  const inv = first(xml, 'Invoice') ?? first(xml, 'ArchiveInvoice');
  if (!inv) return { ok: true, found: false };
  const out: { ok: true; found: true; [k: string]: unknown } = { ok: true, found: true };
  const set = (k: string, v: string | undefined) => { if (v) out[k] = v; };
  set('status', first(inv, 'Status'));
  set('detailStatus', first(inv, 'DetailStatus'));
  set('reportStatus', first(inv, 'ReportSendingStatus'));
  set('ettn', first(inv, 'ETTN'));
  set('invoiceNumber', first(inv, 'InvoiceNumber'));
  set('pdfBase64', first(inv, 'InvoicePdf'));
  return out as never;
}

// ─── Fatura listesi (gelen faturalar — alan keşfi) ────────────────────────
// Luca doküman paketi elde değil; gelen faturada hangi alanların döndüğü bilinmiyor.
// Her faturanın YAPRAK alanlarını (ilk geçen değer) ad→değer olarak döner; uzun
// değerler (PDF/XML base64) kısaltılır. Nil (`<x i:nil="true"/>`) alanlar atlanır.

const LEAF_RE = /<(?:[\w.-]+:)?([A-Za-z_][\w.-]*)(?:\s[^>]*)?>([^<]*)<\/(?:[\w.-]+:)?\1>/g;
const LONG_VALUE = 300;

function leaves(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of xml.matchAll(LEAF_RE)) {
    if (m[1] in out) continue;
    const v = unescapeXml(m[2].trim());
    out[m[1]] = v.length > LONG_VALUE ? `[${v.length} karakter]` : v;
  }
  return out;
}

export function parseInvoiceList(xml: string):
  | { ok: true; invoices: Record<string, string>[]; tags: string[]; meta: Record<string, string> }
  | { ok: false; error: string } {
  const f = fault(xml);
  if (f) return { ok: false, error: f };
  if (first(xml, 'Result') !== 'Success') return { ok: false, error: first(xml, 'ErrorMessage') || 'Arama başarısız' };
  const els = [...xml.matchAll(tagRe('(?:Invoice|ArchiveInvoice)', 'g'))].map((m) => m[0]);
  const invoices = els.map(leaves);
  const tags = [...new Set(invoices.flatMap((i) => Object.keys(i)))].sort();
  let rest = xml;
  for (const e of els) rest = rest.replace(e, '');
  return { ok: true, invoices, tags, meta: leaves(rest) };
}

/**
 * XML ana hattı — keşif için: her yaprak "Yol/Alt = değer" satırı. Kardeşler arasında
 * tekrarlayan etiketler sıra numarası alır (Line[0], Line[1]); nil/boş yapraklar atlanır.
 */
export function xmlOutline(xml: string, maxLines = 400): string[] {
  type N = { name: string; text: string; kids: N[] };
  const root: N = { name: '', text: '', kids: [] };
  const stack: N[] = [root];
  for (const t of xml.match(/<[^>]+>|[^<]+/g) ?? []) {
    if (t.startsWith('<?') || t.startsWith('<!')) continue;
    if (t.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    if (t.startsWith('<')) {
      if (t.endsWith('/>')) continue;
      const name = (/^<([^\s>]+)/.exec(t)?.[1] ?? '').replace(/^[^:]+:/, '');
      const n: N = { name, text: '', kids: [] };
      stack[stack.length - 1].kids.push(n);
      stack.push(n);
      continue;
    }
    stack[stack.length - 1].text += t;
  }
  const out: string[] = [];
  const walk = (n: N, path: string) => {
    if (out.length >= maxLines) return;
    if (!n.kids.length) {
      const v = unescapeXml(n.text.trim());
      if (v) out.push(`${path} = ${v.length > LONG_VALUE ? `[${v.length} karakter]` : v}`);
      return;
    }
    const counts = new Map<string, number>();
    for (const k of n.kids) counts.set(k.name, (counts.get(k.name) ?? 0) + 1);
    const seen = new Map<string, number>();
    for (const k of n.kids) {
      const i = seen.get(k.name) ?? 0;
      seen.set(k.name, i + 1);
      const seg = (counts.get(k.name) ?? 0) > 1 ? `${k.name}[${i}]` : k.name;
      walk(k, path ? `${path}/${seg}` : seg);
    }
  };
  walk(root, '');
  return out;
}

// ─── Gelen fatura (tedarikçinin bize kestiği) → alış faturası girdisi ───────
// Alan adları 2026-10-21 canlı keşifle doğrulandı (InvoiceDirection=Incoming,
// IsInvoiceDetailIncluded=true). Gelen kayıtta Luca karşı tarafı (TEDARİKÇİ)
// "Receiver" altında verir.

const UNIT_CODES: Record<string, string> = {
  C62: 'adet', NIU: 'adet', H87: 'adet', EA: 'adet',
  KGM: 'kg', GRM: 'g', LTR: 'lt', MLT: 'ml', MTR: 'm', CMT: 'cm', MTK: 'm²',
  BX: 'kutu', PA: 'paket', PK: 'paket', SET: 'set', PR: 'çift', HUR: 'saat', DAY: 'gün',
};

export function unitFromCode(code?: string | null): string {
  return UNIT_CODES[String(code ?? '').trim().toUpperCase()] ?? 'adet';
}

export interface IncomingInvoice {
  ettn: string;
  number: string;
  date: string | null;
  dueDate: string | null;
  currency: string;
  crossRate: number | null;
  supplier: { name: string; vkn: string };
  scenario: string | null;
  status: string | null;
  totals: { net: number; discount: number; vat: number; payable: number };
  notes: string[];
  lines: Array<{
    name: string; quantity: number; unit: string; unitCode: string | null;
    unitPrice: number; netUnitPrice: number; lineNet: number; discount: number; vatRate: number; vatAmount: number;
  }>;
}

const numOf = (s?: string) => { const n = Number(s); return Number.isFinite(n) ? n : 0; };
/** "2026-10-21T00:00:00" → "2026-10-21"; boş/0001 yılı → null */
const dayOf = (s?: string) => (s && !s.startsWith('0001') ? s.slice(0, 10) : null);

export function parseIncomingInvoice(xml: string): IncomingInvoice | null {
  const inv = /<(?:[\w.-]+:)?Invoice(?:\s[^>]*)?>[\s\S]*?<\/(?:[\w.-]+:)?Invoice>/.exec(xml)?.[0];
  if (!inv) return null;
  const detailsBlock = /<(?:[\w.-]+:)?InvoiceDetails(?:\s[^>]*)?>[\s\S]*?<\/(?:[\w.-]+:)?InvoiceDetails>/.exec(inv)?.[0] ?? '';
  const head = detailsBlock ? inv.replace(detailsBlock, '') : inv;
  const notesBlock = first(head, 'Notes') !== undefined
    ? (/<(?:[\w.-]+:)?Notes(?:\s[^>]*)?>[\s\S]*?<\/(?:[\w.-]+:)?Notes>/.exec(head)?.[0] ?? '') : '';
  const cross = numOf(first(head, 'CrossRate'));
  const lines = [...detailsBlock.matchAll(tagRe('InvoiceDetail', 'g'))].map((m) => {
    const d = m[1];
    const quantity = numOf(first(d, 'Quantity'));
    const lineNet = numOf(first(d, 'LineExtensionAmount'));
    const unitCode = first(d, 'MeasureUnit') ?? null;
    return {
      name: first(d, 'ProductName') ?? '',
      quantity,
      unit: unitFromCode(unitCode),
      unitCode,
      unitPrice: numOf(first(d, 'UnitPrice')),
      netUnitPrice: quantity > 0 ? Math.round((lineNet / quantity) * 1e6) / 1e6 : 0,
      lineNet,
      discount: numOf(first(d, 'DiscountAmount')),
      vatRate: numOf(first(d, 'VATRate')),
      vatAmount: numOf(first(d, 'VATAmount')),
    };
  });
  return {
    ettn: (first(head, 'ETTN') ?? '').toLowerCase(),
    number: first(head, 'InvoiceNumber') ?? '',
    date: dayOf(first(head, 'InvoiceDate')),
    dueDate: dayOf(first(head, 'LastPaymentDate')),
    currency: (first(head, 'CurrencyCode') ?? 'TRY').toUpperCase(),
    crossRate: cross > 0 ? cross : null,
    supplier: { name: first(head, 'ReceiverName') ?? '', vkn: first(head, 'ReceiverTaxCode') ?? '' },
    scenario: first(head, 'ScenarioType') ?? null,
    status: first(head, 'Status') ?? null,
    totals: {
      net: numOf(first(head, 'TotalLineExtensionAmount')),
      discount: numOf(first(head, 'TotalDiscountAmount')),
      vat: numOf(first(head, 'TotalVATAmount')),
      payable: numOf(first(head, 'TotalPayableAmount')),
    },
    notes: notesBlock ? all(notesBlock, 'string').filter(Boolean) : [],
    lines,
  };
}

/** Liste satırı (ayrıntısız arama) → özet. */
export function incomingSummary(f: Record<string, string>) {
  return {
    ettn: String(f.ETTN ?? '').toLowerCase(),
    number: f.InvoiceNumber ?? '',
    date: dayOf(f.InvoiceDate),
    supplierName: f.ReceiverName ?? '',
    supplierVkn: f.ReceiverTaxCode ?? '',
    currency: (f.CurrencyCode ?? 'TRY').toUpperCase(),
    payable: numOf(f.TotalPayableAmount),
    status: f.Status ?? null,
    scenario: f.ScenarioType ?? null,
  };
}
