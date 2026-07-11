// modules/admin/components/AdminMobileDashboard.tsx
// Admin/exec dashboard — same design system as doctor & teknisyen.
// Sections:
//   1) Greeting + top action icons (Onaylar · QR · Bell)
//   2) Primary CTA — animated "Yeni Sipariş" card
//   3) Canlı üretim (dark hero) with animated Ring + stages
//   4) KPI 2-grid (Aylık gelir · Aktif sipariş) with AnimatedNumber
//   5) Week strip
//   6) Geciken vakalar list OR positive empty state

import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, ScrollView, Platform, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Bell, QrCode, Flame, FileCheck, CheckCircle2, ClipboardList, User as UserIcon,
} from 'lucide-react-native';
import { useMobileTokens, MOBILE_PANEL_THEMES } from '../../../core/theme/mobileDesignTokens';
import { Ring } from '../../../core/ui/mobile/Ring';
import { AnimatedNumber } from '../../../core/ui/mobile/AnimatedNumber';
import { NewOrderCTACard } from '../../../core/ui/mobile/NewOrderCTACard';
import { FaceScanQuickAction, useFaceScanAvailable } from '../../orders/components/FaceScanQuickAction';
import { useAuthStore } from '../../../core/store/authStore';

import { UnreadMessagesCard } from '../../../core/ui/mobile/UnreadMessagesCard';
const EXEC = MOBILE_PANEL_THEMES.exec;

// Desktop ile aynı format: "Pazartesi, 12 Mayıs"
function adminTodayLabel(t: (key: string) => string): string {
  const d = new Date();
  const days   = t('admin.days.long').split(', ');
  const months = t('admin.months.long').split(', ');
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

export interface DelayedCase {
  id: string;
  name: string;
  clinic: string;
  stage: string;
  remain: string;
  kind: 'qc' | 'delay';
}

export interface AdminMobileDashboardProps {
  greeting?: string;
  bgName?: string;
  todayLabel?: string;
  // Live production
  liveActive?:   number;
  liveTotal?:    number;
  liveStages?:   { alindi: number; uretim: number; kk: number; hazir: number };
  livePercent?:  number;
  liveTimer?:    string;
  // KPI
  monthlyRevenue?:   string;
  monthlyDelta?:     string;
  activeOrders?:     number;
  productionCount?:  number;
  overdueCount?:     number;
  pendingApprovalsCount?: number;
  // Week
  weekBars?: number[];
  weekRange?: string;
  weekTotal?: number;
  // Delayed
  delayed?: DelayedCase[];
  // Actions
  onNewOrder?:     () => void;
  onScan?:         () => void;
  onApprovals?:    () => void;
  onProfile?:      () => void;
  onMessages?:     () => void;
  onNotifications?: () => void;
  onOpenOrder?:    (id: string) => void;
  // Refresh
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function AdminMobileDashboard(props: AdminMobileDashboardProps) {
  const { t } = useTranslation();
  const faceScanOk = useFaceScanAvailable();
  const router = useRouter();
  const { profile } = useAuthStore();
  const T = useMobileTokens();

  const firstName = profile?.full_name?.split(' ')[0] ?? '';
  const greeting  = props.greeting ?? (firstName ? t('dashboard.greetingName', { name: firstName }) : t('dashboard.greeting'));

  const live = {
    active: props.liveActive ?? 0,
    total:  props.liveTotal ?? 0,
    stages: props.liveStages ?? { alindi: 0, uretim: 0, kk: 0, hazir: 0 },
    pct:    props.livePercent ?? 0,
    timer:  props.liveTimer ?? '00:00:00',
  };
  const week    = props.weekBars ?? [0,0,0,0,0,0,0];
  const delayed = props.delayed ?? [];
  const pendingApprovals = props.pendingApprovalsCount ?? 0;
  const overdue = props.overdueCount ?? 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: T.bg }}
      contentContainerStyle={{ paddingBottom: 140 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={!!props.refreshing} onRefresh={props.onRefresh} tintColor={EXEC.primary} />}
    >
      {/* ═══ Greeting + top icons ═══ */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        paddingTop: 96,
        paddingBottom: 18,
        gap: 12,
      }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{
            fontSize: 10.5, fontWeight: '400', letterSpacing: 1.2, textTransform: 'uppercase',
            color: T.ink3,
          }}>
            {adminTodayLabel(t)}
          </Text>
          <Text style={{
            fontSize: 28, fontWeight: '300', color: T.ink, letterSpacing: -0.5, lineHeight: 32,
            marginTop: 4,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }}>
            {greeting}
          </Text>
          <Text style={{ fontSize: 13.5, color: T.ink3, marginTop: 8, lineHeight: 19 }}>
            {live.total > 0
              ? t('admin.dashboard.ordersSummary', {
                  total: live.total,
                  active: live.active,
                  overdue: overdue > 0 ? `, ${t('admin.dashboard.overdueCount', { count: overdue })}` : '',
                })
              : t('admin.dashboard.noOrdersToday')}
          </Text>
        </View>

        {/* Top action icons — global TopActionBar (layout level) sağ üstte sabit */}
      </View>

      {/* ═══ Primary CTA — animated "Yeni Sipariş" card ═══ */}
      {!!props.onNewOrder && (
        <NewOrderCTACard
          accentColor={EXEC.primary}
          onPress={props.onNewOrder}
          kicker={live.total > 0 ? t('admin.cta.ordersToday', { total: live.total }) : t('admin.cta.newOrder')}
          title={t('admin.cta.createNewOrder')}
          rightSlot={faceScanOk ? <FaceScanQuickAction variant="card" accentColor={EXEC.primary} /> : undefined}
        />
      )}

      {/* ═══ Canlı üretim (F2 hero gradient — primary → amber) ═══ */}
      <View style={{
        marginHorizontal: 16, marginBottom: 16,
        borderRadius: 24, padding: 18,
        backgroundColor: EXEC.primary, overflow: 'hidden',
        ...(Platform.OS === 'web' ? { backgroundImage: `linear-gradient(135deg, ${EXEC.primary} 0%, #E89B2A 100%)` } as any : {}),
      }}>
        {/* Yumuşak, büyük ışık daireleri — kenara doğru tam şeffafa çözülür (keskin görünmez) */}
        <View pointerEvents="none" style={{
          position: 'absolute', top: -90, right: -70, width: 300, height: 300, borderRadius: 150,
          ...(Platform.OS === 'web'
            ? { backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.20), rgba(255,255,255,0) 68%)' } as any
            : { backgroundColor: 'rgba(255,255,255,0.08)' }),
        }} />
        <View pointerEvents="none" style={{
          position: 'absolute', bottom: -100, left: -60, width: 260, height: 260, borderRadius: 130,
          ...(Platform.OS === 'web'
            ? { backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.12), rgba(255,255,255,0) 70%)' } as any
            : { backgroundColor: 'rgba(255,255,255,0.05)' }),
        }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{
              width: 7, height: 7, borderRadius: 4,
              backgroundColor: '#FFFFFF',
              ...(Platform.OS === 'web' ? { boxShadow: `0 0 0 4px rgba(255,255,255,0.30)` } as any : {}),
            }} />
            <Text style={{ fontSize: 10.5, fontWeight: '600', color: T.onDark2, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              {t('admin.dashboard.liveProduction')}
            </Text>
          </View>
          <Text style={{ fontSize: 10, color: T.onDark3, fontFamily: T.mono }}>
            {live.active}/{live.total}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: 14 }}>
          <Ring value={live.pct} size={108} stroke={9} color="#FFFFFF" track="rgba(255,255,255,0.22)" animatedEndDot>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
              <AnimatedNumber
                value={live.pct}
                duration={900}
                style={{
                  fontSize: 32, fontWeight: '400', color: T.onDark, letterSpacing: -0.8, lineHeight: 34,
                  ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                }}
              />
              <Text style={{
                fontSize: 14, color: '#FFFFFF', fontWeight: '400',
                ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
              }}>%</Text>
            </View>
          </Ring>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {[
                { l: t('admin.status.received'), n: live.stages.alindi },
                { l: t('admin.status.production'), n: live.stages.uretim },
                { l: t('admin.status.qcShort'),     n: live.stages.kk },
                { l: t('admin.status.ready'),  n: live.stages.hazir },
              ].map((s, i) => (
                <View key={i} style={{ alignItems: 'center', gap: 6 }}>
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    borderWidth: 1.5,
                    borderColor: s.n > 0 ? '#FFFFFF' : 'rgba(255,255,255,0.18)',
                    backgroundColor: s.n > 0 ? 'rgba(255,255,255,0.14)' : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <AnimatedNumber
                      value={s.n}
                      duration={700}
                      delay={i * 80}
                      style={{
                        fontSize: 17, fontWeight: '500', color: s.n > 0 ? T.onDark : T.onDark3,
                        ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                      }}
                    />
                  </View>
                  <Text style={{ fontSize: 9, color: T.onDark3, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                    {s.l}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* ═══ KPI 2-grid ═══ */}
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 16 }}>
        {/* Revenue uses string for currency display, so it stays as static Text inside Kpi-like card */}
        <View style={{
          flex: 1, borderRadius: 22, padding: 14,
          backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
        }}>
          <Text style={{ fontSize: 10.5, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>
            {t('admin.dashboard.monthlyRevenue')}
          </Text>
          <Text style={{
            fontSize: 24, fontWeight: '400', color: T.ink, letterSpacing: -0.4, marginTop: 4,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }} numberOfLines={1}>
            {props.monthlyRevenue ?? '—'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            {!!props.monthlyDelta && (
              <Text style={{ fontSize: 11, fontWeight: '600', color: T.jade }}>
                {props.monthlyDelta}
              </Text>
            )}
            <Text style={{ fontSize: 10.5, color: T.ink3 }}>{t('admin.dashboard.revenueTarget')}</Text>
          </View>
        </View>

        <Kpi
          label={t('admin.dashboard.activeOrders')}
          numericValue={props.activeOrders ?? 0}
          delta={`${props.productionCount ?? 0} ${t('admin.dashboard.inProduction')}`}
          sub={t('admin.dashboard.overdueCount', { count: overdue })}
          // Aktif > 0 ise highlight et
          dark={(props.activeOrders ?? 0) > 0}
          accent={EXEC.primary}
          icon={ClipboardList}
        />
      </View>

      {/* ═══ Mesajlar kartı — okunmamışı öne çıkarır (panel accent) ═══ */}
      <UnreadMessagesCard
        accent={EXEC.primary}
        onOpenOrder={(id) => router.push(`/(admin)/order/${id}` as any)}
        onOpenInbox={() => router.push('/(admin)/messages' as any)}
      />

      {/* ═══ Week strip ═══ */}
      <View style={{
        marginHorizontal: 16, marginBottom: 16,
        padding: 14, borderRadius: 20,
        backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>
            {t('admin.dashboard.thisWeek')} · {props.weekRange ?? ''}
          </Text>
          <Text style={{ fontSize: 11, color: T.ink3 }}>
            {t('admin.dashboard.total', { total: '' }).trim()} <Text style={{ color: T.ink, fontWeight: '600' }}>{props.weekTotal ?? week.reduce((a, b) => a + b, 0)}</Text>
          </Text>
        </View>
        {/* Admin: hatched-rail pill kolonları — coral accent */}
        {(() => {
          const SCALE_MAX = 20;
          const FILL_LIGHT = `${EXEC.primary}55`;
          const FILL_DARK  = EXEC.primary;
          const RAIL_BG    = `${EXEC.primary}08`;
          const STRIPE_BG  = `repeating-linear-gradient(135deg, ${EXEC.primary}14 0 6px, transparent 6px 12px)`;

          return (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', height: 110, paddingHorizontal: 2, paddingTop: 6 }}>
              {t('admin.days.short').split(', ').map((d, i) => {
                const n = week[i] ?? 0;
                const today = i === 6;
                const pct = n > 0 ? Math.min(Math.max((n / SCALE_MAX) * 100, 8), 100) : 0;
                const empty = n === 0;
                return (
                  <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4 }}>
                    <View style={{ width: '100%', maxWidth: 36, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                      {today && n > 0 && (
                        <View style={{ marginBottom: 3, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 8, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: FILL_DARK }}>{n}</Text>
                        </View>
                      )}
                      <View style={{
                        width: '100%', height: '100%', borderRadius: 999,
                        backgroundColor: RAIL_BG,
                        ...(Platform.OS === 'web' ? { backgroundImage: STRIPE_BG } as any : {}),
                        overflow: 'hidden', position: 'relative' as any,
                      }}>
                        {!empty && (
                          <View style={{
                            position: 'absolute', left: 0, right: 0, bottom: 0,
                            height: `${pct}%`, borderRadius: 999,
                            backgroundColor: today ? FILL_DARK : FILL_LIGHT,
                            ...(Platform.OS === 'web' ? { transition: 'height 800ms cubic-bezier(0.22, 1, 0.36, 1)' } as any : {}),
                          } as any} />
                        )}
                      </View>
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: today ? '700' : '500', color: today ? T.ink : T.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {d[0]}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })()}
      </View>

      {/* ═══ Geciken vakalar — list or positive empty state ═══ */}
      <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{
          fontSize: 16, fontWeight: '500', color: T.ink, letterSpacing: -0.2,
          ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
        }}>
          {t('admin.dashboard.delayedCases')}
        </Text>
        {delayed.length > 0 && (
          <Pressable onPress={() => router.push('/(admin)/orders' as any)}>
            <Text style={{ fontSize: 12, color: EXEC.accentDark, fontWeight: '500' }}>{t('admin.dashboard.viewAll')}</Text>
          </Pressable>
        )}
      </View>

      {/* Empty state */}
      {delayed.length === 0 && (
        <View style={{
          marginHorizontal: 16, marginBottom: 16,
          padding: 16, borderRadius: 18,
          backgroundColor: `${EXEC.primary}14`,
          borderWidth: 1, borderColor: `${EXEC.primary}28`,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <View style={{
            width: 36, height: 36, borderRadius: 12,
            backgroundColor: `${EXEC.primary}22`,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckCircle2 size={18} color={EXEC.primary} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: T.ink, letterSpacing: -0.1 }}>
              {t('admin.dashboard.noDelayedCases')}
            </Text>
            <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>
              {t('admin.dashboard.productionOnTrack')}
            </Text>
          </View>
        </View>
      )}

      {/* List */}
      {delayed.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}>
          {delayed.slice(0, 3).map(o => (
            <Pressable key={o.id} onPress={() => props.onOpenOrder?.(o.id)}>
              {({ pressed }: any) => (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  padding: 12, borderRadius: 18,
                  backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
                  opacity: pressed ? 0.92 : 1,
                }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: T.rubySoft,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Flame size={18} color={T.ruby} strokeWidth={1.6} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <Text
                        style={{ fontSize: 14, fontWeight: '600', color: T.ink, flexShrink: 1 }}
                        numberOfLines={1}
                      >
                        {o.name}
                      </Text>
                      <Text style={{ fontSize: 10, color: T.ink3, fontFamily: T.mono, flexShrink: 0 }}>
                        {o.id}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }} numberOfLines={1}>
                      {o.clinic} · {o.stage}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{
                      fontSize: 13, fontWeight: '600', color: T.ruby,
                      ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                    }}>
                      {o.remain}
                    </Text>
                    <Text style={{ fontSize: 9.5, color: T.ink3, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      {o.kind === 'qc' ? t('admin.delayedCase.qcIssue') : t('admin.delayedCase.delay')}
                    </Text>
                  </View>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function TopIconButton({ icon: Icon, onPress, badgeDot }:
  { icon: any; onPress?: () => void; badgeDot?: boolean }) {
  const T = useMobileTokens();
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      {({ pressed }: any) => (
        <View style={{
          width: 40, height: 40, borderRadius: 14,
          backgroundColor: T.card,
          borderWidth: 1, borderColor: T.hairline,
          alignItems: 'center', justifyContent: 'center',
          position: 'relative',
          opacity: pressed ? 0.7 : 1,
        }}>
          <Icon size={18} color={T.ink} strokeWidth={1.8} />
          {badgeDot && (
            <View style={{
              position: 'absolute',
              top: 7, right: 7,
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: T.ruby,
              borderWidth: 1.5, borderColor: T.card,
            }} />
          )}
        </View>
      )}
    </Pressable>
  );
}

function onAccentInk(accent: string): string {
  const h = (accent || '#000000').replace('#', '');
  if (h.length < 6) return '#FFFFFF';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0A0A0A' : '#FFFFFF';
}

// ── Renk mix yardımcıları (KPI fill kartı için zengin gradient) ──────────────
function _mix(hex: string, target: number, t: number): string {
  const h = (hex || '#000000').replace('#', '');
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const tr = (target >> 16) & 255, tg = (target >> 8) & 255, tb = target & 255;
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const nr = cl(r + (tr - r) * t), ng = cl(g + (tg - g) * t), nb = cl(b + (tb - b) * t);
  return '#' + [nr, ng, nb].map(x => x.toString(16).padStart(2, '0')).join('');
}
const deepen  = (hex: string, t: number) => _mix(hex, 0x000000, t);
const lighten = (hex: string, t: number) => _mix(hex, 0xFFFFFF, t);

function Kpi({ label, numericValue, delta, deltaColor, sub, dark, accent, icon: Icon }:
  { label: string; numericValue: number; delta?: string; deltaColor?: string; sub?: string; dark?: boolean; accent?: string; icon?: any }) {
  const T = useMobileTokens();
  const acc = accent ?? '#4771AB';
  const fill = !!dark;
  // Fill (highlight) kartı: flat/muddy coral yerine zengin gradient (parlak→derin
  // terracotta) + derin zemine göre seçilen ink. Daha canlı, kontrastı yüksek.
  const fillDeep = deepen(acc, 0.24);
  const fillTop  = lighten(acc, 0.10);
  const onAcc = onAccentInk(fill ? fillDeep : acc);
  const valueColor = fill ? onAcc : T.ink;
  const labelColor = fill ? `${onAcc}C2` : T.ink3;
  const subColor = fill ? `${onAcc}B0` : T.ink3;
  const deltaColorFinal = fill ? onAcc : (deltaColor ?? T.ink2);
  const iconBg = fill ? `${onAcc}2E` : `${acc}1A`;
  const iconColor = fill ? onAcc : acc;
  return (
    <View style={{
      flex: 1, borderRadius: 24, padding: 16, overflow: 'hidden',
      backgroundColor: fill ? fillDeep : T.card,
      borderWidth: fill ? 0 : 1, borderColor: T.hairline,
      ...(fill && Platform.OS === 'web'
        ? ({ backgroundImage: `linear-gradient(150deg, ${fillTop} 0%, ${acc} 48%, ${fillDeep} 100%)` } as any)
        : {}),
      ...(fill && Platform.OS === 'web'
        ? ({ boxShadow: `0 10px 24px -8px ${deepen(acc, 0.12)}66` } as any)
        : {}),
    }}>
      <Text style={{ fontSize: 10.5, fontWeight: '600', color: labelColor, letterSpacing: 1, textTransform: 'uppercase' }} numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <AnimatedNumber
          value={numericValue}
          duration={800}
          style={{
            fontSize: 34, fontWeight: '400', color: valueColor, letterSpacing: -1,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }}
        />
        {!!Icon && (
          <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={20} color={iconColor} strokeWidth={2} />
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        {!!delta && (
          <Text style={{ fontSize: 11, fontWeight: '600', color: deltaColorFinal }}>
            {delta}
          </Text>
        )}
        {!!sub && (
          <Text style={{ fontSize: 10.5, color: subColor }}>
            {sub}
          </Text>
        )}
      </View>
    </View>
  );
}
