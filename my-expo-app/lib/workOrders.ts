import { supabase } from './supabase';
import { WorkOrderStatus, MachineType } from './types';

export interface CreateWorkOrderParams {
  doctor_id: string;
  patient_name?: string;
  patient_id?: string;
  patient_gender?: string;
  department?: string;
  tags?: string[];
  tooth_numbers: number[];
  work_type: string;
  shade?: string;
  machine_type: MachineType;
  model_type?: string;
  is_urgent?: boolean;
  notes?: string;
  lab_notes?: string;
  delivery_date: string; // YYYY-MM-DD
}

export async function createWorkOrder(params: CreateWorkOrderParams) {
  return supabase.from('work_orders').insert(params).select().single();
}

export async function fetchWorkOrdersForDoctor(doctorId: string) {
  return supabase
    .from('work_orders')
    .select('*')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false });
}

export async function fetchAllWorkOrders() {
  return supabase
    .from('work_orders')
    .select('*, doctor:doctors!work_orders_doctor_id_fkey(full_name, clinic:clinics(name))')
    .order('delivery_date', { ascending: true });
}

export async function fetchWorkOrderById(id: string) {
  return supabase
    .from('work_orders')
    .select(
      `
      *,
      doctor:doctors!work_orders_doctor_id_fkey(id, full_name, phone, clinic:clinics(id, name)),
      assignee:profiles!work_orders_assigned_to_fkey(id, full_name, role),
      photos:work_order_photos(*),
      status_history(*, changer:profiles!status_history_changed_by_fkey(id, full_name, role))
    `
    )
    .eq('id', id)
    .order('created_at', { ascending: true, referencedTable: 'status_history' })
    .single();
}

export async function advanceOrderStatus(
  workOrderId: string,
  newStatus: WorkOrderStatus,
  changedBy: string,
  note?: string
) {
  return supabase.rpc('update_work_order_status', {
    p_work_order_id: workOrderId,
    p_new_status: newStatus,
    p_changed_by: changedBy,
    p_note: note ?? null,
  });
}

export async function assignTechnician(workOrderId: string, technicianId: string) {
  return supabase
    .from('work_orders')
    .update({ assigned_to: technicianId })
    .eq('id', workOrderId);
}

export async function fetchTodayAndOverdueOrders() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return supabase
    .from('work_orders')
    .select('*, doctor:doctors!work_orders_doctor_id_fkey(full_name, clinic:clinics(name))')
    .lte('delivery_date', today)
    .neq('status', 'teslim_edildi')
    .order('delivery_date', { ascending: true });
}

export async function fetchLabTechnicians() {
  return supabase.from('profiles').select('id, full_name, role').eq('user_type', 'lab');
}
