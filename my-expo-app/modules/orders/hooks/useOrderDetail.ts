import { useEffect, useRef, useState, useCallback } from 'react';
import { WorkOrder } from '../types';
import { fetchWorkOrderById } from '../api';
import { getSignedUrls } from '../../../lib/photos';
import { useOrderDetailRealtime } from './useOrderDetailRealtime';

export function useOrderDetail(id: string) {
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    if (cancelledRef.current) return;
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await fetchWorkOrderById(id);
    if (cancelledRef.current) return;
    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    const wo = data as WorkOrder;
    setOrder(wo);

    if (wo.photos && wo.photos.length > 0) {
      const paths = wo.photos.map((p) => p.storage_path);
      const urls = await getSignedUrls(paths);
      if (!cancelledRef.current) setSignedUrls(urls);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    return () => { cancelledRef.current = true; };
  }, [id, load]);

  useOrderDetailRealtime(id, { onWorkOrder: load });

  return { order, signedUrls, loading, error, refetch: load };
}
