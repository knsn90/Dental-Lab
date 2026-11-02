/**
 * Sipariş sayılarının TEK tanımı — istemci aynası.
 *
 * SQL karşılığı (20261026100000_tek_tanim_katmani): `lab_today`, `wo_is_open`,
 * `wo_is_overdue`, `order_metrics()`. Sayılar sunucudan gelir (`useOrderMetrics`);
 * bu dosya yalnız ekranın elindeki satırları aynı kuralla süzmek içindir.
 * Spec: docs/superpowers/specs/2026-10-26-tek-tanim-design.md §4.
 *
 * Bilerek import YOK: node testleri (.test.mts) uzantısız göreli importu çözemiyor.
 */

export type OrderLike = {
  status: string;
  is_archived?: boolean | null;
  hold_status?: string | null;
  hold_category?: string | null;
  delivery_date?: string | null;
  is_urgent?: boolean | null;
};

/** Kapanmış sayılan statüler. Kurye durumları (teslimata_hazir, kurye_bekleniyor,
 *  kuryede) AÇIK sayılır: iş kliniğe ulaşmadı (kullanıcı kararı 12). */
export const CLOSED_STATUSES = ['teslim_edildi', 'iptal'] as const;

const DEFAULT_TZ = 'Europe/Istanbul';

/** Lab'ın saat diliminde bugün (YYYY-MM-DD). Veritabanı ve `toISOString()` UTC'dir;
 *  TR'de 00:00–03:00 arası onlara göre hâlâ dündür. */
export function labTodayOf(tz?: string | null, now: Date = new Date()): string {
  const fmt = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  try {
    return fmt(tz && tz.trim() ? tz.trim() : DEFAULT_TZ);
  } catch {
    return fmt(DEFAULT_TZ);
  }
}

/** YYYY-MM-DD gününe gün ekler (takvim günü; saat dilimi yok). */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Açık iş: teslim edilmemiş, iptal değil, arşivde değil. */
export function isOpenOrder(o: OrderLike): boolean {
  return !(CLOSED_STATUSES as readonly string[]).includes(o.status) && !o.is_archived;
}

/** Kapanmış iş ekranda nasıl anılır (madde 14): teslimde teslim anı (2026-10 öncesi
 *  kayıtlarda boş), iptalde an tutulmaz. Açık işte null. Arşiv bakılmaz: kapanış statüden. */
export function closedStateOf(o: { status: string; delivered_at?: string | null }):
  { kind: 'delivered' | 'cancelled'; at: string | null } | null {
  if (o.status === 'teslim_edildi') return { kind: 'delivered', at: o.delivered_at ?? null };
  if (o.status === 'iptal') return { kind: 'cancelled', at: null };
  return null;
}

/** Geciken: açık + teslim tarihi bugünden önce + beklemeye alınmamış. */
export function isOverdueOrder(o: OrderLike, today: string): boolean {
  if (!isOpenOrder(o) || o.hold_status === 'on_hold') return false;
  const d = (o.delivery_date ?? '').slice(0, 10);
  return !!d && d < today;
}

/** Beklemede: açık + beklemeye alınmış; prova beklemesi sayılmaz (kendi göstergesi var).
 *  SQL karşılığı: order_metrics().on_hold (20261102110000). */
export function isHeldOrder(o: OrderLike): boolean {
  return isOpenOrder(o) && o.hold_status === 'on_hold' && o.hold_category !== 'client_prova';
}

/** Acil iş: açık + acil işaretli (teslim edilmiş acil iş sayılmaz). */
export function isUrgentOpen(o: OrderLike): boolean {
  return isOpenOrder(o) && !!o.is_urgent;
}

/** Belirli gün teslim edilecek açık iş (beklemedekiler dahil). */
export function isDueOn(o: OrderLike, day: string): boolean {
  return isOpenOrder(o) && (o.delivery_date ?? '').slice(0, 10) === day;
}
