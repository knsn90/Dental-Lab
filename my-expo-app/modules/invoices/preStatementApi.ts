// Ön ekstre API — Supabase RPC sarmalayıcıları. Hatalar Error(message) olarak fırlatılır.

import { supabase } from '../../core/api/supabase';
import type { ApprovalMode, ApprovalResult, PreStatement, PreStatementInvoice, StatementApprovalRow } from './types';
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
