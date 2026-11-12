// Klinik müşteri kartı verisi — istemcide toplanır, DB değişikliği yok.
// Kaynaklar: work_orders (+ workStats refs), profitability_by_clinic,
// v_clinic_balance_ccy, order_reviews, order_messages.
import { supabase } from '../../core/api/supabase';
import { labTodayOf } from '../../core/metrics/orderDefs';
import { cachedLabTz } from '../../core/metrics/useLabToday';
import { fetchAllPages } from '../admin/workStats/fetchAllPages';
import { fetchWorkStatsRefs } from '../admin/workStats/api';
import type { RawOrder } from '../admin/workStats/aggregate';
import { fetchClinicBalancesByCurrency } from '../invoices/api';
import { buildClinicSummaries, type ClinicSummary } from './summary';
import { mapRevenueRows, mapReviewRows, mapBalanceRows } from './mappers';

export { mapRevenueRows, mapReviewRows, mapBalanceRows };

/** Kullanıcının göremediği kaynak (RLS / yetki) boş sayılır; özetin geri kalanı çalışır. */
async function softRpc(fn: string, args: Record<string, unknown>): Promise<any[]> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return [];
  return Array.isArray(data) ? data : [];
}

let ordersById = new Map<string, { doctor_id: string | null; order_number: string | null }>();
let clinicDoctors = new Map<string, string[]>();

/** Oturum kapanınca / lab değişince modül eşlemelerini sıfırla. */
export function resetClinicSummaryRefs() {
  ordersById = new Map();
  clinicDoctors = new Map();
}

/** Tüm klinik özetleri. Sipariş/refs hatası fırlatır; ciro/bakiye/puan yumuşak. */
export async function fetchClinicSummaryData(labId: string): Promise<Map<string, ClinicSummary>> {
  const today = labTodayOf(cachedLabTz());
  const monthStart = `${today.slice(0, 7)}-01`;
  const [orders, refs, revenueAll, revenueMonth, balances, reviews, logos] = await Promise.all([
    fetchAllPages<RawOrder>((from, to) =>
      supabase.from('work_orders')
        .select('id, order_number, work_type, status, created_at, tooth_numbers, doctor_id')
        .eq('lab_id', labId).order('created_at').order('id').range(from, to) as any),
    fetchWorkStatsRefs(labId),
    softRpc('profitability_by_clinic', { p_lab_id: labId, p_from: '2000-01-01', p_to: today }),
    softRpc('profitability_by_clinic', { p_lab_id: labId, p_from: monthStart, p_to: today }),
    fetchClinicBalancesByCurrency().then((r) => (r.error ? [] : r.data)).catch(() => []),
    fetchAllPages<{ overall: number | null; work_order_id: string }>((from, to) =>
      supabase.from('order_reviews').select('overall, work_order_id').eq('lab_id', labId)
        .order('id').range(from, to) as any).catch(() => []),
    fetchAllPages<{ id: string; logo_url: string | null }>((from, to) =>
      supabase.from('clinics').select('id, logo_url').eq('lab_id', labId).not('logo_url', 'is', null)
        .order('id').range(from, to) as any).catch(() => []),
  ]);

  const orderDoctor = new Map<string, string>();
  const byId = new Map<string, { doctor_id: string | null; order_number: string | null }>();
  for (const o of orders) {
    byId.set(o.id, { doctor_id: o.doctor_id, order_number: o.order_number });
    if (o.doctor_id) orderDoctor.set(o.id, o.doctor_id);
  }
  const docs = new Map<string, string[]>();
  for (const [doc, clinic] of refs.clinicByDoctor) {
    const arr = docs.get(clinic); if (arr) arr.push(doc); else docs.set(clinic, [doc]);
  }
  ordersById = byId;
  clinicDoctors = docs;

  const summaries = buildClinicSummaries({
    orders, clinicByDoctor: refs.clinicByDoctor, clinicName: refs.clinicName,
    unitByServiceName: refs.unitByServiceName,
    revenueAll: mapRevenueRows(revenueAll), revenueMonth: mapRevenueRows(revenueMonth),
    balances: mapBalanceRows(balances as any[], labId),
    reviews: mapReviewRows(reviews, orderDoctor, refs.clinicByDoctor),
    currentMonth: today.slice(0, 7), today,
  });
  for (const l of logos) {
    const s = summaries.get(l.id);
    if (s && l.logo_url) s.logoUrl = l.logo_url;
  }
  return summaries;
}

export interface RecentMessage { id: string; workOrderId: string; orderNumber: string; content: string; createdAt: string }

/** Kliniğin siparişlerindeki son onaylı yazışmalar (sohbet kutusunun kuralıyla aynı).
 *  Hekimler doğrudan okunur — özet yüklenmesini beklemez. */
export async function fetchClinicRecentMessages(clinicId: string, labId: string, limit = 3): Promise<RecentMessage[]> {
  let doctors = clinicDoctors.get(clinicId) ?? [];
  if (!doctors.length) {
    const { data: docs, error: de } = await supabase.from('doctors').select('id').eq('lab_id', labId).eq('clinic_id', clinicId);
    if (de) throw de;
    doctors = (docs ?? []).map((d: any) => d.id as string);
  }
  if (!doctors.length) return [];
  const { data: ords, error: oe } = await supabase.from('work_orders').select('id, order_number')
    .eq('lab_id', labId).in('doctor_id', doctors).order('created_at', { ascending: false }).limit(200);
  if (oe) throw oe;
  const ids = (ords ?? []).map((o: any) => o.id as string);
  if (!ids.length) return [];
  const numbers = new Map<string, string>((ords ?? []).map((o: any) => [o.id, o.order_number ?? '']));
  const { data, error } = await supabase.from('order_messages')
    .select('id, work_order_id, content, created_at, approval_status')
    .in('work_order_id', ids).order('created_at', { ascending: false }).limit(limit * 5);
  if (error) throw error;
  const out: RecentMessage[] = [];
  for (const m of (data ?? []) as any[]) {
    if (m.approval_status && m.approval_status !== 'approved') continue;
    const text = String(m.content ?? '').trim();
    if (!text) continue;
    out.push({
      id: m.id, workOrderId: m.work_order_id,
      orderNumber: numbers.get(m.work_order_id) ?? ordersById.get(m.work_order_id)?.order_number ?? '',
      content: text, createdAt: m.created_at,
    });
    if (out.length >= limit) break;
  }
  return out;
}
