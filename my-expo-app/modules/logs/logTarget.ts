/**
 * Loglar satırı → açılacak sipariş (kimlik ya da sipariş no) — saf, import yok (node --test).
 *
 * Sıra: metadata.order_id → sipariş/mesaj/dosya kaydının entity_id'si → metadata.order_no →
 * eski aşama/malzeme etiketindeki sipariş no (aşama "NO · istasyon", malzeme "malzeme · miktar · NO")
 * → sipariş no süzgecindeki değer. Etikette sipariş no biçimine uymayan parça (malzeme ya da
 * istasyon adı) hedef sayılmaz — eskiden ilk parça alınıyor, malzeme adına gidiliyordu.
 */
export type LogTargetLike = {
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  metadata: Record<string, any> | null;
};

/** Canlı biçimler: AAA-9999-9999 · AAA-9999-99 · AAAA-9999. */
export const ORDER_NO_RE = /^[A-Z]{2,6}-\d{4}(?:-\d{2,})?$/i;

const LABEL_TYPES = new Set(['stage', 'order_stage', 'material']);

export function orderTarget(log: LogTargetLike, fallbackOrderNo?: string | null): string | null {
  const m = log.metadata ?? {};
  if (m.order_id) return String(m.order_id);
  if (log.entity_id && (log.entity_type === 'work_order' || log.entity_type === 'message' || log.entity_type === 'photo')) {
    return log.entity_id;
  }
  if (m.order_no) return String(m.order_no);
  if (log.entity_label && log.entity_type && LABEL_TYPES.has(log.entity_type)) {
    const hit = log.entity_label.split('·').map((p) => p.trim()).find((p) => ORDER_NO_RE.test(p));
    if (hit) return hit;
  }
  const fb = (fallbackOrderNo ?? '').trim();
  return fb ? fb.toUpperCase() : null;
}
