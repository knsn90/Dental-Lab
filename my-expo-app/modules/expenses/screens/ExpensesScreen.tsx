import { localeTag } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
/**
 * ExpensesScreen — Giderler
 *
 * Yapı (Hizmet bedelleri / Tedarikçiler ile aynı dil):
 *   • BEYAZ HERO: seçili dönemin gideri (baş döviz) + önceki döneme göre değişim
 *     → kategori dağılım çubuğu → düğme şeridi (Gider ekle · Satın alma · …)
 *   • Tek kart: dönem sekmeleri (Bu ay/Geçen ay/Son 3 ay/Tümü/Özel) + arama +
 *     kategori + sıralama → satırlar → döviz döviz alt toplam
 *   • Satır eylemleri tek ⋯ menüsünde: Aç · Düzenle · Sil
 *   • Faturalı gider silinirken TEK açık pencere: yalnız fatura / fatura + stok
 */
import React, { useState, useMemo, useContext, useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HubContext } from '../../../core/ui/HubContext';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, Alert, RefreshControl, Platform,
  useWindowDimensions,
} from 'react-native';

import { useExpenses } from '../hooks/useExpenses';
import {
  createExpense, updateExpense, deleteExpense, deletePurchaseInvoice,
  EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_COLORS,
  type Expense, type ExpenseCategory, type ExpensePaymentMethod, type CreateExpenseParams,
} from '../api';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { DatePicker } from '../../../core/ui/DatePicker';
import { MoneyInput } from '../../../core/money/MoneyInput';
import { groupByCurrency, type CurrencyTotal } from '../../../core/money/aggregations';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import { formatMoney, useBaseCurrency, type Currency } from '../../../core/money/currency';
import { baseSymbol } from '../../../core/money/baseCurrency';
import { PurchaseFormModal } from '../../purchases/components/PurchaseFormModal';
import { IncomingEFaturaModal } from '../../purchases/components/IncomingEFaturaModal';
import type { PurchasePrefill } from '../../purchases/lib/incomingPrefill';
import { getActiveProvider } from '../../efatura/providers';
import { PurchaseInvoiceDetailScreen } from '../../purchases/screens/PurchaseInvoiceDetailScreen';
import { ExpenseDetailScreen } from './ExpenseDetailScreen';
import { RecurringExpensesPanel } from '../components/RecurringExpensesPanel';
import { CAT_ICON, PAY_METHODS, fmtDate, rowStyle } from '../lib/expenseDisplay';
import { downloadCsv, csvMoney, csvDate } from '../../../core/util/csvExport';
import { buildExpensesReportHtml, downloadExpensesReport } from '../../../core/util/buildExpensesReportHtml';
import { useAuthStore } from '../../../core/store/authStore';
import { toast } from '../../../core/ui/Toast';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useInkUI } from '../../../core/theme/inkScale';
import { FilterMenu } from '../../../core/ui/FilterMenu';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { AnchorMenu } from '../../invoices/components/AnchorMenu';
import {
  Plus, Search, X, Inbox, Pencil, Trash2,
  MoreHorizontal, Repeat, FileSpreadsheet, Receipt,
  FileText, FileUp, Sparkles, Check, ArrowUpRight,
} from '../../../core/ui/icons';
import { supabase } from '../../../core/api/supabase';
import { confirmAsync } from '../../../core/util/confirm';
import { ensureAiConsent } from '../../../core/ai/aiConsent';

// ── Patterns tokens ─────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

const modalShadow = '0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)';

// Malzeme alımları Stok > Satın Alma akışından otomatik gider kaydı olarak yansır.
const CATEGORIES: ExpenseCategory[] = ['malzeme', 'kira', 'personel', 'ekipman', 'vergi', 'kurye', 'diger'];
// Genel gider formunda görünen kategoriler — sarf/demirbaş Stok › Satın Alma'dan girilir
const FORM_CATEGORIES: ExpenseCategory[] = ['kira', 'personel', 'vergi', 'diger'];

type DateRangeKey = 'this_month' | 'last_month' | 'last_3m' | 'all' | 'custom';
type ExpSortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
type Bounds = { from?: string; to?: string };
type RowMenuItem = { key: string; label: string; icon?: React.ComponentType<any>; onPress: () => void };

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Dönemin [başlangıç, bitiş] sınırları + kıyas için ÖNCEKİ eşdeğer dönem.
 * `expense_date` 'YYYY-MM-DD' metni; karşılaştırma string üzerinden yapılır
 * (Date'e çevirmek saat dilimi kayması riski getirirdi).
 */
function rangeBounds(key: DateRangeKey, customFrom: string, customTo: string): { cur: Bounds; prev: Bounds | null } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const monthStart = (k: number) => isoDay(new Date(y, m + k, 1));
  const monthEnd = (k: number) => isoDay(new Date(y, m + k + 1, 0));
  switch (key) {
    case 'this_month': {
      // Bu ay, ayın BUGÜNÜNE kadar; kıyas: geçen ayın aynı gününe kadar (adil kıyas).
      const prevTo = isoDay(new Date(y, m - 1, Math.min(now.getDate(), new Date(y, m, 0).getDate())));
      return { cur: { from: monthStart(0) }, prev: { from: monthStart(-1), to: prevTo } };
    }
    case 'last_month': return { cur: { from: monthStart(-1), to: monthEnd(-1) }, prev: { from: monthStart(-2), to: monthEnd(-2) } };
    case 'last_3m':    return { cur: { from: monthStart(-2) }, prev: { from: monthStart(-5), to: monthEnd(-3) } };
    case 'custom':     return { cur: { from: customFrom || undefined, to: customTo || undefined }, prev: null };
    default:           return { cur: {}, prev: null };
  }
}

function inBounds(d: string | null | undefined, b: Bounds): boolean {
  if (!b.from && !b.to) return true;
  const v = d ?? '';
  if (!v) return false;                       // tarihsiz kayıt aralığa giremez
  if (b.from && v < b.from) return false;
  if (b.to && v > b.to) return false;
  return true;
}

/**
 * Otomatik açıklamaları ("Kurye · Teslimat · Lab → Klinik · #NEX-… · Banabikurye")
 * iki satıra böler: başlık = anlamlı ilk iki parça, alt = kalanlar.
 * Kategori adıyla başlayan ön ek (zaten ikonda görünüyor) atılır.
 */
function splitDescription(e: Expense): { title: string; sub: string | null } {
  const parts = (e.description ?? '').split(' · ').map(s => s.trim()).filter(Boolean);
  if (parts.length > 1 && parts[0].toLocaleLowerCase('tr-TR') === EXPENSE_CATEGORY_LABELS[e.category].toLocaleLowerCase('tr-TR')) parts.shift();
  if (parts.length <= 2) return { title: parts.join(' · ') || '—', sub: null };
  return { title: parts.slice(0, 2).join(' · '), sub: parts.slice(2).join(' · ') };
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function ExpensesScreen() {
  const router   = useRouter();
  const segments = useSegments();
  const panel    = (segments?.[0] as string) ?? '(lab)';
  const theme = usePanelTheme();
  const U = useInkUI();
  const T = useMobileTokens();
  const heroInk = useWhiteHeroInk(theme.primary);
  const isEmbedded = useContext(HubContext);

  /** Fatura / gider detayı bu ekranın içinde açılır — geri dönünce filtre korunur. */
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const openInvoice = (id: string) => {
    if (isEmbedded) setInvoiceId(id);
    else router.push(`/${panel}/purchase-invoice/${id}` as any);
  };
  const [detailId, setDetailId] = useState<string | null>(null);
  const openExpense = (e: Expense) => {
    if (e.purchase_invoice_id) { openInvoice(e.purchase_invoice_id); return; }
    if (isEmbedded) setDetailId(e.id);
    else router.push(`/${panel}/expense/${e.id}` as any);
  };

  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const insets = useSafeAreaInsets();
  const topPad = isEmbedded || isDesktop ? 0 : Math.max(insets.top, 8) + 72;

  const [catFilter, setCatFilter] = useState<ExpenseCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<ExpSortKey>('date_desc');
  // Varsayılan "Bu ay": tüm zamanların toplamı karar vermeye yaramıyordu.
  const [dateRange, setDateRange] = useState<DateRangeKey>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');

  const DATE_OPTIONS: { key: DateRangeKey; label: string }[] = [
    { key: 'this_month', label: autoT('Bu ay') },
    { key: 'last_month', label: autoT('Geçen ay') },
    { key: 'last_3m',    label: autoT('Son 3 ay') },
    { key: 'all',        label: autoT('Tümü') },
    { key: 'custom',     label: autoT('Özel') },
  ];

  const bounds = useMemo(() => rangeBounds(dateRange, customFrom, customTo), [dateRange, customFrom, customTo]);

  const [recurringOpen, setRecurringOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [incomingOpen, setIncomingOpen] = useState(false);
  const [purchasePrefill, setPurchasePrefill] = useState<PurchasePrefill | null>(null);
  const [lucaActive, setLucaActive] = useState(false);
  useEffect(() => { getActiveProvider().then((p) => setLucaActive(p.key === 'luca')).catch(() => {}); }, []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  // Hepsi tek seferde gelir; kategori/dönem süzgeci istemcide — hero, sekme
  // sayıları ve liste aynı kümeden beslenir (rakamlar birbirini tutar).
  const { expenses, loading, refetch } = useExpenses();

  const ccyOf = (e: Expense) => ((e.currency ?? 'TRY') as Currency);
  const amt = (e: Expense) => Number(e.amount) || 0;

  /** Dönem içindeki giderler (kategori/arama hariç) — hero bunu özetler. */
  const inPeriod = useMemo(() => expenses.filter(e => inBounds(e.expense_date, bounds.cur)), [expenses, bounds]);
  const prevPeriod = useMemo(() => bounds.prev ? expenses.filter(e => inBounds(e.expense_date, bounds.prev!)) : null, [expenses, bounds]);

  const filtered = useMemo(() => {
    const sl = search.trim().toLocaleLowerCase('tr-TR');
    const list = inPeriod.filter(e => {
      if (catFilter !== 'all' && e.category !== catFilter) return false;
      if (sl && !e.description.toLocaleLowerCase('tr-TR').includes(sl)
             && !EXPENSE_CATEGORY_LABELS[e.category].toLocaleLowerCase('tr-TR').includes(sl)) return false;
      return true;
    });
    return list.sort((a, b) => {
      switch (sortKey) {
        case 'date_asc':    return (a.expense_date ?? '').localeCompare(b.expense_date ?? '');
        case 'amount_desc': return amt(b) - amt(a);
        case 'amount_asc':  return amt(a) - amt(b);
        default:            return (b.expense_date ?? '').localeCompare(a.expense_date ?? '');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPeriod, search, sortKey, catFilter]);

  const baseCurrency = useBaseCurrency();
  // Katı per-currency: döviz toplamları BAĞIMSIZ (asla toplanmaz).
  const periodByCcy = useMemo(() => groupByCurrency(inPeriod, e => ({ amount: amt(e), currency: ccyOf(e) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inPeriod]);
  const listByCcy = useMemo(() => groupByCurrency(filtered, e => ({ amount: amt(e), currency: ccyOf(e) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered]);

  const lead = periodByCcy[0] ?? null;
  const rest = periodByCcy.slice(1);

  // Önceki eşdeğer döneme göre değişim — yalnız baş dövizde.
  const delta = useMemo(() => {
    if (!lead || !prevPeriod) return null;
    const prev = prevPeriod.filter(e => ccyOf(e) === lead.currency).reduce((t, e) => t + amt(e), 0);
    if (prev <= 0) return null;
    return Math.round(((lead.total - prev) / prev) * 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.total, lead?.currency, prevPeriod]);

  // Kategori dağılımı (baş dövizde) — dönem değişince BİRLİKTE güncellenir.
  const catDist = useMemo(() => {
    if (!lead) return [];
    const by: Partial<Record<ExpenseCategory, number>> = {};
    for (const e of inPeriod) if (ccyOf(e) === lead.currency) by[e.category] = (by[e.category] ?? 0) + amt(e);
    return CATEGORIES
      .map(cat => ({ cat, value: by[cat] ?? 0 }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPeriod, lead?.currency]);

  const catCounts = useMemo(() => {
    const c: Partial<Record<ExpenseCategory, number>> = {};
    for (const e of inPeriod) c[e.category] = (c[e.category] ?? 0) + 1;
    return c;
  }, [inPeriod]);
  const usedCats = CATEGORIES.filter(c => (catCounts[c] ?? 0) > 0);

  const periodLabel = DATE_OPTIONS.find(o => o.key === dateRange)?.label ?? '';
  const fmt0 = (n: number, c: Currency) => formatMoney(n, c, { fractionDigits: 0 });

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (e: Expense) => { setEditing(e); setModalOpen(true); };

  const handleDelete = async (e: Expense) => {
    // Faturalı gider: tek açık pencere (yalnız fatura / fatura + stok).
    if (e.purchase_invoice_id) { setDeleting(e); return; }
    const ok = await confirmAsync(
      autoT('Gideri sil'),
      `"${e.description}" ${autoT('kaydını silmek istediğine emin misin?')}`,
      { confirmText: autoT('Sil'), destructive: true },
    );
    if (!ok) return;
    const { error } = await deleteExpense(e.id);
    if (error) { toast.error(autoT('Silinemedi:') + ' ' + (error as any).message); return; }
    toast.success(autoT('Gider silindi'));
    refetch();
  };

  const deleteLinked = async (revertStock: boolean) => {
    const e = deleting;
    if (!e?.purchase_invoice_id) return;
    setDeleting(null);
    const { error } = await deletePurchaseInvoice(e.purchase_invoice_id, revertStock);
    if (error) { toast.error(autoT('Silinemedi:') + ' ' + (error as any).message); return; }
    toast.success(autoT(revertStock ? 'Fatura silindi + stoğa düşüldü' : 'Fatura silindi (stok korundu)'));
    refetch();
  };

  // Lab bilgisi — Excel raporunun başlığına yansır
  const profile = useAuthStore(s => s.profile);
  const labId = (profile as any)?.lab_id ?? null;
  const [labMeta, setLabMeta] = useState<{ name: string; address?: string | null; phone?: string | null; taxNo?: string | null } | null>(null);
  React.useEffect(() => {
    if (!labId) return;
    (async () => {
      const { data } = await supabase.from('labs').select('name, address, phone, tax_number').eq('id', labId).maybeSingle();
      if (data) setLabMeta({ name: (data as any).name ?? 'Laboratuvar', address: (data as any).address, phone: (data as any).phone, taxNo: (data as any).tax_number });
      else setLabMeta({ name: 'Laboratuvar' });
    })();
  }, [labId]);

  const handleExcel = async () => {
    if (Platform.OS !== 'web') {
      const res = await downloadCsv(
        `Giderler-${new Date().toISOString().slice(0, 10)}`,
        filtered,
        [
          { header: 'Tarih',    value: e => csvDate(e.expense_date) },
          { header: 'Kategori', value: e => EXPENSE_CATEGORY_LABELS[e.category] ?? e.category },
          { header: 'Açıklama', value: e => e.description },
          { header: 'Tutar',    value: e => csvMoney(e.amount) },
          { header: 'Ödeme',    value: e => e.payment_method },
          { header: 'Notlar',   value: e => e.notes ?? '' },
        ],
      );
      if (!res.ok && res.error) toast.error(res.error);
      else toast.success(autoT('CSV indirildi'));
      return;
    }
    const html = buildExpensesReportHtml({
      labName:    labMeta?.name    ?? 'Laboratuvar',
      labAddress: labMeta?.address ?? null,
      labPhone:   labMeta?.phone   ?? null,
      labTaxNo:   labMeta?.taxNo   ?? null,
      periodFrom: filtered.length > 0 ? filtered.reduce((min, e) => e.expense_date < min ? e.expense_date : min, filtered[0].expense_date) : null,
      periodTo:   filtered.length > 0 ? filtered.reduce((max, e) => e.expense_date > max ? e.expense_date : max, filtered[0].expense_date) : null,
      expenses: filtered,
      primaryCurrency: baseCurrency,
    });
    const res = downloadExpensesReport(html, `GiderRaporu-${new Date().toISOString().slice(0, 10)}.xls`);
    if (!res.ok && res.error) toast.error(res.error);
    else toast.success(autoT('Excel raporu indirildi'));
  };

  const rowMenu = (e: Expense): RowMenuItem[] => [
    e.purchase_invoice_id
      ? { key: 'open', label: autoT('Faturayı aç'), icon: ArrowUpRight, onPress: () => openInvoice(e.purchase_invoice_id!) }
      : { key: 'open', label: autoT('Detayı aç'), icon: ArrowUpRight, onPress: () => openExpense(e) },
    { key: 'edit', label: autoT('Düzenle'), icon: Pencil, onPress: () => openEdit(e) },
    { key: 'del',  label: autoT('Sil'),     icon: Trash2, onPress: () => { void handleDelete(e); } },
  ];

  const heroButtons: (RowMenuItem & { primary?: boolean })[] = [
    { key: 'add', label: autoT('Gider ekle'), icon: Plus, primary: true, onPress: openAdd },
    { key: 'buy', label: autoT('Satın alma'), icon: Receipt, onPress: () => { setPurchasePrefill(null); setPurchaseOpen(true); } },
    ...(lucaActive ? [{ key: 'inc', label: autoT('Gelen e-Fatura'), icon: Inbox, onPress: () => setIncomingOpen(true) }] : []),
    { key: 'rec', label: autoT('Otomatik giderler'), icon: Repeat, onPress: () => setRecurringOpen(true) },
    { key: 'xls', label: autoT("Excel'e aktar"), icon: FileSpreadsheet, onPress: () => { void handleExcel(); } },
  ];

  if (invoiceId) {
    return <PurchaseInvoiceDetailScreen invoiceId={invoiceId} onBack={() => { setInvoiceId(null); refetch(); }} />;
  }
  if (detailId) {
    return (
      <ExpenseDetailScreen
        expenseId={detailId}
        onBack={() => { setDetailId(null); refetch(); }}
        onOpenInvoice={(inv) => { setDetailId(null); setInvoiceId(inv); }}
      />
    );
  }

  const deltaTone = delta === null ? null : delta > 0 ? (heroInk.isDark ? '#FCA5A5' : '#B42318') : (heroInk.isDark ? '#6EE7B7' : '#0F6E56');
  const distTotal = catDist.reduce((t, x) => t + x.value, 0);
  const distTop = catDist.slice(0, 4);
  const distOthers = catDist.slice(4).reduce((t, x) => t + x.value, 0);

  return (
    <View style={{ flex: 1, backgroundColor: isEmbedded ? 'transparent' : T.bg, paddingTop: topPad }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={U.ink[300]} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── BEYAZ HERO ─────────────────────────────────────────────
            Dönemin gideri (baş döviz) → sağda önceki döneme göre değişim →
            kategori dağılımı → düğme şeridi. Döviz TOPLANMAZ. */}
        <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 10, paddingBottom: 12 }}>
          <WhiteHero
            kicker={periodLabel}
            accent={theme.primary}
            title={lead ? (
              <>{autoT('Gider')} <Text style={{ color: heroInk.accentInk }}>{fmt0(lead.total, lead.currency)}</Text></>
            ) : autoT('Bu dönemde gider yok')}
            description={`${inPeriod.length} ${autoT('gider kaydı')}`}
            stats={[
              ...(delta !== null && deltaTone ? [{
                value: `${delta > 0 ? '+' : ''}${delta}%`,
                label: autoT(dateRange === 'this_month' ? 'Geçen aya göre' : 'Önceki döneme göre'),
                color: deltaTone,
              }] : []),
              ...(catDist[0] ? [{ value: autoT(EXPENSE_CATEGORY_LABELS[catDist[0].cat]), label: autoT('En büyük kalem') }] : []),
            ]}
            actions={
              <>
                {heroButtons.map((it) => (
                  <Pressable
                    key={it.key}
                    onPress={it.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={it.label}
                    style={({ pressed, hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      height: 36, paddingHorizontal: 14, borderRadius: 999,
                      backgroundColor: it.primary ? U.ink[900] : (hovered ? U.rowHover : U.plainBtn.bg),
                      borderWidth: it.primary ? 0 : 1, borderColor: U.plainBtn.border,
                      opacity: pressed ? 0.8 : 1,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}),
                    })}
                  >
                    {it.icon ? <it.icon size={15} color={it.primary ? U.onDarkPill : U.plainBtn.fg} strokeWidth={1.8} /> : null}
                    <Text style={{ fontSize: 13, fontWeight: '600', color: it.primary ? U.onDarkPill : U.plainBtn.fg }}>{it.label}</Text>
                  </Pressable>
                ))}
              </>
            }
          >
            {rest.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <MoneyMultiX slices={rest} variant="inline" onAccent={heroInk.moneyOnAccent} />
              </View>
            )}
            {lead && distTop.length > 1 && (
              <View style={{ marginTop: 16, gap: 8 }}>
                <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: heroInk.tileBg, gap: 2 }}>
                  {distTop.map(d => <View key={d.cat} style={{ flex: d.value / distTotal, backgroundColor: EXPENSE_CATEGORY_COLORS[d.cat] }} />)}
                  {distOthers > 0 && <View style={{ flex: distOthers / distTotal, backgroundColor: heroInk.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)' }} />}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
                  {distTop.map(d => (
                    <HeroLegend key={d.cat} color={EXPENSE_CATEGORY_COLORS[d.cat]} label={autoT(EXPENSE_CATEGORY_LABELS[d.cat])} value={fmt0(d.value, lead.currency)} />
                  ))}
                  {distOthers > 0 && (
                    <HeroLegend color={heroInk.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)'} label={autoT('Diğer')} value={fmt0(distOthers, lead.currency)} />
                  )}
                </View>
              </View>
            )}
          </WhiteHero>
        </View>

        {/* ── Gider kartı: dönem sekmeleri + arama/kategori/sıralama kartın içinde ── */}
        <View style={{ paddingHorizontal: PAGE_PADDING }}>
          <View style={U.tableCard}>
            <View style={{
              paddingHorizontal: isDesktop ? 20 : 16, paddingTop: isDesktop ? 18 : 14, paddingBottom: 14, gap: 12,
              borderBottomWidth: 1, borderBottomColor: U.hairline,
            }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
                          contentContainerStyle={{ flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: U.ink[100] }}>
                {DATE_OPTIONS.map(o => {
                  const active = dateRange === o.key;
                  return (
                    <Pressable
                      key={o.key}
                      onPress={() => setDateRange(o.key)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      style={{
                        paddingHorizontal: active ? 18 : 12, paddingVertical: 8, borderRadius: 999,
                        backgroundColor: active ? U.segActive : 'transparent',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}),
                      }}
                    >
                      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? U.ink[900] : U.ink[500] }}>
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {dateRange === 'custom' && (
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  <View style={{ flexGrow: 1, flexBasis: 160 }}>
                    <Text style={{ fontSize: 11, color: U.ink[500], marginBottom: 6 }}>Başlangıç</Text>
                    <DatePicker value={customFrom} onChange={setCustomFrom} placeholder="Seç" />
                  </View>
                  <View style={{ flexGrow: 1, flexBasis: 160 }}>
                    <Text style={{ fontSize: 11, color: U.ink[500], marginBottom: 6 }}>Bitiş</Text>
                    <DatePicker value={customTo} onChange={setCustomTo} placeholder="Seç" />
                  </View>
                </View>
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', rowGap: 8 }}>
                <View style={{
                  flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 180,
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  height: 40, paddingHorizontal: 14, borderRadius: 9999,
                  borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
                }}>
                  <Search size={14} color={U.ink[400]} strokeWidth={1.8} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Açıklama, sipariş no ara"
                    placeholderTextColor={U.ink[400]}
                    style={{ flex: 1, fontSize: 13.5, color: U.ink[900], ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
                  />
                  {search.length > 0 && (
                    <Pressable onPress={() => setSearch('')} accessibilityLabel={autoT('Aramayı temizle')} style={{ cursor: 'pointer' as any }}>
                      <X size={13} color={U.ink[400]} strokeWidth={2} />
                    </Pressable>
                  )}
                </View>
                {usedCats.length > 1 && (
                  <FilterMenu
                    label={autoT('Kategori')}
                    items={[
                      { key: 'all', label: autoT('Tümü') },
                      ...usedCats.map(c => ({ key: c, label: `${autoT(EXPENSE_CATEGORY_LABELS[c])} · ${catCounts[c] ?? 0}` })),
                    ]}
                    active={catFilter}
                    onChange={(k) => setCatFilter(k as typeof catFilter)}
                  />
                )}
                <FilterMenu
                  label={autoT('Sırala')}
                  items={[
                    { key: 'date_desc',   label: autoT('En yeni') },
                    { key: 'date_asc',    label: autoT('En eski') },
                    { key: 'amount_desc', label: autoT('Tutar (yüksek)') },
                    { key: 'amount_asc',  label: autoT('Tutar (düşük)') },
                  ]}
                  active={sortKey}
                  onChange={(k) => setSortKey(k as ExpSortKey)}
                />
              </View>
            </View>

            {loading && filtered.length === 0 ? (
              <View style={{ paddingVertical: 64, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: U.ink[400] }}>Yükleniyor…</Text>
              </View>
            ) : filtered.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 16, gap: 12 }}>
                <Inbox size={36} strokeWidth={1.4} color={U.ink[300]} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }}>
                  {search || catFilter !== 'all' ? 'Sonuç bulunamadı' : 'Bu dönemde gider yok'}
                </Text>
                <Text style={{ fontSize: 13, color: U.ink[400], textAlign: 'center', maxWidth: 320, lineHeight: 19 }}>
                  {search || catFilter !== 'all' ? 'Arama veya filtre kriterlerini değiştirin.' : 'Başka bir dönem seçin ya da yeni gider ekleyin.'}
                </Text>
              </View>
            ) : (
              <>
                {isDesktop ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: U.hairline }}>
                    <Text style={{ ...colHeader(U), flex: 1 }}>Gider</Text>
                    <Text style={{ ...colHeader(U), width: COL.date }}>Tarih</Text>
                    <Text style={{ ...colHeader(U), width: COL.amt, textAlign: 'right' }}>Tutar</Text>
                    <View style={{ width: COL.menu }} />
                  </View>
                ) : null}
                {filtered.map((e, i) => (
                  <ExpenseRow
                    key={e.id}
                    expense={e}
                    desktop={isDesktop}
                    isLast={i === filtered.length - 1}
                    menu={rowMenu(e)}
                    onPress={() => openExpense(e)}
                  />
                ))}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
                  paddingHorizontal: isDesktop ? 20 : 16, paddingVertical: 12,
                  borderTopWidth: 1, borderTopColor: U.hairline, backgroundColor: U.surfaceSoft,
                  borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
                }}>
                  <Text style={{ fontSize: 12, color: U.ink[500] }}>{`${filtered.length} ${autoT('kayıt')}`}</Text>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    {listByCcy.map(d => (
                      <Text key={d.currency} style={{ fontSize: 12, color: U.ink[500], fontVariant: ['tabular-nums'] }}>
                        {`${autoT('Toplam')} `}<Text style={{ fontWeight: '700', color: U.ink[900] }}>{fmt0(d.total, d.currency)}</Text>
                      </Text>
                    ))}
                  </View>
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <RecurringExpensesPanel
        visible={recurringOpen}
        onClose={() => setRecurringOpen(false)}
        onAfterGenerate={() => refetch()}
      />

      <PurchaseFormModal
        visible={purchaseOpen}
        accentColor="#DC2626"
        prefill={purchasePrefill}
        onClose={() => { setPurchaseOpen(false); setPurchasePrefill(null); }}
        onSaved={() => { setPurchaseOpen(false); setPurchasePrefill(null); refetch(); }}
      />

      <IncomingEFaturaModal
        visible={incomingOpen}
        onClose={() => setIncomingOpen(false)}
        onPick={(p) => { setIncomingOpen(false); setPurchasePrefill(p); setPurchaseOpen(true); }}
      />

      <ExpenseFormModal
        visible={modalOpen}
        expense={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); refetch(); }}
      />

      <LinkedDeleteDialog
        expense={deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={(revert) => { void deleteLinked(revert); }}
      />
    </View>
  );
}

// ─── Satır (masaüstü: sütunlu · mobil: iki kolonlu) ─────────────────
const COL = { date: 170, amt: 140, menu: 36 };

function colHeader(U: ReturnType<typeof useInkUI>) {
  return { fontSize: 10, fontWeight: '600' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: U.ink[500] };
}

function ExpenseRow({ expense: e, desktop, isLast, menu, onPress }: {
  expense: Expense; desktop: boolean; isLast: boolean; menu: RowMenuItem[]; onPress: () => void;
}) {
  const U = useInkUI();
  const Icon = CAT_ICON[e.category];
  const { title, sub } = splitDescription(e);
  const pay = PAY_METHODS.find(m => m.v === e.payment_method)?.l ?? e.payment_method;
  const money = formatMoney(Number(e.amount) || 0, ((e.currency ?? 'TRY') as Currency), { fractionDigits: 2 });
  const catLabel = autoT(EXPENSE_CATEGORY_LABELS[e.category]);

  const menuBtn = (
    <AnchorMenu
      width={220}
      items={menu}
      renderTrigger={(open) => (
        <Pressable
          onPress={(ev: any) => { ev?.stopPropagation?.(); open(); }}
          accessibilityRole="button"
          accessibilityLabel={autoT('Gider işlemleri')}
          style={({ pressed, hovered }: any) => ({
            width: desktop ? 32 : 44, height: desktop ? 32 : 44, borderRadius: 999,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: hovered || pressed ? U.rowHover : 'transparent',
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          })}
        >
          <MoreHorizontal size={16} color={U.ink[500]} strokeWidth={1.8} />
        </Pressable>
      )}
    />
  );

  const icon = (
    <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: U.ink[100] }}>
      <Icon size={15} color={U.ink[700]} strokeWidth={1.8} />
    </View>
  );

  const invoiceTag = e.purchase_invoice_id ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 999, backgroundColor: U.chipTones.info.bg }}>
      <FileText size={9} color={U.chipTones.info.fg} strokeWidth={2} />
      <Text style={{ fontSize: 9.5, fontWeight: '700', color: U.chipTones.info.fg }}>{autoT('Fatura')}</Text>
    </View>
  ) : null;

  if (!desktop) {
    return (
      <Pressable
        onPress={onPress}
        style={rowStyle(({ pressed }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingStart: 16, paddingEnd: 6, paddingVertical: 12,
          borderBottomWidth: isLast ? 0 : 1, borderBottomColor: U.hairline,
          backgroundColor: pressed ? U.rowHover : 'transparent',
        }))}
      >
        {icon}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{title}</Text>
          <Text style={{ fontSize: 11.5, color: U.ink[400] }} numberOfLines={1}>{`${catLabel} · ${fmtDate(e.expense_date)}`}</Text>
        </View>
        <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900], fontVariant: ['tabular-nums'] }}>{money}</Text>
        {menuBtn}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={rowStyle(({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingStart: 20, paddingEnd: 14, paddingVertical: 12,
        borderBottomWidth: isLast ? 0 : 1, borderBottomColor: U.hairline,
        backgroundColor: hovered ? U.rowHover : 'transparent',
        cursor: 'pointer' as any,
      }))}
    >
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {icon}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: U.ink[900], flexShrink: 1 }} numberOfLines={1}>{title}</Text>
            {invoiceTag}
          </View>
          <Text style={{ fontSize: 11.5, color: U.ink[400] }} numberOfLines={1}>{sub ? `${catLabel} · ${sub}` : catLabel}</Text>
        </View>
      </View>
      <View style={{ width: COL.date, gap: 2 }}>
        <Text style={{ fontSize: 12.5, color: U.ink[700] }}>{fmtDate(e.expense_date)}</Text>
        <Text style={{ fontSize: 11, color: U.ink[400] }} numberOfLines={1}>{autoT(pay)}</Text>
      </View>
      <Text style={{ width: COL.amt, textAlign: 'right', fontSize: 14, fontWeight: '600', color: U.ink[900], fontVariant: ['tabular-nums'] }}>{money}</Text>
      {menuBtn}
    </Pressable>
  );
}

function HeroLegend({ color, label, value }: { color: string; label: string; value: string }) {
  const heroInk = useWhiteHeroInk();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 280 }}>
      <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 11.5, color: heroInk.inkSoft, flexShrink: 1 }} numberOfLines={1}>{label}</Text>
      <Text style={{ fontSize: 11.5, fontWeight: '700', color: heroInk.ink }}>{value}</Text>
    </View>
  );
}

/**
 * Satın alma faturasından doğan gideri silme — TEK açık pencere.
 * Eski akış art arda iki tarayıcı confirm'i açıyor ve "TAMAM = stoktan düş,
 * İPTAL = düşme" gibi anlamı belirsiz düğmelere dayanıyordu.
 */
function LinkedDeleteDialog({ expense, onCancel, onConfirm }: {
  expense: Expense | null; onCancel: () => void; onConfirm: (revertStock: boolean) => void;
}) {
  const U = useInkUI();
  const [revert, setRevert] = useState(false);
  useEffect(() => { if (expense) setRevert(false); }, [expense]);
  return (
    <Modal visible={!!expense} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={U.modalOverlay}>
        <View style={{ ...U.modalCard, maxWidth: 440, width: '100%', padding: 22, gap: 14 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: U.ink[900] }}>Faturalı gideri sil</Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: U.ink[500] }}>
            {`"${expense?.description ?? ''}" ${autoT('satın alma faturasından oluşmuş bir gider. Silinirse fatura kaydı, cari hesap hareketi ve bu gider birlikte silinir.')}`}
          </Text>
          <Pressable
            onPress={() => setRevert(v => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: revert }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12,
              borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}
          >
            <View style={{
              width: 18, height: 18, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
              borderWidth: revert ? 0 : 1.5, borderColor: U.ink[300], backgroundColor: revert ? U.ink[900] : 'transparent',
            }}>
              {revert ? <Check size={12} color={U.onDarkPill} strokeWidth={2.4} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>Stoğu da geri al</Text>
              <Text style={{ fontSize: 11.5, color: U.ink[400] }}>Faturayla eklenen ürünler stoktan düşülür</Text>
            </View>
          </Pressable>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <Pressable onPress={onCancel} style={{ height: 40, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center', borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg, cursor: 'pointer' as any }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>Vazgeç</Text>
            </Pressable>
            <Pressable onPress={() => onConfirm(revert)} style={{ height: 40, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center', backgroundColor: '#D94B4B', cursor: 'pointer' as any }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Sil</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}


// ═════════════════════════════════════════════════════════════════════
// FORM MODAL — §08 dialog + §05.5 form
// ═════════════════════════════════════════════════════════════════════
export function ExpenseFormModal({
  visible, expense, onClose, onSaved, accentColor = '#DC2626',
}: { visible: boolean; expense: Expense | null; onClose: () => void; onSaved: () => void; accentColor?: string }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const [category, setCategory] = useState<ExpenseCategory>('kira');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [rate, setRate] = useState('');   // manuel kur (boş = o günün TCMB'si)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  // Yeni giderde yöntem bilerek boş gelir (nakit kasaya yanlışlıkla havale düşmesin) — madde 8
  const [method, setMethod] = useState<ExpensePaymentMethod | null>(null);
  const [methodErr, setMethodErr] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // PDF Fatura okuma — kullanıcı dilerse PDF yükleyip form'u otomatik doldurabilir
  const [parsing, setParsing] = useState(false);
  const [parseInfo, setParseInfo] = useState<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      setCategory(expense?.category ?? 'kira');
      setDescription(expense?.description ?? '');
      setAmount(expense ? String(expense.amount) : '');
      setCurrency(((expense as any)?.currency as any) ?? 'TRY');
      setRate(expense && (expense as any).rate_at_time && (expense as any).currency !== 'TRY' ? String((expense as any).rate_at_time) : '');
      setDate(expense?.expense_date ?? new Date().toISOString().slice(0, 10));
      setMethod(expense?.payment_method ?? null);
      setMethodErr(false);
      setNotes(expense?.notes ?? '');
      setError('');
      setParseInfo(null);
      setParsing(false);
    }
  }, [visible, expense]);

  const handleParsePdf = async (file: File) => {
    // App Store 5.1.2(i): kişisel veri Claude'a gitmeden ÖNCE açık izin.
    if (!(await ensureAiConsent())) return;
    setError(''); setParseInfo(null); setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      const pdf_base64 = btoa(binary);
      const { data, error: fnErr } = await supabase.functions.invoke('parse-invoice', { body: { pdf_base64 } });
      if (fnErr) throw new Error(fnErr.message);
      if (!data?.ok) throw new Error(data?.error ?? 'Parse başarısız');
      const d = data.data;

      // ─── Sarf / demirbaş faturası tespiti ───
      // Eğer parse edilen veride birden fazla ürün kalemi (quantity + unit_price'lı) varsa
      // veya herhangi bir kalem 'equipment' olarak işaretlenmişse → bu fatura buraya değil.
      const hasQuantifiedLines = Array.isArray(d.lines) && d.lines.filter((l: any) => {
        const q = Number(l.quantity ?? 0);
        const p = Number(l.unit_price ?? 0);
        return q > 0 && p > 0;
      }).length >= 1;
      const hasEquipmentLine = Array.isArray(d.lines) && d.lines.some(
        (l: any) => String(l.item_kind ?? '').toLowerCase() === 'equipment',
      );
      if (hasEquipmentLine || (hasQuantifiedLines && Array.isArray(d.lines) && d.lines.length >= 1)) {
        const kindLabel = hasEquipmentLine ? 'Demirbaş' : 'Sarf malzeme';
        setError(
          `Bu PDF ${kindLabel.toLowerCase()} faturasına benziyor (${d.lines.length} kalem tespit edildi). ` +
          `Bu form genel giderler içindir — sarf/demirbaş için "Stok › Satın Alma" akışını kullanın.`,
        );
        setParsing(false);
        return;
      }

      // Form alanlarını doldur — genel gider yaklaşımı
      // Açıklama: supplier + invoice no birleştir
      const desc = [d.supplier_name, d.invoice_number ? `#${d.invoice_number}` : null]
        .filter(Boolean).join(' ').trim();
      if (desc) setDescription(desc);
      // Tarih
      if (d.invoice_date) setDate(d.invoice_date);
      // Para birimi
      if (d.currency && ['TRY', 'EUR', 'USD', 'GBP', 'IRT'].includes(d.currency)) {
        setCurrency(d.currency);
      }
      // Toplam tutar — KDV dahil tercih
      const total = d.total ?? (
        d.subtotal != null && d.vat_amount != null
          ? Number(d.subtotal) + Number(d.vat_amount)
          : d.subtotal
      );
      if (total != null) setAmount(String(total));
      // Notlar — kalemleri özetle
      if (Array.isArray(d.lines) && d.lines.length > 0) {
        const summary = d.lines
          .map((l: any) => `${l.item_name ?? '—'}${l.quantity ? ` × ${l.quantity}` : ''}`)
          .slice(0, 10)
          .join('\n');
        setNotes(prev => prev ? prev : summary);
      }

      setParseInfo(data.source === 'efatura'
        ? 'e-Fatura XML parse edildi'
        : `OCR ile çıkarıldı${d.lines?.length ? ` (${d.lines.length} kalem)` : ''}`);
    } catch (e: any) {
      setError('PDF işlenemedi: ' + (e?.message ?? 'bilinmeyen hata'));
    } finally {
      setParsing(false);
    }
  };

  const handlePickPdf = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) handleParsePdf(f);
    };
    input.click();
  };

  const handleSave = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!description.trim()) { setError('Açıklama zorunlu'); return; }
    if (!amt || amt <= 0)    { setError('Geçerli bir tutar girin'); return; }
    if (!method) { setMethodErr(true); return; }

    // Sarf malzeme veya demirbaş faturası kontrolü — sadece YENİ kayıtta sor
    // (mevcut linked kayıtların düzenlenmesinde tekrar sormaya gerek yok)
    if (!expense && (category === 'malzeme' || category === 'ekipman')) {
      const label = category === 'malzeme' ? 'Sarf malzeme' : 'Demirbaş';
      const ok = Platform.OS === 'web'
        ? (typeof window !== 'undefined' && window.confirm(
            `${label} faturalarının doğru yeri "Stok › Satın Alma" akışıdır.\n\n` +
            `Oradan girersen stok hareketi, tedarikçi cari hesabı ve gider kaydı otomatik birlikte oluşur.\n\n` +
            `Yine de bu formdan kaydetmek istediğinden emin misin?`,
          ))
        : await new Promise<boolean>((resolve) => {
            Alert.alert(
              `${label} ${autoT('faturası mı?')}`,
              'Doğru yer "Stok › Satın Alma" akışıdır. Yine de buradan kaydetmek istediğine emin misin?',
              [
                { text: 'Vazgeç',  style: 'cancel',      onPress: () => resolve(false) },
                { text: 'Yine de kaydet', style: 'destructive', onPress: () => resolve(true) },
              ],
              { cancelable: true, onDismiss: () => resolve(false) },
            );
          });
      if (!ok) return;
    }

    setSaving(true); setError('');
    const manualRate = currency !== 'TRY' && rate.trim() ? Number(rate.replace(',', '.')) : undefined;
    const params: CreateExpenseParams = {
      category, description: description.trim(), amount: amt,
      currency,
      rate: manualRate && manualRate > 0 ? manualRate : undefined,
      expense_date: date, payment_method: method, notes: notes.trim() || undefined,
    };
    const { error: apiErr } = expense
      ? await updateExpense(expense.id, params)
      : await createExpense(params);
    setSaving(false);
    if (apiErr) { setError((apiErr as any).message ?? 'Hata oluştu'); return; }
    onSaved();
  };

  // Patterns §13 form tokens
  const DisplayFontFamily = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';
  const sectionEyebrow: any = { fontSize: 10, fontWeight: '700', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 };
  const sectionSubtitle: any = { fontSize: 11, color: T.ink3, fontWeight: '400', marginBottom: 14 };
  const fieldLabel: any = { fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 7 };
  const cleanInput: any = { backgroundColor: T.cardSoft, borderRadius: 12, borderWidth: 1, borderColor: T.hairline, paddingHorizontal: 14, height: 44, fontSize: 14, color: T.ink, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          backgroundColor: T.card, borderRadius: 24, width: 560, maxWidth: '100%', maxHeight: '92%',
          overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.22)' } as any : {}),
        }}>
          {/* Header — Patterns §13 */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 24, paddingBottom: 18, gap: 16 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 22,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: accentColor + '14',
                borderWidth: 1, borderColor: accentColor + '22',
              }}>
                <Receipt size={20} color={accentColor} strokeWidth={1.6} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  {expense ? 'Gider düzenle' : 'Yeni gider'}
                </Text>
                <Text style={{ fontFamily: DisplayFontFamily, fontWeight: '300', fontSize: 26, letterSpacing: -0.6, color: T.ink, lineHeight: 32, marginTop: 2 }} numberOfLines={1}>
                  {expense ? (description || 'Gider') : 'Genel gider kaydı'}
                </Text>
                <Text style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>
                  Kira, personel, ekipman, vergi vb. operasyonel giderler için.
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={{
                width: 36, height: 36, borderRadius: 18,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: T.card,
                borderWidth: 1, borderColor: T.hairline,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <X size={15} color={T.ink2} strokeWidth={1.8} />
            </Pressable>
          </View>

          <View style={{ height: 1, backgroundColor: T.hairline2, marginHorizontal: 28 }} />

          <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 22, paddingBottom: 22 }} showsVerticalScrollIndicator={false}>

            {/* ── Üst uyarı / hata banner — form en üstünde görünür ── */}
            {error ? (
              <View style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                padding: 14, marginBottom: 18, borderRadius: 12,
                backgroundColor: '#FEE2E2',
                borderWidth: 1, borderColor: '#FCA5A5',
              }}>
                <View style={{
                  width: 22, height: 22, borderRadius: 11, marginTop: 1,
                  alignItems: 'center', justifyContent: 'center', backgroundColor: '#DC2626',
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>!</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#991B1B', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    Uyarı
                  </Text>
                  <Text style={{ fontSize: 12.5, color: '#7F1D1D', lineHeight: 18, fontWeight: '500' }}>
                    {error}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setError('')}
                  hitSlop={6}
                  style={{
                    width: 22, height: 22, borderRadius: 6,
                    alignItems: 'center', justifyContent: 'center',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <X size={13} color="#7F1D1D" strokeWidth={2} />
                </Pressable>
              </View>
            ) : null}

            {/* ── PDF Fatura → Otomatik doldur (sadece web) ── */}
            {Platform.OS === 'web' && (
              <View style={{ marginBottom: 18 }}>
                <Pressable
                  onPress={handlePickPdf}
                  disabled={parsing}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 8, paddingVertical: 11, paddingHorizontal: 14,
                    borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
                    borderColor: accentColor + '55',
                    backgroundColor: accentColor + '08',
                    opacity: parsing ? 0.6 : 1,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <FileUp size={15} color={accentColor} strokeWidth={1.8} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: accentColor }}>
                    {parsing ? 'Fatura işleniyor…' : 'PDF Faturayı Yükle (otomatik doldur)'}
                  </Text>
                  {!parsing && <Sparkles size={13} color={accentColor} strokeWidth={1.8} />}
                </Pressable>
                {parseInfo ? (
                  <View style={{
                    marginTop: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
                    backgroundColor: 'rgba(16,185,129,0.08)',
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                  }}>
                    <Check size={12} color="#0F6E50" strokeWidth={2} />
                    <Text style={{ fontSize: 11, color: '#0F6E50', fontWeight: '600' }}>{parseInfo}</Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* ── KATEGORİ ── */}
            <Text style={sectionEyebrow}>Kategori</Text>
            <Text style={sectionSubtitle}>
              Sarf malzeme & demirbaş faturaları için "Stok › Satın Alma" akışını kullan; bu form sadece operasyonel giderler içindir.
            </Text>
            <View style={{ marginBottom: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {/* Mevcut kategori malzeme/ekipman ise (eski kayıt düzenleme) listede tut */}
              {(FORM_CATEGORIES.includes(category) ? FORM_CATEGORIES : [category, ...FORM_CATEGORIES]).map(cat => {
                const active = category === cat;
                const Icon = CAT_ICON[cat];
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999,
                      borderWidth: 1,
                      borderColor: active ? accentColor : T.hairline,
                      backgroundColor: active ? accentColor : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <Icon size={12} color={active ? '#FFF' : T.ink2} strokeWidth={1.8} />
                    <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? '#FFF' : T.ink2 }}>
                      {EXPENSE_CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ height: 1, backgroundColor: T.hairline2, marginBottom: 22 }} />

            {/* ── AÇIKLAMA & TUTAR ── */}
            <Text style={sectionEyebrow}>Detay</Text>
            <Text style={sectionSubtitle}>Açıklama, tutar ve tarih</Text>
            <View style={{ marginBottom: 22, gap: 12 }}>
              <View>
                <Text style={fieldLabel}>Açıklama *</Text>
                <TextInput
                  style={cleanInput}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="örn. Mart kira, internet faturası…"
                  placeholderTextColor={T.ink3}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                <View style={{ flex: 1.4, minWidth: 220 }}>
                  <Text style={fieldLabel}>Tutar *</Text>
                  <MoneyInput
                    value={amount}
                    onChangeValue={setAmount}
                    currency={currency}
                    onChangeCurrency={setCurrency}
                    accentColor={accentColor}
                    placeholder="0,00"
                    showBasePreview
                  />
                </View>
                <View style={{ flex: 1, minWidth: 180 }}>
                  <Text style={fieldLabel}>Tarih</Text>
                  <DatePicker value={date} onChange={setDate} placeholder="Tarih seç" />
                </View>
              </View>
              {currency !== 'TRY' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={fieldLabel}>Kur — 1 {currency} = {baseSymbol()}?</Text>
                  <TextInput
                    value={rate}
                    onChangeText={setRate}
                    keyboardType="decimal-pad"
                    placeholder="Boş bırak = o günün TCMB kuru"
                    placeholderTextColor={T.ink3}
                    style={{ borderWidth: 1, borderColor: T.hairline, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: T.ink, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
                  />
                  {rate.trim() ? (
                    <Text style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>
                      ≈ {baseSymbol()}{((parseFloat(amount.replace(',', '.')) || 0) * (Number(rate.replace(',', '.')) || 0)).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>

            <View style={{ height: 1, backgroundColor: T.hairline2, marginBottom: 22 }} />

            {/* ── ÖDEME ── */}
            <Text style={sectionEyebrow}>Ödeme</Text>
            <Text style={sectionSubtitle}>Hangi yöntemle ödendi</Text>
            <View style={{ marginBottom: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {PAY_METHODS.map(m => {
                const active = method === m.v;
                return (
                  <Pressable
                    key={m.v}
                    onPress={() => { setMethod(m.v); setMethodErr(false); }}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999,
                      borderWidth: 1,
                      borderColor: active ? accentColor : T.hairline,
                      backgroundColor: active ? accentColor : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? '#FFF' : T.ink2 }}>
                      {m.l}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ height: 1, backgroundColor: T.hairline2, marginBottom: 22 }} />

            {/* ── NOT ── */}
            <Text style={sectionEyebrow}>Not</Text>
            <Text style={sectionSubtitle}>Hatırlatma, fatura no, referans (opsiyonel)</Text>
            <View>
              <TextInput
                style={[cleanInput, { height: 72, paddingTop: 11, paddingBottom: 11, textAlignVertical: 'top' }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Açıklama / not"
                placeholderTextColor={T.ink3}
                multiline
              />
            </View>

            {/* (Hata banner'ı artık form üstünde görünüyor) */}
          </ScrollView>

          {/* Footer — Patterns §13 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 28, paddingVertical: 18, borderTopWidth: 1, borderTopColor: T.hairline2, backgroundColor: isDark ? T.cardSoft : '#FBF9F4' }}>
            {methodErr ? (
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: isDark ? '#F3A0A0' : '#9C2E2E' }}>{autoT('Ödeme yöntemini seçin')}</Text>
            ) : (
              <Text style={{ flex: 1, fontSize: 11, color: T.ink3, fontStyle: 'italic' }}>
                Yabancı para birimi seçilirse o günün kuru ile snapshot alınır.
              </Text>
            )}
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={{
                paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999,
                backgroundColor: T.card,
                borderWidth: 1, borderColor: T.hairline,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '500', color: T.ink2 }}>Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 20, paddingVertical: 11, borderRadius: 9999,
                backgroundColor: accentColor, opacity: saving ? 0.5 : 1,
                ...(Platform.OS === 'web' ? { cursor: saving ? 'wait' : 'pointer', boxShadow: `0 6px 20px ${accentColor}44` } as any : {}),
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF', letterSpacing: 0.2 }}>
                {saving ? 'Kaydediliyor…' : expense ? 'Güncelle' : 'Kaydet'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Pill button ─────────────────────────────────────────────────────
function PillBtn({ icon: Icon, label, onPress, variant = 'dark', onHero, heroAccent }: {
  icon: React.ComponentType<any>; label: string; onPress: () => void;
  variant?: 'dark' | 'ghost';
  onHero?: boolean;
  heroAccent?: string;
}) {
  // Her bileşen KENDİ hook'unu alır (prop ile geçirilmez).
  const U = useInkUI();
  const dark = variant === 'dark';
  let bg: string; let fg: string;
  let borderColor: string = U.ink[200];
  let borderWidth = dark ? 0 : 1;
  if (onHero) {
    // Kanonik hero: birincil kapsül düz (beyaz→plainBtn) zemin, ikincil
    // yarı saydam beyaz. Hero zemini accent/lacivert olduğu için ikincil
    // kapsülün beyaz metni her iki temada da kalır (CLAUDE.md istisnası).
    // Hero artık "beyaz hero": açık temada yüzey AÇIK, koyu temada lacivert.
    // İkincil kapsülün sabit beyaz metni açık temada kayboluyordu.
    if (dark) { bg = U.isDark ? U.plainBtn.bg : (heroAccent ?? U.ink[900]); fg = U.isDark ? U.ink[900] : '#FFFFFF'; borderWidth = 0; }
    else if (U.isDark) { bg = 'rgba(255,255,255,0.16)'; fg = '#FFFFFF'; borderColor = 'transparent'; borderWidth = 0; }
    else { bg = 'rgba(255,255,255,0.75)'; fg = U.ink[900]; borderColor = 'rgba(255,255,255,0.95)'; borderWidth = 1; }
  } else {
    bg = dark ? U.ink[900] : 'transparent';
    fg = dark ? U.onDarkPill : U.ink[700];
  }
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999,
        backgroundColor: bg, borderWidth, borderColor,
        cursor: 'pointer' as any,
      }}
    >
      <Icon size={13} color={fg} strokeWidth={onHero && dark ? 2.2 : 1.8} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: fg }}>{label}</Text>
    </Pressable>
  );
}

// ─── Form helpers ────────────────────────────────────────────────────
function FL({ children }: { children: string }) {
  const T = useMobileTokens();
  return (
    <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: T.ink3 }}>
      {children}
    </Text>
  );
}

function FI(props: any) {
  const T = useMobileTokens();
  const { style: extra, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={T.ink3}
      {...rest}
      style={[{
        height: 44, paddingHorizontal: 14, borderRadius: 14,
        borderWidth: 1, borderColor: T.hairline, backgroundColor: T.cardSoft,
        fontSize: 14, color: T.ink, outline: 'none' as any,
      }, extra]}
    />
  );
}

export default ExpensesScreen;
