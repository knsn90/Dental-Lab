/**
 * meshDiagnostics — STL/PLY mesh kalite analizi.
 *
 * Çıktı (per-mesh):
 *   • triCount, vertexCount
 *   • holeEdges      — sadece 1 face'e ait olan kenarlar (açık mesh)
 *   • nonManifold    — 3+ face'e ait olan kenarlar (kötü topology)
 *   • invertedRatio  — merkeze bakan face normal oranı (0..1)
 *   • flags          — kullanıcıya gösterilecek uyarı listesi
 *
 * Performance: 1M+ tri mesh'lerde ~150-300ms. Yükleme sonrası tek seferlik.
 */
import * as THREE from 'three';

export interface MeshDiagnostics {
  triCount: number;
  vertexCount: number;
  holeEdges: number;
  nonManifoldEdges: number;
  invertedRatio: number;
  flags: DiagnosticFlag[];
}

export type DiagnosticFlag =
  | 'holes'           // ⚠ Açık kenarlar bulundu
  | 'non-manifold'    // ⚠ Hatalı topology
  | 'inverted'        // ⚠ Normal'ler ters
  | 'low-density'     // ⚠ Düşük tarama yoğunluğu
  | 'huge';           // ⚠ Çok yüksek poligon (perf riski)

const HOLE_RATIO_THRESHOLD = 0.005;     // >0.5% kenar açıksa flag
const NON_MANIFOLD_THRESHOLD = 50;       // 50+ non-manifold kenar
const INVERTED_THRESHOLD = 0.40;         // %40+ face ters bakıyorsa flag
const LOW_DENSITY_TRI_THRESHOLD = 5000;  // <5k tri scan kalitesi düşük
const HUGE_TRI_THRESHOLD = 3_000_000;    // >3M tri perf riski

export function analyzeMesh(geom: THREE.BufferGeometry): MeshDiagnostics {
  const pos = geom.attributes.position;
  if (!pos) {
    return {
      triCount: 0, vertexCount: 0, holeEdges: 0, nonManifoldEdges: 0,
      invertedRatio: 0, flags: [],
    };
  }

  const vertexCount = pos.count;
  const idx = geom.index;
  const triCount = idx ? idx.count / 3 : vertexCount / 3;

  // ── Edge analysis (hole + non-manifold) ─────────────────────────
  // Map: edge "min:max" → face count
  // 1M tri mesh için ~3M kenar; Map yerine number-keyed işlem.
  let holeEdges = 0;
  let nonManifoldEdges = 0;

  // Vertex'lerin position'una hash atmak çok pahalı; geometry'nin
  // indexed olup olmamasına göre farklı işle.
  if (idx) {
    const edgeMap = new Map<number, number>();
    const arr = idx.array as Uint16Array | Uint32Array;
    // Edge key: (min * 2^21 + max) — vertex sayısı < 2M varsayımı
    const N = arr.length;
    for (let i = 0; i < N; i += 3) {
      const a = arr[i], b = arr[i + 1], c = arr[i + 2];
      const edges: [number, number][] = [
        a < b ? [a, b] : [b, a],
        b < c ? [b, c] : [c, b],
        c < a ? [c, a] : [a, c],
      ];
      for (const [lo, hi] of edges) {
        const key = lo * 2097152 + hi;
        edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
      }
    }
    edgeMap.forEach((count) => {
      if (count === 1) holeEdges++;
      else if (count > 2) nonManifoldEdges++;
    });
  } else {
    // Non-indexed: vertex hash gerekli, ~O(N) memory. Pozisyon
    // string olarak hash'le (yavaş ama doğru).
    const map = new Map<string, number>();
    const N = pos.count;
    // Triangle başına 3 edge — sample yaparak hızlandır (>500k tri)
    const step = N > 1_500_000 ? 9 : 3; // her triangle'ı ayrı al, sample yapma
    for (let i = 0; i < N; i += step) {
      const ax = pos.getX(i),     ay = pos.getY(i),     az = pos.getZ(i);
      const bx = pos.getX(i + 1), by = pos.getY(i + 1), bz = pos.getZ(i + 1);
      const cx = pos.getX(i + 2), cy = pos.getY(i + 2), cz = pos.getZ(i + 2);
      const k = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      const ka = k(ax, ay, az), kb = k(bx, by, bz), kc = k(cx, cy, cz);
      const edges = [
        ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`,
        kb < kc ? `${kb}|${kc}` : `${kc}|${kb}`,
        kc < ka ? `${kc}|${ka}` : `${ka}|${kc}`,
      ];
      for (const e of edges) map.set(e, (map.get(e) ?? 0) + 1);
    }
    map.forEach((c) => {
      if (c === 1) holeEdges++;
      else if (c > 2) nonManifoldEdges++;
    });
  }

  // ── Inverted normal heuristic ───────────────────────────────────
  // Mesh merkezi
  geom.computeBoundingBox();
  const center = new THREE.Vector3();
  geom.boundingBox!.getCenter(center);

  let outward = 0, inward = 0;
  const sampleStride = Math.max(1, Math.floor(triCount / 1500));
  if (idx) {
    const arr = idx.array as Uint16Array | Uint32Array;
    for (let t = 0; t < triCount; t += sampleStride) {
      const i = t * 3;
      const a = arr[i], b = arr[i + 1], c = arr[i + 2];
      const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
      const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
      const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c);
      const result = classifyNormal(ax, ay, az, bx, by, bz, cx, cy, cz, center);
      if (result) outward++; else inward++;
    }
  } else {
    for (let t = 0; t < triCount; t += sampleStride) {
      const i = t * 3;
      const ax = pos.getX(i),     ay = pos.getY(i),     az = pos.getZ(i);
      const bx = pos.getX(i + 1), by = pos.getY(i + 1), bz = pos.getZ(i + 1);
      const cx = pos.getX(i + 2), cy = pos.getY(i + 2), cz = pos.getZ(i + 2);
      const result = classifyNormal(ax, ay, az, bx, by, bz, cx, cy, cz, center);
      if (result) outward++; else inward++;
    }
  }
  const invertedRatio = inward / Math.max(1, outward + inward);

  // ── Flags ───────────────────────────────────────────────────────
  const totalEdgesEstimate = triCount * 1.5; // her tri ~1.5 unique kenar
  const flags: DiagnosticFlag[] = [];
  if (holeEdges / totalEdgesEstimate > HOLE_RATIO_THRESHOLD) flags.push('holes');
  if (nonManifoldEdges > NON_MANIFOLD_THRESHOLD) flags.push('non-manifold');
  if (invertedRatio > INVERTED_THRESHOLD) flags.push('inverted');
  if (triCount < LOW_DENSITY_TRI_THRESHOLD) flags.push('low-density');
  if (triCount > HUGE_TRI_THRESHOLD) flags.push('huge');

  return {
    triCount: Math.round(triCount),
    vertexCount,
    holeEdges,
    nonManifoldEdges,
    invertedRatio,
    flags,
  };
}

/** Face normal merkez yönünde mi (outward) yoksa ters mi? */
function classifyNormal(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  center: THREE.Vector3,
): boolean {
  // Edge vectors
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  // Cross product
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  // Face center
  const fx = (ax + bx + cx) / 3 - center.x;
  const fy = (ay + by + cy) / 3 - center.y;
  const fz = (az + bz + cz) / 3 - center.z;
  // Dot: outward if positive (normal aligned with center→face)
  return (nx * fx + ny * fy + nz * fz) > 0;
}

export function flagLabel(f: DiagnosticFlag): string {
  switch (f) {
    case 'holes':         return 'Açık kenarlar';
    case 'non-manifold':  return 'Hatalı topology';
    case 'inverted':      return 'Ters normaller';
    case 'low-density':   return 'Düşük çözünürlük';
    case 'huge':          return 'Çok yüksek poligon';
  }
}

export function flagDescription(f: DiagnosticFlag): string {
  switch (f) {
    case 'holes':         return 'Mesh\'te kapatılmamış açık yüzeyler var';
    case 'non-manifold':  return '3+ yüzeyin paylaştığı kenarlar (yanlış topology)';
    case 'inverted':      return 'Bazı yüzlerin normalleri içe dönük — yanlış görünebilir';
    case 'low-density':   return 'Düşük poligon sayısı — tarama kalitesi düşük';
    case 'huge':          return 'Çok yüksek poligon — performans için downsample uygulandı';
  }
}
