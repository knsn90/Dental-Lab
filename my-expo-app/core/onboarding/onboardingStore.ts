// core/onboarding/onboardingStore.ts
// Reusable first-login coach-mark tour store.
// Side-effect free: finish()/skip() only touch state; the mark_doctor_onboarded
// RPC is fired by the overlay/trigger so this store stays pure.

import { create } from 'zustand';

/**
 * Side-effect a step triggers when it becomes active. Executed once by the
 * active-host overlay (see `overlayHost`). All fields optional & idempotent.
 */
export interface TourAction {
  /** Global "Yeni sipariş" modalını aç (interaktif form turu için). */
  openNewOrder?: boolean;
  /** Yeni-sipariş sihirbazını bu adıma götür (1..4). Form mount olmalı. */
  formStep?: 1 | 2 | 3 | 4;
  /** Yeni-sipariş modalını kapat. */
  closeNewOrder?: boolean;
}

export interface TourStep {
  /** Optional stable id for the step. */
  id?: string;
  /** Registered target id to spotlight. A step with no targetId is a centered card. */
  targetId?: string;
  title: string;
  body: string;
  /** Adım aktif olunca çalışacak yan-etki (form aç / adım değiştir vb.). */
  action?: TourAction;
}

interface OnboardingState {
  active: boolean;
  stepIndex: number;
  steps: TourStep[];
  /** Tur bitince/atlayınca çağrılacak "onboarded damgala" RPC adı (panel başına). */
  markRpc: string;
  /**
   * Hangi overlay örneği spotlight'ı çizecek. Yeni-sipariş modalı (fullScreen)
   * kök overlay'in ÜSTÜNE biner; o mount olunca 'newOrder'a geçer, kök overlay
   * kendini gizler (çift karartma olmaz), modal-içi overlay devralır.
   */
  overlayHost: 'root' | 'newOrder';
  setOverlayHost: (h: 'root' | 'newOrder') => void;
  /** id → element node (View/Pressable host instance). Mutated in place — no re-render. */
  refs: Map<string, any>;

  registerRef: (id: string, node: any) => void;
  unregisterRef: (id: string) => void;

  start: (steps: TourStep[], markRpc?: string) => void;
  next: () => void;
  prev: () => void;
  finish: () => void;
  skip: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  active: false,
  stepIndex: 0,
  steps: [],
  markRpc: 'mark_doctor_onboarded',
  overlayHost: 'root',
  setOverlayHost: (h) => { if (get().overlayHost !== h) set({ overlayHost: h }); },
  refs: new Map<string, any>(),

  // Ref registry is a live lookup read during measurement; mutating in place
  // (no set()) avoids re-render churn as tab cells mount/unmount.
  registerRef: (id, node) => {
    get().refs.set(id, node);
  },
  unregisterRef: (id) => {
    get().refs.delete(id);
  },

  start: (steps, markRpc = 'mark_doctor_onboarded') => {
    if (!steps || steps.length === 0) return;
    if (get().active) return; // already running — never restart mid-session
    set({ active: true, stepIndex: 0, steps, markRpc });
  },
  next: () => {
    const { stepIndex, steps } = get();
    if (stepIndex < steps.length - 1) set({ stepIndex: stepIndex + 1 });
  },
  prev: () => {
    const { stepIndex } = get();
    if (stepIndex > 0) set({ stepIndex: stepIndex - 1 });
  },
  finish: () => set({ active: false, stepIndex: 0, overlayHost: 'root' }),
  skip: () => set({ active: false, stepIndex: 0, overlayHost: 'root' }),
}));
