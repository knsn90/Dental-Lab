import { supabase } from '../../core/api/supabase';

export type CheckStatus = 'beklemede' | 'tahsil_edildi' | 'iade' | 'iptal';

export interface Check {
  id: string;
  lab_id: string;
  clinic_id: string | null;
  check_number: string | null;
  bank_name: string | null;
  amount: number;
  issue_date: string;
  due_date: string;
  status: CheckStatus;
  notes: string | null;
  payment_id: string | null;
  created_at: string;
  updated_at: string;
  clinic?: { id: string; name: string } | null;
}

export interface CreateCheckParams {
  clinic_id?: string | null;
  check_number?: string;
  bank_name?: string;
  amount: number;
  issue_date?: string;
  due_date: string;
  notes?: string;
}

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  beklemede:      'Beklemede',
  tahsil_edildi:  'Tahsil Edildi',
  iade:           'İade',
  iptal:          'İptal',
};

export const CHECK_STATUS_COLORS: Record<CheckStatus, { fg: string; bg: string }> = {
  beklemede:      { fg: '#B45309', bg: '#FEF3C7' },
  tahsil_edildi:  { fg: '#047857', bg: '#D1FAE5' },
  iade:           { fg: '#DC2626', bg: '#FEE2E2' },
  iptal:          { fg: '#64748B', bg: '#F1F5F9' },
};

export async function fetchChecks(status?: CheckStatus) {
  let q = supabase
    .from('checks')
    .select('*, clinic:clinics(id, name)')
    .order('due_date', { ascending: true });

  if (status) q = q.eq('status', status);

  return q.returns<Check[]>();
}

export async function createCheck(params: CreateCheckParams) {
  return supabase.from('checks').insert({
    ...params,
    issue_date: params.issue_date ?? new Date().toISOString().slice(0, 10),
  }).select('*, clinic:clinics(id, name)').single();
}

export async function updateCheckStatus(id: string, status: CheckStatus) {
  return supabase.from('checks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
}

export async function deleteCheck(id: string) {
  return supabase.from('checks').delete().eq('id', id);
}
