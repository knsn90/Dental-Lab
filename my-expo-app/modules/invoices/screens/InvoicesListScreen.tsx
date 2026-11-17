import { localeTag } from '../../../core/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navBarMetrics } from '../../../core/ui/mobile/navGlass';
/**
 * InvoicesListScreen — Fatura Yönetimi (Patterns Design Language)
 *
 * KPI hero kartları, durum filtreleri, arama, fatura listesi,
 * toplu fatura ve toplu tahsilat modalleri.
 * cardSolid, DISPLAY font, DS tokens, CHIP_TONES, Lucide icons.
 */
import React, { useEffect, useMemo, useState, useContext } from 'react';
import {
  View, Text, ScrollView, Pressable, RefreshControl,
  TextInput, Modal, ActivityIndicator, useWindowDimensions, Platform,
} from 'react-native';
import {
  FileText, Search, X, ChevronDown, MoreHorizontal, Printer, Bell, Clock,
  Banknote, Building2,
  Calendar, Layers, Receipt, CircleCheck, CircleX, Inbox,
  CreditCard, Landmark, File, Check, Hand,
  DollarSign, Users,
} from '../../../core/ui/icons';
import { toast } from '../../../core/ui/Toast';
import { useRouter, useSegments } from 'expo-router';
import { CURRENCY_META, type Currency } from '../../../core/money/currency';
import { type CurrencyTotal, groupByCurrency } from '../../../core/money/aggregations';

import { HubContext } from '../../../core/ui/HubContext';
import { InvoiceDetailScreen, PaymentModal } from './InvoiceDetailScreen';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { useInkUI, type InkUI } from '../../../core/theme/inkScale';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { AnchorMenu } from '../components/AnchorMenu';
import { SendReminderModal } from '../../finance-clinic/components/SendReminderModal';
import { printInvoice } from '../printInvoice';
import { useInvoices, useInvoiceStats, useUnbilledWorkOrders } from '../hooks/useInvoices';
import { createBulkInvoice, bulkRecordPayment, fetchInvoiceById } from '../api';
import {
  INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS,
  type InvoiceStatus, type Invoice, type UnbilledWorkOrder,
} from '../types';
import { useClinics } from '../../clinics/hooks/useClinics';
import { downloadCsv, csvMoney, csvDate } from '../../../core/util/csvExport';
import { periodRange, inPeriod, type InvoicePeriod } from '../periodRange';
import { InvoicePeriodFilter } from '../components/InvoicePeriodFilter';
import { normalizeDoctorName } from '../../../core/utils/textCase';
import { autoT } from '../../../core/i18n/autoTranslate';
import { BulkEFaturaModal } from '../../efatura/components/BulkEFaturaModal';
import { BulkEFaturaList } from '../../efatura/components/BulkEFaturaList';
import { getActiveProvider } from '../../efatura/providers';
import { useLabToday } from '../../../core/metrics/useLabToday';
import { isInvoiceOverdue } from '../../../core/metrics/invoiceDefs';
// Durum renkleri, biçimleyiciler, e-Fatura rozeti — mobil fatura tablosuyla ortak
import { chipTones, statusChip, fmtMoney, fmtDate, EFaturaBadge } from '../lib/invoiceListDisplay';
import { InvoiceDiscountField } from '../components/InvoiceDiscountField';
import {
  validateInvoiceDiscount, invoiceTotalsWithDiscount, invoiceDiscountRpcError, type InvoiceDiscountType,
} from '../lib/invoiceDiscount';

// ── Patterns tokens ─────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

function modalShadowOf(U: InkUI) {
  return U.isDark ? '0 24px 48px -12px rgba(0,0,0,0.65)' : '0 24px 48px -12px rgba(0,0,0,0.18)';
}

/** Liste sekmeleri. "Açık" = kesildi + kısmi (vadesi geçmemiş); "Gecikmiş" ayrı — ikisi örtüşmez. */
type Seg = 'all' | 'taslak' | 'open' | 'overdue' | 'odendi' | 'iptal' | 'toplu_efatura';
function segOf(inv: Invoice, today: string): Exclude<Seg, 'all' | 'toplu_efatura'> {
  if (inv.status === 'taslak') return 'taslak';
  if (inv.status === 'odendi') return 'odendi';
  if (inv.status === 'iptal') return 'iptal';
  return isInvoiceOverdue(inv, today) ? 'overdue' : 'open';
}

// ── Helpers ─────────────────────────────────────────────────────────
/** Faturalanmamış siparişin para birimi → tutar çiftleri (büyükten küçüğe).
 *  View'ın totals_by_currency'si yoksa (migration öncesi) estimated_total'a düşer. */
function ccyPairs(order: any): Array<[string, number]> {
  const map = (order?.totals_by_currency ?? null) as Record<string, any> | null;
  const pairs = map
    ? Object.entries(map).map(([c, v]) => [c, Number(v) || 0] as [string, number])
    : [['TRY', Number(order?.estimated_total) || 0] as [string, number]];
  return pairs.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
}


// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function InvoicesListScreen() {
  const U = useInkUI();
  const CHIP_TONES = chipTones(U);
  const STATUS_CHIP = statusChip(U);
  const router = useRouter();
  // Aktif panel grubu — faturaya o panelin route'undan git (lab'a zorlama yok,
  // panel teması korunur). Örn admin finans → /(admin)/invoice/...
  const segments = useSegments();
  const panelBase = String(segments?.[0] ?? '(lab)');
  const panelTheme = usePanelTheme();
  // Hero zemin tonu panel accent'inden (WhiteHero).
  const tblAccent = panelTheme.primary;
  const heroInk = useWhiteHeroInk(tblAccent);
  const invoiceHref = (id: string) => `/${panelBase}/invoice/${id}`;
  /**
   * Fatura hub içinde açılır — ayrı route'a gitmek finans kenar çubuğunu
   * kaybettiriyor ve geri dönüldüğünde liste/filtre sıfırlanıyordu.
   */
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  // Ayrı Hasta sütunu yalnız geniş ekranda; dar masaüstünde hasta kurum satırının altına iner.
  const wideTable = width >= 1360;
  const insets = useSafeAreaInsets();
  const isEmbedded = useContext(HubContext);
  const openInvoice = (id: string) => {
    if (isEmbedded) setOpenInvoiceId(id);
    else router.push(`/${panelBase}/invoice/${id}` as any);
  };

  // 'toplu_efatura' = durum filtresi değil, ayrı görünüm: aynı ETTN'li fatura grupları (BulkEFaturaList).
  const [statusFilter, setStatusFilter] = useState<Seg>('all');
  const bulkView = statusFilter === 'toplu_efatura';
  const [search, setSearch] = useState('');
  // Dönem (kesim tarihi) — muhasebeciye ay sonu dışa aktarımı / Luca listesiyle karşılaştırma
  const [period, setPeriod] = useState<{ p: InvoicePeriod; from: string | null; to: string | null }>({ p: 'all', from: null, to: null });
  // Resmi e-faturası olmayan (kesilmesi gereken) faturalar — yalnız Luca aktifken
  const [noEFaturaOnly, setNoEFaturaOnly] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [bulkEfOpen, setBulkEfOpen] = useState(false);
  const [bulkEfKey, setBulkEfKey] = useState(0);
  // Satır "⋯" işlemleri
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);
  const [remindTarget, setRemindTarget] = useState<Invoice | null>(null);
  const [printBusy, setPrintBusy] = useState<string | null>(null);
  // Toplu e-Fatura yalnız Luca'da (birleştirme/bağlama sunucu işlemleri orada).
  const [lucaActive, setLucaActive] = useState(false);
  useEffect(() => { getActiveProvider().then((p) => setLucaActive(p.key === 'luca')).catch(() => {}); }, []);

  const { invoices, loading, refetch } = useInvoices();
  // "Siparişlerden fatura" yalnız faturalanmamış teslim edilmiş sipariş varken anlamlı
  // (her teslimde otomatik taslak fatura açıldığı için çoğu zaman boştur → buton gizlenir).
  const { orders: unbilledOrders, refetch: refetchUnbilled } = useUnbilledWorkOrders();
  const { stats, refetch: refetchStats } = useInvoiceStats();
  // Beyaz hero başlığı: çoklu-döviz TOPLANMAZ → en büyük dilim başlıkta.
  const overdueLead   = stats?.overdue[0] ?? null;
  const thisMonthLead = stats?.thisMonth[0] ?? null;
  const thisMonthRest = stats?.thisMonth.slice(1) ?? [];
  const outLead = stats?.outstanding[0] ?? null;
  const paidLead      = stats?.paid[0] ?? null;

  const today = useLabToday();
  const range = useMemo(() => periodRange(period.p, today, period.from, period.to), [period, today]);

  // Sekme dışındaki süzgeçler (dönem, e-Faturasız, arama) — sekme sayıları bunun üstünden.
  const base = useMemo(() => {
    const sl = search.trim().toLowerCase();
    return invoices.filter(inv => {
      if (!inPeriod(inv.issue_date, range)) return false;
      if (noEFaturaOnly && (inv.efatura_uuid || inv.status === 'iptal' || !(Number(inv.total) > 0))) return false;
      if (sl) {
        const match =
          inv.invoice_number.toLowerCase().includes(sl) ||
          (inv.clinic?.name ?? '').toLowerCase().includes(sl) ||
          (inv.doctor?.full_name ?? '').toLowerCase().includes(sl) ||
          (inv.work_order?.patient_name ?? '').toLowerCase().includes(sl);
        if (!match) return false;
      }
      return true;
    });
  }, [invoices, search, noEFaturaOnly, range]);

  const segCounts = useMemo(() => {
    const c = { all: base.length, taslak: 0, open: 0, overdue: 0, odendi: 0, iptal: 0 };
    for (const inv of base) c[segOf(inv, today)]++;
    return c;
  }, [base, today]);

  const filtered = useMemo(
    () => (statusFilter === 'all' || statusFilter === 'toplu_efatura') ? base : base.filter(inv => segOf(inv, today) === statusFilter),
    [base, statusFilter, today],
  );

  const segItems: { key: Seg; label: string; n: number | null; tone: string | null }[] = [
    { key: 'all',     label: autoT('Tümü'),     n: segCounts.all,     tone: null },
    { key: 'taslak',  label: autoT('Taslak'),   n: segCounts.taslak,  tone: null },
    { key: 'open',    label: autoT('Açık'),     n: segCounts.open,    tone: null },
    { key: 'overdue', label: autoT('Gecikmiş'), n: segCounts.overdue, tone: segCounts.overdue > 0 ? U.chipTones.danger.fg : null },
    { key: 'odendi',  label: autoT('Ödendi'),   n: segCounts.odendi,  tone: null },
    { key: 'iptal',   label: autoT('İptal'),    n: segCounts.iptal,   tone: U.ink[400] },
    ...(lucaActive ? [{ key: 'toplu_efatura' as Seg, label: autoT('e-Faturalar'), n: null, tone: null }] : []),
  ];

  // Alt satır: para birimi başına toplam + kalan (iptal hariç; dövizler toplanmaz).
  const footTotals = useMemo(() => {
    const acc: Record<string, { total: number; rest: number }> = {};
    for (const inv of filtered) {
      if (inv.status === 'iptal') continue;
      const c = inv.currency || 'TRY';
      const t = Number(inv.total) || 0;
      const p = Math.min(t, Math.max(0, Number(inv.paid_amount) || 0));
      (acc[c] ??= { total: 0, rest: 0 });
      acc[c].total += t;
      acc[c].rest += Math.max(0, t - p);
    }
    return Object.entries(acc).map(([currency, v]) => ({ currency, ...v })).sort((a, b) => b.total - a.total);
  }, [filtered]);

  // Hero: bu ay kesilenlerin tahsil / açık / gecikmiş dağılımı (başlıktaki para biriminde).
  const monthKey = today.slice(0, 7);
  const leadCcy = thisMonthLead?.currency ?? 'TRY';
  const monthBar = useMemo(() => {
    let paid = 0, open = 0, late = 0, n = 0;
    for (const inv of invoices) {
      if (inv.status === 'taslak' || inv.status === 'iptal') continue;
      if (!String(inv.issue_date ?? '').startsWith(monthKey)) continue;
      n++;
      if ((inv.currency || 'TRY') !== leadCcy) continue;
      const t = Number(inv.total) || 0;
      const p = Math.min(t, Math.max(0, Number(inv.paid_amount) || 0));
      paid += p;
      if (isInvoiceOverdue(inv, today)) late += t - p; else open += t - p;
    }
    return { paid, open, late, n, sum: paid + open + late };
  }, [invoices, monthKey, leadCcy, today]);
  const monthLabel = useMemo(() => {
    const d = new Date(`${monthKey}-01T00:00:00`);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(localeTag(), { month: 'long' });
  }, [monthKey]);

  // Faturalanmayı bekleyen siparişlerin en büyük para birimi dilimi.
  const unbilledLead = useMemo(() => {
    const acc: Record<string, number> = {};
    unbilledOrders.forEach(o => ccyPairs(o).forEach(([c, v]) => { acc[c] = (acc[c] ?? 0) + v; }));
    const pairs = Object.entries(acc).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    return pairs[0] ?? null;
  }, [unbilledOrders]);

  const exportCsv = async () => {
    // Dosya adı dönemi taşır (muhasebeciye ay sonu); sütunlar Luca listesiyle karşılaştırılabilir
    const span = range.from || range.to ? `${range.from ?? ''}_${range.to ?? ''}` : today;
    const res = await downloadCsv(
      `Faturalar-${span}`,
      filtered,
      [
        { header: 'Fatura No',     value: r => r.invoice_number },
        { header: 'e-Fatura No',   value: r => r.efatura_number ?? '' },
        { header: 'ETTN',          value: r => r.efatura_uuid ?? '' },
        { header: 'Tarih',         value: r => csvDate(r.issue_date) },
        { header: 'Vade',          value: r => csvDate(r.due_date) },
        { header: 'Klinik',        value: r => r.clinic?.name ?? '' },
        { header: 'VKN',           value: r => r.clinic?.vkn ?? '' },
        { header: 'Vergi Dairesi', value: r => r.clinic?.tax_office ?? '' },
        { header: 'Hekim',         value: r => r.doctor?.full_name ?? '' },
        { header: 'Para Birimi',   value: r => r.currency ?? '' },
        { header: 'KDV Matrahı',   value: r => csvMoney(r.subtotal) },
        { header: 'KDV %',         value: r => String(Number(r.tax_rate) || 0) },
        { header: 'KDV',           value: r => csvMoney(r.tax_amount) },
        { header: 'Tutar',         value: r => csvMoney(r.total) },
        { header: 'Tahsil Edilen', value: r => csvMoney(r.paid_amount) },
        { header: 'Bakiye',        value: r => csvMoney(Number(r.total) - Number(r.paid_amount)) },
        { header: 'Durum',         value: r => INVOICE_STATUS_LABELS[r.status] ?? r.status },
      ],
    );
    if (!res.ok && res.error) toast.error(res.error);
    else toast.success(autoT('CSV indirildi'));
  };

  const heroMenuItems = [
    { key: 'pay', label: autoT('Toplu tahsilat'), icon: Banknote, onPress: () => setBulkPayOpen(true) },
    ...(lucaActive ? [{ key: 'ef', label: autoT('Toplu e-Fatura'), icon: Receipt, onPress: () => setBulkEfOpen(true) }] : []),
    ...(Platform.OS === 'web' ? [{ key: 'csv', label: autoT("Excel'e aktar"), icon: FileText, onPress: () => { void exportCsv(); } }] : []),
  ];

  // PDF: liste satırında kalem yok → faturanın tamamı çekilip yazdırılır.
  const handlePrint = async (inv: Invoice) => {
    if (printBusy) return;
    setPrintBusy(inv.id);
    try {
      const { data, error } = await fetchInvoiceById(inv.id);
      if (error || !data) throw new Error((error as any)?.message ?? autoT('Hizmet bedeli bulunamadı'));
      const r = await printInvoice(data);
      if (!r.ok && r.error) toast.error(autoT(r.error));
    } catch (e: any) {
      toast.error(`${autoT('PDF oluşturulamadı')}: ${e?.message ?? e}`);
    } finally { setPrintBusy(null); }
  };

  const rowMenu = (inv: Invoice): RowMenuItem[] => {
    const rest = (Number(inv.total) || 0) - (Number(inv.paid_amount) || 0);
    const issued = inv.status !== 'taslak' && inv.status !== 'iptal';
    const items: RowMenuItem[] = [];
    if (issued && inv.status !== 'odendi' && rest > 0) {
      items.push({ key: 'pay', label: autoT('Tahsilat ekle'), icon: Banknote, onPress: () => setPayTarget(inv) });
    }
    items.push({ key: 'pdf', label: autoT('PDF / Yazdır'), icon: Printer, onPress: () => { void handlePrint(inv); } });
    if (lucaActive && issued && (!inv.efatura_uuid || inv.efatura_status === 'error')) {
      // e-Fatura kesimi (onay / eksik bilgi denetimi) fatura detayındaki kartta yapılır.
      items.push({ key: 'ef', label: autoT('e-Fatura gönder'), icon: Receipt, onPress: () => openInvoice(inv.invoice_number ?? inv.id) });
    }
    if (inv.clinic_id && isInvoiceOverdue(inv, today) && rest > 0) {
      items.push({ key: 'remind', label: autoT('Ödeme hatırlat'), icon: Bell, onPress: () => setRemindTarget(inv) });
    }
    return items;
  };

  const onRefresh = () => { refetch(); refetchStats(); setBulkEfKey((k) => k + 1); };

  if (openInvoiceId) {
    return (
      <InvoiceDetailScreen
        invoiceId={openInvoiceId}
        // Detayda iptal/sil/tahsilat olmuş olabilir → dönüşte listeyi tazele
        // (yoksa iptal edilen fatura TASLAK, silinen fatura listede kalıyordu).
        onBack={() => { setOpenInvoiceId(null); onRefresh(); }}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* ── Invoice List ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: isDesktop ? 48 : navBarMetrics(insets.bottom).clearance + 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={U.ink[300]} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Başlık + araçlar + BEYAZ HERO + arama listeyle BİRLİKTE kayar — eskiden
            ScrollView'un dışındaydı, hero ekranın üstünde sabit kalıp yer kaplıyordu. */}
        {/* ── Header — standalone only ── */}
        {!isEmbedded && (
          <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 64, paddingBottom: 6 }}>
            <Text style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.5, color: U.ink[900] }}>
              Hizmet bedelleri
            </Text>
            <Text style={{ fontSize: 13, color: U.ink[400], marginTop: 2 }}>
              {stats ? `${stats.invoiceCount} ${autoT('hizmet bedeli')}` : '...'}
            </Text>
          </View>
        )}

        {/* ── BEYAZ HERO (çerçeve ortak; içi bu sayfaya özel) ─────────────
            Bu ay kesilen büyük rakam → sağda tahsil edilen / vadesi geçen →
            bu ay kesilenlerin durum çubuğu → faturalanmayı bekleyen sipariş şeridi.
            Toplu işlemler hero altındaki düğme şeridinde. Para birimleri TOPLANMAZ. */}
        <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 10, paddingBottom: 12 }}>
          <WhiteHero
            kicker={`${autoT('Hizmet bedelleri')} · ${monthLabel}`}
            accent={tblAccent}
            title={thisMonthLead ? (
              <>{autoT('Bu ay kesinleşen')} <Text style={{ color: heroInk.accentInk }}>{fmtMoney(thisMonthLead.total, thisMonthLead.currency)}</Text></>
            ) : outLead ? (
              <>{autoT('Toplam alacak')} <Text style={{ color: heroInk.accentInk }}>{fmtMoney(outLead.total, outLead.currency)}</Text></>
            ) : autoT('Bu ay henüz hizmet bedeli kesinleşmedi')}
            description={thisMonthLead
              ? `${monthBar.n} ${autoT('hizmet bedeli')}`
              : `${autoT('Bu ay henüz hizmet bedeli kesinleşmedi')}${stats?.draftCount ? ` · ${stats.draftCount} ${autoT('taslak onay bekliyor')}` : ''}`}
            stats={stats ? [
              { value: paidLead ? fmtMoney(paidLead.total, paidLead.currency) : '—', label: autoT('Tahsil edilen'), color: heroInk.isDark ? '#6EE7B7' : '#0F6E56' },
              { value: overdueLead ? fmtMoney(overdueLead.total, overdueLead.currency) : '—', label: autoT('Vadesi geçen'), color: overdueLead ? (heroInk.isDark ? '#FCA5A5' : '#A32D2D') : undefined },
            ] : undefined}
            actions={
              <>
                {heroMenuItems.map((it) => (
                  <Pressable
                    key={it.key}
                    onPress={it.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={it.label}
                    style={({ pressed, hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      height: 36, paddingHorizontal: 14, borderRadius: 999,
                      backgroundColor: hovered ? U.rowHover : U.plainBtn.bg,
                      borderWidth: 1, borderColor: U.plainBtn.border, opacity: pressed ? 0.8 : 1,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}),
                    })}
                  >
                    <it.icon size={15} color={U.plainBtn.fg} strokeWidth={1.8} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{it.label}</Text>
                  </Pressable>
                ))}
              </>
            }
          >
            {thisMonthRest.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <MoneyMultiX slices={thisMonthRest} variant="inline" onAccent={heroInk.moneyOnAccent} />
              </View>
            )}

            {/* Bu ay kesilenler: tahsil / açık / gecikmiş (başlıktaki para biriminde) */}
            {monthBar.sum > 0 && (
              <View style={{ marginTop: 16 }}>
                <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: heroInk.tileBg }}>
                  {monthBar.paid > 0 && <View style={{ flex: monthBar.paid, backgroundColor: '#2D9A6B' }} />}
                  {monthBar.open > 0 && <View style={{ flex: monthBar.open, backgroundColor: heroInk.accentInk }} />}
                  {monthBar.late > 0 && <View style={{ flex: monthBar.late, backgroundColor: '#D94B4B' }} />}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, marginTop: 7 }}>
                  <HeroLegend color="#2D9A6B" label={autoT('Tahsil')} value={fmtMoney(monthBar.paid, leadCcy)} />
                  <HeroLegend color={heroInk.accentInk} label={autoT('Açık')} value={fmtMoney(monthBar.open, leadCcy)} />
                  {monthBar.late > 0 && <HeroLegend color="#D94B4B" label={autoT('Gecikmiş')} value={fmtMoney(monthBar.late, leadCcy)} />}
                </View>
              </View>
            )}

            {/* Faturalanmayı bekleyen siparişler — yalnız varsa */}
            {unbilledOrders.length > 0 && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14,
                paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14,
                backgroundColor: U.chipTones.warning.bg, borderWidth: 1, borderColor: 'rgba(232,155,42,0.45)',
              }}>
                <Clock size={15} color={U.chipTones.warning.fg} strokeWidth={1.8} />
                <Text style={{ flex: 1, minWidth: 180, fontSize: 13, color: U.chipTones.warning.fg }}>
                  {`${unbilledOrders.length} ${autoT('sipariş hizmet bedeli bekliyor')}`}
                  {unbilledLead ? ` · ${fmtMoney(unbilledLead[1], unbilledLead[0])}` : ''}
                </Text>
                <Pressable
                  onPress={() => setBulkOpen(true)}
                  style={({ pressed }: any) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999,
                    backgroundColor: U.ink[900], opacity: pressed ? 0.85 : 1,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                >
                  <Layers size={13} strokeWidth={2} color={U.onDarkPill} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: U.onDarkPill }}>{autoT('Siparişlerden hizmet bedeli')}</Text>
                </Pressable>
              </View>
            )}
          </WhiteHero>
        </View>

        {/* ── Faturalar kartı: başlık + durum sekmeleri + arama/dönem/e-Faturasız kartın içinde ── */}
        <View style={{ paddingHorizontal: PAGE_PADDING, gap: 12 }}>
          <View style={U.tableCard}>
            <View style={{
              paddingHorizontal: isDesktop ? 20 : 16, paddingTop: isDesktop ? 18 : 14, paddingBottom: 14, gap: 12,
              borderBottomWidth: bulkView ? 0 : 1, borderBottomColor: U.hairline,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', rowGap: 10 }}>
                {/* Finans hub'ında sayfa başlığı zaten "Faturalar" — kartta tekrar etme. */}
                {!isEmbedded && (
                  <Text style={{ ...DISPLAY, fontSize: isDesktop ? 22 : 18, letterSpacing: isDesktop ? -0.4 : -0.3, color: U.ink[900] }}>
                    Hizmet bedelleri
                  </Text>
                )}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 1 }}
                            contentContainerStyle={{ flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: U.ink[100] }}>
                  {segItems.map(o => {
                    const active = statusFilter === o.key;
                    return (
                      <Pressable
                        key={o.key}
                        onPress={() => setStatusFilter(o.key)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        style={{
                          paddingHorizontal: active ? 18 : 12, paddingVertical: 8, borderRadius: 999,
                          backgroundColor: active ? U.segActive : 'transparent',
                          ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}),
                        }}
                      >
                        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: active ? '700' : '500',
                                                         color: active ? U.ink[900] : (o.tone ?? U.ink[500]) }}>
                          {o.n === null ? o.label : `${o.label} · ${o.n}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', rowGap: 8 }}>
                <View style={{
                  flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 180,
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  height: 40, paddingHorizontal: 14, borderRadius: 9999,
                  borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
                }}>
                  <Search size={14} color={U.ink[400]} strokeWidth={1.8} />
                  <TextInput
                    style={{ flex: 1, fontSize: 13.5, color: U.ink[900], outline: 'none' as any }}
                    placeholder="Belge no, kurum, hekim, hasta"
                    placeholderTextColor={U.ink[400]}
                    value={search}
                    onChangeText={setSearch}
                  />
                  {search.length > 0 && (
                    <Pressable onPress={() => setSearch('')} accessibilityLabel={autoT('Aramayı temizle')} style={{ cursor: 'pointer' as any }}>
                      <X size={13} color={U.ink[400]} strokeWidth={2} />
                    </Pressable>
                  )}
                </View>
                {!bulkView && (
                  <InvoicePeriodFilter
                    period={period.p} from={period.from} to={period.to} range={range}
                    onChange={(p, from, to) => setPeriod({ p, from, to })}
                  />
                )}
                {lucaActive && !bulkView && (
                  <Pressable
                    onPress={() => setNoEFaturaOnly(v => !v)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: noEFaturaOnly }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 9999,
                      borderWidth: 1,
                      borderColor: noEFaturaOnly ? CHIP_TONES.info.text : U.plainBtn.border,
                      backgroundColor: noEFaturaOnly ? CHIP_TONES.info.bg : U.plainBtn.bg,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <Receipt size={13} strokeWidth={1.8} color={noEFaturaOnly ? CHIP_TONES.info.text : U.plainBtn.fg} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: noEFaturaOnly ? CHIP_TONES.info.text : U.plainBtn.fg }}>
                      e-Faturasız
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

            {bulkView ? null : loading && filtered.length === 0 ? (
              <View style={{ paddingVertical: 64, alignItems: 'center' }}>
                <ActivityIndicator color={U.ink[400]} />
              </View>
            ) : filtered.length === 0 ? (
              <EmptyState hasFilter={!!search || noEFaturaOnly || statusFilter !== 'all' || period.p !== 'all'} />
            ) : (
              <>
                {isDesktop ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 10,
                                 borderBottomWidth: 1, borderBottomColor: U.hairline }}>
                    <Text style={{ ...colHeaderOf(U), width: COL.no }}>Hizmet bedeli</Text>
                    <Text style={{ ...colHeaderOf(U), flex: 1 }}>Kurum / Hekim</Text>
                    {wideTable ? <Text style={{ ...colHeaderOf(U), width: COL.patient }}>Hasta</Text> : null}
                    <Text style={{ ...colHeaderOf(U), width: COL.date }}>Tarih / Vade</Text>
                    <Text style={{ ...colHeaderOf(U), width: COL.money, textAlign: 'right' }}>Tutar</Text>
                    <Text style={{ ...colHeaderOf(U), width: COL.rest, textAlign: 'right' }}>Kalan</Text>
                    <Text style={{ ...colHeaderOf(U), width: COL.status }}>Durum</Text>
                    <View style={{ width: COL.menu }} />
                  </View>
                ) : null}
                {filtered.map((inv, i) => (
                  <InvoiceRow
                    key={inv.id}
                    invoice={inv}
                    desktop={isDesktop}
                    patientCol={wideTable}
                    isLast={i === filtered.length - 1}
                    showEfMissing={lucaActive}
                    busy={printBusy === inv.id}
                    menu={rowMenu(inv)}
                    onPress={() => openInvoice(inv.invoice_number ?? inv.id)}
                  />
                ))}
                {/* Sade alt satır: adet + para birimi başına toplam / kalan */}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6,
                  paddingHorizontal: isDesktop ? 20 : 16, paddingVertical: 12,
                  borderTopWidth: 1, borderTopColor: U.hairline, backgroundColor: U.surfaceSoft,
                }}>
                  <Text style={{ fontSize: 12, color: U.ink[500] }}>{`${filtered.length} ${autoT('hizmet bedeli')}`}</Text>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    {footTotals.map(t => (
                      <Text key={t.currency} style={{ fontSize: 12.5, color: U.ink[700] }}>
                        {`${autoT('Toplam')} `}
                        <Text style={{ fontWeight: '700', color: U.ink[900] }}>{fmtMoney(t.total, t.currency)}</Text>
                        {` · ${autoT('Kalan')} `}
                        <Text style={{ fontWeight: '700', color: U.ink[900] }}>{fmtMoney(t.rest, t.currency)}</Text>
                      </Text>
                    ))}
                  </View>
                </View>
              </>
            )}
          </View>

          {bulkView && <BulkEFaturaList search={search} refreshKey={bulkEfKey} onOpenInvoice={openInvoice} />}
        </View>
      </ScrollView>

      {/* Modals */}
      <BulkInvoiceModal
        visible={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onCreated={(id) => { setBulkOpen(false); refetchUnbilled(); openInvoice(id); }}
      />
      <BulkEFaturaModal
        visible={bulkEfOpen}
        onClose={() => setBulkEfOpen(false)}
        onDone={onRefresh}
      />
      <BulkPaymentModal
        visible={bulkPayOpen}
        invoices={invoices.filter(inv =>
          inv.status !== 'odendi' && inv.status !== 'iptal' && inv.status !== 'taslak'
        )}
        onClose={() => setBulkPayOpen(false)}
        onDone={() => { setBulkPayOpen(false); onRefresh(); }}
      />
      {payTarget && (
        <PaymentModal
          visible={!!payTarget}
          invoiceId={payTarget.id}
          maxAmount={Math.max(0, (Number(payTarget.total) || 0) - (Number(payTarget.paid_amount) || 0))}
          currency={payTarget.currency || 'TRY'}
          onClose={() => setPayTarget(null)}
          onDone={() => { setPayTarget(null); onRefresh(); }}
        />
      )}
      {remindTarget && remindTarget.clinic_id && (
        <SendReminderModal
          visible={!!remindTarget}
          clinicId={remindTarget.clinic_id}
          clinicName={remindTarget.clinic?.name ?? '—'}
          totalDue={Math.max(0, (Number(remindTarget.total) || 0) - (Number(remindTarget.paid_amount) || 0))}
          overdueCount={1}
          currency={remindTarget.currency || 'TRY'}
          invoiceId={remindTarget.id}
          invoiceNo={remindTarget.invoice_number}
          onClose={() => setRemindTarget(null)}
        />
      )}
    </View>
  );
}

// Column header style (tema-farkında)
function colHeaderOf(U: InkUI) {
  return {
    fontSize: 10, fontWeight: '600' as const, letterSpacing: 0.8,
    textTransform: 'uppercase' as const, color: U.ink[500],
  };
}

// ─── Fatura satırı (masaüstü: sütunlu · mobil: iki kolonlu satır) ──────
const COL = { no: 148, patient: 140, date: 120, money: 104, rest: 112, status: 92, menu: 36 };

type RowMenuItem = { key: string; label: string; icon?: React.ComponentType<any>; onPress: () => void };

function InvoiceRow({ invoice, desktop, patientCol, isLast, showEfMissing, busy, menu, onPress }: {
  invoice: Invoice; desktop: boolean; patientCol: boolean; isLast: boolean; showEfMissing: boolean; busy: boolean;
  menu: RowMenuItem[]; onPress: () => void;
}) {
  const U = useInkUI();
  const CHIP_TONES = chipTones(U);
  const today = useLabToday();
  const isOverdue = isInvoiceOverdue(invoice, today);
  const total = Number(invoice.total) || 0;
  const paid = Math.min(total, Math.max(0, Number(invoice.paid_amount) || 0));
  const rest = invoice.status === 'iptal' ? 0 : Math.max(0, total - paid);
  const paidPct = total > 0 ? Math.round((paid / total) * 100) : 0;
  const ccy = invoice.currency || 'TRY';
  const st = statusDot(U, invoice, isOverdue);
  const doctor = invoice.doctor?.full_name ? normalizeDoctorName(invoice.doctor.full_name) : null;
  const patient = invoice.work_order?.patient_name ?? null;
  const efMissing = showEfMissing && !invoice.efatura_uuid && invoice.status !== 'taslak' && invoice.status !== 'iptal';
  const muted = invoice.status === 'iptal';

  const efLine = invoice.efatura_uuid
    ? <EFaturaBadge invoice={invoice} />
    : efMissing ? <Text style={{ fontSize: 10.5, color: U.ink[400] }}>e-Fatura yok</Text> : null;

  const menuBtn = menu.length > 0 ? (
    <AnchorMenu
      width={220}
      items={menu}
      renderTrigger={(open) => (
        <Pressable
          onPress={open}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={autoT('Hizmet bedeli işlemleri')}
          style={({ pressed, hovered }: any) => ({
            width: desktop ? 32 : 44, height: desktop ? 32 : 44, borderRadius: 999,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: hovered || pressed ? U.rowHover : 'transparent',
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          })}
        >
          {busy ? <ActivityIndicator size="small" color={U.ink[400]} /> : <MoreHorizontal size={16} color={U.ink[500]} strokeWidth={1.8} />}
        </Pressable>
      )}
    />
  ) : <View style={{ width: desktop ? 32 : 44 }} />;

  if (!desktop) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingStart: 16, paddingEnd: 6, paddingVertical: 12,
          borderBottomWidth: isLast ? 0 : 1, borderBottomColor: U.hairline,
          backgroundColor: pressed ? U.rowHover : 'transparent',
          opacity: muted ? 0.6 : 1,
        })}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>
            {invoice.clinic?.name ?? '—'}
          </Text>
          <Text style={{ fontSize: 11.5, color: U.ink[500] }} numberOfLines={1}>
            {[invoice.invoice_number, patient, doctor].filter(Boolean).join(' · ')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 8, rowGap: 3, flexWrap: 'wrap' }}>
            {invoice.due_date ? (
              <Text style={{ fontSize: 11.5, color: isOverdue ? CHIP_TONES.danger.text : U.ink[400], fontWeight: isOverdue ? '600' : '400' }}>
                {`${autoT('Vade')} ${fmtDate(invoice.due_date)}`}
              </Text>
            ) : null}
            {efLine}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900], fontVariant: ['tabular-nums'] }}>
            {fmtMoney(rest > 0 ? rest : total, ccy)}
          </Text>
          {rest > 0 && rest < total ? (
            <Text style={{ fontSize: 10.5, color: U.ink[400] }}>{`/ ${fmtMoney(total, ccy)}`}</Text>
          ) : null}
          <StatusDotLabel tone={st} />
        </View>
        {menuBtn}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingStart: 20, paddingEnd: 14, paddingVertical: 12,
        borderBottomWidth: isLast ? 0 : 1, borderBottomColor: U.hairline,
        backgroundColor: hovered ? U.rowHover : 'transparent',
        opacity: muted ? 0.6 : 1,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      })}
    >
      <View style={{ width: COL.no, gap: 3 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{invoice.invoice_number}</Text>
        {efLine}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '500', color: U.ink[900] }} numberOfLines={1}>
          {invoice.clinic?.name ?? '—'}
        </Text>
        {(patientCol ? doctor : [doctor, patient].filter(Boolean).join(' · ')) ? (
          <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 1 }} numberOfLines={1}>
            {patientCol ? doctor : [doctor, patient].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      {patientCol ? <Text style={{ width: COL.patient, fontSize: 12.5, color: U.ink[700] }} numberOfLines={1}>{patient ?? '—'}</Text> : null}
      <View style={{ width: COL.date, gap: 2 }}>
        <Text style={{ fontSize: 12, color: U.ink[500] }} numberOfLines={1}>{fmtDate(invoice.issue_date)}</Text>
        <Text style={{ fontSize: 11.5, color: isOverdue ? CHIP_TONES.danger.text : U.ink[400], fontWeight: isOverdue ? '600' : '400' }} numberOfLines={1}>
          {invoice.due_date ? `${autoT('Vade')} ${fmtDate(invoice.due_date)}` : '—'}
        </Text>
      </View>
      <Text style={{ width: COL.money, textAlign: 'right', fontSize: 13, color: U.ink[700], fontVariant: ['tabular-nums'] }} numberOfLines={1}>
        {fmtMoney(total, ccy)}
      </Text>
      <View style={{ width: COL.rest, alignItems: 'flex-end', gap: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: rest > 0 ? U.ink[900] : U.ink[400], fontVariant: ['tabular-nums'] }} numberOfLines={1}>
          {fmtMoney(rest, ccy)}
        </Text>
        {invoice.status !== 'taslak' && invoice.status !== 'iptal' ? (
          <View style={{ width: 72, height: 3, borderRadius: 2, backgroundColor: U.ink[100], overflow: 'hidden' }}>
            <View style={{ width: `${paidPct}%` as any, height: 3, borderRadius: 2, backgroundColor: '#2D9A6B' }} />
          </View>
        ) : null}
      </View>
      <View style={{ width: COL.status }}><StatusDotLabel tone={st} /></View>
      <View style={{ width: COL.menu, alignItems: 'center' }}>{menuBtn}</View>
    </Pressable>
  );
}

/** Durum: küçük nokta + sade etiket (büyük harf rozet yerine). Gecikmiş, durumdan önce gelir. */
function statusDot(U: InkUI, inv: Invoice, overdue: boolean): { label: string; color: string } {
  if (inv.status === 'iptal')  return { label: autoT('İptal'), color: U.ink[400] };
  if (inv.status === 'taslak') return { label: autoT('Taslak'), color: U.chipTones.warning.fg };
  if (inv.status === 'odendi') return { label: autoT('Ödendi'), color: U.chipTones.success.fg };
  if (overdue)                 return { label: autoT('Gecikmiş'), color: U.chipTones.danger.fg };
  if (inv.status === 'kismi_odendi') return { label: autoT('Kısmi'), color: U.chipTones.info.fg };
  return { label: autoT('Açık'), color: U.ink[700] };
}

function StatusDotLabel({ tone }: { tone: { label: string; color: string } }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tone.color }} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: tone.color }} numberOfLines={1}>{tone.label}</Text>
    </View>
  );
}

/** Hero çubuğu açıklaması. */
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

// ─── Empty State ────────────────────────────────────────────────────
function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  const U = useInkUI();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 16, gap: 12 }}>
      {hasFilter ? (
        <Search size={36} strokeWidth={1.4} color={U.ink[300]} />
      ) : (
        <Inbox size={36} strokeWidth={1.4} color={U.ink[300]} />
      )}
      <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }}>
        {hasFilter ? 'Sonuç bulunamadı' : 'Henüz hizmet bedeli yok'}
      </Text>
      <Text style={{ fontSize: 13, color: U.ink[400], textAlign: 'center', maxWidth: 300 }}>
        {hasFilter
          ? 'Filtre kriterlerini degistirmeyi deneyin.'
          : 'Bir iş emrini teslim ettiğinde "Hizmet bedeli oluştur" ile hizmet bedeli oluşturabilirsin.'}
      </Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════
// BULK INVOICE MODAL
// ═════════════════════════════════════════════════════════════════════
function BulkInvoiceModal({
  visible, onClose, onCreated,
}: {
  visible: boolean; onClose: () => void; onCreated: (invoiceId: string) => void;
}) {
  const U = useInkUI();
  const CHIP_TONES = chipTones(U);
  const STATUS_CHIP = statusChip(U);
  const { clinics, loading: loadingClinics } = useClinics();
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
  const [clinicPickerOpen, setClinicPickerOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [orderSearch, setOrderSearch] = useState('');
  const [dueDays, setDueDays] = useState('30');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  // Fatura indirimi — boş açılır (kliniğin genel oranıyla dolmaz); hata alanın / düğmenin yanında.
  const [discType, setDiscType] = useState<InvoiceDiscountType>('percent');
  const [discRaw, setDiscRaw] = useState('');
  const [discErr, setDiscErr] = useState<string | null>(null);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const { orders, loading: loadingOrders } = useUnbilledWorkOrders(
    selectedClinicId ?? undefined,
  );

  const selectedClinic = useMemo(
    () => clinics.find(c => c.id === selectedClinicId) ?? null,
    [clinics, selectedClinicId],
  );

  const visibleOrders = useMemo(() => {
    if (!orderSearch.trim()) return orders;
    const sl = orderSearch.toLowerCase();
    return orders.filter(o =>
      o.order_number.toLowerCase().includes(sl) ||
      (o.patient_name ?? '').toLowerCase().includes(sl) ||
      (o.work_type ?? '').toLowerCase().includes(sl),
    );
  }, [orders, orderSearch]);

  // Seçili siparişlerin toplamı — para birimi başına ("7,00 € · ₺1.250,00").
  // Farklı dövizleri tek sayıda toplamak yanlış rakam üretiyordu.
  const selectedTotalLabelOrders = useMemo(() => {
    const acc: Record<string, number> = {};
    orders
      .filter(o => selectedOrders.has(o.work_order_id))
      .forEach(o => ccyPairs(o).forEach(([c, v]) => { acc[c] = (acc[c] ?? 0) + v; }));
    const pairs = Object.entries(acc).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    return pairs.length ? pairs.map(([c, v]) => fmtMoney(v, c)).join(' · ') : '—';
  }, [orders, selectedOrders]);

  // Tahmini indirimli toplam (KDV öncesi, sipariş toplamı tabanı) — gerçek fatura Σ kalem net'i
  // (tarama ücreti, acil farkı dahil) üzerinden indirir ve KDV ekler; bu yüzden yalnız tahmin.
  // Fatura tek para birimindedir; seçim tek dövizde değilse ya da indirim geçersiz/boşsa gösterilmez.
  const discountedEstimate = useMemo(() => {
    const v = validateInvoiceDiscount(discType, discRaw);
    if (!v.ok || v.value <= 0) return null;
    const acc: Record<string, number> = {};
    orders
      .filter(o => selectedOrders.has(o.work_order_id))
      .forEach(o => ccyPairs(o).forEach(([c, x]) => { acc[c] = (acc[c] ?? 0) + x; }));
    const pairs = Object.entries(acc).filter(([, x]) => x > 0);
    if (pairs.length !== 1) return null;
    const [c, net] = pairs[0];
    return { amount: invoiceTotalsWithDiscount(net, 0, discType, v.value).subtotal, ccy: c };
  }, [orders, selectedOrders, discType, discRaw]);

  const toggleOrder = (id: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allSel = visibleOrders.every(o => selectedOrders.has(o.work_order_id));
    setSelectedOrders(prev => {
      const next = new Set(prev);
      visibleOrders.forEach(o => allSel ? next.delete(o.work_order_id) : next.add(o.work_order_id));
      return next;
    });
  };

  const handleClose = () => {
    setSelectedClinicId(null);
    setSelectedOrders(new Set());
    setOrderSearch('');
    setDueDays('30');
    setNotes('');
    setDiscType('percent'); setDiscRaw(''); setDiscErr(null); setCreateErr(null);
    onClose();
  };

  const handleCreate = async () => {
    if (!selectedClinicId || selectedOrders.size === 0) return;
    const dueDaysNum = parseInt(dueDays, 10);
    if (Number.isNaN(dueDaysNum) || dueDaysNum < 0 || dueDaysNum > 365) {
      toast.warning('Vade gun sayisi 0-365 arasinda olmali.');
      return;
    }
    setCreateErr(null);
    const disc = validateInvoiceDiscount(discType, discRaw);
    if (!disc.ok) { setDiscErr(disc.error); setCreateErr(disc.error); return; }
    setDiscErr(null);
    setSaving(true);
    const { data, error } = await createBulkInvoice({
      clinic_id: selectedClinicId,
      work_order_ids: Array.from(selectedOrders),
      due_days: dueDaysNum,
      notes: notes.trim() || null,
      discount_type: disc.value > 0 ? discType : null,
      discount_value: disc.value,
    });
    setSaving(false);
    if (error || !data) {
      const msg = (error as any)?.message as string | undefined;
      const dMsg = invoiceDiscountRpcError(msg, discType, discRaw);
      if (dMsg) { setDiscErr(dMsg); setCreateErr(dMsg); return; }
      toast.error(msg ?? 'Hizmet bedeli oluşturulamadı.');
      return;
    }
    onCreated(data.id);
  };

  const allSel = visibleOrders.length > 0 &&
    visibleOrders.every(o => selectedOrders.has(o.work_order_id));

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View style={{
        flex: 1, backgroundColor: U.isDark ? 'rgba(0,0,0,0.66)' : 'rgba(10,14,26,0.42)',
        justifyContent: 'center', alignItems: 'center', padding: 24,
        ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}),
      }}>
        <View style={{
          backgroundColor: U.surface, borderRadius: 24,
          width: '100%', maxWidth: 620, maxHeight: '90%', overflow: 'hidden',
          // @ts-ignore web
          boxShadow: modalShadowOf(U),
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 22, paddingTop: 22, paddingBottom: 14,
            borderBottomWidth: 1, borderBottomColor: U.hairline,
          }}>
            <View style={{
              width: 36, height: 36, borderRadius: 10,
              backgroundColor: '#2563EB' + '15',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Layers size={18} strokeWidth={1.8} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: U.ink[900] }}>Siparişlerden hizmet bedeli</Text>
              <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 1 }}>Birden fazla siparişi tek hizmet bedelinde topla</Text>
            </View>
            <Pressable onPress={handleClose} style={{
              width: 32, height: 32, borderRadius: 10,
              backgroundColor: U.ink[100], alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer' as any,
            }}>
              <X size={16} strokeWidth={1.8} color={U.ink[500]} />
            </Pressable>
          </View>

          {/* Clinic picker */}
          <View style={{ paddingHorizontal: 22, paddingTop: 16 }}>
            <Text style={{
              fontSize: 10, fontWeight: '600', letterSpacing: 0.8,
              textTransform: 'uppercase', color: U.ink[500], marginBottom: 6,
            }}>
              Klinik
            </Text>
            <Pressable
              onPress={() => setClinicPickerOpen(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                height: 44, paddingHorizontal: 14,
                borderRadius: 14, borderWidth: 1, borderColor: U.fieldBorder,
                backgroundColor: U.ink[50],
                cursor: 'pointer' as any,
              }}
            >
              <Building2 size={15} strokeWidth={1.6} color={selectedClinic ? '#2563EB' : U.ink[400]} />
              <Text style={{
                flex: 1, fontSize: 14, fontWeight: selectedClinic ? '600' : '400',
                color: selectedClinic ? U.ink[900] : U.ink[400],
              }} numberOfLines={1}>
                {selectedClinic ? selectedClinic.name : 'Klinik secin...'}
              </Text>
              <ChevronDown size={15} strokeWidth={1.6} color={U.ink[400]} />
            </Pressable>
          </View>

          {/* Order list */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {!selectedClinicId ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
                <Hand size={28} strokeWidth={1.4} color={U.ink[300]} />
                <Text style={{ fontSize: 13, color: U.ink[400] }}>Klinik secerek baslayin</Text>
              </View>
            ) : loadingOrders ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <ActivityIndicator color={U.ink[400]} />
              </View>
            ) : (
              <View style={{ paddingHorizontal: 22 }}>
                {/* Search + select all */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
                  <View style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                    height: 38, paddingHorizontal: 12,
                    borderRadius: 9999, backgroundColor: U.surface,
                    borderWidth: 1, borderColor: U.hairline,
                  }}>
                    <Search size={13} strokeWidth={1.6} color={U.ink[400]} />
                    <TextInput
                      style={{ flex: 1, fontSize: 13, color: U.ink[900], outline: 'none' as any }}
                      placeholder="Is no, hasta..."
                      placeholderTextColor={U.ink[400]}
                      value={orderSearch}
                      onChangeText={setOrderSearch}
                    />
                    {orderSearch.length > 0 && (
                      <Pressable onPress={() => setOrderSearch('')}>
                        <X size={13} strokeWidth={1.8} color={U.ink[400]} />
                      </Pressable>
                    )}
                  </View>
                  {visibleOrders.length > 0 && (
                    <Pressable
                      onPress={toggleAll}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
                        backgroundColor: CHIP_TONES.info.bg,
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Check size={13} strokeWidth={2} color={CHIP_TONES.info.text} />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: CHIP_TONES.info.text }}>
                        {allSel ? 'Kaldır' : 'Tümü'}
                      </Text>
                    </Pressable>
                  )}
                </View>

                {visibleOrders.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                    <CircleCheck size={28} strokeWidth={1.4} color={CHIP_TONES.success.text} />
                    <Text style={{ fontSize: 13, color: U.ink[400] }}>
                      {orderSearch ? 'Sonuç yok' : 'Hizmet bedeli bekleyen sipariş yok'}
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 6, marginTop: 10 }}>
                    {visibleOrders.map(order => (
                      <BulkOrderRow
                        key={order.work_order_id}
                        order={order}
                        selected={selectedOrders.has(order.work_order_id)}
                        onToggle={() => toggleOrder(order.work_order_id)}
                      />
                    ))}
                  </View>
                )}

                {/* Due days + notes */}
                {selectedOrders.size > 0 && (
                  <View style={{
                    marginTop: 14, padding: 14, borderRadius: 14,
                    backgroundColor: U.ink[50], borderWidth: 1, borderColor: U.hairline,
                  }}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ width: 100 }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: U.ink[500], marginBottom: 6 }}>
                          Vade (gun)
                        </Text>
                        <TextInput
                          style={{
                            height: 44, paddingHorizontal: 12, borderRadius: 14,
                            borderWidth: 1, borderColor: U.fieldBorder,
                            backgroundColor: U.isDark ? U.surfaceSoft : '#FFF', fontSize: 14, color: U.ink[900],
                          }}
                          value={dueDays}
                          onChangeText={setDueDays}
                          keyboardType="number-pad"
                          placeholder="30"
                          placeholderTextColor={U.ink[400]}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: U.ink[500], marginBottom: 6 }}>
                          Not (opsiyonel)
                        </Text>
                        <TextInput
                          style={{
                            height: 44, paddingHorizontal: 12, borderRadius: 14,
                            borderWidth: 1, borderColor: U.fieldBorder,
                            backgroundColor: U.isDark ? U.surfaceSoft : '#FFF', fontSize: 14, color: U.ink[900],
                          }}
                          value={notes}
                          onChangeText={setNotes}
                          placeholder="Or: Mart 2026 toplu"
                          placeholderTextColor={U.ink[400]}
                        />
                      </View>
                    </View>
                    <View style={{ marginTop: 12 }}>
                      <InvoiceDiscountField
                        type={discType}
                        value={discRaw}
                        error={discErr}
                        onChange={(t, v) => { setDiscType(t); setDiscRaw(v); setDiscErr(null); setCreateErr(null); }}
                      />
                    </View>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 22, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: U.hairline,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: U.ink[500] }}>
                {selectedOrders.size > 0 ? `${selectedOrders.size} siparis` : 'Seçim yok'}
              </Text>
              <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.3, color: U.ink[900] }}>
                {selectedTotalLabelOrders}
              </Text>
              {discountedEstimate ? (
                <>
                  <Text style={{ fontSize: 12, color: U.ink[500], marginTop: 2 }} numberOfLines={2}>
                    {autoT('Tahmini indirimli toplam')}{': '}
                    <Text style={{ fontWeight: '700', color: U.ink[900] }}>{fmtMoney(discountedEstimate.amount, discountedEstimate.ccy)}</Text>
                  </Text>
                  <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 1 }}>
                    {autoT('KDV öncesi; tarama ücretleri ve acil farkı hizmet bedelinde eklenir.')}
                  </Text>
                  {discountedEstimate.amount <= 0 ? (
                    <Text style={{ fontSize: 12, fontWeight: '600', color: U.chipTones.warning.fg, marginTop: 2 }}>
                      {autoT('Hizmet bedeli tutarı 0 olacak.')}
                    </Text>
                  ) : null}
                </>
              ) : null}
              {createErr ? (
                <Text style={{ fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg, marginTop: 2 }}>
                  {autoT(createErr)}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={handleCreate}
              disabled={selectedOrders.size === 0 || saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 20, paddingVertical: 12,
                borderRadius: 9999, backgroundColor: U.ink[900],
                opacity: (selectedOrders.size === 0 || saving) ? 0.4 : 1,
                cursor: 'pointer' as any,
              }}
            >
              {saving ? (
                <ActivityIndicator color={U.onDarkPill} size="small" />
              ) : (
                <>
                  <Receipt size={14} strokeWidth={1.8} color={U.onDarkPill} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: U.onDarkPill }}>Hizmet bedeli oluştur</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {/* Clinic picker inner modal */}
      <Modal visible={clinicPickerOpen} animationType="fade" transparent onRequestClose={() => setClinicPickerOpen(false)}>
        <View style={{
          flex: 1, backgroundColor: U.isDark ? 'rgba(0,0,0,0.66)' : 'rgba(10,14,26,0.42)',
          justifyContent: 'center', alignItems: 'center', padding: 24,
          ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}),
        }}>
          <View style={{
            backgroundColor: U.surface, borderRadius: 24,
            width: '100%', maxWidth: 420, maxHeight: 420, overflow: 'hidden',
            // @ts-ignore web
            boxShadow: modalShadowOf(U),
          }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 22, paddingVertical: 16,
              borderBottomWidth: 1, borderBottomColor: U.hairline,
            }}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: U.ink[900] }}>Klinik Sec</Text>
              <Pressable onPress={() => setClinicPickerOpen(false)} style={{
                width: 30, height: 30, borderRadius: 8,
                backgroundColor: U.ink[100], alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer' as any,
              }}>
                <X size={14} strokeWidth={1.8} color={U.ink[500]} />
              </Pressable>
            </View>
            {loadingClinics ? (
              <ActivityIndicator color={U.ink[400]} style={{ padding: 24 }} />
            ) : (
              <ScrollView>
                {clinics.map(cl => {
                  const sel = selectedClinicId === cl.id;
                  return (
                    <Pressable
                      key={cl.id}
                      onPress={() => {
                        setSelectedClinicId(cl.id);
                        setSelectedOrders(new Set());
                        setClinicPickerOpen(false);
                      }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingHorizontal: 22, paddingVertical: 14,
                        borderBottomWidth: 1, borderBottomColor: U.hairlineSoft,
                        backgroundColor: sel ? CHIP_TONES.info.bg : 'transparent',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Building2 size={15} strokeWidth={1.6} color={sel ? '#2563EB' : U.ink[400]} />
                      <Text style={{
                        flex: 1, fontSize: 14,
                        fontWeight: sel ? '600' : '400',
                        color: sel ? '#2563EB' : U.ink[900],
                      }} numberOfLines={1}>
                        {cl.name}
                      </Text>
                      {sel && <Check size={15} strokeWidth={2} color="#2563EB" />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

// ─── Bulk Order Row ─────────────────────────────────────────────────
function BulkOrderRow({ order, selected, onToggle }: {
  order: UnbilledWorkOrder; selected: boolean; onToggle: () => void;
}) {
  const U = useInkUI();
  const CHIP_TONES = chipTones(U);
  const STATUS_CHIP = statusChip(U);
  return (
    <Pressable
      onPress={onToggle}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: 12, borderRadius: 14,
        backgroundColor: selected ? CHIP_TONES.info.bg : U.ink[50],
        borderWidth: 1.5,
        borderColor: selected ? '#2563EB' : 'transparent',
        cursor: 'pointer' as any,
      }}
    >
      {/* Checkbox */}
      <View style={{
        width: 20, height: 20, borderRadius: 6,
        borderWidth: 1.5, borderColor: selected ? '#2563EB' : U.ink[300],
        backgroundColor: selected ? '#2563EB' : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {selected && <Check size={12} strokeWidth={2.5} color="#FFF" />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#2563EB' }}>{order.order_number}</Text>
        <Text style={{ fontSize: 12, fontWeight: '500', color: U.ink[900], marginTop: 1 }} numberOfLines={1}>
          {order.patient_name ?? '—'}
          {order.work_type ? ` · ${order.work_type}` : ''}
        </Text>
        <Text style={{ fontSize: 10, color: U.ink[400], marginTop: 2 }}>
          Teslim: {order.delivered_at
            ? new Date(order.delivered_at).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short' })
            : '—'}
        </Text>
      </View>
      <Text style={{ ...DISPLAY, fontSize: 14, letterSpacing: -0.3, color: U.ink[900] }}>
        {/* Kalemin KENDİ para birimi — birden çok döviz varsa alt alta değil,
            yan yana ("7,00 € · ₺1.250,00"). ₺ varsayımı kaldırıldı. */}
        {ccyPairs(order).length === 0
          ? '—'
          : ccyPairs(order).map(([c, a]) => fmtMoney(a, c)).join(' · ')}
      </Text>
    </Pressable>
  );
}

// ═════════════════════════════════════════════════════════════════════
// BULK PAYMENT MODAL
// ═════════════════════════════════════════════════════════════════════
const PAYMENT_METHODS = [
  { v: 'nakit'  as const, l: 'Nakit',  icon: Banknote },
  { v: 'kart'   as const, l: 'Kart',   icon: CreditCard },
  { v: 'havale' as const, l: 'Havale', icon: Landmark },
  { v: 'cek'    as const, l: 'Cek',    icon: File },
];

function BulkPaymentModal({
  visible, invoices, onClose, onDone,
}: {
  visible: boolean; invoices: Invoice[]; onClose: () => void; onDone: () => void;
}) {
  const U = useInkUI();
  const CHIP_TONES = chipTones(U);
  const STATUS_CHIP = statusChip(U);
  const today = useLabToday();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState('');
  // Yöntem bilerek boş gelir (nakit kasaya yanlışlıkla havale düşmesin) — madde 8
  const [method, setMethod] = useState<'nakit' | 'kart' | 'havale' | 'cek' | null>(null);
  const [methodErr, setMethodErr] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setSelected(new Set());
      setAmount('');
      setMethod(null);
      setMethodErr(false);
      setNotes('');
    }
  }, [visible]);

  const sortedInvoices = useMemo(() =>
    [...invoices].sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    }), [invoices]);

  const selectedInvoices = useMemo(() =>
    sortedInvoices.filter(inv => selected.has(inv.id)), [sortedInvoices, selected]);
  // Sayısal toplam — ödeme-input mekaniği için (akış korunur)
  const totalBalance = useMemo(() =>
    selectedInvoices.reduce((s, inv) => s + Number(inv.total) - Number(inv.paid_amount), 0),
    [selectedInvoices]);
  // Katı per-currency: seçili faturalar para birimine göre BAĞIMSIZ (etiketlerde)
  const totalBalanceByCcy = useMemo(() =>
    groupByCurrency(selectedInvoices,
      inv => ({ amount: Number(inv.total) - Number(inv.paid_amount), currency: ((inv as any).currency || 'TRY') as Currency })),
    [selectedInvoices]);
  const selectedTotalLabel = totalBalanceByCcy.length
    ? totalBalanceByCcy.map(s => fmtMoney(s.total, s.currency)).join(' · ')
    : fmtMoney(0);

  const toggleAll = () => {
    if (selected.size === sortedInvoices.length) setSelected(new Set());
    else setSelected(new Set(sortedInvoices.map(i => i.id)));
  };

  const handlePay = async () => {
    if (selected.size === 0) return;
    // Katı per-currency: tek tutar birden fazla para birimine dağıtılamaz
    if (totalBalanceByCcy.length > 1) {
      toast.error('Seçilen hizmet bedelleri farklı para birimlerinde. Toplu tahsilatı her para birimi için ayrı yapın.');
      return;
    }
    const amt = Number(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Geçerli bir tutar girin.');
      return;
    }
    if (!method) { setMethodErr(true); return; }
    setSaving(true);
    const { error } = await bulkRecordPayment({
      invoice_ids: Array.from(selected),
      total_amount: amt,
      payment_method: method,
      notes: notes.trim() || undefined,
    });
    setSaving(false);
    if (error) {
      toast.error((error as any)?.message ?? 'İşlem gerçekleştirilemedi.');
      return;
    }
    onDone();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{
        flex: 1, backgroundColor: U.isDark ? 'rgba(0,0,0,0.66)' : 'rgba(10,14,26,0.42)',
        justifyContent: 'center', alignItems: 'center', padding: 24,
        ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}),
      }}>
        <View style={{
          backgroundColor: U.surface, borderRadius: 24,
          width: '100%', maxWidth: 580, maxHeight: '90%', overflow: 'hidden',
          // @ts-ignore web
          boxShadow: modalShadowOf(U),
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 22, paddingTop: 22, paddingBottom: 14,
            borderBottomWidth: 1, borderBottomColor: U.hairline,
          }}>
            <View style={{
              width: 36, height: 36, borderRadius: 10,
              backgroundColor: CHIP_TONES.success.bg,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Banknote size={18} strokeWidth={1.8} color={CHIP_TONES.success.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: U.ink[900] }}>Toplu Tahsilat</Text>
              <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 1 }}>Birden fazla hizmet bedelini tek seferde tahsil et</Text>
            </View>
            <Pressable onPress={onClose} style={{
              width: 32, height: 32, borderRadius: 10,
              backgroundColor: U.ink[100], alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer' as any,
            }}>
              <X size={16} strokeWidth={1.8} color={U.ink[500]} />
            </Pressable>
          </View>

          {/* Invoice list */}
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator={false}>
            {/* Select all header */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 22, paddingVertical: 10,
            }}>
              <Pressable onPress={toggleAll} style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                cursor: 'pointer' as any,
              }}>
                <View style={{
                  width: 18, height: 18, borderRadius: 5,
                  borderWidth: 1.5,
                  borderColor: selected.size === sortedInvoices.length && sortedInvoices.length > 0 ? '#059669' : U.ink[300],
                  backgroundColor: selected.size === sortedInvoices.length && sortedInvoices.length > 0 ? '#059669' : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {selected.size === sortedInvoices.length && sortedInvoices.length > 0 && (
                    <Check size={11} strokeWidth={2.5} color="#FFF" />
                  )}
                </View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: CHIP_TONES.info.text }}>
                  {selected.size === sortedInvoices.length && sortedInvoices.length > 0 ? 'Tümünü kaldır' : 'Tümünü seç'}
                </Text>
              </Pressable>
              <Text style={{ fontSize: 11, color: U.ink[400] }}>{sortedInvoices.length} fatura</Text>
            </View>

            <View style={{ gap: 6, paddingHorizontal: 22, paddingBottom: 8 }}>
              {sortedInvoices.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                  <CircleCheck size={28} strokeWidth={1.4} color={CHIP_TONES.success.text} />
                  <Text style={{ fontSize: 13, color: U.ink[400] }}>Bekleyen hizmet bedeli yok</Text>
                </View>
              ) : sortedInvoices.map(inv => {
                const bal = Number(inv.total) - Number(inv.paid_amount);
                const sel = selected.has(inv.id);
                const overdue = inv.due_date && inv.due_date < today;
                return (
                  <Pressable
                    key={inv.id}
                    onPress={() => setSelected(prev => {
                      const n = new Set(prev);
                      n.has(inv.id) ? n.delete(inv.id) : n.add(inv.id);
                      return n;
                    })}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      padding: 12, borderRadius: 14,
                      backgroundColor: sel ? 'rgba(45,154,107,0.06)' : U.ink[50],
                      borderWidth: 1.5,
                      borderColor: sel ? '#059669' : overdue && !sel ? 'rgba(217,75,75,0.2)' : 'transparent',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <View style={{
                      width: 20, height: 20, borderRadius: 6,
                      borderWidth: 1.5,
                      borderColor: sel ? '#059669' : U.ink[300],
                      backgroundColor: sel ? '#059669' : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {sel && <Check size={12} strokeWidth={2.5} color="#FFF" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[900] }}>{inv.invoice_number}</Text>
                      <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 2 }} numberOfLines={1}>
                        {inv.clinic?.name ?? '—'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{
                        ...DISPLAY, fontSize: 14, letterSpacing: -0.3,
                        color: overdue ? CHIP_TONES.danger.text : U.ink[900],
                      }}>
                        {fmtMoney(bal, (inv as any).currency || 'TRY')}
                      </Text>
                      {inv.due_date && (
                        <Text style={{
                          fontSize: 10, marginTop: 2,
                          color: overdue ? CHIP_TONES.danger.text : U.ink[400],
                        }}>
                          {overdue ? 'gecti · ' : ''}{fmtDate(inv.due_date)}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Payment form */}
            {selected.size > 0 && (
              <View style={{
                marginHorizontal: 22, marginTop: 8, marginBottom: 8,
                padding: 16, borderRadius: 14,
                backgroundColor: U.ink[50], borderWidth: 1, borderColor: U.hairline,
                gap: 12,
              }}>
                {/* Amount */}
                <View>
                  <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: U.ink[500], marginBottom: 6 }}>
                    Odeme Tutari (TL)
                  </Text>
                  <TextInput
                    style={{
                      height: 44, paddingHorizontal: 14, borderRadius: 14,
                      borderWidth: 1, borderColor: U.fieldBorder,
                      backgroundColor: U.isDark ? U.surfaceSoft : '#FFF', fontSize: 14, color: U.ink[900],
                    }}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder={totalBalance.toFixed(2)}
                    placeholderTextColor={U.ink[400]}
                    keyboardType="decimal-pad"
                  />
                  <Text style={{ fontSize: 10, color: U.ink[400], marginTop: 4 }}>
                    Secili toplam: {selectedTotalLabel}
                  </Text>
                </View>

                {/* Method */}
                <View>
                  <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: U.ink[500], marginBottom: 6 }}>
                    Yontem
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {PAYMENT_METHODS.map(m => {
                      const active = method === m.v;
                      const MIcon = m.icon;
                      return (
                        <Pressable
                          key={m.v}
                          onPress={() => { setMethod(m.v); setMethodErr(false); }}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 5,
                            paddingHorizontal: 12, paddingVertical: 7,
                            borderRadius: 9999,
                            borderWidth: 1.5,
                            borderColor: active ? '#059669' : methodErr ? CHIP_TONES.danger.text : U.plainBtn.border,
                            backgroundColor: active ? (U.isDark ? 'rgba(45,154,107,0.22)' : 'rgba(45,154,107,0.06)') : U.plainBtn.bg,
                            cursor: 'pointer' as any,
                          }}
                        >
                          <MIcon size={13} strokeWidth={1.6} color={active ? '#059669' : U.ink[400]} />
                          <Text style={{
                            fontSize: 12, fontWeight: active ? '600' : '500',
                            color: active ? '#059669' : U.ink[500],
                          }}>
                            {m.l}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Notes */}
                <View>
                  <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: U.ink[500], marginBottom: 6 }}>
                    Not (opsiyonel)
                  </Text>
                  <TextInput
                    style={{
                      height: 44, paddingHorizontal: 14, borderRadius: 14,
                      borderWidth: 1, borderColor: U.fieldBorder,
                      backgroundColor: U.isDark ? U.surfaceSoft : '#FFF', fontSize: 14, color: U.ink[900],
                    }}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Ödeme notu..."
                    placeholderTextColor={U.ink[400]}
                  />
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 22, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: U.hairline,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: U.ink[500] }}>{selected.size} fatura secili</Text>
              {methodErr ? (
                <Text style={{ fontSize: 12, fontWeight: '600', color: CHIP_TONES.danger.text, marginTop: 2 }}>{autoT('Ödeme yöntemini seçin')}</Text>
              ) : null}
              {totalBalance > 0 && (
                <Text style={{ ...DISPLAY, fontSize: 16, letterSpacing: -0.3, color: U.ink[900] }}>
                  {selectedTotalLabel} toplam
                </Text>
              )}
            </View>
            <Pressable
              onPress={handlePay}
              disabled={selected.size === 0 || saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 20, paddingVertical: 12,
                borderRadius: 9999, backgroundColor: '#059669',
                opacity: (selected.size === 0 || saving) ? 0.4 : 1,
                cursor: 'pointer' as any,
              }}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Banknote size={14} strokeWidth={1.8} color="#FFF" />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Tahsil Et</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default InvoicesListScreen;
