import { supabase } from '../../core/api/supabase';

export async function fetchClinics() {
  return supabase.from('clinics').select('*').order('name');
}

export async function createClinic(data: {
  name: string;
  category?: 'klinik' | 'poliklinik' | 'hastane';
  address?: string;
  phone?: string;
  email?: string | null;
  contact_person?: string;
  notes?: string | null;
  is_active?: boolean;
  // e-Fatura
  vkn?: string | null;
  tax_office?: string | null;
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
    email: string | null;
    contact_person: string;
    notes: string | null;
    is_active: boolean;
    vkn: string | null;
    tax_office: string | null;
  }>
) {
  return supabase.from('clinics').update(data).eq('id', id).select().single();
}

/**
 * Tüm klinik üyelerini döndür — clinic_admin + clinic_secretary
 * (Hekimler ayrı `fetchAllDoctors` ile geliyor)
 */
export async function fetchAllClinicMembers() {
  return supabase
    .from('profiles')
    .select('id, full_name, phone, email, avatar_url, clinic_id, user_type, is_active, clinic_permissions')
    .in('user_type', ['clinic_admin', 'clinic_secretary'])
    .order('full_name');
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

/**
 * Tum hekimleri donder — `doctors` tablosu + `profiles` (user_type='doctor')
 * UI seviyesinde birlestir, tek liste goster.
 *
 * Donen alanlar:
 *   { id, full_name, phone, specialty, clinic_id, clinic, source: 'doctor' | 'profile', auth_user: boolean }
 *
 * `source` ayrimi UI'da gerektiginde kullanilabilir (ornegin "sisteme kayitli" rozeti).
 */
export async function fetchAllDoctors() {
  const [doctorsRes, profilesRes] = await Promise.all([
    supabase
      .from('doctors')
      .select('*, clinic:clinics(id, name)')
      .eq('is_active', true)
      .order('full_name'),
    supabase
      .from('profiles')
      .select('id, full_name, phone, specialty, clinic_id, clinic:clinics(id, name)')
      .eq('user_type', 'doctor')
      .eq('is_active', true)
      .order('full_name'),
  ]);

  const fromDoctors = (doctorsRes.data ?? []).map((d: any) => ({
    ...d,
    source: 'doctor' as const,
    auth_user: false,
  }));

  const fromProfiles = (profilesRes.data ?? []).map((p: any) => ({
    id: p.id,
    full_name: p.full_name,
    phone: p.phone,
    specialty: p.specialty,
    clinic_id: p.clinic_id,
    clinic: p.clinic,
    is_active: true,
    source: 'profile' as const,
    auth_user: true,
  }));

  // Ayni isimde duplicate olmasin diye full_name'e gore tekille
  const seen = new Set<string>();
  const merged = [...fromDoctors, ...fromProfiles].filter((d: any) => {
    const key = (d.full_name || '').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  merged.sort((a: any, b: any) => (a.full_name || '').localeCompare(b.full_name || '', 'tr'));

  return {
    data: merged,
    error: doctorsRes.error || profilesRes.error,
  };
}

export async function createDoctor(data: {
  clinic_id?: string | null;
  full_name: string;
  phone?: string | null;
  specialty?: string | null;
  notes?: string | null;
  is_active?: boolean;
  tckn?: string | null;
}) {
  return supabase.from('doctors').insert(data).select().single();
}

export async function updateDoctor(
  id: string,
  data: Partial<{
    clinic_id: string | null;
    full_name: string;
    phone: string | null;
    specialty: string | null;
    notes: string | null;
    is_active: boolean;
    tckn: string | null;
  }>
) {
  return supabase.from('doctors').update(data).eq('id', id).select().single();
}
