// modules/delivery/proof/api.ts
// Teslim kanıtı: dosya yükleme + RPC sarmalayıcıları (20261028100000_kanit_sema / 20261028101000_kanit_rpc).
import { supabase } from '../../../core/api/supabase';
import { pickOpenDelivery, proofPath } from './proofModel';

export { proofPath };

export const PROOF_BUCKET = 'delivery-proofs';

/** deliveries'ten kanıt sütunları — sipariş Lojistik kartı ve lab teslimat detayı okur. */
export const PROOF_SELECT =
  'recipient_name, recipient_title, signature_path, proof_photo_path, signature_skipped_reason, proof_source, proof_captured_at, proof_override_reason, proof_override_by_name, proof_override_at, provider_proof_checked_at';

/** Web'de blob (ya da blob:/data: uri), native'de dosya uri'si (data:image/png;base64 dahil). */
export type ProofAsset = { uri: string; mimeType?: string | null; blob?: Blob | null };

function extOf(asset: ProofAsset, kind: 'photo' | 'signature'): string {
  const mt = asset.mimeType ?? asset.blob?.type ?? '';
  if (mt.includes('png')) return 'png';
  if (mt.includes('webp')) return 'webp';
  if (mt.includes('heic')) return 'heic';
  return kind === 'signature' ? 'png' : 'jpg';
}

export async function uploadProofFile(
  labId: string, deliveryId: string, kind: 'photo' | 'signature', asset: ProofAsset,
): Promise<{ path: string | null; error: string | null }> {
  const ext = extOf(asset, kind);
  const contentType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const path = proofPath(labId, deliveryId, kind, ext);
  let body: any = asset.blob ?? null;
  if (!body) {
    if (typeof window !== 'undefined' && /^(blob:|data:|https?:)/.test(asset.uri) && typeof (globalThis as any).document !== 'undefined') {
      body = await (await fetch(asset.uri)).blob();
    } else if (asset.uri.startsWith('data:')) {
      // native imza: data:image/png;base64,… → ArrayBuffer
      const b64 = asset.uri.slice(asset.uri.indexOf(',') + 1);
      const bin = (globalThis as any).atob(b64) as string;
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      body = bytes.buffer;
    } else {
      const fd = new FormData();
      fd.append('file', { uri: asset.uri, name: `${kind}.${ext}`, type: contentType } as any);
      body = fd;
    }
  }
  const { error } = await supabase.storage.from(PROOF_BUCKET).upload(path, body, { contentType, upsert: false });
  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

export async function deliverWithProof(
  items: { delivery_id: string; photo_path: string; signature_path: string | null }[],
  recipientName: string | null, skipReason: string | null,
): Promise<{ ok: boolean; closed?: number; error?: string }> {
  const { data, error } = await supabase.rpc('deliver_with_proof', {
    p_items: items, p_recipient_name: recipientName, p_skip_reason: skipReason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, closed: Number(data) || 0 };
}

export async function closeWithoutProof(deliveryId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('close_delivery_without_proof', { p_delivery: deliveryId, p_reason: reason });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchProofSiblings(deliveryId: string): Promise<{ delivery_id: string; order_number: string | null }[]> {
  const { data, error } = await supabase.rpc('delivery_proof_siblings', { p_delivery: deliveryId });
  if (error || !Array.isArray(data)) return [];
  return data as { delivery_id: string; order_number: string | null }[];
}

/** 1 saatlik imzalı bağlantılar; okuma yetkisi dp_select (teslimatı görebilen herkes). */
export async function signProofUrls(paths: string[]): Promise<Record<string, string>> {
  const list = paths.filter(Boolean);
  if (!list.length) return {};
  const { data } = await supabase.storage.from(PROOF_BUCKET).createSignedUrls(list, 3600);
  const out: Record<string, string> = {};
  (data ?? []).forEach((r: any) => { if (r?.path && r?.signedUrl) out[r.path] = r.signedUrl; });
  return out;
}

/** "Tara": siparişte bu kuryenin sırası gelen açık teslimatı. */
export async function findOpenDeliveryForOrder(orderId: string, courierId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('id, status, created_at')
    .eq('work_order_id', orderId)
    .eq('courier_id', courierId);
  if (error || !data) return null;
  return pickOpenDelivery(data as { id: string; status: string; created_at: string }[]);
}

export interface ProofDelivery {
  id: string;
  lab_id: string;
  direction: string | null;
  destination_name: string | null;
  order_number: string | null;
}

export async function fetchDeliveryForProof(deliveryId: string): Promise<ProofDelivery | null> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('id, lab_id, direction, destination_name, work_order:work_orders(order_number)')
    .eq('id', deliveryId)
    .maybeSingle();
  if (error || !data) return null;
  const d = data as any;
  return {
    id: d.id, lab_id: d.lab_id, direction: d.direction ?? null,
    destination_name: d.destination_name ?? null,
    order_number: d.work_order?.order_number ?? null,
  };
}
