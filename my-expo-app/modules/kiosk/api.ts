// modules/kiosk/api.ts
// Kiosk (tablet giriş kodu) istemci API'si. Edge function'ları çağırır; kiosk-login
// başarılıysa dönen tek-kullanımlık token_hash'i verifyOtp ile GERÇEK oturuma çevirir.
import { supabase } from '../../core/api/supabase';

export interface KioskPairResult {
  ok: boolean;
  device_token?: string;
  device_name?: string;
  lab_name?: string;
  error?: string;
}

/** Eşleştirme kodu → cihaz jetonu (bir kez). */
export async function kioskPair(pairingCode: string): Promise<KioskPairResult> {
  const { data, error } = await supabase.functions.invoke('kiosk-pair', {
    body: { pairing_code: pairingCode.trim().toUpperCase() },
  });
  if (error) return { ok: false, error: 'network' };
  return (data as KioskPairResult) ?? { ok: false, error: 'server_error' };
}

export interface KioskLoginResult { ok: boolean; error?: string; }

export interface KioskUser { user_id: string; full_name: string; avatar_url: string | null; }

/** Tabletteki kişi listesi (bu lab'da giriş kodu tanımlı, aktif kişiler). */
export async function kioskListUsers(deviceToken: string): Promise<{ ok: boolean; users: KioskUser[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke('kiosk-login', {
    body: { action: 'users', device_token: deviceToken },
  });
  if (error) return { ok: false, users: [], error: 'network' };
  const res = data as { ok: boolean; users?: KioskUser[]; error?: string };
  if (!res?.ok) return { ok: false, users: [], error: res?.error ?? 'server_error' };
  return { ok: true, users: res.users ?? [] };
}

/** Cihaz jetonu + seçilen kişi + kod → kullanıcının gerçek oturumu (verifyOtp). */
export async function kioskLogin(deviceToken: string, userId: string, code: string): Promise<KioskLoginResult> {
  const { data, error } = await supabase.functions.invoke('kiosk-login', {
    body: { device_token: deviceToken, user_id: userId, code: code.trim() },
  });
  if (error) return { ok: false, error: 'network' };
  const res = data as { ok: boolean; token_hash?: string; error?: string };
  if (!res?.ok || !res.token_hash) return { ok: false, error: res?.error ?? 'server_error' };

  // Tek-kullanımlık OTP → oturum. (LoginScreen.tsx verifyOtp deseni.)
  const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: res.token_hash, type: 'magiclink' });
  if (otpErr) return { ok: false, error: 'otp_failed' };
  return { ok: true };
}

// ───────────────────────── Yönetim (admin/manager + kullanıcı) ─────────────────────────

export interface LabDevice {
  id: string; name: string; active: boolean;
  device_token_hash: string | null; pairing_code: string | null; pairing_expires_at: string | null;
  last_seen_at: string | null; created_at: string; revoked_at: string | null;
}

/** Lab'ın kayıtlı tabletleri (RLS: yalnız manager/admin görür). */
export async function listLabDevices(): Promise<LabDevice[]> {
  const { data, error } = await supabase
    .from('lab_devices')
    .select('id, name, active, device_token_hash, pairing_code, pairing_expires_at, last_seen_at, created_at, revoked_at')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as LabDevice[]) ?? [];
}

/** Yeni tablet oluştur → eşleştirme kodu döner. */
export async function createLabDevice(name: string): Promise<{ ok: boolean; pairing_code?: string; pairing_expires_at?: string; error?: string }> {
  const { data, error } = await supabase.rpc('lab_device_create', { p_name: name });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, pairing_code: row?.pairing_code, pairing_expires_at: row?.pairing_expires_at };
}

/** Cihaza yeni eşleştirme kodu üret (yeniden eşleştirme). */
export async function repairLabDevice(id: string): Promise<{ ok: boolean; pairing_code?: string; pairing_expires_at?: string; error?: string }> {
  const { data, error } = await supabase.rpc('lab_device_repair', { p_id: id });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, pairing_code: row?.pairing_code, pairing_expires_at: row?.pairing_expires_at };
}

/** Cihazı iptal et (revoke → o tabletteki tüm kodlar durur). */
export async function revokeLabDevice(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('lab_device_revoke', { p_id: id });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export interface MyCodeStatus { ok: boolean; hasCode: boolean; updatedAt: string | null; lockedUntil: string | null; }

/** Kullanıcının kendi kodu var mı? (staff_access_codes self-select) */
export async function myCodeStatus(): Promise<MyCodeStatus> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return { ok: false, hasCode: false, updatedAt: null, lockedUntil: null };
  const { data, error } = await supabase
    .from('staff_access_codes')
    .select('active, updated_at, locked_until')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) return { ok: false, hasCode: false, updatedAt: null, lockedUntil: null };
  const row = data as { active?: boolean; updated_at?: string | null; locked_until?: string | null } | null;
  const locked = row?.locked_until && new Date(row.locked_until).getTime() > Date.now() ? row.locked_until : null;
  return { ok: true, hasCode: !!row?.active, updatedAt: row?.active ? (row.updated_at ?? null) : null, lockedUntil: locked };
}

/** Kolay tahmin edilen kod mu? (sunucudaki _kiosk_code_is_weak ile aynı kural) */
export function isWeakCode(code: string): boolean {
  if (!/^[0-9]{6}$/.test(code)) return false;
  return code === code[0].repeat(6)
    || '01234567890'.includes(code)
    || '09876543210'.includes(code)
    || code === code.slice(0, 2).repeat(3)
    || code === code.slice(0, 3).repeat(2);
}

export type SetCodeError = 'old_code_mismatch' | 'locked' | 'weak_code' | 'invalid_code' | 'save_failed';

/** Kullanıcı kendi 6 haneli kodunu belirler. Mevcut aktif kod varsa eski kod ZORUNLU. */
export async function setMyCode(code: string, oldCode?: string): Promise<{ ok: boolean; error?: SetCodeError }> {
  const { data, error } = await supabase.rpc('staff_set_my_code', { p_code: code, p_old_code: oldCode ?? null });
  if (error) {
    // Eski sunucu sürümü (void + istisna) ile de uyumlu.
    const msg = error.message || '';
    if (msg.includes('old_code_mismatch')) return { ok: false, error: 'old_code_mismatch' };
    return { ok: false, error: 'save_failed' };
  }
  // Yeni sürüm jsonb döndürür; eski sürüm void (null) → başarı.
  const res = data as { ok?: boolean; error?: string } | null;
  if (res && res.ok === false) {
    const e = res.error;
    return { ok: false, error: (e === 'old_code_mismatch' || e === 'locked' || e === 'weak_code' || e === 'invalid_code') ? e : 'save_failed' };
  }
  return { ok: true };
}

/** Kullanıcı kendi kodunu kaldırır. */
export async function clearMyCode(): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('staff_clear_my_code');
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Kullanıcıya gösterilecek hata metni (enumeration sızdırmadan). */
export function kioskErrorText(code?: string): string {
  switch (code) {
    case 'no_match':      return 'Kod hatalı. Tekrar deneyin.';
    case 'device_locked': return 'Çok fazla hatalı deneme — bu tablet geçici olarak kilitlendi. Birazdan tekrar deneyin.';
    case 'user_locked':   return 'Hesabınız geçici olarak kilitli. Birazdan tekrar deneyin.';
    case 'user_inactive': return 'Hesabınız aktif değil. Yöneticinize başvurun.';
    case 'device_invalid':return 'Bu tablet artık kayıtlı değil. Yöneticinizden yeniden eşleştirmesini isteyin.';
    case 'expired':       return 'Eşleştirme kodunun süresi dolmuş. Yeni kod isteyin.';
    case 'invalid_code':  return 'Eşleştirme kodu geçersiz.';
    case 'network':       return 'Bağlantı hatası. İnternet bağlantınızı kontrol edin.';
    case 'user_required': return 'Uygulama güncellendi. Sayfayı yenileyip tekrar deneyin.';
    default:              return 'Bir hata oluştu. Tekrar deneyin.';
  }
}

// ── Yönetici: personel kodları ─────────────────────────────────────────────
// Liste, tabletteki kişi listesiyle (kiosk_list_users) aynı kuralı izler:
// aktif + onaylı, lab personeli/admin. "Tablette görünür" = aktif kodu var.
export interface StaffCodeRow {
  user_id: string; full_name: string; avatar_url: string | null;
  user_type: string | null; role: string | null;
  hasCode: boolean; updatedAt: string | null; lockedUntil: string | null;
}

/** Lab personeli + kod durumları (RLS: profiller lab'a, kodlar kiosk_can_manage'e açık). */
export async function listStaffCodes(labId: string): Promise<{ ok: boolean; rows: StaffCodeRow[] }> {
  const [{ data: people, error: e1 }, { data: codes, error: e2 }] = await Promise.all([
    supabase.from('profiles')
      .select('id, full_name, avatar_url, user_type, role, is_active, approval_status')
      .eq('lab_id', labId)
      .in('user_type', ['lab', 'admin']),
    supabase.from('staff_access_codes').select('user_id, active, updated_at, locked_until').eq('lab_id', labId),
  ]);
  if (e1 || e2) return { ok: false, rows: [] };
  const byUser = new Map<string, any>((codes ?? []).map((c: any) => [c.user_id, c]));
  const now = Date.now();
  const rows: StaffCodeRow[] = (people ?? [])
    .filter((p: any) => p.is_active !== false && (p.approval_status == null || p.approval_status === 'approved'))
    .map((p: any) => {
      const c = byUser.get(p.id);
      const active = !!c?.active;
      const locked = active && c?.locked_until && new Date(c.locked_until).getTime() > now ? c.locked_until : null;
      return {
        user_id: p.id, full_name: (p.full_name || '').trim() || '—', avatar_url: p.avatar_url ?? null,
        user_type: p.user_type ?? null, role: p.role ?? null,
        hasCode: active, updatedAt: active ? (c?.updated_at ?? null) : null, lockedUntil: locked,
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr'));
  return { ok: true, rows };
}

/** Yönetici bir personelin kodunu sıfırlar (kod pasifleşir, kilit kalkar; kişi yeni kod belirler). */
export async function resetStaffCode(userId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('staff_reset_code', { p_user_id: userId });
  return error ? { ok: false, error: error.message } : { ok: true };
}
