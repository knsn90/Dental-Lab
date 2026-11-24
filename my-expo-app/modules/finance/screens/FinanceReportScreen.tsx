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
} from '../../../core/ui/icons';
import { Platform } from 'react-native';

import { HubContext } from '../../../core/ui/HubContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { SlideTabBar } from '../../../core/ui/SlideTabBar';
import { autoT } from '../../../core/i18n/autoTranslate';
import { MobileTableX, MobileTableRowX, useMobileTableText } from '../../../core/ui/MobileTableX';
import { supabase } from '../../../core/api/supabase';
import { getRangeBounds, type RangeKey } from '../components/DateRangePicker';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { buildFinanceReportHtml } from '../buildFinanceReportHtml';
import { baseSymbol, useBaseCurrency, getBaseCurrency } from '../../../core/money/baseCurrency';
import { formatMoney, CURRENCY_META, type Currency } from '../../../core/money/currency';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { WhiteHero } from '../../../core/ui/WhiteHero';
import { labTodayOf } from '../../../core/metrics/orderDefs';
import { loadLabTz } from '../../../core/metrics/useLabToday';
import { isPostedInvoice, isInvoiceOverdue } from '../../../core/metrics/invoiceDefs';

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
/**
 * Kesinleşmemiş gelir (taslak fatura) — gelirin AÇIK/kesikli tonu: aynı
 * anlam ailesi (gelir), ama "henüz kesin değil". Amber yerine yeşilin açığı:
 * amber uyarı demek, bu bir uyarı değil, beklenen bir ara durum.
 */
const UNBILLED = 'rgba(45,154,107,0.38)';
const UNBILLED_TEXT = '#4E9C7A';

// ── Types ───────────────────────────────────────────────────────────
interface MonthlySummary {
  month: string;
  currency: string;
  /** TOPLAM gelir = kesilen + kesinleşmemiş (normalizeRow sonrası). */
  income: number;
  expense: number;
  /** income − expense (toplam gelir üzerinden). */
  profit: number;
  /** Kesilmiş fatura geliri (KDV hariç) — Karlılık'la aynı tanım. */
  issued?: number;
  /** Kesinleşmemiş: teslim edilmiş işin taslak faturası (KDV hariç, tahmini). */
  unbilled?: number;
}

type BaseRow = { month?: string; income: number; expense: number; profit: number; issued?: number; unbilled?: number };

/**
 * View satırını ekran modeline çevirir. View'da `income` = kesilen, `income_unbilled`
 * = kesinleşmemiş. Ekran "anlık gelir" sorusunu cevaplar → gelir ikisinin TOPLAMI,
 * kırılım issued/unbilled alanlarında görünür kalır. Tahakkuk esası: teslim edilen
 * iş kazanılmış gelirdir; üretimdeki iş sayılmaz.
 */
function normalizeRow<T extends { income: any; expense: any; income_unbilled?: any }>(r: T) {
  const issued   = Number(r.income) || 0;
  const unbilled = Number(r.income_unbilled) || 0;
  const expense  = Number(r.expense) || 0;
  const { income_unbilled: _u, ...rest } = r as any;
  return { ...rest, issued, unbilled, income: issued + unbilled, expense, profit: issued + unbilled - expense };
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

const CCY_ORDER = ['TRY', 'EUR', 'USD', 'GBP', 'IRT'];

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
  const baseCcy = useBaseCurrency();

  const [tab, setTab] = useState<'rapor' | 'hatirlatma'>('rapor');
  const [range, setRange] = useState<RangeKey>('last_12_months');

  // v3: tek tanım (2026-10-26) — birleşik toplam saklı kurla, yaklaşan vadelerde taslak yok.
  // v4 (2026-11-24): gelir KDV hariç (Karlılık ile aynı) — eski KDV dahil önbellek okunmasın.
  const cacheKey = `finance_report_v5:${range}`;  // v5: kesinleşmemiş gelir (issued/unbilled)
  type ReportCache = { summary: MonthlySummary[]; baseSummary?: BaseRow[]; upcoming: UpcomingDue[] };
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
  const [baseSummary, setBaseSummary] = useState<BaseRow[]>(cached?.baseSummary ?? []);
  const [upcoming, setUpcoming] = useState<UpcomingDue[]>(cached?.upcoming ?? []);
  const [loading, setLoading] = useState(cached === null);

  useEffect(() => {
    // Dönem değişince önceki dönemin rakamları yeni etiketin altında kalmasın:
    // önce bu dönemin önbelleğiyle tohumla, yoksa yükleyiciyi göster.
    // Geç dönen eski istek yeni dönemin üstüne yazmasın (stale guard).
    let cancelled = false;
    const load = async () => {
      const cachedNow = loadCached();
      if (cachedNow === null) {
        setLoading(true);
      } else {
        setSummary(cachedNow.summary ?? []);
        setBaseSummary(cachedNow.baseSummary ?? []);
        setUpcoming(cachedNow.upcoming ?? []);
        setLoading(false);
      }
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
      if (cancelled) return;
      let sumRows: MonthlySummary[];
      if (!s1.error) {
        sumRows = ((s1.data ?? []) as any[]).map(normalizeRow) as MonthlySummary[];
      } else {
        // Döviz kırılımı yoksa baz özet lab'ın ANA para birimindedir (sabit TRY değil).
        sumRows = ((sBase.data ?? []) as any[]).map(r => ({ ...normalizeRow(r), currency: getBaseCurrency() })) as MonthlySummary[];
      }
      const baseRows = ((sBase.data ?? []) as any[]).map(normalizeRow) as BaseRow[];
      const upRows  = (s2.data ?? []) as UpcomingDue[];
      setSummary(sumRows);
      setBaseSummary(baseRows);
      setUpcoming(upRows);
      // Hatalı yanıtı önbelleğe yazma — boş sonuç sonraki açılışta "hareket yok" gibi görünür.
      if (!sBase.error && !s2.error) {
        saveCached({ summary: sumRows, baseSummary: baseRows, upcoming: upRows });
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [range]);

  /**
   * Para birimi başına dönem sonucu — ekranın cevabı bu.
   * Katı per-currency: farklı para birimleri asla toplanmaz.
   */
  const byCurrency = useMemo(() => {
    const set = new Set(summary.map(m => m.currency));
    // Sıra: ana para birimi önce, sonra CCY_ORDER, listede olmayanlar en sonda
    // (indexOf -1 eskiden bilinmeyen dövizi en BAŞA alıyordu).
    const rank = (c: string) => (c === baseCcy ? -1 : (CCY_ORDER.indexOf(c) === -1 ? 99 : CCY_ORDER.indexOf(c)));
    return Array.from(set)
      .sort((a, b) => rank(a) - rank(b))
      .map(ccy => {
        const rows = summary.filter(m => m.currency === ccy);
        return {
          currency: ccy as Currency,
          income:  rows.reduce((s, r) => s + Number(r.income),  0),
          expense: rows.reduce((s, r) => s + Number(r.expense), 0),
          profit:  rows.reduce((s, r) => s + Number(r.profit),  0),
          issued:  rows.reduce((s, r) => s + Number(r.issued ?? r.income), 0),
          unbilled: rows.reduce((s, r) => s + Number(r.unbilled ?? 0), 0),
        };
      });
  }, [summary, baseCcy]);

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

  // Konsolide baz toplam (lab ana para biriminde; gelir saklı kurla, gider gider gününün kuruyla)
  const baseTotals = baseSummary.reduce<{ income: number; expense: number; profit: number; issued: number; unbilled: number }>(
    (acc, m) => ({
      income: acc.income + Number(m.income), expense: acc.expense + Number(m.expense), profit: acc.profit + Number(m.profit),
      issued: acc.issued + Number(m.issued ?? m.income), unbilled: acc.unbilled + Number(m.unbilled ?? 0),
    }),
    { income: 0, expense: 0, profit: 0, issued: 0, unbilled: 0 },
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

  // Beyaz hero başlığı. Tek döviz → o dövizin neti. Birden çok döviz →
  // ANA para biriminde konsolide net (≈, saklı/işlem günü kuruyla).
  // Eskiden "ilk döviz" gösteriliyordu: EUR ana paralı bir lab'da gelir EUR,
  // gider TRY olunca başlık TRY satırını alıp −₺1,7M "zarar" yazıyordu —
  // döviz başına kâr anlamsız, cevap konsolide rakamdır. Döviz kırılımı
  // altındaki ResultCard'larda olduğu gibi kalır.
  const heroIsConsolidated = byCurrency.length > 1;
  const repLead: { currency: Currency; income: number; expense: number; profit: number; issued: number; unbilled: number } | null =
    byCurrency.length === 0 ? null
    : heroIsConsolidated ? { currency: baseCcy as Currency, ...baseTotals }
    : byCurrency[0];
  // ≈ : kur çevrimi (çok döviz) ya da gelirin bir kısmı tahmini (kesinleşmemiş taslak).
  const hasUnbilled = !!repLead && Math.abs(repLead.unbilled) > 0.005;
  const approx = heroIsConsolidated ? '≈ ' : '';
  const approxNet = heroIsConsolidated || hasUnbilled ? '≈ ' : '';
  const repMargin = repLead && repLead.income > 0
    ? Math.round((repLead.profit / repLead.income) * 100)
    : null;

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
      // Aylık özetin `month` sütunu hep ayın 1'i. Önceki dönemi milisaniyeyle
      // kaydırmak ayın ortasına düşüyordu → "Bu Ay"/"Geçen Ay"da hiçbir satır
      // eşleşmiyor, "Son 12 Ay"da bir ay eksik kalıyordu. Tam ay sayısıyla kaydır.
      const [fy, fm] = from.split('-').map(Number);
      const [ty, tm] = to.split('-').map(Number);
      const months = (ty - fy) * 12 + (tm - fm) + 1;          // dönemdeki ay sayısı
      const pad = (n: number) => String(n).padStart(2, '0');
      const ym = (y: number, m0: number) => {                // m0: 0 tabanlı, taşmalı olabilir
        const d = new Date(Date.UTC(y, m0, 1));
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
      };
      prevFrom = `${ym(fy, fm - 1 - months)}-01`;
      prevTo   = `${ym(fy, fm - 2)}-01`;                       // önceki dönemin son ayı (ay başı)
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
        ? supabase.from('v_monthly_finance_summary').select('income, expense, income_unbilled').gte('month', prevFrom).lte('month', prevTo)
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
    // Aynıyla kıyasla: önceki dönem de TOPLAM gelir (kesilen + kesinleşmemiş).
    const prevRows = ((prevRes.data ?? []) as any[]).map(normalizeRow) as { income: number; expense: number }[];
    const previousPeriod = prevRows.length > 0
      ? {
          income:  prevRows.reduce((s, r) => s + Number(r.income),  0),
          expense: prevRows.reduce((s, r) => s + Number(r.expense), 0),
        }
      : undefined;

    // Collection stats
    // Tek tanım (2026-10-26): yalnız kesilmiş faturalar (taslak ve iptal hariç); vade = lab günü.
    const invoices = ((invRes.data ?? []) as any[]).filter(i => isPostedInvoice(i));
    const today = labTodayOf(await loadLabTz());
    // Baz para birimine çevir (amount_base / paid_amount × rate) — karışık para birimi toplamı doğru olsun.
    const toBase = (i: any) => Number(i.amount_base ?? (Number(i.total ?? 0) * Number(i.rate_at_time ?? 1)));
    const paidBase = (i: any) => Number(i.paid_amount ?? 0) * Number(i.rate_at_time ?? 1);
    const totalBilled  = invoices.reduce((s, i) => s + toBase(i), 0);
    const totalPaid    = invoices.reduce((s, i) => s + paidBase(i), 0);
    const totalOverdue = invoices
      .filter(i => isInvoiceOverdue(i, today))
      .reduce((s, i) => s + Math.max(0, toBase(i) - paidBase(i)), 0);
    const collection = {
      totalBilled, totalPaid, totalOverdue,
      invoiceCount: invoices.length,
    };

    // Top expenses
    const topExpenses = ((topExpRes.data ?? []) as any[]).map(e => ({
      date: e.expense_date,
      description: e.description ?? '—',
      category: CATEGORY_LABELS[e.category] ?? e.category ?? 'Diğer',
      amount: Number(e.amount_base ?? e.amount ?? 0),
    }));

    // Döviz satırları yalnız TEK döviz ANA para birimiyle aynıysa kullanılır;
    // aksi halde önceki dönem / kategori / en yüksek gider / tahsilat (hepsi ana
    // parada) ile aynı tabloda farklı döviz karışırdı → konsolide ana para özeti.
    const singleCcy = byCurrency.length === 0
      || (byCurrency.length === 1 && byCurrency[0].currency === getBaseCurrency());
    const pdfCurrency = getBaseCurrency();
    const pdfRows = singleCcy
      ? byMonth.map(mm => ({
          month: mm.month,
          income:  mm.rows.reduce((s, r) => s + Number(r.income), 0),
          expense: mm.rows.reduce((s, r) => s + Number(r.expense), 0),
          profit:  mm.rows.reduce((s, r) => s + Number(r.profit), 0),
          unbilled: mm.rows.reduce((s, r) => s + Number(r.unbilled ?? 0), 0),
        }))
      : baseSummary.filter(b => !!b.month).map(b => ({
          month: String(b.month), income: Number(b.income) || 0, expense: Number(b.expense) || 0, profit: Number(b.profit) || 0,
          unbilled: Number(b.unbilled ?? 0),
        }));

    const html = buildFinanceReportHtml({
      lab,
      periodLabel,
      // Dövizler TOPLANMAZ (tek tanım): tek döviz varsa o dövizin satırları; birden çoksa
      // ana para birimine SAKLI kurla çevrilmiş aylık özet (v_monthly_finance_summary).
      rows: pdfRows,
      currency: pdfCurrency,
      unbilledTotal: pdfRows.reduce((s, r: any) => s + Number(r.unbilled ?? 0), 0),
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
          {/* Uygulamanın ortak sekme çubuğu — Siparişler / Onaylar / Kurumlar /
              Faturalar / Karlılık ile aynı bileşen. Yerel SegmentedControl
              kaldırıldı; ikonlar da düştü (komşu sayfaların hiçbirinde yok).
              Rozet → sayaç: bileşen 0'dan büyükken etiketin yanına yazar. */}
          <SlideTabBar
            items={TAB_ITEMS.map(t => ({ key: t.key, label: t.label, count: t.badge }))}
            activeKey={tab}
            onChange={k => setTab(k as typeof tab)}
            accentColor={theme.accent}
            style={{ marginStart: -4 }}
          />

          {tab === 'rapor' && (
            <SlideTabBar
              size="sm"
              items={RANGE_OPTIONS.map(o => ({ key: o.key, label: o.label }))}
              activeKey={range}
              onChange={k => setRange(k as RangeKey)}
              accentColor={theme.accent}
              style={{ marginStart: -3 }}
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
          {/* ── Hero — "BEYAZ HERO" (core/ui/WhiteHero) ─────────────────
              Prim Motoru hiyerarşisi: kicker (dönem) → 44px net sonuç →
              bağlam cümlesi → sağda 40px stat'lar. Kâr/zarar sinyali zemini
              değil RAKAMI boyar; kart nötr kalır.
              Tek döviz → o dövizin neti; birden çok döviz → ana para
              biriminde konsolide net (≈). Döviz kırılımı ResultCard'larda. */}
          {byCurrency.length > 0 && (
            <WhiteHero
              kicker={`${autoT('Gelir / Gider Raporu')} · ${autoT(periodLabel)}`}
              accent={theme.primary}
              title={
                <>{autoT('Net sonuç')}{' '}
                  <Text style={{ color: repLead!.profit >= 0 ? CHIP_TONES.success.text : CHIP_TONES.danger.text }}>
                    {approxNet}{repLead!.profit >= 0 ? '+' : '−'}{formatMoney(Math.abs(repLead!.profit), repLead!.currency, { fractionDigits: 0 })}
                  </Text>
                </>
              }
              description={
                `${autoT(periodLabel)} · ${autoT('gelir')} ${approx}${formatMoney(repLead!.income, repLead!.currency, { fractionDigits: 0 })}` +
                (hasUnbilled
                  ? ` (${autoT('kesilen')} ${formatMoney(repLead!.issued, repLead!.currency, { fractionDigits: 0 })}` +
                    ` + ${autoT('kesinleşmemiş')} ${formatMoney(repLead!.unbilled, repLead!.currency, { fractionDigits: 0 })})`
                  : '') +
                ` · ${autoT('gider')} ${approx}${formatMoney(repLead!.expense, repLead!.currency, { fractionDigits: 0 })}` +
                (heroIsConsolidated ? ` · ${byCurrency.length} ${autoT('para birimi ana para birimine çevrildi; döviz kırılımı aşağıda')}` : '') +
                (byMonth.length ? ` · ${byMonth.length} ${autoT('ay')}` : '') +
                ` · ${autoT('gelir KDV hariç')}`
              }
              stats={[
                { value: approx + formatMoney(repLead!.income,  repLead!.currency, { fractionDigits: 0 }), label: 'Gelir' },
                ...(hasUnbilled ? [{ value: approx + formatMoney(repLead!.unbilled, repLead!.currency, { fractionDigits: 0 }), label: 'Kesinleşmemiş gelir', color: UNBILLED_TEXT }] : []),
                { value: approx + formatMoney(repLead!.expense, repLead!.currency, { fractionDigits: 0 }), label: 'Gider' },
                ...(repMargin !== null ? [{ value: `%${repMargin}`, label: 'Marj' }] : []),
              ]}
            />
          )}

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
              {/* Ekstre / giderler mobil tablosuyla aynı kalıp */}
              <MobileTableX title="Aylık Döküm" count={byMonth.length} countLabel="ay">
                {byMonth.map((mm, i) => (
                  <MonthRow
                    key={mm.month}
                    data={mm}
                    scaleByCcy={scaleByCcy}
                    isLast={i === byMonth.length - 1}
                    isDesktop={isDesktop}
                  />
                ))}
              </MobileTableX>
              <Text style={{ fontSize: 11, color: T.ink3, paddingHorizontal: 12, lineHeight: 17 }}>
                Barlar dönemin tamamında ortak ölçekle çizilir — aylar birbiriyle kıyaslanabilir.
              </Text>
            </>
          )}
        </ScrollView>
      ) : (
        /* ── Hatırlatmalar Tab ── */
        <ScrollView style={{ flex: 1 }} contentContainerStyle={scrollPad} showsVerticalScrollIndicator={false}>
          {upcoming.length === 0 ? (
            <>
              <SectionHeader icon={Bell} label="Yaklaşan Vadeler" count={upcoming.length} />
              <EmptyCard icon={CheckCircle} text="14 gün içinde vadesi dolan fatura yok" tone={CHIP_TONES.success.text} />
            </>
          ) : (
            /* Ekstre / giderler mobil tablosuyla aynı kalıp */
            <MobileTableX title="Yaklaşan Vadeler" count={upcoming.length} countLabel="fatura">
              {upcoming.map((inv, i) => (
                <ReminderCard key={inv.id} inv={inv} isLast={i === upcoming.length - 1} />
              ))}
            </MobileTableX>
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
  data: { currency: Currency; income: number; expense: number; profit: number; issued?: number; unbilled?: number };
  periodLabel: string;
  accent: string;
}) {
  const T = useMobileTokens();
  const { currency, income, expense, profit } = data;
  const unbilled = Number(data.unbilled ?? 0);
  const issued = Number(data.issued ?? income);
  const hasUnbilled = Math.abs(unbilled) > 0.005;
  const f = (n: number) => formatMoney(n, currency, { fractionDigits: 0 });
  const sym = CURRENCY_META[currency]?.symbol ?? currency;

  const loss = profit < 0;
  const flat = profit === 0;
  const netColor = flat ? T.ink2 : loss ? EXPENSE : INCOME;
  const badge = flat
    ? { label: autoT('BAŞA BAŞ'), ...CHIP_TONES.info }
    : loss
      ? { label: autoT('ZARAR'), ...CHIP_TONES.danger }
      : { label: autoT('KÂR'), ...CHIP_TONES.success };

  const span = income + expense;
  const incomeShare  = span > 0 ? (income  / span) * 100 : 0;
  const expenseShare = span > 0 ? (expense / span) * 100 : 0;
  // Gelir şeridi içinde kesilen (dolu) / kesinleşmemiş (açık) payı
  const issuedShare   = income > 0 ? Math.max(0, Math.min(100, (issued / income) * 100)) : 100;

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
          {autoT('Net Kâr')} · {periodLabel}
        </Text>
        <Text numberOfLines={1} style={{ ...DISPLAY, fontSize: 40, letterSpacing: -1.4, lineHeight: 46, color: netColor }}>
          {hasUnbilled ? '≈ ' : ''}{profit > 0 ? '+' : ''}{f(profit)}
        </Text>
      </View>

      {/* Gelir / gider orantı şeridi */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', height: 8, borderRadius: 9999, overflow: 'hidden', backgroundColor: T.hairline, gap: 2 }}>
          {incomeShare > 0 ? (
            <View style={{ width: `${incomeShare}%` as any, flexDirection: 'row', borderRadius: 9999, overflow: 'hidden', backgroundColor: UNBILLED }}>
              <View style={{ width: `${issuedShare}%` as any, backgroundColor: INCOME }} />
            </View>
          ) : null}
          {expenseShare > 0 ? (
            <View style={{ width: `${expenseShare}%` as any, backgroundColor: EXPENSE, borderRadius: 9999 }} />
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 16 }}>
          <LegendItem color={INCOME}  icon={TrendingUp}   label="Gelir" value={f(income)} />
          <LegendItem color={EXPENSE} icon={TrendingDown} label="Gider" value={f(expense)} />
        </View>

        {/* Gelirin kırılımı — kesinleşmemiş kısım toplamda sayılır ama ayrı yazılır */}
        {hasUnbilled && (
          <Text style={{ fontSize: 11, lineHeight: 17, color: T.ink3 }}>
            {autoT('Kesilen fatura')} {f(issued)} · <Text style={{ color: UNBILLED_TEXT, fontWeight: '600' }}>{autoT('Kesinleşmemiş gelir')} {f(unbilled)}</Text>
            {' '}{autoT('(teslim edilmiş, faturası kesilmemiş iş — tahmini)')}
          </Text>
        )}
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
function ConsolidatedStrip({ totals }: { totals: { income: number; expense: number; profit: number; unbilled?: number } }) {
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
          {autoT('Konsolide Net Kâr')} · {baseSymbol()}
        </Text>
        <Text numberOfLines={1} style={{
          ...DISPLAY, fontSize: 26, letterSpacing: -0.8,
          color: loss ? EXPENSE : INCOME,
        }}>
          ≈ {loss ? '−' : '+'}{fmtMoney(Math.abs(totals.profit))}
        </Text>
      </View>
      <Text style={{ fontSize: 11, color: T.ink3, lineHeight: 17 }}>
        {/* Tutarlar cümleyi parçalara bölüyordu → parçalar ayrı ayrı aranıp
            yarısı Türkçe kalıyordu. Statik kısımlar autoT'den geçer. */}
        {autoT('Gelir')} {fmtMoney(totals.income)}
        {Math.abs(Number(totals.unbilled ?? 0)) > 0.005 ? <> ({autoT('kesinleşmemiş')} {fmtMoney(Number(totals.unbilled))})</> : null}
        {' · '}{autoT('Gider')} {fmtMoney(totals.expense)}.
        {' '}{autoT('Farklı para birimleri ana para birimine çevrildi: gelir faturanın saklı kuruyla, gider gider gününün kuruyla.')}
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
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const rows = [...data.rows].sort((a, b) => CCY_ORDER.indexOf(a.currency) - CCY_ORDER.indexOf(b.currency));
  const multi = rows.length > 1;

  return (
    <View style={{
      paddingHorizontal: isDesktop ? 24 : 16, paddingVertical: isDesktop ? 16 : 12,
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}>
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
              <MiniBar
                label="Gelir" value={f(income)} pct={incomeW} color={INCOME}
                solidShare={income > 0 ? Math.max(0, Math.min(100, (Number(m.issued ?? income) / income) * 100)) : 100}
                note={Math.abs(Number(m.unbilled ?? 0)) > 0.005 ? `${autoT('Kesinleşmemiş gelir')} ${f(Number(m.unbilled))}` : undefined}
              />
              <MiniBar label="Gider" value={f(expense)} pct={expenseW} color={EXPENSE} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function MiniBar({ label, value, pct, color, solidShare = 100, note }: {
  label: string; value: string; pct: number; color: string;
  /** Barın dolu (kesin) payı %; kalanı açık tonla (kesinleşmemiş) çizilir. */
  solidShare?: number;
  note?: string;
}) {
  const T = useMobileTokens();
  return (
    <View style={{ flex: 1, gap: 5 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 11, fontWeight: '500', color: T.ink3 }}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: pct > 0 ? color : T.ink3 }}>{value}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 9999, backgroundColor: T.hairline, overflow: 'hidden' }}>
        {pct > 0 ? (
          <View style={{
            height: 6, borderRadius: 9999, flexDirection: 'row', overflow: 'hidden',
            backgroundColor: solidShare < 100 ? UNBILLED : color, width: `${Math.max(pct, 1.5)}%` as any,
          }}>
            {solidShare < 100 && <View style={{ width: `${solidShare}%` as any, backgroundColor: color }} />}
          </View>
        ) : null}
      </View>
      {note ? <Text style={{ fontSize: 10.5, color: UNBILLED_TEXT }}>{note}</Text> : null}
    </View>
  );
}

// ─── Reminder Card ──────────────────────────────────────────────────
function ReminderCard({ inv, isLast }: { inv: UpcomingDue; isLast: boolean }) {
  const T = useMobileTokens();
  const MT = useMobileTableText();
  const days = inv.days_until_due;
  const tone = days <= 3 ? 'danger' : days <= 7 ? 'warning' : 'info';
  const chipTone = CHIP_TONES[tone];

  return (
    <MobileTableRowX isLast={isLast} tint={days <= 3 ? 'rgba(217,75,75,0.04)' : undefined}>
      {/* Kalan gün karesi — ikon karesiyle aynı ölçü */}
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: chipTone.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: chipTone.text }}>{days}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={MT.title} numberOfLines={1}>{inv.invoice_number}</Text>
        {inv.clinic_name ? <Text style={MT.sub} numberOfLines={1}>{inv.clinic_name}</Text> : null}
        <Text style={[MT.meta, { marginTop: 2 }]} numberOfLines={1}>
          {new Date(inv.due_date + 'T00:00:00').toLocaleDateString(localeTag(), {
            day: '2-digit', month: 'long', year: 'numeric',
          })} · {days} {autoT('gün kaldı')}
        </Text>
      </View>
      {/* Tutar — faturanın kendi para biriminde (katı per-currency) */}
      <Text style={[MT.amount, { color: chipTone.text }]}>
        {formatMoney(Number(inv.balance) || 0, (inv.currency ?? 'TRY') as Currency, { fractionDigits: 2 })}
      </Text>
    </MobileTableRowX>
  );
}

export default FinanceReportScreen;
