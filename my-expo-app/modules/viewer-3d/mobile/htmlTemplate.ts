/**
 * htmlTemplate — Native WebView içinde çalışacak self-contained HTML.
 *
 * three.js ESM CDN'den yüklenir (importmap). İlk açılışta ~250KB indirilir,
 * sonra browser cache'de kalır.
 *
 * RN ↔ WebView protokol:
 *   • RN → WebView: window.postMessage / via WebView.postMessage
 *       - { type: 'TOGGLE_LAYER', fileId, visible }
 *       - { type: 'SET_OPACITY', fileId, value }
 *       - { type: 'SET_COLOR', fileId, hex }
 *       - { type: 'SET_WIREFRAME', fileId, on }
 *       - { type: 'SET_PRESET', preset }
 *       - { type: 'SET_FOV', deg }
 *       - { type: 'FIT' }
 *       - { type: 'RESET' }
 *   • WebView → RN: window.ReactNativeWebView.postMessage(JSON)
 *       - { type: 'READY' }
 *       - { type: 'LOADED', fileId }
 *       - { type: 'ERROR', fileId?, message }
 *
 * ZIP modu (INPUT.zip): arşiv WebView'de indirilip açılır — RN JS thread'i hiç
 * meşgul olmaz (büyük taramada uygulama donmuyordu). Ek mesajlar:
 *   • WebView → RN: { type: 'PROGRESS', phase: 'download'|'extract'|'parse', pct? }
 *                   { type: 'MANIFEST', files: [{ id, name, format }] }
 *                   { type: 'ZIP_EMPTY' }   — arşivde mesh yok
 *   • RN → WebView: { type: 'LAYER_STYLES', styles }  — manifest'e yanıt (renk/opaklık)
 */

import type { ViewerFile, LayerStyle } from '../types';
import { VIEWER_ENGINE_JS } from './viewerEngineBundle.generated';

interface BuildInput {
  files: ViewerFile[];
  layerStyles: Record<string, LayerStyle>;
  /** Background color hex (örn: '#0e0e0e') */
  bg?: string;
  /**
   * Izgara çizgisi rengi. Açık temada beyaz-alfa çizgiler görünmez olduğu için
   * çağıran taraf (tema-farkında) verir.
   */
  gridLine?: string;
  /** ZIP modu — arşiv WebView içinde indirilip açılır (bkz. dosya başı) */
  zip?: { url: string; idPrefix?: string };
}

export function buildViewerHtml({ files, layerStyles, bg = '#0e0e0e', gridLine = 'rgba(255,255,255,0.07)', zip }: BuildInput): string {
  const payload = JSON.stringify({ files, layerStyles, bg, zip: zip ?? null });
  return /* html */ `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>3D Viewer</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: ${bg}; }
  /* Sabit 2D arka plan ızgarası — kamerayla DÖNMEZ (ekran uzayında sabit). */
  #gridbg {
    position: fixed; inset: 0; z-index: 0; display: none;
    background-color: ${bg};
    background-image:
      linear-gradient(${gridLine} 1px, transparent 1px),
      linear-gradient(90deg, ${gridLine} 1px, transparent 1px);
    background-size: 42px 42px;
  }
  #app { position: fixed; inset: 0; touch-action: none; z-index: 1; }
  canvas { display: block; width: 100% !important; height: 100% !important; }
  #err {
    position: fixed; bottom: 12px; left: 12px; right: 12px;
    padding: 10px 12px; border-radius: 10px;
    background: rgba(220,38,38,0.18); color: #FCA5A5;
    border: 1px solid rgba(220,38,38,0.4);
    font: 600 11px/1.4 -apple-system, system-ui, sans-serif;
    display: none;
  }
  #load {
    position: fixed; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 14px;
    color: rgba(255,255,255,0.6); font: 500 12px/1.4 -apple-system, system-ui, sans-serif;
  }
  .spin {
    width: 34px; height: 34px; border-radius: 50%;
    border: 3px solid rgba(255,255,255,0.15); border-top-color: #E8D5C4;
    animation: r 0.8s linear infinite;
  }
  @keyframes r { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div id="gridbg"></div>
<div id="app"><canvas id="cv"></canvas></div>
<div id="load"><div class="spin"></div><span>3D model yükleniyor…</span></div>
<div id="err"></div>

<!-- Offline gömülü 3D motor (three.js + loader'lar). CDN gerekmez; window.THREE ayarlar. -->
<script>${VIEWER_ENGINE_JS}</script>

<script type="module">
const INPUT = ${payload};
const post = (msg) => { try { window.ReactNativeWebView?.postMessage(JSON.stringify(msg)); } catch {} };
const hideLoad = () => { const l = document.getElementById('load'); if (l) l.style.display = 'none'; };
const showErr = (m) => { hideLoad(); const el = document.getElementById('err'); if (el) { el.textContent = m; el.style.display = 'block'; } };

// 3D motoru çöz: ÖNCE offline gömülü bundle (window.THREE — CDN/internet gerekmez, ana yol),
// olmazsa CDN fallback. jsm loader'ları bare "import ... from 'three'" içerir → CDN'de importmap
// gerekir ama importmap WKWebView'de null-origin/sürüm uyumsuzluğunda sessizce patlar. Bu yüzden
// birincil yol GÖMÜLÜ motor; CDN fallback'te de importmap-siz self-resolving CDN'ler kullanılır.
async function loadEngine() {
  // 1) Offline gömülü motor — normal ve tercih edilen yol (siyah ekran riski yok).
  const w = window;
  if (w.__ENGINE_READY__ && w.THREE && w.STLLoader) {
    return { THREE: w.THREE, ArcballControls: w.ArcballControls, STLLoader: w.STLLoader, PLYLoader: w.PLYLoader, OBJLoader: w.OBJLoader };
  }
  // 2) Fallback: gömülü motor bir şekilde çalışmadıysa CDN (esm.sh → jsdelivr +esm).
  const SOURCES = [
    {
      three:   'https://esm.sh/three@0.183.2',
      arcball: 'https://esm.sh/three@0.183.2/examples/jsm/controls/ArcballControls.js',
      stl:     'https://esm.sh/three@0.183.2/examples/jsm/loaders/STLLoader.js',
      ply:     'https://esm.sh/three@0.183.2/examples/jsm/loaders/PLYLoader.js',
      obj:     'https://esm.sh/three@0.183.2/examples/jsm/loaders/OBJLoader.js',
    },
    {
      three:   'https://cdn.jsdelivr.net/npm/three@0.183.2/+esm',
      arcball: 'https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/controls/ArcballControls.js/+esm',
      stl:     'https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/loaders/STLLoader.js/+esm',
      ply:     'https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/loaders/PLYLoader.js/+esm',
      obj:     'https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/loaders/OBJLoader.js/+esm',
    },
  ];
  let lastErr;
  for (const s of SOURCES) {
    try {
      const THREE = await import(s.three);
      const [c, st, pl, ob] = await Promise.all([import(s.arcball), import(s.stl), import(s.ply), import(s.obj)]);
      return { THREE, ArcballControls: c.ArcballControls, STLLoader: st.STLLoader, PLYLoader: pl.PLYLoader, OBJLoader: ob.OBJLoader };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('three.js CDN erişilemedi');
}

(async () => {
  let THREE, ArcballControls, STLLoader, PLYLoader, OBJLoader;
  try {
    ({ THREE, ArcballControls, STLLoader, PLYLoader, OBJLoader } = await loadEngine());
  } catch (e) {
    showErr('3D motoru yüklenemedi (internet bağlantısı?). ' + String((e && e.message) || e));
    post({ type: 'ERROR', message: 'engine: ' + String((e && e.message) || e) });
    return;
  }

const canvas = document.getElementById('cv');
// preserveDrawingBuffer: ekran görüntüsü (toDataURL) için buffer korunur.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
// Şeffaf canvas → arkadaki sabit #gridbg (grid açıkken) görünür; body zaten koyu zemin.
renderer.setClearColor(new THREE.Color(INPUT.bg), 0);

// sRGB çıktı → renkler canlı/doğru. (three r155+ fiziksel ışıklandırma varsayılan.)
if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.position.set(0, 0, 200);

// Işıklandırma — fiziksel modda değerler yüksek olmalı (yoksa sönük görünür).
// Hemisphere (gökyüzü/zemin) yumuşak dolgu + güçlü key + fill + rim → canlı, hacimli.
scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 2.0));
const key  = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(1, 1.4, 1.2); scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 1.0); fill.position.set(-1, -0.3, -0.6); scene.add(fill);
const rim  = new THREE.DirectionalLight(0xffffff, 0.9); rim.position.set(-0.6, 0.9, -1.1); scene.add(rim);
// Kamera-yönlü ışık: model her açıda önden aydınlanır (döndürünce karanlıkta kalmaz).
const camLight = new THREE.DirectionalLight(0xffffff, 1.1); camera.add(camLight); scene.add(camera);

const group = new THREE.Group(); scene.add(group);
const controls = new ArcballControls(camera, canvas, scene);
controls.setGizmosVisible(false);
controls.enableAnimations = false;

const meshes = new Map(); // fileId -> mesh

// ── PCA otomatik hizalama (desktop lib/orient.ts paritesi) ──────────────────
// Ham tarama koordinatını dünya eksenine oturtur: en kısa eksen → +Y (oklüzal
// yukarı), en uzun → +Z (ön), orta → +X. Böylece kamera açıları (Önden/Oklüzal/
// Bukkal…) doğru çalışır. Hizalama olmadan presetler yanlış açı gösterir.
function jacobiEigen3(m) {
  const a = m.map((r) => r.slice());
  const V = [[1,0,0],[0,1,0],[0,0,1]];
  for (let iter = 0; iter < 60; iter++) {
    let p = 0, q = 1, max = Math.abs(a[0][1]);
    if (Math.abs(a[0][2]) > max) { p = 0; q = 2; max = Math.abs(a[0][2]); }
    if (Math.abs(a[1][2]) > max) { p = 1; q = 2; max = Math.abs(a[1][2]); }
    if (max < 1e-10) break;
    const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const sign = theta >= 0 ? 1 : -1;
    const t = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(t * t + 1), s = t * c;
    const app = a[p][p] - t * a[p][q], aqq = a[q][q] + t * a[p][q];
    a[p][p] = app; a[q][q] = aqq; a[p][q] = 0; a[q][p] = 0;
    for (let i = 0; i < 3; i++) if (i !== p && i !== q) {
      const aip = c * a[i][p] - s * a[i][q], aiq = s * a[i][p] + c * a[i][q];
      a[i][p] = aip; a[p][i] = aip; a[i][q] = aiq; a[q][i] = aiq;
    }
    for (let i = 0; i < 3; i++) {
      const vip = c * V[i][p] - s * V[i][q], viq = s * V[i][p] + c * V[i][q];
      V[i][p] = vip; V[i][q] = viq;
    }
  }
  const vals = [a[0][0], a[1][1], a[2][2]];
  const vecs = [[V[0][0],V[1][0],V[2][0]],[V[0][1],V[1][1],V[2][1]],[V[0][2],V[1][2],V[2][2]]];
  const idx = [0,1,2].sort((i,j) => vals[i] - vals[j]);
  return { values: idx.map((i) => vals[i]), vectors: idx.map((i) => vecs[i]) };
}
function computeGroupOrientation(geometries) {
  if (!geometries.length) return new THREE.Quaternion();
  let bestAxes = null, bestRatio = 0;
  for (const g of geometries) {
    const pos = g.attributes.position;
    if (!pos || pos.count < 100) continue;
    const stride = 8;
    let mx = 0, my = 0, mz = 0, n = 0;
    for (let i = 0; i < pos.count; i += stride) { mx += pos.getX(i); my += pos.getY(i); mz += pos.getZ(i); n++; }
    if (!n) continue; mx /= n; my /= n; mz /= n;
    let cxx=0,cyy=0,czz=0,cxy=0,cxz=0,cyz=0;
    for (let i = 0; i < pos.count; i += stride) {
      const dx = pos.getX(i)-mx, dy = pos.getY(i)-my, dz = pos.getZ(i)-mz;
      cxx+=dx*dx; cyy+=dy*dy; czz+=dz*dz; cxy+=dx*dy; cxz+=dx*dz; cyz+=dy*dz;
    }
    cxx/=n;cyy/=n;czz/=n;cxy/=n;cxz/=n;cyz/=n;
    const { values, vectors } = jacobiEigen3([[cxx,cxy,cxz],[cxy,cyy,cyz],[cxz,cyz,czz]]);
    const ratio = values[2] / Math.max(1e-6, values[0]);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestAxes = {
        eShort: new THREE.Vector3(vectors[0][0],vectors[0][1],vectors[0][2]).normalize(),
        eMid:   new THREE.Vector3(vectors[1][0],vectors[1][1],vectors[1][2]).normalize(),
        eLong:  new THREE.Vector3(vectors[2][0],vectors[2][1],vectors[2][2]).normalize(),
      };
    }
  }
  if (!bestAxes) return new THREE.Quaternion();
  const { eShort, eMid, eLong } = bestAxes;
  const cross = new THREE.Vector3().crossVectors(eShort, eMid);
  if (cross.dot(eLong) < 0) eMid.negate();
  const cX = eMid.clone().normalize();
  const cZ = eLong.clone().sub(cX.clone().multiplyScalar(eLong.dot(cX))).normalize();
  const cY = new THREE.Vector3().crossVectors(cZ, cX).normalize();
  const M = new THREE.Matrix4().makeBasis(cX, cY, cZ);
  const R = M.clone().transpose();
  const el = R.elements; el[12] = el[13] = el[14] = 0;
  return new THREE.Quaternion().setFromRotationMatrix(R).normalize();
}
// Çene tipi tespiti (desktop layerMap.detectLayerType paritesi — sadece üst/alt).
const JAW_MAX = /(\\b|_)(maxilla|upper[\\s_-]?jaw|ust[\\s_-]?cene|üst[\\s_-]?çene|maxiller|maks)|^(ust|üst)/i;
const JAW_MAN = /(\\b|_)(mandible|lower[\\s_-]?jaw|alt[\\s_-]?cene|alt[\\s_-]?çene|mandibular|antagonist|opposing|man)|^(alt)/i;
function detectJaw(name) {
  const s = (name || '').toLowerCase();
  if (JAW_MAX.test(s)) return 'maxilla';
  if (JAW_MAN.test(s)) return 'mandible';
  return 'other';
}
function meshCenter(mesh) {
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const c = new THREE.Vector3(); g.boundingBox.getCenter(c);
  return c.add(mesh.position);
}

// Anterior/posterior işaret düzeltmesi (desktop ThreeScene paritesi): arch U-şekilli,
// ön (kesiciler) X-yayılımı DAR, arka (molarlar) GENİŞ. Z'yi bucket'la; dar yön
// +Z (kamera/ön) olmalı. Dar taraf düşük-Z'deyse 180° Y çevir.
function anteriorSignFix(refMesh) {
  if (!refMesh) return;
  refMesh.updateMatrixWorld(true);
  const pos = refMesh.geometry.attributes.position;
  const N = pos.count, stride = Math.max(1, Math.floor(N / 3000));
  const tmp = new THREE.Vector3();
  const buckets = 12, samples = [];
  let zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < N; i += stride) {
    tmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(refMesh.matrixWorld);
    samples.push({ x: tmp.x, z: tmp.z });
    if (tmp.z < zMin) zMin = tmp.z; if (tmp.z > zMax) zMax = tmp.z;
  }
  const zSpan = (zMax - zMin) || 1;
  const xByBucket = Array.from({ length: buckets }, () => []);
  for (const s of samples) { const b = Math.min(buckets - 1, Math.floor((s.z - zMin) / zSpan * buckets)); xByBucket[b].push(s.x); }
  const spreads = xByBucket.map((arr) => { if (arr.length < 5) return 0; let lo = Infinity, hi = -Infinity; for (const v of arr) { if (v < lo) lo = v; if (v > hi) hi = v; } return hi - lo; });
  const qb = Math.floor(buckets / 4);
  let lowS = 0, highS = 0, lowN = 0, highN = 0;
  for (let i = 0; i < qb; i++) if (spreads[i]) { lowS += spreads[i]; lowN++; }
  for (let i = buckets - qb; i < buckets; i++) if (spreads[i]) { highS += spreads[i]; highN++; }
  const lowAvg = lowN ? lowS / lowN : 0, highAvg = highN ? highS / highN : 0;
  if (lowAvg > 0 && highAvg > 0 && lowAvg < highAvg) {
    const fix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    group.quaternion.premultiply(fix);
    group.updateMatrixWorld(true);
  }
}

function orientGroup() {
  try {
    const list = Array.from(meshes.values());
    if (!list.length) return;
    // İki çene varsa: mandible→maxilla yönü = oklüzal (+Y). Tek çene/belirsizse PCA.
    const maxillas = list.filter((m) => m.userData.jaw === 'maxilla');
    const mandibles = list.filter((m) => m.userData.jaw === 'mandible');
    const avg = (arr) => { if (!arr.length) return null; const c = new THREE.Vector3(); for (const m of arr) c.add(meshCenter(m)); return c.divideScalar(arr.length); };
    const mxC = avg(maxillas), mnC = avg(mandibles);
    let q;
    if (mxC && mnC) {
      const occlusal = new THREE.Vector3().subVectors(mxC, mnC).normalize();
      q = new THREE.Quaternion().setFromUnitVectors(occlusal, new THREE.Vector3(0, 1, 0));
    } else {
      q = computeGroupOrientation(list.map((m) => m.geometry));
    }
    if (q && Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w) && (q.x || q.y || q.z || q.w)) {
      group.quaternion.copy(q);
    } else {
      group.quaternion.identity();
    }
    group.updateMatrixWorld(true);
    anteriorSignFix(maxillas[0] || mandibles[0] || list[0]);
  } catch (e) { /* hizalama başarısızsa ham koordinatta kal */ }
}

function fit() {
  if (meshes.size === 0) return;
  // Group'u origin'e çek (orijinal hizalama korunur)
  const bbox = new THREE.Box3().setFromObject(group);
  const groupCenter = bbox.getCenter(new THREE.Vector3());
  group.position.sub(groupCenter);
  // Sonra kamerayı sığdır
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const dist = (Math.max(size.x, size.y, size.z) / 2) / Math.tan((camera.fov * Math.PI / 180) / 2) * 1.4;
  camera.position.set(center.x, center.y, center.z + dist);
  camera.near = Math.max(0.01, dist / 100); camera.far = dist * 100;
  camera.updateProjectionMatrix();
  if (controls.setTarget) controls.setTarget(center.x, center.y, center.z);
  controls.update();
}

// ── ZIP modu: arşivi WebView'in kendi motorunda indir + aç ────────────────────
// Yalnız mesh girdileri açılır (görsel/diğer atlanır). Açma: yerleşik
// DecompressionStream('deflate-raw') — yoksa ya da arşiv ZIP64/bozuksa fflate.
const MESH_RE = /\\.(stl|ply|obj)$/i;
const JUNK_RE = /(^|\\/)(__MACOSX\\/|\\.DS_Store$|Thumbs\\.db$|\\._)/i;
let stylesResolve = null;
function waitForStyles(ms) {
  return new Promise((resolve) => {
    stylesResolve = resolve;
    setTimeout(() => { if (stylesResolve === resolve) { stylesResolve = null; resolve(null); } }, ms);
  });
}
async function fetchWithProgress(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !res.body.getReader) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = []; let got = 0, lastPct = -1, lastMark = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    if (total) {
      const pct = Math.min(100, Math.floor(got * 100 / total));
      if (pct !== lastPct) { lastPct = pct; post({ type: 'PROGRESS', phase: 'download', pct }); }
    } else if (got - lastMark > 2e6) { lastMark = got; post({ type: 'PROGRESS', phase: 'download' }); }
  }
  const out = new Uint8Array(got); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
async function inflateRaw(u8) {
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function canInflateNative() {
  try { if (typeof DecompressionStream === 'undefined') return false; new DecompressionStream('deflate-raw'); return true; }
  catch { return false; }
}
// Merkezi dizini okuyup yalnız mesh girdilerini açar. Desteklenmeyen durumda null.
async function extractMeshesNative(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || p === 0xffffffff) return null; // ZIP64 → fflate
  const dec = new TextDecoder('utf-8');
  const wanted = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) return null;
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const loff = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (flags & 1) continue;                               // şifreli
    if (!MESH_RE.test(name) || JUNK_RE.test(name)) continue;
    if (method !== 0 && method !== 8) continue;
    if (csize === 0xffffffff || loff === 0xffffffff) return null;
    wanted.push({ name, method, csize, loff });
  }
  const out = [];
  for (let i = 0; i < wanted.length; i++) {
    const w = wanted[i];
    if (dv.getUint32(w.loff, true) !== 0x04034b50) return null;
    const start = w.loff + 30 + dv.getUint16(w.loff + 26, true) + dv.getUint16(w.loff + 28, true);
    const raw = buf.subarray(start, start + w.csize);
    post({ type: 'PROGRESS', phase: 'extract', pct: Math.round((i / wanted.length) * 100) });
    const bytes = w.method === 0 ? raw.slice() : await inflateRaw(raw);
    out.push({ name: w.name, bytes });
  }
  return out;
}
async function extractMeshesFflate(buf) {
  const { unzipSync } = await import('https://esm.sh/fflate@0.8.2');
  const data = unzipSync(buf, { filter: (f) => MESH_RE.test(f.name) && !JUNK_RE.test(f.name) });
  return Object.entries(data).filter(([, b]) => b && b.length).map(([name, bytes]) => ({ name, bytes }));
}
async function extractZip(zip) {
  post({ type: 'PROGRESS', phase: 'download', pct: 0 });
  let buf = await fetchWithProgress(zip.url);
  post({ type: 'PROGRESS', phase: 'extract', pct: 0 });
  let entries = canInflateNative() ? await extractMeshesNative(buf) : null;
  if (!entries) entries = await extractMeshesFflate(buf);
  buf = null;
  const prefix = zip.idPrefix || 'zip';
  const all = entries.map((e, i) => {
    const base = e.name.split('/').pop() || e.name;
    const fmt = (base.split('.').pop() || '').toLowerCase();
    return { id: prefix + '-mesh-' + i, name: base, format: fmt, bytes: e.bytes };
  }).filter((f) => f.bytes.length > 0);
  // Farklı formatlar farklı koordinat sisteminde olabilir → tek formatı göster
  // (normal akıştaki format ayrımıyla aynı öncelik: STL → PLY → OBJ).
  const primary = ['stl', 'ply', 'obj'].find((f) => all.some((x) => x.format === f));
  return primary ? all.filter((x) => x.format === primary) : [];
}

async function loadFile(file) {
  try {
    let buf;
    if (file.bytes) {
      const b = file.bytes; file.bytes = null;              // belleği hemen bırak
      buf = (b.byteOffset === 0 && b.byteLength === b.buffer.byteLength) ? b.buffer : b.slice().buffer;
    } else {
      const res = await fetch(file.url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      buf = await res.arrayBuffer();
    }
    let geom, hasVC = false;
    if (file.format === 'stl') geom = new STLLoader().parse(buf);
    else if (file.format === 'ply') { geom = new PLYLoader().parse(buf); hasVC = !!geom.attributes.color; }
    else if (file.format === 'obj') {
      const grp = new OBJLoader().parse(new TextDecoder().decode(buf));
      let m; grp.traverse(c => { if (c.isMesh && !m) m = c; });
      geom = m ? m.geometry : new THREE.BufferGeometry();
    } else throw new Error('Bilinmeyen format: ' + file.format);

    if (!geom.attributes.normal) geom.computeVertexNormals();
    // RAW koordinatları koru (exocad/3Shape davranışı) — aynı tarama oturumundan
    // gelen dosyalar gerçek okluzyon pozisyonunda gelir.
    geom.computeBoundingBox();
    const sz = new THREE.Vector3(); geom.boundingBox.getSize(sz);

    const style = INPUT.layerStyles[file.id] || {};
    const opacity = style.opacity != null ? style.opacity : 1;
    const mat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(style.color || file.color || '#E8D5C4'),
      vertexColors: hasVC,
      shininess: 42, specular: 0x3a3a3a,
      transparent: opacity < 1, opacity,
      wireframe: !!style.wireframe,
      side: THREE.DoubleSide,
      flatShading: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.visible = style.visible !== false;
    mesh.userData.fileId = file.id;
    // Not/çizim çapası dosya ADIYLA tutulur (ZIP'te id oturuma göre üretilir)
    mesh.userData.fileName = file.name;
    mesh.userData.jaw = detectJaw(file.name); // PCA yerine iki-çene oklüzal ekseni için
    mesh.userData.size = sz;
    // Raw koordinat: dosya kendi orijinal pozisyonunda render edilir.
    // Aynı tarama oturumundan üst+alt+bite → doğal okluzyon korunur.
    mesh.position.y = 0;
    group.add(mesh);
    meshes.set(file.id, mesh);
    post({ type: 'LOADED', fileId: file.id });
  } catch (e) {
    showErr(file.name + ': ' + (e.message || 'yüklenemedi'));
    post({ type: 'ERROR', fileId: file.id, message: String(e.message || e) });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   3D KALEM — tarama üzerine not/çizim
   ─────────────────────────────────────────────────────────────────────────────
   Web viewer'daki (annotationObjects.ts) mantığın WebView kopyası: noktalar
   ÇAPA MESH'İN local uzayında, çarpma normali boyunca dışarı kaydırılmış.
   Nesne o mesh'e child olarak eklenir → grup döndürme/fit kendiliğinden doğru.
   Not: burası inline motor betiği; modül import edilemiyor, bu yüzden aynı
   geometri kuralları elle taşındı. Değişiklikte İKİSİNİ birlikte güncelle. */
const ANNOT_NAME = '__scan_annot__';
let ANNOT_VISIBLE = true;
let PEN = { on: false, kind: 'stroke', color: '#DC2626', width: 0.35 };

function annotMat(color) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color), toneMapped: false });
}

function annotDedupe(points) {
  const out = [];
  for (const p of points) {
    if (!p || p.length < 3) continue;
    const v = new THREE.Vector3(p[0], p[1], p[2]);
    if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) continue;
    if (!out.length || out[out.length - 1].distanceTo(v) > 1e-4) out.push(v);
  }
  return out;
}

function annotLabel(text, color, scale) {
  const lines = [];
  const words = String(text).trim().split(/\\s+/);
  let line = '';
  for (const w of words) {
    if (!line) { line = w; continue; }
    if ((line + ' ' + w).length <= 22) line += ' ' + w; else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  const use = lines.slice(0, 4);
  const fontSize = 30, pad = 14, lineH = fontSize * 1.25;
  const cv = document.createElement('canvas');
  let c = cv.getContext('2d');
  c.font = '600 ' + fontSize + 'px -apple-system, system-ui, sans-serif';
  let w = 0;
  for (const l of use) w = Math.max(w, c.measureText(l).width);
  cv.width = Math.ceil(w + pad * 2);
  cv.height = Math.ceil(use.length * lineH + pad * 2);
  c = cv.getContext('2d');
  c.font = '600 ' + fontSize + 'px -apple-system, system-ui, sans-serif';
  c.textBaseline = 'top';
  const r = 14, x = 1, y = 1, bw = cv.width - 2, bh = cv.height - 2;
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + bw, y, x + bw, y + bh, r);
  c.arcTo(x + bw, y + bh, x, y + bh, r);
  c.arcTo(x, y + bh, x, y, r);
  c.arcTo(x, y, x + bw, y, r);
  c.closePath();
  c.fillStyle = 'rgba(255,255,255,0.96)'; c.fill();
  c.lineWidth = 3; c.strokeStyle = color; c.stroke();
  c.fillStyle = '#0A0A0A';
  use.forEach((l, i) => c.fillText(l, pad, pad + i * lineH));
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, toneMapped: false }));
  sp.scale.set((cv.width / cv.height) * scale, scale, 1);
  return sp;
}

function buildAnnot(a, labelScale) {
  const pts = annotDedupe(a.points || []);
  if (!pts.length) return null;
  const radius = Math.max(0.05, Math.min(5, a.width || 0.35));
  let obj = null;
  if (a.kind === 'stroke') {
    if (pts.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
    const seg = Math.min(1200, Math.max(8, pts.length * 3));
    obj = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, radius, 6, false), annotMat(a.color));
    const capGeom = new THREE.SphereGeometry(radius, 8, 6);
    const capMat = annotMat(a.color);
    const c1 = new THREE.Mesh(capGeom, capMat); c1.position.copy(pts[0]); obj.add(c1);
    const c2 = new THREE.Mesh(capGeom, capMat); c2.position.copy(pts[pts.length - 1]); obj.add(c2);
  } else if (a.kind === 'arrow') {
    if (pts.length < 2) return null;
    const from = pts[0], to = pts[pts.length - 1];
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 1e-4) return null;
    dir.normalize();
    const headLen = Math.min(len * 0.42, radius * 6);
    const shaftLen = Math.max(len - headLen, len * 0.25);
    obj = new THREE.Group();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, shaftLen, 6), annotMat(a.color));
    shaft.quaternion.copy(quat);
    shaft.position.copy(from).addScaledVector(dir, shaftLen / 2);
    obj.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.4, headLen, 10), annotMat(a.color));
    head.quaternion.copy(quat);
    head.position.copy(to).addScaledVector(dir, -headLen / 2);
    obj.add(head);
  } else {
    obj = new THREE.Group();
    const pin = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.8, 12, 10), annotMat(a.color));
    pin.position.copy(pts[0]);
    obj.add(pin);
    if (a.text) {
      try {
        const lb = annotLabel(a.text, a.color, labelScale);
        lb.position.copy(pts[0]);
        lb.position.y += labelScale * 0.9;
        obj.add(lb);
      } catch (e) { /* etiket çizilemezse iğne yeter */ }
    }
  }
  if (!obj) return null;
  obj.name = ANNOT_NAME;
  obj.renderOrder = 3;
  obj.visible = ANNOT_VISIBLE;
  return obj;
}

function disposeAnnot(obj) {
  obj.traverse((o) => {
    if (o.geometry && o.geometry.dispose) o.geometry.dispose();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => { if (x.map) x.map.dispose(); if (x.dispose) x.dispose(); });
    else if (m) { if (m.map) m.map.dispose(); if (m.dispose) m.dispose(); }
  });
  if (obj.parent) obj.parent.remove(obj);
}

/* Sahnedeki not nesneleri: id → { obj, sig }. RN her değişimde TÜM listeyi
   yolluyor; hepsini yeniden kurmak israf ve görsel "yanıp sönme" yapıyordu. */
const ANNOT_OBJS = new Map();

function renderAnnotations(list) {
  const arr = Array.isArray(list) ? list : [];
  const box = new THREE.Box3().setFromObject(group);
  const span = box.getSize(new THREE.Vector3()).length() || 50;
  const labelScale = Math.max(1.5, Math.min(10, span * 0.055));
  const byName = new Map();
  meshes.forEach((m) => {
    const n = m.userData && m.userData.fileName;
    if (n && !byName.has(n)) byName.set(n, m);
  });
  const sigOf = (a) => [a.kind, a.color, a.width, a.text || '', a.fileName || '',
    (a.points || []).length, labelScale.toFixed(2)].join('|');

  const live = new Set();
  for (const a of arr) {
    const id = a.id || JSON.stringify(a.points && a.points[0]);
    live.add(id);
    const prev = ANNOT_OBJS.get(id);
    const sig = sigOf(a);
    if (prev && prev.sig === sig && prev.obj.parent) { prev.obj.visible = ANNOT_VISIBLE; continue; }
    if (prev) { disposeAnnot(prev.obj); ANNOT_OBJS.delete(id); }
    const obj = buildAnnot(a, labelScale);
    if (!obj) continue;
    const anchor = a.fileName ? byName.get(a.fileName) : null;
    (anchor || group).add(obj);
    ANNOT_OBJS.set(id, { obj, sig });
  }
  ANNOT_OBJS.forEach((entry, id) => {
    if (!live.has(id)) { disposeAnnot(entry.obj); ANNOT_OBJS.delete(id); }
  });
}

// ── Kalem dokunma yakalama ────────────────────────────────────────────────
(function setupPen() {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let anchor = null, localPts = [], preview = null, drawing = false;

  const invMat = new THREE.Matrix4();
  const localRay = new THREE.Ray();

  /* BVH önbelleği — ham intersectObjects 1.3M üçgende hareket başına ~50 ms
     sürüyordu ve çizim takılıyordu. Ağaç geometri üstünde saklanır. */
  function bvhFor(mesh) {
    const g = mesh.geometry;
    if (g.__penBVH) return g.__penBVH;
    // window üzerinden: gömülü motor MeshBVH'yi global olarak veriyor. CDN
    // yedek yolunda yok → çıplak isim ReferenceError atardı, o yüzden window.
    const Ctor = window.MeshBVH;
    if (!Ctor) return null;
    try { g.__penBVH = new Ctor(g, { maxLeafSize: 12 }); return g.__penBVH; }
    catch (e) { return null; }
  }

  /** Ekran noktası → yüzey noktası, ÇAPA MESH'İN local uzayında (+ normal ofseti). */
  function pickLocal(clientX, clientY, only) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const targets = [];
    if (only) targets.push(only);
    else meshes.forEach((m) => { if (m.visible) targets.push(m); });

    let best = null;
    for (const mesh of targets) {
      const tree = bvhFor(mesh);
      const r = Math.max(0.05, Math.min(5, PEN.width || 0.35));
      if (tree) {
        invMat.copy(mesh.matrixWorld).invert();
        localRay.copy(ray.ray).applyMatrix4(invMat);
        const hit = tree.raycastFirst(localRay, THREE.DoubleSide);
        if (!hit) continue;
        const n = (hit.face && hit.face.normal) ? hit.face.normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
        const p = hit.point.clone().addScaledVector(n, r * 1.25);
        if (!best || hit.distance < best.dist) best = { mesh, point: p, dist: hit.distance };
      } else {
        const hits = ray.intersectObject(mesh, false);
        if (!hits.length) continue;
        const h = hits[0];
        const local = mesh.worldToLocal(h.point.clone());
        const n = (h.face && h.face.normal) ? h.face.normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
        if (!best || h.distance < best.dist) best = { mesh, point: local.addScaledVector(n, r * 1.25), dist: h.distance };
      }
    }
    return best;
  }

  function clearPreview() { if (preview) { disposeAnnot(preview); preview = null; } }

  function camSnapshot() {
    const p = camera.position;
    const t = (controls && controls.target) ? controls.target : new THREE.Vector3();
    return { pos: [p.x, p.y, p.z], target: [t.x, t.y, t.z], fov: camera.fov };
  }

  function finish() {
    if (!drawing) return;
    drawing = false;
    clearPreview();
    const pts = localPts.map((v) => [v.x, v.y, v.z]);
    localPts = [];
    const name = (anchor && anchor.userData && anchor.userData.fileName) || null;
    anchor = null;
    if (!pts.length) return;
    if (PEN.kind === 'note') { post({ type: 'PEN_CAPTURE', fileName: name, points: [pts[0]], camera: camSnapshot() }); return; }
    if (pts.length < 2) return;
    if (PEN.kind === 'arrow') { post({ type: 'PEN_CAPTURE', fileName: name, points: [pts[0], pts[pts.length - 1]], camera: camSnapshot() }); return; }
    post({ type: 'PEN_CAPTURE', fileName: name, points: pts, camera: camSnapshot() });
  }

  /* Önizleme tamponu ÖN-TAHSİSLİ: her hareketde yeni BufferGeometry kurmak
     saniyede 60 tahsis + GPU upload demekti. Tek buffer + drawRange. */
  const MAX_PTS = 2048;
  const previewArr = new Float32Array(MAX_PTS * 3);
  let previewAttr = null;

  function ensurePreview() {
    if (preview || !anchor) return;
    const geom = new THREE.BufferGeometry();
    previewAttr = new THREE.BufferAttribute(previewArr, 3);
    previewAttr.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('position', previewAttr);
    geom.setDrawRange(0, 0);
    preview = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: new THREE.Color(PEN.color), toneMapped: false }));
    preview.name = ANNOT_NAME;
    preview.renderOrder = 4;
    preview.frustumCulled = false;
    anchor.add(preview);
  }

  function refreshPreview() {
    if (!preview || !previewAttr || localPts.length < 2) return;
    const n = Math.min(localPts.length, MAX_PTS);
    for (let i = 0; i < n; i++) {
      const v = localPts[i];
      previewArr[i * 3] = v.x; previewArr[i * 3 + 1] = v.y; previewArr[i * 3 + 2] = v.z;
    }
    previewAttr.needsUpdate = true;
    preview.geometry.setDrawRange(0, n);
  }

  function onStart(ev) {
    if (!PEN.on) return;
    const t = ev.touches ? ev.touches[0] : ev;
    if (!t) return;
    // İki parmak = kullanıcı yakınlaştırmak istiyor; çizimi iptal et
    if (ev.touches && ev.touches.length > 1) { drawing = false; clearPreview(); localPts = []; return; }
    ev.preventDefault();
    const hit = pickLocal(t.clientX, t.clientY, null);
    if (!hit) return;
    anchor = hit.mesh;
    localPts = [hit.point];
    drawing = true;
    if (PEN.kind === 'note') { finish(); return; }
    ensurePreview();
  }

  /* touchmove ~60-120/s tetikleniyor; iş rAF'ta BİR KEZ yapılır. */
  let pendingXY = null, rafId = null;

  function consume() {
    rafId = null;
    const xy = pendingXY; pendingXY = null;
    if (!xy || !drawing || !anchor) return;
    const hit = pickLocal(xy.x, xy.y, anchor);
    if (!hit) return;
    const p = hit.point;
    if (PEN.kind === 'arrow') {
      if (localPts.length === 1) localPts.push(p); else localPts[1] = p;
    } else {
      const last = localPts[localPts.length - 1];
      if (last && last.distanceTo(p) < PEN.width * 0.9) return;
      if (localPts.length > 2000) return;
      localPts.push(p);
    }
    refreshPreview();
  }

  function onMove(ev) {
    if (!PEN.on || !drawing || !anchor) return;
    const t = ev.touches ? ev.touches[0] : ev;
    if (!t) return;
    ev.preventDefault();
    pendingXY = { x: t.clientX, y: t.clientY };
    if (rafId === null) rafId = requestAnimationFrame(consume);
  }

  function onEnd(ev) {
    if (!PEN.on) return;
    if (ev && ev.preventDefault) ev.preventDefault();
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    pendingXY = null;
    finish();
  }

  // touch + pointer: iOS WKWebView'de touch olayları güvenilir, masaüstü
  // önizlemede (Chrome device mode) pointer gerekiyor.
  canvas.addEventListener('touchstart', onStart, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onEnd, { passive: false });
  canvas.addEventListener('touchcancel', onEnd, { passive: false });
  /* Kalem açılınca BVH'yi önden kur: 1.3M üçgende ~0.4 s sürüyor, ilk
     dokunuşta yapılırsa ilk çizgi takılıyor. */
  window.__penWarmup = function () {
    setTimeout(() => { meshes.forEach((m) => { if (m.visible) bvhFor(m); }); }, 30);
  };

  canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') onStart(e); });
  canvas.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') onMove(e); });
  canvas.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') onEnd(e); });
})();

// RN → WebView mesajları
function handleMessage(ev) {
  let msg;
  try { msg = JSON.parse(ev.data); } catch { return; }
  if (!msg || !msg.type) return;
  switch (msg.type) {
    case 'TOGGLE_LAYER': {
      const m = meshes.get(msg.fileId); if (m) m.visible = !!msg.visible;
      break;
    }
    case 'SET_OPACITY': {
      const m = meshes.get(msg.fileId); if (m) {
        m.material.opacity = msg.value;
        m.material.transparent = msg.value < 1;
        m.material.needsUpdate = true;
      }
      break;
    }
    case 'SET_COLOR': {
      const m = meshes.get(msg.fileId);
      if (m && !m.material.vertexColors) { m.material.color.set(msg.hex); m.material.needsUpdate = true; }
      break;
    }
    case 'SET_WIREFRAME': {
      const m = meshes.get(msg.fileId);
      if (m) { m.material.wireframe = !!msg.on; m.material.needsUpdate = true; }
      break;
    }
    case 'LAYER_STYLES': {
      if (stylesResolve) { const r = stylesResolve; stylesResolve = null; r(msg.styles || null); }
      break;
    }
    case 'FIT': fit(); break;
    case 'SET_GRID': {
      const el = document.getElementById('gridbg');
      if (el) el.style.display = msg.on ? 'block' : 'none';
      break;
    }
    case 'RESET': {
      camera.up.set(0, 1, 0); fit(); break;
    }
    case 'SET_FOV': {
      camera.fov = msg.deg; camera.updateProjectionMatrix(); break;
    }
    case 'SET_PRESET': {
      // Dental kamera açıları (desktop paritesi): dir + up + easeOutCubic tween.
      const PRESETS = {
        frontal:  { dir: [0, 0, 1],      up: [0, 1, 0]  },
        occlusal: { dir: [0, 1, 0.001],  up: [0, 0, -1] },
        left:     { dir: [-1, 0, 0],     up: [0, 1, 0]  },
        right:    { dir: [1, 0, 0],      up: [0, 1, 0]  },
        upper:    { dir: [0, -1, 0.001], up: [0, 0, 1]  },
        lower:    { dir: [0, 1, 0.001],  up: [0, 0, -1] },
        iso:      { dir: [1, 0.7, 1],    up: [0, 1, 0]  },
      };
      const cfg = PRESETS[msg.preset] || PRESETS.frontal;
      const box = new THREE.Box3().setFromObject(group);
      const target = box.getCenter(new THREE.Vector3());
      if (controls.setTarget) controls.setTarget(target.x, target.y, target.z);
      const dist = camera.position.distanceTo(target);
      const fromPos = camera.position.clone();
      const fromUp = camera.up.clone();
      const dir = new THREE.Vector3(cfg.dir[0], cfg.dir[1], cfg.dir[2]).normalize();
      const toPos = target.clone().addScaledVector(dir, dist);
      const toUp = new THREE.Vector3(cfg.up[0], cfg.up[1], cfg.up[2]).normalize();
      const start = performance.now(), dur = 460;
      const ease = (k) => 1 - Math.pow(1 - k, 3);
      (function anim() {
        const k = Math.min(1, (performance.now() - start) / dur), e = ease(k);
        camera.position.lerpVectors(fromPos, toPos, e);
        camera.up.copy(fromUp).lerp(toUp, e).normalize();
        camera.lookAt(target); camera.updateProjectionMatrix(); controls.update();
        if (k < 1) requestAnimationFrame(anim);
      })();
      break;
    }
    case 'SET_PEN': {
      // Kalem açıkken kamera kontrolü KAPANIR: aynı sürükleme hem döndürüp
      // hem çizemez (web viewer ile aynı kural).
      PEN = {
        on: !!msg.on,
        kind: msg.kind || 'stroke',
        color: msg.color || '#DC2626',
        width: Math.max(0.05, Math.min(5, Number(msg.width) || 0.35)),
      };
      controls.enabled = !PEN.on;
      if (PEN.on && window.__penWarmup) window.__penWarmup();
      break;
    }
    case 'ANNOTATIONS': {
      renderAnnotations(Array.isArray(msg.list) ? msg.list : []);
      break;
    }
    case 'ANNOT_VISIBLE': {
      ANNOT_VISIBLE = !!msg.on;
      group.traverse((o) => { if (o.name === ANNOT_NAME) o.visible = ANNOT_VISIBLE; });
      break;
    }
    case 'SCREENSHOT': {
      try {
        renderer.render(scene, camera);
        const data = renderer.domElement.toDataURL('image/png');
        post({ type: 'SHOT', data });
      } catch (e) {
        post({ type: 'SHOT_ERR', message: String((e && e.message) || e) });
      }
      break;
    }
  }
}
// iOS + Android Webview için iki listener
document.addEventListener('message', handleMessage);
window.addEventListener('message', handleMessage);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// Render loop
function tick() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// ZIP modu: önce arşivi aç, mesh listesini RN'e bildir, katman stillerini bekle.
let FILES = INPUT.files;
if (INPUT.zip) {
  try {
    FILES = await extractZip(INPUT.zip);
  } catch (e) {
    showErr('Arşiv açılamadı: ' + String((e && e.message) || e));
    post({ type: 'ERROR', message: 'zip: ' + String((e && e.message) || e) });
    return;
  }
  if (!FILES.length) { hideLoad(); post({ type: 'ZIP_EMPTY' }); return; }
  post({ type: 'MANIFEST', files: FILES.map((f) => ({ id: f.id, name: f.name, format: f.format })) });
  const styles = await waitForStyles(1500);
  if (styles) INPUT.layerStyles = styles;
  post({ type: 'PROGRESS', phase: 'parse' });
}

// Tüm dosyaları paralel yükle, PCA ile hizala, sonra fit
await Promise.all(FILES.map(loadFile));
orientGroup(); // kamera açıları doğru çalışsın diye dünya eksenine oturt
fit();
hideLoad();
post({ type: 'READY' });
})();
</script>
</body>
</html>`;
}
