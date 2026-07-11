/**
 * Sipariş iptal talebi — klinik/hekim oluşturur, admin + mesul müdür onaylar.
 * Onaylanınca yumuşak iptal: work_orders.status = 'iptal' (kayıt korunur).
 */
import { supabase } from '../../core/api/supabase';

export type CancelReasonCode = 'wrong_info' | 'patient_cancelled' | 'duplicate' | 'wrong_type' | 'other';

export const CANCEL_REASONS: { code: CancelReasonCode; label: string }[] = [
  { code: 'wrong_info',       label: 'Yanlış/eksik bilgi girdim' },
  { code: 'patient_cancelled',label: 'Hasta vazgeçti' },
  { code: 'duplicate',        label: 'Mükerrer (çift) kayıt' },
  { code: 'wrong_type',       label: 'Yanlış sipariş tipi/ürün' },
  { code: 'other',            label: 'Diğer' },
];

export function cancelReasonLabel(code?: string | null): string {
  return CANCEL_REASONS.find((r) => r.code === code)?.label ?? (code ?? '—');
}

export interface CancelRequest {
  id: string;
  work_order_id: string;
  lab_id: string | null;
  requested_by: string;
  requester_name: string | null;
  reason_code: string;
  reason_detail: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  work_order?: { order_number: number | string | null; status: string | null; doctor_id: string | null } | null;
}

export async function createCancelRequest(p: {
  workOrderId: string;
  labId?: string | null;
  requestedBy: string;
  requesterName?: string | null;
  reasonCode: CancelReasonCode;
  reasonDetail?: string | null;
}) {
  return supabase.from('order_cancellation_requests').insert({
    work_order_id: p.workOrderId,
    lab_id:        p.labId ?? null,
    requested_by:  p.requestedBy,
    requester_name:p.requesterName ?? null,
    reason_code:   p.reasonCode,
    reason_detail: p.reasonDetail ?? null,
  });
}

/** Bir siparişin en güncel iptal talebi (rozet/durum için). */
export async function fetchCancelRequestForOrder(workOrderId: string): Promise<CancelRequest | null> {
  const { data } = await supabase
    .from('order_cancellation_requests')
    .select('*')
    .eq('work_order_id', workOrderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as CancelRequest) ?? null;
}

/** Onaylayıcılar (admin + mesul müdür) için bekleyen talepler. */
export async function fetchPendingCancelRequests(): Promise<CancelRequest[]> {
  const { data, error } = await supabase
    .from('order_cancellation_requests')
    .select('*, work_order:work_orders(order_number, status, doctor_id)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CancelRequest[];
}

/** Onayla → yumuşak iptal (work_orders.status='iptal') + açık aşamaları kapat + talep approved.
 *  Tercihen tek RPC (approve_order_cancellation — migration 20260711140000);
 *  RPC henüz deploy edilmediyse eski direkt-update yoluna düşer (geriye uyumlu). */
export async function approveCancelRequest(req: CancelRequest, reviewerId: string) {
  const { error: rpcErr } = await supabase.rpc('approve_order_cancellation', { p_request_id: req.id });
  if (!rpcErr) return { error: null };

  // RPC tanımlı değilse (migration uygulanmadıysa) legacy yol; diğer hatalar aynen döner.
  const missingFn = rpcErr.code === 'PGRST202' || /could not find the function/i.test(rpcErr.message ?? '');
  if (!missingFn) return { error: rpcErr };

  const { error: woErr } = await supabase
    .from('work_orders')
    .update({ status: 'iptal' })
    .eq('id', req.work_order_id);
  if (woErr) return { error: woErr };

  return supabase
    .from('order_cancellation_requests')
    .update({ status: 'approved', reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq('id', req.id);
}

export async function rejectCancelRequest(req: CancelRequest, reviewerId: string, note?: string) {
  return supabase
    .from('order_cancellation_requests')
    .update({ status: 'rejected', reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), review_note: note ?? null })
    .eq('id', req.id);
}
