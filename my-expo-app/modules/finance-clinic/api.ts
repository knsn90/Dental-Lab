/**
 * Klinik & Muayenehane Mali İşlemler — veri katmanı.
 *
 * Klinik tarafından bakış: laboratuvar fatura kesti → klinik ödemekle yükümlü.
 *
 * Tablolar:
 *  • invoices        — fatura kayıtları (status, total_amount, paid_amount, due_date)
 *  • payment_intents — online POS ödeme niyeti (Stripe vb.)
 *  • payments        — manuel ödeme kayıtları (havale, nakit, çek)
 *  • work_orders     — henüz faturalanmamış teslim edilmiş siparişler
 */

import { supabase } from '../../core/api/supabase';
import { getActiveLabId } from '../../core/store/activeLabStore';
import { getBaseCurrency } from '../../core/money/baseCurrency';

// Çoklu-lab: aktif lab seçiliyse sorguyu o lab'a daralt (UX bölmesi; RLS klinik
// verisini sahiplikle sınırlar). Aktif lab yoksa (tek-lab/lab-admin) NO-OP.
// invoices tablosu için col='lab_id'; payments (join) için col='invoices.lab_id'.
function labEq<T>(q: T, col: string = 'lab_id'): T {
  const al = getActiveLabId();
  return (al ? (q as any).eq(col, al) : q) as T;
}
import { rateToBase, useRateStore } from '../../core/money/rateCache';
import { groupByCurrency, type CurrencyTotal } from '../../core/money/aggregations';
import type { Currency } from '../../core/money/currency';
import { ymdLocal } from '../../core/util/dates';

/** Katı per-currency: {amount,currency} listesini para birimine göre grupla. */
function byCcy(items: { amount: number; currency: string }[]): CurrencyTotal[] {
  return groupByCurrency(items, i => ({ amount: Number(i.amount) || 0, currency: (i.currency || 'TRY') as Currency }));
}

/**
 * Tutar listesini topla. Hepsi tek para birimindeyse o birimde döner (gösterimde
 * M() bugünün kuruyla baz paraya çevirir). Karışık para birimi varsa baz paraya
 * çevrilip toplanır ve baz birim döner.
 */
function sumMoney(items: { amount: number; currency: string }[]): { amount: number; currency: string } {
  const base = getBaseCurrency();
  const curs = new Set(items.filter(i => i.amount).map(i => i.currency));
  if (curs.size <= 1) {
    const cur = [...curs][0] ?? base;
    return { amount: items.reduce((s, i) => s + i.amount, 0), currency: cur };
  }
  return { amount: items.reduce((s, i) => s + i.amount * rateToBase(i.currency), 0), currency: base };
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Tipler                                                                */
/* ────────────────────────────────────────────────────────────────────── */

export interface FinanceOverview {
  /** Tüm açık fatura toplamı (kesildi + kısmi_odendi'nin kalan tutarı) */
  total_due: number;
  total_due_currency: string;
  /** Vadesi geçmiş açık fatura toplamı */
  overdue: number;
  overdue_currency: string;
  /** Bu ay ödenen toplam */
  this_month_paid: number;
  this_month_paid_currency: string;
  /** Katı per-currency dağılımlar (gösterimde MoneyMultiX) — base skalarlar yalnız oran/alert için */
  total_due_ccy: CurrencyTotal[];
  overdue_ccy: CurrencyTotal[];
  this_month_paid_ccy: CurrencyTotal[];
  /** Faturalanmayı bekleyen teslim edilmiş sipariş toplamı */
  pending_uninvoiced: number;
  /** Bu ay kesilmiş fatura sayısı */
  this_month_invoiced_count: number;
  /** Vadesi 7 gün içinde gelen fatura sayısı */
  upcoming_count: number;
  /** Vadesi geçen fatura sayısı */
  overdue_count: number;
  /** Açık fatura sayısı */
  open_invoices_count: number;
}

export interface ClinicInvoiceRow {
  id: string;
  invoice_no: string | null;
  issue_date: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  remaining: number;
  currency: string;            // faturanın kendi para birimi (EUR/USD/…); gösterimde baz'a çevrilir
  status: string;
  /** Faturanın bağlı olduğu işin hastası/siparişi — hekim her sekmede görmek istiyor. */
  patient_name?: string | null;
  order_no?: string | null;
  days_overdue: number;        // negatif → vade gelmedi, pozitif → geciken gün
  notes?: string | null;
}

export interface StatementLine {
  id: string;
  kind: 'invoice' | 'payment';
  date: string;
  description: string;
  invoice_id?: string | null;
  invoice_no?: string | null;
  doctor_id?: string | null;
  doctor_name?: string | null;
  /** Faturanın bağlı olduğu işin hastası — hekim ekstrede görmek istiyor. */
  patient_name?: string | null;
  order_no?: string | null;
  /** Borçlandıran tutar (fatura kesimi → +) — satırın kendi para biriminde */
  debit: number;
  /** Borç azaltan tutar (ödeme → +) — satırın kendi para biriminde */
  credit: number;
  /** Satırın para birimi (debit/credit bunun cinsinden) */
  currency: string;
  /** Sonraki bakiye — BAZ para biriminde (çok-para-birimli net) */
  balance: number;
}

export interface ClinicDoctorOption {
  id: string;
  full_name: string;
}

/* ───── Grafikler ───── */
export interface MonthlyFlowPoint {
  month: string;       // 'YYYY-MM'
  label: string;       // 'May'
  invoiced: number;    // bu ayda kesilen fatura toplamı
  paid: number;        // bu ayda yapılan tahsilat toplamı
}

export interface AgingBucket {
  key: 'current' | 'd30' | 'd60' | 'd90' | 'd90p';
  label: string;
  amount: number;
  count: number;
}

export interface MethodSlice {
  method: string;         // 'havale' | 'nakit' | 'kart' | 'cek' | …
  label: string;          // gösterim için
  amount: number;
  count: number;
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type SubmissionMethod = 'havale' | 'eft' | 'kart' | 'nakit' | 'cek' | 'diger';

export interface PaymentSubmissionRow {
  id: string;
  invoice_id: string | null;
  invoice_no?: string | null;
  amount: number;
  currency: string;
  payment_method: SubmissionMethod;
  payment_date: string;
  reference_no: string | null;
  bank_name: string | null;
  sender_name: string | null;
  receipt_url: string | null;
  notes: string | null;
  status: SubmissionStatus;
  submitted_at: string;
  reviewed_at?: string | null;
  reject_reason?: string | null;
  /** Faturanın bağlı olduğu işin hastası/siparişi — hekim her sekmede görmek istiyor. */
  patient_name?: string | null;
  order_no?: string | null;
  approved_payment_id?: string | null;
}

export interface SubmitPaymentInput {
  clinicId: string;
  amount: number;
  method: SubmissionMethod;
  paymentDate: string;        // 'YYYY-MM-DD'
  invoiceId?: string | null;
  doctorId?: string | null;
  referenceNo?: string | null;
  bankName?: string | null;
  senderName?: string | null;
  receiptUrl?: string | null;
  notes?: string | null;
}

export interface CurrencyCharts {
  currency: string;
  monthly_flow: MonthlyFlowPoint[];
  aging: AgingBucket[];
  payment_methods: MethodSlice[];
}

export interface OverviewCharts {
  // Legacy base-toplam (yalnız hero sparkline + collectionRate oranı için)
  monthly_flow: MonthlyFlowPoint[];
  aging: AgingBucket[];
  payment_methods: MethodSlice[];
  // Katı per-currency: her para birimi için ayrı seri (grafik kartları bunu çizer)
  byCurrency: CurrencyCharts[];
}

export interface PaymentRow {
  id: string;
  invoice_id: string;
  invoice_no?: string | null;
  amount: number;
  currency: string;
  payment_date: string;
  payment_method: string;
  reference_no?: string | null;
  /** Faturanın bağlı olduğu işin hastası/siparişi — hekim her sekmede görmek istiyor. */
  patient_name?: string | null;
  order_no?: string | null;
}

export interface PaymentLinkRow {
  id: string;
  invoice_id: string;
  invoice_no?: string | null;
  token: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  paid_at?: string | null;
  /** Faturanın bağlı olduğu işin hastası/siparişi — hekim her sekmede görmek istiyor. */
  patient_name?: string | null;
  order_no?: string | null;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Yardımcı: tarih farkları                                              */
/* ────────────────────────────────────────────────────────────────────── */

const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysDiff = (from: string | null | undefined): number => {
  if (!from) return 0;
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  return Math.floor((today0().getTime() - d.getTime()) / 86400000);
};

/* ────────────────────────────────────────────────────────────────────── */
/*  Özet (Overview) — tek seferde bütün KPI'lar                            */
/* ────────────────────────────────────────────────────────────────────── */

export async function fetchOverview(clinicId: string): Promise<FinanceOverview> {
  const today    = ymdLocal(); // yerel gün — UTC kayması yok
  const monthBeg = new Date(); monthBeg.setDate(1); monthBeg.setHours(0, 0, 0, 0);
  const monthBegStr = ymdLocal(monthBeg);
  const in7days  = new Date(); in7days.setDate(in7days.getDate() + 7);
  const in7str = ymdLocal(in7days);

  const [invRes, payRes] = await Promise.all([
    labEq(supabase
      .from('invoices')
      .select('id, status, total_amount:total, paid_amount, due_date, issue_date, currency')
      .eq('clinic_id', clinicId)
      .neq('status', 'iptal')),
    labEq(supabase
      .from('payments')
      .select('amount, payment_date, invoices!inner(clinic_id, currency)')
      .eq('invoices.clinic_id', clinicId)
      .gte('payment_date', monthBegStr), 'invoices.lab_id'),
  ]);
  // NOT: work_orders şu an clinic_id/invoice_id sütunlarını taşımıyor —
  // "faturalanmamış teslim edilen iş emirleri" hesabı geçici olarak 0.

  if (invRes.error) throw invRes.error;   // sessiz sıfır KPI yerine hatayı yüzeye çıkar
  const base = getBaseCurrency();
  const invoices = (invRes.data ?? []) as any[];
  const dueItems: { amount: number; currency: string }[] = [];
  const overdueItems: { amount: number; currency: string }[] = [];
  let upcoming_count = 0, overdue_count = 0, open_invoices_count = 0;
  let this_month_invoiced_count = 0;

  invoices.forEach(inv => {
    const cur = inv.currency || base;
    const remaining = Math.max(0, Number(inv.total_amount ?? 0) - Number(inv.paid_amount ?? 0));
    const open = inv.status !== 'odendi' && inv.status !== 'taslak';
    if (open && remaining > 0) {
      dueItems.push({ amount: remaining, currency: cur });
      open_invoices_count += 1;
      if (inv.due_date && inv.due_date < today) {
        overdueItems.push({ amount: remaining, currency: cur });
        overdue_count += 1;
      } else if (inv.due_date && inv.due_date <= in7str) {
        upcoming_count += 1;
      }
    }
    if (inv.issue_date && inv.issue_date >= monthBegStr) this_month_invoiced_count += 1;
  });

  const paidItems = (payRes.data ?? []).map((p: any) => ({
    amount: Number(p.amount ?? 0), currency: p.invoices?.currency || base,
  }));
  const due  = sumMoney(dueItems);
  const od   = sumMoney(overdueItems);
  const paid = sumMoney(paidItems);
  const pending_uninvoiced = 0;

  return {
    total_due:   Math.round(due.amount * 100) / 100,
    total_due_currency: due.currency,
    overdue:     Math.round(od.amount * 100) / 100,
    overdue_currency: od.currency,
    this_month_paid: Math.round(paid.amount * 100) / 100,
    this_month_paid_currency: paid.currency,
    // Katı per-currency dağılımlar
    total_due_ccy: byCcy(dueItems),
    overdue_ccy: byCcy(overdueItems),
    this_month_paid_ccy: byCcy(paidItems),
    pending_uninvoiced: Math.round(pending_uninvoiced * 100) / 100,
    this_month_invoiced_count,
    upcoming_count,
    overdue_count,
    open_invoices_count,
  };
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Bekleyen / vadesi geçen / yaklaşan faturalar                         */
/* ────────────────────────────────────────────────────────────────────── */

export async function fetchOpenInvoices(clinicId: string): Promise<ClinicInvoiceRow[]> {
  const { data, error } = await labEq(supabase
    .from('invoices')
    .select('id, invoice_no:invoice_number, issue_date, due_date, total_amount:total, paid_amount, status, notes, currency, work_order:work_orders!invoices_work_order_id_fkey(order_number, patient_name)')
    .eq('clinic_id', clinicId)
    .in('status', ['kesildi', 'kismi_odendi']))
    .order('due_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  const base = getBaseCurrency();
  return (data ?? []).map((inv: any): ClinicInvoiceRow => {
    const remaining = Math.max(0, Number(inv.total_amount ?? 0) - Number(inv.paid_amount ?? 0));
    return {
      id: inv.id,
      invoice_no: inv.invoice_no ?? null,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      total_amount: Number(inv.total_amount ?? 0),
      paid_amount: Number(inv.paid_amount ?? 0),
      remaining,
      currency: inv.currency || base,
      status: inv.status,
      days_overdue: daysDiff(inv.due_date),
      notes: inv.notes,
      patient_name: inv.work_order?.patient_name ?? null,
      order_no: inv.work_order?.order_number ?? null,
    };
  });
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Cari Ekstre — kronolojik tüm hareketler                                */
/* ────────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────── */
/*  Grafikler — son 6 ay akışı, yaşlandırma, yöntem dağılımı              */
/* ────────────────────────────────────────────────────────────────────── */

export async function fetchOverviewCharts(clinicId: string): Promise<OverviewCharts> {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const today = iso(now);

  // 6 ay öncesinin ilk günü
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const sixStr = iso(sixMonthsAgo);

  // Son 90 gün
  const d90 = new Date(now); d90.setDate(d90.getDate() - 90);
  const d90Str = iso(d90);

  // Grafik tutarları çok-para-birimli olabilir → hepsini baz paraya çevirip
  // karşılaştırılabilir kıl (eksen baz sembolüyle gösteriliyor). Kurları bekle.
  await useRateStore.getState().load();
  const base = getBaseCurrency();

  const [invRes, payRes, methodRes] = await Promise.all([
    labEq(supabase
      .from('invoices')
      .select('issue_date, total_amount:total, paid_amount, due_date, status, currency')
      .eq('clinic_id', clinicId)
      .neq('status', 'iptal')
      .gte('issue_date', sixStr)),
    labEq(supabase
      .from('payments')
      .select('amount, payment_date, invoices!inner(clinic_id, currency)')
      .eq('invoices.clinic_id', clinicId)
      .gte('payment_date', sixStr), 'invoices.lab_id'),
    labEq(supabase
      .from('payments')
      .select('amount, payment_method, invoices!inner(clinic_id, currency)')
      .eq('invoices.clinic_id', clinicId)
      .gte('payment_date', d90Str), 'invoices.lab_id'),
  ]);

  if (invRes.error)    throw invRes.error;
  if (payRes.error)    throw payRes.error;
  if (methodRes.error) throw methodRes.error;

  // ── 1) Aylık akış (son 6 ay) ─────────────────────────────────────────
  const months: MonthlyFlowPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({
      month: ym,
      label: MONTH_LABEL_SHORT[d.getMonth()],
      invoiced: 0,
      paid: 0,
    });
  }
  const mapByMonth = new Map(months.map(m => [m.month, m]));
  (invRes.data ?? []).forEach((inv: any) => {
    const ym = String(inv.issue_date ?? '').slice(0, 7);
    const slot = mapByMonth.get(ym);
    if (slot) slot.invoiced += Number(inv.total_amount ?? 0) * rateToBase(inv.currency || base);
  });
  (payRes.data ?? []).forEach((p: any) => {
    const ym = String(p.payment_date ?? '').slice(0, 7);
    const slot = mapByMonth.get(ym);
    if (slot) slot.paid += Number(p.amount ?? 0) * rateToBase(p.invoices?.currency || base);
  });

  // ── 2) Yaşlandırma — açık faturalar (vadesi dolanlar dahil) ──────────
  const aging: Record<AgingBucket['key'], AgingBucket> = {
    current: { key: 'current', label: 'Vadesi Gelmedi', amount: 0, count: 0 },
    d30:     { key: 'd30',     label: '1-30 Gün',       amount: 0, count: 0 },
    d60:     { key: 'd60',     label: '31-60 Gün',      amount: 0, count: 0 },
    d90:     { key: 'd90',     label: '61-90 Gün',      amount: 0, count: 0 },
    d90p:    { key: 'd90p',    label: '90+ Gün',        amount: 0, count: 0 },
  };
  (invRes.data ?? []).forEach((inv: any) => {
    if (inv.status === 'odendi' || inv.status === 'taslak') return;
    const remaining = Math.max(0, Number(inv.total_amount ?? 0) - Number(inv.paid_amount ?? 0));
    if (remaining <= 0) return;
    const days = daysDiff(inv.due_date);
    let b: AgingBucket['key'];
    if (days <= 0)        b = 'current';
    else if (days <= 30)  b = 'd30';
    else if (days <= 60)  b = 'd60';
    else if (days <= 90)  b = 'd90';
    else                  b = 'd90p';
    aging[b].amount += remaining * rateToBase(inv.currency || base);
    aging[b].count  += 1;
  });

  // ── 3) Yöntem dağılımı (son 90 gün) ──────────────────────────────────
  const methodMap = new Map<string, MethodSlice>();
  (methodRes.data ?? []).forEach((p: any) => {
    const m = String(p.payment_method ?? 'diger').toLowerCase();
    const slot = methodMap.get(m) ?? { method: m, label: methodLabel(m), amount: 0, count: 0 };
    slot.amount += Number(p.amount ?? 0) * rateToBase(p.invoices?.currency || base);
    slot.count  += 1;
    methodMap.set(m, slot);
  });

  // ── Per-currency seriler (katı per-currency: orijinal tutar, çevirisiz) ──
  const curSet = new Set<string>();
  (invRes.data ?? []).forEach((i: any) => curSet.add(i.currency || base));
  (payRes.data ?? []).forEach((p: any) => curSet.add(p.invoices?.currency || base));
  (methodRes.data ?? []).forEach((p: any) => curSet.add(p.invoices?.currency || base));
  const curOrder = ['TRY', 'EUR', 'USD', 'GBP', 'IRT'];
  const byCurrency: CurrencyCharts[] = [...curSet]
    .sort((a, b) => curOrder.indexOf(a) - curOrder.indexOf(b))
    .map(cur => {
      const ms: MonthlyFlowPoint[] = months.map(m => ({ month: m.month, label: m.label, invoiced: 0, paid: 0 }));
      const mm = new Map(ms.map(m => [m.month, m]));
      (invRes.data ?? []).forEach((inv: any) => {
        if ((inv.currency || base) !== cur) return;
        const slot = mm.get(String(inv.issue_date ?? '').slice(0, 7));
        if (slot) slot.invoiced += Number(inv.total_amount ?? 0);
      });
      (payRes.data ?? []).forEach((p: any) => {
        if ((p.invoices?.currency || base) !== cur) return;
        const slot = mm.get(String(p.payment_date ?? '').slice(0, 7));
        if (slot) slot.paid += Number(p.amount ?? 0);
      });
      const ag: Record<AgingBucket['key'], AgingBucket> = {
        current: { key: 'current', label: 'Vadesi Gelmedi', amount: 0, count: 0 },
        d30:     { key: 'd30',     label: '1-30 Gün',       amount: 0, count: 0 },
        d60:     { key: 'd60',     label: '31-60 Gün',      amount: 0, count: 0 },
        d90:     { key: 'd90',     label: '61-90 Gün',      amount: 0, count: 0 },
        d90p:    { key: 'd90p',    label: '90+ Gün',        amount: 0, count: 0 },
      };
      (invRes.data ?? []).forEach((inv: any) => {
        if ((inv.currency || base) !== cur) return;
        if (inv.status === 'odendi' || inv.status === 'taslak') return;
        const remaining = Math.max(0, Number(inv.total_amount ?? 0) - Number(inv.paid_amount ?? 0));
        if (remaining <= 0) return;
        const days = daysDiff(inv.due_date);
        const b: AgingBucket['key'] = days <= 0 ? 'current' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : days <= 90 ? 'd90' : 'd90p';
        ag[b].amount += remaining; ag[b].count += 1;
      });
      const mMap = new Map<string, MethodSlice>();
      (methodRes.data ?? []).forEach((p: any) => {
        if ((p.invoices?.currency || base) !== cur) return;
        const m = String(p.payment_method ?? 'diger').toLowerCase();
        const slot = mMap.get(m) ?? { method: m, label: methodLabel(m), amount: 0, count: 0 };
        slot.amount += Number(p.amount ?? 0); slot.count += 1; mMap.set(m, slot);
      });
      return {
        currency: cur,
        monthly_flow: ms,
        aging: [ag.current, ag.d30, ag.d60, ag.d90, ag.d90p],
        payment_methods: [...mMap.values()].sort((a, b) => b.amount - a.amount),
      };
    });

  return {
    monthly_flow: months,
    aging: [aging.current, aging.d30, aging.d60, aging.d90, aging.d90p],
    payment_methods: [...methodMap.values()].sort((a, b) => b.amount - a.amount),
    byCurrency,
  };
}

const MONTH_LABEL_SHORT = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const methodLabel = (m: string): string => {
  const map: Record<string, string> = {
    havale: 'Havale/EFT', nakit: 'Nakit', kart: 'Kredi Kartı',
    cek: 'Çek', online: 'Online POS', diger: 'Diğer',
  };
  return map[m] ?? m;
};

/* ────────────────────────────────────────────────────────────────────── */
/*  Ödeme bildirimi — submit / list / cancel                              */
/* ────────────────────────────────────────────────────────────────────── */

export async function submitPayment(input: SubmitPaymentInput): Promise<string> {
  const { data, error } = await supabase.rpc('submit_payment', {
    p_clinic_id:      input.clinicId,
    p_amount:         input.amount,
    p_payment_method: input.method,
    p_payment_date:   input.paymentDate,
    p_invoice_id:     input.invoiceId ?? null,
    p_doctor_id:      input.doctorId ?? null,
    p_reference_no:   input.referenceNo ?? null,
    p_bank_name:      input.bankName ?? null,
    p_sender_name:    input.senderName ?? null,
    p_receipt_url:    input.receiptUrl ?? null,
    p_notes:          input.notes ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function fetchMySubmissions(clinicId: string): Promise<PaymentSubmissionRow[]> {
  const { data, error } = await supabase
    .from('payment_submissions')
    .select(`
      id, invoice_id, amount, payment_method, payment_date,
      reference_no, bank_name, sender_name, receipt_url, notes,
      status, submitted_at, reviewed_at, reject_reason, approved_payment_id,
      invoices(invoice_no:invoice_number, currency, work_order:work_orders!invoices_work_order_id_fkey(order_number, patient_name))
    `)
    .eq('clinic_id', clinicId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  const base = getBaseCurrency();
  return (data ?? []).map((s: any): PaymentSubmissionRow => ({
    id: s.id,
    invoice_id: s.invoice_id,
    invoice_no: s.invoices?.invoice_no ?? null,
    amount: Number(s.amount ?? 0),
    currency: s.invoices?.currency || base,
    payment_method: s.payment_method,
    payment_date: s.payment_date,
    reference_no: s.reference_no,
    bank_name: s.bank_name,
    sender_name: s.sender_name,
    receipt_url: s.receipt_url,
    notes: s.notes,
    status: s.status,
    submitted_at: s.submitted_at,
    reviewed_at: s.reviewed_at,
    reject_reason: s.reject_reason,
    approved_payment_id: s.approved_payment_id,
    patient_name: s.invoices?.work_order?.patient_name ?? null,
    order_no: s.invoices?.work_order?.order_number ?? null,
  }));
}

export async function cancelMySubmission(id: string): Promise<void> {
  const { error } = await supabase
    .from('payment_submissions')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) throw error;
}

// Lab admin tarafı için (statement/admin panelinde kullanılacak)
export async function approveSubmission(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('approve_payment_submission', { p_submission_id: id });
  if (error) throw error;
  return data as string;
}

export async function rejectSubmission(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reject_payment_submission', {
    p_submission_id: id, p_reason: reason,
  });
  if (error) throw error;
}

export async function fetchPendingSubmissions(): Promise<PaymentSubmissionRow[]> {
  // Lab admin perspektifi — RLS lab_id = get_my_lab_id() üzerinden filtreler.
  const { data, error } = await supabase
    .from('payment_submissions')
    .select(`
      id, invoice_id, clinic_id, amount, payment_method, payment_date,
      reference_no, bank_name, sender_name, receipt_url, notes,
      status, submitted_at, reviewed_at, reject_reason, approved_payment_id,
      invoices(invoice_no:invoice_number, currency, work_order:work_orders!invoices_work_order_id_fkey(order_number, patient_name)),
      clinics(name)
    `)
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  const base = getBaseCurrency();
  return (data ?? []).map((s: any): PaymentSubmissionRow & { clinic_name?: string } => ({
    id: s.id,
    invoice_id: s.invoice_id,
    invoice_no: s.invoices?.invoice_no ?? null,
    amount: Number(s.amount ?? 0),
    currency: s.invoices?.currency || base,
    payment_method: s.payment_method,
    payment_date: s.payment_date,
    reference_no: s.reference_no,
    bank_name: s.bank_name,
    sender_name: s.sender_name,
    receipt_url: s.receipt_url,
    notes: s.notes,
    status: s.status,
    submitted_at: s.submitted_at,
    reviewed_at: s.reviewed_at,
    reject_reason: s.reject_reason,
    approved_payment_id: s.approved_payment_id,
    clinic_name: s.clinics?.name ?? undefined,
    patient_name: s.invoices?.work_order?.patient_name ?? null,
    order_no: s.invoices?.work_order?.order_number ?? null,
  }));
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Ödeme hatırlatması (Admin → Klinik)                                   */
/* ────────────────────────────────────────────────────────────────────── */

export type ReminderSeverity = 'info' | 'warning' | 'urgent';

export interface LastReminderRow {
  id: string;
  sent_at: string;
  severity: ReminderSeverity | null;
  message: string | null;
  total_due: number;
  overdue_count: number;
  recipients_count: number;
}

export async function sendPaymentReminder(opts: {
  clinicId: string;
  invoiceId?: string | null;
  message?: string | null;
  severity?: ReminderSeverity;
}): Promise<string> {
  const { data, error } = await supabase.rpc('send_payment_reminder', {
    p_clinic_id:  opts.clinicId,
    p_invoice_id: opts.invoiceId ?? null,
    p_message:    opts.message ?? null,
    p_severity:   opts.severity ?? 'info',
  });
  if (error) throw error;
  return data as string;
}

export async function sendBulkPaymentReminders(opts: {
  message?: string | null;
  severity?: ReminderSeverity;
} = {}): Promise<number> {
  const { data, error } = await supabase.rpc('send_payment_reminders_bulk', {
    p_message:  opts.message ?? null,
    p_severity: opts.severity ?? 'warning',
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchLastReminder(clinicId: string): Promise<LastReminderRow | null> {
  const { data, error } = await supabase.rpc('last_payment_reminder', { p_clinic_id: clinicId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    id: row.id,
    sent_at: row.sent_at,
    severity: row.severity ?? null,
    message: row.message ?? null,
    total_due: Number(row.total_due ?? 0),
    overdue_count: Number(row.overdue_count ?? 0),
    recipients_count: Number(row.recipients_count ?? 0),
  };
}

export async function fetchClinicDoctors(clinicId: string): Promise<ClinicDoctorOption[]> {
  // Klinikteki tüm hekimleri getir — ekstre filtresinde dropdown için.
  const { data, error } = await supabase
    .from('doctors')
    .select('id, full_name')
    .eq('clinic_id', clinicId)
    .order('full_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ClinicDoctorOption[];
}

export async function fetchStatement(
  clinicId: string,
  opts?: { from?: string; to?: string },
): Promise<{ lines: StatementLine[]; openingBalance: number; openingByCcy: CurrencyTotal[]; closingByCcy: CurrencyTotal[] }> {
  // Bakiye çok-para-birimli net → BAZ para biriminde tutulur (kurla çevrilir).
  await useRateStore.getState().load();
  const base = getBaseCurrency();

  const [invRes, payRes] = await Promise.all([
    labEq(supabase
      .from('invoices')
      .select('id, invoice_no:invoice_number, issue_date, total_amount:total, status, currency, doctor_id, doctors(id, full_name), work_order:work_orders!invoices_work_order_id_fkey(order_number, patient_name)')
      .eq('clinic_id', clinicId)
      .neq('status', 'iptal'))
      .order('issue_date', { ascending: true }),
    labEq(supabase
      .from('payments')
      .select('id, amount, payment_date, payment_method, reference_no, invoice_id, invoices!inner(clinic_id, currency, invoice_no:invoice_number, doctor_id, doctors(id, full_name), work_order:work_orders!invoices_work_order_id_fkey(order_number, patient_name))')
      .eq('invoices.clinic_id', clinicId), 'invoices.lab_id')
      .order('payment_date', { ascending: true }),
  ]);

  if (invRes.error) throw invRes.error;
  if (payRes.error) throw payRes.error;

  const fromD = opts?.from ?? '1900-01-01';
  const toD   = opts?.to ?? '2999-12-31';

  // Önce tüm hareketleri tarih sıralı topla, opening balance hesabı için
  // pencerenin öncesindekileri de saydır. baseDelta = baz para cinsinden net etki.
  type Mov = { date: string; baseDelta: number; line: StatementLine };
  const movements: Mov[] = [];

  (invRes.data ?? []).forEach((inv: any) => {
    const total = Number(inv.total_amount ?? 0);
    const cur = inv.currency || base;
    movements.push({
      date: inv.issue_date,
      baseDelta: total * rateToBase(cur),
      line: {
        id: `inv-${inv.id}`,
        kind: 'invoice',
        date: inv.issue_date,
        description: `Fatura kesildi · ${inv.invoice_no ?? '—'}`,
        invoice_id: inv.id,
        invoice_no: inv.invoice_no,
        doctor_id: inv.doctor_id ?? null,
        doctor_name: inv.doctors?.full_name ?? null,
        patient_name: inv.work_order?.patient_name ?? null,
        order_no: inv.work_order?.order_number ?? null,
        debit: total, credit: 0, currency: cur,
        balance: 0,
      },
    });
  });

  (payRes.data ?? []).forEach((p: any) => {
    const amt = Number(p.amount ?? 0);
    const cur = p.invoices?.currency || base;
    movements.push({
      date: p.payment_date,
      baseDelta: -amt * rateToBase(cur),
      line: {
        id: `pay-${p.id}`,
        kind: 'payment',
        date: p.payment_date,
        description: `Tahsilat · ${p.payment_method ?? '—'}${p.reference_no ? ` (${p.reference_no})` : ''}`,
        invoice_id: p.invoice_id ?? null,
        invoice_no: p.invoices?.invoice_no ?? null,
        doctor_id: p.invoices?.doctor_id ?? null,
        doctor_name: p.invoices?.doctors?.full_name ?? null,
        patient_name: p.invoices?.work_order?.patient_name ?? null,
        order_no: p.invoices?.work_order?.order_number ?? null,
        debit: 0, credit: amt, currency: cur,
        balance: 0,
      },
    });
  });

  movements.sort((a, b) => a.date.localeCompare(b.date));

  // KATI per-currency: her para birimi için ayrı running balance (orijinal tutar).
  // Baz `running` yalnız export geriye-dönük uyumu için korunur.
  let running = 0, openingBalance = 0;
  const runningByCcy: Record<string, number> = {};
  const openingByCcyMap: Record<string, number> = {};
  const lines: StatementLine[] = [];
  movements.forEach(m => {
    running += m.baseDelta;
    if (m.date > toD) return;                       // pencere sonrası: hiç sayma
    const cur = m.line.currency || base;
    runningByCcy[cur] = (runningByCcy[cur] ?? 0) + (m.line.debit - m.line.credit);
    if (m.date < fromD) {                           // pencere öncesi: açılış
      openingBalance = running;
      openingByCcyMap[cur] = runningByCcy[cur];
      return;
    }
    lines.push({ ...m.line, balance: runningByCcy[cur] });   // kendi para biriminde
  });

  const recToCcy = (rec: Record<string, number>): CurrencyTotal[] =>
    Object.entries(rec)
      .filter(([, v]) => Math.abs(v) > 0.0001)
      .map(([currency, total]) => ({ currency: currency as Currency, total, count: 0 }));

  return {
    lines,
    openingBalance,
    openingByCcy: recToCcy(openingByCcyMap),
    closingByCcy: recToCcy(runningByCcy),
  };
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Ödeme geçmişi                                                         */
/* ────────────────────────────────────────────────────────────────────── */

export async function fetchPayments(clinicId: string): Promise<PaymentRow[]> {
  const { data, error } = await labEq(supabase
    .from('payments')
    .select('id, invoice_id, amount, payment_date, payment_method, reference_no, invoices!inner(clinic_id, currency, invoice_no:invoice_number, work_order:work_orders!invoices_work_order_id_fkey(order_number, patient_name))')
    .eq('invoices.clinic_id', clinicId), 'invoices.lab_id')
    .order('payment_date', { ascending: false });
  if (error) throw error;
  const base = getBaseCurrency();
  return (data ?? []).map((p: any): PaymentRow => ({
    id: p.id,
    invoice_id: p.invoice_id,
    invoice_no: p.invoices?.invoice_no ?? null,
    amount: Number(p.amount ?? 0),
    currency: p.invoices?.currency || base,
    payment_date: p.payment_date,
    payment_method: p.payment_method,
    reference_no: p.reference_no,
    patient_name: p.invoices?.work_order?.patient_name ?? null,
    order_no: p.invoices?.work_order?.order_number ?? null,
  }));
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Online POS — payment_intents                                          */
/* ────────────────────────────────────────────────────────────────────── */

export async function fetchPaymentLinks(clinicId: string): Promise<PaymentLinkRow[]> {
  const { data, error } = await labEq(supabase
    .from('payment_intents')
    .select('id, invoice_id, token:public_token, amount, status, created_at, paid_at, invoices!inner(clinic_id, currency, invoice_no:invoice_number, work_order:work_orders!invoices_work_order_id_fkey(order_number, patient_name))')
    .eq('invoices.clinic_id', clinicId), 'invoices.lab_id')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const base = getBaseCurrency();
  return (data ?? []).map((p: any): PaymentLinkRow => ({
    id: p.id,
    invoice_id: p.invoice_id,
    invoice_no: p.invoices?.invoice_no ?? null,
    token: p.token,
    amount: Number(p.amount ?? 0),
    currency: p.invoices?.currency || base,
    status: p.status,
    created_at: p.created_at,
    paid_at: p.paid_at,
    patient_name: p.invoices?.work_order?.patient_name ?? null,
    order_no: p.invoices?.work_order?.order_number ?? null,
  }));
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Klinik resolve (clinic panel için profil.clinic_id, doctor için doctors→clinic) */
/* ────────────────────────────────────────────────────────────────────── */

export async function resolveClinicId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // profil tablosu
  const { data: prof } = await supabase
    .from('profiles')
    .select('clinic_id, user_type')
    .eq('id', user.id)
    .maybeSingle();
  if (prof?.clinic_id) return prof.clinic_id;
  // doctor ise: doctors tablosundan clinic_id
  if (prof?.user_type === 'doctor') {
    const { data: doc } = await supabase
      .from('doctors')
      .select('clinic_id')
      .eq('user_id', user.id)
      .maybeSingle();
    return doc?.clinic_id ?? null;
  }
  return null;
}
