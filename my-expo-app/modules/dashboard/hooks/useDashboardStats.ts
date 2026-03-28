import { useState, useEffect } from 'react';
import { fetchDashboardStats, DashboardStats } from '../api';

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats>({
    totalOrders: 0,
    overdueOrders: 0,
    readyOrders: 0,
    inProgressOrders: 0,
    todayProvas: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const data = await fetchDashboardStats();
    setStats(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return { stats, loading, refetch: load };
}
