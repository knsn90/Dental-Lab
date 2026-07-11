/**
 * scene — Three.js scene setup helpers.
 *
 * Pure functions — no React. Easier to test, no re-render overhead.
 */
import * as THREE from 'three';
import { ArcballControls } from 'three/examples/jsm/controls/ArcballControls.js';

export interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: ArcballControls;
}

/** Create renderer + scene + camera + orbit controls + lighting. */
export function createScene(canvas: HTMLCanvasElement, width: number, height: number): SceneRefs {
  // Renderer
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x0e0e0e, 1); // dark stage like exocad

  // Scene
  const scene = new THREE.Scene();

  // Camera — perspective, FOV 35° (dental viewing default)
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 5000);
  camera.position.set(0, 0, 200);

  // Studio dental lighting — hemi (sky/ground) + 3-point + rim
  // Klinik premium görünüm: yumuşak ambient + cavity okunabilirliği için
  // güçlü key, fill ile gölge yumuşatma, rim ile diş kontur belirginliği.
  const hemi = new THREE.HemisphereLight(0xfff5e6, 0xd9d2c7, 0.55);
  hemi.position.set(0, 200, 0);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
  keyLight.position.set(120, 180, 140);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xfdf6ec, 0.45);
  fillLight.position.set(-140, 80, -60);
  scene.add(fillLight);

  // Rim — arkadan/üstten ince kontur ışığı (clinical premium feel)
  const rimLight = new THREE.DirectionalLight(0xfff8e7, 0.55);
  rimLight.position.set(-60, 220, -180);
  scene.add(rimLight);

  // Soft bottom bounce — dişlerin alt tarafı kapanmasın
  const bounceLight = new THREE.DirectionalLight(0xf5ebd6, 0.18);
  bounceLight.position.set(0, -200, 80);
  scene.add(bounceLight);

  // Arcball controls — X, Y, Z üç eksende tam serbest 360° dönüş.
  // Cursor screen center'a olan konumu trackball küresine projekte edilir →
  // tüm açılardan roll dahil dönüş mümkün. Diş modelini ters çevir, yandan bak,
  // tepeden bak — hepsi tek sürüklemeyle.
  const controls = new ArcballControls(camera, canvas, scene);
  controls.setGizmosVisible(false);          // gizmo kapalı, sade görünüm
  controls.enableAnimations = false;          // anında tepki — smooth easing kapalı
  controls.dampingFactor = 25;
  controls.rotateSpeed = 1.0;
  controls.scaleFactor = 1.5;          // tekerlek başına daha büyük adım — hızlı zoom (eski 1.1 çok yavaştı)
  controls.minDistance = 1;
  controls.maxDistance = 3000;
  // Full 360° her eksende — exocad benzeri kısıtsız rotation
  (controls as any).enableRotate = true;
  (controls as any).enableZoom = true;
  (controls as any).enablePan = true;
  // Up vektör değişimini serbest bırak — X ekseni etrafında dönüşte camera.up
  // sabitse roll kilitlenir. ArcballControls bunu desteklemeli ama emin olalım.
  (controls as any).setCamera?.(camera);

  return { renderer, scene, camera, controls };
}

/** Compute bounding box + center geometry at world origin. */
export function centerGeometry(geom: THREE.BufferGeometry): { center: THREE.Vector3; size: THREE.Vector3 } {
  geom.computeBoundingBox();
  const bb = geom.boundingBox!;
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bb.getCenter(center);
  bb.getSize(size);
  // Shift so geometry centered at origin
  geom.translate(-center.x, -center.y, -center.z);
  return { center, size };
}

/** Fit camera to scene bounding box with padding. */
export function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: any, // ArcballControls / TrackballControls / OrbitControls — hepsi target/update destekler
  object: THREE.Object3D,
  padding = 1.4,
) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  let maxDim = Math.max(size.x, size.y, size.z);
  // Dejenere / sonlu-olmayan kutu (bozuk tarama) → güvenli varsayılan ölçek.
  if (!Number.isFinite(maxDim) || maxDim <= 0) maxDim = 50;
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z)) {
    center.set(0, 0, 0);
  }
  const fov = camera.fov * (Math.PI / 180);
  let dist = (maxDim / 2) / Math.tan(fov / 2);
  dist *= padding;

  camera.position.set(center.x, center.y, center.z + dist);
  camera.near = Math.max(0.01, dist / 100);
  camera.far = dist * 100;
  camera.updateProjectionMatrix();

  // ArcballControls: setTarget metodu varsa kullan, yoksa target mutate et
  if (typeof controls.setTarget === 'function') {
    controls.setTarget(center.x, center.y, center.z);
  } else if (controls.target) {
    controls.target.copy(center);
  }
  if (typeof controls.update === 'function') controls.update();
}

/** Dispose geometry / material / textures — prevent GPU memory leaks. */
export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
  });
}
