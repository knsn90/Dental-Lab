/**
 * Labın ilk kurulum sihirbazı tamamlandı mı (labs.setup_completed_at).
 *
 * Neden store: yönlendirme kapısı (app/_layout.tsx) bu bayrağa bakıyor. Bayrak
 * yalnız _layout içinde local state olsaydı, sihirbaz bitip panele geçtiğinde
 * state hâlâ `false` kalır ve guard kullanıcıyı sihirbaza geri fırlatırdı —
 * sonsuz döngü. Sihirbaz kaydettiği/bıraktığı anda markDone() ile aynı bayrağı
 * günceller, guard bir sonraki turda kullanıcıyı bırakır.
 *
 * Fail-open: okuma hata verirse `done: true` sayılır — kurulum ekranına
 * takılmaktansa panele girmek yeğdir.
 */
import { create } from 'zustand';
import { supabase } from '../api/supabase';

interface LabSetupState {
  /** null = henüz bilinmiyor → guard bu sırada yönlendirme YAPMAZ. */
  done: boolean | null;
  labId: string | null;
  load: (labId: string) => Promise<void>;
  markDone: () => void;
  reset: () => void;
}

export const useLabSetupStore = create<LabSetupState>((set, get) => ({
  done: null,
  labId: null,

  load: async (labId) => {
    if (get().labId === labId && get().done !== null) return;   // aynı lab, zaten biliniyor
    set({ labId });
    try {
      const { data, error } = await supabase
        .from('labs').select('setup_completed_at').eq('id', labId).maybeSingle();
      set({ done: error ? true : data?.setup_completed_at != null });
    } catch {
      set({ done: true });
    }
  },

  markDone: () => set({ done: true }),
  reset: () => set({ done: null, labId: null }),
}));
