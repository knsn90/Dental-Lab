/**
 * pushTap — telefon bildirimine dokunulunca açılacak yol (saf; react-native yok).
 *
 * Yol `data.url`'den gelir; send-expo-push DB göndericilerinin actionUrl'ini oraya
 * eşler (supabase/functions/_shared/pushData.ts). Yalnız uygulama içi yol kabul
 * edilir ('/' ile başlayan, '//' ile başlamayan).
 *
 * Uygulama bildirime dokunularak AÇILDIYSA dinleyici oturumdan sonra geç kurulur ve
 * dokunuşu kaçırır; nativePush "son dokunuşu" da okur. Aynı yanıt hem dinleyiciden
 * hem son dokunuştan gelebileceği için yönlendirici bildirim kimliğiyle tekilleştirir.
 */
export interface TapResponseLike {
  notification?: {
    request?: {
      identifier?: string;
      content?: { data?: Record<string, unknown> | null };
    };
  };
}

export function tapUrl(response: TapResponseLike | null | undefined): string | null {
  const v = response?.notification?.request?.content?.data?.url;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  return s;
}

/** Dokunuşu işler; gerçekten gezindiyse true. Aynı bildirim kimliği bir kez işlenir. */
export function createTapRouter(navigate: (url: string) => void): (response: TapResponseLike | null | undefined) => boolean {
  const handled = new Set<string>();
  return (response) => {
    const url = tapUrl(response);
    if (!url) return false;
    const id = response?.notification?.request?.identifier;
    if (id && handled.has(id)) return false;
    try {
      navigate(url);
    } catch {
      return false;
    }
    if (id) handled.add(id);
    return true;
  };
}
