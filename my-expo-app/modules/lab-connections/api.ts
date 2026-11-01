// Çoklu-lab klinik bağlantıları — RPC sarmalayıcıları.
// Karşılık gelen DB: supabase/migrations/20260714120000_clinic_lab_memberships.sql
import { supabase } from '../../core/api/supabase';

export type MembershipStatus = 'pending' | 'active' | 'rejected' | 'revoked';

export interface LabMembership {
  membership_id: string;
  lab_id: string;
  lab_name: string | null;
  lab_logo: string | null;
  status: MembershipStatus;
  lab_clinic_id: string | null;
}

export interface PendingRequest {
  id: string;
  requested_at: string;
  initiated_by: 'lab' | 'clinic';
  clinic_name: string | null;
}

/** Caller'ın bağlı olduğu lab'lar (aktif + bekleyen) — switcher + seçim ekranı beslemesi. */
export async function myLabMemberships(): Promise<LabMembership[]> {
  const { data, error } = await supabase.rpc('my_lab_memberships');
  if (error) throw error;
  return (data ?? []) as LabMembership[];
}

/** Lab: tek-kullanımlık klinik davet kodu üret. */
export async function labCreateInvite(expiresHours = 168): Promise<string> {
  const { data, error } = await supabase.rpc('lab_create_clinic_invite', { p_expires_hours: expiresHours });
  if (error) throw error;
  return data as string;
}

/** Lab: kalıcı public katılım kodu (varsa döner). */
export async function labPublicCode(): Promise<string> {
  const { data, error } = await supabase.rpc('lab_get_or_create_public_code');
  if (error) throw error;
  return data as string;
}

/** Klinik: davet kodunu kabul et → aktif membership. Membership id döner. */
export async function clinicAcceptInvite(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('clinic_accept_invite', { p_code: code });
  if (error) throw error;
  return data as string;
}

/** Klinik: public kodla bağlan (lab onayına düşebilir). Membership id döner. */
export async function clinicRequestLab(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('clinic_request_lab', { p_code: code });
  if (error) throw error;
  return data as string;
}

export async function labApproveClinic(membershipId: string): Promise<void> {
  const { error } = await supabase.rpc('lab_approve_clinic', { p_membership_id: membershipId });
  if (error) throw error;
}

export async function labRejectClinic(membershipId: string): Promise<void> {
  const { error } = await supabase.rpc('lab_reject_clinic', { p_membership_id: membershipId });
  if (error) throw error;
}

export async function labSetAutoApprove(on: boolean): Promise<void> {
  const { error } = await supabase.rpc('lab_set_auto_approve', { p_on: on });
  if (error) throw error;
}

/** Lab paneli: bekleyen bağlanma istekleri (RLS lab-tarafı select izin verir). */
export async function labPendingRequests(): Promise<PendingRequest[]> {
  const { data, error } = await supabase
    .from('clinic_lab_memberships')
    .select('id, requested_at, initiated_by, lab_clinic:clinics!clinic_lab_memberships_lab_clinic_id_fkey(name)')
    .eq('status', 'pending')
    .order('requested_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    requested_at: r.requested_at,
    initiated_by: r.initiated_by,
    clinic_name: r.lab_clinic?.name ?? null,
  }));
}

// ── Public kayıt (hekim / klinik yöneticisi) ─────────────────────────────────
// DB: supabase/migrations/20261017193000_clinic_self_signup_flow.sql

export interface SignupConnectResult {
  membership_id: string;
  status: MembershipStatus;
  lab_name: string | null;
  /** Hesap açıldı mı (davet kodu / lab'da otomatik onay). */
  approved: boolean;
}

/**
 * Onay bekleyen yeni hesap: lab bağlantı kodunu kullan (önce davet, olmazsa
 * public katılım kodu). Davet kodunda hesap anında açılır; public kodda istek
 * lab'ın "Onaylar → Hekim kaydı" ekranına düşer.
 */
export async function clinicSignupConnect(code: string): Promise<SignupConnectResult> {
  const { data, error } = await supabase.rpc('clinic_signup_connect', { p_code: code.trim().toUpperCase() });
  if (error) throw error;
  return data as SignupConnectResult;
}

/** Bağlantı kodu hatalarını kullanıcı metnine çevirir (kayıt + bekleme ekranı). */
export function connectCodeErrorMessage(e: any): string {
  const raw = String(e?.message ?? '');
  if (/request rejected/i.test(raw)) return 'Bu laboratuvar isteğini reddetti. Başka bir laboratuvarın kodunu deneyebilirsin.';
  if (/invalid code/i.test(raw)) return 'Kod bulunamadı. Kontrol edip tekrar dene.';
  if (/expired/i.test(raw)) return 'Kodun süresi dolmuş. Laboratuvardan yeni kod iste.';
  if (/used up|inactive/i.test(raw)) return 'Bu kod artık geçerli değil.';
  if (/fetch|network/i.test(raw)) return 'Sunucuya bağlanılamadı. İnternet bağlantını kontrol et.';
  return 'Bağlanılamadı. Kodu kontrol et.';
}

export interface SignupRequest {
  membership_id: string;
  status: MembershipStatus;
  requested_at: string;
  decided_at: string | null;
  profile_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  user_type: 'doctor' | 'clinic_admin' | 'clinic_secretary';
  clinic_name: string | null;
  address: string | null;
}

/**
 * Lab yöneticisi: hesap onayı bekleyen yeni kayıtlar (history=true → son 30 karar).
 * Yönetici olmayan lab kullanıcısında boş döner.
 */
export async function labSignupRequests(history = false): Promise<SignupRequest[]> {
  const { data, error } = await supabase.rpc('lab_signup_requests', { p_history: history });
  if (error) throw error;
  return (data ?? []) as SignupRequest[];
}

/** Lab yöneticisi: reddedilen kaydı yeniden incelemeye al (bekleyene döner). */
export async function labReopenSignup(membershipId: string): Promise<void> {
  const { error } = await supabase.rpc('lab_reopen_signup', { p_membership_id: membershipId });
  if (error) throw error;
}
