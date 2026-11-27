// supabase/functions/_shared/bbkMultiDrop.ts (Deno)
// BanaBiKurye çok noktalı teslimat (multi-drop) — ortak mantık.
//
// Kimlik: her teslim noktasına bizim ürettiğimiz `client_order_id` (32 hex) verilir
// ve deliveries.external_point_ref'e yazılır. BBK bunu bildirimlerde ve /orders
// noktalarında geri döndürür → satır eşlemesi HER ZAMAN ref ile yapılır, dizi
// indeksiyle değil (rota optimizasyonu sırayı değiştirebilir).
//
// Durum: nokta başına `point.delivery.status` (23 değer, Business API 1.8). Sipariş
// düzeyi durum çok noktalı satırlara uygulanmaz (SQL tarafı bunları atlar).
import { applyBbkPointProof, runInBackground } from './bbkProofApply.ts';

export type DeliveryStatus = 'beklemede' | 'atandi' | 'teslim_alindi' | 'yolda' | 'teslim_edildi' | 'iade' | 'iptal';

const RANK: Record<DeliveryStatus, number> = {
  beklemede: 0, atandi: 1, teslim_alindi: 2, yolda: 3, teslim_edildi: 10, iade: 10, iptal: 10,
};
export const statusRank = (s: DeliveryStatus | null): number => (s ? RANK[s] : -1);

/** İkisinden ileride olanı döndürür (biri null ise diğeri). */
export function maxStatus(a: DeliveryStatus | null, b: DeliveryStatus | null): DeliveryStatus | null {
  return statusRank(a) >= statusRank(b) ? a : b;
}

/**
 * Nokta (delivery) durumu → bizim delivery_status. Bilinmeyen / anlamsız ara
 * durumlar null döner (satıra dokunulmaz, bildirim 200 ile yutulur).
 * - courier_departed / courier_at_pickup: kurye ALIMA gidiyor → hâlâ 'atandi'.
 * - parcel_picked_up: paket alındı → 'teslim_alindi'.
 * - active: BBK bunu kurye ALIMA giderken de raporlayabiliyor (2026-08 "erken alındı"
 *   hatası) → tek başına 'atandi'. Alım kanıtlıysa pointUpdatesFromOrder 'yolda'ya yükseltir.
 * - courier_arrived: teslim noktasında bekliyor → 'yolda' (paket alınmıştır).
 * - return_* (iade akışı başladı) → yalnız return_finished 'iade' sayılır.
 * - delayed / reattempt_* (finished hariç) / draft / invalid → değişiklik yok.
 */
export function mapPointStatus(raw: unknown): DeliveryStatus | null {
  switch (String(raw ?? '').toLowerCase()) {
    case 'planned':
    case 'courier_assigned':
    case 'courier_departed':
    case 'courier_at_pickup':
    case 'active':
      return 'atandi';
    case 'parcel_picked_up':
      return 'teslim_alindi';
    case 'courier_arrived':
      return 'yolda';
    case 'finished':
    case 'reattempt_finished':
      return 'teslim_edildi';
    case 'return_finished':
      return 'iade';
    case 'canceled':
    case 'cancelled':
    case 'deleted':
      return 'iptal';
    default:
      return null;
  }
}

/** 32 karakterlik nokta ref'i (client_order_id ≤ 32). */
export function makePointRef(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/** Toplamı n parçaya böler; kuruş farkı SON parçada → toplam birebir korunur. */
export function splitFee(total: number, n: number): number[] {
  if (!(n > 0) || !isFinite(total)) return [];
  const cents = Math.round(total * 100);
  const each = Math.round(cents / n);
  const out = Array.from({ length: n }, () => each / 100);
  out[n - 1] = (cents - each * (n - 1)) / 100;
  return out;
}

const clean = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
};

export interface PointUpdate {
  ref: string;
  status: DeliveryStatus;
  at: string | null;
  pointId: string | null;
  deliveryId: string | null;
  trackingUrl: string | null;
  point: unknown;
}

/**
 * Sipariş nesnesinden (callback order_changed / /orders) nokta güncellemeleri.
 * Saf — test edilebilir. İlk nokta alımdır; dönüş noktaları atlanır.
 * Sipariş 'completed' iken durumu HİÇ olmayan noktalar teslim, 'canceled' iken iptal
 * sayılır (tanınmayan bir durum — return_planned, delayed… — teslim sayılmaz).
 * Alım noktası ziyaret edildiyse noktalar en az 'teslim_alindi'dir; 'active' ise 'yolda'.
 */
export function pointUpdatesFromOrder(order: unknown): PointUpdate[] {
  const o: any = order;
  const pts: any[] = Array.isArray(o?.points) ? o.points : [];
  if (pts.length < 2) return [];
  const orderStatus = String(o?.status ?? '').toLowerCase();
  const pickupVisit = clean(pts[0]?.courier_visit_datetime);
  const out: PointUpdate[] = [];
  for (const p of pts.slice(1)) {
    if (!p || p.is_return_point === true) continue;
    const ref = clean(p.client_order_id);
    if (!ref) continue;
    const raw = clean(p.delivery?.status ?? p.delivery_status)?.toLowerCase() ?? null;
    let st = mapPointStatus(raw);
    if (!raw && orderStatus === 'completed') st = 'teslim_edildi';
    if (!raw && orderStatus === 'canceled') st = 'iptal';
    if (pickupVisit) {
      if (raw === 'active') st = 'yolda';
      else if (st && statusRank(st) < statusRank('teslim_alindi')) st = 'teslim_alindi';
      else if (!st && !raw) st = 'teslim_alindi';
    }
    if (!st) continue;
    out.push({
      ref,
      status: st,
      at: st === 'teslim_edildi' ? clean(p.courier_visit_datetime)
        : (st === 'teslim_alindi' || st === 'yolda') ? pickupVisit : null,
      pointId: clean(p.point_id),
      deliveryId: clean(p.delivery_id),
      trackingUrl: clean(p.tracking_url),
      point: p,
    });
  }
  return out;
}

/** Bir nokta güncellemesini uygular; teslimde o noktanın kanıtını yazar. */
export async function applyPointUpdate(admin: any, u: PointUpdate): Promise<{ changed: boolean; to: string | null; id: string | null }> {
  const { data, error } = await admin.rpc('bbk_apply_point_status', {
    p_ref: u.ref,
    p_status: u.status,
    p_at: u.at,
    p_point_id: u.pointId,
    p_delivery_id: u.deliveryId,
    p_tracking_url: u.trackingUrl,
    p_note: null,
  });
  if (error) {
    console.warn('bbk point status yazılamadı', u.ref.slice(0, 6), error.message);
    return { changed: false, to: null, id: null };
  }
  // Kanıt yalnız teslime GEÇİŞTE ya da henüz denenmemişse — track 25 sn'de bir
  // çağrılıyor; her seferinde fotoğrafları yeniden indirip yüklemesin. Arka planda.
  if (u.status === 'teslim_edildi' && (data as any)?.id && (data as any)?.to === 'teslim_edildi') {
    let need = !!(data as any)?.changed;
    if (!need) {
      const { data: row } = await admin.from('deliveries').select('provider_proof_checked_at')
        .eq('id', (data as any).id).maybeSingle();
      need = !row?.provider_proof_checked_at;
    }
    if (need) await runInBackground(applyBbkPointProof(admin, u.ref, u.point));
  }
  return { changed: !!(data as any)?.changed, to: (data as any)?.to ?? null, id: (data as any)?.id ?? null };
}

/** Siparişin tüm noktalarını uygular. Döner: ref → yeni durum. */
export async function applyPointsFromOrder(admin: any, order: unknown): Promise<Record<string, string | null>> {
  const res: Record<string, string | null> = {};
  for (const u of pointUpdatesFromOrder(order)) {
    res[u.ref] = (await applyPointUpdate(admin, u)).to;
  }
  return res;
}

/** Bu takip no'lu siparişte çok noktalı (ref'li) satır var mı? */
export async function hasPointRows(client: any, trackingNo: string): Promise<boolean> {
  const { data } = await client.from('deliveries').select('id')
    .eq('external_tracking_no', trackingNo).not('external_point_ref', 'is', null).limit(1);
  return Array.isArray(data) && data.length > 0;
}
