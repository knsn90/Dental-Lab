// supabase/functions/_shared/lucaMerge.ts
//
// Toplu e-Fatura: bir kliniğin birden çok Siman faturası → TEK Luca faturası.
// Siman her teslim edilen siparişe kendi faturasını açar; resmi e-fatura ise çoğu
// zaman dönem sonunda klinik başına tek kesilir. Bu modül hangi faturaların
// birleşebileceğini doğrular ve buildLucaInput'a verilecek birleşik faturayı kurar.
// Aynı kural "Luca'da zaten kesildi" bağlamasında da kullanılır.
// Saf (I/O yok). Testler: lucaMerge.test.ts

import { itemNet, DISCOUNT_BALANCE_ERROR, type DbInvoice, type DbItem } from './lucaInvoice.ts';
import { balanceDiscountShares } from './lucaDiscountBalance.ts';
import { computeTotals } from './luca.ts';

export interface MergeRow {
  id: string;
  lab_id: string;
  clinic_id: string | null;
  invoice_number: string;
  status: string;
  issue_date: string;
  currency: string | null;
  tax_rate: number | string | null;
  total: number | string | null;
  /** Fatura altı indirim — yalnız bu faturanın kalemlerine dağıtılır. */
  discount_amount?: number | string | null;
  efatura_uuid: string | null;
  efatura_status: string | null;
  notes: string | null;
  /** Faturanın siparişleri (invoice_orders → work_orders.order_number) */
  order_numbers: string[];
  items: Array<DbItem & { sort_order?: number | null }>;
}

/** Tek seferde birleştirilebilecek en çok fatura (Luca isteği + önizleme okunabilirliği). */
export const MERGE_MAX = 200;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;

/** Önizleme jetonunun bağlandığı kimlik: fatura kümesi (sıra/tekrar önemsiz). */
export function mergeKey(ids: string[]): string {
  return `merge:${[...new Set(ids)].sort().join(',')}`;
}

export function isEttn(s: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s ?? '').trim());
}

/**
 * ETTN'si olan fatura Luca'da VAR demektir → durumu ne olursa olsun (hata/iptal dahil)
 * bir daha toplu e-faturaya giremez (kullanıcı kuralı 2026-10-21). Yalnız Luca'ya hiç
 * ulaşmamış gönderim hatası (ETTN yok) yeniden denenebilir.
 */
const alreadyIssued = (r: MergeRow) => !!r.efatura_uuid;

export function validateMergeSet(
  rows: MergeRow[],
  requestedIds: string[],
  labId: string,
): { ok: true; clinicId: string; currency: string; promoteIds: string[] } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const ids = [...new Set(requestedIds.filter(Boolean))];
  if (!ids.length) return fail('En az bir fatura seçmelisiniz');
  if (ids.length > MERGE_MAX) return fail(`Tek e-faturada birleştirilebilecek en çok fatura sayısı: ${MERGE_MAX}`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (ids.some((id) => !byId.has(id))) return fail('Seçilen faturalardan biri bulunamadı');
  const set = ids.map((id) => byId.get(id)!);

  if (set.some((r) => r.lab_id !== labId)) return fail('Seçilen faturalardan biri sizin laboratuvarınıza ait değil');
  if (set.some((r) => !r.clinic_id)) return fail('Kliniği olmayan fatura toplu e-faturaya eklenemez');
  const clinicId = set[0].clinic_id!;
  if (set.some((r) => r.clinic_id !== clinicId)) return fail('Tüm faturalar aynı kliniğe ait olmalı');

  for (const r of set) {
    if (r.status === 'iptal') return fail(`İptal edilmiş fatura toplu e-faturaya eklenemez: ${r.invoice_number}`);
    if (alreadyIssued(r)) return fail(`Bu fatura zaten e-faturalı: ${r.invoice_number}`);
    if (num(r.total) <= 0) return fail(`Tutarı 0 olan fatura eklenemez: ${r.invoice_number}`);
  }
  const currency = (set[0].currency ?? 'TRY').toUpperCase();
  if (set.some((r) => (r.currency ?? 'TRY').toUpperCase() !== currency)) {
    return fail('Faturalar farklı para birimlerinde — tek e-faturada birleştirilemez');
  }
  return { ok: true, clinicId, currency, promoteIds: set.filter((r) => r.status === 'taslak').map((r) => r.id) };
}

/** e-Fatura notunda (Siman fatura no: …) tek tek yazılacak en çok fatura; fazlası özetlenir. */
const NOTE_LIST_MAX = 10;

/**
 * Birleşik fatura: kalemler fatura tarihi → no → kalem sırasıyla. Ürün adı
 * DEĞİŞMEZ (Luca ürün kartı adın kodundan bağlanır — önek her siparişe yeni kart
 * açardı); sipariş numarası satırın açıklamasına (Luca "Açıklama" sütunu) yazılır.
 * KDV oranı kendi faturasından gelir. Fatura no alanı e-fatura notuna
 * "Siman fatura no: …" olarak düşer (çok faturada ilk … son özeti).
 */
export function mergeInvoices(rows: MergeRow[], issueDate: string): DbInvoice {
  const sorted = [...rows].sort((a, b) =>
    a.issue_date.localeCompare(b.issue_date) || a.invoice_number.localeCompare(b.invoice_number));
  let discountedSources = 0;
  let discountFailed = false;
  const items: DbItem[] = sorted.flatMap((r) => {
    const tag = r.order_numbers[0] ?? r.invoice_number;
    const sortedItems = [...r.items].sort((a, b) => num(a.sort_order) - num(b.sort_order));
    // Fatura altı indirim yalnız KENDİ faturasının kalemlerine (net oranında) yazılır:
    // pay net_total'dan düşer → Luca kalem iskontosu = brüt − (net − pay).
    const rowDiscount = num(r.discount_amount);
    let shares: number[] | null = null;
    if (rowDiscount > 0) {
      discountedSources++;
      // KDV yuvarlaması faturanın KENDİ DB toplamıyla eşleşecek biçimde dengelenir (fatura başına).
      const b = balanceDiscountShares(sortedItems.map(itemNet), rowDiscount, num(r.tax_rate));
      if (b.ok) {
        shares = b.shares;
        // Kaynak bazlı kontrol: bu faturanın kendi kalemleri (paylarla) kendi DB toplamına KURUŞU KURUŞUNA
        // eşit çıkmalı; yoksa sapma birleşik toleransın içinde gizlenebilir. (Liste fiyatlı kalemde de satır
        // net'i aynıdır — buildLucaInput yalnız brütü/iskontoyu liste fiyatından kurar — bu yüzden kontrol değişmez.)
        const own = computeTotals(sortedItems.map((it, i) => {
          const q = num(it.quantity);
          const up = num(it.unit_price);
          const gross = num(it.total) || r2(q * up);
          const d = r2(gross - r2(itemNet(it) - shares![i]));
          return { code: 'x', name: 'x', quantity: q, unitPrice: up, vatRate: num(r.tax_rate), discountAmount: d > 0 ? d : 0 };
        }));
        if (Math.abs(own.payable - num(r.total)) >= 0.005) discountFailed = true;
      } else discountFailed = true;
    }
    return sortedItems
      .map((it, i) => {
        const share = shares?.[i] ?? 0;
        return {
          description: it.description,
          line_note: tag,
          quantity: it.quantity,
          unit_price: it.unit_price,
          total: it.total,
          net_total: share > 0 ? r2(itemNet(it) - share) : it.net_total,
          vat_rate: num(r.tax_rate),
          // Gösterim alanları (Görev 17): buildLucaInput liste fiyatını PriceAmount yapar; satır net'i aynı kalır.
          ...(it.list_unit_price != null || it.list_discount_pct != null
            ? { list_unit_price: it.list_unit_price, list_discount_pct: it.list_discount_pct }
            : {}),
        };
      });
  });
  return {
    id: sorted[0].id,
    invoice_number: sorted.length <= NOTE_LIST_MAX
      ? sorted.map((r) => r.invoice_number).join(', ')
      : `${sorted[0].invoice_number} … ${sorted[sorted.length - 1].invoice_number} (${sorted.length} fatura)`,
    issue_date: issueDate,
    currency: sorted[0].currency,
    tax_rate: null,
    subtotal: null,
    tax_amount: null,
    total: r2(sorted.reduce((a, r) => a + num(r.total), 0)),
    notes: null,
    ...(discountedSources > 0 ? { discount_tolerance: 0.005 + (sorted.length - discountedSources) * 0.01 } : {}),
    ...(discountFailed ? { discount_error: DISCOUNT_BALANCE_ERROR } : {}),
    items,
  };
}
