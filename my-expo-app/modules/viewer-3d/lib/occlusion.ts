/**
 * occlusion — Kapanış (oklüzyon) analizi.
 *
 * Üst çene ve alt çene mesh'leri arasındaki yüzey-yüzey mesafesini hesaplar:
 *   • Bir çenenin (analiz hedefi) HER vertex'i için karşı çeneye en yakın mesafe
 *     (three-mesh-bvh closestPointToPoint ile hızlı — 1M+ tri'de pratik).
 *   • Mesafeyi renge map'ler (temas=kırmızı … boşluk=mavi) → vertex-color ısı haritası.
 *   • Özet istatistik: temas %, min boşluk, ortalama, temas bölgesi sayısı.
 *
 * Mesafeler WORLD uzayında hesaplanır (mesh transform'ları uygulanır) — üst/alt
 * tarama aynı oturumdan geldiğinde zaten okluzyonda hizalıdır (autoAlign=false).
 *
 * NOT: closestPointToPoint İŞARETSİZ mesafe verir → penetrasyon (negatif) ayrıca
 * tespit edilmez; v1 boşluk/temas büyüklüğünü ölçer (dental proximity haritası).
 */
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { downsampleGeometry } from './perfMonitor';

export interface OcclusionResult {
  /** Analiz edilen vertex sayısı */
  sampleCount: number;
  /** Temas eşiği (mm) altındaki vertex oranı (0-1) */
  contactRatio: number;
  /** En küçük mesafe (mm) — en sıkı temas */
  minDist: number;
  /** Ortalama mesafe (mm) */
  avgDist: number;
  /** Maksimum mesafe (mm) — en büyük boşluk (range cap'li) */
  maxDist: number;
  /** Temas eşiği (mm) */
  contactThreshold: number;
  /** Renk haritasında kullanılan üst mesafe sınırı (mm) */
  range: number;
}

/** mm cinsinden eşikler — diş okluzyonu için makul varsayılanlar. */
const CONTACT_MM = 0.2;   // ≤ bu → temas
const RANGE_MM   = 2.0;   // renk gradyanı bu mesafede doygunlaşır

/** Geometriyi world matrisiyle bake'leyip kopyasını döner (BVH/sorgu aynı uzayda). */
function bakedClone(geom: THREE.BufferGeometry, matrixWorld: THREE.Matrix4): THREE.BufferGeometry {
  const g = geom.clone();
  g.applyMatrix4(matrixWorld);
  return g;
}

/**
 * Hedef mesh'in vertex'leri için karşı mesh'e mesafe + vertex-color ısı haritası.
 * Hedef geometriye 'color' attribute yazar (vertexColors:true ile gösterilmeli).
 * Döner: özet istatistik.
 */
export async function analyzeOcclusion(
  targetMesh: THREE.Mesh,
  otherMesh: THREE.Mesh,
  opts?: { contactThreshold?: number; range?: number },
): Promise<OcclusionResult> {
  const contactThreshold = opts?.contactThreshold ?? CONTACT_MM;
  const range = opts?.range ?? RANGE_MM;

  targetMesh.updateMatrixWorld(true);
  otherMesh.updateMatrixWorld(true);

  const targetGeom = targetMesh.geometry;
  const otherGeom = otherMesh.geometry;
  const posAttr = targetGeom.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!posAttr || posAttr.count === 0 || !otherGeom.getAttribute('position')) {
    throw new Error('Kapanış analizi için geçerli çene mesh\'i yok');
  }

  // Karşı çene → BVH (world uzayında). Ham intraoral taramalar 1-2M üçgen olabilir;
  // BVH inşası + sorgu maliyetini sınırlamak için BVH mesh'ini küçült (mesafe
  // haritası için yeterli doğruluk; hedef mesh tam çözünürlükte boyanır).
  const otherBaked = bakedClone(otherGeom, otherMesh.matrixWorld);
  const otherForBvh = downsampleGeometry(otherBaked, 80_000);
  const bvh = new MeshBVH(otherForBvh);

  const n = posAttr.count;
  const colors = new Float32Array(n * 3);
  const tmp = new THREE.Vector3();
  const target: any = { point: new THREE.Vector3(), distance: 0, faceIndex: -1 };

  let minDist = Infinity, sum = 0, maxDist = 0, contactCount = 0;
  const c = new THREE.Color();
  const CHUNK = 15000;  // her ~15k vertex'te UI'ye nefes aldır (donma yok)

  for (let i = 0; i < n; i++) {
    tmp.fromBufferAttribute(posAttr, i).applyMatrix4(targetMesh.matrixWorld);
    const res = bvh.closestPointToPoint(tmp, target);
    const d = res && Number.isFinite(res.distance) ? res.distance : range;
    if (d < minDist) minDist = d;
    if (d > maxDist) maxDist = Math.min(d, range);
    sum += d;
    if (d <= contactThreshold) contactCount++;
    heatColor(d, contactThreshold, range, c);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    if ((i & (16384 - 1)) === 0 && i >= CHUNK) {
      // periyodik yield — ana thread bloke olmasın
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  targetGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  (targetGeom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  try { if (otherForBvh !== otherBaked) otherForBvh.dispose(); otherBaked.dispose(); } catch {}

  return {
    sampleCount: n,
    contactRatio: n > 0 ? contactCount / n : 0,
    minDist: Number.isFinite(minDist) ? minDist : 0,
    avgDist: n > 0 ? sum / n : 0,
    maxDist,
    contactThreshold,
    range,
  };
}

/**
 * Mesafe → ısı haritası rengi.
 *   temas (≤eşik)         → kırmızı (#E5484D)
 *   yakın (eşik..0.5mm)   → turuncu → sarı
 *   orta  (..1mm)         → yeşil
 *   uzak  (..range)       → mavi
 */
function heatColor(d: number, contact: number, range: number, out: THREE.Color): THREE.Color {
  if (d <= contact) return out.setRGB(0.90, 0.16, 0.20);          // kırmızı — temas
  const t = Math.min(1, (d - contact) / (range - contact));        // 0..1 boşluk
  // turuncu(0) → sarı(0.25) → yeşil(0.55) → mavi(1)
  if (t < 0.25)      return out.setRGB(0.95, 0.55 + t * 1.2, 0.10);
  if (t < 0.55)      return out.setRGB(0.95 - (t - 0.25) * 2.4, 0.80, 0.15);
  return out.setRGB(0.15, 0.70 - (t - 0.55) * 1.2, 0.40 + (t - 0.55) * 1.2);
}

/** Hedef geometriden ısı haritasını kaldır (vertex-color attribute'u sil). */
export function clearOcclusion(targetMesh: THREE.Mesh): void {
  if (targetMesh.geometry.getAttribute('color')) {
    targetMesh.geometry.deleteAttribute('color');
  }
}

/** İnsan-okur özet (Simanty/teşhis için). */
export function describeOcclusion(r: OcclusionResult): string {
  const pct = Math.round(r.contactRatio * 100);
  return [
    `Temas alanı: ~%${pct} (≤${r.contactThreshold}mm)`,
    `En sıkı: ${r.minDist.toFixed(2)}mm`,
    `Ortalama boşluk: ${r.avgDist.toFixed(2)}mm`,
  ].join(' · ');
}
