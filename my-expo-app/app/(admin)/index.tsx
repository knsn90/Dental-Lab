import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  useWindowDimensions, ActivityIndicator, Animated, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { BlurFade } from '../../core/ui/BlurFade';

const K  = '#0F172A';
const BG = '#F8FAFC';

const CLR = {
  green:  '#16A34A', greenBg:  '#DCFCE7',
  orange: '#D97706', orangeBg: '#FEF3C7',
  red:    '#EF4444', redBg:    '#FEF2F2',
  purple: '#7C3AED', purpleBg: '#EDE9FE',
  blue:   '#2563EB', blueBg:   '#EFF6FF',
  teal:   '#0D9488', tealBg:   '#CCFBF1',
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  alindi:          { label: 'Alındı',         color: '#64748B', bg: '#F1F5F9' },
  uretimde:        { label: 'Üretimde',        color: CLR.orange, bg: CLR.orangeBg },
  kalite_kontrol:  { label: 'Kalite Kontrol',  color: CLR.purple, bg: CLR.purpleBg },
  teslimata_hazir: { label: 'Teslimata Hazır', color: CLR.green,  bg: CLR.greenBg },
  teslim_edildi:   { label: 'Teslim Edildi',   color: '#94A3B8',  bg: '#F8FAFC' },
};
const STATUS_KEYS = ['alindi','uretimde','kalite_kontrol','teslimata_hazir','teslim_edildi'];

const MONTHS_TR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

function getTodayLabel() {
  const now = new Date();
  const days = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]}`;
}
function todayStr() { return new Date().toISOString().split('T')[0]; }
function fmtDate(date: string) {
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
}
function initials(name?: string | null) {
  if (!name) return '—';
  return name.trim().split(/\s+/).slice(0,2).map(p => p[0]?.toUpperCase() ?? '').join('') || '—';
}
function fmtMoney(n: number) {
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `₺${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
  }
}

/** Convert 6-char hex + 0-1 alpha → rgba() string (safe for all platforms) */
function hexA(hex: string, alpha: number) {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  } catch { return hex; }
}

// ── SVG Icons (Lucide-style) ──────────────────────────────────────────
type IconName =
  | 'arrow-up-right' | 'plus' | 'receipt' | 'activity'
  | 'users' | 'user' | 'trending-up' | 'alert-triangle'
  | 'package' | 'calendar' | 'bar-chart' | 'credit-card'
  | 'clock' | 'check-circle' | 'layers';

function Icon({ name, size = 24, color = '#0F172A', strokeWidth = 1.75 }: {
  name: IconName; size?: number; color?: string; strokeWidth?: number;
}) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (name) {
    case 'arrow-up-right':
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M7 17L17 7" {...p}/><Path d="M7 7H17V17" {...p}/></Svg>;
    case 'plus':
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" {...p}/></Svg>;
    case 'receipt':
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" {...p}/><Path d="M16 8H8M16 12H8M13 16H8" {...p}/></Svg>;
    case 'activity':
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="22 12 18 12 15 21 9 3 6 12 2 12" {...p}/></Svg>;
    case 'users':
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...p}/><Circle cx="9" cy="7" r="4" {...p}/><Path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" {...p}/></Svg>;
    case 'user':
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" {...p}/><Circle cx="12" cy="7" r="4" {...p}/></Svg>;
    case 'trending-up':
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="23 6 13.5 15.5 8.5 10.5 1 18" {...p}/><Polyline points="17 6 23 6 23 12" {...p}/></Svg>;
    case 'alert-triangle':
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" {...p}/><Line x1="12" y1="9" x2="12" y2="13" {...p}/><Line x1="12" y1="17" x2="12.01" y2="17" {...p}/></Svg>;
    case 'package':
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" {...p}/><Polyline points="3.27 6.96 12 12.01 20.73 6.96" {...p}/><Line x1="12" y1="22.08" x2="12" y2="12" {...p}/></Svg>;
    case 'calendar':
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="8 2 8 6" {...p}/><Polyline points="16 2 16 6" {...p}/><Path d="M3 9h18M21 10V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7" {...p}/><Path d="M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 22l-1.5-1.5" {...p}/></Svg>;
    case 'bar-chart':
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Line x1="12" y1="20" x2="12" y2="10" {...p}/><Line x1="18" y1="20" x2="18" y2="4" {...p}/><Line x1="6" y1="20" x2="6" y2="16" {...p}/></Svg>;
    case 'credit-card':
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="2 6 2 18 22 18 22 6 2 6" {...p}/><Line x1="2" y1="10" x2="22" y2="10" {...p}/></Svg>;
    case 'clock':
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="12" cy="12" r="10" {...p}/><Polyline points="12 6 12 12 16 14" {...p}/></Svg>;
    case 'check-circle':
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" {...p}/><Polyline points="22 4 12 14.01 9 11.01" {...p}/></Svg>;
    case 'layers':
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="12 2 2 7 12 12 22 7 12 2" {...p}/><Polyline points="2 17 12 22 22 17" {...p}/><Polyline points="2 12 12 17 22 12" {...p}/></Svg>;
    default: return null;
  }
}

// ── Status Badge ──────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { label: status, color: '#64748B', bg: '#F1F5F9' };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: c.bg, gap: 4, alignSelf: 'flex-start' }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.color }} />
      <Text style={{ fontSize: 10, fontWeight: '600', color: c.color }}>{c.label}</Text>
    </View>
  );
}

// ── Quick Actions Bento ───────────────────────────────────────────────
interface QAItem {
  icon: IconName; label: string; onPress: () => void;
  accent: string; accentBg: string; primary?: boolean;
}

function BentoCard({ item, style, iconSize = 24, showArrow = true }: {
  item: QAItem; style?: any; iconSize?: number; showArrow?: boolean;
}) {
  const scaleRef = useRef(new Animated.Value(1)).current;
  const onPressIn  = () => Animated.spring(scaleRef, { toValue: 0.95, useNativeDriver: true, damping: 15 }).start();
  const onPressOut = () => Animated.spring(scaleRef, { toValue: 1,    useNativeDriver: true, damping: 15 }).start();

  return (
    <TouchableOpacity onPress={item.onPress} onPressIn={onPressIn} onPressOut={onPressOut} activeOpacity={1} style={[{ flex: 1 }, style]}>
      <Animated.View style={[bento.card, item.primary && bento.cardPrimary, { transform: [{ scale: scaleRef }] }]}>
        {item.primary && <View style={bento.primarySheen} pointerEvents="none" />}
        {showArrow && (
          <View style={[bento.arrowBadge, item.primary && bento.arrowBadgePrimary]}>
            <Icon name="arrow-up-right" size={11} color={item.primary ? 'rgba(255,255,255,0.6)' : '#CBD5E1'} strokeWidth={2.5} />
          </View>
        )}
        <View style={[bento.iconWrap, { backgroundColor: item.primary ? 'rgba(255,255,255,0.14)' : item.accentBg }]}>
          <Icon name={item.icon} size={iconSize} color={item.primary ? '#FFFFFF' : item.accent} strokeWidth={1.75} />
        </View>
        <Text style={[bento.label, item.primary && bento.labelPrimary]} numberOfLines={1}>{item.label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

function QuickActionsSection({ onNewOrder, onUsers, onDoctors, onOrders, onProfile }: {
  onNewOrder: () => void; onUsers: () => void; onDoctors: () => void;
  onOrders: () => void; onProfile: () => void;
}) {
  const items: QAItem[] = [
    { icon: 'plus',        label: 'Yeni İş',      onPress: onNewOrder, accent: '#FFFFFF', accentBg: 'rgba(255,255,255,0.14)', primary: true },
    { icon: 'receipt',     label: 'Siparişler',   onPress: onOrders,   accent: CLR.blue,  accentBg: CLR.blueBg },
    { icon: 'activity',    label: 'Hekimler',     onPress: onDoctors,  accent: CLR.green, accentBg: CLR.greenBg },
    { icon: 'users',       label: 'Kullanıcılar', onPress: onUsers,    accent: CLR.purple,accentBg: CLR.purpleBg },
    { icon: 'user',        label: 'Profil',       onPress: onProfile,  accent: CLR.orange,accentBg: CLR.orangeBg },
  ];
  return (
    <View style={bento.grid}>
      <View style={bento.row}>
        <BentoCard item={items[0]} style={{ flex: 3 }} iconSize={28} />
        <View style={bento.col}>
          <BentoCard item={items[1]} showArrow={false} />
          <BentoCard item={items[2]} showArrow={false} />
        </View>
      </View>
      <View style={bento.row}>
        <BentoCard item={items[3]} />
        <BentoCard item={items[4]} />
      </View>
    </View>
  );
}

const bento = StyleSheet.create({
  grid: { gap: 10, marginBottom: 0 },
  row:  { flexDirection: 'row', gap: 10 },
  col:  { flex: 2, gap: 10 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, gap: 12,
    minHeight: 100, justifyContent: 'space-between', overflow: 'hidden', position: 'relative',
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(15,23,42,0.05), 0 4px 16px rgba(15,23,42,0.03)' } as any,
      default: { shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    }),
  },
  cardPrimary:      { backgroundColor: K, minHeight: 200 },
  primarySheen:     { position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.06)' },
  arrowBadge:       { position: 'absolute', top: 14, right: 14, width: 22, height: 22, borderRadius: 11, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  arrowBadgePrimary:{ backgroundColor: 'rgba(255,255,255,0.12)' },
  iconWrap:         { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label:            { fontSize: 12, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 },
  labelPrimary:     { color: '#FFFFFF', fontSize: 14 },
});

// ── KPI Card (top strip) ──────────────────────────────────────────────
function KPICard({ label, value, icon, accent, trend }: {
  label: string; value: string | number; icon: IconName; accent: string; trend?: string;
}) {
  return (
    <View style={kpi.card}>
      <View style={[kpi.iconWrap, { backgroundColor: hexA(accent, 0.09) }]}>
        <Icon name={icon} size={18} color={accent} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={kpi.label} numberOfLines={1}>{label}</Text>
        <Text style={[kpi.value, { color: accent === K ? '#0F172A' : accent }]}>{value}</Text>
        {trend && (
          <View style={kpi.trendRow}>
            <Icon name="trending-up" size={9} color={CLR.green} strokeWidth={2.5} />
            <Text style={kpi.trendText}>{trend}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
const kpi = StyleSheet.create({
  card: {
    flex: 1, minWidth: 140,
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  iconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label:    { fontSize: 10, color: '#94A3B8', fontWeight: '600', letterSpacing: 0.3, marginBottom: 4 },
  value:    { fontSize: 22, fontWeight: '800', letterSpacing: -0.6, lineHeight: 26 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  trendText:{ fontSize: 9, color: CLR.green, fontWeight: '700' },
});

// ── Card wrap ─────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[card.wrap, style]}>{children}</View>;
}
function CardHeader({ title, right, icon }: { title: string; right?: React.ReactNode; icon?: IconName }) {
  return (
    <View style={card.header}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon && <Icon name={icon} size={15} color="#94A3B8" strokeWidth={1.75} />}
        <Text style={card.title}>{title}</Text>
      </View>
      {right}
    </View>
  );
}
const card = StyleSheet.create({
  wrap: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
});

// ── Section Title ─────────────────────────────────────────────────────
function SectionTitle({ text }: { text: string }) {
  return <Text style={sec.text}>{text}</Text>;
}
const sec = StyleSheet.create({
  text: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10, marginTop: 2 },
});

// ── Animated Bar ──────────────────────────────────────────────────────
function AnimatedBar({ pct, isActive, isHighest, count, label, delay }: {
  pct: number; isActive: boolean; isHighest: boolean; count: number; label: string; delay: number;
}) {
  const heightAnim  = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(heightAnim, { toValue: pct, damping: 14, stiffness: 120, delay, useNativeDriver: false }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, delay, useNativeDriver: false }),
    ]).start();
  }, [pct]);

  const animH = heightAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <Animated.View style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', opacity: opacityAnim }}>
      {isHighest && count > 0 && (
        <View style={ch.tooltipWrap}>
          <View style={[ch.tooltipBubble, isActive && ch.tooltipBubbleActive]}>
            <Text style={ch.tooltipText}>{count}</Text>
          </View>
          <View style={[ch.tooltipArrow, isActive && ch.tooltipArrowActive]} />
        </View>
      )}
      {!isHighest && count > 0 && <Text style={[ch.barLabel, isActive && { color: K }]}>{count}</Text>}
      <View style={ch.track}>
        <Animated.View style={[ch.fill, { height: animH }, isActive ? ch.fillActive : ch.fillInactive]}>
          <View style={ch.fillGloss} />
        </Animated.View>
      </View>
      <Text style={[ch.monthLabel, isActive && ch.monthLabelActive]}>{label}</Text>
    </Animated.View>
  );
}

function MonthlyChart({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const highestIdx = data.reduce((best, d, i) => d.count > data[best].count ? i : best, 0);
  const lastIdx = data.length - 1;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const id = 'candy-stripe-admin';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = `.candy-stripe::before{content:'';position:absolute;inset:0;background-image:repeating-linear-gradient(135deg,rgba(15,23,42,0.04) 0px,rgba(15,23,42,0.04) 1px,transparent 1px,transparent 8px);border-radius:10px;pointer-events:none;}`;
    document.head.appendChild(el);
  }, []);

  return (
    <View style={ch.container}>
      {data.map((d, i) => (
        <AnimatedBar key={i} pct={Math.max((d.count / max) * 100, 4)}
          isActive={i === lastIdx} isHighest={i === highestIdx}
          count={d.count} label={d.label} delay={i * 60} />
      ))}
    </View>
  );
}

const ch = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 8, paddingHorizontal: 20, paddingBottom: 20, paddingTop: 36 },
  track: { width: '100%', flex: 1, justifyContent: 'flex-end', borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(15,23,42,0.05)', position: 'relative' },
  fill: { width: '100%', borderRadius: 10, overflow: 'hidden', position: 'relative' },
  fillActive:   { backgroundColor: K },
  fillInactive: { backgroundColor: 'rgba(15,23,42,0.15)' },
  fillGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)' },
  barLabel:  { fontSize: 9, fontWeight: '700', color: '#94A3B8', marginBottom: 5 },
  monthLabel:{ fontSize: 9, color: '#94A3B8', marginTop: 8, fontWeight: '500', textAlign: 'center' },
  monthLabelActive: { color: K, fontWeight: '800' },
  tooltipWrap:   { alignItems: 'center', marginBottom: 6, position: 'absolute', top: -32, left: 0, right: 0 },
  tooltipBubble: { backgroundColor: 'rgba(15,23,42,0.18)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  tooltipBubbleActive: { backgroundColor: K },
  tooltipText:   { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  tooltipArrow:  { width: 6, height: 6, borderRadius: 1, backgroundColor: 'rgba(15,23,42,0.18)', transform: [{ rotate: '45deg' }], marginTop: -3 },
  tooltipArrowActive: { backgroundColor: K },
});

// ── Finance Card ──────────────────────────────────────────────────────
function FinanceCard({ monthly, pending, paid }: { monthly: number; pending: number; paid: number }) {
  return (
    <Card>
      <CardHeader title="Finansal Özet" icon="credit-card" />
      <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 14 }}>
        {/* Monthly Revenue */}
        <View style={fin.row}>
          <View style={[fin.dot, { backgroundColor: CLR.green }]} />
          <View style={{ flex: 1 }}>
            <Text style={fin.rowLabel}>Bu Ay Tahsilat</Text>
            <Text style={[fin.rowValue, { color: CLR.green }]}>{fmtMoney(monthly)}</Text>
          </View>
        </View>
        <View style={fin.divider} />
        {/* Pending */}
        <View style={fin.row}>
          <View style={[fin.dot, { backgroundColor: CLR.orange }]} />
          <View style={{ flex: 1 }}>
            <Text style={fin.rowLabel}>Bekleyen Fatura</Text>
            <Text style={[fin.rowValue, { color: CLR.orange }]}>{fmtMoney(pending)}</Text>
          </View>
        </View>
        <View style={fin.divider} />
        {/* Paid count */}
        <View style={fin.row}>
          <View style={[fin.dot, { backgroundColor: K }]} />
          <View style={{ flex: 1 }}>
            <Text style={fin.rowLabel}>Ödenen Fatura Adedi</Text>
            <Text style={fin.rowValue}>{paid}</Text>
          </View>
        </View>
      </View>
    </Card>
  );
}
const fin = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot:      { width: 8, height: 8, borderRadius: 4 },
  rowLabel: { fontSize: 11, color: '#64748B', fontWeight: '500', marginBottom: 2 },
  rowValue: { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.4 },
  divider:  { height: 1, backgroundColor: '#F1F5F9' },
});

// ── Upcoming Deliveries Card ──────────────────────────────────────────
function UpcomingCard({ orders }: { orders: any[] }) {
  return (
    <Card>
      <CardHeader title="Yaklaşan Teslimler" icon="calendar"
        right={<View style={{ backgroundColor: CLR.orangeBg, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: CLR.orange }}>{orders.length} sipariş</Text>
        </View>}
      />
      {orders.length === 0
        ? <Text style={{ fontSize: 12, color: '#94A3B8', padding: 20, textAlign: 'center' }}>Yaklaşan teslimat yok</Text>
        : orders.slice(0, 5).map((o, i) => {
            const isLast = i === Math.min(orders.length, 5) - 1;
            const daysLeft = Math.ceil((new Date(o.delivery_date).getTime() - Date.now()) / 86400000);
            return (
              <View key={o.id} style={[upc.row, !isLast && { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }]}>
                <View style={[upc.dayBadge, daysLeft <= 1 && { backgroundColor: CLR.redBg }]}>
                  <Text style={[upc.dayNum, daysLeft <= 1 && { color: CLR.red }]}>{daysLeft}</Text>
                  <Text style={[upc.dayLabel, daysLeft <= 1 && { color: CLR.red }]}>gün</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={upc.orderNo} numberOfLines={1}>#{o.order_number}</Text>
                  <Text style={upc.doctorName} numberOfLines={1}>{o.doctor_name ?? '—'}</Text>
                </View>
                <StatusBadge status={o.status} />
              </View>
            );
          })
      }
    </Card>
  );
}
const upc = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 12 },
  dayBadge:  { width: 40, height: 40, borderRadius: 10, backgroundColor: CLR.orangeBg, alignItems: 'center', justifyContent: 'center' },
  dayNum:    { fontSize: 16, fontWeight: '800', color: CLR.orange, lineHeight: 18 },
  dayLabel:  { fontSize: 8, fontWeight: '600', color: CLR.orange },
  orderNo:   { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  doctorName:{ fontSize: 11, color: '#64748B', marginTop: 1 },
});

// ── Status Distribution ───────────────────────────────────────────────
function StatusDistCard({ byStatus }: { byStatus: { label: string; count: number; key: string }[] }) {
  const total = byStatus.reduce((s, x) => s + x.count, 0) || 1;
  return (
    <Card>
      <CardHeader title="Statü Dağılımı" icon="layers" />
      <View style={{ paddingHorizontal: 20, paddingBottom: 18, gap: 12 }}>
        {byStatus.map(item => {
          const pct = Math.round((item.count / total) * 100);
          const cfg = STATUS_CFG[item.key];
          return (
            <View key={item.key}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: cfg?.color ?? K, marginRight: 8 }} />
                <Text style={{ flex: 1, fontSize: 11, color: '#64748B', fontWeight: '500' }}>{item.label}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>{item.count}</Text>
                <Text style={{ fontSize: 10, color: '#94A3B8', marginLeft: 6, width: 28, textAlign: 'right' }}>{pct}%</Text>
              </View>
              <View style={{ height: 4, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ height: 4, borderRadius: 4, backgroundColor: cfg?.color ?? K, width: `${pct}%` as any }} />
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

// ── Work Type Card ────────────────────────────────────────────────────
function WorkTypeCard({ data }: { data: { label: string; count: number }[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.count), 1);
  const palette = [K, CLR.blue, CLR.purple, CLR.teal, CLR.orange];
  return (
    <Card>
      <CardHeader title="İş Tipi Dağılımı" icon="bar-chart" />
      <View style={{ paddingHorizontal: 20, paddingBottom: 18, gap: 10 }}>
        {data.slice(0, 5).map((w, i) => (
          <View key={i}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: palette[i], marginRight: 8 }} />
              <Text style={{ flex: 1, fontSize: 11, color: '#0F172A', fontWeight: '500' }} numberOfLines={1}>{w.label}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>{w.count}</Text>
            </View>
            <View style={{ height: 3, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
              <View style={{ height: 3, borderRadius: 4, backgroundColor: palette[i], width: `${Math.round((w.count / max) * 100)}%` as any, opacity: 0.7 }} />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { width }  = useWindowDimensions();
  const isDesktop  = width >= 900;
  const router     = useRouter();

  const [loading, setLoading]           = useState(true);
  const [totalOrders, setTotalOrders]   = useState(0);
  const [todayOrders, setTodayOrders]   = useState(0);
  const [overdueOrders, setOverdue]     = useState(0);
  const [totalDoctors, setDoctors]      = useState(0);
  const [totalLabUsers, setLabUsers]    = useState(0);
  const [todayDelivery, setTodayDelivery] = useState(0);
  const [byStatus, setByStatus]         = useState<{ label: string; count: number; key: string }[]>([]);
  const [byWorkType, setByWorkType]     = useState<{ label: string; count: number }[]>([]);
  const [monthly, setMonthly]           = useState<{ label: string; count: number }[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [upcoming, setUpcoming]         = useState<any[]>([]);
  const [hovered, setHovered]           = useState<string | null>(null);

  // Finance state
  const [finMonthly, setFinMonthly] = useState(0);
  const [finPending, setFinPending] = useState(0);
  const [finPaidCount, setFinPaidCount] = useState(0);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const today = todayStr();
      const in3Days = new Date(); in3Days.setDate(in3Days.getDate() + 3);
      const in3DaysStr = in3Days.toISOString().split('T')[0];

      const [ordersRes, profilesRes, recentRes, upcomingRes] = await Promise.all([
        supabase.from('work_orders').select('status, delivery_date, created_at, work_type, doctor:doctor_id(full_name)'),
        supabase.from('profiles').select('user_type').neq('user_type', 'admin'),
        supabase.from('work_orders').select('id, order_number, work_type, status, delivery_date, is_urgent, doctor:doctor_id(full_name)').order('created_at', { ascending: false }).limit(8),
        supabase.from('work_orders').select('id, order_number, status, delivery_date, doctor:doctor_id(full_name)').gte('delivery_date', today).lte('delivery_date', in3DaysStr).neq('status', 'teslim_edildi').order('delivery_date'),
      ]);

      const orders   = (ordersRes.data ?? []) as any[];
      const profiles = profilesRes.data ?? [];
      const recent   = (recentRes.data ?? []) as any[];
      const upcomingData = (upcomingRes.data ?? []) as any[];

      let todayCount = 0, overdueCount = 0, todayDel = 0;
      const statusMap: Record<string, number> = {};
      const wtMap: Record<string, number>     = {};
      const monthMap: Record<string, number>  = {};

      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        monthMap[`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`] = 0;
      }

      for (const o of orders) {
        if (o.created_at?.startsWith(today)) todayCount++;
        if (o.delivery_date < today && o.status !== 'teslim_edildi') overdueCount++;
        if (o.delivery_date === today && o.status !== 'teslim_edildi') todayDel++;
        statusMap[o.status] = (statusMap[o.status] ?? 0) + 1;
        if (o.work_type) wtMap[o.work_type] = (wtMap[o.work_type] ?? 0) + 1;
        if (o.created_at) {
          const d = new Date(o.created_at);
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
          if (key in monthMap) monthMap[key] += 1;
        }
      }

      setTotalOrders(orders.length);
      setTodayOrders(todayCount);
      setOverdue(overdueCount);
      setTodayDelivery(todayDel);
      setDoctors(profiles.filter((p: any) => p.user_type === 'doctor').length);
      setLabUsers(profiles.filter((p: any) => ['lab','lab_user','mesul_mudur'].includes(p.user_type)).length);

      setByStatus(STATUS_KEYS.map(k => ({ key: k, label: STATUS_CFG[k]?.label ?? k, count: statusMap[k] ?? 0 })));
      setByWorkType(Object.entries(wtMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([label,count])=>({label,count})));
      setMonthly(Object.entries(monthMap).map(([key,count])=>({ label: MONTHS_TR[parseInt(key.split('-')[1])-1], count })));
      setRecentOrders(recent.map(o => ({
        id: o.id, order_number: o.order_number, work_type: o.work_type,
        status: o.status, delivery_date: o.delivery_date, is_urgent: o.is_urgent ?? false,
        doctor_name: (o.doctor as any)?.full_name ?? '—',
      })));
      setUpcoming(upcomingData.map(o => ({
        id: o.id, order_number: o.order_number, status: o.status,
        delivery_date: o.delivery_date, doctor_name: (o.doctor as any)?.full_name ?? '—',
      })));

      // Finance data (with fallback)
      try {
        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
        const [invRes, pendRes] = await Promise.all([
          supabase.from('invoices').select('total_amount, status').gte('created_at', monthStart.toISOString()),
          supabase.from('invoices').select('total_amount').eq('status', 'sent'),
        ]);
        if (invRes.data) {
          const paid = invRes.data.filter((i:any) => i.status === 'paid');
          setFinMonthly(paid.reduce((s:number, i:any) => s + (i.total_amount ?? 0), 0));
          setFinPaidCount(paid.length);
        }
        if (pendRes.data) {
          setFinPending(pendRes.data.reduce((s:number, i:any) => s + (i.total_amount ?? 0), 0));
        }
      } catch { /* invoices table may not exist */ }
    } catch (e) {
      console.error('AdminDashboard loadStats error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  const today = todayStr();

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── Welcome + Alert ─────────────────────────────────────── */}
        <View style={[s.heroRow, isDesktop && s.heroRowDesktop]}>
          <View style={[s.welcomeCard, isDesktop && { flex: 1 }]}>
            <BlurFade duration={600} delay={0} yOffset={8}>
              <Text style={s.welcomeGreet}>Hoş geldiniz,</Text>
            </BlurFade>
            <BlurFade duration={600} delay={80} yOffset={8}>
              <Text style={s.welcomeDate}>{getTodayLabel()}</Text>
            </BlurFade>
            <BlurFade duration={600} delay={160} yOffset={8}>
              <Text style={s.welcomeSub}>Yönetici paneline hoş geldiniz. Genel özetiniz hazır.</Text>
            </BlurFade>
          </View>

          {overdueOrders > 0 && (
            <View style={[s.alertCard, isDesktop && { width: 280 }]}>
              <View style={s.alertDecorIcon} pointerEvents="none">
                <Icon name="alert-triangle" size={180} color={CLR.red} strokeWidth={0.6} />
              </View>
              <View style={s.alertTop}><Text style={s.alertPill}>KRİTİK</Text></View>
              <Text style={s.alertTitle}><Text style={s.alertCount}>{overdueOrders}</Text>{' geciken sipariş'}</Text>
              <Text style={s.alertSub}>Acil müdahale gerektiren vakalar.</Text>
              <TouchableOpacity style={s.alertBtn} onPress={() => router.push('/(admin)/orders' as any)} activeOpacity={0.9}>
                <Text style={s.alertBtnText}>Detayları Gör</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── KPI Strip ───────────────────────────────────────────── */}
        <View style={[s.kpiStrip, isDesktop && s.kpiStripDesktop]}>
          <KPICard label="TOPLAM SİPARİŞ" value={totalOrders.toLocaleString('tr-TR')} icon="package" accent={K} trend="+12%" />
          <KPICard label="BUGÜN YENİ"    value={todayOrders}   icon="plus"        accent={CLR.blue} />
          <KPICard label="GECİKEN"       value={overdueOrders} icon="clock"       accent={overdueOrders > 0 ? CLR.red : '#94A3B8'} />
          <KPICard label="BUGÜN TESLİM"  value={todayDelivery} icon="check-circle" accent={CLR.green} />
          <KPICard label="KAYITLI HEKİM" value={totalDoctors}  icon="activity"    accent={CLR.teal} />
          <KPICard label="LAB KULLANICI" value={totalLabUsers} icon="users"       accent={CLR.purple} />
        </View>

        {loading ? (
          <View style={s.loadingBox}><ActivityIndicator color={K} size="large" /></View>
        ) : (
          <View style={[s.mainGrid, isDesktop && s.mainGridDesktop]}>

            {/* ── Column 1: Quick Actions + Status ─────────────── */}
            <View style={[s.col1, isDesktop && { flex: 1.1 }]}>
              <SectionTitle text="Hızlı İşlemler" />
              <QuickActionsSection
                onNewOrder={() => router.push('/(admin)/new-order' as any)}
                onUsers={() => router.push('/(admin)/users' as any)}
                onDoctors={() => router.push('/(admin)/doctors' as any)}
                onOrders={() => router.push('/(admin)/orders' as any)}
                onProfile={() => router.push('/(admin)/profile' as any)}
              />
              <View style={{ height: 20 }} />
              <SectionTitle text="Statü Dağılımı" />
              <StatusDistCard byStatus={byStatus} />
            </View>

            {/* ── Column 2: Chart + Recent Orders ──────────────── */}
            <View style={[s.col2, isDesktop && { flex: 2 }]}>
              <SectionTitle text="Sipariş Trendi" />
              <Card style={{ marginBottom: 20 }}>
                <CardHeader title="Son 6 Ay" icon="bar-chart"
                  right={<View style={s.chip}><Text style={s.chipText}>Aylık</Text></View>}
                />
                {monthly.length > 0
                  ? <MonthlyChart data={monthly} />
                  : <View style={{ height: 140, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#94A3B8', fontSize: 13 }}>Veri yok</Text>
                    </View>
                }
              </Card>

              <SectionTitle text="Son Siparişler" />
              <Card>
                <CardHeader title="Tüm Siparişler"
                  right={<TouchableOpacity onPress={() => router.push('/(admin)/orders' as any)}><Text style={s.linkBtn}>Tümünü Gör →</Text></TouchableOpacity>}
                />
                <View style={s.tableHead}>
                  <Text style={[s.thCell, { flex: 1.2 }]}>Sipariş No</Text>
                  <Text style={[s.thCell, { flex: 2 }]}>Hekim</Text>
                  {isDesktop && <Text style={[s.thCell, { flex: 2 }]}>İş Tipi</Text>}
                  <Text style={[s.thCell, { flex: 1.4 }]}>Statü</Text>
                  {isDesktop && <Text style={[s.thCell, { flex: 1, textAlign: 'right' }]}>Teslim</Text>}
                </View>
                {recentOrders.length === 0
                  ? <Text style={s.loadingText}>Henüz sipariş yok</Text>
                  : recentOrders.map((order, idx) => {
                      const overdue = order.delivery_date < today && order.status !== 'teslim_edildi';
                      const isLast  = idx === recentOrders.length - 1;
                      return (
                        <TouchableOpacity
                          key={order.id}
                          style={[s.tableRow, !isLast && s.rowBorder, overdue && s.tableRowOverdue, hovered === order.id && s.tableRowHover]}
                          onPress={() => router.push(`/(admin)/order/${order.id}` as any)}
                          activeOpacity={0.9}
                          // @ts-ignore
                          onMouseEnter={() => setHovered(order.id)}
                          onMouseLeave={() => setHovered(null)}
                        >
                          <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={s.orderNo} numberOfLines={1}>#{order.order_number}</Text>
                            {order.is_urgent && <Text style={s.urgentTag}>ACİL</Text>}
                          </View>
                          <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={s.avatar}><Text style={s.avatarText}>{initials(order.doctor_name)}</Text></View>
                            <Text style={s.cellMain} numberOfLines={1}>{order.doctor_name}</Text>
                          </View>
                          {isDesktop && <Text style={[s.cellSub, { flex: 2 }]} numberOfLines={1}>{order.work_type || '—'}</Text>}
                          <View style={{ flex: 1.4 }}><StatusBadge status={order.status} /></View>
                          {isDesktop && (
                            <Text style={[s.cellDate, { flex: 1, textAlign: 'right' }, overdue && s.cellDateOverdue]}>
                              {fmtDate(order.delivery_date)}
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })
                }
              </Card>
            </View>

            {/* ── Column 3: Finance + Upcoming + Work Type ─────── */}
            <View style={[s.col3, isDesktop && { flex: 1.1 }]}>
              <SectionTitle text="Finansal Özet" />
              <FinanceCard monthly={finMonthly} pending={finPending} paid={finPaidCount} />

              <View style={{ height: 20 }} />
              <SectionTitle text="Yaklaşan Teslimler" />
              <UpcomingCard orders={upcoming} />

              {byWorkType.length > 0 && (
                <>
                  <View style={{ height: 20 }} />
                  <SectionTitle text="İş Tipi Analizi" />
                  <WorkTypeCard data={byWorkType} />
                </>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: { padding: 20, paddingBottom: 40, maxWidth: 1600, alignSelf: 'stretch' },

  // Hero
  heroRow:        { gap: 16, marginBottom: 20 },
  heroRowDesktop: { flexDirection: 'row' },
  welcomeCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 28,
    borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden',
  },
  welcomeGreet: { fontSize: 26, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  welcomeDate:  { fontSize: 26, fontWeight: '300', color: K, letterSpacing: -0.5, marginTop: 2 },
  welcomeSub:   { fontSize: 13, color: '#64748B', marginTop: 8 },

  alertCard: {
    backgroundColor: '#FFF1F2', borderRadius: 16, padding: 20, gap: 8,
    position: 'relative', overflow: 'hidden',
  },
  alertDecorIcon: { position: 'absolute', top: -30, left: -30, opacity: 0.08 } as any,
  alertTop:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'flex-end' },
  alertPill: { fontSize: 10, fontWeight: '800', color: CLR.red, backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, letterSpacing: 0.8 },
  alertTitle:{ fontSize: 18, fontWeight: '800', color: '#7F1D1D', marginTop: 6, letterSpacing: -0.4 },
  alertCount:{ fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  alertSub:  { fontSize: 12, color: '#B91C1C' },
  alertBtn:  { marginTop: 6, backgroundColor: CLR.red, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  alertBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  // KPI strip
  kpiStrip:        { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  kpiStripDesktop: { flexWrap: 'nowrap' },

  // 3-col grid
  mainGrid:        { gap: 20 },
  mainGridDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  col1: { gap: 0 },
  col2: { gap: 0 },
  col3: { gap: 0 },

  // Chips
  chip:     { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 10, color: '#64748B', fontWeight: '600' },

  linkBtn: { fontSize: 12, color: K, fontWeight: '700' },

  // Table
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFBFC',
  },
  thCell: { fontSize: 9, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.6 },

  tableRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 10, minHeight: 52 },
  tableRowHover:   { backgroundColor: '#FAFBFD' },
  tableRowOverdue: { backgroundColor: '#FEF2F2' },
  rowBorder:       { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },

  orderNo:   { fontSize: 12, fontWeight: '700', color: K },
  urgentTag: { fontSize: 9, fontWeight: '800', color: CLR.red, backgroundColor: CLR.redBg, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },

  avatar:     { width: 26, height: 26, borderRadius: 13, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 9, fontWeight: '700', color: '#64748B' },

  cellMain:        { fontSize: 12, fontWeight: '600', color: '#0F172A' },
  cellSub:         { fontSize: 11, color: '#64748B' },
  cellDate:        { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  cellDateOverdue: { color: CLR.red, fontWeight: '700' },

  loadingBox:  { alignItems: 'center', paddingVertical: 80 },
  loadingText: { fontSize: 13, color: '#94A3B8', padding: 24, textAlign: 'center' },
});
