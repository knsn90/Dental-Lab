import { supabase } from '../../core/api/supabase';
import { ProvaStatus, ProvaType } from './types';
import { ymdLocal } from '../../core/util/dates';

export async function fetchProvas(workOrderId: string) {
  return supabase
    .from('provas')
    .select('*')
    .eq('work_order_id', workOrderId)
    .order('scheduled_date', { ascending: true });
}

export async function createProva(data: {
  work_order_id: string;
  order_item_id?: string | null;
  order_item_name?: string | null;
  prova_number: number;
  prova_type?: ProvaType | null;
  scheduled_date?: string | null;
  sent_date?: string | null;
  quota?: number | null;
  lab_notes?: string | null;
  created_by: string;
}) {
  return supabase.from('provas').insert({ status: 'planlandı', ...data }).select().single();
}

export async function updateProva(
  id: string,
  data: Partial<{
    prova_type: ProvaType;
    scheduled_date: string;
    sent_date: string;
    return_date: string;
    quota: number;
    doctor_notes: string;
    lab_notes: string;
    status: ProvaStatus;
  }>
) {
  return supabase.from('provas').update(data).eq('id', id).select().single();
}

export async function fetchTodayProvas() {
  const today = ymdLocal(); // yerel gün — UTC kayması yok
  // doctor:doctors(...) embed'i YOK — work_orders.doctor_id→doctors FK'sı
  // migration 037'de düştü; embed 400 veriyor. İkinci sorguyla iliştirilir.
  const res = await supabase
    .from('provas')
    .select('*, work_order:work_orders(id, order_number, patient_name, doctor_id)')
    .eq('scheduled_date', today)
    .neq('status', 'tamamlandı')
    .order('prova_type');
  if (!res.data || res.data.length === 0) return res;

  const ids = Array.from(new Set(
    (res.data as any[]).map(r => r.work_order?.doctor_id).filter(Boolean),
  ));
  if (ids.length === 0) return res;

  const [docsRes, profsRes] = await Promise.all([
    supabase.from('doctors').select('id, full_name, clinic:clinics(name)').in('id', ids),
    supabase.from('profiles').select('id, full_name, clinic_name').in('id', ids),
  ]);
  const map = new Map<string, any>();
  for (const d of (docsRes.data ?? []) as any[]) map.set(d.id, { full_name: d.full_name, clinic: d.clinic ?? null });
  for (const p of (profsRes.data ?? []) as any[]) {
    if (map.has(p.id)) continue; // doctors önceliği
    map.set(p.id, { full_name: p.full_name, clinic: p.clinic_name ? { name: p.clinic_name } : null });
  }
  (res as any).data = (res.data as any[]).map(r => ({
    ...r,
    work_order: r.work_order
      ? { ...r.work_order, doctor: map.get(r.work_order.doctor_id) ?? null }
      : r.work_order,
  }));
  return res;
}

export async function fetchPatientOrders(
  patientId: string | null,
  patientName: string | null,
  excludeOrderId: string
) {
  if (!patientId && !patientName) return { data: [], error: null };
  let query = supabase
    .from('work_orders')
    .select('id, order_number, work_type, status, delivery_date')
    .neq('id', excludeOrderId)
    .order('created_at', { ascending: false });
  if (patientId) {
    query = query.eq('patient_id', patientId);
  } else if (patientName) {
    query = query.ilike('patient_name', patientName);
  }
  return query;
}
