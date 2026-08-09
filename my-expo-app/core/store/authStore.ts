import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { Profile } from '../../lib/types';
import { supabase } from '../api/supabase';
import { bootMark } from '../debug/bootTrace';
import { useLastPanelStore, type PanelKey } from './lastPanelStore';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  fetchProfile: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  loading: true,

  setSession: (session) => { bootMark('session set', { user: session?.user?.id?.slice(0, 8) ?? null }); set({ session }); },
  setProfile: (profile) => {
    set({ profile });
    if (profile && typeof window !== 'undefined') {
      const p: any = profile;
      const panel =
        p.user_type === 'admin'        ? 'exec'      :
        p.user_type === 'doctor'       ? 'doctor'    :
        p.user_type === 'clinic_admin' ? 'klinik'    :
        p.user_type === 'lab' && p.role === 'technician' ? 'teknisyen' :
        p.user_type === 'lab'          ? 'lab'       : null;
      if (panel) {
        try { window.localStorage.setItem('lastPanel', panel); } catch { /* noop */ }
      }
    }
  },
  setLoading: (loading) => set({ loading }),

  fetchProfile: async (userId: string) => {
    try {
      // 5sn timeout tek başına profili kalıcı düşürüyordu (yanlış panel).
      // Timeout/boş sonuçta backoff'lu 2 tekrar daha dene.
      const TIMED_OUT = Symbol('timeout');
      const attemptOnce = async (timeoutMs: number): Promise<Profile | null | typeof TIMED_OUT> => {
        const timeout = new Promise<typeof TIMED_OUT>((resolve) =>
          setTimeout(() => resolve(TIMED_OUT), timeoutMs)
        );
        const query = supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
          .then(({ data }) => data as Profile | null);
        return Promise.race([query, timeout]);
      };

      let data: Profile | null = null;
      for (let i = 0; i < 3; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 1000 * i)); // backoff: 1s, 2s
        const res = await attemptOnce(5000);
        if (res !== TIMED_OUT) { data = res; break; } // yalnız timeout'ta tekrar dene
      }
      if (data) {
        bootMark('profile GELDİ', { user_type: (data as any).user_type, role: (data as any).role });
        set({ profile: data as Profile });
        // Son paneli kalıcı yaz (sonraki açılışta optimistic routing).
        // Kurye hariç (kurye (courier) rotasına gider, optimistic set dışı).
        const p: any = data;
        const lp: PanelKey | null =
          p.user_type === 'admin'                                   ? 'exec'      :
          p.user_type === 'doctor'                                  ? 'doctor'    :
          (p.user_type === 'clinic_admin' || p.user_type === 'clinic_secretary') ? 'klinik' :
          p.user_type === 'lab' && p.role === 'technician'          ? 'teknisyen' :
          p.user_type === 'lab' && p.role === 'courier'             ? null        :
          p.user_type === 'lab'                                     ? 'lab'       : null;
        if (lp) useLastPanelStore.getState().setPanel(lp);
      }
    } catch (_) {
      // sessizce geç
    } finally {
      bootMark('loading=false');
      set({ loading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  },
}));
