// Değer değişimi yayı (spec §7.8): kritik sönümlü, ~350 ms, EKRANDAKİ mevcut
// değerden başlar ve kesilebilir — hızlı ardışık seçimlerde animasyon sıraya
// girmez, yolda yeni hedefe döner. Hareket azaltılmışsa doğrudan atama.
import { useEffect } from 'react';
import { useSharedValue, withSpring, useReducedMotion, type SharedValue } from 'react-native-reanimated';

export const VALUE_SPRING = { dampingRatio: 1, duration: 350 } as const;

export function useSpringValue(target: number): SharedValue<number> {
  const reduced = useReducedMotion();
  const v = useSharedValue(target);
  useEffect(() => {
    v.value = reduced ? target : withSpring(target, VALUE_SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduced]);
  return v;
}
