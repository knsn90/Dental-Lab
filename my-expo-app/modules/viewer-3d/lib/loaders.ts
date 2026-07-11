/**
 * loaders — STL/PLY/OBJ → THREE.BufferGeometry
 *
 * Faz 2: STL + PLY (vertex color) + OBJ (multi-mesh group → merged geometry).
 *
 * All loaders use fetch() + arrayBuffer so progress + abort signals work.
 */
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { FileFormat } from '../types';

export function detectFormat(name: string): FileFormat | null {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'stl') return 'stl';
  if (ext === 'ply') return 'ply';
  if (ext === 'obj') return 'obj';
  return null;
}

/**
 * Result includes a flag for vertex colors so the consumer can decide
 * material settings (vertexColors: true vs solid color tint).
 */
export interface LoadedGeometry {
  geometry: THREE.BufferGeometry;
  hasVertexColors: boolean;
  /** OBJ + kardeş texture (PNG/JPG) verilmişse yüklenmiş doku. */
  texture?: THREE.Texture;
  /** Geometride yüz (face) yok → nokta bulutu. THREE.Points ile render edilmeli. */
  isPointCloud?: boolean;
}

/**
 * textureUrl verilirse (OBJ + sibling PNG), doku yüklenip sonuçta döner.
 * Geometri yükleme texture hatasından etkilenmez (texture best-effort).
 */
export async function loadGeometry(
  url: string,
  format: FileFormat,
  signal?: AbortSignal,
  textureUrl?: string | null,
): Promise<LoadedGeometry> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  const buf = await res.arrayBuffer();

  if (format === 'stl') {
    const geom = new STLLoader().parse(buf);
    return { geometry: geom, hasVertexColors: false };
  }

  if (format === 'ply') {
    const geom = new PLYLoader().parse(buf);
    // PLY may include per-vertex colors (e.g., scanned tissue)
    const hasColors = !!geom.attributes.color;
    // PLYLoader yüzleri (face element) index'e çevirir. Index YOKSA yüz yoktur →
    // bu bir NOKTA BULUTU'dur (intraoral tarama ham çıktısı); Mesh olarak render
    // edilirse üçgen olmadığından GÖRÜNMEZ → THREE.Points gerekir.
    const isPointCloud = !geom.index && !!geom.attributes.position;
    return { geometry: geom, hasVertexColors: hasColors, isPointCloud };
  }

  if (format === 'obj') {
    // OBJ is text format; parse decoder
    const text = new TextDecoder().decode(buf);
    const group = new OBJLoader().parse(text);
    // OBJ returns Group with multiple meshes → merge their geometries
    const merged = mergeObjGroup(group);
    let texture: THREE.Texture | undefined;
    if (textureUrl && merged.attributes.uv) {
      texture = await loadTexture(textureUrl, signal).catch(() => undefined);
    }
    return { geometry: merged, hasVertexColors: false, texture };
  }

  throw new Error(`Bilinmeyen format: ${format}`);
}

/**
 * PNG/JPG → THREE.Texture. createImageBitmap ile (abort destekli, hızlı).
 * imageOrientation flipY → OBJ UV konvansiyonuna uyum.
 */
async function loadTexture(url: string, signal?: AbortSignal): Promise<THREE.Texture> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`texture HTTP ${res.status}`);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' });
  const tex = new THREE.Texture(bitmap);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // bitmap zaten flipY ile geldi
  tex.needsUpdate = true;
  return tex;
}

/**
 * Merge all child mesh geometries of an OBJ Group into a single BufferGeometry.
 * Loses per-material grouping (acceptable for previewer; future Faz adds materials).
 */
function mergeObjGroup(group: THREE.Group): THREE.BufferGeometry {
  const meshes: THREE.Mesh[] = [];
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
  });

  if (meshes.length === 0) return new THREE.BufferGeometry();
  if (meshes.length === 1) return meshes[0].geometry as THREE.BufferGeometry;

  // Manuel merge — three'nin BufferGeometryUtils opsiyonel, dependency eklememek için
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  let hasNormals = true;
  let hasUVs = true;

  for (const mesh of meshes) {
    const geom = mesh.geometry as THREE.BufferGeometry;
    const pos = geom.attributes.position;
    const nor = geom.attributes.normal;
    const uv = geom.attributes.uv;
    if (!pos) continue;

    // Apply mesh transform so merged geometry is in world space
    const matrix = mesh.matrixWorld.clone();
    mesh.updateMatrixWorld(true);

    const tmpV = new THREE.Vector3();
    const tmpN = new THREE.Vector3();

    if (geom.index) {
      // Indexed — expand to non-indexed for merging
      const idx = geom.index;
      for (let i = 0; i < idx.count; i++) {
        const j = idx.getX(i);
        tmpV.fromBufferAttribute(pos, j).applyMatrix4(matrix);
        positions.push(tmpV.x, tmpV.y, tmpV.z);
        if (nor) {
          tmpN.fromBufferAttribute(nor, j).transformDirection(matrix);
          normals.push(tmpN.x, tmpN.y, tmpN.z);
        } else hasNormals = false;
        if (uv) {
          uvs.push(uv.getX(j), uv.getY(j));
        } else hasUVs = false;
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        tmpV.fromBufferAttribute(pos, i).applyMatrix4(matrix);
        positions.push(tmpV.x, tmpV.y, tmpV.z);
        if (nor) {
          tmpN.fromBufferAttribute(nor, i).transformDirection(matrix);
          normals.push(tmpN.x, tmpN.y, tmpN.z);
        } else hasNormals = false;
        if (uv) {
          uvs.push(uv.getX(i), uv.getY(i));
        } else hasUVs = false;
      }
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (hasNormals && normals.length === positions.length) {
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  }
  if (hasUVs && uvs.length === (positions.length / 3) * 2) {
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  }
  return merged;
}
