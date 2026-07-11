// modules/station/components/MyPerformanceCard.tsx
// Teknisyenin kendi performans özeti — v_technician_performance'tan kendi satırı.
// Mobil dashboard'un sonunda durur. Read-only; "Detaylar →" Panel/analitiğe gider.

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Gauge, ArrowRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { useStationTheme, hexA } from '../../../core/theme/stationPalette';

interface PerfRow {
  total_stages: number | null;
  approved: number | null;
  rejected: number | null;
  approval_rate_pct: number | null;
  avg_duration_min: number | null;
}

const SUCCESS = '#2D9A6B', WARN = '#E89B2A', DANGER = '#D94B4B';
const rateColor = (p: number | null) => (p == null ? "#9A9A9A" : p >= 90 ? SUCCESS : p >= 70 ? WARN : DANGER);
const fmtMin = (m: number | null) => {
  if (m == null || m <= 0) return '—';
  const h = Math.floor(m / 60), mm = Math.round(m % 60);
  if (h && mm) return `${h} sa ${mm} dk`;
  if (h) return `${h} sa`;
  return `${mm} dk`;
};

export function MyPerformanceCard({ accentColor }: { accentColor?: string }) {
  const P = useStationTheme();
  const router = useRouter();
  const { profile } = useAuthStore();
  const accent = accentColor ?? P.accent;
  const [row, setRow] = useState<PerfRow | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const id = profile?.id;
    if (!id) { setLoaded(true); return; }
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from('v_technician_performance')
        .select('total_stages, approved, rejected, approval_rate_pct, avg_duration_min')
        .eq('technician_id', id)
        .maybeSingle();
      if (cancel) return;
      setRow((data as PerfRow) ?? null);
      setLoaded(true);
    })();
    return () => { cancel = true; };
  }, [profile?.id]);

  // Veri yoksa / henüz hiç iş yoksa kartı gösterme
  if (!loaded || !row || !(row.total_stages && row.total_stages > 0)) return null;

  const pct = row.approval_rate_pct ?? 0;
  const rc = rateColor(row.approval_rate_pct);

  const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12, backgroundColor: hexA(accent, 0.07) }}>
      <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: P.ink400, marginBottom: 3 }}>{label}</Text>
      <Text style={{ fontSize: 17, fontWeight: '800', color: color ?? P.ink900, letterSpacing: -0.3 }}>{value}</Text>
    </View>
  );

  return (
    <View style={{
      backgroundColor: P.surface, borderRadius: 24, overflow: 'hidden',
      borderWidth: 1, borderColor: P.ink100,
      ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0,0,0,0.04)' } as any : {}),
    }}>
      {/* Başlık */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA(accent, 0.14) }}>
            <Gauge size={12} color={accent} strokeWidth={1.9} />
          </View>
          <Text style={{ fontSize: 11, fontWeight: '700', color: P.ink900, letterSpacing: 1.0, textTransform: 'uppercase' }}>Performansım</Text>
        </View>
        <Pressable
          onPress={() => router.push('/(station)/stats' as any)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          }}
        >
          <Text style={{ fontSize: 10.5, color: accent, fontWeight: '600' }}>Detaylar</Text>
          <ArrowRight size={11} color={accent} strokeWidth={2} />
        </Pressable>
      </View>

      {/* Onay oranı barı */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: 11.5, color: P.ink500, fontWeight: '600' }}>Onay oranı</Text>
          <Text style={{ fontSize: 15, fontWeight: '800', color: rc, letterSpacing: -0.3 }}>%{Math.round(pct)}</Text>
        </View>
        <View style={{ position: 'relative', justifyContent: 'center' }}>
          {/* Ray */}
          <View style={{ height: 12, borderRadius: 999, backgroundColor: hexA(accent, 0.16), overflow: 'hidden' }}>
            <View style={{ position: 'absolute', left: 0, top: 3, bottom: 3, width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: accent, borderRadius: 999 }} />
          </View>
          {/* Knob — dolgu ucunda */}
          <View style={{
            position: 'absolute', left: `${Math.min(100, Math.max(0, pct))}%`, top: '50%',
            width: 18, height: 18, marginLeft: -9, marginTop: -9, borderRadius: 9,
            backgroundColor: accent,
            ...(Platform.OS === 'web' ? { boxShadow: `0 1px 3px rgba(0,0,0,0.15), 0 0 0 4px ${hexA(accent, 0.14)}` } as any : {}),
          }} />
        </View>
      </View>

      {/* Mini istatistikler */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 16 }}>
        <Stat label="Toplam" value={String(row.total_stages ?? 0)} />
        <Stat label="Onaylanan" value={String(row.approved ?? 0)} color={SUCCESS} />
        <Stat label="Ort. süre" value={fmtMin(row.avg_duration_min)} />
      </View>
    </View>
  );
}
