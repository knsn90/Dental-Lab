// modules/station/screens/AnalyticsScreen.tsx
// Üretim analitiği — istasyon darboğaz, teknisyen performans, iş emri metrikleri

import React, { useCallback, useEffect, useState, useContext } from 'react';
import { HubContext } from '../../../core/ui/HubContext';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect, Text as SvgText, Line, G } from 'react-native-svg';
import { useAuthStore } from '../../../core/store/authStore';
import { supabase } from '../../../core/api/supabase';
import { AppIcon } from '../../../core/ui/AppIcon';

const ACCENT = '#2563EB';

// ── Tipler ────────────────────────────────────────────────────────────────────

interface StationStat {
  station_id: string;
  station_name: string;
  total_stages: number;
  completed: number;
  rejected: number;
  avg_duration_min: number | null;
  median_duration_min: number | null;
  avg_wait_min: number | null;
}

interface TechStat {
  technician_id: string;
  full_name: string;
  total_stages: number;
  approved: number;
  rejected: number;
  approval_rate_pct: number | null;
  avg_duration_min: number | null;
}

interface OrderSummary {
  total_active: number;
  asamada: number;
  completed_today: number;
  overdue: number;
  rush_active: number;
  avg_delivery_days: number;
}

interface DeliverySummary {
  total: number;
  yolda: number;
  teslim_edildi_30d: number;
  iade: number;
}

// ── Veri çekme ────────────────────────────────────────────────────────────────

async function fetchAnalytics(labId: string) {
  const today    = new Date().toISOString().split('T')[0];
  const month30  = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [stationRes, techRes, ordersRes, delivRes] = await Promise.all([
    // İstasyon analitik view
    supabase
      .from('v_station_analytics')
      .select('*')
      .order('avg_duration_min', { ascending: false }),

    // Teknisyen performans view
    supabase
      .from('v_technician_performance')
      .select('*')
      .gt('total_stages', 0)
      .order('approved', { ascending: false }),

    // Aktif iş emirleri özeti
    supabase
      .from('work_orders')
      .select('status, delivery_date, is_rush, created_at')
      .neq('status', 'teslim_edildi'),

    // Teslimat özeti (son 30 gün)
    supabase
      .from('deliveries')
      .select('status, delivered_at')
      .gte('assigned_at', month30),
  ]);

  const orders    = (ordersRes.data ?? []) as any[];
  const deliveries = (delivRes.data ?? []) as any[];

  const orderSummary: OrderSummary = {
    total_active:    orders.length,
    asamada:         orders.filter(o => o.status === 'asamada').length,
    completed_today: 0, // order_events'ten hesaplanabilir — şimdilik 0
    overdue:         orders.filter(o => o.delivery_date < today).length,
    rush_active:     orders.filter(o => o.is_rush).length,
    avg_delivery_days: 0,
  };

  const delivSummary: DeliverySummary = {
    total:             deliveries.length,
    yolda:             deliveries.filter(d => d.status === 'yolda').length,
    teslim_edildi_30d: deliveries.filter(d => d.status === 'teslim_edildi').length,
    iade:              deliveries.filter(d => d.status === 'iade').length,
  };

  return {
    stations:  (stationRes.data ?? []) as StationStat[],
    techs:     (techRes.data ?? []) as TechStat[],
    orderSummary,
    delivSummary,
  };
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function fmtDur(min: number | null): string {
  if (min == null) return '—';
  if (min < 60)   return `${min}dk`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}s ${m}dk` : `${h}s`;
}

function pctColor(pct: number | null): string {
  if (pct == null) return '#94A3B8';
  if (pct >= 90)   return '#16A34A';
  if (pct >= 70)   return '#F59E0B';
  return '#EF4444';
}

// ── SVG Yatay Çubuk Grafiği ───────────────────────────────────────────────────

function HBarChart({
  data,
  valueKey,
  labelKey,
  colorKey,
  unit = '',
  maxLabel = '',
}: {
  data: any[];
  valueKey: string;
  labelKey: string;
  colorKey?: string;
  unit?: string;
  maxLabel?: string;
}) {
  const { width } = useWindowDimensions();
  const chartW = Math.min(width - 64, 600);
  const barH   = 22;
  const gap    = 10;
  const labelW = 100;
  const barAreaW = chartW - labelW - 48; // 48 = value text width

  const vals = data.map(d => Number(d[valueKey]) || 0);
  const maxVal = Math.max(...vals, 1);

  const svgH = data.length * (barH + gap) + 10;

  const PALETTE = ['#2563EB','#7C3AED','#16A34A','#F59E0B','#EF4444','#06B6D4','#EC4899'];

  return (
    <Svg width={chartW} height={svgH}>
      {data.map((row, i) => {
        const val     = Number(row[valueKey]) || 0;
        const barW    = val === 0 ? 2 : Math.max(4, (val / maxVal) * barAreaW);
        const y       = i * (barH + gap) + 5;
        const color   = colorKey && row[colorKey] ? row[colorKey] : PALETTE[i % PALETTE.length];
        const label   = String(row[labelKey] ?? '').slice(0, 14);

        return (
          <G key={i}>
            {/* İstasyon / teknisyen adı */}
            <SvgText
              x={0} y={y + barH / 2 + 4}
              fontSize={11} fill="#64748B"
              fontWeight="500"
            >
              {label}
            </SvgText>
            {/* Bar arka planı */}
            <Rect
              x={labelW} y={y}
              width={barAreaW} height={barH}
              rx={6} fill="#F1F5F9"
            />
            {/* Bar */}
            <Rect
              x={labelW} y={y}
              width={barW} height={barH}
              rx={6} fill={color}
              opacity={0.85}
            />
            {/* Değer */}
            <SvgText
              x={labelW + barW + 6} y={y + barH / 2 + 4}
              fontSize={11} fill="#1E293B"
              fontWeight="700"
            >
              {val}{unit}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ── Stat Kartı ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color, icon,
}: {
  label: string; value: string | number;
  sub?: string; color: string; icon: string;
}) {
  return (
    <View style={[sc.card, { borderColor: color + '30' }]}>
      <View style={[sc.iconWrap, { backgroundColor: color + '15' }]}>
        <AppIcon name={icon as any} set="mci" size={18} color={color} />
      </View>
      <Text style={[sc.value, { color }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
      {sub && <Text style={sc.sub}>{sub}</Text>}
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14,
    padding: 14, borderWidth: 1, gap: 4,
    shadowColor: '#000', shadowOpacity: 0.04,
    shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  value:    { fontSize: 26, fontWeight: '800' },
  label:    { fontSize: 12, color: '#64748B', fontWeight: '600' },
  sub:      { fontSize: 11, color: '#94A3B8' },
});

// ── Teknisyen Satırı ─────────────────────────────────────────────────────────

function TechRow({ tech, rank }: { tech: TechStat; rank: number }) {
  const pct   = tech.approval_rate_pct ?? 0;
  const color = pctColor(tech.approval_rate_pct);

  return (
    <View style={tr.row}>
      <View style={tr.rank}>
        <Text style={tr.rankText}>{rank}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={tr.name}>{tech.full_name}</Text>
        <Text style={tr.meta}>
          {tech.total_stages} aşama · {tech.approved} onaylı · {tech.rejected} reddedildi
        </Text>
        {/* Onay oranı bar */}
        <View style={tr.barBg}>
          <View style={[tr.barFill, { width: `${Math.min(pct, 100)}%` as any, backgroundColor: color }]} />
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[tr.pct, { color }]}>
          {tech.approval_rate_pct != null ? `%${tech.approval_rate_pct}` : '—'}
        </Text>
        <Text style={tr.dur}>{fmtDur(tech.avg_duration_min)}</Text>
      </View>
    </View>
  );
}

const tr = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  rank:     { width: 26, height: 26, borderRadius: 13, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 12, fontWeight: '800', color: ACCENT },
  name:     { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  meta:     { fontSize: 11, color: '#94A3B8' },
  barBg:    { height: 4, backgroundColor: '#F1F5F9', borderRadius: 2, overflow: 'hidden' },
  barFill:  { height: 4, borderRadius: 2 },
  pct:      { fontSize: 15, fontWeight: '800' },
  dur:      { fontSize: 11, color: '#94A3B8' },
});

// ── Bölüm Başlığı ─────────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>{title}</Text>
      {sub && <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{sub}</Text>}
    </View>
  );
}

// ── Ana Ekran ─────────────────────────────────────────────────────────────────

export function AnalyticsScreen() {
  const { profile } = useAuthStore();
  const { width }   = useWindowDimensions();
  const isEmbedded  = useContext(HubContext);

  const [data,       setData]       = useState<Awaited<ReturnType<typeof fetchAnalytics>> | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period,     setPeriod]     = useState<'7' | '30' | '90'>('30');

  const load = useCallback(async () => {
    const labId = profile?.lab_id;
    if (!labId) return;
    setLoading(true);
    const result = await fetchAnalytics(labId);
    setData(result);
    setLoading(false);
  }, [profile?.lab_id]);

  useEffect(() => { load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const isWide = width >= 768;

  return (
    <SafeAreaView style={s.container} edges={isEmbedded ? ([] as any) : ['top']}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Üretim Analitiği</Text>
          <Text style={s.sub}>İstasyon darboğaz · Teknisyen performansı</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={load}>
          <AppIcon name="refresh-cw" size={18} color={ACCENT} />
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={{ color: '#94A3B8', marginTop: 12 }}>Veriler yükleniyor…</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ACCENT} />
          }
        >
          {/* ── 1. Özet Stat Kartları ── */}
          <View>
            <SectionHeader title="Genel Durum" />
            <View style={[s.statGrid, isWide && s.statGridWide]}>
              <StatCard
                label="Aktif İş Emri"
                value={data?.orderSummary.total_active ?? 0}
                sub={`${data?.orderSummary.asamada ?? 0} üretimde`}
                color={ACCENT}
                icon="clipboard-list-outline"
              />
              <StatCard
                label="Geciken"
                value={data?.orderSummary.overdue ?? 0}
                color="#EF4444"
                icon="clock-alert-outline"
              />
              <StatCard
                label="Acil"
                value={data?.orderSummary.rush_active ?? 0}
                color="#F59E0B"
                icon="lightning-bolt"
              />
              <StatCard
                label="Yolda / 30gün"
                value={`${data?.delivSummary.teslim_edildi_30d ?? 0}`}
                sub={`${data?.delivSummary.iade ?? 0} iade`}
                color="#16A34A"
                icon="truck-fast-outline"
              />
            </View>
          </View>

          {/* ── 2. İstasyon Darboğaz Analizi ── */}
          {data && data.stations.length > 0 && (
            <View style={s.card}>
              <SectionHeader
                title="İstasyon Darboğaz"
                sub="Ort. süreye göre sıralı — uzun süre = darboğaz"
              />
              <HBarChart
                data={data.stations.filter(st => st.avg_duration_min != null)}
                valueKey="avg_duration_min"
                labelKey="station_name"
                unit="dk"
              />
              {/* Bekleme süreleri */}
              {data.stations.some(st => st.avg_wait_min != null && st.avg_wait_min > 0) && (
                <>
                  <View style={{ height: 1, backgroundColor: '#F1F5F9', marginVertical: 16 }} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 10 }}>
                    Ortalama Bekleme Süresi (atama → başlama)
                  </Text>
                  <HBarChart
                    data={data.stations.filter(st => st.avg_wait_min != null && st.avg_wait_min > 0)
                      .sort((a, b) => (b.avg_wait_min ?? 0) - (a.avg_wait_min ?? 0))}
                    valueKey="avg_wait_min"
                    labelKey="station_name"
                    unit="dk"
                  />
                </>
              )}
            </View>
          )}

          {/* ── 3. İstasyon Özet Tablosu ── */}
          {data && data.stations.length > 0 && (
            <View style={s.card}>
              <SectionHeader title="İstasyon Özeti" />
              <View style={tbl.header}>
                <Text style={[tbl.cell, { flex: 2 }]}>İstasyon</Text>
                <Text style={tbl.cell}>Toplam</Text>
                <Text style={tbl.cell}>Tamamlandı</Text>
                <Text style={tbl.cell}>Red</Text>
                <Text style={tbl.cell}>Ort. Süre</Text>
              </View>
              {data.stations.map(st => (
                <View key={st.station_id} style={tbl.row}>
                  <Text style={[tbl.cellVal, { flex: 2 }]} numberOfLines={1}>{st.station_name}</Text>
                  <Text style={tbl.cellVal}>{st.total_stages}</Text>
                  <Text style={[tbl.cellVal, { color: '#16A34A' }]}>{st.completed}</Text>
                  <Text style={[tbl.cellVal, { color: st.rejected > 0 ? '#EF4444' : '#94A3B8' }]}>{st.rejected}</Text>
                  <Text style={[tbl.cellVal, { color: ACCENT }]}>{fmtDur(st.avg_duration_min)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── 4. Teknisyen Performansı ── */}
          {data && data.techs.length > 0 && (
            <View style={s.card}>
              <SectionHeader
                title="Teknisyen Performansı"
                sub="Onay oranı ve ortalama süre"
              />
              {/* Onay oranı bar grafiği */}
              <HBarChart
                data={data.techs
                  .filter(t => t.approval_rate_pct != null)
                  .map(t => ({ ...t, approval_rate_pct_safe: Math.round(t.approval_rate_pct ?? 0) }))}
                valueKey="approval_rate_pct_safe"
                labelKey="full_name"
                unit="%"
              />

              <View style={{ height: 1, backgroundColor: '#F1F5F9', marginVertical: 16 }} />

              {/* Detay listesi */}
              {data.techs.map((t, i) => (
                <TechRow key={t.technician_id} tech={t} rank={i + 1} />
              ))}
            </View>
          )}

          {/* ── 5. Boş durum ── */}
          {data && data.stations.length === 0 && data.techs.length === 0 && (
            <View style={s.emptyBox}>
              <AppIcon name="chart-bar-stacked" set="mci" size={48} color="#CBD5E1" />
              <Text style={s.emptyTitle}>Henüz Veri Yok</Text>
              <Text style={s.emptySub}>
                İstasyonlara iş emirleri atandıkça burada analitik veriler görünür.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Tablo stilleri ────────────────────────────────────────────────────────────

const tbl = StyleSheet.create({
  header: {
    flexDirection: 'row', paddingVertical: 6,
    borderBottomWidth: 2, borderBottomColor: '#E2E8F0', marginBottom: 4,
  },
  row: {
    flexDirection: 'row', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#F8FAFC',
  },
  cell:    { flex: 1, fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },
  cellVal: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1E293B' },
});

// ── Ana stiller ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  title:      { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  sub:        { fontSize: 13, color: '#64748B', marginTop: 2 },
  refreshBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOpacity: 0.04,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statGridWide: { flexWrap: 'nowrap' },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyBox: {
    backgroundColor: '#fff', borderRadius: 16, padding: 40,
    alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#475569' },
  emptySub:   { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 22 },
});
