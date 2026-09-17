/**
 * authErrorText — Supabase Auth hatalarını KISA ve ÇEVRİLEBİLİR mesaja çevirir.
 *
 * NEDEN: Supabase şifre kuralı hatasını tek satırda, İngilizce ve kural listesiyle
 * döndürüyor:
 *   "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz,
 *    ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, !@#$%^&*()_+-=[]{};'\:\"|<>?,./`~."
 * Bu ham metin üç ayrı kayıt akışında (klinik yetkilisi, hekim giriş hesabı,
 * personel giriş hesabı) kullanıcıya olduğu gibi gösteriliyordu: uzun, okunmaz ve
 * yalnız İngilizce. Üç yerdeki kopya-yapıştır eşleme de şifre kuralını hiç
 * yakalamıyordu.
 *
 * ÇEVİRİ: Mesaj BURADA autoT ile çevrilir. Çağıran taraf `${autoT('Başlık')}: ${msg}`
 * gibi birleştirdiği için dize sözlüğe takılmıyor (CLAUDE.md: şablon dizeler
 * eşleşmez) — bu yüzden çeviri parçanın kendisinde yapılmalı.
 */
import { autoT } from '../i18n/autoTranslate';

export function authErrorText(raw: unknown): string {
  const m = String(raw ?? '').trim();
  if (!m) return autoT('Bilinmeyen hata');

  // E-posta zaten kayıtlı
  if (/already (been )?registered|user already exists|email.*(already|exists)/i.test(m))
    return autoT('Bu e-posta zaten kullanılıyor. Farklı bir e-posta deneyin.');

  // Şifre karakter çeşitliliği (Supabase'in uzun kural listesi)
  if (/at least one character of each|password should contain|requires.*(uppercase|lowercase|symbol)/i.test(m))
    return autoT('Şifre büyük harf, küçük harf, rakam ve sembol içermeli');

  // Şifre kısa/zayıf
  if (/password.*(too short|short|weak)|at least \d+ characters|en az \d+ karakter/i.test(m))
    return autoT('Şifre en az 8 karakter olmalı');

  // Giriş bilgileri hatalı
  if (/invalid login credentials|invalid email or password/i.test(m))
    return autoT('E-posta veya şifre hatalı');

  // Hız sınırı
  if (/rate limit|too many requests|for security purposes/i.test(m))
    return autoT('Çok fazla deneme — biraz sonra tekrar deneyin');

  // Geçersiz e-posta biçimi
  if (/invalid.*email|email.*invalid/i.test(m))
    return autoT('E-posta adresi geçersiz');

  // Tanınmayan hata: ham metni bozmadan geri ver (bilgi kaybolmasın).
  return m;
}
