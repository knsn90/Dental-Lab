// Geçici sayfa başlığı override store'u.
// Detay ekranları (OrderDetail, vb.) DesktopShell üst başlığı için
// dinamik bir başlık set edebilir. null olduğunda shell default
// nav item label'ını kullanır.

import { create } from 'zustand';

interface PageTitleState {
  title:    string | null;
  subtitle: string | null;
  setTitle: (title: string | null, subtitle?: string | null) => void;
  clear:    () => void;
}

export const usePageTitleStore = create<PageTitleState>((set) => ({
  title:    null,
  subtitle: null,
  setTitle: (title, subtitle = null) => set({ title, subtitle }),
  clear:    () => set({ title: null, subtitle: null }),
}));
