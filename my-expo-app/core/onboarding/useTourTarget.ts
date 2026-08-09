// core/onboarding/useTourTarget.ts
// Attach to any element to make it a spotlight target:
//   <Pressable ref={useTourTarget('tour-new-order')} />
// Works on RN-Web (View/Pressable forward a host ref with measureInWindow).

import { useCallback } from 'react';
import { useOnboardingStore } from './onboardingStore';

export function useTourTarget(id: string) {
  return useCallback(
    (node: any) => {
      const store = useOnboardingStore.getState();
      if (node) store.registerRef(id, node);
      else store.unregisterRef(id);
    },
    [id],
  );
}
