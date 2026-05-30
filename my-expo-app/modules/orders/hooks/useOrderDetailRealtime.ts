// Sipariş detay ekranındaki 4 bileşen (useOrderDetail, OrderCostSection,
// UsedMaterialsSection, MaterialForecastSection) aynı workOrderId için
// ayrı ayrı WebSocket kanalı açıyordu — bu hook hepsini tek kanala indirir.
//
// Kullanım: bileşen kendi yenileme callback'ini kaydeder; tüm bileşenler
// aynı `order_detail_${id}` kanalını paylaşır, refCount = 0 olunca kapatılır.

import { useEffect, useRef } from 'react';
import { supabase } from '../../../core/api/supabase';

type Listener = () => void;

interface Entry {
  refCount: number;
  channel: ReturnType<typeof supabase.channel>;
  onWorkOrder:     Set<Listener>;
  onStockMovement: Set<Listener>;
  onStageLog:      Set<Listener>;
  onStockItems:    Set<Listener>;
}

const registry = new Map<string, Entry>();

function acquire(workOrderId: string): Entry {
  const existing = registry.get(workOrderId);
  if (existing) { existing.refCount++; return existing; }

  const onWorkOrder     = new Set<Listener>();
  const onStockMovement = new Set<Listener>();
  const onStageLog      = new Set<Listener>();
  const onStockItems    = new Set<Listener>();

  const channel = supabase
    .channel(`order_detail_${workOrderId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'work_orders',     filter: `id=eq.${workOrderId}` },             () => onWorkOrder.forEach(fn => fn()))
    .on('postgres_changes', { event: '*',      schema: 'public', table: 'stock_movements', filter: `order_id=eq.${workOrderId}` },        () => onStockMovement.forEach(fn => fn()))
    .on('postgres_changes', { event: '*',      schema: 'public', table: 'stage_log',       filter: `work_order_id=eq.${workOrderId}` },   () => onStageLog.forEach(fn => fn()))
    .on('postgres_changes', { event: '*',      schema: 'public', table: 'stock_items' },                                                  () => onStockItems.forEach(fn => fn()))
    .subscribe();

  const entry: Entry = { refCount: 1, channel, onWorkOrder, onStockMovement, onStageLog, onStockItems };
  registry.set(workOrderId, entry);
  return entry;
}

function release(workOrderId: string) {
  const e = registry.get(workOrderId);
  if (!e) return;
  e.refCount--;
  if (e.refCount <= 0) {
    supabase.removeChannel(e.channel);
    registry.delete(workOrderId);
  }
}

export interface OrderDetailListeners {
  onWorkOrder?:     Listener;
  onStockMovement?: Listener;
  onStageLog?:      Listener;
  onStockItems?:    Listener;
}

export function useOrderDetailRealtime(workOrderId: string, listeners: OrderDetailListeners) {
  // ref ile her zaman güncel callback'i çağır, effect'i yeniden çalıştırmadan
  const ref = useRef(listeners);
  ref.current = listeners;

  useEffect(() => {
    const e = acquire(workOrderId);
    const wo = () => ref.current.onWorkOrder?.();
    const sm = () => ref.current.onStockMovement?.();
    const sl = () => ref.current.onStageLog?.();
    const si = () => ref.current.onStockItems?.();
    e.onWorkOrder.add(wo);
    e.onStockMovement.add(sm);
    e.onStageLog.add(sl);
    e.onStockItems.add(si);
    return () => {
      e.onWorkOrder.delete(wo);
      e.onStockMovement.delete(sm);
      e.onStageLog.delete(sl);
      e.onStockItems.delete(si);
      release(workOrderId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderId]);
}
