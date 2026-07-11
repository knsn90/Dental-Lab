/**
 * Support store — global "destek aç" tetikleyicisi.
 * Her yerden `useSupportStore.getState().open({ context })` çağrılarak modal açılır.
 * Modal'ı root layout'ta tek instance olarak render ederiz.
 */
import { create } from 'zustand';
import type { SupportContext, SupportCategory, SupportPriority } from '../../modules/support/types';

interface SupportOpenPayload {
  context?: SupportContext;
  category?: SupportCategory;
  priority?: SupportPriority;
  subjectHint?: string;          // başlık placeholder veya pre-fill
  workOrderId?: string | null;
  stageKey?: string | null;
  errorCode?: string | null;
}

interface SupportStore {
  isOpen: boolean;
  payload: SupportOpenPayload | null;
  open: (p?: SupportOpenPayload) => void;
  close: () => void;
}

export const useSupportStore = create<SupportStore>((set) => ({
  isOpen: false,
  payload: null,
  open: (p = {}) => set({ isOpen: true, payload: p }),
  close:  () => set({ isOpen: false, payload: null }),
}));

/**
 * Quick helper — browser/device/url bilgilerini context'e otomatik ekler.
 */
export function openSupport(payload: SupportOpenPayload = {}) {
  const autoContext: SupportContext = { ...(payload.context ?? {}) };
  if (typeof navigator !== 'undefined' && !autoContext.browser) {
    autoContext.browser = navigator.userAgent.slice(0, 80);
  }
  if (typeof window !== 'undefined' && !autoContext.url) {
    autoContext.url = window.location.href;
  }
  if (typeof window !== 'undefined' && !autoContext.device) {
    const w = window.innerWidth;
    autoContext.device = w < 760 ? 'mobile' : w < 1100 ? 'tablet' : 'desktop';
  }
  useSupportStore.getState().open({ ...payload, context: autoContext });
}
