import { supabase } from '../../core/api/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
export type AccountType = 'kasa' | 'banka';
export type MovementDirection = 'giris' | 'cikis';
export type MovementCategory =
  | 'tahsilat' | 'odeme' | 'maas' | 'kira' | 'malzeme' | 'vergi' | 'diger';

export interface CashAccount {
  id: string;
  lab_id: string;
  name: string;
  account_type: AccountType;
  bank_name: string | null;
  iban: string | null;
  currency: string;
  opening_balance: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  // From v_cash_account_summary
  total_in?: number;
  total_out?: number;
  balance?: number;
}

export interface CashMovement {
  id: string;
  lab_id: string;
  account_id: string;
  direction: MovementDirection;
  amount: number;
  movement_date: string;
  category: MovementCategory;
  description: string;
  ref_type: string | null;
  ref_id: string | null;
  created_at: string;
}

export interface CreateAccountParams {
  name: string;
  account_type: AccountType;
  bank_name?: string;
  iban?: string;
  currency?: string;
  opening_balance?: number;
  notes?: string;
}

export interface CreateMovementParams {
  account_id: string;
  direction: MovementDirection;
  amount: number;
  movement_date?: string;
  category: MovementCategory;
  description: string;
  ref_type?: string;
  ref_id?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  kasa: 'Kasa',
  banka: 'Banka',
};

export const ACCOUNT_TYPE_ICONS: Record<AccountType, string> = {
  kasa: 'safe',
  banka: 'bank-outline',
};

export const MOVEMENT_CATEGORY_LABELS: Record<MovementCategory, string> = {
  tahsilat: 'Tahsilat',
  odeme:    'Ödeme',
  maas:     'Maaş',
  kira:     'Kira',
  malzeme:  'Malzeme',
  vergi:    'Vergi',
  diger:    'Diğer',
};

export const MOVEMENT_CATEGORY_ICONS: Record<MovementCategory, string> = {
  tahsilat: 'cash-check',
  odeme:    'cash-minus',
  maas:     'account-cash-outline',
  kira:     'home-city-outline',
  malzeme:  'package-variant',
  vergi:    'file-percent-outline',
  diger:    'dots-horizontal',
};

// ─── API ──────────────────────────────────────────────────────────────────────
export async function fetchCashAccounts() {
  return supabase
    .from('v_cash_account_summary')
    .select('*')
    .order('account_type')
    .returns<CashAccount[]>();
}

export async function createCashAccount(params: CreateAccountParams) {
  return supabase
    .from('cash_accounts')
    .insert({
      name: params.name,
      account_type: params.account_type,
      bank_name: params.bank_name ?? null,
      iban: params.iban ?? null,
      currency: params.currency ?? 'TRY',
      opening_balance: params.opening_balance ?? 0,
      notes: params.notes ?? null,
    })
    .select()
    .single();
}

export async function updateCashAccount(id: string, patch: Partial<CreateAccountParams>) {
  return supabase.from('cash_accounts').update(patch).eq('id', id).select().single();
}

export async function deleteCashAccount(id: string) {
  return supabase.from('cash_accounts').delete().eq('id', id);
}

export async function fetchMovements(accountId: string, limit = 50) {
  return supabase
    .from('cash_movements')
    .select('*')
    .eq('account_id', accountId)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<CashMovement[]>();
}

export async function createMovement(params: CreateMovementParams) {
  const { data: { user } } = await supabase.auth.getUser();
  return supabase
    .from('cash_movements')
    .insert({
      account_id: params.account_id,
      direction: params.direction,
      amount: params.amount,
      movement_date: params.movement_date ?? new Date().toISOString().slice(0, 10),
      category: params.category,
      description: params.description,
      ref_type: params.ref_type ?? null,
      ref_id: params.ref_id ?? null,
      created_by: user?.id ?? null,
    })
    .select()
    .single();
}

export async function deleteMovement(id: string) {
  return supabase.from('cash_movements').delete().eq('id', id);
}
