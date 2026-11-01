import { localeTag } from '../i18n';
import { isOverdueOrder, labTodayOf } from '../metrics/orderDefs';
import { cachedLabTz } from '../metrics/useLabToday';
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(localeTag(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}
/** Tek tanım (2026-10-26): core/metrics/orderDefs'e devreder (iptal de gecikmez). */
export function isOverdue(deliveryDate: string, status: string): boolean {
  return isOverdueOrder({ status, delivery_date: deliveryDate }, labTodayOf(cachedLabTz()));
}
export function daysUntil(date: string): number {
  const diff = new Date(date).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
