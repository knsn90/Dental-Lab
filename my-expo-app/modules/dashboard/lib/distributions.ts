// Dağılım kartlarının saf hesapları — Admin Özet'teki kurallarla birebir
// (lab yöneticisi panosu da bunları kullanır).
// @ts-expect-error TS5097 — node --test .ts yolunu ister
import { serviceUnitQty, resolveUnitForWorkType, workTypeGroupLabel } from '../../../core/util/serviceUnits.ts';

export interface WorkTypeRow { label: string; count: number; unit: string | null }

/** lab_services satırlarından hizmet adı → birim eşlemi (küçük harf, kırpılmış). */
export function unitMapOf(services: { name?: string | null; unit?: string | null }[]): Map<string, string | null> {
  return new Map(services.map((s) => [String(s.name ?? '').trim().toLocaleLowerCase('tr-TR'), s.unit ?? null]));
}

/** İş tipi dağılımı: iptal ve dişsiz işler sayılmaz; miktar işin KENDİ biriminde. */
export function workTypeDistribution(
  orders: { work_type: string | null; status: string | null; tooth_numbers: number[] | null }[],
  unitByService: Map<string, string | null>,
): WorkTypeRow[] {
  const m: Record<string, { count: number; unit: string | null }> = {};
  for (const o of orders) {
    const teeth = Array.isArray(o.tooth_numbers) ? o.tooth_numbers.length : 0;
    if (!o.work_type || teeth === 0 || o.status === 'iptal') continue;
    const wt = workTypeGroupLabel(String(o.work_type));
    if (!wt) continue;
    const unit = resolveUnitForWorkType(String(o.work_type), unitByService);
    m[wt] = { count: (m[wt]?.count ?? 0) + serviceUnitQty(unit, o.tooth_numbers ?? []), unit };
  }
  return Object.entries(m).sort((a, b) => b[1].count - a[1].count).map(([label, v]) => ({ label, count: v.count, unit: v.unit }));
}

/** order_metrics().by_status → dağılım kovaları (iptal yok). */
export function statusBuckets(byStatus: Record<string, number>, keys: string[], bucketOf: Record<string, string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const k of keys) counts[k] = 0;
  for (const [st, n] of Object.entries(byStatus)) {
    const b = bucketOf[st];
    if (b) counts[b] += Number(n) || 0;
  }
  return counts;
}
