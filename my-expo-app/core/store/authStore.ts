import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { Profile } from '../../lib/types';
import { supabase } from '../api/supabase';

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

  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),

  fetchProfile: async (userId: string) => {
    try {
      const timeout = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 5000)
      );
      const query = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
        .then(({ data }) => data);

      const data = await Promise.race([query, timeout]);
      if (data) set({ profile: data as Profile });
    } catch (_) {
      // sessizce geç
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  },
}));
