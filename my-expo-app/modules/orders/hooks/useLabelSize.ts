/**
 * İş emri etiketinin kağıt boyutu (A4/A5/A6) — son seçim cihazda hatırlanır.
 *
 * Yazdırma yalnız web'de olduğu için localStorage yeterli. Gizli pencere /
 * engellenmiş depolama erişimi atabilir; o durumda varsayılanla devam edilir.
 */
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { type LabelSize, LABEL_SIZE_STORAGE_KEY, readLabelSize, DEFAULT_LABEL_SIZE } from '../lib/workLabel';

export function loadLabelSize(): LabelSize {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return DEFAULT_LABEL_SIZE;
  try { return readLabelSize(window.localStorage.getItem(LABEL_SIZE_STORAGE_KEY)); }
  catch { return DEFAULT_LABEL_SIZE; }
}

export function useLabelSize(): [LabelSize, (s: LabelSize) => void] {
  const [size, setSize] = useState<LabelSize>(loadLabelSize);
  const update = useCallback((s: LabelSize) => {
    setSize(s);
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try { window.localStorage.setItem(LABEL_SIZE_STORAGE_KEY, s); } catch { /* depolama kapalı — yalnız bu oturum */ }
  }, []);
  return [size, update];
}
