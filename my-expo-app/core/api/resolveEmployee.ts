// core/api/resolveEmployee.ts
// Giriş yapan kullanıcı (profile) ↔ employees kaydını çözer.
// profiles.employee_id kolonu olmadığından: aynı lab içinde önce e-posta,
// sonra tam isim eşleşmesiyle aktif personel kaydını bulur.
//
// 2026-10-24: önce sunucudaki my_employee_id() sorulur — eşleşme GİRİŞ (auth)
// e-postasıyla (20261024114000; profil adı/e-postası kullanıcı tarafından
// değiştirilebildiği için taklit edilebiliyordu). employees yalnız yetkiliye tam
// liste döndürdüğü için (20261024111000) aşağıdaki istemci eşleşmesi yalnız RPC
// hata verirse yedektir ve veri erişimi vermez (RLS zaten kendi satırla sınırlar).

import { supabase } from './supabase';

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

export async function resolveMyEmployeeId(profile: any): Promise<string | null> {
  if (!profile?.lab_id) return null;
  const rpc = await supabase.rpc('my_employee_id');
  if (!rpc.error) return (rpc.data as string | null) ?? null;

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
