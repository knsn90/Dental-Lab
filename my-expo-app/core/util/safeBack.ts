/**
 * safeBack — "geri" her zaman bir ÖNCEKİ ekrana dönsün.
 *
 * İki ayrı arıza vardı, ikisi de aynı butonun altında:
 *
 * 1. Geçmiş yokken (URL yapıştırma, yenileme, paylaşılan link, bildirimden
 *    gelme) `router.back()` konsola "GO_BACK was not handled" basıp hiçbir şey
 *    yapmıyor; kullanıcı sayfada kilitli kalıyordu.
 *
 * 2. Web'de `router.canGoBack()` geçmiş VARKEN de false dönebiliyor
 *    (react-navigation kendi yığınını sayar, tarayıcı geçmişini değil). O
 *    durumda ekran fallback rotasına atlıyor ve kullanıcı geldiği yerin yerine
 *    bir liste/hub sayfasında buluyordu kendini — "geri bastım ama başka yere
 *    gitti" şikâyetinin kaynağı buydu.
 *
 * Bu yüzden karar iki kaynaktan verilir: navigator yığını VEYA tarayıcı
 * geçmişi. İkisi de boşsa güvenli hedefe replace edilir (geçmişe çöp eklemez).
 *
 * Kullanım:
 *   safeBack();                       // '/' → app/index.tsx son panele yollar
 *   safeBack(`/${panel}/orders`);     // geçmiş yoksa listeye düş
 */
import { Platform } from 'react-native';
import { router } from 'expo-router';

/** Gerçekten geri gidilebilir mi — navigator yığını veya tarayıcı geçmişi */
export function canGoBackSafely(): boolean {
  try {
    if ((router as any)?.canGoBack?.()) return true;
  } catch { /* bazı sürümlerde yok */ }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return (window.history?.length ?? 0) > 1;
  }
  return false;
}

export function safeBack(fallbackHref: string = '/') {
  if (canGoBackSafely()) {
    try {
      router.back();
      return;
    } catch { /* geri gidilemedi → fallback */ }
  }
  try {
    router.replace(fallbackHref as any);
  } catch { /* son çare: sessiz geç, en azından hata basmasın */ }
}
