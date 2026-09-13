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
  /** Planlama (triage) yapıldı mı — 'alindi' durumunda etiketi belirler. */
  triaged_at?: string | null;
}

// Tam durum→etiket sözlüğü (autoT ile EN/DE/FA'ya çevrilir). Ham enum'un
// (ör. "tasarim_onayi_bekleniyor") ekrana sızmaması için son çare fallback.
// core/ui/OrderStatusInfo.tsx'teki STATUS_LABEL ile aynı tutulmalı.
const STATUS_LABEL: Record<string, string> = {
  atama_bekleniyor:         'Atama Bekliyor',
  alindi:                   'Alındı',
  kutu_atandi:              'Kutu Atandı',
  uretimde:                 'Üretimde',
  asamada:                  'Üretimde',
  kalite_kontrol:           'Final QC',
  tasarim_onayi_bekleniyor: 'Tasarım Onayı Bekliyor',
  teslimata_hazir:          'Teslime Hazır',
  kurye_bekleniyor:         'Kurye Bekleniyor',
  kuryede:                  'Kuryede',
  teslim_edildi:            'Teslim Edildi',
  iptal:                    'İptal',
};

export function getOrderStageLabel(order: OrderLike | null | undefined): string {
  if (!order) return '—';
  const status = (order.status ?? '') as string;

  // Üst seviye durumlar — aşama adı yerine direkt durum
  if (status === 'teslim_edildi') return 'Teslim Edildi';
  if (status === 'kuryede')       return 'Kuryede';
  if (status === 'kurye_bekleniyor') return 'Kurye Bekleniyor';
  if (status === 'teslimata_hazir')  return 'Teslime Hazır';
  // 'alindi' iki farklı anı kapsıyor: planlama YAPILMAMIŞ (iş triage kuyruğunda)
  // ve planlanmış ama üretime başlanmamış. Listede "planlama bekliyor" yazan iş
  // rozette "Alındı" görünüyordu → planlanmamışsa "Planlama" yaz.
  // triaged_at alanı sorguya dahil DEĞİLSE karar veremeyiz; eski etikette kal.
  if (status === 'alindi') {
    const hasTriageField = !!order && Object.prototype.hasOwnProperty.call(order, 'triaged_at');
    return hasTriageField && !order.triaged_at ? 'Planlama' : 'Alındı';
  }
  // Tasarım onayı bekleyen iş üst-seviye bir durumdur (kalan aşama adı gösterilmez).
  if (status === 'tasarim_onayi_bekleniyor') return 'Tasarım Onayı Bekliyor';

  // Üretim sırasında aktif aşama adı varsa onu göster
  if (order.current_stage_name && order.current_stage_name.trim()) {
    return order.current_stage_name.trim();
  }

  // Fallback: STATUS_CONFIG → tam durum sözlüğü → (son çare) ham durum
  const cfg = (STATUS_CONFIG as any)?.[status];
  if (cfg?.label) return cfg.label as string;
  if (STATUS_LABEL[status]) return STATUS_LABEL[status];

  return status || '—';
}
