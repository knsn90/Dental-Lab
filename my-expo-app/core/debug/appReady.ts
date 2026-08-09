// HTML splash'ı kapatma sinyali.
//
// ÖNEMLİ: bu sinyal ROTADAN BAĞIMSIZ olmalı. Eskiden yalnız `app/index.tsx`
// içinde gönderiliyordu; `/orders` gibi bir adres DOĞRUDAN açıldığında (derin
// bağlantı, yenileme, yer imi) index hiç mount olmadığı için sinyal hiç gelmiyor
// ve splash `inject-pwa.js` içindeki 12 saniyelik güvenlik zaman aşımına kadar
// ekranda kalıyordu — kullanıcı bunu "sayfa açılmıyor" olarak görüyor.
import { Platform } from 'react-native';

export function signalAppReady(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if ((window as any).__nxReady) return;
  (window as any).__nxReady = true;
  try { window.dispatchEvent(new Event('nx:ready')); } catch { /* yoksay */ }
}
