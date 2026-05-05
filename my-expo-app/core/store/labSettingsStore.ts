/**
 * labSettingsStore — Lab-wide settings (Zustand)
 * ────────────────────────────────────────────────
 * Supabase lab_settings tablosunu okur/yazar.
 * Tüm panellerde paylaşılan genel + lab ayarları.
 */
import { create } from 'zustand';
import { supabase } from '../api/supabase';

// ── Types ───────────────────────────────────────────────────────────────
export type CurrencyCode = 'TRY' | 'USD' | 'EUR' | 'GBP';
export type WeekStart = 'monday' | 'sunday';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface LabSettings {
  id: string;
  lab_id: string;

  // Genel
  default_currency: CurrencyCode;
  week_start: WeekStart;
  theme_mode: ThemeMode;

  // Lab'a özel
  order_prefix: string;
  default_tax_rate: number;
  working_hours_start: string;
  working_hours_end: string;
  auto_logout_minutes: number;
  items_per_page: number;

  created_at: string;
  updated_at: string;
}

// ── Defaults ────────────────────────────────────────────────────────────
const DEFAULTS: Omit<LabSettings, 'id' | 'lab_id' | 'created_at' | 'updated_at'> = {
  default_currency: 'TRY',
  week_start: 'monday',
  theme_mode: 'light',
  order_prefix: 'LAB',
  default_tax_rate: 20,
  working_hours_start: '08:00',
  working_hours_end: '18:00',
  auto_logout_minutes: 0,
  items_per_page: 50,
};

// ── Store ───────────────────────────────────────────────────────────────
interface LabSettingsState {
  settings: LabSettings | null;
  loading: boolean;
  saving: boolean;

  load: () => Promise<void>;
  update: (patch: Partial<LabSettings>) => Promise<boolean>;
}

export const useLabSettingsStore = create<LabSettingsState>((set, get) => ({
  settings: null,
  loading: false,
  saving: false,

  load: async () => {
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('lab_settings')
        .select('*')
        .limit(1)
        .single();
      if (!error && data) {
        set({ settings: data as LabSettings });
      }
    } catch (_) {}
    finally { set({ loading: false }); }
  },

  update: async (patch) => {
    const current = get().settings;
    if (!current) return false;

    set({ saving: true });
    try {
      const { data, error } = await supabase
        .from('lab_settings')
        .update(patch)
        .eq('id', current.id)
        .select()
        .single();
      if (!error && data) {
        set({ settings: data as LabSettings });
        return true;
      }
      return false;
    } catch (_) { return false; }
    finally { set({ saving: false }); }
  },
}));
