import { supabase } from '../../core/api/supabase';
import { ProvaStatus, ProvaType } from './types';

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
  const today = new Date().toISOString().split('T')[0];
  return supabase
    .from('provas')
    .select(
      `*, work_order:work_orders(
        id, order_number, patient_name,
        doctor:profiles!work_orders_doctor_id_fkey(full_name, clinic_name)
      )`
    )
    .eq('scheduled_date', today)
    .neq('status', 'tamamlandı')
    .order('prova_type');
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
