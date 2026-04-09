import { supabase } from '../../../lib/supabase';

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
    .order('created_at', { ascending: false });

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
  const [ordersResult, profilesResult] = await Promise.all([
    supabase
      .from('work_orders')
      .select('*, doctor:doctor_id(full_name, clinic_name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, user_type, is_active'),
  ]);

  if (ordersResult.error) throw ordersResult.error;

  const orders = (ordersResult.data as RawOrder[]).map(mapOrder);
  const profiles = profilesResult.data ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayOrders = orders.filter((o) => {
    const d = new Date(o.created_at);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  }).length;

  const overdueOrders = orders.filter((o) => {
    if (o.status === 'teslim_edildi') return false;
    const delivery = new Date(o.delivery_date);
    return delivery < new Date();
  }).length;

  const totalDoctors = profiles.filter((p: any) => p.user_type === 'doctor').length;
  const totalLabUsers = profiles.filter((p: any) => p.user_type === 'lab').length;

  // By status
  const byStatus: Record<string, number> = {};
  orders.forEach((o) => {
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
  });

  // By work type
  const workTypeMap: Record<string, number> = {};
  orders.forEach((o) => {
    workTypeMap[o.work_type] = (workTypeMap[o.work_type] ?? 0) + 1;
  });
  const byWorkType = Object.entries(workTypeMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // By doctor
  const doctorMap: Record<string, number> = {};
  orders.forEach((o) => {
    const name = o.doctor_name;
    doctorMap[name] = (doctorMap[name] ?? 0) + 1;
  });
  const byDoctor = Object.entries(doctorMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Monthly last 6 months
  const monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const monthMap: Record<string, number> = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthMap[key] = 0;
  }
  orders.forEach((o) => {
    const d = new Date(o.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key in monthMap) monthMap[key] += 1;
  });
  const monthly = Object.entries(monthMap).map(([key, count]) => {
    const [year, month] = key.split('-');
    return { month: `${monthNames[parseInt(month) - 1]} ${year}`, count };
  });

  const recentOrders = orders.slice(0, 8);

  return {
    totalOrders: orders.length,
    todayOrders,
    overdueOrders,
    totalDoctors,
    totalLabUsers,
    byStatus,
    byWorkType,
    byDoctor,
    monthly,
    recentOrders,
  };
}
