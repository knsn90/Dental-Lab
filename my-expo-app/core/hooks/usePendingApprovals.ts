import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export function usePendingApprovals() {
  const [count, setCount] = useState(0);

  const loadCount = async () => {
    // Count pending doctor registrations
    const { count: doctorCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('user_type', 'doctor')
      .eq('approval_status', 'pending');

    // Count pending MES design approvals (graceful fallback if table doesn't exist yet)
    let designCount = 0;
    try {
      const { count: dc } = await supabase
        .from('approvals')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      designCount = dc ?? 0;
    } catch {
      // table not yet created — ignore
    }

    setCount((doctorCount ?? 0) + designCount);
  };

  useEffect(() => {
    loadCount();

    const channel = supabase
      .channel('pending_approvals_count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadCount())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals' }, () => loadCount())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return count;
}
