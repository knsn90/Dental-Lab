// core/api/resolveEmployee.ts
// Giriş yapan kullanıcı (profile) ↔ employees kaydını çözer.
// profiles.employee_id kolonu olmadığından: aynı lab içinde önce e-posta,
// sonra tam isim eşleşmesiyle aktif personel kaydını bulur.

import { supabase } from './supabase';

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

export async function resolveMyEmployeeId(profile: any): Promise<string | null> {
  if (!profile?.lab_id) return null;
  const { data, error } = await supabase
    .from('employees')
    .select('id, email, full_name, is_active')
    .eq('lab_id', profile.lab_id)
    .eq('is_active', true);
  if (error || !data?.length) return null;

  // 1) e-posta eşleşmesi
  if (profile.email) {
    const byEmail = data.find((e: any) => norm(e.email) && norm(e.email) === norm(profile.email));
    if (byEmail) return byEmail.id;
  }
  // 2) tam isim eşleşmesi (aynı lab içinde)
  if (profile.full_name) {
    const matches = data.filter((e: any) => norm(e.full_name) === norm(profile.full_name));
    if (matches.length === 1) return matches[0].id; // tek eşleşme güvenli
  }
  return null;
}
