// Karlılık ekranının klinik / işlem ciro kırılımı — saf model (içe aktarmasız).
// Girdi: profitability_by_clinic / profitability_by_service satırları (Supabase
// numeric'i string döndürebilir). Çıktı: döviz dilimli, payı hesaplanmış, sıralı satırlar.
// Ekstre indirimi (20261105102000): ciroyu düşüren eksi satır — klinikte kliniğin altında ayrı alt satır,
// işlem kırılımında en sonda ayrı satır; böylece kırılım toplamı dönem cirosuna eşit kalır.

type Num = number | string | null | undefined;

export type Slice = { currency: string; total: number };

export type ClinicLine = {
  clinic_id: string | null; clinic_name: string | null; doctor_id: string | null;
  doctor_name: string | null; currency: string; revenue: Num; revenue_base: Num; order_ids: string[] | null;
  /** Eski önbellek satırlarında yok → sipariş satırı sayılır. */
  row_kind?: 'order' | 'statement_discount';
};
export type DoctorRow = {
  /** 'statement_discount': kliniğin ekstre indirimleri (hekimsiz siparişlerle birleşmez, en sonda). */
  key: string; kind: 'doctor' | 'statement_discount'; name: string | null; revenueBase: number; slices: Slice[];
  /** Kliniğin indirim DIŞI (brüt) toplamına göre pay; ekstre indirimi satırında null (pay gösterilmez). */
  orderCount: number; shareInClinic: number | null;
};
export type ClinicRow = {
  key: string; kind: 'clinic' | 'doctorOnly' | 'none'; name: string | null;
  /** share: kliniğin indirim DIŞI (brüt) cirosu / tüm kliniklerin brüt cirosu; yalnız ekstre indirimi olan klinikte null. */
  revenueBase: number; slices: Slice[]; orderCount: number; share: number | null; doctors: DoctorRow[];
};

export type ServiceLine = {
  row_kind: 'service' | 'other' | 'no_items' | 'statement_discount'; service_id: string | null;
  service_name: string | null; unit: string | null; currency: string; quantity: Num; revenue: Num;
  revenue_base: Num; listed_quantity: Num; listed_revenue_base: Num; list_value_base: Num;
};
export type ServiceRow = {
  key: string; kind: 'service' | 'other' | 'no_items' | 'statement_discount'; name: string | null;
  /** share: indirim DIŞI satırların brüt toplamına göre; ekstre indirimi satırında null. */
  unit: string | null; quantity: number; revenueBase: number; slices: Slice[]; share: number | null;
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

type DoctorAcc = {
  kind: DoctorRow['kind']; name: string | null; base: number; ccy: Map<string, number>; orders: Set<string>;
};
const SD_KEY = 'statement_discount';
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
    const isSd = l.row_kind === 'statement_discount';
    const dKey = isSd ? SD_KEY : (l.doctor_id ?? 'none');
    let d = c.doctors.get(dKey);
    if (!d) {
      d = isSd
        ? { kind: 'statement_discount', name: null, base: 0, ccy: new Map(), orders: new Set() }
        : { kind: 'doctor', name: l.doctor_id ? l.doctor_name : null, base: 0, ccy: new Map(), orders: new Set() };
      c.doctors.set(dKey, d);
    }
    d.base += num(l.revenue_base);
    addSlice(d.ccy, l.currency, num(l.revenue));
    for (const o of l.order_ids ?? []) d.orders.add(o);
  }

  const built = [...clinics.entries()].map(([key, c]) => {
    const docs = [...c.doctors.entries()]
      .map(([dKey, d]) => ({ key: dKey, kind: d.kind, name: d.name, revenueBase: d.base, slices: toSlices(d.ccy), orders: d.orders }))
      .sort((a, b) => {
        if ((a.kind === 'statement_discount') !== (b.kind === 'statement_discount')) return a.kind === 'statement_discount' ? 1 : -1;
        return b.revenueBase - a.revenueBase || (a.name ?? '').localeCompare(b.name ?? '');
      });
    // Klinik toplamı hekim satırlarından türer → "hekimler toplamı = klinik" yapı gereği tutar.
    const revenueBase = docs.reduce((s, d) => s + d.revenueBase, 0);
    // Pay paydası: ekstre indirimi hariç brüt toplam (net paydada paylar %100'ü aşardı)
    const grossBase = docs.reduce((s, d) => (d.kind === 'statement_discount' ? s : s + d.revenueBase), 0);
    const orders = new Set<string>();
    for (const d of docs) for (const o of d.orders) orders.add(o);
    const doctors: DoctorRow[] = docs.map(d => ({
      key: d.key, kind: d.kind, name: d.name, revenueBase: d.revenueBase, slices: d.slices,
      orderCount: d.orders.size,
      shareInClinic: d.kind === 'statement_discount' ? null : pct(d.revenueBase, grossBase),
    }));
    const hasGross = docs.some(d => d.kind !== 'statement_discount');
    return { key, kind: c.kind, name: c.name, revenueBase, grossBase, hasGross, slices: sliceSum(doctors), orderCount: orders.size, doctors };
  });

  // Pay paydası: ekstre indirimi hariç brüt toplam (net paydada A=100 / yalnız indirimli B=−20 → A %125 olurdu)
  const total = built.reduce((s, r) => s + r.grossBase, 0);
  return built
    .map(({ grossBase, hasGross, ...r }): ClinicRow => ({ ...r, share: hasGross ? pct(grossBase, total) : null }))
    .sort((a, b) => {
      if ((a.kind === 'none') !== (b.kind === 'none')) return a.kind === 'none' ? 1 : -1;
      return b.revenueBase - a.revenueBase || (a.name ?? '').localeCompare(b.name ?? '');
    });
}

/** Başlıktaki klinik sayısı: yalnız ekstre indirimi olan (siparişsiz/faturasız) klinik sayılmaz. */
export function countClinicRows(rows: ClinicRow[]): number {
  return rows.filter(r => r.doctors.some(d => d.kind !== 'statement_discount')).length;
}

const KIND_ORDER: Record<ServiceRow['kind'], number> = { service: 0, other: 1, no_items: 2, statement_discount: 3 };

/** Başlıktaki işlem sayısı: ekstre indirimi satırı bir işlem değildir. */
export function countServiceRows(rows: ServiceRow[]): number {
  return rows.filter(r => r.kind !== 'statement_discount').length;
}

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

  // Pay paydası: ekstre indirimi hariç brüt toplam; indirim satırının payı yok
  const total = [...groups.values()].reduce((s, g) => (g.kind === 'statement_discount' ? s : s + g.base), 0);
  return [...groups.entries()]
    .map(([key, g]): ServiceRow => ({
      key, kind: g.kind, name: g.name, unit: g.unit, quantity: g.qty, revenueBase: g.base,
      slices: toSlices(g.ccy), share: g.kind === 'statement_discount' ? null : pct(g.base, total),
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
