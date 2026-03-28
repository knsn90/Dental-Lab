import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export interface SalesReport {
  period: string;
  totalOrders: number;
  completedOrders: number;
  overdueOrders: number;
  byWorkType: { type: string; count: number; percentage: number }[];
  byDoctor: { name: string; count: number; completedCount: number }[];
  monthly: { month: string; count: number; completedCount: number }[];
  completionRate: number;
}

export interface OverdueReport {
  orders: {
    id: string;
    order_number: string;
    doctor_name: string;
    work_type: string;
    delivery_date: string;
    daysOverdue: number;
    status: string;
  }[];
  avgDaysOverdue: number;
  worstDoctor: string;
}

interface RawOrder {
  id: string;
  order_number: string;
  doctor_id: string;
  work_type: string;
  status: string;
  delivery_date: string;
  created_at: string;
  doctor?: { full_name: string } | null;
}

const MONTH_NAMES = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(key: string): string {
  const [year, month] = key.split('-');
  return `${MONTH_NAMES[parseInt(month) - 1]} ${year}`;
}

function computeStats(orders: RawOrder[], days: number) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const filtered = days > 0
    ? orders.filter((o) => new Date(o.created_at) >= cutoff)
    : orders;

  const totalOrders = filtered.length;
  const completedOrders = filtered.filter((o) => o.status === 'teslim_edildi').length;
  const overdueOrders = filtered.filter((o) => {
    if (o.status === 'teslim_edildi') return false;
    return new Date(o.delivery_date) < now;
  }).length;
  const completionRate = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;

  // By work type
  const workTypeMap: Record<string, number> = {};
  filtered.forEach((o) => {
    workTypeMap[o.work_type] = (workTypeMap[o.work_type] ?? 0) + 1;
  });
  const byWorkType = Object.entries(workTypeMap)
    .map(([type, count]) => ({
      type,
      count,
      percentage: totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // By doctor
  const doctorMap: Record<string, { count: number; completedCount: number }> = {};
  filtered.forEach((o) => {
    const name = o.doctor?.full_name ?? 'Bilinmeyen';
    if (!doctorMap[name]) doctorMap[name] = { count: 0, completedCount: 0 };
    doctorMap[name].count += 1;
    if (o.status === 'teslim_edildi') doctorMap[name].completedCount += 1;
  });
  const byDoctor = Object.entries(doctorMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Monthly (last 6 months)
  const monthMap: Record<string, { count: number; completedCount: number }> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthMap[getMonthKey(d)] = { count: 0, completedCount: 0 };
  }
  filtered.forEach((o) => {
    const key = getMonthKey(new Date(o.created_at));
    if (monthMap[key] !== undefined) {
      monthMap[key].count += 1;
      if (o.status === 'teslim_edildi') monthMap[key].completedCount += 1;
    }
  });
  const monthly = Object.entries(monthMap).map(([key, v]) => ({
    month: getMonthLabel(key),
    ...v,
  }));

  return { totalOrders, completedOrders, overdueOrders, completionRate, byWorkType, byDoctor, monthly };
}

export function useOverviewReport() {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select('id, order_number, doctor_id, work_type, status, delivery_date, created_at, doctor:doctor_id(full_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const orders = (data ?? []) as RawOrder[];
      const stats = computeStats(orders, 0); // all time

      setReport({ period: 'Tüm Zamanlar', ...stats });
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { report, loading, refresh: load };
}

export function useSalesReport() {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<30 | 60 | 90>(30);

  const load = useCallback(async (days: number) => {
    setLoading(true);
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('work_orders')
        .select('id, order_number, doctor_id, work_type, status, delivery_date, created_at, doctor:doctor_id(full_name)')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const orders = (data ?? []) as RawOrder[];
      const stats = computeStats(orders, 0); // already filtered by cutoff

      setReport({ period: `Son ${days} Gün`, ...stats });
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(dateRange); }, [load, dateRange]);

  const handleSetDateRange = useCallback((days: 30 | 60 | 90) => {
    setDateRange(days);
  }, []);

  return { report, loading, dateRange, setDateRange: handleSetDateRange };
}

export function useOverdueReport() {
  const [report, setReport] = useState<OverdueReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('work_orders')
        .select('id, order_number, doctor_id, work_type, status, delivery_date, created_at, doctor:doctor_id(full_name)')
        .lt('delivery_date', today)
        .neq('status', 'teslim_edildi')
        .order('delivery_date', { ascending: true });

      if (error) throw error;
      const raw = (data ?? []) as RawOrder[];

      const now = new Date();
      const orders = raw.map((o) => {
        const diff = now.getTime() - new Date(o.delivery_date).getTime();
        const daysOverdue = Math.floor(diff / (1000 * 60 * 60 * 24));
        return {
          id: o.id,
          order_number: o.order_number,
          doctor_name: o.doctor?.full_name ?? 'Bilinmeyen',
          work_type: o.work_type,
          delivery_date: o.delivery_date,
          daysOverdue,
          status: o.status,
        };
      }).sort((a, b) => b.daysOverdue - a.daysOverdue);

      const avgDaysOverdue = orders.length > 0
        ? Math.round(orders.reduce((s, o) => s + o.daysOverdue, 0) / orders.length)
        : 0;

      // Worst doctor: doctor with most overdue orders
      const doctorMap: Record<string, number> = {};
      orders.forEach((o) => {
        doctorMap[o.doctor_name] = (doctorMap[o.doctor_name] ?? 0) + 1;
      });
      const worstDoctor = Object.entries(doctorMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

      setReport({ orders, avgDaysOverdue, worstDoctor });
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { report, loading, refresh: load };
}
