// Tahsilat fişinin cari ekstredeki alacağı — kullanıcı: "fatura tutarları borç, ödeme alınınca toplam borçtan
// düşsün; faturalara bölmek mantıklı değil". Fiş ekstrede TEK satırdır; faturalara dağıtım arka planda kalır.
// Saf yardımcı — içe aktarma yok (node --test doğrudan çalıştırır).
//
// Ekstre para birimi başına yürür. Fişin o paradaki alacağı:
//   • bu paradaki faturalara dağıtılan tutar (faturanın KENDİ parasıyla — TL borcu TL ödeme düşer), +
//   • baz para birimi ekstresindeyse dağıtılmamış kalan alacak (total_base − allocated_base).
// Fişten gelen fatura-başı ödemeler ekstrede ayrıca yazılmaz (buildStatementLines receipt_id'lileri atlar).

export interface ReceiptForStatement {
  id: string;
  base_currency?: string | null;
  total_base: number | string;
  allocated_base: number | string;
}

export interface InvoiceForStatement {
  currency?: string | null;
  status?: string | null;
  payments?: { receipt_id?: string | null; amount: number | string }[] | null;
}

export function receiptCreditForCurrency(
  r: ReceiptForStatement,
  invoices: InvoiceForStatement[],
  ccy: string,
): number {
  let sum = 0;
  for (const inv of invoices) {
    if ((inv.currency || 'TRY') !== ccy || inv.status === 'iptal') continue;
    for (const p of inv.payments ?? []) {
      if (p.receipt_id === r.id) sum += Number(p.amount) || 0;
    }
  }
  if ((r.base_currency || '') === ccy) {
    sum += Math.max(0, (Number(r.total_base) || 0) - (Number(r.allocated_base) || 0));
  }
  return Math.round(sum * 100) / 100;
}

/**
 * Aynı tahsilat fişinden gelen fatura-başı ödemeleri (para birimi başına) tek satıra birleştirir;
 * fişsiz ödemeler olduğu gibi kalır. `merged` = birleşen ödeme sayısı (1 = tek ödeme).
 */
export function mergeReceiptPayments<
  T extends { id: string; receipt_id?: string | null; currency: string; amount: number; payment_date: string },
>(rows: T[]): (T & { merged: number })[] {
  const out: (T & { merged: number })[] = [];
  const byKey = new Map<string, T & { merged: number }>();
  for (const r of rows) {
    if (!r.receipt_id) { out.push({ ...r, merged: 1 }); continue; }
    const key = `${r.receipt_id}|${r.currency}`;
    const cur = byKey.get(key);
    if (cur) {
      cur.amount = Math.round((cur.amount + (Number(r.amount) || 0)) * 100) / 100;
      cur.merged += 1;
      if (r.payment_date < cur.payment_date) cur.payment_date = r.payment_date;
    } else {
      const row = { ...r, amount: Number(r.amount) || 0, merged: 1 };
      byKey.set(key, row);
      out.push(row);
    }
  }
  return out;
}

/** Makbuz numarası — makbuz fişi (buildReceiptVoucherHtml) ve ekstre aynı numarayı gösterir */
export function receiptVoucherNo(id: string): string {
  return String(id ?? '').split('-')[0].toUpperCase();
}

/** Tahsilatın yatırıldığı yer: seçilen Kasa/Banka hesabının adı; nakitte hesap seçilmediyse nakit kasa */
export function receiptDepositLabel(
  r: { payment_method?: string | null; account_label?: string | null },
  tr: (s: string) => string = (s) => s,
): string | null {
  if (r.account_label) return r.account_label;
  return r.payment_method === 'nakit' ? tr('Nakit Kasa') : null;
}
