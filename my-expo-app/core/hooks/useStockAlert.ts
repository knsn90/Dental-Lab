import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

/** Returns the count of stock items below their minimum quantity. */
export function useStockAlert() {
  const [count, setCount] = useState(0);

  const load = async () => {
    try {
      // stock_items table: quantity < min_quantity
      const { count: c } = await supabase
        .from('stock_items')
        .select('*', { count: 'exact', head: true })
        .lt('quantity', supabase.raw('min_quantity') as any);

      // Fallback: if raw() not supported, fetch rows and filter client-side
      if (c === null) {
        const { data } = await supabase
          .from('stock_items')
          .select('quantity, min_quantity');
        const low = (data ?? []).filter((r: any) => r.quantity < r.min_quantity).length;
        setCount(low);
        return;
      }
      setCount(c ?? 0);
    } catch {
      // Table not yet created — show no badge
      setCount(0);
    }
  };

  useEffect(() => {
    load();

    const channel = supabase
      .channel('stock_alert')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_items' }, load)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return count;
}
