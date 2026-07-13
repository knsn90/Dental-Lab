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
