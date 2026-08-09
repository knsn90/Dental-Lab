import { useEffect, useState } from 'react';
import { supabase } from '../api/supabase';
import { subscribeShared } from '../api/sharedChannel';
import { useAuthStore } from '../store/authStore';

/**
 * Bu hook 8 yerden mount ediliyor — dördü panel layout'u (lab/admin/clinic/doctor).
 * Eskiden her instance `..._${Date.now()}_${random}` adıyla kendi kanalını açıp
 * ÜÇ tabloya birden filtresiz abone oluyordu; ölçümde profiles 5, approvals 4,
 * material_requests 4 aboneliğin kaynağı buydu.
 *
 * Aşağıdaki coalesce, aynı anda gelen sayım isteklerini de tek turda birleştirir
 * (yoksa tek olayda 4 mount × 3 HEAD sorgusu = 12 istek).
 */
let countInFlight: Promise<number> | null = null;

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
  // Oturum gelmeden sorgu atılırsa Supabase 401 döner ve sayaç 0'da kalır;
  // ölçümde `profiles?approval_status=eq.pending` tam olarak böyle düşüyordu.
  const userId   = useAuthStore(s => s.session?.user?.id ?? null);
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
    // Aynı anda gelen çağrılar tek turda birleşir.
    if (!countInFlight) {
      countInFlight = (async () => {
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
        return (doctorCount ?? 0) + designCount + materialCount;
      })().finally(() => { countInFlight = null; });
    }
    setCount(await countInFlight);
  };

  useEffect(() => {
    if (!userId) return;                     // oturum yok → istek de abonelik de yok
    loadCount();
    return subscribeShared(
      'pending_approvals_count',
      [
        { event: '*', schema: 'public', table: 'profiles' },
        { event: '*', schema: 'public', table: 'approvals' },
        { event: '*', schema: 'public', table: 'material_requests' },
      ],
      () => { loadCount(); },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userType, userRole, userId]);

  return count;
}
