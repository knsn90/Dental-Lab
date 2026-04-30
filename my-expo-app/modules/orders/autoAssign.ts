// modules/orders/autoAssign.ts
// AUTO_ASSIGN(stage, lab, complexity, case_type) — skill + trust + workload aware.
// Migration 047: complexity & case_type filtering added.

import { supabase } from '../../core/api/supabase';
import type { Stage } from './stages';

export type Complexity = 'low' | 'medium' | 'high';

export async function autoAssignUser(
  stage:      Stage,
  labId:      string,
  complexity: Complexity = 'medium',
  caseType:   string | null = null,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('auto_assign_user_for_stage', {
    p_stage:      stage,
    p_lab_id:     labId,
    p_complexity: complexity,
    p_case_type:  caseType,
  });
  if (error) {
    console.warn('[autoAssign] RPC error:', error.message);
    return null;
  }
  return (data as string) ?? null;
}
