// modules/delivery/proof/signatureInk.ts — imza alanının web/native ortak parçaları.
import type { ProofAsset } from './api';

/** İmza "kâğıdı": iki temada da açık zemin + koyu mürekkep (dışa aktarılan PNG her yerde okunur). */
export const PAPER = '#FAFAF7';
export const INK = '#1A1A1A';

export type Pt = { x: number; y: number; t: number; w: number };

export interface SignaturePadProps {
  disabled?: boolean;
  onChange: (hasInk: boolean) => void;
  /** Çizim başlar/biter — native'de pencerenin ScrollView'u bu arada kilitlenir (çizgi kesilmesin). */
  onDrawStart?: () => void;
  onDrawEnd?: () => void;
  height?: number;
}

export interface SignaturePadHandle {
  /** Siler; son çizim "Geri al" için saklanır. */
  clear(): void;
  /** Son silineni geri getirir; yoksa false. */
  restore(): boolean;
  /** PNG (web: Blob, native: data:image/png;base64 uri); çizim yoksa null. */
  toAsset(): Promise<ProofAsset | null>;
}

/** Hıza göre kalınlık: yavaş → 3.2, hızlı → 1.3; bir önceki noktayla yumuşatılır. */
export function nextPoint(x: number, y: number, t: number, prev?: Pt): Pt {
  let w = 2.6;
  if (prev) {
    const speed = Math.hypot(x - prev.x, y - prev.y) / Math.max(1, t - prev.t);
    w = Math.max(1.3, Math.min(3.2, 3.2 - speed * 1.1));
    w = prev.w * 0.6 + w * 0.4;
  }
  return { x, y, t, w };
}

/** Noktalardan orta-nokta karesel eğri yolu (native SVG çizimi için). */
export function strokePath(st: Pt[]): string {
  if (!st.length) return '';
  if (st.length === 1) return `M ${st[0].x} ${st[0].y} l 0.01 0`;
  let d = `M ${st[0].x} ${st[0].y}`;
  for (let i = 1; i < st.length; i++) {
    const a = st[i - 1], b = st[i];
    d += ` Q ${a.x} ${a.y} ${(a.x + b.x) / 2} ${(a.y + b.y) / 2}`;
  }
  return d;
}
