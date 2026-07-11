/**
 * viewer-3d — Multi-layer dental 3D viewer for STL/PLY/OBJ files.
 *
 * Design goals (Faz 1):
 *   • Lazy-loaded — 0 byte impact on entry bundle
 *   • Single STL file viewer with orbit controls + fit-to-view
 *   • Loading + error states
 *   • Web only (Platform.OS === 'web')
 *
 * Future fazlar:
 *   2  PLY + OBJ + layer panel
 *   3  Auto-stack + toolbar + camera presets
 *   4  Per-layer opacity / color / wireframe
 *   5  Mobile (WebView wrapper)
 *   6  Measurement + cut plane
 *   7  Screenshot + entry points
 *   8  Performance polish (LOD, worker, dispose, FPS monitor)
 */

export type FileFormat = 'stl' | 'ply' | 'obj';

export interface ViewerFile {
  /** Stable unique key */
  id: string;
  /** Display name (filename) */
  name: string;
  /** Resolved URL — Supabase storage public URL or signed URL */
  url: string;
  /** File format (auto-detected from name or explicitly set) */
  format: FileFormat;
  /** Optional override color (hex). Defaults computed from filename prefix. */
  color?: string;
  /** OBJ için kardeş texture (PNG/JPG) signed URL'i — verilirse texture'lı render. */
  textureUrl?: string | null;
}

/** 2D referans fotoğraf (gülüş tasarımı, ekartörlü resim) — overlay hizalama için. */
export interface ReferenceImage {
  id: string;
  name: string;
  url: string;
}

export interface Viewer3DProps {
  /** Modal visibility */
  visible: boolean;
  /** Files to load (1+ for Faz 1, multi in Faz 2+) */
  files: ViewerFile[];
  /** 2D gülüş tasarımı / ekartörlü fotoğraflar — 3D üstünde overlay hizalama. */
  referenceImages?: ReferenceImage[];
  /** Modal title (e.g., order number / patient name) */
  title?: string;
  /** Called when modal close requested */
  onClose: () => void;
}

/** Per-layer visual settings — Faz 4 + Faz 6 manual transform. */
export interface LayerStyle {
  visible: boolean;
  /** 0-1 */
  opacity: number;
  /** Hex color (#RRGGBB) */
  color: string;
  /** true = sadece wireframe, false = solid mesh */
  wireframe: boolean;
  /** Faz 6: manuel Y offset (mm) — auto-stack üzerine ek kullanıcı ayarı. */
  offsetY?: number;
  /** S3: kullanıcı katmanı kilitlemiş — kazara değişiklik engellenir. */
  locked?: boolean;
}

/** Default style — layer auto-detect'ten gelen değerlerle override edilir. */
export const DEFAULT_LAYER_STYLE: LayerStyle = {
  visible: true,
  opacity: 1,
  color: '#E8D5C4',
  wireframe: false,
  offsetY: 0,
};

/** Faz 6: Measurement (2-point distance) */
export interface Measurement {
  id: string;
  /** World-space points (THREE.Vector3 serialized) */
  a: { x: number; y: number; z: number };
  b: { x: number; y: number; z: number };
  /** Computed distance in mm */
  distance: number;
}

/** Faz 6: Cut plane axis. */
export type CutAxis = 'none' | 'x' | 'y' | 'z';
