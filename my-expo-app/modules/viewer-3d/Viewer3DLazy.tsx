/**
 * Viewer3DModalLazy — 3D viewer'a tek erişim noktası.
 *
 * ÖNCE dinamik import + React.lazy kullanılıyordu; ama Metro DEV async-chunk
 * modunda `import('./components/Viewer3DModal')` modülü export'ları atanmadan
 * `{}` (boş) olarak çözüyordu (retry'lar bile düzeltmiyordu) → "Lazy resolves
 * to undefined" / "modül boş döndü" çökmesi.
 *
 * Çözüm: web'de SENKRON `require` ile yükle (async chunk yok → boş-modül sorunu
 * yok; hem dev hem prod güvenilir). three.js yalnız web bundle'ına girer; native
 * (Platform guard) hiç require etmez → three native'e sızmaz. require eval'i
 * patlarsa tüm sayfayı çökertmemek için try/catch ile boş bileşene düşülür.
 */
import React from 'react';
import { Platform } from 'react-native';

let Resolved: React.ComponentType<any> = () => null;

if (Platform.OS === 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod: any = require('./components/Viewer3DModal');
    Resolved = mod?.default ?? mod?.Viewer3DModal ?? (() => null);
    if (typeof Resolved !== 'function') {
      console.error('[3D viewer] bileşen bulunamadı', mod);
      Resolved = () => null;
    }
  } catch (e) {
    console.error('[3D viewer] yüklenemedi:', e);
    Resolved = () => null;
  }
}

export const Viewer3DModalLazy: any = Resolved;
