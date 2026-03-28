import { supabase } from '../../core/api/supabase';
import { MANUAL_STEPS, DIGITAL_STEPS } from './templates';
import { MeasurementType, StepDefinition } from './types';

export function getTemplate(type: MeasurementType): StepDefinition[] {
  return type === 'digital' ? DIGITAL_STEPS : MANUAL_STEPS;
}

export async function createWorkflow(
  workOrderId: string,
  measurementType: MeasurementType
): Promise<{ error: string | null }> {
  const steps = getTemplate(measurementType);
  const rows = steps.map((s) => ({
    work_order_id:      workOrderId,
    step_name:          s.name,
    step_order:         s.order,
    requires_approval:  s.requires_approval,
    status:             'pending',
  }));

  const { error } = await supabase.from('case_steps').insert(rows);
  return { error: error?.message ?? null };
}
