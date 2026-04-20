// modules/occlusion/types/occlusion.ts
// Tip tanımları — handoff/code/occlusion.types.ts'ten TypeScript strict uyumlu

import * as THREE from 'three';

export type Mode = 'view' | 'heatmap' | 'penetration' | 'measurement';

export type Severity = 'low' | 'medium' | 'high';

export interface PenetrationPoint {
  id: string;               // 'P1', 'P2' …
  position: THREE.Vector3;
  depth: number;            // mm — pozitif
  area: number;             // mm²
  severity: Severity;
}

export interface OcclusionStatistics {
  minDistance: number;
  maxDistance: number;
  avgDistance: number;
  penetrationCount: number;
  totalPenetrationArea: number;
  contactPercentage: number;  // 0–100
}

export interface OcclusionAnalysisResult {
  distances: Float32Array;          // lower mesh vertex başına mesafe (mm)
  penetrationPoints: PenetrationPoint[];
  statistics: OcclusionStatistics;
  heatmapApplied: boolean;
  durationMs: number;
}

export interface MeasurementPoint {
  id: string;
  position: THREE.Vector3;
  meshType: 'upper' | 'lower';
}

export interface MeasurementLine {
  id: string;
  pointA: MeasurementPoint;
  pointB: MeasurementPoint;
  distance: number;  // mm
}

export interface OcclusionReport {
  workOrderId?: string;
  statistics: OcclusionStatistics;
  penetrationPoints: PenetrationPoint[];
  measurements: MeasurementLine[];
  heatmapScreenshotDataUrl?: string;
  createdAt: string;
}

// ─── Heatmap config ────────────────────────────────────────
export type PaletteName = 'medical' | 'thermal' | 'colorblind';

export interface HeatmapConfig {
  maxDistance: number;     // mm — slider default 3.0
  palette: PaletteName;
}

export const DEFAULT_HEATMAP_CONFIG: HeatmapConfig = {
  maxDistance: 3.0,
  palette: 'medical',
};

// ─── Kamera preset ─────────────────────────────────────────
export type ViewPreset = 'front' | 'top' | 'right' | 'left' | 'iso';

// ─── Scene callbacks ────────────────────────────────────────
export interface SceneClickEvent {
  position: THREE.Vector3;
  meshType: 'upper' | 'lower';
}

// ─── Severity severity renkleri (CSS) ─────────────────────
export const SEVERITY_COLOR: Record<Severity, string> = {
  high:   '#dc2626',   // kırmızı
  medium: '#d97706',   // amber
  low:    '#059669',   // yeşil
};
