// supabase/functions/_shared/bbkProofApply.ts (Deno)
// BanaBiKurye teslim kanıtını teslimat kaydına yazar (2. dalga 5 — spec 4.5).
// - Kanıt sipariş nesnesinden okunur; yoksa lab'ın kendi anahtarıyla /orders tek kez okunur.
// - Fotoğraf/imza bağlantısı varsa delivery-proofs/<lab>/<delivery>/provider-*.jpg'ye kopyalanır
//   (sağlayıcı bağlantıları kalıcı olmayabilir).
// - bbk_apply_delivery_proof (yalnız service_role) dolu alanın üzerine yazmaz; "denendi" damgası hep yazılır.
// - Hata yutulur ve loglanır: kanıt alma teslimi asla bozmaz ve geciktirmez.
import { extractBbkProof, type BbkProof } from './bbkProof.ts';

const BASES: Record<string, string> = {
  sandbox: 'https://robotapitest.banabikurye.com/api/business/1.8',
  production: 'https://robot.banabikurye.com/api/business/1.8',
};

/** Teslimatın lab'ının BanaBiKurye anahtarıyla siparişi tek kez okur (yalnız GET). */
export async function fetchBbkOrderForDelivery(admin: any, trackingNo: string): Promise<unknown | null> {
  try {
    const { data: d } = await admin.from('deliveries').select('lab_id')
      .eq('external_tracking_no', trackingNo).ilike('external_provider', '%banabikurye%').limit(1).maybeSingle();
    if (!d?.lab_id) return null;
    const { data: prov } = await admin.from('provider_credentials').select('environment, credentials')
      .eq('lab_id', d.lab_id).eq('type', 'courier').eq('provider', 'banabikurye').eq('is_active', true).maybeSingle();
    const token = String(prov?.credentials?.auth_token ?? '').trim();
    if (!token) return null;
    const base = BASES[prov?.environment === 'production' ? 'production' : 'sandbox'];
    const r = await fetch(`${base}/orders?order_id=${encodeURIComponent(trackingNo)}`, { headers: { 'X-DV-Auth-Token': token } });
    if (!r.ok) return null;
    const j: any = await r.json();
    return Array.isArray(j?.orders) ? (j.orders[0] ?? null) : null;
  } catch (e) {
    console.warn('bbkProof: sipariş okunamadı', String(e));
    return null;
  }
}

async function copyPhoto(admin: any, url: string | null, labId: string, deliveryId: string, name: string): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const type = r.headers.get('content-type') ?? 'image/jpeg';
    if (!type.startsWith('image/')) return null;
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    const path = `${labId}/${deliveryId}/${name}.${ext}`;
    const { error } = await admin.storage.from('delivery-proofs').upload(path, new Uint8Array(await r.arrayBuffer()), { contentType: type, upsert: true });
    return error ? null : path;
  } catch {
    return null;
  }
}

export async function applyBbkProof(
  admin: any, trackingNo: string, order: unknown | null,
  fetchOrder?: () => Promise<unknown | null>,
): Promise<void> {
  try {
    let proof: BbkProof | null = extractBbkProof(order);
    if (!proof && fetchOrder) proof = extractBbkProof(await fetchOrder());
    const { data: d } = await admin.from('deliveries').select('id, lab_id')
      .eq('external_tracking_no', trackingNo).ilike('external_provider', '%banabikurye%')
      .eq('status', 'teslim_edildi').limit(1).maybeSingle();
    let place: string | null = null;
    let sign: string | null = null;
    if (d?.id && proof) {
      place = await copyPhoto(admin, proof.placePhotoUrl, d.lab_id, d.id, 'provider-place');
      sign = await copyPhoto(admin, proof.signPhotoUrl, d.lab_id, d.id, 'provider-sign');
    }
    const { error } = await admin.rpc('bbk_apply_delivery_proof', {
      p_tracking_no: trackingNo,
      p_recipient_name: proof?.recipientName ?? null,
      p_recipient_title: proof?.recipientTitle ?? null,
      p_visit_at: proof?.visitAt ?? null,
      p_place_photo_path: place,
      p_sign_photo_path: sign,
    });
    if (error) console.warn('bbkProof: kayıt yazılamadı', error.message);
  } catch (e) {
    console.warn('bbkProof: uygulanamadı', String(e));
  }
}

/** Yanıtı bekletmeden arka planda çalıştır (Supabase Edge: EdgeRuntime.waitUntil). */
export function runInBackground(job: Promise<unknown>): Promise<unknown> | void {
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) { rt.waitUntil(job); return; }
  return job;
}
