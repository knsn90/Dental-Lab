// modules/advance-requests/api.ts
// Avans Talepleri — onay akışlı (bekliyor → onaylandi/reddedildi/iptal).
// Teknisyen kendi adına talep eder; admin onaylar. Onaylanınca employee_advances
// defterine bir kayıt düşer ve request.advance_id ona bağlanır.

import { supabase } from '../../core/api/supabase';

export type AdvanceStatus = 'bekliyor' | 'onaylandi' | 'reddedildi' | 'iptal';

export interface AdvanceRequest {
  id: string;
  lab_id: string;
  employee_id: string;
  amount: number;
  reason: string | null;
  status: AdvanceStatus;
  reject_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  advance_id: string | null;
  created_at: string;
}

export type AdvanceRequestWithEmployee = AdvanceRequest & {
  employees: { full_name: string; role: string } | null;
};

export const ADVANCE_STATUS_CFG: Record<AdvanceStatus, { label: string; fg: string; bg: string }> = {
  bekliyor:   { label: 'Bekliyor',   fg: '#E89B2A', bg: 'rgba(232,155,42,0.12)' },
  onaylandi:  { label: 'Onaylandı',  fg: '#2D9A6B', bg: 'rgba(45,154,107,0.12)' },
  reddedildi: { label: 'Reddedildi', fg: '#D94B4B', bg: 'rgba(217,75,75,0.12)' },
  iptal:      { label: 'İptal',      fg: '#6B6B6B', bg: 'rgba(107,107,107,0.10)' },
};

// ── Teknisyen ──────────────────────────────────────────────────────────────
export async function fetchMyAdvanceRequests(employeeId: string) {
  return supabase
    .from('employee_advance_requests')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .returns<AdvanceRequest[]>();
}

export async function createAdvanceRequest(params: { employee_id: string; amount: number; reason?: string }) {
  return supabase.from('employee_advance_requests').insert({
    employee_id: params.employee_id,
    amount: params.amount,
    reason: params.reason ?? null,
  }).select().single();
}

export async function cancelAdvanceRequest(id: string) {
  return supabase.from('employee_advance_requests')
    .update({ status: 'iptal' })
    .eq('id', id)
    .eq('status', 'bekliyor');
}

// ── Admin ────────────────────────────────────────────────────────────────────
export async function fetchPendingAdvanceRequests() {
  return supabase
    .from('employee_advance_requests')
    .select('*, employees(full_name, role)')
    .eq('status', 'bekliyor')
    .order('created_at', { ascending: true })
    .returns<AdvanceRequestWithEmployee[]>();
}

export async function fetchAllAdvanceRequests(limit = 100) {
  return supabase
    .from('employee_advance_requests')
    .select('*, employees(full_name, role)')
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<AdvanceRequestWithEmployee[]>();
}

/**
 * Talebi onayla: employee_advances defterine kayıt düşer + request güncellenir.
 * Hata olursa { error } döner, request durumu değişmez.
 */
export async function approveAdvanceRequest(req: AdvanceRequest, approvedBy: string) {
  const today = new Date().toISOString().slice(0, 10);

  // Önce talebi KOŞULLU sahiplen (yalnız hâlâ 'bekliyor' ise) — iki onaylayıcı
  // aynı anda basarsa ikincisi 0 satır günceller ve avans İKİ KEZ yazılmaz.
  const { data: claimed, error: claimErr } = await supabase
    .from('employee_advance_requests')
    .update({
      status: 'onaylandi',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    })
    .eq('id', req.id)
    .eq('status', 'bekliyor')
    .select();
  if (claimErr) return { error: claimErr };
  if (!claimed || claimed.length === 0) {
    return { error: { message: 'Bu talep zaten sonuçlandırılmış (başka bir onaylayıcı işlemiş olabilir).' } as any };
  }

  const { data: adv, error: advErr } = await supabase
    .from('employee_advances')
    .insert({
      employee_id: req.employee_id,
      amount: req.amount,
      advance_date: today,
      description: req.reason ?? 'Avans talebi (onaylandı)',
    })
    .select()
    .single();
  if (advErr) {
    // Defter kaydı yazılamadı → talebi geri 'bekliyor'a al ki kilitli kalmasın
    await supabase
      .from('employee_advance_requests')
      .update({ status: 'bekliyor', approved_by: null, approved_at: null })
      .eq('id', req.id)
      .eq('status', 'onaylandi');
    return { error: advErr };
  }

  return supabase
    .from('employee_advance_requests')
    .update({ advance_id: (adv as any)?.id ?? null })
    .eq('id', req.id)
    .select()
    .single();
}

export async function rejectAdvanceRequest(id: string, rejectReason: string, approvedBy: string) {
  return supabase
    .from('employee_advance_requests')
    .update({
      status: 'reddedildi',
      reject_reason: rejectReason,
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
}
