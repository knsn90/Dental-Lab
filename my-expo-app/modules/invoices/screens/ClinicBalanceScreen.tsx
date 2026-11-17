import { EdgeSwipeBack } from '../../../core/ui/mobile/EdgeSwipeBack';
import { NavyBackButtonX } from '../../../core/ui/NavyBackButtonX';
import { localeTag } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { safeBack } from '../../../core/util/safeBack';
/**
 * ClinicBalanceScreen — Cari Hesap (Patterns Design Language)
 *
 * §10 Hero (glassmorphism), §09 tableCard, §05 cardSolid,
 * §04 CHIP_TONES, §05.5 search input, Lucide icons.
 *
 * Klinik satırına tıklayınca /statement/[clinicId] sayfasına yönlendirir.
 */
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, RefreshControl,
  TextInput, useWindowDimensions, Platform, Modal, ActivityIndicator, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';
import {
  ArrowLeft, ArrowRight, Search, X, Building2, AlertTriangle,
  Clock, Inbox, ChevronLeft, ChevronRight, FileText, Receipt, SlidersHorizontal, Check, Bell, MoreHorizontal, ChevronDown,
} from '../../../core/ui/icons';
import { SendReminderModal } from '../../finance-clinic/components/SendReminderModal';
import { sendBulkPaymentReminders } from '../../finance-clinic/api';

import { useClinicBalancesByCurrency, useUnbilledWorkOrders } from '../hooks/useInvoices';
import { createBulkInvoice } from '../api';
import { supabase } from '../../../core/api/supabase';
import { labTodayOf } from '../../../core/metrics/orderDefs';
import { cachedLabTz } from '../../../core/metrics/useLabToday';
import { toast } from '../../../core/ui/Toast';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { HubContext } from '../../../core/ui/HubContext';
import { useBaseCurrency } from '../../../core/money/baseCurrency';
import { formatMoney, CURRENCY_META, type Currency } from '../../../core/money/currency';
import { groupByCurrency } from '../../../core/money/aggregations';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import { useMobileTableText } from '../../../core/ui/MobileTableX';
import { FAB_CLEARANCE } from '../../../core/ui/pageMetrics';
import { isRTL } from '../../../core/i18n';
import { clinicCollected } from '../lib/discountPayment';
import { InvoiceDiscountField } from '../components/InvoiceDiscountField';
import {
  validateInvoiceDiscount, invoiceTotalsWithDiscount, invoiceDiscountRpcError, type InvoiceDiscountType,
} from '../lib/invoiceDiscount';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { useInvoiceApprovalEnabled } from '../../../core/store/labSettingsStore';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { AnchorMenu } from '../components/AnchorMenu';

/** Vadesi geçmiş alacak — tek tanım (2026-10-26): kliniğin avansı düşülmüş (v_clinic_balance_ccy.overdue_net);
 *  Özet'teki "hatırlatılacak" listesi ve hatırlatma tutarıyla aynı. Görünüm eskiyse brüt değere düşer. */
const netOverdue = (b: any): number => Number(b.overdue_net ?? b.overdue_amount) || 0;

/** v_clinic_balance_ccy.overdue_amount ile aynı tanım: iptal/taslak hariç, vade < lab günü, ödenmemiş. */
async function countOverdueInvoices(clinicId: string, currency: string): Promise<number> {
  const today = labTodayOf(cachedLabTz());
  let q = supabase.from('invoices').select('id, total, paid_amount, currency')
    .eq('clinic_id', clinicId).not('status', 'in', '(iptal,taslak)').lt('due_date', today);
  q = currency === 'TRY' ? q.or('currency.eq.TRY,currency.is.null') : q.eq('currency', currency);
  const { data, error } = await q;
  if (error) return 1;   // sayı alınamadı ama gecikme kesin var → acil ton korunur
  return (data ?? []).filter((i: any) => (Number(i.paid_amount) || 0) < (Number(i.total) || 0)).length || 1;
}

// ── Patterns tokens ─────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

// NOT: cardSolid / tableCard / CHIP_TONES modül sabitleri KALDIRILDI — hook
// çağıramadıkları için koyu temada beyaz kart + siyah metin olarak donuyorlardı.
// Karşılıkları `useInkUI()` içinde: U.cardSolid / U.tableCard / U.chipTones
// (açık tema değerleri birebir aynı).

// ── Helpers ──────────────────────────────────────────────────────────
// Katı per-currency: her tutar KENDİ para biriminde (base'e çevrilmez).
function fmtCur(n: number | string | null | undefined, currency?: string | null): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return '—';
  return formatMoney(Number(v) || 0, ((currency || 'TRY') as Currency), { fractionDigits: 2 });
}
function fmtDateShort(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString(localeTag(), { day: '2-digit', month: 'short' });
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function ClinicBalanceScreen() {
  useBaseCurrency();
  const theme = usePanelTheme();
  // Koyu tema: tüm nötr yüzey/metin buradan gelir (açık değerler DS.ink ile birebir).
  const U = useInkUI();
  const MT = useMobileTableText();
  // Hero — açık temada panel accent'i, koyu temada lacivert gradyan (HERO_NAVY).
  const heroInk = useWhiteHeroInk(theme.primary);
  const router = useRouter();
  const panelBase = String((useSegments() as string[])?.[0] ?? '(lab)');
  const isEmbedded = useContext(HubContext);
  const { rows, loading, refetch } = useClinicBalancesByCurrency();
  const { orders: unbilled, refetch: refetchUnbilled } = useUnbilledWorkOrders();

  // clinic_id → { count, total, work_order_ids[], byCcy (para birimi → tutar) }
  const unbilledByClinic = useMemo(() => {
    const map: Record<string, { count: number; total: number; ids: string[]; byCcy: Record<string, number>; name: string }> = {};
    for (const o of (unbilled ?? [])) {
      const k = (o as any).clinic_id;
      if (!k) continue;
      if (!map[k]) map[k] = { count: 0, total: 0, ids: [], byCcy: {}, name: String((o as any).clinic_name ?? '') };
      map[k].count += 1;
      map[k].total += Number((o as any).estimated_total ?? 0);
      map[k].ids.push((o as any).work_order_id);
      const tbc = (o as any).totals_by_currency as Record<string, any> | null | undefined;
      const pairs: Array<[string, number]> = tbc
        ? Object.entries(tbc).map(([c, v]) => [c, Number(v) || 0])
        : [['TRY', Number((o as any).estimated_total) || 0]];
      for (const [c, v] of pairs) if (v > 0) map[k].byCcy[c] = (map[k].byCcy[c] ?? 0) + v;
    }
    return map;
  }, [unbilled]);

  const [billingClinicId, setBillingClinicId] = useState<string | null>(null);
  // "Faturala" penceresi: fatura indirimi + indirimli toplam; RPC'den önce açılır, iptal edilebilir.
  const [billTarget, setBillTarget] = useState<{ clinicId: string; clinicName: string } | null>(null);
  const [billDiscType, setBillDiscType] = useState<InvoiceDiscountType>('percent');
  const [billDiscRaw, setBillDiscRaw] = useState('');
  const [billDiscErr, setBillDiscErr] = useState<string | null>(null);
  const [billErr, setBillErr] = useState<string | null>(null);
  const openBulkBill = (clinicId: string, clinicName: string) => {
    const bucket = unbilledByClinic[clinicId];
    if (!bucket || bucket.count === 0) return;
    setBillDiscType('percent'); setBillDiscRaw(''); setBillDiscErr(null); setBillErr(null);
    setBillTarget({ clinicId, clinicName });
  };
  const closeBulkBill = () => { if (!billingClinicId) setBillTarget(null); };
  const handleBulkBill = async (clinicId: string) => {
    const bucket = unbilledByClinic[clinicId];
    if (!bucket || bucket.count === 0) return;
    setBillErr(null);
    const disc = validateInvoiceDiscount(billDiscType, billDiscRaw);
    if (!disc.ok) { setBillDiscErr(disc.error); setBillErr(disc.error); return; }
    setBillDiscErr(null);
    // Vade: klinikten oku
    let dueDays = 30;
    try {
      const { data } = await supabase.from('clinics').select('default_payment_terms_days').eq('id', clinicId).maybeSingle();
      if (data?.default_payment_terms_days != null) dueDays = Number(data.default_payment_terms_days);
    } catch { /* default 30 */ }

    setBillingClinicId(clinicId);
    const { error } = await createBulkInvoice({
      clinic_id: clinicId,
      work_order_ids: bucket.ids,
      due_days: dueDays,
      notes: `Toplu fatura — ${bucket.count} sipariş`,
      discount_type: disc.value > 0 ? billDiscType : null,
      discount_value: disc.value,
    });
    setBillingClinicId(null);
    if (error) {
      const msg = (error as any).message as string | undefined;
      const dMsg = invoiceDiscountRpcError(msg, billDiscType, billDiscRaw);
      if (dMsg) { setBillDiscErr(dMsg); setBillErr(dMsg); return; }
      setBillErr(msg ?? 'hata');
      return;
    }
    setBillTarget(null);
    toast.success(`${bucket.count} ${autoT('sipariş tek hizmet bedelinde birleştirildi')}`);
    refreshAll();
  };
  const [search, setSearch] = useState('');
  // Hızlı süzgeç (tablo başı sekmeleri): Tümü · Gecikmiş · Faturalanacak · Onayda/Taslak
  type Seg = 'all' | 'overdue' | 'unbilled' | 'draft';
  const [seg, setSeg] = useState<Seg>('all');
  const approvalOn = useInvoiceApprovalEnabled();
  // Kesilmemiş taslak faturalar (ön ekstre açıkken = klinik onayında). Bakiyeye dahil değil.
  const [drafts, setDrafts] = useState<{ clinic_id: string; currency: string | null; total: number | null }[]>([]);
  const loadDrafts = useCallback(async () => {
    const { data } = await supabase.from('invoices').select('clinic_id, currency, total').eq('status', 'taslak');
    setDrafts(((data ?? []) as any[]).filter(r => r.clinic_id));
  }, []);
  useEffect(() => { void loadDrafts(); }, [loadDrafts]);
  const draftByClinic = useMemo(() => {
    const m: Record<string, { count: number; byCcy: Record<string, number> }> = {};
    for (const d of drafts) {
      const k = d.clinic_id;
      if (!m[k]) m[k] = { count: 0, byCcy: {} };
      m[k].count += 1;
      const c = d.currency || 'TRY';
      m[k].byCcy[c] = (m[k].byCcy[c] ?? 0) + (Number(d.total) || 0);
    }
    return m;
  }, [drafts]);
  const refreshAll = useCallback(() => { refetch(); refetchUnbilled(); void loadDrafts(); }, [refetch, refetchUnbilled, loadDrafts]);
  const insets = useSafeAreaInsets();
  type CBSortKey = 'balance_desc' | 'balance_asc' | 'overdue_desc' | 'name_asc';
  const [sortKey, setSortKey] = useState<CBSortKey>('balance_desc');
  const SORT_OPTIONS: { key: CBSortKey; label: string }[] = [
    { key: 'balance_desc', label: 'Bakiye ↓' },
    { key: 'balance_asc',  label: 'Bakiye ↑' },
    { key: 'overdue_desc', label: 'Gecikme ↓' },
    { key: 'name_asc',     label: 'İsim (A→Z)' },
  ];
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  // Hatırlatma modal state
  const [reminderTarget, setReminderTarget] = useState<{
    clinicId: string;
    clinicName: string;
    totalDue: number;
    overdueCount: number;
    currency: string;
  } | null>(null);
  const [bulkSending, setBulkSending] = useState(false);

  // Toplu hatırlatma — uygulamanın onay penceresiyle (tarayıcı confirm() değil); hata pencerede satır içi.
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const bulkInFlight = useRef(false);
  const handleBulkReminders = () => {
    if (bulkSending) return;
    const n = rows.filter(b => netOverdue(b) > 0).length;
    setConfirmState({
      title: autoT('Gecikenlere hatırlat'),
      highlight: `${n} ${autoT('kuruma')}`,
      message: autoT('ödeme hatırlatması gönderilecek. Her kurum kendi kanalından (e-posta / WhatsApp) bildirim alır.'),
      label: autoT('Gönder'),
      variant: 'warning',
      onConfirm: async () => {
        if (bulkInFlight.current) return;
        bulkInFlight.current = true;
        setBulkSending(true);
        try {
          const sent = await sendBulkPaymentReminders({ severity: 'warning' });
          setConfirmState(null);
          toast.success(`${sent} ${autoT('kuruma hatırlatma gönderildi')}`);
        } catch (e: any) {
          setConfirmState(st => st ? { ...st, error: `${autoT('Gönderilemedi')}: ${e?.message ?? e}` } : st);
        } finally { bulkInFlight.current = false; setBulkSending(false); }
      },
    });
  };

  // Liste satırları: bakiye görünümündeki kurumlar + yalnız faturalanmamış işi olan (henüz faturası olmayan)
  // kurumlar. Eklenenler sıfır bakiyeli satırdır; hero toplamları yalnız `rows`tan gelir.
  const allRows = useMemo(() => {
    const have = new Set(rows.map(r => r.clinic_id));
    const extra = Object.entries(unbilledByClinic)
      .filter(([id, u]) => !have.has(id) && u.count > 0)
      .map(([id, u]) => ({
        clinic_id: id, clinic_name: u.name || autoT('Sağlık Kurumu'), lab_id: null,
        currency: Object.entries(u.byCcy).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'TRY',
        invoice_count: 0, total_billed: 0, total_paid: 0, balance: 0, overdue_amount: 0,
        aging_current: 0, aging_30: 0, aging_60: 0, aging_90: 0, oldest_overdue_date: null,
      }));
    return [...rows, ...extra] as typeof rows;
  }, [rows, unbilledByClinic]);

  // Her satır = (klinik, para birimi). Sıralama tek-para satır bazında (gösterilen
  // toplam değil, yalnız sıralama sezgisi — para birimleri toplanmaz).
  const filtered = useMemo(() => {
    const list = allRows.filter(b => {
      if (seg === 'overdue' && netOverdue(b) <= 0) return false;
      if (seg === 'unbilled' && !(unbilledByClinic[b.clinic_id]?.count > 0)) return false;
      if (seg === 'draft' && !(draftByClinic[b.clinic_id]?.byCcy[b.currency || 'TRY'] > 0)) return false;
      if (search) return b.clinic_name.toLowerCase().includes(search.toLowerCase());
      return true;
    });
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'balance_desc': return Number(b.balance ?? 0) - Number(a.balance ?? 0);
        case 'balance_asc':  return Number(a.balance ?? 0) - Number(b.balance ?? 0);
        case 'overdue_desc': return netOverdue(b) - netOverdue(a);
        case 'name_asc':     return (a.clinic_name ?? '').localeCompare(b.clinic_name ?? '', 'tr');
        default:             return 0;
      }
    });
  }, [allRows, search, seg, sortKey, unbilledByClinic, draftByClinic]);

  // Hero & footer için per-currency gruplar (KATI — asla toplanmaz)
  // Lab alacağı (tek tanım): yalnız POZİTİF bakiyeler; bir kliniğin avans fazlası başkasının borcunu kapatmaz.
  const balanceByCcy = groupByCurrency(rows, b => ({ amount: Math.max(0, Number(b.balance)), currency: b.currency as Currency }), { keepZero: true });
  const billedByCcy  = groupByCurrency(rows, b => ({ amount: Number(b.total_billed), currency: b.currency as Currency }));
  const paidByCcy    = groupByCurrency(rows, b => ({ amount: clinicCollected(b), currency: b.currency as Currency }));
  const overdueByCcy = groupByCurrency(rows, b => ({ amount: netOverdue(b), currency: b.currency as Currency }));
  const overdueExists = rows.some(b => netOverdue(b) > 0);

  // Beyaz hero başlığı: çoklu-döviz TOPLANMAZ → en büyük dilim başlıkta,
  // kalanlar altında inline chip.
  const lead = balanceByCcy[0] ?? null;
  const rest = balanceByCcy.slice(1);
  const overdueCount = rows.filter(b => netOverdue(b) > 0).length;

  // Yaşlandırma — para birimi başına (her döviz kendi bar'ı)
  const agingByCcy = useMemo(() => {
    const m = new Map<string, { currency: string; current: number; d30: number; d60: number; d90: number }>();
    for (const b of rows) {
      const c = b.currency || 'TRY';
      const g = m.get(c) ?? { currency: c, current: 0, d30: 0, d60: 0, d90: 0 };
      g.current += Number(b.aging_current ?? 0);
      g.d30 += Number(b.aging_30 ?? 0);
      g.d60 += Number(b.aging_60 ?? 0);
      g.d90 += Number(b.aging_90 ?? 0);
      m.set(c, g);
    }
    return Array.from(m.values()).filter(g => g.current + g.d30 + g.d60 + g.d90 > 0);
  }, [rows]);

  const hasAging = agingByCcy.length > 0;

  // ── Hero özetleri — ana (en büyük) para biriminde; diğerleri açıklama satırında ──
  const leadCcy = (lead?.currency as string) || 'TRY';
  const sumCcy = (slices: { currency: Currency; total: number }[]) => slices.find(x => x.currency === leadCcy)?.total ?? 0;
  const leadOverdue = sumCcy(overdueByCcy);
  const leadBilled = sumCcy(billedByCcy);
  const leadPaid = sumCcy(paidByCcy);
  const leadCollectPct = leadBilled > 0 ? Math.min(100, (leadPaid / leadBilled) * 100) : 0;
  // Kesinleşmemiş = taslak/onaydaki faturalar + faturalanmamış işler (ekstre sayfasıyla aynı tanım)
  const leadPending = useMemo(() => {
    let t = 0;
    for (const d of Object.values(draftByClinic)) t += d.byCcy[leadCcy] ?? 0;
    for (const u of Object.values(unbilledByClinic)) t += u.byCcy[leadCcy] ?? 0;
    return t;
  }, [draftByClinic, unbilledByClinic, leadCcy]);
  const leadAging = agingByCcy.find(g => g.currency === leadCcy) ?? null;
  const draftLabel = approvalOn ? 'Onayda' : 'Taslak';

  // Sekme sayıları — satır (kurum × para birimi) bazında, aramayla birlikte
  const segCounts = useMemo(() => {
    const base = allRows.filter(b => !search || b.clinic_name.toLowerCase().includes(search.toLowerCase()));
    return {
      all: base.length,
      overdue: base.filter(b => netOverdue(b) > 0).length,
      unbilled: base.filter(b => unbilledByClinic[b.clinic_id]?.count > 0).length,
      draft: base.filter(b => draftByClinic[b.clinic_id]?.byCcy[b.currency || 'TRY'] > 0).length,
    };
  }, [allRows, search, unbilledByClinic, draftByClinic]);

  const openStatement = (clinicId: string) => {
    // GRUP ÖNEKİ ŞART: /statement/:id yolu hem (lab) hem (admin) grubunda tanımlı.
    // Öneksiz push belirsiz eşleşme yapıyor → URL değişiyor ama ekran yenilenmiyor
    // (sidebar'a tıklayınca sayfada kalma hatası).
    router.push(`/${panelBase}/statement/${clinicId}` as any);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* ── Standalone header ─────────────────────────────────── */}
      {!isEmbedded && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 58, paddingBottom: 8 }}>
          <NavyBackButtonX onPress={() => safeBack('/')} />
          <View style={{ flex: 1 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: U.ink[900] }}>Cari Hesap</Text>
            <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 2 }}>Sağlık kurumu bazlı bakiye özeti</Text>
          </View>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        // paddingBottom 48 idi: kartın "Toplam: …" alt satırı sağ-altta yüzen
        // Simanty FAB'ının altında kalıp okunamıyordu (FAB zIndex 9999).
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: FAB_CLEARANCE, gap: 14 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshAll} tintColor={U.ink[300]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero — "BEYAZ HERO" (core/ui/WhiteHero) — çerçeve aynı, içi sade:
            büyük toplam alacak · sağda kesinleşmemiş + vadesi geçen · tek yaşlandırma çubuğu. */}
        <WhiteHero
          kicker="Sağlık Kurumu Bakiyeleri"
          accent={theme.primary}
          title={
            lead ? (
              <>Toplam alacak <Text style={{ color: heroInk.accentInk }}>{formatMoney(lead.total, lead.currency, { fractionDigits: 0 })}</Text></>
            ) : '—'
          }
          description={
            `${filtered.length} kurum` +
            (overdueCount ? ` · ${overdueCount} tanesinin vadesi geçmiş` : ' · vadesi geçen yok')
          }
          stats={[
            { value: formatMoney(leadPending, leadCcy as Currency, { fractionDigits: 0 }), label: autoT('Kesinleşmemiş'), color: leadPending > 0 ? (U.isDark ? '#FAC775' : '#92560E') : undefined },
            { value: formatMoney(leadOverdue, leadCcy as Currency, { fractionDigits: 0 }), label: autoT('Vadesi geçen'), color: leadOverdue > 0 ? (U.isDark ? '#F09595' : '#A32D2D') : undefined },
          ]}
          actionsAlign="end"
          actions={overdueExists ? (
            <GlassTooltip title={autoT('Gecikenlere hatırlat')} text={autoT('Vadesi geçen tüm kurumlara ödeme hatırlatması gönderir')}>
              <Pressable
                onPress={handleBulkReminders}
                disabled={bulkSending}
                style={({ pressed }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10,
                  borderRadius: 999, backgroundColor: U.ink[900], opacity: bulkSending ? 0.55 : pressed ? 0.85 : 1,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <Bell size={14} color={U.onDarkPill} strokeWidth={1.8} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: U.onDarkPill }}>
                  {bulkSending ? autoT('Gönderiliyor…') : `${autoT('Gecikenlere hatırlat')} (${overdueCount})`}
                </Text>
              </Pressable>
            </GlassTooltip>
          ) : undefined}
        >
          {rest.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <MoneyMultiX slices={rest} variant="inline" colorBySign onAccent={heroInk.moneyOnAccent} />
            </View>
          )}

          {hasAging && leadAging ? (() => {
            const g = leadAging;
            const total = g.current + g.d30 + g.d60 + g.d90;
            return (
              <View style={{ marginTop: 18, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: heroInk.inkSoft }}>
                    {`${autoT('Yaşlandırma')} · ${g.currency}`}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: heroInk.ink }}>
                    {`${autoT('Kesinleşen')} ${fmtCur(leadBilled, leadCcy)} · ${autoT('Tahsil')} ${fmtCur(leadPaid, leadCcy)} · %${leadCollectPct.toFixed(0)}`}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: heroInk.tileBg }}>
                  {[
                    { v: g.current, color: '#2D9A6B' },
                    { v: g.d30,     color: '#E89B2A' },
                    { v: g.d60,     color: '#F97316' },
                    { v: g.d90,     color: '#D94B4B' },
                  ].map((seg, i) => {
                    const w = total > 0 ? (seg.v / total) * 100 : 0;
                    if (w === 0) return null;
                    return <View key={i} style={{ width: `${w}%` as any, height: 8, backgroundColor: seg.color }} />;
                  })}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                  {g.current > 0 && <AgingLegend label="Vadesi var" value={fmtCur(g.current, g.currency)} color="#2D9A6B" />}
                  {g.d30 > 0 && <AgingLegend label="1–30 gün" value={fmtCur(g.d30, g.currency)} color="#E89B2A" />}
                  {g.d60 > 0 && <AgingLegend label="31–60 gün" value={fmtCur(g.d60, g.currency)} color="#F97316" />}
                  {g.d90 > 0 && <AgingLegend label="61+ gün" value={fmtCur(g.d90, g.currency)} color="#D94B4B" />}
                </View>
                {/* Diğer para birimleri: ince çubuk + vadesi geçen tutar (her döviz kendi çubuğu, toplanmaz) */}
                {agingByCcy.filter(o => o.currency !== leadCcy).map(o => {
                  const t = o.current + o.d30 + o.d60 + o.d90;
                  const late = o.d30 + o.d60 + o.d90;
                  return (
                    <View key={o.currency} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      <Text style={{ width: 34, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: heroInk.inkSoft }}>{o.currency}</Text>
                      <View style={{ flex: 1, flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: heroInk.tileBg }}>
                        {[
                          { v: o.current, color: '#2D9A6B' }, { v: o.d30, color: '#E89B2A' },
                          { v: o.d60, color: '#F97316' },     { v: o.d90, color: '#D94B4B' },
                        ].map((sg, k) => t > 0 && sg.v > 0
                          ? <View key={k} style={{ width: `${(sg.v / t) * 100}%` as any, height: 4, backgroundColor: sg.color }} />
                          : null)}
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: late > 0 ? (U.isDark ? '#F09595' : '#A32D2D') : heroInk.inkFaint }}>
                        {late > 0 ? `${fmtCur(late, o.currency)} ${autoT('gecikmiş')}` : `${fmtCur(t, o.currency)}`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          })() : null}
        </WhiteHero>

        {/* ── Kurumlar: sade başlık (sekme + arama + sıralama kartın içinde) ── */}
        <View style={U.tableCard}>
          <View style={{
            paddingHorizontal: isDesktop ? 20 : 16, paddingTop: isDesktop ? 18 : 14, paddingBottom: 14, gap: 12,
            borderBottomWidth: 1, borderBottomColor: U.hairline,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', rowGap: 10 }}>
              <Text style={{ ...DISPLAY, fontSize: isDesktop ? 22 : 18, letterSpacing: isDesktop ? -0.4 : -0.3, color: U.ink[900] }}>
                Kurumlar
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 1 }}
                          contentContainerStyle={{ flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: U.ink[100] }}>
                {([
                  { key: 'all' as const,      label: autoT('Tümü'),          n: segCounts.all,      tone: null },
                  { key: 'overdue' as const,  label: autoT('Gecikmiş'),      n: segCounts.overdue,  tone: U.chipTones.danger.fg },
                  { key: 'unbilled' as const, label: autoT('Hizmet bedeli bekliyor'), n: segCounts.unbilled, tone: U.chipTones.warning.fg },
                  { key: 'draft' as const,    label: autoT(draftLabel),      n: segCounts.draft,    tone: U.chipTones.warning.fg },
                ]).filter(o => o.key === 'all' || o.n > 0 || seg === o.key).map(o => {
                  const active = seg === o.key;
                  return (
                    <Pressable
                      key={o.key}
                      onPress={() => setSeg(o.key)}
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
                        {`${o.label} · ${o.n}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={{ flex: 1 }} />
              <View style={{
                flexGrow: 1, flexShrink: 1, flexBasis: 200, minWidth: 160, maxWidth: isDesktop ? 280 : undefined,
                flexDirection: 'row', alignItems: 'center', gap: 8,
                height: 40, paddingHorizontal: 14, borderRadius: 9999,
                borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
              }}>
                <Search size={14} color={U.ink[400]} strokeWidth={1.8} />
                <TextInput
                  style={{ flex: 1, fontSize: 13.5, color: U.ink[900], outline: 'none' as any }}
                  placeholder="Sağlık kurumu ara..."
                  placeholderTextColor={U.ink[400]}
                  value={search}
                  onChangeText={setSearch}
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch('')} style={{ cursor: 'pointer' as any }}>
                    <X size={13} color={U.ink[400]} strokeWidth={2} />
                  </Pressable>
                )}
              </View>
              <AnchorMenu
                width={200}
                items={SORT_OPTIONS.map(o => ({ key: o.key, label: o.label, active: sortKey === o.key, onPress: () => setSortKey(o.key) }))}
                renderTrigger={(open) => (
                  <GlassTooltip title={autoT('Sırala')} text={autoT('Listeyi bakiye, gecikme ya da isme göre sırala')}>
                    <Pressable
                      onPress={open}
                      style={({ pressed }: any) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 999,
                        borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg, opacity: pressed ? 0.8 : 1,
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      })}
                    >
                      <SlidersHorizontal size={13} color={U.plainBtn.fg} strokeWidth={1.8} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: U.plainBtn.fg }}>
                        {SORT_OPTIONS.find(o => o.key === sortKey)?.label}
                      </Text>
                      <ChevronDown size={12} color={U.plainBtn.fg} strokeWidth={2} />
                    </Pressable>
                  </GlassTooltip>
                )}
              />
            </View>
          </View>

          {filtered.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48, gap: 10 }}>
              <Inbox size={32} color={U.ink[300]} strokeWidth={1.4} />
              <Text style={{ fontSize: 14, fontWeight: '500', color: U.ink[400] }}>
                {search || seg !== 'all' ? 'Sonuç bulunamadı' : 'Henüz klinik yok'}
              </Text>
            </View>
          ) : (
            <>
              {isDesktop ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, backgroundColor: U.surfaceSoft, borderBottomWidth: 1, borderBottomColor: U.hairline }}>
                  {[
                    { label: 'SAĞLIK KURUMU', flex: 2.6 },
                    { label: 'KESİNLEŞEN',  flex: 1.2, align: 'end' as const },
                    { label: 'TAHSİL',   flex: 1.3, align: 'end' as const },
                    { label: 'BAKİYE',   flex: 1.2, align: 'end' as const },
                    { label: 'GECİKMİŞ', flex: 1.2, align: 'end' as const },
                  ].map((h, i) => (
                    <Text key={i} style={{ flex: h.flex, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: U.ink[500], textAlign: h.align as any }}>
                      {h.label}
                    </Text>
                  ))}
                  <View style={{ width: 44 }} />
                </View>
              ) : null}

              {filtered.map((b, i) => {
                const balance = Number(b.balance);
                const overdue = netOverdue(b);
                const hasOverdue = overdue > 0;
                const billed = Number(b.total_billed);
                // Tahsil = faturaya yazilan odemeler + faturaya baglanmamis tahsilat − ekstre indirimi (tahsilat degil).
                const paid = clinicCollected(b);
                const pct = billed > 0 ? Math.min(100, (paid / billed) * 100) : 0;
                const ccy = b.currency || 'TRY';
                const bucket = unbilledByClinic[b.clinic_id];
                const draftAmt = draftByClinic[b.clinic_id]?.byCcy[ccy] ?? 0;
                const tone = hasOverdue ? U.chipTones.danger : U.chipTones.info;
                const days = b.oldest_overdue_date
                  ? Math.max(0, Math.floor((Date.now() - new Date(b.oldest_overdue_date + 'T00:00:00').getTime()) / 86400000)) : 0;
                // Ad altı tek satır: gecikme > onayda/taslak > faturalanacak > fatura sayısı
                const sub = hasOverdue && b.oldest_overdue_date
                  ? { text: `${autoT('vade')} ${fmtDateShort(b.oldest_overdue_date)} · ${days} ${autoT('gün')}`, color: U.chipTones.danger.fg }
                  : draftAmt > 0
                    ? { text: `${fmtCur(draftAmt, ccy)} ${autoT(approvalOn ? 'onayda' : 'taslakta')}`, color: U.chipTones.warning.fg }
                    : bucket?.count
                      ? { text: `${bucket.count} ${autoT('iş hizmet bedeli bekliyor')}`, color: U.chipTones.warning.fg }
                      : { text: `${Number(b.invoice_count)} ${autoT('hizmet bedeli')}`, color: U.ink[400] };
                const busyBill = billingClinicId === b.clinic_id;
                const menuItems = [
                  { key: 'open', label: autoT('Ekstreyi aç'), icon: FileText, onPress: () => openStatement(b.clinic_id) },
                  ...(balance > 0 ? [{ key: 'remind', label: autoT('Ödeme hatırlat'), icon: Bell, onPress: async () => {
                    // Toplam fatura sayısı değil, vadesi geçmiş açık fatura sayısı (tek faturalı
                    // her klinik "acil" tonla uyarılıyordu). Gecikme yoksa sorgu yapılmaz.
                    const overdueCount = netOverdue(b) > 0 ? await countOverdueInvoices(b.clinic_id, ccy) : 0;
                    setReminderTarget({
                      clinicId: b.clinic_id, clinicName: b.clinic_name, totalDue: balance,
                      overdueCount, currency: ccy,
                    });
                  } }] : []),
                  ...(bucket?.count && !busyBill ? [{ key: 'bill', label: `${bucket.count} ${autoT('sipariş için hizmet bedeli oluştur')}`, icon: Receipt, onPress: () => openBulkBill(b.clinic_id, b.clinic_name) }] : []),
                ];
                const rowMenu = (
                  <AnchorMenu
                    width={230}
                    items={menuItems}
                    renderTrigger={(open) => (
                      <Pressable
                        onPress={(e: any) => { e?.stopPropagation?.(); open(); }}
                        accessibilityRole="button"
                        accessibilityLabel={autoT('Diğer')}
                        hitSlop={6}
                        style={({ pressed, hovered }: any) => ({
                          width: isDesktop ? 32 : 44, height: isDesktop ? 32 : 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: hovered || pressed ? U.rowHover : 'transparent',
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        })}
                      >
                        {busyBill ? <ActivityIndicator size="small" color={U.ink[400]} /> : <MoreHorizontal size={16} color={U.ink[500]} strokeWidth={1.8} />}
                      </Pressable>
                    )}
                  />
                );
                const avatar = (
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: tone.fg }}>{initialsOf(b.clinic_name)}</Text>
                  </View>
                );

                return isDesktop ? (
                  <Pressable
                    key={`${b.clinic_id}-${b.currency}`}
                    onPress={() => openStatement(b.clinic_id)}
                    style={({ hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 20, paddingVertical: 12,
                      borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                      borderBottomColor: U.hairlineSoft,
                      backgroundColor: hovered ? U.rowHover : 'transparent',
                      cursor: 'pointer' as any,
                    })}
                  >
                    <View style={{ flex: 2.6, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      {avatar}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 13, fontWeight: '500', color: U.ink[900], flexShrink: 1 }} numberOfLines={1}>
                            {b.clinic_name}
                          </Text>
                          {ccy !== leadCcy ? <CcyBadge currency={ccy} /> : null}
                        </View>
                        <Text numberOfLines={1} style={{ fontSize: 11, color: sub.color, marginTop: 1 }}>{sub.text}</Text>
                      </View>
                    </View>

                    <Text style={{ flex: 1.2, fontSize: 13, color: U.ink[700], textAlign: 'end' as any, fontVariant: ['tabular-nums'] }}>
                      {fmtCur(billed, ccy)}
                    </Text>

                    <View style={{ flex: 1.3, alignItems: 'flex-end', paddingStart: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: '500', color: U.chipTones.success.fg, fontVariant: ['tabular-nums'] }}>
                        {fmtCur(paid, ccy)}
                      </Text>
                      <View style={{ width: '100%', maxWidth: 120, height: 3, borderRadius: 2, backgroundColor: U.ink[100], marginTop: 4, overflow: 'hidden' }}>
                        <View style={{ width: `${pct}%` as any, height: 3, backgroundColor: '#2D9A6B' }} />
                      </View>
                    </View>

                    <Text style={{ flex: 1.2, fontSize: 13, fontWeight: '600', textAlign: 'end' as any, fontVariant: ['tabular-nums'],
                                   color: balance > 0 ? U.ink[900] : U.chipTones.success.fg }}>
                      {fmtCur(balance, ccy)}
                    </Text>

                    <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                      {hasOverdue ? (
                        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: U.chipTones.danger.bg }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: U.chipTones.danger.fg }}>{fmtCur(overdue, ccy)}</Text>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 11, color: U.ink[300] }}>—</Text>
                      )}
                    </View>

                    <View style={{ width: 44, alignItems: 'flex-end' }}>{rowMenu}</View>
                  </Pressable>
                ) : (
                  <Pressable
                    key={`${b.clinic_id}-${b.currency}`}
                    onPress={() => openStatement(b.clinic_id)}
                    style={({ pressed }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      paddingStart: 16, paddingEnd: 8, paddingVertical: 12,
                      borderBottomWidth: i < filtered.length - 1 ? 1 : 0, borderBottomColor: U.hairlineSoft,
                      backgroundColor: pressed ? U.rowHover : 'transparent',
                    })}
                  >
                    {avatar}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={MT.title} numberOfLines={1}>{b.clinic_name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        {ccy !== leadCcy ? <CcyBadge currency={ccy} /> : null}
                        <Text style={[MT.meta, { color: sub.color, flexShrink: 1 }]} numberOfLines={1}>{sub.text}</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text numberOfLines={1} style={[MT.amount, { color: balance > 0 ? U.ink[900] : U.chipTones.success.fg }]}>
                        {fmtCur(balance, ccy)}
                      </Text>
                      {hasOverdue ? (
                        <Text style={[MT.amountSub, { color: U.chipTones.danger.fg, marginTop: 2 }]}>{`${autoT('Gecikmiş')} ${fmtCur(overdue, ccy)}`}</Text>
                      ) : (
                        <Text style={[MT.amountSub, { color: U.ink[400], marginTop: 2 }]}>{`%${pct.toFixed(0)} ${autoT('tahsil')}`}</Text>
                      )}
                    </View>
                    {rowMenu}
                  </Pressable>
                );
              })}

              {/* Footer — sade (lacivert bant yok) */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                paddingHorizontal: isDesktop ? 20 : 16, paddingVertical: 12,
                borderTopWidth: 1, borderTopColor: U.hairline, backgroundColor: U.surfaceSoft,
              }}>
                <Text style={{ fontSize: 11, color: U.ink[500] }}>
                  {new Set(filtered.map(f => f.clinic_id)).size} sağlık kurumu
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700] }}>Toplam:</Text>
                <MoneyMultiX slices={balanceByCcy} variant="inline" colorBySign />
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* ── Faturala penceresi (fatura indirimi) ─────────────── */}
      <Modal visible={!!billTarget} transparent animationType="fade" onRequestClose={closeBulkBill}>
        {billTarget ? (() => {
          const bucket = unbilledByClinic[billTarget.clinicId];
          const busy = billingClinicId === billTarget.clinicId;
          const pairs = Object.entries(bucket?.byCcy ?? {}).sort((a, b) => b[1] - a[1]);
          const totalLabel = pairs.length ? pairs.map(([c, v]) => fmtCur(v, c)).join(' · ') : '—';
          const v = validateInvoiceDiscount(billDiscType, billDiscRaw);
          const disc = v.ok && v.value > 0 && pairs.length === 1
            ? invoiceTotalsWithDiscount(pairs[0][1], 0, billDiscType, v.value) : null;
          const web = Platform.OS === 'web' ? ({ cursor: busy ? 'not-allowed' : 'pointer' } as any) : {};
          return (
            <View style={U.modalOverlay}>
              <View style={[U.modalCard, { maxWidth: 440 }]}>
                <View style={U.modalHeaderRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={U.modalTitle} numberOfLines={1}>{autoT('Toplu hizmet bedeli')}</Text>
                    <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 2 }} numberOfLines={1}>
                      {`${billTarget.clinicName} · ${bucket?.count ?? 0} ${autoT('sipariş')}`}
                    </Text>
                  </View>
                  <GlassTooltip title={autoT('Kapat')} text={autoT('Pencereyi kaydetmeden kapat')} placement="bottom">
                    <Pressable onPress={closeBulkBill} hitSlop={8} accessibilityRole="button" accessibilityLabel={autoT('Kapat')}
                      style={{ ...U.modalCloseBtn, ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}) }}>
                      <X size={15} color={U.ink[500]} strokeWidth={2} />
                    </Pressable>
                  </GlassTooltip>
                </View>

                <View style={{ padding: 18, gap: 14 }}>
                  <InvoiceDiscountField
                    type={billDiscType}
                    value={billDiscRaw}
                    error={billDiscErr}
                    disabled={busy}
                    onChange={(t, val) => { setBillDiscType(t); setBillDiscRaw(val); setBillDiscErr(null); setBillErr(null); }}
                  />
                  <View style={{ borderRadius: 14, backgroundColor: U.surfaceSoft, borderWidth: 1, borderColor: U.hairline, padding: 14, gap: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <Text style={{ flex: 1, fontSize: 12.5, color: U.ink[700] }}>{autoT('Toplam')}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>{totalLabel}</Text>
                    </View>
                    {disc ? (
                      <>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                          <Text style={{ flex: 1, fontSize: 12.5, color: U.ink[700] }}>{autoT('İndirim')}</Text>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>{`−${fmtCur(disc.discount, pairs[0][0])}`}</Text>
                        </View>
                        <View style={{ borderTopWidth: 1, borderTopColor: U.hairline, paddingTop: 8, gap: 2 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                            <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: U.ink[900] }}>{autoT('Tahmini indirimli toplam')}</Text>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: U.ink[900] }}>{fmtCur(disc.subtotal, pairs[0][0])}</Text>
                          </View>
                          <Text style={{ fontSize: 11, color: U.ink[400] }}>
                            {autoT('KDV öncesi; tarama ücretleri ve acil farkı hizmet bedelinde eklenir.')}
                          </Text>
                        </View>
                        {disc.subtotal <= 0 ? (
                          <Text style={{ fontSize: 12, fontWeight: '600', color: U.chipTones.warning.fg }}>
                            {autoT('Hizmet bedeli tutarı 0 olacak.')}
                          </Text>
                        ) : null}
                      </>
                    ) : null}
                  </View>
                </View>

                {/* Alt bar — hata düğmenin yanında */}
                <View style={{
                  flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'flex-end',
                  paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14 + (Platform.OS === 'web' ? 0 : insets.bottom),
                  borderTopWidth: 1, borderTopColor: U.hairline,
                }}>
                  {billErr ? (
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }}>{autoT(billErr)}</Text>
                  ) : null}
                  <Pressable onPress={closeBulkBill} disabled={busy}
                    style={[{
                      paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
                      borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
                    }, web]}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Vazgeç')}</Text>
                  </Pressable>
                  <GlassTooltip title={autoT('Hizmet bedeli oluştur')} text={autoT('Hizmet bedeli bekleyen siparişleri tek taslakta birleştir')} enabled={!busy}>
                    <Pressable onPress={() => handleBulkBill(billTarget.clinicId)} disabled={busy}
                      style={[{
                        flexDirection: 'row', alignItems: 'center', gap: 7,
                        paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
                        backgroundColor: U.ink[900], opacity: busy ? 0.6 : 1,
                      }, web]}>
                      {busy ? <ActivityIndicator size="small" color={U.onDarkPill} /> : <Receipt size={14} color={U.onDarkPill} strokeWidth={1.8} />}
                      <Text style={{ fontSize: 13, fontWeight: '700', color: U.onDarkPill }}>{autoT('Hizmet bedeli oluştur')}</Text>
                    </Pressable>
                  </GlassTooltip>
                </View>
              </View>
            </View>
          );
        })() : null}
      </Modal>

      {/* ── Ödeme Hatırlatması Modal ─────────────────────────── */}
      {reminderTarget && (
        <SendReminderModal
          visible={!!reminderTarget}
          clinicId={reminderTarget.clinicId}
          clinicName={reminderTarget.clinicName}
          totalDue={reminderTarget.totalDue}
          overdueCount={reminderTarget.overdueCount}
          currency={reminderTarget.currency}
          onClose={() => setReminderTarget(null)}
        />
      )}

      <ConfirmDialog state={confirmState} onClose={() => { if (!bulkSending) setConfirmState(null); }} />

      {/* Kenardan sağa kaydırınca geri — geri butonuyla AYNI fonksiyon */}
      <EdgeSwipeBack onBack={() => safeBack('/')} />
    </View>
  );
}

/** Kurum adının baş harfleri ("Dt."/"Dr." öneki atlanır) — satır avatarı. */
function initialsOf(name: string | null | undefined): string {
  const words = String(name ?? '').replace(/^(dt|dr|prof|doç)\.?\s+/i, '').trim().split(/\s+/).filter(Boolean);
  const s = (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '');
  return (s || '—').toLocaleUpperCase('tr');
}

// ─── Hero Stat ───────────────────────────────────────────────────────
function HeroStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View>
      <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)' }}>
        {label}
      </Text>
      <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.3, color, marginTop: 4 }}>
        {value}
      </Text>
    </View>
  );
}

// ─── Aging Legend (hero bar) ─────────────────────────────────────────
function AgingLegend({ label, value, color }: { label: string; value: string; color: string }) {
  const heroInk = useWhiteHeroInk();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 11, color: heroInk.inkSoft, fontWeight: '500' }}>{label}</Text>
      <Text style={{ fontSize: 11, fontWeight: '700', color: heroInk.ink }}>{value}</Text>
    </View>
  );
}

// Para birimi rozeti — her cari satırının hangi dövizde olduğunu gösterir.
function CcyBadge({ currency }: { currency: string }) {
  // Her alt-bileşen KENDİ hook'unu alır (prop ile geçirilmez).
  const U = useInkUI();
  const sym = CURRENCY_META[(currency as Currency)]?.symbol ?? currency;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: U.chipNeutral }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: U.ink[500] }}>{sym}</Text>
      <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.3, color: U.ink[400] }}>{currency}</Text>
    </View>
  );
}

export default ClinicBalanceScreen;
