// core/onboarding/useTourBlocker.ts
// Zorunlu bir pencere (KVKK onayı, ödeme hatırlatması…) açıkken ilk-giriş
// turunu bekletir. Pencere kapanınca tur kaldığı adımdan sürer.
//
// Neden: yeni hekimin ilk girişinde onay penceresi ile tur aynı anda açılıyordu.
// Web/PWA'da tur katmanı (zIndex 100000) pencerenin (9999) ÜSTÜNE biniyor,
// spotlight pencerenin arkasında kalan navbar'ı gösteriyordu → "navbar yok,
// boş yerleri gösteriyor" (2026-10-20). Tur yokken etkisiz.

import { useEffect } from 'react';
import { useOnboardingStore } from './onboardingStore';

export function useTourBlocker(blocking: boolean) {
  useEffect(() => {
    if (!blocking) return;
    useOnboardingStore.getState().pushBlocker();
    return () => useOnboardingStore.getState().popBlocker();
  }, [blocking]);
}
