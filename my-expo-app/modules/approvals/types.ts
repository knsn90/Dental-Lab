export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Approval {
  id: string;
  work_order_id: string;
  step_name: string;
  status: ApprovalStatus;
  requested_by: string;
  approved_by: string | null;
  rejection_reason: string | null;
  requested_at: string;
  resolved_at: string | null;
  created_at: string;
  requester?: { id: string; full_name: string };
  approver?: { id: string; full_name: string };
}
