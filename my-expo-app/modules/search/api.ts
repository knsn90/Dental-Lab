// modules/search/api.ts — public.global_search (SECURITY INVOKER: çağıranın RLS'i uygulanır).
import { supabase } from '../../core/api/supabase';
import { EMPTY_RESULT, type GlobalSearchResult, type SearchKind } from './types';

export async function globalSearch(
  q: string,
  kinds: SearchKind[],
  opts: { labId?: string | null; includeArchived?: boolean } = {},
): Promise<GlobalSearchResult> {
  const { data, error } = await supabase.rpc('global_search', {
    p_q: q,
    p_kinds: kinds,
    p_lab_id: opts.labId ?? null,
    p_include_archived: !!opts.includeArchived,
  });
  if (error) throw error;
  return { ...EMPTY_RESULT, ...((data ?? {}) as Partial<GlobalSearchResult>) };
}
