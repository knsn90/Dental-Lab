// core/store/newOrderModalStore.ts
// Global "Yeni İş Emri" modal toggle — layout modal'ı barındırır;
// dashboard CTA card, FAB, quick tile gibi herhangi bir yerden açılabilir.

import { create } from 'zustand';

interface NewOrderModalStore {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

export const useNewOrderModalStore = create<NewOrderModalStore>(set => ({
  open: false,
  setOpen: (v) => set({ open: v }),
  toggle: () => set(s => ({ open: !s.open })),
}));
