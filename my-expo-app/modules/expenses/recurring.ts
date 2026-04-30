/**
 * Recurring Expenses API
 *
 *  - fetchRecurring          → tüm aktif/pasif şablonlar
 *  - upsertRecurring         → şablon ekleme/güncelleme
 *  - deleteRecurring         → şablon silme
 *  - generateRecurringNow    → vadesi gelen şablonları gider tablosuna üret
 */
import { supabase } from '../../core/api/supabase';

export type RecurringFrequency  = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type RecurringPaymentMethod = 'nakit' | 'kart' | 'havale' | 'cek' | 'diger';

export interface RecurringExpense {
  id: string;
  lab_id: string;
  name: string;
  category: 'malzeme' | 'kira' | 'personel' | 'ekipman' | 'vergi' | 'diger';
  amount: number;
  payment_method: RecurringPaymentMethod;
  frequency: RecurringFrequency;
  anchor_day: number;
  start_date: string;
  end_date: string | null;
  next_due_date: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  weekly:    'Haftalık',
  monthly:   'Aylık',
  quarterly: '3 Aylık',
  yearly:    'Yıllık',
};

export async function fetchRecurring() {
  return supabase
    .from('recurring_expenses')
    .select('*')
    .order('next_due_date', { ascending: true })
    .returns<RecurringExpense[]>();
}

export async function upsertRecurring(
  r: Partial<RecurringExpense> & {
    name: string; amount: number; frequency: RecurringFrequency;
    anchor_day: number; category: RecurringExpense['category'];
  }
) {
  if (r.id) {
    return supabase.from('recurring_expenses').update({ ...r, updated_at: new Date().toISOString() }).eq('id', r.id);
  }
  return supabase.from('recurring_expenses').insert(r);
}

export async function deleteRecurring(id: string) {
  return supabase.from('recurring_expenses').delete().eq('id', id);
}

export async function toggleRecurring(id: string, active: boolean) {
  return supabase.from('recurring_expenses').update({ active, updated_at: new Date().toISOString() }).eq('id', id);
}

/** Vadesi gelen şablonları expenses tablosuna üretir, kaç tane oluşturulduğunu döner */
export async function generateRecurringNow() {
  const { data, error } = await supabase.rpc('generate_recurring_expenses', { p_lab_id: null });
  return { count: (data as number | null) ?? 0, error };
}
