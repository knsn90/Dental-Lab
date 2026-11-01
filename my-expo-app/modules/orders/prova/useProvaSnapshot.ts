/**
 * Siparişin prova/randevu anlık görüntüsü (order_prova_snapshot). Sipariş detayı hero düğmesi
 * de buradan beslenir; popup aynı veriyi prop olarak alır (çift sorgu yok).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchProvaSnapshot } from './api';
import type { ProvaSnapshot } from './provaModel';

export function useProvaSnapshot(orderId: string | null | undefined, enabled = true) {
  const [data, setData] = useState<ProvaSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const req = useRef(0);

  const refetch = useCallback(async () => {
    if (!orderId || !enabled) return;
    const n = ++req.current;
    setLoading(true);
    const r = await fetchProvaSnapshot(orderId);
    if (n !== req.current) return;           // daha yeni bir istek var
    setLoading(false);
    if (r.ok && r.data) { setData(r.data); setError(null); }
    else setError(r.error ?? 'Prova bilgisi yüklenemedi');
  }, [orderId, enabled]);

  useEffect(() => {
    setData(null);
    void refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
