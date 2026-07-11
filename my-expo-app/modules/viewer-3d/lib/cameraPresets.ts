/**
 * cameraPresets — Dental klinik kamera açıları.
 *
 * PCA auto-orient sonrası dünya eksenleri:
 *   • Y+ = oklüzal yukarı (maxilla yönü)
 *   • Y- = oklüzal aşağı (mandible yönü)
 *   • Z+ = ön (anterior — kesici dişler)
 *   • Z- = arka (posterior — molarlar)
 *   • X+ = sağ
 *   • X- = sol
 */
import * as THREE from 'three';

export type CameraPreset =
  | 'frontal'    // Ön — anterior estetik bakış
  | 'occlusal'   // Oklüzal — yukarıdan diş yüzeyleri
  | 'left'       // Sol bukkal
  | 'right'      // Sağ bukkal
  | 'upper'      // Sadece üst çene — alttan bakış (palatal/oklüzal)
  | 'lower'      // Sadece alt çene — üstten bakış (oklüzal)
  | 'iso'        // İzometrik — 3/4 görünüm
  // Eski aliaslar (geri uyumluluk)
  | 'default' | 'top' | 'bottom' | 'front' | 'back';

export interface PresetConfig {
  key: CameraPreset;
  label: string;
  /** Normalize edilmiş yön vektörü — kamera hedef'ten bu yönde uzaklaştırılır. */
  dir: [number, number, number];
  /** Kameranın "yukarı" vektörü (roll için). */
  up: [number, number, number];
}

export const PRESETS: PresetConfig[] = [
  { key: 'frontal',  label: 'Önden',       dir: [0, 0, 1],     up: [0, 1, 0]  },
  { key: 'occlusal', label: 'Oklüzal',     dir: [0, 1, 0.001], up: [0, 0, -1] },
  { key: 'left',     label: 'Sol Bukkal',  dir: [-1, 0, 0],    up: [0, 1, 0]  },
  { key: 'right',    label: 'Sağ Bukkal',  dir: [1, 0, 0],     up: [0, 1, 0]  },
  { key: 'upper',    label: 'Üst Çene',    dir: [0, -1, 0.001],up: [0, 0, 1]  },
  { key: 'lower',    label: 'Alt Çene',    dir: [0, 1, 0.001], up: [0, 0, -1] },
  { key: 'iso',      label: 'İzometrik',   dir: [1, 0.7, 1],   up: [0, 1, 0]  },
];

// Geri uyumluluk için eski isimleri map'le
const ALIAS: Record<string, CameraPreset> = {
  default: 'frontal',
  front: 'frontal',
  back: 'frontal', // arka için iso'ya çevir
  top: 'occlusal',
  bottom: 'lower',
};

/**
 * Smooth tween: mevcut kamera pozisyonu/up'ı hedefe `duration` ms'de geçir.
 * onUpdate her frame'de çağrılır (controls.update için).
 */
export function applyPresetSmooth(
  preset: CameraPreset,
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  controls: any,
  duration = 480,
) {
  const resolvedKey = ALIAS[preset as string] ?? preset;
  const cfg = PRESETS.find((p) => p.key === resolvedKey);
  if (!cfg) return;

  const dist = camera.position.distanceTo(target);
  const fromPos = camera.position.clone();
  const fromUp  = camera.up.clone();
  const dir = new THREE.Vector3(cfg.dir[0], cfg.dir[1], cfg.dir[2]).normalize();
  const toPos = target.clone().addScaledVector(dir, dist);
  const toUp  = new THREE.Vector3(cfg.up[0], cfg.up[1], cfg.up[2]).normalize();

  // Eski preset için arka (back) özel davranış: dir = [0,0,-1]
  if ((preset as string) === 'back') {
    toPos.copy(target).addScaledVector(new THREE.Vector3(0, 0, -1), dist);
  }

  const start = performance.now();
  const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
  function step() {
    const k = Math.min(1, (performance.now() - start) / duration);
    const e = ease(k);
    camera.position.lerpVectors(fromPos, toPos, e);
    camera.up.copy(fromUp).lerp(toUp, e).normalize();
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (typeof controls?.update === 'function') controls.update();
    if (k < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/** Geri uyumluluk — anında uygula (tween yok). */
export function applyPreset(
  preset: CameraPreset,
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
) {
  const resolvedKey = ALIAS[preset as string] ?? preset;
  const cfg = PRESETS.find((p) => p.key === resolvedKey);
  if (!cfg) return;
  const currentDist = camera.position.distanceTo(target);
  const dir = new THREE.Vector3(cfg.dir[0], cfg.dir[1], cfg.dir[2]).normalize();
  camera.position.copy(target).addScaledVector(dir, currentDist);
  camera.up.set(cfg.up[0], cfg.up[1], cfg.up[2]);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}
