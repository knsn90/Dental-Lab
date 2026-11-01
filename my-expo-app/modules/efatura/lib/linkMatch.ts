// Luca'da kesilmiş e-fatura ↔ Siman faturaları eşleştirmesi (saf — test: linkMatch.test.mts).
//
// "Luca'da kesildi" sekmesinde listeden bir Luca faturası seçilince: alıcı VKN'si →
// klinik, aynı para birimi ve Luca fatura tarihine KADAR düzenlenmiş e-faturasız
// faturalar önden seçilir. Kullanıcı seçimi değiştirebilir; tutar karşılaştırması
// eşleşmeyi gösterir. Bağlamayı sunucu yeniden doğrular (link).

export interface LinkCandidate {
  id: string;
  clinic_id: string;
  clinic_vkn: string | null;
  currency: string;
  issue_date: string;
  total: number;
}

const vknOf = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, '');

export function matchLucaInvoice(
  rows: LinkCandidate[],
  luca: { buyerVkn: string; currency: string; date: string | null },
): { ok: true; clinicId: string; currency: string; ids: string[] } | { ok: false; error: string } {
  const vkn = vknOf(luca.buyerVkn);
  const own = rows.filter((r) => vkn && vknOf(r.clinic_vkn) === vkn);
  if (!own.length) return { ok: false, error: 'Bu faturanın alıcısı Siman\'daki bir klinikle eşleşmedi' };
  // Aynı VKN'li birden çok klinik (nadir): en çok faturası olanı al.
  const byClinic = new Map<string, number>();
  for (const r of own) byClinic.set(r.clinic_id, (byClinic.get(r.clinic_id) ?? 0) + 1);
  const clinicId = [...byClinic.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const currency = (luca.currency || 'TRY').toUpperCase();
  const sameCur = own.filter((r) => r.clinic_id === clinicId && r.currency.toUpperCase() === currency);
  if (!sameCur.length) return { ok: false, error: 'Bu klinikte aynı para biriminde e-faturasız fatura yok' };
  const ids = sameCur
    .filter((r) => !luca.date || r.issue_date <= luca.date)
    .sort((a, b) => a.issue_date.localeCompare(b.issue_date))
    .map((r) => r.id);
  return { ok: true, clinicId, currency, ids };
}

/** Luca toplamı ile seçilen Siman faturaları toplamı — her fatura kendi KDV'sini yuvarladığı için fatura başına 1 kuruş. */
export function amountsMatch(lucaTotal: number, selectedTotal: number, count: number): boolean {
  return Math.abs(lucaTotal - selectedTotal) <= 0.01 * Math.max(1, count) + 1e-9;
}
