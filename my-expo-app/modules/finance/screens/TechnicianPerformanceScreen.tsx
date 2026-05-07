// TechnicianPerformanceScreen — teknisyen verim panosu.
// Materyal kullanımı + fire + işçilik + kar katkısı tek tabloda.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Platform, useWindowDimensions,
} from 'react-native';

import { Users } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { DS } from '../../../core/theme/dsTokens';

// ── Patterns tokens ─────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

const cardSolid = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  padding: 22,
  // @ts-ignore web
  boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)',
};

const tableCard = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.05)',
  overflow: 'hidden' as const,
};

const CHIP_TONES = {
  success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' },
};

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
  const isWide      = width >= 900;
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
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 22, paddingTop: 4, paddingBottom: 48, gap: 14 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Range filter */}
      <View style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 9999, backgroundColor: DS.ink[100] }}>
        {RANGE_OPTIONS.map(opt => {
          const active = range === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setRange(opt.key)}
              style={[
                {
                  paddingHorizontal: 12, paddingVertical: 6,
                  borderRadius: 9999,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : {}),
                },
                active && {
                  backgroundColor: '#FFF',
                  // @ts-ignore web
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                },
              ]}
            >
              <Text style={[
                { fontSize: 12, fontWeight: '500', color: DS.ink[500] },
                active && { fontWeight: '600', color: DS.ink[900] },
              ]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Material type filter */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500], letterSpacing: 0.3, marginRight: 4 }}>Materyal:</Text>
        <View style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 9999, backgroundColor: DS.ink[100] }}>
          {MATERIAL_TYPES.map(t => {
            const active = matType === t;
            const label = t === 'all' ? 'Tümü' : t;
            return (
              <Pressable
                key={t}
                onPress={() => setMatType(t)}
                style={[
                  {
                    paddingHorizontal: 12, paddingVertical: 6,
                    borderRadius: 9999,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : {}),
                  },
                  active && {
                    backgroundColor: '#FFF',
                    // @ts-ignore web
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  },
                ]}
              >
                <Text style={[
                  { fontSize: 12, fontWeight: '500', color: DS.ink[500] },
                  active && { fontWeight: '600', color: DS.ink[900] },
                ]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Sort filter */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500], letterSpacing: 0.3, marginRight: 4 }}>Sırala:</Text>
        <View style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 9999, backgroundColor: DS.ink[100] }}>
          {([
            { key: 'efficiency', label: 'En düşük verim' },
            { key: 'waste',      label: 'En çok fire'    },
            { key: 'used',       label: 'En çok kullanım'},
            { key: 'profit',     label: 'En karlı'       },
            { key: 'labor',      label: 'En çok süre'    },
          ] as const).map(opt => {
            const active = sortKey === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setSortKey(opt.key)}
                style={[
                  {
                    paddingHorizontal: 12, paddingVertical: 6,
                    borderRadius: 9999,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : {}),
                  },
                  active && {
                    backgroundColor: '#FFF',
                    // @ts-ignore web
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  },
                ]}
              >
                <Text style={[
                  { fontSize: 12, fontWeight: '500', color: DS.ink[500] },
                  active && { fontWeight: '600', color: DS.ink[900] },
                ]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View style={{ padding: 60, alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : sorted.length === 0 ? (
        <View style={{
          ...cardSolid,
          paddingVertical: 60, alignItems: 'center', gap: 8,
        }}>
          <Users size={32} color={DS.ink[300]} strokeWidth={1.6} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[500] }}>Veri yok</Text>
          <Text style={{ fontSize: 12, color: DS.ink[400], textAlign: 'center', maxWidth: 280, lineHeight: 18 }}>
            Bu aralıkta teknisyen aktivitesi bulunamadı.
          </Text>
        </View>
      ) : (
        <View style={{
          ...tableCard,
        }}>
          {/* Desktop table header */}
          {isWide && (
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 18, paddingVertical: 14,
              backgroundColor: DS.ink[50],
              borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
            }}>
              <Text style={{ flex: 2.4, fontSize: 10, fontWeight: '600', color: DS.ink[500], letterSpacing: 0.8, textTransform: 'uppercase' }}>Teknisyen</Text>
              <Text style={{ flex: 1.2, fontSize: 10, fontWeight: '600', color: DS.ink[500], letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'right' }}>Kullanım</Text>
              <Text style={{ flex: 1.2, fontSize: 10, fontWeight: '600', color: DS.ink[500], letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'right' }}>Fire</Text>
              <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', color: DS.ink[500], letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' }}>Verim</Text>
              <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', color: DS.ink[500], letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'right' }}>Süre</Text>
              <Text style={{ flex: 1.4, fontSize: 10, fontWeight: '600', color: DS.ink[500], letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'right' }}>Kar Katkısı</Text>
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
    </ScrollView>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────

function PerfRowView({ row, isLast, isWide }: { row: PerfRow; isLast: boolean; isWide: boolean }) {
  const eff = row.efficiency_pct;
  const tone = eff === null ? null : eff >= 95 ? 'success' : eff >= 80 ? 'warning' : 'danger';
  const chipTone = tone ? CHIP_TONES[tone] : null;
  const fg = chipTone ? chipTone.fg : DS.ink[400];
  const bg = chipTone ? chipTone.bg : DS.ink[100];

  const initials = (row.user_name ?? '??').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const wasteHigh = row.waste_qty > 0 && (eff ?? 100) < 90;

  if (isWide) {
    return (
      <View style={[
        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 },
        !isLast && { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
      ]}>
        <View style={{ flex: 2.4, flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 8 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>{initials}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>{row.user_name ?? '—'}</Text>
            <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }} numberOfLines={1}>
              {row.orders_worked} sipariş{row.hourly_rate > 0 ? ` · ${fmt(row.hourly_rate)} ₺/sa` : ''}
            </Text>
          </View>
        </View>

        <View style={{ flex: 1.2, alignItems: 'flex-end', paddingRight: 8 }}>
          <Text style={{ ...DISPLAY, fontSize: 14, color: DS.ink[900] }}>{fmt1(row.used_qty)}</Text>
          {row.used_cost > 0 && <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }}>{fmt(row.used_cost)} ₺</Text>}
        </View>

        <View style={{ flex: 1.2, alignItems: 'flex-end', paddingRight: 8 }}>
          <Text style={[
            { ...DISPLAY, fontSize: 14, color: DS.ink[900] },
            wasteHigh && { color: CHIP_TONES.danger.fg },
          ]}>
            {fmt1(row.waste_qty)}
          </Text>
          {row.waste_cost > 0 && <Text style={{ fontSize: 11, color: CHIP_TONES.danger.fg, marginTop: 1 }}>−{fmt(row.waste_cost)} ₺</Text>}
        </View>

        <View style={{ flex: 1, alignItems: 'center', paddingRight: 8 }}>
          {eff !== null ? (
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, minWidth: 60, alignItems: 'center', backgroundColor: bg }}>
              <Text style={{ fontSize: 13, fontWeight: '600', letterSpacing: -0.2, color: fg }}>%{fmt1(eff)}</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }}>—</Text>
          )}
        </View>

        <View style={{ flex: 1, alignItems: 'flex-end', paddingRight: 8 }}>
          <Text style={{ ...DISPLAY, fontSize: 14, color: DS.ink[900] }}>
            {fmt1(row.labor_hours)}<Text style={{ fontSize: 10, color: DS.ink[400], fontWeight: '600' }}> sa</Text>
          </Text>
          {row.labor_cost > 0 && <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }}>{fmt(row.labor_cost)} ₺</Text>}
        </View>

        <View style={{ flex: 1.4, alignItems: 'flex-end', paddingRight: 8 }}>
          <Text style={[
            { ...DISPLAY, fontSize: 14, color: CHIP_TONES.success.fg },
            row.profit_contribution < 0 && { color: CHIP_TONES.danger.fg },
          ]}>
            {row.profit_contribution >= 0 ? '+' : '−'}{fmt(Math.abs(row.profit_contribution))} ₺
          </Text>
        </View>
      </View>
    );
  }

  // Mobile: stacked card
  return (
    <View style={[
      { paddingHorizontal: 18, paddingVertical: 14, gap: 10 },
      !isLast && { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
    ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>{initials}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>{row.user_name ?? '—'}</Text>
          <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }} numberOfLines={1}>
            {row.orders_worked} sipariş · {fmt1(row.labor_hours)} sa
          </Text>
        </View>
        {eff !== null && (
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, minWidth: 60, alignItems: 'center', backgroundColor: bg }}>
            <Text style={{ fontSize: 13, fontWeight: '600', letterSpacing: -0.2, color: fg }}>%{fmt1(eff)}</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <MStat label="Kullanım"  value={fmt1(row.used_qty)}  cost={row.used_cost} />
        <MStat label="Fire"      value={fmt1(row.waste_qty)} cost={row.waste_cost} costColor={CHIP_TONES.danger.fg} />
        <MStat label="Kar"       value={`${row.profit_contribution >= 0 ? '+' : '−'}${fmt(Math.abs(row.profit_contribution))} ₺`} />
      </View>
    </View>
  );
}

function MStat({ label, value, cost, costColor }: { label: string; value: string; cost?: number; costColor?: string }) {
  return (
    <View style={{ flex: 1, padding: 8, backgroundColor: DS.ink[50], borderRadius: 12 }}>
      <Text style={{ fontSize: 10, fontWeight: '600', color: DS.ink[400], letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ ...DISPLAY, fontSize: 13, color: DS.ink[900], marginTop: 2 }} numberOfLines={1}>{value}</Text>
      {cost !== undefined && cost > 0 && (
        <Text style={[{ fontSize: 10, fontWeight: '600', color: DS.ink[400], marginTop: 1 }, costColor ? { color: costColor } : undefined]}>{fmt(cost)} ₺</Text>
      )}
    </View>
  );
}
