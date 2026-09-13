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
  currency?: string;
  payment_date?: string;
  payment_method?: SalaryPaymentMethod;
  notes?: string;
}

export interface CreateAdvanceParams {
  employee_id: string;
  amount: number;
  currency?: string;
  advance_date?: string;
  description?: string;
}

// Per-currency aggregate view satırları (v_employee_*_ccy)
export interface EmployeeSalaryCcy {
  employee_id: string; currency: string;
  total_net: number; total_gross: number; payment_count: number;
}
export interface EmployeeAdvancesCcy {
  employee_id: string; currency: string;
  total_advances: number; pending_advances: number; advance_count: number;
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

/**
 * Koyu tema rol tonları — açık paletin pastel zeminleri (#DBEAFE, #F1F5F9…)
 * koyu ekranda beyaz leke gibi patlıyor, koyu metinleri (#0F172A) de okunmuyor.
 * Koyuda: yarı saydam accent zemin + AÇIK accent metin.
 */
export const ROLE_COLORS_DARK: Record<EmployeeRole, { fg: string; bg: string }> = {
  teknisyen:    { fg: '#93C5FD', bg: 'rgba(37,99,235,0.24)' },
  sef_teknisyen:{ fg: '#C9A9E8', bg: 'rgba(124,58,237,0.26)' },
  muhasebe:     { fg: '#6EE7B7', bg: 'rgba(4,120,87,0.30)' },
  sekreter:     { fg: '#F0C078', bg: 'rgba(180,83,9,0.30)' },
  yonetici:     { fg: '#F7F2E9', bg: 'rgba(255,255,255,0.12)' },
  diger:        { fg: 'rgba(247,242,233,0.72)', bg: 'rgba(255,255,255,0.08)' },
};

/** Rol rozeti/avatar tonu — tema-farkında tek giriş noktası. */
export function roleTone(role: EmployeeRole, isDark: boolean) {
  return (isDark ? ROLE_COLORS_DARK : ROLE_COLORS)[role] ?? (isDark ? ROLE_COLORS_DARK : ROLE_COLORS).diger;
}

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
    currency: params.currency ?? 'TRY',
    payment_date: params.payment_date ?? new Date().toISOString().slice(0, 10),
    payment_method: params.payment_method ?? 'havale',
    notes: params.notes ?? null,
    created_by: user?.id ?? null,
  }).select().single();
}

// Maaş — çalışan + para birimi başına toplam (v_employee_salary_ccy).
// View yoksa (migration uygulanmadıysa) boş döner → ekran fallback'e geçer.
export async function fetchSalaryTotalsByCurrency() {
  const res = await supabase.from('v_employee_salary_ccy').select('*').returns<EmployeeSalaryCcy[]>();
  return { data: res.error ? [] : (res.data ?? []), error: res.error };
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
    currency: params.currency ?? 'TRY',
    advance_date: params.advance_date ?? new Date().toISOString().slice(0, 10),
    description: params.description ?? null,
  }).select().single();
}

// Avans — çalışan + para birimi başına toplam (v_employee_advances_ccy).
export async function fetchAdvanceTotalsByCurrency() {
  const res = await supabase.from('v_employee_advances_ccy').select('*').returns<EmployeeAdvancesCcy[]>();
  return { data: res.error ? [] : (res.data ?? []), error: res.error };
}

export async function markAdvanceDeducted(id: string) {
  return supabase.from('employee_advances').update({ is_deducted: true }).eq('id', id);
}

export async function deleteAdvance(id: string) {
  return supabase.from('employee_advances').delete().eq('id', id);
}
