import { supabase } from '../../core/api/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
export type EmployeeRole =
  | 'teknisyen' | 'sef_teknisyen' | 'muhasebe' | 'sekreter' | 'yonetici' | 'diger';

export type SalaryPaymentMethod = 'nakit' | 'havale' | 'kart';

export interface Employee {
  id: string;
  lab_id: string;
  full_name: string;
  role: EmployeeRole;
  phone: string | null;
  email: string | null;
  tc_no: string | null;
  start_date: string;
  end_date: string | null;
  base_salary: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  // From v_employee_summary
  total_salary_paid?: number;
  total_advances?: number;
  pending_advances?: number;
  current_month_paid?: boolean;
}

export interface SalaryPayment {
  id: string;
  lab_id: string;
  employee_id: string;
  period_year: number;
  period_month: number;
  gross_amount: number;
  deductions: number;
  net_amount: number;
  payment_date: string;
  payment_method: SalaryPaymentMethod;
  notes: string | null;
  created_at: string;
}

export interface EmployeeAdvance {
  id: string;
  lab_id: string;
  employee_id: string;
  amount: number;
  advance_date: string;
  description: string | null;
  is_deducted: boolean;
  created_at: string;
}

export interface CreateEmployeeParams {
  full_name: string;
  role: EmployeeRole;
  phone?: string;
  email?: string;
  tc_no?: string;
  start_date?: string;
  base_salary: number;
  notes?: string;
}

export interface CreateSalaryParams {
  employee_id: string;
  period_year: number;
  period_month: number;
  gross_amount: number;
  deductions?: number;
  payment_date?: string;
  payment_method?: SalaryPaymentMethod;
  notes?: string;
}

export interface CreateAdvanceParams {
  employee_id: string;
  amount: number;
  advance_date?: string;
  description?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
export const ROLE_LABELS: Record<EmployeeRole, string> = {
  teknisyen:    'Teknisyen',
  sef_teknisyen:'Şef Teknisyen',
  muhasebe:     'Muhasebe',
  sekreter:     'Sekreter',
  yonetici:     'Yönetici',
  diger:        'Diğer',
};

export const ROLE_COLORS: Record<EmployeeRole, { fg: string; bg: string }> = {
  teknisyen:    { fg: '#2563EB', bg: '#DBEAFE' },
  sef_teknisyen:{ fg: '#7C3AED', bg: '#EDE9FE' },
  muhasebe:     { fg: '#047857', bg: '#D1FAE5' },
  sekreter:     { fg: '#B45309', bg: '#FEF3C7' },
  yonetici:     { fg: '#0F172A', bg: '#F1F5F9' },
  diger:        { fg: '#64748B', bg: '#F8FAFC' },
};

export const MONTH_NAMES = [
  '', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

// ─── API ──────────────────────────────────────────────────────────────────────
export async function fetchEmployees() {
  return supabase
    .from('v_employee_summary')
    .select('*')
    .order('is_active', { ascending: false })
    .order('full_name')
    .returns<Employee[]>();
}

export async function fetchEmployee(id: string) {
  return supabase
    .from('v_employee_summary')
    .select('*')
    .eq('id', id)
    .single()
    .then(r => r as unknown as { data: Employee | null; error: any });
}

export async function createEmployee(params: CreateEmployeeParams) {
  return supabase.from('employees').insert({
    full_name: params.full_name,
    role: params.role,
    phone: params.phone ?? null,
    email: params.email ?? null,
    tc_no: params.tc_no ?? null,
    start_date: params.start_date ?? new Date().toISOString().slice(0, 10),
    base_salary: params.base_salary,
    notes: params.notes ?? null,
  }).select().single();
}

export async function updateEmployee(id: string, patch: Partial<CreateEmployeeParams & { is_active: boolean; end_date: string | null }>) {
  return supabase.from('employees').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
}

export async function deleteEmployee(id: string) {
  return supabase.from('employees').delete().eq('id', id);
}

// Maaş ödemeleri
export async function fetchSalaryPayments(employeeId: string) {
  return supabase
    .from('salary_payments')
    .select('*')
    .eq('employee_id', employeeId)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .returns<SalaryPayment[]>();
}

export async function createSalaryPayment(params: CreateSalaryParams) {
  const { data: { user } } = await supabase.auth.getUser();
  return supabase.from('salary_payments').insert({
    employee_id: params.employee_id,
    period_year: params.period_year,
    period_month: params.period_month,
    gross_amount: params.gross_amount,
    deductions: params.deductions ?? 0,
    payment_date: params.payment_date ?? new Date().toISOString().slice(0, 10),
    payment_method: params.payment_method ?? 'havale',
    notes: params.notes ?? null,
    created_by: user?.id ?? null,
  }).select().single();
}

export async function deleteSalaryPayment(id: string) {
  return supabase.from('salary_payments').delete().eq('id', id);
}

// Avanslar
export async function fetchAdvances(employeeId: string) {
  return supabase
    .from('employee_advances')
    .select('*')
    .eq('employee_id', employeeId)
    .order('advance_date', { ascending: false })
    .returns<EmployeeAdvance[]>();
}

export async function createAdvance(params: CreateAdvanceParams) {
  return supabase.from('employee_advances').insert({
    employee_id: params.employee_id,
    amount: params.amount,
    advance_date: params.advance_date ?? new Date().toISOString().slice(0, 10),
    description: params.description ?? null,
  }).select().single();
}

export async function markAdvanceDeducted(id: string) {
  return supabase.from('employee_advances').update({ is_deducted: true }).eq('id', id);
}

export async function deleteAdvance(id: string) {
  return supabase.from('employee_advances').delete().eq('id', id);
}
