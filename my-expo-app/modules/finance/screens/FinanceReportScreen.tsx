import { localeTag } from '../../../core/i18n';
/**
 * FinanceReportScreen — Gelir / Gider Raporu (Patterns Design Language)
 *
 * Aylık döküm + yaklaşan vade hatırlatmaları.
 * cardSolid, DISPLAY font, DS tokens, CHIP_TONES, Lucide icons.
 */
import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, ScrollView, Pressable, useWindowDimensions,
} from 'react-native';
import {
  BarChart2, TrendingUp, TrendingDown, CheckCircle, AlertCircle,
  Bell, Calendar, Building2, FileText, Inbox, Printer,
} from 'lucide-react-native';
import { Platform } from 'react-native';

import { HubContext } from '../../../core/ui/HubContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { supabase } from '../../../core/api/supabase';
import { getRangeBounds, type RangeKey } from '../components/DateRangePicker';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { buildFinanceReportHtml } from '../buildFinanceReportHtml';
import { baseSymbol, useBaseCurrency } from '../../../core/money/baseCurrency';
import { groupByCurrency, type CurrencyTotal } from '../../../core/money/aggregations';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import { formatMoney, CURRENCY_META, type Currency } from '../../../core/money/currency';

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
  const isDark = useThemeModeStore(s => s.resolvedDark);
  useBaseCurrency();

  const [tab, setTab] = useState<'rapor' | 'hatirlatma'>('rapor');
  const [range, setRange] = useState<RangeKey>('last_12_months');

  const cacheKey = `finance_report_v1:${range}`;
  const loadCached = (): { summary: MonthlySummary[]; upcoming: UpcomingDue[] } | null => {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try { const r = window.localStorage.getItem(cacheKey); return r ? JSON.parse(r) : null; } catch { return null; }
  };
  const saveCached = (data: { summary: MonthlySummary[]; upcoming: UpcomingDue[] }) => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try { window.localStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* quota */ }
  };
  const cached = loadCached();

  const [summary, setSummary] = useState<MonthlySummary[]>(cached?.summary ?? []);
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
      const [s1, s2] = await Promise.all([
        ccyQuery(),
        supabase.from('v_upcoming_due_invoices').select('*').limit(20),
      ]);
      let sumRows: MonthlySummary[];
      if (!s1.error) {
        sumRows = (s1.data ?? []) as MonthlySummary[];
      } else {
        const fb = await baseQuery();
        sumRows = ((fb.data ?? []) as any[]).map(r => ({ ...r, currency: 'TRY' })) as MonthlySummary[];
      }
      const upRows  = (s2.data ?? []) as UpcomingDue[];
      setSummary(sumRows);
      setUpcoming(upRows);
      saveCached({ summary: sumRows, upcoming: upRows });
      setLoading(false);
    };
    load();
  }, [range]);

  // Eski (base) toplam — PDF/Excel ham hesabı bunu kullanmaya devam ediyor (follow-up)
  const totals = summary.reduce(
    (acc, m) => ({
      income:  acc.income  + Number(m.income),
      expense: acc.expense + Number(m.expense),
      profit:  acc.profit  + Number(m.profit),
    }),
    { income: 0, expense: 0, profit: 0 },
  );

  // Katı per-currency: toplamlar para birimine göre BAĞIMSIZ (asla karışmaz)
  const incomeByCcy  = groupByCurrency(summary, m => ({ amount: Number(m.income),  currency: m.currency as Currency }));
  const expenseByCcy = groupByCurrency(summary, m => ({ amount: Number(m.expense), currency: m.currency as Currency }));
  const profitByCcy  = groupByCurrency(summary, m => ({ amount: Number(m.profit),  currency: m.currency as Currency }), { keepZero: true });

  // Ay başına grupla (her ayın per-currency satırları)
  const byMonth = (() => {
    const map = new Map<string, MonthlySummary[]>();
    for (const r of summary) (map.get(r.month) ?? map.set(r.month, []).get(r.month)!).push(r);
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, rows]) => ({ month, rows }));
  })();

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

  const TAB_ITEMS: { key: 'rapor' | 'hatirlatma'; label: string; icon: React.ComponentType<any> }[] = [
    { key: 'rapor',      label: 'Rapor',        icon: BarChart2 },
    { key: 'hatirlatma', label: `Hatırlatmalar${upcoming.length > 0 ? ` (${upcoming.length})` : ''}`, icon: Bell },
  ];

  return (
    <View style={{ flex: 1 }}>
      {/* ── Header — only standalone ── */}
      {!isEmbedded && (
        <View style={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 10 }}>
          <Text style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.5, color: T.ink }}>
            Gelir / Gider Raporu
          </Text>
          <Text style={{ fontSize: 13, color: T.ink3, marginTop: 2 }}>Mali özet</Text>
        </View>
      )}

      {/* ── Toolbar: Tab pills + Period pills ── */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 12 }}>
        {/* Tab pills + range pills row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          {/* Tab toggle pills */}
          <View style={{
            flexDirection: 'row', gap: 2,
            padding: 3, borderRadius: 9999,
            backgroundColor: T.cardSoft,
          }}>
            {TAB_ITEMS.map(t => {
              const active = t.key === tab;
              const Icon = t.icon;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 14, paddingVertical: 7,
                    borderRadius: 9999,
                    backgroundColor: active ? T.card : 'transparent',
                    // @ts-ignore web
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : undefined,
                    cursor: 'pointer',
                  }}
                >
                  <Icon size={13} strokeWidth={active ? 2.2 : 1.6} color={active ? T.ink : T.ink3} />
                  <Text style={{
                    fontSize: 12, fontWeight: active ? '600' : '500',
                    color: active ? T.ink : T.ink3,
                  }}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Separator */}
          <View style={{ width: 1, height: 20, backgroundColor: T.hairline, marginHorizontal: 4 }} />

          {/* PDF Rapor — sadece rapor tab + web */}
          {tab === 'rapor' && Platform.OS === 'web' && (
            <Pressable
              onPress={handlePrintPdf}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 12, paddingVertical: 6,
                borderRadius: 9999,
                backgroundColor: T.card,
                borderWidth: 1, borderColor: T.hairline,
                // @ts-ignore web
                cursor: 'pointer',
              }}
            >
              <Printer size={13} color={T.ink2} strokeWidth={1.8} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: T.ink2 }}>PDF Rapor</Text>
            </Pressable>
          )}

          {/* Period range pills — only for rapor tab */}
          {tab === 'rapor' && RANGE_OPTIONS.map(opt => {
            const active = opt.key === range;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setRange(opt.key)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6,
                  borderRadius: 9999,
                  backgroundColor: active ? T.ink : 'transparent',
                  // @ts-ignore web
                  cursor: 'pointer',
                }}
              >
                <Text style={{
                  fontSize: 12, fontWeight: active ? '600' : '500',
                  color: active ? T.bg : T.ink3,
                }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Content ── */}
      {loading ? (
        <CenteredLoader color={T.ink3} />
      ) : tab === 'rapor' ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: isEmbedded || isDesktop ? 4 : insets.top + 8, paddingBottom: 120, gap: 14 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── KPI Hero Cards ── */}
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 14 }}>
            <KpiHero
              label="Toplam Gelir"
              slices={incomeByCcy}
              icon={TrendingUp}
              bg={theme.bg}
              decorColor={theme.bgDeep}
              accentColor="#059669"
            />
            <KpiHero
              label="Toplam Gider"
              slices={expenseByCcy}
              icon={TrendingDown}
              bg={DS.exec.bg}
              decorColor={DS.exec.bgDeep}
              accentColor={DS.exec.primary}
            />
            <KpiHero
              label="Net Kâr"
              slices={profitByCcy}
              colorBySign
              icon={CheckCircle}
              bg={DS.clinic.bg}
              decorColor={DS.clinic.bgDeep}
              accentColor="#059669"
            />
          </View>

          {/* ── Section: Aylık Döküm ── */}
          <SectionHeader icon={Calendar} label="Aylık Döküm" />

          {byMonth.length === 0 ? (
            <View style={{ ...cardSolid, backgroundColor: T.card, alignItems: 'center', paddingVertical: 56, gap: 12 }}>
              <Inbox size={36} strokeWidth={1.4} color={T.ink3} />
              <Text style={{ fontSize: 14, fontWeight: '500', color: T.ink3 }}>Veri bulunamadı</Text>
            </View>
          ) : (
            <View style={{ ...cardSolid, backgroundColor: T.card, padding: 0, overflow: 'hidden' }}>
              {byMonth.map((mm, i) => (
                <MonthRow key={mm.month} data={mm} isLast={i === byMonth.length - 1} isDesktop={isDesktop} />
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        /* ── Hatırlatmalar Tab ── */
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: isEmbedded || isDesktop ? 4 : insets.top + 8, paddingBottom: 120, gap: 14 }}
          showsVerticalScrollIndicator={false}
        >
          <SectionHeader icon={Bell} label="Yaklaşan Vadeler" count={upcoming.length} />

          {upcoming.length === 0 ? (
            <View style={{ ...cardSolid, backgroundColor: T.card, alignItems: 'center', paddingVertical: 56, gap: 12 }}>
              <CheckCircle size={36} strokeWidth={1.4} color={CHIP_TONES.success.text} />
              <Text style={{ fontSize: 14, fontWeight: '500', color: T.ink3 }}>
                14 gün içinde vadesi dolan fatura yok
              </Text>
            </View>
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

// ─── Section Header ─────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label, count }: { icon: React.ComponentType<any>; label: string; count?: number }) {
  const T = useMobileTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
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

// ─── KPI Hero Card ──────────────────────────────────────────────────
function KpiHero({
  label, value, slices, colorBySign, icon: Icon, bg, decorColor, accentColor, dark = false,
}: {
  label: string; value?: string; slices?: CurrencyTotal[]; colorBySign?: boolean;
  icon: React.ComponentType<any>;
  bg: string; decorColor: string; accentColor: string; dark?: boolean;
}) {
  const T = useMobileTokens();
  const textColor = dark ? '#FFF' : T.ink;
  const subColor  = dark ? 'rgba(255,255,255,0.6)' : T.ink3;

  return (
    <View style={{
      flex: 1, backgroundColor: bg, borderRadius: 24,
      padding: 22, overflow: 'hidden', position: 'relative',
    }}>
      {/* Decorative circles */}
      <View style={{
        position: 'absolute', top: -30, right: -30,
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: decorColor, opacity: 0.5,
      }} />
      <View style={{
        position: 'absolute', bottom: -20, right: 30,
        width: 60, height: 60, borderRadius: 30,
        backgroundColor: decorColor, opacity: 0.3,
      }} />

      {/* Icon badge */}
      <View style={{
        width: 32, height: 32, borderRadius: 10,
        backgroundColor: dark ? 'rgba(255,255,255,0.12)' : accentColor + '15',
        alignItems: 'center', justifyContent: 'center', marginBottom: 14,
      }}>
        <Icon size={16} strokeWidth={1.8} color={dark ? 'rgba(255,255,255,0.8)' : accentColor} />
      </View>

      <Text style={{
        fontSize: 10, fontWeight: '600', letterSpacing: 0.8,
        textTransform: 'uppercase', color: subColor, marginBottom: 6,
      }}>
        {label}
      </Text>
      {slices ? (
        slices.length === 0
          ? <Text style={{ ...DISPLAY, fontSize: 26, letterSpacing: -0.5, color: subColor }}>—</Text>
          : <MoneyMultiX slices={slices} variant="cards" size="md" colorBySign={colorBySign} />
      ) : (
        <Text style={{ ...DISPLAY, fontSize: 26, letterSpacing: -0.5, color: textColor }}>
          {value}
        </Text>
      )}
    </View>
  );
}

// ─── Month Row — KATI per-currency (her para birimi ayrı satır) ─────────
function MonthRow({ data, isLast, isDesktop }: { data: { month: string; rows: MonthlySummary[] }; isLast: boolean; isDesktop: boolean }) {
  const T = useMobileTokens();
  const order = ['TRY', 'EUR', 'USD', 'GBP'];
  const rows = [...data.rows].sort((a, b) => order.indexOf(a.currency) - order.indexOf(b.currency));
  const multi = rows.length > 1;

  return (
    <View style={{
      paddingHorizontal: 24, paddingVertical: 16,
      borderBottomWidth: isLast ? 0 : 1,
      borderBottomColor: T.hairline,
      gap: 12,
    }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink }}>{fmtMonth(data.month)}</Text>

      {rows.map(m => {
        const income  = Number(m.income);
        const expense = Number(m.expense);
        const profit  = Number(m.profit);
        const maxVal  = Math.max(income, expense, 1);
        const incomeW  = Math.round((income / maxVal) * 100);
        const expenseW = Math.round((expense / maxVal) * 100);
        const profitTone = profit >= 0 ? CHIP_TONES.success : CHIP_TONES.danger;
        const sym = CURRENCY_META[(m.currency as Currency)]?.symbol ?? m.currency;
        const f = (n: number) => formatMoney(n, (m.currency as Currency), { fractionDigits: 0 });
        return (
          <View key={m.currency} style={{ gap: 8 }}>
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

            {/* Gelir / Gider barları */}
            <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 16 : 10 }}>
              <View style={{ flex: 1, gap: 5 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: T.ink3 }}>Gelir</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#2563EB' }}>{f(income)}</Text>
                </View>
                <View style={{ height: 6, borderRadius: 9999, backgroundColor: T.hairline, overflow: 'hidden' }}>
                  <View style={{ height: 6, borderRadius: 9999, backgroundColor: '#2563EB', width: `${incomeW}%` as any }} />
                </View>
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: T.ink3 }}>Gider</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: DS.exec.primary }}>{f(expense)}</Text>
                </View>
                <View style={{ height: 6, borderRadius: 9999, backgroundColor: T.hairline, overflow: 'hidden' }}>
                  <View style={{ height: 6, borderRadius: 9999, backgroundColor: DS.exec.primary, width: `${expenseW}%` as any }} />
                </View>
              </View>
            </View>
          </View>
        );
      })}
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
