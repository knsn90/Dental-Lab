import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../core/api/supabase';
import { WorkOrder } from '../types';
import { fetchWorkOrderById } from '../api';
import { getSignedUrls } from '../../../lib/photos';

export function useOrderDetail(id: string) {
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * silent=true → loading flag'ini değiştirmez (background refresh).
   * Önemli: refetch() / realtime tetiklemeleri silent yapmalı, aksi halde
   * tüm OrderDetailScreenV2 ağacı unmount olur, modal vs. local state'ler
   * sıfırlanır.
   */
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    const { data, error: fetchError } = await fetchWorkOrderById(id);
    if (fetchError) {
      setError(fetchError.message);
      if (!silent) setLoading(false);
      return;
    }

    const wo = data as WorkOrder;
    setOrder(wo);
    // UI'ı hemen göster — fotoğraf signed URL'leri arka planda gelir.
    if (!silent) setLoading(false);

    if (wo.photos && wo.photos.length > 0) {
      const paths = wo.photos.map((p) => p.storage_path);
      getSignedUrls(paths).then(setSignedUrls).catch(() => {});
    }
  }, [id]);

  // Dışarıya verilen refetch — daima silent (loading flag'i tetiklemez)
  const refetch = useCallback(() => load(true), [load]);

  useEffect(() => {
    load();

    // Subscribe to changes on this specific work order
    const channel = supabase
      .channel(`work_order_detail_${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'work_orders', filter: `id=eq.${id}` },
        () => {
          // Realtime — silent reload (loader göstermesin)
          load(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  return { order, signedUrls, loading, error, refetch };
}
