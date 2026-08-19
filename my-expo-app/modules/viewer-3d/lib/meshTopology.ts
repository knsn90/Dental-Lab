/**
 * meshTopology — Mesh komşuluk altyapısı (kaynaştırma + CSR komşuluk).
 *
 * STL non-indexed gelir: her üçgen kendi 3 vertex kopyasını taşır, yani mesh'in
 * komşuluk bilgisi YOKTUR. Yumuşatma, yayılma (BFS) ve benzeri her yüzey
 * algoritması önce bu bilgiyi kurmak zorunda — hem dalgalanma hem gömülü-yüzey
 * analizi buraya dayanır.
 */
import * as THREE from 'three';

export interface Welded {
  /** Benzersiz vertex sayısı */
  count: number;
  /** count*3 — kaynaştırılmış konumlar */
  pos: Float64Array;
  /** Üçgen indeksleri (kaynaştırılmış uzayda) */
  index: Uint32Array;
  /** originalVertexIndex → weldedIndex */
  remap: Uint32Array;
}

export interface Adjacency {
  /** count+1 uzunlukta başlangıç offsetleri */
  offset: Uint32Array;
  /** Komşu vertex indeksleri (offset[i]..offset[i+1]) */
  nbr: Uint32Array;
}

/**
 * Konum-eşitliğine göre vertex kaynaştırma.
 *
 * String anahtarlı Map yerine typed-array açık adreslemeli hash: 1.9M vertex'te
 * string hash saniyelerce sürüyordu, bu ~200 ms.
 */
export function weldGeometry(geom: THREE.BufferGeometry): Welded {
  const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
  const n = posAttr.count;

  geom.computeBoundingBox();
  const size = geom.boundingBox!.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  // Tolerans modelin 1e-6'sı: STL kopyaları bit-aynı olduğu için bu fazlasıyla
  // güvenli, farklı vertex'leri yanlışlıkla birleştirmez.
  const inv = 1 / (maxDim * 1e-6);

  const qx = new Int32Array(n), qy = new Int32Array(n), qz = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    qx[i] = Math.round(posAttr.getX(i) * inv);
    qy[i] = Math.round(posAttr.getY(i) * inv);
    qz[i] = Math.round(posAttr.getZ(i) * inv);
  }

  // Kapasite: 2n'den büyük ilk 2'nin kuvveti (yük faktörü ≤ 0.5 → az çakışma)
  let cap = 1;
  while (cap < n * 2) cap <<= 1;
  const mask = cap - 1;
  const table = new Int32Array(cap).fill(-1);

  const remap = new Uint32Array(n);
  const uq = new Int32Array(n * 3);
  const upos = new Float64Array(n * 3);
  let m = 0;

  for (let i = 0; i < n; i++) {
    const x = qx[i], y = qy[i], z = qz[i];
    let slot = (Math.imul(x, 0x9E3779B1) ^ Math.imul(y, 0x85EBCA77) ^ Math.imul(z, 0xC2B2AE3D)) >>> 0;
    slot &= mask;
    for (;;) {
      const w = table[slot];
      if (w === -1) {
        table[slot] = m;
        uq[m * 3] = x; uq[m * 3 + 1] = y; uq[m * 3 + 2] = z;
        upos[m * 3] = posAttr.getX(i);
        upos[m * 3 + 1] = posAttr.getY(i);
        upos[m * 3 + 2] = posAttr.getZ(i);
        remap[i] = m;
        m++;
        break;
      }
      if (uq[w * 3] === x && uq[w * 3 + 1] === y && uq[w * 3 + 2] === z) {
        remap[i] = w;
        break;
      }
      slot = (slot + 1) & mask;
    }
  }

  const src = geom.index;
  const triCount = src ? src.count / 3 : n / 3;
  const index = new Uint32Array(triCount * 3);
  if (src) {
    for (let i = 0; i < src.count; i++) index[i] = remap[src.getX(i)];
  } else {
    for (let i = 0; i < n; i++) index[i] = remap[i];
  }

  return { count: m, pos: upos.slice(0, m * 3), index, remap };
}

/**
 * Üçgen indeksinden komşuluk listesi (CSR — compressed sparse row).
 *
 * NOT: Komşular TEKİLLEŞTİRİLMEZ. İç kenarlar iki üçgene ait olduğu için komşu
 * listede iki kez görünür; bu, uniform Laplace'ı yüz-ağırlıklı hâle getirir.
 * Yumuşatma kalitesi için fark yaratmaz ve 1.8M kenarı dedupe etme maliyetini
 * ortadan kaldırır.
 */
export function buildAdjacency(index: Uint32Array, count: number): Adjacency {
  const deg = new Uint32Array(count);
  for (let i = 0; i < index.length; i += 3) {
    deg[index[i]] += 2; deg[index[i + 1]] += 2; deg[index[i + 2]] += 2;
  }
  const offset = new Uint32Array(count + 1);
  let acc = 0;
  for (let i = 0; i < count; i++) { offset[i] = acc; acc += deg[i]; }
  offset[count] = acc;

  const cursor = offset.slice(0, count);
  const nbr = new Uint32Array(acc);
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    nbr[cursor[a]++] = b; nbr[cursor[a]++] = c;
    nbr[cursor[b]++] = a; nbr[cursor[b]++] = c;
    nbr[cursor[c]++] = a; nbr[cursor[c]++] = b;
  }
  return { offset, nbr };
}

/** Ortalama kenar uzunluğu (model biriminde). */
export function meanEdgeLength(pos: Float64Array, index: Uint32Array): number {
  const stride = Math.max(3, Math.floor(index.length / 30_000) * 3);
  let sum = 0, n = 0;
  for (let i = 0; i < index.length - 2; i += stride) {
    const a = index[i] * 3, b = index[i + 1] * 3;
    sum += Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
    n++;
  }
  return n > 0 ? sum / n : 1;
}

/** Yumuşatılmış konumlardan vertex normalleri (yüz normali toplama). */
export function vertexNormals(pos: Float64Array, index: Uint32Array, count: number): Float64Array {
  const nrm = new Float64Array(count * 3);
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
    const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    nrm[a] += nx; nrm[a + 1] += ny; nrm[a + 2] += nz;
    nrm[b] += nx; nrm[b + 1] += ny; nrm[b + 2] += nz;
    nrm[c] += nx; nrm[c + 1] += ny; nrm[c + 2] += nz;
  }
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const l = Math.hypot(nrm[i3], nrm[i3 + 1], nrm[i3 + 2]) || 1;
    nrm[i3] /= l; nrm[i3 + 1] /= l; nrm[i3 + 2] /= l;
  }
  return nrm;
}
