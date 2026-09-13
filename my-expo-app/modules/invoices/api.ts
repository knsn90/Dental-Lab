// ─────────────────────────────────────────────────────────────────────────
//  Fatura / Tahsilat API
//  - invoices, invoice_items, payments tabloları üzerinde CRUD
//  - Sipariş → fatura (create_invoice_from_order RPC)
//  - Klinik cari (v_clinic_balance view)
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from '../../core/api/supabase';
import { dispatchToClinic } from '../../core/notifications/dispatch';
import type {
  Invoice, InvoiceItem, Payment, ClinicBalance, ClinicBalanceCcy, InvoiceStatus,
  CreateInvoiceParams, InvoiceItemInput, RecordPaymentParams,
  InvoiceListFilters, CreateBulkInvoiceParams, UnbilledWorkOrder,
  LinkedWorkOrder,
} from './types';
import { groupByCurrency, type CurrencyTotal } from '../../core/money/aggregations';
import type { Currency } from '../../core/money/currency';

// ─── Listeler ──────────────────────────────────────────────────────────────

const INVOICE_SELECT = `
  *,
  doctor:doctors!invoices_doctor_id_fkey(id, full_name, phone, clinic_id),
  clinic:clinics!invoices_clinic_id_fkey(id, name, address, phone, email),
  work_order:work_orders!invoices_work_order_id_fkey(id, order_number, patient_name, delivery_date)
`;

const INVOICE_DETAIL_SELECT = `
  *,
  doctor:doctors!invoices_doctor_id_fkey(id, full_name, phone, clinic_id),
  clinic:clinics!invoices_clinic_id_fkey(id, name, address, phone, email),
  work_order:work_orders!invoices_work_order_id_fkey(id, order_number, patient_name, delivery_date),
  items:invoice_items(id, invoice_id, order_item_id, description, quantity, unit_price, total, discount_type, discount_value, net_total, sort_order, created_at),
  payments:payments(*, receiver:profiles!payments_received_by_fkey(id, full_name)),
  linked_orders:invoice_orders(
    invoice_id,
    work_order_id,
    work_order:work_orders!invoice_orders_work_order_id_fkey(id, order_number, patient_name, work_type, delivery_date)
  )
`;

export async function fetchInvoices(filters: InvoiceListFilters = {}) {
  let q = supabase
    .from('invoices')
    .select(INVOICE_SELECT)
    .order('issue_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.status && filters.status !== 'all') {
    q = q.eq('status', filters.status);
  }
  if (filters.clinic_id)  q = q.eq('clinic_id', filters.clinic_id);
  if (filters.doctor_id)  q = q.eq('doctor_id', filters.doctor_id);
  if (filters.date_from)  q = q.gte('issue_date', filters.date_from);
  if (filters.date_to)    q = q.lte('issue_date', filters.date_to);

  if (filters.overdue_only) {
    const today = new Date().toISOString().split('T')[0];
    q = q.lt('due_date', today).neq('status', 'odendi').neq('status', 'iptal');
  }

  if (filters.search) {
    // invoice_number veya work_order ilişkisi üzerinden filtrele (server-side OR)
    q = q.or(`invoice_number.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
  }

  return q.returns<Invoice[]>();
}

/** URL/param UUID mi yoksa insan-okur fatura numarası mı (FTR-2026-00035). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fatura detayı — parametre UUID ise id, değilse invoice_number ile getirir.
 * Böylece URL'de okunur fatura no (siman.app/invoice/FTR-2026-00035) kullanılabilir;
 * eski UUID linkleri, QR ve bildirim deep-link'leri GERİYE DÖNÜK çalışmaya devam eder.
 * Numara aramasında RLS zaten kullanıcının lab'ına filtreler → kendi faturasını getirir;
 * lablar arası aynı numara olasılığına karşı limit(1) + maybeSingle güvenli tutar.
 */
export async function fetchInvoiceById(idOrNumber: string) {
  const key = String(idOrNumber ?? '').trim();
  const base = supabase
    .from('invoices')
    .select(INVOICE_DETAIL_SELECT)
    .order('sort_order', { ascending: true, referencedTable: 'invoice_items' })
    .order('payment_date', { ascending: false, referencedTable: 'payments' });

  if (UUID_RE.test(key)) {
    return base
      .eq('id', key)
      .single()
      .then(r => r as unknown as { data: Invoice | null; error: any });
  }
  return base
    .eq('invoice_number', key)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .then(r => r as unknown as { data: Invoice | null; error: any });
}

// ─── Oluşturma ─────────────────────────────────────────────────────────────

/**
 * Sıfırdan fatura oluştur (kalemlerle birlikte).
 * Invoice_number, subtotal/tax/total trigger'larca otomatik doldurulur.
 */
export async function createInvoice(params: CreateInvoiceParams) {
  const {
    doctor_id, clinic_id, work_order_id,
    issue_date, due_date, tax_rate, notes, items,
  } = params;

  // 1) Invoice başlığı
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      doctor_id,
      clinic_id: clinic_id ?? null,
      work_order_id: work_order_id ?? null,
      issue_date: issue_date ?? new Date().toISOString().slice(0, 10),
      due_date:   due_date ?? null,
      tax_rate:   tax_rate ?? 20,
      notes:      notes ?? null,
      status:     'taslak',
    })
    .select()
    .single();

  if (invoiceError || !invoice) {
    return { data: null, error: invoiceError };
  }

  // 2) Kalemleri ekle (tetikleyiciler total'ı hesaplayacak)
  if (items && items.length > 0) {
    const rows = items.map((it, i) => ({
      invoice_id: invoice.id,
      order_item_id: it.order_item_id ?? null,
      description: it.description,
      quantity: it.quantity,
      unit_price: it.unit_price,
      sort_order: i,
    }));
    const { error: itemsError } = await supabase.from('invoice_items').insert(rows);
    if (itemsError) {
      // Rollback: invoice'u silelim (cascade ile items da gidecek)
      await supabase.from('invoices').delete().eq('id', invoice.id);
      return { data: null, error: itemsError };
    }
  }

  // 3) Güncel invoice'u geri oku (total dolu halde)
  const result = await fetchInvoiceById(invoice.id);

  // ─── Notification: payment (invoice_created) → klinik kullanıcıları ──
  try {
    const clinicId = (invoice as any).clinic_id as string | null;
    if (clinicId) {
      const inv = result.data as any;
      const invoiceNum = inv?.invoice_number ?? '';
      const total      = inv?.total_amount ?? inv?.total ?? null;
      const due        = inv?.due_date ?? null;
      const totalStr   = total != null
        ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(total)
        : '';
      dispatchToClinic({
        clinicId,
        input: {
          category:     'payment',
          title:        `Yeni fatura${invoiceNum ? ` · ${invoiceNum}` : ''}`,
          body:         [totalStr, due ? `Vade: ${due}` : ''].filter(Boolean).join(' · '),
          resourceType: 'invoice',
          resourceId:   invoice.id,
          actionUrl:    `/(clinic)/invoice/${invoice.id}`,
          payload: {
            invoiceNumber: invoiceNum,
            amount:        totalStr,
            dueDate:       due ?? '',
          },
        },
      }).catch(() => null);
    }
  } catch { /* sessiz */ }

  return result;
}

/**
 * Sipariş teslim edildiğinde otomatik taslak fatura üret.
 * RPC order_items'ı kalem olarak kopyalar; zaten açık fatura varsa onu döner.
 */
export async function createInvoiceFromOrder(workOrderId: string) {
  const { data, error } = await supabase.rpc('create_invoice_from_order', {
    p_work_order_id: workOrderId,
  });
  if (error || !data) return { data: null, error };
  return fetchInvoiceById(data as string);
}

/**
 * Toplu fatura — tek klinik için birden fazla siparişi tek faturada topla.
 * Sunucu tarafında aynı klinik/aynı lab kontrolü, iptal olmayan fatura
 * eşleştirmesi ve auto invoice_items üretimi yapılır.
 */
export async function createBulkInvoice(params: CreateBulkInvoiceParams) {
  const { data, error } = await supabase.rpc('create_bulk_invoice', {
    p_clinic_id:      params.clinic_id,
    p_work_order_ids: params.work_order_ids,
    p_due_days:       params.due_days ?? 30,
    p_notes:          params.notes ?? null,
  });
  if (error || !data) return { data: null, error };
  return fetchInvoiceById(data as string);
}

/**
 * Henüz faturalanmamış, teslim edilmiş (status='teslim_edildi') siparişler.
 * Opsiyonel clinicId ile tek kliniğe daraltır.
 */
export async function fetchUnbilledWorkOrders(clinicId?: string) {
  let q = supabase
    .from('v_unbilled_work_orders')
    .select('*')
    .order('delivered_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (clinicId) q = q.eq('clinic_id', clinicId);

  return q.returns<UnbilledWorkOrder[]>();
}

/**
 * Kliniğin özel fiyat listesindeki baskın para birimi.
 *
 * NEDEN: hesap ekstresi katı per-currency çalışır ve varsayılan sekme körlemesine
 * `TRY, EUR, USD, GBP` sırasının ilki seçiliyordu. Fiyatları USD olan bir klinikte
 * ekran EUR'da açılıp "0 hareket" gösteriyordu — kullanıcı hesabın boş olduğunu
 * sanıyor. Klinikle hangi para biriminde çalışıldığının en doğrudan kanıtı fiyat
 * listesi; fatura geçmişi henüz yokken bile bilinir.
 *
 * Baskın = en çok kalemin para birimi (liste kısmen başka dövize çevrilmiş olabilir).
 */
export async function fetchClinicPriceCurrency(clinicId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('clinic_price_overrides')
    .select('currency')
    .eq('clinic_id', clinicId);
  if (error || !Array.isArray(data) || data.length === 0) return null;

  const tally = new Map<string, number>();
  for (const r of data as { currency: string | null }[]) {
    const c = r.currency || 'TRY';
    tally.set(c, (tally.get(c) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [c, n] of tally) if (n > bestN) { best = c; bestN = n; }
  return best;
}

/**
 * Bir faturanın bağlı tüm siparişlerini döner (toplu fatura için).
 */
export async function fetchLinkedOrders(invoiceId: string) {
  return supabase
    .from('invoice_orders')
    .select(`
      invoice_id,
      work_order_id,
      work_order:work_orders!invoice_orders_work_order_id_fkey(id, order_number, patient_name, work_type, delivery_date)
    `)
    .eq('invoice_id', invoiceId)
    .returns<LinkedWorkOrder[]>();
}

// ─── Güncelleme ────────────────────────────────────────────────────────────

export async function updateInvoice(
  id: string,
  patch: Partial<Pick<Invoice,
    'status' | 'issue_date' | 'due_date' | 'tax_rate' | 'notes' |
    'doctor_id' | 'clinic_id' | 'currency' | 'rate_at_time'
  >>,
) {
  return supabase
    .from('invoices')
    .update(patch)
    .eq('id', id)
    .select(INVOICE_SELECT)
    .single();
}

// RLS bir yazmayı engellerse PostgREST HATA DÖNMEZ, 0 satır etkiler → istemci
// başarı sanıp "çalışmıyor" hissi veriyordu. Etkilenen satırı geri iste, yoksa hata say.
export async function setInvoiceStatus(id: string, status: InvoiceStatus) {
  const { data, error } = await supabase.from('invoices').update({ status }).eq('id', id).select('id');
  if (error) return { error };
  if (!data?.length) return { error: new Error('Fatura güncellenemedi (yetki yok ya da kayıt bulunamadı).') };
  return { error: null };
}

export async function deleteInvoice(id: string) {
  const { data, error } = await supabase.from('invoices').delete().eq('id', id).select('id');
  if (error) return { error };
  if (!data?.length) return { error: new Error('Fatura silinemedi (yetki yok ya da kayıt bulunamadı).') };
  return { error: null };
}

// ─── Invoice items ─────────────────────────────────────────────────────────

export async function addInvoiceItem(invoiceId: string, item: InvoiceItemInput) {
  return supabase
    .from('invoice_items')
    .insert({
      invoice_id: invoiceId,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      order_item_id: item.order_item_id ?? null,
      sort_order: item.sort_order ?? 0,
    })
    .select()
    .single();
}

export async function updateInvoiceItem(
  id: string,
  patch: Partial<Pick<InvoiceItem, 'description' | 'quantity' | 'unit_price' | 'sort_order' | 'discount_type' | 'discount_value'>>,
) {
  return supabase.from('invoice_items').update(patch).eq('id', id).select().single();
}

export async function deleteInvoiceItem(id: string) {
  return supabase.from('invoice_items').delete().eq('id', id);
}

// ─── Tahsilat (payments) ───────────────────────────────────────────────────

export async function fetchPaymentsForInvoice(invoiceId: string) {
  return supabase
    .from('payments')
    .select('*, receiver:profiles!payments_received_by_fkey(id, full_name)')
    .eq('invoice_id', invoiceId)
    .order('payment_date', { ascending: false });
}

export async function recordPayment(params: RecordPaymentParams) {
  const { invoice_id, amount, payment_date, payment_method, reference_no, notes } = params;
  const { data: { user } } = await supabase.auth.getUser();

  // Ödeme, faturanın para birimi + kilitli kuruyla saklanır → baz (₺) raporlama doğru.
  const { data: inv0 } = await supabase
    .from('invoices').select('currency, rate_at_time').eq('id', invoice_id).single();
  const pCurrency = (inv0 as any)?.currency ?? 'TRY';
  const pRate = Number((inv0 as any)?.rate_at_time ?? 1) || 1;

  const result = await supabase
    .from('payments')
    .insert({
      invoice_id,
      amount,
      currency: pCurrency,
      rate_at_time: pRate,
      amount_base: amount * pRate,
      base_currency_at_time: 'TRY',
      payment_date: payment_date ?? new Date().toISOString().slice(0, 10),
      payment_method: payment_method ?? 'nakit',
      reference_no: reference_no ?? null,
      notes: notes ?? null,
      received_by: user?.id ?? null,
    })
    .select()
    .single();

  // ─── Notification: payment (received) → klinik kullanıcıları ─────
  if (!result.error && result.data) {
    try {
      const { data: inv } = await supabase
        .from('invoices')
        .select('clinic_id, invoice_number')
        .eq('id', invoice_id)
        .single();
      const clinicId = (inv as any)?.clinic_id as string | null;
      if (clinicId) {
        const invNum = (inv as any)?.invoice_number ?? '';
        const amountStr = new Intl.NumberFormat('tr-TR', {
          style: 'currency', currency: 'TRY', maximumFractionDigits: 0,
        }).format(amount);
        dispatchToClinic({
          clinicId,
          input: {
            category:     'payment',
            title:        `Tahsilat alındı${invNum ? ` · ${invNum}` : ''}`,
            body:         `${amountStr} ödeme kaydedildi`,
            resourceType: 'invoice',
            resourceId:   invoice_id,
            actionUrl:    `/(clinic)/invoice/${invoice_id}`,
            payload: {
              invoiceNumber: invNum,
              amount:        amountStr,
              status:        'Tahsil edildi',
            },
          },
        }).catch(() => null);
      }
    } catch { /* sessiz */ }
  }

  return result;
}

export async function updatePayment(
  id: string,
  patch: Partial<Pick<Payment, 'amount' | 'payment_date' | 'payment_method' | 'reference_no' | 'notes'>>,
) {
  return supabase.from('payments').update(patch).eq('id', id).select().single();
}

export async function deletePayment(id: string) {
  return supabase.from('payments').delete().eq('id', id);
}

/**
 * Toplu tahsilat — birden fazla faturaya tek tutarı vadesi yakın olanlardan
 * başlayarak dağıtır (bulk_record_payment RPC).
 * Dönen tablo: { invoice_id, amount_paid }[]
 */
export async function bulkRecordPayment(params: {
  invoice_ids: string[];
  total_amount: number;
  payment_method?: string;
  payment_date?: string;
  notes?: string;
}) {
  return supabase.rpc('bulk_record_payment', {
    p_invoice_ids:    params.invoice_ids,
    p_total_amount:   params.total_amount,
    p_payment_method: params.payment_method ?? 'nakit',
    p_payment_date:   params.payment_date   ?? new Date().toISOString().slice(0, 10),
    p_notes:          params.notes          ?? null,
  });
}

// ─── Cari bakiye (klinik bazlı) ────────────────────────────────────────────

export async function fetchClinicBalances() {
  return supabase
    .from('v_clinic_balance')
    .select('*')
    .order('balance', { ascending: false })
    .returns<ClinicBalance[]>();
}

export async function fetchClinicBalance(clinicId: string) {
  return supabase
    .from('v_clinic_balance')
    .select('*')
    .eq('clinic_id', clinicId)
    .maybeSingle()
    .then(r => r as unknown as { data: ClinicBalance | null; error: any });
}

// ─── Cari bakiye PER-CURRENCY (v_clinic_balance_ccy) ───────────────────────
// Katı per-currency: her (klinik, para birimi) için ayrı satır, orijinal tutarda.
// Migration henüz uygulanmadıysa view yoktur → eski v_clinic_balance'tan türetir
// (mono-currency klinikler doğru; karışık klinikler migration'a kadar TRY/base gösterir).
function deriveCcyFromBase(rows: ClinicBalance[]): ClinicBalanceCcy[] {
  return (rows ?? []).map(b => {
    const foreign = !!b.currency && b.currency !== 'TRY';
    return {
      clinic_id: b.clinic_id,
      clinic_name: b.clinic_name,
      lab_id: b.lab_id,
      currency: foreign ? (b.currency as string) : 'TRY',
      invoice_count: Number(b.invoice_count ?? 0),
      total_billed: foreign ? Number(b.total_billed_original ?? 0) : Number(b.total_billed ?? 0),
      total_paid:   foreign ? Number(b.total_paid_original ?? 0)   : Number(b.total_paid ?? 0),
      balance:      foreign ? Number(b.balance_original ?? 0)      : Number(b.balance ?? 0),
      overdue_amount: Number(b.overdue_amount ?? 0),
      aging_current: Number(b.aging_current ?? 0),
      aging_30: Number(b.aging_30 ?? 0),
      aging_60: Number(b.aging_60 ?? 0),
      aging_90: Number(b.aging_90 ?? 0),
      oldest_overdue_date: b.oldest_overdue_date ?? null,
    };
  });
}

export async function fetchClinicBalancesByCurrency(): Promise<{ data: ClinicBalanceCcy[]; error: any }> {
  const res = await supabase
    .from('v_clinic_balance_ccy')
    .select('*')
    .returns<ClinicBalanceCcy[]>();
  if (!res.error) return { data: res.data ?? [], error: null };
  // Fallback — view yok (migration uygulanmamış): eski view'dan türet
  const old = await fetchClinicBalances();
  if (old.error) return { data: [], error: old.error };
  return { data: deriveCcyFromBase((old.data ?? []) as ClinicBalance[]), error: null };
}

const CLINIC_STATEMENT_SELECT = `
  *,
  doctor:doctors!invoices_doctor_id_fkey(id, full_name, phone, clinic_id),
  clinic:clinics!invoices_clinic_id_fkey(id, name, address, phone, email),
  work_order:work_orders!invoices_work_order_id_fkey(id, order_number, patient_name, delivery_date),
  payments:payments(*, receiver:profiles!payments_received_by_fkey(id, full_name))
`;

export async function fetchInvoicesForClinic(clinicId: string) {
  return supabase
    .from('invoices')
    .select(CLINIC_STATEMENT_SELECT)
    .eq('clinic_id', clinicId)
    .order('issue_date', { ascending: false })
    .returns<Invoice[]>();
}

// ─── Özet istatistikler (dashboard) ────────────────────────────────────────

// KATI per-currency: tüm istatistikler para birimine göre BAĞIMSIZ — base'e çevrilmez.
export interface InvoiceStats {
  thisMonth: CurrencyTotal[];   // bu ay kesilen
  outstanding: CurrencyTotal[]; // toplam bakiye (kesilen − tahsil)
  overdue: CurrencyTotal[];     // vadesi geçen
  paid: CurrencyTotal[];        // toplam tahsilat
  invoiceCount: number;
}

export async function fetchInvoiceStats(): Promise<InvoiceStats> {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 7) + '-01';

  const [{ data: all }, { data: thisMonth }, { data: overdue }] = await Promise.all([
    supabase.from('invoices').select('status, total, paid_amount, currency'),
    supabase.from('invoices').select('total, currency').gte('issue_date', firstOfMonth),
    supabase.from('invoices').select('total, paid_amount, currency')
      .lt('due_date', today).neq('status', 'odendi').neq('status', 'iptal'),
  ]);

  const nonCancelled = ((all ?? []) as any[]).filter(i => i.status !== 'iptal');
  const cur = (r: any) => (r.currency ?? 'TRY') as Currency;

  return {
    thisMonth:   groupByCurrency(((thisMonth ?? []) as any[]), r => ({ amount: Number(r.total) || 0, currency: cur(r) })),
    outstanding: groupByCurrency(nonCancelled, r => ({ amount: (Number(r.total) || 0) - (Number(r.paid_amount) || 0), currency: cur(r) }), { keepZero: true }),
    overdue:     groupByCurrency(((overdue ?? []) as any[]), r => ({ amount: (Number(r.total) || 0) - (Number(r.paid_amount) || 0), currency: cur(r) })),
    paid:        groupByCurrency(nonCancelled, r => ({ amount: Number(r.paid_amount) || 0, currency: cur(r) })),
    invoiceCount: nonCancelled.length,
  };
}
