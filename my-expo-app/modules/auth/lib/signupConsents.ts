// Kayıt formunda verilen onayların signUp metadata'sındaki biçimi.
//
// Neden metadata: e-posta OTP'si girilene kadar oturum YOK; record_consents RPC'si
// oturum ister ve kayıt anında sessizce düşüyordu → kullanıcı OTP'den sonra aynı
// onayları ikinci kez görüyordu. Onaylar artık hesapla birlikte gider; auth.users
// tetikleyicisi (_record_signup_consents) user_consents defterine yazar.
// JWT'ye de kopyalandığı için kısa tutulur (kullanıcı ajanı bir kez).

export type ConsentFlags = Record<string, boolean>;

export interface SignupConsentMeta {
  version: string;
  ua: string;
  items: ConsentFlags;
}

export function signupConsentMeta(
  flags: ConsentFlags | undefined,
  version: string,
  ua: string,
): SignupConsentMeta | undefined {
  if (!flags) return undefined;
  const items: ConsentFlags = {};
  for (const [k, v] of Object.entries(flags)) items[k] = v === true;
  return { version, ua: String(ua || '').slice(0, 400), items };
}
