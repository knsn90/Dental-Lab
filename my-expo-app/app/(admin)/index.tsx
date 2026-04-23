import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { BlurFade } from '../../core/ui/BlurFade';

// ── SVG Icons (Lucide-style) ──────────────────────────────────────────
type IconName =
  | 'arrow-up-right' | 'plus' | 'receipt' | 'activity'
  | 'users' | 'user' | 'trending-up' | 'alert-triangle';

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
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" {...p}/>
          <Path d="M16 8H8M16 12H8M13 16H8" {...p}/>
        </Svg>
      );
    case 'activity':
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="22 12 18 12 15 21 9 3 6 12 2 12" {...p}/></Svg>;
    case 'users':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...p}/>
          <Circle cx="9" cy="7" r="4" {...p}/>
          <Path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" {...p}/>
        </Svg>
      );
    case 'user':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" {...p}/>
          <Circle cx="12" cy="7" r="4" {...p}/>
        </Svg>
      );
    case 'trending-up':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Polyline points="23 6 13.5 15.5 8.5 10.5 1 18" {...p}/>
          <Polyline points="17 6 23 6 23 12" {...p}/>
        </Svg>
      );
    case 'alert-triangle':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" {...p}/>
          <Line x1="12" y1="9" x2="12" y2="13" {...p}/>
          <Line x1="12" y1="17" x2="12.01" y2="17" {...p}/>
        </Svg>
      );
    default: return null;
  }
}

const K  = '#0F172A';
const BG = '#F7F9FB';

const CLR = {
  blackBg: '#F1F5F9',
  green:   '#16A34A', greenBg:  '#DCFCE7',
  orange:  '#D97706', orangeBg: '#FEF3C7',
  red:     '#EF4444', redBg:    '#FEF2F2',
  purple:  '#7C3AED', purpleBg: '#EDE9FE',
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  alindi:          { label: 'Alındı',         color: '#64748B', bg: '#F1F5F9' },
  uretimde:        { label: 'Üretimde',        color: CLR.orange, bg: CLR.orangeBg },
  kalite_kontrol:  { label: 'Kalite Kontrol',  color: CLR.purple, bg: CLR.purpleBg },
  teslimata_hazir: { label: 'Teslimata Hazır', color: CLR.green,  bg: CLR.greenBg },
  teslim_edildi:   { label: 'Teslim Edildi',   color: '#94A3B8',  bg: '#F8FAFC' },
};

const MONTHS_TR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const STATUS_KEYS = ['alindi','uretimde','kalite_kontrol','teslimata_hazir','teslim_edildi'];

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
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || '—';
}

// ── Status Badge ──────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { label: status, color: '#64748B', bg: '#F1F5F9' };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: c.bg, gap: 4, alignSelf: 'flex-start' }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.color }} />
      <Text style={{ fontSize: 11, fontWeight: '600', color: c.color }}>{c.label}</Text>
    </View>
  );
}

// ── Quick Actions Bento ───────────────────────────────────────────────
interface QAItem {
  icon: IconName; label: string; onPress: () => void;
  accent: string; accentBg: string; primary?: boolean;
}

function BentoCard({
  item, style, iconSize = 24, showArrow = true, horizontal = false,
}: {
  item: QAItem; style?: any; iconSize?: number; showArrow?: boolean; horizontal?: boolean;
}) {
  const scaleRef = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scaleRef, { toValue: 0.95, useNativeDriver: true, damping: 15 }).start();
  const onPressOut = () =>
    Animated.spring(scaleRef, { toValue: 1, useNativeDriver: true, damping: 15 }).start();

  return (
    <TouchableOpacity
      onPress={item.onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      activeOpacity={1}
      style={[{ flex: 1 }, style]}
    >
      <Animated.View
        style={[
          bento.card,
          item.primary && bento.cardPrimary,
          horizontal && bento.cardHorizontal,
          { transform: [{ scale: scaleRef }] },
        ]}
      >
        {/* Subtle top-right gradient sheen for primary */}
        {item.primary && (
          <View style={bento.primarySheen} pointerEvents="none" />
        )}

        {/* Arrow badge */}
        {showArrow && (
          <View style={[bento.arrowBadge, item.primary && bento.arrowBadgePrimary]}>
            <Icon
              name="arrow-up-right"
              size={11}
              color={item.primary ? 'rgba(255,255,255,0.6)' : '#CBD5E1'}
              strokeWidth={2.5}
            />
          </View>
        )}

        {/* Icon */}
        <View
          style={[
            bento.iconWrap,
            { backgroundColor: item.primary ? 'rgba(255,255,255,0.14)' : item.accentBg },
            horizontal && { marginRight: 10 },
          ]}
        >
          <Icon
            name={item.icon}
            size={iconSize}
            color={item.primary ? '#FFFFFF' : item.accent}
            strokeWidth={1.75}
          />
        </View>

        {/* Label */}
        <Text
          style={[bento.label, item.primary && bento.labelPrimary]}
          numberOfLines={1}
        >
          {item.label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

function QuickActionsSection({
  onNewOrder, onUsers, onDoctors, onOrders, onProfile,
}: {
  onNewOrder: () => void; onUsers: () => void; onDoctors: () => void;
  onOrders: () => void;   onProfile: () => void;
}) {
  const items: QAItem[] = [
    { icon: 'plus',     label: 'Yeni İş',      onPress: onNewOrder, accent: '#FFFFFF', accentBg: 'rgba(255,255,255,0.14)', primary: true },
    { icon: 'receipt',  label: 'Siparişler',   onPress: onOrders,   accent: '#2563EB', accentBg: '#EFF6FF' },
    { icon: 'activity', label: 'Hekimler',     onPress: onDoctors,  accent: '#059669', accentBg: '#ECFDF5' },
    { icon: 'users',    label: 'Kullanıcılar', onPress: onUsers,    accent: '#7C3AED', accentBg: '#F5F3FF' },
    { icon: 'user',     label: 'Profil',       onPress: onProfile,  accent: '#D97706', accentBg: '#FFFBEB' },
  ];

  return (
    <View style={bento.grid}>
      {/* Row 1: Primary (large) + two small stacked */}
      <View style={bento.row}>
        {/* Primary — Yeni İş */}
        <BentoCard item={items[0]} style={{ flex: 3 }} iconSize={28} />

        {/* Siparişler + Hekimler stacked */}
        <View style={bento.col}>
          <BentoCard item={items[1]} showArrow={false} />
          <BentoCard item={items[2]} showArrow={false} />
        </View>
      </View>

      {/* Row 2: Kullanıcılar + Profil */}
      <View style={bento.row}>
        <BentoCard item={items[3]} />
        <BentoCard item={items[4]} />
      </View>
    </View>
  );
}

const bento = StyleSheet.create({
  grid: { gap: 10, marginBottom: 24 },
  row:  { flexDirection: 'row', gap: 10 },
  col:  { flex: 2, gap: 10 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    gap: 12,
    minHeight: 110,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 4px 16px rgba(15,23,42,0.04)',
      } as any,
      default: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      },
    }),
  },
  cardPrimary: {
    backgroundColor: K,
    minHeight: 220,
  },
  cardHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
  },

  // Sheen overlay top-right for primary card
  primarySheen: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  // Arrow badge top-right
  arrowBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowBadgePrimary: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  // Icon container
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Labels
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  labelPrimary: {
    color: '#FFFFFF',
    fontSize: 15,
  },
});

// ── Stat Card ─────────────────────────────────────────────────────────
function StatCard({ label, value, accent, delta, accentBar }: {
  label: string; value: number | string; accent?: string; delta?: string; accentBar?: boolean;
}) {
  return (
    <View style={sc.card}>
      {accentBar && <View style={sc.accentBar} />}
      <Text style={sc.label}>{label}</Text>
      <View style={sc.valueRow}>
        <Text style={[sc.value, accent ? { color: accent } : null]}>{value}</Text>
        {delta && (
          <View style={sc.delta}>
            <Icon name="trending-up" size={10} color={K} strokeWidth={2.5} />
            <Text style={sc.deltaText}>{delta}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
const sc = StyleSheet.create({
  card: {
    flex: 1, minWidth: 150,
    backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 18,
    borderWidth: 1, borderColor: '#F1F5F9',
    position: 'relative', overflow: 'hidden',
  },
  accentBar: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 3, backgroundColor: K },
  label: { fontSize: 11, color: '#94A3B8', fontWeight: '500', marginBottom: 10 },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  value: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.8, lineHeight: 32 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: CLR.blackBg, marginBottom: 4 },
  deltaText: { fontSize: 10, fontWeight: '700', color: K },
});

// ── Card wrap ─────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[card.wrap, style]}>{children}</View>;
}
function CardHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={card.header}>
      <Text style={card.title}>{title}</Text>
      {right}
    </View>
  );
}
const card = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
});

// ── Section Title ─────────────────────────────────────────────────────
function SectionTitle({ text }: { text: string }) {
  return <Text style={sec.text}>{text}</Text>;
}
const sec = StyleSheet.create({
  text: {
    fontSize: 11, fontWeight: '700', color: '#64748B',
    letterSpacing: 1.0, textTransform: 'uppercase',
    marginBottom: 12, marginTop: 4, paddingHorizontal: 2,
  },
});

// ── Animated Bar ──────────────────────────────────────────────────────
function AnimatedBar({
  pct, isActive, isHighest, count, label, delay,
}: {
  pct: number; isActive: boolean; isHighest: boolean;
  count: number; label: string; delay: number;
}) {
  const heightAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(heightAnim, {
        toValue: pct,
        damping: 14,
        stiffness: 120,
        delay,
        useNativeDriver: false,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        delay,
        useNativeDriver: false,
      }),
    ]).start();
  }, [pct]);

  const animatedHeight = heightAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', opacity: opacityAnim }}>
      {/* Tooltip bubble above highest bar */}
      {isHighest && count > 0 && (
        <View style={ch.tooltipWrap}>
          <View style={[ch.tooltipBubble, isActive && ch.tooltipBubbleActive]}>
            <Text style={ch.tooltipText}>{count}</Text>
          </View>
          {/* Arrow */}
          <View style={[ch.tooltipArrow, isActive && ch.tooltipArrowActive]} />
        </View>
      )}

      {/* Value label — non-highest bars */}
      {!isHighest && count > 0 && (
        <Text style={[ch.barLabel, isActive && { color: K }]}>{count}</Text>
      )}

      {/* Bar track (candy stripe bg) */}
      <View style={ch.track}>
        {/* Stripe overlay (web only via CSS, native via opacity layer) */}
        {Platform.OS === 'web' ? (
          <View
            style={StyleSheet.absoluteFillObject}
            // @ts-ignore
            pointerEvents="none"
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, ch.stripeNative]} pointerEvents="none" />
        )}

        {/* Filled portion */}
        <Animated.View
          style={[
            ch.fill,
            { height: animatedHeight },
            isActive ? ch.fillActive : ch.fillInactive,
          ]}
        >
          {/* Inner top gloss */}
          <View style={ch.fillGloss} />
        </Animated.View>
      </View>

      <Text style={[ch.monthLabel, isActive && ch.monthLabelActive]}>{label}</Text>
    </Animated.View>
  );
}

// ── Monthly Chart ─────────────────────────────────────────────────────
function MonthlyChart({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const highestIdx = data.reduce((best, d, i) => d.count > data[best].count ? i : best, 0);
  const lastIdx = data.length - 1;

  // Web: inject candy-stripe CSS once
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const id = 'candy-stripe-style';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = `
      .candy-track::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: repeating-linear-gradient(
          135deg,
          rgba(15,23,42,0.04) 0px,
          rgba(15,23,42,0.04) 1px,
          transparent 1px,
          transparent 8px
        );
        border-radius: 10px;
        pointer-events: none;
      }
    `;
    document.head.appendChild(el);
  }, []);

  return (
    <View style={ch.container}>
      {data.map((d, i) => {
        const pct = Math.max((d.count / max) * 100, 4);
        return (
          <AnimatedBar
            key={i}
            pct={pct}
            isActive={i === lastIdx}
            isHighest={i === highestIdx}
            count={d.count}
            label={d.label}
            delay={i * 60}
          />
        );
      })}
    </View>
  );
}

const ch = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 180,
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 36,
  },
  // Bar track
  track: {
    width: '100%',
    flex: 1,
    justifyContent: 'flex-end',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.05)',
    position: 'relative',
  },
  stripeNative: {
    opacity: 0.5,
    backgroundColor: 'transparent',
  },
  // Filled bar
  fill: {
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  fillActive: {
    backgroundColor: K,
  },
  fillInactive: {
    backgroundColor: 'rgba(15,23,42,0.18)',
  },
  fillGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  // Labels
  barLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 5,
  },
  monthLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 8,
    fontWeight: '500',
    textAlign: 'center',
  },
  monthLabelActive: {
    color: K,
    fontWeight: '800',
  },
  // Tooltip
  tooltipWrap: {
    alignItems: 'center',
    marginBottom: 6,
    position: 'absolute',
    top: -32,
    left: 0,
    right: 0,
  },
  tooltipBubble: {
    backgroundColor: 'rgba(15,23,42,0.18)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  tooltipBubbleActive: {
    backgroundColor: K,
  },
  tooltipText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tooltipArrow: {
    width: 6,
    height: 6,
    borderRadius: 1,
    backgroundColor: 'rgba(15,23,42,0.18)',
    transform: [{ rotate: '45deg' }],
    marginTop: -3,
  },
  tooltipArrowActive: {
    backgroundColor: K,
  },
});

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
  const [hovered, setHovered]           = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const today = todayStr();

      const [ordersRes, profilesRes, recentRes] = await Promise.all([
        supabase
          .from('work_orders')
          .select('status, delivery_date, created_at, work_type, doctor:doctor_id(full_name)'),
        supabase
          .from('profiles')
          .select('user_type')
          .neq('user_type', 'admin'),
        supabase
          .from('work_orders')
          .select('id, order_number, work_type, status, delivery_date, is_urgent, doctor:doctor_id(full_name)')
          .order('created_at', { ascending: false })
          .limit(6),
      ]);

      const orders   = (ordersRes.data ?? []) as any[];
      const profiles = profilesRes.data ?? [];
      const recent   = (recentRes.data ?? []) as any[];

      let todayCount = 0, overdueCount = 0, todayDel = 0;
      const statusMap: Record<string, number> = {};
      const wtMap: Record<string, number>     = {};
      const monthMap: Record<string, number>  = {};

      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthMap[key] = 0;
      }

      for (const o of orders) {
        if (o.created_at?.startsWith(today)) todayCount++;
        if (o.delivery_date < today && o.status !== 'teslim_edildi') overdueCount++;
        if (o.delivery_date === today && o.status !== 'teslim_edildi') todayDel++;
        statusMap[o.status] = (statusMap[o.status] ?? 0) + 1;
        if (o.work_type) wtMap[o.work_type] = (wtMap[o.work_type] ?? 0) + 1;
        if (o.created_at) {
          const d = new Date(o.created_at);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (key in monthMap) monthMap[key] += 1;
        }
      }

      setTotalOrders(orders.length);
      setTodayOrders(todayCount);
      setOverdue(overdueCount);
      setTodayDelivery(todayDel);
      setDoctors(profiles.filter((p: any) => p.user_type === 'doctor').length);
      setLabUsers(profiles.filter((p: any) => p.user_type === 'lab' || p.user_type === 'lab_user' || p.user_type === 'mesul_mudur').length);

      setByStatus(
        STATUS_KEYS.map(k => ({ key: k, label: STATUS_CFG[k]?.label ?? k, count: statusMap[k] ?? 0 }))
      );
      setByWorkType(
        Object.entries(wtMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, count }))
      );
      setMonthly(
        Object.entries(monthMap).map(([key, count]) => {
          const m = parseInt(key.split('-')[1]) - 1;
          return { label: MONTHS_TR[m], count };
        })
      );
      setRecentOrders(recent.map(o => ({
        id:            o.id,
        order_number:  o.order_number,
        work_type:     o.work_type,
        status:        o.status,
        delivery_date: o.delivery_date,
        is_urgent:     o.is_urgent ?? false,
        doctor_name:   (o.doctor as any)?.full_name ?? '—',
      })));
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      >

        {/* ── Hero Welcome + Critical Alert ────────────────────── */}
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
            <View style={[s.alertCard, isDesktop && { width: 300 }]}>
              <View style={s.alertDecorIcon} pointerEvents="none">
                <Icon name="alert-triangle" size={180} color={CLR.red} strokeWidth={0.6} />
              </View>
              <View style={s.alertTop}>
                <Text style={s.alertPill}>KRİTİK</Text>
              </View>
              <Text style={s.alertTitle}>
                <Text style={s.alertCount}>{overdueOrders}</Text>
                {' geciken sipariş'}
              </Text>
              <Text style={s.alertSub}>Acil müdahale gerektiren vakalar.</Text>
              <TouchableOpacity
                style={s.alertBtn}
                onPress={() => router.push('/(admin)/orders' as any)}
                activeOpacity={0.9}
              >
                <Text style={s.alertBtnText}>Detayları Gör</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Quick Actions ─────────────────────────────────────── */}
        <SectionTitle text="Hızlı İşlemler" />
        <QuickActionsSection
          onNewOrder={() => router.push('/(admin)/new-order' as any)}
          onUsers={() => router.push('/(admin)/users' as any)}
          onDoctors={() => router.push('/(admin)/doctors' as any)}
          onOrders={() => router.push('/(admin)/orders' as any)}
          onProfile={() => router.push('/(admin)/profile' as any)}
        />

        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color={K} size="large" />
          </View>
        ) : (
          <>
            {/* ── Genel Bakış + Sağ Kolon ───────────────────────────── */}
            <View style={[s.mainGrid, isDesktop && s.mainGridDesktop]}>

              {/* Left — 2/3 */}
              <View style={[{ gap: 20 }, isDesktop && { flex: 2 }]}>
                <SectionTitle text="Genel Bakış" />
                <View style={s.statsGrid}>
                  <StatCard label="Toplam Sipariş" value={totalOrders.toLocaleString('tr-TR')} delta={totalOrders > 0 ? '+12%' : undefined} />
                  <StatCard label="Bugün Yeni"    value={todayOrders} accent={K} accentBar />
                  <StatCard label="Geciken"       value={overdueOrders} accent={overdueOrders > 0 ? CLR.red : undefined} />
                  <StatCard label="Bugün Teslim"  value={todayDelivery} />
                  <StatCard label="Kayıtlı Hekim" value={totalDoctors} />
                  <StatCard label="Lab Kullanıcısı" value={totalLabUsers} />
                </View>

                {/* Aylık Trend */}
                <Card>
                  <CardHeader
                    title="Sipariş Trendi"
                    right={<View style={s.chip}><Text style={s.chipText}>Son 6 Ay</Text></View>}
                  />
                  {monthly.length > 0
                    ? <MonthlyChart data={monthly} />
                    : <View style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#94A3B8', fontSize: 13 }}>Veri yok</Text>
                      </View>
                  }
                </Card>
              </View>

              {/* Right — 1/3 */}
              <View style={[{ gap: 20 }, isDesktop && { flex: 1 }]}>
                <SectionTitle text="Analiz" />

                {/* Statü Dağılımı */}
                <Card>
                  <CardHeader title="Statü Dağılımı" />
                  <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 14 }}>
                    {byStatus.map(item => {
                      const total = byStatus.reduce((sum, x) => sum + x.count, 0) || 1;
                      const pct   = Math.round((item.count / total) * 100);
                      const cfg   = STATUS_CFG[item.key];
                      return (
                        <View key={item.key}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                            <Text style={{ flex: 1, fontSize: 12, color: '#64748B', fontWeight: '500' }}>{item.label}</Text>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{item.count}</Text>
                          </View>
                          <View style={{ height: 5, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                            <View style={{ height: 5, borderRadius: 4, backgroundColor: cfg?.color ?? K, width: `${pct}%` as any }} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </Card>

                {/* İş Tipi Dağılımı */}
                {byWorkType.length > 0 && (
                  <Card>
                    <CardHeader title="İş Tipi Dağılımı" />
                    <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 10 }}>
                      {byWorkType.map((w, i) => {
                        const total = byWorkType.reduce((s, x) => s + x.count, 0) || 1;
                        const pct = Math.round((w.count / total) * 100);
                        return (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: K, marginRight: 10, opacity: 1 - i * 0.15 }} />
                            <Text style={{ flex: 1, fontSize: 13, color: '#0F172A' }} numberOfLines={1}>{w.label}</Text>
                            <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '600' }}>{pct}%</Text>
                          </View>
                        );
                      })}
                    </View>
                  </Card>
                )}
              </View>
            </View>

            {/* ── Son Siparişler ────────────────────────────────────── */}
            <View style={{ marginTop: 20 }}>
              <Card>
                <CardHeader
                  title="Son Siparişler"
                  right={
                    <TouchableOpacity onPress={() => router.push('/(admin)/orders' as any)}>
                      <Text style={s.linkBtn}>Tümünü Gör</Text>
                    </TouchableOpacity>
                  }
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
                          <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={s.avatar}>
                              <Text style={s.avatarText}>{initials(order.doctor_name)}</Text>
                            </View>
                            <Text style={s.cellMain} numberOfLines={1}>{order.doctor_name}</Text>
                          </View>
                          {isDesktop && (
                            <Text style={[s.cellSub, { flex: 2 }]} numberOfLines={1}>{order.work_type || '—'}</Text>
                          )}
                          <View style={{ flex: 1.4 }}>
                            <StatusBadge status={order.status} />
                          </View>
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
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: { padding: 24, paddingBottom: 40, maxWidth: 1400, alignSelf: 'stretch' },

  // Hero
  heroRow:        { gap: 16, marginBottom: 24 },
  heroRowDesktop: { flexDirection: 'row' },

  welcomeCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 28,
    borderWidth: 1, borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  welcomeGreet: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  welcomeDate:  { fontSize: 28, fontWeight: '300', color: K, letterSpacing: -0.5, marginTop: 2 },
  welcomeSub:   { fontSize: 13, color: '#64748B', marginTop: 10 },

  // Critical alert
  alertCard: {
    backgroundColor: '#FFF1F2', borderRadius: 16,
    padding: 20, gap: 8,
    position: 'relative', overflow: 'hidden',
  },
  alertDecorIcon: { position: 'absolute', top: -30, left: -30, opacity: 0.1 } as any,
  alertTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'flex-end' },
  alertPill: {
    fontSize: 10, fontWeight: '800', color: CLR.red,
    backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, letterSpacing: 0.8,
  },
  alertTitle: { fontSize: 20, fontWeight: '800', color: '#7F1D1D', marginTop: 6, letterSpacing: -0.4 },
  alertCount: { fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  alertSub:   { fontSize: 12, color: '#B91C1C' },
  alertBtn: {
    marginTop: 6, backgroundColor: CLR.red, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  alertBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  loadingBox: { alignItems: 'center', paddingVertical: 80 },

  // Main grid
  mainGrid:        { gap: 20 },
  mainGridDesktop: { flexDirection: 'row' },

  // Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  // Chips
  chip:      { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  chipText:  { fontSize: 11, color: '#64748B', fontWeight: '600' },

  linkBtn: { fontSize: 13, color: K, fontWeight: '700' },

  // Table
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFBFC',
  },
  thCell: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.6 },

  tableRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 10, minHeight: 56 },
  tableRowHover:   { backgroundColor: '#FAFBFD' },
  tableRowOverdue: { backgroundColor: '#FEF2F2' },
  rowBorder:       { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },

  orderNo:   { fontSize: 12, fontWeight: '700', color: K },
  urgentTag: { fontSize: 9, fontWeight: '800', color: CLR.red, backgroundColor: CLR.redBg, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },

  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 10, fontWeight: '700', color: '#64748B' },

  cellMain:         { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  cellSub:          { fontSize: 12, color: '#64748B' },
  cellDate:         { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  cellDateOverdue:  { color: CLR.red, fontWeight: '700' },

  loadingText: { fontSize: 13, color: '#94A3B8', padding: 24, textAlign: 'center' },
});
