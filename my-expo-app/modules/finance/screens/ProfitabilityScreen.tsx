// ProfitabilityScreen — Mali İşlemler hub'ında "Karlılık" sekmesi.
// Dönem özeti (KDV hariç) · Klinik / işlem bazında ciro · Malzeme verimi + fire.

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown, Users, AlertTriangle, Percent, Wallet, Boxes } from '../../../core/ui/icons';

import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { DS } from '../../../core/theme/dsTokens';
import { HubContext } from '../../../core/ui/HubContext';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { SlideTabBar } from '../../../core/ui/SlideTabBar';
import { autoT } from '../../../core/i18n/autoTranslate';
import { MobileTableX } from '../../../core/ui/MobileTableX';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { baseSymbol, useBaseCurrency } from '../../../core/money/baseCurrency';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { groupByCurrency, type CurrencyTotal } from '../../../core/money/aggregations';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { useInkUI } from '../../../core/theme/inkScale';
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

const CHIP_TONES = {
  success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' },
};

// ─── Component ───────────────────────────────────────────────────────────────
export function ProfitabilityScreen() {
  const isEmbedded = useContext(HubContext);
  const { profile } = useAuthStore();
  const insets      = useSafeAreaInsets();
  const labId       = profile?.lab_id ?? profile?.id ?? null;
  const T = useMobileTokens();
  // SlideTabBar cursor'ı beyaz metin basar → koyu ink şart.
  const panelTheme = usePanelTheme();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const heroInk = useWhiteHeroInk();
  const U = useInkUI();
  const { t } = useTranslation();

  useBaseCurrency();

  const [range, setRange] = useState<Range>('thisMonth');

  // localStorage cache (per labId+range key) — 2. ziyaret anında render.
  // v2: RPC çıktı kolonları değişti (total_revenue/total_profit…) — eski v1 cache atılsın.
  // v4: tek tanım (2026-10-26) — dönem fatura tarihine göre; eski rakamlar bir an bile görünmesin.
  // v5: gelir KDV hariç + klinik/işlem kırılımı (2026-11-01) — KDV dahil rakam bir an bile görünmesin.
  const cacheKey = labId ? `profit_screen_v5:${labId}:${range}` : null;
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
  // Maliyet dağılımı — hero içindeki pay şeridi ve satırları için.
  const costParts = useMemo(() => ([
    { label: 'Materyal',    value: Number(summary?.total_material ?? 0), color: '#4A8FC9' },
    { label: 'İşçilik',     value: Number(summary?.total_labor    ?? 0), color: '#E89B2A' },
    { label: 'Genel Gider', value: Number(summary?.total_overhead ?? 0), color: '#8B5CB8' },
  ]), [summary]);
  const costTotal = costParts.reduce((acc, p) => acc + p.value, 0);
  // Ciro kırılımı — ham RPC satırları önbellekte tutulur, satır modeli her render'da türer.
  const [clinicLines, setClinicLines]   = useState<ClinicLine[]>(cached?.clinicLines ?? []);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>(cached?.serviceLines ?? []);
  const clinicRows  = useMemo(() => buildClinicRows(clinicLines), [clinicLines]);
  const serviceRows = useMemo(() => buildServiceRows(serviceLines), [serviceLines]);
  const [breakdown, setBreakdown] = useState<'clinic' | 'service'>('clinic');
  // Kırılım sorgusu hata verdiyse "fatura yok" DENMEZ (yanıltıcı) ve sonuç önbelleğe yazılmaz.
  const [breakdownFailed, setBreakdownFailed] = useState(false);
  const [technicians, setTechnicians] = useState<TechnicianUsageRow[]>(cached?.technicians ?? []);
  const [wasteByMat, setWasteByMat]   = useState<WasteByMaterial[]>(cached?.wasteByMat ?? []);
  const [loading, setLoading]     = useState(cached === null);
  // Katı per-currency: gelir para birimine göre (Net Kâr/Maliyet raporlama ₺'de kalır)
  const [revenueByCcy, setRevenueByCcy] = useState<CurrencyTotal[]>(cached?.revenueByCcy ?? []);

  // Aralık (ya da lab) değişince state HEMEN o aralığa geçer: önbelleği varsa o basılır,
  // yoksa yükleniyor'a düşülür. useState başlangıç değerleri yalnız ilk mount'ta okunur;
  // bu olmadan önceki aralığın rakamları RPC'ler dönene kadar yeni etiketle görünüyordu.
  // Render sırasında yapılır (React "prop değişince state ayarla" kalıbı) → eski veriyle
  // tek kare bile boyanmaz; effect boyamadan SONRA çalıştığından bunu garanti etmez.
  const [shownKey, setShownKey] = useState(cacheKey);
  if (shownKey !== cacheKey) {
    setShownKey(cacheKey);
    setSummary(cached?.summary ?? null);
    setClinicLines(cached?.clinicLines ?? []);
    setServiceLines(cached?.serviceLines ?? []);
    setBreakdownFailed(false);  // önbelleğe yalnız hatasız sonuç yazılır
    setTechnicians(cached?.technicians ?? []);
    setWasteByMat(cached?.wasteByMat ?? []);
    setRevenueByCcy(cached?.revenueByCcy ?? []);
    setLoading(cached === null);
  }

  useEffect(() => {
    if (!labId) return;
    // Aralık değişince cleanup bu isteği iptal eder: geç dönen eski aralık yanıtı
    // yeni aralığın state'ini ezmez, önbelleğe de yazılmaz.
    let cancelled = false;
    const { from, to } = getRange(range);

    Promise.all([
      supabase.rpc('profitability_summary',     { p_lab_id: labId, p_from: from, p_to: to }),
      supabase.rpc('profitability_by_clinic',   { p_lab_id: labId, p_from: from, p_to: to }),
      supabase.rpc('profitability_by_service',  { p_lab_id: labId, p_from: from, p_to: to }),
      supabase.rpc('report_technician_usage',   { p_lab_id: labId, p_from: from, p_to: to }),
      supabase.rpc('report_material_waste',     { p_lab_id: labId, p_from: from, p_to: to }),
      supabase.rpc('profitability_revenue_ccy', { p_lab_id: labId, p_from: from, p_to: to }),
    ]).then(([s, cl, sv, t, mw, rc]) => {
      if (cancelled) return;
      const summaryRow   = (s.data?.[0] ?? null) as SummaryRow | null;
      // Gelir per-currency: RPC varsa onu kullan; yoksa (migration yok) summary base'ini tek dilim yap
      const rcOk = !rc.error && Array.isArray(rc.data);
      let revenue: CurrencyTotal[];
      if (rcOk) {
        revenue = groupByCurrency((rc.data ?? []) as any[],
          (r: any) => ({ amount: Number(r.revenue) || 0, currency: (r.currency || 'TRY') as Currency }));
      } else {
        const rev = Number((summaryRow as any)?.total_revenue ?? 0);
        revenue = rev > 0 ? [{ currency: 'TRY' as Currency, total: rev, count: 0 }] : [];
      }
      setRevenueByCcy(revenue);
      const clinicRaw    = (cl.data ?? []) as ClinicLine[];
      const serviceRaw   = (sv.data ?? []) as ServiceLine[];
      const techRows     = (t.data ?? []) as TechnicianUsageRow[];
      const wasteRows    = (mw.data ?? []) as WasteByMaterial[];
      const failed       = !!(s.error || cl.error || sv.error);
      setSummary(summaryRow);
      setClinicLines(clinicRaw);
      setServiceLines(serviceRaw);
      setBreakdownFailed(!!(cl.error || sv.error));
      setTechnicians(techRows);
      setWasteByMat(wasteRows);
      // Gelir dilimleri yalnız kendi RPC'si başarılıysa önbelleğe girer (yedek tek dilim geçicidir).
      if (!failed) saveCached({
        summary: summaryRow, clinicLines: clinicRaw, serviceLines: serviceRaw,
        technicians: techRows, wasteByMat: wasteRows,
        revenueByCcy: rcOk ? revenue : null,
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
  // Girilmemiş işçilik / genel gider kârı şişirir → hero'da uyarı; işçilik yoksa marj etiketi verilmez.
  const missing    = missingCosts(summary);
  const marginTag  = marginLabel(margin, missing);
  const missingMsg = missing.labor && missing.overhead
    ? 'Bu dönem işçilik ve genel gider girilmemiş — kâr olduğundan yüksek görünüyor'
    : missing.labor
      ? 'Bu dönem işçilik girilmemiş — kâr olduğundan yüksek görünüyor'
      : missing.overhead
        ? 'Bu dönem genel gider girilmemiş — kâr olduğundan yüksek görünüyor'
        : null;
  const breakdownRows = breakdown === 'clinic' ? clinicRows : serviceRows;

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
          {/* ── Hero — "BEYAZ HERO" (core/ui/WhiteHero) ─────────────────
              Prim Motoru hiyerarşisi. Kâr/zarar sinyali artık zemini değil
              BAŞLIKTAKİ RAKAMI boyar (yeşil/kırmızı): kart nötr kalır, göz
              doğrudan sayıya gider. */}
          <WhiteHero
            kicker="Karlılık · Bu Dönem · KDV hariç"
            title={
              <>Net kâr <Text style={{ color: toneFg }}>{profit >= 0 ? '+' : '−'}{baseSymbol()}{fmt(Math.abs(profit))}</Text></>
            }
            description={
              `${summary?.total_orders ?? 0} ${autoT('sipariş')} · ${margin !== null ? `%${margin} ${autoT('marj')}` : `${autoT('marj')} —`}` +
              (marginTag ? ` · ${autoT(marginTag)}` : '')
            }
            stats={[
              { value: margin !== null ? `%${margin}` : '—', label: 'Ort. Marj' },
              { value: String(summary?.total_orders ?? 0),   label: 'Sipariş' },
            ]}
          >
            {missingMsg && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
                paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12,
                backgroundColor: U.chipTones.warning.bg,
              }}>
                <AlertTriangle size={14} color={U.chipTones.warning.fg} strokeWidth={1.8} />
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: U.chipTones.warning.fg }}>
                  {missingMsg}
                </Text>
              </View>
            )}
            {/* Gelir / Maliyet / İşçilik / Materyal — büyük rakamı "nereden geldi"ye açar. */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              {([
                { label: 'Gelir · KDV hariç', slices: revenueByCcy, icon: TrendingUp },
                { label: 'Maliyet',  value: `${baseSymbol()}${fmt(summary?.total_cost     ?? 0)}`, icon: TrendingDown },
                { label: 'İşçilik',  value: `${baseSymbol()}${fmt(summary?.total_labor    ?? 0)}`, icon: Users        },
                { label: 'Materyal', value: `${baseSymbol()}${fmt(summary?.total_material ?? 0)}`, icon: Boxes        },
              ] as { label: string; value?: string; slices?: CurrencyTotal[]; icon: any }[]).map(stat => {
                const Icon = stat.icon;
                return (
                  <View key={stat.label} style={{
                    flex: 1, minWidth: 110, paddingVertical: 10, paddingHorizontal: 9, borderRadius: 14,
                    backgroundColor: heroInk.tileBg, borderWidth: 1, borderColor: heroInk.tileBorder,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <Icon size={10} color={heroInk.inkSoft} strokeWidth={2} />
                      <Text style={{ fontSize: 8.5, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: heroInk.inkSoft }}>
                        {stat.label}
                      </Text>
                    </View>
                    {stat.slices ? (
                      stat.slices.length === 0 ? (
                        <Text style={{ ...DISPLAY, fontSize: 13, color: heroInk.ink, letterSpacing: -0.2, lineHeight: 17 }}>—</Text>
                      ) : (
                        <View style={{ gap: 1 }}>
                          {stat.slices.map(sl => (
                            <Text key={sl.currency} style={{ ...DISPLAY, fontSize: 13, color: heroInk.ink, letterSpacing: -0.2, lineHeight: 17 }} numberOfLines={1}>
                              {formatMoney(sl.total, (sl.currency as Currency), { fractionDigits: 0 })}
                            </Text>
                          ))}
                        </View>
                      )
                    ) : (
                      <Text style={{ ...DISPLAY, fontSize: 13, color: heroInk.ink, letterSpacing: -0.2, lineHeight: 17 }} numberOfLines={1}>
                        {stat.value}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
            {/* Maliyet dağılımı — ayrı bir kart olarak hero'nun ALTINDA duruyordu;
                oysa üstteki Maliyet/İşçilik/Materyal kutucuklarının açılımı.
                Hero'nun içine alındı ve her kaleme payı eklendi. */}
            {costTotal > 0 && (
              <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: heroInk.tileBorder, gap: 8 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: heroInk.inkSoft }}>
                  Maliyet Dağılımı
                </Text>
                <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: heroInk.tileBg }}>
                  {costParts.map(part => {
                    const w = (part.value / costTotal) * 100;
                    if (w <= 0) return null;
                    return <View key={part.label} style={{ width: `${w}%` as any, height: 6, backgroundColor: part.color }} />;
                  })}
                </View>
                <View style={{ gap: 6, marginTop: 2 }}>
                  {costParts.map(part => (
                    <BreakRow
                      key={part.label}
                      label={part.label}
                      value={part.value}
                      share={Math.round((part.value / costTotal) * 100)}
                    />
                  ))}
                </View>
              </View>
            )}

            <Text style={{ fontSize: 9, color: heroInk.inkFaint, marginTop: 8 }}>
              {autoT('Net Kâr · Maliyet · İşçilik · Materyal raporlama para biriminde gösterilir:')} {baseSymbol()}
              {' '}{autoT('Dönem, faturanın kesildiği tarihe göredir; gelir KDV hariçtir ve faturanın kendi kuruyla çevrilir.')}
            </Text>
          </WhiteHero>



          {/* ── Ciro kırılımı — klinik / işlem (KDV hariç) ───────────────
              Kâr yalnız dönem toplamıdır (hero); kırılım CİRO gösterir —
              işçilik/genel gider siparişe güvenilir dağıtılamıyor. */}
          <View style={{ gap: 8 }}>
            <SlideTabBar
              size="sm"
              items={[
                { key: 'clinic',  label: 'Klinikler' },
                { key: 'service', label: t('profitability.tabServices') },
              ]}
              activeKey={breakdown}
              onChange={(k) => setBreakdown(k as 'clinic' | 'service')}
              accentColor={panelTheme.accent}
              style={{ marginStart: -3 }}
            />
            <MobileTableX
              title={breakdown === 'clinic' ? 'Klinik Bazında Ciro' : 'İşlem Bazında Ciro'}
              count={breakdown === 'clinic' ? countClinicRows(clinicRows) : countServiceRows(serviceRows)}
              countLabel={breakdown === 'clinic' ? 'klinik' : t('profitability.serviceCount')}
            >
              {breakdownFailed && breakdownRows.length === 0 ? (
                <Text style={{ padding: 24, textAlign: 'center', fontSize: 12, color: T.ink3 }}>
                  Ciro kırılımı yüklenemedi; sayfayı yenileyip tekrar deneyin.
                </Text>
              ) : breakdownRows.length === 0 ? (
                <Text style={{ padding: 24, textAlign: 'center', fontSize: 12, color: T.ink3 }}>
                  Ciro, kesilen faturalardan hesaplanır; bu dönemde kesilmiş fatura yok.
                </Text>
              ) : breakdown === 'clinic' ? (
                <ProfitClinicTable rows={clinicRows} />
              ) : (
                <ProfitServiceTable rows={serviceRows} />
              )}
            </MobileTableX>
          </View>

          {/* ── Technician usage + efficiency ─────────────────────────── */}
          <View style={{ gap: 8 }}>
            <MobileTableX title="Teknisyen Malzeme Verimi" count={technicians.length} countLabel="kişi">
              {technicians.length === 0 ? (
                <Text style={{ padding: 24, textAlign: 'center', fontSize: 12, color: T.ink3 }}>Veri yok — teknisyen henüz materyal tüketmedi</Text>
              ) : technicians.map((t, i) => (
                <TechRowView
                  key={t.user_id}
                  row={t}
                  isLast={i === technicians.length - 1}
                />
              ))}
            </MobileTableX>
            <Text style={{ fontSize: 10.5, color: T.ink3, paddingHorizontal: 4 }}>
              Kullanılan / fire malzeme oranı. Zaman/iş performansı için Performans ekranına bakın.
            </Text>
          </View>

          {/* ── Material waste breakdown ──────────────────────────────── */}
          {wasteByMat.length > 0 && (
            <View style={{ gap: 8 }}>
              <MobileTableX title="Materyal Fire Raporu" count={wasteByMat.length} countLabel="malzeme">
                {wasteByMat.map((w, i) => (
                  <WasteRowView
                    key={w.item_id}
                    row={w}
                    isLast={i === wasteByMat.length - 1}
                  />
                ))}
              </MobileTableX>
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

/** Maliyet dağılımı satırı — beyaz hero'nun İÇİNDE durur, rengini oradan alır.
    `share` verilirse tutarın yanında payı da yazar (kalemin ağırlığı görünsün). */
function BreakRow({ label, value, share }: { label: string; value: number; share?: number | null }) {
  const heroInk = useWhiteHeroInk();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Text style={{ fontSize: 12, color: heroInk.inkSoft, fontWeight: '600' }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text style={{ fontSize: 12, color: heroInk.ink, fontWeight: '700' }}>{baseSymbol()}{fmt(value)}</Text>
        {share !== null && share !== undefined && (
          <Text style={{ fontSize: 10, color: heroInk.inkFaint, fontWeight: '600' }}>%{share}</Text>
        )}
      </View>
    </View>
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
        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
        !isLast && { borderBottomWidth: 1, borderBottomColor: T.hairline },
      ]}
    >
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: isDark ? 'rgba(124,58,237,0.22)' : '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
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
        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
        !isLast && { borderBottomWidth: 1, borderBottomColor: T.hairline },
      ]}
    >
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: CHIP_TONES.danger.bg, alignItems: 'center', justifyContent: 'center' }}>
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
