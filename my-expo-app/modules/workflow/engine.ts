import { supabase } from '../../core/api/supabase';

export async function createCaseSteps(
  workOrderId: string,
  _measurementType: 'manual' | 'digital' = 'manual',
) {
  // TODO: implement full workflow step creation based on measurement type
  // For now, no-op — order_stages will be created manually or via future migration
  return { data: null, error: null };
}
