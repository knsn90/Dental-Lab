// Offline 3D motor giriş noktası — esbuild ile TEK IIFE dosyaya paketlenir ve
// WebView içinde inline <script> olarak çalıştırılır. three.js + loader'lar
// uygulamanın içinde gömülü olduğundan CDN/internet GEREKMEZ (siyah ekran riski yok).
//
// Değiştirdikten sonra yeniden paketle:  node scripts/build-viewer-engine.mjs
import * as THREE from 'three';
import { ArcballControls } from 'three/examples/jsm/controls/ArcballControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
// MeshBVH: 3D kalem her dokunma hareketinde yüzey noktası arıyor. Ham
// raycast 1.3M üçgenlik çenede hareket başına ~50 ms sürüyor ve çizim
// takılıyor (kullanıcı cihazda gördü); BVH ile aynı sorgu ~0.05 ms.
import { MeshBVH } from 'three-mesh-bvh';

// Tek three örneği — loader'lar da bu bundle içindeki aynı 'three'yi import eder.
window.THREE = THREE;
window.ArcballControls = ArcballControls;
window.STLLoader = STLLoader;
window.PLYLoader = PLYLoader;
window.OBJLoader = OBJLoader;
window.MeshBVH = MeshBVH;
window.__ENGINE_READY__ = true;
