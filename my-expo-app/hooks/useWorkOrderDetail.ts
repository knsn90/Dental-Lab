import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { WorkOrder } from '../lib/types';
import { fetchWorkOrderById } from '../lib/workOrders';
import { getSignedUrls } from '../lib/photos';

export function useWorkOrderDetail(id: string) {
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await fetchWorkOrderById(id);
    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    const wo = data as WorkOrder;
    setOrder(wo);

    // Fetch signed URLs for photos
    if (wo.photos && wo.photos.length > 0) {
      const paths = wo.photos.map((p) => p.storage_path);
      const urls = await getSignedUrls(paths);
      setSignedUrls(urls);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();

    // Subscribe to changes on this specific work order
    const channel = supabase
      .channel(`work_order_detail_${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'work_orders', filter: `id=eq.${id}` },
        () => {
          // Reload full detail on any update
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  return { order, signedUrls, loading, error, refetch: load };
}
