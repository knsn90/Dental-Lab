/**
 * Teslimat kaydının ekranda görünen referansı.
 *
 * Siparişli kayıtta sipariş numarası, serbest gönderide gönderi numarası
 * (GND-YYYY-NNNN). Tek yerde durur; aksi hâlde her listede "#undefined" riski
 * doğar — serbest gönderinin work_order gömmesi null döner.
 */
export function deliveryRef(d: {
  work_order?: { order_number?: string | null } | null;
  order_number?: string | null;
  shipment_no?: string | null;
}): string {
  return d?.work_order?.order_number ?? d?.order_number ?? d?.shipment_no ?? '—';
}

/** Serbest gönderi mi (siparişe bağlı değil)? */
export function isFreeShipment(d: { work_order_id?: string | null }): boolean {
  return !d?.work_order_id;
}
