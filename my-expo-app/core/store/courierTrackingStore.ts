// core/store/courierTrackingStore.ts
// Kurye canlı konum takibi durumu — panel-seviyesi tracker (useCourierTracking)
// yazar, ekranlar (dashboard) "konum paylaşılıyor" göstergesi için okur.
import { create } from 'zustand';

interface CourierTrackingState {
  active: boolean;          // taşınan/yolda iş var → konum izleniyor
  lastPingAt: number | null; // son başarılı ping (ms)
  setActive: (v: boolean) => void;
  markPing: () => void;
}

export const useCourierTrackingStore = create<CourierTrackingState>((set) => ({
  active: false,
  lastPingAt: null,
  setActive: (v) => set((s) => (s.active === v ? s : { active: v })),
  markPing: () => set({ lastPingAt: Date.now() }),
}));
