/**
 * uiOverlayStore — Global UI overlay tetikleyicileri.
 *
 * notificationsPulse: artarsa, ilgili sayfada (genelde dashboard) NotificationsSheet
 * açılır. Mobile top-action bar'daki Bell butonu bunu tetikler; her panelin
 * dashboard component'i pulse'ı dinler.
 */
import { create } from 'zustand';

interface UiOverlayState {
  notificationsPulse: number;
  bumpNotifications: () => void;
}

export const useUiOverlayStore = create<UiOverlayState>((set) => ({
  notificationsPulse: 0,
  bumpNotifications: () => set((s) => ({ notificationsPulse: s.notificationsPulse + 1 })),
}));
