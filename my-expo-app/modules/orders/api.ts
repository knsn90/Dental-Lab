import { supabase } from '../../core/api/supabase';
import { WorkOrderStatus, MachineType, CreateWorkOrderParams } from './types';
import { createWorkflow } from '../workflow/engine';

export async function createWorkOrder(params: CreateWorkOrderParams & { measurement_type?: string; doctor_approval_required?: boolean }) {
  const { data, error } = await supabase
    .from('work_orders')
    .insert(params)
    .select()
    .single();

  if (!error && data) {
    const measurementType = (params.measurement_type ?? 'manual') as 'manual' | 'digital';
    await createWorkflow(data.id, measurementType);
  }

  return { data, error };
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

// ─── Order Items ─────────────────────────────────────────────────────────────

export async function fetchOrderItems(workOrderId: string) {
  return supabase
    .from('order_items')
    .select('*')
    .eq('work_order_id', workOrderId)
    .order('created_at');
}

export async function addOrderItem(data: {
  work_order_id: string;
  service_id?: string;
  name: string;
  price: number;
  quantity?: number;
  notes?: string;
}) {
  return supabase.from('order_items').insert(data).select().single();
}

export async function updateOrderItem(
  id: string,
  data: Partial<{ price: number; quantity: number; notes: string }>
) {
  return supabase.from('order_items').update(data).eq('id', id).select().single();
}

export async function deleteOrderItem(id: string) {
  return supabase.from('order_items').delete().eq('id', id);
}
