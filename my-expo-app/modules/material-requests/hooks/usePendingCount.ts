/**
 * Malzeme talebi pending sayacı — rol-aware.
 *  · admin   → forwarded_admin
 *  · manager → submitted
 *  · diğer   → 0 (badge gösterilmez)
 *
 * Realtime: material_requests insert/update event'inde refetch.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../../core/api/supabase';
import { subscribeShared } from '../../../core/api/sharedChannel';
import { useAuthStore } from '../../../core/store/authStore';

export function useMaterialRequestPending(): number {
  const profile = useAuthStore(s => s.profile);
  const userType = profile?.user_type;
  const userRole = (profile as any)?.role;

  const status: string | null =
    userType === 'admin'                              ? 'forwarded_admin'
    : (userType === 'lab' && userRole === 'manager')  ? 'submitted'
    : null;

  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!status) { setCount(0); return; }
    let cancelled = false;
    const tick = async () => {
      try {
        const { count: n } = await supabase
          .from('material_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', status);
        if (!cancelled) setCount(n ?? 0);
      } catch { /* ignore */ }
    };
    tick();
    // Kanal adı SABİT ve paylaşımlı. Eskiden ada `Date.now()` ekleniyordu; bu,
    // her mount'ta yeni bir realtime aboneliği yaratıp `realtime.subscription`
    // tablosunu şişiriyordu (bkz. core/api/sharedChannel.ts başlığındaki ölçüm).
    const unsubscribe = subscribeShared(
      `mat_req_pending:${status}`,
      [{ event: '*', schema: 'public', table: 'material_requests' }],
      () => { if (!cancelled) tick(); },
    );
    return () => { cancelled = true; unsubscribe(); };
  }, [status, userType, userRole]);

  return count;
}
