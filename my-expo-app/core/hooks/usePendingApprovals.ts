import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export function usePendingApprovals() {
  const [count, setCount] = useState(0);

  const loadCount = async () => {
    const { count: c } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('user_type', 'doctor')
      .eq('approval_status', 'pending');
    setCount(c ?? 0);
  };

  useEffect(() => {
    loadCount();

    const channel = supabase
      .channel('pending_approvals_count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => loadCount()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return count;
}
