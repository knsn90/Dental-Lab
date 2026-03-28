import { supabase } from './supabase';
import { UserType, LabRole } from './types';

export interface SignUpDoctorParams {
  email: string;
  password: string;
  full_name: string;
  clinic_name: string;
  phone?: string;
}

export interface SignUpLabParams {
  email: string;
  password: string;
  full_name: string;
  role: LabRole;
  phone?: string;
}

export async function signUpDoctor(params: SignUpDoctorParams) {
  return supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        user_type: 'doctor' as UserType,
        full_name: params.full_name,
        clinic_name: params.clinic_name,
        phone: params.phone ?? null,
        role: null,
      },
    },
  });
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
