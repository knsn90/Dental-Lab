// app/dev/patterns-mobile.tsx
// Aydın Lab Mobile patterns showcase — handoff tokens + atom inventory.
// Görsel ref: /Downloads/App onboarding (1)/design_handoff_aydin_lab_mobile

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Platform, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Home, ListChecks, MessageSquare, User, Plus, Bell, Search, Calendar,
  Printer, Mic, Truck, Filter, Check, X, Flame, LogOut, QrCode, ClipboardList,
  AlertTriangle, ChevronRight, FileCheck, SlidersHorizontal,
} from 'lucide-react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  MOBILE_TOKENS as T,
  MOBILE_PANEL_THEMES,
  MOBILE_STATUS,
  type StatusKind,
} from '../../core/theme/mobileDesignTokens';
import { FabTabBar, type FabTabItem } from '../../core/ui/mobile/FabTabBar';
import { AppBar } from '../../core/ui/mobile/AppBar';
import { Ring as RingX } from '../../core/ui/mobile/Ring';

// ── Atom: StatusPill ────────────────────────────────────────────────────────
function StatusPill({ kind, dense, dark }: { kind: StatusKind; dense?: boolean; dark?: boolean }) {
  const s = MOBILE_STATUS[kind];
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: dense ? 8 : 10, paddingVertical: dense ? 3 : 5,
      borderRadius: 999,
      backgroundColor: dark ? 'rgba(255,255,255,0.06)' : s.bg,
    }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.dot }} />
      <Text style={{ fontSize: dense ? 11 : 12, fontWeight: '500', color: dark ? T.onDark : s.fg }}>
        {s.label}
      </Text>
    </View>
  );
}

// ── Atom: Ring (animated progress) ──────────────────────────────────────────
function Ring({
  value = 40, size = 64, stroke = 5, color = T.accent, track = 'rgba(20,16,12,0.08)',
  withStartDot, children,
}: {
  value?: number; size?: number; stroke?: number; color?: string; track?: string;
  /** Beyaz başlangıç noktası (handoff dashboard ring variant) */
  withStartDot?: boolean;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * (value / 100);
  const dotR = stroke * 0.9;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round" />
        {withStartDot && (
          <Circle cx={size / 2} cy={stroke / 2} r={dotR} fill="#FFFFFF" />
        )}
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  );
}

// ── Atom: Bar (linear progress) ─────────────────────────────────────────────
function Bar({ value = 40, color = T.ink, height = 6, knob = false }:
  { value?: number; color?: string; height?: number; knob?: boolean }) {
  return (
    <View style={{ width: '100%', height, backgroundColor: 'rgba(20,16,12,0.08)', borderRadius: 999 }}>
      <View style={{ width: `${value}%`, height, backgroundColor: color, borderRadius: 999 }} />
      {knob && (
        <View style={{
          position: 'absolute', left: `${value}%`, top: '50%',
          width: 16, height: 16, borderRadius: 8, backgroundColor: T.accent,
          marginLeft: -8, marginTop: -8,
          ...(Platform.OS === 'web' ? { boxShadow: '0 0 0 4px rgba(250,122,76,0.18)' } as any : {}),
        }} />
      )}
    </View>
  );
}

// ── Animated pulse halo (active timeline stage) ─────────────────────────────
function PulseHalo({ size, color }: { size: number; color: string }) {
  const v1 = useRef(new Animated.Value(0)).current;
  const v2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v1.setValue(0); v2.setValue(0);
    const loop1 = Animated.loop(Animated.timing(v1, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    const loop2 = Animated.loop(Animated.timing(v2, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop1.start();
    setTimeout(() => loop2.start(), 900); // yarım faz gecikme
    return () => { loop1.stop(); loop2.stop(); };
  }, [v1, v2]);
  const make = (v: Animated.Value, maxScale: number, baseOpacity: number) => ({
    scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, maxScale] }),
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [baseOpacity, 0] }),
  });
  const a = make(v1, 1.9, 0.55);
  const b = make(v2, 1.55, 0.35);
  return (
    <>
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', width: size, height: size, borderRadius: size / 2,
        backgroundColor: color, transform: [{ scale: a.scale }], opacity: a.opacity,
      }} />
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', width: size, height: size, borderRadius: size / 2,
        backgroundColor: color, transform: [{ scale: b.scale }], opacity: b.opacity,
      }} />
    </>
  );
}

// ── Atom: Timeline (5 stages) ───────────────────────────────────────────────
function Timeline({ stages, current = 0, dark }: { stages: string[]; current?: number; dark?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {stages.map((label, i) => {
        const past = i < current;
        const active = i === current;
        return (
          <React.Fragment key={i}>
            <View style={{ alignItems: 'center', minWidth: 56 }}>
              <View style={{
                width: 28, height: 28, borderRadius: 14,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: past || active ? T.accent : 'transparent',
                borderWidth: active ? 0 : past ? 0 : 1.5,
                borderColor: dark ? T.darkLine : T.hairline,
                position: 'relative',
              }}>
                {active && <PulseHalo size={28} color={T.accent} />}
                {past
                  ? <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
                  : <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#FFFFFF' : dark ? T.onDark3 : T.ink3 }}>{i + 1}</Text>
                }
              </View>
              <Text style={{ fontSize: 10, fontWeight: '500', color: dark ? T.onDark2 : T.ink3, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 }} numberOfLines={1}>
                {label}
              </Text>
            </View>
            {i < stages.length - 1 && (
              <View style={{ flex: 1, height: 2, backgroundColor: i < current ? T.accent : dark ? T.darkLine : T.hairline, marginHorizontal: 4, marginTop: -14 }} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Card primitive ──────────────────────────────────────────────────────────
function Card({ children, soft, dark, style }: { children: React.ReactNode; soft?: boolean; dark?: boolean; style?: any }) {
  return (
    <View style={[{
      backgroundColor: dark ? T.dark : soft ? T.cardSoft : T.card,
      borderRadius: T.r3,
      padding: 18,
    }, style]}>
      {children}
    </View>
  );
}

// ── Section header (handoff style: uppercase kicker + display title) ────────
function Section({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ paddingLeft: 2 }}>
        <Text style={{
          fontSize: 10, fontWeight: '600', color: T.ink3,
          letterSpacing: 1.4, textTransform: 'uppercase',
          fontFamily: T.mono,
        }}>
          {kicker}
        </Text>
        <Text style={{
          fontSize: 17, fontWeight: '500', color: T.ink, letterSpacing: -0.3, marginTop: 4,
          ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
        }}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

// ── Category divider (Foundations / Atoms / Cards / Dashboard / List) ───────
function CategoryDivider({ label, count }: { label: string; count: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 }}>
      <Text style={{
        fontSize: 11, fontWeight: '600', color: T.ink, letterSpacing: 1.6, textTransform: 'uppercase',
        ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
      }}>
        {label}
      </Text>
      <View style={{
        minWidth: 22, paddingHorizontal: 6, height: 18,
        borderRadius: 9,
        backgroundColor: T.bgDeep,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 10, color: T.ink2, fontFamily: T.mono, fontWeight: '600' }}>{count}</Text>
      </View>
      <View style={{ flex: 1, height: 1, backgroundColor: T.hairline }} />
    </View>
  );
}

// ── KPI tile (light + dark) ─────────────────────────────────────────────────
function KpiTile({ label, value, delta, sub, dark, accent, deltaColor }:
  { label: string; value: string; delta?: string; sub?: string; dark?: boolean; accent?: string; deltaColor?: string }) {
  return (
    <View style={{
      flex: 1, borderRadius: T.r3, padding: 14,
      backgroundColor: dark ? T.ink : T.card,
      borderWidth: dark ? 0 : 1, borderColor: T.hairline,
    }}>
      <Text style={{ fontSize: 10.5, fontWeight: '600', color: dark ? T.onDark2 : T.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{
        fontSize: 26, fontWeight: '400', color: dark ? T.onDark : T.ink, letterSpacing: -0.4, marginTop: 4,
        ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
      }}>
        {value}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        {!!delta && (
          <Text style={{ fontSize: 11, fontWeight: '600', color: deltaColor ?? (dark ? (accent ?? T.onDark) : T.ink2) }}>
            {delta}
          </Text>
        )}
        {!!sub && (
          <Text style={{ fontSize: 10.5, color: dark ? T.onDark3 : T.ink3 }}>{sub}</Text>
        )}
      </View>
    </View>
  );
}

// ── Action list item (delayed / pending) ───────────────────────────────────
function ActionListItem({ icon: Icon, iconBg, iconColor, title, code, sub, rightValue, rightLabel, rightColor }:
  { icon: any; iconBg: string; iconColor: string; title: string; code: string; sub: string;
    rightValue: string; rightLabel: string; rightColor: string }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12,
      padding: 12, borderRadius: T.r3,
      backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
    }}>
      <View style={{
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: iconBg,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} color={iconColor} strokeWidth={1.6} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink }} numberOfLines={1}>{title}</Text>
          <Text style={{ fontSize: 10, color: T.ink3, fontFamily: T.mono }}>{code}</Text>
        </View>
        <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }} numberOfLines={1}>{sub}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{
          fontSize: 13, fontWeight: '600', color: rightColor,
          ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
        }}>{rightValue}</Text>
        <Text style={{ fontSize: 9.5, color: T.ink3, letterSpacing: 0.5, textTransform: 'uppercase' }}>{rightLabel}</Text>
      </View>
    </View>
  );
}

// ── Quick action tile ──────────────────────────────────────────────────────
function QuickTile({ icon: Icon, label, accent, badge }:
  { icon: any; label: string; accent?: string; badge?: number }) {
  return (
    <View style={{
      flex: 1, aspectRatio: 1, borderRadius: 18,
      backgroundColor: accent ?? T.card,
      borderWidth: accent ? 0 : 1, borderColor: T.hairline,
      alignItems: 'center', justifyContent: 'center', gap: 6,
      position: 'relative',
    }}>
      <Icon size={22} color={accent ? '#FFFFFF' : T.ink} strokeWidth={1.7} />
      <Text style={{ fontSize: 11, fontWeight: '500', color: accent ? '#FFFFFF' : T.ink }}>{label}</Text>
      {!!badge && badge > 0 && (
        <View style={{
          position: 'absolute', top: 8, right: 8,
          minWidth: 16, height: 16, paddingHorizontal: 4,
          borderRadius: 8, backgroundColor: T.ruby,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF' }}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

// ── Order card sample (DoctorOrdersMobile vizyonu) ─────────────────────────
function OrderCardSample({ patient, code, workType, teeth, shade, statusKind, statusLabel, dueValue, dueLabel, urgent, overdue, ruby }:
  { patient: string; code: string; workType: string; teeth: string; shade?: string;
    statusKind: StatusKind; statusLabel: string; dueValue: string; dueLabel: string;
    urgent?: boolean; overdue?: boolean; ruby?: string }) {
  const s = MOBILE_STATUS[statusKind];
  return (
    <View style={{
      backgroundColor: T.card, borderRadius: T.r3,
      padding: 14, gap: 10,
      borderWidth: 1, borderColor: overdue ? `${ruby ?? T.ruby}40` : T.hairline,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Text style={{
              fontSize: 15.5, fontWeight: '600', color: T.ink, letterSpacing: -0.2,
              ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
            }} numberOfLines={1}>
              {patient}
            </Text>
            {urgent && (
              <View style={{
                width: 16, height: 16, borderRadius: 8,
                backgroundColor: T.rubySoft,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <AlertTriangle size={9} color={T.ruby} strokeWidth={2.2} />
              </View>
            )}
          </View>
          <Text style={{ fontSize: 10.5, color: T.ink3, fontFamily: T.mono, letterSpacing: 0.4 }}>
            #{code}
          </Text>
        </View>
        <ChevronRight size={16} color={T.ink3} strokeWidth={1.8} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 12.5, color: T.ink2, fontWeight: '500' }} numberOfLines={1}>{workType}</Text>
        <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: T.ink3 }} />
        <Text style={{ fontSize: 11.5, color: T.ink3 }} numberOfLines={1}>Diş {teeth}</Text>
        {!!shade && (
          <>
            <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: T.ink3 }} />
            <View style={{ paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6, backgroundColor: T.bgDeep }}>
              <Text style={{ fontSize: 10.5, color: T.ink2, fontFamily: T.mono, fontWeight: '600' }}>{shade}</Text>
            </View>
          </>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: 10, paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: s.bg,
        }}>
          <View style={{ width: 6, height: 6, borderRadius: 4, backgroundColor: s.dot }} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: s.fg, letterSpacing: 0.3 }}>{statusLabel}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text style={{
            fontSize: 13, fontWeight: '600',
            color: overdue ? (ruby ?? T.ruby) : T.ink,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }}>{dueValue}</Text>
          {!!dueLabel && (
            <Text style={{ fontSize: 10, color: T.ink3, letterSpacing: 0.4, textTransform: 'uppercase' }}>{dueLabel}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Header icon button ──────────────────────────────────────────────────────
function HeaderIconBtn({ icon: Icon, badge, accent }:
  { icon: any; badge?: boolean; accent?: string }) {
  return (
    <View style={{
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: T.card,
      borderWidth: 1, borderColor: T.hairline,
      alignItems: 'center', justifyContent: 'center', position: 'relative',
    }}>
      <Icon size={18} color={T.ink} strokeWidth={1.6} />
      {badge && accent && (
        <View style={{
          position: 'absolute', top: 8, right: 9,
          width: 8, height: 8, borderRadius: 4,
          backgroundColor: accent,
          borderWidth: 2, borderColor: T.card,
        }} />
      )}
    </View>
  );
}

// ── Color swatch ────────────────────────────────────────────────────────────
function Swatch({ name, color }: { name: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 6, width: 70 }}>
      <View style={{
        width: 56, height: 56, borderRadius: T.r2,
        backgroundColor: color,
        borderWidth: 1, borderColor: T.hairline,
      }} />
      <Text style={{ fontSize: 10, fontWeight: '500', color: T.ink2 }} numberOfLines={1}>{name}</Text>
      <Text style={{ fontSize: 9, fontWeight: '400', color: T.ink3, fontFamily: T.mono }}>{color}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function PatternsMobileScreen() {
  const [activePanel, setActivePanel] = useState<'lab' | 'teknisyen' | 'klinik' | 'exec'>('teknisyen');
  const theme = MOBILE_PANEL_THEMES[activePanel];

  const TABS: [FabTabItem, FabTabItem, FabTabItem, FabTabItem] = [
    { routeName: 'index',   label: 'Anasayfa', icon: Home },
    { routeName: 'jobs',    label: 'Sipariş',  icon: ListChecks },
    { routeName: 'history', label: 'Mesaj',    icon: MessageSquare },
    { routeName: 'profile', label: 'Profil',   icon: User },
  ];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* ═══ Dashboard-style header (handoff) ═══ */}
        <View style={{
          paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 38, height: 38, borderRadius: 12,
              backgroundColor: T.ink,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: theme.primary, fontSize: 16, fontWeight: '600', fontFamily: T.display }}>M</Text>
            </View>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 1.0, textTransform: 'uppercase' }}>
                Mobile Patterns
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink, marginTop: 2 }}>
                Aydın Lab · Atomik UI
              </Text>
            </View>
          </View>
          <HeaderIconBtn icon={Bell} badge accent={theme.primary} />
        </View>

        {/* ═══ Greeting hero ═══ */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 18 }}>
          <Text style={{
            fontSize: 30, fontWeight: '300', color: T.ink, letterSpacing: -0.6, lineHeight: 34,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }}>
            Mobil tasarım sistemi.
          </Text>
          <Text style={{ fontSize: 13.5, color: T.ink3, marginTop: 8, lineHeight: 19 }}>
            22 atom + örüntü. Aşağıdaki temayı değiştirerek aynı yapı 4 panelde nasıl görünüyor inceleyin.
          </Text>
        </View>

        {/* ═══ Theme picker — sticky pill row ═══ */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {(['teknisyen', 'lab', 'klinik', 'exec'] as const).map(p => {
              const active = p === activePanel;
              const t = MOBILE_PANEL_THEMES[p];
              return (
                <Pressable
                  key={p}
                  onPress={() => setActivePanel(p)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingHorizontal: 14, paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: active ? T.ink : T.card,
                    borderWidth: 1, borderColor: active ? T.ink : T.hairline,
                  }}
                >
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.primary }} />
                  <Text style={{ fontSize: 12.5, fontWeight: '500', color: active ? T.onDark : T.ink, textTransform: 'capitalize' }}>
                    {p}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={{ padding: 16, gap: 22 }}>
          <CategoryDivider label="Foundations" count={6} />

          {/* 01 — Palet swatches (theme picker yukarıda) */}
          <Section kicker="01" title="Panel paleti — 4 token">
            <Card>
              <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Swatch name="primary"    color={theme.primary} />
                <Swatch name="accentDark" color={theme.accentDark} />
                <Swatch name="bgDeep"     color={theme.bgDeep} />
                <Swatch name="surface"    color={theme.surface} />
              </View>
            </Card>
          </Section>

          {/* 2. STATUS PILLS */}
          <Section kicker="02" title="Status pill — operasyonel durumlar">
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(['prod', 'wait', 'qc', 'delay', 'done', 'ready', 'ship'] as StatusKind[]).map(k => (
                  <StatusPill key={k} kind={k} />
                ))}
              </View>
            </Card>
          </Section>

          {/* 3. RING + BAR */}
          <Section kicker="03" title="İlerleme — ring & bar">
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
                <Ring value={40} size={88} stroke={6} color={theme.primary}>
                  <Text style={{ fontSize: 22, fontWeight: '300', color: T.ink, fontFamily: T.display }}>40</Text>
                  <Text style={{ fontSize: 9, color: T.ink3, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>üretim</Text>
                </Ring>
                <View style={{ flex: 1, gap: 12 }}>
                  <View>
                    <Text style={{ fontSize: 11, color: T.ink3, marginBottom: 6 }}>Diş 16 — %40</Text>
                    <Bar value={40} color={theme.primary} knob />
                  </View>
                  <View>
                    <Text style={{ fontSize: 11, color: T.ink3, marginBottom: 6 }}>Diş 17 — %72</Text>
                    <Bar value={72} color={theme.primary} />
                  </View>
                </View>
              </View>
            </Card>
          </Section>

          {/* 4. TIMELINE */}
          <Section kicker="04" title="Aşama timeline — 5 nokta">
            <Card>
              <Timeline
                stages={['Alındı', 'Üretim', 'Final QC', 'Hazır', 'Teslim']}
                current={1}
              />
            </Card>
            <Card dark>
              <Timeline
                stages={['Alındı', 'Üretim', 'Final QC', 'Hazır', 'Teslim']}
                current={2}
                dark
              />
            </Card>
          </Section>

          <CategoryDivider label="Components" count={4} />

          {/* 5. HERO CARD (accent gradient) */}
          <Section kicker="05" title="Hero card — sipariş özet">
            <View style={{
              borderRadius: T.r4,
              padding: 22,
              backgroundColor: T.accentSoft,
              ...(Platform.OS === 'web'
                ? { backgroundImage: `linear-gradient(135deg, ${T.accentSoft} 0%, #F8C9AC 100%)` } as any
                : {}),
            }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: T.accentDeep, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                Sipariş #LAB-2026-0053
              </Text>
              <Text style={{
                fontSize: 32, fontWeight: '300', color: T.ink, letterSpacing: -0.7, lineHeight: 36, marginTop: 6,
                ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
              }}>
                Hasan Basri
              </Text>
              <Text style={{ fontSize: 12, color: T.ink2, marginTop: 4 }}>
                Dr. Elif Kara · Estetik Klinik · 09 Mayıs 2026
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}>
                    <Printer size={16} color={T.ink} strokeWidth={1.6} />
                  </Pressable>
                  <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.06)' }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: T.ink2 }}>3 / 11 aşama</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 9, color: T.ink3, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>kalan</Text>
                  <Text style={{
                    fontSize: 26, fontWeight: '300', color: T.ink, letterSpacing: -0.5,
                    ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                  }}>
                    1 GÜN
                  </Text>
                </View>
              </View>
            </View>
          </Section>

          {/* 6. CHIPS — quick actions */}
          <Section kicker="06" title="Quick action chips">
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {['Doktor bekliyor', 'Yoğunluk', 'Teknisyen sorunu', 'Malzeme sorunu', 'QC Red'].map(c => (
                  <View key={c} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline }}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: T.ink2 }}>{c}</Text>
                  </View>
                ))}
                <View style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: T.ink }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>+ Acil işaretle</Text>
                </View>
              </View>
            </Card>
          </Section>

          {/* 7. KPI tile (live ring + ink card) */}
          <Section kicker="07" title="KPI tile — canlı üretim">
            <Card dark>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 11, color: T.onDark3, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    Canlı
                  </Text>
                  <Text style={{
                    fontSize: 28, fontWeight: '300', color: T.onDark, letterSpacing: -0.5,
                    ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                  }}>
                    12 / 30
                  </Text>
                  <Text style={{ fontSize: 12, color: T.onDark2, marginTop: 2 }}>
                    aktif aşama
                  </Text>
                </View>
                <Ring value={40} size={72} stroke={5} color={theme.primary} track="rgba(255,255,255,0.10)">
                  <Text style={{ fontSize: 18, fontWeight: '300', color: T.onDark, fontFamily: T.display }}>%40</Text>
                </Ring>
              </View>
            </Card>
          </Section>

          {/* 8. APP BAR variants */}
          <Section kicker="08" title="App bar — kicker + title">
            <View style={{ backgroundColor: T.card, borderRadius: T.r3, paddingVertical: 4 }}>
              <AppBar kicker="Pazartesi · 12 Mayıs" title="Hoş geldin, Enes" big />
            </View>
            <View style={{ backgroundColor: T.card, borderRadius: T.r3, paddingVertical: 4 }}>
              <AppBar title="İşlerim" showBack />
            </View>
          </Section>

          {/* 9. FAB TAB BAR preview */}
          <Section kicker="09" title="Bottom tab — 5 slot + FAB">
            <Text style={{ fontSize: 11, color: T.ink3 }}>
              Ekranın altında sabit görünür ↓ (bu sayfanın altında canlı render edilir)
            </Text>
          </Section>

          {/* 10. ICON GRID */}
          <Section kicker="10" title="İkonografi — stroke 1.6, 24px grid">
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {[
                  { I: Home, n: 'home' }, { I: ListChecks, n: 'list' },
                  { I: Bell, n: 'bell' }, { I: Search, n: 'search' },
                  { I: Calendar, n: 'calendar' }, { I: Printer, n: 'print' },
                  { I: Mic, n: 'mic' }, { I: Truck, n: 'truck' },
                  { I: Filter, n: 'filter' }, { I: Check, n: 'check' },
                  { I: X, n: 'x' }, { I: Flame, n: 'flame' },
                ].map(({ I, n }) => (
                  <View key={n} style={{ width: 64, alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 44, height: 44, borderRadius: T.r2, backgroundColor: T.cardSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.hairline }}>
                      <I size={20} color={T.ink} strokeWidth={1.6} />
                    </View>
                    <Text style={{ fontSize: 9, color: T.ink3, fontFamily: T.mono }}>{n}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </Section>

          {/* 11. FLAT cards (shadow kaldırıldı — mobile design contract: shadowless) */}
          <Section kicker="11" title="Flat surfaces">
            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
              <View style={{ width: 100, height: 80, backgroundColor: T.card, borderRadius: T.r2, borderWidth: 1, borderColor: T.hairline }} />
              <View style={{ width: 100, height: 80, backgroundColor: T.cardSoft, borderRadius: T.r2, borderWidth: 1, borderColor: T.hairline }} />
              <View style={{ width: 100, height: 80, backgroundColor: T.dark, borderRadius: T.r2 }} />
            </View>
          </Section>

          {/* ═══════════════════════════════════════════════════════════════
              DASHBOARD PATTERNS — handoff bölümleri (dashboard reusable parts)
              ═══════════════════════════════════════════════════════════════ */}

          <CategoryDivider label="Dashboard" count={6} />

          {/* 12. RING v2 — animated end dot + halo pulse (handoff hero) */}
          <Section kicker="12" title="Ring v2 — animated end dot + halo pulse">
            <View style={{
              padding: 24, borderRadius: T.r4,
              backgroundColor: theme.bgHero,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <RingX
                value={58}
                size={200}
                stroke={14}
                color={theme.primary}
                track={`${theme.primary}25`}
                animatedEndDot
              >
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Text style={{
                    fontSize: 64, fontWeight: '300', color: '#FFFFFF', letterSpacing: -2, lineHeight: 64,
                    ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                  }}>58</Text>
                  <Text style={{
                    fontSize: 22, color: theme.primary, fontWeight: '400',
                    ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                  }}>%</Text>
                </View>
              </RingX>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, padding: 18, borderRadius: T.r3, backgroundColor: T.ink, alignItems: 'center', justifyContent: 'center' }}>
                <RingX value={88} size={110} stroke={9} color={theme.primary} track="rgba(255,255,255,0.10)" animatedEndDot>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                    <Text style={{ fontSize: 32, color: T.onDark, letterSpacing: -0.8, lineHeight: 34, fontFamily: T.display }}>88</Text>
                    <Text style={{ fontSize: 14, color: theme.primary, fontFamily: T.display }}>%</Text>
                  </View>
                </RingX>
              </View>
              <View style={{ flex: 1, padding: 18, borderRadius: T.r3, backgroundColor: T.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.hairline }}>
                <RingX value={32} size={110} stroke={9} color={theme.primary} track="rgba(20,16,12,0.06)" animatedEndDot dotColor={theme.primary} haloColor={`${theme.primary}55`}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                    <Text style={{ fontSize: 32, color: T.ink, letterSpacing: -0.8, lineHeight: 34, fontFamily: T.display }}>32</Text>
                    <Text style={{ fontSize: 14, color: T.ink3, fontFamily: T.display }}>%</Text>
                  </View>
                </RingX>
              </View>
            </View>
          </Section>

          {/* 13. LIVE PRODUCTION — dashboard hero (panel-themed dark) */}
          <Section kicker="13" title="Canlı üretim — panel-themed hero">
            <View style={{
              borderRadius: T.r4, padding: 18,
              backgroundColor: theme.bgHero, overflow: 'hidden', position: 'relative',
            }}>
              {Platform.OS === 'web' && (
                <View pointerEvents="none" style={{
                  position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: 100,
                  // @ts-ignore
                  backgroundImage: `radial-gradient(circle at center, ${theme.primary}60, transparent 60%)`,
                } as any} />
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.primary,
                    ...(Platform.OS === 'web' ? { boxShadow: `0 0 0 4px ${theme.primary}30` } as any : {}),
                  }} />
                  <Text style={{ fontSize: 10.5, fontWeight: '600', color: T.onDark2, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    Canlı üretim
                  </Text>
                </View>
                <Text style={{ fontSize: 10, color: T.onDark3, fontFamily: T.mono }}>02:14:38</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: 14 }}>
                <RingX value={67} size={108} stroke={9} color={theme.primary} track="rgba(255,255,255,0.10)" animatedEndDot>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                    <Text style={{ fontSize: 32, color: T.onDark, letterSpacing: -0.8, lineHeight: 34, fontFamily: T.display }}>67</Text>
                    <Text style={{ fontSize: 14, color: theme.primary, fontFamily: T.display }}>%</Text>
                  </View>
                </RingX>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                    {[
                      { l: 'Alındı', n: 4 }, { l: 'Üretim', n: 7 },
                      { l: 'KK', n: 3 }, { l: 'Hazır', n: 6 },
                    ].map((s, i) => (
                      <View key={i}>
                        <Text style={{ fontSize: 18, fontWeight: '500', color: T.onDark, fontFamily: T.display }}>{s.n}</Text>
                        <Text style={{ fontSize: 9, color: T.onDark3, letterSpacing: 0.6, textTransform: 'uppercase' }}>{s.l}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.10)' }}>
                    <View style={{ width: '67%', height: 4, borderRadius: 2, backgroundColor: theme.primary }} />
                  </View>
                </View>
              </View>
            </View>
          </Section>

          {/* 14. KPI 2-GRID */}
          <Section kicker="14" title="KPI 2-grid — light + dark">
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <KpiTile label="Aylık gelir" value="₺48.200" delta="+%12" sub="Hedef ₺60K" deltaColor={T.jade} />
              <KpiTile label="Aktif sipariş" value="14" delta="6 üretimde" sub="2 geciken" dark accent={theme.primary} />
            </View>
          </Section>

          {/* 15. WEEK STRIP */}
          <Section kicker="15" title="Hafta stripi — 7 gün">
            <View style={{
              padding: 14, borderRadius: T.r3,
              backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Bu hafta · 4–10 May
                </Text>
                <Text style={{ fontSize: 11, color: T.ink3 }}>
                  Toplam <Text style={{ color: T.ink, fontWeight: '600' }}>42</Text>
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 5 }}>
                {[
                  { d: 'Pa', n: 4 }, { d: 'Sa', n: 6 }, { d: 'Ça', n: 3 }, { d: 'Pe', n: 7 },
                  { d: 'Cu', n: 9 }, { d: 'Ct', n: 5 }, { d: 'Pz', n: 8 },
                ].map((x, i) => {
                  const today = i === 6;
                  return (
                    <View key={i} style={{
                      flex: 1, paddingVertical: 8, borderRadius: 12,
                      backgroundColor: today ? T.ink : 'transparent',
                      borderWidth: today ? 0 : 1, borderColor: T.hairline2,
                      alignItems: 'center', gap: 3, position: 'relative',
                    }}>
                      <Text style={{ fontSize: 9.5, color: today ? T.onDark2 : T.ink3, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                        {x.d}
                      </Text>
                      <Text style={{ fontSize: 17, fontWeight: '500', color: today ? T.onDark : T.ink, fontFamily: T.display }}>
                        {x.n}
                      </Text>
                      {today && (
                        <View style={{ position: 'absolute', top: 7, right: 7, width: 5, height: 5, borderRadius: 3, backgroundColor: theme.primary }} />
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          </Section>

          {/* 16. ACTION REQUIRED — list item (flame + clipboard) */}
          <Section kicker="16" title="Aksiyon gerektiren — list item">
            <View style={{ gap: 8 }}>
              <ActionListItem
                icon={Flame}
                iconBg={T.rubySoft}
                iconColor={T.ruby}
                title="Mehmet Yılmaz"
                code="LAB-0053"
                sub="Aydın Lab · Üretim"
                rightValue="+14sa"
                rightLabel="Gecikme"
                rightColor={T.ruby}
              />
              <ActionListItem
                icon={FileCheck}
                iconBg={theme.bgDeep}
                iconColor={theme.accentDark}
                title="Ayşe Demir"
                code="LAB-0061"
                sub="Tasarım onayı bekliyor"
                rightValue="Onay"
                rightLabel="Onay"
                rightColor={theme.accentDark}
              />
            </View>
          </Section>

          {/* 17. QUICK ACTIONS — 4-grid */}
          <Section kicker="17" title="Hızlı işlem — 4 tile grid">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <QuickTile icon={Plus} label="Sipariş" accent={theme.primary} />
              <QuickTile icon={QrCode} label="QR Tara" />
              <QuickTile icon={Mic} label="Sesli not" />
              <QuickTile icon={Calendar} label="Takvim" badge={3} />
            </View>
          </Section>

          <CategoryDivider label="List & Filter" count={3} />

          {/* 18. SEARCH + FILTER */}
          <Section kicker="18" title="Search bar + filter button">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingHorizontal: 14, paddingVertical: 11,
                backgroundColor: T.card, borderRadius: T.r2,
                borderWidth: 1, borderColor: T.hairline,
              }}>
                <Search size={15} color={T.ink3} strokeWidth={1.8} />
                <Text style={{ flex: 1, fontSize: 13, color: T.ink3 }}>Hasta veya sipariş ara…</Text>
              </View>
              <View style={{
                width: 44, height: 44, borderRadius: 14,
                backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <SlidersHorizontal size={16} color={T.ink} strokeWidth={1.8} />
              </View>
            </View>
          </Section>

          {/* 19. FILTER CHIP STRIP — count badges */}
          <Section kicker="19" title="Filter chip strip — count badges">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {[
                { k: 'Tümü', n: 14, active: true },
                { k: 'Aktif', n: 10 },
                { k: 'Üretimde', n: 6 },
                { k: 'Hazır', n: 2 },
                { k: 'Geciken', n: 2 },
                { k: 'Teslim', n: 4 },
              ].map((f, i) => (
                <View key={i} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 14, paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: f.active ? T.ink : T.card,
                  borderWidth: 1, borderColor: f.active ? T.ink : T.hairline,
                }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '500', color: f.active ? T.onDark : T.ink }}>{f.k}</Text>
                  <View style={{
                    minWidth: 18, paddingHorizontal: 5, height: 18,
                    borderRadius: 9,
                    backgroundColor: f.active ? 'rgba(255,255,255,0.18)' : T.bgDeep,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: f.active ? T.onDark : T.ink2, fontFamily: T.mono }}>{f.n}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </Section>

          {/* 20. ORDER CARD — DoctorOrdersMobile style */}
          <Section kicker="20" title="Order card — hasta + status + due">
            <View style={{ gap: 10 }}>
              <OrderCardSample
                patient="Hasan Basri"
                code="LAB-2026-0053"
                workType="Implant Üstü Kron"
                teeth="14, 15, 16"
                shade="A2"
                statusKind="prod"
                statusLabel="Üretimde"
                dueValue="3"
                dueLabel="gün"
                urgent
              />
              <OrderCardSample
                patient="Ayşe Demir"
                code="LAB-2026-0061"
                workType="Zirkon Kron"
                teeth="11, 21"
                shade="B1"
                statusKind="delay"
                statusLabel="Geciken"
                dueValue="2"
                dueLabel="gün geç"
                overdue
                ruby={T.ruby}
              />
              <OrderCardSample
                patient="Mehmet Yılmaz"
                code="LAB-2026-0058"
                workType="E-Max Veneer"
                teeth="13, 12, 11, 21, 22, 23"
                shade="A1"
                statusKind="ready"
                statusLabel="Hazır"
                dueValue="Yarın"
                dueLabel=""
              />
            </View>
          </Section>

          <CategoryDivider label="Layout shells" count={2} />

          {/* 21. DASHBOARD HEADER */}
          <Section kicker="21" title="Dashboard header — avatar + tarih + actions">
            <View style={{
              padding: 16, borderRadius: T.r3,
              backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{
                  width: 38, height: 38, borderRadius: 12,
                  backgroundColor: T.ink,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: theme.primary, fontSize: 18, fontWeight: '600', fontFamily: T.display }}>K</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 1.0, textTransform: 'uppercase' }}>
                    Pazartesi · 12 May
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink, marginTop: 2 }}>
                    Aydın Lab · İstanbul
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <HeaderIconBtn icon={Bell} badge accent={theme.primary} />
                <HeaderIconBtn icon={LogOut} />
              </View>
            </View>
          </Section>

          {/* 22. GREETING */}
          <Section kicker="22" title="Greeting — display 32/300">
            <View style={{ padding: 16 }}>
              <Text style={{
                fontSize: 32, fontWeight: '300', color: T.ink, letterSpacing: -0.6, lineHeight: 36,
                ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
              }}>
                Hoş geldin, Kaan.
              </Text>
              <Text style={{ fontSize: 13.5, color: T.ink3, marginTop: 8, lineHeight: 19 }}>
                Bugün 30 sipariş, 12 aktif ve 2 geciken vaka var.
              </Text>
            </View>
          </Section>

          {/* ═══════════════════════════════════════════════════════════
              FİNANS BÖLÜMÜ TASARIM ŞABLONLARI (v1)
              "FinancePatterns" — uygulamanın her listesinde kullanılabilir
              ═══════════════════════════════════════════════════════════ */}

          <Section kicker="F1" title='HeroCard — "Hero Pattern" (panel primary + beyaz yazı)'>
            <View style={{ paddingHorizontal: 12 }}>
              {/* PATTERN: theme.primary bg + white text + soft white blobs + ghost+solid pillBtn'lar */}
              <View style={{
                borderRadius: 20, overflow: 'hidden',
                backgroundColor: theme.primary, padding: 18,
                position: 'relative',
              }}>
                <View style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.18)' }} />
                <View style={{ position: 'absolute', bottom: -50, left: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.12)' }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)', marginBottom: 8 }}>
                      Toplam Alacak
                    </Text>
                    <Text style={{ fontSize: 32, fontWeight: '300', color: '#FFFFFF', letterSpacing: -0.8 }}>
                      ₺125.430
                    </Text>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 4 }}>32 kayıt</Text>
                  </View>
                  <View style={{ gap: 6 }}>
                    {/* Primary on hero — white solid + accent text */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#FFFFFF' }}>
                      <Plus size={12} color={theme.primary} strokeWidth={2.4} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>Yeni</Text>
                    </View>
                    {/* Ghost on hero — transparent + white border */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#FFFFFF' }}>Excel</Text>
                    </View>
                  </View>
                </View>
              </View>
              <Text style={{ fontSize: 10, color: T.ink3, marginTop: 6, fontFamily: T.mono }}>
                bg: theme.primary · text: #FFFFFF / rgba(255,255,255,0.78) · blob: rgba(255,255,255,0.18)
              </Text>
            </View>
          </Section>

          <Section kicker="F2" title='HubTabBar — "Hub Tab Bar Pattern" (panel primary active + ☰ overflow)'>
            <View style={{ paddingHorizontal: 12 }}>
              <View style={{ flexDirection: 'row', gap: 3, padding: 3, backgroundColor: (T as any).surfaceMuted, borderRadius: 9999, alignItems: 'center' }}>
                {[
                  { label: 'Karlılık', active: true },
                  { label: 'Faturalar', active: false },
                  { label: 'Giderler', active: false },
                ].map((tab, i) => (
                  <View key={i} style={{
                    flex: 1,
                    alignItems: 'center', justifyContent: 'center',
                    paddingVertical: 7, borderRadius: 9999,
                    backgroundColor: tab.active ? theme.primary : 'transparent',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: tab.active ? '700' : '600', color: tab.active ? '#FFFFFF' : T.ink2 }}>
                      {tab.label}
                    </Text>
                  </View>
                ))}
                <View style={{ width: 1, height: 16, backgroundColor: 'rgba(0,0,0,0.08)', marginHorizontal: 2 }} />
                <View style={{ width: 36, height: 30, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, color: theme.primary }}>☰</Text>
                </View>
              </View>
              <Text style={{ fontSize: 10, color: T.ink3, marginTop: 6, fontFamily: T.mono }}>
                3 önemli tab + ☰ hamburger overflow · drawer sağdan açılır
              </Text>
            </View>
          </Section>

          <Section kicker="F3" title='SearchFilterBar — "Search + Filtre" pattern (44px tek satır)'>
            <View style={{ paddingHorizontal: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                  height: 44, paddingHorizontal: 14, borderRadius: 14,
                  backgroundColor: '#FFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                }}>
                  <Search size={14} color={T.ink3} strokeWidth={1.6} />
                  <Text style={{ flex: 1, fontSize: 13, color: T.ink3 }}>Ara…</Text>
                </View>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  height: 44, paddingHorizontal: 14, borderRadius: 14,
                  backgroundColor: T.ink, // active → siyah; pasif → #FFF + border
                }}>
                  <SlidersHorizontal size={14} color="#FFF" strokeWidth={1.8} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>Filtre (2)</Text>
                </View>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  height: 44, paddingHorizontal: 14, borderRadius: 14,
                  backgroundColor: T.ink,
                }}>
                  <Plus size={15} color="#FFF" strokeWidth={2.2} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>Yeni</Text>
                </View>
              </View>
              <Text style={{ fontSize: 10, color: T.ink3, marginTop: 6, fontFamily: T.mono }}>
                height: 44 · gap: 8 · search flex: 1 · Filtre + Yeni sabit width
              </Text>
            </View>
          </Section>

          <Section kicker="F4" title='CategoryTab — "Kategori Tab Pattern" (siyah active + beyaz)'>
            <View style={{ paddingHorizontal: 12 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { label: 'Tümü', active: true },
                  { label: 'Taslak', active: false },
                  { label: 'Kesildi', active: false },
                  { label: 'Ödendi', active: false },
                ].map((c, i) => (
                  <View key={i} style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                    borderWidth: c.active ? 0 : 1, borderColor: 'rgba(0,0,0,0.08)',
                    backgroundColor: c.active ? T.ink : '#FFF',
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: c.active ? '700' : '500', color: c.active ? '#FFFFFF' : T.ink2 }}>
                      {c.label}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 10, color: T.ink3, marginTop: 6, fontFamily: T.mono }}>
                Active: bg #0A0A0A + text #FFFFFF + bold 700 · Pasif: bg #FFF + 1px border + 500
              </Text>
            </View>
          </Section>

          <Section kicker="F5" title='FilterSheet — "Filtre Bottom Sheet" (Sıralama + Durum + Uygula)'>
            <View style={{ paddingHorizontal: 12 }}>
              <View style={{
                backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
                paddingVertical: 14, paddingBottom: 12,
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
              }}>
                <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.hairline, marginBottom: 12 }} />
                <View style={{ paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: T.ink, flex: 1 }}>Filtrele</Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3 }}>Temizle</Text>
                </View>
                {/* Sort row */}
                <View style={{ paddingHorizontal: 16, gap: 6 }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: T.ink3 }}>Sıralama</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {['En Yeni', 'En Eski', 'Tutar ↓'].map((s, i) => (
                      <View key={i} style={{
                        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                        borderWidth: i === 0 ? 0 : 1, borderColor: 'rgba(0,0,0,0.08)',
                        backgroundColor: i === 0 ? T.ink : '#FFF',
                      }}>
                        <Text style={{ fontSize: 11, fontWeight: i === 0 ? '700' : '500', color: i === 0 ? '#FFF' : T.ink2 }}>{s}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                {/* Apply button */}
                <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
                  <View style={{
                    height: 44, borderRadius: 14, backgroundColor: T.ink,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>Uygula</Text>
                  </View>
                </View>
              </View>
              <Text style={{ fontSize: 10, color: T.ink3, marginTop: 6, fontFamily: T.mono }}>
                drag indicator + başlık + Temizle + Sıralama (horizontal scroll) + Durum (chips) + siyah Uygula CTA
              </Text>
            </View>
          </Section>

          <Section kicker="F6" title='Page Padding — sağdan & soldan 12px standart'>
            <View style={{ paddingHorizontal: 12 }}>
              <View style={{
                backgroundColor: '#FFF', borderRadius: 14, padding: 16,
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
              }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: T.ink, marginBottom: 4 }}>
                  contentContainerStyle
                </Text>
                <Text style={{ fontSize: 11, color: T.ink3, fontFamily: T.mono }}>
                  paddingHorizontal: 12{'\n'}
                  paddingTop: 4{'\n'}
                  paddingBottom: 48{'\n'}
                  gap: 14
                </Text>
              </View>
              <Text style={{ fontSize: 10, color: T.ink3, marginTop: 6, fontFamily: T.mono }}>
                Tab bar wrapper + tüm card wrapper'lar: paddingHorizontal: 12 → tek hizada
              </Text>
            </View>
          </Section>
        </View>
      </ScrollView>

      {/* Sabit FAB tab bar */}
      <FabTabBar
        items={TABS}
        baseRoute="/dev"
        accentColor={theme.primary}
        fabIcon={Plus}
      />
    </SafeAreaView>
  );
}
