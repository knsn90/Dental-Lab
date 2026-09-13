/**
 * PerformanceScreen — Teknisyen Performans Tablosu (Patterns Design Language)
 *
 * Desktop-first table/grid. Multiple technicians in one view.
 * Uses report_technician_performance RPC for real operational data.
 * Sorting, date range filters, material type filter.
 *
 * Patterns: cardSolid, tableCard (§09), DISPLAY font, DS tokens, chip tones,
 *           §03 pill buttons, Lucide icons.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { weekdayOffset } from '../../../core/i18n';
import { HeroGlow, useHeroSurface } from '../../../core/ui/HeroGlow';
import { router, useSegments } from 'expo-router';
import { RemakeQualityCard } from '../components/RemakeQualityCard';
import {
  View, Text, ScrollView, Pressable,
  Platform, useWindowDimensions,
} from 'react-native';
import {
  Calendar, Users, AlertTriangle, Wrench,
  TrendingUp, TrendingDown, Clock, Filter,
  ChevronDown, ChevronUp, BarChart3, Flame,
  DollarSign, Timer, Zap, ArrowUpDown, Star,
} from '../../../core/ui/icons';

import { supabase }     from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { DS }           from '../../../core/theme/dsTokens';
import { useInkUI, type InkUI } from '../../../core/theme/inkScale';
import { MobilePageTitle } from '../../../core/ui/mobile/MobilePageTitle';
import { HubContext } from '../../../core/ui/HubContext';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { baseSymbol, useBaseCurrency } from '../../../core/money/baseCurrency';

// ── Patterns design tokens ──────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};




// ── Types ───────────────────────────────────────────────────────────
interface PerfRow {
  user_id:             string;
  user_name:           string | null;
  hourly_rate:         number;
  used_qty:            number;
  used_cost:           number;
  waste_qty:           number;
  waste_cost:          number;
  efficiency_pct:      number | null;
  labor_minutes:       number;
  labor_hours:         number;
  labor_cost:          number;
  orders_worked:       number;
  profit_contribution: number;
  // v_technician_performance_detail
  quality_pct?:        number | null;
  on_time_pct?:        number | null;
  avg_queue_wait_sec?: number | null;
  monthly_rework?:     number;
  composite_score?:    number;
  // Müşteri (hekim/klinik) değerlendirmesi — Faz 3
  customer_rating?:    number | null;   // 1–5 ortalama (genel)
  review_count?:       number;
}

type Range   = 'thisWeek' | 'thisMonth' | 'thisYear' | 'all';
type SortKey = 'efficiency' | 'profit' | 'waste' | 'labor' | 'orders' | 'quality' | 'composite';
type SortDir = 'asc' | 'desc';

const RANGE_OPTIONS: { key: Range; label: string }[] = [
  { key: 'thisWeek',  label: 'Bu Hafta' },
  { key: 'thisMonth', label: 'Bu Ay'    },
  { key: 'thisYear',  label: 'Bu Yıl'   },
  { key: 'all',       label: 'Tümü'     },
];

const MATERIAL_TYPES = [
  { key: 'all',      label: 'Tüm Materyal' },
  { key: 'zirconia', label: 'Zirkonya' },
  { key: 'emax',     label: 'E-max' },
  { key: 'pmma',     label: 'PMMA' },
  { key: 'metal',    label: 'Metal' },
  { key: 'glaze',    label: 'Glaze' },
];

const fmt  = (n: number | null | undefined) => (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const fmt1 = (n: number | null | undefined) => (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const fmtCur = (n: number | null | undefined) => {
  const v = Number(n) || 0;
  return (v >= 0 ? '' : '−') + fmt(Math.abs(v)) + ' ' + baseSymbol();
};

function getRange(r: Range): { from: string | null; to: string | null } {
  const now  = new Date();
  const yyyy = now.getFullYear();
  const mm   = now.getMonth();
  const pad  = (n: number) => String(n).padStart(2, '0');
  const ymd  = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (r === 'thisWeek') {
    // Hafta başlangıcı bölgeye bağlı: TR/AB Pazartesi, İran Cumartesi (weekdayOffset).
    const start = new Date(now); start.setDate(now.getDate() - weekdayOffset(now.getDay()));
    return { from: ymd(start), to: ymd(now) };
  }
  if (r === 'thisMonth') return { from: ymd(new Date(yyyy, mm, 1)), to: ymd(new Date(yyyy, mm + 1, 0)) };
  if (r === 'thisYear')  return { from: `${yyyy}-01-01`,            to: `${yyyy}-12-31` };
  // 'all' (Tümü): RPC tarih aralığını BETWEEN ile kullanıyor; null gönderince boş
  // döner. Geniş bir aralıkla tüm kayıtları kapsa.
  return { from: '2000-01-01', to: `${yyyy + 1}-12-31` };
}

/** Saf yardımcı — hook ÇAĞIRMAZ (koşullu/döngü içinde çağrılıyor); tonları U'dan alır. */
function effTone(U: InkUI, eff: number | null) {
  if (eff === null) return U.chipTones.neutral;
  if (eff < 85) return U.chipTones.danger;
  if (eff < 95) return U.chipTones.warning;
  return U.chipTones.success;
}

function profitTone(U: InkUI, p: number) {
  if (p > 0) return U.chipTones.success;
  if (p < 0) return U.chipTones.danger;
  return U.chipTones.neutral;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════
export function PerformanceScreen() {
  const U = useInkUI();
  // Sipariş linki AKTİF panelde açılsın (admin panelinden lab'a atmasın)
  const panelBase = String((useSegments() as string[])?.[0] ?? '(lab)');
  const { profile } = useAuthStore();
  const { width }   = useWindowDimensions();
  const isWide      = width >= 900;
  const labId       = profile?.lab_id ?? profile?.id ?? null;
  const isHub       = useHubContext();
  const panelTheme  = usePanelTheme();
  const accentColor = panelTheme.primary;
  const heroBg = useHeroSurface(accentColor);
  useBaseCurrency();

  const [range, setRange]       = useState<Range>('thisMonth');
  const [matType, setMatType]   = useState('all');
  const [sortKey, setSortKey]   = useState<SortKey>('profit');
  const [sortDir, setSortDir]   = useState<SortDir>('desc');
  const [rows, setRows]         = useState<PerfRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [matOpen, setMatOpen]   = useState(false);

  // ── Data fetch ─────────────────────────────────────────────────
  useEffect(() => {
    if (!labId) return;
    let cancelled = false;
    setLoading(true);
    const { from, to } = getRange(range);
    // RPC + v_technician_performance_detail paralel — sonra user_id ile birleştir
    Promise.all([
      supabase.rpc('report_technician_performance', {
        p_lab_id:        labId,
        p_from:          from,
        p_to:            to,
        p_material_type: matType === 'all' ? null : matType,
      }),
      supabase
        .from('v_technician_performance_detail')
        .select('technician_id, quality_pct, on_time_pct, avg_queue_wait_sec, monthly_rework_count, avg_duration_min'),
      supabase.rpc('report_technician_ratings', { p_lab_id: labId, p_from: from, p_to: to }),
    ]).then(async ([rpcRes, perfRes, ratingRes]) => {
      if (cancelled) return;
      const rpcRows = (rpcRes.data ?? []) as PerfRow[];
      const perfRows = (perfRes.data ?? []) as any[];
      const ratingRows = (ratingRes.data ?? []) as any[];
      const ratingMap = new Map<string, any>();
      ratingRows.forEach((r: any) => ratingMap.set(r.user_id, r));

      // RPC + view birleşimi — view tüm aktif teknisyenleri içerir; RPC sadece
      // o aralıkta operasyonel verisi olanları döner. Union: ikisinden birinde
      // varsa göster.
      const allIds = Array.from(new Set([
        ...rpcRows.map(r => r.user_id),
        ...perfRows.map(p => p.technician_id),
      ]));
      const rpcMap = new Map<string, PerfRow>();
      rpcRows.forEach(r => rpcMap.set(r.user_id, r));
      const nameMap = new Map<string, string | null>();
      rpcRows.forEach(r => nameMap.set(r.user_id, r.user_name));
      const missingIds = allIds.filter(id => !nameMap.has(id));
      if (missingIds.length > 0) {
        const { data: nameRows } = await supabase
          .from('profiles').select('id, full_name').in('id', missingIds);
        (nameRows ?? []).forEach((p: any) => nameMap.set(p.id, p.full_name));
      }
      if (cancelled) return;

      const base: PerfRow[] = allIds.map(id => {
        const rpc = rpcMap.get(id);
        return rpc ?? {
          user_id: id, user_name: nameMap.get(id) ?? '—',
          hourly_rate: 0, used_qty: 0, used_cost: 0, waste_qty: 0, waste_cost: 0,
          efficiency_pct: null, labor_minutes: 0, labor_hours: 0, labor_cost: 0,
          orders_worked: 0, profit_contribution: 0,
        };
      });

      const perfMap = new Map<string, any>();
      perfRows.forEach((p: any) => perfMap.set(p.technician_id, p));

      const norm = (val: number | null | undefined, idealLow: number, idealHigh: number) => {
        if (val == null) return 50;
        if (val <= idealLow) return 100;
        if (val >= idealHigh) return 0;
        return Math.round(100 - ((val - idealLow) / (idealHigh - idealLow)) * 100);
      };

      const enriched = base.map(r => {
        const p = perfMap.get(r.user_id);
        const qualityPct = p?.quality_pct ?? null;
        const onTimePct  = p?.on_time_pct ?? null;
        const queueSec   = p?.avg_queue_wait_sec ?? null;
        const queueMin   = queueSec != null ? queueSec / 60 : null;
        const rework     = p?.monthly_rework_count ?? 0;
        const avgDur     = p?.avg_duration_min ?? null;

        const rating     = ratingMap.get(r.user_id);
        const custRating = rating?.avg_overall != null ? Number(rating.avg_overall) : null;  // 1–5
        const reviewCnt  = Number(rating?.review_count ?? 0);

        const qualityScore = qualityPct ?? 50;
        const speedScore   = norm(avgDur,  30, 240);
        const onTimeScore  = onTimePct ?? 50;
        const queueScore   = norm(queueMin, 30, 480);
        const reworkScore  = Math.max(0, 100 - rework * 20);
        // Müşteri puanı 1–5 → 0–100; puan yoksa nötr 50 (cezalandırma).
        const custScore    = custRating != null ? Math.round((custRating / 5) * 100) : 50;
        const composite = Math.round(
          qualityScore * 0.25 + custScore * 0.20 + onTimeScore * 0.20 +
          speedScore   * 0.15 + queueScore * 0.10 + reworkScore * 0.10
        );

        return {
          ...r,
          quality_pct:        qualityPct,
          on_time_pct:        onTimePct,
          avg_queue_wait_sec: queueSec,
          monthly_rework:     rework,
          customer_rating:    custRating,
          review_count:       reviewCnt,
          composite_score:    composite,
        };
      });
      setRows(enriched);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [labId, range, matType]);

  // ── Sort ───────────────────────────────────────────────────────
  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'waste' ? 'desc' : 'desc');
    }
  }, [sortKey]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'efficiency': return dir * ((a.efficiency_pct ?? 100) - (b.efficiency_pct ?? 100));
        case 'profit':     return dir * (a.profit_contribution - b.profit_contribution);
        case 'waste':      return dir * (a.waste_qty - b.waste_qty);
        case 'labor':      return dir * (a.labor_hours - b.labor_hours);
        case 'orders':     return dir * (a.orders_worked - b.orders_worked);
        case 'quality':    return dir * ((a.quality_pct ?? 0) - (b.quality_pct ?? 0));
        case 'composite':  return dir * ((a.composite_score ?? 0) - (b.composite_score ?? 0));
        default:           return 0;
      }
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  // ── Aggregates ─────────────────────────────────────────────────
  const totals = useMemo(() => {
    if (rows.length === 0) return null;
    const t = {
      totalProfit:  rows.reduce((s, r) => s + r.profit_contribution, 0),
      totalWaste:   rows.reduce((s, r) => s + r.waste_cost, 0),
      totalLabor:   rows.reduce((s, r) => s + r.labor_hours, 0),
      totalOrders:  rows.reduce((s, r) => s + r.orders_worked, 0),
      avgEfficiency: rows.filter(r => r.efficiency_pct !== null).length > 0
        ? rows.filter(r => r.efficiency_pct !== null).reduce((s, r) => s + (r.efficiency_pct ?? 0), 0) /
          rows.filter(r => r.efficiency_pct !== null).length
        : null,
      techCount: rows.length,
    };
    return t;
  }, [rows]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: isHub ? 0 : 20, paddingTop: 4, paddingBottom: 40, gap: 14 }}
      showsVerticalScrollIndicator={false}
    >
      <MobilePageTitle title="Performans" subtitle="Teknisyen ve üretim metrikleri" />

      {/* Yeniden-yapım (remake) kalite panosu — kendi dönem filtresi var */}
      <RemakeQualityCard
        accentColor={accentColor}
        onOpenOrder={(oid) => router.push(`/${panelBase}/order/${oid}` as any)}
      />
      {/* ── F1 HeroCard — Performans özeti ── */}
      {totals && !loading && (
        <View style={{
          borderRadius: 20, overflow: 'hidden',
          ...heroBg, padding: 18, position: 'relative',
        }}>
          <HeroGlow size={160} opacity={0.18} delay={0} style={{ top: -40, end: -40 }} />
          <HeroGlow size={140} opacity={0.12} delay={1400} style={{ bottom: -50, start: -20 }} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)', marginBottom: 8 }}>
                Toplam Kar Katkısı
              </Text>
              <Text
                style={{ ...DISPLAY, fontWeight: '300', fontSize: 32, color: '#FFFFFF', letterSpacing: -1, lineHeight: 38 }}
                numberOfLines={1}
              >
                {fmtCur(totals.totalProfit)}
              </Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 4 }}>
                {totals.techCount} teknisyen · {fmt1(totals.totalLabor)} sa toplam süre
              </Text>
            </View>
            <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' }}>
              <DollarSign size={20} color="#FFFFFF" strokeWidth={1.6} />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            {([
              {
                label: 'Fire',
                value: `−${fmt(totals.totalWaste)} ${baseSymbol()}`,
                icon: Flame,
              },
              {
                label: 'Verim',
                value: totals.avgEfficiency !== null ? `%${fmt1(totals.avgEfficiency)}` : '—',
                icon: Zap,
              },
              {
                label: 'Teknisyen',
                value: `${totals.techCount}`,
                icon: BarChart3,
              },
            ] as const).map(stat => {
              const Icon = stat.icon;
              return (
                <View key={stat.label} style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                    <Icon size={11} color="rgba(255,255,255,0.85)" strokeWidth={2} />
                    <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
                      {stat.label}
                    </Text>
                  </View>
                  <Text
                    style={{ ...DISPLAY, fontWeight: '300', fontSize: 18, color: '#FFFFFF', letterSpacing: -0.4, lineHeight: 22 }}
                    numberOfLines={1}
                  >
                    {stat.value}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Filters — dönem pills + materyal dropdown ─────────── */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', zIndex: 20 }}>
        {/* Dönem pill strip */}
        {RANGE_OPTIONS.map(opt => {
          const active = range === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setRange(opt.key)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: active ? 14 : 12, paddingVertical: 6,
                borderRadius: 9999,
                backgroundColor: active ? U.ink[900] : U.plainBtn.bg,
                borderWidth: active ? 0 : 1, borderColor: U.ink[300],
                // @ts-ignore web
                cursor: 'pointer',
              }}
            >
              {active && <Calendar size={11} color={U.onDarkPill} strokeWidth={2} />}
              <Text style={{ fontSize: 12, fontWeight: '500', color: active ? U.onDarkPill : U.ink[500] }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}

        {/* Separator */}
        <View style={{ width: 1, height: 20, backgroundColor: U.fieldBorder, marginHorizontal: 2 }} />

        {/* Materyal dropdown */}
        <View style={{ position: 'relative', zIndex: 30 }}>
          <Pressable
            onPress={() => setMatOpen(o => !o)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 12, paddingVertical: 6,
              borderRadius: 9999,
              backgroundColor: matType !== 'all' ? U.ink[900] : U.plainBtn.bg,
              borderWidth: matType !== 'all' ? 0 : 1, borderColor: U.ink[300],
              // @ts-ignore web
              cursor: 'pointer',
            }}
          >
            <Wrench size={11} color={matType !== 'all' ? U.onDarkPill : U.ink[500]} strokeWidth={1.8} />
            <Text style={{ fontSize: 12, fontWeight: '500', color: matType !== 'all' ? U.onDarkPill : U.ink[500] }}>
              {MATERIAL_TYPES.find(m => m.key === matType)?.label ?? 'Materyal'}
            </Text>
            <ChevronDown size={11} color={matType !== 'all' ? U.onDarkPillMuted : U.ink[400]} strokeWidth={2} />
          </Pressable>
          {matOpen && (
            <View style={{
              position: 'absolute', top: '100%', start: 0, marginTop: 4,
              backgroundColor: U.surface, borderRadius: 14,
              borderWidth: 1, borderColor: U.fieldBorder,
              ...(Platform.OS === 'web' ? { boxShadow: U.isDark ? '0 4px 20px rgba(0,0,0,0.55)' : '0 4px 20px rgba(0,0,0,0.12)' } : {}),
              minWidth: 160, zIndex: 50,
              overflow: 'hidden',
            }}>
              {MATERIAL_TYPES.map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => { setMatType(opt.key); setMatOpen(false); }}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 10,
                    backgroundColor: matType === opt.key ? U.ink[50] : 'transparent',
                    // @ts-ignore web
                    cursor: 'pointer',
                  }}
                >
                  <Text style={{
                    fontSize: 13,
                    fontWeight: matType === opt.key ? '600' : '400',
                    color: matType === opt.key ? U.ink[900] : U.ink[500],
                  }}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* ── Table ──────────────────────────────────────────────── */}
      {loading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center', zIndex: 1 }}>
          <ActivityIndicator color={U.ink[900]} />
          <Text style={{ fontSize: 13, color: U.ink[400], marginTop: 12 }}>Yükleniyor…</Text>
        </View>
      ) : sorted.length === 0 ? (
        <View style={{ ...U.cardSolid, alignItems: 'center', paddingVertical: 60 }}>
          <View style={{
            width: 48, height: 48, borderRadius: 24,
            backgroundColor: U.ink[100], alignItems: 'center', justifyContent: 'center', marginBottom: 12,
          }}>
            <Users size={22} color={U.ink[400]} strokeWidth={1.5} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900], marginBottom: 4 }}>
            Veri yok
          </Text>
          <Text style={{ fontSize: 13, color: U.ink[400], textAlign: 'center', maxWidth: 280, lineHeight: 19 }}>
            Bu aralıkta teknisyen aktivitesi bulunamadı.
          </Text>
        </View>
      ) : (
        <View style={{ ...U.tableCard, zIndex: 1 }}>

          {/* Desktop table header */}
          {isWide && (
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 20, paddingVertical: 10,
              backgroundColor: U.surfaceSoft,
              borderBottomWidth: 1, borderBottomColor: U.hairlineSoft,
            }}>
              <Text style={{ ...U.colHeader, flex: 2.0 }}>TEKNİSYEN</Text>
              <SortableHeader label="SİPARİŞ" flex={0.8} sortKey="orders" currentSort={sortKey} currentDir={sortDir} onPress={toggleSort} />
              <SortableHeader label="KALİTE" flex={1} sortKey="quality" currentSort={sortKey} currentDir={sortDir} onPress={toggleSort} align="center" />
              <Text style={{ ...U.colHeader, flex: 1, textAlign: 'center' }}>ZAMANIN.</Text>
              <SortableHeader label="FİRE" flex={1.1} sortKey="waste" currentSort={sortKey} currentDir={sortDir} onPress={toggleSort} align="right" />
              <SortableHeader label="VERİM" flex={1} sortKey="efficiency" currentSort={sortKey} currentDir={sortDir} onPress={toggleSort} align="center" />
              <SortableHeader label="SÜRE" flex={1} sortKey="labor" currentSort={sortKey} currentDir={sortDir} onPress={toggleSort} align="right" />
              <SortableHeader label="KAR KATKISI" flex={1.3} sortKey="profit" currentSort={sortKey} currentDir={sortDir} onPress={toggleSort} align="right" />
              <SortableHeader label="SKOR" flex={1} sortKey="composite" currentSort={sortKey} currentDir={sortDir} onPress={toggleSort} align="center" />
            </View>
          )}

          {sorted.map((row, i) => (
            <RowView key={row.user_id} row={row} isLast={i === sorted.length - 1} isWide={isWide} />
          ))}

          {/* Totals row — desktop only */}
          {isWide && totals && (
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 20, paddingVertical: 12,
              backgroundColor: U.surfaceSoft,
              borderTopWidth: 1, borderTopColor: U.hairline,
            }}>
              <Text style={{ ...U.colHeader, flex: 2.0, fontSize: 11, fontWeight: '700', color: U.ink[700] }}>
                TOPLAM ({totals.techCount} teknisyen)
              </Text>
              <View style={{ flex: 0.8, alignItems: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: U.ink[700] }}>{fmt(totals.totalOrders)}</Text>
              </View>
              <View style={{ flex: 1 }} />
              <View style={{ flex: 1 }} />
              <View style={{ flex: 1.1, alignItems: 'flex-end', paddingEnd: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: U.chipTones.danger.fg }}>
                  −{fmt(totals.totalWaste)} {baseSymbol()}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                {totals.avgEfficiency !== null && (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: effTone(U, totals.avgEfficiency).fg }}>
                    %{fmt1(totals.avgEfficiency)}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end', paddingEnd: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: U.ink[700] }}>{fmt1(totals.totalLabor)} sa</Text>
              </View>
              <View style={{ flex: 1.3, alignItems: 'flex-end' }}>
                <Text style={{
                  fontSize: 13, fontWeight: '700',
                  color: totals.totalProfit >= 0 ? U.chipTones.success.fg : U.chipTones.danger.fg,
                }}>
                  {totals.totalProfit >= 0 ? '+' : '−'}{fmt(Math.abs(totals.totalProfit))} {baseSymbol()}
                </Text>
              </View>
              <View style={{ flex: 1 }} />
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

// ── KPI Chip ─────────────────────────────────────────────────────────
function KPIChip({ icon: Icon, iconColor, label, value, tone }: {
  icon: React.ComponentType<any>; iconColor: string;
  label: string; value: string;
  tone: { bg: string; fg: string };
}) {
  const U = useInkUI();
  return (
    <View style={{
      ...U.cardSolid,
      padding: 14,
      paddingHorizontal: 16,
      flex: 1,
      minWidth: 140,
      gap: 6,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon size={13} color={iconColor} strokeWidth={1.8} />
        <Text style={{ fontSize: 11, fontWeight: '500', color: U.ink[400], letterSpacing: 0.3 }}>
          {label}
        </Text>
      </View>
      <Text style={{ fontSize: 18, fontWeight: '600', color: tone.fg, letterSpacing: -0.3 }}>
        {value}
      </Text>
    </View>
  );
}

// ── Sortable Header ──────────────────────────────────────────────────
function SortableHeader({ label, flex, sortKey, currentSort, currentDir, onPress, align = 'left' }: {
  label: string; flex: number; sortKey: SortKey;
  currentSort: SortKey; currentDir: SortDir;
  onPress: (key: SortKey) => void;
  align?: 'left' | 'center' | 'right';
}) {
  const U = useInkUI();
  const active = currentSort === sortKey;
  return (
    <Pressable
      onPress={() => onPress(sortKey)}
      style={{
        flex, flexDirection: 'row', alignItems: 'center', gap: 3,
        justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        paddingEnd: align === 'right' ? 8 : 0,
        // @ts-ignore web
        cursor: 'pointer',
      }}
    >
      <Text style={{
        ...U.colHeader,
        color: active ? U.ink[900] : U.ink[500],
        fontWeight: active ? '700' : '600',
      }}>
        {label}
      </Text>
      {active ? (
        currentDir === 'asc'
          ? <ChevronUp size={10} color={U.ink[900]} strokeWidth={2.5} />
          : <ChevronDown size={10} color={U.ink[900]} strokeWidth={2.5} />
      ) : (
        <ArrowUpDown size={9} color={U.ink[300]} strokeWidth={2} />
      )}
    </Pressable>
  );
}

// ── Column header style ──────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════
// ROW
// ═══════════════════════════════════════════════════════════════════════
function RowView({ row, isLast, isWide }: { row: PerfRow; isLast: boolean; isWide: boolean }) {
  const U = useInkUI();
  const eff  = row.efficiency_pct;
  const chip = effTone(U, eff);
  const initials = (row.user_name ?? '??').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const wasteHigh = row.waste_qty > 0 && (eff ?? 100) < 90;

  if (isWide) {
    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 1, borderBottomColor: U.hairlineSoft,
      }}>
        {/* Teknisyen */}
        <View style={{ flex: 2.0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingEnd: 8 }}>
          <View style={{
            width: 34, height: 34, borderRadius: 17,
            backgroundColor: U.isDark ? 'rgba(139,92,184,0.26)' : 'rgba(139,92,184,0.12)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: U.isDark ? '#C9A9E8' : '#6B3F94' }}>{initials}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>
              {row.user_name ?? '—'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
              <Text style={{ fontSize: 11, color: U.ink[400] }} numberOfLines={1}>
                {row.hourly_rate > 0 ? `${fmt(row.hourly_rate)} ${baseSymbol()}/sa` : '—'}
              </Text>
              {row.customer_rating != null && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Star size={11} color="#E89B2A" strokeWidth={1.8} fill="#E89B2A" />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: U.ink[700] }}>
                    {row.customer_rating.toFixed(1)}
                  </Text>
                  <Text style={{ fontSize: 10, color: U.ink[400] }}>({row.review_count ?? 0})</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Sipariş */}
        <View style={{ flex: 0.8, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }}>{row.orders_worked}</Text>
        </View>

        {/* Kalite (onay/(onay+red)) */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          {row.quality_pct != null ? (
            <Text style={{
              fontSize: 13, fontWeight: '600',
              color: row.quality_pct >= 80 ? U.chipTones.success.fg
                   : row.quality_pct >= 60 ? U.chipTones.warning.fg
                   : U.chipTones.danger.fg,
            }}>
              %{Math.round(row.quality_pct)}
            </Text>
          ) : (
            <Text style={{ fontSize: 11, color: U.ink[400] }}>—</Text>
          )}
          {(row.monthly_rework ?? 0) > 0 && (
            <Text style={{ fontSize: 10, color: U.chipTones.danger.fg, marginTop: 1 }}>
              {row.monthly_rework} rework
            </Text>
          )}
        </View>

        {/* Zamanında */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          {row.on_time_pct != null ? (
            <Text style={{
              fontSize: 13, fontWeight: '600',
              color: row.on_time_pct >= 80 ? U.chipTones.success.fg
                   : row.on_time_pct >= 60 ? U.chipTones.warning.fg
                   : U.chipTones.danger.fg,
            }}>
              %{Math.round(row.on_time_pct)}
            </Text>
          ) : (
            <Text style={{ fontSize: 11, color: U.ink[400] }}>—</Text>
          )}
        </View>

        {/* Fire */}
        <View style={{ flex: 1.1, alignItems: 'flex-end', paddingEnd: 8 }}>
          <Text style={{
            fontSize: 14, fontWeight: '600',
            color: wasteHigh ? U.chipTones.danger.fg : U.ink[900],
          }}>
            {fmt1(row.waste_qty)}
          </Text>
          {row.waste_cost > 0 && (
            <Text style={{ fontSize: 11, color: U.chipTones.danger.fg, marginTop: 1 }}>
              −{fmt(row.waste_cost)} {baseSymbol()}
            </Text>
          )}
        </View>

        {/* Verim */}
        <View style={{ flex: 1, alignItems: 'center', paddingEnd: 8 }}>
          {eff !== null ? (
            <View style={{
              paddingHorizontal: 12, paddingVertical: 5,
              borderRadius: 9999, backgroundColor: chip.bg,
              minWidth: 60, alignItems: 'center',
            }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: chip.fg }}>%{fmt1(eff)}</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 11, color: U.ink[400] }}>—</Text>
          )}
        </View>

        {/* Süre */}
        <View style={{ flex: 1, alignItems: 'flex-end', paddingEnd: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }}>
            {fmt1(row.labor_hours)}<Text style={{ fontSize: 10, color: U.ink[400], fontWeight: '500' }}> sa</Text>
          </Text>
          {row.labor_cost > 0 && (
            <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 1 }}>{fmt(row.labor_cost)} {baseSymbol()}</Text>
          )}
        </View>

        {/* Kar Katkısı */}
        <View style={{ flex: 1.3, alignItems: 'flex-end' }}>
          <Text style={{
            fontSize: 14, fontWeight: '600',
            color: row.profit_contribution >= 0 ? U.chipTones.success.fg : U.chipTones.danger.fg,
          }}>
            {row.profit_contribution >= 0 ? '+' : '−'}{fmt(Math.abs(row.profit_contribution))} {baseSymbol()}
          </Text>
        </View>

        {/* Skor (kompozit) */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          {row.composite_score != null ? (
            <View style={{
              paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
              backgroundColor: row.composite_score >= 75 ? U.chipTones.success.bg
                             : row.composite_score >= 50 ? U.chipTones.warning.bg
                             : U.chipTones.danger.bg,
              minWidth: 50, alignItems: 'center',
            }}>
              <Text style={{
                fontSize: 13, fontWeight: '700',
                color: row.composite_score >= 75 ? U.chipTones.success.fg
                     : row.composite_score >= 50 ? U.chipTones.warning.fg
                     : U.chipTones.danger.fg,
              }}>{row.composite_score}</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 11, color: U.ink[400] }}>—</Text>
          )}
        </View>
      </View>
    );
  }

  // ── Mobile: stacked card row ──────────────────────────────────
  return (
    <View style={{
      paddingHorizontal: 20, paddingVertical: 14, gap: 10,
      borderBottomWidth: isLast ? 0 : 1, borderBottomColor: U.hairlineSoft,
    }}>
      {/* Top — avatar + name + efficiency chip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          width: 34, height: 34, borderRadius: 17,
          backgroundColor: U.isDark ? 'rgba(139,92,184,0.26)' : 'rgba(139,92,184,0.12)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: U.isDark ? '#C9A9E8' : '#6B3F94' }}>{initials}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>
            {row.user_name ?? '—'}
          </Text>
          <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 1 }}>
            {row.orders_worked} sipariş · {row.hourly_rate > 0 ? `${fmt(row.hourly_rate)} ${baseSymbol()}/sa` : '—'}
          </Text>
        </View>
        {eff !== null ? (
          <View style={{
            paddingHorizontal: 10, paddingVertical: 4,
            borderRadius: 9999, backgroundColor: chip.bg,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: chip.fg }}>%{fmt1(eff)}</Text>
          </View>
        ) : null}
      </View>

      {/* Bottom — metric strip */}
      <View style={{ flexDirection: 'row', gap: 12, paddingStart: 44 }}>
        <MiniStat label="Kullanım" value={fmt1(row.used_qty)} />
        <MiniStat label="Fire" value={fmt1(row.waste_qty)} color={wasteHigh ? U.chipTones.danger.fg : undefined} />
        <MiniStat label="Süre" value={`${fmt1(row.labor_hours)} sa`} />
        <MiniStat
          label="Kar"
          value={`${row.profit_contribution >= 0 ? '+' : '−'}${fmt(Math.abs(row.profit_contribution))}`}
          color={row.profit_contribution >= 0 ? U.chipTones.success.fg : U.chipTones.danger.fg}
        />
        {row.customer_rating != null && (
          <MiniStat label="Puan" value={`★ ${row.customer_rating.toFixed(1)}`} color="#E89B2A" />
        )}
      </View>
    </View>
  );
}

// ── Mini stat for mobile ─────────────────────────────────────────────
function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  const U = useInkUI();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 10, color: U.ink[400], fontWeight: '500', letterSpacing: 0.3 }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: color ?? U.ink[900] }}>{value}</Text>
    </View>
  );
}

// ── HubContext consumer ──────────────────────────────────────────────
function useHubContext(): boolean {
  return React.useContext(HubContext) === true;
}

export default PerformanceScreen;
