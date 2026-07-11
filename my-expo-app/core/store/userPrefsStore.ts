/**
 * userPrefsStore — Kullanıcı tercih ayarları (per-user, per-device).
 *
 *   • Tarih formatı (dd.MM.yyyy | MM/dd/yyyy | yyyy-MM-dd)
 *   • Saat formatı (24h | 12h)
 *   • Hekim unvanı (Dr. / Diş Hekimi / Prof. Dr. ...)
 *   • Varsayılan laboratuvar (id) — yeni sipariş açarken otomatik seçili
 *
 *   AsyncStorage'da saklanır (web: localStorage, native: native KV).
 *   Lab-bağımsız: doktor/klinik kullanıcısı kendi tercihlerini tutar.
 *
 *   Kullanım:
 *     const dateFmt = useUserPrefsStore(s => s.date_format);
 *     const setPref = useUserPrefsStore(s => s.setPref);
 *     setPref('date_format', 'dd.MM.yyyy');
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DateFormat = 'dd.MM.yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd';
export type TimeFormat = '24h' | '12h';

export interface UserPrefs {
  date_format:   DateFormat;
  time_format:   TimeFormat;
  doctor_title:  string;          // Dr. / Diş Hekimi / Prof. Dr. — boş olabilir
  default_lab_id: string | null;
}

const DEFAULTS: UserPrefs = {
  date_format:    'dd.MM.yyyy',
  time_format:    '24h',
  doctor_title:   '',
  default_lab_id: null,
};

const STORAGE_KEY = 'labflow_user_prefs_v1';

interface UserPrefsState extends UserPrefs {
  hydrated: boolean;
  setPref:  <K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) => Promise<void>;
  hydrate:  () => Promise<void>;
}

export const useUserPrefsStore = create<UserPrefsState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  setPref: async (key, value) => {
    set({ [key]: value } as any);
    try {
      const current = { ...get(), [key]: value };
      // Don't persist 'hydrated' flag
      const { hydrated: _h, setPref: _s, hydrate: _hy, ...payload } = current as any;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch { /* sessiz */ }
  },

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<UserPrefs>;
        set({ ...DEFAULTS, ...parsed, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },
}));

// ── Format helpers ──────────────────────────────────────────────────

export function formatDate(d: Date | string, format: DateFormat): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  switch (format) {
    case 'MM/dd/yyyy': return `${mm}/${dd}/${yyyy}`;
    case 'yyyy-MM-dd': return `${yyyy}-${mm}-${dd}`;
    case 'dd.MM.yyyy':
    default:           return `${dd}.${mm}.${yyyy}`;
  }
}

export function formatTime(d: Date | string, format: TimeFormat): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  const h24 = date.getHours();
  const mm  = String(date.getMinutes()).padStart(2, '0');
  if (format === '12h') {
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12  = ((h24 + 11) % 12) + 1;
    return `${h12}:${mm} ${ampm}`;
  }
  return `${String(h24).padStart(2, '0')}:${mm}`;
}
