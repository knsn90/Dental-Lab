/**
 * darkFg — koyu temada METİN/İKON önplan rengini açık karşılığına çevirir.
 * Zemin/arka plan renkleri DEĞİŞMEZ; yalnız okunurluk için önplan eşlenir.
 * (Sipariş listesi ve kanban aynı eşlemeyi kullanır — tek kaynak.)
 */
const DARK_FG: Record<string, string> = {
  '#1E3A8A': '#93C5FD', '#1E5A8A': '#93C5FD', '#1F5689': '#93C5FD', '#3563A8': '#93C5FD',
  '#0F6E50': '#6EE7B7', '#059669': '#6EE7B7', '#1F6B47': '#6EE7B7',
  '#9C2E2E': '#FCA5A5', '#DC2626': '#FCA5A5',
  '#92400E': '#E8B45E', '#B45309': '#E8B45E', '#D97706': '#E8B45E', '#9C5E0E': '#E8B45E',
};

export function darkFg(isDark: boolean, fg: string, fallback?: string): string {
  return isDark ? (DARK_FG[fg] ?? fallback ?? fg) : fg;
}
