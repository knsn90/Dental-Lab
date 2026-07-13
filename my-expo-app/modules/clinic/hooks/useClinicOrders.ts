import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { WorkOrder } from '../../../lib/types';
import { fetchClinicOrders, fetchMyClinicDoctors } from '../api';
import { getActiveLabId } from '../../../core/store/activeLabStore';

// v3: aktif lab'a göre ayrık cache — çoklu-lab'da switch sonrası bayat çapraz-lab veriyi önler.
function lsKey() { return `clinic_orders_cache_v3_${getActiveLabId() ?? 'all'}`; }
function loadCached(): any[] | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try { const r = window.localStorage.getItem(lsKey()); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveCached(rows: any[]) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try { window.localStorage.setItem(lsKey(), JSON.stringify(rows)); } catch { /* quota */ }
}

interface ClinicWorkOrder extends WorkOrder {
  doctor_profile?: { id: string; full_name: string; avatar_url?: string | null };
}

/**
 * Klinik müdürü için tüm klinik siparişleri.
 * RLS "clinic_admin_view_clinic_orders" policy'si filtreyi yapar.
 * Orders + clinic doctors paralel çekilir, client-side join yapılır.
 */
export function useClinicOrders(enabled = true) {
  const cached = enabled ? loadCached() : null;
  const [orders,  setOrders]  = useState<ClinicWorkOrder[]>((cached as ClinicWorkOrder[]) ?? []);
  const [loading, setLoading] = useState(enabled && cached === null);
  const [error,   setError]   = useState<string | null>(null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!enabled) return;
    if (!silent) setLoading(true);
    setError(null);
    // Siparişler ve klinik hekimleri paralel — eskiden sequential idi.
    const [ordersRes, doctorsRes] = await Promise.all([
      fetchClinicOrders(),
      fetchMyClinicDoctors(),
    ]);
    if (ordersRes.error) {
      setError(ordersRes.error.message);
      if (!silent) setLoading(false);
      return;
    }
    const raw = (ordersRes.data as WorkOrder[]) ?? [];
    const byId = new Map<string, any>();
    (doctorsRes.data ?? []).forEach((p: any) => byId.set(p.id, p));

    // doctor_id polimorfik (doctors VEYA profiles); my_clinic_doctors view'u RLS/
    // dedup nedeniyle bazı id'leri kaçırabilir. Adları SECURITY DEFINER RPC ile
    // kesin çöz — her kullanıcı tipinde (clinic_admin/secretary/doctor) çalışır.
    const docIds = Array.from(new Set(
      raw.map(o => o.doctor_id).filter((id): id is string => !!id),
    ));
    if (docIds.length > 0) {
      const { data: names } = await supabase.rpc('resolve_doctor_names', { p_ids: docIds });
      (names ?? []).forEach((n: any) => {
        if (!n.full_name) return;
        const existing = byId.get(n.id);
        if (existing) existing.full_name = existing.full_name || n.full_name;
        else byId.set(n.id, { id: n.id, full_name: n.full_name });
      });
    }

    const enriched: ClinicWorkOrder[] = raw.map(o => ({
      ...o,
      doctor_profile: byId.get(o.doctor_id),
    }));
    setOrders(enriched);
    saveCached(enriched);
    if (!silent) setLoading(false);
  }, [enabled]);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => { load(true); }, 400);
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    // Cache varsa silent yükle — spinner gösterme.
    load(loadCached() !== null);

    const channel = supabase
      .channel('clinic_work_orders_realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders' },
        () => scheduleRefetch())
      .subscribe();

    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [load, scheduleRefetch, enabled]);

  return { orders, loading, error, refetch: load };
}
