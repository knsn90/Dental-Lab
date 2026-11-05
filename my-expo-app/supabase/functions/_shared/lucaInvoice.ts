// supabase/functions/_shared/lucaInvoice.ts
//
// Siman faturası (DB satırları) → Luca girdisi, ve Luca durumu → efatura_status.
// Saf (I/O yok); efatura-luca edge function'ı kullanır. Testler: lucaInvoice.test.ts
//
// Resmi vergi belgesi olduğu için emin olunamayan her durumda GÖNDERMEZ ve
// kullanıcıya ne düzeltmesi gerektiğini söyler (mesajlar Türkçe; istemci autoT ile çevirir).

import { distributeDiscount } from './invoiceDiscount.ts';
import { computeTotals, type LucaInvoiceInput, type LucaKind, type LucaLine } from './luca.ts';

export interface DbItem {
  description: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  total: number | string | null;      // brüt (adet × fiyat)
  net_total: number | string | null;  // iskonto sonrası
  /** Satırın KDV oranı — yalnız birleştirilmiş (toplu) faturada; yoksa faturanın oranı. */
  vat_rate?: number | string | null;
  /** Satır açıklaması (Luca'da "Açıklama" sütunu) — toplu faturada sipariş no. */
  line_note?: string | null;
}

export interface DbInvoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  currency: string | null;
  tax_rate: number | string | null;
  subtotal: number | string | null;
  tax_amount: number | string | null;
  total: number | string | null;
  notes: string | null;
  /** Fatura altı indirim (fatura para biriminde); kalemlere net tutarları oranında dağıtılır. */
  discount_amount?: number | string | null;
  items: DbItem[];
}

export interface DbClinic {
  name: string;
  vkn: string | null;
  tax_office: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  efatura_alias: string | null;
}

export interface DbDoctor {
  full_name: string | null;
  tckn: string | null;
}

/**
 * Satıcı (lab) künyesi — labs tablosundan (Ayarlar → Genel → Fatura Bilgileri);
 * entegratörden bağımsız. vkn = labs.tax_number (VKN 10 / şahıs şirketi TCKN 11).
 */
export interface SellerConfig {
  vkn: string;
  tax_office: string;
  city: string;
  town: string;
  street: string;
  postal_code?: string | null;
  email?: string | null;
  phone?: string | null;
  scenario?: 'TEMELFATURA' | 'TICARIFATURA';
}

export type EFaturaStatus = 'sent' | 'accepted' | 'rejected' | 'cancelled' | 'error';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;
const blank = (s?: string | null) => !s || !s.trim();

/** Adres JSON'unda ulke ≠ TR ise o ülke kodu, değilse (TR / düz metin / eski kayıt) null. */
export function foreignCountry(address?: string | null): string | null {
  const s = String(address ?? '').trim();
  if (!s.startsWith('{')) return null;
  try {
    const u = String((JSON.parse(s) as Record<string, unknown>)?.ulke ?? '').trim().toUpperCase();
    return u && u !== 'TR' ? u : null;
  } catch {
    return null;
  }
}

/**
 * Klinik adresi → parçalar; biçim tutmazsa null. İki biçim:
 *   • Klinik formunun kaydettiği JSON: {"il","ilce","mahalle","sokak","bina_no","daire_no","posta_kodu"}
 *     (2026-10-21: tüm klinikler bu biçimde — eskiden metin sanılıp reddediliyordu)
 *   • Düz metin "…, İlçe / İl" (veya "… İlçe/İl")
 */
export function parseCityTown(address?: string | null): { street: string; town: string; city: string } | null {
  if (!address) return null;
  const s = address.trim();
  if (s.startsWith('{')) {
    try {
      const a = JSON.parse(s) as Record<string, unknown>;
      const str = (k: string) => String(a?.[k] ?? '').trim();
      const city = str('il');
      const town = str('ilce');
      if (!city || !town) return null;
      const bina = str('bina_no');
      const daire = str('daire_no');
      const road = [str('sokak'), bina ? `No: ${bina}` : '', daire ? `D: ${daire}` : ''].filter(Boolean).join(' ');
      const street = [str('mahalle'), road].filter(Boolean).join(', ');
      return { street, town, city };
    } catch {
      return null;
    }
  }
  if ((s.match(/\//g) ?? []).length !== 1) return null;
  const [leftRaw, rightRaw] = s.split('/');
  const city = rightRaw.trim();
  if (!city || city.includes(',')) return null;
  const left = leftRaw.trim();
  let street: string;
  let town: string;
  const comma = left.lastIndexOf(',');
  if (comma >= 0) {
    street = left.slice(0, comma).trim();
    town = left.slice(comma + 1).trim();
  } else {
    const words = left.split(/\s+/).filter(Boolean);
    town = words.pop() ?? '';
    street = words.join(' ');
  }
  return town ? { street, town, city } : null;
}

/** Açıklamadan kararlı ürün kodu (Luca ürün kartı bu koda bağlanır). FNV-1a 32 bit. */
export function productCode(description: string): string {
  const norm = description.trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR');
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `SMN-${h.toString(36).toUpperCase()}`;
}

// ─── Durum eşleme ─────────────────────────────────────────────────────────
const EF_ERR_STATUS = new Set(['Gib_Tarafinda_Hata_Olustu', 'Sistem_Hatasi', 'Uygulama_Yaniti_Hata_Aldi']);
const EF_REJECTED = new Set(['Reddedildi', 'Alici_Reddetti', 'Iade_Edildi', 'Alici_Iade_Etti']);
const EF_ACCEPTED = new Set(['Alici_Kabul_Etti', 'Otomatik_Alici_Kabul_Etti']);
const EF_OK_DETAIL = new Set([
  'Zarflanmadi', 'Zarf_Kuyruga_Eklendi', 'Zarf_Isleniyor', 'Zarf_Basariyla_Islendi',
  'Basariyla_Tamamlandi', 'Hedeften_Sistem_Yaniti_Gelmedi',
]);
const EA_REPORT_ERR = new Set(['Gib_Tarafinda_Hata_Olustu', 'Gibe_Gonderilirken_Sistem_Hatasi_Olustu']);

export function mapLucaStatus(
  kind: LucaKind,
  r: { status?: string; detailStatus?: string; reportStatus?: string },
  scenario?: string,
): { status: EFaturaStatus; error?: string } {
  const describe = (...parts: (string | undefined)[]) => `Luca: ${parts.filter(Boolean).join(' / ')}`;
  if (kind === 'e_arsiv') {
    if (r.status === 'Silindi') return { status: 'cancelled' };
    if (r.reportStatus && EA_REPORT_ERR.has(r.reportStatus)) return { status: 'error', error: describe(r.status, r.reportStatus) };
    if (r.status === 'Fatura_Olusturuldu') return { status: 'accepted' };
    return { status: 'sent' };
  }
  if (r.detailStatus === 'Fatura_Iptale_Konu_Edildi') return { status: 'cancelled' };
  if ((r.status && EF_ERR_STATUS.has(r.status)) || (r.detailStatus && !EF_OK_DETAIL.has(r.detailStatus))) {
    return { status: 'error', error: describe(r.status, r.detailStatus) };
  }
  if (r.status && EF_REJECTED.has(r.status)) return { status: 'rejected' };
  if (r.status && EF_ACCEPTED.has(r.status)) return { status: 'accepted' };
  if (r.detailStatus === 'Basariyla_Tamamlandi') return { status: scenario === 'TICARIFATURA' ? 'sent' : 'accepted' };
  return { status: 'sent' };
}

// ─── Fatura kurulumu ──────────────────────────────────────────────────────
export function buildLucaInput(args: {
  invoice: DbInvoice;
  clinic: DbClinic | null;
  doctor: DbDoctor | null;
  seller: SellerConfig;
  kind: LucaKind;
  /** Gönderen VKN: canlıda satıcı VKN'si, test ortamında Luca demo VKN'si */
  companyTaxCode: string;
  inboxTag?: string | null;
  crossRate?: number | null;
  /** Uygulama toplamıyla izin verilen sapma (varsayılan 0,01). Birleştirilmiş faturada
   *  her Siman faturası kendi KDV'sini yuvarladığı için fatura başına 1 kuruş. */
  totalTolerance?: number;
}): { ok: true; input: LucaInvoiceInput } | { ok: false; error: string } {
  const { invoice, clinic, doctor, seller, kind } = args;
  const fail = (error: string) => ({ ok: false as const, error });

  if (!invoice.items?.length) return fail('Faturada kalem yok');
  if (num(invoice.total) <= 0) return fail('Tutarı 0 olan fatura e-faturaya gönderilemez');
  const vatOf = (it: DbItem) => num(it.vat_rate ?? invoice.tax_rate);
  if (invoice.items.some((it) => vatOf(it) <= 0)) return fail('KDV oranı %0 olan fatura henüz gönderilemiyor (istisna kodu tanımlı değil)');

  if (!/^(\d{10}|\d{11})$/.test(seller.vkn?.trim() ?? '')) return fail('Lab VKN/TCKN geçersiz — Ayarlar → Genel → Fatura Bilgileri');
  if (blank(seller.tax_office) || blank(seller.street) || blank(seller.city) || blank(seller.town)) {
    return fail('Lab fatura bilgileri eksik — Ayarlar → Genel → Fatura Bilgileri');
  }

  // Yurt dışı klinik (adres JSON'unda ulke ≠ TR): yurt içi e-fatura/e-Arşiv değil ihracat faturası
  // gerekir (istisna kodu, döviz, gümrük) — henüz desteklenmiyor; yanlış belge kesilmesin.
  if (clinic && foreignCountry(clinic.address)) {
    return fail('Yurt dışı klinik — e-fatura yerine ihracat faturası gerekir (henüz desteklenmiyor)');
  }
  // Kliniği olan faturada alıcı HER ZAMAN klinik: VKN (şirket) ya da TCKN (şahıs hekim) zorunlu.
  // Eskiden VKN'siz klinik "nihai tüketici" (11111111111) e-Arşivi olarak kesiliyordu → yanlış belge.
  if (clinic) {
    const v = String(clinic.vkn ?? '').replace(/\s+/g, '');
    if (!v) return fail('Klinik vergi numarası eksik — klinik bilgilerine VKN (şirket) ya da TCKN (şahıs hekim) girin');
    if (!/^(\d{10}|\d{11})$/.test(v)) return fail('Klinik vergi numarası geçersiz — 10 haneli VKN ya da 11 haneli TCKN olmalı');
  }
  const corporate = !blank(clinic?.vkn);
  if (corporate && blank(clinic?.tax_office)) return fail('Klinik vergi dairesi eksik — klinik bilgilerinden ekleyin');
  const place = parseCityTown(clinic?.address);
  if (!place) return fail('Klinik adresinde il/ilçe bulunamadı — adresin sonunu "İlçe / İl" biçiminde yazın (ör. "…, Kadıköy / İstanbul")');
  if (kind === 'e_fatura' && blank(args.inboxTag)) return fail('Alıcının e-Fatura posta kutusu bulunamadı');

  const currency = (invoice.currency ?? 'TRY').toUpperCase();
  const foreign = currency !== 'TRY';
  if (foreign && !(args.crossRate && args.crossRate > 0)) return fail(`${currency} fatura için TCMB kuru bulunamadı`);

  // Fatura altı indirim: kalem net tutarları oranında dağıtılır; pay kalemin iskontosuna eklenir
  // (KDV tabanı = net − pay). Yoksa/0 ise bugünkü hesap aynen.
  const netOf = (it: DbItem) => {
    const gross = num(it.total) || r2(num(it.quantity) * num(it.unit_price));
    return it.net_total === null || it.net_total === undefined ? gross : num(it.net_total);
  };
  const invDiscount = num(invoice.discount_amount);
  const shares = invDiscount > 0
    ? distributeDiscount(invoice.items.map((it, i) => ({ key: String(i), net: netOf(it) })), invDiscount)
    : null;

  const lines: LucaLine[] = invoice.items.map((it, i) => {
    const quantity = num(it.quantity);
    const unitPrice = num(it.unit_price);
    const gross = num(it.total) || r2(quantity * unitPrice);
    const net = netOf(it) - (shares?.[String(i)] ?? 0);
    const discount = r2(gross - net);
    const name = (it.description ?? '').trim() || 'Hizmet';
    const line: LucaLine = { code: productCode(name), name, quantity, unitPrice, vatRate: vatOf(it), discountAmount: discount > 0 ? discount : 0 };
    return it.line_note?.trim() ? { ...line, note: it.line_note.trim() } : line;
  });

  const t = computeTotals(lines);
  if (Math.abs(r2(t.payable - num(invoice.total))) > (args.totalTolerance ?? 0.01) + 1e-9) {
    return fail(`Fatura toplamı (${num(invoice.total).toFixed(2)}) ile e-fatura hesaplaması (${t.payable.toFixed(2)}) uyuşmuyor`);
  }

  const receiverName = corporate
    ? clinic!.name
    : (doctor?.full_name?.trim() || clinic?.name || 'Nihai Tüketici');
  const receiverTax = corporate
    ? clinic!.vkn!.replace(/\s+/g, '')
    : (/^\d{11}$/.test(doctor?.tckn?.trim() ?? '') ? doctor!.tckn!.trim() : '11111111111');

  const input: LucaInvoiceInput = {
    kind,
    externalCode: invoice.id,
    issueDate: invoice.issue_date.slice(0, 10),
    currency,
    crossRate: foreign ? args.crossRate! : undefined,
    scenario: seller.scenario ?? 'TEMELFATURA',
    seller: {
      taxCode: args.companyTaxCode,
      name: '',
      taxOffice: seller.tax_office,
      street: seller.street,
      city: seller.city,
      town: seller.town,
      postalCode: seller.postal_code ?? null,
      email: seller.email ?? null,
      phone: seller.phone ?? null,
    },
    receiver: {
      taxCode: receiverTax,
      name: receiverName,
      taxOffice: corporate ? clinic!.tax_office : null,
      street: place.street || null,
      town: place.town,
      city: place.city,
      email: clinic?.email ?? null,
      phone: clinic?.phone ?? null,
      inboxTag: kind === 'e_fatura' ? args.inboxTag : null,
    },
    lines,
    notes: [`Siman fatura no: ${invoice.invoice_number}`, ...(blank(invoice.notes) ? [] : [invoice.notes!.trim()])],
  };
  return { ok: true, input };
}

// ─── Önizleme ─────────────────────────────────────────────────────────────
// Gönderilecek faturanın kullanıcıya gösterilen özeti. buildLucaInput'un
// ÇIKTISINDAN üretilir: önizlemede görülen ile Luca'ya giden aynı veridir
// (aynı satırlar, aynı computeTotals). Luca'nın taslak işlemi yok; "taslak →
// gör → gönder" adımı bu özetle Siman tarafında yapılır.

export interface LucaPreview {
  env: 'test' | 'prod';
  kind: LucaKind;
  /** Yalnız e-Fatura'da (TEMELFATURA / TICARIFATURA). */
  scenario: 'TEMELFATURA' | 'TICARIFATURA' | null;
  /** Yalnız e-Arşiv'de: alıcı e-postası varsa ELEKTRONIK, yoksa KAGIT. */
  sendingType: 'ELEKTRONIK' | 'KAGIT' | null;
  invoiceNumber: string;
  issueDate: string;
  currency: string;
  crossRate: number | null;
  seller: { name: string; taxCode: string; taxOffice: string; address: string };
  receiver: { name: string; taxCode: string; taxOffice: string | null; address: string; email: string | null; inboxTag: string | null };
  lines: Array<{ name: string; note?: string | null; quantity: number; unitPrice: number; discount: number; vatRate: number; net: number; vat: number }>;
  totals: { net: number; discount: number; vat: number; payable: number; payableTry: number | null };
  notes: string[];
}

const joinAddress = (street?: string | null, town?: string | null, city?: string | null) => {
  const place = [town, city].map((x) => (x ?? '').trim()).filter(Boolean).join(' / ');
  return [(street ?? '').trim(), place].filter(Boolean).join(', ');
};

export function buildLucaPreview(
  input: LucaInvoiceInput,
  meta: { env: 'test' | 'prod'; sellerName: string; invoiceNumber: string },
): LucaPreview {
  const t = computeTotals(input.lines);
  const isArchive = input.kind === 'e_arsiv';
  return {
    env: meta.env,
    kind: input.kind,
    scenario: isArchive ? null : (input.scenario ?? 'TEMELFATURA'),
    sendingType: isArchive ? (input.receiver.email ? 'ELEKTRONIK' : 'KAGIT') : null,
    invoiceNumber: meta.invoiceNumber,
    issueDate: input.issueDate,
    currency: input.currency,
    crossRate: input.crossRate ?? null,
    seller: {
      name: meta.sellerName,
      taxCode: input.seller.taxCode,
      taxOffice: input.seller.taxOffice ?? '',
      address: joinAddress(input.seller.street, input.seller.town, input.seller.city),
    },
    receiver: {
      name: input.receiver.name,
      taxCode: input.receiver.taxCode,
      taxOffice: input.receiver.taxOffice ?? null,
      address: joinAddress(input.receiver.street, input.receiver.town, input.receiver.city),
      email: input.receiver.email ?? null,
      inboxTag: input.receiver.inboxTag ?? null,
    },
    lines: input.lines.map((l, i) => ({
      name: l.name,
      ...(l.note ? { note: l.note } : {}),
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: t.lines[i].discount,
      vatRate: l.vatRate,
      net: t.lines[i].lineExtension,
      vat: t.lines[i].vat,
    })),
    totals: {
      net: t.lineExtension,
      discount: t.discount,
      vat: t.vat,
      payable: t.payable,
      payableTry: input.crossRate ? r2(t.payable * input.crossRate) : null,
    },
    notes: input.notes ?? [],
  };
}
