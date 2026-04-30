// ProfitabilityScreen — Mali İşlemler hub'ında "Karlılık" sekmesi.
// Aylık özet · En karlı/zararlı siparişler · Doktor bazlı marj.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { AppIcon } from '../../../core/ui/AppIcon';
import { Shadows } from '../../../core/theme/shadows';

// ─── Types ───────────────────────────────────────────────────────────────────
interface SummaryRow {
  total_orders:    number;
  total_revenue:   number;
  total_material:  number;
  total_labor:     number;
  total_overhead:  number;
  total_cost:      number;
  total_profit:    number;
  avg_margin_pct:  number | null;
}

interface OrderRow {
  id:           string;
  order_number: string;
  patient_name: string | null;
  doctor_name:  string | null;
  case_type:    string | null;
  sale_price:   number;
  total_cost:   number;
  profit:       number;
  margin_pct:   number | null;
  created_at:   string;
}

interface DoctorRow {
  doctor_id:      string;
  doctor_name:    string;
  order_count:    number;
  total_revenue:  number;
  total_cost:     number;
  total_profit:   number;
  avg_margin_pct: number | null;
}

interface TechnicianUsageRow {
  user_id:        string;
  user_name:      string;
  used_qty:       number;
  used_cost:      number;
  waste_qty:      number;
  waste_cost:     number;
  total_qty:      number;
  efficiency_pct: number | null;
}

interface WasteByMaterial {
  item_id:    string;
  item_name:  string;
  type:       string | null;
  waste_qty:  number;
  waste_cost: number;
  unit:       string | null;
}

type Range = 'thisMonth' | 'lastMonth' | 'thisYear' | 'all';

const fmt = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });

function getRange(r: Range): { from: string | null; to: string | null } {
  const now   = new Date();
  const yyyy  = now.getFullYear();
  const mm    = now.getMonth();
  const pad   = (n: number) => String(n).padStart(2, '0');
  const ymd   = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (r === 'thisMonth') return { from: ymd(new Date(yyyy, mm, 1)),     to: ymd(new Date(yyyy, mm + 1, 0)) };
  if (r === 'lastMonth') return { from: ymd(new Date(yyyy, mm - 1, 1)), to: ymd(new Date(yyyy, mm, 0)) };
  if (r === 'thisYear')  return { from: `${yyyy}-01-01`,                to: `${yyyy}-12-31` };
  return { from: null, to: null };
}

const RANGE_OPTIONS: { key: Range; label: string }[] = [
  { key: 'thisMonth',  label: 'Bu Ay'    },
  { key: 'lastMonth',  label: 'Geçen Ay' },
  { key: 'thisYear',   label: 'Bu Yıl'   },
  { key: 'all',        label: 'Tümü'     },
];

// ─── Component ───────────────────────────────────────────────────────────────
export function ProfitabilityScreen() {
  const router      = useRouter();
  const { profile } = useAuthStore();
  const { width }   = useWindowDimensions();
  const isWide      = width >= 900;
  const labId       = profile?.lab_id ?? profile?.id ?? null;

  const [range, setRange] = useState<Range>('thisMonth');
  const [summary, setSummary]     = useState<SummaryRow | null>(null);
  const [best, setBest]           = useState<OrderRow[]>([]);
  const [worst, setWorst]         = useState<OrderRow[]>([]);
  const [doctors, setDoctors]     = useState<DoctorRow[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianUsageRow[]>([]);
  const [wasteByMat, setWasteByMat]   = useState<WasteByMaterial[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!labId) return;
    let cancelled = false;
    setLoading(true);
    const { from, to } = getRange(range);

    Promise.all([
      supabase.rpc('profitability_summary',     { p_lab_id: labId, p_from: from, p_to: to }),
      supabase.rpc('profitability_top_orders',  { p_lab_id: labId, p_limit: 5, p_order_by: 'best',  p_from: from, p_to: to }),
      supabase.rpc('profitability_top_orders',  { p_lab_id: labId, p_limit: 5, p_order_by: 'worst', p_from: from, p_to: to }),
      supabase.rpc('profitability_by_doctor',   { p_lab_id: labId, p_from: from, p_to: to }),
      supabase.rpc('report_technician_usage',   { p_lab_id: labId, p_from: from, p_to: to }),
      supabase.rpc('report_material_waste',     { p_lab_id: labId, p_from: from, p_to: to }),
    ]).then(([s, b, w, d, t, mw]) => {
      if (cancelled) return;
      setSummary((s.data?.[0] ?? null) as SummaryRow | null);
      setBest((b.data ?? []) as OrderRow[]);
      setWorst((w.data ?? []) as OrderRow[]);
      setDoctors((d.data ?? []) as DoctorRow[]);
      setTechnicians((t.data ?? []) as TechnicianUsageRow[]);
      setWasteByMat((mw.data ?? []) as WasteByMaterial[]);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [labId, range]);

  const margin     = summary?.avg_margin_pct ?? null;
  const profit     = summary?.total_profit ?? 0;
  const profitTone = profit < 0 ? 'red' : (margin !== null && margin < 20) ? 'yellow' : 'green';
  const toneBg     = profitTone === 'red' ? '#FEE2E2' : profitTone === 'yellow' ? '#FEF3C7' : '#ECFDF5';
  const toneFg     = profitTone === 'red' ? '#DC2626' : profitTone === 'yellow' ? '#B45309' : '#059669';

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Range filter ─────────────────────────────────────────────────── */}
      <View style={s.rangeRow}>
        {RANGE_OPTIONS.map(opt => {
          const active = range === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setRange(opt.key)}
              style={[s.rangeChip, active && s.rangeChipActive]}
              activeOpacity={0.75}
            >
              <Text style={[s.rangeChipText, active && s.rangeChipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : (
        <>
          {/* ── Hero summary ─────────────────────────────────────────────── */}
          <View style={[s.summaryCard, { backgroundColor: toneBg }]}>
            <Text style={s.summaryLabel}>NET KAR</Text>
            <Text style={[s.summaryProfit, { color: toneFg }]}>
              {profit >= 0 ? '+' : '−'}{fmt(Math.abs(profit))} ₺
            </Text>
            {margin !== null && (
              <Text style={[s.summaryMargin, { color: toneFg }]}>
                Ortalama Marj: %{margin}
              </Text>
            )}

            <View style={s.summaryGrid}>
              <SummaryStat label="Sipariş" value={`${summary?.total_orders ?? 0}`} />
              <SummaryStat label="Gelir"   value={`${fmt(summary?.total_revenue ?? 0)} ₺`} />
              <SummaryStat label="Maliyet" value={`${fmt(summary?.total_cost ?? 0)} ₺`} />
            </View>

            <View style={s.summaryBreak}>
              <BreakRow label="Materyal"     value={summary?.total_material ?? 0} />
              <BreakRow label="İşçilik"      value={summary?.total_labor ?? 0} />
              <BreakRow label="Genel Gider"  value={summary?.total_overhead ?? 0} />
            </View>
          </View>

          {/* ── Top best/worst (responsive split) ─────────────────────────── */}
          <View style={[s.twoCol, !isWide && { flexDirection: 'column' }]}>
            <View style={[s.col, isWide && { flex: 1 }]}>
              <Text style={s.sectionTitle}>🟢 EN KARLI 5 SİPARİŞ</Text>
              <View style={s.listCard}>
                {best.length === 0 ? (
                  <Text style={s.empty}>Veri yok</Text>
                ) : best.map((o, i) => (
                  <OrderListRow
                    key={o.id}
                    order={o}
                    isLast={i === best.length - 1}
                    onPress={() => router.push(`/(lab)/order/${o.id}` as any)}
                  />
                ))}
              </View>
            </View>

            <View style={[s.col, isWide && { flex: 1 }]}>
              <Text style={s.sectionTitle}>🔴 EN ZARARLI 5 SİPARİŞ</Text>
              <View style={s.listCard}>
                {worst.length === 0 ? (
                  <Text style={s.empty}>Veri yok</Text>
                ) : worst.map((o, i) => (
                  <OrderListRow
                    key={o.id}
                    order={o}
                    isLast={i === worst.length - 1}
                    onPress={() => router.push(`/(lab)/order/${o.id}` as any)}
                  />
                ))}
              </View>
            </View>
          </View>

          {/* ── Per-doctor breakdown ─────────────────────────────────────── */}
          <View style={s.col}>
            <Text style={s.sectionTitle}>🩺 DOKTOR BAZLI KARLILIK</Text>
            <View style={s.listCard}>
              {doctors.length === 0 ? (
                <Text style={s.empty}>Veri yok</Text>
              ) : doctors.map((d, i) => (
                <DoctorRowView
                  key={d.doctor_id}
                  doc={d}
                  isLast={i === doctors.length - 1}
                />
              ))}
            </View>
          </View>

          {/* ── Technician usage + efficiency ─────────────────────────── */}
          <View style={s.col}>
            <Text style={s.sectionTitle}>👷 TEKNİSYEN VERİMLİLİĞİ</Text>
            <View style={s.listCard}>
              {technicians.length === 0 ? (
                <Text style={s.empty}>Veri yok — teknisyen henüz materyal tüketmedi</Text>
              ) : technicians.map((t, i) => (
                <TechRowView
                  key={t.user_id}
                  row={t}
                  isLast={i === technicians.length - 1}
                />
              ))}
            </View>
          </View>

          {/* ── Material waste breakdown ──────────────────────────────── */}
          {wasteByMat.length > 0 && (
            <View style={s.col}>
              <Text style={s.sectionTitle}>♻️ MATERYAL FİRE RAPORU</Text>
              <View style={s.listCard}>
                {wasteByMat.map((w, i) => (
                  <WasteRowView
                    key={w.item_id}
                    row={w}
                    isLast={i === wasteByMat.length - 1}
                  />
                ))}
              </View>
            </View>
          )}

          <View style={{ height: 32 }} />
        </>
      )}
    </ScrollView>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.stat}>
      <Text style={st.statLabel}>{label}</Text>
      <Text style={st.statValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function BreakRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={st.breakRow}>
      <Text style={st.breakLabel}>{label}</Text>
      <Text style={st.breakValue}>{fmt(value)} ₺</Text>
    </View>
  );
}

function OrderListRow({
  order, isLast, onPress,
}: { order: OrderRow; isLast: boolean; onPress: () => void }) {
  const tone = order.profit < 0 ? 'red' : (order.margin_pct ?? 100) < 20 ? 'yellow' : 'green';
  const fg   = tone === 'red' ? '#DC2626' : tone === 'yellow' ? '#B45309' : '#059669';
  const bg   = tone === 'red' ? '#FEE2E2' : tone === 'yellow' ? '#FEF3C7' : '#ECFDF5';

  return (
    <TouchableOpacity onPress={onPress} style={[ol.row, !isLast && ol.rowDivider]} activeOpacity={0.7}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={ol.order} numberOfLines={1}>#{order.order_number}</Text>
        <Text style={ol.meta} numberOfLines={1}>
          {order.patient_name ?? '—'} · {order.doctor_name ?? '—'}
          {order.case_type ? ` · ${order.case_type}` : ''}
        </Text>
      </View>
      <View style={[ol.profitChip, { backgroundColor: bg }]}>
        <Text style={[ol.profitText, { color: fg }]}>
          {order.profit >= 0 ? '+' : '−'}{fmt(Math.abs(order.profit))} ₺
        </Text>
        {order.margin_pct !== null && (
          <Text style={[ol.marginText, { color: fg }]}>%{order.margin_pct}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function TechRowView({ row, isLast }: { row: TechnicianUsageRow; isLast: boolean }) {
  const eff = row.efficiency_pct ?? 100;
  const tone = eff < 80 ? 'red' : eff < 95 ? 'yellow' : 'green';
  const fg   = tone === 'red' ? '#DC2626' : tone === 'yellow' ? '#B45309' : '#059669';
  const bg   = tone === 'red' ? '#FEE2E2' : tone === 'yellow' ? '#FEF3C7' : '#ECFDF5';

  return (
    <View style={[dr.row, !isLast && dr.rowDivider]}>
      <View style={[dr.avatar, { backgroundColor: '#F5F3FF' }]}>
        <Text style={[dr.avatarText, { color: '#7C3AED' }]}>
          {(row.user_name ?? '??').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={dr.name} numberOfLines={1}>{row.user_name ?? '—'}</Text>
        <Text style={dr.meta} numberOfLines={1}>
          ✓ {fmt(row.used_qty)} kullanım  ·  ⚠ {fmt(row.waste_qty)} fire
          {row.waste_cost > 0 ? `  ·  ${fmt(row.waste_cost)} ₺ kayıp` : ''}
        </Text>
      </View>
      <View style={[dr.profitChip, { backgroundColor: bg }]}>
        <Text style={[dr.profitText, { color: fg }]}>%{fmt(eff)}</Text>
        <Text style={[dr.marginText, { color: fg }]}>verim</Text>
      </View>
    </View>
  );
}

function WasteRowView({ row, isLast }: { row: WasteByMaterial; isLast: boolean }) {
  return (
    <View style={[dr.row, !isLast && dr.rowDivider]}>
      <View style={[dr.avatar, { backgroundColor: '#FEE2E2' }]}>
        <Text style={[dr.avatarText, { color: '#DC2626', fontSize: 16 }]}>⚠</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={dr.name} numberOfLines={1}>{row.item_name}</Text>
        <Text style={dr.meta} numberOfLines={1}>
          {fmt(row.waste_qty)}{row.unit ? ` ${row.unit}` : ''}
          {row.type ? `  ·  ${row.type}` : ''}
        </Text>
      </View>
      <View style={[dr.profitChip, { backgroundColor: '#FEE2E2' }]}>
        <Text style={[dr.profitText, { color: '#DC2626' }]}>−{fmt(row.waste_cost)} ₺</Text>
      </View>
    </View>
  );
}

function DoctorRowView({ doc, isLast }: { doc: DoctorRow; isLast: boolean }) {
  const tone = doc.total_profit < 0 ? 'red' : (doc.avg_margin_pct ?? 100) < 20 ? 'yellow' : 'green';
  const fg   = tone === 'red' ? '#DC2626' : tone === 'yellow' ? '#B45309' : '#059669';
  const bg   = tone === 'red' ? '#FEE2E2' : tone === 'yellow' ? '#FEF3C7' : '#ECFDF5';

  return (
    <View style={[dr.row, !isLast && dr.rowDivider]}>
      <View style={dr.avatar}>
        <Text style={dr.avatarText}>
          {doc.doctor_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={dr.name} numberOfLines={1}>{doc.doctor_name}</Text>
        <Text style={dr.meta} numberOfLines={1}>
          {doc.order_count} sipariş · {fmt(doc.total_revenue)} ₺ gelir
        </Text>
      </View>
      <View style={[dr.profitChip, { backgroundColor: bg }]}>
        <Text style={[dr.profitText, { color: fg }]}>
          {doc.total_profit >= 0 ? '+' : '−'}{fmt(Math.abs(doc.total_profit))} ₺
        </Text>
        {doc.avg_margin_pct !== null && (
          <Text style={[dr.marginText, { color: fg }]}>%{doc.avg_margin_pct}</Text>
        )}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const SHADOW = Shadows.card;

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#F1F5F9' },
  scroll: { padding: 16, gap: 14 },

  rangeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  rangeChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E5E5EA',
  },
  rangeChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  rangeChipText:        { fontSize: 12, fontWeight: '700', color: '#475569' },
  rangeChipTextActive:  { color: '#FFFFFF' },

  summaryCard: {
    borderRadius: 14, padding: 18, gap: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    ...SHADOW,
  },
  summaryLabel:  { fontSize: 10, fontWeight: '800', color: '#475569', letterSpacing: 0.8 },
  summaryProfit: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  summaryMargin: { fontSize: 13, fontWeight: '700' },

  summaryGrid: { flexDirection: 'row', gap: 8, marginTop: 14 },
  summaryBreak: { gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.5)' },

  twoCol: { flexDirection: 'row', gap: 14 },
  col:    { gap: 8 },

  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#475569', letterSpacing: 0.8, paddingHorizontal: 4 },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
    ...SHADOW,
  },
  empty: { padding: 24, textAlign: 'center', fontSize: 12, color: '#94A3B8' },
});

const st = StyleSheet.create({
  stat:      { flex: 1, padding: 10, backgroundColor: '#FFFFFF80', borderRadius: 10 },
  statLabel: { fontSize: 9, fontWeight: '800', color: '#64748B', letterSpacing: 0.6 },
  statValue: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 2, letterSpacing: -0.2 },

  breakRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  breakLabel: { fontSize: 12, color: '#475569', fontWeight: '600' },
  breakValue: { fontSize: 12, color: '#0F172A', fontWeight: '700' },
});

const ol = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA' },
  order: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  meta:  { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  profitChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
    alignItems: 'center', minWidth: 70,
  },
  profitText: { fontSize: 12, fontWeight: '800' },
  marginText: { fontSize: 10, fontWeight: '700', marginTop: 1 },
});

const dr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA' },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 12, fontWeight: '800', color: '#2563EB' },
  name: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  meta: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  profitChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999,
    alignItems: 'center', minWidth: 90,
  },
  profitText: { fontSize: 13, fontWeight: '800' },
  marginText: { fontSize: 10, fontWeight: '700', marginTop: 1 },
});
