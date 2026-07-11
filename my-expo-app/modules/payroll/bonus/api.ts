/**
 * Bonus Engine — Supabase data layer.
 * Wraps CRUD on bonus_* tables and the 4 RPCs deployed in Faz 2.
 */

import { supabase } from '../../../core/api/supabase';
import type {
  BonusPolicy,
  BonusEligibleWorkType,
  BonusThreshold,
  BonusDifficultyRule,
  BonusStageRate,
  BonusQualityRule,
  BonusPolicyAssignment,
  BonusRun,
  PolicyFull,
  BonusRunBreakdownRow,
} from './types';

/* --------------------------------------------------------------------- */
/*  POLICY LIST                                                          */
/* --------------------------------------------------------------------- */

export async function listPolicies(): Promise<BonusPolicy[]> {
  const { data, error } = await supabase
    .from('bonus_policies')
    .select('*')
    .order('status', { ascending: true })   // active first (alphabetical)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPolicyFull(policyId: string): Promise<PolicyFull> {
  const [
    p, wt, th, df, sr, ql, asg,
  ] = await Promise.all([
    supabase.from('bonus_policies').select('*').eq('id', policyId).single(),
    supabase.from('bonus_eligible_work_types').select('*').eq('policy_id', policyId),
    supabase.from('bonus_thresholds').select('*').eq('policy_id', policyId).order('min_units'),
    supabase.from('bonus_difficulty_rules').select('*').eq('policy_id', policyId),
    supabase.from('bonus_stage_rates').select('*').eq('policy_id', policyId),
    supabase.from('bonus_quality_rules').select('*').eq('policy_id', policyId).order('max_remake_pct'),
    supabase.from('bonus_policy_assignments').select('*').eq('policy_id', policyId),
  ]);
  if (p.error) throw p.error;
  return {
    policy:      p.data as BonusPolicy,
    work_types:  (wt.data ?? []) as BonusEligibleWorkType[],
    thresholds:  (th.data ?? []) as BonusThreshold[],
    difficulty:  (df.data ?? []) as BonusDifficultyRule[],
    stage_rates: (sr.data ?? []) as BonusStageRate[],
    quality:     (ql.data ?? []) as BonusQualityRule[],
    assignments: (asg.data ?? []) as BonusPolicyAssignment[],
  };
}

/* --------------------------------------------------------------------- */
/*  POLICY MUTATIONS                                                     */
/* --------------------------------------------------------------------- */

export async function createPolicy(input: Record<string, any>): Promise<BonusPolicy> {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(input)) {
    const target = LEGACY_TO_REAL[k] ?? k;
    if (POLICY_COLUMNS.has(target)) clean[target] = v;
    if (k === 'is_active') clean.status = v ? 'active' : 'draft';
  }
  const { data, error } = await supabase
    .from('bonus_policies')
    .insert([clean])
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Real columns that may be sent in an UPDATE. Anything else is silently dropped. */
const POLICY_COLUMNS = new Set([
  'name','description','mode','period_type','currency','base_rate',
  'distribution_method','quality_window','remake_penalty','remake_penalty_points',
  'flat_amount_per_member','status',
]);

/** Map legacy field name → real column (for editor backwards compat). */
const LEGACY_TO_REAL: Record<string, string> = {
  remake_penalty_mode: 'remake_penalty',
  pool_distribution:   'distribution_method',
  first_paid_unit:     'base_rate',          // best-effort
};

export async function updatePolicy(id: string, patch: Record<string, any>): Promise<BonusPolicy> {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    const target = LEGACY_TO_REAL[k] ?? k;
    if (POLICY_COLUMNS.has(target)) clean[target] = v;
    // is_active true/false → status mapping
    if (k === 'is_active') clean.status = v ? 'active' : 'draft';
  }
  const { data, error } = await supabase
    .from('bonus_policies')
    .update(clean)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePolicy(id: string): Promise<void> {
  const { error } = await supabase.from('bonus_policies').delete().eq('id', id);
  if (error) throw error;
}

/** Replace all rows of a child table for a given policy. Atomic-ish: delete + insert. */
async function replaceChildren<T extends { id?: string }>(
  table: string,
  policyId: string,
  rows: T[],
): Promise<void> {
  const del = await supabase.from(table).delete().eq('policy_id', policyId);
  if (del.error) throw del.error;
  if (!rows.length) return;
  const payload = rows.map(r => {
    const { id, ...rest } = r as any;
    return { ...rest, policy_id: policyId };
  });
  const ins = await supabase.from(table).insert(payload);
  if (ins.error) throw ins.error;
}

export const replaceWorkTypes = (pid: string, rows: Partial<BonusEligibleWorkType>[]) =>
  replaceChildren('bonus_eligible_work_types', pid, rows as any);
export const replaceThresholds = (pid: string, rows: Partial<BonusThreshold>[]) =>
  replaceChildren('bonus_thresholds', pid, rows as any);
export const replaceDifficulty = (pid: string, rows: Partial<BonusDifficultyRule>[]) =>
  replaceChildren('bonus_difficulty_rules', pid, rows as any);
export const replaceStageRates = (pid: string, rows: Partial<BonusStageRate>[]) =>
  replaceChildren('bonus_stage_rates', pid, rows as any);
export const replaceQuality = (pid: string, rows: Partial<BonusQualityRule>[]) =>
  replaceChildren('bonus_quality_rules', pid, rows as any);
export const replaceAssignments = (pid: string, rows: Partial<BonusPolicyAssignment>[]) =>
  replaceChildren('bonus_policy_assignments', pid, rows as any);

/* --------------------------------------------------------------------- */
/*  RPCs                                                                 */
/* --------------------------------------------------------------------- */

export interface CalcResult {
  run_id?: string | null;
  status: 'draft' | 'approved' | 'posted' | 'preview';
  total_units: number;
  total_pool: number;
  total_payout: number;
  breakdown: BonusRunBreakdownRow[];
  // legacy editor compat aliases
  totals?: {
    total_units?: number;
    total_points?: number;
    total_bonus?: number;
    pool_amount?: number;
  };
  rows?: BonusRunBreakdownRow[];
}

/**
 * Trigger the bonus calculation.
 * - dry_run = true  → preview, no row written.
 * - dry_run = false → inserts a bonus_runs(status='draft') and returns the run.
 */
export async function calculateBonusRun(
  policyId: string,
  year: number,
  month: number,
  dryRun: boolean = true,
): Promise<CalcResult> {
  const { data, error } = await supabase.rpc('calculate_bonus_run', {
    p_policy_id: policyId,
    p_year: year,
    p_month: month,
    p_dry_run: dryRun,
  });
  if (error) throw error;
  const res = (data ?? {}) as CalcResult;
  // Backfill legacy aliases for old editor code.
  res.rows = res.breakdown;
  res.totals = {
    total_units: res.total_units,
    total_points: (res.breakdown ?? []).reduce((s, r) => s + Number(r.points ?? 0), 0),
    total_bonus: res.total_payout,
    pool_amount: res.total_pool,
  };
  return res;
}

export async function approveBonusRun(runId: string): Promise<BonusRun> {
  const { data, error } = await supabase.rpc('approve_bonus_run', { p_run_id: runId });
  if (error) throw error;
  return data as BonusRun;
}

export async function revertBonusRunToDraft(runId: string): Promise<BonusRun> {
  const { data, error } = await supabase.rpc('revert_bonus_run_to_draft', { p_run_id: runId });
  if (error) throw error;
  return data as BonusRun;
}

export async function postBonusRun(runId: string): Promise<BonusRun> {
  const { data, error } = await supabase.rpc('post_bonus_run', { p_run_id: runId });
  if (error) throw error;
  return data as BonusRun;
}

export async function unpostBonusRun(runId: string): Promise<BonusRun> {
  const { data, error } = await supabase.rpc('unpost_bonus_run', { p_run_id: runId });
  if (error) throw error;
  return data as BonusRun;
}

/* --------------------------------------------------------------------- */
/*  LOOKUPS for editor                                                   */
/* --------------------------------------------------------------------- */

/** Distinct work_types from the lab's service catalog. */
export async function listAvailableWorkTypes(): Promise<string[]> {
  const { data, error } = await supabase
    .from('lab_services')
    .select('name')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r: any) => r.name as string).filter(Boolean)));
}

export interface WorkTypeWithCategory { name: string; category: string }

export async function listAvailableWorkTypesWithCategory(): Promise<WorkTypeWithCategory[]> {
  const { data, error } = await supabase
    .from('lab_services')
    .select('name, category')
    .eq('is_active', true)
    .order('category', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });
  if (error) throw error;
  const seen = new Set<string>();
  const out: WorkTypeWithCategory[] = [];
  (data ?? []).forEach((r: any) => {
    if (r.name && !seen.has(r.name)) {
      seen.add(r.name);
      out.push({ name: r.name, category: (r.category ?? '').trim() || 'Diğer' });
    }
  });
  return out;
}

export interface EmployeeLite {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  station_code: string | null;
}

export async function listEmployees(): Promise<EmployeeLite[]> {
  const { data, error } = await supabase
    .from('employees')
    .select('id, full_name, email, role')
    .order('full_name');
  if (error) throw error;
  return ((data ?? []) as any[]).map(e => ({ ...e, station_code: null })) as EmployeeLite[];
}
