/**
 * ThreeScene — Three.js canvas wrapper (Faz 2).
 *
 * Multi-file support:
 *   • Her dosya kendi mesh'ini sahnede taşır
 *   • Layer panel'den visibility toggle (parent kontrol eder)
 *   • Filename-based default color + Y offset (auto-stack)
 *   • PLY vertex colors → vertexColors:true
 *   • OBJ → merged geometry
 *
 * Performans:
 *   • Yeni dosya eklendiğinde sadece o eklenir (sahne temizlenmez)
 *   • Silinen dosya geometry/material dispose edilir
 *   • Çok dosya birlikte yüklenirken paralel fetch
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import * as THREE from 'three';
import type { ViewerFile, LayerStyle, Measurement, CutAxis } from '../types';
import { loadGeometry } from '../lib/loaders';
import { classifyFile } from '../lib/layerMap';
import { analyzeOcclusion as computeOcclusion, clearOcclusion as clearOcclusionGeom, type OcclusionResult } from '../lib/occlusion';
import { createScene, centerGeometry, fitCameraToObject, disposeObject, type SceneRefs } from '../lib/scene';
import { computeGroupOrientation } from '../lib/orient';
import { analyzeMesh, type MeshDiagnostics } from '../lib/meshDiagnostics';
import { applyPreset, applyPresetSmooth, type CameraPreset } from '../lib/cameraPresets';
import { useViewerTheme } from '../lib/viewerTheme';
import { createPerfMonitor, downsampleGeometry, type PerfStats } from '../lib/perfMonitor';

export interface ThreeSceneHandle {
  fit: () => void;
  reset: () => void;
  setPreset: (p: CameraPreset) => void;
  setFov: (deg: number) => void;
  /** Faz B: grup Z ekseni etrafında roll (deg) — smile arc eğri hizalaması. */
  setGroupRoll: (deg: number) => void;
  /** Render edilen sahnenin PNG data URL'ini döner. */
  screenshot: () => string | null;
  /** Kapanış analizi: üst+alt çene mesh'leri arası mesafe ısı haritası + özet. Çene çifti yoksa null. */
  analyzeOcclusion: () => Promise<OcclusionResult | null>;
  /** Kapanış ısı haritasını kaldır, mesh'i eski materyaline döndür. */
  clearOcclusion: () => void;
}

interface Props {
  files: ViewerFile[];
  /** Map<fileId, LayerStyle> — visibility + opacity + color + wireframe + offsetY */
  layerStyles?: Record<string, LayerStyle>;
  bg?: number;
  /** Faz 6: ölçüm modu aktif mi (canvas tıklamasıyla 2 nokta toplar) */
  measureMode?: boolean;
  measurements?: Measurement[];
  onAddMeasurement?: (m: Measurement) => void;
  /** Faz 6: kesit ekseni + konum (0 = orta, ± hareket) */
  cutAxis?: CutAxis;
  cutPosition?: number;
  /** Faz 8: arka plan grid göster/gizle */
  showGrid?: boolean;
  /** S4: X-ray modu — tüm meshler şeffaf */
  xrayMode?: boolean;
  /**
   * Auto-align: PCA tabanlı yeniden yönlendirme + filename-stack.
   * `false` (default) → exocad davranışı: ham koordinatları koru, sadece
   *   combined bbox merkezine çek. Aynı tarama oturumundan gelen dosyalar
   *   bu modda doğal okluzyonda hizalı kalır.
   * `true` → farklı oturumlardan gelen dosyaları yeniden hizala (deneysel).
   */
  autoAlign?: boolean;
  /** S4: mesh diagnostics callback — yükleme sonrası parent'a haber ver */
  onDiagnostics?: (fileId: string, diag: MeshDiagnostics) => void;
}

interface MeshEntry {
  fileId: string;
  mesh: THREE.Mesh;
}

export const ThreeScene = React.forwardRef<ThreeSceneHandle, Props>(function ThreeScene(
  { files, layerStyles, bg = 0x0e0e0e, measureMode, measurements = [], onAddMeasurement, cutAxis = 'none', cutPosition = 0, showGrid = false, xrayMode = false, autoAlign = false, onDiagnostics }: Props,
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sceneRefs = useRef<SceneRefs | null>(null);
  const animationRef = useRef<number | null>(null);
  const meshesRef = useRef<MeshEntry[]>([]);
  const groupRef = useRef<THREE.Group | null>(null);

  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [initError, setInitError] = useState<string | null>(null);
  const [stats, setStats] = useState<PerfStats>({ fps: 60, triCount: 0, meshCount: 0 });
  const perfRef = useRef<ReturnType<typeof createPerfMonitor> | null>(null);
  const T = useViewerTheme();

  // Faz 6: measurement state — bekleyen ilk nokta
  const pendingMeasureA = useRef<THREE.Vector3 | null>(null);
  const measureGroupRef = useRef<THREE.Group | null>(null);
  const clipPlaneRef = useRef<THREE.Plane | null>(null);

  // ── Scene setup (mount-once) ────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const w = wrap.clientWidth || 800;
    const h = wrap.clientHeight || 600;
    // WebGL context oluşturma başarısız olabilir (context limiti / GPU context kaybı).
    // Bu durumda tüm uygulamayı çökertmek yerine viewer içinde hata göster.
    let refs: SceneRefs;
    try {
      refs = createScene(canvas, w, h);
      if (!(refs.renderer.getContext && refs.renderer.getContext())) {
        throw new Error('WebGL context alınamadı');
      }
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn('[viewer-3d] createScene failed:', e?.message ?? e);
      setInitError('Görüntüleyici başlatılamadı. Çok fazla 3D pencere açık olabilir — sayfayı yenileyip tekrar deneyin.');
      return;
    }
    // Canvas şeffaf — arka plan + grid CSS katmanından gelir (screen-space 2D grid)
    refs.renderer.setClearColor(bg, 0);
    sceneRefs.current = refs;

    // Container group — fit-to-view tüm meshleri saysın diye
    const group = new THREE.Group();
    refs.scene.add(group);
    groupRef.current = group;

    // Measurement overlay group (lines + spheres + labels)
    const mg = new THREE.Group();
    refs.scene.add(mg);
    measureGroupRef.current = mg;

    // Clipping plane (başlangıçta etkisiz — Y normal, distance büyük)
    const cp = new THREE.Plane(new THREE.Vector3(0, -1, 0), 9999);
    clipPlaneRef.current = cp;
    refs.renderer.localClippingEnabled = true;

    // 3D grid kaldırıldı — grid artık 2D screen-space CSS overlay
    // (model döner, ızgara sabit kalır — exocad davranışı).

    // Soft contact shadow plane — modelin altında radial elliptik gölge.
    // Klinik premium hava: model uzayda yüzmesin, "yere oturmuş" hissetsin.
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256; shadowCanvas.height = 256;
    const sctx = shadowCanvas.getContext('2d')!;
    const grad = sctx.createRadialGradient(128, 128, 8, 128, 128, 120);
    grad.addColorStop(0.0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.35, 'rgba(0,0,0,0.30)');
    grad.addColorStop(0.75, 'rgba(0,0,0,0.05)');
    grad.addColorStop(1.0, 'rgba(0,0,0,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 256, 256);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    shadowTex.colorSpace = THREE.SRGBColorSpace;
    const shadowGeom = new THREE.PlaneGeometry(120, 90);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex, transparent: true, depthWrite: false, opacity: 0.55,
    });
    const shadowMesh = new THREE.Mesh(shadowGeom, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.renderOrder = -1;
    shadowMesh.userData.isShadowPlane = true;
    refs.scene.add(shadowMesh);
    (refs as any).__shadowMesh = shadowMesh;

    // Performance monitor — FPS + tri count + auto quality drop
    const perf = createPerfMonitor({
      onUpdate: (s) => setStats(s),
      onLowFps: () => {
        // Düşük FPS → pixel ratio'yu 1'e indir, anti-alias kapat
        // eslint-disable-next-line no-console
        console.log('[viewer-3d] low FPS — quality drop');
        refs.renderer.setPixelRatio(1);
      },
      lowFpsThreshold: 25,
      lowFpsDuration: 2500,
    });
    perfRef.current = perf;

    const tick = () => {
      refs.controls.update();
      refs.renderer.render(refs.scene, refs.camera);
      perf.tick();
      animationRef.current = requestAnimationFrame(tick);
    };
    tick();

    const ro = new ResizeObserver(() => {
      const nw = wrap.clientWidth;
      const nh = wrap.clientHeight;
      if (nw === 0 || nh === 0) return;
      refs.renderer.setSize(nw, nh, false);
      refs.camera.aspect = nw / nh;
      refs.camera.updateProjectionMatrix();
    });
    ro.observe(wrap);

    return () => {
      ro.disconnect();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      // Mesh'ler
      meshesRef.current.forEach((e) => disposeObject(e.mesh));
      meshesRef.current = [];
      // Measurement overlay
      if (measureGroupRef.current) {
        while (measureGroupRef.current.children.length > 0) {
          const c = measureGroupRef.current.children[0];
          measureGroupRef.current.remove(c);
          disposeObject(c);
        }
      }
      refs.controls.dispose();
      refs.renderer.dispose();
      // Render context'i serbest bırak (WebGL memory)
      try { refs.renderer.forceContextLoss(); } catch {}
      sceneRefs.current = null;
      groupRef.current = null;
      measureGroupRef.current = null;
      clipPlaneRef.current = null;
      perfRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Diff-based file sync (add new, remove gone) ─────────────────
  useEffect(() => {
    const refs = sceneRefs.current;
    const group = groupRef.current;
    if (!refs || !group) return;

    // autoAlign değişti mi? Mevcut meshlerin işleme tipiyle uyumsuzsa hepsini at.
    const currentMode = (groupRef.current as any).__autoAlign;
    if (currentMode !== undefined && currentMode !== autoAlign) {
      for (const entry of meshesRef.current) {
        group.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        (entry.mesh.material as THREE.Material).dispose();
      }
      meshesRef.current = [];
    }
    (groupRef.current as any).__autoAlign = autoAlign;

    const currentIds = new Set(meshesRef.current.map(e => e.fileId));
    const wantedIds = new Set(files.map(f => f.id));

    // 1) Remove meshes that are no longer in files[]
    let removed = false;
    meshesRef.current = meshesRef.current.filter((e) => {
      if (wantedIds.has(e.fileId)) return true;
      group.remove(e.mesh);
      disposeObject(e.mesh);
      removed = true;
      return false;
    });
    if (removed) perfRef.current?.refreshSceneStats(group);

    // 2) Add new files
    const toLoad = files.filter(f => !currentIds.has(f.id));
    if (toLoad.length === 0) return;

    setLoadingIds(new Set(toLoad.map(f => f.id)));

    const ac = new AbortController();
    Promise.all(toLoad.map(async (file) => {
      try {
        const { geometry, hasVertexColors, texture, isPointCloud } = await loadGeometry(file.url, file.format, ac.signal, file.textureUrl);
        const triEstimate = geometry.index
          ? geometry.index.count / 3
          : (geometry.attributes.position?.count ?? 0) / 3;
        if (triEstimate > 5_000_000) {
          // eslint-disable-next-line no-console
          console.log(`[viewer-3d] ${file.name}: ${Math.round(triEstimate / 1000)}k tri → downsample`);
          downsampleGeometry(geometry, 2_000_000);
        }
        if (!geometry.attributes.normal) geometry.computeVertexNormals();
        const layer = classifyFile(file.name);
        // Ham koordinat (exocad davranışı) — taşıma/döndürme YOK. Farklı formatlar
        // (STL/PLY) farklı koordinat sisteminde olabildiği için modal format bazında
        // ayrılır (bkz. Viewer3DModal formatFilter); tek format içindeki dosyalar
        // aynı sistemde olduğundan doğru çakışır. Otomatik hizalama denendi ve
        // ELENDİ — exocad dahil güvenilir çalışmıyor.
        geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        geometry.boundingBox!.getSize(size);
        const style = layerStyles?.[file.id];
        const colorHex = style?.color ?? file.color ?? layer.color;
        const opacity = style?.opacity ?? layer.opacity ?? 1;
        const wireframe = style?.wireframe ?? false;
        // Klinik dental materyal — matte ivory tonu, hafif clearcoat
        // Bite scan → şeffaf mavi; gingiva → şeffaf pembe; üst/alt → matte ivory
        const isTranslucent = layer.type === 'bite' || layer.type === 'gingiva' || layer.type === 'wax';
        // PLY vertex renkleri (veya texture) varsa taban BEYAZ olmalı; aksi halde
        // katman tonu (colorHex) vertexColor × color ile orijinal renkleri boyar.
        const useOriginalColors = !!texture || (hasVertexColors && !texture);

        // Geçerli sınır hacmi — bazı STL/PLY taramalarında boundingSphere hesaplanmaz
        // ya da NaN kalır → three.js mesh'i frustum-culling ile gizler (boş ekran).
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const bs = geometry.boundingSphere;
        const sphereBad = !bs || !Number.isFinite(bs.radius) || bs.radius <= 0
          || !Number.isFinite(bs.center.x) || !Number.isFinite(bs.center.y) || !Number.isFinite(bs.center.z);

        // Nokta bulutu (yüzsüz PLY, ör. intraoral ham tarama) → THREE.Points.
        // Mesh olarak render edilirse üçgen olmadığından görünmez; Points ile
        // her vertex kendi rengiyle (vertexColors) çizilir.
        let mesh: THREE.Mesh;
        if (isPointCloud) {
          const pointsMat = new THREE.PointsMaterial({
            vertexColors: hasVertexColors,
            color: hasVertexColors ? new THREE.Color(0xffffff) : new THREE.Color(colorHex),
            // Ekran-uzayı sabit boyut → ölçek/zoom ne olursa olsun asla sub-pixel olmaz.
            size: 2.5,
            sizeAttenuation: false,
            transparent: opacity < 1,
            opacity,
          });
          // THREE.Points, Mesh ile aynı Object3D+geometry+material API'sini paylaşır;
          // meshesRef Mesh-tipli olduğu için cast ediyoruz (runtime uyumlu).
          mesh = new THREE.Points(geometry, pointsMat) as unknown as THREE.Mesh;
        } else {
          const material = new THREE.MeshPhysicalMaterial({
            // Texture/vertex-renk varsa beyaz taban → dosyanın gerçek renkleri görünür
            color: useOriginalColors ? new THREE.Color(0xffffff) : new THREE.Color(colorHex),
            map: texture ?? null,
            vertexColors: hasVertexColors && !texture,
            roughness: isTranslucent ? 0.35 : (texture ? 0.9 : 0.62),
            metalness: 0.0,
            clearcoat: texture ? 0 : (isTranslucent ? 0.6 : 0.15),
            clearcoatRoughness: 0.4,
            sheen: 0.0,
            transparent: opacity < 1,
            opacity,
            wireframe,
            side: THREE.DoubleSide,
            clippingPlanes: clipPlaneRef.current ? [clipPlaneRef.current] : [],
            clipShadows: true,
          });
          mesh = new THREE.Mesh(geometry, material);
        }
        mesh.visible = style?.visible ?? true;
        // Sınır küresi bozuksa culling mesh'i yanlışlıkla gizlemesin.
        if (sphereBad) mesh.frustumCulled = false;
        mesh.userData.isPointCloud = !!isPointCloud;
        mesh.userData.fileId = file.id;
        mesh.userData.layerType = layer.type;
        mesh.userData.layerSize = size; // fit sırasında stack hesabı için
        // PLY vertex-renkleri / OBJ texture olan mesh'ler GERÇEK renklerini korur;
        // katman paleti (mono) bunların üstüne yazılmamalı (style-sync guard'ı).
        mesh.userData.hasOriginalColors = !!texture || hasVertexColors;

        group.add(mesh);
        meshesRef.current.push({ fileId: file.id, mesh });

        // Mesh diagnostics — yükleme sonrası kalite analizi (async-ish, non-blocking)
        if (onDiagnostics) {
          setTimeout(() => {
            try {
              const diag = analyzeMesh(geometry);
              mesh.userData.diagnostics = diag;
              onDiagnostics(file.id, diag);
            } catch (e) {
              // sessizce yut — diagnostics opsiyonel
              // eslint-disable-next-line no-console
              console.warn('[viewer-3d] diag failed for', file.name, e);
            }
          }, 100);
        }

        return file.id;
      } catch (e: any) {
        if (e?.name === 'AbortError') return null;
        // eslint-disable-next-line no-console
        console.warn('[viewer-3d] load', file.name, 'failed:', e?.message ?? e);
        setErrors(prev => ({ ...prev, [file.id]: e?.message ?? 'Yüklenemedi' }));
        return file.id;
      }
    })).then((doneIds) => {
      // Clear loading
      setLoadingIds(prev => {
        const next = new Set(prev);
        for (const id of doneIds) if (id) next.delete(id);
        return next;
      });

      if (meshesRef.current.length > 0 && refs && group) {
        // RAW modda: tüm meshler aynı koordinat sisteminde geliyor (exocad
        // davranışı). Grup-bütününü PCA ile dünya eksenine oturt — inter-mesh
        // alignment korunur, sadece kamera için doğru eksene rotate edilir.
        // AutoAlign modda: her mesh kendi orient'inde, grup rotasyonu yok.
        if (!autoAlign) {
          // ── Deterministic orient: filename + maxilla/mandible merkez vektörü ──
          // İki çene varsa: mandible→maxilla yönü occlusal axis. Bu vektörü +Y'ye
          // hizalayan quaternion'u grup'a uygula. Inter-mesh okluzyonu korur.
          // Sadece bir çene varsa: PCA fallback (en kısa eksen = occlusal).
          const maxillas: THREE.Mesh[] = [];
          const mandibles: THREE.Mesh[] = [];
          for (const e of meshesRef.current) {
            const t = e.mesh.userData.layerType as string;
            if (t === 'maxilla') maxillas.push(e.mesh);
            else if (t === 'mandible' || t === 'antagonist') mandibles.push(e.mesh);
          }
          const avgCenter = (arr: THREE.Mesh[]) => {
            const c = new THREE.Vector3();
            for (const m of arr) {
              const b = new THREE.Box3().setFromObject(m);
              c.add(b.getCenter(new THREE.Vector3()));
            }
            return arr.length > 0 ? c.divideScalar(arr.length) : null;
          };

          let q: THREE.Quaternion | null = null;
          const mxC = avgCenter(maxillas);
          const mnC = avgCenter(mandibles);

          if (mxC && mnC) {
            // mandible → maxilla yönü = occlusal yukarı (+Y dünya)
            const occlusal = new THREE.Vector3().subVectors(mxC, mnC).normalize();
            // Bu vektörü +Y dünya eksenine eşle
            q = new THREE.Quaternion().setFromUnitVectors(occlusal, new THREE.Vector3(0, 1, 0));
          } else {
            // Fallback: tek-mesh PCA (mevcut algoritma)
            q = computeGroupOrientation(meshesRef.current.map(e => e.mesh.geometry));
          }

          // Sonlu-olmayan quaternion (dental olmayan / düzlemsel taramada PCA dejenere
          // olabilir) → tüm grup NaN'a gider ve kaybolur. Bu durumda identity'e düş.
          if (q && Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w)
              && (q.x || q.y || q.z || q.w)) {
            group.quaternion.copy(q);
          } else {
            group.quaternion.identity();
          }
          group.updateMatrixWorld(true);

          // ── Anterior/Posterior sign ──
          // Arch U-şekilli: anterior (kesici dişler) tarafta X spread DAR,
          // posterior (molarlar) tarafta X spread GENİŞ. Z'yi bucket'la,
          // dar spread'in olduğu yön anterior = +Z (kamera tarafı) olmalı.
          const refMesh = maxillas[0] ?? mandibles[0];
          if (refMesh) {
            refMesh.updateMatrixWorld(true);
            const pos = refMesh.geometry.attributes.position;
            const N = pos.count;
            const stride = Math.max(1, Math.floor(N / 3000));
            const tmp = new THREE.Vector3();
            const buckets = 12;
            const xByBucket: number[][] = Array.from({ length: buckets }, () => []);
            // Önce Z range
            let zMin = Infinity, zMax = -Infinity;
            const samples: { x: number; z: number }[] = [];
            for (let i = 0; i < N; i += stride) {
              tmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(refMesh.matrixWorld);
              samples.push({ x: tmp.x, z: tmp.z });
              if (tmp.z < zMin) zMin = tmp.z;
              if (tmp.z > zMax) zMax = tmp.z;
            }
            const zSpan = zMax - zMin || 1;
            for (const s of samples) {
              const b = Math.min(buckets - 1, Math.floor((s.z - zMin) / zSpan * buckets));
              xByBucket[b].push(s.x);
            }
            // Her bucket için X spread
            const spreads = xByBucket.map((arr) => {
              if (arr.length < 5) return 0;
              let lo = Infinity, hi = -Infinity;
              for (const v of arr) { if (v < lo) lo = v; if (v > hi) hi = v; }
              return hi - lo;
            });
            // İlk %25 (low Z) vs son %25 (high Z) ortalama spread
            const q = Math.floor(buckets / 4);
            let lowSpread = 0, highSpread = 0, lowN = 0, highN = 0;
            for (let i = 0; i < q; i++) { if (spreads[i]) { lowSpread += spreads[i]; lowN++; } }
            for (let i = buckets - q; i < buckets; i++) { if (spreads[i]) { highSpread += spreads[i]; highN++; } }
            const lowAvg = lowN > 0 ? lowSpread / lowN : 0;
            const highAvg = highN > 0 ? highSpread / highN : 0;
            // Anterior = dar spread tarafı. Anterior +Z (kamera tarafı) olmalı.
            // Eğer anterior düşük Z'deyse (= -Z tarafı), Y ekseninde 180° flip.
            if (lowAvg > 0 && highAvg > 0 && lowAvg < highAvg) {
              const fix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
              group.quaternion.premultiply(fix);
              group.updateMatrixWorld(true);
            }
          }

          // Tek çene durumunda dişlerin doğru yöne baktığını PCA sign'iyle doğrula
          if (!mxC || !mnC) {
            const ref = maxillas[0] ?? mandibles[0];
            if (ref) {
              const isMax = !!maxillas[0];
              // Vertex Y dağılımı: bulk ortalama'sı tail'in tersi yönde olur.
              // Maxilla'da diş uçları -Y'de olmalı → bulk +Y'de → mean > median
              const pos = ref.geometry.attributes.position;
              const N = pos.count;
              const stride = Math.max(1, Math.floor(N / 2000));
              const tmp = new THREE.Vector3();
              ref.updateMatrixWorld(true);
              const ys: number[] = [];
              let sum = 0;
              for (let i = 0; i < N; i += stride) {
                tmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(ref.matrixWorld);
                ys.push(tmp.y); sum += tmp.y;
              }
              ys.sort((a, b) => a - b);
              const mean = sum / ys.length;
              const median = ys[Math.floor(ys.length / 2)];
              const skew = mean - median;
              const needFlip = (isMax && skew < 0) || (!isMax && skew > 0);
              if (needFlip) {
                const fix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
                group.quaternion.premultiply(fix);
                group.updateMatrixWorld(true);
              }
            }
          }
        } else {
          group.quaternion.identity();
        }

        // Mesh konumlandırma — ham koordinat; sadece manuel offsetY uygulanır.
        for (const entry of meshesRef.current) {
          entry.mesh.userData.autoStackY = 0;
          const style = layerStyles?.[entry.fileId];
          entry.mesh.position.set(0, style?.offsetY ?? 0, 0);
        }
        // Combined bbox + ÖLÇEK NORMALİZASYONU.
        // Telefon taramaları metre ölçekli olabilir (~0.2 birim); viewer/kamera dental
        // mm ölçeği bekler → minik mesh far düzleminin ötesine düşüp görünmez oluyordu.
        // Modeli standart ~60 birime ölçekle; çok dosyada combined bbox'tan TEK çarpan
        // → relatif hizalama korunur. Normal mm modeller [5–400] aralığında dokunulmaz.
        group.scale.setScalar(1);
        group.position.set(0, 0, 0);
        group.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        const _bsize = box.getSize(new THREE.Vector3());
        const _maxDim = Math.max(_bsize.x, _bsize.y, _bsize.z);
        let nScale = 1;
        if (Number.isFinite(_maxDim) && _maxDim > 0 && (_maxDim < 5 || _maxDim > 400)) {
          nScale = 60 / _maxDim;
        }
        group.scale.setScalar(nScale);
        group.position.set(-center.x * nScale, -center.y * nScale, -center.z * nScale);
        group.updateMatrixWorld(true);
        // Contact shadow plane'i grup bbox'ına göre konumlandır + ölçekle
        const sBox = new THREE.Box3().setFromObject(group);
        const sSize = sBox.getSize(new THREE.Vector3());
        const shadowMesh = (refs as any).__shadowMesh as THREE.Mesh | undefined;
        if (shadowMesh) {
          const sx = Math.max(sSize.x, sSize.z) * 1.4 / 120;
          const sz = Math.max(sSize.x, sSize.z) * 1.0 / 90;
          shadowMesh.scale.set(sx, sz, 1);
          shadowMesh.position.set(0, sBox.min.y - sSize.y * 0.02, 0);
        }
        fitCameraToObject(refs.camera, refs.controls, group, 1.35);
        // Perf stats — yeni mesh'leri say
        perfRef.current?.refreshSceneStats(group);

      }
    });

    return () => ac.abort();
    // autoAlign değişince geometriler yeniden işlenmeli — diff effect zaten
    // var olan meshleri korur, autoAlign değiştiğinde hepsini temizle + reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.map(f => f.id).join('|'), autoAlign]);

  // ── Style sync — visibility/opacity/color/wireframe/offsetY ──
  useEffect(() => {
    for (const entry of meshesRef.current) {
      const style = layerStyles?.[entry.fileId];
      const mesh = entry.mesh;
      const mat = mesh.material as THREE.MeshPhongMaterial;
      mesh.visible = style?.visible ?? true;
      if (style?.opacity != null) {
        mat.opacity = style.opacity;
        mat.transparent = style.opacity < 1;
      }
      // Gerçek renkli tarama (PLY vertex-color / OBJ texture) katman paletiyle
      // EZİLMEZ — kullanıcı renkli taramayı renkli görmek ister. Sadece renksiz
      // mesh'lere (STL) mono katman rengi uygulanır.
      if (style?.color && !mesh.userData.hasOriginalColors) {
        mat.color.set(style.color);
        if (mat.vertexColors) {
          mat.vertexColors = false;
          mat.needsUpdate = true;
        }
      }
      if (style?.wireframe != null) {
        mat.wireframe = style.wireframe;
      }
      // Manuel Y offset (auto-stack üstüne kullanıcı ayarı)
      const baseY = (mesh.userData.autoStackY as number | undefined) ?? mesh.position.y;
      mesh.userData.autoStackY = baseY;
      mesh.position.y = baseY + (style?.offsetY ?? 0);
      mat.needsUpdate = true;
    }
  }, [layerStyles]);

  // ── Cut plane sync ──────────────────────────────────────────────
  useEffect(() => {
    const cp = clipPlaneRef.current;
    if (!cp) return;
    if (cutAxis === 'none') {
      cp.constant = 9999; // efektsiz
    } else {
      // normal: hangi ekseni keseceksek o yönde -1 (o eksenin pozitif tarafını kırpar)
      if (cutAxis === 'x') cp.normal.set(-1, 0, 0);
      else if (cutAxis === 'y') cp.normal.set(0, -1, 0);
      else if (cutAxis === 'z') cp.normal.set(0, 0, -1);
      cp.constant = cutPosition;
    }
  }, [cutAxis, cutPosition]);

  // ── Measurement overlay sync ────────────────────────────────────
  useEffect(() => {
    const mg = measureGroupRef.current;
    if (!mg) return;
    // Önceki overlay'i temizle
    while (mg.children.length > 0) {
      const c = mg.children[0];
      mg.remove(c);
      disposeObject(c);
    }
    // Yeni ölçümleri çiz
    for (const m of measurements) {
      const a = new THREE.Vector3(m.a.x, m.a.y, m.a.z);
      const b = new THREE.Vector3(m.b.x, m.b.y, m.b.z);

      // Çizgi
      const lineGeom = new THREE.BufferGeometry().setFromPoints([a, b]);
      const line = new THREE.Line(
        lineGeom,
        new THREE.LineBasicMaterial({ color: 0xffeb3b, depthTest: false }),
      );
      (line as any).renderOrder = 999;
      mg.add(line);

      // Nokta küreleri
      const sphereGeom = new THREE.SphereGeometry(0.3, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffeb3b, depthTest: false });
      const sa = new THREE.Mesh(sphereGeom, sphereMat); sa.position.copy(a); mg.add(sa);
      const sb = new THREE.Mesh(sphereGeom, sphereMat); sb.position.copy(b); mg.add(sb);
    }
  }, [measurements]);

  // ── Canvas click → measurement raycaster ────────────────────────
  useEffect(() => {
    if (!measureMode) return;
    const canvas = canvasRef.current;
    const refs = sceneRefs.current;
    const group = groupRef.current;
    if (!canvas || !refs || !group) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, refs.camera);
      const hits = raycaster.intersectObjects(group.children, true);
      if (hits.length === 0) return;
      const p = hits[0].point.clone();

      if (!pendingMeasureA.current) {
        pendingMeasureA.current = p;
      } else {
        const a = pendingMeasureA.current;
        const b = p;
        const dist = a.distanceTo(b);
        pendingMeasureA.current = null;
        onAddMeasurement?.({
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          a: { x: a.x, y: a.y, z: a.z },
          b: { x: b.x, y: b.y, z: b.z },
          distance: dist,
        });
      }
    };
    canvas.addEventListener('click', onClick);
    return () => { canvas.removeEventListener('click', onClick); pendingMeasureA.current = null; };
  }, [measureMode, onAddMeasurement]);

  // ── X-ray sync — global şeffaflık modu ─────────────────────────
  useEffect(() => {
    for (const entry of meshesRef.current) {
      const mat = entry.mesh.material as THREE.MeshPhysicalMaterial;
      const style = layerStyles?.[entry.fileId];
      const baseOpacity = style?.opacity ?? 1;
      if (xrayMode) {
        mat.transparent = true;
        mat.opacity = Math.min(baseOpacity, 0.32);
        mat.depthWrite = false;
        mat.side = THREE.DoubleSide;
      } else {
        mat.opacity = baseOpacity;
        mat.transparent = baseOpacity < 1;
        mat.depthWrite = true;
      }
      mat.needsUpdate = true;
    }
  }, [xrayMode, layerStyles]);

  // ── BG sync ─────────────────────────────────────────────────────
  useEffect(() => {
    if (sceneRefs.current) sceneRefs.current.renderer.setClearColor(bg, 0);
  }, [bg]);

  // ── Imperative API (parent toolbar buttons) ─────────────────────
  React.useImperativeHandle(ref, () => ({
    fit: () => {
      const refs = sceneRefs.current; const group = groupRef.current;
      if (refs && group && meshesRef.current.length > 0) {
        fitCameraToObject(refs.camera, refs.controls, group, 1.35);
      }
    },
    reset: () => {
      const refs = sceneRefs.current; const group = groupRef.current;
      if (!refs || !group) return;
      // default preset + fit
      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      applyPreset('default', refs.camera, center);
      if (meshesRef.current.length > 0) {
        fitCameraToObject(refs.camera, refs.controls, group, 1.35);
      }
    },
    setPreset: (p: CameraPreset) => {
      const refs = sceneRefs.current; const group = groupRef.current;
      if (!refs || !group) return;
      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      if (typeof (refs.controls as any).setTarget === 'function') {
        (refs.controls as any).setTarget(center.x, center.y, center.z);
      }
      // Smooth easeOutCubic tween (~480ms) — exocad benzeri yumuşak geçiş
      applyPresetSmooth(p, refs.camera, center, refs.controls, 480);

      // "upper" preset → sadece üst çene görünür; "lower" → sadece alt çene
      // diğer presetler tüm katmanları geri açar
      const meshes = meshesRef.current;
      if (p === 'upper' || p === 'lower') {
        const show = p === 'upper' ? 'maxilla' : 'mandible';
        for (const e of meshes) {
          const t = e.mesh.userData.layerType as string;
          e.mesh.visible = t === show || (p === 'lower' && t === 'antagonist');
        }
      } else {
        // Tüm katmanları görünür yap (layerStyles state'i bir sonraki sync'te düzeltecek)
        for (const e of meshes) e.mesh.visible = true;
      }
    },
    setFov: (deg: number) => {
      const refs = sceneRefs.current;
      if (!refs) return;
      refs.camera.fov = deg;
      refs.camera.updateProjectionMatrix();
    },
    setGroupRoll: (deg: number) => {
      // Z ekseni etrafında grubun roll açısı (kamera değil — model dönüyor).
      // Smile arc çizgisinin eğimine eşleştirmek için kullanılır.
      const group = groupRef.current;
      if (!group) return;
      const rad = deg * (Math.PI / 180);
      // Mevcut quaternion'un Z bileşenini sıfırlayıp yeniden ekle:
      // Basitleştir → euler'a çevir, sadece Z'yi değiştir, geri set et.
      const euler = new THREE.Euler().setFromQuaternion(group.quaternion, 'XYZ');
      euler.z = rad;
      group.quaternion.setFromEuler(euler);
      group.updateMatrixWorld(true);
    },
    screenshot: () => {
      const refs = sceneRefs.current;
      if (!refs) return null;
      // Bir frame force render — buffer içinde son sahne hazır olsun
      refs.renderer.render(refs.scene, refs.camera);
      try {
        return refs.renderer.domElement.toDataURL('image/png');
      } catch {
        return null;
      }
    },
    analyzeOcclusion: async () => {
      const meshes = meshesRef.current;
      const byType = (t: string) => meshes.find(e => e.mesh.userData.layerType === t)?.mesh;
      const upper = byType('maxilla');
      const lower = byType('mandible') ?? byType('antagonist');
      if (!upper || !lower) return null;
      const result = await computeOcclusion(lower, upper);   // alt çeneye vertex-color ısı haritası yazar
      // Isı haritasını göster: vertexColors aç, materyal rengini beyaza al, opak yap.
      const mat = lower.material as THREE.MeshPhysicalMaterial;
      (lower.userData as any)._preOcc = {
        vertexColors: mat.vertexColors, color: mat.color.clone(), map: mat.map,
        opacity: mat.opacity, transparent: mat.transparent,
      };
      mat.vertexColors = true;
      mat.map = null;
      mat.color.set(0xffffff);
      mat.opacity = 1;
      mat.transparent = false;
      mat.needsUpdate = true;
      lower.visible = true;
      return result;
    },
    clearOcclusion: () => {
      const meshes = meshesRef.current;
      const lower = (meshes.find(e => e.mesh.userData.layerType === 'mandible')
        ?? meshes.find(e => e.mesh.userData.layerType === 'antagonist'))?.mesh;
      if (!lower) return;
      clearOcclusionGeom(lower);
      const mat = lower.material as THREE.MeshPhysicalMaterial;
      const pre = (lower.userData as any)._preOcc;
      if (pre) {
        mat.vertexColors = pre.vertexColors;
        mat.color.copy(pre.color);
        mat.map = pre.map;
        mat.opacity = pre.opacity;
        mat.transparent = pre.transparent;
        mat.needsUpdate = true;
        delete (lower.userData as any)._preOcc;
      }
    },
  }), []);

  const anyLoading = loadingIds.size > 0;

  if (initError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: T.headerBg }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: T.headerTitle, textAlign: 'center', maxWidth: 360, lineHeight: 20 }}>
          {initError}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.headerBg }}>
      <div ref={wrapRef} style={(() => {
        const bgHex = '#' + bg.toString(16).padStart(6, '0');
        const isLight = bg > 0x808080;
        // Light: preview zemini = aktif panelin bgPage'i (düz, shell ile aynı) +
        // yalnız kenarlarda algılanamaz bir koyulaşma (model öne çıksın, renk
        // panel bg'si kalsın). Dark: koyu studio radial.
        const radial = isLight
          ? `radial-gradient(circle at 50% 42%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.045) 100%)`
          : `radial-gradient(circle at 50% 38%, #25272C 0%, #18191D 60%, #0C0D10 100%)`;
        return {
          position: 'absolute', inset: 0,
          backgroundColor: bgHex,
          backgroundImage: radial,
        } as any;
      })()}>
        {/* 2D screen-space grid — model döner, ızgara sabit kalır (exocad) */}
        {showGrid ? (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: (() => {
              const isLight = bg > 0x808080;
              const main = isLight ? 'rgba(92,107,133,0.32)' : 'rgba(148,163,184,0.22)';
              const sub  = isLight ? 'rgba(92,107,133,0.14)' : 'rgba(148,163,184,0.10)';
              return [
                `linear-gradient(to right, ${main} 1px, transparent 1px)`,
                `linear-gradient(to bottom, ${main} 1px, transparent 1px)`,
                `linear-gradient(to right, ${sub} 1px, transparent 1px)`,
                `linear-gradient(to bottom, ${sub} 1px, transparent 1px)`,
              ].join(', ');
            })(),
            backgroundSize: '100px 100px, 100px 100px, 20px 20px, 20px 20px',
            pointerEvents: 'none',
          } as any} />
        ) : null}
        <canvas ref={canvasRef} style={{ position: 'relative', width: '100%', height: '100%', display: 'block' } as any} />
      </div>

      {anyLoading && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            alignItems: 'center', justifyContent: 'center',
          } as any}
        >
          <View style={{
            alignItems: 'center', gap: 12,
            paddingHorizontal: 26, paddingVertical: 20, borderRadius: 18,
            backgroundColor: T.toolbarBg,
            borderWidth: 1, borderColor: T.toolbarBorder,
            ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.25)' } as any : {}),
          }}>
            <ActivityIndicator size="large" color={T.accent} />
            <Text style={{ color: T.iconFg, fontSize: 13, fontWeight: '700' }}>
              3D model yükleniyor…
            </Text>
            <Text style={{ color: T.iconFg, fontSize: 11, fontWeight: '500', opacity: 0.7 }}>
              {loadingIds.size} dosya
            </Text>
          </View>
        </View>
      )}

      {/* Performance stats overlay (sol alt) */}
      {!anyLoading && meshesRef.current.length > 0 && (
        <View style={{
          position: 'absolute', bottom: 12, left: 12,
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
          backgroundColor: T.toolbarBg,
          borderWidth: 1, borderColor: T.toolbarBorder,
        } as any}>
          <View style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: stats.fps >= 50 ? '#22C55E' : stats.fps >= 30 ? '#F59E0B' : '#EF4444',
          }} />
          <Text style={{ color: T.iconFg, fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            {stats.fps} FPS
          </Text>
          <View style={{ width: 1, height: 10, backgroundColor: T.toolbarBorder }} />
          <Text style={{ color: T.panelLabelMuted, fontSize: 10, fontWeight: '500' }}>
            {stats.meshCount} mesh · {(stats.triCount / 1000).toFixed(0)}k tri
          </Text>
        </View>
      )}

      {Object.keys(errors).length > 0 && (
        <View style={{
          position: 'absolute', bottom: 14, left: 14, right: 14,
          paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
          backgroundColor: 'rgba(220,38,38,0.18)',
          borderWidth: 1, borderColor: 'rgba(220,38,38,0.4)',
        } as any}>
          <Text style={{ color: '#DC2626', fontSize: 11.5, fontWeight: '700', marginBottom: 4 }}>
            {Object.keys(errors).length} dosya yüklenemedi
          </Text>
          {Object.entries(errors).slice(0, 2).map(([id, msg]) => {
            const f = files.find(x => x.id === id);
            return (
              <Text key={id} style={{ color: '#B91C1C', fontSize: 10.5 }} numberOfLines={1}>
                · {f?.name ?? id}: {msg}
              </Text>
            );
          })}
        </View>
      )}
    </View>
  );
});
