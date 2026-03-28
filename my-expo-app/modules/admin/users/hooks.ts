import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export interface AdminUser {
  id: string;
  full_name: string;
  user_type: 'lab' | 'doctor';
  role: string | null;
  clinic_name: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AdminUserOrder {
  id: string;
  order_number: string;
  work_type: string;
  status: string;
  delivery_date: string;
  created_at: string;
}

export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, user_type, role, clinic_name, phone, is_active, created_at')
        .neq('user_type', 'admin')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers((data ?? []) as AdminUser[]);
    } catch (e) {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActive = useCallback(async (id: string, currentActive: boolean) => {
    const newActive = !currentActive;
    // Optimistic update
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, is_active: newActive } : u))
    );
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: newActive })
        .eq('id', id);
      if (error) {
        // Revert on error
        setUsers((prev) =>
          prev.map((u) => (u.id === id ? { ...u, is_active: currentActive } : u))
        );
      }
    } catch {
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, is_active: currentActive } : u))
      );
    }
  }, []);

  const refresh = useCallback(() => load(), [load]);

  return { users, loading, toggleActive, refresh };
}

export function useAdminUserDetail(id: string) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [orders, setOrders] = useState<AdminUserOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [userResult, ordersResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, user_type, role, clinic_name, phone, is_active, created_at')
          .eq('id', id)
          .single(),
        supabase
          .from('work_orders')
          .select('id, order_number, work_type, status, delivery_date, created_at')
          .eq('doctor_id', id)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      if (userResult.error) throw userResult.error;
      setUser(userResult.data as AdminUser);
      setOrders((ordersResult.data ?? []) as AdminUserOrder[]);
    } catch {
      setUser(null);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActive = useCallback(async (currentActive: boolean) => {
    if (!user) return;
    const newActive = !currentActive;
    setUser((prev) => prev ? { ...prev, is_active: newActive } : prev);
    try {
      await supabase.from('profiles').update({ is_active: newActive }).eq('id', id);
    } catch {
      setUser((prev) => prev ? { ...prev, is_active: currentActive } : prev);
    }
  }, [id, user]);

  return { user, orders, loading, toggleActive, refresh: load };
}
