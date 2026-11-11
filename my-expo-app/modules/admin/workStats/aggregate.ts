// İş İstatistikleri toplayıcısı — saf (React/Supabase yok). Sayfadaki her sayı
// buradan gelir. Aylık toplamlar Admin Özet "Üye Trendi" kartıyla BİREBİR aynı
// olmalıdır (spec §5): iptal ve dişsiz sipariş sayılmaz; ay = created_at'ın
// yerel takvim ayı; kova/miktar serviceUnits.ts ile çözülür.
// `.ts` uzantılı yollar: `node --test` (strip-types) uzantısız yolu çözemez.
// tsconfig allowImportingTsExtensions açık değil → TS5097 bilerek bastırılır;
// tsc 'bundler' çözümü modülü yine bulur, tipler korunur. Metro tam yolu çözer.
import {
  type MonthKey, type CompareMode, monthKeyOfIso, windowMonths, compareMonth, shiftMonth,
// @ts-expect-error TS5097 (yukarıdaki not)
} from './months.ts';
import {
  type MemberBucket, resolveUnitForWorkType, memberBucketOf, serviceUnitQty,
  workTypeGroupLabel, serviceUnitLabel,
// @ts-expect-error TS5097 (yukarıdaki not)
} from '../../../core/util/serviceUnits.ts';

export const UNKNOWN_CLINIC_ID = '__unknown__';
export const UNKNOWN_CLINIC_NAME = 'Kliniği bilinmeyen';
const NO_WORK_TYPE = '—';

export type Qty = { uye: number; cene: number; adet: number };

export interface RawOrder {
  id: string; order_number: string | null; work_type: string | null; status: string | null;
  created_at: string | null; tooth_numbers: number[] | null; doctor_id: string | null;
}

export interface AggInput {
  orders: RawOrder[];
  clinicByDoctor: Map<string, string>;            // doctors.id → clinics.id
  clinicName: Map<string, string>;                // clinics.id → name
  unitByServiceName: Map<string, string | null>;  // kartla aynı: trim + toLocaleLowerCase('tr-TR')
  firstMonth: MonthKey | null;                    // lab'ın ilk sipariş ayı (kayıt dönemi başı)
  selected: MonthKey;
  compare: CompareMode;
  clinicId: string | null;                        // üst süzgeç: tüm sayfa
  chipWorkType: string | null;                    // trend süzgeci (etiket)
  focusWorkType: string | null;                   // klinik listesini o tipe süzer
}

export interface CountedOrder {
  id: string; orderNumber: string; month: MonthKey; workType: string;
  unit: string | null; bucket: MemberBucket; qty: number; clinicId: string;
}

export interface TrendPoint { month: MonthKey; value: number | null; lastYear: number | null; bucket: MemberBucket }

export interface WorkTypeRow {
  label: string; unit: string | null; unitLabel: string; bucket: MemberBucket;
  qty: number; compare: number | null; series: (number | null)[];
}

export interface ClinicRow { id: string; name: string; qty: Qty; compare: Qty | null }

export interface WorkStats {
  months: MonthKey[];
  trend: TrendPoint[];
  selectedQty: Qty | null;
  compareQty: Qty | null;
  avg6Uye: number | null;
  workTypes: WorkTypeRow[];
  clinics: ClinicRow[];
}

export type HeatAxis = 'workType' | 'clinic';
export interface HeatRow { key: string; label: string; unitLabel: string; cells: (number | null)[]; max: number }

/** Ay kayıt dönemi içinde mi? (lab geneli; firstMonth null → hiçbir ay). */
export function inRecord(month: MonthKey, firstMonth: MonthKey | null): boolean {
  if (!firstMonth) return false;
  return month >= firstMonth;
}

const zeroQty = (): Qty => ({ uye: 0, cene: 0, adet: 0 });
const cmpTr = (a: string, b: string) => a.localeCompare(b, 'tr');

/**
 * Sayılan siparişler. `clinicName` verilirse adı bilinmeyen klinik de
 * UNKNOWN_CLINIC_ID'ye düşer (aggregate* fonksiyonları her zaman verir).
 */
export function countOrders(
  input: Pick<AggInput, 'orders' | 'clinicByDoctor' | 'unitByServiceName'> & { clinicName?: Map<string, string> },
): CountedOrder[] {
  const out: CountedOrder[] = [];
  for (const o of input.orders) {
    if (o.status === 'iptal') continue;
    const teeth = Array.isArray(o.tooth_numbers) ? o.tooth_numbers : [];
    if (teeth.length === 0) continue;
    const month = monthKeyOfIso(o.created_at);
    if (!month) continue;
    const unit = resolveUnitForWorkType(o.work_type, input.unitByServiceName);
    const bucket = memberBucketOf(unit);
    const qty = bucket === 'uye' ? teeth.length : bucket === 'cene' ? serviceUnitQty(unit, teeth) : 1;
    const label = o.work_type ? workTypeGroupLabel(String(o.work_type)) : '';
    const mapped = o.doctor_id ? input.clinicByDoctor.get(o.doctor_id) : undefined;
    const clinicId = mapped && (!input.clinicName || input.clinicName.has(mapped)) ? mapped : UNKNOWN_CLINIC_ID;
    out.push({
      id: o.id,
      orderNumber: o.order_number ?? '',
      month,
      workType: label || NO_WORK_TYPE,
      unit,
      bucket,
      qty,
      clinicId,
    });
  }
  return out;
}

/** Klinik süzgeci uygulanmış sayılan siparişler. */
function scoped(input: AggInput): CountedOrder[] {
  const all = countOrders(input);
  return input.clinicId ? all.filter((c) => c.clinicId === input.clinicId) : all;
}

function byMonth(list: CountedOrder[]): Map<MonthKey, CountedOrder[]> {
  const m = new Map<MonthKey, CountedOrder[]>();
  for (const c of list) {
    const arr = m.get(c.month);
    if (arr) arr.push(c); else m.set(c.month, [c]);
  }
  return m;
}

function sumQty(list: CountedOrder[] | undefined): Qty {
  const q = zeroQty();
  for (const c of list ?? []) q[c.bucket] += c.qty;
  return q;
}

function clinicLabel(id: string, names: Map<string, string>): string {
  return id === UNKNOWN_CLINIC_ID ? UNKNOWN_CLINIC_NAME : (names.get(id) ?? UNKNOWN_CLINIC_NAME);
}

export function aggregateWorkStats(input: AggInput): WorkStats {
  const { firstMonth, selected } = input;
  const months = windowMonths(selected, 12);
  const list = scoped(input);
  const monthMap = byMonth(list);
  const cm = compareMonth(selected, input.compare);
  const rec = (m: MonthKey) => inRecord(m, firstMonth);

  // ── Trend (çip süzgeci) ──
  const chip = input.chipWorkType;
  const chipBucket: MemberBucket = chip
    ? (countOrders(input).find((c) => c.workType === chip)?.bucket
      ?? memberBucketOf(resolveUnitForWorkType(chip, input.unitByServiceName)))
    : 'uye';
  const trendValue = (m: MonthKey): number | null => {
    if (!rec(m)) return null;
    const arr = monthMap.get(m) ?? [];
    if (!chip) return sumQty(arr).uye;
    let v = 0;
    for (const c of arr) if (c.workType === chip) v += c.qty;
    return v;
  };
  const trend: TrendPoint[] = months.map((m) => ({
    month: m, value: trendValue(m), lastYear: trendValue(shiftMonth(m, -12)), bucket: chipBucket,
  }));

  // ── Kutular ──
  const qtyOf = (m: MonthKey): Qty | null => (rec(m) ? sumQty(monthMap.get(m)) : null);
  const selectedQty = qtyOf(selected);
  const compareQty = qtyOf(cm);
  const avgMonths = windowMonths(selected, 6).filter(rec);
  const avg6Uye = avgMonths.length
    ? Math.round((avgMonths.reduce((t, m) => t + sumQty(monthMap.get(m)).uye, 0) / avgMonths.length) * 10) / 10
    : null;

  // ── İş tipleri (seçili ay) ──
  const typeQty = (m: MonthKey, label: string): number => {
    let v = 0;
    for (const c of monthMap.get(m) ?? []) if (c.workType === label) v += c.qty;
    return v;
  };
  const typeMeta = new Map<string, { unit: string | null; bucket: MemberBucket; qty: number }>();
  for (const c of monthMap.get(selected) ?? []) {
    const t = typeMeta.get(c.workType);
    if (t) t.qty += c.qty;
    else typeMeta.set(c.workType, { unit: c.unit, bucket: c.bucket, qty: c.qty });
  }
  const workTypes: WorkTypeRow[] = Array.from(typeMeta, ([label, t]) => ({
    label,
    unit: t.unit,
    unitLabel: serviceUnitLabel(t.unit),
    bucket: t.bucket,
    qty: t.qty,
    compare: rec(cm) ? typeQty(cm, label) : null,
    series: months.map((m) => (rec(m) ? typeQty(m, label) : null)),
  })).sort((a, b) => b.qty - a.qty || cmpTr(a.label, b.label));

  // ── Klinikler (seçili ay; focus → yalnız o iş tipi) ──
  const focus = input.focusWorkType;
  const pick = (m: MonthKey) => {
    const arr = monthMap.get(m) ?? [];
    return focus ? arr.filter((c) => c.workType === focus) : arr;
  };
  const groupByClinic = (arr: CountedOrder[]) => {
    const g = new Map<string, CountedOrder[]>();
    for (const c of arr) {
      const x = g.get(c.clinicId);
      if (x) x.push(c); else g.set(c.clinicId, [c]);
    }
    return g;
  };
  const selG = rec(selected) ? groupByClinic(pick(selected)) : new Map<string, CountedOrder[]>();
  const cmpOk = rec(cm);
  const cmpG = cmpOk ? groupByClinic(pick(cm)) : new Map<string, CountedOrder[]>();
  const row = (id: string): ClinicRow => ({
    id,
    name: clinicLabel(id, input.clinicName),
    qty: sumQty(selG.get(id)),
    compare: cmpOk ? sumQty(cmpG.get(id)) : null,
  });
  const active = Array.from(selG.keys()).map(row)
    .sort((a, b) => b.qty.uye - a.qty.uye || cmpTr(a.name, b.name));
  const silent = Array.from(cmpG.keys()).filter((id) => !selG.has(id)).map(row)
    .sort((a, b) => (b.compare?.uye ?? 0) - (a.compare?.uye ?? 0) || cmpTr(a.name, b.name));

  return {
    months, trend, selectedQty, compareQty, avg6Uye, workTypes, clinics: [...active, ...silent],
  };
}

/** Isı haritası satırları; sütunlar = windowMonths(selected, 12). Klinik süzgeci uygulanır. */
export function heatmapRows(input: AggInput, axis: HeatAxis): HeatRow[] {
  const months = windowMonths(input.selected, 12);
  const inWindow = new Set(months);
  const list = scoped(input).filter((c) => inWindow.has(c.month));
  const rows = new Map<string, { label: string; unitLabel: string; byMonth: Map<MonthKey, number>; total: number }>();
  for (const c of list) {
    const key = axis === 'workType' ? c.workType : c.clinicId;
    let r = rows.get(key);
    if (!r) {
      r = {
        label: axis === 'workType' ? c.workType : clinicLabel(c.clinicId, input.clinicName),
        unitLabel: axis === 'workType' ? serviceUnitLabel(c.unit) : 'üye',
        byMonth: new Map(),
        total: 0,
      };
      rows.set(key, r);
    }
    const v = axis === 'workType' ? c.qty : (c.bucket === 'uye' ? c.qty : 0);
    r.byMonth.set(c.month, (r.byMonth.get(c.month) ?? 0) + v);
    r.total += v;
  }
  return Array.from(rows, ([key, r]) => {
    const cells = months.map((m) => (inRecord(m, input.firstMonth) ? (r.byMonth.get(m) ?? 0) : null));
    const max = cells.reduce<number>((mx, v) => (v != null && v > mx ? v : mx), 0);
    return { key, label: r.label, unitLabel: r.unitLabel, cells, max, total: r.total };
  })
    .sort((a, b) => b.total - a.total || cmpTr(a.label, b.label))
    .map(({ total: _t, ...h }) => h);
}

/** Isı hücresinin siparişleri (klinik süzgeci uygulanır). */
export function ordersInCell(input: AggInput, month: MonthKey, axis: HeatAxis, key: string): CountedOrder[] {
  return scoped(input).filter((c) =>
    c.month === month && (axis === 'workType' ? c.workType === key : c.clinicId === key));
}
