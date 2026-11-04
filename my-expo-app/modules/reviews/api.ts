import { supabase } from '../../core/api/supabase';
import type { OrderReview, ReviewInput, PendingReviewOrder, ReviewDashboard, ReviewCallState, ReviewCallAction } from './types';
import { pendingReviewSince } from './reviewRules';

const COLS = 'id, work_order_id, lab_id, rater_id, rater_role, source, rater_doctor_id, overall, fit, occlusion, contacts, esthetics, surface, on_time, comment, photos, clinical_photos, lab_reply, lab_reply_at, lab_reply_by, created_at, updated_at';

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

/** İşin tek değerlendirmesi (iş başına bir tane; hekim, klinik veya WhatsApp). Yoksa null. */
export async function getOrderReview(workOrderId: string): Promise<{ data: OrderReview | null; error: any }> {
  const { data, error } = await supabase
    .from('order_reviews')
    .select(COLS)
    .eq('work_order_id', workOrderId)
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

/** Son 30 günde teslim edilip HENÜZ HİÇ değerlendirilmemiş işler (hekim/klinik panosu).
 *  work_orders RLS'i kullanıcıyı kendi işlerine kısıtlar. Değerlendirme iş başına
 *  tektir: hekim, klinik ya da WhatsApp'tan biri puanladıysa iş listeden çıkar. */
export async function listMyPendingReviews(limit = 50): Promise<{ data: PendingReviewOrder[]; error: any }> {
  const { data: orders, error } = await supabase
    .from('work_orders')
    .select('id, order_number, patient_name, work_type, delivery_date')
    .eq('status', 'teslim_edildi')
    .gte('delivered_at', pendingReviewSince(new Date()))
    .order('delivered_at', { ascending: false })
    .limit(limit);
  if (error) return { data: [], error };
  const ids = (orders ?? []).map((o: any) => o.id);
  if (!ids.length) return { data: [], error: null };
  const { data: reviews } = await supabase
    .from('order_reviews')
    .select('work_order_id')
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
  // İş başına tek değerlendirme (tekil indeks): başka biri — klinik, hekim ya da
  // WhatsApp cevabı — az önce puanladı.
  if ((error as any)?.code === '23505') {
    return { data: null, error: { message: 'Bu iş az önce değerlendirildi. Sayfayı yenileyip düzenleyebilirsiniz.' } };
  }
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

export interface ReviewWaSettings {
  enabled: boolean;
  enabled_at: string | null;
  delay_days: number;
  has_whatsapp: boolean;
}

/** Lab ayarı: teslimden sonra WhatsApp puan isteği (yalnız lab yöneticisi). */
export async function getReviewWaSettings(): Promise<{ data: ReviewWaSettings | null; error: any }> {
  const { data, error } = await supabase.rpc('get_review_wa_settings');
  return { data: (data as ReviewWaSettings) ?? null, error };
}

export async function setReviewWaSettings(enabled: boolean, delayDays: number): Promise<{ data: ReviewWaSettings | null; error: any }> {
  const { data, error } = await supabase.rpc('set_review_wa_settings', { p_enabled: enabled, p_delay_days: delayDays });
  return { data: (data as ReviewWaSettings) ?? null, error };
}

/**
 * Değerlendirmeler ekranı verisi (yalnız lab yöneticisi; sunucu denetler).
 * `month` 'YYYY-MM-01'; verilmezse sunucu `focus` işinin ayını ya da TR saatiyle bu ayı seçer.
 */
export async function getReviewDashboard(month?: string | null, focus?: string | null): Promise<{ data: ReviewDashboard | null; error: any }> {
  const { data, error } = await supabase.rpc('get_review_dashboard', { p_month: month ?? null, p_focus: focus ?? null });
  return { data: (data as ReviewDashboard) ?? null, error };
}

/** Düşük puanlı işin arama kaydı: işaretle / notu düzenle / işareti kaldır. */
export async function setReviewFollowupCall(workOrderId: string, action: ReviewCallAction, note?: string | null): Promise<{ data: ReviewCallState | null; error: any }> {
  const { data, error } = await supabase.rpc('review_followup_set_call', { p_work_order: workOrderId, p_action: action, p_note: note ?? null });
  return { data: (data as ReviewCallState) ?? null, error };
}
