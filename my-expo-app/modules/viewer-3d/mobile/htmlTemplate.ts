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
  #app { position: fixed; inset: 0; touch-action: none; }
  canvas { display: block; width: 100% !important; height: 100% !important; }
  #err {
    position: fixed; bottom: 12px; left: 12px; right: 12px;
    padding: 10px 12px; border-radius: 10px;
    background: rgba(220,38,38,0.18); color: #FCA5A5;
    border: 1px solid rgba(220,38,38,0.4);
    font: 600 11px/1.4 -apple-system, system-ui, sans-serif;
    display: none;
  }
</style>
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.183.2/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.183.2/examples/jsm/"
  }
}
</script>
</head>
<body>
<div id="app"><canvas id="cv"></canvas></div>
<div id="err"></div>

<script type="module">
import * as THREE from 'three';
import { ArcballControls } from 'three/addons/controls/ArcballControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const INPUT = ${payload};
const post = (msg) => {
  try { window.ReactNativeWebView?.postMessage(JSON.stringify(msg)); } catch {}
};
const showErr = (m) => { const el = document.getElementById('err'); if (el) { el.textContent = m; el.style.display = 'block'; } };

const canvas = document.getElementById('cv');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(new THREE.Color(INPUT.bg), 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.position.set(0, 0, 200);

scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(100, 150, 100); scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.4); fill.position.set(-100, -50, -100); scene.add(fill);

const group = new THREE.Group(); scene.add(group);
const controls = new ArcballControls(camera, canvas, scene);
controls.setGizmosVisible(false);
controls.enableAnimations = false;

const meshes = new Map(); // fileId -> mesh

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
      shininess: 28, specular: 0x222222,
      transparent: opacity < 1, opacity,
      wireframe: !!style.wireframe,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.visible = style.visible !== false;
    mesh.userData.fileId = file.id;
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
    case 'RESET': {
      camera.up.set(0, 1, 0); fit(); break;
    }
    case 'SET_FOV': {
      camera.fov = msg.deg; camera.updateProjectionMatrix(); break;
    }
    case 'SET_PRESET': {
      // basit preset: pozisyonu hedefe göre yeniden ayarla
      const t = new THREE.Vector3(); group.getWorldPosition(t);
      const d = camera.position.distanceTo(t);
      const dirs = {
        default: [0,0,1], top:[0,1,0], bottom:[0,-1,0], front:[0,0,1], back:[0,0,-1],
        left:[-1,0,0], right:[1,0,0], iso:[1,1,1],
      };
      const dv = dirs[msg.preset] || dirs.default;
      const v = new THREE.Vector3(dv[0], dv[1], dv[2]).normalize();
      camera.position.copy(t).addScaledVector(v, d);
      camera.lookAt(t); controls.update();
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

// Tüm dosyaları paralel yükle, sonra fit
Promise.all(INPUT.files.map(loadFile)).then(() => { fit(); post({ type: 'READY' }); });
</script>
</body>
</html>`;
}
