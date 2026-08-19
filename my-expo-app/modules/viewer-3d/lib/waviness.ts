/**
 * waviness — Yüzey dalgalanma analizi (band-pass yüzey filtresi).
 *
 * NEDEN: İntraoral taramada servikal (kole) bölgede oluşan dikiş/hareket
 * artefaktları çıplak gözle ancak yandan transparan bakınca fark ediliyor.
 * Bu modül onu ölçülebilir hâle getirir.
 *
 * NASIL: Yüzey metrolojisindeki form / dalgalanma / pürüzlülük ayrıştırmasının
 * mesh karşılığı — ama filtre KONUMLARA değil SKALER YÜKSEKLİK ALANINA uygulanır:
 *   1. Difüzyonla pürüzsüz bir referans (form) yüzeyi çıkarılır.
 *   2. Her vertex'in referanstan normal yönündeki işaretli yüksekliği alınır.
 *      Buradan sonrası tek bileşenli bir yükseklik haritası.
 *   3. Alt kenar: haritayı σ_fine ile yumuşat → tarayıcı gürültüsü gider.
 *   4. Üst kenar: haritanın σ_base ile yumuşatılmışını ÇIKAR → yavaş değişen
 *      her şey (kalan form + referansın eğrilik yanlılığı) silinir.
 *   Kalan = bant içi işaretli dalgalanma. İşaret önemli: gerçek bir dalgalanma
 *   ardışık +/− şerit üretir, rastgele gürültü üretmez.
 *
 * NEDEN SKALER: Konumları band-pass'lamak iki tuzağa düşüyordu (ikisi de ölçüldü):
 *   • Düz Laplace yumuşatma mesh'i büzer; eğri anatomide bu büzülme sinyalle
 *     aynı büyüklükte sahte sapma üretiyordu. Skaler yüksek-geçiren bunu siler.
 *   • Taubin (hacim koruyan) alternatifinin kesme eğrisi çok yumuşak: bant içi
 *     sinyalin yarısından fazlası referansta kalıyor, kazanç %12'ye düşüyordu.
 *   Şimdiki hâlinde bant içi kazanç ~%80, tepe 0.5–0.8 mm.
 *
 * MESH YOĞUNLUĞUNDAN BAĞIMSIZ: Difüzyonun Gauss genişliği σ = h·√(k·λ). σ hedefi
 * fiziksel (mm) tutulup k buradan çözüldüğü için aynı yüzey seyrek ve sık mesh'te
 * aynı okunur (ölçüldü: ±%12; iterasyonla kalibre eden ilk sürümde 12× sapıyordu).
 *
 * SINIR: Bu yöntem dalgalanmanın ARTEFAKT mı GERÇEK ANATOMİ mi olduğunu
 * söyleyemez — sadece "burada üretime girmeden önce bakılması gereken bir şey
 * var" der. Karar klinik olarak insana aittir.
 *
 * Performans: 600k üçgende ~2-4 sn (ana thread, periyodik yield ile).
 */
import * as THREE from 'three';
import {
  weldGeometry, buildAdjacency, meanEdgeLength, vertexNormals,
  type Adjacency,
} from './meshTopology';

export interface WavinessResult {
  /** Analiz edilen (kaynaştırılmış) vertex sayısı */
  sampleCount: number;
  /** Karekök ortalama sapma (µm) — genel yüzey temizliği */
  rmsUm: number;
  /** %95 mutlak sapma (µm) — uç değerlerden arınmış "en kötü" */
  p95Um: number;
  /** En büyük mutlak sapma (µm) */
  maxUm: number;
  /** Eşiği aşan vertex oranı (0-1) */
  overRatio: number;
  /** Uyarı eşiği (µm) */
  thresholdUm: number;
  /** Renk skalasının doyduğu sapma (µm) */
  rangeUm: number;
  /** Filtrenin geçirdiği dalga boyu bandı (mm) */
  bandMm: [number, number];
}

/** Renk skalası varsayılanı — ±60 µm dental tarama için makul bir pencere. */
export const DEFAULT_RANGE_UM = 60;

/**
 * λ = 1/k_max. Adımımız p ← p + λ(komşu ort. − p) = I − λL biçiminde; L = I − A
 * özdeğerleri [0,2] aralığında, yani k_max = 2 → λ = 0.5 en yüksek frekansı tam
 * sıfırlar ve difüzyonu koşulsuz kararlı yapar.
 *
 * k iterasyon sonrası Gauss genişliği σ = h·√(k·λ) (h = ortalama kenar). Bu bağ
 * FİZİKSEL — bandı mesh yoğunluğundan bağımsız kılan şey bu.
 */
const LAMBDA = 0.5;

/** Bandın alt kenarı (σ, mm) — bunun altı tarayıcı gürültüsü sayılır. */
const SIGMA_FINE_MM = 0.07;

/** Bandın üst kenarı (σ, mm) — bunun üstü FORM (anatomi) sayılır. */
const SIGMA_BASE_MM = 0.45;

/** σ → yaklaşık %50 zayıflama dalga boyu. Rapor edilen bant etiketi için. */
const SIGMA_TO_WAVELEN = 5;

/**
 * Difüzyon iterasyon tavanı. Çok sık mesh'lerde (h < 0.04 mm) σ_base'i
 * tutturmak yüzlerce geçiş isterdi; tavan bağlarsa GERÇEKLEŞEN σ hesaplanıp
 * bant etiketi ona göre yazılır — sessizce kaymaz.
 */
const MAX_ITERS = 260;

/** Üstünde analizin reddedileceği vertex sayısı (bellek koruması). */
const MAX_VERTS = 3_000_000;

/* ─────────────────────── filtre adımları ─────────────────────── */

/** Konumlar için tek Laplace adımı: p' = p + factor · (komşu ortalaması − p) */
function laplacianStep(
  src: Float64Array, dst: Float64Array, adj: Adjacency, factor: number, count: number,
): void {
  const { offset, nbr } = adj;
  for (let i = 0; i < count; i++) {
    const s = offset[i], e = offset[i + 1];
    const i3 = i * 3;
    const px = src[i3], py = src[i3 + 1], pz = src[i3 + 2];
    const deg = e - s;
    if (deg === 0) { dst[i3] = px; dst[i3 + 1] = py; dst[i3 + 2] = pz; continue; }
    let ax = 0, ay = 0, az = 0;
    for (let k = s; k < e; k++) {
      const j3 = nbr[k] * 3;
      ax += src[j3]; ay += src[j3 + 1]; az += src[j3 + 2];
    }
    const d = 1 / deg;
    dst[i3]     = px + factor * (ax * d - px);
    dst[i3 + 1] = py + factor * (ay * d - py);
    dst[i3 + 2] = pz + factor * (az * d - pz);
  }
}

/** Skaler alan için tek Laplace adımı (konum değil, 1 bileşen → 3× ucuz). */
function scalarStep(
  src: Float64Array, dst: Float64Array, adj: Adjacency, factor: number, count: number,
): void {
  const { offset, nbr } = adj;
  for (let i = 0; i < count; i++) {
    const s = offset[i], e = offset[i + 1];
    const p = src[i];
    const deg = e - s;
    if (deg === 0) { dst[i] = p; continue; }
    let a = 0;
    for (let k = s; k < e; k++) a += src[nbr[k]];
    dst[i] = p + factor * (a / deg - p);
  }
}

/* ─────────────────────── ana analiz ─────────────────────── */

/**
 * Mesh'in yüzey dalgalanmasını hesaplar, geometriye 'color' attribute yazar
 * (vertexColors:true ile gösterilmeli) ve özet istatistik döner.
 *
 * @param mesh    Analiz edilecek mesh (THREE.Points desteklenmez)
 * @param opts    rangeUm: renk skalasının doyduğu sapma
 */
export async function analyzeWaviness(
  mesh: THREE.Mesh,
  opts?: { rangeUm?: number },
): Promise<WavinessResult> {
  const rangeUm = opts?.rangeUm ?? DEFAULT_RANGE_UM;
  const thresholdUm = rangeUm / 2;

  const geom = mesh.geometry;
  const posAttr = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!posAttr || posAttr.count < 3) throw new Error('Analiz için geçerli yüzey yok');
  if (!geom.index && posAttr.count % 3 !== 0) throw new Error('Geometri üçgen listesi değil');
  if (posAttr.count > MAX_VERTS) {
    throw new Error('Model dalgalanma analizi için çok büyük — daha küçük bir tarama deneyin');
  }

  // Dünya ölçeği: viewer bazı taramaları normalize ediyor (metre → mm). Sapmaları
  // µm'ye çevirirken bu çarpanı kullanmazsak sonuç ölçeksiz olurdu.
  mesh.updateMatrixWorld(true);
  const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
  mesh.matrixWorld.decompose(wp, wq, ws);
  const unitToMm = Number.isFinite(ws.x) && ws.x > 0 ? ws.x : 1;

  const yield_ = () => new Promise<void>((r) => setTimeout(r, 0));

  const w = weldGeometry(geom);
  await yield_();
  const adj = buildAdjacency(w.index, w.count);
  await yield_();

  // ── Filtre kalibrasyonu ─────────────────────────────────────────
  // Difüzyon iterasyonu k ↔ Gauss genişliği σ = h·√(k·λ). Hedef σ fiziksel (mm)
  // olduğu için iterasyon sayısı mesh yoğunluğuna göre kendiliğinden ayarlanır;
  // aynı yüzey seyrek ve sık mesh'te aynı okunur.
  const hMm = meanEdgeLength(w.pos, w.index) * unitToMm || 0.05;
  const itersFor = (sigmaMm: number) =>
    Math.max(0, Math.min(MAX_ITERS, Math.round((sigmaMm / hMm) ** 2 / LAMBDA)));

  const sigmaFineMm = Math.max(SIGMA_FINE_MM, hMm);
  const kFine = itersFor(sigmaFineMm);
  const kBase = Math.max(kFine + 4, itersFor(SIGMA_BASE_MM));
  // Tavan bağladıysa gerçekleşen σ bu — bant etiketi hedefi değil bunu yazar.
  const sigmaBaseMm = hMm * Math.sqrt(kBase * LAMBDA);

  const bandMm: [number, number] = [
    Math.round(sigmaFineMm * SIGMA_TO_WAVELEN * 100) / 100,
    Math.round(sigmaBaseMm * SIGMA_TO_WAVELEN * 100) / 100,
  ];

  // ── 1. Referans (form) yüzeyi — düz Laplace difüzyonu ───────────
  // Taubin (hacim koruyan) yerine düz difüzyon: büzülmenin getirdiği eğrilik
  // yanlılığı 4. adımdaki skaler yüksek-geçiren tarafından zaten silinecek.
  // Taubin'in kesme eğrisi ise kesme frekansı üstünde çok yumuşak — bandın
  // içindeki sinyalin yarısından fazlası referansta kalıyor, kazanç %12'ye
  // düşüyordu (ölçüldü).
  let base = w.pos.slice();
  let tmp3 = new Float64Array(w.count * 3);
  for (let k = 0; k < kBase; k++) {
    laplacianStep(base, tmp3, adj, LAMBDA, w.count);
    const s = base; base = tmp3; tmp3 = s;
    if ((k & 7) === 7) await yield_();
  }

  const normals = vertexNormals(base, w.index, w.count);
  await yield_();

  // ── 2. Skaler yükseklik alanı ───────────────────────────────────
  // Bundan sonrası vektör değil skaler: hem 3× ucuz hem de yüzey büzülmesi
  // gibi geometrik yan etkiler devre dışı — sadece bir yükseklik haritası
  // süzülüyor.
  const k2um = unitToMm * 1000;
  let hgt = new Float64Array(w.count);
  for (let i = 0; i < w.count; i++) {
    const i3 = i * 3;
    hgt[i] = ((w.pos[i3] - base[i3]) * normals[i3]
            + (w.pos[i3 + 1] - base[i3 + 1]) * normals[i3 + 1]
            + (w.pos[i3 + 2] - base[i3 + 2]) * normals[i3 + 2]) * k2um;
  }
  await yield_();

  // ── 3. Alt kenar: gürültüyü sil ─────────────────────────────────
  let tmp1 = new Float64Array(w.count);
  for (let k = 0; k < kFine; k++) {
    scalarStep(hgt, tmp1, adj, LAMBDA, w.count);
    const s = hgt; hgt = tmp1; tmp1 = s;
  }
  await yield_();

  // ── 4. Üst kenar: yavaş değişen bileşeni çıkar ──────────────────
  // hgt'nin σ_base ölçeğinde yumuşatılmışı = form artığı + eğrilik yanlılığı.
  // Çıkarınca geriye yalnız bant içi dalgalanma kalır.
  let slow = hgt.slice();
  for (let k = 0; k < kBase; k++) {
    scalarStep(slow, tmp1, adj, LAMBDA, w.count);
    const s = slow; slow = tmp1; tmp1 = s;
    if ((k & 15) === 15) await yield_();
  }

  const dev = new Float64Array(w.count);
  let sumSq = 0, maxAbs = 0, over = 0;
  for (let i = 0; i < w.count; i++) {
    const d = hgt[i] - slow[i];
    dev[i] = d;
    const a = Math.abs(d);
    sumSq += d * d;
    if (a > maxAbs) maxAbs = a;
    if (a > thresholdUm) over++;
  }
  await yield_();

  // p95 — uç gürültüden arınmış "en kötü" değer
  const absSorted = new Float64Array(w.count);
  for (let i = 0; i < w.count; i++) absSorted[i] = Math.abs(dev[i]);
  absSorted.sort();
  const p95 = absSorted[Math.min(w.count - 1, Math.floor(w.count * 0.95))] ?? 0;

  // Sapma verisini mesh'te sakla: skala penceresi değiştiğinde 2-4 sn'lik
  // yumuşatmayı baştan yapmak yerine sadece yeniden boyanır.
  const rms = Math.sqrt(sumSq / Math.max(1, w.count));
  (mesh.userData as any)._wavData = { dev, remap: w.remap, rms, p95, max: maxAbs, bandMm };

  paintWaviness(geom, dev, w.remap, rangeUm);

  return {
    sampleCount: w.count,
    rmsUm: rms,
    p95Um: p95,
    maxUm: maxAbs,
    overRatio: over / Math.max(1, w.count),
    thresholdUm,
    rangeUm,
    bandMm,
  };
}

/** Sapma dizisini renk attribute'una çevirir (orijinal vertex düzeninde). */
function paintWaviness(
  geom: THREE.BufferGeometry, dev: Float64Array, remap: Uint32Array, rangeUm: number,
): void {
  const n = (geom.getAttribute('position') as THREE.BufferAttribute).count;
  const existing = geom.getAttribute('color') as THREE.BufferAttribute | undefined;
  const colors = existing && existing.count === n
    ? (existing.array as Float32Array)
    : new Float32Array(n * 3);
  const c = { r: 0, g: 0, b: 0 };
  for (let i = 0; i < n; i++) {
    divergingColor(dev[remap[i]] / rangeUm, c);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  if (!existing || existing.count !== n) {
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  (geom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
}

/**
 * Skala penceresini değiştirir — yumuşatma tekrarlanmaz, sadece renk + eşiğe
 * bağlı istatistikler yeniden hesaplanır. Analiz yapılmamış mesh'te null döner.
 */
export function recolorWaviness(mesh: THREE.Mesh, rangeUm: number): WavinessResult | null {
  const data = (mesh.userData as any)._wavData as
    | { dev: Float64Array; remap: Uint32Array; rms: number; p95: number; max: number; bandMm: [number, number] }
    | undefined;
  if (!data) return null;

  const thresholdUm = rangeUm / 2;
  let over = 0;
  for (let i = 0; i < data.dev.length; i++) if (Math.abs(data.dev[i]) > thresholdUm) over++;

  paintWaviness(mesh.geometry, data.dev, data.remap, rangeUm);

  return {
    sampleCount: data.dev.length,
    rmsUm: data.rms,
    p95Um: data.p95,
    maxUm: data.max,
    overRatio: over / Math.max(1, data.dev.length),
    thresholdUm,
    rangeUm,
    bandMm: data.bandMm,
  };
}

/**
 * Ayrışan (diverging) renk skalası.
 *   −1 çukur (mavi) … 0 düz (nötr gri) … +1 tümsek (kırmızı)
 * Nötr merkez bilinçli: temiz yüzey "renksiz" kalsın, göz sadece sapmayı görsün.
 */
function divergingColor(t: number, out: { r: number; g: number; b: number }): void {
  const x = Math.max(-1, Math.min(1, Number.isFinite(t) ? t : 0));
  const STOPS: [number, number, number, number][] = [
    [-1.0, 0.15, 0.39, 0.92],   // #2563EB
    [-0.5, 0.49, 0.66, 0.94],   // #7DA9F0
    [ 0.0, 0.89, 0.90, 0.92],   // #E3E6EB — nötr
    [ 0.5, 0.94, 0.63, 0.35],   // #F0A05A
    [ 1.0, 0.86, 0.15, 0.15],   // #DC2626
  ];
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0] || i === STOPS.length - 1) {
      const [a0, ar, ag, ab] = STOPS[i - 1];
      const [b0, br, bg, bb] = STOPS[i];
      const f = b0 === a0 ? 0 : (x - a0) / (b0 - a0);
      out.r = ar + (br - ar) * f;
      out.g = ag + (bg - ag) * f;
      out.b = ab + (bb - ab) * f;
      return;
    }
  }
}

/** Dalgalanma ısı haritasını ve önbelleklenen sapma verisini kaldır. */
export function clearWaviness(mesh: THREE.Mesh): void {
  if (mesh.geometry.getAttribute('color')) mesh.geometry.deleteAttribute('color');
  delete (mesh.userData as any)._wavData;
}

/** İnsan-okur özet. */
export function describeWaviness(r: WavinessResult): string {
  return [
    `RMS ${r.rmsUm.toFixed(1)} µm`,
    `%95 ${r.p95Um.toFixed(1)} µm`,
    `${r.thresholdUm.toFixed(0)} µm üstü: %${(r.overRatio * 100).toFixed(1)}`,
  ].join(' · ');
}

/**
 * Kaba bir yorum — teknisyene "bakılmalı mı" sinyali verir, teşhis koymaz.
 * Eşikler kendi taramalarınızda kalibre edilmeli (demo varsayılanları).
 */
export function wavinessVerdict(r: WavinessResult): { tone: 'ok' | 'warn' | 'bad'; text: string } {
  if (r.p95Um < 18) return { tone: 'ok', text: 'Yüzey temiz — belirgin dalgalanma yok' };
  if (r.p95Um < 35) return { tone: 'warn', text: 'Hafif dalgalanma — sınır bölgesini gözden geçirin' };
  return { tone: 'bad', text: 'Belirgin dalgalanma — üretim öncesi hekimle teyit edin' };
}
