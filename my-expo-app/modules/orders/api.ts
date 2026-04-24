import { supabase } from '../../core/api/supabase';
import { WorkOrderStatus, MachineType, CreateWorkOrderParams } from './types';
import { createWorkflow } from '../workflow/engine';

export async function createWorkOrder(params: CreateWorkOrderParams & { measurement_type?: string; doctor_approval_required?: boolean }) {
  // Strip columns that do not yet exist in the production DB schema.
  // Only send fields confirmed to be in work_orders.
  const {
    patient_dob,          // migration 004 — not applied yet
    patient_phone,        // migration 004 — not applied yet
    patient_nationality,  // not in any migration
    patient_country,      // not in any migration
    patient_city,         // not in any migration
    measurement_type,     // workflow plan — not applied yet
    doctor_approval_required, // workflow plan — not applied yet
    ...safeParams
  } = params as any;

  const { data, error } = await supabase
    .from('work_orders')
    .insert(safeParams)
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
  // Önce siparişi ve auxiliary join'leri (assignee/photos/status/items) çek.
  // doctor_id polymorphic (doctors.id VEYA profiles.id) olduğundan otomatik
  // FK embed yapmıyoruz — manuel olarak iki tabloyu dener, bulduğumuzu yapıştırırız.
  const result = await supabase
    .from('work_orders')
    .select(
      `
      *,
      assignee:profiles!work_orders_assigned_to_fkey(id, full_name, role),
      photos:work_order_photos(*),
      status_history(*, changer:profiles!status_history_changed_by_fkey(id, full_name, role)),
      order_items(*)
    `
    )
    .eq('id', id)
    .order('created_at', { ascending: true, referencedTable: 'status_history' })
    .single();

  if (result.error || !result.data) return result;

  const doctorId: string | null = (result.data as any).doctor_id ?? null;
  if (doctorId) {
    // 1. Önce external doctors tablosu (lab/admin'in açtığı siparişler)
    const { data: extDoctor } = await supabase
      .from('doctors')
      .select('id, full_name, phone, clinic:clinics(id, name)')
      .eq('id', doctorId)
      .maybeSingle();

    if (extDoctor) {
      (result.data as any).doctor = extDoctor;
    } else {
      // 2. Bulunamadıysa profiles (hekim kendi açtı veya klinik müdürü)
      const { data: profDoctor } = await supabase
        .from('profiles')
        .select('id, full_name, phone, clinic_name')
        .eq('id', doctorId)
        .maybeSingle();

      if (profDoctor) {
        (result.data as any).doctor = {
          id: profDoctor.id,
          full_name: profDoctor.full_name,
          phone: profDoctor.phone,
          clinic: profDoctor.clinic_name
            ? { id: null, name: profDoctor.clinic_name }
            : null,
        };
      } else {
        (result.data as any).doctor = null;
      }
    }
  } else {
    (result.data as any).doctor = null;
  }

  return result;
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
