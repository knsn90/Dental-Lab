import { localeTag } from '../../../core/i18n';
/**
 * FinanceReportScreen — Gelir / Gider Raporu
 *
 * TASARIM NOTU (redesign):
 * Önceki hâlde üç eşit KPI kartı vardı ve üçü de aynı soru cevaplanmadan
 * duruyordu: "sonuç ne?". Üstelik "Net Kâr" kartı zemini YEŞİLDİ — rakam eksi
 * olsa bile. Renk yalan söylüyordu.
 *
 * Yeni düzen tek bir cevap etrafında kurulur: **para birimi başına net sonuç**.
 * Her para birimi kendi kartını alır; net rakam işaretine göre renklenir ve
 * yanında KÂR/ZARAR rozeti durur — anlam yalnız renge bırakılmaz. Gelir ve
 * gider o kartın içinde, ortak bir orantı şeridinde karşılaştırılır.
 *
 * Aylık dökümdeki ikinci yalan da düzeltildi: barlar artık her satırın kendi
 * maksimumuna göre değil, **dönemin tamamına ortak ölçekte** çizilir. Yoksa
 * ₺593'lük ay ile ₺321.446'lık ay aynı boyda görünüyordu.
 *
 * Token: DS + mobileDesignTokens · DISPLAY = Inter Tight 300 · Lucide line ikon.
 */
import React, { useState, useEffect, useContext, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, useWindowDimensions,
} from 'react-native';
import {
  BarChart2, TrendingUp, TrendingDown, CheckCircle,
  Bell, Calendar, Building2, FileText, Inbox, Printer,
} from 'lucide-react-native';
import { Platform } from 'react-native';

import { HubContext } from '../../../core/ui/HubContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { supabase } from '../../../core/api/supabase';
import { getRangeBounds, type RangeKey } from '../components/DateRangePicker';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { buildFinanceReportHtml } from '../buildFinanceReportHtml';
import { baseSymbol, useBaseCurrency } from '../../../core/money/baseCurrency';
import { formatMoney, CURRENCY_META, type Currency } from '../../../core/money/currency';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';

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
  success: { bg: 'rgba(45,154,107,0.12)', text: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', text: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  text: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', text: '#1F5689' },
};

/**
 * Anlam renkleri — tüm ekranda TEK karşılık.
 * Gelir yeşil, gider kırmızı, net rakam işaretine göre. Kırmızı yalnız
 * "para çıktı / zarar" demek; dekoratif hiçbir yerde kullanılmaz.
 */
const INCOME  = '#2D9A6B';
const EXPENSE = '#D94B4B';

// ── Types ───────────────────────────────────────────────────────────
interface MonthlySummary {
  month: string;
  currency: string;
  income: number;
  expense: number;
  profit: number;
}

interface UpcomingDue {
  id: string;
  invoice_number: string;
  due_date: string;
  balance: number;
  clinic_name: string | null;
  days_until_due: number;
  currency?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────
function fmtMoney(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return baseSymbol() + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtMonth(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(localeTag(), { month: 'long', year: 'numeric' });
}

const CCY_ORDER = ['TRY', 'EUR', 'USD', 'GBP'];

// ── Period pills ────────────────────────────────────────────────────
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'this_month',     label: 'Bu Ay' },
  { key: 'last_month',     label: 'Geçen Ay' },
  { key: 'this_year',      label: 'Bu Yıl' },
  { key: 'last_12_months', label: 'Son 12 Ay' },
  { key: 'all',            label: 'Tümü' },
];

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function FinanceReportScreen() {
  const isEmbedded = useContext(HubContext);
  const { width } = useWindowDimensions();
  const theme = usePanelTheme();
  const isDesktop = width >= 1024;
  const insets = useSafeAreaInsets();
  const T = useMobileTokens();
  useBaseCurrency();

  const [tab, setTab] = useState<'rapor' | 'hatirlatma'>('rapor');
  const [range, setRange] = useState<RangeKey>('last_12_months');

  const cacheKey = `finance_report_v2:${range}`;
  type ReportCache = { summary: MonthlySummary[]; baseSummary?: { income: number; expense: number; profit: number }[]; upcoming: UpcomingDue[] };
  const loadCached = (): ReportCache | null => {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try { const r = window.localStorage.getItem(cacheKey); return r ? JSON.parse(r) : null; } catch { return null; }
  };
  const saveCached = (data: ReportCache) => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try { window.localStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* quota */ }
  };
  const cached = loadCached();

  const [summary, setSummary] = useState<MonthlySummary[]>(cached?.summary ?? []);
  const [baseSummary, setBaseSummary] = useState<{ income: number; expense: number; profit: number }[]>(cached?.baseSummary ?? []);
  const [upcoming, setUpcoming] = useState<UpcomingDue[]>(cached?.upcoming ?? []);
  const [loading, setLoading] = useState(cached === null);

  useEffect(() => {
    const load = async () => {
      const cachedNow = loadCached();
      if (cachedNow === null) setLoading(true);
      const { from, to } = getRangeBounds(range);
      // Katı per-currency view; yoksa (migration uygulanmadıysa) eski view'a düş (TRY etiketle)
      const ccyQuery = () => {
        let q = supabase.from('v_monthly_finance_summary_ccy').select('*').order('month', { ascending: true });
        if (from) q = q.gte('month', from);
        if (to)   q = q.lte('month', to);
        return q.limit(180);
      };
      const baseQuery = () => {
        let q = supabase.from('v_monthly_finance_summary').select('*').order('month', { ascending: true });
        if (from) q = q.gte('month', from);
        if (to)   q = q.lte('month', to);
        return q.limit(60);
      };
      const [s1, sBase, s2] = await Promise.all([
        ccyQuery(),
        baseQuery(),   // konsolide baz toplam (amount_base → lab baz para birimi)
        supabase.from('v_upcoming_due_invoices').select('*').limit(20),
      ]);
      let sumRows: MonthlySummary[];
      if (!s1.error) {
        sumRows = (s1.data ?? []) as MonthlySummary[];
      } else {
        sumRows = ((sBase.data ?? []) as any[]).map(r => ({ ...r, currency: 'TRY' })) as MonthlySummary[];
      }
      const baseRows = (sBase.data ?? []) as { income: number; expense: number; profit: number }[];
      const upRows  = (s2.data ?? []) as UpcomingDue[];
      setSummary(sumRows);
      setBaseSummary(baseRows);
      setUpcoming(upRows);
      saveCached({ summary: sumRows, baseSummary: baseRows, upcoming: upRows });
      setLoading(false);
    };
    load();
  }, [range]);

  /**
   * Para birimi başına dönem sonucu — ekranın cevabı bu.
   * Katı per-currency: farklı para birimleri asla toplanmaz.
   */
  const byCurrency = useMemo(() => {
    const set = new Set(summary.map(m => m.currency));
    return Array.from(set)
      .sort((a, b) => CCY_ORDER.indexOf(a) - CCY_ORDER.indexOf(b))
      .map(ccy => {
        const rows = summary.filter(m => m.currency === ccy);
        return {
          currency: ccy as Currency,
          income:  rows.reduce((s, r) => s + Number(r.income),  0),
          expense: rows.reduce((s, r) => s + Number(r.expense), 0),
          profit:  rows.reduce((s, r) => s + Number(r.profit),  0),
        };
      });
  }, [summary]);

  /**
   * Aylık barların ORTAK ölçeği (para birimi başına dönem maksimumu).
   * Her satırı kendi maksimumuna göre çizmek ayları kıyaslanamaz yapıyordu.
   */
  const scaleByCcy = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of summary) {
      const v = Math.max(Number(r.income), Number(r.expense));
      m.set(r.currency, Math.max(m.get(r.currency) ?? 0, v));
    }
    return m;
  }, [summary]);

  // Konsolide baz toplam (lab baz para biriminde; farklı para birimleri güncel kurla ≈ çevrilir)
  const baseTotals = baseSummary.reduce(
    (acc, m) => ({ income: acc.income + Number(m.income), expense: acc.expense + Number(m.expense), profit: acc.profit + Number(m.profit) }),
    { income: 0, expense: 0, profit: 0 },
  );
  // Birden fazla para birimi varsa konsolide toplam anlamlı (tek para varsa per-currency = baz).
  const showBaseTotal = new Set(summary.map(m => m.currency)).size > 1;

  // Ay başına grupla (her ayın per-currency satırları)
  const byMonth = useMemo(() => {
    const map = new Map<string, MonthlySummary[]>();
    for (const r of summary) (map.get(r.month) ?? map.set(r.month, []).get(r.month)!).push(r);
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, rows]) => ({ month, rows }));
  }, [summary]);

  const periodLabel = RANGE_OPTIONS.find(o => o.key === range)?.label ?? 'Tümü';

  const handlePrintPdf = async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const CATEGORY_LABELS: Record<string, string> = {
      malzeme: 'Malzeme', personel: 'Personel', kira: 'Kira',
      ekipman: 'Ekipman', vergi: 'Vergi / Sigorta', diger: 'Diğer',
    };
    const METHOD_LABELS: Record<string, string> = {
      nakit: 'Nakit', kart: 'Kart', havale: 'Havale', cek: 'Çek/Senet', diger: 'Diğer',
    };

    // Lab letterhead
    let lab: any = { name: 'Laboratuvar' };
    let labId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('lab_id').eq('id', user.id).single();
        labId = (prof as any)?.lab_id ?? null;
        if (labId) {
          const { data } = await supabase
            .from('labs')
            .select('name, address, phone, email, logo_url, tax_number')
            .eq('id', labId)
            .single();
          if (data) {
            lab = {
              name: data.name ?? 'Laboratuvar',
              logoUrl: (data as any).logo_url,
              address: data.address,
              phone: data.phone,
              email: data.email,
              taxNo: (data as any).tax_number,
            };
          }
        }
      }
    } catch { /* default fallback */ }

    const { from, to } = getRangeBounds(range);

    // Önceki dönem (aynı uzunlukta, aralığın hemen öncesi)
    let prevFrom: string | null = null;
    let prevTo:   string | null = null;
    if (from && to) {
      const fDate = new Date(from);
      const tDate = new Date(to);
      const lenMs = tDate.getTime() - fDate.getTime();
      const pTo   = new Date(fDate.getTime() - 1);
      const pFrom = new Date(pTo.getTime() - lenMs);
      prevFrom = pFrom.toISOString().slice(0, 10);
      prevTo   = pTo.toISOString().slice(0, 10);
    }

    // Paralel sorgular
    const [expRes, prevRes, invRes, topExpRes] = await Promise.all([
      // Gider kategori + ödeme yöntemi kırılımı (mevcut dönem)
      supabase
        .from('expenses')
        .select('category, payment_method, amount, amount_base, expense_date, description')
        .gte('expense_date', from || '1900-01-01')
        .lte('expense_date', to   || '2999-12-31'),
      // Önceki dönem
      prevFrom && prevTo
        ? supabase.from('v_monthly_finance_summary').select('income, expense').gte('month', prevFrom).lte('month', prevTo)
        : Promise.resolve({ data: [] as any[] }),
      // Tahsilat performansı
      supabase
        .from('invoices')
        .select('id, total, paid_amount, due_date, status, issue_date, currency, amount_base, rate_at_time')
        .gte('issue_date', from || '1900-01-01')
        .lte('issue_date', to   || '2999-12-31'),
      // En yüksek 5 gider
      supabase
        .from('expenses')
        .select('expense_date, description, category, amount_base, amount')
        .gte('expense_date', from || '1900-01-01')
        .lte('expense_date', to   || '2999-12-31')
        .order('amount_base', { ascending: false })
        .limit(5),
    ]);

    // Category breakdown
    const catMap = new Map<string, number>();
    for (const e of (expRes.data ?? []) as any[]) {
      const amt = Number(e.amount_base ?? e.amount ?? 0);
      catMap.set(e.category, (catMap.get(e.category) ?? 0) + amt);
    }
    const categoryBreakdown = Array.from(catMap.entries()).map(([category, amount]) => ({
      category, label: CATEGORY_LABELS[category] ?? category, amount,
    }));

    // Method breakdown
    const methodMap = new Map<string, number>();
    for (const e of (expRes.data ?? []) as any[]) {
      const m = e.payment_method ?? 'diger';
      const amt = Number(e.amount_base ?? e.amount ?? 0);
      methodMap.set(m, (methodMap.get(m) ?? 0) + amt);
    }
    const methodBreakdown = Array.from(methodMap.entries()).map(([method, amount]) => ({
      method, label: METHOD_LABELS[method] ?? method, amount,
    }));

    // Previous period totals
    const prevRows = (prevRes.data ?? []) as { income: number; expense: number }[];
    const previousPeriod = prevRows.length > 0
      ? {
          income:  prevRows.reduce((s, r) => s + Number(r.income),  0),
          expense: prevRows.reduce((s, r) => s + Number(r.expense), 0),
        }
      : undefined;

    // Collection stats
    const invoices = (invRes.data ?? []) as any[];
    const today = new Date().toISOString().slice(0, 10);
    // Baz para birimine çevir (amount_base / paid_amount × rate) — karışık para birimi toplamı doğru olsun.
    const toBase = (i: any) => Number(i.amount_base ?? (Number(i.total ?? 0) * Number(i.rate_at_time ?? 1)));
    const paidBase = (i: any) => Number(i.paid_amount ?? 0) * Number(i.rate_at_time ?? 1);
    const totalBilled  = invoices.filter(i => i.status !== 'iptal').reduce((s, i) => s + toBase(i), 0);
    const totalPaid    = invoices.filter(i => i.status !== 'iptal').reduce((s, i) => s + paidBase(i), 0);
    const totalOverdue = invoices
      .filter(i => i.status !== 'iptal' && i.status !== 'odendi' && i.due_date && i.due_date < today)
      .reduce((s, i) => s + Math.max(0, toBase(i) - paidBase(i)), 0);
    const collection = {
      totalBilled, totalPaid, totalOverdue,
      invoiceCount: invoices.filter(i => i.status !== 'iptal').length,
    };

    // Top expenses
    const topExpenses = ((topExpRes.data ?? []) as any[]).map(e => ({
      date: e.expense_date,
      description: e.description ?? '—',
      category: CATEGORY_LABELS[e.category] ?? e.category ?? 'Diğer',
      amount: Number(e.amount_base ?? e.amount ?? 0),
    }));

    const html = buildFinanceReportHtml({
      lab,
      periodLabel,
      // PDF (follow-up): ay başına topla — tek para birimli lab'da doğru,
      // çok-para'da numerik karışım (PDF'in per-currency'ye geçişi ayrı iş).
      rows: byMonth.map(mm => ({
        month: mm.month,
        income:  mm.rows.reduce((s, r) => s + Number(r.income), 0),
        expense: mm.rows.reduce((s, r) => s + Number(r.expense), 0),
        profit:  mm.rows.reduce((s, r) => s + Number(r.profit), 0),
      })),
      currency: 'TRY',
      previousPeriod,
      categoryBreakdown,
      methodBreakdown,
      collection,
      topExpenses,
    });

    const w = window.open('', '_blank', 'width=1200,height=900');
    if (!w) { alert('Pop-up engellendi — yazdırma penceresi açılamadı.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  const TAB_ITEMS: { key: 'rapor' | 'hatirlatma'; label: string; icon: React.ComponentType<any>; badge?: number }[] = [
    { key: 'rapor',      label: 'Rapor',        icon: BarChart2 },
    { key: 'hatirlatma', label: 'Hatırlatmalar', icon: Bell, badge: upcoming.length || undefined },
  ];

  const scrollPad = {
    paddingHorizontal: PAGE_PADDING,
    paddingTop: isEmbedded || isDesktop ? 4 : insets.top + 8,
    paddingBottom: 120,
    gap: 16,
  };

  return (
    <View style={{ flex: 1 }}>
      {/* ── Header — only standalone ── */}
      {!isEmbedded && (
        <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 64, paddingBottom: 10 }}>
          <Text style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.5, color: T.ink }}>
            Gelir / Gider Raporu
          </Text>
          <Text style={{ fontSize: 13, color: T.ink3, marginTop: 2 }}>Mali özet</Text>
        </View>
      )}

      {/* ── Toolbar ──────────────────────────────────────────────────
          Tek kontrol dili: her iki seçim de aynı "raylı segment" kalıbı.
          Önceden sekmeler beyaz-kabartma, dönemler siyah-dolu pill'di —
          iki farklı "aktif" dili aynı satırda kafa karıştırıyordu. */}
      <View style={{ paddingHorizontal: PAGE_PADDING, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <SegmentedControl
            items={TAB_ITEMS.map(t => ({ key: t.key, label: t.label, icon: t.icon, badge: t.badge }))}
            active={tab}
            onChange={k => setTab(k as typeof tab)}
          />

          {tab === 'rapor' && (
            <SegmentedControl
              items={RANGE_OPTIONS.map(o => ({ key: o.key, label: o.label }))}
              active={range}
              onChange={k => setRange(k as RangeKey)}
            />
          )}

          <View style={{ flex: 1 }} />

          {tab === 'rapor' && Platform.OS === 'web' && (
            <Pressable
              onPress={handlePrintPdf}
              style={({ pressed }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 14, paddingVertical: 8,
                borderRadius: 9999,
                backgroundColor: T.card,
                borderWidth: 1, borderColor: T.hairline,
                opacity: pressed ? 0.65 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
                // @ts-ignore web
                cursor: 'pointer',
              })}
            >
              <Printer size={13} color={T.ink2} strokeWidth={1.8} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: T.ink2 }}>PDF Rapor</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Content ── */}
      {loading ? (
        <CenteredLoader color={T.ink3} />
      ) : tab === 'rapor' ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={scrollPad} showsVerticalScrollIndicator={false}>
          {/* ── Dönem sonucu — para birimi başına tek cevap ── */}
          {byCurrency.length === 0 ? (
            <EmptyCard icon={Inbox} text="Bu dönemde finansal hareket yok" />
          ) : (
            <View style={{ flexDirection: isDesktop && byCurrency.length > 1 ? 'row' : 'column', gap: 12 }}>
              {byCurrency.map(c => (
                <ResultCard key={c.currency} data={c} periodLabel={periodLabel} accent={theme.primary} />
              ))}
            </View>
          )}

          {/* ── Konsolide baz toplam ── */}
          {showBaseTotal && <ConsolidatedStrip totals={baseTotals} />}

          {/* ── Aylık Döküm ── */}
          {byMonth.length > 0 && (
            <>
              <SectionHeader icon={Calendar} label="Aylık Döküm" />
              <View style={{ ...cardSolid, backgroundColor: T.card, padding: 0, overflow: 'hidden' }}>
                {byMonth.map((mm, i) => (
                  <MonthRow
                    key={mm.month}
                    data={mm}
                    scaleByCcy={scaleByCcy}
                    isLast={i === byMonth.length - 1}
                    isDesktop={isDesktop}
                  />
                ))}
              </View>
              <Text style={{ fontSize: 11, color: T.ink3, paddingHorizontal: 12, lineHeight: 17 }}>
                Barlar dönemin tamamında ortak ölçekle çizilir — aylar birbiriyle kıyaslanabilir.
              </Text>
            </>
          )}
        </ScrollView>
      ) : (
        /* ── Hatırlatmalar Tab ── */
        <ScrollView style={{ flex: 1 }} contentContainerStyle={scrollPad} showsVerticalScrollIndicator={false}>
          <SectionHeader icon={Bell} label="Yaklaşan Vadeler" count={upcoming.length} />

          {upcoming.length === 0 ? (
            <EmptyCard icon={CheckCircle} text="14 gün içinde vadesi dolan fatura yok" tone={CHIP_TONES.success.text} />
          ) : (
            <View style={{ gap: 10 }}>
              {upcoming.map(inv => (
                <ReminderCard key={inv.id} inv={inv} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Segmented control ──────────────────────────────────────────────
/**
 * Raylı segment — sekmeler ve dönem seçimi aynı dili konuşur.
 * Basınca anında geri bildirim (opacity + hafif küçülme): tepki tıklamayı
 * beklemez, parmağın/işaretçinin bastığı anda gelir.
 */
function SegmentedControl({ items, active, onChange }: {
  items: { key: string; label: string; icon?: React.ComponentType<any>; badge?: number }[];
  active: string;
  onChange: (key: string) => void;
}) {
  const T = useMobileTokens();
  return (
    <View style={{
      flexDirection: 'row', flexWrap: 'wrap', gap: 2,
      padding: 3, borderRadius: 9999,
      backgroundColor: T.cardSoft,
      alignSelf: 'flex-start',
    }}>
      {items.map(it => {
        const on = it.key === active;
        const Icon = it.icon;
        return (
          <Pressable
            key={it.key}
            onPress={() => onChange(it.key)}
            style={({ pressed }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 14, paddingVertical: 7,
              borderRadius: 9999,
              backgroundColor: on ? T.card : 'transparent',
              // @ts-ignore web
              boxShadow: on ? '0 1px 3px rgba(0,0,0,0.08)' : undefined,
              opacity: pressed && !on ? 0.55 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
              cursor: 'pointer',
            })}
          >
            {Icon ? <Icon size={13} strokeWidth={on ? 2.2 : 1.6} color={on ? T.ink : T.ink3} /> : null}
            <Text style={{ fontSize: 12, fontWeight: on ? '600' : '500', color: on ? T.ink : T.ink3 }}>
              {it.label}
            </Text>
            {it.badge ? (
              <View style={{
                minWidth: 16, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 9999,
                backgroundColor: CHIP_TONES.warning.bg, alignItems: 'center',
              }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: CHIP_TONES.warning.text }}>{it.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Section Header ─────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label, count }: { icon: React.ComponentType<any>; label: string; count?: number }) {
  const T = useMobileTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2, paddingHorizontal: 2 }}>
      <Icon size={14} strokeWidth={1.8} color={T.ink3} />
      <Text style={{
        fontSize: 11, fontWeight: '600', letterSpacing: 0.8,
        textTransform: 'uppercase', color: T.ink3,
      }}>
        {label}
      </Text>
      {count != null && count > 0 && (
        <View style={{
          paddingHorizontal: 7, paddingVertical: 2,
          borderRadius: 9999, backgroundColor: CHIP_TONES.warning.bg,
        }}>
          <Text style={{ fontSize: 10, fontWeight: '600', color: CHIP_TONES.warning.text }}>{count}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Empty state ────────────────────────────────────────────────────
function EmptyCard({ icon: Icon, text, tone }: { icon: React.ComponentType<any>; text: string; tone?: string }) {
  const T = useMobileTokens();
  return (
    <View style={{ ...cardSolid, backgroundColor: T.card, alignItems: 'center', paddingVertical: 56, gap: 12 }}>
      <Icon size={36} strokeWidth={1.4} color={tone ?? T.ink3} />
      <Text style={{ fontSize: 14, fontWeight: '500', color: T.ink3 }}>{text}</Text>
    </View>
  );
}

// ─── Dönem sonucu kartı (para birimi başına) ────────────────────────
/**
 * Ekranın cevabı. Net rakam en büyük eleman; işaretine göre renklenir ve
 * yanında KÂR / ZARAR rozeti durur — anlam yalnız renge bırakılmaz
 * (renk körlüğü + siyah-beyaz çıktı).
 *
 * Gelir ve gider tek bir orantı şeridinde: hangisinin ağır bastığı okumadan
 * görülür.
 */
function ResultCard({ data, periodLabel, accent }: {
  data: { currency: Currency; income: number; expense: number; profit: number };
  periodLabel: string;
  accent: string;
}) {
  const T = useMobileTokens();
  const { currency, income, expense, profit } = data;
  const f = (n: number) => formatMoney(n, currency, { fractionDigits: 0 });
  const sym = CURRENCY_META[currency]?.symbol ?? currency;

  const loss = profit < 0;
  const flat = profit === 0;
  const netColor = flat ? T.ink2 : loss ? EXPENSE : INCOME;
  const badge = flat
    ? { label: 'BAŞA BAŞ', ...CHIP_TONES.info }
    : loss
      ? { label: 'ZARAR', ...CHIP_TONES.danger }
      : { label: 'KÂR', ...CHIP_TONES.success };

  const span = income + expense;
  const incomeShare  = span > 0 ? (income  / span) * 100 : 0;
  const expenseShare = span > 0 ? (expense / span) * 100 : 0;

  return (
    <View style={{ ...cardSolid, backgroundColor: T.card, flex: 1, minWidth: 0, gap: 16 }}>
      {/* Üst satır: para birimi + sonuç rozeti */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 5,
          paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9999,
          backgroundColor: accent + '14',
        }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: T.ink2 }}>{sym}</Text>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: T.ink3 }}>{currency}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 9999, backgroundColor: badge.bg }}>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: badge.text }}>{badge.label}</Text>
        </View>
      </View>

      {/* Net sonuç — sayfanın en büyük elemanı */}
      <View style={{ gap: 4 }}>
        <Text style={{
          fontSize: 10, fontWeight: '600', letterSpacing: 1.1,
          textTransform: 'uppercase', color: T.ink3,
        }}>
          Net Kâr · {periodLabel}
        </Text>
        <Text numberOfLines={1} style={{ ...DISPLAY, fontSize: 40, letterSpacing: -1.4, lineHeight: 46, color: netColor }}>
          {profit > 0 ? '+' : ''}{f(profit)}
        </Text>
      </View>

      {/* Gelir / gider orantı şeridi */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', height: 8, borderRadius: 9999, overflow: 'hidden', backgroundColor: T.hairline, gap: 2 }}>
          {incomeShare > 0 ? (
            <View style={{ width: `${incomeShare}%` as any, backgroundColor: INCOME, borderRadius: 9999 }} />
          ) : null}
          {expenseShare > 0 ? (
            <View style={{ width: `${expenseShare}%` as any, backgroundColor: EXPENSE, borderRadius: 9999 }} />
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 16 }}>
          <LegendItem color={INCOME}  icon={TrendingUp}   label="Gelir" value={f(income)} />
          <LegendItem color={EXPENSE} icon={TrendingDown} label="Gider" value={f(expense)} />
        </View>
      </View>
    </View>
  );
}

function LegendItem({ color, icon: Icon, label, value }: {
  color: string; icon: React.ComponentType<any>; label: string; value: string;
}) {
  const T = useMobileTokens();
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Icon size={11} strokeWidth={2} color={color} />
        <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: T.ink3 }}>
          {label}
        </Text>
      </View>
      <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: T.ink }}>
        {value}
      </Text>
    </View>
  );
}

// ─── Konsolide baz toplam ───────────────────────────────────────────
/**
 * Yaklaşıklık rakamın YANINDA durur (`≈`), açıklamanın dibinde değil.
 * Nitelik veriyle birlikte okunmalı — küçük puntoya gömülmemeli.
 */
function ConsolidatedStrip({ totals }: { totals: { income: number; expense: number; profit: number } }) {
  const T = useMobileTokens();
  const loss = totals.profit < 0;
  return (
    <View style={{
      ...cardSolid, backgroundColor: T.card, paddingVertical: 16, paddingHorizontal: 20, gap: 10,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <Text style={{
          flex: 1, minWidth: 140,
          fontSize: 10, fontWeight: '600', letterSpacing: 1.1,
          textTransform: 'uppercase', color: T.ink3, paddingBottom: 6,
        }}>
          Konsolide Net Kâr · {baseSymbol()}
        </Text>
        <Text numberOfLines={1} style={{
          ...DISPLAY, fontSize: 26, letterSpacing: -0.8,
          color: loss ? EXPENSE : INCOME,
        }}>
          ≈ {loss ? '−' : '+'}{fmtMoney(Math.abs(totals.profit))}
        </Text>
      </View>
      <Text style={{ fontSize: 11, color: T.ink3, lineHeight: 17 }}>
        Gelir {fmtMoney(totals.income)} · Gider {fmtMoney(totals.expense)}.
        Farklı para birimleri güncel TCMB kuruyla baz para birimine çevrildi — kur
        değiştikçe bu rakam da değişir.
      </Text>
    </View>
  );
}

// ─── Month Row — KATI per-currency, ORTAK ölçek ─────────────────────
function MonthRow({ data, scaleByCcy, isLast, isDesktop }: {
  data: { month: string; rows: MonthlySummary[] };
  scaleByCcy: Map<string, number>;
  isLast: boolean;
  isDesktop: boolean;
}) {
  const T = useMobileTokens();
  const rows = [...data.rows].sort((a, b) => CCY_ORDER.indexOf(a.currency) - CCY_ORDER.indexOf(b.currency));
  const multi = rows.length > 1;

  return (
    <View style={{
      paddingHorizontal: 24, paddingVertical: 16,
      borderBottomWidth: isLast ? 0 : 1,
      borderBottomColor: T.hairline,
      gap: 12,
    }}>
      <Text style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.1, color: T.ink }}>
        {fmtMonth(data.month)}
      </Text>

      {rows.map(m => {
        const income  = Number(m.income);
        const expense = Number(m.expense);
        const profit  = Number(m.profit);
        // ORTAK ölçek: dönemin tamamındaki maksimum (satırın kendi maksimumu DEĞİL)
        const scale   = Math.max(scaleByCcy.get(m.currency) ?? 0, 1);
        const incomeW  = Math.min(100, (income  / scale) * 100);
        const expenseW = Math.min(100, (expense / scale) * 100);
        const profitTone = profit >= 0 ? CHIP_TONES.success : CHIP_TONES.danger;
        const sym = CURRENCY_META[(m.currency as Currency)]?.symbol ?? m.currency;
        const f = (n: number) => formatMoney(n, (m.currency as Currency), { fractionDigits: 0 });
        return (
          <View key={m.currency} style={{ gap: 9 }}>
            {/* Para birimi rozeti + net kâr chip */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              {multi ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.05)' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: T.ink2 }}>{sym}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: T.ink3, letterSpacing: 0.3 }}>{m.currency}</Text>
                </View>
              ) : <View />}
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, backgroundColor: profitTone.bg }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: profitTone.text }}>
                  {profit >= 0 ? '+' : ''}{f(profit)}
                </Text>
              </View>
            </View>

            {/* Gelir / Gider barları — anlam renkleriyle, ortak ölçekte */}
            <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 20 : 10 }}>
              <MiniBar label="Gelir" value={f(income)} pct={incomeW}  color={INCOME} />
              <MiniBar label="Gider" value={f(expense)} pct={expenseW} color={EXPENSE} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function MiniBar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  const T = useMobileTokens();
  return (
    <View style={{ flex: 1, gap: 5 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 11, fontWeight: '500', color: T.ink3 }}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: pct > 0 ? color : T.ink3 }}>{value}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 9999, backgroundColor: T.hairline, overflow: 'hidden' }}>
        {pct > 0 ? (
          <View style={{ height: 6, borderRadius: 9999, backgroundColor: color, width: `${Math.max(pct, 1.5)}%` as any }} />
        ) : null}
      </View>
    </View>
  );
}

// ─── Reminder Card ──────────────────────────────────────────────────
function ReminderCard({ inv }: { inv: UpcomingDue }) {
  const T = useMobileTokens();
  const days = inv.days_until_due;
  const tone = days <= 3 ? 'danger' : days <= 7 ? 'warning' : 'info';
  const chipTone = CHIP_TONES[tone];

  return (
    <View style={{
      ...cardSolid,
      backgroundColor: T.card,
      flexDirection: 'row', alignItems: 'center', gap: 14,
      ...(days <= 3 ? {
        backgroundColor: 'rgba(217,75,75,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(217,75,75,0.15)',
      } : {}),
    }}>
      {/* Days badge */}
      <View style={{
        width: 52, height: 52, borderRadius: 14,
        backgroundColor: chipTone.bg,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.3, color: chipTone.text }}>
          {days}
        </Text>
        <Text style={{ fontSize: 9, fontWeight: '600', color: chipTone.text, marginTop: -2 }}>gün</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <FileText size={12} strokeWidth={1.6} color={T.ink3} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink }}>{inv.invoice_number}</Text>
        </View>
        {inv.clinic_name && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
            <Building2 size={11} strokeWidth={1.4} color={T.ink3} />
            <Text style={{ fontSize: 12, color: T.ink3 }}>{inv.clinic_name}</Text>
          </View>
        )}
        <Text style={{ fontSize: 11, color: T.ink3, marginTop: 3 }}>
          {new Date(inv.due_date + 'T00:00:00').toLocaleDateString(localeTag(), {
            day: '2-digit', month: 'long', year: 'numeric',
          })}
        </Text>
      </View>

      {/* Amount — faturanın kendi para biriminde (katı per-currency) */}
      <Text style={{ ...DISPLAY, fontSize: 16, letterSpacing: -0.3, color: chipTone.text }}>
        {formatMoney(Number(inv.balance) || 0, (inv.currency ?? 'TRY') as Currency, { fractionDigits: 2 })}
      </Text>
    </View>
  );
}

export default FinanceReportScreen;
