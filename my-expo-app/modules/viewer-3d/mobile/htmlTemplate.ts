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
 */

import type { ViewerFile, LayerStyle } from '../types';
import { VIEWER_ENGINE_JS } from './viewerEngineBundle.generated';

interface BuildInput {
  files: ViewerFile[];
  layerStyles: Record<string, LayerStyle>;
  /** Background color hex (örn: '#0e0e0e') */
  bg?: string;
}

export function buildViewerHtml({ files, layerStyles, bg = '#0e0e0e' }: BuildInput): string {
  const payload = JSON.stringify({ files, layerStyles, bg });
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
      linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px);
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
const JAW_MAX = /(\b|_)(maxilla|upper[\s_-]?jaw|ust[\s_-]?cene|üst[\s_-]?çene|maxiller|maks)|^(ust|üst)/i;
const JAW_MAN = /(\b|_)(mandible|lower[\s_-]?jaw|alt[\s_-]?cene|alt[\s_-]?çene|mandibular|antagonist|opposing|man)|^(alt)/i;
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

async function loadFile(file) {
  try {
    const res = await fetch(file.url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
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

// Tüm dosyaları paralel yükle, PCA ile hizala, sonra fit
await Promise.all(INPUT.files.map(loadFile));
orientGroup(); // kamera açıları doğru çalışsın diye dünya eksenine oturt
fit();
hideLoad();
post({ type: 'READY' });
})();
</script>
</body>
</html>`;
}
