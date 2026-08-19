/**
 * offscreenThumb — 3D görüntüleyici AÇILMADAN mesh küçük resmi üretir.
 *
 * NEDEN: STL/PLY dosyaları ortalama 16–29 MB. Dosya listesinde önizleme için
 * bunları okuma anında indirmek 6 taramalı bir siparişte ~150 MB eder. Küçük
 * resim bir kez üretilir (~10 KB), sonrası bedava.
 *
 * Bu dosya "C" adımı: yükleme biter bitmez, arka planda. "B" adımı (görüntüleyici
 * açılınca yakalama) hâlâ geçerli ve tamamlayıcı — burada üretilemeyen dosyalar
 * (çok büyük, desteklenmeyen) ilk 3D açılışında görüntüsünü alır.
 *
 * DİKKAT — ana iş parçacığı: 30 MB'lık bir PLY'yi ayrıştırmak saniyeler sürer ve
 * bu süre boyunca arayüz donar. Bu yüzden:
 *   • `MAX_BYTES` üstündeki dosyalar atlanır (B adımına bırakılır),
 *   • çağrı boşta kalma anına ertelenir (`whenIdle`),
 *   • her şey try/catch — üretilemezse sessizce vazgeçilir.
 */
import * as THREE from 'three';
import { loadGeometry } from './loaders';
import { createScene, centerGeometry, fitCameraToObject, captureThumbnail, disposeObject } from './scene';
import type { FileFormat } from '../types';

/** Bu boyutun üstünde ayrıştırma arayüzü hissedilir şekilde kilitliyor. */
const MAX_BYTES = 25 * 1024 * 1024;

/** Tarayıcı boştayken çalıştır — sipariş oluşturma akışını yavaşlatmasın. */
function whenIdle(fn: () => void): void {
  const w = globalThis as any;
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout: 8000 });
  else setTimeout(fn, 1200);
}

function formatOf(name: string): FileFormat | null {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  return ext === 'stl' || ext === 'ply' || ext === 'obj' ? (ext as FileFormat) : null;
}

/**
 * Verilen mesh URL'inden kare bir JPEG data-URL üretir.
 * Üretilemezse `null` — çağıran taraf sessizce devam etmeli.
 */
export async function generateMeshThumb(url: string, filename: string, size = 256): Promise<string | null> {
  if (typeof document === 'undefined') return null;          // yalnız web
  const format = formatOf(filename);
  if (!format) return null;

  // Boyut ön kontrolü — indirmeden önce. HEAD desteklenmezse devam edilir.
  try {
    const head = await fetch(url, { method: 'HEAD' });
    const len = Number(head.headers.get('content-length') ?? 0);
    if (len && len > MAX_BYTES) return null;
  } catch { /* HEAD yoksa boyut kontrolü atlanır */ }

  let canvas: HTMLCanvasElement | null = null;
  let refs: ReturnType<typeof createScene> | null = null;
  let mesh: THREE.Object3D | null = null;
  try {
    const { geometry, isPointCloud } = await loadGeometry(url, format);
    centerGeometry(geometry);

    canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    refs = createScene(canvas, size, size);

    const material = isPointCloud
      ? new THREE.PointsMaterial({ size: 0.35, vertexColors: !!geometry.attributes.color })
      : new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.55, metalness: 0.05,
                                         vertexColors: !!geometry.attributes.color });
    mesh = isPointCloud
      ? new THREE.Points(geometry, material as THREE.PointsMaterial)
      : new THREE.Mesh(geometry, material as THREE.MeshStandardMaterial);
    refs.scene.add(mesh);
    fitCameraToObject(refs.camera, refs.controls, mesh, 1.3);

    return captureThumbnail(refs, size);
  } catch {
    return null;
  } finally {
    // WebGL bağlamı sınırlı bir kaynak — bırakılmazsa birkaç dosyadan sonra
    // "too many contexts" ile görüntüleyici de açılmaz olur.
    try { if (mesh) disposeObject(mesh); } catch {}
    try { refs?.controls?.dispose?.(); } catch {}
    try { refs?.renderer?.dispose?.(); } catch {}
    try { (refs?.renderer as any)?.forceContextLoss?.(); } catch {}
    canvas = null;
  }
}

/** Yükleme sonrası ateşle-unut kullanım: boşta kalınca üretir, sonucu verir. */
export function generateMeshThumbWhenIdle(
  url: string,
  filename: string,
  onReady: (dataUrl: string) => void,
): void {
  if (!formatOf(filename)) return;
  whenIdle(() => { void generateMeshThumb(url, filename).then(u => { if (u) onReady(u); }); });
}
