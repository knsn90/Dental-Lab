// ============================================================
// Clinic panel API — çoklu hekim klinikler için
// RLS kendi kliniğinin satırlarını otomatik filtreler (033_clinic_panel)
// ============================================================

import { supabase } from '../../core/api/supabase';
import { getActiveLabId } from '../../core/store/activeLabStore';

/** Klinik müdürünün kendi kliniğindeki tüm hekimler (RLS otomatik filtreler). */
export async function fetchMyClinicDoctors() {
  return supabase
    .from('my_clinic_doctors')
    .select('id, full_name, phone, avatar_url, is_active, clinic_id, clinic_name');
}

/** Klinik müdürünün kendi kliniğindeki TÜM kullanıcılar (hekim + sekreter + yedek admin). */
export async function fetchMyClinicUsers() {
  return supabase
    .from('my_clinic_users')
    .select('id, full_name, phone, email, avatar_url, is_active, clinic_id, clinic_name, user_type, specialty, clinic_permissions, created_at')
    .order('user_type', { ascending: true })
    .order('full_name', { ascending: true });
}

/** Klinik kullanıcısını sil — edge fn admin-delete-user clinic_admin yetkisini doğrular. */
export async function deleteClinicUser(userId: string) {
  return supabase.functions.invoke('admin-delete-user', {
    body: { user_id: userId },
  });
}

/** Klinik kullanıcısının e-posta ve/veya şifresini değiştir (edge fn admin-update-user). */
export async function updateClinicUserAuth(input: {
  user_id: string;
  email?: string;
  password?: string;
}) {
  return supabase.functions.invoke('admin-update-user', {
    body: {
      user_id: input.user_id,
      ...(input.email    ? { email: input.email }       : {}),
      ...(input.password ? { password: input.password } : {}),
    },
  });
}

/** Klinik kullanıcısı (hekim/sekreter/yedek admin) güncelleme — RLS clinic_id filtreler. */
export async function updateClinicUser(
  userId: string,
  patch: Partial<{
    is_active: boolean;
    phone: string | null;
    full_name: string;
    specialty: string | null;
    clinic_permissions: Record<string, boolean>;
  }>,
) {
  return supabase.from('profiles').update(patch).eq('id', userId);
}

/** Klinik kullanıcı davet et — edge fn üzerinden, user_type kolayca seçilebilir. */
export async function inviteClinicUser(input: {
  email:       string;
  full_name:   string;
  phone?:      string;
  user_type:   'doctor' | 'clinic_admin' | 'clinic_secretary';
  clinic_id:   string;
  clinic_name?: string;
  password:    string;
  specialty?:   string;
  clinic_permissions?: Record<string, boolean>;
}) {
  return supabase.functions.invoke('admin-create-user', {
    body: {
      email:               input.email,
      password:            input.password,
      full_name:           input.full_name,
      phone:               input.phone ?? null,
      user_type:           input.user_type,
      clinic_id:           input.clinic_id,
      clinic_name:         input.clinic_name ?? null,
      specialty:           input.specialty ?? null,
      clinic_permissions:  input.clinic_permissions ?? null,
    },
  });
}

/**
 * Klinik genel sipariş listesi — tüm hekim siparişleri.
 * doctor bilgisi için profiles'e join yapılır (profile-based doctor_id).
 */
export async function fetchClinicOrders() {
  // Çoklu-lab: aktif lab seçiliyse yalnız o lab'ın siparişleri (UX bölmesi; RLS zaten
  // klinik verisini sahiplik ile sınırlar). Aktif lab yoksa (tek-lab) tümü — bugünkü davranış.
  const activeLab = getActiveLabId();
  let q = supabase.from('work_orders').select('*').order('delivery_date', { ascending: true });
  if (activeLab) q = q.eq('lab_id', activeLab);
  return q;
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
  email:       string;
  full_name:   string;
  phone?:      string;
  clinic_id:   string;
  clinic_name?: string;
  password:    string;
}) {
  return supabase.functions.invoke('admin-create-user', {
    body: {
      email:       input.email,
      password:    input.password,
      full_name:   input.full_name,
      phone:       input.phone ?? null,
      user_type:   'doctor',
      clinic_id:   input.clinic_id,
      clinic_name: input.clinic_name ?? null,
    },
  });
}

/** Güvenli rastgele şifre üretici — 12 char, harf+rakam+sembol karışık */
export function generateDoctorPassword(length = 12): string {
  const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // I, O hariç
  const abc = 'abcdefghijkmnpqrstuvwxyz';
  const num = '23456789';                 // 0, 1 hariç
  const sym = '!@#$%&*';
  const all = ABC + abc + num + sym;
  let out = ABC[Math.floor(Math.random() * ABC.length)]
          + abc[Math.floor(Math.random() * abc.length)]
          + num[Math.floor(Math.random() * num.length)]
          + sym[Math.floor(Math.random() * sym.length)];
  for (let i = out.length; i < length; i++) {
    out += all[Math.floor(Math.random() * all.length)];
  }
  // Shuffle
  return out.split('').sort(() => Math.random() - 0.5).join('');
}
