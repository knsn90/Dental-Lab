// Ekstre dönem toplamları (saf — test: statementTotals.test.mts).
// Dönem filtreli ekstrede açılış bakiyesi, dönem başlangıcından ÖNCEKİ hareketlerin
// devridir; kapanış = açılış + dönem içi hareket. Eskiden PDF açılışı hep 0 basıyor,
// kapanışı yalnız dönem satırlarından hesaplıyordu → kliniğe yanlış borç gidiyordu.
// Tarihler 'YYYY-MM-DD'; dönem sınırları dahil. Tür/arama filtresi UYGULANMAMIŞ
// satırlar verilmeli (borç rakamı ekrandaki filtreye göre değişmesin).

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Satırın bakiyeye etkisi: borç − alacak; indirim satırında ayrıca indirim tutarı düşer
 *  (faturadaki `discount` yalnız bilgidir, bakiyeyi etkilemez). */
export function lineDelta(l: { type?: string; debit: number; credit: number; discount?: number }): number {
  const disc = l.type === 'discount' ? (Number(l.discount) || 0) : 0;
  return (Number(l.debit) || 0) - (Number(l.credit) || 0) - disc;
}

export function statementPeriodTotals(
  lines: ReadonlyArray<{ type?: string; date: string; debit: number; credit: number; discount?: number }>,
  from?: string,
  to?: string,
): { opening: number; closing: number } {
  let opening = 0;
  let period = 0;
  for (const l of lines) {
    const move = lineDelta(l);
    if (from && l.date < from) { opening += move; continue; }
    if (to && l.date > to) continue;
    period += move;
  }
  return { opening: round2(opening), closing: round2(opening + period) };
}
