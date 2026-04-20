// modules/occlusion/components/OcclusionViewer.tsx
// Three.js scene mount + OrbitControls + raycast click dispatch
// Prototip: app/scene.jsx (WebGLRenderer, lights, OrbitControls, animate loop)
//
// Web-only: Three.js WebGL context gerektirir.

import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';
import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import { pickMeshPoint, eventToNDC } from '../utils/measurementCalc';
import type { Mode, SceneClickEvent, ViewPreset } from '../types/occlusion';

interface Props {
  upperMesh:    THREE.Mesh | null;
  lowerMesh:    THREE.Mesh | null;
  mode:         Mode;
  viewPreset:   ViewPreset;
  onReady?:     (renderer: THREE.WebGLRenderer, camera: THREE.Camera, canvasSize: { w: number; h: number }) => void;
  onClick?:     (event: SceneClickEvent) => void;
  onCameraMove?: () => void;
}

// Preset'ler mesh boyutuna göre dinamik hesaplanır (fitCameraToMeshes içinde).
// Aşağıdaki unit vector'lar yön belirler, distance runtime'da çarpılır.
const VIEW_PRESET_DIRS: Record<ViewPreset, [number, number, number]> = {
  front: [0,    0.1,  1],
  top:   [0,    1,    0.05],
  right: [1,    0.1,  0],
  left:  [-1,   0.1,  0],
  iso:   [0.6,  0.5,  0.8],
};

export function OcclusionViewer({
  upperMesh, lowerMesh, mode, viewPreset, onReady, onClick, onCameraMove,
}: Props) {
  const mountRef     = useRef<HTMLDivElement | null>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef     = useRef<THREE.Scene | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef  = useRef<TrackballControls | null>(null);
  const upperSlotRef = useRef<THREE.Mesh | null>(null);
  const lowerSlotRef = useRef<THREE.Mesh | null>(null);
  const rafRef       = useRef<number | null>(null);
  // Bounding sphere bilgileri (mesh'ler yüklenince hesaplanır)
  const bsCenterRef  = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const bsRadiusRef  = useRef<number>(30); // default fallback
  const [sizeTick, setSizeTick] = useState({ w: 0, h: 0 });

  // Web-only guard
  if (Platform.OS !== 'web') {
    return (
      <View style={s.nonWeb}>
        <Text style={s.nonWebText}>
          3D görüntüleme yalnızca web sürümünde desteklenir.
        </Text>
      </View>
    );
  }

  // ─── Scene initialization ────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth;
    const h = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0xf8fafc, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Perspective kamera — near/far bounding sphere'e göre update edilecek
    const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 2000);
    camera.position.set(40, 30, 55);

    // TrackballControls — 360° serbest rotasyon (gimbal lock yok).
    // OrbitControls dikey eksende 0-180° ile sınırlı; dental viewer için
    // her açıdan bakmak gerekli (occlusal, buccal, lingual, alttan vs.).
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed      = 3.0;
    controls.zoomSpeed        = 1.2;
    controls.panSpeed         = 0.8;
    controls.noRotate         = false;
    controls.noZoom           = false;
    controls.noPan            = false;
    controls.staticMoving     = false;
    controls.dynamicDampingFactor = 0.15;
    // min/maxDistance fit olduğunda güncellenecek
    controls.minDistance = 1;
    controls.maxDistance = 1000;
    controls.target.set(0, 0, 0);

    // Lights — prototip clinical
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(8, 20, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffe8d0, 0.25);
    fill.position.set(-10, -4, 10);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xd0e4ff, 0.3);
    rim.position.set(0, 6, -15);
    scene.add(rim);

    // Ground shadow
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.ShadowMaterial({ opacity: 0.06 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -8;
    ground.receiveShadow = true;
    scene.add(ground);

    rendererRef.current = renderer;
    sceneRef.current    = scene;
    cameraRef.current   = camera;
    controlsRef.current = controls;

    setSizeTick({ w, h });
    onReady?.(renderer, camera, { w, h });

    // ─── Click handler for measurement mode ───────────────
    const handleClick = (ev: MouseEvent) => {
      if (!onClick || !upperSlotRef.current || !lowerSlotRef.current) return;
      const ndc = eventToNDC(ev, renderer.domElement);
      const picked = pickMeshPoint(ndc, camera, upperSlotRef.current, lowerSlotRef.current);
      if (picked) onClick(picked);
    };
    renderer.domElement.addEventListener('click', handleClick);

    // ─── Resize ───────────────────────────────────────────
    const handleResize = () => {
      const newW = mount.clientWidth;
      const newH = mount.clientHeight;
      renderer.setSize(newW, newH);
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      // TrackballControls screen koordinatlarını cache ediyor — resize'da güncelle
      controls.handleResize();
      setSizeTick({ w: newW, h: newH });
    };
    window.addEventListener('resize', handleResize);
    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);

    // ─── Animate loop ─────────────────────────────────────
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      onCameraMove?.();
    };
    animate();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', handleResize);
      ro.disconnect();
      renderer.domElement.removeEventListener('click', handleClick);
      renderer.dispose();
      controls.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Kamera mesh'lere otomatik fit et ─────────────────────
  // Combined bounding sphere → near/far, min/max distance, zoom speed,
  // view preset'leri hepsi mesh boyutuna göre ayarlanır.
  const fitCameraToMeshes = React.useCallback(() => {
    const camera   = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const meshes: THREE.Mesh[] = [];
    if (upperSlotRef.current) meshes.push(upperSlotRef.current);
    if (lowerSlotRef.current) meshes.push(lowerSlotRef.current);
    if (meshes.length === 0) return;

    // Birleşik bounding box hesapla
    const box = new THREE.Box3();
    meshes.forEach((m) => {
      m.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(m);
      box.union(b);
    });
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    const size   = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const radius = size.length() / 2; // bounding sphere radius

    bsCenterRef.current.copy(center);
    bsRadiusRef.current = radius;

    // Kamera FOV'a göre gerekli mesafe (mesh tamamını ekrana sığdırmak için)
    const fov = (camera.fov * Math.PI) / 180;
    const fitDistance = radius / Math.sin(fov / 2);

    // Near / Far — radius'a göre
    camera.near = Math.max(0.01, radius / 1000);
    camera.far  = radius * 100;

    // Controls limits
    controls.minDistance = radius * 0.2;
    controls.maxDistance = radius * 15;
    controls.zoomSpeed   = 1.2;

    // Target = bounding box merkezi
    controls.target.copy(center);

    // Kamerayı mevcut yönünden, ama doğru mesafede konumlandır
    const currentDir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    // İlk fit'te iso preset yönü kullan
    if (currentDir.lengthSq() < 0.01) {
      currentDir.set(0.6, 0.5, 0.8).normalize();
    }
    camera.position.copy(center).addScaledVector(currentDir, fitDistance * 1.4);

    camera.updateProjectionMatrix();
    controls.update();

    console.log(`[viewer] fit: radius=${radius.toFixed(1)}mm, dist=${(fitDistance * 1.4).toFixed(1)}, min=${(radius * 0.2).toFixed(1)}, max=${(radius * 15).toFixed(1)}`);
  }, []);

  // ─── Upper mesh slot ─────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (upperSlotRef.current) {
      scene.remove(upperSlotRef.current);
      upperSlotRef.current = null;
    }
    if (upperMesh) {
      scene.add(upperMesh);
      upperSlotRef.current = upperMesh;
      fitCameraToMeshes();
    }
  }, [upperMesh, fitCameraToMeshes]);

  // ─── Lower mesh slot ─────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (lowerSlotRef.current) {
      scene.remove(lowerSlotRef.current);
      lowerSlotRef.current = null;
    }
    if (lowerMesh) {
      scene.add(lowerMesh);
      lowerSlotRef.current = lowerMesh;
      fitCameraToMeshes();
    }
  }, [lowerMesh, fitCameraToMeshes]);

  // ─── View preset → kamera animasyonu (bounding sphere'e göre dinamik) ──
  useEffect(() => {
    const camera   = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const center = bsCenterRef.current;
    const radius = bsRadiusRef.current;
    const fov = (camera.fov * Math.PI) / 180;
    const fitDistance = (radius / Math.sin(fov / 2)) * 1.4;

    const dir = new THREE.Vector3(...VIEW_PRESET_DIRS[viewPreset]).normalize();
    const end = new THREE.Vector3()
      .copy(center)
      .addScaledVector(dir, fitDistance);

    const start    = camera.position.clone();
    const startTgt = controls.target.clone();
    const endTgt   = center.clone();

    const duration = 500;
    const t0 = performance.now();

    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(start, end, eased);
      controls.target.lerpVectors(startTgt, endTgt, eased);
      if (t < 1) requestAnimationFrame(step);
    };
    step();
  }, [viewPreset]);

  // ─── Cursor by mode ───────────────────────────────────────
  const cursor = mode === 'measurement' ? 'crosshair' : 'grab';

  return (
    <View style={s.wrap}>
      <div
        ref={mountRef}
        style={{
          width:  '100%',
          height: '100%',
          cursor,
          position: 'relative',
        } as any}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  nonWeb: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  nonWebText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
});
