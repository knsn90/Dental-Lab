/**
 * faceDetect — MediaPipe Face Landmarker via runtime ESM load.
 *
 * Bundle'a hiç ek yük getirmez — modül `<script type="module">` ile
 * jsdelivr CDN'den ilk kullanımda yüklenir. Sonuçlar window'da cache'lenir.
 *
 * Dental smile design için kritik landmark'lar:
 *   • lip corners (61, 291)            — gülüş genişliği
 *   • upper/lower lip (13, 14)         — gülüş yüksekliği
 *   • eye outer corners (33, 263)      — inter-canthal eksen
 *   • pupil/iris (468, 473)            — inter-pupillary line (referans eksen)
 *   • philtrum (164)                   — facial midline
 *   • nose tip (1)                     — orta hat doğrulama
 */

export interface FaceLandmarks {
  lipLeft: Point2D;
  lipRight: Point2D;
  lipTop: Point2D;
  lipBottom: Point2D;
  eyeLeft: Point2D;
  eyeRight: Point2D;
  pupilLeft: Point2D | null;
  pupilRight: Point2D | null;
  noseTip: Point2D;
  philtrum: Point2D;
  /** Inter-pupillary (veya inter-canthal) eksenin yatayla yaptığı açı (derece). */
  pupilTiltDeg: number;
  /** Görüntü doğal boyutu (px). */
  imageWidth: number;
  imageHeight: number;
}

export interface Point2D { x: number; y: number; }

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

declare global {
  // eslint-disable-next-line no-var
  var __mp_landmarker: any;
  // eslint-disable-next-line no-var
  var __mp_loading: Promise<any> | undefined;
}

async function ensureMediaPipeLoaded(): Promise<any> {
  if (typeof window === 'undefined') throw new Error('Web only');
  if ((window as any).__mp_landmarker) return (window as any).__mp_landmarker;
  if ((window as any).__mp_loading) return (window as any).__mp_loading;

  (window as any).__mp_loading = (async () => {
    // ESM modülünü inline script ile yükle — bundler resolve etmesin diye
    // dinamik string + Function() içinde import yapıyoruz.
    const ESM_URL = `${CDN_BASE}/vision_bundle.mjs`;
    // eslint-disable-next-line no-new-func
    const dynamicImport = new Function('u', 'return import(u)');
    const mod: any = await dynamicImport(ESM_URL);
    const { FaceLandmarker, FilesetResolver } = mod;
    const vision = await FilesetResolver.forVisionTasks(`${CDN_BASE}/wasm`);
    const landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      outputFaceBlendshapes: false,
      runningMode: 'IMAGE',
      numFaces: 1,
    });
    (window as any).__mp_landmarker = landmarker;
    return landmarker;
  })();
  return (window as any).__mp_loading;
}

/**
 * Verilen image URL'inde yüz tespiti yap, dental landmark'ları döndür.
 * Yüz bulunamazsa null.
 */
export async function detectFace(imageUrl: string): Promise<FaceLandmarks | null> {
  if (typeof window === 'undefined') return null;
  const landmarker = await ensureMediaPipeLoaded();

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = imageUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Görüntü yüklenemedi'));
  });

  const result = landmarker.detect(img);
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;
  const lms: Array<{ x: number; y: number; z: number }> = result.faceLandmarks[0];

  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  const p = (i: number): Point2D | null => {
    const l = lms[i];
    return l ? { x: l.x * W, y: l.y * H } : null;
  };
  const must = (i: number): Point2D => {
    const v = p(i);
    if (!v) throw new Error(`Landmark ${i} bulunamadı`);
    return v;
  };

  const eyeLeft = must(33);    // left eye outer
  const eyeRight = must(263);  // right eye outer
  const pupilLeft = p(468);    // left iris center (may be missing)
  const pupilRight = p(473);   // right iris center

  // Tilt: önce pupil, yoksa eye köşeleri
  const a = pupilLeft ?? eyeLeft;
  const b = pupilRight ?? eyeRight;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const pupilTiltDeg = Math.atan2(dy, dx) * (180 / Math.PI);

  return {
    lipLeft: must(61),
    lipRight: must(291),
    lipTop: must(13),
    lipBottom: must(14),
    eyeLeft,
    eyeRight,
    pupilLeft,
    pupilRight,
    noseTip: must(1),
    philtrum: must(164),
    pupilTiltDeg,
    imageWidth: W,
    imageHeight: H,
  };
}
