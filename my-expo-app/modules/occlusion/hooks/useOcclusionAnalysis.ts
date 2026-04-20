// modules/occlusion/hooks/useOcclusionAnalysis.ts
// Ana orkestrasyon hook'u — tüm analiz state'i burada
// Prototip: app/app.jsx state + app/scene.jsx runAnalysis()

import { useState, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { computeMeshDistance } from '../utils/meshDistance';
import { detectPenetrations, computeStatistics } from '../utils/penetrationDetector';
import { applyHeatmapColors, toggleVertexColors, captureSnapshot } from '../utils/heatmapGenerator';
import { DEFAULT_HEATMAP_CONFIG } from '../utils/colorScale';

import type {
  Mode,
  OcclusionAnalysisResult,
  HeatmapConfig,
  PaletteName,
  OcclusionReport,
  ViewPreset,
} from '../types/occlusion';

export interface MeshInput {
  file:     File;            // STL veya PLY
  meshType: 'upper' | 'lower';
}

export interface UseOcclusionAnalysis {
  // Analysis state
  isAnalyzing:  boolean;
  progress:     number;        // 0–1
  result:       OcclusionAnalysisResult | null;
  error:        string | null;

  // Scene refs (OcclusionViewer'ın set ettiği)
  upperMeshRef: React.MutableRefObject<THREE.Mesh | null>;
  lowerMeshRef: React.MutableRefObject<THREE.Mesh | null>;
  rendererRef:  React.MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef:    React.MutableRefObject<THREE.Camera | null>;

  // Display state
  activeMode:   Mode;
  heatmapConfig: HeatmapConfig;
  upperOpacity: number;
  viewPreset:   ViewPreset;

  // Actions
  runAnalysis:       (upper: File, lower: File) => Promise<void>;
  setMode:           (mode: Mode) => void;
  setPalette:        (p: PaletteName) => void;
  setMaxDistance:    (mm: number) => void;
  setUpperOpacity:   (v: number) => void;
  setViewPreset:     (p: ViewPreset) => void;
  exportReport:      () => OcclusionReport | null;
  saveToSupabase:    (workOrderId: string) => Promise<void>;
}

export function useOcclusionAnalysis(): UseOcclusionAnalysis {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [result,      setResult]      = useState<OcclusionAnalysisResult | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [activeMode,  setActiveMode]  = useState<Mode>('heatmap');
  const [upperOpacity, setUpperOpacityState] = useState(1.0);
  const [viewPreset,  setViewPresetState]    = useState<ViewPreset>('iso');
  const [heatmapConfig, setHeatmapConfig]    = useState<HeatmapConfig>(DEFAULT_HEATMAP_CONFIG);

  // Refs scene nesnelerine (OcclusionViewer tarafından set edilir)
  const upperMeshRef = useRef<THREE.Mesh | null>(null);
  const lowerMeshRef = useRef<THREE.Mesh | null>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef    = useRef<THREE.Camera | null>(null);

  // Geometry'yi parse et
  const parseGeometry = useCallback(async (file: File): Promise<THREE.BufferGeometry> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buf = e.target?.result as ArrayBuffer;
        const ext = file.name.split('.').pop()?.toLowerCase();
        try {
          let geom: THREE.BufferGeometry;
          if (ext === 'ply') {
            geom = new PLYLoader().parse(buf);
          } else {
            // STL (binary veya ASCII)
            geom = new STLLoader().parse(buf);
          }

          // STL loader her üçgen için 3 ayrı vertex oluşturur (paylaşım yok).
          // Scanner mesh'leri 3-6M vertex içerebilir → mergeVertices ile ~5-6x azalt.
          const beforeCount = geom.getAttribute('position')?.count ?? 0;
          const mergeStart = performance.now();
          try {
            geom = mergeVertices(geom, 1e-4);
          } catch (mergeErr) {
            console.warn(`[occlusion] mergeVertices failed for ${file.name}:`, mergeErr);
          }
          const afterCount = geom.getAttribute('position')?.count ?? 0;
          const mergeMs = (performance.now() - mergeStart).toFixed(0);
          if (beforeCount && afterCount) {
            console.log(`[occlusion] ${file.name}: ${beforeCount} → ${afterCount} vertex (${((1 - afterCount / beforeCount) * 100).toFixed(1)}% azalma, ${mergeMs}ms)`);
          }

          geom.computeVertexNormals();
          resolve(geom);
        } catch (err) {
          reject(new Error(`${file.name} parse hatası: ${String(err)}`));
        }
      };
      reader.onerror = () => reject(new Error(`${file.name} okunamadı`));
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const runAnalysis = useCallback(async (upperFile: File, lowerFile: File) => {
    setIsAnalyzing(true);
    setProgress(0);
    setError(null);

    try {
      // 1) Parse geometries
      setProgress(0.05);
      const [upperGeom, lowerGeom] = await Promise.all([
        parseGeometry(upperFile),
        parseGeometry(lowerFile),
      ]);

      // 2) Mesh'leri scene'e yükle (OcclusionViewer'ın loadMeshes callback'ini tetikler)
      //    Şimdilik: direct mesh oluştur
      const upperMat = new THREE.MeshPhongMaterial({
        color:        0xf4ede0,
        specular:     0x222222,
        shininess:    30,
        vertexColors: false,
        side:         THREE.DoubleSide,
      });
      const lowerMat = new THREE.MeshPhongMaterial({
        color:        0xeae2d3,
        specular:     0x222222,
        shininess:    30,
        vertexColors: false,
        side:         THREE.DoubleSide,
      });

      const upperMesh = new THREE.Mesh(upperGeom, upperMat);
      const lowerMesh = new THREE.Mesh(lowerGeom, lowerMat);
      upperMesh.castShadow    = true;
      lowerMesh.castShadow    = true;
      upperMesh.receiveShadow = true;
      lowerMesh.receiveShadow = true;

      upperMeshRef.current = upperMesh;
      lowerMeshRef.current = lowerMesh;

      // 3) BVH mesafe hesapla
      setProgress(0.15);
      const startMs = Date.now();

      // Adaptif stride: hedef ~100K iterasyon.
      // 500K vertex → stride 5, 1M → 10, 2M → 20 … büyük mesh'lerde bile <10sn.
      const lowerVertexCount = lowerGeom.getAttribute('position').count;
      const TARGET_ITERATIONS = 100_000;
      const adaptiveStride = Math.max(
        1,
        Math.ceil(lowerVertexCount / TARGET_ITERATIONS),
      );
      console.log(`[occlusion] ${lowerVertexCount} vertex → stride ${adaptiveStride} (≈${Math.ceil(lowerVertexCount / adaptiveStride)} iterasyon)`);

      const distances = await computeMeshDistance(
        upperGeom,
        lowerGeom,
        upperMesh.matrixWorld,
        {
          maxDistance:  5,
          sampleStride: adaptiveStride,
          onProgress:   (pct) => setProgress(0.15 + pct * 0.65),
        },
      );

      // 4) Penetrasyon tespiti
      setProgress(0.82);
      const penetrationPoints = detectPenetrations(lowerGeom, distances);
      const statistics        = computeStatistics(distances, penetrationPoints);

      // 5) Heatmap vertex colors uygula
      setProgress(0.92);
      applyHeatmapColors(lowerGeom, distances, heatmapConfig, true);
      toggleVertexColors(lowerMat, true);

      const durationMs = Date.now() - startMs;

      setResult({
        distances,
        penetrationPoints,
        statistics,
        heatmapApplied: true,
        durationMs,
      });

      setProgress(1);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsAnalyzing(false);
    }
  }, [heatmapConfig, parseGeometry]);

  // ─── Mode ───────────────────────────────────────────────
  const setMode = useCallback((mode: Mode) => {
    setActiveMode(mode);

    const lower = lowerMeshRef.current;
    if (!lower || !result) return;

    const heatmapOn = mode === 'heatmap' || mode === 'penetration';
    applyHeatmapColors(
      lower.geometry,
      result.distances,
      heatmapConfig,
      heatmapOn,
    );
    toggleVertexColors(lower.material as THREE.Material, heatmapOn);
  }, [heatmapConfig, result]);

  // ─── Palette ─────────────────────────────────────────────
  const setPalette = useCallback((palette: PaletteName) => {
    const newCfg = { ...heatmapConfig, palette };
    setHeatmapConfig(newCfg);

    const lower = lowerMeshRef.current;
    if (lower && result) {
      applyHeatmapColors(lower.geometry, result.distances, newCfg, true);
    }
  }, [heatmapConfig, result]);

  // ─── Max distance ────────────────────────────────────────
  const setMaxDistance = useCallback((mm: number) => {
    const newCfg = { ...heatmapConfig, maxDistance: mm };
    setHeatmapConfig(newCfg);

    const lower = lowerMeshRef.current;
    if (lower && result) {
      applyHeatmapColors(lower.geometry, result.distances, newCfg, true);
    }
  }, [heatmapConfig, result]);

  // ─── Upper opacity ───────────────────────────────────────
  const setUpperOpacity = useCallback((v: number) => {
    setUpperOpacityState(v);
    const upper = upperMeshRef.current;
    if (upper) {
      const mat = upper.material as THREE.MeshPhongMaterial;
      mat.transparent = v < 1;
      mat.opacity     = v;
      mat.needsUpdate = true;
    }
  }, []);

  const setViewPreset = useCallback((p: ViewPreset) => {
    setViewPresetState(p);
    // Kamera animasyonu OcclusionViewer'da yönetilir — buradan viewPreset state değişimi yeterli
  }, []);

  // ─── Export ──────────────────────────────────────────────
  const exportReport = useCallback((): OcclusionReport | null => {
    if (!result) return null;
    const screenshot = rendererRef.current ? captureSnapshot(rendererRef.current) : undefined;
    return {
      statistics:              result.statistics,
      penetrationPoints:       result.penetrationPoints,
      measurements:            [],
      heatmapScreenshotDataUrl: screenshot,
      createdAt:               new Date().toISOString(),
    };
  }, [result]);

  // ─── Supabase kayıt ─────────────────────────────────────
  const saveToSupabase = useCallback(async (workOrderId: string) => {
    if (!result) return;
    const { supabase } = await import('../../../core/api/supabase');
    const screenshot   = rendererRef.current ? captureSnapshot(rendererRef.current) : null;

    // Screenshot'ı Storage'a yükle
    let screenshotUrl: string | null = null;
    if (screenshot) {
      const blob    = await fetch(screenshot).then((r) => r.blob());
      const path    = `occlusion/${workOrderId}/${Date.now()}.png`;
      const { data: upData } = await supabase.storage
        .from('occlusion-screenshots')
        .upload(path, blob, { contentType: 'image/png', upsert: true });
      if (upData) {
        const { data: urlData } = supabase.storage
          .from('occlusion-screenshots')
          .getPublicUrl(path);
        screenshotUrl = urlData.publicUrl;
      }
    }

    await supabase.from('occlusion_analyses').insert({
      work_order_id:           workOrderId,
      result_json:             {
        statistics:       result.statistics,
        penetrationPoints: result.penetrationPoints.map((p) => ({
          id:       p.id,
          depth:    p.depth,
          area:     p.area,
          severity: p.severity,
          position: { x: p.position.x, y: p.position.y, z: p.position.z },
        })),
      },
      heatmap_screenshot_url:  screenshotUrl,
      analysis_duration_ms:    result.durationMs,
    });
  }, [result]);

  return {
    isAnalyzing,
    progress,
    result,
    error,
    upperMeshRef,
    lowerMeshRef,
    rendererRef,
    cameraRef,
    activeMode,
    heatmapConfig,
    upperOpacity,
    viewPreset,
    runAnalysis,
    setMode,
    setPalette,
    setMaxDistance,
    setUpperOpacity,
    setViewPreset,
    exportReport,
    saveToSupabase,
  };
}
