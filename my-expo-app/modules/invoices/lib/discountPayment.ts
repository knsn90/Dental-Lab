// Ekstre indirimi payları: payments satırı (payment_method='indirim', statement_discount_id dolu).
// Bunlar gerçek tahsilat DEĞİLDİR; tahsilat listelerinde/KPI'larda sayılmaz, geçmişte "Ekstre indirimi İND-n"
// olarak görünür ve düzenlenip silinemez (DB: SD_PAYMENT_LOCKED). Saf — test: discountPayment.test.mts.

export function isDiscountPayment(p: { payment_method?: string | null; statement_discount_id?: string | null }): boolean {
  return p.payment_method === 'indirim' || !!p.statement_discount_id;
}

/** notes içindeki "İND-n" numarası (büyük/küçük harf ve İ/I toleranslı); yoksa null. */
export function discountPaymentDocNo(notes: string | null | undefined): number | null {
  // Sol sınır lookbehind/\p{} olmadan: Hermes (iOS) eski sürümlerinde ikisi de modül yüklenirken patlayabilir.
  const m = /(?:^|[^A-Za-z0-9ÇĞİÖŞÜçğıöşüÂâÎîÛû])[İIiı]ND-(\d+)/i.exec(notes ?? '');
  return m ? Number(m[1]) : null;
}

/** "Ekstre indirimi<sep>İND-n"; numara bulunamazsa yalnız etiket. Düzeltme belgesi payı (notes tam "DZ-n",
 *  correctionDoc.isCorrectionShare ile aynı) "Düzeltme belgesi<sep>DZ-n" olur. Etiketler çağıranda autoT'den geçmiş olmalı. */
export function discountPaymentLabel(label: string, notes: string | null | undefined, sep = ' ', dzLabel = 'Düzeltme belgesi'): string {
  const dz = /^DZ-(\d+)$/.exec(notes ?? '');
  if (dz) return `${dzLabel}${sep}DZ-${dz[1]}`;
  const n = discountPaymentDocNo(notes);
  return n == null ? label : `${label}${sep}İND-${n}`;
}

/** Cari "Tahsil Edilen" = total_paid + unallocated_credit − statement_discount_total (indirim tahsilat değil). */
export function clinicCollected(b: {
  total_paid?: number | string | null;
  unallocated_credit?: number | string | null;
  statement_discount_total?: number | string | null;
}): number {
  const v = (Number(b.total_paid) || 0) + (Number(b.unallocated_credit) || 0) - (Number(b.statement_discount_total) || 0);
  return Math.max(0, v);
}
