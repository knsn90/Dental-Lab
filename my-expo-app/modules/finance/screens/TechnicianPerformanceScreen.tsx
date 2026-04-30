// TechnicianPerformanceScreen — teknisyen verim panosu.
// Materyal kullanımı + fire + işçilik + kar katkısı tek tabloda.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, useWindowDimensions,
} from 'react-native';

import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { AppIcon } from '../../../core/ui/AppIcon';
import { Shadows } from '../../../core/theme/shadows';

interface PerfRow {
  user_id:              string;
  user_name:            string | null;
  hourly_rate:          number;
  used_qty:             number;
  used_cost:            number;
  waste_qty:            number;
  waste_cost:           number;
  efficiency_pct:       number | null;
  labor_minutes:        number;
  labor_hours:          number;
  labor_cost:           number;
  orders_worked:        number;
  profit_contribution:  number;
}

type Range        = 'thisWeek' | 'thisMonth' | 'thisYear' | 'all';
type SortKey      = 'efficiency' | 'used' | 'waste' | 'labor' | 'profit';

const RANGE_OPTIONS: { key: Range; label: string }[] = [
  { key: 'thisWeek',  label: 'Bu Hafta' },
  { key: 'thisMonth', label: 'Bu Ay'    },
  { key: 'thisYear',  label: 'Bu Yıl'   },
  { key: 'all',       label: 'Tümü'     },
];

const MATERIAL_TYPES = ['all', 'zirconia', 'emax', 'pmma', 'metal', 'glaze'];

const fmt = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const fmt1 = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

function getRange(r: Range): { from: string | null; to: string | null } {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm   = now.getMonth();
  const pad  = (n: number) => String(n).padStart(2, '0');
  const ymd  = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (r === 'thisWeek') {
    const day  = now.getDay() || 7;
    const start = new Date(now); start.setDate(now.getDate() - day + 1);
    return { from: ymd(start), to: ymd(now) };
  }
  if (r === 'thisMonth') return { from: ymd(new Date(yyyy, mm, 1)), to: ymd(new Date(yyyy, mm + 1, 0)) };
  if (r === 'thisYear')  return { from: `${yyyy}-01-01`,            to: `${yyyy}-12-31` };
  return { from: null, to: null };
}

export function TechnicianPerformanceScreen() {
  const { profile } = useAuthStore();
  const { width }   = useWindowDimensions();
  const isWide      = width >= 800;
  const labId       = profile?.lab_id ?? profile?.id ?? null;

  const [range, setRange]       = useState<Range>('thisMonth');
  const [matType, setMatType]   = useState<string>('all');
  const [sortKey, setSortKey]   = useState<SortKey>('efficiency');
  const [rows, setRows]         = useState<PerfRow[]>([]);
  const [loading, setLoading]   = useState(true);

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

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'efficiency':
          return (a.efficiency_pct ?? 100) - (b.efficiency_pct ?? 100);   // düşük önce
        case 'used':   return b.used_qty   - a.used_qty;
        case 'waste':  return b.waste_qty  - a.waste_qty;
        case 'labor':  return b.labor_hours - a.labor_hours;
        case 'profit': return b.profit_contribution - a.profit_contribution;
      }
    });
    return arr;
  }, [rows, sortKey]);

  return (
    <ScrollView style={s.root} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      {/* Range filter */}
      <View style={s.filterRow}>
        {RANGE_OPTIONS.map(opt => {
          const active = range === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setRange(opt.key)}
              style={[s.chip, active && s.chipActive]}
              activeOpacity={0.75}
            >
              <Text style={[s.chipText, active && s.chipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Material type filter */}
      <View style={s.filterRow}>
        <Text style={s.filterLabel}>Materyal:</Text>
        {MATERIAL_TYPES.map(t => {
          const active = matType === t;
          const label = t === 'all' ? 'Tümü' : t;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setMatType(t)}
              style={[s.chipSm, active && s.chipSmActive]}
              activeOpacity={0.75}
            >
              <Text style={[s.chipSmText, active && s.chipSmTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Sort filter */}
      <View style={s.filterRow}>
        <Text style={s.filterLabel}>Sırala:</Text>
        {([
          { key: 'efficiency', label: 'En düşük verim' },
          { key: 'waste',      label: 'En çok fire'    },
          { key: 'used',       label: 'En çok kullanım'},
          { key: 'profit',     label: 'En karlı'       },
          { key: 'labor',      label: 'En çok süre'    },
        ] as const).map(opt => {
          const active = sortKey === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setSortKey(opt.key)}
              style={[s.chipSm, active && s.chipSmActive]}
              activeOpacity={0.75}
            >
              <Text style={[s.chipSmText, active && s.chipSmTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={{ padding: 60, alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : sorted.length === 0 ? (
        <View style={s.empty}>
          <AppIcon name="users" size={28} color="#CBD5E1" />
          <Text style={s.emptyTitle}>Veri yok</Text>
          <Text style={s.emptyHint}>
            Bu aralıkta teknisyen aktivitesi bulunamadı.
          </Text>
        </View>
      ) : (
        <View style={s.tableCard}>
          {/* Desktop table header */}
          {isWide && (
            <View style={t.headerRow}>
              <Text style={[t.h, { flex: 2.4 }]}>Teknisyen</Text>
              <Text style={[t.h, { flex: 1.2, textAlign: 'right' }]}>Kullanım</Text>
              <Text style={[t.h, { flex: 1.2, textAlign: 'right' }]}>Fire</Text>
              <Text style={[t.h, { flex: 1, textAlign: 'center' }]}>Verim</Text>
              <Text style={[t.h, { flex: 1, textAlign: 'right' }]}>Süre</Text>
              <Text style={[t.h, { flex: 1.4, textAlign: 'right' }]}>Kar Katkısı</Text>
            </View>
          )}

          {sorted.map((row, i) => (
            <PerfRowView
              key={row.user_id}
              row={row}
              isLast={i === sorted.length - 1}
              isWide={isWide}
            />
          ))}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────

function PerfRowView({ row, isLast, isWide }: { row: PerfRow; isLast: boolean; isWide: boolean }) {
  const eff = row.efficiency_pct;
  const tone = eff === null ? 'gray' : eff < 85 ? 'red' : eff < 95 ? 'yellow' : 'green';
  const fg = tone === 'red'    ? '#DC2626' :
             tone === 'yellow' ? '#B45309' :
             tone === 'green'  ? '#059669' : '#94A3B8';
  const bg = tone === 'red'    ? '#FEE2E2' :
             tone === 'yellow' ? '#FEF3C7' :
             tone === 'green'  ? '#ECFDF5' : '#F1F5F9';

  const initials = (row.user_name ?? '??').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const wasteHigh = row.waste_qty > 0 && (eff ?? 100) < 90;

  if (isWide) {
    return (
      <View style={[t.row, !isLast && t.rowDivider]}>
        <View style={[t.cell, { flex: 2.4, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
          <View style={t.avatar}>
            <Text style={t.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={t.name} numberOfLines={1}>{row.user_name ?? '—'}</Text>
            <Text style={t.sub} numberOfLines={1}>
              {row.orders_worked} sipariş{row.hourly_rate > 0 ? ` · ${fmt(row.hourly_rate)} ₺/sa` : ''}
            </Text>
          </View>
        </View>

        <View style={[t.cell, { flex: 1.2, alignItems: 'flex-end' }]}>
          <Text style={t.value}>{fmt1(row.used_qty)}</Text>
          {row.used_cost > 0 && <Text style={t.subRight}>{fmt(row.used_cost)} ₺</Text>}
        </View>

        <View style={[t.cell, { flex: 1.2, alignItems: 'flex-end' }]}>
          <Text style={[t.value, wasteHigh && { color: '#DC2626' }]}>
            {fmt1(row.waste_qty)}
          </Text>
          {row.waste_cost > 0 && <Text style={[t.subRight, { color: '#DC2626' }]}>−{fmt(row.waste_cost)} ₺</Text>}
        </View>

        <View style={[t.cell, { flex: 1, alignItems: 'center' }]}>
          {eff !== null ? (
            <View style={[t.effChip, { backgroundColor: bg }]}>
              <Text style={[t.effText, { color: fg }]}>%{fmt1(eff)}</Text>
            </View>
          ) : (
            <Text style={t.subRight}>—</Text>
          )}
        </View>

        <View style={[t.cell, { flex: 1, alignItems: 'flex-end' }]}>
          <Text style={t.value}>{fmt1(row.labor_hours)}<Text style={t.subUnit}> sa</Text></Text>
          {row.labor_cost > 0 && <Text style={t.subRight}>{fmt(row.labor_cost)} ₺</Text>}
        </View>

        <View style={[t.cell, { flex: 1.4, alignItems: 'flex-end' }]}>
          <Text style={[t.profit, row.profit_contribution < 0 && { color: '#DC2626' }]}>
            {row.profit_contribution >= 0 ? '+' : '−'}{fmt(Math.abs(row.profit_contribution))} ₺
          </Text>
        </View>
      </View>
    );
  }

  // Mobile: stacked card
  return (
    <View style={[t.mRow, !isLast && t.rowDivider]}>
      <View style={t.mTop}>
        <View style={t.avatar}><Text style={t.avatarText}>{initials}</Text></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={t.name} numberOfLines={1}>{row.user_name ?? '—'}</Text>
          <Text style={t.sub} numberOfLines={1}>
            {row.orders_worked} sipariş · {fmt1(row.labor_hours)} sa
          </Text>
        </View>
        {eff !== null && (
          <View style={[t.effChip, { backgroundColor: bg }]}>
            <Text style={[t.effText, { color: fg }]}>%{fmt1(eff)}</Text>
          </View>
        )}
      </View>
      <View style={t.mGrid}>
        <MStat label="Kullanım"  value={fmt1(row.used_qty)}  cost={row.used_cost} />
        <MStat label="Fire"      value={fmt1(row.waste_qty)} cost={row.waste_cost} costColor="#DC2626" />
        <MStat label="Kar"       value={`${row.profit_contribution >= 0 ? '+' : '−'}${fmt(Math.abs(row.profit_contribution))} ₺`} />
      </View>
    </View>
  );
}

function MStat({ label, value, cost, costColor }: { label: string; value: string; cost?: number; costColor?: string }) {
  return (
    <View style={t.mStat}>
      <Text style={t.mLabel}>{label}</Text>
      <Text style={t.mValue} numberOfLines={1}>{value}</Text>
      {cost !== undefined && cost > 0 && (
        <Text style={[t.mCost, costColor && { color: costColor }]}>{fmt(cost)} ₺</Text>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const SHADOW = Shadows.card;

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#F1F5F9' },
  scroll: { padding: 16, gap: 10 },

  filterRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  filterLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', marginRight: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E5E5EA',
  },
  chipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  chipText:        { fontSize: 12, fontWeight: '700', color: '#475569' },
  chipTextActive:  { color: '#FFFFFF' },
  chipSm: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E5E5EA',
  },
  chipSmActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  chipSmText:       { fontSize: 11, fontWeight: '700', color: '#475569' },
  chipSmTextActive: { color: '#FFFFFF' },

  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
    marginTop: 6,
    ...SHADOW,
  },

  empty: {
    paddingVertical: 60, alignItems: 'center', gap: 6,
    backgroundColor: '#FFFFFF', borderRadius: 14,
    marginTop: 6,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  emptyHint:  { fontSize: 12, color: '#94A3B8', textAlign: 'center', maxWidth: 280, lineHeight: 18 },
});

const t = StyleSheet.create({
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1, borderBottomColor: '#E5E5EA',
  },
  h: { fontSize: 11, fontWeight: '800', color: '#64748B', letterSpacing: 0.5, textTransform: 'uppercase' },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  cell: { paddingRight: 8 },

  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 11, fontWeight: '800', color: '#7C3AED' },

  name:     { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  sub:      { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  subRight: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  subUnit:  { fontSize: 10, color: '#94A3B8', fontWeight: '600' },

  value:  { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  profit: { fontSize: 14, fontWeight: '800', color: '#059669' },

  effChip:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, minWidth: 60, alignItems: 'center' },
  effText:   { fontSize: 13, fontWeight: '800', letterSpacing: -0.2 },

  // Mobile row
  mRow:  { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  mTop:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mGrid: { flexDirection: 'row', gap: 8 },
  mStat: { flex: 1, padding: 8, backgroundColor: '#F8FAFC', borderRadius: 8 },
  mLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.6 },
  mValue: { fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  mCost:  { fontSize: 10, fontWeight: '600', color: '#94A3B8', marginTop: 1 },
});
