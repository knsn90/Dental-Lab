import { supabase } from '../../core/api/supabase';

export type UserType = 'lab' | 'doctor' | 'admin';
export type LabRole = 'technician' | 'manager';

export interface SignUpDoctorParams {
  email: string;
  password: string;
  full_name: string;
  clinic_name: string;
  phone: string;
  address: string;
}

export interface SignUpLabParams {
  email: string;
  password: string;
  full_name: string;
  role: LabRole;
  phone?: string;
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

export async function signUpLabUser(params: SignUpLabParams) {
  return supabase.auth.signUp({
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
