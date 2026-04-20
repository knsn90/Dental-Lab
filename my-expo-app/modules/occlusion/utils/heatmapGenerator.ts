// modules/occlusion/utils/heatmapGenerator.ts
// Vertex color buffer'ı heatmap renkleriyle doldurur.
// Prototip: app/scene.jsx applyHeatmapColors()

import * as THREE from 'three';
import { fillHeatmapColors } from './colorScale';
import type { HeatmapConfig } from '../types/occlusion';

// Varsayılan diş rengi — heatmap kapalıyken kullanılır
const TOOTH_COLOR = { r: 0.92, g: 0.89, b: 0.82 };

/**
 * geometry'nin vertex color attribute'unu heatmap renkleriyle günceller.
 * geometry.getAttribute('color') yoksa oluşturur.
 *
 * @param geometry    Lower jaw geometry
 * @param distances   computeMeshDistance() çıktısı
 * @param config      Palette + maxDistance
 * @param enabled     false → tooth color'a reset
 */
export function applyHeatmapColors(
  geometry: THREE.BufferGeometry,
  distances: Float32Array,
  config: HeatmapConfig,
  enabled = true,
): void {
  const count = distances.length;

  // Color attribute al veya oluştur
  let colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!colorAttr) {
    const arr = new Float32Array(count * 3);
    colorAttr = new THREE.BufferAttribute(arr, 3);
    geometry.setAttribute('color', colorAttr);
  }

  const arr = colorAttr.array as Float32Array;

  if (!enabled) {
    // Heatmap kapalı → düz diş rengi
    for (let i = 0; i < count; i++) {
      arr[i * 3]     = TOOTH_COLOR.r;
      arr[i * 3 + 1] = TOOTH_COLOR.g;
      arr[i * 3 + 2] = TOOTH_COLOR.b;
    }
  } else {
    fillHeatmapColors(arr, distances, config);
  }

  colorAttr.needsUpdate = true;
}

/**
 * Material'ı vertex colors için hazırlar.
 * MeshPhongMaterial/MeshStandardMaterial üzerinde vertexColors toggle.
 */
export function toggleVertexColors(
  material: THREE.Material,
  enabled: boolean,
): void {
  const mat = material as THREE.MeshPhongMaterial | THREE.MeshStandardMaterial;
  mat.vertexColors = enabled;
  mat.needsUpdate  = true;
}

/**
 * Upper jaw opacity ayarı.
 */
export function setUpperOpacity(mesh: THREE.Mesh, opacity: number): void {
  const mat = mesh.material as THREE.MeshPhongMaterial;
  const transparent = opacity < 1;
  mat.transparent = transparent;
  mat.opacity     = opacity;
  mat.needsUpdate = true;
  mesh.visible    = opacity > 0.01;
}

/**
 * Canvas'tan base64 PNG snapshot — rapor için.
 */
export function captureSnapshot(renderer: THREE.WebGLRenderer): string {
  return renderer.domElement.toDataURL('image/png');
}
