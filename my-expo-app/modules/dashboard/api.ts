import { supabase } from '../../core/api/supabase';

export interface DashboardStats {
  totalOrders: number;
  overdueOrders: number;
  readyOrders: number;
  inProgressOrders: number;
  todayProvas: number;
}

const EMPTY_STATS: DashboardStats = {
  totalOrders: 0,
  overdueOrders: 0,
  readyOrders: 0,
  inProgressOrders: 0,
  todayProvas: 0,
};

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('get_dashboard_stats');
  if (error || !data) return EMPTY_STATS;
  return data as DashboardStats;
}
