import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchAllOrders,
  fetchOrderById,
  fetchOrderStats,
  updateOrderStatus,
  assignTechnicianToOrder,
  fetchTechniciansList,
  AdminOrder,
  OrderStats,
  Technician,
} from './service';

export function useAdminOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllOrders();
      setOrders(data);
    } catch (e: any) {
      setError(e.message ?? 'Siparişler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => {
    load();
  }, [load]);

  const filter = useCallback(
    (status: string | null, search: string, overdueOnly: boolean): AdminOrder[] => {
      const now = new Date();
      return orders.filter((o) => {
        if (status && status !== 'all' && o.status !== status) return false;
        if (overdueOnly) {
          if (o.status === 'teslim_edildi') return false;
          if (new Date(o.delivery_date) >= now) return false;
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          return (
            o.order_number.toLowerCase().includes(q) ||
            o.doctor_name.toLowerCase().includes(q) ||
            o.clinic_name.toLowerCase().includes(q) ||
            o.work_type.toLowerCase().includes(q) ||
            (o.patient_name ?? '').toLowerCase().includes(q)
          );
        }
        return true;
      });
    },
    [orders]
  );

  const unassignedAlindi = useMemo(
    () => orders.filter((o) => o.status === 'alindi' && !o.assigned_to),
    [orders]
  );

  return { orders, loading, error, refresh, filter, unassignedAlindi };
}

export function useAssignTechnician(onSuccess: () => void) {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loadingTechs, setLoadingTechs] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const loadTechnicians = useCallback(async () => {
    setLoadingTechs(true);
    try {
      const list = await fetchTechniciansList();
      setTechnicians(list);
    } catch {}
    finally { setLoadingTechs(false); }
  }, []);

  const assign = useCallback(async (orderId: string, technicianId: string) => {
    setAssigning(true);
    try {
      await assignTechnicianToOrder(orderId, technicianId);
      onSuccess();
    } catch (e: any) {
      throw e;
    } finally {
      setAssigning(false);
    }
  }, [onSuccess]);

  return { technicians, loadingTechs, assigning, loadTechnicians, assign };
}

export function useAdminOrderDetail(id: string) {
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await fetchOrderById(id);
      setOrder(data);
    } catch (e) {
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = useCallback(
    async (newStatus: string, note?: string) => {
      if (!id) return;
      setUpdating(true);
      try {
        await updateOrderStatus(id, newStatus, note);
        setOrder((prev) => prev ? { ...prev, status: newStatus } : prev);
      } finally {
        setUpdating(false);
      }
    },
    [id]
  );

  return { order, loading, updating, changeStatus, refresh: load };
}

export function useAdminDashboard() {
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOrderStats();
      setStats(data);
    } catch (e) {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { stats, loading, refresh: load };
}
