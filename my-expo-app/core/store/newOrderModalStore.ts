// core/store/newOrderModalStore.ts
// Global "Yeni İş Emri" modal toggle — layout modal'ı barındırır;
// dashboard CTA card, FAB, quick tile gibi herhangi bir yerden açılabilir.

import { create } from 'zustand';
import type { OrderPrefill } from '../../modules/orders/prefillFromOrder';

interface NewOrderModalStore {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  /**
   * "Bu siparişten yeni oluştur" ile doldurulacak başlangıç değerleri.
   * null → normal boş form (mevcut davranış, hiçbir çağrı noktası etkilenmez).
   */
  prefill: OrderPrefill | null;
  /** Modal'ı prefill ile açar (mobil). */
  openWithPrefill: (p: OrderPrefill) => void;
  /** Yalnız prefill'i hazırlar, modal'ı AÇMAZ (desktop route akışı: route
   *  NewOrderScreen'i store'daki prefill'i okur, modal render edilmez). */
  stagePrefill: (p: OrderPrefill) => void;
  clearPrefill: () => void;
}

export const useNewOrderModalStore = create<NewOrderModalStore>(set => ({
  open: false,
  // Kapanırken prefill'i düşür — bir sonraki "Yeni sipariş" boş açılsın.
  setOpen: (v) => set(v ? { open: true } : { open: false, prefill: null }),
  toggle: () => set(s => (s.open ? { open: false, prefill: null } : { open: true })),
  prefill: null,
  openWithPrefill: (p) => set({ open: true, prefill: p }),
  stagePrefill: (p) => set({ prefill: p }),
  clearPrefill: () => set({ prefill: null }),
}));
