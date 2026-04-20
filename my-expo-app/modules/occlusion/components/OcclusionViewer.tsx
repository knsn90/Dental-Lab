// modules/occlusion/components/OcclusionViewer.tsx
// Three.js scene mount + OrbitControls + raycast click dispatch
// Prototip: app/scene.jsx (WebGLRenderer, lights, OrbitControls, animate loop)
//
// Web-only: Three.js WebGL context gerektirir.

import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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

const VIEW_PRESETS: Record<ViewPreset, { pos: [number, number, number]; tgt: [number, number, number] }> = {
  front: { pos: [0, 2, 34], tgt: [0, 0, 0] },
  top:   { pos: [0, 34, 0.1], tgt: [0, 0, 0] },
  right: { pos: [32, 2, 0], tgt: [0, 0, 0] },
  left:  { pos: [-32, 2, 0], tgt: [0, 0, 0] },
  iso:   { pos: [18, 14, 24], tgt: [0, 0, 0] },
};

export function OcclusionViewer({
  upperMesh, lowerMesh, mode, viewPreset, onReady, onClick, onCameraMove,
}: Props) {
  const mountRef     = useRef<HTMLDivElement | null>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef     = useRef<THREE.Scene | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef  = useRef<OrbitControls | null>(null);
  const upperSlotRef = useRef<THREE.Mesh | null>(null);
  const lowerSlotRef = useRef<THREE.Mesh | null>(null);
  const rafRef       = useRef<number | null>(null);
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

    const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 200);
    camera.position.set(18, 14, 24);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance   = 12;
    controls.maxDistance   = 80;
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
    }
  }, [upperMesh]);

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
    }
  }, [lowerMesh]);

  // ─── View preset → kamera animasyonu ──────────────────────
  useEffect(() => {
    const camera   = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const target = VIEW_PRESETS[viewPreset];
    const start    = camera.position.clone();
    const end      = new THREE.Vector3(...target.pos);
    const startTgt = controls.target.clone();
    const endTgt   = new THREE.Vector3(...target.tgt);

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
