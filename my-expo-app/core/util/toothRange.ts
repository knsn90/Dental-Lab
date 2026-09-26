/**
 * compactTeeth — diş numarası listesini ARALIK olarak kısaltır.
 *
 * NEDEN: şerit/iş etiketlerinde 18 diş tek tek yazılınca satırı dolduruyor ve
 * okunmuyordu ("11, 12, 13, 14, 15, 21, 22, 23, 32, 33, 34, 35, 36, 42, 43, 44, 45, 46").
 * FDI numaralandırmasında ardışıklık YALNIZ aynı çeyrek içinde anlamlıdır — 15 ile 21
 * komşu sayı olsa da farklı çenenin farklı yarısıdır, birleştirilmez.
 *
 *   [11,12,13,14,15,21,22,23]        → "11-15, 21-23"
 *   [16,17,24,25,26,31,41]           → "16-17, 24-26, 31, 41"
 *   [26,46]                          → "26, 46"
 */
export function compactTeeth(teeth: Array<number | string | null | undefined>): string {
  const nums = Array.from(
    new Set(
      teeth
        .map((t) => Number(t))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ).sort((a, b) => a - b);
  if (nums.length === 0) return '';

  const parts: string[] = [];
  let start = nums[0];
  let prev = nums[0];

  const flush = () => {
    const len = prev - start + 1;
    // İkili komşuluk "11, 12" olarak kalır: tire ancak 3+ dişte yer kazandırır
    // ve okunurluğu bozmaz.
    if (len >= 3) parts.push(`${start}-${prev}`);
    else for (let n = start; n <= prev; n++) parts.push(String(n));
  };

  for (let i = 1; i < nums.length; i++) {
    const n = nums[i];
    const sameQuadrant = Math.floor(n / 10) === Math.floor(prev / 10);
    if (n === prev + 1 && sameQuadrant) { prev = n; continue; }
    flush();
    start = n; prev = n;
  }
  flush();
  return parts.join(', ');
}
