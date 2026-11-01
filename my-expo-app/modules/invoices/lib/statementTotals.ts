// Ekstre dönem toplamları (saf — test: statementTotals.test.mts).
// Dönem filtreli ekstrede açılış bakiyesi, dönem başlangıcından ÖNCEKİ hareketlerin
// devridir; kapanış = açılış + dönem içi hareket. Eskiden PDF açılışı hep 0 basıyor,
// kapanışı yalnız dönem satırlarından hesaplıyordu → kliniğe yanlış borç gidiyordu.
// Tarihler 'YYYY-MM-DD'; dönem sınırları dahil. Tür/arama filtresi UYGULANMAMIŞ
// satırlar verilmeli (borç rakamı ekrandaki filtreye göre değişmesin).

const round2 = (n: number) => Math.round(n * 100) / 100;

export function statementPeriodTotals(
  lines: ReadonlyArray<{ date: string; debit: number; credit: number }>,
  from?: string,
  to?: string,
): { opening: number; closing: number } {
  let opening = 0;
  let period = 0;
  for (const l of lines) {
    const move = (Number(l.debit) || 0) - (Number(l.credit) || 0);
    if (from && l.date < from) { opening += move; continue; }
    if (to && l.date > to) continue;
    period += move;
  }
  return { opening: round2(opening), closing: round2(opening + period) };
}
