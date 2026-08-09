import { supabase } from '../../core/api/supabase';
import type { OrderReview, ReviewInput, PendingReviewOrder } from './types';

const COLS = 'id, work_order_id, lab_id, rater_id, rater_role, overall, fit, occlusion, contacts, esthetics, surface, on_time, comment, photos, clinical_photos, lab_reply, lab_reply_at, lab_reply_by, created_at, updated_at';

/**
 * İstemci tarafı yükleme sınırı — bucket 200 MB'a izin veriyor ama değerlendirme
 * fotoğrafı için o tavan anlamsız. StageFileUpload/chatApi ile aynı değer.
 */
const MAX_REVIEW_PHOTO_MB = 100;

/** Değerlendirme fotoğrafını work-order-photos bucket'ına yükle, storage path döndür. */
export async function uploadReviewPhoto(workOrderId: string, asset: { uri: string; mimeType?: string | null; fileName?: string | null; fileSize?: number | null }, category: 'general' | 'clinical' = 'general'): Promise<{ path: string | null; error: any }> {
  if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_REVIEW_PHOTO_MB * 1024 * 1024) {
    return {
      path: null,
      error: { message: `Fotoğraf ${MAX_REVIEW_PHOTO_MB} MB sınırını aşıyor.` },
    };
  }
  const ext = (asset.fileName?.split('.').pop() || asset.mimeType?.split('/').pop() || 'jpg').toLowerCase();
  const rand = Math.random().toString(36).slice(2, 9);
  const sub = category === 'clinical' ? 'clinical/' : '';
  const path = `reviews/${workOrderId}/${sub}${Date.now()}-${rand}.${ext}`;
  let body: any;
  if (typeof window !== 'undefined' && (asset.uri.startsWith('blob:') || asset.uri.startsWith('data:') || asset.uri.startsWith('http'))) {
    const resp = await fetch(asset.uri); body = await resp.blob();
  } else {
    const fd = new FormData();
    fd.append('file', { uri: asset.uri, name: `photo.${ext}`, type: asset.mimeType ?? 'image/jpeg' } as any);
    body = fd;
  }
  const { error } = await supabase.storage.from('work-order-photos').upload(path, body, { contentType: asset.mimeType ?? undefined, upsert: false });
  if (error) return { path: null, error };
  return { path, error: null };
}

/** Storage path'leri için imzalı görüntüleme URL'leri (thumbnail). */
export async function signReviewPhotos(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from('work-order-photos').createSignedUrls(paths, 3600);
  const map: Record<string, string> = {};
  (data ?? []).forEach((d: any) => { if (d.path && d.signedUrl) map[d.path] = d.signedUrl; });
  return map;
}

/** Lab yanıtını ekle/güncelle (boş string → yanıtı kaldırır). Yalnız lab üyesi. */
export async function setLabReply(reviewId: string, reply: string): Promise<{ data: OrderReview | null; error: any }> {
  const { data, error } = await supabase.rpc('set_review_lab_reply', { p_review_id: reviewId, p_reply: reply });
  return { data: (data as OrderReview) ?? null, error };
}

/** Belirli bir iş için MEVCUT kullanıcının değerlendirmesini getir (yoksa null). */
export async function getMyReviewForOrder(workOrderId: string): Promise<{ data: OrderReview | null; error: any }> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { data: null, error: null };
  const { data, error } = await supabase
    .from('order_reviews')
    .select(COLS)
    .eq('work_order_id', workOrderId)
    .eq('rater_id', uid)
    .maybeSingle();
  return { data: (data as OrderReview) ?? null, error };
}

/** Bir işe ait tüm değerlendirmeler (lab tarafı gösterim için). */
export async function listReviewsForOrder(workOrderId: string): Promise<{ data: OrderReview[]; error: any }> {
  const { data, error } = await supabase
    .from('order_reviews')
    .select(COLS)
    .eq('work_order_id', workOrderId)
    .order('created_at', { ascending: false });
  return { data: (data as OrderReview[]) ?? [], error };
}

/** MEVCUT kullanıcının değerlendirmediği teslim edilmiş işleri getir (Faz 2).
 *  work_orders RLS'i kullanıcıyı kendi işlerine kısıtlar; teslim olup henüz
 *  puanlanmamış olanları client tarafında ayıkla. */
export async function listMyPendingReviews(limit = 50): Promise<{ data: PendingReviewOrder[]; error: any }> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { data: [], error: null };
  const { data: orders, error } = await supabase
    .from('work_orders')
    .select('id, order_number, patient_name, work_type, delivery_date')
    .eq('status', 'teslim_edildi')
    .order('delivery_date', { ascending: false })
    .limit(limit);
  if (error) return { data: [], error };
  const ids = (orders ?? []).map((o: any) => o.id);
  if (!ids.length) return { data: [], error: null };
  const { data: reviews } = await supabase
    .from('order_reviews')
    .select('work_order_id')
    .eq('rater_id', uid)
    .in('work_order_id', ids);
  const reviewed = new Set((reviews ?? []).map((r: any) => r.work_order_id));
  return { data: (orders ?? []).filter((o: any) => !reviewed.has(o.id)) as PendingReviewOrder[], error: null };
}

/** Değerlendirme ekle (rater_id/lab_id DB tarafında set edilir). */
export async function submitReview(input: ReviewInput): Promise<{ data: OrderReview | null; error: any }> {
  const { data, error } = await supabase
    .from('order_reviews')
    .insert({
      work_order_id: input.work_order_id,
      overall:    input.overall,
      fit:        input.fit ?? null,
      occlusion:  input.occlusion ?? null,
      contacts:   input.contacts ?? null,
      esthetics:  input.esthetics ?? null,
      surface:    input.surface ?? null,
      on_time:    input.on_time ?? null,
      comment:    input.comment?.trim() || null,
      photos:     input.photos ?? [],
      clinical_photos: input.clinical_photos ?? [],
      rater_role: input.rater_role ?? null,
    })
    .select(COLS)
    .single();
  return { data: (data as OrderReview) ?? null, error };
}

/** Mevcut değerlendirmeyi güncelle (yalnız sahibi). */
export async function updateReview(id: string, patch: Partial<ReviewInput>): Promise<{ data: OrderReview | null; error: any }> {
  const upd: Record<string, any> = {};
  for (const k of ['overall', 'fit', 'occlusion', 'contacts', 'esthetics', 'surface', 'on_time'] as const) {
    if (patch[k] !== undefined) upd[k] = patch[k];
  }
  if (patch.comment !== undefined) upd.comment = patch.comment?.trim() || null;
  if (patch.photos !== undefined) upd.photos = patch.photos ?? [];
  if (patch.clinical_photos !== undefined) upd.clinical_photos = patch.clinical_photos ?? [];
  const { data, error } = await supabase
    .from('order_reviews')
    .update(upd)
    .eq('id', id)
    .select(COLS)
    .single();
  return { data: (data as OrderReview) ?? null, error };
}
