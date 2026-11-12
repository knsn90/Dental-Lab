// Lab yöneticisi panosu: İş tipi dağılımı verisi (Admin Özet ile aynı pencere —
// son 6 ayın başından bugüne, iptal/dişsiz hariç, iş kendi biriminde).
// enabled=false iken hiçbir istek atılmaz (teknisyen vb. panolar etkilenmez).
import { useEffect, useState } from 'react';
import { supabase } from '../../../core/api/supabase';
import { unitMapOf, workTypeDistribution, type WorkTypeRow } from '../lib/distributions';

export function useManagerDistributions(enabled: boolean): { byWorkType: WorkTypeRow[] } {
  const [byWorkType, setByWorkType] = useState<WorkTypeRow[]>([]);
  useEffect(() => {
    if (!enabled) { setByWorkType([]); return; }
    let alive = true;
    const from = new Date();
    from.setDate(1); from.setHours(0, 0, 0, 0); from.setMonth(from.getMonth() - 5);
    Promise.all([
      supabase.from('work_orders').select('work_type, status, tooth_numbers').gte('created_at', from.toISOString()),
      supabase.from('lab_services').select('name, unit'),
    ]).then(([ordersRes, svcRes]) => {
      if (!alive || ordersRes.error) return;
      setByWorkType(workTypeDistribution((ordersRes.data ?? []) as any[], unitMapOf((svcRes.data ?? []) as any[])));
    }).catch(() => {});
    return () => { alive = false; };
  }, [enabled]);
  return { byWorkType };
}
