/**
 * useOrderHistory — sipariş Geçmiş akışı (`order_history` RPC, 20261027100000).
 *
 * Canlı: yalnız BU siparişin satırlarına süzülmüş tek kanal (mesaj, sipariş, kurye, aşama).
 * Filtresiz tablo aboneliği her değişiklikte her açık detayı yeniden sorgulatır (bkz. realtime
 * abonelik sızıntısı dersi) — burada yapılmaz. Kanaldaki her tablo supabase_realtime yayınında
 * OLMALI: biri yoksa kanalın tamamı sessizce düşer (work_order_holds yayında değil; bekleme
 * work_orders.hold_status'u da güncellediği için oradan gelir). Ön plana dönünce tazelenir.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../core/api/supabase';
import { useAppResume } from '../../../core/hooks/useAppResume';
import { loadLabTz, cachedLabTz } from '../../../core/metrics/useLabToday';
import type { HistoryRow } from './historyModel';

const WATCH: { table: string; col: string }[] = [
  { table: 'order_messages', col: 'work_order_id' },
  { table: 'deliveries', col: 'work_order_id' },
  { table: 'order_stages', col: 'work_order_id' },
  { table: 'work_orders', col: 'id' },
];

let mountSeq = 0;

export function useOrderHistory(orderId: string | null | undefined) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tz, setTz] = useState<string | null>(cachedLabTz());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Her istek numaralanır; yalnız EN SON isteğin yanıtı yazılır (sipariş değişince eski
  // siparişin geç gelen yanıtı yenisinin üstüne düşmesin).
  const reqRef = useRef(0);
  const orderRef = useRef(orderId);
  orderRef.current = orderId;

  const load = useCallback(async () => {
    const my = ++reqRef.current;
    if (!orderId) { setRows([]); setLoading(false); return; }
    const { data, error: err } = await supabase.rpc('order_history', { p_order: orderId });
    if (my !== reqRef.current || orderRef.current !== orderId) return;
    if (err) {
      setError(err.code === '42501' ? 'Bu siparişin geçmişini görme yetkiniz yok.' : err.message);
    } else {
      setRows((data ?? []) as HistoryRow[]);
      setError(null);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    // Sipariş değişti: önceki siparişin satırları yeni siparişin altında görünmesin.
    setRows([]);
    setError(null);
    setLoading(true);
    load();
    let alive = true;
    if (!cachedLabTz()) loadLabTz().then((v) => { if (alive && v) setTz(v); });
    return () => { alive = false; reqRef.current++; };
  }, [load]);

  useEffect(() => {
    if (!orderId) return;
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { load(); }, 400);
    };
    // Bağlanış başına ayrı konu: aynı adla hızlı kapat-aç, ayrılmakta olan kanalı geri verip
    // aboneliği ölü bırakabiliyordu.
    let ch = supabase.channel(`order-history-${orderId}-${++mountSeq}`);
    for (const w of WATCH) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: w.table, filter: `${w.col}=eq.${orderId}` }, schedule);
    }
    ch.subscribe((status, err) => {
      if (__DEV__ && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
        console.warn('[useOrderHistory] canlı abonelik düştü', status, err?.message ?? '');
      }
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(ch);
    };
  }, [orderId, load]);

  useAppResume(() => { load(); }, { enabled: !!orderId });

  return { rows, loading, error, tz, refetch: load };
}
