// Karlılık ekranının klinik / işlem ciro kırılımı — saf model (içe aktarmasız).
// Girdi: profitability_by_clinic / profitability_by_service satırları (Supabase
// numeric'i string döndürebilir). Çıktı: döviz dilimli, payı hesaplanmış, sıralı satırlar.

type Num = number | string | null | undefined;

export type Slice = { currency: string; total: number };

export type ClinicLine = {
  clinic_id: string | null; clinic_name: string | null; doctor_id: string | null;
  doctor_name: string | null; currency: string; revenue: Num; revenue_base: Num; order_ids: string[] | null;
};
export type DoctorRow = {
  key: string; name: string | null; revenueBase: number; slices: Slice[];
  orderCount: number; shareInClinic: number;
};
export type ClinicRow = {
  key: string; kind: 'clinic' | 'doctorOnly' | 'none'; name: string | null;
  revenueBase: number; slices: Slice[]; orderCount: number; share: number; doctors: DoctorRow[];
};

export type ServiceLine = {
  row_kind: 'service' | 'other' | 'no_items'; service_id: string | null;
  service_name: string | null; unit: string | null; currency: string; quantity: Num; revenue: Num;
  revenue_base: Num; listed_quantity: Num; listed_revenue_base: Num; list_value_base: Num;
};
export type ServiceRow = {
  key: string; kind: 'service' | 'other' | 'no_items'; name: string | null;
  unit: string | null; quantity: number; revenueBase: number; slices: Slice[]; share: number;
  avgUnitPrice: number | null; listUnitPrice: number | null; discountPct: number | null;
};

const num = (n: Num): number => Number(n) || 0;
const round1 = (n: number): number => Math.round(n * 10) / 10;
const pct = (part: number, whole: number): number => (whole > 0 ? round1((part / whole) * 100) : 0);

function addSlice(map: Map<string, number>, currency: string, total: number) {
  map.set(currency, (map.get(currency) ?? 0) + total);
}
function toSlices(map: Map<string, number>): Slice[] {
  return [...map.entries()]
    .filter(([, total]) => total !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, total]) => ({ currency, total }));
}

/** Satırların döviz dilimlerini birleştirir (0 toplamlı dilim düşer). */
export function sliceSum(rows: { slices: Slice[] }[]): Slice[] {
  const map = new Map<string, number>();
  for (const r of rows) for (const s of r.slices) addSlice(map, s.currency, s.total);
  return toSlices(map);
}

type DoctorAcc = { name: string | null; base: number; ccy: Map<string, number>; orders: Set<string> };
type ClinicAcc = { kind: ClinicRow['kind']; name: string | null; doctors: Map<string, DoctorAcc> };

export function buildClinicRows(lines: ClinicLine[]): ClinicRow[] {
  const clinics = new Map<string, ClinicAcc>();
  for (const l of lines) {
    const key = l.clinic_id ? l.clinic_id : l.doctor_id ? `doctor:${l.doctor_id}` : 'none';
    let c = clinics.get(key);
    if (!c) {
      c = l.clinic_id
        ? { kind: 'clinic', name: l.clinic_name, doctors: new Map() }
        : l.doctor_id
          ? { kind: 'doctorOnly', name: l.doctor_name, doctors: new Map() }
          : { kind: 'none', name: null, doctors: new Map() };
      clinics.set(key, c);
    }
    const dKey = l.doctor_id ?? 'none';
    let d = c.doctors.get(dKey);
    if (!d) { d = { name: l.doctor_id ? l.doctor_name : null, base: 0, ccy: new Map(), orders: new Set() }; c.doctors.set(dKey, d); }
    d.base += num(l.revenue_base);
    addSlice(d.ccy, l.currency, num(l.revenue));
    for (const o of l.order_ids ?? []) d.orders.add(o);
  }

  const built = [...clinics.entries()].map(([key, c]) => {
    const docs = [...c.doctors.entries()]
      .map(([dKey, d]) => ({ key: dKey, name: d.name, revenueBase: d.base, slices: toSlices(d.ccy), orders: d.orders }))
      .sort((a, b) => b.revenueBase - a.revenueBase || (a.name ?? '').localeCompare(b.name ?? ''));
    // Klinik toplamı hekim satırlarından türer → "hekimler toplamı = klinik" yapı gereği tutar.
    const revenueBase = docs.reduce((s, d) => s + d.revenueBase, 0);
    const orders = new Set<string>();
    for (const d of docs) for (const o of d.orders) orders.add(o);
    const doctors: DoctorRow[] = docs.map(d => ({
      key: d.key, name: d.name, revenueBase: d.revenueBase, slices: d.slices,
      orderCount: d.orders.size, shareInClinic: pct(d.revenueBase, revenueBase),
    }));
    return { key, kind: c.kind, name: c.name, revenueBase, slices: sliceSum(doctors), orderCount: orders.size, doctors };
  });

  const total = built.reduce((s, r) => s + r.revenueBase, 0);
  return built
    .map(r => ({ ...r, share: pct(r.revenueBase, total) }))
    .sort((a, b) => {
      if ((a.kind === 'none') !== (b.kind === 'none')) return a.kind === 'none' ? 1 : -1;
      return b.revenueBase - a.revenueBase || (a.name ?? '').localeCompare(b.name ?? '');
    });
}

const KIND_ORDER: Record<ServiceRow['kind'], number> = { service: 0, other: 1, no_items: 2 };

export function buildServiceRows(lines: ServiceLine[]): ServiceRow[] {
  type Acc = {
    kind: ServiceRow['kind']; name: string | null; unit: string | null; qty: number; base: number;
    ccy: Map<string, number>; listedQty: number; listedRev: number; listValue: number;
  };
  const groups = new Map<string, Acc>();
  for (const l of lines) {
    const key = l.row_kind === 'service' ? (l.service_id ?? `name:${l.service_name ?? ''}`) : l.row_kind;
    let g = groups.get(key);
    if (!g) {
      g = { kind: l.row_kind, name: l.row_kind === 'service' ? l.service_name : null, unit: null,
        qty: 0, base: 0, ccy: new Map(), listedQty: 0, listedRev: 0, listValue: 0 };
      groups.set(key, g);
    }
    if (!g.unit && l.unit) g.unit = l.unit;
    g.qty += num(l.quantity);
    g.base += num(l.revenue_base);
    addSlice(g.ccy, l.currency, num(l.revenue));
    g.listedQty += num(l.listed_quantity);
    g.listedRev += num(l.listed_revenue_base);
    g.listValue += num(l.list_value_base);
  }

  const total = [...groups.values()].reduce((s, g) => s + g.base, 0);
  return [...groups.entries()]
    .map(([key, g]): ServiceRow => ({
      key, kind: g.kind, name: g.name, unit: g.unit, quantity: g.qty, revenueBase: g.base,
      slices: toSlices(g.ccy), share: pct(g.base, total),
      avgUnitPrice: g.kind === 'service' && g.qty > 0 ? g.base / g.qty : null,
      listUnitPrice: g.listedQty > 0 && g.listValue > 0 ? g.listValue / g.listedQty : null,
      discountPct: g.listValue > 0 ? round1((1 - g.listedRev / g.listValue) * 100) : null,
    }))
    .sort((a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.revenueBase - a.revenueBase || (a.name ?? '').localeCompare(b.name ?? ''));
}

/** Gelir varken girilmemiş (0) maliyet kalemleri — kârı olduğundan yüksek gösterir. */
export function missingCosts(
  s: { total_revenue?: Num; total_labor?: Num; total_overhead?: Num } | null,
): { labor: boolean; overhead: boolean } {
  if (!s || num(s.total_revenue) <= 0) return { labor: false, overhead: false };
  return { labor: num(s.total_labor) <= 0, overhead: num(s.total_overhead) <= 0 };
}

/** Marj etiketi; işçilik girilmemişse etiket yanıltıcı olacağı için verilmez. */
export function marginLabel(
  margin: number | null, missing: { labor: boolean },
): 'Mükemmel' | 'İyi' | 'Düşük' | 'Risk' | null {
  if (margin === null || missing.labor) return null;
  return margin >= 30 ? 'Mükemmel' : margin >= 20 ? 'İyi' : margin >= 10 ? 'Düşük' : 'Risk';
}
