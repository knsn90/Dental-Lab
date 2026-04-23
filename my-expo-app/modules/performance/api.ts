import { supabase } from '../../core/api/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
export type PerfMetric = 'orders_completed' | 'on_time_rate' | 'quality_pass_rate' | 'revenue_generated';
export type ThresholdType = 'min' | 'target' | 'per_unit';
export type BonusType = 'fixed' | 'percent' | 'per_unit';

export interface PerformanceRule {
  id: string;
  lab_id: string;
  name: string;
  description: string | null;
  metric: PerfMetric;
  threshold_value: number;
  threshold_type: ThresholdType;
  bonus_type: BonusType;
  bonus_amount: number;
  applies_to: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeePerformance {
  id: string;
  lab_id: string;
  employee_id: string;
  period: string;
  orders_assigned: number;
  orders_completed: number;
  orders_on_time: number;
  orders_late: number;
  orders_quality_ok: number;
  completion_rate: number;
  on_time_rate: number;
  quality_pass_rate: number;
  revenue_generated: number;
  score: number;
  is_locked: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // from view
  full_name?: string;
  role?: string;
  total_bonus?: number;
}

export interface PerformanceBonus {
  id: string;
  lab_id: string;
  performance_id: string;
  rule_id: string | null;
  description: string;
  metric_value: number;
  bonus_amount: number;
  transferred_to_payroll: boolean;
  payroll_id: string | null;
  created_at: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────
export const METRIC_LABELS: Record<PerfMetric, { label: string; unit: string; icon: string }> = {
  orders_completed:  { label: 'Tamamlanan Sipariş', unit: 'adet',  icon: 'check-square' },
  on_time_rate:      { label: 'Zamanında Teslim',    unit: '%',     icon: 'clock'        },
  quality_pass_rate: { label: 'Kalite Geçiş Oranı',  unit: '%',     icon: 'star'         },
  revenue_generated: { label: 'Üretilen Ciro',        unit: '₺',    icon: 'trending-up'  },
};

export const THRESHOLD_TYPE_LABELS: Record<ThresholdType, string> = {
  min:      'En az (eşiğe ulaşınca)',
  target:   'Hedef üstü (her birim için)',
  per_unit: 'Her birim başına',
};

export const BONUS_TYPE_LABELS: Record<BonusType, string> = {
  fixed:    'Sabit tutar (₺)',
  percent:  'Maaş yüzdesi (%)',
  per_unit: 'Birim başına (₺)',
};

export const SCORE_LEVELS = [
  { min: 90, label: 'Mükemmel', color: '#059669', icon: 'award' },
  { min: 75, label: 'İyi',      color: '#2563EB', icon: 'thumbs-up' },
  { min: 60, label: 'Orta',     color: '#D97706', icon: 'minus-circle' },
  { min: 0,  label: 'Düşük',   color: '#DC2626', icon: 'alert-circle' },
];

export function getScoreLevel(score: number) {
  return SCORE_LEVELS.find(l => score >= l.min) ?? SCORE_LEVELS[SCORE_LEVELS.length - 1];
}

export function fmtPeriod(period: string): string {
  const [y, m] = period.split('-');
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                  'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function fetchPerformanceList(period: string) {
  return supabase
    .from('v_performance_summary')
    .select('*')
    .eq('period', period)
    .order('score', { ascending: false });
}

export async function fetchPerformance(employeeId: string, period: string) {
  return supabase
    .from('employee_performance')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('period', period)
    .maybeSingle();
}

export async function calculatePerformance(employeeId: string, period: string) {
  return supabase.rpc('calculate_employee_performance', {
    p_employee_id: employeeId,
    p_period: period,
  });
}

export async function calculateBonuses(performanceId: string) {
  return supabase.rpc('calculate_performance_bonuses', {
    p_performance_id: performanceId,
  });
}

export async function fetchBonuses(performanceId: string) {
  return supabase
    .from('performance_bonuses')
    .select('*')
    .eq('performance_id', performanceId)
    .order('created_at');
}

export async function lockPerformance(performanceId: string) {
  return supabase
    .from('employee_performance')
    .update({ is_locked: true, updated_at: new Date().toISOString() })
    .eq('id', performanceId);
}

export async function transferBonusToPayroll(bonusId: string, payrollId: string) {
  return supabase
    .from('performance_bonuses')
    .update({ transferred_to_payroll: true, payroll_id: payrollId })
    .eq('id', bonusId);
}

// ── Prim kuralları ────────────────────────────────────────────────────────────
export async function fetchRules() {
  return supabase
    .from('performance_rules')
    .select('*')
    .order('name');
}

export async function saveRule(rule: Omit<PerformanceRule, 'id' | 'lab_id' | 'created_at' | 'updated_at'> & { id?: string }) {
  if (rule.id) {
    return supabase
      .from('performance_rules')
      .update({ ...rule, updated_at: new Date().toISOString() })
      .eq('id', rule.id)
      .select().single();
  }
  return supabase
    .from('performance_rules')
    .insert(rule)
    .select().single();
}

export async function toggleRule(ruleId: string, isActive: boolean) {
  return supabase
    .from('performance_rules')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', ruleId);
}

export async function deleteRule(ruleId: string) {
  return supabase.from('performance_rules').delete().eq('id', ruleId);
}
