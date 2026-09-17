/**
 * İş günü hesabı — hafta sonu (Cumartesi/Pazar) sayılmaz.
 *
 * Teslim tarihi taahhüdü takvim günüyle verilince hafta sonuna denk gelen işler
 * fiilen 2 gün eksik üretim süresiyle sözleşiliyordu. Lab yalnız iş günü
 * çalıştığı için en erken teslim tarihi de iş günü üzerinden hesaplanır.
 *
 * NOT: Resmi tatiller BURADA hesaba katılmaz (yalnız hafta sonu). İK modülünde
 * ayrı bir resmi tatil listesi var; gerekirse buraya o da bağlanabilir.
 */

/** Cumartesi (6) ya da Pazar (0) mı? */
export function isWeekend(d: Date): boolean {
  const g = d.getDay();
  return g === 0 || g === 6;
}

/**
 * `from` tarihine `days` İŞ GÜNÜ ekler ve günün başına sabitler.
 * Sonuç her zaman bir iş gününe denk gelir (0 gün istense bile hafta sonuna
 * düşmez), böylece "en erken teslim" hiçbir zaman Cumartesi/Pazar çıkmaz.
 */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  let left = Math.max(0, Math.floor(days));
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d)) left -= 1;
  }
  while (isWeekend(d)) d.setDate(d.getDate() + 1);
  return d;
}
