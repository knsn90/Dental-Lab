/**
 * pendingRoute — giriş-sonrası devam edilecek derin bağlantı hedefi.
 *
 * E-posta / QR linkleri `/order/<id>` gibi evrensel yönlendiricilere gider.
 * Kullanıcı oturumsuzsa login'e atılır; `redirect` URL parametresi yönlendirme
 * zincirinde siliniyordu (kök guard paramsız `router.replace('/(auth)/login')`
 * atıyor). Bu yüzden hedefi URL'e değil, buraya (bellek + web sessionStorage)
 * yazıyoruz. Giriş başarılı olunca kök guard bunu tüketip hedefe yönlendirir.
 *
 * Güvenlik: yalnız `/` ile başlayan, `//` (protokol-relatif → open-redirect) ve
 * `/(` (ham route-grup) OLMAYAN iç yollar kabul edilir.
 */
const KEY = 'nx_pending_route';
let pending: string | null = null;

function isSafe(route: unknown): route is string {
  return (
    typeof route === 'string' &&
    route.startsWith('/') &&
    !route.startsWith('//') &&
    !route.startsWith('/(')
  );
}

/** Oturumsuz kullanıcı derin bağlantıya tıkladığında hedefi sakla. */
export function setPendingRoute(route: string): void {
  if (!isSafe(route)) return;
  pending = route;
  try {
    if (typeof window !== 'undefined') window.sessionStorage?.setItem(KEY, route);
  } catch {
    /* private mode / erişim yok — bellek yedeği yeterli */
  }
}

/** Hedefi oku ve temizle (giriş sonrası tek kullanımlık). */
export function takePendingRoute(): string | null {
  let r = pending;
  if (!r) {
    try {
      if (typeof window !== 'undefined') r = window.sessionStorage?.getItem(KEY) ?? null;
    } catch {
      /* yok say */
    }
  }
  pending = null;
  try {
    if (typeof window !== 'undefined') window.sessionStorage?.removeItem(KEY);
  } catch {
    /* yok say */
  }
  return isSafe(r) ? r : null;
}
