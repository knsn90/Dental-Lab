// Ekstrede KDV ayrımı — kullanıcı: "bazı müşteriler faturalara tek tek bakmadığı için
// KDV'nin fiyatın içinde olduğunu anlamıyor; KDV'ler ayrı yazılsın, sonda toplansın".
// Fatura toplamı = KDV hariç (subtotal) + KDV (tax_amount) — canlı veride 68/68 doğrulandı.
// Saf yardımcı — içe aktarma yok (node --test doğrudan çalıştırır).

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Ekstrede `amount` olarak görünen fatura tutarının KDV payı (baz paraya çevrilmişse oransal). */
export function vatPortion(inv: { total: number | null; tax_amount: number | null }, amount: number): number {
  const total = Number(inv.total) || 0;
  const tax = Number(inv.tax_amount) || 0;
  if (total <= 0 || tax <= 0) return 0;
  return r2((Number(amount) || 0) * tax / total);
}

/** Fatura satırlarının KDV hariç / KDV / genel toplamı (tahsilat satırları sayılmaz). */
export function statementVatSummary(
  lines: { type: 'invoice' | 'payment'; debit: number; tax?: number | null }[],
): { net: number; tax: number; total: number } {
  let total = 0, tax = 0;
  for (const l of lines) {
    if (l.type !== 'invoice') continue;
    total += Number(l.debit) || 0;
    tax += Number(l.tax) || 0;
  }
  return { net: r2(total - tax), tax: r2(tax), total: r2(total) };
}

/** Çok para birimli ekstre (klinik paneli): döküm para birimine göre AYRI — asla toplanmaz. */
export function statementVatByCurrency(
  lines: { type: 'invoice' | 'payment'; debit: number; tax?: number | null; currency: string }[],
): { currency: string; net: number; tax: number; total: number }[] {
  const order: string[] = [];
  const groups: Record<string, { type: 'invoice' | 'payment'; debit: number; tax?: number | null }[]> = {};
  for (const l of lines) {
    if (l.type !== 'invoice') continue;
    if (!groups[l.currency]) { groups[l.currency] = []; order.push(l.currency); }
    groups[l.currency].push(l);
  }
  return order.map(c => ({ currency: c, ...statementVatSummary(groups[c]) }));
}
