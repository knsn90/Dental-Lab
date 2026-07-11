/**
 * currentStage — sipariş için "şu an hangi aşamada" etiketi üretir.
 *
 * Tüm panellerde (klinik / lab / doktor / admin) sipariş kartlarında veya
 * detay başlıklarında "Üretimde" (generic status) yerine gerçek aktif aşama
 * adını ("CAD Tasarım", "Tarama", "Kalite Kontrol", "Kurye", "Teslim Edildi")
 * göstermek için kullanılır.
 *
 * Mantık:
 *   1) Sipariş teslim edildiyse → "Teslim Edildi"
 *   2) Sipariş kuryede / hazır → "Kurye" / "Hazır"
 *   3) current_stage_name varsa (DB trigger ile senkron) → kullan
 *   4) Aksi halde STATUS_CONFIG[status].label fallback
 */
import { STATUS_CONFIG } from '../constants';
import type { WorkOrderStatus } from '../../../lib/types';

export interface OrderLike {
  status?: string | null;
  current_stage_name?: string | null;
}

export function getOrderStageLabel(order: OrderLike | null | undefined): string {
  if (!order) return '—';
  const status = (order.status ?? '') as string;

  // Üst seviye durumlar — aşama adı yerine direkt durum
  if (status === 'teslim_edildi') return 'Teslim Edildi';
  if (status === 'kuryede')       return 'Kuryede';
  if (status === 'kurye_bekleniyor') return 'Kurye Bekleniyor';
  if (status === 'teslimata_hazir')  return 'Teslime Hazır';
  if (status === 'alindi')           return 'Alındı';

  // Üretim sırasında aktif aşama adı varsa onu göster
  if (order.current_stage_name && order.current_stage_name.trim()) {
    return order.current_stage_name.trim();
  }

  // Fallback: STATUS_CONFIG
  const cfg = (STATUS_CONFIG as any)?.[status];
  if (cfg?.label) return cfg.label as string;

  return status || '—';
}
