// modules/search/lib/fold.ts — veritabanındaki public.search_fold ile birebir:
// translate(lower(x), 'ıiçğöşüâîû' || chr(775), 'iicgosuaiu'). "AYŞE" = "ayse", "İSMAİL" = "ismail".
const MAP: Record<string, string> = { 'ı': 'i', 'ç': 'c', 'ğ': 'g', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u', '̇': '' };

export function foldTR(s: string): string {
  return (s ?? '').toLowerCase().replace(/[ıçğöşüâîû̇]/g, (ch) => MAP[ch]);
}
