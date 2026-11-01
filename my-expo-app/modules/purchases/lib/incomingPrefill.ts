// Gelen e-fatura (Luca) → Alış Faturası formu ön dolumu. Saf — test: incomingPrefill.test.mts
//
// e-Fatura yapılandırılmış veri verir (OCR tahmini yok): başlık birebir, kalemler
// iskonto sonrası NET birim fiyatla gelir → alış faturası toplamı e-faturayla aynı.
// Stokta aynı adlı kalem varsa satır ona bağlanır (sarf); yoksa "gözden geçir"
// işaretlenir — hizmet/kargo/kontör gibi kalemler kullanıcı seçmeden stoğa girmez.

export interface IncomingLine {
  name: string; quantity: number; unit: string; unitCode: string | null;
  unitPrice: number; netUnitPrice: number; lineNet: number; discount: number; vatRate: number; vatAmount: number;
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
  lines: IncomingLine[];
}

/** PDF'i iki platformda aynı yoldan arşivlemek için File benzeri sarmalayıcı. */
export interface PrefillPdf { name: string; type: string; arrayBuffer: () => Promise<ArrayBuffer> }

export interface PurchasePrefill {
  ettn: string;
  supplierName: string;
  supplierVkn: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  vatRate: number;
  notes: string;
  lines: Array<{ name: string; quantity: number; unit: string; unitPrice: number; vatRate: number }>;
  pdf: PrefillPdf | null;
}

export interface PrefillRow {
  id: string;
  item_id: string | null;
  item_name: string;
  quantity: string;
  unit: string;
  unit_price: string;
  vat_rate: string;
  item_kind?: 'consumable';
  needs_review?: boolean;
}

export const normName = (s: string | null | undefined) =>
  String(s ?? '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();

export function incomingToPrefill(inv: IncomingInvoice, pdf: PrefillPdf | null): PurchasePrefill {
  const rates = [...new Set(inv.lines.map((l) => l.vatRate))];
  return {
    ettn: inv.ettn,
    supplierName: inv.supplier.name,
    supplierVkn: inv.supplier.vkn,
    invoiceNumber: inv.number,
    invoiceDate: inv.date ?? new Date().toISOString().slice(0, 10),
    dueDate: inv.dueDate ?? '',
    currency: inv.currency || 'TRY',
    vatRate: rates.length === 1 ? rates[0] : 20,
    notes: `Luca e-Fatura ${inv.number}`,
    lines: inv.lines.map((l) => ({
      name: l.name, quantity: l.quantity, unit: l.unit, unitPrice: l.netUnitPrice, vatRate: l.vatRate,
    })),
    pdf,
  };
}

/** Önce VKN (suppliers.tax_no), sonra ad (büyük/küçük harf duyarsız). */
export function matchSupplier<T extends { id: string; name: string | null; tax_no?: string | null }>(
  list: T[], name: string, vkn: string,
): T | null {
  const v = vkn.replace(/\s+/g, '');
  if (v) {
    const byVkn = list.find((s) => (s.tax_no ?? '').replace(/\s+/g, '') === v);
    if (byVkn) return byVkn;
  }
  const n = normName(name);
  return (n && list.find((s) => normName(s.name) === n)) || null;
}

export function prefillLines(
  p: PurchasePrefill,
  stock: Array<{ id: string; name: string; unit?: string | null }>,
): PrefillRow[] {
  const byName = new Map(stock.map((s) => [normName(s.name), s]));
  return p.lines.map((l, i) => {
    const hit = byName.get(normName(l.name));
    return {
      id: `ef-${i}-${Math.random().toString(36).slice(2, 8)}`,
      item_id: hit?.id ?? null,
      item_name: hit?.name ?? l.name,
      quantity: String(l.quantity),
      unit: hit?.unit || l.unit,
      unit_price: String(l.unitPrice),
      vat_rate: String(l.vatRate),
      ...(hit ? { item_kind: 'consumable' as const, needs_review: false } : { needs_review: true }),
    };
  });
}

/** Luca gelen-fatura durumu → okunur etiket (Türkçe kaynak; ekranda autoT) + rozet tonu. */
export function incomingStatus(s: string | null | undefined): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  if (!s) return { label: '—', tone: 'neutral' };
  if (s === 'Onay_Bekliyor') return { label: 'Onay bekliyor', tone: 'warning' };
  if (/Onaylandi$|Kabul/i.test(s)) return { label: 'Onaylandı', tone: 'success' };
  if (/Iade/i.test(s)) return { label: 'İade edildi', tone: 'danger' };
  if (/Red/i.test(s)) return { label: 'Reddedildi', tone: 'danger' };
  return { label: s.replace(/_/g, ' '), tone: 'neutral' };
}
