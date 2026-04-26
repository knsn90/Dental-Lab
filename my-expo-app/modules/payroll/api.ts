import { supabase } from '../../core/api/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
export type PayrollStatus = 'taslak' | 'onaylandi' | 'odendi';
export type PayrollItemType = 'kesinti' | 'prim' | 'avans' | 'diger';

export interface PayrollSettings {
  id?: string;
  lab_id?: string;
  employee_id: string;
  working_days_per_month: number;
  late_penalty_per_incident: number;
  overtime_multiplier: number;
  include_sgk: boolean;
  sgk_employee_rate: number;
  sgk_employer_rate: number;
}

export interface Payroll {
  id: string;
  lab_id: string;
  employee_id: string;
  period: string;         // 'YYYY-MM'
  base_salary: number;
  working_days_month: number;
  actual_work_days: number;
  absent_days: number;
  late_count: number;
  leave_days: number;
  overtime_minutes: number;
  absence_deduction: number;
  late_deduction: number;
  sgk_employee: number;
  sgk_employer: number;
  overtime_bonus: number;
  total_deductions: number;
  total_bonuses: number;
  gross_salary: number;
  net_salary: number;
  status: PayrollStatus;
  notes: string | null;
  paid_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  // from v_payroll_summary
  full_name?: string;
  role?: string;
  custom_items_net?: number;
}

export interface PayrollItem {
  id: string;
  lab_id: string;
  payroll_id: string;
  type: PayrollItemType;
  description: string;
  amount: number;
  created_at: string;
}

// ─── Config labels ────────────────────────────────────────────────────────────
export const PAYROLL_STATUS_CFG: Record<PayrollStatus, { label: string; color: string; bg: string; icon: string }> = {
  taslak:    { label: 'Taslak',    color: '#64748B', bg: '#F8FAFC', icon: 'file'          },
  onaylandi: { label: 'Onaylandı', color: '#2563EB', bg: '#EFF6FF', icon: 'check-circle'  },
  odendi:    { label: 'Ödendi',    color: '#059669', bg: '#ECFDF5', icon: 'check-circle'  },
};

export const PAYROLL_ITEM_TYPE_CFG: Record<PayrollItemType, { label: string; color: string; sign: 1 | -1 }> = {
  kesinti: { label: 'Kesinti', color: '#DC2626', sign: -1 },
  prim:    { label: 'Prim',    color: '#059669', sign:  1 },
  avans:   { label: 'Avans',   color: '#D97706', sign: -1 },
  diger:   { label: 'Diğer',   color: '#64748B', sign:  1 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

/** Bir dönem için tüm çalışanların bordro listesi (v_payroll_summary'den) */
export async function fetchPayrollList(period: string) {
  return supabase
    .from('v_payroll_summary')
    .select('*')
    .eq('period', period)
    .order('full_name');
}

/** Belirli çalışanın tek dönem bordrosu */
export async function fetchPayroll(employeeId: string, period: string) {
  return supabase
    .from('employee_payroll')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('period', period)
    .maybeSingle();
}

/** Devam verisinden otomatik bordro hesapla ve upsert et */
export async function calculatePayroll(employeeId: string, period: string) {
  return supabase.rpc('upsert_payroll_from_attendance', {
    p_employee_id: employeeId,
    p_period: period,
  });
}

/** Bordro kaydet / güncelle (manuel) */
export async function savePayroll(
  employeeId: string,
  period: string,
  data: Partial<Pick<Payroll,
    'base_salary' | 'working_days_month' | 'actual_work_days' |
    'absent_days' | 'late_count' | 'leave_days' | 'overtime_minutes' |
    'absence_deduction' | 'late_deduction' | 'sgk_employee' | 'sgk_employer' |
    'overtime_bonus' | 'total_deductions' | 'total_bonuses' | 'gross_salary' |
    'net_salary' | 'notes'
  >>,
) {
  return supabase
    .from('employee_payroll')
    .upsert({
      employee_id: employeeId,
      period,
      ...data,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'employee_id,period' })
    .select()
    .single();
}

/** Bordroyu onayla */
export async function approvePayroll(payrollId: string, approverId: string) {
  return supabase
    .from('employee_payroll')
    .update({
      status: 'onaylandi',
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', payrollId)
    .select()
    .single();
}

/** Bordroyu ödendi olarak işaretle */
export async function markPayrollPaid(payrollId: string) {
  return supabase
    .from('employee_payroll')
    .update({
      status: 'odendi',
      paid_at: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    })
    .eq('id', payrollId)
    .select()
    .single();
}

/** Bordroyu taslağa geri al */
export async function revertPayrollToDraft(payrollId: string) {
  return supabase
    .from('employee_payroll')
    .update({ status: 'taslak', approved_by: null, approved_at: null, updated_at: new Date().toISOString() })
    .eq('id', payrollId);
}

// ── Kalemler ──────────────────────────────────────────────────────────────────

export async function fetchPayrollItems(payrollId: string) {
  return supabase
    .from('payroll_items')
    .select('*')
    .eq('payroll_id', payrollId)
    .order('created_at');
}

export async function addPayrollItem(
  payrollId: string,
  item: { type: PayrollItemType; description: string; amount: number },
) {
  return supabase
    .from('payroll_items')
    .insert({ payroll_id: payrollId, ...item })
    .select()
    .single();
}

export async function deletePayrollItem(itemId: string) {
  return supabase.from('payroll_items').delete().eq('id', itemId);
}

// ── Ayarlar ────────────────────────────────────────────────────────────────────

export async function fetchPayrollSettings(employeeId: string) {
  return supabase
    .from('payroll_settings')
    .select('*')
    .eq('employee_id', employeeId)
    .maybeSingle();
}

export async function savePayrollSettings(settings: PayrollSettings) {
  return supabase
    .from('payroll_settings')
    .upsert({ ...settings, updated_at: new Date().toISOString() }, { onConflict: 'employee_id' })
    .select()
    .single();
}

/** Dönemde toplam bordro özeti */
export async function fetchPayrollPeriodSummary(period: string) {
  const { data } = await supabase
    .from('employee_payroll')
    .select('net_salary,status,total_deductions')
    .eq('period', period);
  if (!data) return { total: 0, paid: 0, pending: 0, count: 0 };
  return {
    total:   data.reduce((s, r) => s + Number(r.net_salary), 0),
    paid:    data.filter(r => r.status === 'odendi').reduce((s, r) => s + Number(r.net_salary), 0),
    pending: data.filter(r => r.status !== 'odendi').reduce((s, r) => s + Number(r.net_salary), 0),
    count:   data.length,
  };
}
