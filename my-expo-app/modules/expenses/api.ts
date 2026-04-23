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
  return supabase.from('expenses').insert({
    ...params,
    expense_date: params.expense_date ?? new Date().toISOString().slice(0, 10),
    payment_method: params.payment_method ?? 'nakit',
  }).select().single();
}

export async function updateExpense(id: string, params: Partial<CreateExpenseParams>) {
  return supabase.from('expenses').update({ ...params, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
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
