import { supabase } from './supabase';

export async function fetchClinics() {
  return supabase.from('clinics').select('*').order('name');
}

export async function createClinic(data: {
  name: string;
  category?: 'klinik' | 'poliklinik' | 'hastane';
  address?: string;
  phone?: string;
  email?: string;
  contact_person?: string;
  notes?: string;
}) {
  return supabase.from('clinics').insert(data).select().single();
}

export async function updateClinic(
  id: string,
  data: Partial<{
    name: string;
    category: 'klinik' | 'poliklinik' | 'hastane';
    address: string;
    phone: string;
    email: string;
    contact_person: string;
    notes: string;
    is_active: boolean;
  }>
) {
  return supabase.from('clinics').update(data).eq('id', id).select().single();
}

export async function fetchClinicWithDoctors(clinicId: string) {
  return supabase
    .from('profiles')
    .select('id, full_name, clinic_name, phone, created_at')
    .eq('clinic_id', clinicId)
    .eq('user_type', 'doctor')
    .eq('is_active', true);
}

export async function fetchAllDoctors() {
  return supabase
    .from('profiles')
    .select('id, full_name, clinic_name, clinic_id, phone')
    .eq('user_type', 'doctor')
    .eq('is_active', true)
    .order('full_name');
}

export async function linkDoctorToClinic(doctorId: string, clinicId: string | null) {
  return supabase.from('profiles').update({ clinic_id: clinicId }).eq('id', doctorId);
}
