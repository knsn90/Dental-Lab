import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { FaceScanResult } from './ArScanner.types';

export type { FaceScanResult };

// iOS-only modül; diğer platformlarda no-op stub
type ArScannerNative = {
  isSupported(): boolean;
  isObjectCaptureSupported(): boolean;
  isFrontScanSupported(): boolean;
  startScan(): Promise<FaceScanResult | null>;
  startFrontScan(): Promise<FaceScanResult | null>;
  startGuidedRearScan(): Promise<FaceScanResult | null>;
};

export type ScanMode = 'rear' | 'front' | 'rearGuided';

const native: ArScannerNative | null = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    return requireNativeModule<ArScannerNative>('ArScanner');
  } catch {
    // Dev client'a modul henüz eklenmediyse Expo Go gibi durumlarda
    return null;
  }
})();

/**
 * Cihaz 3D yüz tarama destekliyor mu?
 * - iOS + TrueDepth ön kamera (iPhone X ve sonrası): true
 * - Diğer her şey: false
 */
export function isSupported(): boolean {
  if (!native) return false;
  return native.isSupported();
}

/**
 * Modal AR yüz tarama ekranını aç.
 * - Kullanıcı "Yakala" derse: dosya path'lerini döner
 * - Kullanıcı "Vazgeç" derse: null döner
 * - Cihaz desteklemiyor / hata: throw
 */
export async function startScan(): Promise<FaceScanResult | null> {
  if (!native) {
    throw new Error('3D yüz tarama sadece iOS\'ta (TrueDepth\'li iPhone) desteklenir.');
  }
  return native.startScan();
}

/** Object Capture (LiDAR, arka kamera) cihazda var mı? */
export function isObjectCaptureSupported(): boolean {
  if (!native) return false;
  try { return native.isObjectCaptureSupported(); } catch { return false; }
}

/** Ön kamera (TrueDepth) rehberli tarama var mı? */
export function isFrontScanSupported(): boolean {
  if (!native) return false;
  try { return native.isFrontScanSupported(); } catch { return false; }
}

/**
 * Mod seçimli tarama:
 * - 'rear'  → Object Capture (LiDAR/arka kamera) varsa, yoksa TrueDepth fallback
 * - 'front' → Ön kamera rehberli tarama (Faz 1)
 */
export async function startScanMode(mode: ScanMode): Promise<FaceScanResult | null> {
  if (!native) {
    throw new Error('3D yüz tarama sadece iOS\'ta desteklenir.');
  }
  switch (mode) {
    case 'front':      return native.startFrontScan();
    case 'rearGuided': return native.startGuidedRearScan();
    default:           return native.startScan();
  }
}
