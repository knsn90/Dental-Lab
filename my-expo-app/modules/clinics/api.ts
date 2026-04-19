import { supabase } from '../../core/api/supabase';

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

export async function fetchDoctors(clinicId?: string) {
  let query = supabase
    .from('doctors')
    .select('*, clinic:clinics(id, name)')
    .eq('is_active', true)
    .order('full_name');
  if (clinicId) query = query.eq('clinic_id', clinicId);
  return query;
}

export async function fetchAllDoctors() {
  return supabase
    .from('doctors')
    .select('*, clinic:clinics(id, name)')
    .eq('is_active', true)
    .order('full_name');
}

export async function createDoctor(data: {
  clinic_id?: string | null;
  full_name: string;
  phone?: string | null;
  specialty?: string | null;
  notes?: string | null;
}) {
  return supabase.from('doctors').insert(data).select().single();
}

export async function updateDoctor(
  id: string,
  data: Partial<{
    clinic_id: string | null;
    full_name: string;
    phone: string;
    specialty: string;
    notes: string;
    is_active: boolean;
  }>
) {
  return supabase.from('doctors').update(data).eq('id', id).select().single();
}
