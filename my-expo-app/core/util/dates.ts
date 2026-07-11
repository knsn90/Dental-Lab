// Tarih yardımcıları — yerel gün (UTC kayması yok).
// toISOString().slice(0,10) UTC günü verir; TR'de 00:00-03:00 arası önceki güne düşer.

/** Yerel takvim gününü YYYY-MM-DD olarak döndürür. */
export function ymdLocal(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
