// Açılış izleme — "giriş sonrası önce içerik, sonra loading, sonra yine içerik"
// şikâyetinin sebebini ÖLÇMEK için. Sadece konsola yazar, UI'a dokunmaz.
//
// EN ÖNEMLİ SİNYAL: bootNo. sessionStorage'daki sayaç her HTML yüklemesinde artar.
// Tek girişte iki farklı bootNo görüyorsak ortada TAM SAYFA RELOAD vardır ve
// gördüğün "loading" HTML splash'ıdır. Aynı bootNo içinde kalıyorsa reload yok,
// React ağacı yeniden monte oluyor demektir — ikisi bambaşka sebepler.
//
// NOT: navigation.type tek başına reload olmadığını KANITLAMAZ (daha önce
// yanılttı); sayaç kanıtlar.
import { Platform } from 'react-native';

// Varsayılan: yalnız geliştirmede yazar — canlıda kullanıcının konsoluna açılış
// logu basmak gürültüdür. AMA canlıdaki bir yavaşlığı ölçemez hâle gelmemek için
// `?trace=1` ile açılabilir; normal kullanıcı bunu asla görmez.
const traceFlag = (() => {
  try {
    return Platform.OS === 'web' && typeof window !== 'undefined'
      && /[?&]trace=1\b/.test(window.location?.search ?? '');
  } catch { return false; }
})();
const ENABLED = (typeof __DEV__ !== 'undefined' && __DEV__) || traceFlag;

const t0 = Date.now();
let bootNo = 0;

if (ENABLED && Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    const n = Number(window.sessionStorage.getItem('nx_boot_no') || '0') + 1;
    window.sessionStorage.setItem('nx_boot_no', String(n));
    bootNo = n;
    const nav: any = (performance.getEntriesByType?.('navigation') ?? [])[0];
    // eslint-disable-next-line no-console
    console.info(`%c[boot #${bootNo}] HTML yüklendi · navigation=${nav?.type ?? '?'}`,
      'color:#0F766E;font-weight:700');
  } catch { /* sessionStorage kapalı olabilir */ }
}

/** Son işaretler — ekran üstü panelde gösterilir (konsoldan kopyalamaya gerek
 *  kalmasın; tek ekran görüntüsü yeterli olsun). */
export const bootLog: string[] = [];
const logListeners = new Set<() => void>();
export function subscribeBootLog(fn: () => void): () => void {
  logListeners.add(fn);
  return () => { logListeners.delete(fn); };
}
export function isTraceOn(): boolean { return ENABLED; }
export function bootNumber(): number { return bootNo; }

/** Açılış zaman çizelgesine bir işaret bırak. */
export function bootMark(label: string, extra?: Record<string, unknown>): void {
  if (!ENABLED || Platform.OS !== 'web' || typeof window === 'undefined') return;
  const ms = Date.now() - t0;
  const line = `+${String(ms).padStart(6)}ms ${label}` + (extra ? ' ' + JSON.stringify(extra) : '');
  // eslint-disable-next-line no-console
  console.info(`[boot #${bootNo}] ${line}`);
  // Aynı satır üst üste tekrarlıyorsa sayaçla topla — panel taşmasın.
  const last = bootLog[bootLog.length - 1];
  const bare = label + (extra ? ' ' + JSON.stringify(extra) : '');
  if (last && last.includes(bare)) {
    const m = last.match(/ ×(\d+)$/);
    const n = m ? Number(m[1]) + 1 : 2;
    bootLog[bootLog.length - 1] = last.replace(/ ×\d+$/, '') + ` ×${n}`;
  } else {
    bootLog.push(line);
    if (bootLog.length > 24) bootLog.shift();
  }
  // ASENKRON: bootMark render gövdesinden de çağrılıyor. Dinleyiciyi senkron
  // tetiklemek "render sırasında setState" demek olur ve React'i fazladan render
  // turlarına sokar — ölçüm aracı ölçtüğü şeyi bozmamalı.
  setTimeout(() => { logListeners.forEach((fn) => { try { fn(); } catch { /* yut */ } }); }, 0);
}
