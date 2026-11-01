// Ekstrede revizyon faturası notu — kullanıcı: "revize işin faturası, hata bizden olduğu için 0 yazılmış ama
// ekstrede revize olduğu belli değil". Saf yardımcı — içe aktarma yok (node --test doğrudan çalıştırır).
// Çeviri çağıran tarafta: `tr` (autoT) yalnız metin parçalarına uygulanır, sipariş numarası çevrilmez.

export interface RevisionInfo {
  /** Asıl siparişin numarası (work_orders.revision_of_id → order_number); revizyon değilse boş */
  revisionOf?: string | null;
  /** 'lab' (garanti, fiyatlar 0) · 'client' (ücretli) */
  revisionResponsible?: string | null;
}

/** "Asıl sipariş NEX-… · Lab kaynaklı, ücretsiz" — revizyon değilse null */
export function revisionDetail(r: RevisionInfo, debit: number, tr: (s: string) => string = (s) => s): string | null {
  if (!r.revisionOf) return null;
  const parts = [`${tr('Asıl sipariş')} ${r.revisionOf}`];
  if (r.revisionResponsible === 'lab') parts.push(tr((Number(debit) || 0) === 0 ? 'Lab kaynaklı, ücretsiz' : 'Lab kaynaklı'));
  else if (r.revisionResponsible === 'client') parts.push(tr('Hekim kaynaklı'));
  return parts.join(' · ');
}
