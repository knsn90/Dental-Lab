// modules/dashboard/components/TechWorkloadCard.tsx
// Admin Özet — "Teknisyen iş yükü": kimin elinde kaç iş var, kim boşta.
// Kaynak: aktif teknisyen profilleri + açık (tamamlanmamış) order_stages.
//   elde   = aktif / durakladi / makine_bekliyor / onay_bekliyor / bloklu / yeniden
//   sırada = bekliyor
// Görsel dil admin Özet kartlarıyla aynı (T.card + hairline + DS.radius.xl).

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { DS } from '../../../core/theme/dsTokens';
import { HERO_NAVY } from '../../../core/ui/HeroGlow';
import { autoT } from '../../../core/i18n/autoTranslate';
import { isRTL } from '../../../core/i18n';
import { ArrowUpRight, ArrowUpLeft } from '../../../core/ui/icons';

interface Row { id: string; name: string; hand: number; queue: number }

const IN_HAND = ['aktif', 'durakladi', 'makine_bekliyor', 'onay_bekliyor', 'bloklu', 'yeniden'];
const OPEN = [...IN_HAND, 'bekliyor'];

let cachedRows: Row[] | null = null;

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toLocaleUpperCase() ?? '').join('') || '—';
}

/**
 * Varsayılan (prop'suz) hâli Admin Özet'tir — kobalt/lacivert, /(admin)/performance.
 * Lab Özet kendi renklerini verir (safran): `accent` çubuk/avatar zemini,
 * `accentText` baş harf rengi (açık accent'lerde okunur koyu ton), `href` ok bağlantısı.
 */
export function TechWorkloadCard({ accent: accentProp, accentText, href }: {
  accent?: string; accentText?: string; href?: string;
} = {}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { profile } = useAuthStore();
  const router = useRouter();
  const theme = usePanelTheme() as any;
  // Koyu temada kobalt parlak kalıyor → lacivert ailenin açık tonu (admin Özet ile aynı kural)
  const accent: string = accentProp ?? (isDark ? HERO_NAVY.light : (theme?.primary ?? DS.exec.primary));
  const initialsColor: string = accentText ?? (isDark ? '#93C5FD' : accent);
  // Son sonuç bellekte tutulur: sayfaya dönüldüğünde kart beklemeden dolu açılır
  const [rows, setRows] = useState<Row[] | null>(cachedRows);

  useEffect(() => {
    const labId = (profile as any)?.lab_id;
    if (!profile?.id) return;
    let alive = true;
    // Kalıcı önbellek (hesaba özel anahtar): sayfa yenilendiğinde kart diğerleriyle
    // AYNI ANDA dolu açılır; taze veri arka planda gelip yerine oturur.
    const cacheKey = `tech_workload_v1:${profile.id}`;
    if (!cachedRows) {
      AsyncStorage.getItem(cacheKey).then(raw => {
        if (!alive || !raw) return;
        try { const list = JSON.parse(raw) as Row[]; if (Array.isArray(list)) setRows(prev => prev ?? list); } catch { /* bozuk kayıt: yok say */ }
      }).catch(() => {});
    }
    (async () => {
      // İki sorgu PARALEL (eskiden art arda çalışıyordu; kart en geç açılan olarak kalıyordu).
      // Aşamalar RLS ile lab'a süzülür; teknisyene göre eşleme istemcide yapılır.
      let tq = supabase.from('profiles')
        .select('id, full_name')
        .eq('user_type', 'lab').eq('role', 'technician').eq('is_active', true);
      if (labId) tq = tq.eq('lab_id', labId);
      const [{ data: techs, error: tErr }, { data: stages, error: sErr }] = await Promise.all([
        tq,
        supabase.from('order_stages')
          .select('technician_id, status')
          .not('technician_id', 'is', null)
          .in('status', OPEN)
          .limit(5000),
      ]);
      if (tErr) console.warn('[workload] technicians load failed:', tErr.message);
      if (sErr) console.warn('[workload] stages load failed:', sErr.message);
      const counts = new Map<string, { hand: number; queue: number }>();
      for (const s of (stages ?? []) as any[]) {
        const c = counts.get(s.technician_id) ?? { hand: 0, queue: 0 };
        if (IN_HAND.includes(s.status)) c.hand += 1; else c.queue += 1;
        counts.set(s.technician_id, c);
      }
      const list: Row[] = ((techs ?? []) as any[]).map(p => ({
        id: p.id,
        name: (p.full_name ?? '').trim() || '—',
        hand: counts.get(p.id)?.hand ?? 0,
        queue: counts.get(p.id)?.queue ?? 0,
      })).sort((a, b) => (b.hand + b.queue) - (a.hand + a.queue) || a.name.localeCompare(b.name));
      cachedRows = list;
      AsyncStorage.setItem(cacheKey, JSON.stringify(list)).catch(() => {});
      if (alive) setRows(list);
    })();
    return () => { alive = false; };
  }, [profile?.id]);

  const max = Math.max(1, ...(rows ?? []).map(r => r.hand + r.queue));
  const shown = (rows ?? []).slice(0, 3);
  const more = (rows ?? []).length - shown.length;

  return (
    <View style={{
      // Izgara hücresini doldur: sarmalı satırda flex:1 tek başına yetmiyor (kart kısa kalıyordu)
      flex: 1, minHeight: '100%' as any, padding: 22, borderRadius: DS.radius.xl,
      backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: T.ink }}>{autoT('Teknisyen iş yükü')}</Text>
        <Pressable
          onPress={() => router.push((href ?? '/(admin)/performance') as any)}
          accessibilityRole="button"
          accessibilityLabel={autoT('Ekip')}
          hitSlop={8}
          style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}
        >
          {isRTL() ? <ArrowUpLeft size={14} color={T.ink3} strokeWidth={1.8} /> : <ArrowUpRight size={14} color={T.ink3} strokeWidth={1.8} />}
        </Pressable>
      </View>

      {rows === null ? (
        <View style={{ gap: 12 }}>
          {[0, 1, 2, 3].map(k => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: T.hairline }} />
              <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: T.hairline }} />
            </View>
          ))}
        </View>
      ) : rows.length === 0 ? (
        <Text style={{ fontSize: 13, color: T.ink3 }}>{autoT('Henüz teknisyen yok')}</Text>
      ) : (
        <View>
          {shown.map((r, i) => {
            const total = r.hand + r.queue;
            return (
              <View
                key={r.id}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8,
                  borderTopWidth: i > 0 ? 1 : 0, borderTopColor: T.hairline,
                }}
              >
                <View style={{
                  width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: `${accent}1F`,
                }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '600', color: initialsColor }}>{initialsOf(r.name)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink }} numberOfLines={1}>{r.name}</Text>
                  {/* Yük çubuğu: koyu = elde, açık = sırada; en dolu teknisyene göre ölçekli */}
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: T.hairline, overflow: 'hidden' }}>
                    <GrowBar index={i}>
                      {r.hand > 0 ? <View style={{ width: `${(r.hand / max) * 100}%`, backgroundColor: accent }} /> : null}
                      {r.queue > 0 ? <View style={{ width: `${(r.queue / max) * 100}%`, backgroundColor: `${accent}66` }} /> : null}
                    </GrowBar>
                  </View>
                </View>
                <Text
                  style={{ fontSize: 12, color: total === 0 ? T.ink3 : T.ink2, minWidth: 78, textAlign: 'right', fontVariant: ['tabular-nums'] as any }}
                  numberOfLines={1}
                >
                  {total === 0
                    ? autoT('boşta')
                    : `${r.hand} ${autoT('elde')} · ${r.queue} ${autoT('sırada')}`}
                </Text>
              </View>
            );
          })}
          {more > 0 ? (
            <Text style={{ fontSize: 12, color: T.ink3, marginTop: 8 }}>{`+${more} ${autoT('teknisyen daha')}`}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

// Çubuk soldan dolarak açılır (yalnız transform); bütün satırlar aynı anda.
function GrowBar({ index: _index, children }: { index: number; children: React.ReactNode }) {
  const reduce = Platform.OS === 'web' && typeof window !== 'undefined'
    && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.timing(v, { toValue: 1, duration: 420, delay: 0, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View style={{
      flexDirection: 'row', height: 6,
      transformOrigin: isRTL() ? 'right center' : 'left center',
      transform: [{ scaleX: v }],
    } as any}>
      {children}
    </Animated.View>
  );
}
