/**
 * Sipariş DEĞİŞİKLİK talebi — planlama sonrası klinik/hekim oluşturur, admin + mesul müdür onaylar.
 * Onaylanınca önerilen alanlar + kalemler siparişe uygulanır (approve_order_change_request RPC).
 *
 * Not: create/approve/reject SECURITY DEFINER RPC'lerle çalışır (yetki + uygulama sunucuda).
 * fetch'ler doğrudan select (RLS: owner veya onaylayıcı görür).
 */
import { supabase } from '../../core/api/supabase';
import type { ClientOrderEditFields, ClientOrderEditItem } from './api';

export interface ChangeRequest {
  id: string;
  work_order_id: string;
  lab_id: string | null;
  requested_by: string;
  requester_name: string | null;
  proposed_fields: Record<string, any>;
  proposed_items: any[] | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  work_order?: { order_number: number | string | null; status: string | null; doctor_id: string | null } | null;
}

/** Değişiklik talebi oluştur (planlama sonrası). */
export async function createChangeRequest(
  orderId: string,
  fields: ClientOrderEditFields,
  items?: ClientOrderEditItem[] | null,
  note?: string | null,
) {
  const { data, error } = await supabase.rpc('create_order_change_request', {
    p_order_id: orderId,
    p_fields: fields,
    p_items: items ?? null,
    p_note: note ?? null,
  });
  return { data, error };
}

/** Bir siparişin en güncel değişiklik talebi (rozet/durum için). */
export async function fetchChangeRequestForOrder(orderId: string): Promise<ChangeRequest | null> {
  const { data } = await supabase
    .from('order_change_requests')
    .select('*')
    .eq('work_order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ChangeRequest) ?? null;
}

/** Onaylayıcılar için bekleyen değişiklik talepleri. */
export async function fetchPendingChangeRequests(): Promise<ChangeRequest[]> {
  const { data, error } = await supabase
    .from('order_change_requests')
    .select('*, work_order:work_orders(order_number, status, doctor_id)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ChangeRequest[];
}

/** Onayla → önerilen değişiklikleri uygula + talebi kapat. */
export async function approveChangeRequest(requestId: string, note?: string) {
  const { data, error } = await supabase.rpc('approve_order_change_request', { p_request_id: requestId, p_note: note ?? null });
  return { data, error };
}

export async function rejectChangeRequest(requestId: string, note?: string) {
  const { data, error } = await supabase.rpc('reject_order_change_request', { p_request_id: requestId, p_note: note ?? null });
  return { data, error };
}

// ── Önerilen değişiklikleri okunur satırlara çevir (onay panelinde göstermek için) ──
const FIELD_LABELS: Record<string, string> = {
  patient_name: 'Hasta', patient_id: 'TC/Pasaport', patient_gender: 'Cinsiyet',
  patient_nationality: 'Uyruk', patient_city: 'Şehir', work_type: 'İş tipi',
  shade: 'Renk', model_type: 'Model', delivery_method: 'Teslim şekli',
  delivery_date: 'Teslim tarihi', is_urgent: 'Acil', notes: 'Not', tooth_numbers: 'Dişler',
};

export function summarizeChangeFields(fields: Record<string, any>): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const [k, v] of Object.entries(fields ?? {})) {
    if (v == null || v === '') continue;
    const label = FIELD_LABELS[k] ?? k;
    let value: string;
    if (Array.isArray(v)) value = v.join(', ');
    else if (typeof v === 'boolean') value = v ? 'Evet' : 'Hayır';
    else value = String(v);
    rows.push({ label, value });
  }
  return rows;
}

export function summarizeChangeItems(items: any[] | null): string[] {
  if (!items?.length) return [];
  return items.map((it) => {
    const teeth = Array.isArray(it?.tooth_numbers) && it.tooth_numbers.length ? ` (${it.tooth_numbers.join(', ')})` : '';
    return `${it?.name ?? '—'}${teeth}${it?.quantity ? ` ×${it.quantity}` : ''}`;
  });
}
