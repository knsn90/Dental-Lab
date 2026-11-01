/**
 * commandPaletteStore — Global command palette state
 * Açma/kapama + query yönetimi
 */
import { create } from 'zustand';

interface CommandPaletteState {
  open: boolean;
  query: string;
  /** initialQuery: üst "Ara..." kutusundaki metin palete taşınır (2. dalga 1). */
  openPalette: (initialQuery?: string) => void;
  closePalette: () => void;
  togglePalette: () => void;
  setQuery: (q: string) => void;
}

export const useCommandPalette = create<CommandPaletteState>((set) => ({
  open:  false,
  query: '',
  // onPress'e doğrudan verilirse olay nesnesi gelir → yalnız metin kabul edilir
  openPalette:   (initialQuery) => set({ open: true,  query: typeof initialQuery === 'string' ? initialQuery : '' }),
  closePalette:  () => set({ open: false, query: '' }),
  togglePalette: () => set((s) => ({ open: !s.open, query: s.open ? '' : s.query })),
  setQuery:      (q) => set({ query: q }),
}));
