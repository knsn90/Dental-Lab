/**
 * commandPaletteStore — Global command palette state
 * Açma/kapama + query yönetimi
 */
import { create } from 'zustand';

interface CommandPaletteState {
  open: boolean;
  query: string;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  setQuery: (q: string) => void;
}

export const useCommandPalette = create<CommandPaletteState>((set) => ({
  open:  false,
  query: '',
  openPalette:   () => set({ open: true,  query: '' }),
  closePalette:  () => set({ open: false, query: '' }),
  togglePalette: () => set((s) => ({ open: !s.open, query: s.open ? '' : s.query })),
  setQuery:      (q) => set({ query: q }),
}));
