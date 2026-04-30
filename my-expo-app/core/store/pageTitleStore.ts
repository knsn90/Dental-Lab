// Geçici sayfa başlığı override store'u.
// Detay ekranları (OrderDetail, vb.) DesktopShell üst başlığı için
// dinamik bir başlık set edebilir. null olduğunda shell default
// nav item label'ını kullanır.

import { create } from 'zustand';
import type { ReactNode } from 'react';

interface PageTitleState {
  title:    string | null;
  subtitle: string | null;
  /** Sayfa başlığının yanında (sağında) gösterilecek aksiyon node'u (ör. Düzenle/Sil) */
  actions:  ReactNode | null;
  setTitle:   (title: string | null, subtitle?: string | null) => void;
  setActions: (actions: ReactNode | null) => void;
  clear:      () => void;
}

export const usePageTitleStore = create<PageTitleState>((set) => ({
  title:    null,
  subtitle: null,
  actions:  null,
  setTitle:   (title, subtitle = null) => set({ title, subtitle }),
  setActions: (actions) => set({ actions }),
  clear:      () => set({ title: null, subtitle: null, actions: null }),
}));
