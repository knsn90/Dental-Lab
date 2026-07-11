// Lab marka (isim/logo/sidebar modu) değişince sidebar'ı anında tazelemek için sinyal.
// GeneralSection ayar kaydedince bump() çağırır; PatternsShell version'ı fetch deps'ine koyar.
import { create } from 'zustand';

interface LabBrandState {
  version: number;
  bump: () => void;
}

export const useLabBrandStore = create<LabBrandState>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
