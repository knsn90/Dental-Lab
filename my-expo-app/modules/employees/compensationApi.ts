// modules/employees/compensationApi.ts — maaş ve TC kimlik no'nun tek kaynağı.
// employee_compensation (20261025100000): okuma = maaş yetkisi (can_view_payroll) ya da kendi
// satırı; yazma = manage_salaries / manage_finance. Yetkisiz okumada satır gelmez (RLS).

import { supabase } from '../../core/api/supabase';

export async function upsertCompensation(
  employeeId: string,
  labId: string,
  v: { base_salary?: number | null; tc_no?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const row: Record<string, unknown> = { employee_id: employeeId, lab_id: labId, updated_at: new Date().toISOString() };
  if (v.base_salary !== undefined) row.base_salary = v.base_salary;
  if (v.tc_no !== undefined) row.tc_no = v.tc_no;
  const { error } = await supabase.from('employee_compensation').upsert(row, { onConflict: 'employee_id' });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Giriş yapan kişinin kendi maaşı. Personel kaydı eşleşmiyorsa ya da satır yoksa null. */
export async function fetchMyCompensation(): Promise<{ base_salary: number | null } | null> {
  const me = await supabase.rpc('my_employee_id');
  if (me.error || !me.data) return null;
  const { data, error } = await supabase
    .from('employee_compensation')
    .select('base_salary')
    .eq('employee_id', me.data as string)
    .maybeSingle();
  if (error || !data) return null;
  return { base_salary: (data as { base_salary: number | null }).base_salary };
}
