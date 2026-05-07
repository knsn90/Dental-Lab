import { supabase } from '../../core/api/supabase';

export type ExpenseCategory = 'malzeme' | 'kira' | 'personel' | 'ekipman' | 'vergi' | 'diger';
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
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseParams {
  category: ExpenseCategory;
  description: string;
  amount: number;
  expense_date?: string;
  payment_method?: ExpensePaymentMethod;
  notes?: string;
  /** Phase 3: orijinal currency (default 'TRY') */
  currency?: 'TRY' | 'EUR' | 'USD' | 'GBP';
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  malzeme:  'Malzeme',
  kira:     'Kira',
  personel: 'Personel',
  ekipman:  'Ekipman',
  vergi:    'Vergi / Sigorta',
  diger:    'Diğer',
};

export const EXPENSE_CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  malzeme:  'package-variant',
  kira:     'office-building',
  personel: 'account-group',
  ekipman:  'tools',
  vergi:    'bank',
  diger:    'dots-horizontal-circle',
};

export const EXPENSE_CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  malzeme:  '#3B82F6',
  kira:     '#8B5CF6',
  personel: '#F59E0B',
  ekipman:  '#10B981',
  vergi:    '#EF4444',
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

export async function createExpense(params: CreateExpenseParams) {
  const expenseDate = params.expense_date ?? new Date().toISOString().slice(0, 10);
  const currency = params.currency ?? 'TRY';

  // Phase 3: Snapshot kur al
  let rate = 1;
  let baseCurrency = 'TRY';
  let amountBase = params.amount;

  // Sadece base currency dışıysa kur çek
  if (currency !== 'TRY') {
    // Lab id resolve
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
        error: { message: `${currency} kuru tanımlı değil. Ayarlar → Döviz Kurları'ndan ekleyin.` } as any,
      };
    }
    rate = Number(snap[0].rate);
    baseCurrency = snap[0].base_currency ?? 'TRY';
    amountBase = params.amount * rate;
  }

  return supabase.from('expenses').insert({
    ...params,
    expense_date: expenseDate,
    payment_method: params.payment_method ?? 'nakit',
    currency,
    rate_at_time: rate,
    amount_base: amountBase,
    base_currency_at_time: baseCurrency,
  }).select().single();
}

export async function updateExpense(id: string, params: Partial<CreateExpenseParams>) {
  // Update için: amount veya currency değiştiyse snapshot yenile
  const patch: any = { ...params, updated_at: new Date().toISOString() };
  if (params.currency || params.amount != null) {
    const currency = (params.currency ?? 'TRY') as 'TRY' | 'EUR' | 'USD' | 'GBP';
    const amount = params.amount ?? 0;
    if (currency === 'TRY') {
      patch.rate_at_time = 1;
      patch.amount_base = amount;
      patch.base_currency_at_time = 'TRY';
    } else if (params.currency || params.amount != null) {
      const date = params.expense_date ?? new Date().toISOString().slice(0, 10);
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('profiles').select('lab_id').eq('id', user?.id ?? '').single();
      const labId = (profile as any)?.lab_id ?? null;
      const { data: snap } = await supabase.rpc('get_snapshot_rate', {
        p_lab_id: labId, p_currency: currency, p_at_date: date,
      });
      if (snap?.[0]?.rate) {
        patch.rate_at_time = Number(snap[0].rate);
        patch.amount_base = amount * Number(snap[0].rate);
        patch.base_currency_at_time = snap[0].base_currency ?? 'TRY';
      }
    }
  }
  return supabase.from('expenses').update(patch).eq('id', id).select().single();
}

export async function deleteExpense(id: string) {
  return supabase.from('expenses').delete().eq('id', id);
}

export async function fetchExpenseStats(monthsBack = 6) {
  const from = new Date();
  from.setMonth(from.getMonth() - monthsBack);
  const dateFrom = from.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('expenses')
    .select('category, amount, expense_date')
    .gte('expense_date', dateFrom);

  if (error || !data) return { total: 0, byCategory: {}, error };

  const total = data.reduce((s, e) => s + Number(e.amount), 0);
  const byCategory: Record<string, number> = {};
  for (const e of data) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount);
  }
  return { total, byCategory, error: null };
}
