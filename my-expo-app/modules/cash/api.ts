import { supabase } from '../../core/api/supabase';
import type { DrawerCurrency } from './drawerModel';

// ─── Types ────────────────────────────────────────────────────────────────────
export type AccountType = 'kasa' | 'banka';
export type MovementDirection = 'giris' | 'cikis';
export type MovementCategory =
  | 'tahsilat' | 'odeme' | 'maas' | 'kira' | 'malzeme' | 'vergi' | 'diger'
  | 'transfer' | 'sayim';

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
  /** Nakit kasa (çekmece): yalnız cash_open_drawer() açar */
  is_drawer?: boolean;
  /** Açılış sayımı anı (kesim anı) */
  opened_at?: string | null;
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
  transfer: 'Bankaya yatırma',
  sayim:    'Sayım farkı',
};

export const MOVEMENT_CATEGORY_ICONS: Record<MovementCategory, string> = {
  tahsilat: 'cash-check',
  odeme:    'cash-minus',
  maas:     'account-cash-outline',
  kira:     'home-city-outline',
  malzeme:  'package-variant',
  vergi:    'file-percent-outline',
  diger:    'dots-horizontal',
  transfer: 'bank-transfer-in',
  sayim:    'scale-balance',
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

// ─── Nakit kasa (çekmece) ─────────────────────────────────────────────────────
export interface DrawerLastCount { counted_at: string; diff: number }
export interface Drawer extends CashAccount { last_count: DrawerLastCount | null }
export interface UnpostedRow { currency: string; cnt: number; total: number }

/**
 * Aktif nakit kasalar: özet bakiye + açılış anı + son sayım.
 * drawerIds: TÜM çekmece hesapları (pasif dahil) — "Diğer hesaplar" listesinden ayıklamak için.
 */
export async function fetchDrawers(): Promise<{ data: Drawer[]; drawerIds: string[]; error: any }> {
  const [acc, sum] = await Promise.all([
    supabase.from('cash_accounts').select('id, is_active, opened_at').eq('is_drawer', true),
    supabase.from('v_cash_account_summary').select('*'),
  ]);
  if (acc.error || sum.error) return { data: [], drawerIds: [], error: acc.error ?? sum.error };
  const all = (acc.data ?? []) as { id: string; is_active: boolean; opened_at: string | null }[];
  const meta = new Map(all.filter((a) => a.is_active).map((a) => [a.id, a]));
  const ids = [...meta.keys()];
  const counts = ids.length
    ? await supabase.from('cash_counts').select('account_id, counted_at, diff')
        .in('account_id', ids).eq('kind', 'sayim').order('counted_at', { ascending: false })
    : { data: [] as any[], error: null };
  if (counts.error) return { data: [], drawerIds: [], error: counts.error };
  const last = new Map<string, DrawerLastCount>();
  for (const c of (counts.data ?? []) as any[]) {
    if (!last.has(c.account_id)) last.set(c.account_id, { counted_at: c.counted_at, diff: Number(c.diff) || 0 });
  }
  const data = ((sum.data ?? []) as CashAccount[])
    .filter((a) => meta.has(a.id))
    .map((a) => ({ ...a, is_drawer: true, opened_at: meta.get(a.id)?.opened_at ?? null, last_count: last.get(a.id) ?? null }));
  return { data, drawerIds: all.map((a) => a.id), error: null };
}

export async function openDrawer(currency: DrawerCurrency, amount: number) {
  return supabase.rpc('cash_open_drawer', { p_currency: currency, p_amount: amount });
}

export async function countDrawer(accountId: string, counted: number) {
  return supabase.rpc('cash_count_drawer', { p_account: accountId, p_counted: counted });
}

/** Kasadan bankaya yatırma: elle çıkış hareketi (ref_type boş) */
export async function depositToBank(accountId: string, amount: number, date: string, note?: string) {
  return createMovement({
    account_id: accountId,
    direction: 'cikis',
    amount,
    movement_date: date,
    category: 'transfer',
    description: note?.trim() || 'Bankaya yatırıldı',
  });
}

/** Kasası olmayan para birimindeki nakit (ör. USD) */
export async function fetchUnposted(): Promise<{ data: UnpostedRow[]; error: any }> {
  const { data, error } = await supabase.rpc('cash_unposted_summary');
  return { data: ((data ?? []) as any[]).map((r) => ({ currency: r.currency, cnt: Number(r.cnt) || 0, total: Number(r.total) || 0 })), error };
}

/** Otomatik hareketin kaynağı: fatura (tahsilat) · klinik ekstresi (makbuz) · gider */
export async function resolveMovementSource(
  m: Pick<CashMovement, 'ref_type' | 'ref_id'>,
): Promise<{ kind: 'invoice' | 'statement' | 'expense'; id: string } | null> {
  if (!m.ref_id) return null;
  if (m.ref_type === 'expense') return { kind: 'expense', id: m.ref_id };
  if (m.ref_type === 'payment') {
    const { data } = await supabase.from('payments').select('invoice_id').eq('id', m.ref_id).maybeSingle();
    return data?.invoice_id ? { kind: 'invoice', id: data.invoice_id as string } : null;
  }
  if (m.ref_type === 'clinic_receipt_line') {
    const { data } = await supabase.from('clinic_receipt_lines')
      .select('receipt:clinic_receipts(clinic_id)').eq('id', m.ref_id).maybeSingle();
    const cid = (data as any)?.receipt?.clinic_id as string | undefined;
    return cid ? { kind: 'statement', id: cid } : null;
  }
  return null;
}

/** Tahsilatın yatırılabileceği hesaplar (banka + elle açılan kasa; nakit çekmeceleri hariç — nakit kendiliğinden düşer) */
export async function fetchDepositAccounts(): Promise<{ id: string; name: string; account_type: AccountType; currency: string }[]> {
  const { data, error } = await supabase.from('cash_accounts')
    .select('id, name, account_type, currency')
    .eq('is_active', true).eq('is_drawer', false)
    .order('account_type', { ascending: true }).order('name', { ascending: true });
  if (error) return [];
  return (data ?? []) as any;
}
