// KPI sayı biçimi — saf (React/i18n yok). Tam sayı ve ondalık AYNI Intl yolundan geçer;
// böylece Farsça'da tümü aynı rakam sistemini kullanır (yerel ayar çağırandan gelir).
export function formatStatNumber(value: number, decimals: number, locale: string): string {
  const d = Math.max(0, decimals | 0);
  const v = d > 0 ? value : Math.round(value);
  try {
    return new Intl.NumberFormat(locale || 'tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  } catch {
    return d > 0 ? v.toFixed(d) : String(v);
  }
}
