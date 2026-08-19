/**
 * labSettingsStore — Lab-wide settings (Zustand)
 * ────────────────────────────────────────────────
 * Supabase lab_settings tablosunu okur/yazar.
 * Tüm panellerde paylaşılan genel + lab ayarları.
 */
import { create } from 'zustand';
import type { Currency } from '../money/currency';
import { supabase } from '../api/supabase';
import { applyLabRegionDefaults, setLabWeekStart } from '../i18n';

// ── Types ───────────────────────────────────────────────────────────────
export type CurrencyCode = Currency;
export type WeekStart = 'auto' | 'monday' | 'saturday' | 'sunday';
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Lab mevzuat bölgesi. Mevzuata bağlı özellikler tek yerden buradan çözülür:
 *   TR → e-Fatura + iyzico açık, %20 KDV
 *   IR → ikisi de kapalı (Türkiye'ye özgü), %10 KDV
 * Para biriminden TÜRETİLMEZ: Tümen kullanan Türk lab ya da EUR ile çalışan
 * İran labı mümkün; iki kavram ayrı tutulur.
 */
export type LabRegion = 'TR' | 'IR';

export interface LabSettings {
  id: string;
  lab_id: string;

  // Genel
  region: LabRegion;
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
  region: 'TR',
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
        const st = data as LabSettings;
        set({ settings: st });
        // Bölge → dil + takvim varsayılanı. Açık kullanıcı tercihini EZMEZ.
        void applyLabRegionDefaults(st.region ?? 'TR');
        setLabWeekStart(st.week_start ?? 'auto');
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
        const st = data as LabSettings;
        set({ settings: st });
        if (patch.region) void applyLabRegionDefaults(st.region ?? 'TR');
        if (patch.week_start) setLabWeekStart(st.week_start ?? 'auto');
        return true;
      }
      return false;
    } catch (_) { return false; }
    finally { set({ saving: false }); }
  },
}));

// ── Bölge yardımcıları ──────────────────────────────────────────────────
//
// Mevzuata bağlı özellikleri TEK yerden çözer. Ayarlar yüklenmemişken 'TR'
// döner — varsayılan davranış korunur, Türk labları hiçbir şey fark etmez.

/** Aktif labın mevzuat bölgesi. */
export function useLabRegion(): LabRegion {
  return useLabSettingsStore(s => s.settings?.region ?? 'TR');
}

/**
 * e-Fatura (Türk mevzuatı) ve iyzico (Türk ödeme sağlayıcısı) yalnız TR'de
 * anlamlı. İran labında bu ekranları göstermek yanıltıcı olur — kullanıcı
 * kullanamayacağı bir entegrasyonu kurmaya çalışır.
 */
export function useTurkeyOnlyFeatures(): boolean {
  return useLabRegion() === 'TR';
}

/** Bölgeye göre varsayılan KDV oranı — TR %20, IR %10. */
export function defaultTaxRateFor(region: LabRegion): number {
  return region === 'IR' ? 10 : 20;
}
