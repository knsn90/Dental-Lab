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

/** Cihaz jetonu + kod → kullanıcının gerçek oturumu (verifyOtp). */
export async function kioskLogin(deviceToken: string, code: string): Promise<KioskLoginResult> {
  const { data, error } = await supabase.functions.invoke('kiosk-login', {
    body: { device_token: deviceToken, code: code.trim() },
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

/** Kullanıcının kendi kodu var mı? (staff_access_codes self-select) */
export async function myCodeStatus(): Promise<{ hasCode: boolean }> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return { hasCode: false };
  const { data } = await supabase.from('staff_access_codes').select('active').eq('user_id', uid).maybeSingle();
  return { hasCode: !!(data as any)?.active };
}

/** Kullanıcı kendi 6 haneli kodunu belirler. Mevcut aktif kod varsa eski kod ZORUNLU. */
export async function setMyCode(code: string, oldCode?: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('staff_set_my_code', { p_code: code, p_old_code: oldCode ?? null });
  if (!error) return { ok: true };
  // 42883: eski (tek-arg) fonksiyon imzası bulunamadı → deploy uyumsuzluğu; yine de anlaşılır dön
  const msg = error.message || '';
  if (msg.includes('old_code_mismatch')) return { ok: false, error: 'old_code_mismatch' };
  return { ok: false, error: 'save_failed' };
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
    default:              return 'Bir hata oluştu. Tekrar deneyin.';
  }
}
