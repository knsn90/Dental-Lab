// ============================================================
// Clinic panel API — çoklu hekim klinikler için
// RLS kendi kliniğinin satırlarını otomatik filtreler (033_clinic_panel)
// ============================================================

import { supabase } from '../../core/api/supabase';

/** Klinik müdürünün kendi kliniğindeki tüm hekimler (RLS otomatik filtreler). */
export async function fetchMyClinicDoctors() {
  return supabase
    .from('my_clinic_doctors')
    .select('id, full_name, phone, avatar_url, is_active, clinic_id, clinic_name');
}

/**
 * Klinik genel sipariş listesi — tüm hekim siparişleri.
 * doctor bilgisi için profiles'e join yapılır (profile-based doctor_id).
 */
export async function fetchClinicOrders() {
  return supabase
    .from('work_orders')
    .select('*')
    .order('delivery_date', { ascending: true });
}

/** Belirli bir hekimin klinikte siparişleri. */
export async function fetchClinicOrdersByDoctor(doctorId: string) {
  return supabase
    .from('work_orders')
    .select('*')
    .eq('doctor_id', doctorId)
    .order('delivery_date', { ascending: true });
}

/**
 * Doctor profile info lookup — clinic_admin'in görüntülediği siparişlerde
 * doctor_id profile.id olduğu için ayrı sorgu gerekebilir.
 */
export async function fetchClinicDoctorProfiles(doctorIds: string[]) {
  if (doctorIds.length === 0) return { data: [], error: null };
  return supabase
    .from('profiles')
    .select('id, full_name, phone, avatar_url, clinic_name, clinic_id')
    .in('id', doctorIds);
}

/** Klinik admin: hekim aktif/pasif toggle + telefon güncelleme */
export async function updateClinicDoctor(
  doctorId: string,
  patch: Partial<{ is_active: boolean; phone: string | null }>,
) {
  return supabase
    .from('profiles')
    .update(patch)
    .eq('id', doctorId)
    .eq('user_type', 'doctor');
}

/**
 * Klinik admin: yeni hekim davet (Edge Function admin-create-user).
 * Edge Function clinic_id ve user_type='doctor' set eder.
 */
export async function inviteClinicDoctor(input: {
  email:      string;
  full_name:  string;
  phone?:     string;
  clinic_id:  string;
}) {
  return supabase.functions.invoke('admin-create-user', {
    body: {
      email:     input.email,
      full_name: input.full_name,
      phone:     input.phone ?? null,
      user_type: 'doctor',
      clinic_id: input.clinic_id,
    },
  });
}
