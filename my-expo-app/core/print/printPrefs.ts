/**
 * Yazdırma/PDF seçimlerini hatırlar (cihaza özel): "PDF" ve "Yazdır" düğmeleri her seferinde
 * seçenek penceresi açmasın diye son seçilen biçim/kapsam burada tutulur.
 * Web: localStorage (gizli pencerede atabilir → sessizce varsayılana düşer). Native: oturum belleği.
 */
const mem = new Map<string, string>();

export function readPrintPref<T extends string>(key: string, allowed: readonly T[]): T | null {
  let v: string | null = mem.get(key) ?? null;
  try {
    if (v == null && typeof localStorage !== 'undefined') v = localStorage.getItem(`siman.print.${key}`);
  } catch { /* depolama kapalı */ }
  return v != null && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

export function writePrintPref(key: string, value: string): void {
  mem.set(key, value);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(`siman.print.${key}`, value);
  } catch { /* depolama kapalı */ }
}
