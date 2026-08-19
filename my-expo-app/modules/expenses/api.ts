import { supabase } from '../../core/api/supabase';
import { groupByCurrency, type CurrencyTotal } from '../../core/money/aggregations';
import { getBaseCurrency } from '../../core/money/baseCurrency';
import type { Currency } from '../../core/money/currency';

export type ExpenseCategory = 'malzeme' | 'kira' | 'personel' | 'ekipman' | 'vergi' | 'kurye' | 'diger';
export type ExpensePaymentMethod = 'nakit' | 'kart' | 'havale' | 'cek' | 'diger';

export interface Expense {
  id: string;
  lab_id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  notes: string | null;
  purchase_invoice_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Çoklu döviz (20260507080000_finance_currency)
  currency?: string | null;
  rate_at_time?: number | null;
  amount_base?: number | null;
  base_currency_at_time?: string | null;
  /** Gideri doğuran kayıt — kurye teslimatı, maaş ödemesi, avans. */
  delivery_id?: string | null;
  salary_payment_id?: string | null;
  advance_id?: string | null;
}

/**
 * Gider detayında gösterilen teslimat kaydı.
 * Kurye giderini DOĞURAN hareket budur: amaç, yön, rota, ücret ve zaman damgaları
 * gider satırının tek satırlık açıklamasında kaybolan her şeyi taşır.
 */
export interface ExpenseDelivery {
  id: string;
  work_order_id: string | null;
  status: string;
  mode: string | null;
  purpose: string | null;
  direction: string | null;
  external_provider: string | null;
  external_tracking_no: string | null;
  external_tracking_code: string | null;
  fee_amount: number | null;
  fee_currency: string | null;
  fee_source: string | null;
  stage_snapshot: string | null;
  assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  origin_name: string | null;
  origin_address: string | null;
  destination_name: string | null;
  destination_address: string | null;
  destination_phone: string | null;
  recipient_name: string | null;
  recipient_note: string | null;
  notes: string | null;
  ext_courier_name: string | null;
  ext_courier_phone: string | null;
  /** İç kurye — deliveries.courier_id profiles(id)'ye bakar (couriers'a DEĞİL). */
  courier: { full_name: string | null; phone: string | null } | null;
  work_order: { id: string; order_number: string | null; status: string | null } | null;
}

export interface CreateExpenseParams {
  category: ExpenseCategory;
  description: string;
  amount: number;
  expense_date?: string;
  payment_method?: ExpensePaymentMethod;
  notes?: string;
  /** Phase 3: orijinal currency (default 'TRY') */
  currency?: Currency;
  /** Manuel kur (1 birim currency = X baz). Verilirse snapshot yerine bu kullanılır. */
  rate?: number;
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  malzeme:  'Malzeme',
  kira:     'Kira',
  personel: 'Personel',
  ekipman:  'Ekipman',
  vergi:    'Vergi / Sigorta',
  kurye:    'Kurye',
  diger:    'Diğer',
};

export const EXPENSE_CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  malzeme:  'package-variant',
  kira:     'office-building',
  personel: 'account-group',
  ekipman:  'tools',
  vergi:    'bank',
  kurye:    'truck-delivery',
  diger:    'dots-horizontal-circle',
};

export const EXPENSE_CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  malzeme:  '#3B82F6',
  kira:     '#8B5CF6',
  personel: '#F59E0B',
  ekipman:  '#10B981',
  vergi:    '#EF4444',
  kurye:    '#0EA5E9',
  diger:    '#64748B',
};

export async function fetchExpenses(filters?: {
  category?: ExpenseCategory;
  date_from?: string;
  date_to?: string;
}) {
  let q = supabase
    .from('expenses')
    .select('*')
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.category) q = q.eq('category', filters.category);
  if (filters?.date_from) q = q.gte('expense_date', filters.date_from);
  if (filters?.date_to)   q = q.lte('expense_date', filters.date_to);

  return q.returns<Expense[]>();
}

/**
 * Tek bir gideri, onu doğuran kayıtla birlikte getirir.
 *
 * İki adımda okunur (tek gömülü sorgu yerine): teslimat gömmesi hem `courier_id`
 * hem `work_order_id` üzerinden ikinci seviye join ister; ayrı sorgu hem RLS
 * hatalarını yalıtır hem de teslimat okunamazsa giderin kendisinin yine
 * görünmesini sağlar.
 */
export async function fetchExpenseDetail(id: string): Promise<{
  expense: Expense | null;
  delivery: ExpenseDelivery | null;
  createdByName: string | null;
  error: string | null;
}> {
  const { data: exp, error } = await supabase
    .from('expenses').select('*').eq('id', id).maybeSingle();
  if (error || !exp) {
    return { expense: null, delivery: null, createdByName: null, error: error?.message ?? 'Gider bulunamadı' };
  }

  const expense = exp as Expense;
  let delivery: ExpenseDelivery | null = null;
  let createdByName: string | null = null;

  const jobs: Promise<void>[] = [];

  if (expense.delivery_id) {
    jobs.push((async () => {
      const { data } = await supabase
        .from('deliveries')
        .select(`
          id, work_order_id, status, mode, purpose, direction,
          external_provider, external_tracking_no, external_tracking_code,
          fee_amount, fee_currency, fee_source, stage_snapshot,
          assigned_at, picked_up_at, delivered_at, cancelled_at, cancel_reason,
          origin_name, origin_address,
          destination_name, destination_address, destination_phone,
          recipient_name, recipient_note, notes,
          ext_courier_name, ext_courier_phone,
          courier:courier_id ( full_name, phone ),
          work_order:work_order_id ( id, order_number, status )
        `)
        .eq('id', expense.delivery_id!)
        .maybeSingle();
      if (data) delivery = data as unknown as ExpenseDelivery;
    })());
  }

  if (expense.created_by) {
    jobs.push((async () => {
      const { data } = await supabase
        .from('profiles').select('full_name').eq('id', expense.created_by!).maybeSingle();
      createdByName = (data as any)?.full_name ?? null;
    })());
  }

  await Promise.all(jobs);
  return { expense, delivery, createdByName, error: null };
}

export async function createExpense(params: CreateExpenseParams) {
  const expenseDate = params.expense_date ?? new Date().toISOString().slice(0, 10);
  const base = getBaseCurrency();
  const currency = params.currency ?? (base as CreateExpenseParams['currency'] & string);

  // Phase 3: Snapshot kur al
  let rate = 1;
  let baseCurrency = base;
  let amountBase = params.amount;

  // Sadece base currency dışıysa kur belirle: manuel verildiyse onu kullan, yoksa snapshot/TCMB.
  if (currency !== base) {
    if (params.rate && params.rate > 0) {
      rate = params.rate;
      baseCurrency = base;
      amountBase = params.amount * rate;
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles').select('lab_id').eq('id', user?.id ?? '').single();
      const labId = (profile as any)?.lab_id ?? null;

      const { data: snap, error: snapErr } = await supabase.rpc('get_snapshot_rate', {
        p_lab_id: labId,
        p_currency: currency,
        p_at_date: expenseDate,
      });
      if (snapErr || !snap?.[0]?.rate) {
        return {
          data: null,
          error: { message: `${currency} kuru tanımlı değil. Manuel kur gir veya Ayarlar → Döviz Kurları'ndan ekleyin.` } as any,
        };
      }
      rate = Number(snap[0].rate);
      baseCurrency = snap[0].base_currency ?? base;
      amountBase = params.amount * rate;
    }
  }

  const { rate: _omitRate, ...insertParams } = params;  // `rate` bir kolon değil — insert'ten çıkar
  return supabase.from('expenses').insert({
    ...insertParams,
    expense_date: expenseDate,
    payment_method: params.payment_method ?? 'nakit',
    currency,
    rate_at_time: rate,
    amount_base: amountBase,
    base_currency_at_time: baseCurrency,
  }).select().single();
}

export async function updateExpense(id: string, params: Partial<CreateExpenseParams>) {
  // Update için: amount / currency / rate değiştiyse türetilmiş alanları
  // (rate_at_time, amount_base, base_currency_at_time) TUTARLI yeniden hesapla.
  // Kısmi patch'te eksik alanlar mevcut satırdan tamamlanır (örn. yalnız amount
  // değişen EUR giderinde currency 'TRY' varsayılmaz, kur da korunur).
  const { rate: manualRate, ...rest } = params;       // `rate` kolon değil — patch'ten ayır
  const patch: any = { ...rest, updated_at: new Date().toISOString() };
  if (params.currency !== undefined || params.amount != null || (manualRate != null && manualRate > 0)) {
    const base = getBaseCurrency();
    const { data: existing } = await supabase
      .from('expenses')
      .select('amount, currency, expense_date, rate_at_time')
      .eq('id', id)
      .single();
    const currency = (params.currency ?? (existing as any)?.currency ?? base) as string;
    const amount = Number(params.amount ?? (existing as any)?.amount ?? 0) || 0;
    if (currency === base) {
      patch.rate_at_time = 1;
      patch.amount_base = amount;
      patch.base_currency_at_time = base;
    } else if (manualRate && manualRate > 0) {
      patch.rate_at_time = manualRate;
      patch.amount_base = amount * manualRate;
      patch.base_currency_at_time = base;
    } else {
      // Currency değişmediyse mevcut kuru koru (yalnız amount değişimi kuru bozmasın).
      const existingRate = Number((existing as any)?.rate_at_time) || 0;
      if (params.currency === undefined && existingRate > 0) {
        patch.rate_at_time = existingRate;
        patch.amount_base = amount * existingRate;
      } else {
        const date = params.expense_date ?? (existing as any)?.expense_date ?? new Date().toISOString().slice(0, 10);
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = await supabase.from('profiles').select('lab_id').eq('id', user?.id ?? '').single();
        const labId = (profile as any)?.lab_id ?? null;
        const { data: snap } = await supabase.rpc('get_snapshot_rate', {
          p_lab_id: labId, p_currency: currency, p_at_date: date,
        });
        if (snap?.[0]?.rate) {
          patch.rate_at_time = Number(snap[0].rate);
          patch.amount_base = amount * Number(snap[0].rate);
          patch.base_currency_at_time = snap[0].base_currency ?? base;
        } else {
          return {
            data: null,
            error: { message: `${currency} kuru tanımlı değil. Manuel kur gir veya Ayarlar → Döviz Kurları'ndan ekleyin.` } as any,
          };
        }
      }
    }
  }
  return supabase.from('expenses').update(patch).eq('id', id).select().single();
}

export async function deleteExpense(id: string) {
  return supabase.from('expenses').delete().eq('id', id);
}

/**
 * Satın alma faturasını + bağlantılı stok hareketlerini, cari kaydını ve gider satırını sil.
 * revertStock=true ise stok miktarları o faturadaki ürünlerden düşülür.
 */
export async function deletePurchaseInvoice(invoiceId: string, revertStock: boolean) {
  return supabase.rpc('delete_purchase_invoice', {
    p_invoice_id: invoiceId,
    p_revert_stock: revertStock,
  });
}

export async function fetchExpenseStats(monthsBack = 6) {
  const from = new Date();
  from.setMonth(from.getMonth() - monthsBack);
  const dateFrom = from.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('expenses')
    .select('category, amount, currency, expense_date')
    .gte('expense_date', dateFrom);

  if (error || !data) return { byCurrency: [] as CurrencyTotal[], byCategory: {} as Record<string, CurrencyTotal[]>, error };

  // Katı per-currency: asla toplama yok, para birimine göre grupla.
  const ccyOf = (e: any) => ((e.currency ?? 'TRY') as Currency);
  const byCurrency = groupByCurrency(data, (e: any) => ({ amount: Number(e.amount) || 0, currency: ccyOf(e) }));
  const buckets: Record<string, any[]> = {};
  for (const e of data) (buckets[(e as any).category] ??= []).push(e);
  const byCategory: Record<string, CurrencyTotal[]> = {};
  for (const cat of Object.keys(buckets)) {
    byCategory[cat] = groupByCurrency(buckets[cat], (e: any) => ({ amount: Number(e.amount) || 0, currency: ccyOf(e) }));
  }
  return { byCurrency, byCategory, error: null };
}
