/**
 * viewerBridge — Açık 3D görüntüleyici ile Simanty (denty) asistanı arasında
 * köprü. Viewer3DModal mount olunca kontrollerini register eder; Simanty'nin
 * 3D araçları (kapanisAnalizi / taramaTeshis) buradan okur. Viewer kapalıyken
 * getActiveViewer() null döner → araçlar "viewer açık değil" der.
 *
 * Modül-seviyesi tek instance (global FAB / toolkit ile aynı desen).
 */
import type { OcclusionResult } from './lib/occlusion';

export interface ViewerScanDiag {
  name: string;
  triCount: number;
  holeEdges: number;
  nonManifoldEdges: number;
  invertedRatio: number;
  flags: string[];
}

export interface ViewerBridge {
  /** Kapanış analizini çalıştır (ısı haritası + banner) ve özet döndür. */
  analyzeOcclusion: () => Promise<OcclusionResult | null>;
  /** Yüklü taramaların kalite teşhisi (mesh diagnostics). */
  getDiagnostics: () => ViewerScanDiag[];
  /** Yüklü katmanlar (dosya adı + çene/tür). */
  getLayers: () => Array<{ name: string; type: string }>;
}

let _active: ViewerBridge | null = null;

export function registerViewer(b: ViewerBridge): void { _active = b; }
export function unregisterViewer(b: ViewerBridge): void { if (_active === b) _active = null; }
export function getActiveViewer(): ViewerBridge | null { return _active; }
