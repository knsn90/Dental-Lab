import { supabase } from '../../core/api/supabase';

// ─── Türler ───────────────────────────────────────────────────────────────────
export type BildirgeTip   = 'giris' | 'cikis';
export type BildirgeDurum = 'bekliyor' | 'gonderildi' | 'onaylandi';

export interface SgkBildirge {
  id:              string;
  lab_id:          string;
  employee_id:     string;
  tip:             BildirgeTip;
  ise_baslama:     string | null;
  ayrilma_tarihi:  string | null;
  cikis_kodu:      string | null;
  bildirim_tarihi: string;
  durum:           BildirgeDurum;
  notlar:          string | null;
  created_by:      string | null;
  created_at:      string;
}

export interface SgkEmployee {
  id:               string;
  full_name:        string;
  tc_no:            string | null;
  sgk_sicil_no:     string | null;
  sgk_tescil_tarihi: string | null;
  start_date:       string;
  end_date:         string | null;
  base_salary:      number;
  is_active:        boolean;
  role:             string;
}

export interface LabSgk {
  id:            string;
  name:          string;
  sgk_isyeri_no: string | null;
}

// ─── Çalışan SGK verileri ────────────────────────────────────────────────────
export async function fetchSgkEmployees() {
  return supabase
    .from('employees')
    .select('id, full_name, tc_no, sgk_sicil_no, sgk_tescil_tarihi, start_date, end_date, base_salary, is_active, role')
    .order('is_active', { ascending: false })
    .order('full_name')
    .returns<SgkEmployee[]>();
}

export async function updateEmployeeSgk(employeeId: string, data: {
  sgk_sicil_no?:     string | null;
  sgk_tescil_tarihi?: string | null;
  tc_no?:            string | null;
}) {
  return supabase
    .from('employees')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', employeeId);
}

// ─── Lab SGK ──────────────────────────────────────────────────────────────────
export async function fetchLabSgk() {
  return supabase
    .from('labs')
    .select('id, name, sgk_isyeri_no')
    .limit(1)
    .single<LabSgk>();
}

export async function updateLabSgk(sgk_isyeri_no: string) {
  const { data: lab } = await supabase.from('labs').select('id').limit(1).single<{ id: string }>();
  if (!lab) throw new Error('Lab bulunamadı');
  return supabase.from('labs').update({ sgk_isyeri_no }).eq('id', lab.id);
}

// ─── Bildirgeler ──────────────────────────────────────────────────────────────
export async function fetchBildirge(employeeId: string) {
  return supabase
    .from('sgk_bildirge')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .returns<SgkBildirge[]>();
}

export async function fetchAllBildirge() {
  return supabase
    .from('sgk_bildirge')
    .select('*, employees(full_name)')
    .order('created_at', { ascending: false })
    .returns<(SgkBildirge & { employees: { full_name: string } })[]>();
}

export async function createBildirge(data: {
  employee_id:     string;
  tip:             BildirgeTip;
  ise_baslama?:    string;
  ayrilma_tarihi?: string;
  cikis_kodu?:     string;
  bildirim_tarihi: string;
  notlar?:         string;
}) {
  return supabase
    .from('sgk_bildirge')
    .insert({
      employee_id:     data.employee_id,
      tip:             data.tip,
      ise_baslama:     data.ise_baslama     ?? null,
      ayrilma_tarihi:  data.ayrilma_tarihi  ?? null,
      cikis_kodu:      data.cikis_kodu      ?? null,
      bildirim_tarihi: data.bildirim_tarihi,
      notlar:          data.notlar          ?? null,
    })
    .select()
    .single();
}

export async function updateBildirgeDurum(id: string, durum: BildirgeDurum) {
  return supabase.from('sgk_bildirge').update({ durum }).eq('id', id);
}

export async function deleteBildirge(id: string) {
  return supabase.from('sgk_bildirge').delete().eq('id', id);
}

// ─── Bordro — kümülatif GV matrahı ───────────────────────────────────────────
/**
 * Bir çalışanın takvim yılı başından "bu aya kadar" biriken
 * GV matrahını döndürür. Bu değer net maaş hesabında gerekli.
 */
export async function fetchKumulatifGvMatrah(employeeId: string, period: string): Promise<number> {
  const [yil, ay] = period.split('-').map(Number);
  const baslangic = `${yil}-01`;

  const { data } = await supabase
    .from('employee_payroll')
    .select('gross_salary, sgk_employee, issizlik_isci')
    .eq('employee_id', employeeId)
    .gte('period', baslangic)
    .lt('period', period)
    .returns<{ gross_salary: number; sgk_employee: number; issizlik_isci: number }[]>();

  if (!data || data.length === 0) return 0;

  // GV matrahı = brüt - SGK işçi - işsizlik işçi
  return data.reduce((sum, r) => {
    const gvMatrah = Number(r.gross_salary) - Number(r.sgk_employee) - Number(r.issizlik_isci ?? 0);
    return sum + Math.max(0, gvMatrah);
  }, 0);
}

/** Dönem için tüm çalışanların bordro özetini çek (SGK raporu için) */
export async function fetchPayrollForSgk(period: string) {
  return supabase
    .from('employee_payroll')
    .select(`
      id, employee_id, period, gross_salary, net_salary,
      sgk_employee, sgk_employer,
      issizlik_isci, issizlik_isveren,
      gelir_vergisi, damga_vergisi,
      employees(full_name, tc_no, sgk_sicil_no, base_salary, start_date)
    `)
    .eq('period', period)
    .returns<any[]>();
}
