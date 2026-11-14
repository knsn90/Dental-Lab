// modules/station/components/MyPerformanceCard.tsx
// Teknisyen Özet — "Performansım". Admin Özet'teki İş Tipi Dağılımı kartıyla AYNI
// dil (iç içe halkalar + noktalı liste): tamamladığı aşamaların istasyona göre
// dağılımı. Başlığın sağında toplam aşama ve onaylanan sayısı.
// Kaynak: order_stages (kendi tamamladıkları) + v_technician_performance (onay).

import React, { useEffect, useState } from 'react';
import { autoT } from '../../../core/i18n/autoTranslate';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import {
  SpineCard, SpineRow, WorkTypeRings, WORKTYPE_RAMP, WORKTYPE_RAMP_DARK,
} from '../../dashboard/components/DistributionCards';

interface StationShare { label: string; count: number }

// accentColor/surface/border: eski çağrı yerleriyle uyum için kabul edilir; kart
// görünümünü admin'deki SpineCard belirler.
export function MyPerformanceCard(_props: { accentColor?: string; surface?: string; border?: string }) {
  const { profile } = useAuthStore();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const [rows, setRows] = useState<StationShare[] | null>(null);
  const [approved, setApproved] = useState<number | null>(null);

  useEffect(() => {
    const id = profile?.id;
    if (!id) { setRows([]); return; }
    let cancel = false;
    (async () => {
      const [{ data: stages }, { data: perf }] = await Promise.all([
        supabase.from('order_stages')
          .select('station:lab_stations(name)')
          .eq('technician_id', id)
          .in('status', ['tamamlandi', 'onaylandi'])
          .limit(2000),
        supabase.from('v_technician_performance')
          .select('approved')
          .eq('technician_id', id)
          .maybeSingle(),
      ]);
      if (cancel) return;
      const counts = new Map<string, number>();
      for (const s of (stages ?? []) as any[]) {
        const name = s.station?.name ?? '—';
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      setRows(Array.from(counts.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count));
      setApproved((perf as any)?.approved ?? null);
    })();
    return () => { cancel = true; };
  }, [profile?.id]);

  // Veri yoksa / henüz hiç iş yoksa kartı gösterme
  if (!rows || rows.length === 0) return null;

  const ramp = isDark ? WORKTYPE_RAMP_DARK : WORKTYPE_RAMP;
  const total = rows.reduce((s, r) => s + r.count, 0);
  const top = rows.slice(0, ramp.length);
  const rest = rows.slice(ramp.length).reduce((s, r) => s + r.count, 0);
  const share = (n: number) => (total > 0 ? n / total : 0);
  const head = approved != null
    ? `${total} ${autoT('aşama')} · ${approved} ${autoT('onaylı')}`
    : `${total} ${autoT('aşama')}`;

  return (
    <SpineCard
      title={autoT('Performansım')}
      value={head}
      segments={top.map((r, i) => ({ color: ramp[i], pct: share(r.count) }))}
      visual={<WorkTypeRings items={top.map((r, i) => ({ color: ramp[i], pct: share(r.count) }))} />}
    >
      {top.map((r, i) => (
        <SpineRow
          key={r.label}
          color={ramp[i]}
          label={r.label}
          value={r.count}
          meta={`${Math.round(share(r.count) * 100)}%`}
        />
      ))}
      {rest > 0 ? <SpineRow label={autoT('Diğer')} value={rest} meta={`${Math.round(share(rest) * 100)}%`} /> : null}
    </SpineCard>
  );
}
