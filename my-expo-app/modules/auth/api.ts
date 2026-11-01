import { supabase } from '../../core/api/supabase';
import { toConsentPayload, toSignupConsentMeta, type ConsentState } from './components/ConsentGate';

export type UserType = 'lab' | 'doctor' | 'admin' | 'clinic_admin';
export type LabRole = 'technician' | 'manager';

/**
 * Kayıt sırasında alınan onayları append-only `user_consents` defterine yazar
 * (P0-5 · R-01).
 *
 * 2026-10-20: e-posta doğrulaması (OTP) açıkken signUp OTURUM DÖNDÜRMEZ; bu RPC
 * oturum istediği için kayıtta hep düşüyor, kullanıcı OTP'den sonra onayları
 * ikinci kez görüyordu. Onaylar artık signUp metadata'sında (`consents`) gider ve
 * auth.users tetikleyicisi yazar; bu çağrı yalnız signUp oturum döndürdüğünde
 * (doğrulama kapalıysa) yapılır.
 *
 * Sessizce yutulmaz ama kaydı da bloklamaz: signUp başarılı olduysa kullanıcı
 * hesabı vardır; onay yazımı ağ hatasıyla düşerse `has_required_consents()`
 * false döner ve kullanıcı bir sonraki girişte tekrar onay ekranına düşer.
 * Böylece "hesap var ama onay yok" durumu sessiz kalmaz.
 */
async function recordConsents(consents?: ConsentState): Promise<void> {
  if (!consents) return;
  const { error } = await supabase.rpc('record_consents', {
    p_consents: toConsentPayload(consents),
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[consent] kayıt yazılamadı — girişte tekrar sorulacak:', error.message);
  }
}

export interface SignUpDoctorParams {
  email: string;
  password: string;
  full_name: string;
  clinic_name: string;
  phone: string;
  address: string;
  /** Çalışılacak lab'ın verdiği bağlantı kodu — e-posta doğrulandıktan sonra kullanılır. */
  connect_code: string;
  /** P0-5 · R-01 — kayıt ekranında toplanan onaylar. */
  consents?: ConsentState;
}

export interface SignUpLabParams {
  email: string;
  password: string;
  full_name: string;
  role: LabRole;
  phone?: string;
  /** P0-5 · R-01 — kayıt ekranında toplanan onaylar. */
  consents?: ConsentState;
}

/**
 * Public hekim kaydı. Yalnız auth kullanıcısı oluşturur; profil satırını sunucu
 * (on_auth_user_created → handle_new_user) onay bekleyen, kliniksiz olarak açar.
 * Klinik ve hekim kaydı lab onayında sunucuda kurulur (lab'ın CRM kliniği):
 * bağlantı kodu, adres ve klinik tipi bu yüzden metadata'da taşınır ve e-posta
 * doğrulandıktan sonra bekleme ekranında `clinic_signup_connect` ile kullanılır.
 * (Eskiden burada yapılan clinics/doctors insert'i RLS'e, profil update'i
 * korumalı alan guard'ına takılıyordu; zaten OTP öncesi oturum yok.)
 */
export async function signUpDoctor(params: SignUpDoctorParams) {
  const authResult = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        user_type: 'doctor' as UserType,
        full_name: params.full_name,
        clinic_name: params.clinic_name,
        phone: params.phone,
        role: null,
        address: params.address,
        connect_code: params.connect_code,
        consents: toSignupConsentMeta(params.consents),
      },
    },
  });

  if (authResult.error || !authResult.data.user) return authResult;

  // Oturum varsa (doğrulama kapalı) RPC de yazar; yoksa tetikleyici yazdı.
  if (authResult.data.session) await recordConsents(params.consents);

  return authResult;
}

export interface SignUpClinicParams {
  email: string;
  password: string;
  full_name: string;
  clinic_name: string;
  phone: string;
  address: string;
  clinic_type: 'muayenehane' | 'klinik' | 'poliklinik' | 'hastane';
  /** Çalışılacak lab'ın verdiği bağlantı kodu — e-posta doğrulandıktan sonra kullanılır. */
  connect_code: string;
  /** P0-5 · R-01 — kayıt ekranında toplanan onaylar. */
  consents?: ConsentState;
}

/** Public klinik yöneticisi kaydı — akış signUpDoctor ile aynı. */
export async function signUpClinic(params: SignUpClinicParams) {
  //   Migration 033 sonrası 'clinic_admin' geçerli bir user_type.
  //   Eskiden 'doctor' + role='clinic_admin' yazılıyordu; bu kullanıcı listesinde
  //   Klinik filtresinde görünmesini engelliyordu.
  const authResult = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        user_type: 'clinic_admin' as UserType,
        full_name: params.full_name,
        clinic_name: params.clinic_name,
        phone: params.phone,
        role: 'clinic_admin',
        address: params.address,
        clinic_type: params.clinic_type,
        connect_code: params.connect_code,
        consents: toSignupConsentMeta(params.consents),
      },
    },
  });

  if (authResult.error || !authResult.data.user) return authResult;

  if (authResult.data.session) await recordConsents(params.consents);

  return authResult;
}

export async function signUpLabUser(params: SignUpLabParams) {
  const res = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        user_type: 'lab' as UserType,
        full_name: params.full_name,
        clinic_name: null,
        phone: params.phone ?? null,
        role: params.role,
        consents: toSignupConsentMeta(params.consents),
      },
    },
  });
  if (!res.error && res.data.user && res.data.session) await recordConsents(params.consents);
  return res;
}

/**
 * Supabase auth hatalarının ham İngilizce metnini kullanıcıya gösterilecek
 * Türkçe karşılığına çevirir; tanımadığı hatada `null` döner (çağıran kendi
 * yedek metnini kullansın).
 *
 * Neden: GoTrue mesajları her zaman İngilizce gelir ("User is banned" gibi) ve
 * doğrudan ekrana basılınca hiçbir dilde anlaşılmıyordu. Türkçe karşılığı
 * yazınca otomatik sözlük katmanı onu en/de/fa'ya çözüyor — yani tek yerde
 * eşleyince dört dil birden düzeliyor.
 *
 * Her giriş yolu (şifre, OTP gönder, OTP doğrula, yönetici girişi) bunu
 * kullanır; biri atlanırsa o yolda yine ham İngilizce görünür.
 */
export function authErrorMessage(raw: unknown): string | null {
  const s = String((raw as any) ?? '');
  if (!s) return null;
  if (/banned/i.test(s))
    return 'Hesabınız pasife alınmış. Laboratuvar yöneticinizle iletişime geçin.';
  if (/email not confirmed/i.test(s))
    return 'E-posta adresini doğrulaman gerekiyor.';
  if (/rate limit|too many requests|over_email_send_rate/i.test(s))
    return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.';
  if (/user not found|signups not allowed|signup_disabled/i.test(s))
    return 'Bu e-posta ile kayıtlı hesap bulunamadı.';
  if (/network|fetch|failed to fetch/i.test(s))
    return 'Sunucuya bağlanılamadı. İnternet bağlantını kontrol et.';
  return null;
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function fetchProfile(userId: string) {
  return supabase.from('profiles').select('*').eq('id', userId).single();
}

export { supabase };
