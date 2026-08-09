// modules/dashboard/components/ClinicMobileDashboard.tsx
// Aydın Lab Mobile handoff — klinik-admin mobile dashboard.
// Clinic admins oversee multiple doctors and the clinic-wide production pipeline.
// Sections: header → greeting → aktif takip (dark) → KPI 2-grid → week strip
//           → aksiyon gerektiren / hekim listesi → quick actions

import React from 'react';
import { View, Text, Pressable, ScrollView, Platform, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  QrCode, Flame, FileCheck, ClipboardList, Bell, Stethoscope, User as UserIcon,
  AlertTriangle, ArrowUpRight,
} from 'lucide-react-native';
import Svg, { Defs, Pattern, Rect, Line } from 'react-native-svg';
import { MOBILE_PANEL_THEMES, useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { DS } from '../../../core/theme/dsTokens';
import { HeroGlowOverlay } from '../../../core/ui/mobile/HeroGlowOverlay';
import { AlertPillX } from '../../../core/ui/AlertPillX';
import { Ring } from '../../../core/ui/mobile/Ring';
import { AnimatedNumber } from '../../../core/ui/mobile/AnimatedNumber';
import { NewOrderCTACard } from '../../../core/ui/mobile/NewOrderCTACard';
import { FaceScanQuickAction, useFaceScanAvailable } from '../../orders/components/FaceScanQuickAction';
import { useAuthStore } from '../../../core/store/authStore';

import { UnreadMessagesCard } from '../../../core/ui/mobile/UnreadMessagesCard';
import { RecentOrdersMobile, type RecentOrderItem } from './RecentOrdersMobile';

const CLINIC = MOBILE_PANEL_THEMES.klinik;

function clinicTodayLabel(): string {
  const d = new Date();
  const days   = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

export interface ClinicDelayedCase {
  id: string;        // order_number
  patient: string;   // patient name
  workType: string;  // implant / kron vb.
  doctorName?: string; // hekim adı (clinic admin görsün)
  remain: string;    // +1g 3sa
  kind: 'delay' | 'pending_approval';
}

export interface ClinicMobileDashboardProps {
  greeting?: string;
  clinicName?: string;        // "Yıldız Klinik"
  todayLabel?: string;
  // Live takip — clinic-wide
  liveActive?: number;
  liveTotal?: number;
  liveStages?: { alindi: number; uretim: number; kk: number; hazir: number };
  livePercent?: number;       // deliveredPct
  // KPI
  activeOrders?: number;
  doctorsCount?: number;
  overdueCount?: number;
  thisMonthNew?: number;
  pendingApprovalsCount?: number;
  // Week
  weekBars?: number[];
  weekRange?: string;
  weekTotal?: number;
  // List
  delayed?: ClinicDelayedCase[];
  recentOrders?: RecentOrderItem[];
  // Actions
  onNewOrder?: () => void;
  onScan?: () => void;
  onApprovals?: () => void;
  onProfile?: () => void;
  onMessages?: () => void;
  onNotifications?: () => void;
  onOpenOrder?: (id: string) => void;
  onOpenOrderById?: (dbId: string) => void;
  onAllOrders?: () => void;
  // Refresh
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function ClinicMobileDashboard(props: ClinicMobileDashboardProps) {
  const faceScanOk = useFaceScanAvailable();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const T = useMobileTokens();

  const rawName = (profile?.full_name ?? '').trim();
  const firstName = rawName.split(' ')[0] ?? '';
  const clinic    = props.clinicName ?? (profile as any)?.clinic_name ?? 'Kliniğiniz';
  const greeting  = props.greeting   ?? `Merhaba, ${clinic}.`;
  const today     = props.todayLabel ?? defaultToday();

  const live = {
    active: props.liveActive ?? 0,
    total:  props.liveTotal ?? 0,
    stages: props.liveStages ?? { alindi: 0, uretim: 0, kk: 0, hazir: 0 },
    pct:    props.livePercent ?? 0,
  };
  const week    = props.weekBars ?? [0,0,0,0,0,0,0];
  const delayed = props.delayed  ?? [];

  const doctorsCount = props.doctorsCount ?? 0;
  const pendingApprovals = props.pendingApprovalsCount ?? 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: T.bg }}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={!!props.refreshing} onRefresh={props.onRefresh} tintColor={CLINIC.primary} />}
    >
      {/* ═══ Greeting + top icon buttons ═══ */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        // Notch-aware: sabit 96 yerine insets+72 → logo ile çakışmaz
        paddingTop: Math.max(insets.top, 8) + 72,
        paddingBottom: 18,
        gap: 12,
      }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{
            fontSize: 10.5, fontWeight: '400', letterSpacing: 1.2, textTransform: 'uppercase',
            color: T.ink3,
          }}>
            {clinicTodayLabel()}
          </Text>
          <Text style={{
            fontSize: 28, fontWeight: '300', color: T.ink, letterSpacing: -0.5, lineHeight: 32,
            marginTop: 4,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }}>
            {greeting}
          </Text>
          <Text style={{ fontSize: 13.5, color: T.ink3, marginTop: 8, lineHeight: 19 }} numberOfLines={1}>
            Yetkili: <Text style={{ color: T.ink2, fontWeight: '600' }}>{rawName || firstName || '—'}</Text>
          </Text>
        </View>

        {/* Top action icons — global TopActionBar (layout level) sağ üstte sabit */}
      </View>

      {/* ═══ Primary CTA — animated "Yeni Sipariş" card ═══ */}
      {!!props.onNewOrder && (
        <NewOrderCTACard
          accentColor={CLINIC.primary}
          onPress={props.onNewOrder}
          kicker={(props.thisMonthNew ?? 0) > 0 ? `BU AY ${props.thisMonthNew} YENİ SİPARİŞ` : 'YENİ SİPARİŞ'}
          rightSlot={faceScanOk ? <FaceScanQuickAction variant="card" accentColor={CLINIC.primary} /> : undefined}
        />
      )}

      {/* ═══ DURUM ŞERİDİ — geciken sipariş (kompakt pill) ═══
          Eskiden 72px'lik tam genişlik kırmızı banner'dı; tek geciken sipariş
          için ekranın en değerli alanını harcıyordu. Masaüstü panolarıyla aynı
          dil: AlertPillX. */}
      {(props.overdueCount ?? 0) > 0 && (
        <View style={{ marginHorizontal: 16, marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <AlertPillX
            icon={AlertTriangle}
            count={props.overdueCount ?? 0}
            label="Geciken"
            color={DS.clinic.danger}
            labelColor="#9C2E2E"
            pulse
            onPress={() => router.push('/(clinic)/orders' as any)}
          />
        </View>
      )}

      {/* ═══ Aktif takip card (panel-themed dark) — clinic-wide pipeline ═══ */}
      <View style={{
        marginHorizontal: 16, marginBottom: 16,
        borderRadius: 24, padding: 18,
        backgroundColor: CLINIC.bgHero, overflow: 'hidden',
      }}>
        <HeroGlowOverlay color={CLINIC.primary} variant="warm" />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{
              width: 7, height: 7, borderRadius: 4,
              backgroundColor: CLINIC.primary,
              ...(Platform.OS === 'web' ? { boxShadow: `0 0 0 4px ${CLINIC.primary}30` } as any : {}),
            }} />
            <Text style={{ fontSize: 10.5, fontWeight: '600', color: T.onDark2, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Klinik aktif takip
            </Text>
          </View>
          <Text style={{ fontSize: 10, color: T.onDark3, fontFamily: T.mono }}>
            {live.active}/{live.total}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: 14 }}>
          <Ring value={live.pct} size={108} stroke={9} color={CLINIC.primary} track="rgba(255,255,255,0.10)" animatedEndDot>
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
                fontSize: 14, color: CLINIC.primary, fontWeight: '400',
                ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
              }}>%</Text>
            </View>
          </Ring>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {[
                { l: 'Alındı', n: live.stages.alindi },
                { l: 'Üretim', n: live.stages.uretim },
                { l: 'KK',     n: live.stages.kk },
                { l: 'Hazır',  n: live.stages.hazir },
              ].map((s, i) => (
                <View key={i} style={{ alignItems: 'center', gap: 6 }}>
                  {/* Rakam daire içinde — desktop tasarımı */}
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    borderWidth: 1.5,
                    borderColor: s.n > 0 ? CLINIC.primary : 'rgba(255,255,255,0.14)',
                    backgroundColor: s.n > 0 ? `${CLINIC.primary}1F` : 'transparent',
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

      {/* ═══ KPI 2-grid — Aktif sipariş + (Onay bekleyen varsa) ya da Hekim sayısı ═══ */}
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 16 }}>
        <Kpi
          label="Aktif sipariş"
          numericValue={props.activeOrders ?? 0}
          delta={`${props.thisMonthNew ?? 0} bu ay`}
          sub={`${props.overdueCount ?? 0} geciken`}
          deltaColor={T.jade}
          icon={ClipboardList}
        />
        {pendingApprovals > 0 ? (
          <Kpi
            label="Onay bekleyen"
            numericValue={pendingApprovals}
            delta="incele →"
            dark
            accent={CLINIC.primary}
            icon={FileCheck}
          />
        ) : (
          <Kpi
            label="Hekim"
            numericValue={doctorsCount}
            delta={doctorsCount > 0 ? 'aktif' : 'hekim yok'}
            sub={doctorsCount > 0 ? 'klinik kadrosu' : undefined}
            deltaColor={T.jade}
            icon={Stethoscope}
          />
        )}
      </View>

      {/* ═══ Mesajlar kartı — okunmamışı öne çıkarır (panel accent) ═══ */}
      <UnreadMessagesCard
        accent={CLINIC.primary}
        onOpenOrder={(id) => router.push(`/(clinic)/order/${id}` as any)}
        onOpenInbox={() => router.push('/(clinic)/messages' as any)}
      />

      {/* ═══ Week strip ═══ */}
      <View style={{
        marginHorizontal: 16, marginBottom: 16,
        padding: 14, borderRadius: 20,
        backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>
            Bu hafta · {props.weekRange ?? ''}
          </Text>
          <Text style={{ fontSize: 11, color: T.ink3 }}>
            Yeni <Text style={{ color: T.ink, fontWeight: '600' }}>{props.weekTotal ?? week.reduce((a, b) => a + b, 0)}</Text>
          </Text>
        </View>
        {/* Admin panel ile aynı: hatched-rail pill kolonları — clinic accent */}
        {(() => {
          const SCALE_MAX = 20;
          const FILL_LIGHT = `${CLINIC.primary}55`;
          const FILL_DARK  = CLINIC.primary;
          const RAIL_BG    = `${CLINIC.primary}08`;
          const STRIPE_BG  = `repeating-linear-gradient(135deg, ${CLINIC.primary}14 0 6px, transparent 6px 12px)`;

          return (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', height: 110, paddingHorizontal: 2 }}>
              {['Pa', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map((d, i) => {
                const n = week[i] ?? 0;
                const isToday = i === 6;
                const pct = n > 0 ? Math.min(Math.max((n / SCALE_MAX) * 100, 8), 100) : 0;
                const empty = n === 0;
                return (
                  <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4 }}>
                    <View style={{ width: '100%', maxWidth: 36, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                      {isToday && n > 0 && (
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
                        {/* Native: SVG çapraz tarama (web'deki backgroundImage karşılığı) */}
                        {Platform.OS !== 'web' && (
                          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                            <Svg width="100%" height="100%" preserveAspectRatio="none">
                              <Defs>
                                <Pattern id={`clinic-stripe-${i}`} patternUnits="userSpaceOnUse" width={12} height={12} patternTransform="rotate(135)">
                                  <Rect x="0" y="0" width="12" height="12" fill="transparent" />
                                  <Line x1="0" y1="0" x2="0" y2="12" stroke={CLINIC.primary} strokeWidth={5} strokeOpacity={0.22} />
                                </Pattern>
                              </Defs>
                              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#clinic-stripe-${i})`} />
                            </Svg>
                          </View>
                        )}
                        {!empty && (
                          <View style={{
                            position: 'absolute', left: 0, right: 0, bottom: 0,
                            height: `${pct}%`, borderRadius: 999,
                            backgroundColor: isToday ? FILL_DARK : FILL_LIGHT,
                            ...(Platform.OS === 'web' ? { transition: 'height 800ms cubic-bezier(0.22, 1, 0.36, 1)' } as any : {}),
                          } as any} />
                        )}
                      </View>
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: isToday ? '700' : '500', color: isToday ? T.ink : T.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {d[0]}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })()}
      </View>

      {/* ═══ Aksiyon gerektiren — list or positive empty state ═══ */}
      <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{
          fontSize: 16, fontWeight: '500', color: T.ink, letterSpacing: -0.2,
          ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
        }}>
          Aksiyon gerektiren
        </Text>
        {delayed.length > 0 && (
          <Pressable onPress={() => router.push('/(clinic)/orders' as any)}>
            <Text style={{ fontSize: 12, color: CLINIC.accentDark, fontWeight: '500' }}>Tümü →</Text>
          </Pressable>
        )}
      </View>

      {/* Positive empty state */}
      {delayed.length === 0 && (
        <View style={{
          marginHorizontal: 16, marginBottom: 16,
          padding: 16, borderRadius: 18,
          backgroundColor: `${CLINIC.primary}14`,
          borderWidth: 1, borderColor: `${CLINIC.primary}28`,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <View style={{
            width: 36, height: 36, borderRadius: 12,
            backgroundColor: `${CLINIC.primary}22`,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <FileCheck size={18} color={CLINIC.primary} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: T.ink, letterSpacing: -0.1 }}>
              Klinik akışı temiz
            </Text>
            <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>
              {doctorsCount > 0
                ? `${doctorsCount} hekim için bekleyen onay veya gecikme yok.`
                : 'Bekleyen onay veya gecikme yok.'}
            </Text>
          </View>
        </View>
      )}

      {/* List */}
      {delayed.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}>
          {delayed.slice(0, 3).map(o => {
            const Icon = o.kind === 'pending_approval' ? FileCheck : Flame;
            const iconBg = o.kind === 'pending_approval' ? CLINIC.bgDeep : T.rubySoft;
            const iconColor = o.kind === 'pending_approval' ? CLINIC.accentDark : T.ruby;
            const valueColor = o.kind === 'pending_approval' ? CLINIC.accentDark : T.ruby;
            return (
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
                      backgroundColor: iconBg,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={18} color={iconColor} strokeWidth={1.6} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink, flexShrink: 1 }} numberOfLines={1}>{o.patient}</Text>
                        <Text style={{ fontSize: 10, color: T.ink3, fontFamily: T.mono, flexShrink: 0 }}>{o.id}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, minWidth: 0 }}>
                        {!!o.doctorName && (
                          <>
                            <Stethoscope size={10} color={T.ink3} strokeWidth={1.8} />
                            <Text style={{ fontSize: 11, color: T.ink2, flexShrink: 1, fontWeight: '500' }} numberOfLines={1}>
                              {o.doctorName}
                            </Text>
                            <Text style={{ fontSize: 11, color: T.ink3, flexShrink: 0 }}>·</Text>
                          </>
                        )}
                        <Text style={{ fontSize: 11.5, color: T.ink3, flexShrink: 1 }} numberOfLines={1}>
                          {o.workType}
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{
                        fontSize: 13, fontWeight: '600', color: valueColor,
                        ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                      }}>
                        {o.remain}
                      </Text>
                      <Text style={{ fontSize: 9.5, color: T.ink3, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        {o.kind === 'pending_approval' ? 'Onay' : 'Gecikme'}
                      </Text>
                    </View>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ═══ Son Siparişler — desktop tablonun mobil karşılığı ═══ */}
      <RecentOrdersMobile
        items={props.recentOrders ?? []}
        accent={CLINIC.primary}
        accentDark={CLINIC.accentDark}
        onOpenOrder={(id) => props.onOpenOrderById?.(id)}
        onAllOrders={props.onAllOrders}
      />
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

function Kpi({ label, numericValue, delta, deltaColor, sub, dark, accent, icon: Icon }:
  { label: string; numericValue: number; delta?: string; deltaColor?: string; sub?: string; dark?: boolean; accent?: string; icon?: any }) {
  const T = useMobileTokens();
  const acc = accent ?? '#F5C24B';
  const fill = !!dark;
  const onAcc = onAccentInk(acc);
  const valueColor = fill ? onAcc : T.ink;
  const labelColor = fill ? `${onAcc}AA` : T.ink3;
  const subColor = fill ? `${onAcc}AA` : T.ink3;
  const deltaColorFinal = fill ? `${onAcc}DD` : (deltaColor ?? T.ink2);
  const iconBg = fill ? `${onAcc}26` : `${acc}1A`;
  const iconColor = fill ? onAcc : acc;
  return (
    <View style={{
      flex: 1, borderRadius: 24, padding: 16,
      backgroundColor: fill ? acc : T.card,
      borderWidth: fill ? 0 : 1, borderColor: T.hairline,
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

function defaultToday(): string {
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const d = new Date();
  return `${days[d.getDay()]} · ${d.getDate()} ${months[d.getMonth()]}`;
}
