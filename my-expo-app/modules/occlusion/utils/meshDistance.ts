// modules/occlusion/utils/meshDistance.ts
// BVH-hızlandırılmış vertex-to-mesh mesafe hesaplama
// Referans: handoff/code/meshDistance.ts + app/scene.jsx runAnalysis()

import * as THREE from 'three';
import {
  MeshBVH,
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from 'three-mesh-bvh';

// Three.js prototype'larını genişlet — uygulama root'unda bir kez çağrılır.
// Bu dosya import edildiğinde otomatik olarak yapılır.
(THREE.Mesh.prototype as any).raycast = acceleratedRaycast;
(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;

export interface DistanceOptions {
  maxDistance?: number;           // default 5 mm — clamp üst sınırı
  sampleStride?: number;          // default 1 = her vertex; 2 = her 2. vertex (hız/doğruluk trade-off)
  onProgress?: (pct: number) => void;
}

/**
 * Alt çenenin her vertex'i için üst çeneye olan mesafeyi (mm) hesaplar.
 *
 * Pozitif  → boşluk (normal oklüzyon)
 * Negatif  → penetrasyon (vertex, üst mesh yüzeyin içinde)
 *
 * Algoritma:
 *  1) Dikey ray (yukarı yönlü) ile hit testi → gap mesafesi
 *  2) Ray miss'te BVH closestPointToPoint → nearest mesafe
 *  3) Normal tabanlı sign: vertex upper mesh'in iç tarafındaysa negatif
 */
export async function computeMeshDistance(
  upperGeometry: THREE.BufferGeometry,
  lowerGeometry: THREE.BufferGeometry,
  upperMeshMatrix: THREE.Matrix4,
  opts: DistanceOptions = {},
): Promise<Float32Array> {
  const { maxDistance = 5, sampleStride = 1, onProgress } = opts;

  // BVH oluştur (yoksa)
  if (!(upperGeometry as any).boundsTree) {
    (upperGeometry as any).computeBoundsTree();
  }
  const bvh: MeshBVH = (upperGeometry as any).boundsTree;

  // Upper mesh için dummy — world transform uygulanmış
  const upperDummy = new THREE.Mesh(upperGeometry, new THREE.MeshBasicMaterial());
  upperDummy.matrixWorld.copy(upperMeshMatrix);
  upperDummy.matrixWorldNeedsUpdate = false;

  const pos = lowerGeometry.getAttribute('position') as THREE.BufferAttribute;
  const count = pos.count;
  const distances = new Float32Array(count).fill(maxDistance);

  const vertex       = new THREE.Vector3();
  const localVertex  = new THREE.Vector3();
  const inverseUpper = upperMeshMatrix.clone().invert();

  // BVH closestPoint target
  const closestTarget = {
    point:     new THREE.Vector3(),
    distance:  0,
    faceIndex: 0,
  };

  // ── Hot loop için direct TypedArray erişimi (allocation-free) ──
  const upperNorm   = upperGeometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const upperIndex  = upperGeometry.index;
  const lowerPosArr = pos.array as Float32Array;
  const upperNormArr = upperNorm ? (upperNorm.array as Float32Array) : null;
  const upperIndexArr = upperIndex ? (upperIndex.array as Uint16Array | Uint32Array) : null;

  // Clamp sınırları
  const maxD = maxDistance;
  const negMaxD = -maxDistance;

  for (let i = 0; i < count; i += sampleStride) {
    const pi = i * 3;
    vertex.set(lowerPosArr[pi], lowerPosArr[pi + 1], lowerPosArr[pi + 2]);

    // Lower vertex'i upper mesh local space'ine taşı
    localVertex.copy(vertex).applyMatrix4(inverseUpper);

    // 1) BVH closestPointToPoint (local space)
    bvh.closestPointToPoint(localVertex, closestTarget as any);

    let d = closestTarget.distance;

    // 2) Sign: face normal ile iç/dış tespiti (allocation-free)
    if (closestTarget.faceIndex >= 0 && upperNormArr) {
      const fi3 = closestTarget.faceIndex * 3;
      const a  = upperIndexArr ? upperIndexArr[fi3]     : fi3;
      const b_ = upperIndexArr ? upperIndexArr[fi3 + 1] : fi3 + 1;
      const c  = upperIndexArr ? upperIndexArr[fi3 + 2] : fi3 + 2;

      const a3 = a * 3, b3 = b_ * 3, c3 = c * 3;
      // 3 vertex normalinin toplamı (normalize gereksiz — sadece dot sign'ı lazım)
      const fnx = upperNormArr[a3]     + upperNormArr[b3]     + upperNormArr[c3];
      const fny = upperNormArr[a3 + 1] + upperNormArr[b3 + 1] + upperNormArr[c3 + 1];
      const fnz = upperNormArr[a3 + 2] + upperNormArr[b3 + 2] + upperNormArr[c3 + 2];

      // toSurface = closestPoint − localVertex (inline dot product)
      const tsx = closestTarget.point.x - localVertex.x;
      const tsy = closestTarget.point.y - localVertex.y;
      const tsz = closestTarget.point.z - localVertex.z;

      // dot < 0 → vertex upper mesh içinde (penetrasyon = negatif)
      if (fnx * tsx + fny * tsy + fnz * tsz < 0) d = -d;
    }

    // Inline clamp (Math.max/min çağrılarından ucuz)
    distances[i] = d > maxD ? maxD : (d < negMaxD ? negMaxD : d);

    if (onProgress && i % 20000 === 0) {
      onProgress(i / count);
      // Async yield — UI'yı dondurmamak için (seyrek)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  // Stride > 1 ise aralar interpolasyonla doldur
  if (sampleStride > 1) {
    for (let i = 0; i < count; i++) {
      if (i % sampleStride !== 0) {
        const prev = Math.floor(i / sampleStride) * sampleStride;
        const next = Math.min(count - 1, prev + sampleStride);
        const t = (i - prev) / sampleStride;
        distances[i] = distances[prev] * (1 - t) + distances[next] * t;
      }
    }
  }

  if (onProgress) onProgress(1);
  return distances;
}

/** BVH cleanup — bellek serbest bırakma */
export function disposeBVH(geometry: THREE.BufferGeometry): void {
  if ((geometry as any).boundsTree) {
    (geometry as any).disposeBoundsTree();
  }
}

/**
 * worldToScreen — world pozisyonu → canvas pixel koordinatı
 * Prototip: scene.jsx worldToScreen()
 */
export function worldToScreen(
  worldVec: THREE.Vector3,
  camera: THREE.Camera,
  canvasW: number,
  canvasH: number,
): { x: number; y: number; behind: boolean } {
  const v = worldVec.clone().project(camera);
  return {
    x:      (v.x * 0.5 + 0.5) * canvasW,
    y:      (-v.y * 0.5 + 0.5) * canvasH,
    behind: v.z > 1 || v.z < -1,
  };
}
