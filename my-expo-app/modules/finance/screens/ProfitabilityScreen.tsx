// ProfitabilityScreen — Mali İşlemler hub'ında "Karlılık" sekmesi.
//
// Yapı (Hizmet bedelleri / Giderler / Tedarikçiler ile aynı dil):
//   • BEYAZ HERO: dönemin net kârı (KDV hariç) + önceki döneme göre değişim →
//     gelirin maliyet kalemlerine ve kâra dağılımı → son 6 ayın kâr çubukları
//   • Tek kart: dönem sekmeleri + Klinikler / İşlemler / Malzeme verimi
//
// NEDEN varsayılan "Geçen ay": gelir kesinleşmiş hizmet bedellerinden sayılır ve
// bunlar ayın 1'inde toplu kesilir. "Bu ay" ayın büyük kısmında 0 gelir + zarar
// gösteriyor, lab her gün zarar ediyormuş gibi görünüyordu.

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Platform, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info, FileSpreadsheet } from '../../../core/ui/icons';

import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { HubContext } from '../../../core/ui/HubContext';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { useBaseCurrency } from '../../../core/money/baseCurrency';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { groupByCurrency, type CurrencyTotal } from '../../../core/money/aggregations';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { useInkUI } from '../../../core/theme/inkScale';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { downloadCsv, csvMoney } from '../../../core/util/csvExport';
import { toast } from '../../../core/ui/Toast';
import {
  buildClinicRows, buildServiceRows, missingCosts, marginLabel, countClinicRows, countServiceRows,
  type ClinicLine, type ServiceLine,
} from '../profitBreakdown';
import { ProfitClinicTable } from '../components/ProfitClinicTable';
import { ProfitServiceTable } from '../components/ProfitServiceTable';

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
  revenue_currency?: string | null;
  revenue_original?: number | null;
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

type Range = 'lastMonth' | 'thisMonth' | 'thisYear' | 'all';
type Tab = 'clinic' | 'service' | 'material';
type Bounds = { from: string; to: string };

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthBounds = (y: number, m: number): Bounds => ({ from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) });

/** Dönem + kıyas için önceki eşdeğer dönem. */
function getRange(r: Range): { cur: Bounds; prev: Bounds | null } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (r === 'thisMonth') return { cur: monthBounds(y, m),     prev: monthBounds(y, m - 1) };
  if (r === 'lastMonth') return { cur: monthBounds(y, m - 1), prev: monthBounds(y, m - 2) };
  if (r === 'thisYear')  return { cur: { from: `${y}-01-01`, to: `${y}-12-31` }, prev: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` } };
  // 'all': RPC'ler BETWEEN p_from AND p_to kullanır; null → boş döner. Geniş aralık.
  return { cur: { from: '2000-01-01', to: `${y + 1}-12-31` }, prev: null };
}

/** Son 6 KAPANMIŞ ay (geçen ay dahil) — kâr çubukları için. */
function trendMonths(): { key: string; label: string; bounds: Bounds }[] {
  const now = new Date();
  const out: { key: string; label: string; bounds: Bounds }[] = [];
  for (let k = 6; k >= 1; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    out.push({
      key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      label: d.toLocaleDateString(localeTag(), { month: 'short' }),
      bounds: monthBounds(d.getFullYear(), d.getMonth()),
    });
  }
  return out;
}

const num = (n: number | string | null | undefined) => Number(n) || 0;
const fmtN = (n: number | string | null | undefined) => num(n).toLocaleString(localeTag(), { maximumFractionDigits: 0 });
/** Yüzde: −12.4 → "−%12,4" (eksi işaret yüzdenin önünde). */
const fmtPct = (n: number) => `${n < 0 ? '−' : ''}%${Math.abs(Number(n) || 0).toLocaleString(localeTag(), { maximumFractionDigits: 1 })}`;
/** Çubuk etiketi: 12.400 → "12,4K" (para birimi başlıkta, raporlama dövizi). */
const compactK = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1000
    ? `${(a / 1000).toLocaleString(localeTag(), { maximumFractionDigits: a >= 100000 ? 0 : 1 })}K`
    : a.toLocaleString(localeTag(), { maximumFractionDigits: 0 });
  return `${n < 0 ? '−' : ''}${s}`;
};

// ─── Component ───────────────────────────────────────────────────────────────
export function ProfitabilityScreen() {
  const isEmbedded = useContext(HubContext);
  const { profile } = useAuthStore();
  const labId = profile?.lab_id ?? profile?.id ?? null;
  const panelTheme = usePanelTheme();
  const heroInk = useWhiteHeroInk(panelTheme.primary);
  const U = useInkUI();
  const { t } = useTranslation();
  const base = useBaseCurrency() as Currency;
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [range, setRange] = useState<Range>('lastMonth');
  const [tab, setTab] = useState<Tab>('clinic');

  // localStorage önbelleği (lab + aralık) — 2. ziyarette anında boyanır.
  // v6: önceki dönem özeti eklendi.
  const cacheKey = labId ? `profit_screen_v6:${labId}:${range}` : null;
  const loadCached = (): any | null => {
    if (!cacheKey || typeof window === 'undefined' || !window.localStorage) return null;
    try { const r = window.localStorage.getItem(cacheKey); return r ? JSON.parse(r) : null; } catch { return null; }
  };
  const saveCached = (data: any) => {
    if (!cacheKey || typeof window === 'undefined' || !window.localStorage) return;
    try { window.localStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* quota */ }
  };
  const cached = loadCached();

  const [summary, setSummary]         = useState<SummaryRow | null>(cached?.summary ?? null);
  const [prevSummary, setPrevSummary] = useState<SummaryRow | null>(cached?.prevSummary ?? null);
  const [clinicLines, setClinicLines]   = useState<ClinicLine[]>(cached?.clinicLines ?? []);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>(cached?.serviceLines ?? []);
  const clinicRows  = useMemo(() => buildClinicRows(clinicLines), [clinicLines]);
  const serviceRows = useMemo(() => buildServiceRows(serviceLines), [serviceLines]);
  // Kırılım sorgusu hata verdiyse "hizmet bedeli yok" DENMEZ (yanıltıcı) ve önbelleğe yazılmaz.
  const [breakdownFailed, setBreakdownFailed] = useState(false);
  const [technicians, setTechnicians] = useState<TechnicianUsageRow[]>(cached?.technicians ?? []);
  const [wasteByMat, setWasteByMat]   = useState<WasteByMaterial[]>(cached?.wasteByMat ?? []);
  const [loading, setLoading]         = useState(cached === null);
  // Katı per-currency: gelir para birimine göre (Net Kâr/Maliyet raporlama dövizinde)
  const [revenueByCcy, setRevenueByCcy] = useState<CurrencyTotal[]>(cached?.revenueByCcy ?? []);

  // Aralık değişince state HEMEN o aralığa geçer (render sırasında — eski veriyle tek kare boyanmaz).
  const [shownKey, setShownKey] = useState(cacheKey);
  if (shownKey !== cacheKey) {
    setShownKey(cacheKey);
    setSummary(cached?.summary ?? null);
    setPrevSummary(cached?.prevSummary ?? null);
    setClinicLines(cached?.clinicLines ?? []);
    setServiceLines(cached?.serviceLines ?? []);
    setBreakdownFailed(false);
    setTechnicians(cached?.technicians ?? []);
    setWasteByMat(cached?.wasteByMat ?? []);
    setRevenueByCcy(cached?.revenueByCcy ?? []);
    setLoading(cached === null);
  }

  useEffect(() => {
    if (!labId) return;
    // Aralık değişince cleanup bu isteği iptal eder: geç dönen eski yanıt yeni state'i ezmez.
    let cancelled = false;
    const { cur, prev } = getRange(range);
    const args = { p_lab_id: labId, p_from: cur.from, p_to: cur.to };

    Promise.all([
      supabase.rpc('profitability_summary',     args),
      supabase.rpc('profitability_by_clinic',   args),
      supabase.rpc('profitability_by_service',  args),
      supabase.rpc('report_technician_usage',   args),
      supabase.rpc('report_material_waste',     args),
      supabase.rpc('profitability_revenue_ccy', args),
      prev
        ? supabase.rpc('profitability_summary', { p_lab_id: labId, p_from: prev.from, p_to: prev.to })
        : Promise.resolve({ data: null, error: null } as any),
    ]).then(([s, cl, sv, tu, mw, rc, ps]) => {
      if (cancelled) return;
      const summaryRow = (s.data?.[0] ?? null) as SummaryRow | null;
      const prevRow    = ((ps as any)?.data?.[0] ?? null) as SummaryRow | null;
      const rcOk = !rc.error && Array.isArray(rc.data);
      let revenue: CurrencyTotal[];
      if (rcOk) {
        revenue = groupByCurrency((rc.data ?? []) as any[],
          (r: any) => ({ amount: Number(r.revenue) || 0, currency: (r.currency || 'TRY') as Currency }));
      } else {
        const rev = num((summaryRow as any)?.total_revenue);
        revenue = rev > 0 ? [{ currency: base, total: rev, count: 0 }] : [];
      }
      const clinicRaw  = (cl.data ?? []) as ClinicLine[];
      const serviceRaw = (sv.data ?? []) as ServiceLine[];
      const techRows   = (tu.data ?? []) as TechnicianUsageRow[];
      const wasteRows  = (mw.data ?? []) as WasteByMaterial[];
      const failed     = !!(s.error || cl.error || sv.error);
      setSummary(summaryRow);
      setPrevSummary(prevRow);
      setRevenueByCcy(revenue);
      setClinicLines(clinicRaw);
      setServiceLines(serviceRaw);
      setBreakdownFailed(!!(cl.error || sv.error));
      setTechnicians(techRows);
      setWasteByMat(wasteRows);
      if (!failed) saveCached({
        summary: summaryRow, prevSummary: prevRow, clinicLines: clinicRaw, serviceLines: serviceRaw,
        technicians: techRows, wasteByMat: wasteRows, revenueByCcy: rcOk ? revenue : null,
      });
      setLoading(false);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labId, range]);

  // ── Son 6 ayın kârı — aralıktan bağımsız, lab başına önbellekli ──
  const trendKey = labId ? `profit_trend_v1:${labId}:${ymd(new Date()).slice(0, 7)}` : null;
  const [trend, setTrend] = useState<{ key: string; label: string; profit: number; revenue: number }[]>(() => {
    if (!trendKey || typeof window === 'undefined' || !window.localStorage) return [];
    try { return JSON.parse(window.localStorage.getItem(trendKey) ?? '[]'); } catch { return []; }
  });
  useEffect(() => {
    if (!labId) return;
    let cancelled = false;
    const months = trendMonths();
    Promise.all(months.map(mo =>
      supabase.rpc('profitability_summary', { p_lab_id: labId, p_from: mo.bounds.from, p_to: mo.bounds.to }),
    )).then(results => {
      if (cancelled) return;
      if (results.some(r => r.error)) return;
      const rows = months.map((mo, i) => {
        const r = (results[i].data?.[0] ?? null) as SummaryRow | null;
        return { key: mo.key, label: mo.label, profit: num(r?.total_profit), revenue: num(r?.total_revenue) };
      });
      setTrend(rows);
      try { if (trendKey) window.localStorage.setItem(trendKey, JSON.stringify(rows)); } catch { /* quota */ }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labId]);

  // ── Türetilen değerler ──
  const revenue  = num(summary?.total_revenue);
  const profit   = num(summary?.total_profit);
  const hasRevenue = revenue > 0;
  // Gelir yoksa marj hesaplanamaz — "%0 · Risk" yanıltıcıydı.
  const margin   = hasRevenue ? (summary?.avg_margin_pct ?? null) : null;
  const missing  = missingCosts(summary);
  const marginTag = marginLabel(margin, missing);
  const missingMsg = missing.labor && missing.overhead
    ? 'Bu dönem işçilik ve genel gider girilmemiş — kâr olduğundan yüksek görünüyor'
    : missing.labor
      ? 'Bu dönem işçilik girilmemiş — kâr olduğundan yüksek görünüyor'
      : missing.overhead
        ? 'Bu dönem genel gider girilmemiş — kâr olduğundan yüksek görünüyor'
        : null;

  const prevProfit = num(prevSummary?.total_profit);
  const prevRevenue = num(prevSummary?.total_revenue);
  // Kâr değişimi: önceki dönem kârı anlamlıysa (gelir var + kâr ≠ 0).
  const delta = hasRevenue && prevRevenue > 0 && prevProfit !== 0
    ? Math.round(((profit - prevProfit) / Math.abs(prevProfit)) * 100)
    : null;

  const good = heroInk.isDark ? '#6EE7B7' : '#0F6E56';
  const bad  = heroInk.isDark ? '#FCA5A5' : '#B42318';
  const fmt0 = (n: number) => formatMoney(n, base, { fractionDigits: 0 });

  const periodLabel = (() => {
    const now = new Date();
    if (range === 'thisMonth' || range === 'lastMonth') {
      const d = new Date(now.getFullYear(), now.getMonth() - (range === 'lastMonth' ? 1 : 0), 1);
      return d.toLocaleDateString(localeTag(), { month: 'long', year: 'numeric' });
    }
    if (range === 'thisYear') return String(now.getFullYear());
    return autoT('Tüm zamanlar');
  })();

  // Gelirin dağılımı: Materyal · İşçilik · Genel gider · Kâr (zarar varsa ölçek maliyet).
  const flow = [
    { key: 'mat', label: autoT('Materyal'),    value: num(summary?.total_material), color: '#4A8FC9' },
    { key: 'lab', label: autoT('İşçilik'),     value: num(summary?.total_labor),    color: '#E89B2A' },
    { key: 'ovh', label: autoT('Genel gider'), value: num(summary?.total_overhead), color: '#8B5CB8' },
    ...(profit > 0 ? [{ key: 'pro', label: autoT('Kâr'), value: profit, color: '#2D9A6B' }] : []),
  ].filter(p => p.value > 0);
  const flowTotal = flow.reduce((s, p) => s + p.value, 0);

  const RANGE_OPTIONS: { key: Range; label: string }[] = [
    { key: 'lastMonth', label: autoT('Geçen ay') },
    { key: 'thisMonth', label: autoT('Bu ay') },
    { key: 'thisYear',  label: autoT('Bu yıl') },
    { key: 'all',       label: autoT('Tümü') },
  ];
  const TABS: { key: Tab; label: string; n: number }[] = [
    { key: 'clinic',   label: autoT('Klinikler'),     n: countClinicRows(clinicRows) },
    { key: 'service',  label: t('profitability.tabServices'), n: countServiceRows(serviceRows) },
    { key: 'material', label: autoT('Malzeme verimi'), n: technicians.length },
  ];

  const exportCsv = async () => {
    const sliceText = (sl: { currency: string; total: number }[]) =>
      sl.map(s => `${csvMoney(s.total)} ${s.currency}`).join(' + ');
    const res = tab === 'service'
      ? await downloadCsv(`Karlilik-Islemler-${periodLabel}`, serviceRows as any[], [
          { header: 'İşlem',     value: (r: any) => r.name ?? r.kind },
          { header: 'Adet',      value: (r: any) => String(r.quantity ?? '') },
          { header: 'Ciro',      value: (r: any) => sliceText(r.slices ?? []) },
          { header: 'Pay %',     value: (r: any) => (r.share != null ? String(r.share) : '') },
        ])
      : await downloadCsv(`Karlilik-Klinikler-${periodLabel}`, clinicRows as any[], [
          { header: 'Klinik',    value: (r: any) => r.name ?? 'Kliniksiz' },
          { header: 'Sipariş',   value: (r: any) => String(r.orderCount ?? 0) },
          { header: 'Ciro',      value: (r: any) => sliceText(r.slices ?? []) },
          { header: 'Pay %',     value: (r: any) => (r.share != null ? String(r.share) : '') },
        ]);
    if (!res.ok && res.error) toast.error(res.error);
    else toast.success(autoT('CSV indirildi'));
  };

  const trendMax = Math.max(1, ...trend.map(x => Math.abs(x.profit)));
  const showTrend = trend.filter(x => x.revenue > 0).length >= 2;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: 4, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      {loading ? (
        <CenteredLoader color={U.ink[400]} inline />
      ) : (
        <>
          {/* ── BEYAZ HERO ───────────────────────────────────────────── */}
          <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 10, paddingBottom: 12 }}>
            <WhiteHero
              kicker={`${periodLabel} · ${autoT('KDV hariç')}`}
              accent={panelTheme.primary}
              title={hasRevenue ? (
                <>{autoT('Net kâr')} <Text style={{ color: profit < 0 ? bad : good }}>{profit < 0 ? '−' : '+'}{fmt0(Math.abs(profit))}</Text></>
              ) : autoT('Bu dönemde gelir yok')}
              description={
                `${fmtN(summary?.total_orders)} ${autoT('sipariş')}` +
                (margin !== null ? ` · ${fmtPct(margin)} ${autoT('marj')}` : '') +
                (marginTag ? ` · ${autoT(marginTag)}` : '')
              }
              stats={[
                ...(delta !== null ? [{
                  value: `${delta > 0 ? '+' : ''}${delta}%`,
                  label: autoT(range === 'thisYear' ? 'Geçen yıla göre' : 'Önceki aya göre'),
                  color: delta >= 0 ? good : bad,
                }] : []),
                { value: margin !== null ? fmtPct(margin) : '—', label: autoT('Marj') },
              ]}
              actions={Platform.OS === 'web' && hasRevenue ? (
                <Pressable
                  onPress={() => { void exportCsv(); }}
                  accessibilityRole="button"
                  style={({ hovered, pressed }: any) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    height: 36, paddingHorizontal: 14, borderRadius: 999,
                    backgroundColor: hovered ? U.rowHover : U.plainBtn.bg,
                    borderWidth: 1, borderColor: U.plainBtn.border, opacity: pressed ? 0.8 : 1,
                    cursor: 'pointer' as any,
                  })}
                >
                  <FileSpreadsheet size={15} color={U.plainBtn.fg} strokeWidth={1.8} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{autoT("Excel'e aktar")}</Text>
                </Pressable>
              ) : undefined}
            >
              {/* Bu ay + gelir yok: kesinleşme ayın 1'inde olur — zarar sanılmasın. */}
              {range === 'thisMonth' && !hasRevenue && (
                <Notice icon={Info} tone={U.chipTones.info}
                  text={autoT("Hizmet bedelleri ayın 1'inde kesinleşir; bu ayın geliri henüz yansımadı. Kapanmış dönem için Geçen ay'a bakın.")} />
              )}
              {missingMsg && <Notice icon={AlertTriangle} tone={U.chipTones.warning} text={missingMsg} />}

              {hasRevenue && (
                <View style={{ marginTop: 16, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 11.5, color: heroInk.inkSoft }}>{autoT('Gelir')}</Text>
                    <MoneyMultiX slices={revenueByCcy} variant="inline" onAccent={heroInk.moneyOnAccent} />
                  </View>
                  {flowTotal > 0 && (
                    <>
                      <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: heroInk.tileBg, gap: 2 }}>
                        {flow.map(p => <View key={p.key} style={{ flex: p.value / flowTotal, backgroundColor: p.color }} />)}
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
                        {flow.map(p => (
                          <HeroLegend key={p.key} color={p.color} label={p.label}
                            value={`${fmt0(p.value)} · %${Math.round((p.value / revenue) * 100)}`} />
                        ))}
                      </View>
                    </>
                  )}
                </View>
              )}

              {showTrend && (
                <View style={{ marginTop: 18, gap: 6 }}>
                  <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: heroInk.inkSoft }}>
                    {autoT('Son 6 ay · net kâr')}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 64 }}>
                    {trend.map(x => {
                      const h = Math.max(3, Math.round((Math.abs(x.profit) / trendMax) * 52));
                      return (
                        <View key={x.key} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                          <View style={{
                            width: '100%', maxWidth: 44, height: x.revenue > 0 ? h : 3, borderRadius: 4,
                            backgroundColor: x.revenue <= 0 ? heroInk.tileBg : x.profit < 0 ? bad : good,
                            opacity: x.revenue <= 0 ? 1 : 0.85,
                          }} />
                        </View>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {trend.map(x => (
                      <View key={x.key} style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 10.5, color: heroInk.inkSoft }} numberOfLines={1}>{x.label}</Text>
                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: heroInk.ink }} numberOfLines={1}>
                          {x.revenue > 0 ? compactK(x.profit) : '—'}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <Text style={{ fontSize: 10, lineHeight: 14, color: heroInk.inkFaint, marginTop: 12 }}>
                {autoT('Dönem, hizmet bedelinin kesinleştiği tarihe göredir; gelir KDV hariçtir ve kendi kuruyla çevrilir.')}
              </Text>
            </WhiteHero>
          </View>

          {/* ── Kart: dönem + kırılım sekmeleri ─────────────────────────── */}
          <View style={{ paddingHorizontal: PAGE_PADDING }}>
            <View style={U.tableCard}>
              <View style={{
                paddingHorizontal: isDesktop ? 20 : 16, paddingTop: isDesktop ? 18 : 14, paddingBottom: 14, gap: 10,
                borderBottomWidth: 1, borderBottomColor: U.hairline,
                flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'center' : 'stretch',
                justifyContent: 'space-between', flexWrap: 'wrap',
              }}>
                <Seg
                  items={RANGE_OPTIONS.map(o => ({ key: o.key, label: o.label }))}
                  active={range}
                  onChange={(k) => setRange(k as Range)}
                />
                <Seg
                  items={TABS.map(o => ({ key: o.key, label: `${o.label} · ${o.n}` }))}
                  active={tab}
                  onChange={(k) => setTab(k as Tab)}
                />
              </View>

              {tab !== 'material' ? (
                breakdownFailed && (tab === 'clinic' ? clinicRows : serviceRows).length === 0 ? (
                  <EmptyText text="Ciro kırılımı yüklenemedi; sayfayı yenileyip tekrar deneyin." />
                ) : (tab === 'clinic' ? clinicRows : serviceRows).length === 0 ? (
                  <EmptyText text="Ciro, kesinleşmiş hizmet bedellerinden hesaplanır; bu dönemde kesinleşmiş hizmet bedeli yok." />
                ) : tab === 'clinic' ? (
                  <ProfitClinicTable rows={clinicRows} />
                ) : (
                  <ProfitServiceTable rows={serviceRows} />
                )
              ) : (
                <>
                  {technicians.length === 0 ? (
                    <EmptyText text="Bu dönemde teknisyen malzeme tüketimi kaydı yok." />
                  ) : technicians.map((r, i) => (
                    <TechRowView key={r.user_id} row={r} isLast={i === technicians.length - 1 && wasteByMat.length === 0} />
                  ))}
                  {wasteByMat.length > 0 && (
                    <>
                      <View style={{ paddingHorizontal: isDesktop ? 20 : 16, paddingTop: 16, paddingBottom: 8, borderTopWidth: technicians.length ? 1 : 0, borderTopColor: U.hairline }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: U.ink[500] }}>
                          Fire raporu
                        </Text>
                      </View>
                      {wasteByMat.map((w, i) => (
                        <WasteRowView key={w.item_id} row={w} isLast={i === wasteByMat.length - 1} />
                      ))}
                    </>
                  )}
                </>
              )}

              <View style={{
                paddingHorizontal: isDesktop ? 20 : 16, paddingVertical: 12,
                borderTopWidth: 1, borderTopColor: U.hairline, backgroundColor: U.surfaceSoft,
                borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
              }}>
                <Text style={{ fontSize: 11.5, color: U.ink[500] }}>
                  {tab === 'material'
                    ? autoT('Kullanılan / fire malzeme oranı. Zaman ve iş performansı için Personel Verim ekranına bakın.')
                    : autoT('Kırılım ciro gösterir; kâr yalnız dönem toplamıdır (işçilik ve genel gider siparişe güvenilir dağıtılamaz).')}
                </Text>
              </View>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Seg({ items, active, onChange }: { items: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  const U = useInkUI();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
                contentContainerStyle={{ flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: U.ink[100] }}>
      {items.map(o => {
        const on = o.key === active;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{
              paddingHorizontal: on ? 18 : 12, paddingVertical: 8, borderRadius: 999,
              backgroundColor: on ? U.segActive : 'transparent',
              ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}),
            }}
          >
            <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: on ? '700' : '500', color: on ? U.ink[900] : U.ink[500] }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Notice({ icon: Icon, tone, text }: { icon: React.ComponentType<any>; tone: { bg: string; fg: string }; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: tone.bg }}>
      <Icon size={14} color={tone.fg} strokeWidth={1.8} />
      <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: tone.fg }}>{text}</Text>
    </View>
  );
}

function EmptyText({ text }: { text: string }) {
  const U = useInkUI();
  return <Text style={{ padding: 28, textAlign: 'center', fontSize: 12.5, lineHeight: 18, color: U.ink[400] }}>{text}</Text>;
}

function HeroLegend({ color, label, value }: { color: string; label: string; value: string }) {
  const heroInk = useWhiteHeroInk();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 11.5, color: heroInk.inkSoft }}>{label}</Text>
      <Text style={{ fontSize: 11.5, fontWeight: '700', color: heroInk.ink }}>{value}</Text>
    </View>
  );
}

function TechRowView({ row, isLast }: { row: TechnicianUsageRow; isLast: boolean }) {
  const U = useInkUI();
  const base = useBaseCurrency() as Currency;
  const eff = row.efficiency_pct ?? 100;
  const tone = eff < 80 ? U.chipTones.danger : eff < 95 ? U.chipTones.warning : U.chipTones.success;
  const initials = (row.user_name ?? '??').split(' ').map(w => w[0]).slice(0, 2).join('').toLocaleUpperCase('tr-TR');
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: isLast ? 0 : 1, borderBottomColor: U.hairline,
    }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: U.ink[100], alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: U.ink[700] }}>{initials}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{row.user_name ?? '—'}</Text>
        <Text style={{ fontSize: 11.5, color: U.ink[400], marginTop: 1 }} numberOfLines={1}>
          {`${fmtN(row.used_qty)} ${autoT('kullanım')} · ${fmtN(row.waste_qty)} ${autoT('fire')}`}
          {num(row.waste_cost) > 0 ? ` · ${formatMoney(num(row.waste_cost), base, { fractionDigits: 0 })} ${autoT('kayıp')}` : ''}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: tone.bg }}>
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: tone.fg }}>{`%${fmtN(eff)} ${autoT('verim')}`}</Text>
      </View>
    </View>
  );
}

function WasteRowView({ row, isLast }: { row: WasteByMaterial; isLast: boolean }) {
  const U = useInkUI();
  const base = useBaseCurrency() as Currency;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: isLast ? 0 : 1, borderBottomColor: U.hairline,
    }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: U.chipTones.danger.bg, alignItems: 'center', justifyContent: 'center' }}>
        <AlertTriangle size={15} color={U.chipTones.danger.fg} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{row.item_name}</Text>
        <Text style={{ fontSize: 11.5, color: U.ink[400], marginTop: 1 }} numberOfLines={1}>
          {`${fmtN(row.waste_qty)}${row.unit ? ` ${row.unit}` : ''}${row.type ? ` · ${row.type}` : ''}`}
        </Text>
      </View>
      <Text style={{ fontSize: 14, fontWeight: '600', color: U.chipTones.danger.fg, fontVariant: ['tabular-nums'] }}>
        {`−${formatMoney(num(row.waste_cost), base, { fractionDigits: 0 })}`}
      </Text>
    </View>
  );
}
