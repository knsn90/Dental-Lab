// modules/occlusion/utils/penetrationDetector.ts
// Penetrasyon noktalarını vertex distances'dan DBSCAN kümeleme ile tespit eder.
// Harici dep yok — lightweight DBSCAN (density-clustering opsiyonel).

import * as THREE from 'three';
import type { PenetrationPoint, Severity, OcclusionStatistics } from '../types/occlusion';

export interface DetectionOptions {
  penetrationThreshold?: number;   // mm — bu değerden negatif vertex'ler penetrasyon (default: -0.05)
  clusterRadius?:        number;   // mm — DBSCAN eps (default: 2.0)
  minClusterSize?:       number;   // min vertex per cluster (default: 3)
}

interface RawPenetrationVertex {
  index:    number;
  position: THREE.Vector3;
  depth:    number;   // |distance| mm
}

/**
 * Lower mesh geometry + distances → PenetrationPoint[]
 *
 * Algoritma:
 *  1) distances < threshold olan vertex'leri topla
 *  2) Uzaklık tabanlı greedy clustering (DBSCAN yaklaşımı, O(n log n))
 *  3) Her cluster'ı bir PenetrationPoint'e dönüştür:
 *     - position: cluster centroid
 *     - depth:    max depth in cluster
 *     - area:     yaklaşık: sqrt(vertex count) * 0.1 mm² (kaba tahmin)
 *     - severity: depth'e göre (>0.3 high, 0.1–0.3 medium, <0.1 low)
 */
export function detectPenetrations(
  geometry: THREE.BufferGeometry,
  distances: Float32Array,
  opts: DetectionOptions = {},
): PenetrationPoint[] {
  const {
    penetrationThreshold = -0.05,
    clusterRadius        = 2.0,
    minClusterSize       = 3,
  } = opts;

  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;

  // 1) Penetrasyon vertex'lerini topla
  const raw: RawPenetrationVertex[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < distances.length; i++) {
    if (distances[i] < penetrationThreshold) {
      v.fromBufferAttribute(pos, i);
      raw.push({ index: i, position: v.clone(), depth: Math.abs(distances[i]) });
    }
  }

  if (raw.length === 0) return [];

  // 2) Greedy clustering
  const visited  = new Uint8Array(raw.length);
  const clusters: RawPenetrationVertex[][] = [];

  for (let i = 0; i < raw.length; i++) {
    if (visited[i]) continue;
    visited[i] = 1;

    const cluster: RawPenetrationVertex[] = [raw[i]];
    const queue = [i];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (let j = 0; j < raw.length; j++) {
        if (visited[j]) continue;
        const dist = raw[cur].position.distanceTo(raw[j].position);
        if (dist <= clusterRadius) {
          visited[j] = 1;
          cluster.push(raw[j]);
          queue.push(j);
        }
      }
    }

    if (cluster.length >= minClusterSize) {
      clusters.push(cluster);
    }
  }

  // 3) Her cluster → PenetrationPoint
  const points: PenetrationPoint[] = clusters.map((cluster, idx) => {
    // Centroid
    const centroid = new THREE.Vector3();
    let maxDepth = 0;
    for (const vx of cluster) {
      centroid.add(vx.position);
      if (vx.depth > maxDepth) maxDepth = vx.depth;
    }
    centroid.divideScalar(cluster.length);

    // Kaba alan tahmini (vertex sayısına orantılı)
    const area = Math.sqrt(cluster.length) * 0.15;

    // Severity
    const severity: Severity =
      maxDepth > 0.3 ? 'high' :
      maxDepth > 0.1 ? 'medium' :
      'low';

    return {
      id:       `P${idx + 1}`,
      position: centroid,
      depth:    parseFloat(maxDepth.toFixed(3)),
      area:     parseFloat(area.toFixed(2)),
      severity,
    };
  });

  // Derinliğe göre sırala (en derin önce)
  points.sort((a, b) => b.depth - a.depth);

  // ID'leri yeniden sırala
  points.forEach((p, i) => { p.id = `P${i + 1}`; });

  return points;
}

/**
 * distances Float32Array'den istatistikleri hesaplar.
 */
export function computeStatistics(
  distances: Float32Array,
  penetrationPoints: PenetrationPoint[],
): OcclusionStatistics {
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let contactCount = 0;  // 0 ≤ d ≤ 0.1 mm — ideal temas

  for (let i = 0; i < distances.length; i++) {
    const d = distances[i];
    sum += d;
    if (d < min) min = d;
    if (d > max) max = d;
    if (d >= -0.05 && d <= 0.1) contactCount++;
  }

  const n = distances.length || 1;
  const totalPenetrationArea = penetrationPoints.reduce((s, p) => s + p.area, 0);

  return {
    minDistance:          parseFloat(min.toFixed(4)),
    maxDistance:          parseFloat(max.toFixed(4)),
    avgDistance:          parseFloat((sum / n).toFixed(4)),
    penetrationCount:     penetrationPoints.length,
    totalPenetrationArea: parseFloat(totalPenetrationArea.toFixed(2)),
    contactPercentage:    Math.round((contactCount / n) * 100),
  };
}

/**
 * Severity'e göre klinik yorum döndürür.
 */
export function clinicalSummary(stats: OcclusionStatistics, sevCounts: Record<Severity, number>): string {
  if (sevCounts.high > 0) {
    return `Yüksek şiddetli ${sevCounts.high} penetrasyon tespit edildi. Artikülatörde düzeltme gereklidir.`;
  }
  if (sevCounts.medium > 2) {
    return 'Birden fazla orta şiddetli kontakt tespit edildi. İnce ayar önerilir.';
  }
  if (stats.penetrationCount > 0) {
    return 'Düşük şiddetli kontaktlar var. Klinik değerlendirme önerilir.';
  }
  return 'Oklüzyon klinik olarak kabul edilebilir seviyededir.';
}
