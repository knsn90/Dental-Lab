import { supabase } from '../../core/api/supabase';
import { toConsentPayload, type ConsentState } from './components/ConsentGate';

export type UserType = 'lab' | 'doctor' | 'admin' | 'clinic_admin';
export type LabRole = 'technician' | 'manager';

/**
 * Kayıt sırasında alınan onayları append-only `user_consents` defterine yazar
 * (P0-5 · R-01).
 *
 * Sessizce yutulmaz ama kaydı da bloklamaz: signUp başarılı olduysa kullanıcı
 * hesabı vardır; onay yazımı ağ hatasıyla düşerse `has_required_consents()`
 * false döner ve kullanıcı bir sonraki girişte tekrar onay ekranına düşer.
 * Böylece "hesap var ama onay yok" durumu sessiz kalmaz.
 */
async function recordConsents(consents?: ConsentState): Promise<void> {
  if (!consents) return;
  const { error } = await supabase.rpc('record_consents', {
    p_consents: toConsentPayload(consents),
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[consent] kayıt yazılamadı — girişte tekrar sorulacak:', error.message);
  }
}

export interface SignUpDoctorParams {
  email: string;
  password: string;
  full_name: string;
  clinic_name: string;
  phone: string;
  address: string;
  /** P0-5 · R-01 — kayıt ekranında toplanan onaylar. */
  consents?: ConsentState;
}

export interface SignUpLabParams {
  email: string;
  password: string;
  full_name: string;
  role: LabRole;
  phone?: string;
  /** P0-5 · R-01 — kayıt ekranında toplanan onaylar. */
  consents?: ConsentState;
}

export async function signUpDoctor(params: SignUpDoctorParams) {
  // 1 — Create auth user
  const authResult = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        user_type: 'doctor' as UserType,
        full_name: params.full_name,
        clinic_name: params.clinic_name,
        phone: params.phone,
        role: null,
      },
    },
  });

  if (authResult.error || !authResult.data.user) return authResult;

  // Onayları hesap oluşur oluşmaz yaz — RLS gereği oturum açık olmalı.
  await recordConsents(params.consents);

  // Mark doctor as pending approval (belt & suspenders alongside trigger)
  await supabase
    .from('profiles')
    .update({ is_active: false, approval_status: 'pending' })
    .eq('id', authResult.data.user.id);

  // 2 — Create clinic record
  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .insert({
      name: params.clinic_name,
      phone: params.phone,
      address: params.address,
      contact_person: params.full_name,
    })
    .select()
    .single();

  if (clinicError || !clinic) return authResult; // Non-fatal — auth succeeded

  // 3 — Create doctor record linked to the new clinic
  await supabase.from('doctors').insert({
    full_name: params.full_name,
    phone: params.phone,
    clinic_id: clinic.id,
  });

  return authResult;
}

export interface SignUpClinicParams {
  email: string;
  password: string;
  full_name: string;
  clinic_name: string;
  phone: string;
  address: string;
  clinic_type: 'klinik' | 'poliklinik' | 'hastane';
  /** P0-5 · R-01 — kayıt ekranında toplanan onaylar. */
  consents?: ConsentState;
}

export async function signUpClinic(params: SignUpClinicParams) {
  // 1 — Create auth user (clinic admin)
  //   Migration 033 sonrası 'clinic_admin' geçerli bir user_type.
  //   Eskiden 'doctor' + role='clinic_admin' yazılıyordu; bu kullanıcı listesinde
  //   Klinik filtresinde görünmesini engelliyordu.
  const authResult = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        user_type: 'clinic_admin' as UserType,
        full_name: params.full_name,
        clinic_name: params.clinic_name,
        phone: params.phone,
        role: 'clinic_admin',
      },
    },
  });

  if (authResult.error || !authResult.data.user) return authResult;

  await recordConsents(params.consents);

  // Mark as pending approval
  await supabase
    .from('profiles')
    .update({ is_active: false, approval_status: 'pending' })
    .eq('id', authResult.data.user.id);

  // 2 — Create clinic record with clinic_type
  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .insert({
      name: params.clinic_name,
      phone: params.phone,
      address: params.address,
      contact_person: params.full_name,
      clinic_type: params.clinic_type,
    })
    .select()
    .single();

  if (clinicError || !clinic) return authResult;

  // 3 — Create doctor record (admin hekim)
  await supabase.from('doctors').insert({
    full_name: params.full_name,
    phone: params.phone,
    clinic_id: clinic.id,
  });

  return authResult;
}

export async function signUpLabUser(params: SignUpLabParams) {
  const res = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        user_type: 'lab' as UserType,
        full_name: params.full_name,
        clinic_name: null,
        phone: params.phone ?? null,
        role: params.role,
      },
    },
  });
  if (!res.error && res.data.user) await recordConsents(params.consents);
  return res;
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function fetchProfile(userId: string) {
  return supabase.from('profiles').select('*').eq('id', userId).single();
}

export { supabase };
