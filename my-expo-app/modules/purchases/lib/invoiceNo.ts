// Fatura numarası karşılaştırma anahtarı (saf — test: invoiceNo.test.mts).
// Aynı tedarikçiden aynı faturanın iki kez girilmesini yakalamak için:
// " ftr 001 ", "FTR-001", "ftr/001" → "FTR001". Boş numara → '' (kontrol yapılmaz).
// tr büyük harfte "i" → "İ" olur ama "I" aynı kalır; numaralarda i/I/İ/ı tek harf (I) sayılır.

export function normalizeInvoiceNo(s: string | null | undefined): string {
  return String(s ?? '').replace(/[\s\-/._]+/g, '').toLocaleUpperCase('tr-TR').replace(/[İı]/g, 'I');
}

/** Veritabanı mükerrer alış faturası engeline takıldı mı (20261024120000 benzersiz indeksi)? */
export function isDuplicatePurchaseError(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && e.code === '23505' && /purchase_invoices_lab_supplier_no_uq/.test(e.message ?? '');
}
