// Kayıt ekranının hangi alan adından açıldığını çözer. Lab'ın kendi alan adından
// (ör. www.nexadent.net) açılan kayıt davet kodu sormaz; sunucu
// public_signup_lab_for_host ile o lab'ın açık katılım kodunu verir.
//
// Platformun kendi adresleri (siman.app) ve yerel geliştirme hiçbir lab'a
// bağlanmaz → sunucuya hiç sorulmaz, kod alanı eskisi gibi görünür.
// Geliştirmede denemek için: ?signup_host=www.nexadent.net (yalnız __DEV__).

const PLATFORM_HOSTS = /(^|\.)siman\.app$/i;
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\]|.*\.localhost)$/i;

export function signupHostFor(hostname: string, search: string, isDev: boolean): string | null {
  if (isDev) {
    const override = new URLSearchParams(search || '').get('signup_host');
    if (override && override.trim()) return override.trim().toLowerCase();
  }
  const h = String(hostname || '').trim().toLowerCase();
  if (!h || PLATFORM_HOSTS.test(h) || LOCAL_HOSTS.test(h)) return null;
  return h;
}
