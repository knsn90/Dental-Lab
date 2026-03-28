import { supabase } from '../../core/api/supabase';

export interface DashboardStats {
  totalOrders: number;
  overdueOrders: number;
  readyOrders: number;
  inProgressOrders: number;
  todayProvas: number;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const today = new Date().toISOString().split('T')[0];

  const [ordersRes, provasRes] = await Promise.all([
    supabase
      .from('work_orders')
      .select('status, delivery_date')
      .neq('status', 'teslim_edildi'),
    supabase
      .from('provas')
      .select('id')
      .eq('scheduled_date', today)
      .neq('status', 'tamamlandı'),
  ]);

  const orders = ordersRes.data ?? [];
  const provas = provasRes.data ?? [];

  const overdueOrders = orders.filter(
    (o) => o.delivery_date < today && o.status !== 'teslim_edildi'
  ).length;

  return {
    totalOrders: orders.length,
    overdueOrders,
    readyOrders: orders.filter((o) => o.status === 'teslimata_hazir').length,
    inProgressOrders: orders.filter((o) => o.status === 'uretimde').length,
    todayProvas: provas.length,
  };
}
