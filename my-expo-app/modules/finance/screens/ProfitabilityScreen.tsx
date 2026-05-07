// ProfitabilityScreen — Mali İşlemler hub'ında "Karlılık" sekmesi.
// Aylık özet · En karlı/zararlı siparişler · Doktor bazlı marj.

import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Platform, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { TrendingUp, TrendingDown, Users, AlertTriangle } from 'lucide-react-native';

import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { DS } from '../../../core/theme/dsTokens';
import { HubContext } from '../../../core/ui/HubContext';

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

// ─── Component ───────────────────────────────────────────────────────────────
export function ProfitabilityScreen() {
  const isEmbedded = useContext(HubContext);
  const router      = useRouter();
  const { profile } = useAuthStore();
  const { width }   = useWindowDimensions();
  const isDesktop   = width >= 900;
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
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 22, paddingTop: 4, paddingBottom: 48, gap: 14 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Range filter ─────────────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', backgroundColor: DS.ink[100], borderRadius: 9999, padding: 4 }}>
        {RANGE_OPTIONS.map(opt => {
          const active = range === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setRange(opt.key)}
              style={[
                {
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 9999,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                } as any,
                active && {
                  backgroundColor: '#FFF',
                  // @ts-ignore web
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                },
              ]}
            >
              <Text
                style={[
                  { fontSize: 12, fontWeight: '600', color: DS.ink[400] },
                  active && { color: DS.ink[900], fontWeight: '700' },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={DS.ink[400]} />
        </View>
      ) : (
        <>
          {/* ── 2 büyük Hero kart ────────────────────────────────────────── */}
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
            {/* Net Kâr */}
            <View style={{ flex: 1, ...cardSolid, padding: 24 } as any}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: toneBg, alignItems: 'center', justifyContent: 'center' }}>
                  {profit >= 0
                    ? <TrendingUp size={20} color={toneFg} strokeWidth={1.6} />
                    : <TrendingDown size={20} color={toneFg} strokeWidth={1.6} />
                  }
                </View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500] }}>
                  Net Kâr
                </Text>
              </View>
              <Text style={{ ...DISPLAY, fontSize: 36, letterSpacing: -1, color: toneFg, marginBottom: 8 }}>
                {profit >= 0 ? '+' : '−'}₺{fmt(Math.abs(profit))}
              </Text>
              <Text style={{ fontSize: 12, color: DS.ink[400] }}>
                {summary?.total_orders ?? 0} sipariş · bu dönem
              </Text>
            </View>

            {/* Ortalama Marj */}
            <View style={{ flex: 1, ...cardSolid, padding: 24 } as any}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={20} color={DS.ink[500]} strokeWidth={1.6} />
                </View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500] }}>
                  Ortalama Marj
                </Text>
              </View>
              <Text style={{ ...DISPLAY, fontSize: 36, letterSpacing: -1, color: DS.ink[900], marginBottom: 8 }}>
                {margin !== null ? `%${margin}` : '—'}
              </Text>
              <Text style={{ fontSize: 12, color: DS.ink[400] }}>
                {margin !== null && margin >= 30 ? 'Mükemmel'
                  : margin !== null && margin >= 20 ? 'İyi'
                  : margin !== null && margin >= 10 ? 'Düşük' : 'Risk'}
              </Text>
            </View>
          </View>

          {/* ── 4 küçük KPI kartı ────────────────────────────────────────── */}
          <ScrollView
            horizontal={!isDesktop}
            showsHorizontalScrollIndicator={false}
            scrollEnabled={!isDesktop}
            contentContainerStyle={{
              flexDirection: 'row', gap: 12,
              ...(isDesktop ? { width: '100%' } : {}),
            }}
          >
            <KpiMini label="Gelir" value={`₺${fmt(summary?.total_revenue ?? 0)}`} icon={TrendingUp} />
            <KpiMini label="Maliyet" value={`₺${fmt(summary?.total_cost ?? 0)}`} icon={TrendingDown} />
            <KpiMini label="İşçilik" value={`₺${fmt(summary?.total_labor ?? 0)}`} icon={Users} />
            <KpiMini label="Materyal" value={`₺${fmt(summary?.total_material ?? 0)}`} icon={TrendingDown} />
          </ScrollView>

          {/* ── Maliyet Dağılımı ─────────────────────────────────────────── */}
          <View style={{ ...tableCard, padding: 18 } as any}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500], letterSpacing: 0.3, marginBottom: 10 }}>
              Maliyet Dağılımı
            </Text>
            <View style={{ gap: 6 }}>
              <BreakRow label="Materyal"     value={summary?.total_material ?? 0} />
              <BreakRow label="İşçilik"      value={summary?.total_labor ?? 0} />
              <BreakRow label="Genel Gider"  value={summary?.total_overhead ?? 0} />
            </View>
          </View>

          {/* ── Top best/worst (responsive split) ─────────────────────────── */}
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 14 }}>
            <View style={[{ gap: 8 }, isDesktop && { flex: 1 }]}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500], letterSpacing: 0.3, marginBottom: 10, paddingHorizontal: 4 }}>
                EN KÂRLI 5 SİPARİŞ
              </Text>
              <View style={{ ...tableCard } as any}>
                {best.length === 0 ? (
                  <Text style={{ padding: 24, textAlign: 'center', fontSize: 12, color: DS.ink[400] }}>Veri yok</Text>
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

            <View style={[{ gap: 8 }, isDesktop && { flex: 1 }]}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500], letterSpacing: 0.3, marginBottom: 10, paddingHorizontal: 4 }}>
                EN ZARARLI 5 SİPARİŞ
              </Text>
              <View style={{ ...tableCard } as any}>
                {worst.length === 0 ? (
                  <Text style={{ padding: 24, textAlign: 'center', fontSize: 12, color: DS.ink[400] }}>Veri yok</Text>
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
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500], letterSpacing: 0.3, marginBottom: 10, paddingHorizontal: 4 }}>
              DOKTOR BAZLI KÂRLILIK
            </Text>
            <View style={{ ...tableCard } as any}>
              {doctors.length === 0 ? (
                <Text style={{ padding: 24, textAlign: 'center', fontSize: 12, color: DS.ink[400] }}>Veri yok</Text>
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
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500], letterSpacing: 0.3, marginBottom: 10, paddingHorizontal: 4 }}>
              TEKNİSYEN VERİMLİLİĞİ
            </Text>
            <View style={{ ...tableCard } as any}>
              {technicians.length === 0 ? (
                <Text style={{ padding: 24, textAlign: 'center', fontSize: 12, color: DS.ink[400] }}>Veri yok — teknisyen henüz materyal tüketmedi</Text>
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
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500], letterSpacing: 0.3, marginBottom: 10, paddingHorizontal: 4 }}>
                MATERYAL FİRE RAPORU
              </Text>
              <View style={{ ...tableCard } as any}>
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

function KpiMini({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<any> }) {
  return (
    <View style={{ flex: 1, minWidth: 110, ...cardSolid, padding: 16 } as any}>
      <View style={{ width: 28, height: 28, borderRadius: DS.radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.ink[100] }}>
        <Icon size={14} color={DS.ink[500]} strokeWidth={1.6} />
      </View>
      <Text style={{ fontSize: 10, fontWeight: '600', color: DS.ink[400], letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 4 }}>
        {label}
      </Text>
      <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function BreakRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 12, color: DS.ink[500], fontWeight: '600' }}>{label}</Text>
      <Text style={{ fontSize: 12, color: DS.ink[900], fontWeight: '700' }}>{fmt(value)} {'₺'}</Text>
    </View>
  );
}

function OrderListRow({
  order, isLast, onPress,
}: { order: OrderRow; isLast: boolean; onPress: () => void }) {
  const tone = order.profit < 0 ? 'red' : (order.margin_pct ?? 100) < 20 ? 'yellow' : 'green';
  const chipTone = tone === 'red' ? CHIP_TONES.danger : tone === 'yellow' ? CHIP_TONES.warning : CHIP_TONES.success;

  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 18,
          paddingVertical: 14,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
        } as any,
        !isLast && { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: DS.ink[900] }} numberOfLines={1}>
          #{order.order_number}
        </Text>
        <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }} numberOfLines={1}>
          {order.patient_name ?? '—'} {'·'} {order.doctor_name ?? '—'}
          {order.case_type ? ` · ${order.case_type}` : ''}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: DS.radius.pill, alignItems: 'center', minWidth: 70, backgroundColor: chipTone.bg }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: chipTone.fg }}>
          {order.profit >= 0 ? '+' : '−'}{fmt(Math.abs(order.profit))} {'₺'}
        </Text>
        {order.margin_pct !== null && (
          <Text style={{ fontSize: 10, fontWeight: '700', marginTop: 1, color: chipTone.fg }}>%{order.margin_pct}</Text>
        )}
      </View>
    </Pressable>
  );
}

function TechRowView({ row, isLast }: { row: TechnicianUsageRow; isLast: boolean }) {
  const eff = row.efficiency_pct ?? 100;
  const tone = eff < 80 ? 'red' : eff < 95 ? 'yellow' : 'green';
  const chipTone = tone === 'red' ? CHIP_TONES.danger : tone === 'yellow' ? CHIP_TONES.warning : CHIP_TONES.success;

  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
        !isLast && { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
      ]}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: '#7C3AED' }}>
          {(row.user_name ?? '??').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }} numberOfLines={1}>{row.user_name ?? '—'}</Text>
        <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }} numberOfLines={1}>
          {fmt(row.used_qty)} kullanım  {'·'}  {fmt(row.waste_qty)} fire
          {row.waste_cost > 0 ? `  ·  ${fmt(row.waste_cost)} ₺ kayıp` : ''}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: DS.radius.pill, alignItems: 'center', minWidth: 90, backgroundColor: chipTone.bg }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: chipTone.fg }}>%{fmt(eff)}</Text>
        <Text style={{ fontSize: 10, fontWeight: '700', marginTop: 1, color: chipTone.fg }}>verim</Text>
      </View>
    </View>
  );
}

function WasteRowView({ row, isLast }: { row: WasteByMaterial; isLast: boolean }) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
        !isLast && { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
      ]}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: CHIP_TONES.danger.bg, alignItems: 'center', justifyContent: 'center' }}>
        <AlertTriangle size={16} color={CHIP_TONES.danger.fg} strokeWidth={1.6} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }} numberOfLines={1}>{row.item_name}</Text>
        <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }} numberOfLines={1}>
          {fmt(row.waste_qty)}{row.unit ? ` ${row.unit}` : ''}
          {row.type ? `  ·  ${row.type}` : ''}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: DS.radius.pill, alignItems: 'center', minWidth: 90, backgroundColor: CHIP_TONES.danger.bg }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: CHIP_TONES.danger.fg }}>{'−'}{fmt(row.waste_cost)} {'₺'}</Text>
      </View>
    </View>
  );
}

function DoctorRowView({ doc, isLast }: { doc: DoctorRow; isLast: boolean }) {
  const tone = doc.total_profit < 0 ? 'red' : (doc.avg_margin_pct ?? 100) < 20 ? 'yellow' : 'green';
  const chipTone = tone === 'red' ? CHIP_TONES.danger : tone === 'yellow' ? CHIP_TONES.warning : CHIP_TONES.success;

  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
        !isLast && { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
      ]}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: '#2563EB' }}>
          {doc.doctor_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }} numberOfLines={1}>{doc.doctor_name}</Text>
        <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }} numberOfLines={1}>
          {doc.order_count} sipariş {'·'} {fmt(doc.total_revenue)} {'₺'} gelir
        </Text>
      </View>
      <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: DS.radius.pill, alignItems: 'center', minWidth: 90, backgroundColor: chipTone.bg }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: chipTone.fg }}>
          {doc.total_profit >= 0 ? '+' : '−'}{fmt(Math.abs(doc.total_profit))} {'₺'}
        </Text>
        {doc.avg_margin_pct !== null && (
          <Text style={{ fontSize: 10, fontWeight: '700', marginTop: 1, color: chipTone.fg }}>%{doc.avg_margin_pct}</Text>
        )}
      </View>
    </View>
  );
}
