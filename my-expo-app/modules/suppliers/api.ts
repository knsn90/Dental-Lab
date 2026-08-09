/**
 * Tedarikçiler & Cari Hesap API.
 *
 * Tablolar:
 *   • suppliers
 *   • supplier_transactions
 *   • supplier_balances (view)
 *
 * RPC'ler:
 *   • create_stock_movement_with_snapshot(supplier_id, ...) — IN sırasında otomatik PURCHASE
 *   • record_supplier_transaction(...) — ödeme/iade snapshot ile
 */

import { supabase } from '../../core/api/supabase';
import type { Currency } from '../../core/money/currency';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SupplierCategory = 'material' | 'equipment' | 'service' | 'other';
export type TransactionType = 'PURCHASE' | 'PAYMENT' | 'RETURN' | 'ADJUSTMENT';
export type PaymentMethod = 'cash' | 'transfer' | 'check' | 'card';

export interface Supplier {
  id: string;
  lab_id: string | null;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  tax_no: string | null;
  tax_office: string | null;
  iban: string | null;
  bank_name: string | null;
  category: SupplierCategory;
  default_currency: Currency;
  payment_terms_days: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierTransaction {
  id: string;
  lab_id: string | null;
  supplier_id: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  rate_at_time: number;
  amount_base: number | null;
  base_currency_at_time: Currency;
  // Cari (tedarikçinin kendi) para birimi tarafı — 1 birim CARİ kaç birim işlem
  // para birimi (1 EUR = 38,50 ₺ → 38.5); amount_account = amount / rate.
  amount_account: number | null;
  account_rate_at_time: number | null;
  account_currency_at_time: Currency | null;
  related_movement_id: string | null;
  invoice_no: string | null;
  payment_method: PaymentMethod | null;
  description: string | null;
  bank_name: string | null;
  reference_no: string | null;
  iban: string | null;
  transaction_date: string;
  due_date: string | null;
  created_at: string;
  // Satın alma faturasıyla bağlantı — PURCHASE tipinde dolu olur
  purchase_invoice_id?: string | null;
}

export interface SupplierBalance {
  supplier_id: string;
  lab_id: string;
  name: string;
  default_currency: Currency;
  /**
   * DİKKAT: baz para biriminde toplam. Lab'ın baz parası TRY→EUR değiştiği ve
   * geçmiş yeniden yazılmadığı için bu alan iki para birimini karıştırır —
   * ekranda KULLANMAYIN. Tedarikçi bakiyesi için balance_account kullanın.
   */
  balance_base: number;          // pozitif = borcumuz, negatif = alacağımız
  balance_original: number;      // tedarikçinin kendi para birimindeki net bakiye (EUR/USD…)
  total_purchases: number;
  total_payments: number;
  total_returns: number;
  // Cari para birimi (default_currency) cinsinden — TÜM hareketler dahil
  balance_account: number;
  total_purchases_account: number;
  total_payments_account: number;
  total_returns_account: number;
  purchase_count: number;
  last_transaction_date: string | null;
}

// ─── Suppliers CRUD ──────────────────────────────────────────────────────────

export async function listSuppliers(opts: { activeOnly?: boolean } = {}): Promise<{ data: Supplier[] | null; error: any }> {
  let q = supabase.from('suppliers').select('*').order('name');
  if (opts.activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  return { data: data as Supplier[] | null, error };
}

export async function getSupplier(id: string): Promise<{ data: Supplier | null; error: any }> {
  const { data, error } = await supabase.from('suppliers').select('*').eq('id', id).single();
  return { data: data as Supplier | null, error };
}

export async function createSupplier(params: Partial<Supplier> & { name: string }): Promise<{ data: Supplier | null; error: any }> {
  const { data, error } = await supabase.from('suppliers').insert(params).select().single();
  return { data: data as Supplier | null, error };
}

export async function updateSupplier(id: string, params: Partial<Supplier>): Promise<{ data: Supplier | null; error: any }> {
  const { data, error } = await supabase.from('suppliers').update(params).eq('id', id).select().single();
  return { data: data as Supplier | null, error };
}

export async function deactivateSupplier(id: string) {
  return supabase.from('suppliers').update({ is_active: false }).eq('id', id);
}

/**
 * Tedarikçiyi kalıcı sil. İlişkili satın alma faturaları veya
 * supplier_transactions varsa FK constraint hatası verir; bu durumda
 * deactivateSupplier kullanılmalı.
 */
export async function deleteSupplier(id: string) {
  return supabase.from('suppliers').delete().eq('id', id);
}

// ─── Balances ────────────────────────────────────────────────────────────────

export async function listBalances(): Promise<{ data: SupplierBalance[] | null; error: any }> {
  const { data, error } = await supabase
    .from('supplier_balances')
    .select('*')
    // balance_base sıralamada da yanıltıcı: baz para birimi TRY→EUR değişti,
    // eski satırların baz tutarı TRY. Hesap para birimindeki bakiye tutarlı.
    .order('balance_account', { ascending: false });
  return { data: data as SupplierBalance[] | null, error };
}

export async function getBalance(supplierId: string): Promise<{ data: SupplierBalance | null; error: any }> {
  const { data, error } = await supabase
    .from('supplier_balances')
    .select('*')
    .eq('supplier_id', supplierId)
    .maybeSingle();
  return { data: data as SupplierBalance | null, error };
}

// ─── Transactions ────────────────────────────────────────────────────────────

export async function listTransactions(supplierId: string, limit = 100): Promise<{ data: SupplierTransaction[] | null; error: any }> {
  const { data, error } = await supabase
    .from('supplier_transactions')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: data as SupplierTransaction[] | null, error };
}

/** Manuel ödeme/iade/düzeltme kaydı — RPC ile snapshot kur. */
export async function recordTransaction(input: {
  labId: string;
  supplierId: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  paymentMethod?: PaymentMethod;
  invoiceNo?: string;
  description?: string;
  transactionDate?: string;     // YYYY-MM-DD, default today
  dueDate?: string | null;
  bankName?: string | null;
  referenceNo?: string | null;
  iban?: string | null;
  /** Elle girilen cari kuru: 1 birim CARİ para birimi kaç birim işlem para birimi
   *  (1 EUR = 38,50 ₺ → 38.5). Verilmezse RPC otomatik kuru kullanır. */
  accountRate?: number | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('record_supplier_transaction', {
    p_lab_id: input.labId,
    p_supplier_id: input.supplierId,
    p_type: input.type,
    p_amount: input.amount,
    p_currency: input.currency,
    p_payment_method: input.paymentMethod ?? null,
    p_invoice_no: input.invoiceNo ?? null,
    p_description: input.description ?? null,
    p_transaction_date: input.transactionDate ?? new Date().toISOString().slice(0, 10),
    p_due_date: input.dueDate ?? null,
    p_bank_name: input.bankName ?? null,
    p_reference_no: input.referenceNo ?? null,
    p_iban: input.iban ?? null,
    p_account_rate: input.accountRate ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data as string };
}

export async function deleteTransaction(id: string) {
  return supabase.from('supplier_transactions').delete().eq('id', id);
}

/**
 * Cari işlemi güncelle. Amount değişirse amount_base = amount * rate_at_time olarak yeniden hesaplanır
 * (orijinal kur snapshot'ı korunur). Tarih veya currency değişirse rate snapshot dokunulmaz —
 * audit için orijinal kuru muhafaza ediyoruz.
 */
export async function updateTransaction(
  id: string,
  patch: {
    amount?: number;
    paymentMethod?: PaymentMethod | null;
    invoiceNo?: string | null;
    description?: string | null;
    transactionDate?: string;
    dueDate?: string | null;
    bankName?: string | null;
    referenceNo?: string | null;
    iban?: string | null;
    /** Cari (hesap) para birimi kuru — 1 birim cari kaç birim işlem parası.
     *  Verilirse account_rate_at_time GÜNCELLENİR. Daha önce bu alan yoktu:
     *  modalda kur değiştirilse bile kayıtlı eski kur yeniden kullanılıyor,
     *  değişiklik sessizce kayboluyordu. */
    accountRate?: number | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const updates: any = {};
  // Tutar VEYA kur değiştiyse türetilmiş alanlar yeniden hesaplanmalı.
  // Kur tek başına da değişebilir (tutar aynı kalıp yalnız kur düzeltilebilir).
  if (patch.amount != null || patch.accountRate != null) {
    const { data: cur } = await supabase
      .from('supplier_transactions')
      .select('amount, rate_at_time, account_rate_at_time')
      .eq('id', id)
      .single();
    const amount = patch.amount ?? Number((cur as any)?.amount ?? 0);
    const rate = Number((cur as any)?.rate_at_time ?? 1);
    // Yeni kur geldiyse onu kullan; gelmediyse kaydın kendi snapshot'ı korunur.
    const nextAcctRate = patch.accountRate != null && Number(patch.accountRate) > 0
      ? Number(patch.accountRate)
      : (Number((cur as any)?.account_rate_at_time ?? 1) || 1);

    if (patch.amount != null) {
      updates.amount = amount;
      // amount_base işlem→baz kuruyla ilgili; cari kuru değişince DOKUNULMAZ.
      updates.amount_base = amount * rate;
    }
    if (patch.accountRate != null) updates.account_rate_at_time = nextAcctRate;
    // Cari bakiye bu alandan hesaplanıyor → her iki durumda da tazelenir.
    updates.amount_account = amount / nextAcctRate;
  }
  if (patch.paymentMethod !== undefined)    updates.payment_method = patch.paymentMethod;
  if (patch.invoiceNo !== undefined)        updates.invoice_no = patch.invoiceNo;
  if (patch.description !== undefined)      updates.description = patch.description;
  if (patch.transactionDate !== undefined)  updates.transaction_date = patch.transactionDate;
  if (patch.dueDate !== undefined)          updates.due_date = patch.dueDate;
  if (patch.bankName !== undefined)         updates.bank_name = patch.bankName;
  if (patch.referenceNo !== undefined)      updates.reference_no = patch.referenceNo;
  if (patch.iban !== undefined)             updates.iban = patch.iban;

  const { error } = await supabase.from('supplier_transactions').update(updates).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<SupplierCategory, string> = {
  material:  'Sarf Malzeme',
  equipment: 'Ekipman',
  service:   'Hizmet',
  other:     'Diğer',
};

export const TX_TYPE_LABELS: Record<TransactionType, string> = {
  PURCHASE:    'Alış',
  PAYMENT:     'Ödeme',
  RETURN:      'İade',
  ADJUSTMENT:  'Düzeltme',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash:     'Nakit',
  transfer: 'Havale / EFT',
  check:    'Çek',
  card:     'Kredi kartı',
};

/** Bakiye işareti: pozitif=borç (kırmızı), negatif=alacak (yeşil), 0=eşit. */
export function balanceColor(balance: number): 'debt' | 'credit' | 'zero' {
  if (Math.abs(balance) < 0.01) return 'zero';
  return balance > 0 ? 'debt' : 'credit';
}
