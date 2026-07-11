// core/store/scanStore.ts
// Global QR scan modal toggle — layout modal'ı barındırır,
// dashboard / quick tile içinden açar.

import { create } from 'zustand';

interface ScanStore {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

export const useScanStore = create<ScanStore>(set => ({
  open: false,
  setOpen: (v) => set({ open: v }),
  toggle: () => set(s => ({ open: !s.open })),
}));
