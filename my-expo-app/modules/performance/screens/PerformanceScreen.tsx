/**
 * PerformanceScreen — Teknisyen Performans Tablosu (Patterns Design Language)
 *
 * Desktop-first table/grid. Multiple technicians in one view.
 * Uses report_technician_performance RPC for real operational data.
 * Sorting, date range filters, material type filter.
 *
 * Patterns: cardSolid, tableCard (§09), DISPLAY font, DS tokens, CHIP_TONES,
 *           §03 pill buttons, Lucide icons.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Platform, useWindowDimensions,
} from 'react-native';
import {
  Calendar, Users, AlertTriangle, Wrench,
  TrendingUp, TrendingDown, Clock, Filter,
  ChevronDown, ChevronUp, BarChart3, Flame,
  DollarSign, Timer, Zap, ArrowUpDown,
} from 'lucide-react-native';

import { supabase }     from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { DS }           from '../../../core/theme/dsTokens';
import { HubContext } from '../../../core/ui/HubContext';

// ── Patterns design tokens ──────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};

const cardSolid: any = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  padding: 22,
  ...(Platform.OS === 'web'
    ? { boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' }
    : {}),
};

const tableCard: any = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.05)',
  overflow: 'hidden',
};

const CHIP_TONES = {
  success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' },
  neutral: { bg: 'rgba(0,0,0,0.05)',      fg: DS.ink[800] },
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
}

type Range   = 'thisWeek' | 'thisMonth' | 'thisYear' | 'all';
type SortKey = 'efficiency' | 'profit' | 'waste' | 'labor' | 'orders';
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

const fmt  = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const fmt1 = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const fmtCur = (n: number) =>
  (n >= 0 ? '' : '−') + fmt(Math.abs(n)) + ' ₺';

function getRange(r: Range): { from: string | null; to: string | null } {
  const now  = new Date();
  const yyyy = now.getFullYear();
  const mm   = now.getMonth();
  const pad  = (n: number) => String(n).padStart(2, '0');
  const ymd  = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (r === 'thisWeek') {
    const day = now.getDay() || 7;
    const start = new Date(now); start.setDate(now.getDate() - day + 1);
    return { from: ymd(start), to: ymd(now) };
  }
  if (r === 'thisMonth') return { from: ymd(new Date(yyyy, mm, 1)), to: ymd(new Date(yyyy, mm + 1, 0)) };
  if (r === 'thisYear')  return { from: `${yyyy}-01-01`,            to: `${yyyy}-12-31` };
  return { from: null, to: null };
}

function effTone(eff: number | null) {
  if (eff === null) return CHIP_TONES.neutral;
  if (eff < 85) return CHIP_TONES.danger;
  if (eff < 95) return CHIP_TONES.warning;
  return CHIP_TONES.success;
}

function profitTone(p: number) {
  if (p > 0) return CHIP_TONES.success;
  if (p < 0) return CHIP_TONES.danger;
  return CHIP_TONES.neutral;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════
export function PerformanceScreen() {
  const { profile } = useAuthStore();
  const { width }   = useWindowDimensions();
  const isWide      = width >= 900;
  const labId       = profile?.lab_id ?? profile?.id ?? null;
  const isHub       = useHubContext();

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
    supabase.rpc('report_technician_performance', {
      p_lab_id:        labId,
      p_from:          from,
      p_to:            to,
      p_material_type: matType === 'all' ? null : matType,
    }).then(({ data }) => {
      if (cancelled) return;
      setRows((data ?? []) as PerfRow[]);
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
      {/* ── KPI Summary Row ────────────────────────────────────── */}
      {totals && !loading && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <KPIChip
            icon={DollarSign} iconColor={CHIP_TONES.success.fg}
            label="Toplam Kar Katkısı"
            value={fmtCur(totals.totalProfit)}
            tone={profitTone(totals.totalProfit)}
          />
          <KPIChip
            icon={Flame} iconColor={CHIP_TONES.danger.fg}
            label="Toplam Fire"
            value={`−${fmt(totals.totalWaste)} ₺`}
            tone={CHIP_TONES.danger}
          />
          <KPIChip
            icon={Zap} iconColor={CHIP_TONES.info.fg}
            label="Ort. Verim"
            value={totals.avgEfficiency !== null ? `%${fmt1(totals.avgEfficiency)}` : '—'}
            tone={totals.avgEfficiency !== null ? effTone(totals.avgEfficiency) : CHIP_TONES.neutral}
          />
          <KPIChip
            icon={Timer} iconColor={DS.ink[500]}
            label="Toplam Süre"
            value={`${fmt1(totals.totalLabor)} sa`}
            tone={CHIP_TONES.neutral}
          />
          <KPIChip
            icon={BarChart3} iconColor={DS.ink[500]}
            label="Teknisyen"
            value={`${totals.techCount}`}
            tone={CHIP_TONES.neutral}
          />
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
                backgroundColor: active ? DS.ink[900] : '#FFFFFF',
                borderWidth: active ? 0 : 1, borderColor: DS.ink[300],
                // @ts-ignore web
                cursor: 'pointer',
              }}
            >
              {active && <Calendar size={11} color="#FFFFFF" strokeWidth={2} />}
              <Text style={{ fontSize: 12, fontWeight: '500', color: active ? '#FFFFFF' : DS.ink[500] }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}

        {/* Separator */}
        <View style={{ width: 1, height: 20, backgroundColor: 'rgba(0,0,0,0.08)', marginHorizontal: 2 }} />

        {/* Materyal dropdown */}
        <View style={{ position: 'relative', zIndex: 30 }}>
          <Pressable
            onPress={() => setMatOpen(o => !o)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 12, paddingVertical: 6,
              borderRadius: 9999,
              backgroundColor: matType !== 'all' ? DS.ink[900] : '#FFFFFF',
              borderWidth: matType !== 'all' ? 0 : 1, borderColor: DS.ink[300],
              // @ts-ignore web
              cursor: 'pointer',
            }}
          >
            <Wrench size={11} color={matType !== 'all' ? '#FFFFFF' : DS.ink[500]} strokeWidth={1.8} />
            <Text style={{ fontSize: 12, fontWeight: '500', color: matType !== 'all' ? '#FFFFFF' : DS.ink[500] }}>
              {MATERIAL_TYPES.find(m => m.key === matType)?.label ?? 'Materyal'}
            </Text>
            <ChevronDown size={11} color={matType !== 'all' ? '#FFFFFF' : DS.ink[400]} strokeWidth={2} />
          </Pressable>
          {matOpen && (
            <View style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4,
              backgroundColor: '#FFFFFF', borderRadius: 14,
              borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
              ...(Platform.OS === 'web' ? { boxShadow: '0 4px 20px rgba(0,0,0,0.12)' } : {}),
              minWidth: 160, zIndex: 50,
              overflow: 'hidden',
            }}>
              {MATERIAL_TYPES.map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => { setMatType(opt.key); setMatOpen(false); }}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 10,
                    backgroundColor: matType === opt.key ? DS.ink[50] : 'transparent',
                    // @ts-ignore web
                    cursor: 'pointer',
                  }}
                >
                  <Text style={{
                    fontSize: 13,
                    fontWeight: matType === opt.key ? '600' : '400',
                    color: matType === opt.key ? DS.ink[900] : DS.ink[500],
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
          <ActivityIndicator color={DS.ink[900]} />
          <Text style={{ fontSize: 13, color: DS.ink[400], marginTop: 12 }}>Yükleniyor…</Text>
        </View>
      ) : sorted.length === 0 ? (
        <View style={{ ...cardSolid, alignItems: 'center', paddingVertical: 60 }}>
          <View style={{
            width: 48, height: 48, borderRadius: 24,
            backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', marginBottom: 12,
          }}>
            <Users size={22} color={DS.ink[400]} strokeWidth={1.5} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900], marginBottom: 4 }}>
            Veri yok
          </Text>
          <Text style={{ fontSize: 13, color: DS.ink[400], textAlign: 'center', maxWidth: 280, lineHeight: 19 }}>
            Bu aralıkta teknisyen aktivitesi bulunamadı.
          </Text>
        </View>
      ) : (
        <View style={{ ...tableCard, zIndex: 1 }}>

          {/* Desktop table header */}
          {isWide && (
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 20, paddingVertical: 10,
              backgroundColor: '#FAFAFA',
              borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
            }}>
              <Text style={{ ...colH, flex: 2.4 }}>TEKNİSYEN</Text>
              <SortableHeader label="SİPARİŞ" flex={0.9} sortKey="orders" currentSort={sortKey} currentDir={sortDir} onPress={toggleSort} />
              <Text style={{ ...colH, flex: 1.2, textAlign: 'right' }}>KULLANIM</Text>
              <SortableHeader label="FİRE" flex={1.2} sortKey="waste" currentSort={sortKey} currentDir={sortDir} onPress={toggleSort} align="right" />
              <SortableHeader label="VERİM" flex={1} sortKey="efficiency" currentSort={sortKey} currentDir={sortDir} onPress={toggleSort} align="center" />
              <SortableHeader label="SÜRE" flex={1} sortKey="labor" currentSort={sortKey} currentDir={sortDir} onPress={toggleSort} align="right" />
              <SortableHeader label="KAR KATKISI" flex={1.4} sortKey="profit" currentSort={sortKey} currentDir={sortDir} onPress={toggleSort} align="right" />
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
              backgroundColor: '#FAFAFA',
              borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
            }}>
              <Text style={{ ...colH, flex: 2.4, fontSize: 11, fontWeight: '700', color: DS.ink[700] }}>
                TOPLAM ({totals.techCount} teknisyen)
              </Text>
              <View style={{ flex: 0.9, alignItems: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: DS.ink[700] }}>{fmt(totals.totalOrders)}</Text>
              </View>
              <View style={{ flex: 1.2 }} />
              <View style={{ flex: 1.2, alignItems: 'flex-end', paddingRight: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: CHIP_TONES.danger.fg }}>
                  −{fmt(totals.totalWaste)} ₺
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                {totals.avgEfficiency !== null && (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: effTone(totals.avgEfficiency).fg }}>
                    %{fmt1(totals.avgEfficiency)}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end', paddingRight: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: DS.ink[700] }}>{fmt1(totals.totalLabor)} sa</Text>
              </View>
              <View style={{ flex: 1.4, alignItems: 'flex-end' }}>
                <Text style={{
                  fontSize: 13, fontWeight: '700',
                  color: totals.totalProfit >= 0 ? CHIP_TONES.success.fg : CHIP_TONES.danger.fg,
                }}>
                  {totals.totalProfit >= 0 ? '+' : '−'}{fmt(Math.abs(totals.totalProfit))} ₺
                </Text>
              </View>
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
  return (
    <View style={{
      ...cardSolid,
      padding: 14,
      paddingHorizontal: 16,
      flex: 1,
      minWidth: 140,
      gap: 6,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon size={13} color={iconColor} strokeWidth={1.8} />
        <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[400], letterSpacing: 0.3 }}>
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
  const active = currentSort === sortKey;
  return (
    <Pressable
      onPress={() => onPress(sortKey)}
      style={{
        flex, flexDirection: 'row', alignItems: 'center', gap: 3,
        justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        paddingRight: align === 'right' ? 8 : 0,
        // @ts-ignore web
        cursor: 'pointer',
      }}
    >
      <Text style={{
        ...colH,
        color: active ? DS.ink[900] : DS.ink[500],
        fontWeight: active ? '700' : '600',
      }}>
        {label}
      </Text>
      {active ? (
        currentDir === 'asc'
          ? <ChevronUp size={10} color={DS.ink[900]} strokeWidth={2.5} />
          : <ChevronDown size={10} color={DS.ink[900]} strokeWidth={2.5} />
      ) : (
        <ArrowUpDown size={9} color={DS.ink[300]} strokeWidth={2} />
      )}
    </Pressable>
  );
}

// ── Column header style ──────────────────────────────────────────────
const colH: any = {
  fontSize: 10, fontWeight: '600', letterSpacing: 0.7,
  textTransform: 'uppercase', color: DS.ink[500],
};

// ═══════════════════════════════════════════════════════════════════════
// ROW
// ═══════════════════════════════════════════════════════════════════════
function RowView({ row, isLast, isWide }: { row: PerfRow; isLast: boolean; isWide: boolean }) {
  const eff  = row.efficiency_pct;
  const chip = effTone(eff);
  const initials = (row.user_name ?? '??').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const wasteHigh = row.waste_qty > 0 && (eff ?? 100) < 90;

  if (isWide) {
    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 1, borderBottomColor: 'rgba(0,0,0,0.04)',
      }}>
        {/* Teknisyen */}
        <View style={{ flex: 2.4, flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 8 }}>
          <View style={{
            width: 34, height: 34, borderRadius: 17,
            backgroundColor: 'rgba(139,92,184,0.12)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#6B3F94' }}>{initials}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
              {row.user_name ?? '—'}
            </Text>
            <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }} numberOfLines={1}>
              {row.hourly_rate > 0 ? `${fmt(row.hourly_rate)} ₺/sa` : '—'}
            </Text>
          </View>
        </View>

        {/* Sipariş */}
        <View style={{ flex: 0.9, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>{row.orders_worked}</Text>
        </View>

        {/* Kullanım */}
        <View style={{ flex: 1.2, alignItems: 'flex-end', paddingRight: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>{fmt1(row.used_qty)}</Text>
          {row.used_cost > 0 && (
            <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }}>{fmt(row.used_cost)} ₺</Text>
          )}
        </View>

        {/* Fire */}
        <View style={{ flex: 1.2, alignItems: 'flex-end', paddingRight: 8 }}>
          <Text style={{
            fontSize: 14, fontWeight: '600',
            color: wasteHigh ? CHIP_TONES.danger.fg : DS.ink[900],
          }}>
            {fmt1(row.waste_qty)}
          </Text>
          {row.waste_cost > 0 && (
            <Text style={{ fontSize: 11, color: CHIP_TONES.danger.fg, marginTop: 1 }}>
              −{fmt(row.waste_cost)} ₺
            </Text>
          )}
        </View>

        {/* Verim */}
        <View style={{ flex: 1, alignItems: 'center', paddingRight: 8 }}>
          {eff !== null ? (
            <View style={{
              paddingHorizontal: 12, paddingVertical: 5,
              borderRadius: 9999, backgroundColor: chip.bg,
              minWidth: 60, alignItems: 'center',
            }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: chip.fg }}>%{fmt1(eff)}</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 11, color: DS.ink[400] }}>—</Text>
          )}
        </View>

        {/* Süre */}
        <View style={{ flex: 1, alignItems: 'flex-end', paddingRight: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>
            {fmt1(row.labor_hours)}<Text style={{ fontSize: 10, color: DS.ink[400], fontWeight: '500' }}> sa</Text>
          </Text>
          {row.labor_cost > 0 && (
            <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }}>{fmt(row.labor_cost)} ₺</Text>
          )}
        </View>

        {/* Kar Katkısı */}
        <View style={{ flex: 1.4, alignItems: 'flex-end' }}>
          <Text style={{
            fontSize: 14, fontWeight: '600',
            color: row.profit_contribution >= 0 ? CHIP_TONES.success.fg : CHIP_TONES.danger.fg,
          }}>
            {row.profit_contribution >= 0 ? '+' : '−'}{fmt(Math.abs(row.profit_contribution))} ₺
          </Text>
        </View>
      </View>
    );
  }

  // ── Mobile: stacked card row ──────────────────────────────────
  return (
    <View style={{
      paddingHorizontal: 20, paddingVertical: 14, gap: 10,
      borderBottomWidth: isLast ? 0 : 1, borderBottomColor: 'rgba(0,0,0,0.04)',
    }}>
      {/* Top — avatar + name + efficiency chip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          width: 34, height: 34, borderRadius: 17,
          backgroundColor: 'rgba(139,92,184,0.12)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#6B3F94' }}>{initials}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
            {row.user_name ?? '—'}
          </Text>
          <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }}>
            {row.orders_worked} sipariş · {row.hourly_rate > 0 ? `${fmt(row.hourly_rate)} ₺/sa` : '—'}
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
      <View style={{ flexDirection: 'row', gap: 12, paddingLeft: 44 }}>
        <MiniStat label="Kullanım" value={fmt1(row.used_qty)} />
        <MiniStat label="Fire" value={fmt1(row.waste_qty)} color={wasteHigh ? CHIP_TONES.danger.fg : undefined} />
        <MiniStat label="Süre" value={`${fmt1(row.labor_hours)} sa`} />
        <MiniStat
          label="Kar"
          value={`${row.profit_contribution >= 0 ? '+' : '−'}${fmt(Math.abs(row.profit_contribution))}`}
          color={row.profit_contribution >= 0 ? CHIP_TONES.success.fg : CHIP_TONES.danger.fg}
        />
      </View>
    </View>
  );
}

// ── Mini stat for mobile ─────────────────────────────────────────────
function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 10, color: DS.ink[400], fontWeight: '500', letterSpacing: 0.3 }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: color ?? DS.ink[900] }}>{value}</Text>
    </View>
  );
}

// ── HubContext consumer ──────────────────────────────────────────────
function useHubContext(): boolean {
  return React.useContext(HubContext) === true;
}

export default PerformanceScreen;
