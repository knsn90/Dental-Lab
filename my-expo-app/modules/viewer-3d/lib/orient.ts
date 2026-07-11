/**
 * orient — PCA tabanlı dental tarama otomatik yönlendirme.
 *
 * Her STL/PLY/OBJ farklı tarayıcılardan farklı koordinat eksenleriyle gelir.
 * Bu modül geometriden 3 ana ekseni (principal axes) çıkarır:
 *   - en büyük yayılım → arch (anterior-posterior) ekseni
 *   - orta yayılım   → mesio-distal (sol-sağ) ekseni
 *   - en küçük       → oklüzal-gingival (yükseklik) ekseni
 *
 * Sonuç: tarama önce kendi merkezine taşınır, sonra en kısa eksen +Y'ye,
 * en uzun eksen +Z'ye hizalanacak şekilde rotate edilir. Üst/alt çene farkı
 * için filename hint'i kullanılır (maxilla yukarı bakacak, mandible aşağı).
 */
import * as THREE from 'three';

export interface OrientResult {
  /** Ortaya çekildikten sonra geometri boyutu */
  size: THREE.Vector3;
  /** En kısa eksenin (oklüzal-gingival) dünya Y'sindeki yarı yüksekliği */
  halfOcclusalHeight: number;
}

/**
 * Jacobi rotation eigen decomposition for 3×3 symmetric matrix.
 * Returns sorted eigenvalues (ascending) and corresponding eigenvectors.
 */
function jacobiEigen3(m: number[][]): { values: number[]; vectors: number[][] } {
  // Deep copy
  const a = m.map((r) => r.slice());
  const V: number[][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  for (let iter = 0; iter < 60; iter++) {
    // En büyük off-diagonal elemanı bul
    let p = 0, q = 1, max = Math.abs(a[0][1]);
    if (Math.abs(a[0][2]) > max) { p = 0; q = 2; max = Math.abs(a[0][2]); }
    if (Math.abs(a[1][2]) > max) { p = 1; q = 2; max = Math.abs(a[1][2]); }
    if (max < 1e-10) break;

    // Givens rotation hesapla
    const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const sign = theta >= 0 ? 1 : -1;
    const t = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(t * t + 1);
    const s = t * c;

    const app = a[p][p] - t * a[p][q];
    const aqq = a[q][q] + t * a[p][q];
    a[p][p] = app; a[q][q] = aqq;
    a[p][q] = 0; a[q][p] = 0;

    for (let i = 0; i < 3; i++) {
      if (i !== p && i !== q) {
        const aip = c * a[i][p] - s * a[i][q];
        const aiq = s * a[i][p] + c * a[i][q];
        a[i][p] = aip; a[p][i] = aip;
        a[i][q] = aiq; a[q][i] = aiq;
      }
    }
    for (let i = 0; i < 3; i++) {
      const vip = c * V[i][p] - s * V[i][q];
      const viq = s * V[i][p] + c * V[i][q];
      V[i][p] = vip; V[i][q] = viq;
    }
  }

  // Eigenvalues (diagonal)
  const vals = [a[0][0], a[1][1], a[2][2]];
  const vecs = [
    [V[0][0], V[1][0], V[2][0]],
    [V[0][1], V[1][1], V[2][1]],
    [V[0][2], V[1][2], V[2][2]],
  ];
  // Ascending sırala
  const idx = [0, 1, 2].sort((i, j) => vals[i] - vals[j]);
  return {
    values: idx.map((i) => vals[i]),
    vectors: idx.map((i) => vecs[i]),
  };
}

/**
 * Geometri vertex'lerinden PCA hesapla. Hız için sample.
 */
function pcaFromGeometry(geom: THREE.BufferGeometry, maxSamples = 4000): {
  axes: number[][]; // 3 birim vektör, en kısa eksenden başlar (ascending eigenvalue)
} {
  const pos = geom.attributes.position;
  if (!pos) return { axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
  const N = pos.count;
  const stride = Math.max(1, Math.floor(N / maxSamples));

  // Mean
  let mx = 0, my = 0, mz = 0, n = 0;
  for (let i = 0; i < N; i += stride) {
    mx += pos.getX(i); my += pos.getY(i); mz += pos.getZ(i); n++;
  }
  mx /= n; my /= n; mz /= n;

  // Covariance
  let cxx = 0, cyy = 0, czz = 0, cxy = 0, cxz = 0, cyz = 0;
  for (let i = 0; i < N; i += stride) {
    const dx = pos.getX(i) - mx;
    const dy = pos.getY(i) - my;
    const dz = pos.getZ(i) - mz;
    cxx += dx * dx; cyy += dy * dy; czz += dz * dz;
    cxy += dx * dy; cxz += dx * dz; cyz += dy * dz;
  }
  cxx /= n; cyy /= n; czz /= n; cxy /= n; cxz /= n; cyz /= n;

  const { vectors } = jacobiEigen3([
    [cxx, cxy, cxz],
    [cxy, cyy, cyz],
    [cxz, cyz, czz],
  ]);
  // vectors[0] = en kısa, [2] = en uzun
  return { axes: vectors };
}

/**
 * Geometriyi dünya eksenlerine hizala (in-place):
 *   - en kısa eksen → +Y
 *   - en uzun eksen → +Z
 *   - orta eksen    → +X
 *
 * jawHint: 'maxilla' → oklüzal yüz aşağı bakar (Y- yönü),
 *          'mandible' → oklüzal yüz yukarı bakar (Y+ yönü),
 *          'bite'/diğer → varsayılan yön.
 *
 * Return: hizalanmış geometri'nin bbox bilgisi.
 */
/**
 * Çoklu mesh için ortak PCA — meshler arası hizalamayı KORUR.
 * Tüm meshlerin vertex'leri birlikte PCA'ye sokulur, tek dönüş matrisi
 * çıkarılır ve grup seviyesinde uygulanır. Exocad/3Shape gibi:
 * dosyalar zaten okluzyonda hizalıysa, sadece dünya eksenine oturtulur.
 *
 * Sonuç: en kısa eksen → +Y (yukarı), en uzun → +Z (ön-arka), orta → +X.
 */
export function computeGroupOrientation(
  geometries: THREE.BufferGeometry[],
): THREE.Quaternion {
  if (geometries.length === 0) return new THREE.Quaternion();

  // Her geometri için ayrı PCA çıkar — sonra "en jaw-benzeri" olanı seç.
  // Stack edilmiş maxilla+mandible'da BİRLEŞİK PCA en kısa eksen oklüzal
  // varsayımını bozar (artık occlusal en uzun olur). Tek mesh için ise
  // occlusal kesinlikle en kısa eksen (arch yatay > derinlik).
  let bestAxes: { eShort: THREE.Vector3; eMid: THREE.Vector3; eLong: THREE.Vector3 } | null = null;
  let bestRatio = 0; // largest/smallest ratio — yüksek olan "düz çene arch" demek

  for (const g of geometries) {
    const pos = g.attributes.position;
    if (!pos || pos.count < 100) continue;
    const stride = 8;

    let mx = 0, my = 0, mz = 0, n = 0;
    for (let i = 0; i < pos.count; i += stride) {
      mx += pos.getX(i); my += pos.getY(i); mz += pos.getZ(i); n++;
    }
    if (n === 0) continue;
    mx /= n; my /= n; mz /= n;

    let cxx = 0, cyy = 0, czz = 0, cxy = 0, cxz = 0, cyz = 0;
    for (let i = 0; i < pos.count; i += stride) {
      const dx = pos.getX(i) - mx;
      const dy = pos.getY(i) - my;
      const dz = pos.getZ(i) - mz;
      cxx += dx * dx; cyy += dy * dy; czz += dz * dz;
      cxy += dx * dy; cxz += dx * dz; cyz += dy * dz;
    }
    cxx /= n; cyy /= n; czz /= n; cxy /= n; cxz /= n; cyz /= n;

    const { values, vectors } = jacobiEigen3([
      [cxx, cxy, cxz],
      [cxy, cyy, cyz],
      [cxz, cyz, czz],
    ]);
    // values ascending: values[0] = smallest variance, [2] = largest
    const ratio = values[2] / Math.max(1e-6, values[0]);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestAxes = {
        eShort: new THREE.Vector3(vectors[0][0], vectors[0][1], vectors[0][2]).normalize(),
        eMid:   new THREE.Vector3(vectors[1][0], vectors[1][1], vectors[1][2]).normalize(),
        eLong:  new THREE.Vector3(vectors[2][0], vectors[2][1], vectors[2][2]).normalize(),
      };
    }
  }
  if (!bestAxes) return new THREE.Quaternion();
  const { eShort, eMid, eLong } = bestAxes;

  // Sağ-el sistemi
  const cross = new THREE.Vector3().crossVectors(eShort, eMid);
  if (cross.dot(eLong) < 0) eMid.negate();

  // Mesh'in mevcut eksenleri (eMid, eShort, eLong) → world (X, Y, Z).
  // KRİTİK: Jacobi eigenvektörleri TAM ortogonal olmayabilir (yakın-dejenere
  // varyanslar) → ham makeBasis SAF ROTASYON olmaz, setFromRotationMatrix
  // NON-UNIT quaternion verir → group'a uygulanınca scale/shear → model
  // "basık ve yayık" distorte olur. Cross-product ile garanti ortonormal +
  // det=+1 rotasyon kur (eMid→X, eLong→Z korunur, eShort→Y türetilir).
  const cX = eMid.clone().normalize();
  const cZ = eLong.clone().sub(cX.clone().multiplyScalar(eLong.dot(cX))).normalize(); // eLong ⟂ cX
  const cY = new THREE.Vector3().crossVectors(cZ, cX).normalize();                    // sağ-el: cX×cY=cZ
  const M = new THREE.Matrix4().makeBasis(cX, cY, cZ);
  const R = M.clone().transpose();
  const e = R.elements; e[12] = e[13] = e[14] = 0;
  const q = new THREE.Quaternion().setFromRotationMatrix(R).normalize(); // birim garanti
  return q;
}

export function autoOrient(
  geom: THREE.BufferGeometry,
  jawHint: 'maxilla' | 'mandible' | 'bite' | 'other' = 'other',
): OrientResult {
  // Önce mevcut merkeze çek (PCA'yi merkezde yapmak için)
  geom.computeBoundingBox();
  const bb0 = geom.boundingBox!;
  const c0 = new THREE.Vector3();
  bb0.getCenter(c0);
  geom.translate(-c0.x, -c0.y, -c0.z);

  // PCA
  const { axes } = pcaFromGeometry(geom);
  const eShort = new THREE.Vector3(axes[0][0], axes[0][1], axes[0][2]).normalize();
  const eMid   = new THREE.Vector3(axes[1][0], axes[1][1], axes[1][2]).normalize();
  const eLong  = new THREE.Vector3(axes[2][0], axes[2][1], axes[2][2]).normalize();

  // Sağ-el sistemi: short × mid = long (gerekirse mid'i flip)
  const cross = new THREE.Vector3().crossVectors(eShort, eMid);
  if (cross.dot(eLong) < 0) eMid.negate();

  // Şimdi short→Y, mid→X, long→Z hedefini sağlayan dönüş matrisi
  // R'nin sütunları world ekseni → mesh ekseni eşlemesi (M = [eMid eShort eLong]).
  // Mesh'i bu hizaya getirmek için R = M^T (M'in transpose'u) uygulanır.
  // Ortonormal + det=+1 garanti (eigenvektörler tam ortogonal olmayabilir →
  // ham makeBasis saf-rotasyon olmaz, geometriyi scale/shear ile distorte eder).
  const cX = eMid.clone().normalize();
  const cZ = eLong.clone().sub(cX.clone().multiplyScalar(eLong.dot(cX))).normalize();
  const cY = new THREE.Vector3().crossVectors(cZ, cX).normalize();
  const M = new THREE.Matrix4().makeBasis(cX, cY, cZ);
  const R = M.clone().transpose();
  // Translate kısmı transpose'a girmesin diye sadece üst-sol 3×3'ü tut
  const e = R.elements;
  e[12] = e[13] = e[14] = 0;
  geom.applyMatrix4(R);
  geom.computeBoundingBox();

  // Üst/alt çene için occluasal yüz yön kontrolü
  // PCA yön belirsizliği nedeniyle Y yönü ters dönmüş olabilir.
  // Maxilla'da diş uçları aşağı bakmalı → mesh'in Y- yarısı diş uçlarını içerir.
  // Mandible'da diş uçları yukarı bakmalı → Y+ yarısı diş uçlarını içerir.
  // Heuristic: arch convexity — diş uçları, oklüzal-gingival eksende dağılımın
  // dar kuyruğuna düşer. Y+ ve Y- yarımlarındaki vertex sayısını karşılaştır.
  const pos = geom.attributes.position;
  let yMin = 0, yMax = 0; // top/bottom slice'larındaki vertex sayıları için kullanılacak
  let countYPosFar = 0, countYNegFar = 0;
  geom.computeBoundingBox();
  const bb = geom.boundingBox!;
  const halfY = (bb.max.y - bb.min.y) / 2;
  const thr = halfY * 0.7; // uç bölgeler
  for (let i = 0; i < pos.count; i += 4) {
    const y = pos.getY(i);
    if (y > thr) countYPosFar++;
    else if (y < -thr) countYNegFar++;
  }
  // Diş uçları çok daha az vertex'e sahip olur (sivri uçlar).
  // jawHint=maxilla → diş uçları Y- olmalı. countYNegFar < countYPosFar bekleriz.
  // Değilse flipY uygulanır.
  let needFlipY = false;
  if (jawHint === 'maxilla' && countYNegFar > countYPosFar) needFlipY = true;
  if (jawHint === 'mandible' && countYPosFar > countYNegFar) needFlipY = true;
  if (needFlipY) {
    const flip = new THREE.Matrix4().makeScale(1, -1, 1);
    geom.applyMatrix4(flip);
    geom.computeVertexNormals(); // mirror sonrası normal'leri ters çevir
  }

  geom.computeBoundingBox();
  const size = new THREE.Vector3();
  geom.boundingBox!.getSize(size);
  return { size, halfOcclusalHeight: size.y / 2 };
}
