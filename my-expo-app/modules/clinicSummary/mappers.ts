// Supabase satırlarını summary.ts girdilerine çeviren saf eşleyiciler.
// Supabase numeric'i string döndürebilir → hep Number()||0.
// @ts-expect-error TS5097 (bkz. workStats/aggregate.ts notu)
import { type RevenueRow, type ReviewRow, type BalanceRow } from './summary.ts';

const n = (v: unknown) => Number(v) || 0;

export function mapRevenueRows(rows: any[]): RevenueRow[] {
  const out: RevenueRow[] = [];
  for (const r of rows ?? []) {
    if (!r?.clinic_id) continue;
    out.push({
      clinic_id: String(r.clinic_id), currency: String(r.currency || 'TRY'),
      revenue: n(r.revenue), revenue_base: n(r.revenue_base), row_kind: r.row_kind ?? null,
    });
  }
  return out;
}

export function mapReviewRows(
  rows: { overall: number | null; work_order_id: string }[],
  orderDoctor: Map<string, string>, clinicByDoctor: Map<string, string>,
): ReviewRow[] {
  const out: ReviewRow[] = [];
  for (const r of rows ?? []) {
    const doc = orderDoctor.get(r.work_order_id);
    const clinic = doc ? clinicByDoctor.get(doc) : undefined;
    if (clinic) out.push({ clinic_id: clinic, overall: r.overall });
  }
  return out;
}

export function mapBalanceRows(rows: any[], labId: string): BalanceRow[] {
  const out: BalanceRow[] = [];
  for (const r of rows ?? []) {
    if (!r?.clinic_id || (r.lab_id && r.lab_id !== labId)) continue;
    out.push({
      clinic_id: String(r.clinic_id), currency: String(r.currency || 'TRY'),
      balance: n(r.balance), overdue_net: n(r.overdue_net),
      aging_current: n(r.aging_current), aging_30: n(r.aging_30), aging_60: n(r.aging_60), aging_90: n(r.aging_90),
      oldest_overdue_date: r.oldest_overdue_date ?? null,
    });
  }
  return out;
}
