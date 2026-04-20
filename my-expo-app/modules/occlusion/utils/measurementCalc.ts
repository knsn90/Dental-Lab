// modules/occlusion/utils/measurementCalc.ts
// Raycaster click → 3D point
// Prototip: scene.jsx handleClick()

import * as THREE from 'three';
import type { SceneClickEvent } from '../types/occlusion';

/**
 * Mouse event + canvas → normalized device coordinates [-1, +1]
 */
export function eventToNDC(
  event: MouseEvent,
  canvas: HTMLCanvasElement,
): THREE.Vector2 {
  const rect = canvas.getBoundingClientRect();
  return new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width)  *  2 - 1,
    ((event.clientY - rect.top)  / rect.height) * -2 + 1,
  );
}

/**
 * NDC + camera → ray → intersect upper/lower meshes
 * Prototip: handleClick'in raycast mantığı
 */
export function pickMeshPoint(
  ndc: THREE.Vector2,
  camera: THREE.Camera,
  upperMesh: THREE.Mesh,
  lowerMesh: THREE.Mesh,
): SceneClickEvent | null {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);

  const hits = raycaster.intersectObjects([upperMesh, lowerMesh], false);
  if (hits.length === 0) return null;

  const hit = hits[0];
  return {
    position: hit.point.clone(),
    meshType: hit.object === upperMesh ? 'upper' : 'lower',
  };
}
