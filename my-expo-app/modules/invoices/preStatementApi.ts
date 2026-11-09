// Ön ekstre API — Supabase RPC sarmalayıcıları. Hatalar Error(message) olarak fırlatılır.

import { supabase } from '../../core/api/supabase';
import type {
  ApprovalMode, ApprovalResult, LinkPreStatement, PreStatement, PreStatementInvoice, StatementApprovalRow, StatementLink,
  StatementRequestContacts, StatementRequestResult, StatementSendChannel,
} from './types';
import { approvalPayload } from './lib/preStatement';

export async function fetchPreStatement(clinicId: string): Promise<PreStatement> {
  const { data, error } = await supabase.rpc('get_pre_statement', { p_clinic_id: clinicId });
  if (error) throw new Error(error.message);
  return data as PreStatement;
}

export async function addStatementNote(
  itemId: string, body: string,
): Promise<{ note_id: string; dispute_status: string | null }> {
  const { data, error } = await supabase.rpc('add_statement_note', {
    p_invoice_item_id: itemId, p_body: body,
  });
  if (error) throw new Error(error.message);
  return data as { note_id: string; dispute_status: string | null };
}

export async function resolveStatementDispute(
  itemId: string,
): Promise<{ invoice_item_id: string; dispute_status: string | null }> {
  const { data, error } = await supabase.rpc('resolve_statement_dispute', { p_invoice_item_id: itemId });
  if (error) throw new Error(error.message);
  return data as { invoice_item_id: string; dispute_status: string | null };
}

export async function approvePreStatement(
  clinicId: string, invoices: PreStatementInvoice[], mode: ApprovalMode,
): Promise<ApprovalResult> {
  const { data, error } = await supabase.rpc('approve_pre_statement', {
    p_clinic_id: clinicId, p_invoices: approvalPayload(invoices), p_mode: mode,
  });
  if (error) throw new Error(error.message);
  return data as ApprovalResult;
}

export async function recordClinicApproval(
  clinicId: string, invoices: PreStatementInvoice[], mode: ApprovalMode, reason: string,
): Promise<ApprovalResult> {
  const { data, error } = await supabase.rpc('record_clinic_approval', {
    p_clinic_id: clinicId, p_invoices: approvalPayload(invoices), p_mode: mode, p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data as ApprovalResult;
}

/** Kliniğin son onay kayıtları (yeni → eski). approved_by kişi adı olarak gösterilmez. */
export async function fetchStatementApprovals(clinicId: string, limit = 5): Promise<StatementApprovalRow[]> {
  const { data, error } = await supabase
    .from('statement_approvals')
    .select('id, via, mode, reason, created_at')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as StatementApprovalRow[];
}

// ─── Onay bağlantısı (plan 4) ───────────────────────────────────────────
// Jeton RPC'leri POST ile çağrılır (supabase.rpc). Jeton asla sorgu dizesine konmaz.

/** Lab (manage_finance): kliniğe yeni onay bağlantısı. Kliniğin önceki bağlantısını iptal eder. */
export async function createStatementLink(clinicId: string): Promise<StatementLink> {
  const { data, error } = await supabase.rpc('create_statement_link', { p_clinic_id: clinicId });
  if (error) throw new Error(error.message);
  return data as StatementLink;
}

/** Girişsiz: bağlantının ön ekstresi. Geçersiz/süresi geçmiş/iptal → PS_LINK_INVALID. */
export async function fetchPreStatementByLink(token: string): Promise<LinkPreStatement> {
  const { data, error } = await supabase.rpc('get_pre_statement_by_link', { p_token: token });
  if (error) throw new Error(error.message);
  return data as LinkPreStatement;
}

/** Girişsiz: bağlantının anlık görüntüsündeki taslakları onaylar (bir kez). */
export async function approvePreStatementByLink(token: string, mode: ApprovalMode): Promise<ApprovalResult> {
  const { data, error } = await supabase.rpc('approve_pre_statement_by_link', { p_token: token, p_mode: mode });
  if (error) throw new Error(error.message);
  return data as ApprovalResult;
}

/** Girişsiz: kaleme klinik notu (itiraz açar). Anlık görüntü dışı kalem → PS_SCOPE. */
export async function addStatementNoteByLink(
  token: string, itemId: string, body: string,
): Promise<{ note_id: string; dispute_status: string | null }> {
  const { data, error } = await supabase.rpc('add_statement_note_by_link', {
    p_token: token, p_invoice_item_id: itemId, p_body: body,
  });
  if (error) throw new Error(error.message);
  return data as { note_id: string; dispute_status: string | null };
}

// ─── "Onay iste" (plan 4 Task 5) ────────────────────────────────────────

/** Lab (manage_finance): alıcının hangi kanaldan ulaşılabilir olduğu (yalnız boolean). */
export async function fetchStatementRequestContacts(clinicId: string): Promise<StatementRequestContacts> {
  const { data, error } = await supabase.rpc('get_statement_request_contacts', { p_clinic_id: clinicId });
  if (error) throw new Error(error.message);
  return data as StatementRequestContacts;
}

/**
 * Lab (manage_finance): yeni onay bağlantısı oluşturur (öncekini iptal eder) ve seçili kanallardan
 * alıcıya gönderimi kuyruğa alır. Sonuç kanal başınadır; jeton dönmez.
 */
export async function requestPreStatementApproval(
  clinicId: string, channels: StatementSendChannel[],
): Promise<StatementRequestResult> {
  const { data, error } = await supabase.rpc('request_pre_statement_approval', {
    p_clinic_id: clinicId, p_channels: channels,
  });
  if (error) throw new Error(error.message);
  return data as StatementRequestResult;
}
