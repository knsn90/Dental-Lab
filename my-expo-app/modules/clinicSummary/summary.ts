// Klinik müşteri kartı — saf toplama (React/Supabase yok).
// Üye sayımı İş İstatistikleri ile BİREBİR: countOrders (iptal + dişsiz hariç,
// yerel ay). Ciro net (ekstre indirimi dahil), döviz başına; dövizler toplanmaz.
// `.ts` uzantılı yollar: node --test için (bkz. workStats/aggregate.ts notu).
import {
  countOrders, UNKNOWN_CLINIC_ID, type RawOrder, type Qty,
// @ts-expect-error TS5097
} from '../admin/workStats/aggregate.ts';
// @ts-expect-error TS5097
import { type MonthKey } from '../admin/workStats/months.ts';

export type Money = { currency: string; amount: number };
export interface RevenueRow { clinic_id: string | null; currency: string; revenue: number; revenue_base: number; row_kind?: string | null }
export interface BalanceRow {
  clinic_id: string; currency: string; balance: number; overdue_net: number;
  aging_current: number; aging_30: number; aging_60: number; aging_90: number; oldest_overdue_date: string | null;
}
export interface ReviewRow { clinic_id: string; overall: number | null }
export interface PeriodFigures { orders: number; qty: Qty; revenue: Money[]; revenueBase: number }
export interface ClinicSummary {
  clinicId: string; name: string;
  all: PeriodFigures; month: PeriodFigures;
  lastOrderAt: string | null;
  balance: Money[]; overdue: Money[];
  aging: { current: number; d30: number; d60: number; d90: number } | null;
  oldestOverdueDays: number | null;
  rating: { avg: number; count: number } | null;
}

export interface SummaryInput {
  orders: RawOrder[]; clinicByDoctor: Map<string, string>; clinicName: Map<string, string>;
  unitByServiceName: Map<string, string | null>;
  revenueAll: RevenueRow[]; revenueMonth: RevenueRow[];
  balances: BalanceRow[]; reviews: ReviewRow[];
  currentMonth: MonthKey; today: string;
}

const emptyFig = (): PeriodFigures => ({ orders: 0, qty: { uye: 0, cene: 0, adet: 0 }, revenue: [], revenueBase: 0 });
const n = (v: unknown) => Number(v) || 0;
const sortMoney = (list: Money[]) => list.sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency));

function dayNumber(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}

function addRevenue(fig: PeriodFigures, rows: RevenueRow[]) {
  const byCcy = new Map<string, number>();
  for (const r of rows) {
    byCcy.set(r.currency, (byCcy.get(r.currency) ?? 0) + n(r.revenue));
    fig.revenueBase += n(r.revenue_base);
  }
  fig.revenue = sortMoney([...byCcy].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })));
}

function groupBy<T>(rows: T[], key: (r: T) => string | null | undefined): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const arr = m.get(k);
    if (arr) arr.push(r); else m.set(k, [r]);
  }
  return m;
}

export function buildClinicSummaries(input: SummaryInput): Map<string, ClinicSummary> {
  const out = new Map<string, ClinicSummary>();
  for (const [id, name] of input.clinicName) {
    out.set(id, {
      clinicId: id, name, all: emptyFig(), month: emptyFig(), lastOrderAt: null,
      balance: [], overdue: [], aging: null, oldestOverdueDays: null, rating: null,
    });
  }

  const createdById = new Map<string, string | null>();
  for (const o of input.orders) createdById.set(o.id, o.created_at);
  const counted = countOrders({
    orders: input.orders, clinicByDoctor: input.clinicByDoctor,
    unitByServiceName: input.unitByServiceName, clinicName: input.clinicName,
  });
  for (const c of counted) {
    if (c.clinicId === UNKNOWN_CLINIC_ID) continue;
    const s = out.get(c.clinicId);
    if (!s) continue;
    const figs = c.month === input.currentMonth ? [s.all, s.month] : [s.all];
    for (const f of figs) { f.orders += 1; f.qty[c.bucket as keyof Qty] += c.qty; }
    const at = createdById.get(c.id) ?? null;
    if (at && (!s.lastOrderAt || new Date(at) > new Date(s.lastOrderAt))) s.lastOrderAt = at;
  }

  for (const [id, rows] of groupBy(input.revenueAll, (r) => r.clinic_id)) {
    const s = out.get(id); if (s) addRevenue(s.all, rows);
  }
  for (const [id, rows] of groupBy(input.revenueMonth, (r) => r.clinic_id)) {
    const s = out.get(id); if (s) addRevenue(s.month, rows);
  }

  const today = dayNumber(input.today);
  for (const [id, rows] of groupBy(input.balances, (r) => r.clinic_id)) {
    const s = out.get(id); if (!s) continue;
    s.balance = sortMoney(rows.filter((r) => n(r.balance) !== 0).map((r) => ({ currency: r.currency, amount: n(r.balance) })));
    s.overdue = sortMoney(rows.filter((r) => n(r.overdue_net) > 0).map((r) => ({ currency: r.currency, amount: n(r.overdue_net) })));
    if (rows.length === 1) {
      const r = rows[0];
      s.aging = { current: n(r.aging_current), d30: n(r.aging_30), d60: n(r.aging_60), d90: n(r.aging_90) };
    }
    let oldest: number | null = null;
    for (const r of rows) {
      if (n(r.overdue_net) <= 0 || !r.oldest_overdue_date) continue;
      const d = dayNumber(r.oldest_overdue_date);
      if (d != null && (oldest == null || d < oldest)) oldest = d;
    }
    s.oldestOverdueDays = oldest != null && today != null ? Math.max(0, today - oldest) : null;
  }

  for (const [id, rows] of groupBy(input.reviews, (r) => r.clinic_id)) {
    const s = out.get(id); if (!s) continue;
    const vals = rows.map((r) => r.overall).filter((v): v is number => typeof v === 'number' && v > 0);
    if (vals.length) s.rating = { avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10, count: vals.length };
  }
  return out;
}

export function pickMain(list: Money[]): { main: Money | null; rest: number } {
  if (!list.length) return { main: null, rest: 0 };
  const main = list.reduce((best, m) => (Math.abs(m.amount) > Math.abs(best.amount) ? m : best), list[0]);
  return { main, rest: list.length - 1 };
}

export type RankMode = 'uye' | 'score';
export interface RankedClinic { clinicId: string; name: string; uye: number; revenueBase: number; score: number; overdue: boolean }

export function rankTop(s: Map<string, ClinicSummary>, period: 'month' | 'all', mode: RankMode, limit = 5): RankedClinic[] {
  const rows: RankedClinic[] = [];
  for (const c of s.values()) {
    const f = c[period];
    if (f.qty.uye <= 0 && f.revenueBase <= 0) continue;
    rows.push({ clinicId: c.clinicId, name: c.name, uye: f.qty.uye, revenueBase: f.revenueBase, score: 0, overdue: c.overdue.length > 0 });
  }
  const maxU = Math.max(0, ...rows.map((r) => r.uye));
  const maxR = Math.max(0, ...rows.map((r) => r.revenueBase));
  for (const r of rows) {
    const u = maxU > 0 ? r.uye / maxU : 0;
    const v = maxR > 0 ? Math.max(0, r.revenueBase) / maxR : 0;
    r.score = Math.round(100 * (0.5 * u + 0.5 * v));
  }
  const key = (r: RankedClinic) => (mode === 'uye' ? r.uye : r.score);
  rows.sort((a, b) => key(b) - key(a) || b.uye - a.uye || a.name.localeCompare(b.name, 'tr'));
  return rows.slice(0, limit);
}
