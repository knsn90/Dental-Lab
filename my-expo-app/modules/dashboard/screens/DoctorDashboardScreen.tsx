import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, useWindowDimensions, RefreshControl,
  Animated, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Path, Circle, Line, Polyline,
  Defs, RadialGradient, Stop, Rect,
} from 'react-native-svg';
import { useAuthStore } from '../../../core/store/authStore';
import { supabase } from '../../../core/api/supabase';
import { useOrders } from '../../orders/hooks/useOrders';
import { isOrderOverdue, STATUS_CONFIG } from '../../orders/constants';
import { WorkOrderStatus } from '../../../lib/types';
import { BlurFade } from '../../../core/ui/BlurFade';

// ── Design tokens (frontend-design: intentional spacing + layered depth) ──
const P         = '#0EA5E9'; // doctor accent — sky blue
const P_DARK    = '#0284C7';
const P_TINT_5  = 'rgba(14,165,233,0.05)';
const P_TINT_8  = 'rgba(14,165,233,0.08)';
const P_TINT_12 = 'rgba(14,165,233,0.12)';
const BG        = '#F7F9FB';

const CLR = {
  green:  '#16A34A', greenBg:  '#DCFCE7',
  red:    '#EF4444', redBg:    '#FEE2E2',
  amber:  '#F59E0B', amberBg:  '#FEF3C7',
  purple: '#7C3AED', purpleBg: '#EDE9FE',
  teal:   '#0D9488', tealBg:   '#CCFBF1',
};

const MONTHS_TR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

// ── SVG Icons (Lucide-style, outline) ─────────────────────────────────
type IconName =
  | 'plus' | 'clock' | 'alert-triangle' | 'trending-up' | 'arrow-right'
  | 'package' | 'calendar' | 'activity' | 'check-circle' | 'layers'
  | 'zap' | 'file-text' | 'message-circle' | 'bar-chart' | 'user';

function Icon({ name, size = 18, color = '#0F172A', strokeWidth = 1.8 }: {
  name: IconName; size?: number; color?: string; strokeWidth?: number;
}) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (name) {
    case 'plus':           return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" {...p}/></Svg>;
    case 'clock':          return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="12" cy="12" r="10" {...p}/><Polyline points="12 6 12 12 16 14" {...p}/></Svg>;
    case 'alert-triangle': return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" {...p}/><Line x1="12" y1="9" x2="12" y2="13" {...p}/><Line x1="12" y1="17" x2="12.01" y2="17" {...p}/></Svg>;
    case 'trending-up':    return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="23 6 13.5 15.5 8.5 10.5 1 18" {...p}/><Polyline points="17 6 23 6 23 12" {...p}/></Svg>;
    case 'arrow-right':    return <Svg width={size} height={size} viewBox="0 0 24 24"><Line x1="5" y1="12" x2="19" y2="12" {...p}/><Polyline points="12 5 19 12 12 19" {...p}/></Svg>;
    case 'package':        return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" {...p}/><Polyline points="3.27 6.96 12 12.01 20.73 6.96" {...p}/><Line x1="12" y1="22.08" x2="12" y2="12" {...p}/></Svg>;
    case 'calendar':       return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M3 9h18M21 10V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8" {...p}/><Polyline points="8 2 8 6" {...p}/><Polyline points="16 2 16 6" {...p}/></Svg>;
    case 'activity':       return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="22 12 18 12 15 21 9 3 6 12 2 12" {...p}/></Svg>;
    case 'check-circle':   return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" {...p}/><Polyline points="22 4 12 14.01 9 11.01" {...p}/></Svg>;
    case 'layers':         return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="12 2 2 7 12 12 22 7 12 2" {...p}/><Polyline points="2 17 12 22 22 17" {...p}/><Polyline points="2 12 12 17 22 12" {...p}/></Svg>;
    case 'zap':            return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" {...p}/></Svg>;
    case 'file-text':      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" {...p}/><Polyline points="14 2 14 8 20 8" {...p}/><Line x1="16" y1="13" x2="8" y2="13" {...p}/><Line x1="16" y1="17" x2="8" y2="17" {...p}/></Svg>;
    case 'message-circle': return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" {...p}/></Svg>;
    case 'bar-chart':      return <Svg width={size} height={size} viewBox="0 0 24 24"><Line x1="12" y1="20" x2="12" y2="10" {...p}/><Line x1="18" y1="20" x2="18" y2="4" {...p}/><Line x1="6" y1="20" x2="6" y2="16" {...p}/></Svg>;
    case 'user':           return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" {...p}/><Circle cx="12" cy="7" r="4" {...p}/></Svg>;
    default: return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────
function hexA(hex: string, a: number) {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  } catch { return hex; }
}

function getTodayLabel() {
  const d = new Date();
  const days   = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

// ── Hero — layered radial gradients (frontend-design: depth via gradients) ──
function Hero({ firstName, clinicName, overdueCount, onPressOverdue }: {
  firstName: string; clinicName: string | null;
  overdueCount: number; onPressOverdue: () => void;
}) {
  return (
    <View style={hero.wrap}>
      {/* Layer 1 — base gradient background */}
      <Svg
        width="100%" height="100%"
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFillObject}
      >
        <Defs>
          <RadialGradient id="g1" cx="15%" cy="20%" r="55%">
            <Stop offset="0%"   stopColor={P} stopOpacity="0.18" />
            <Stop offset="100%" stopColor={P} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="g2" cx="95%" cy="90%" r="60%">
            <Stop offset="0%"   stopColor={P_DARK} stopOpacity="0.10" />
            <Stop offset="100%" stopColor={P_DARK} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="400" height="200" fill="url(#g1)" />
        <Rect width="400" height="200" fill="url(#g2)" />
      </Svg>

      {/* Layer 2 — content */}
      <View style={hero.content}>
        <BlurFade duration={500} delay={0} yOffset={6}>
          <Text style={hero.greeting}>Merhaba{firstName ? `, Dr. ${firstName}` : ''}</Text>
        </BlurFade>
        <BlurFade duration={500} delay={70} yOffset={6}>
          <Text style={hero.title}>İyi çalışmalar</Text>
        </BlurFade>
        <BlurFade duration={500} delay={140} yOffset={6}>
          <View style={hero.metaRow}>
            <View style={hero.metaChip}>
              <Icon name="calendar" size={11} color={P_DARK} strokeWidth={2} />
              <Text style={hero.metaText}>{getTodayLabel()}</Text>
            </View>
            {clinicName && (
              <View style={hero.metaChip}>
                <Icon name="activity" size={11} color={P_DARK} strokeWidth={2} />
                <Text style={hero.metaText}>{clinicName}</Text>
              </View>
            )}
          </View>
        </BlurFade>
      </View>

      {/* Layer 3 — overdue alert (if any) — floating with tinted shadow */}
      {overdueCount > 0 && (
        <TouchableOpacity
          onPress={onPressOverdue}
          activeOpacity={0.85}
          style={hero.alertBadge}
        >
          <View style={hero.alertIcon}>
            <Icon name="alert-triangle" size={16} color={CLR.red} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={hero.alertCount}>{overdueCount}</Text>
            <Text style={hero.alertLabel}>geciken sipariş</Text>
          </View>
          <Icon name="arrow-right" size={14} color={CLR.red} strokeWidth={2.2} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const hero = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 20,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: `0 1px 2px ${hexA(P, 0.04)}, 0 8px 24px ${hexA(P, 0.06)}` } as any)
      : { shadowColor: P, shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3 }),
  },
  content:   { padding: 24, paddingBottom: 20, zIndex: 1 },
  greeting:  { fontSize: 13, color: '#64748B', fontWeight: '500' },
  title:     { fontSize: 26, fontWeight: '800', color: '#0F172A', letterSpacing: -0.6, marginTop: 2 },
  metaRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  metaChip:  {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: P_TINT_8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20,
  },
  metaText:  { fontSize: 11, fontWeight: '700', color: P_DARK, letterSpacing: 0.1 },

  /* Floating alert badge with color-tinted shadow */
  alertBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 16, marginTop: -4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: hexA(CLR.red, 0.18),
    borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 14,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: `0 2px 4px ${hexA(CLR.red, 0.06)}, 0 12px 28px ${hexA(CLR.red, 0.12)}` } as any)
      : { shadowColor: CLR.red, shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 4 }),
  },
  alertIcon: {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: CLR.redBg,
    alignItems: 'center', justifyContent: 'center',
  },
  alertCount: { fontSize: 18, fontWeight: '900', color: CLR.red, letterSpacing: -0.3, lineHeight: 20 },
  alertLabel: { fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 1 },
});

// ── KPI Card ───────────────────────────────────────────────────────
function KPICard({ label, value, icon, accent, delta }: {
  label: string; value: string | number; icon: IconName; accent: string; delta?: string;
}) {
  return (
    <View style={kpi.card}>
      <View style={[kpi.icon, { backgroundColor: hexA(accent, 0.10) }]}>
        <Icon name={icon} size={16} color={accent} strokeWidth={2} />
      </View>
      <Text style={kpi.label} numberOfLines={1}>{label}</Text>
      <View style={kpi.valueRow}>
        <Text style={[kpi.value, { color: accent }]}>{value}</Text>
        {delta && (
          <View style={kpi.delta}>
            <Icon name="trending-up" size={9} color={CLR.green} strokeWidth={2.5} />
            <Text style={kpi.deltaText}>{delta}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
const kpi = StyleSheet.create({
  card: {
    flex: 1, minWidth: 140,
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#F1F5F9',
    gap: 8,
  },
  icon:     { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label:    { fontSize: 10, color: '#94A3B8', fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  value:    { fontSize: 22, fontWeight: '800', letterSpacing: -0.6, lineHeight: 26 },
  delta:    { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: CLR.greenBg, marginBottom: 4 },
  deltaText:{ fontSize: 9, color: CLR.green, fontWeight: '800' },
});

// ── Card wrapper ────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[cd.wrap, style]}>{children}</View>;
}
function CardHeader({ title, icon, right }: { title: string; icon?: IconName; right?: React.ReactNode }) {
  return (
    <View style={cd.header}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon && <Icon name={icon} size={15} color="#94A3B8" strokeWidth={1.8} />}
        <Text style={cd.title}>{title}</Text>
      </View>
      {right}
    </View>
  );
}
const cd = StyleSheet.create({
  wrap:   { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14 },
  title:  { fontSize: 15, fontWeight: '700', color: '#0F172A' },
});

// ── Section label ───────────────────────────────────────────────────
function Section({ text }: { text: string }) {
  return <Text style={sec.text}>{text}</Text>;
}
const sec = StyleSheet.create({
  text: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10, marginTop: 2 },
});

// ── Quick Action tile (bento) — frontend-design: interactive states ──
function QuickAction({ icon, label, accent, onPress, primary = false }: {
  icon: IconName; label: string; accent: string; onPress: () => void; primary?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, damping: 14 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, damping: 14 }).start();
  return (
    <TouchableOpacity onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} activeOpacity={1} style={{ flex: 1 }}>
      <Animated.View style={[qa.card, primary && qa.cardPrimary, { transform: [{ scale }] }]}>
        <View style={[qa.iconWrap, primary ? qa.iconWrapPrimary : { backgroundColor: hexA(accent, 0.10) }]}>
          <Icon name={icon} size={20} color={primary ? '#FFFFFF' : accent} strokeWidth={2} />
        </View>
        <Text style={[qa.label, primary && qa.labelPrimary]} numberOfLines={1}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}
const qa = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 14,
    borderWidth: 1, borderColor: '#F1F5F9',
    padding: 14, gap: 10, minHeight: 96, justifyContent: 'space-between',
  },
  cardPrimary: {
    backgroundColor: P, borderColor: P,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: `0 6px 16px ${hexA(P, 0.28)}` } as any)
      : { shadowColor: P, shadowOpacity: 0.30, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 }),
  },
  iconWrap:        { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  iconWrapPrimary: { backgroundColor: 'rgba(255,255,255,0.18)' },
  label:           { fontSize: 12, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 },
  labelPrimary:    { color: '#FFFFFF', fontSize: 13 },
});

// ── Monthly Bar Chart ───────────────────────────────────────────────
function AnimatedBar({ pct, isActive, count, label, delay }: {
  pct: number; isActive: boolean; count: number; label: string; delay: number;
}) {
  const h = useRef(new Animated.Value(0)).current;
  const o = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(h, { toValue: pct, damping: 14, stiffness: 120, delay, useNativeDriver: false }),
      Animated.timing(o, { toValue: 1, duration: 300, delay, useNativeDriver: false }),
    ]).start();
  }, [pct]);
  const aH = h.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  return (
    <Animated.View style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', opacity: o }}>
      {count > 0 && (
        <Text style={[ch.barLabel, isActive && { color: P, fontWeight: '800' }]}>{count}</Text>
      )}
      <View style={ch.track}>
        <Animated.View style={[ch.fill, { height: aH }, isActive ? ch.fillActive : ch.fillInactive]} />
      </View>
      <Text style={[ch.monthLabel, isActive && ch.monthLabelActive]}>{label}</Text>
    </Animated.View>
  );
}

function MonthlyChart({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const lastIdx = data.length - 1;
  return (
    <View style={ch.container}>
      {data.map((d, i) => (
        <AnimatedBar
          key={i}
          pct={Math.max((d.count / max) * 100, 4)}
          isActive={i === lastIdx}
          count={d.count}
          label={d.label}
          delay={i * 60}
        />
      ))}
    </View>
  );
}
const ch = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 8, paddingHorizontal: 18, paddingBottom: 18, paddingTop: 24 },
  track:     { width: '100%', flex: 1, justifyContent: 'flex-end', borderRadius: 10, overflow: 'hidden', backgroundColor: P_TINT_5 },
  fill:      { width: '100%', borderRadius: 10 },
  fillActive:   { backgroundColor: P },
  fillInactive: { backgroundColor: hexA(P, 0.25) },
  barLabel:        { fontSize: 10, fontWeight: '700', color: '#94A3B8', marginBottom: 5 },
  monthLabel:      { fontSize: 10, color: '#94A3B8', marginTop: 8, fontWeight: '500' },
  monthLabelActive:{ color: P, fontWeight: '800' },
});

// ── Upcoming delivery row ──────────────────────────────────────────
function UpcomingRow({ order, onPress, last }: { order: any; onPress: () => void; last: boolean }) {
  const days = Math.ceil((new Date(order.delivery_date + 'T00:00:00').getTime() - Date.now()) / 86_400_000);
  const critical = days <= 1;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={[up.row, !last && up.border]}>
      <View style={[up.dayBadge, critical && { backgroundColor: CLR.redBg }]}>
        <Text style={[up.dayNum, critical && { color: CLR.red }]}>{days}</Text>
        <Text style={[up.dayLabel, critical && { color: CLR.red }]}>gün</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={up.orderNo} numberOfLines={1}>{order.work_type || '—'}</Text>
        <Text style={up.patientName} numberOfLines={1}>
          {order.patient_name || 'Hasta belirtilmemiş'} · #{order.order_number}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
const up = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 12 },
  border:     { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  dayBadge:   { width: 44, height: 44, borderRadius: 12, backgroundColor: P_TINT_8, alignItems: 'center', justifyContent: 'center' },
  dayNum:     { fontSize: 17, fontWeight: '800', color: P, lineHeight: 19 },
  dayLabel:   { fontSize: 8, fontWeight: '700', color: P, letterSpacing: 0.3 },
  orderNo:    { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  patientName:{ fontSize: 11, color: '#94A3B8', marginTop: 2 },
});

// ── Status Distribution ────────────────────────────────────────────
function StatusDist({ orders, total }: { orders: any[]; total: number }) {
  const keys = ['alindi','uretimde','kalite_kontrol','teslimata_hazir','teslim_edildi'] as WorkOrderStatus[];
  return (
    <View style={{ paddingHorizontal: 18, paddingBottom: 18, gap: 10 }}>
      {keys.map(k => {
        const count = orders.filter(o => o.status === k).length;
        const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
        const cfg   = STATUS_CONFIG[k];
        return (
          <View key={k}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: cfg.color, marginRight: 8 }} />
              <Text style={{ flex: 1, fontSize: 12, color: '#64748B', fontWeight: '500' }}>{cfg.label}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>{count}</Text>
              <Text style={{ fontSize: 10, color: '#94A3B8', marginLeft: 6, width: 32, textAlign: 'right' }}>{pct}%</Text>
            </View>
            <View style={{ height: 4, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
              <View style={{ height: 4, borderRadius: 4, backgroundColor: cfg.color, width: `${pct}%` as any }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────
export function DoctorDashboardScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { orders, loading, refetch } = useOrders('doctor', profile?.id);
  const { width } = useWindowDimensions();

  const isDesktop = width >= 900;
  const isTablet  = width >= 600 && width < 900;

  const firstName  = profile?.full_name?.split(' ')[0] ?? '';

  // ── Computations ────────────────────────────────────────────────
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const total        = orders.length;
  const active       = orders.filter(o => o.status !== 'teslim_edildi').length;
  const overdueCount = orders.filter(o => isOrderOverdue(o.delivery_date, o.status)).length;
  const delivered    = orders.filter(o => o.status === 'teslim_edildi').length;
  const thisWeekDel  = orders.filter(o => {
    const d = new Date(o.delivery_date + 'T00:00:00');
    const diff = (d.getTime() - today.getTime()) / 86_400_000;
    return diff >= 0 && diff <= 7 && o.status !== 'teslim_edildi';
  }).length;
  const thisMonthNew = orders.filter(o => {
    const d = new Date(o.created_at); d.setHours(0, 0, 0, 0);
    return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  }).length;

  // Monthly trend (last 6 months)
  const monthly = useMemo(() => {
    const bars: { label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const y = d.getFullYear(), m = d.getMonth();
      bars.push({
        label: MONTHS_TR[m],
        count: orders.filter(o => {
          const c = new Date(o.created_at);
          return c.getFullYear() === y && c.getMonth() === m;
        }).length,
      });
    }
    return bars;
  }, [orders]);

  // Upcoming deliveries (next 7 days, not delivered)
  const upcoming = useMemo(() => orders
    .filter(o => o.status !== 'teslim_edildi')
    .filter(o => {
      const d = new Date(o.delivery_date + 'T00:00:00');
      return (d.getTime() - today.getTime()) / 86_400_000 >= 0;
    })
    .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
    .slice(0, 5), [orders]);

  // Pending design approvals (token-based, doctor must approve)
  const [pendingApprovals, setPendingApprovals] = useState<{
    id: string; order_number: string; token: string; patient_name: string | null;
  }[]>([]);

  const loadApprovals = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('work_orders')
      .select('id, order_number, patient_name, doctor_approval_token')
      .eq('doctor_id', profile.id)
      .eq('doctor_approval_status', 'pending')
      .not('doctor_approval_token', 'is', null);
    setPendingApprovals(((data ?? []) as any[]).map(r => ({
      id: r.id, order_number: r.order_number,
      token: r.doctor_approval_token, patient_name: r.patient_name,
    })));
  }, [profile?.id]);

  useEffect(() => { loadApprovals(); }, [loadApprovals]);

  // Recent orders
  const recent = useMemo(() => orders.slice().sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, 5), [orders]);

  // Work type breakdown
  const workTypes = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach(o => { if (o.work_type) map[o.work_type] = (map[o.work_type] ?? 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [orders]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={P} />}
      >
        {/* Hero */}
        <Hero
          firstName={firstName}
          clinicName={profile?.clinic_name ?? null}
          overdueCount={overdueCount}
          onPressOverdue={() => router.push('/(doctor)/orders' as any)}
        />

        {/* ── Onay Bekleyen Tasarımlar Banner ── */}
        {pendingApprovals.length > 0 && (
          <View style={apv.banner}>
            <View style={apv.iconWrap}>
              <Icon name={'clipboard' as any} size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={apv.title}>{pendingApprovals.length} tasarım onayınızı bekliyor</Text>
              <Text style={apv.sub}>
                {pendingApprovals.slice(0, 2).map(p =>
                  p.order_number + (p.patient_name ? ' · ' + p.patient_name : '')
                ).join(' · ')}
                {pendingApprovals.length > 2 && ` · +${pendingApprovals.length - 2} daha`}
              </Text>
            </View>
            <TouchableOpacity
              style={apv.cta}
              onPress={() => {
                if (pendingApprovals.length === 1) {
                  router.push(`/doctor-approval/${pendingApprovals[0].token}` as any);
                } else {
                  // Birden fazla varsa orders ekranına git, oradan seçsin
                  router.push('/(doctor)/orders' as any);
                }
              }}
              activeOpacity={0.85}
            >
              <Text style={apv.ctaText}>İncele</Text>
              <Icon name="arrow-right" size={14} color="#7C3AED" />
            </TouchableOpacity>
          </View>
        )}

        {/* KPI strip — mobile wrap 2x3, tablet/desktop single row */}
        <View style={[s.kpiStrip, (isDesktop || isTablet) && { flexWrap: 'nowrap' }]}>
          <KPICard label="Toplam"       value={total}         icon="package"       accent={P} />
          <KPICard label="Aktif"        value={active}        icon="activity"      accent={CLR.teal} />
          <KPICard label="Geciken"      value={overdueCount}  icon="alert-triangle" accent={overdueCount > 0 ? CLR.red : '#94A3B8'} />
          <KPICard label="Bu Hafta"     value={thisWeekDel}   icon="calendar"      accent={CLR.amber} />
          <KPICard label="Bu Ay Yeni"   value={thisMonthNew}  icon="trending-up"   accent={CLR.green} />
          <KPICard label="Tamamlanan"   value={delivered}     icon="check-circle"  accent="#64748B" />
        </View>

        {/* Quick Actions — primary first, then 3 secondary */}
        <Section text="Hızlı İşlemler" />
        <View style={s.qaGrid}>
          <QuickAction
            icon="zap"
            label="Yeni İş Emri"
            accent={P}
            primary
            onPress={() => router.push('/(doctor)/new-order' as any)}
          />
          <QuickAction
            icon="file-text"
            label="Siparişlerim"
            accent={CLR.teal}
            onPress={() => router.push('/(doctor)/orders' as any)}
          />
          <QuickAction
            icon="user"
            label="Profilim"
            accent={CLR.purple}
            onPress={() => router.push('/(doctor)/profile' as any)}
          />
        </View>

        {/* Main grid — responsive */}
        <View style={[s.grid, isDesktop && s.gridDesktop]}>

          {/* Col 1 — Trend chart + Work types */}
          <View style={[s.col, isDesktop && { flex: 1.4 }]}>
            <Section text="Sipariş Trendi" />
            <Card style={{ marginBottom: 20 }}>
              <CardHeader title="Son 6 Ay" icon="bar-chart" />
              {monthly.some(m => m.count > 0)
                ? <MonthlyChart data={monthly} />
                : <View style={s.emptyChart}>
                    <Text style={s.emptyText}>Henüz veri yok</Text>
                  </View>
              }
            </Card>

            {workTypes.length > 0 && (
              <>
                <Section text="İş Tipi Dağılımı" />
                <Card>
                  <CardHeader title="En çok kullanılan" icon="layers" />
                  <View style={{ paddingHorizontal: 18, paddingBottom: 18, gap: 10 }}>
                    {workTypes.map(([label, count], i) => {
                      const palette = [P, CLR.teal, CLR.purple, CLR.amber, CLR.green];
                      const max = Math.max(...workTypes.map(w => w[1]), 1);
                      const pct = Math.round((count / max) * 100);
                      return (
                        <View key={i}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: palette[i], marginRight: 8 }} />
                            <Text style={{ flex: 1, fontSize: 12, color: '#0F172A', fontWeight: '500' }} numberOfLines={1}>{label}</Text>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>{count}</Text>
                          </View>
                          <View style={{ height: 3, backgroundColor: '#F1F5F9', borderRadius: 4 }}>
                            <View style={{ height: 3, borderRadius: 4, backgroundColor: palette[i], width: `${pct}%` as any, opacity: 0.75 }} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              </>
            )}
          </View>

          {/* Col 2 — Upcoming + Status + Recent */}
          <View style={[s.col, isDesktop && { flex: 1 }]}>
            <Section text="Yaklaşan Teslimler" />
            <Card style={{ marginBottom: 20 }}>
              <CardHeader
                title="Önümüzdeki 7 gün"
                icon="clock"
                right={
                  <View style={s.chip}>
                    <Text style={s.chipText}>{upcoming.length}</Text>
                  </View>
                }
              />
              {upcoming.length === 0
                ? <Text style={s.emptyText}>Yaklaşan teslimat yok</Text>
                : upcoming.map((o, i) =>
                    <UpcomingRow
                      key={o.id}
                      order={o}
                      last={i === upcoming.length - 1}
                      onPress={() => router.push(`/(doctor)/order/${o.id}` as any)}
                    />
                  )
              }
            </Card>

            <Section text="Statü Dağılımı" />
            <Card style={{ marginBottom: 20 }}>
              <CardHeader title="Durum" icon="layers" />
              <StatusDist orders={orders} total={total} />
            </Card>

            <Section text="Son Siparişler" />
            <Card>
              <CardHeader
                title="Son 5"
                icon="file-text"
                right={
                  <TouchableOpacity onPress={() => router.push('/(doctor)/orders' as any)} activeOpacity={0.7}>
                    <Text style={s.link}>Tümünü Gör →</Text>
                  </TouchableOpacity>
                }
              />
              {recent.length === 0
                ? <Text style={s.emptyText}>Henüz sipariş yok</Text>
                : recent.map((o, i) => {
                    const cfg = STATUS_CONFIG[o.status as WorkOrderStatus];
                    const od  = isOrderOverdue(o.delivery_date, o.status);
                    const last = i === recent.length - 1;
                    return (
                      <TouchableOpacity
                        key={o.id}
                        onPress={() => router.push(`/(doctor)/order/${o.id}` as any)}
                        activeOpacity={0.75}
                        style={[rec.row, !last && rec.border]}
                      >
                        <View style={[rec.dot, { backgroundColor: od ? CLR.red : cfg.color }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={rec.title} numberOfLines={1}>{o.work_type || 'Belirtilmemiş'}</Text>
                          <Text style={rec.sub} numberOfLines={1}>
                            {o.patient_name || '—'} · #{o.order_number}
                          </Text>
                        </View>
                        <Text style={[rec.date, od && { color: CLR.red, fontWeight: '700' }]}>
                          {new Date(o.delivery_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
              }
            </Card>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* FAB — only on mobile */}
      {!isDesktop && (
        <TouchableOpacity
          style={s.fab}
          onPress={() => router.push('/(doctor)/new-order' as any)}
          activeOpacity={0.85}
        >
          <Icon name="plus" size={24} color="#FFFFFF" strokeWidth={2.6} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

// ── Recent order row ──────────────────────────────────────────────
const rec = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 10 },
  border: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  dot:    { width: 7, height: 7, borderRadius: 4 },
  title:  { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  sub:    { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  date:   { fontSize: 11, fontWeight: '600', color: '#64748B' },
});

// ── Root styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: { padding: 20, paddingBottom: 120, maxWidth: 1400, alignSelf: 'stretch' },

  kpiStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },

  qaGrid: { flexDirection: 'row', gap: 10, marginBottom: 24 },

  grid:        { gap: 20 },
  gridDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  col:         { gap: 0 },

  chip:      { backgroundColor: P_TINT_12, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, minWidth: 26, alignItems: 'center' },
  chipText:  { fontSize: 11, fontWeight: '800', color: P_DARK },

  link:      { fontSize: 12, color: P, fontWeight: '700' },
  emptyText: { fontSize: 13, color: '#94A3B8', padding: 24, textAlign: 'center' },
  emptyChart:{ height: 160, alignItems: 'center', justifyContent: 'center' },

  fab: {
    position: 'absolute', right: 20, bottom: 100,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: P,
    alignItems: 'center', justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: `0 4px 8px ${hexA(P, 0.18)}, 0 14px 36px ${hexA(P, 0.42)}` } as any)
      : { shadowColor: P, shadowOpacity: 0.40, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 }),
  },
});

// ─── Pending approvals banner ────────────────────────────────────────────
const apv = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    marginHorizontal: 16, marginTop: 4, marginBottom: -4,
    borderRadius: 16,
    backgroundColor: '#7C3AED',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 8px 20px rgba(124,58,237,0.30)' } as any)
      : { shadowColor: '#7C3AED', shadowOpacity: 0.30, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 }),
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center', justifyContent: 'center',
  },
  title:  { fontSize: 13, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.1 },
  sub:    { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  ctaText: { fontSize: 12, fontWeight: '800', color: '#7C3AED' },
});
