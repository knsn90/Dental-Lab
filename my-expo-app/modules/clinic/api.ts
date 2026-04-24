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
