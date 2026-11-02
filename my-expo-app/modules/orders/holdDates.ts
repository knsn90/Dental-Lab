/**
 * Bekleme gün modeli — saf (React/Supabase yok; node --test ile denenir).
 *
 * Unutulan bekleme başlangıcı/bitişi sonradan gününe göre girilir (madde 13).
 * Bütün girdiler lab gününde `YYYY-MM-DD`; saat dilimi dönüşümünü çağıran yapar
 * (`labTodayOf(cachedLabTz(), new Date(ts))`). Sunucu aynı kuralı `hold_order` /
 * `resume_order` içinde ayrıca denetler (20261102100000).
 *
 * Bilerek import YOK: node testleri (.test.mts) uzantısız göreli importu çözemiyor.
 */

/** "Uzun bekleme" eşiği: bu sayıdan FAZLA gün bekleyen iş panoda hatırlatılır. */
export const LONG_HOLD_DAYS = 3;

export type DayErr = {
  code: 'future' | 'before_floor' | 'before_start' | 'later_than_current';
  boundary?: string;
};

const utc = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** b − a, takvim günü (negatif olabilir). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/** Uzatılacak gün: bitiş günü − başlangıç günü (iş günü yok). */
export function holdExtensionDays(startDay: string, endDay: string): number {
  return Math.max(0, daysBetween(startDay, endDay));
}

/** Devamda yeni teslim günü: yalnız hekim/klinik kaynaklı bekleme kaydırır. */
export function shiftedDelivery(deliveryDay: string, ext: number, responsible: 'client' | 'lab'): string {
  if (responsible !== 'client' || !ext) return deliveryDay;
  return new Date(utc(deliveryDay) + ext * 86_400_000).toISOString().slice(0, 10);
}

/** Beklemenin en erken başlayabileceği gün: sipariş açılışı ile önceki beklemenin bitişinin büyüğü. */
export function holdStartFloor(o: { createdDay: string; prevEndDay?: string | null }): string {
  return o.prevEndDay && o.prevEndDay > o.createdDay ? o.prevEndDay : o.createdDay;
}

export function validateHoldStart(day: string, o: { floor: string; today: string }): DayErr | null {
  if (day > o.today) return { code: 'future' };
  if (day < o.floor) return { code: 'before_floor', boundary: o.floor };
  return null;
}

/** Devam ettirirken açık beklemenin başlangıcı yalnız daha erken bir güne çekilebilir. */
export function validateResumeStart(
  day: string,
  o: { currentStart: string; floor: string; today: string },
): DayErr | null {
  if (day > o.currentStart) return { code: 'later_than_current', boundary: o.currentStart };
  return validateHoldStart(day, o);
}

export function validateHoldEnd(day: string, o: { startDay: string; today: string }): DayErr | null {
  if (day > o.today) return { code: 'future' };
  if (day < o.startDay) return { code: 'before_start', boundary: o.startDay };
  return null;
}

export function isLongHold(ageDays: number): boolean {
  return ageDays > LONG_HOLD_DAYS;
}

/** Listede "Beklemede · N gün": prova dışı beklemenin başlangıç gününden bugüne geçen gün.
 *  Beklemede değilse, prova beklemesiyse ya da başlangıç bilinmiyorsa null. */
export function heldAgeDays(
  o: { hold_status?: string | null; hold_category?: string | null; startDay?: string | null },
  today: string,
): number | null {
  if (o.hold_status !== 'on_hold' || o.hold_category === 'client_prova' || !o.startDay) return null;
  return Math.max(0, daysBetween(o.startDay, today));
}
