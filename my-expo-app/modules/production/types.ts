export type StepStatus = 'pending' | 'active' | 'done' | 'blocked';

export interface CaseStep {
  id: string;
  work_order_id: string;
  step_name: string;
  step_order: number;
  status: StepStatus;
  assigned_to: string | null;
  requires_approval: boolean;
  started_at: string | null;
  finished_at: string | null;
  notes: string | null;
  created_at: string;
  assignee?: { id: string; full_name: string };
}

export interface StartStepParams {
  stepId: string;
  userId: string;
}

export interface CompleteStepParams {
  stepId: string;
  userId: string;
  notes?: string;
}
