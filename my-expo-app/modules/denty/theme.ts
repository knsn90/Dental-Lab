/**
 * useDentyPalette — Denty asistanına özel SABİT marka kimliği (mavi/teal),
 * panelden bağımsız. Premium light + dark yüzeyler.
 *
 * Yalnızca SUNUM katmanı: renk tokenları. İş mantığı / API yok.
 *
 *   Primary   #6EA8FE   ·  Secondary (accent2) #00C2A8
 *   bg #FCFCFD · surface #FFFFFF · text #111 · muted #8A8A8A · border #F2F2F2
 */
import { useThemeModeStore } from '../../core/store/themeModeStore';

export interface DentyPalette {
  bg: string;
  surface: string;
  surface2: string;
  primary: string;
  primaryDeep: string;
  accent2: string;
  /** ink / ana metin rengi (eski usePanelTheme.accent ile uyumlu) */
  accent: string;
  muted: string;
  border: string;
  dark: boolean;
}

const LIGHT: DentyPalette = {
  bg: '#FCFCFD',
  surface: '#FFFFFF',
  surface2: '#F6F7F9',
  primary: '#6EA8FE',
  primaryDeep: '#4F8EF7',
  accent2: '#00C2A8',
  accent: '#111111',
  muted: '#8A8A8A',
  border: '#F2F2F2',
  dark: false,
};

const DARK: DentyPalette = {
  bg: '#0B0D12',
  surface: '#14171D',
  surface2: '#1B1F27',
  primary: '#6EA8FE',
  primaryDeep: '#8CBCFF',
  accent2: '#2AD6C0',
  accent: '#F3F5F8',
  muted: '#8A92A1',
  border: 'rgba(255,255,255,0.09)',
  dark: true,
};

export function useDentyPalette(): DentyPalette {
  const dark = useThemeModeStore((s) => s.resolvedDark);
  return dark ? DARK : LIGHT;
}
