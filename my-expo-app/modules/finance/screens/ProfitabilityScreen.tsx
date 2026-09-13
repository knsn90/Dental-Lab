// ProfitabilityScreen — Mali İşlemler hub'ında "Karlılık" sekmesi.
// Aylık özet · En karlı/zararlı siparişler · Doktor bazlı marj.

import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  Platform, useWindowDimensions,
} from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrendingUp, TrendingDown, Users, AlertTriangle, Percent, Wallet, Boxes } from '../../../core/ui/icons';

import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { DS } from '../../../core/theme/dsTokens';
import { HubContext } from '../../../core/ui/HubContext';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { SlideTabBar } from '../../../core/ui/SlideTabBar';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { baseSymbol, useBaseCurrency } from '../../../core/money/baseCurrency';
import { CURRENCY_META, formatMoney, type Currency } from '../../../core/money/currency';
import { groupByCurrency, type CurrencyTotal } from '../../../core/money/aggregations';

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
  revenue_currency?: string | null;  // faturalar tek dövizliyse o (₺ yanında gösterilir)
  revenue_original?: number | null;  // orijinal döviz cinsinden gelir
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
  revenue_currency?: string | null;  // sipariş tek dövizliyse o (kâr o para biriminde gösterilir)
  revenue_original?: number | null;  // orijinal döviz cinsinden gelir
}

interface DoctorRow {
  doctor_id:      string;
  doctor_name:    string;
  order_count:    number;
  total_revenue:  number;
  total_cost:     number;
  total_profit:   number;
  avg_margin_pct: number | null;
  revenue_currency?: string | null;  // faturalar tek dövizliyse o (₺ yanında gösterilir)
  revenue_original?: number | null;  // orijinal döviz cinsinden gelir
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

// Savunmacı: undefined/null/string (Supabase numeric string döndürür) güvenli.
const fmt = (n: number | string | null | undefined) =>
  (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

// Faturalar tek dövizliyse ₺ yanına orijinal karşılığı: " (€420)". Yoksa ''.
const origSuffix = (cur?: string | null, orig?: number | null): string =>
  cur && orig != null ? ` (${CURRENCY_META[cur as Currency]?.symbol ?? cur}${fmt(orig)})` : '';

function getRange(r: Range): { from: string | null; to: string | null } {
  const now   = new Date();
  const yyyy  = now.getFullYear();
  const mm    = now.getMonth();
  const pad   = (n: number) => String(n).padStart(2, '0');
  const ymd   = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (r === 'thisMonth') return { from: ymd(new Date(yyyy, mm, 1)),     to: ymd(new Date(yyyy, mm + 1, 0)) };
  if (r === 'lastMonth') return { from: ymd(new Date(yyyy, mm - 1, 1)), to: ymd(new Date(yyyy, mm, 0)) };
  if (r === 'thisYear')  return { from: `${yyyy}-01-01`,                to: `${yyyy}-12-31` };
  // 'all' (Tümü): RPC'ler created_at BETWEEN p_from AND p_to kullanıyor; null
  // gönderilince BETWEEN NULL boş döner. Geniş bir aralıkla tüm kayıtları kapsa.
  return { from: '2000-01-01', to: `${yyyy + 1}-12-31` };
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
  // Sipariş linki AKTİF panelde açılmalı — sabit '/(lab)/...' admin panelinden
  // tıklayınca kullanıcıyı lab paneline atıyordu (aynı kalıp: InvoiceDetailScreen).
  const segments    = useSegments();
  const panelBase   = String((segments as string[])?.[0] ?? '(lab)');
  const orderHref   = (id: string) => `/${panelBase}/order/${id}`;
  const { profile } = useAuthStore();
  const { width }   = useWindowDimensions();
  const insets      = useSafeAreaInsets();
  const isDesktop   = width >= 900;
  const labId       = profile?.lab_id ?? profile?.id ?? null;
  const T = useMobileTokens();
  // SlideTabBar cursor'ı beyaz metin basar → koyu ink şart.
  const panelTheme = usePanelTheme();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  useBaseCurrency();

  const [range, setRange] = useState<Range>('thisMonth');

  // localStorage cache (per labId+range key) — 2. ziyaret anında render.
  // v2: RPC çıktı kolonları değişti (total_revenue/total_profit…) — eski v1 cache atılsın.
  const cacheKey = labId ? `profit_screen_v3:${labId}:${range}` : null;
  const loadCached = (): any | null => {
    if (!cacheKey || typeof window === 'undefined' || !window.localStorage) return null;
    try { const r = window.localStorage.getItem(cacheKey); return r ? JSON.parse(r) : null; } catch { return null; }
  };
  const saveCached = (data: any) => {
    if (!cacheKey || typeof window === 'undefined' || !window.localStorage) return;
    try { window.localStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* quota */ }
  };
  const cached = loadCached();

  const [summary, setSummary]     = useState<SummaryRow | null>(cached?.summary ?? null);
  const [best, setBest]           = useState<OrderRow[]>(cached?.best ?? []);
  const [worst, setWorst]         = useState<OrderRow[]>(cached?.worst ?? []);
  const [doctors, setDoctors]     = useState<DoctorRow[]>(cached?.doctors ?? []);
  const [technicians, setTechnicians] = useState<TechnicianUsageRow[]>(cached?.technicians ?? []);
  const [wasteByMat, setWasteByMat]   = useState<WasteByMaterial[]>(cached?.wasteByMat ?? []);
  const [loading, setLoading]     = useState(cached === null);
  // Katı per-currency: gelir para birimine göre (Net Kâr/Maliyet raporlama ₺'de kalır)
  const [revenueByCcy, setRevenueByCcy] = useState<CurrencyTotal[]>([]);
  const [docRevByCcy, setDocRevByCcy]   = useState<Map<string, CurrencyTotal[]>>(new Map());

  useEffect(() => {
    if (!labId) return;
    let cancelled = false;
    const cachedNow = loadCached();
    if (cachedNow === null) setLoading(true);
    const { from, to } = getRange(range);

    Promise.all([
      supabase.rpc('profitability_summary',     { p_lab_id: labId, p_from: from, p_to: to }),
      supabase.rpc('profitability_top_orders',  { p_lab_id: labId, p_limit: 5, p_order_by: 'best',  p_from: from, p_to: to }),
      supabase.rpc('profitability_top_orders',  { p_lab_id: labId, p_limit: 5, p_order_by: 'worst', p_from: from, p_to: to }),
      supabase.rpc('profitability_by_doctor',   { p_lab_id: labId, p_from: from, p_to: to }),
      supabase.rpc('report_technician_usage',   { p_lab_id: labId, p_from: from, p_to: to }),
      supabase.rpc('report_material_waste',     { p_lab_id: labId, p_from: from, p_to: to }),
      supabase.rpc('profitability_revenue_ccy', { p_lab_id: labId, p_from: from, p_to: to }),
      supabase.rpc('profitability_by_doctor_revenue_ccy', { p_lab_id: labId, p_from: from, p_to: to }),
    ]).then(([s, b, w, d, t, mw, rc, drc]) => {
      if (cancelled) return;
      const summaryRow   = (s.data?.[0] ?? null) as SummaryRow | null;
      // Gelir per-currency: RPC varsa onu kullan; yoksa (migration yok) summary base'ini tek dilim yap
      if (!rc.error && Array.isArray(rc.data)) {
        setRevenueByCcy(groupByCurrency((rc.data ?? []) as any[],
          (r: any) => ({ amount: Number(r.revenue) || 0, currency: (r.currency || 'TRY') as Currency })));
      } else {
        const rev = Number((summaryRow as any)?.total_revenue ?? 0);
        setRevenueByCcy(rev > 0 ? [{ currency: 'TRY' as Currency, total: rev, count: 0 }] : []);
      }
      // Per-doktor gelir per-currency (RPC yoksa boş → DoctorRow base+suffix fallback'ine düşer)
      if (!drc.error && Array.isArray(drc.data)) {
        const byDoc = new Map<string, any[]>();
        for (const r of drc.data as any[]) {
          const arr = byDoc.get(r.doctor_id) ?? [];
          arr.push(r); byDoc.set(r.doctor_id, arr);
        }
        const m = new Map<string, CurrencyTotal[]>();
        byDoc.forEach((rows, did) => m.set(did, groupByCurrency(rows,
          (r: any) => ({ amount: Number(r.revenue) || 0, currency: (r.currency || 'TRY') as Currency }))));
        setDocRevByCcy(m);
      } else {
        setDocRevByCcy(new Map());
      }
      const bestRows     = (b.data ?? []) as OrderRow[];
      const worstRows    = (w.data ?? []) as OrderRow[];
      const doctorRows   = (d.data ?? []) as DoctorRow[];
      const techRows     = (t.data ?? []) as TechnicianUsageRow[];
      const wasteRows    = (mw.data ?? []) as WasteByMaterial[];
      setSummary(summaryRow);
      setBest(bestRows);
      setWorst(worstRows);
      setDoctors(doctorRows);
      setTechnicians(techRows);
      setWasteByMat(wasteRows);
      saveCached({
        summary: summaryRow, best: bestRows, worst: worstRows,
        doctors: doctorRows, technicians: techRows, wasteByMat: wasteRows,
      });
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [labId, range]);

  const margin     = summary?.avg_margin_pct ?? null;
  const profit     = summary?.total_profit ?? 0;
  const profitTone = profit < 0 ? 'red' : (margin !== null && margin < 20) ? 'yellow' : 'green';
  const toneBg     = profitTone === 'red' ? '#FEE2E2' : profitTone === 'yellow' ? '#FEF3C7' : '#ECFDF5';
  const toneFg     = profitTone === 'red' ? '#DC2626' : profitTone === 'yellow' ? '#B45309' : '#059669';
  // "En Zararlı" yalnızca gerçekten zararda (kâr < 0) siparişleri göstersin —
  // ters sıralama kârlı siparişleri "zararlı" gibi göstermesin.
  const realWorst = worst.filter(o => Number(o.profit ?? 0) < 0);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 12, paddingTop: isEmbedded ? 4 : insets.top + 8, paddingBottom: 120, gap: 14 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Aralık seçici — uygulamanın ortak sekme çubuğu (sm) ─────────
          Eskiden gri raylı, tam genişliğe eşit dağılan kendi şeridiydi:
          4 seçenek 1200px'e yayılınca "Bu Ay" ile "Tümü" arası ekranın yarısı
          kadar açılıyordu. Artık içeriğine sarılıyor ve Siparişler / Onaylar /
          Kurumlar ile aynı dili konuşuyor. */}
      <SlideTabBar
        size="sm"
        items={RANGE_OPTIONS.map(o => ({ key: o.key, label: o.label }))}
        activeKey={range}
        onChange={(k) => setRange(k as Range)}
        accentColor={panelTheme.accent}
        style={{ marginStart: -3 }}
      />

      {loading ? (
        <CenteredLoader color={T.ink3} inline />
      ) : (
        <>
          {/* ── F1 HeroCard — Karlılık özeti (büyük + kapsamlı) ─────────── */}
          <View style={{
            borderRadius: 20, overflow: 'hidden',
            backgroundColor: toneFg, padding: 20, position: 'relative',
          }}>
            <View style={{ position: 'absolute', top: -40, end: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.18)' }} />
            <View style={{ position: 'absolute', bottom: -50, start: -20, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.12)' }} />

            {/* Üst satır: Net Kâr + İkon */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)', marginBottom: 8 }}>
                  Net Kâr · Bu Dönem
                </Text>
                <Text
                  style={{ ...DISPLAY, fontSize: 38, color: '#FFFFFF', letterSpacing: -1.2, lineHeight: 42 }}
                  numberOfLines={1}
                >
                  {profit >= 0 ? '+' : '−'}{baseSymbol()}{fmt(Math.abs(profit))}
                </Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 4 }}>
                  {/* Şablon dizeleri sözlükle eşleşemez (sayı değişiyor) →
                      statik kelimeler ayrı ayrı autoT'den geçer. */}
                  {summary?.total_orders ?? 0} {autoT('sipariş')} · {margin !== null ? `%${margin} ${autoT('marj')}` : `${autoT('marj')} —`}
                  {margin !== null ? ` · ${autoT(
                    margin >= 30 ? 'Mükemmel'
                    : margin >= 20 ? 'İyi'
                    : margin >= 10 ? 'Düşük' : 'Risk'
                  )}` : ''}
                </Text>
              </View>
              <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.22)' }}>
                {profit >= 0
                  ? <TrendingUp size={22} color="#FFFFFF" strokeWidth={1.6} />
                  : <TrendingDown size={22} color="#FFFFFF" strokeWidth={1.6} />
                }
              </View>
            </View>

            {/* Marj büyük satırı */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 14, paddingTop: 12,
              borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.22)',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Percent size={13} color="rgba(255,255,255,0.85)" strokeWidth={2} />
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
                  Ortalama Marj
                </Text>
              </View>
              <Text style={{ ...DISPLAY, fontSize: 22, color: '#FFFFFF', letterSpacing: -0.6, lineHeight: 26 }}>
                {margin !== null ? `%${margin}` : '—'}
              </Text>
            </View>

            {/* 4 mini stat grid — Gelir per-currency, diğerleri raporlama ₺ */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              {([
                { label: 'Gelir',    slices: revenueByCcy, icon: TrendingUp },
                { label: 'Maliyet',  value: `${baseSymbol()}${fmt(summary?.total_cost     ?? 0)}`, icon: TrendingDown },
                { label: 'İşçilik',  value: `${baseSymbol()}${fmt(summary?.total_labor    ?? 0)}`, icon: Users        },
                { label: 'Materyal', value: `${baseSymbol()}${fmt(summary?.total_material ?? 0)}`, icon: Boxes        },
              ] as { label: string; value?: string; slices?: CurrencyTotal[]; icon: any }[]).map(stat => {
                const Icon = stat.icon;
                return (
                  <View key={stat.label} style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 9, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <Icon size={10} color="rgba(255,255,255,0.85)" strokeWidth={2} />
                      <Text style={{ fontSize: 8.5, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
                        {stat.label}
                      </Text>
                    </View>
                    {stat.slices ? (
                      stat.slices.length === 0 ? (
                        <Text style={{ ...DISPLAY, fontSize: 13, color: '#FFFFFF', letterSpacing: -0.2, lineHeight: 17 }}>—</Text>
                      ) : (
                        <View style={{ gap: 1 }}>
                          {stat.slices.map(s => (
                            <Text key={s.currency} style={{ ...DISPLAY, fontSize: 13, color: '#FFFFFF', letterSpacing: -0.2, lineHeight: 17 }} numberOfLines={1}>
                              {formatMoney(s.total, (s.currency as Currency), { fractionDigits: 0 })}
                            </Text>
                          ))}
                        </View>
                      )
                    ) : (
                      <Text style={{ ...DISPLAY, fontSize: 13, color: '#FFFFFF', letterSpacing: -0.2, lineHeight: 17 }} numberOfLines={1}>
                        {stat.value}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
            <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', marginTop: 8 }}>
              {/* Eskiden {baseSymbol()} cümleyi üç parçaya bölüyordu; her parça
                  ayrı ayrı sözlükte aranıp yarısı çevrilmeden kalıyordu. */}
              {autoT('Net Kâr · Maliyet · İşçilik · Materyal raporlama para biriminde gösterilir:')} {baseSymbol()}
              {' '}{autoT('Farklı para birimindeki kalemler güncel kurla çevrildiği için tutarlar yaklaşıktır (≈).')}
            </Text>
          </View>

          {/* ── Maliyet Dağılımı ─────────────────────────────────────────── */}
          <View style={{ ...tableCard, backgroundColor: T.card, borderColor: T.hairline, padding: 18 } as any}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink3, letterSpacing: 0.3, marginBottom: 10 }}>
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
              <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink3, letterSpacing: 0.3, marginBottom: 10, paddingHorizontal: 4 }}>
                EN KÂRLI 5 SİPARİŞ
              </Text>
              <View style={{ ...tableCard, backgroundColor: T.card, borderColor: T.hairline } as any}>
                {best.length === 0 ? (
                  <Text style={{ padding: 24, textAlign: 'center', fontSize: 12, color: T.ink3 }}>Veri yok</Text>
                ) : best.map((o, i) => (
                  <OrderListRow
                    key={o.id}
                    order={o}
                    isLast={i === best.length - 1}
                    onPress={() => router.push(orderHref(o.id) as any)}
                  />
                ))}
              </View>
            </View>

            <View style={[{ gap: 8 }, isDesktop && { flex: 1 }]}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink3, letterSpacing: 0.3, marginBottom: 10, paddingHorizontal: 4 }}>
                EN ZARARLI 5 SİPARİŞ
              </Text>
              <View style={{ ...tableCard, backgroundColor: T.card, borderColor: T.hairline } as any}>
                {realWorst.length === 0 ? (
                  <Text style={{ padding: 24, textAlign: 'center', fontSize: 12, color: T.ink3 }}>Zararlı sipariş yok</Text>
                ) : realWorst.map((o, i) => (
                  <OrderListRow
                    key={o.id}
                    order={o}
                    isLast={i === realWorst.length - 1}
                    onPress={() => router.push(orderHref(o.id) as any)}
                  />
                ))}
              </View>
            </View>
          </View>

          {/* ── Per-doctor breakdown ─────────────────────────────────────── */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink3, letterSpacing: 0.3, marginBottom: 10, paddingHorizontal: 4 }}>
              DOKTOR BAZLI KÂRLILIK
            </Text>
            <View style={{ ...tableCard, backgroundColor: T.card, borderColor: T.hairline } as any}>
              {doctors.length === 0 ? (
                <Text style={{ padding: 24, textAlign: 'center', fontSize: 12, color: T.ink3 }}>Veri yok</Text>
              ) : doctors.map((d, i) => (
                <DoctorRowView
                  key={d.doctor_id}
                  doc={d}
                  revSlices={docRevByCcy.get(d.doctor_id)}
                  isLast={i === doctors.length - 1}
                />
              ))}
            </View>
          </View>

          {/* ── Technician usage + efficiency ─────────────────────────── */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink3, letterSpacing: 0.3, marginBottom: 2, paddingHorizontal: 4 }}>
              TEKNİSYEN MALZEME VERİMİ
            </Text>
            <Text style={{ fontSize: 10.5, color: T.ink3, marginBottom: 10, paddingHorizontal: 4 }}>
              Kullanılan / fire malzeme oranı. Zaman/iş performansı için Performans ekranına bakın.
            </Text>
            <View style={{ ...tableCard, backgroundColor: T.card, borderColor: T.hairline } as any}>
              {technicians.length === 0 ? (
                <Text style={{ padding: 24, textAlign: 'center', fontSize: 12, color: T.ink3 }}>Veri yok — teknisyen henüz materyal tüketmedi</Text>
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
              <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink3, letterSpacing: 0.3, marginBottom: 10, paddingHorizontal: 4 }}>
                MATERYAL FİRE RAPORU
              </Text>
              <View style={{ ...tableCard, backgroundColor: T.card, borderColor: T.hairline } as any}>
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
  const T = useMobileTokens();
  return (
    <View style={{ flex: 1, minWidth: 110, ...cardSolid, backgroundColor: T.card, padding: 16 } as any}>
      <View style={{ width: 28, height: 28, borderRadius: DS.radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: T.cardSoft }}>
        <Icon size={14} color={T.ink3} strokeWidth={1.6} />
      </View>
      <Text style={{ fontSize: 10, fontWeight: '600', color: T.ink3, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 4 }}>
        {label}
      </Text>
      <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: T.ink }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function BreakRow({ label, value }: { label: string; value: number }) {
  const T = useMobileTokens();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 12, color: T.ink3, fontWeight: '600' }}>{label}</Text>
      <Text style={{ fontSize: 12, color: T.ink, fontWeight: '700' }}>{baseSymbol()}{fmt(value)}</Text>
    </View>
  );
}

function OrderListRow({
  order, isLast, onPress,
}: { order: OrderRow; isLast: boolean; onPress: () => void }) {
  const T = useMobileTokens();
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
        !isLast && { borderBottomWidth: 1, borderBottomColor: T.hairline },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: T.ink }} numberOfLines={1}>
          #{order.order_number}
        </Text>
        <Text style={{ fontSize: 11, color: T.ink3, marginTop: 1 }} numberOfLines={1}>
          {order.patient_name ?? '—'} {'·'} {order.doctor_name ?? '—'}
          {order.case_type ? ` · ${order.case_type}` : ''}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: DS.radius.pill, alignItems: 'center', minWidth: 70, backgroundColor: chipTone.bg }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: chipTone.fg }}>
          {(() => {
            // Tek (TL dışı) dövizli sipariş → kârı kendi para biriminde (kâr = gelir × marj oranı)
            const foreign = !!order.revenue_currency && order.revenue_currency !== 'TRY' && order.revenue_original != null && order.sale_price > 0;
            if (foreign) {
              const sym = CURRENCY_META[order.revenue_currency as Currency]?.symbol ?? order.revenue_currency;
              const pOrig = (Number(order.revenue_original) || 0) * (order.profit / order.sale_price);
              return `${pOrig >= 0 ? '+' : '−'}${sym}${fmt(Math.abs(pOrig))}`;
            }
            return `${order.profit >= 0 ? '+' : '−'}${baseSymbol()}${fmt(Math.abs(order.profit))}`;
          })()}
        </Text>
        {order.margin_pct !== null && (
          <Text style={{ fontSize: 10, fontWeight: '700', marginTop: 1, color: chipTone.fg }}>%{order.margin_pct}</Text>
        )}
      </View>
    </Pressable>
  );
}

function TechRowView({ row, isLast }: { row: TechnicianUsageRow; isLast: boolean }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const eff = row.efficiency_pct ?? 100;
  const tone = eff < 80 ? 'red' : eff < 95 ? 'yellow' : 'green';
  const chipTone = tone === 'red' ? CHIP_TONES.danger : tone === 'yellow' ? CHIP_TONES.warning : CHIP_TONES.success;

  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
        !isLast && { borderBottomWidth: 1, borderBottomColor: T.hairline },
      ]}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isDark ? 'rgba(124,58,237,0.22)' : '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#C4B5FD' : '#7C3AED' }}>
          {(row.user_name ?? '??').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: T.ink }} numberOfLines={1}>{row.user_name ?? '—'}</Text>
        <Text style={{ fontSize: 11, color: T.ink3, marginTop: 1 }} numberOfLines={1}>
          {fmt(row.used_qty)} kullanım  {'·'}  {fmt(row.waste_qty)} fire
          {row.waste_cost > 0 ? `  ·  ${baseSymbol()}${fmt(row.waste_cost)} kayıp` : ''}
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
  const T = useMobileTokens();
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
        !isLast && { borderBottomWidth: 1, borderBottomColor: T.hairline },
      ]}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: CHIP_TONES.danger.bg, alignItems: 'center', justifyContent: 'center' }}>
        <AlertTriangle size={16} color={CHIP_TONES.danger.fg} strokeWidth={1.6} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: T.ink }} numberOfLines={1}>{row.item_name}</Text>
        <Text style={{ fontSize: 11, color: T.ink3, marginTop: 1 }} numberOfLines={1}>
          {fmt(row.waste_qty)}{row.unit ? ` ${row.unit}` : ''}
          {row.type ? `  ·  ${row.type}` : ''}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: DS.radius.pill, alignItems: 'center', minWidth: 90, backgroundColor: CHIP_TONES.danger.bg }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: CHIP_TONES.danger.fg }}>{'−'}{baseSymbol()}{fmt(row.waste_cost)}</Text>
      </View>
    </View>
  );
}

function DoctorRowView({ doc, isLast, revSlices }: { doc: DoctorRow; isLast: boolean; revSlices?: CurrencyTotal[] }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const tone = doc.total_profit < 0 ? 'red' : (doc.avg_margin_pct ?? 100) < 20 ? 'yellow' : 'green';
  const chipTone = tone === 'red' ? CHIP_TONES.danger : tone === 'yellow' ? CHIP_TONES.warning : CHIP_TONES.success;

  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
        !isLast && { borderBottomWidth: 1, borderBottomColor: T.hairline },
      ]}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isDark ? 'rgba(37,99,235,0.22)' : '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#93C5FD' : '#2563EB' }}>
          {(doc.doctor_name ?? '—').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: T.ink }} numberOfLines={1}>{doc.doctor_name}</Text>
        <Text style={{ fontSize: 11, color: T.ink3, marginTop: 1 }} numberOfLines={1}>
          {/* Katı per-currency: RPC varsa her döviz ayrı (orijinal); yoksa base+orig-suffix fallback */}
          {doc.order_count} sipariş {'·'} {
            revSlices && revSlices.length
              ? revSlices.map(s => formatMoney(s.total, s.currency, { fractionDigits: 0 })).join(' · ')
              : `${baseSymbol()}${fmt(doc.total_revenue)}${origSuffix(doc.revenue_currency, doc.revenue_original)}`
          } {autoT('gelir')}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: DS.radius.pill, alignItems: 'center', minWidth: 90, backgroundColor: chipTone.bg }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: chipTone.fg }}>
          {(() => {
            // Tek (TL dışı) dövizli doktor → kârı kendi para biriminde göster (kâr = gelir × marj oranı)
            const foreign = !!doc.revenue_currency && doc.revenue_currency !== 'TRY' && doc.revenue_original != null && doc.total_revenue > 0;
            if (foreign) {
              const sym = CURRENCY_META[doc.revenue_currency as Currency]?.symbol ?? doc.revenue_currency;
              const pOrig = (Number(doc.revenue_original) || 0) * (doc.total_profit / doc.total_revenue);
              return `${pOrig >= 0 ? '+' : '−'}${sym}${fmt(Math.abs(pOrig))}`;
            }
            return `${doc.total_profit >= 0 ? '+' : '−'}${baseSymbol()}${fmt(Math.abs(doc.total_profit))}`;
          })()}
        </Text>
        {doc.avg_margin_pct !== null && (
          <Text style={{ fontSize: 10, fontWeight: '700', marginTop: 1, color: chipTone.fg }}>%{doc.avg_margin_pct}</Text>
        )}
      </View>
    </View>
  );
}
