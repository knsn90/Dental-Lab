/**
 * Liste rozet/filtre verisi (order_prova_flags). Yalnız klinikte provası ya da takma randevusu olan açık
 * siparişler döner (küçük küme). Liste yenilendiğinde ve ekran odağa geldiğinde sessizce tazelenir.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchProvaFlags } from './api';
import type { ProvaFlag } from './provaModel';

export function useProvaFlags(enabled = true, refreshKey: unknown = null) {
  const [flags, setFlags] = useState<Map<string, ProvaFlag>>(() => new Map());
  const req = useRef(0);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    const n = ++req.current;
    const r = await fetchProvaFlags();
    if (n !== req.current || !r.ok || !r.data) return;
    setFlags(new Map(r.data.map((f) => [f.work_order_id, f])));
  }, [enabled]);

  useEffect(() => { void refetch(); }, [refetch, refreshKey]);
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  return { flags, refetch };
}
