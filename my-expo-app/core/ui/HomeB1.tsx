/**
 * HomeB1 — Variant B mobile home composition (Hero + KPI ribbon + Featured stack + Insight).
 * Mobile-only. Web/desktop callers should keep their existing dashboards.
 */
import React from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { ArrowLeft, ArrowRight, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react-native';
import Svg, { Polyline, Circle as SvgCircle } from 'react-native-svg';
import { DS } from '../theme/dsTokens';
import { MFONT, MSIZE, useMobileTheme, type MobileRole } from '../theme/mobileTheme';
import { isRTL } from '../i18n';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface KpiItem {
  label: string;
  value: string;
  delta?: string;
  up?: boolean;
  spark?: number[];
}

export interface PriorityOrder {
  id: string;
  type: string;             // case type ("Tek kron" vb.)
  due: string;              // formatted due date
  status: string;           // status key
  statusLabel: string;
  clinic: string;
  teeth?: string;
  avatar: string;           // initials or short label
}

export interface HomeB1Props {
  /** Role-themed eyebrow ("42 aktif vaka") */
  kicker: string;
  /** 38px headline copy */
  headline: string;
  /** Optional italic accent inside headline (will be inlined) */
  headlineAccent?: string;
  /** Sub copy under headline */
  sub: string;
  /** Primary CTA */
  primaryAction?: { label: string; onPress: () => void };
  /** Secondary surface CTA */
  secondaryAction?: { label: string; onPress: () => void };
  /** 4 KPI cells (only first 4 shown) */
  kpis: KpiItem[];
  /** Up to 3 priority orders */
  priority: PriorityOrder[];
  onOpenOrder?: (order: PriorityOrder) => void;
  onSeeAllOrders?: () => void;
  /** Insight copy (one sentence) */
  insight?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
export function HomeB1(props: HomeB1Props) {
  const theme = useMobileTheme();
  const { kicker, headline, headlineAccent, sub, primaryAction, secondaryAction,
          kpis, priority, onOpenOrder, onSeeAllOrders, insight, refreshing, onRefresh } = props;

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingBottom: 140 }}
      refreshControl={onRefresh
        ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.accent} />
        : undefined}
      showsVerticalScrollIndicator={false}
    >
      {/* ════ HERO ════ */}
      <View style={[styles.hero, { backgroundColor: theme.bgDeep }]}>
        {/* Decorative orbs */}
        <View style={[styles.orbBig, { backgroundColor: theme.primary }]} />
        <View style={[styles.orbSmall, { backgroundColor: theme.accent }]} />

        <View style={styles.heroContent}>
          {/* Eyebrow pill */}
          <View style={[styles.eyebrowPill, { backgroundColor: theme.accent }]}>
            <View style={[styles.eyebrowDot, { backgroundColor: theme.primary }]} />
            <Text style={styles.eyebrowText}>{kicker}</Text>
          </View>

          {/* Headline */}
          <Text style={styles.headline}>
            {headline}
            {headlineAccent ? (
              <Text style={[styles.headlineAccent, { color: DS.ink[500] }]}>
                {' '}{headlineAccent}
              </Text>
            ) : null}
          </Text>

          {/* Sub */}
          <Text style={styles.sub}>{sub}</Text>

          {/* Action row */}
          {(primaryAction || secondaryAction) && (
            <View style={styles.actionRow}>
              {primaryAction && (
                <Pressable
                  onPress={primaryAction.onPress}
                  style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
                >
                  <Text style={[styles.primaryBtnText, { color: theme.surface }]}>
                    {primaryAction.label}
                  </Text>
                  {isRTL() ? <ArrowLeft size={16} color={theme.surface} strokeWidth={2} />
                           : <ArrowRight size={16} color={theme.surface} strokeWidth={2} />}
                </Pressable>
              )}
              {secondaryAction && (
                <Pressable
                  onPress={secondaryAction.onPress}
                  style={styles.surfaceBtn}
                >
                  <Text style={styles.surfaceBtnText}>{secondaryAction.label}</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>

      {/* ════ KPI RIBBON (overlapping) ════ */}
      {kpis.length > 0 && (
        <View style={styles.kpiWrap}>
          <View style={styles.kpiCard}>
            <View style={styles.kpiGrid}>
              {kpis.slice(0, 4).map((k, i) => (
                <View key={i} style={styles.kpiCell}>
                  <Text style={styles.kpiLabel}>{k.label.toUpperCase()}</Text>
                  <Text style={styles.kpiValue}>{k.value}</Text>
                  {(k.spark || k.delta) && (
                    <View style={styles.kpiDeltaRow}>
                      {k.spark && k.spark.length > 1 && (
                        <Sparkline data={k.spark} color={theme.primaryDeep} width={48} height={14} />
                      )}
                      {k.delta && (
                        <Text style={[styles.kpiDelta, { color: k.up ? '#1F6B47' : '#8A2E2E' }]}>
                          {k.delta}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* ════ FEATURED STACK ════ */}
      {priority.length > 0 && (
        <View style={{ paddingTop: 24 }}>
          <View style={styles.sectionHead}>
            <View>
              <Text style={styles.sectionEyebrow}>ÖNCELİK</Text>
              <Text style={styles.sectionTitle}>Bugünün vakaları</Text>
            </View>
            {onSeeAllOrders && (
              <Pressable onPress={onSeeAllOrders} hitSlop={8}>
                <Text style={[styles.seeAll, { color: theme.accent }]}>Tümü</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.stackCol}>
            {priority.slice(0, 3).map((o, i) => (
              <PriorityCard
                key={o.id}
                order={o}
                index={i}
                theme={theme}
                onPress={onOpenOrder ? () => onOpenOrder(o) : undefined}
              />
            ))}
          </View>
        </View>
      )}

      {/* ════ INSIGHT BLOCK ════ */}
      {insight && (
        <View style={{ padding: 24, paddingTop: 24 }}>
          <View style={[styles.insightCard, { backgroundColor: theme.bgSoft }]}>
            <Sparkles size={18} color={theme.accent} strokeWidth={1.8} />
            <Text style={styles.insightEyebrow}>İÇGÖRÜ</Text>
            <Text style={styles.insightBody}>{insight}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Priority Card ───────────────────────────────────────────────────────────
function PriorityCard({
  order, index, theme, onPress,
}: {
  order: PriorityOrder;
  index: number;
  theme: { accent: string; primary: string; surface: string };
  onPress?: () => void;
}) {
  const dark = index === 0;
  const primary = index === 1;
  const surfaceCard = index === 2;

  const bg = dark ? theme.accent : primary ? theme.primary : theme.surface;
  const fg = dark ? theme.surface : DS.ink[900];
  const meta = dark ? 'rgba(255,255,255,0.7)' : DS.ink[500];
  const subMeta = dark ? 'rgba(255,255,255,0.75)' : DS.ink[700];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}>
      <View style={[styles.priorityCard, { backgroundColor: bg, borderWidth: surfaceCard ? 1 : 0, borderColor: 'rgba(0,0,0,0.06)' }]}>
        {/* Watermark id */}
        <Text style={[styles.priorityWatermark, {
          color: fg,
          opacity: dark ? 0.10 : primary ? 0.18 : 0.06,
        }]}>{order.id}</Text>

        <View style={{ position: 'relative', zIndex: 1 }}>
          <Text style={[styles.priorityEyebrow, { color: meta }]}>
            {order.statusLabel.toUpperCase()} · {order.due}
          </Text>
          <Text style={[styles.priorityType, { color: fg }]} numberOfLines={2}>
            {order.type}
          </Text>
          <Text style={[styles.priorityMeta, { color: subMeta }]} numberOfLines={1}>
            {order.clinic}{order.teeth ? ` · Diş ${order.teeth}` : ''}
          </Text>

          <View style={styles.priorityFooter}>
            <View style={[styles.priorityAvatar, { backgroundColor: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)' }]}>
              <Text style={[styles.priorityAvatarText, { color: dark ? '#FFF' : DS.ink[900] }]}>
                {order.avatar}
              </Text>
            </View>
            <View style={[styles.priorityChevron, {
              backgroundColor: dark ? 'rgba(255,255,255,0.18)' : theme.accent,
            }]}>
              {isRTL() ? <ChevronLeft size={18} color={dark ? '#FFF' : theme.surface} strokeWidth={2} />
                       : <ChevronRight size={18} color={dark ? '#FFF' : theme.surface} strokeWidth={2} />}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Sparkline ───────────────────────────────────────────────────────────────
function Sparkline({ data, color, width, height }: {
  data: number[]; color: string; width: number; height: number;
}) {
  if (data.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <SvgCircle
        cx={width}
        cy={height - ((data[data.length - 1] - min) / range) * height}
        r={1.6}
        fill={color}
      />
    </Svg>
  );
}

// ─── Role helper: build hero copy from role ──────────────────────────────────
export function defaultHeroCopy(role: MobileRole, opts?: {
  activeCount?: number;
  pendingCount?: number;
  monthlyRevenue?: string;
}): { kicker: string; headline: string; sub: string } {
  if (role === 'lab') {
    return {
      kicker: `${opts?.activeCount ?? 0} aktif vaka`,
      headline: `Bugün sizinle ${opts?.pendingCount ?? 0} vaka teslim.`,
      sub: 'Vardiyanız 08:00–18:00, kapasitenizi planlayın.',
    };
  }
  if (role === 'clinic') {
    return {
      kicker: `${opts?.activeCount ?? 0} aktif sipariş`,
      headline: `${opts?.pendingCount ?? 0} onayınız bekliyor.`,
      sub: 'Lab tasarımları gönderdi, hekim onayı için 2 dakika.',
    };
  }
  // exec
  return {
    kicker: 'Mayıs · Hafta 18',
    headline: `${opts?.monthlyRevenue ?? '₺0'} aylık ciro.`,
    sub: 'Geçen aya göre değişimi ve hedefe kalan süreyi inceleyin.',
  };
}

export function defaultInsight(role: MobileRole): string {
  if (role === 'lab')    return 'Bu hafta zirkon vakalar artıyor — materyal stoğunuzu kontrol edin.';
  if (role === 'clinic') return 'Geçen ay teslim edilen vakaların ortalama süresi ekranlarınızda.';
  return 'Yüksek ciro üreten klinik segmentlerinizi gözden geçirin.';
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 24,
    paddingTop: 96,
    paddingBottom: 40,
    overflow: 'hidden',
    position: 'relative',
  },
  orbBig: {
    position: 'absolute',
    top: -80,
    end: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.45,
  },
  orbSmall: {
    position: 'absolute',
    top: 30,
    end: 30,
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.9,
  },
  heroContent: {
    position: 'relative',
    zIndex: 1,
    marginTop: 28,
  },

  eyebrowPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingStart: 6,
    paddingEnd: 12,
    borderRadius: 999,
    gap: 6,
  },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3 },
  eyebrowText: {
    color: '#FFFFFF',
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    letterSpacing: -0.05,
  },

  headline: {
    color: DS.ink[900],
    fontFamily: MFONT.uiLight,
    fontSize: MSIZE.display,
    fontWeight: '300',
    letterSpacing: -1.7,    // ~ -0.045em on 38px
    lineHeight: 38,
    marginTop: 14,
  },
  headlineAccent: {
    fontFamily: MFONT.serifItalic,
    fontStyle: 'italic',
  },

  sub: {
    color: DS.ink[700],
    fontFamily: MFONT.uiRegular,
    fontSize: MSIZE.body,
    lineHeight: 21,
    marginTop: 14,
    maxWidth: '88%',
  },

  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 22,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  primaryBtnText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
    letterSpacing: -0.2,
  },
  surfaceBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  surfaceBtnText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
    color: DS.ink[900],
    letterSpacing: -0.2,
  },

  // KPI ribbon
  kpiWrap: {
    paddingHorizontal: 16,
    marginTop: -18,
    position: 'relative',
    zIndex: 2,
  },
  kpiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  kpiCell: {
    width: '50%',
    padding: 4,
  },
  kpiLabel: {
    fontFamily: MFONT.uiMedium,
    fontSize: 10,
    color: DS.ink[500],
    letterSpacing: 0.6,
  },
  kpiValue: {
    fontFamily: MFONT.uiLight,
    fontSize: 24,
    fontWeight: '300',
    color: DS.ink[900],
    letterSpacing: -0.84,    // ~ -0.035em on 24px
    marginTop: 2,
  },
  kpiDeltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  kpiDelta: {
    fontFamily: MFONT.uiMedium,
    fontSize: 10,
  },

  // Section header
  sectionHead: {
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionEyebrow: {
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    color: DS.ink[500],
    letterSpacing: 0.88,
  },
  sectionTitle: {
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 24,
    color: DS.ink[900],
    letterSpacing: -0.72,
    lineHeight: 26,
    marginTop: 2,
  },
  seeAll: {
    fontFamily: MFONT.uiMedium,
    fontSize: 13,
  },

  // Featured stack
  stackCol: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 10,
  },
  priorityCard: {
    padding: 18,
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
  },
  priorityWatermark: {
    position: 'absolute',
    end: -20,
    top: -10,
    fontSize: 84,
    fontFamily: MFONT.uiThin,
    fontWeight: '200',
    letterSpacing: -4.2,
  },
  priorityEyebrow: {
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    letterSpacing: 0.66,
  },
  priorityType: {
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 24,
    letterSpacing: -0.84,
    lineHeight: 26,
    marginTop: 6,
  },
  priorityMeta: {
    fontFamily: MFONT.uiRegular,
    fontSize: 13,
    marginTop: 6,
  },
  priorityFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  priorityAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityAvatarText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 11,
  },
  priorityChevron: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Insight
  insightCard: {
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  insightEyebrow: {
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    color: DS.ink[500],
    letterSpacing: 0.66,
    marginTop: 10,
  },
  insightBody: {
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 18,
    color: DS.ink[900],
    letterSpacing: -0.45,
    lineHeight: 23,
    marginTop: 4,
  },
});
