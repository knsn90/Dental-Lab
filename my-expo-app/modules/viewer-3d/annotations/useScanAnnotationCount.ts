/**
 * useScanAnnotationCount — sipariş detayındaki "N not" rozeti için sayım.
 *
 * Neden RPC: sayım RLS'li tabloda `count(*)` ile de alınabilirdi ama her
 * sipariş kartında satırları çekmek gereksiz; `scan_annotation_count`
 * erişimi kendi içinde kontrol edip tek sayı döner.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../core/api/supabase';

export function useScanAnnotationCount(orderId?: string | null) {
  const [count, setCount] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!orderId) { setCount(0); return; }
    let cancelled = false;
    supabase
      .rpc('scan_annotation_count', { p_order: orderId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.warn('[scan-annotations] count', error.message); return; }
        setCount(Number(data) || 0);
      });
    return () => { cancelled = true; };
  }, [orderId, tick]);

  /** Viewer kapanınca çağır: içeride not eklenmiş olabilir. */
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  return { count, refresh };
}
