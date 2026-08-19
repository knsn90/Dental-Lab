// modules/dashboard/components/DoctorMobileDashboard.tsx
// Aydın Lab Mobile handoff — hekim (doctor) mobile dashboard.
// Sections: header → greeting → aktif takip (dark) → KPI 2-grid → week strip
//           → bekleyen onaylar / geciken vakalar → quick actions

import React from 'react';
import { firstName as displayFirstName } from '../../../core/util/personName';
import { View, Text, Pressable, ScrollView, Platform, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  QrCode, Flame, FileCheck, ClipboardList, Bell, User as UserIcon,
} from 'lucide-react-native';
import { isRTL, fmtWeekdayDayMonth } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { MOBILE_PANEL_THEMES, useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { HeroGlowOverlay } from '../../../core/ui/mobile/HeroGlowOverlay';
import { Ring } from '../../../core/ui/mobile/Ring';
import { AnimatedNumber } from '../../../core/ui/mobile/AnimatedNumber';
import { NewOrderCTACard } from '../../../core/ui/mobile/NewOrderCTACard';
import { FaceScanQuickAction, useFaceScanAvailable } from '../../orders/components/FaceScanQuickAction';
import { useAuthStore } from '../../../core/store/authStore';

import { UnreadMessagesCard } from '../../../core/ui/mobile/UnreadMessagesCard';
import { RecentOrdersMobile, type RecentOrderItem } from './RecentOrdersMobile';

const DOCTOR = MOBILE_PANEL_THEMES.doctor;

// Gün/ay adları getDay()/getMonth() ile indekslenen SABİT dizi → sözlüğe takılmaz,
// tek tek autoT() ile çevrilir (Miladi ay adları; Şemsi takvim kullanılmaz).
const DAY_NAMES   = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
const MONTH_NAMES = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
// Hafta şeridi kolon etiketleri — ilk harf gösterilir (çeviri sonrası: دوشنبه → د).
const WEEK_STRIP_DAYS = ['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];

function doctorTodayLabel(): string {
  const d = new Date();
  return fmtWeekdayDayMonth(d);
}

export interface DoctorDelayedCase {
  id: string;        // order_number
  patient: string;   // patient name
  workType: string;  // implant / kron vb.
  remain: string;    // +1g 3sa
  kind: 'delay' | 'pending_approval';
}

export interface DoctorMobileDashboardProps {
  greeting?: string;
  clinicName?: string;        // "Yıldız Klinik"
  todayLabel?: string;
  // Live takip
  liveActive?: number;
  liveTotal?: number;
  liveStages?: { alindi: number; uretim: number; kk: number; hazir: number };
  livePercent?: number;       // deliveredPct
  // KPI
  activeOrders?: number;
  overdueCount?: number;
  thisMonthNew?: number;
  pendingApprovalsCount?: number;
  // Week
  weekBars?: number[];
  weekRange?: string;
  weekTotal?: number;
  // List
  delayed?: DoctorDelayedCase[];
  recentOrders?: RecentOrderItem[];
  // Actions
  onNewOrder?: () => void;
  onScan?: () => void;
  onApprovals?: () => void;
  onProfile?: () => void;
  onCalendar?: () => void;
  onMessages?: () => void;
  onNotifications?: () => void;
  onOpenOrder?: (id: string) => void;
  onOpenOrderById?: (dbId: string) => void;
  onAllOrders?: () => void;
  // Refresh
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function DoctorMobileDashboard(props: DoctorMobileDashboardProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const T = useMobileTokens();
  const faceScanOk = useFaceScanAvailable();

  // "Dr." önekini agresif şekilde sök — sonra ilk isim al
  const rawName = (profile?.full_name ?? '').trim();
  const stripDrRe = /^\s*(dr\.?|doktor|prof\.?\s*dr\.?|doç\.?\s*dr\.?)\s*\.?\s*/i;
  let cleanName = rawName;
  while (stripDrRe.test(cleanName)) cleanName = cleanName.replace(stripDrRe, '').trim();
  const firstName = displayFirstName(cleanName);
  const rtl = isRTL();
  const greeting  = props.greeting   ?? (firstName ? `${autoT('Hoş geldin, Dt.')} ${firstName}.` : autoT('Hoş geldin.'));
  const today     = props.todayLabel ?? defaultToday();
  const clinic    = props.clinicName ?? autoT('Klinik');

  const live = {
    active: props.liveActive ?? 0,
    total:  props.liveTotal ?? 0,
    stages: props.liveStages ?? { alindi: 0, uretim: 0, kk: 0, hazir: 0 },
    pct:    props.livePercent ?? 0,
  };
  const week    = props.weekBars ?? [0,0,0,0,0,0,0];
  const delayed = props.delayed  ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: T.bg }}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={!!props.refreshing} onRefresh={props.onRefresh} tintColor={DOCTOR.primary} />}
    >
      {/* ═══ Greeting + notification bell ═══ */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        paddingTop: Math.max(insets.top, 8) + 72,
        paddingBottom: 18,
        gap: 12,
      }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{
            fontSize: 10.5, fontWeight: '400', letterSpacing: 1.2, textTransform: 'uppercase',
            color: T.ink3,
          }}>
            {doctorTodayLabel()}
          </Text>
          <Text style={{
            fontSize: 28, fontWeight: '300', color: T.ink, letterSpacing: -0.5, lineHeight: 32,
            marginTop: 4,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }}>
            {greeting}
          </Text>
          <Text style={{ fontSize: 13.5, color: T.ink3, marginTop: 8, lineHeight: 19 }}>
            {autoT('Bugün')} {live.total} {autoT('sipariş takipte,')} {live.active} {autoT('aktif')}{(props.overdueCount ?? 0) > 0 ? `, ${props.overdueCount} ${autoT('geciken')}` : ''}.
          </Text>
        </View>

        {/* Top action icons — global TopActionBar (layout level) sağ üstte sabit */}
      </View>

      {/* ═══ Primary CTA — animated "Yeni Vaka" card ═══ */}
      {!!props.onNewOrder && (
        <NewOrderCTACard
          accentColor={DOCTOR.primary}
          onPress={props.onNewOrder}
          kicker={(props.thisMonthNew ?? 0) > 0
            ? `${autoT('BU AY')} ${props.thisMonthNew} ${autoT('YENİ VAKA')}`
            : autoT('YENİ VAKA')}
          rightSlot={faceScanOk ? <FaceScanQuickAction variant="card" accentColor={DOCTOR.primary} /> : undefined}
        />
      )}

      {/* ═══ Aktif takip card (panel-themed dark) ═══ */}
      <View style={{
        marginHorizontal: 16, marginBottom: 16,
        borderRadius: 24, padding: 18,
        backgroundColor: DOCTOR.bgHero, overflow: 'hidden',
      }}>
        <HeroGlowOverlay color={DOCTOR.primary} variant="warm" />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{
              width: 7, height: 7, borderRadius: 4,
              backgroundColor: DOCTOR.primary,
              ...(Platform.OS === 'web' ? { boxShadow: `0 0 0 4px ${DOCTOR.primary}30` } as any : {}),
            }} />
            <Text style={{ fontSize: 10.5, fontWeight: '600', color: T.onDark2, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Aktif takip
            </Text>
          </View>
          <Text style={{ fontSize: 10, color: T.onDark3, fontFamily: T.mono }}>
            {live.active}/{live.total}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: 14 }}>
          <Ring value={live.pct} size={108} stroke={9} color={DOCTOR.primary} track="rgba(255,255,255,0.10)" animatedEndDot>
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
                fontSize: 14, color: DOCTOR.primary, fontWeight: '400',
                ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
              }}>%</Text>
            </View>
          </Ring>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {[
                { l: autoT('Alındı'), n: live.stages.alindi },
                { l: autoT('Üretim'), n: live.stages.uretim },
                { l: autoT('KK'),     n: live.stages.kk },
                { l: autoT('Hazır'),  n: live.stages.hazir },
              ].map((s, i) => (
                <View key={i} style={{ alignItems: 'center', gap: 6 }}>
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    borderWidth: 1.5,
                    borderColor: s.n > 0 ? DOCTOR.primary : 'rgba(255,255,255,0.14)',
                    backgroundColor: s.n > 0 ? `${DOCTOR.primary}1F` : 'transparent',
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
        <Kpi
          label={autoT('Aktif sipariş')}
          numericValue={props.activeOrders ?? 0}
          delta={`${props.thisMonthNew ?? 0} ${autoT('bu ay')}`}
          sub={`${props.overdueCount ?? 0} ${autoT('geciken')}`}
          deltaColor={T.jade}
          icon={ClipboardList}
        />
        <Kpi
          label={autoT('Onay bekleyen')}
          numericValue={props.pendingApprovalsCount ?? 0}
          delta={(props.pendingApprovalsCount ?? 0) > 0 ? autoT('incele →') : autoT('temiz')}
          // 0 ise soft state, varsa dark — dikkat çeker
          dark={(props.pendingApprovalsCount ?? 0) > 0}
          accent={DOCTOR.primary}
          icon={FileCheck}
        />
      </View>

      {/* ═══ Mesajlar kartı — okunmamışı öne çıkarır (panel accent) ═══ */}
      <UnreadMessagesCard
        accent={DOCTOR.primary}
        onOpenOrder={(id) => router.push(`/(doctor)/order/${id}` as any)}
        onOpenInbox={() => router.push('/(doctor)/messages' as any)}
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
        {/* Admin panel ile aynı: hatched-rail pill kolonları — panel tematik (sage) */}
        {(() => {
          const SCALE_MAX = 20;
          const FILL_LIGHT = `${DOCTOR.primary}55`;
          const FILL_DARK  = DOCTOR.primary;
          // Rail + stripe panel temasına uyumlu (sage soft + sage muted)
          const RAIL_BG    = `${DOCTOR.primary}08`;
          const STRIPE_BG  = `repeating-linear-gradient(135deg, ${DOCTOR.primary}14 0 6px, transparent 6px 12px)`;

          return (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', height: 110, paddingHorizontal: 2 }}>
              {WEEK_STRIP_DAYS.map((d, i) => {
                const n = week[i] ?? 0;
                const isToday = i === 6;
                const pct = n > 0 ? Math.min(Math.max((n / SCALE_MAX) * 100, 8), 100) : 0;
                const empty = n === 0;
                return (
                  <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4 }}>
                    <View style={{ width: '100%', maxWidth: 36, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                      {isToday && n > 0 && (
                        <View style={{
                          marginBottom: 3, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 8,
                          backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
                        }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: FILL_DARK }}>{n}</Text>
                        </View>
                      )}
                      <View
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: 999,
                          backgroundColor: RAIL_BG,
                          // @ts-ignore web hatched bg
                          ...(Platform.OS === 'web' ? { backgroundImage: STRIPE_BG } as any : {}),
                          overflow: 'hidden',
                          position: 'relative' as any,
                        }}
                      >
                        {!empty && (
                          <View
                            style={{
                              position: 'absolute',
                              left: 0, right: 0, bottom: 0,
                              height: `${pct}%`,
                              borderRadius: 999,
                              backgroundColor: isToday ? FILL_DARK : FILL_LIGHT,
                              // @ts-ignore web
                              ...(Platform.OS === 'web' ? { transition: 'height 800ms cubic-bezier(0.22, 1, 0.36, 1)' } as any : {}),
                            } as any}
                          />
                        )}
                      </View>
                    </View>
                    <Text style={{
                      fontSize: 10,
                      fontWeight: isToday ? '700' : '500',
                      color: isToday ? T.ink : T.ink3,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}>
                      {autoT(d).charAt(0)}
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
          <Pressable onPress={() => router.push('/(doctor)/orders' as any)}>
            <Text style={{ fontSize: 12, color: DOCTOR.accentDark, fontWeight: '500' }}>Tümü →</Text>
          </Pressable>
        )}
      </View>

      {/* Positive empty state — tinted accent overlay (works in light & dark) */}
      {delayed.length === 0 && (
        <View style={{
          marginHorizontal: 16, marginBottom: 16,
          padding: 16, borderRadius: 18,
          backgroundColor: `${DOCTOR.primary}14`,
          borderWidth: 1, borderColor: `${DOCTOR.primary}28`,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <View style={{
            width: 36, height: 36, borderRadius: 12,
            backgroundColor: `${DOCTOR.primary}22`,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <FileCheck size={18} color={DOCTOR.primary} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: T.ink, letterSpacing: -0.1 }}>
              Tüm vakalar yolunda
            </Text>
            <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>
              Bekleyen onay veya gecikme yok.
            </Text>
          </View>
        </View>
      )}

      {/* List */}
      {delayed.length > 0 && (
        <>
          <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}>
            {delayed.slice(0, 3).map(o => {
              const Icon = o.kind === 'pending_approval' ? FileCheck : Flame;
              const iconBg = o.kind === 'pending_approval' ? DOCTOR.bgDeep : T.rubySoft;
              const iconColor = o.kind === 'pending_approval' ? DOCTOR.accentDark : T.ruby;
              const valueColor = o.kind === 'pending_approval' ? DOCTOR.accentDark : T.ruby;
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
                        <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink, flexShrink: 1, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>{o.patient}</Text>
                        {/* Sipariş no Latin başlar → RNW dir="auto" ile LTR olur; RTL'de hizayı sabitle */}
                        <Text style={{ fontSize: 10, color: T.ink3, fontFamily: T.mono, flexShrink: 0, textAlign: rtl ? 'right' : undefined }}>{o.id}</Text>
                      </View>
                      <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }} numberOfLines={1}>
                        {o.workType}
                      </Text>
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
        </>
      )}

      {/* Quick actions removed — QR & Onaylar are now top icons, Mesaj is in tab bar */}

      {/* ═══ Son Siparişler — desktop tablonun mobil karşılığı ═══ */}
      <RecentOrdersMobile
        items={props.recentOrders ?? []}
        accent={DOCTOR.primary}
        accentDark={DOCTOR.accentDark}
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
              // `end:` inline stili bu projede güvenilir değil → yönü açıkça seç
              top: 7, ...(isRTL() ? { left: 7 } : { right: 7 }),
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
  const d = new Date();
  return fmtWeekdayDayMonth(d, ' · ');
}
