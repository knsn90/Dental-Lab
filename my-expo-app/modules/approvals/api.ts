import { supabase } from '../../core/api/supabase';
import { Approval } from './types';

export async function fetchApprovals(workOrderId: string): Promise<Approval[]> {
  const { data, error } = await supabase
    .from('approvals')
    .select(`
      *,
      requester:profiles!approvals_requested_by_fkey(id, full_name),
      approver:profiles!approvals_approved_by_fkey(id, full_name)
    `)
    .eq('work_order_id', workOrderId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Approval[];
}

export async function fetchPendingApprovals(): Promise<Approval[]> {
  const { data, error } = await supabase
    .from('approvals')
    .select(`
      *,
      requester:profiles!approvals_requested_by_fkey(id, full_name),
      approver:profiles!approvals_approved_by_fkey(id, full_name)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Approval[];
}

export async function requestApproval(
  workOrderId: string,
  stepName: string,
  requestedBy: string
): Promise<void> {
  // Prevent duplicate pending approvals
  const { data: existing } = await supabase
    .from('approvals')
    .select('id')
    .eq('work_order_id', workOrderId)
    .eq('step_name', stepName)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) return; // already pending

  const { error } = await supabase.from('approvals').insert({
    work_order_id: workOrderId,
    step_name:     stepName,
    status:        'pending',
    requested_by:  requestedBy,
  });
  if (error) throw new Error(error.message);
}

export async function approveApproval(
  approvalId: string,
  approverId: string,
  approverType: string
): Promise<void> {
  if (approverType !== 'admin') throw new Error('Sadece admin onaylayabilir');
  const { error } = await supabase
    .from('approvals')
    .update({
      status:      'approved',
      approved_by: approverId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', approvalId);
  if (error) throw new Error(error.message);
}

export async function rejectApproval(
  approvalId: string,
  approverId: string,
  approverType: string,
  reason: string
): Promise<void> {
  if (approverType !== 'admin') throw new Error('Sadece admin reddedebilir');
  const { error } = await supabase
    .from('approvals')
    .update({
      status:           'rejected',
      approved_by:      approverId,
      rejection_reason: reason,
      resolved_at:      new Date().toISOString(),
    })
    .eq('id', approvalId);
  if (error) throw new Error(error.message);
}
