// Fatura listesi dönem süzgeci (denetim yol haritası 2. dalga madde 7, küçük sürüm): muhasebeciye ay sonu
// dışa aktarım + Luca listesiyle karşılaştırma. Saf yardımcı — içe aktarma yok (node --test doğrudan çalıştırır).
// Tarihler 'YYYY-MM-DD' (fatura issue_date'i ve lab bugünü aynı biçimde; dize karşılaştırması güvenli).

export type InvoicePeriod = 'all' | 'this_month' | 'last_month' | 'this_year' | 'custom';
export interface PeriodRange { from: string | null; to: string | null }

const pad = (n: number) => String(n).padStart(2, '0');
const monthEnd = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // m: 1–12
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function periodRange(p: InvoicePeriod, today: string, from?: string | null, to?: string | null): PeriodRange {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  switch (p) {
    case 'this_month':
      return { from: ymd(y, m, 1), to: ymd(y, m, monthEnd(y, m)) };
    case 'last_month': {
      const ly = m === 1 ? y - 1 : y;
      const lm = m === 1 ? 12 : m - 1;
      return { from: ymd(ly, lm, 1), to: ymd(ly, lm, monthEnd(ly, lm)) };
    }
    case 'this_year':
      return { from: ymd(y, 1, 1), to: ymd(y, 12, 31) };
    case 'custom': {
      const a = from || null;
      const b = to || null;
      return a && b && a > b ? { from: b, to: a } : { from: a, to: b };
    }
    default:
      return { from: null, to: null };
  }
}

/** Fatura tarihi aralıkta mı (uçlar dahil; açık uç sınırsız) */
export function inPeriod(issueDate: string, r: PeriodRange): boolean {
  if (r.from && issueDate < r.from) return false;
  if (r.to && issueDate > r.to) return false;
  return true;
}
