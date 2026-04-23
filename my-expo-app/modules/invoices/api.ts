// ─────────────────────────────────────────────────────────────────────────
//  Fatura / Tahsilat API
//  - invoices, invoice_items, payments tabloları üzerinde CRUD
//  - Sipariş → fatura (create_invoice_from_order RPC)
//  - Klinik cari (v_clinic_balance view)
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from '../../core/api/supabase';
import type {
  Invoice, InvoiceItem, Payment, ClinicBalance, InvoiceStatus,
  CreateInvoiceParams, InvoiceItemInput, RecordPaymentParams,
  InvoiceListFilters, CreateBulkInvoiceParams, UnbilledWorkOrder,
  LinkedWorkOrder,
} from './types';

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
  items:invoice_items(*),
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

export async function fetchInvoiceById(id: string) {
  return supabase
    .from('invoices')
    .select(INVOICE_DETAIL_SELECT)
    .eq('id', id)
    .order('sort_order', { ascending: true, referencedTable: 'invoice_items' })
    .order('payment_date', { ascending: false, referencedTable: 'payments' })
    .single()
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
  return fetchInvoiceById(invoice.id);
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
    'doctor_id' | 'clinic_id'
  >>,
) {
  return supabase
    .from('invoices')
    .update(patch)
    .eq('id', id)
    .select(INVOICE_SELECT)
    .single();
}

export async function setInvoiceStatus(id: string, status: InvoiceStatus) {
  return supabase.from('invoices').update({ status }).eq('id', id);
}

export async function deleteInvoice(id: string) {
  return supabase.from('invoices').delete().eq('id', id);
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
  patch: Partial<Pick<InvoiceItem, 'description' | 'quantity' | 'unit_price' | 'sort_order'>>,
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
  return supabase
    .from('payments')
    .insert({
      invoice_id,
      amount,
      payment_date: payment_date ?? new Date().toISOString().slice(0, 10),
      payment_method: payment_method ?? 'nakit',
      reference_no: reference_no ?? null,
      notes: notes ?? null,
      received_by: user?.id ?? null,
    })
    .select()
    .single();
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

export async function fetchInvoicesForClinic(clinicId: string) {
  return supabase
    .from('invoices')
    .select(INVOICE_SELECT)
    .eq('clinic_id', clinicId)
    .order('issue_date', { ascending: false })
    .returns<Invoice[]>();
}

// ─── Özet istatistikler (dashboard) ────────────────────────────────────────

export async function fetchInvoiceStats() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 7) + '-01';

  const [{ data: all }, { data: thisMonth }, { data: overdue }] = await Promise.all([
    supabase.from('invoices').select('status, total, paid_amount'),
    supabase.from('invoices').select('total').gte('issue_date', firstOfMonth),
    supabase.from('invoices').select('total, paid_amount')
      .lt('due_date', today).neq('status', 'odendi').neq('status', 'iptal'),
  ]);

  const nonCancelled = (all ?? []).filter(i => i.status !== 'iptal');
  const totalBilled  = nonCancelled.reduce((s, i) => s + Number(i.total), 0);
  const totalPaid    = nonCancelled.reduce((s, i) => s + Number(i.paid_amount), 0);
  const monthTotal   = (thisMonth ?? []).reduce((s, i) => s + Number(i.total), 0);
  const overdueAmt   = (overdue ?? []).reduce((s, i) => s + (Number(i.total) - Number(i.paid_amount)), 0);

  return {
    totalBilled,
    totalPaid,
    outstandingBalance: totalBilled - totalPaid,
    thisMonthBilled: monthTotal,
    overdueAmount: overdueAmt,
    invoiceCount: nonCancelled.length,
  };
}
