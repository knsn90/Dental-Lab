import { localeTag } from '../../../core/i18n';
// modules/orders/components/RecentCompletedList.tsx
// Teknisyenin son tamamladığı işlerin read-only önizlemesi.
// Kuyruk listesinin altında durur. Müdahele yok — sadece bilgi.

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { CheckCircle2, ArrowRight, Clock, ChevronDown } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { useStationTheme, hexA } from '../../../core/theme/stationPalette';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

interface CompletedStage {
  id:           string;
  station_name: string | null;
  station_color: string | null;
  patient_name: string | null;
  order_number: string | null;
  completed_at: string | null;
}

function formatRel(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000)        return `${Math.floor(diff / 1000)} sn önce`;
  if (diff < 3_600_000)     return `${Math.floor(diff / 60_000)} dk önce`;
  if (diff < 86_400_000)    return `${Math.floor(diff / 3_600_000)} sa önce`;
  if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)} gün önce`;
  return d.toLocaleDateString(localeTag(), { day: '2-digit', month: 'short' });
}

export function RecentCompletedList({
  accentColor, limit = 5, embedded = false, collapsible = false,
}: {
  accentColor?: string;
  limit?: number;
  /** true: dış kart yok — başka bir kartın içine gömülü olarak render edilir */
  embedded?: boolean;
  /** true: başlık tıklanınca açılır/kapanır; varsayılan kapalı (liste gizli) */
  collapsible?: boolean;
}) {
  const P = useStationTheme();
  const accent = accentColor ?? P.accent;
  const { profile } = useAuthStore();
  const router = useRouter();
  const [items, setItems]   = useState<CompletedStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const showRows = !collapsible || expanded;

  useEffect(() => {
    if (!profile) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('order_stages')
        .select(`
          id, completed_at,
          station:lab_stations(name, color),
          work_order:work_orders!work_order_id(order_number, patient_name)
        `)
        .eq('technician_id', profile.id)
        .in('status', ['tamamlandi', 'onaylandi'])
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(limit);

      if (!alive) return;
      const list: CompletedStage[] = ((data ?? []) as any[]).map(r => ({
        id:            r.id,
        station_name:  r.station?.name ?? null,
        station_color: r.station?.color ?? null,
        patient_name:  r.work_order?.patient_name ?? null,
        order_number:  r.work_order?.order_number ?? null,
        completed_at:  r.completed_at,
      }));
      setItems(list);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [profile?.id, limit]);

  if (!profile || (loading && items.length === 0) || items.length === 0) {
    if (loading && !embedded) {
      return (
        <View style={{
          backgroundColor: P.surface, borderRadius: 24,
          borderWidth: 1, borderColor: P.ink100,
          paddingVertical: 18, alignItems: 'center',
          ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0,0,0,0.04)' } as any : {}),
        }}>
        </View>
      );
    }
    return null;
  }

  // ── Embedded variant: dış kart yok, sadece divider header + kompakt satırlar ──
  if (embedded) {
    return (
      <View>
        {/* Inline divider header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8,
          borderTopWidth: 1, borderTopColor: P.ink100,
          marginTop: 4,
        }}>
          <Pressable
            onPress={() => collapsible && setExpanded(v => !v)}
            disabled={!collapsible}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              ...(Platform.OS === 'web' && collapsible ? { cursor: 'pointer' } as any : {}),
            }}
          >
            <Text style={{ fontSize: 10.5, fontWeight: '700', color: P.ink400, letterSpacing: 1, textTransform: 'uppercase' }}>
              Son Tamamlananlar
            </Text>
            {collapsible && (
              <>
                <Text style={{ fontSize: 10.5, fontWeight: '600', color: P.ink400 }}>{items.length}</Text>
                <ChevronDown
                  size={14}
                  color={P.ink400}
                  strokeWidth={2}
                  style={Platform.OS === 'web' ? ({ transform: [{ rotate: expanded ? '180deg' : '0deg' }] } as any) : undefined}
                />
              </>
            )}
          </Pressable>
          <Pressable
            onPress={() => router.push('/(station)/history' as any)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              paddingHorizontal: 4,
              paddingVertical: 1,
              borderRadius: 5,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}
          >
            <Text style={{ fontSize: 11, color: accent, fontWeight: '600' }}>Tümü</Text>
            <ArrowRight size={11} color={accent} strokeWidth={2} />
          </Pressable>
        </View>

        {/* Kompakt geçmiş satırları */}
        {showRows && items.map((it) => {
          const stationColor = it.station_color ?? P.ink400;
          return (
            <View
              key={it.id}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 9,
                paddingHorizontal: 14, paddingVertical: 6,
                opacity: 0.7,
              }}
            >
              <CheckCircle2 size={12} color={stationColor} strokeWidth={2} />
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: P.ink700 }} numberOfLines={1}>
                  {it.station_name ?? '—'}
                </Text>
                <Text style={{ fontSize: 10.5, color: P.ink400 }} numberOfLines={1}>
                  #{it.order_number ?? '—'}
                </Text>
              </View>
              <Text style={{ fontSize: 10, color: P.ink400 }}>
                {it.completed_at ? formatRel(it.completed_at) : '—'}
              </Text>
            </View>
          );
        })}
        <View style={{ height: 8 }} />
      </View>
    );
  }

  // ── Standalone variant: kendi kartı ──
  return (
    <View style={{
      backgroundColor: P.surface, borderRadius: 24,
      borderWidth: 1, borderColor: P.ink100,
      overflow: 'hidden',
      ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0,0,0,0.04)' } as any : {}),
    }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{
            width: 22, height: 22, borderRadius: 7,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: hexA(P.success, 0.14),
          }}>
            <CheckCircle2 size={12} color={P.success} strokeWidth={1.8} />
          </View>
          <Text style={{ fontSize: 11, fontWeight: '700', color: P.ink900, letterSpacing: 1.0, textTransform: 'uppercase' }}>
            Son Tamamlananlar
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/(station)/history' as any)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 3,
            paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          }}
        >
          <Text style={{ fontSize: 10.5, color: accent, fontWeight: '600' }}>Tümü</Text>
          <ArrowRight size={11} color={accent} strokeWidth={2} />
        </Pressable>
      </View>
      <View>
        {items.map((it) => {
          const stationColor = it.station_color ?? P.ink400;
          return (
            <View
              key={it.id}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 9,
                paddingHorizontal: 14, paddingVertical: 6,
                opacity: 0.7,
              }}
            >
              <CheckCircle2 size={12} color={stationColor} strokeWidth={2} />
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: P.ink700 }} numberOfLines={1}>
                  {it.station_name ?? '—'}
                </Text>
                <Text style={{ fontSize: 10.5, color: P.ink400 }} numberOfLines={1}>
                  #{it.order_number ?? '—'}
                </Text>
              </View>
              <Text style={{ fontSize: 10, color: P.ink400 }}>
                {it.completed_at ? formatRel(it.completed_at) : '—'}
              </Text>
            </View>
          );
        })}
        <View style={{ height: 8 }} />
      </View>
    </View>
  );
}
