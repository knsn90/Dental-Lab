import { useEffect, useState } from 'react';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/authStore';

/**
 * Sidebar "Onaylar" badge sayacı — kullanıcı rolüne göre.
 *
 *  - Tüm rollerde: bekleyen doktor kayıtları + bekleyen tasarım onayları
 *  - Lab manager / Admin için ayrıca: malzeme talebi (rol bazlı status)
 *    · manager → submitted
 *    · admin   → forwarded_admin
 */
export function usePendingApprovals() {
  const [count, setCount] = useState(0);
  const profile  = useAuthStore(s => s.profile);
  const userType = profile?.user_type;
  const userRole = (profile as any)?.role;

  const isManagerLike =
    userType === 'admin' ||
    (userType === 'lab' && (userRole === 'manager' || userRole === 'admin'));

  // Materyal status'u rolüne göre — manager submitted, admin forwarded_admin
  const matStatus: string | null =
    userType === 'admin'                              ? 'forwarded_admin'
    : (userType === 'lab' && userRole === 'manager')  ? 'submitted'
    : null;

  const loadCount = async () => {
    // 1) Bekleyen doktor kayıtları
    const { count: doctorCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('user_type', 'doctor')
      .eq('approval_status', 'pending');

    // 2) Bekleyen tasarım onayları (graceful fallback)
    let designCount = 0;
    try {
      const { count: dc } = await supabase
        .from('approvals')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      designCount = dc ?? 0;
    } catch { /* table yok */ }

    // 3) Malzeme talebi — rol bazlı
    let materialCount = 0;
    if (matStatus) {
      try {
        const { count: mc } = await supabase
          .from('material_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', matStatus);
        materialCount = mc ?? 0;
      } catch { /* table yok ya da yetki yok */ }
    }

    setCount((doctorCount ?? 0) + designCount + materialCount);
  };

  useEffect(() => {
    loadCount();

    const channel = supabase
      .channel(`pending_approvals_count_${Date.now()}_${Math.random().toString(36).slice(2,6)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' },         () => loadCount())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals' },        () => loadCount())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_requests' },() => loadCount())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userType, userRole]);

  return count;
}
