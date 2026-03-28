import { supabase } from '../../core/api/supabase';
import { CaseStep } from './types';

export async function fetchCaseSteps(workOrderId: string): Promise<CaseStep[]> {
  const { data, error } = await supabase
    .from('case_steps')
    .select('*, assignee:profiles!case_steps_assigned_to_fkey(id, full_name)')
    .eq('work_order_id', workOrderId)
    .order('step_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CaseStep[];
}

export async function startStep(stepId: string, userId: string): Promise<void> {
  // 1. Fetch the step
  const { data: step, error: stepErr } = await supabase
    .from('case_steps')
    .select('*')
    .eq('id', stepId)
    .single();
  if (stepErr || !step) throw new Error('Adım bulunamadı');

  // 2. Previous step must be done
  if (step.step_order > 1) {
    const { data: prev } = await supabase
      .from('case_steps')
      .select('status')
      .eq('work_order_id', step.work_order_id)
      .eq('step_order', step.step_order - 1)
      .single();
    if (prev?.status !== 'done') {
      throw new Error('Önceki adım henüz tamamlanmadı');
    }
  }

  // 3. Approval gate: milling cannot start without approved design approval
  if (step.step_name === 'milling') {
    const { data: approval } = await supabase
      .from('approvals')
      .select('status')
      .eq('work_order_id', step.work_order_id)
      .eq('step_name', 'design')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!approval || approval.status !== 'approved') {
      throw new Error('Frezeleme için tasarım onayı gereklidir');
    }
  }

  // 4. Start
  const { error } = await supabase
    .from('case_steps')
    .update({
      status: 'active',
      started_at: new Date().toISOString(),
      assigned_to: userId,
    })
    .eq('id', stepId);
  if (error) throw new Error(error.message);
}

export async function completeStep(
  stepId: string,
  userId: string,
  notes?: string
): Promise<void> {
  const { data: step, error: stepErr } = await supabase
    .from('case_steps')
    .select('*')
    .eq('id', stepId)
    .single();
  if (stepErr || !step) throw new Error('Adım bulunamadı');
  if (step.status !== 'active') throw new Error('Sadece aktif adımlar tamamlanabilir');

  // Complete
  const { error } = await supabase
    .from('case_steps')
    .update({
      status: 'done',
      finished_at: new Date().toISOString(),
      notes: notes ?? null,
    })
    .eq('id', stepId);
  if (error) throw new Error(error.message);

  // Auto-create approval request if this step requires one
  if (step.requires_approval) {
    await supabase.from('approvals').insert({
      work_order_id: step.work_order_id,
      step_name:     step.step_name,
      status:        'pending',
      requested_by:  userId,
    });
  }
}
