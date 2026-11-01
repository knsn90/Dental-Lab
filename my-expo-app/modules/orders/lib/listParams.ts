// Sipariş listesi: adres parametreleri ve teslim-günü filtreleri (saf — test: listParams.test.mts).
// Özet rozetleri listeyi filtreli açabilsin diye: /orders?filter=overdue, ?status=alindi …
// Bilinmeyen değer yok sayılır (liste "Tümü" ile açılır).
// Tanımlar tek yerden: core/metrics/orderDefs.ts (2026-10-26, tek tanım).

export type DueFlag = 'overdue' | 'today' | 'tomorrow' | 'urgent';
const FLAGS: readonly DueFlag[] = ['overdue', 'today', 'tomorrow', 'urgent'];

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export function parseOrdersListParams(
  p: Record<string, string | string[] | undefined>,
  allowedStatuses: readonly string[],
): { status: string | null; flag: DueFlag | null } {
  const s = first(p.status);
  const f = first(p.filter);
  return {
    status: s && allowedStatuses.includes(s) ? s : null,
    flag: f && (FLAGS as readonly string[]).includes(f) ? (f as DueFlag) : null,
  };
}

/** Süzgeçlerin kullandığı tek tanım (core/metrics/orderDefs.ts). Parametre olarak verilir:
 *  node testleri (.test.mts) uzantısız göreli importu çözemiyor. */
export type DueDefs = {
  isOverdueOrder: (o: any, today: string) => boolean;
  isDueOn: (o: any, day: string) => boolean;
  isUrgentOpen: (o: any) => boolean;
};

export function matchesDueFlag(
  o: { delivery_date: string; status: string; is_urgent?: boolean | null; hold_status?: string | null; is_archived?: boolean | null },
  flag: DueFlag | null,
  today: string,
  tomorrow: string,
  defs: DueDefs,
): boolean {
  if (!flag) return true;
  switch (flag) {
    case 'overdue':  return defs.isOverdueOrder(o, today);
    case 'today':    return defs.isDueOn(o, today);
    case 'tomorrow': return defs.isDueOn(o, tomorrow);
    case 'urgent':   return defs.isUrgentOpen(o);
  }
}

/** Yerel takvim günü (YYYY-MM-DD). toISOString() UTC verir → TR'de 00:00–03:00 arası dünü döndürür. */
export function localISODate(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Teslim günü geçti mi — tarih DİZESİ karşılaştırması. `new Date('YYYY-MM-DD')` UTC gece yarısıdır;
 *  onunla kıyaslamak TR'de bugün teslim olan işi 03:00'ten sonra "gecikmiş" gösteriyordu. */
export function isPastDue(deliveryDate: string | null | undefined, today: string): boolean {
  const d = String(deliveryDate ?? '').slice(0, 10);
  return !!d && d < today;
}

/** Prova takibi çipleri (2. dalga 4): ?filter=prova (provada) · ?filter=risk (randevu riski). */
export type ProvaChip = 'prova' | 'risk';

/** Adres parametrelerinden listenin TAM filtre durumu (çipler birbirini dışlar; parametresiz → varsayılan). */
export function listStateFromParams(
  p: Record<string, string | string[] | undefined>,
  allowedStatuses: readonly string[],
): { status: string; overdue: boolean; urgent: boolean; dueFlag: 'today' | 'tomorrow' | null; doctorId: string | null; provaChip: ProvaChip | null } {
  const f = first(p.filter);
  const { status, flag } = parseOrdersListParams(p, allowedStatuses);
  return {
    status: status ?? 'all',
    overdue: flag === 'overdue',
    urgent: flag === 'urgent',
    dueFlag: flag === 'today' || flag === 'tomorrow' ? flag : null,
    // ?doctor=<doctors.id> — genel aramadan "hekimin siparişleri" (2. dalga 1)
    doctorId: (first(p.doctor) ?? '').trim() || null,
    provaChip: f === 'prova' || f === 'risk' ? f : null,
  };
}

/** Filtreyi ilgilendiren parametrelerin anahtarı — yalnız bu değişince liste yeniden filtrelenir. */
export function paramsKey(p: Record<string, string | string[] | undefined>): string {
  return `${first(p.filter) ?? ''}|${first(p.status) ?? ''}|${first(p.doctor) ?? ''}`;
}
