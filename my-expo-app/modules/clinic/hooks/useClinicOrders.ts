import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../core/api/supabase';
import { WorkOrder } from '../../../lib/types';
import { fetchClinicOrders, fetchClinicDoctorProfiles } from '../api';

interface ClinicWorkOrder extends WorkOrder {
  doctor_profile?: { id: string; full_name: string; avatar_url?: string | null };
}

/**
 * Klinik müdürü için tüm klinik siparişleri.
 * RLS "clinic_admin_view_clinic_orders" policy'si filtreyi yapar.
 * Doctor bilgisi için profiles tablosundan ayrı sorgu.
 */
export function useClinicOrders(enabled = true) {
  const [orders,  setOrders]  = useState<ClinicWorkOrder[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchClinicOrders();
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const raw = (data as WorkOrder[]) ?? [];

    // Doctor profile lookup
    const uniqueDoctorIds = Array.from(new Set(raw.map(o => o.doctor_id))).filter(Boolean);
    const { data: profiles } = await fetchClinicDoctorProfiles(uniqueDoctorIds);
    const byId = new Map<string, any>();
    (profiles ?? []).forEach((p: any) => byId.set(p.id, p));

    const enriched: ClinicWorkOrder[] = raw.map(o => ({
      ...o,
      doctor_profile: byId.get(o.doctor_id),
    }));
    setOrders(enriched);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    load();

    // Realtime — kendi kliniğin herhangi bir siparişi değiştiğinde güncelle
    const channel = supabase
      .channel('clinic_work_orders_realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders' },
        () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load, enabled]);

  return { orders, loading, error, refetch: load };
}
