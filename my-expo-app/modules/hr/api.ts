import { supabase } from '../../core/api/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
export type LeaveType =
  | 'yillik' | 'mazeret' | 'hastalik' | 'ucretsiz'
  | 'dogum'  | 'olum'    | 'evlilik';

export type LeaveStatus = 'bekliyor' | 'onaylandi' | 'reddedildi' | 'iptal';

export type AttendanceStatus =
  | 'normal' | 'gec' | 'erken_cikis' | 'yarim_gun'
  | 'devamsiz' | 'izinli' | 'hastalik' | 'resmi_tatil';

export interface EmployeeLeave {
  id: string;
  lab_id: string;
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: LeaveStatus;
  reject_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  // joined
  employee_name?: string;
}

export interface EmployeeAttendance {
  id: string;
  lab_id: string;
  employee_id: string;
  work_date: string;
  check_in: string | null;        // "HH:MM"
  check_out: string | null;       // "HH:MM"
  status: AttendanceStatus;
  work_minutes: number | null;
  overtime_minutes: number;
  notes: string | null;
  created_at: string;
  // yeni alanlar (030_checkin migration)
  check_in_method: CheckinMethod | null;
  check_out_method: CheckinMethod | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  recorded_by: string | null;
}

export interface LeaveSummary {
  employee_id: string;
  lab_id: string;
  full_name: string;
  role: string;
  employment_start: string;
  is_active: boolean;
  annual_entitlement: number;
  annual_used: number;
  annual_remaining: number;
  pending_count: number;
  currently_on_leave: boolean;
  leave_days_this_month: number;
}

export interface AttendanceMonthlySummary {
  employee_id: string;
  lab_id: string;
  month: string;
  total_records: number;
  normal_days: number;
  late_days: number;
  early_exit_days: number;
  half_days: number;
  absent_days: number;
  leave_days: number;
  sick_days: number;
  total_work_minutes: number;
  total_overtime_minutes: number;
}

export interface CreateLeaveParams {
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days_count: number;
  reason?: string;
}

export interface CreateAttendanceParams {
  employee_id: string;
  work_date: string;
  check_in?: string;
  check_out?: string;
  status: AttendanceStatus;
  overtime_minutes?: number;
  notes?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  yillik:   'Yıllık İzin',
  mazeret:  'Mazeret İzni',
  hastalik: 'Hastalık / Rapor',
  ucretsiz: 'Ücretsiz İzin',
  dogum:    'Doğum İzni',
  olum:     'Ölüm İzni',
  evlilik:  'Evlilik İzni',
};

export const LEAVE_TYPE_ICONS: Record<LeaveType, string> = {
  yillik:   'sun',
  mazeret:  'clock',
  hastalik: 'plus-square',
  ucretsiz: 'calendar',
  dogum:    'heart',
  olum:     'feather',
  evlilik:  'heart',
};

export const LEAVE_TYPE_COLORS: Record<LeaveType, { fg: string; bg: string }> = {
  yillik:   { fg: '#2563EB', bg: '#DBEAFE' },
  mazeret:  { fg: '#D97706', bg: '#FEF3C7' },
  hastalik: { fg: '#DC2626', bg: '#FEE2E2' },
  ucretsiz: { fg: '#64748B', bg: '#F1F5F9' },
  dogum:    { fg: '#7C3AED', bg: '#EDE9FE' },
  olum:     { fg: '#374151', bg: '#F3F4F6' },
  evlilik:  { fg: '#DB2777', bg: '#FCE7F3' },
};

export const LEAVE_STATUS_CFG: Record<LeaveStatus, { label: string; fg: string; bg: string; icon: string }> = {
  bekliyor:   { label: 'Bekliyor',   fg: '#D97706', bg: '#FEF3C7', icon: 'clock' },
  onaylandi:  { label: 'Onaylandı',  fg: '#059669', bg: '#D1FAE5', icon: 'check-circle' },
  reddedildi: { label: 'Reddedildi', fg: '#DC2626', bg: '#FEE2E2', icon: 'x-circle' },
  iptal:      { label: 'İptal',      fg: '#64748B', bg: '#F1F5F9', icon: 'x' },
};

export const ATTENDANCE_STATUS_CFG: Record<AttendanceStatus, { label: string; fg: string; bg: string }> = {
  normal:       { label: 'Normal',       fg: '#059669', bg: '#D1FAE5' },
  gec:          { label: 'Geç Giriş',    fg: '#D97706', bg: '#FEF3C7' },
  erken_cikis:  { label: 'Erken Çıkış',  fg: '#F59E0B', bg: '#FEF9C3' },
  yarim_gun:    { label: 'Yarım Gün',    fg: '#6366F1', bg: '#EEF2FF' },
  devamsiz:     { label: 'Devamsız',     fg: '#DC2626', bg: '#FEE2E2' },
  izinli:       { label: 'İzinli',       fg: '#2563EB', bg: '#DBEAFE' },
  hastalik:     { label: 'Hastalık',     fg: '#7C3AED', bg: '#EDE9FE' },
  resmi_tatil:  { label: 'Resmi Tatil',  fg: '#374151', bg: '#F3F4F6' },
};

// ─── Leave API ────────────────────────────────────────────────────────────────
export async function fetchLeaveSummaries() {
  return supabase
    .from('v_leave_summary')
    .select('*')
    .order('full_name')
    .returns<LeaveSummary[]>();
}

export async function fetchLeaves(employeeId: string) {
  return supabase
    .from('employee_leaves')
    .select('*')
    .eq('employee_id', employeeId)
    .order('start_date', { ascending: false })
    .returns<EmployeeLeave[]>();
}

export async function fetchPendingLeaves() {
  return supabase
    .from('employee_leaves')
    .select('*, employees(full_name, role)')
    .eq('status', 'bekliyor')
    .order('created_at', { ascending: true })
    .returns<(EmployeeLeave & { employees: { full_name: string; role: string } })[]>();
}

export async function createLeave(params: CreateLeaveParams) {
  return supabase.from('employee_leaves').insert({
    employee_id: params.employee_id,
    leave_type:  params.leave_type,
    start_date:  params.start_date,
    end_date:    params.end_date,
    days_count:  params.days_count,
    reason:      params.reason ?? null,
  }).select().single();
}

export async function approveLeave(id: string, approvedBy: string) {
  return supabase.from('employee_leaves').update({
    status: 'onaylandi',
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
  }).eq('id', id).select().single();
}

export async function rejectLeave(id: string, rejectReason: string) {
  return supabase.from('employee_leaves').update({
    status: 'reddedildi',
    reject_reason: rejectReason,
  }).eq('id', id).select().single();
}

export async function cancelLeave(id: string) {
  return supabase.from('employee_leaves').update({ status: 'iptal' }).eq('id', id);
}

export async function deleteLeave(id: string) {
  return supabase.from('employee_leaves').delete().eq('id', id);
}

// ─── Attendance API ───────────────────────────────────────────────────────────
export async function fetchAttendance(employeeId: string, month?: string) {
  let q = supabase
    .from('employee_attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .order('work_date', { ascending: false });

  if (month) {
    // month format: "2026-04"
    const [y, m] = month.split('-').map(Number);
    const start  = `${y}-${String(m).padStart(2, '0')}-01`;
    const end    = new Date(y, m, 0).toISOString().slice(0, 10); // last day of month
    q = q.gte('work_date', start).lte('work_date', end);
  }

  return q.returns<EmployeeAttendance[]>();
}

export async function fetchMonthlyAttendanceSummary(employeeId: string) {
  return supabase
    .from('v_attendance_monthly')
    .select('*')
    .eq('employee_id', employeeId)
    .order('month', { ascending: false })
    .limit(12)
    .returns<AttendanceMonthlySummary[]>();
}

export async function upsertAttendance(params: CreateAttendanceParams) {
  return supabase.from('employee_attendance').upsert({
    employee_id:      params.employee_id,
    work_date:        params.work_date,
    check_in:         params.check_in        ?? null,
    check_out:        params.check_out       ?? null,
    status:           params.status,
    overtime_minutes: params.overtime_minutes ?? 0,
    notes:            params.notes            ?? null,
  }, { onConflict: 'employee_id,work_date' }).select().single();
}

export async function deleteAttendance(id: string) {
  return supabase.from('employee_attendance').delete().eq('id', id);
}

// ─── Check-in Types ───────────────────────────────────────────────────────────
export type CheckinMethod = 'qr_gps' | 'qr_only' | 'manual';

export interface QrCheckinResult {
  ok: boolean;
  action?: 'check_in' | 'check_out';
  time?: string;
  employee?: string;
  work_minutes?: number;
  error?: 'invalid_token' | 'out_of_range' | 'employee_not_found' | 'already_complete';
  distance_m?: number;
  allowed_m?: number;
}

export interface LabLocation {
  location_lat: number | null;
  location_lng: number | null;
  location_radius: number;
  checkin_token: string;
}

// ─── Check-in API ─────────────────────────────────────────────────────────────
/** QR check-in — çalışan kendi QR'ını okutunca çağrılır */
export async function qrCheckin(
  token: string,
  lat: number,
  lng: number,
  method: CheckinMethod = 'qr_gps',
): Promise<QrCheckinResult> {
  const { data, error } = await supabase.rpc('qr_checkin', {
    p_token: token,
    p_lat:   lat,
    p_lng:   lng,
    p_method: method,
  });
  if (error) throw error;
  return data as QrCheckinResult;
}

/** Manuel giriş/çıkış — yetkili kişi tarafından çağrılır */
export async function manualAttendanceRPC(params: {
  employeeId: string;
  workDate:   string;    // YYYY-MM-DD
  checkIn:    string;    // HH:MM
  checkOut?:  string;    // HH:MM
  notes?:     string;
}) {
  return supabase.rpc('manual_attendance', {
    p_employee_id: params.employeeId,
    p_work_date:   params.workDate,
    p_check_in:    params.checkIn,
    p_check_out:   params.checkOut ?? null,
    p_notes:       params.notes    ?? null,
  });
}

/** Lab'ın GPS konumu ve QR token'ını çek */
export async function fetchLabLocation() {
  return supabase
    .from('labs')
    .select('location_lat, location_lng, location_radius, checkin_token')
    .limit(1)
    .single<LabLocation>();
}

/** Lab konumunu güncelle */
export async function updateLabLocation(params: {
  lat:    number | null;
  lng:    number | null;
  radius: number;
}) {
  // get current lab_id via get_my_lab_id() — we use a simple select approach
  const { data: labRow } = await supabase
    .from('labs')
    .select('id')
    .limit(1)
    .single<{ id: string }>();

  if (!labRow) throw new Error('Lab bulunamadı');

  return supabase
    .from('labs')
    .update({
      location_lat:    params.lat,
      location_lng:    params.lng,
      location_radius: params.radius,
    })
    .eq('id', labRow.id);
}

/** Yeni bir QR token üret (token'ı değiştirince eski QR geçersiz olur) */
export async function regenerateCheckinToken() {
  const { data: labRow } = await supabase
    .from('labs')
    .select('id')
    .limit(1)
    .single<{ id: string }>();

  if (!labRow) throw new Error('Lab bulunamadı');

  return supabase
    .from('labs')
    .update({ checkin_token: crypto.randomUUID() })
    .eq('id', labRow.id)
    .select('checkin_token')
    .single<{ checkin_token: string }>();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** İki tarih arasındaki iş günü sayısını hesapla (hafta sonu hariç) */
export function calcBusinessDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00');
  const end   = new Date(endDate   + 'T00:00:00');
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++; // 0=Pazar, 6=Cumartesi
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function fmtMinutes(minutes: number | null): string {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}dk`;
  if (m === 0) return `${h}s`;
  return `${h}s ${m}dk`;
}
