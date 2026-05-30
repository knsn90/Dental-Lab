import { supabase } from '../../../core/api/supabase';

export interface AdminOrder {
  id: string;
  order_number: string;
  doctor_id: string;
  doctor_name: string;
  clinic_name: string;
  tooth_numbers: number[];
  work_type: string;
  shade: string | null;
  machine_type: 'milling' | '3d_printing';
  status: string;
  notes: string | null;
  lab_notes: string | null;
  delivery_date: string;
  delivered_at: string | null;
  created_at: string;
  is_urgent: boolean;
  patient_name: string | null;
  department: string | null;
  assigned_to: string | null;
  assignee_name: string | null;
}

export interface Technician {
  id: string;
  full_name: string;
  role: string | null;
}

interface RawOrder {
  id: string;
  order_number: string;
  doctor_id: string;
  tooth_numbers: number[];
  work_type: string;
  shade: string | null;
  machine_type: 'milling' | '3d_printing';
  status: string;
  notes: string | null;
  lab_notes: string | null;
  delivery_date: string;
  delivered_at: string | null;
  created_at: string;
  is_urgent: boolean;
  patient_name: string | null;
  department: string | null;
  assigned_to: string | null;
  doctor?: {
    full_name: string;
    clinic_name: string | null;
    phone?: string | null;
  } | null;
  assignee?: {
    id: string;
    full_name: string;
    role: string | null;
  } | null;
}

function mapOrder(raw: RawOrder): AdminOrder {
  return {
    id: raw.id,
    order_number: raw.order_number,
    doctor_id: raw.doctor_id,
    doctor_name: raw.doctor?.full_name ?? 'Bilinmeyen Hekim',
    clinic_name: raw.doctor?.clinic_name ?? '',
    tooth_numbers: raw.tooth_numbers ?? [],
    work_type: raw.work_type,
    shade: raw.shade,
    machine_type: raw.machine_type,
    status: raw.status,
    notes: raw.notes,
    lab_notes: raw.lab_notes,
    delivery_date: raw.delivery_date,
    delivered_at: raw.delivered_at,
    created_at: raw.created_at,
    is_urgent: raw.is_urgent ?? false,
    patient_name: raw.patient_name,
    department: raw.department,
    assigned_to: raw.assigned_to ?? null,
    assignee_name: raw.assignee?.full_name ?? null,
  };
}

export async function fetchAllOrders(): Promise<AdminOrder[]> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('*, doctor:doctor_id(full_name, clinic_name), assignee:assigned_to(id, full_name, role)')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data as RawOrder[]).map(mapOrder);
}

export async function assignTechnicianToOrder(orderId: string, technicianId: string): Promise<void> {
  const { error } = await supabase
    .from('work_orders')
    .update({ assigned_to: technicianId })
    .eq('id', orderId);
  if (error) throw error;
}

export async function fetchTechniciansList(): Promise<Technician[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('user_type', 'lab')
    .eq('is_active', true)
    .order('full_name');
  if (error) throw error;
  return (data ?? []) as Technician[];
}

export async function fetchOrderById(id: string): Promise<AdminOrder | null> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('*, doctor:doctor_id(full_name, clinic_name, phone), order_items(*), provas(*)')
    .eq('id', id)
    .single();

  if (error) return null;
  return mapOrder(data as RawOrder);
}

export async function updateOrderStatus(id: string, status: string, note?: string): Promise<void> {
  const updates: Record<string, unknown> = { status };
  if (status === 'teslim_edildi') {
    updates.delivered_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from('work_orders')
    .update(updates)
    .eq('id', id);

  if (updateError) throw updateError;

  const { data: { user } } = await supabase.auth.getUser();
  const { error: histError } = await supabase
    .from('status_history')
    .insert({
      work_order_id: id,
      new_status: status,
      note: note ?? null,
      changed_by: user?.id ?? null,
    });

  if (histError) {
    console.warn('Status history insert failed:', histError.message);
  }
}

export async function deleteOrder(id: string): Promise<void> {
  const { error } = await supabase
    .from('work_orders')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export interface OrderStats {
  totalOrders: number;
  todayOrders: number;
  overdueOrders: number;
  totalDoctors: number;
  totalLabUsers: number;
  byStatus: Record<string, number>;
  byWorkType: { label: string; count: number }[];
  byDoctor: { name: string; count: number }[];
  monthly: { month: string; count: number }[];
  recentOrders: AdminOrder[];
}

export async function fetchOrderStats(): Promise<OrderStats> {
  const { data, error } = await supabase.rpc('get_admin_stats');
  if (error) throw error;

  const raw = data as any;
  const monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

  // RPC returns only months with data — fill missing months with 0
  const monthlyRaw: Record<string, number> = {};
  (raw.monthly ?? []).forEach((m: any) => { monthlyRaw[m.month_key] = m.count; });
  const now = new Date();
  const monthly = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthly.push({ month: `${monthNames[parseInt(key.split('-')[1]) - 1]} ${key.split('-')[0]}`, count: monthlyRaw[key] ?? 0 });
  }

  return {
    totalOrders:   raw.total_orders   ?? 0,
    todayOrders:   raw.today_orders   ?? 0,
    overdueOrders: raw.overdue_orders ?? 0,
    totalDoctors:  raw.total_doctors  ?? 0,
    totalLabUsers: raw.total_lab_users ?? 0,
    byStatus:      raw.by_status      ?? {},
    byWorkType:    raw.by_work_type   ?? [],
    byDoctor:      raw.by_doctor      ?? [],
    monthly,
    recentOrders:  (raw.recent_orders ?? []).map((r: any): AdminOrder => ({
      id:            r.id,
      order_number:  r.order_number,
      doctor_id:     r.doctor_id,
      doctor_name:   r.doctor_full_name  ?? 'Bilinmeyen Hekim',
      clinic_name:   r.doctor_clinic_name ?? '',
      tooth_numbers: r.tooth_numbers ?? [],
      work_type:     r.work_type,
      shade:         r.shade,
      machine_type:  r.machine_type,
      status:        r.status,
      notes:         r.notes,
      lab_notes:     r.lab_notes,
      delivery_date: r.delivery_date,
      delivered_at:  r.delivered_at,
      created_at:    r.created_at,
      is_urgent:     r.is_urgent ?? false,
      patient_name:  r.patient_name,
      department:    r.department,
      assigned_to:   r.assigned_to ?? null,
      assignee_name: null,
    })),
  };
}
