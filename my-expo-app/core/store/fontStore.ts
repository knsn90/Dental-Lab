import { Platform } from 'react-native';
import { create } from 'zustand';

// ── Font size options ─────────────────────────────────────────────────
export interface FontSizeOption {
  key: 'small' | 'normal' | 'large' | 'xlarge';
  label: string;
  scale: number;       // CSS zoom scale applied to <html>
  previewSize: number; // px used in picker card preview only
}

export const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  { key: 'small',  label: 'Küçük',     scale: 0.90, previewSize: 13 },
  { key: 'normal', label: 'Normal',    scale: 1.00, previewSize: 16 },
  { key: 'large',  label: 'Büyük',     scale: 1.10, previewSize: 20 },
  { key: 'xlarge', label: 'Çok Büyük', scale: 1.20, previewSize: 24 },
];

const DEFAULT_SIZE_KEY: FontSizeOption['key'] = 'normal';
const SIZE_STORAGE_KEY = 'dental_app_fontsize_v1';

function getSizeByKey(key: string): FontSizeOption {
  return FONT_SIZE_OPTIONS.find((s) => s.key === key) ??
         FONT_SIZE_OPTIONS.find((s) => s.key === DEFAULT_SIZE_KEY)!;
}

function readSavedSize(): FontSizeOption {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(SIZE_STORAGE_KEY);
    if (saved) return getSizeByKey(saved);
  }
  return getSizeByKey(DEFAULT_SIZE_KEY);
}

// ── Web: apply font size (CSS zoom on <html>) ─────────────────────────
export function applyFontSizeWeb(size: FontSizeOption) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  let style = document.getElementById('app-fontsize-override') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'app-fontsize-override';
    document.head.appendChild(style);
  }
  style.textContent = `html { zoom: ${size.scale}; }`;
}

// ── Zustand store ─────────────────────────────────────────────────────
interface FontState {
  fontSize: FontSizeOption;
  setFontSize: (size: FontSizeOption) => void;
}

export const useFontStore = create<FontState>((set) => ({
  fontSize: readSavedSize(),

  setFontSize: (size) => {
    set({ fontSize: size });
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(SIZE_STORAGE_KEY, size.key);
    }
    applyFontSizeWeb(size);
  },
}));
