// modules/occlusion/utils/colorScale.ts
// PROTOTIPTEN TAŞINDI: app/scene.jsx → Palettes objesi
// OKLCH→sRGB dönüşümü: canvas tabanlı (browser native, culori dep'i yok)

import * as THREE from 'three';
import type { HeatmapConfig, PaletteName } from '../types/occlusion';
export type { HeatmapConfig, PaletteName };
export { DEFAULT_HEATMAP_CONFIG } from '../types/occlusion';

// ─── RGB tuple ──────────────────────────────────────────────
type RGB = { r: number; g: number; b: number };

// ─── Canvas-tabanlı OKLCH → sRGB ────────────────────────────
// Tarayıcı CSS motor'unu kullanarak dönüştürür; cache'li, sadece ilk çağrıda
// bir canvas/ctx oluşturur. SSR-safe (typeof document guard).
let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;
const _cache = new Map<string, RGB>();

function getCtx(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!_canvas) {
    _canvas = document.createElement('canvas');
    _canvas.width = 1;
    _canvas.height = 1;
    _ctx = _canvas.getContext('2d');
  }
  return _ctx;
}

function oklchToRgb(l: number, c: number, h: number): RGB {
  const key = `${l.toFixed(4)},${c.toFixed(4)},${h.toFixed(2)}`;
  if (_cache.has(key)) return _cache.get(key)!;

  const ctx = getCtx();
  if (!ctx) {
    // SSR fallback — approximate medikal mid-green
    return { r: 0.58, g: 0.85, b: 0.55 };
  }

  const css = `oklch(${l} ${c} ${h})`;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000000';   // reset
  ctx.fillStyle = css;         // set target
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  const rgb: RGB = {
    r: data[0] / 255,
    g: data[1] / 255,
    b: data[2] / 255,
  };
  _cache.set(key, rgb);
  return rgb;
}

function lerpOklch(
  l1: number, c1: number, h1: number,
  l2: number, c2: number, h2: number,
  t: number,
): RGB {
  return oklchToRgb(
    l1 + (l2 - l1) * t,
    c1 + (c2 - c1) * t,
    h1 + (h2 - h1) * t,
  );
}

// ─── Palettes ───────────────────────────────────────────────
// Medikal: kırmızı penetrasyon → yeşil temas → sarı yakın → mavi uzak
// Termal:  siyah → kırmızı → turuncu → sarı → beyaz
// Viridis: mor → mavi → teal → sarı-yeşil (renk körlüğü güvenli)

const Palettes: Record<PaletteName, (d: number, maxD: number) => RGB> = {
  medical: (d, maxD) => {
    if (d < 0) {
      const t = Math.min(1, Math.abs(d) / 0.5);
      return lerpOklch(0.68, 0.2, 30, 0.5, 0.22, 20, t);
    }
    if (d < 0.1)  return oklchToRgb(0.58, 0.15, 150);   // koyu yeşil — ideal temas
    if (d < 0.5)  return oklchToRgb(0.72, 0.15, 140);   // açık yeşil
    if (d < 1.5)  return oklchToRgb(0.85, 0.14, 100);   // sarı
    if (d < maxD) {
      const t = (d - 1.5) / (maxD - 1.5);
      return lerpOklch(0.85, 0.14, 100, 0.55, 0.15, 240, t);
    }
    return oklchToRgb(0.45, 0.12, 260);   // koyu mavi
  },

  thermal: (d, maxD) => {
    if (d < 0) return oklchToRgb(0.5, 0.22, 20);
    const t = Math.min(1, d / maxD);
    if (t < 0.25) return lerpOklch(0.2, 0.05, 30,  0.5,  0.2,  30,  t / 0.25);
    if (t < 0.5)  return lerpOklch(0.5, 0.2,  30,  0.7,  0.2,  60,  (t - 0.25) / 0.25);
    if (t < 0.75) return lerpOklch(0.7, 0.2,  60,  0.88, 0.18, 90,  (t - 0.5)  / 0.25);
    return             lerpOklch(0.88, 0.18, 90,  0.97, 0.02, 90,  (t - 0.75) / 0.25);
  },

  colorblind: (d, maxD) => {
    if (d < 0) return oklchToRgb(0.55, 0.18, 20);
    const t = Math.min(1, d / maxD);
    if (t < 0.33) return lerpOklch(0.28, 0.1,  290, 0.45, 0.14, 240, t / 0.33);
    if (t < 0.66) return lerpOklch(0.45, 0.14, 240, 0.65, 0.14, 180, (t - 0.33) / 0.33);
    return             lerpOklch(0.65, 0.14, 180, 0.88, 0.18, 110, (t - 0.66) / 0.34);
  },
};

// ─── Public API ─────────────────────────────────────────────

/** Tek bir mesafe değeri için THREE.Color döndürür. */
export function colorFromDistance(distance: number, config: HeatmapConfig): THREE.Color {
  const rgb = Palettes[config.palette](distance, config.maxDistance);
  return new THREE.Color(rgb.r, rgb.g, rgb.b);
}

/**
 * Tüm lower mesh vertex'lerinin vertex color buffer'ını heatmap renkleriyle doldurur.
 * geometry.getAttribute('color') attribute'u yoksa oluşturur.
 */
export function fillHeatmapColors(
  colorArray: Float32Array,
  distances: Float32Array,
  config: HeatmapConfig,
): void {
  const fn = Palettes[config.palette];
  for (let i = 0; i < distances.length; i++) {
    const rgb = fn(distances[i], config.maxDistance);
    colorArray[i * 3]     = rgb.r;
    colorArray[i * 3 + 1] = rgb.g;
    colorArray[i * 3 + 2] = rgb.b;
  }
}

/** Görsel legend için N tane renk döndürür. */
export function buildLegendGradient(config: HeatmapConfig, steps = 64): string[] {
  const fn = Palettes[config.palette];
  const out: string[] = [];
  // -0.5 mm penetrasyon'dan maxDistance'a kadar
  const lo = -0.5;
  const hi = config.maxDistance;
  for (let i = 0; i < steps; i++) {
    const d = lo + (hi - lo) * (i / (steps - 1));
    const rgb = fn(d, config.maxDistance);
    out.push(
      `rgb(${Math.round(rgb.r * 255)},${Math.round(rgb.g * 255)},${Math.round(rgb.b * 255)})`,
    );
  }
  return out;
}

/** Cache'i temizle (belllek baskısı durumunda). */
export function clearColorCache(): void {
  _cache.clear();
}
