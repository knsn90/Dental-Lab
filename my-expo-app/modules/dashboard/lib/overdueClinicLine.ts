/**
 * Özet görev kartında klinik bazlı vadesi geçmiş alacak satırının ikinci satırı:
 * "<döviz başına tutar> vadesi geçti · N gün · son hatırlatma GG.AA" (ya da "hatırlatma yok").
 * Tutarlar döviz başına ayrı yazılır, toplanmaz.
 */
import { formatMoney } from '../../../core/money/currency';
import type { Currency } from '../../../core/money/currency';
import { autoT } from '../../../core/i18n/autoTranslate';
import type { OverdueClinic } from '../hooks/useOverdueClinics';

export function overdueClinicLine(c: OverdueClinic): string {
  const amounts = c.byCurrency
    .filter((x) => x.overdue > 0)
    .map((x) => formatMoney(Number(x.overdue) || 0, x.currency as Currency, { fractionDigits: 0 }))
    .join(' · ');
  const parts = [`${amounts} ${autoT('vadesi geçti')}`];
  if (c.daysLate > 0) parts.push(`${c.daysLate} ${autoT('gün')}`);
  const d = c.lastReminderAt ? String(c.lastReminderAt).slice(0, 10) : '';
  parts.push(d ? `${autoT('son hatırlatma')} ${d.slice(8, 10)}.${d.slice(5, 7)}` : autoT('hatırlatma yok'));
  return parts.join(' · ');
}
