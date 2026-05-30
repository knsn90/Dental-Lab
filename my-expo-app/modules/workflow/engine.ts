import { supabase } from '../../core/api/supabase';
import { MANUAL_STEPS, DIGITAL_STEPS } from './templates';

export async function createCaseSteps(
  workOrderId: string,
  measurementType: 'manual' | 'digital' = 'manual',
  doctorApprovalRequired = false,
) {
  const template = measurementType === 'digital' ? DIGITAL_STEPS : MANUAL_STEPS;

  // doktor_onay adımı yalnızca gerektiğinde eklenir; kalan adımlar yeniden numaralandırılır
  const steps = template
    .filter(s => doctorApprovalRequired || s.name !== 'doktor_onay')
    .map((s, idx) => ({
      work_order_id:     workOrderId,
      step_name:         s.name,
      step_order:        idx + 1,
      status:            'pending' as const,
      requires_approval: s.name === 'doktor_onay',
    }));

  if (steps.length === 0) return { data: null, error: null };

  const { data, error } = await supabase
    .from('case_steps')
    .insert(steps)
    .select();

  return { data, error };
}
