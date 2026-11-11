import { supabase } from '../../../core/api/supabase';
import { parseUserWorkStats, isUnregisteredUserId, workStatsErrorText, type UserWorkStats } from './userWorkStats';

export type WorkStatsResult =
  | { ok: true; stats: UserWorkStats }
  | { ok: false; reason: 'unregistered' | 'error'; message: string };

/** Detay paneli istatistiği — sunucu fonksiyonu get_user_work_stats. Hata YUTULMAZ. */
export async function fetchUserWorkStats(userId: string): Promise<WorkStatsResult> {
  if (isUnregisteredUserId(userId)) {
    return { ok: false, reason: 'unregistered', message: 'Hesabı olmayan personelin istatistiği tutulmaz' };
  }
  const { data, error } = await supabase.rpc('get_user_work_stats', { p_user_id: userId });
  if (error) return { ok: false, reason: 'error', message: workStatsErrorText(error) };
  return { ok: true, stats: parseUserWorkStats(data) };
}
