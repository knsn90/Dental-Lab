/**
 * perfMonitor — Basit FPS sayacı + auto-quality drop yöneticisi.
 *
 * Render loop'un içinden tick() çağrılır, her saniye bir kez FPS hesaplar.
 * Düşük FPS'te (30 altı) auto-quality drop için onLowFps callback'i tetiklenir.
 */
import * as THREE from 'three';

export interface PerfStats {
  fps: number;
  triCount: number;
  meshCount: number;
}

export function createPerfMonitor(opts: {
  onUpdate: (stats: PerfStats) => void;
  onLowFps?: () => void;
  lowFpsThreshold?: number;
  lowFpsDuration?: number; // ms
}) {
  const threshold = opts.lowFpsThreshold ?? 30;
  const duration = opts.lowFpsDuration ?? 2000;

  let frames = 0;
  let lastSample = performance.now();
  let lowSince: number | null = null;
  let lowFpsTriggered = false;
  let triCount = 0;
  let meshCount = 0;

  return {
    /** Her frame çağırılmalı */
    tick() {
      frames++;
      const now = performance.now();
      const dt = now - lastSample;
      if (dt < 500) return;
      const fps = Math.round((frames * 1000) / dt);
      frames = 0;
      lastSample = now;
      opts.onUpdate({ fps, triCount, meshCount });

      if (fps < threshold) {
        if (lowSince == null) lowSince = now;
        else if (!lowFpsTriggered && now - lowSince > duration) {
          lowFpsTriggered = true;
          opts.onLowFps?.();
        }
      } else {
        lowSince = null;
        lowFpsTriggered = false;
      }
    },
    /** Mesh değişiminde çağırılmalı — tri sayımı yeniler. */
    refreshSceneStats(group: THREE.Object3D) {
      let tris = 0; let count = 0;
      group.traverse((c) => {
        const m = c as THREE.Mesh;
        const isPoints = (c as any).isPoints === true;
        if ((m.isMesh || isPoints) && m.geometry) {
          count++;
          const g = m.geometry;
          if (isPoints) { /* nokta bulutu — üçgen yok */ }
          else if (g.index) tris += g.index.count / 3;
          else if (g.attributes.position) tris += g.attributes.position.count / 3;
        }
      });
      triCount = Math.round(tris);
      meshCount = count;
    },
  };
}

/**
 * downsampleGeometry — Büyük geometrileri vertex stride ile küçült.
 * Düz/tess'siz decimation; SimplifyModifier'dan çok hızlı (1-2 ms) ama daha kaba.
 * Sadece çok büyük dosyalar için (>5M triangle).
 */
export function downsampleGeometry(geom: THREE.BufferGeometry, targetTris: number): THREE.BufferGeometry {
  const pos = geom.attributes.position;
  if (!pos) return geom;
  const currentTris = geom.index ? geom.index.count / 3 : pos.count / 3;
  if (currentTris <= targetTris) return geom;
  const stride = Math.ceil(currentTris / targetTris);
  if (stride <= 1) return geom;

  // Indexed geometry için: index'i seyrelt
  if (geom.index) {
    const idx = geom.index;
    const newIdx: number[] = [];
    for (let i = 0; i < idx.count; i += stride * 3) {
      if (i + 2 < idx.count) {
        newIdx.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
      }
    }
    geom.setIndex(newIdx);
  } else {
    // Non-indexed: position'u seyrelt
    const arr = pos.array as Float32Array;
    const triCount = pos.count / 3;
    const newPositions: number[] = [];
    for (let t = 0; t < triCount; t += stride) {
      for (let v = 0; v < 3; v++) {
        const off = (t * 3 + v) * 3;
        newPositions.push(arr[off], arr[off + 1], arr[off + 2]);
      }
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    geom.computeVertexNormals();
  }
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}
