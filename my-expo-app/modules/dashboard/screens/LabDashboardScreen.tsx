/**
 * LabDashboardScreen — Bugün
 * Tek bakışta üretim durumu, kritik uyarılar, hızlı kısa yollar, son siparişler.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  TouchableOpacity, useWindowDimensions, RefreshControl,
  Animated, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../core/store/authStore';
import { ResponsiveCanvas } from '../../../core/layout/ResponsiveCanvas';
import { HeroX } from '../../../core/ui/HeroX';
import { KPICardX } from '../../../core/ui/KPICardX';
import { useTodayOrders } from '../../orders/hooks/useTodayOrders';
import { isOrderOverdue } from '../../orders/constants';
import { fetchTodayProvas } from '../../provas/api';
import { PROVA_TYPES } from '../../provas/types';
import { supabase } from '../../../core/api/supabase';
import { BlurFade } from '../../../core/ui/BlurFade';
import { AppIcon } from '../../../core/ui/AppIcon';

// ─── Colour palette ───────────────────────────────────────────────────────────
const P   = '#2563EB';
const BG  = '#F9F9FB';
const CLR = {
  blue:   '#2563EB', blueBg:   '#EFF6FF',
  green:  '#16A34A', greenBg:  '#DCFCE7',
  orange: '#D97706', orangeBg: '#FEF3C7',
  red:    '#EF4444', redBg:    '#FEF2F2',
  purple: '#7C3AED', purpleBg: '#EDE9FE',
  teal:   '#0891B2', tealBg:   '#ECFEFF',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface TodayProva {
  id: string; prova_number: number; prova_type: string | null;
  scheduled_date: string | null; status: string; order_item_name: string | null;
  work_order: {
    id: string; order_number: string; patient_name: string | null;
    doctor?: { full_name: string; clinic?: { name: string } | null };
  } | null;
}
interface MonthBar  { month: string; count: number; }
interface StationStat {
  station_name: string; station_color: string | null;
  avg_duration_hours: number; active_count: number; total_processed: number;
}
interface TechStat {
  technician_name: string; approval_rate: number;
  avg_work_duration_hours: number; total_assigned: number;
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  alindi:          { label: 'Alındı',          color: '#64748B', bg: '#F1F5F9'   },
  uretimde:        { label: 'Üretimde',         color: CLR.orange, bg: CLR.orangeBg },
  kalite_kontrol:  { label: 'Kalite Kontrol',  color: '#7C3AED', bg: '#EDE9FE'   },
  teslimata_hazir: { label: 'Teslimata Hazır', color: CLR.green,  bg: CLR.greenBg },
  teslim_edildi:   { label: 'Teslim Edildi',   color: '#94A3B8',  bg: '#F8FAFC'  },
};

const MONTHS_TR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

// ─── Helper fns ───────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().split('T')[0]; }
function fmtDate(date: string) {
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
}
function getTodayLabel() {
  const d = new Date();
  const days   = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}
function initials(name?: string | null) {
  if (!name) return '—';
  const p = name.trim().split(/\s+/).slice(0, 2);
  return p.map(x => x[0]?.toUpperCase() ?? '').join('') || '—';
}
function hexA(hex: string, alpha: number) {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  } catch { return hex; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Shared UI Components
// ─────────────────────────────────────────────────────────────────────────────

/** Generic card wrapper */
function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[crd.wrap, style]}>{children}</View>;
}
/** Card header — single source of section label, no duplication */
function CardHeader({ title, subtitle, right }: {
  title: string; subtitle?: string; right?: React.ReactNode;
}) {
  return (
    <View style={crd.header}>
      <View style={{ flex: 1 }}>
        <Text style={crd.title}>{title}</Text>
        {subtitle && <Text style={crd.subtitle}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}
const crd = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EEF1F6',
    overflow: 'hidden',
    ...Platform.select({
      web:     { boxShadow: '0 1px 3px rgba(15,23,42,0.04), 0 6px 20px rgba(15,23,42,0.04)' } as any,
      default: { shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
    }),
  },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  title:    { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
});

/** Status badge with dot */
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { label: status, color: '#64748B', bg: '#F1F5F9' };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: c.bg, gap: 4, alignSelf: 'flex-start' }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.color }} />
      <Text style={{ fontSize: 11, fontWeight: '600', color: c.color }}>{c.label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Production Pipeline
// ─────────────────────────────────────────────────────────────────────────────
const PIPELINE_STAGES = [
  { key: 'alindi',          label: 'Alındı',    color: '#64748B', icon: 'inbox'        },
  { key: 'uretimde',        label: 'Üretimde',  color: CLR.orange,icon: 'activity'     },
  { key: 'kalite_kontrol',  label: 'KK',        color: '#7C3AED', icon: 'shield-check' },
  { key: 'teslimata_hazir', label: 'Hazır',     color: CLR.green, icon: 'package'      },
  { key: 'teslim_edildi',   label: 'Teslim',    color: '#94A3B8', icon: 'check-circle' },
] as const;

function ProductionPipeline({
  counts, onStagePress,
}: {
  counts: Record<string, number>;
  onStagePress: (status: string) => void;
}) {
  return (
    <Card>
      <CardHeader title="Üretim Hattı" subtitle="Tüm aktif siparişler" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={pipe.row}
      >
        {PIPELINE_STAGES.map((stage, i) => {
          const count = counts[stage.key] ?? 0;
          const isLast = i === PIPELINE_STAGES.length - 1;
          return (
            <View key={stage.key} style={pipe.stageWrap}>
              <TouchableOpacity
                style={[
                  pipe.stage,
                  { borderTopColor: count > 0 ? stage.color : '#E2E8F0' },
                  count > 0 && { backgroundColor: hexA(stage.color, 0.04) },
                ]}
                onPress={() => onStagePress(stage.key)}
                activeOpacity={0.75}
              >
                <Text style={[pipe.stageCount, { color: count > 0 ? stage.color : '#CBD5E1' }]}>
                  {count}
                </Text>
                <View style={[pipe.stageIconWrap, { backgroundColor: hexA(stage.color, count > 0 ? 0.12 : 0.05) }]}>
                  <AppIcon name={stage.icon as any} size={14} color={count > 0 ? stage.color : '#CBD5E1'} strokeWidth={2} />
                </View>
                <Text style={[pipe.stageLabel, count > 0 && { color: '#475569' }]}>{stage.label}</Text>
              </TouchableOpacity>
              {!isLast && (
                <AppIcon name="chevron-right" size={14} color="#CBD5E1" strokeWidth={2} style={pipe.arrow} />
              )}
            </View>
          );
        })}
      </ScrollView>
    </Card>
  );
}

const pipe = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stageWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stage: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderTopWidth: 3,
    minWidth: 88,
    borderRadius: 12,
  },
  stageCount: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 32,
  },
  stageIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  arrow: {
    opacity: 0.5,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
//  Attention Section
// ─────────────────────────────────────────────────────────────────────────────
function AttentionItem({
  icon, iconColor, iconBg, label, count, onPress,
}: {
  icon: string; iconColor: string; iconBg: string;
  label: string; count: number; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={att.item} onPress={onPress} activeOpacity={0.8}>
      <View style={[att.iconWrap, { backgroundColor: iconBg }]}>
        <AppIcon name={icon as any} size={16} color={iconColor} strokeWidth={2} />
      </View>
      <View style={att.textWrap}>
        <Text style={[att.count, { color: iconColor }]}>{count}</Text>
        <Text style={att.label} numberOfLines={1}>{label}</Text>
      </View>
      <AppIcon name="chevron-right" size={13} color={iconColor} strokeWidth={2} />
    </TouchableOpacity>
  );
}

function AttentionSection({
  items,
}: {
  items: { icon: string; iconColor: string; iconBg: string; label: string; count: number; onPress: () => void }[];
}) {
  if (items.length === 0) return null;
  return (
    <View style={att.section}>
      <View style={att.header}>
        <View style={att.headerLeft}>
          <View style={att.dot} />
          <Text style={att.headerTitle}>Hemen İlgilen</Text>
        </View>
        <Text style={att.headerSub}>{items.length} işlem bekliyor</Text>
      </View>
      <View style={att.list}>
        {items.map((item, i) => <AttentionItem key={i} {...item} />)}
      </View>
    </View>
  );
}

const att = StyleSheet.create({
  section: {
    backgroundColor: '#FFFBEB',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    padding: 16,
    ...Platform.select({
      web: { boxShadow: '0 4px 20px rgba(217,119,6,0.12), 0 1px 4px rgba(217,119,6,0.08)' } as any,
      default: { shadowColor: '#D97706', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
    }),
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:         { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F59E0B' },
  headerTitle: { fontSize: 13, fontWeight: '800', color: '#78350F' },
  headerSub:   { fontSize: 11, color: '#B45309', fontWeight: '600', backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  list:        { gap: 8 },
  item:        {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#FEF3C7',
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(217,119,6,0.08)' } as any,
      default: {},
    }),
  },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  textWrap: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  count:    { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  label:    { fontSize: 12, color: '#64748B', fontWeight: '500', flex: 1 },
});

// ─────────────────────────────────────────────────────────────────────────────
//  Quick Actions Bento
// ─────────────────────────────────────────────────────────────────────────────
interface QAItem {
  icon: string; label: string; onPress: () => void;
  accent: string; accentBg: string; primary?: boolean; badge?: number;
}

function BentoCard({
  item, style, iconSize = 22,
}: {
  item: QAItem; style?: any; iconSize?: number;
}) {
  const scaleRef = useRef(new Animated.Value(1)).current;
  const onPressIn  = () => Animated.spring(scaleRef, { toValue: 0.95, useNativeDriver: true, damping: 15 }).start();
  const onPressOut = () => Animated.spring(scaleRef, { toValue: 1,    useNativeDriver: true, damping: 15 }).start();

  return (
    <TouchableOpacity
      onPress={item.onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      activeOpacity={1}
      style={[{ flex: 1 }, style]}
    >
      <Animated.View style={[
        bt.card,
        item.primary && bt.cardPrimary,
        { transform: [{ scale: scaleRef }] },
      ]}>
        {item.primary && <View style={bt.sheen} pointerEvents="none" />}
        {item.primary && <View style={bt.sheen2} pointerEvents="none" />}

        <View style={[bt.iconWrap, { backgroundColor: item.primary ? 'rgba(255,255,255,0.15)' : item.accentBg }]}>
          <AppIcon name={item.icon as any} size={iconSize} color={item.primary ? '#FFFFFF' : item.accent} strokeWidth={1.75} />
        </View>

        <Text style={[bt.label, item.primary && bt.labelPrimary]} numberOfLines={1}>{item.label}</Text>

        {/* Badge */}
        {(item.badge ?? 0) > 0 && (
          <View style={bt.badge}>
            <Text style={bt.badgeText}>{item.badge}</Text>
          </View>
        )}

        {/* Arrow */}
        <View style={[bt.arrowBadge, item.primary && bt.arrowBadgePrimary]}>
          <AppIcon name="arrow-up-right" size={10} color={item.primary ? 'rgba(255,255,255,0.6)' : '#CBD5E1'} strokeWidth={2.5} />
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

function QuickActions({ actions }: { actions: QAItem[] }) {
  // Layout: [big primary] [2×small right]
  //         [small] [small] [small] [small]
  const [primary, ...rest] = actions;
  const top2 = rest.slice(0, 2);
  const bot4 = rest.slice(2);

  return (
    <View style={bt.grid}>
      <View style={bt.row}>
        <BentoCard item={primary} style={{ flex: 3 }} iconSize={28} />
        <View style={bt.col}>
          {top2.map((item, i) => (
            <BentoCard key={i} item={item} />
          ))}
        </View>
      </View>
      <View style={bt.row}>
        {bot4.map((item, i) => (
          <BentoCard key={i} item={item} />
        ))}
      </View>
    </View>
  );
}

const bt = StyleSheet.create({
  grid: { gap: 12 },
  row:  { flexDirection: 'row', gap: 12 },
  col:  { flex: 2, gap: 12 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    gap: 10,
    minHeight: 100,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#EEF1F6',
    ...Platform.select({
      web:     { boxShadow: '0 1px 3px rgba(15,23,42,0.04), 0 6px 20px rgba(15,23,42,0.04)' } as any,
      default: { shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
    }),
  },
  cardPrimary: {
    minHeight: 220,
    borderWidth: 0,
    ...Platform.select({
      web: {
        background: 'linear-gradient(145deg, #1D4ED8 0%, #2563EB 50%, #6D28D9 100%)',
        boxShadow: '0 8px 32px rgba(37,99,235,0.35), 0 2px 8px rgba(37,99,235,0.2)',
      } as any,
      default: { backgroundColor: '#2563EB' },
    }),
  },
  sheen: {
    position: 'absolute', top: -50, right: -50,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  sheen2: {
    position: 'absolute', bottom: -30, left: -30,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  iconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label:        { fontSize: 13, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 },
  labelPrimary: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  badge: {
    position: 'absolute', top: 12, left: 12,
    backgroundColor: CLR.red, borderRadius: 999,
    minWidth: 18, height: 18, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  arrowBadge: {
    position: 'absolute', top: 12, right: 12,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  arrowBadgePrimary: { backgroundColor: 'rgba(255,255,255,0.15)' },
});

// ─────────────────────────────────────────────────────────────────────────────
//  KPI Cards
// ─────────────────────────────────────────────────────────────────────────────
function KPICard({ label, value, icon, accent, sub }: {
  label: string; value: string | number; icon: string; accent: string; sub?: string;
}) {
  return (
    <View style={[kpi.card, { borderTopColor: accent }]}>
      <View style={kpi.top}>
        <View style={[kpi.iconWrap, { backgroundColor: hexA(accent, 0.1) }]}>
          <AppIcon name={icon as any} size={16} color={accent} strokeWidth={2} />
        </View>
        <Text style={kpi.label} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[kpi.value, { color: accent }]}>{value}</Text>
      {sub && <Text style={kpi.sub}>{sub}</Text>}
    </View>
  );
}
const kpi = StyleSheet.create({
  card: {
    flex: 1, minWidth: 130,
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#EEF1F6',
    borderTopWidth: 3,
    gap: 10,
    ...Platform.select({
      web:     { boxShadow: '0 1px 3px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.04)' } as any,
      default: { shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
    }),
  },
  top:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWrap: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, color: '#94A3B8', fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', flex: 1 },
  value: { fontSize: 28, fontWeight: '800', letterSpacing: -1, lineHeight: 32 },
  sub:   { fontSize: 11, color: '#94A3B8', marginTop: -4 },
});

// ─────────────────────────────────────────────────────────────────────────────
//  Monthly Chart
// ─────────────────────────────────────────────────────────────────────────────
function AnimatedBar({
  pct, isActive, isHighest, count, label, delay,
}: {
  pct: number; isActive: boolean; isHighest: boolean;
  count: number; label: string; delay: number;
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
      {!isHighest && count > 0 && (
        <Text style={[ch.barLabel, isActive && { color: P }]}>{count}</Text>
      )}
      <View style={ch.track}>
        <Animated.View style={[ch.fill, { height: animH }, isActive ? ch.fillActive : ch.fillInactive]}>
          <View style={ch.fillGloss} />
        </Animated.View>
      </View>
      <Text style={[ch.monthLabel, isActive && ch.monthLabelActive]}>{label}</Text>
    </Animated.View>
  );
}

function MonthlyChart({ data }: { data: MonthBar[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const highestIdx = data.reduce((best, d, i) => d.count > data[best].count ? i : best, 0);
  const lastIdx = data.length - 1;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const id = 'candy-stripe-lab';
    if ((document as any).getElementById(id)) return;
    const el = (document as any).createElement('style');
    el.id = id;
    el.textContent = `.candy-track-lab::before{content:'';position:absolute;inset:0;background-image:repeating-linear-gradient(135deg,rgba(37,99,235,0.06) 0px,rgba(37,99,235,0.06) 1px,transparent 1px,transparent 8px);border-radius:10px;pointer-events:none;}`;
    (document as any).head.appendChild(el);
  }, []);

  return (
    <View style={ch.container}>
      {data.map((d, i) => (
        <AnimatedBar
          key={i}
          pct={Math.max((d.count / max) * 100, 4)}
          isActive={i === lastIdx}
          isHighest={i === highestIdx}
          count={d.count}
          label={d.month}
          delay={i * 60}
        />
      ))}
    </View>
  );
}

const ch = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-end', height: 180, gap: 6, paddingHorizontal: 20, paddingBottom: 20, paddingTop: 32 },
  track: { width: '100%', flex: 1, justifyContent: 'flex-end', borderRadius: 8, overflow: 'hidden', backgroundColor: hexA(P, 0.06), position: 'relative' },
  fill:        { width: '100%', borderRadius: 8, overflow: 'hidden', position: 'relative' },
  fillActive:  { backgroundColor: P },
  fillInactive:{ backgroundColor: `${P}30` },
  fillGloss:   { position: 'absolute', top: 0, left: 0, right: 0, height: 5, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)' },
  barLabel:      { fontSize: 9, fontWeight: '700', color: '#94A3B8', marginBottom: 4 },
  monthLabel:    { fontSize: 9, color: '#94A3B8', marginTop: 6, fontWeight: '500', textAlign: 'center' },
  monthLabelActive: { color: P, fontWeight: '800' },
  tooltipWrap:   { alignItems: 'center', marginBottom: 4, position: 'absolute', top: -28, left: 0, right: 0 },
  tooltipBubble: { backgroundColor: `${P}30`, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  tooltipBubbleActive: { backgroundColor: P },
  tooltipText:   { fontSize: 9, fontWeight: '800', color: '#FFFFFF' },
  tooltipArrow:  { width: 5, height: 5, borderRadius: 1, backgroundColor: `${P}30`, transform: [{ rotate: '45deg' }], marginTop: -2 },
  tooltipArrowActive: { backgroundColor: P },
});

// ─────────────────────────────────────────────────────────────────────────────
//  Station Bottleneck
// ─────────────────────────────────────────────────────────────────────────────
function StationBottleneck({ data }: { data: StationStat[] }) {
  if (data.length === 0) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ fontSize: 13, color: '#94A3B8' }}>İstasyon verisi yok</Text>
      </View>
    );
  }
  const maxVal = Math.max(...data.map(d => d.avg_duration_hours), 1);
  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 16, gap: 12 }}>
      {data.map((st, i) => {
        const pct   = (st.avg_duration_hours / maxVal) * 100;
        const color = st.station_color ?? CLR.blue;
        return (
          <View key={i} style={{ gap: 5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#1E293B', flex: 1 }} numberOfLines={1}>
                {st.station_name}
              </Text>
              <Text style={{ fontSize: 11, color: '#64748B', marginLeft: 8 }}>
                {st.avg_duration_hours.toFixed(1)}s
              </Text>
            </View>
            <View style={{ height: 6, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
              <View style={{ height: 6, borderRadius: 4, backgroundColor: color, width: `${pct}%` as any }} />
            </View>
            <Text style={{ fontSize: 10, color: '#94A3B8' }}>
              {st.active_count} aktif · {st.total_processed} işlendi
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Top Technicians
// ─────────────────────────────────────────────────────────────────────────────
function TopTechnicians({ data }: { data: TechStat[] }) {
  if (data.length === 0) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ fontSize: 13, color: '#94A3B8' }}>Veri yok</Text>
      </View>
    );
  }
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
      {data.map((tech, i) => {
        const rate     = Math.round((tech.approval_rate ?? 0) * 100);
        const barColor = rate >= 80 ? CLR.green : rate >= 60 ? CLR.orange : CLR.red;
        return (
          <View
            key={i}
            style={{
              flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10,
              borderBottomWidth: i < data.length - 1 ? 1 : 0, borderBottomColor: '#F1F5F9',
            }}
          >
            <Text style={{ fontSize: 18, width: 26, textAlign: 'center' }}>{medals[i] ?? ''}</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#0F172A' }} numberOfLines={1}>
                {tech.technician_name}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ flex: 1, height: 5, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{ height: 5, borderRadius: 3, backgroundColor: barColor, width: `${rate}%` as any }} />
                </View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: barColor, width: 30, textAlign: 'right' }}>
                  {rate}%
                </Text>
              </View>
              <Text style={{ fontSize: 10, color: '#94A3B8' }}>
                {tech.total_assigned} atama · {(tech.avg_work_duration_hours ?? 0).toFixed(1)}s ort.
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export function LabDashboardScreen() {
  const router       = useRouter();
  const { profile }  = useAuthStore();
  const { orders, loading, refetch } = useTodayOrders();
  const { width }    = useWindowDimensions();
  const isDesktop    = width >= 900;

  const [provas,          setProvas]         = useState<TodayProva[]>([]);
  const [provasLoading,   setProvasLoading]  = useState(true);
  const [monthly,         setMonthly]        = useState<MonthBar[]>([]);
  const [recentOrders,    setRecentOrders]   = useState<any[]>([]);
  const [todayNewCount,   setTodayNewCount]  = useState(0);
  const [refreshing,      setRefreshing]     = useState(false);
  const [hovered,         setHovered]        = useState<string | null>(null);
  const [stationStats,    setStationStats]   = useState<StationStat[]>([]);
  const [topTechs,        setTopTechs]       = useState<TechStat[]>([]);
  const [pendingCount,    setPendingCount]   = useState(0);

  // Stok özeti
  const [stockSummary, setStockSummary] = useState<{
    lowCount:        number;
    materialCostMtd: number;
    wasteCostMtd:    number;
    topUsedName:     string | null;
  } | null>(null);

  // Pipeline counts
  const [pipelineCounts, setPipelineCounts] = useState<Record<string, number>>({});

  const isManager  = profile?.role === 'manager' || profile?.user_type === 'admin';
  const today      = todayStr();
  const firstName  = profile?.full_name?.split(' ')[0] ?? '';
  const overdueOrders    = orders.filter(o => isOrderOverdue(o.delivery_date, o.status));
  const todayDeliverable = orders.filter(o => o.delivery_date === today && o.status !== 'teslim_edildi');

  const loadPipeline = useCallback(async () => {
    try {
      const statuses = ['alindi', 'uretimde', 'kalite_kontrol', 'teslimata_hazir', 'teslim_edildi'];
      const results = await Promise.all(
        statuses.map(st =>
          supabase
            .from('work_orders')
            .select('id', { count: 'exact', head: true })
            .eq('status', st)
        )
      );
      const counts: Record<string, number> = {};
      statuses.forEach((st, i) => { counts[st] = results[i].count ?? 0; });
      setPipelineCounts(counts);
    } catch (_) {}
  }, []);

  const loadExtra = useCallback(async () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

    const { data } = await supabase
      .from('work_orders')
      .select('id, order_number, work_type, status, delivery_date, created_at, doctor:doctor_id(full_name)')
      .gte('created_at', sixMonthsAgo.toISOString())
      .order('created_at', { ascending: false });

    if (data) {
      setRecentOrders(data.slice(0, 8));
      const bars: MonthBar[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const y = d.getFullYear(), m = d.getMonth();
        bars.push({
          month: MONTHS_TR[m],
          count: data.filter(o => {
            const c = new Date(o.created_at);
            return c.getFullYear() === y && c.getMonth() === m;
          }).length,
        });
      }
      setMonthly(bars);
    }

    const { count: todayCount } = await supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${today}T00:00:00`);
    setTodayNewCount(todayCount ?? 0);

    // Pending approvals
    const { count: approvalCount } = await supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'kalite_kontrol');
    setPendingCount(approvalCount ?? 0);
  }, [today]);

  const loadAnalytics = useCallback(async () => {
    try {
      const labId = profile?.lab_id;
      if (!labId) return;
      const [{ data: stations }, { data: techs }] = await Promise.all([
        supabase
          .from('v_station_analytics')
          .select('station_name, station_color, avg_duration_hours, active_count, total_processed')
          .eq('lab_id', labId)
          .order('avg_duration_hours', { ascending: false })
          .limit(4),
        supabase
          .from('v_technician_performance')
          .select('technician_name, approval_rate, avg_work_duration_hours, total_assigned')
          .eq('lab_id', labId)
          .order('approval_rate', { ascending: false })
          .limit(3),
      ]);
      setStationStats((stations ?? []) as StationStat[]);
      setTopTechs((techs ?? []) as TechStat[]);
    } catch (_) {}
  }, [profile?.lab_id]);

  const loadProvas = useCallback(async () => {
    setProvasLoading(true);
    const { data } = await fetchTodayProvas();
    setProvas((data as TodayProva[]) ?? []);
    setProvasLoading(false);
  }, []);

  const loadStockSummary = useCallback(async () => {
    const labId = profile?.lab_id ?? profile?.id;
    if (!labId) return;
    const monthStart = (() => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    })();
    try {
      const [itemsRes, movRes] = await Promise.all([
        supabase.from('stock_items')
          .select('id, name, quantity, min_quantity')
          .eq('lab_id', labId),
        supabase.from('stock_movements')
          .select('item_id, item_name, type, quantity, unit_cost_at_time, is_reversed')
          .eq('lab_id', labId)
          .gte('created_at', monthStart),
      ]);
      const items = (itemsRes.data ?? []) as any[];
      const lowCount = items.filter(i => (i.min_quantity ?? 0) > 0 && i.quantity < i.min_quantity).length;

      let materialCost = 0;
      let wasteCost    = 0;
      const usageByItem = new Map<string, { name: string; qty: number }>();
      for (const m of (movRes.data ?? []) as any[]) {
        const cost = Number(m.quantity ?? 0) * Number(m.unit_cost_at_time ?? 0);
        if (m.type === 'OUT' && !m.is_reversed) {
          materialCost += cost;
          const cur = usageByItem.get(m.item_id) ?? { name: m.item_name, qty: 0 };
          cur.qty += Number(m.quantity ?? 0);
          usageByItem.set(m.item_id, cur);
        } else if (m.type === 'WASTE') {
          wasteCost += cost;
        }
      }
      const topUsed = Array.from(usageByItem.values()).sort((a, b) => b.qty - a.qty)[0];
      setStockSummary({
        lowCount,
        materialCostMtd: Math.round(materialCost),
        wasteCostMtd:    Math.round(wasteCost),
        topUsedName:     topUsed?.name ?? null,
      });
    } catch {}
  }, [profile?.lab_id, profile?.id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), loadProvas(), loadExtra(), loadAnalytics(), loadPipeline(), loadStockSummary()]);
    setRefreshing(false);
  };

  useEffect(() => { loadProvas(); loadExtra(); loadAnalytics(); loadPipeline(); loadStockSummary(); }, [loadStockSummary]);

  // ── Attention items (deduplicated, actionable) ──
  const unassignedCount = pipelineCounts['alindi']
    ? (pipelineCounts['alindi'] - (pipelineCounts['alindi'] || 0))
    : 0;

  const attentionItems = [
    overdueOrders.length > 0 && {
      icon: 'clock', iconColor: '#DC2626', iconBg: '#FEF2F2',
      label: 'geciken sipariş', count: overdueOrders.length,
      onPress: () => router.push('/(lab)/all-orders' as any),
    },
    todayDeliverable.length > 0 && {
      icon: 'package', iconColor: '#D97706', iconBg: '#FFFBEB',
      label: 'bugün teslim edilmesi gereken', count: todayDeliverable.length,
      onPress: () => router.push('/(lab)/all-orders' as any),
    },
    pendingCount > 0 && isManager && {
      icon: 'shield-check', iconColor: '#7C3AED', iconBg: '#EDE9FE',
      label: 'kalite kontrol onayı bekliyor', count: pendingCount,
      onPress: () => router.push('/(lab)/approvals' as any),
    },
  ].filter(Boolean) as Parameters<typeof AttentionSection>[0]['items'];

  // ── Quick action shortcuts ──
  const quickActions: QAItem[] = [
    { icon: 'plus-circle',    label: 'Yeni İş Emri', onPress: () => router.push('/(lab)/new-order' as any),  accent: '#FFFFFF', accentBg: 'rgba(255,255,255,0.15)', primary: true },
    { icon: 'clipboard-list', label: 'Siparişler',   onPress: () => router.push('/(lab)/all-orders' as any), accent: P,         accentBg: CLR.blueBg },
    { icon: 'check-circle',   label: 'Onaylar',      onPress: () => router.push('/(lab)/approvals' as any),  accent: '#7C3AED', accentBg: '#F5F3FF', badge: pendingCount > 0 ? pendingCount : undefined },
    { icon: 'building-2',     label: 'Klinikler',    onPress: () => router.push('/(lab)/clinics' as any),    accent: CLR.teal,  accentBg: CLR.tealBg },
    { icon: 'landmark',       label: 'Finans',        onPress: () => router.push('/(lab)/finance' as any),    accent: CLR.green, accentBg: CLR.greenBg },
    { icon: 'users',          label: 'İK',            onPress: () => router.push('/(lab)/ik-depo' as any),    accent: CLR.orange,accentBg: CLR.orangeBg },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ResponsiveCanvas
        size="xl"
        bgClassName="bg-page"
        padClassName="px-4 sm:px-6 lg:px-10 pt-5 pb-32"
        scrollProps={{
          refreshControl: <RefreshControl refreshing={refreshing || loading} onRefresh={handleRefresh} tintColor={P} />,
        }}
      >
        {/* ─────────────────────────────────────────────────────────────────
            HERO — canonical HeroX bileşeniyle
            ───────────────────────────────────────────────────────────────── */}
        <HeroX
          kicker={getTodayLabel()}
          title={`Hoş geldin${firstName ? `, ${firstName}` : ''}`}
          description="Bugün üretim hattında neler oluyor — günün özetine hızlıca göz at."
          actions={[
            { leftIcon: 'plus-circle',    label: 'Yeni İş Emri',                       onPress: () => router.push('/(lab)/new-order' as any) },
            { leftIcon: 'clipboard-list', label: 'Tüm Siparişler', variant: 'outline', onPress: () => router.push('/(lab)/all-orders' as any) },
            { leftIcon: 'trending-up',    label: 'Finans',          variant: 'outline', onPress: () => router.push('/(lab)/finance' as any) },
          ]}
        />

        {/* KPI grid (shadcn-style) */}
        <View className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICardX title="Bugün yeni"      value={todayNewCount}           icon="plus" />
          <KPICardX title="Geciken"          value={overdueOrders.length}    icon="alert-triangle" iconColor={overdueOrders.length > 0 ? '#DC2626' : undefined} />
          <KPICardX title="Bugün teslimat"   value={todayDeliverable.length} icon="package" />
          <KPICardX title="Prova"            value={provas.length}           icon="calendar" />
          {isManager && (
            <KPICardX title="Onay bekliyor"  value={pendingCount}            icon="shield-check" />
          )}
        </View>

        {/* ── Attention alerts ─────────────────────────────────────────── */}
        {attentionItems.length > 0 && (
          <AttentionSection items={attentionItems} />
        )}

        {/* ── Production Pipeline ──────────────────────────────────────── */}
        <ProductionPipeline
          counts={pipelineCounts}
          onStagePress={() => router.push('/(lab)/all-orders' as any)}
        />

        {/* ── Quick Actions ────────────────────────────────────────────── */}
        <View className="mt-6">
          <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-0.5">
            Hızlı Erişim
          </Text>
          <QuickActions actions={quickActions} />
        </View>

        {/* ── Main content grid ────────────────────────────────────────── */}
        <View style={[s.mainGrid, isDesktop && s.mainGridDesktop]}>

          {/* Son Siparişler */}
          <View style={[s.col, isDesktop && { flex: 2 }]}>
            <Card>
              <CardHeader
                title="Son Siparişler"
                subtitle={`Son ${recentOrders.length} sipariş`}
                right={
                  <TouchableOpacity onPress={() => router.push('/(lab)/all-orders' as any)}>
                    <Text style={s.linkBtn}>Tümünü Gör →</Text>
                  </TouchableOpacity>
                }
              />

              {/* Table header */}
              <View style={s.tableHead}>
                <Text style={[s.th, { flex: 1.2 }]}>No</Text>
                <Text style={[s.th, { flex: 2 }]}>Hekim</Text>
                {isDesktop && <Text style={[s.th, { flex: 2 }]}>İş Tipi</Text>}
                <Text style={[s.th, { flex: 1.4 }]}>Durum</Text>
                {isDesktop && <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>Teslim</Text>}
              </View>

              {recentOrders.length === 0
                ? <Text style={s.loadingText}>Yükleniyor…</Text>
                : recentOrders.map((order, idx) => {
                    const overdue = order.delivery_date < today && order.status !== 'teslim_edildi';
                    const isLast  = idx === recentOrders.length - 1;
                    const drName  = (order.doctor as any)?.full_name ?? '—';
                    return (
                      <TouchableOpacity
                        key={order.id}
                        style={[
                          s.tableRow,
                          idx % 2 === 1 && s.tableRowEven,
                          !isLast && s.rowBorder,
                          overdue && s.rowOverdue,
                          hovered === order.id && s.rowHover,
                        ]}
                        onPress={() => router.push(`/(lab)/order/${order.id}` as any)}
                        activeOpacity={0.9}
                        // @ts-ignore
                        onMouseEnter={() => setHovered(order.id)}
                        onMouseLeave={() => setHovered(null)}
                      >
                        <Text style={[s.orderNo, { flex: 1.2 }]} numberOfLines={1}>#{order.order_number}</Text>
                        <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={s.avatar}><Text style={s.avatarText}>{initials(drName)}</Text></View>
                          <Text style={s.cellMain} numberOfLines={1}>{drName}</Text>
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

          {/* Bugünün Provaları */}
          <View style={[s.col, isDesktop && { flex: 1 }]}>
            <Card>
              <CardHeader
                title="Bugünün Provaları"
                right={
                  provas.length > 0
                    ? <View style={s.countChip}><Text style={s.countChipText}>{provas.length}</Text></View>
                    : null
                }
              />
              {provasLoading
                ? <Text style={s.loadingText}>Yükleniyor…</Text>
                : provas.length === 0
                ? (
                  <View style={s.emptyBox}>
                    <View style={s.emptyIconWrap}>
                      <Text style={{ fontSize: 36 }}>🦷</Text>
                    </View>
                    <Text style={s.emptyTitle}>Bugün prova yok</Text>
                    <Text style={s.emptyText}>Planlanan prova bulunmuyor.</Text>
                  </View>
                )
                : provas.slice(0, 8).map((pv, idx) => {
                    const typeCfg = PROVA_TYPES.find(t => t.value === pv.prova_type);
                    const isLast  = idx === Math.min(provas.length, 8) - 1;
                    return (
                      <TouchableOpacity
                        key={pv.id}
                        style={[s.provaRow, !isLast && s.rowBorder]}
                        onPress={() => pv.work_order && router.push(`/(lab)/order/${pv.work_order.id}` as any)}
                        activeOpacity={0.7}
                      >
                        <View style={s.provaEmoji}>
                          <Text style={{ fontSize: 15 }}>{typeCfg?.emoji ?? '🦷'}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={s.cellMain} numberOfLines={1}>{pv.work_order?.order_number ?? '—'}</Text>
                          <Text style={s.cellSub} numberOfLines={1}>{typeCfg?.label ?? 'Prova'} #{pv.prova_number}</Text>
                        </View>
                        <StatusBadge status={pv.status} />
                      </TouchableOpacity>
                    );
                  })
              }
            </Card>
          </View>
        </View>

        {/* ── Stok & Maliyet Özeti ─────────────────────────────────── */}
        {stockSummary && (
          <Card>
            <CardHeader
              title="Stok & Maliyet"
              subtitle="Bu ay"
              right={
                <TouchableOpacity onPress={() => router.push('/(lab)/stock' as any)}>
                  <Text style={s.linkText}>Stoğa git →</Text>
                </TouchableOpacity>
              }
            />
            <View style={stk.grid}>
              <TouchableOpacity
                style={[stk.stat, stockSummary.lowCount > 0 && stk.statAlert]}
                onPress={() => router.push('/(lab)/stock' as any)}
                activeOpacity={0.85}
              >
                <Text style={[stk.statValue, stockSummary.lowCount > 0 && { color: '#DC2626' }]}>
                  {stockSummary.lowCount}
                </Text>
                <Text style={stk.statLabel}>Kritik Stok</Text>
                {stockSummary.lowCount > 0 && (
                  <Text style={stk.statHint}>min altı</Text>
                )}
              </TouchableOpacity>

              <View style={stk.stat}>
                <Text style={stk.statValue}>
                  {stockSummary.materialCostMtd.toLocaleString('tr-TR')} ₺
                </Text>
                <Text style={stk.statLabel}>Materyal Maliyeti</Text>
              </View>

              <View style={[stk.stat, stockSummary.wasteCostMtd > 0 && stk.statAlert]}>
                <Text style={[stk.statValue, stockSummary.wasteCostMtd > 0 && { color: '#DC2626' }]}>
                  {stockSummary.wasteCostMtd > 0 ? '−' : ''}{stockSummary.wasteCostMtd.toLocaleString('tr-TR')} ₺
                </Text>
                <Text style={stk.statLabel}>Fire Kaybı</Text>
              </View>
            </View>
            {stockSummary.topUsedName && (
              <Text style={stk.topUsed}>
                🏆 En çok kullanılan: <Text style={{ fontWeight: '800', color: '#0F172A' }}>{stockSummary.topUsedName}</Text>
              </Text>
            )}
          </Card>
        )}

        {/* ── Sipariş Trendi (monthly chart) ──────────────────────────── */}
        <Card>
          <CardHeader
            title="Sipariş Trendi"
            subtitle="Son 6 ay"
            right={<View style={s.chip}><Text style={s.chipText}>Aylık</Text></View>}
          />
          {monthly.length > 0
            ? <MonthlyChart data={monthly} />
            : <View style={{ height: 140, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#94A3B8', fontSize: 13 }}>Yükleniyor…</Text>
              </View>
          }
        </Card>

        {/* ── İstasyon & Teknisyen stats ───────────────────────────────── */}
        {(stationStats.length > 0 || topTechs.length > 0) && (
          <View style={[s.analyticsGrid, isDesktop && s.analyticsGridDesktop]}>
            {stationStats.length > 0 && (
              <Card style={isDesktop ? { flex: 1 } : undefined}>
                <CardHeader
                  title="İstasyon Yoğunluğu"
                  subtitle="Ortalama işlem süresi"
                />
                <StationBottleneck data={stationStats} />
              </Card>
            )}
            {topTechs.length > 0 && (
              <Card style={isDesktop ? { flex: 1 } : undefined}>
                <CardHeader
                  title="Teknisyen Performansı"
                  subtitle="Onay oranına göre"
                />
                <TopTechnicians data={topTechs} />
              </Card>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ResponsiveCanvas>
    </SafeAreaView>
  );
}

// ─── Screen styles ────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: BG },
  scroll:        { padding: 16, paddingBottom: 48, gap: 18 },
  scrollDesktop: { padding: 28, paddingTop: 24, gap: 22, maxWidth: 1600, alignSelf: 'stretch' },

  // Welcome
  welcome:      { paddingTop: 8, paddingBottom: 8, paddingHorizontal: 4, gap: 4 },
  welcomeDate:  { fontSize: 12, fontWeight: '600', color: '#94A3B8', letterSpacing: 0.5, textTransform: 'uppercase' },
  welcomeGreet: { fontSize: 30, fontWeight: '800', color: '#0F172A', letterSpacing: -0.8, lineHeight: 36 },
  welcomeSub:   { fontSize: 14, color: '#64748B', marginTop: 2 },

  // KPI row
  kpiRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiRowDesktop: { flexWrap: 'nowrap' },

  // Content grid
  mainGrid:        { gap: 16 },
  mainGridDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  col:             { gap: 0 },

  // Analytics row
  analyticsGrid:        { gap: 16 },
  analyticsGridDesktop: { flexDirection: 'row', gap: 16 },

  // Chips
  chip:     { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  countChip:     { backgroundColor: P, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, minWidth: 26, alignItems: 'center' },
  countChipText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10, paddingHorizontal: 2 },
  linkBtn: { fontSize: 13, color: P, fontWeight: '700' },
  linkText: { fontSize: 12, color: P, fontWeight: '700' },

  // Table
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: '#EEF1F6',
    backgroundColor: '#F8FAFC',
  },
  th:          { fontSize: 10, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.6 },
  tableRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, gap: 8, minHeight: 54 },
  tableRowEven:{ backgroundColor: '#FAFBFC' },
  rowBorder:   { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  rowOverdue:  { backgroundColor: '#FEF2F2' },
  rowHover:    { backgroundColor: '#EFF6FF' },

  // Prova
  provaRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 12 },
  provaEmoji: { width: 38, height: 38, borderRadius: 10, backgroundColor: CLR.blueBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DBEAFE' },

  // Cells
  orderNo:         { fontSize: 12, fontWeight: '800', color: P },
  avatar:          { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DBEAFE' },
  avatarText:      { fontSize: 9, fontWeight: '800', color: P },
  cellMain:        { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  cellSub:         { fontSize: 11, color: '#64748B' },
  cellDate:        { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  cellDateOverdue: { color: CLR.red, fontWeight: '700' },

  loadingText:   { fontSize: 13, color: '#94A3B8', padding: 24, textAlign: 'center' },
  emptyBox:      { padding: 32, alignItems: 'center', gap: 6 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:    { fontSize: 14, fontWeight: '700', color: '#334155', textAlign: 'center' },
  emptyText:     { fontSize: 12, color: '#94A3B8', textAlign: 'center' },
});

// ─── Stock summary card styles ─────────────────────────────────────────────
const stk = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  stat: {
    flex: 1, padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9',
    alignItems: 'flex-start', gap: 4,
  },
  statAlert: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  statValue: { fontSize: 18, fontWeight: '800', color: '#0F172A', letterSpacing: -0.4 },
  statLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 0.2 },
  statHint:  { fontSize: 10, fontWeight: '700', color: '#DC2626', marginTop: 1 },
  topUsed:   { fontSize: 11, color: '#64748B', paddingHorizontal: 16, paddingBottom: 12 },
});
