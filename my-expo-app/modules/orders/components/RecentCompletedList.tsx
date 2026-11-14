import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { localeTag } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
// modules/orders/components/RecentCompletedList.tsx
// Teknisyenin son tamamladığı işlerin read-only önizlemesi.
// Kuyruk listesinin altında durur. Müdahele yok — sadece bilgi.

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { CheckCircle2, ArrowRight, ArrowLeft, Clock, ChevronDown } from '../../../core/ui/icons';
import { isRTL } from '../../../core/i18n';
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
  if (diff < 60_000)        return `${Math.floor(diff / 1000)} ${autoT('sn önce')}`;
  if (diff < 3_600_000)     return `${Math.floor(diff / 60_000)} ${autoT('dk önce')}`;
  if (diff < 86_400_000)    return `${Math.floor(diff / 3_600_000)} ${autoT('sa önce')}`;
  if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)} ${autoT('gün önce')}`;
  return d.toLocaleDateString(localeTag(), { day: '2-digit', month: 'short' });
}

export function RecentCompletedList({
  accentColor, limit = 5, embedded = false, collapsible = false, surface, border,
}: {
  /** İnce kenar çizgisi rengi — verilirse 1px çizilir */
  border?: string;
  accentColor?: string;
  /** Kart zemini — verilmezse istasyon paleti (Özet'te komşu kartlarla aynı ton için) */
  surface?: string;
  limit?: number;
  /** true: dış kart yok — başka bir kartın içine gömülü olarak render edilir */
  embedded?: boolean;
  /** true: başlık tıklanınca açılır/kapanır; varsayılan kapalı (liste gizli) */
  collapsible?: boolean;
}) {
  const P = useStationTheme();
  const bandDark = useThemeModeStore((st: any) => st.resolvedDark);
  const bandBg = bandDark ? '#004B87' : P.accentDeep;
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
      // Alt bölümün TAMAMI düz mavi (başlık + açılan satırlar + alt boşluk) —
      // İşlerim'deki seçili iş kartının başlığıyla aynı ton.
      <View style={{ backgroundColor: bandBg }}>
        {/* Inline header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 13,
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
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: '#FFFFFF' }}>
              Son Tamamlananlar
            </Text>
            {collapsible && (
              <>
                <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.80)' }}>{items.length}</Text>
                <ChevronDown
                  size={15}
                  color="#FFFFFF"
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
            <Text style={{ fontSize: 13, color: '#FFFFFF', fontWeight: '600' }}>Tümü</Text>
            {isRTL() ? <ArrowLeft size={13} color="#FFFFFF" strokeWidth={2} /> : <ArrowRight size={13} color="#FFFFFF" strokeWidth={2} />}
          </Pressable>
        </View>

        {/* Kompakt geçmiş satırları */}
        {showRows && items.map((it) => {
          return (
            <View
              key={it.id}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 9,
                paddingHorizontal: 16, paddingVertical: 7,
              }}
            >
              <CheckCircle2 size={14} color="rgba(255,255,255,0.85)" strokeWidth={2} />
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF', flexShrink: 1 }} numberOfLines={1}>
                  {it.station_name ?? '—'}
                </Text>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)' }} numberOfLines={1}>
                  #{it.order_number ?? '—'}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)' }}>
                {it.completed_at ? formatRel(it.completed_at) : '—'}
              </Text>
            </View>
          );
        })}
        {showRows ? <View style={{ height: 8 }} /> : null}
      </View>
    );
  }

  // ── Standalone variant: kendi kartı ──
  return (
    <View style={{
      backgroundColor: surface ?? P.surface, borderRadius: 28,
      ...(border ? { borderWidth: 1, borderColor: border } : {}),
      overflow: 'hidden',
      ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0,0,0,0.04)' } as any : {}),
    }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: P.ink900, letterSpacing: -0.2 }}>
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
          <Text style={{ fontSize: 13, color: accent, fontWeight: '600' }}>Tümü</Text>
          {isRTL() ? <ArrowLeft size={13} color={accent} strokeWidth={2} /> : <ArrowRight size={13} color={accent} strokeWidth={2} />}
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
                paddingHorizontal: 16, paddingVertical: 9,
              }}
            >
              <CheckCircle2 size={15} color={stationColor} strokeWidth={2} />
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: P.ink900, flexShrink: 1 }} numberOfLines={1}>
                  {it.station_name ?? '—'}
                </Text>
                <Text style={{ fontSize: 12, color: P.ink500 }} numberOfLines={1}>
                  #{it.order_number ?? '—'}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: P.ink500 }}>
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
