/**
 * ModelViewer.tsx
 *
 * Basic 3D dental model viewer built on Three.js.
 * Runs only on web (rendered inside a <canvas> element).
 *
 * Current capabilities
 * ─────────────────────
 *  • Drag-and-drop STL file loading (binary + ASCII)
 *  • Multi-model support (upper jaw, lower jaw, or any extras)
 *  • Orbit controls  – rotate / zoom / pan
 *  • Basic three-point lighting  – ambient + two directional lights
 *
 * Extension points (not implemented yet)
 * ───────────────────────────────────────
 *  • Measurement tool  → attach to `toolRef` callbacks
 *  • Cross-section tool → manipulate `ClippingPlane` on the renderer
 *  • Occlusion analysis → custom ShaderMaterial swapped onto models
 *
 * Public API
 * ───────────
 *  <ModelViewer
 *    initialModels={[{ id, label, color, url }]}   // optional pre-loaded files
 *    onModelLoad={(model) => void}                  // called after each load
 *    onError={(msg) => void}                        // called on load failure
 *  />
 */

import React, {
  useEffect,
  useRef,
  useCallback,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DentalModel {
  /** Unique identifier, e.g. "upper" | "lower" | uuid */
  id: string;
  /** Human-readable label shown in the legend */
  label: string;
  /** Hex color string, e.g. "#e8d5c4" */
  color: string;
  /** Remote URL or object-URL (File → URL.createObjectURL) */
  url: string;
  /** Explicit format override — needed when url is an object-URL without extension */
  format?: 'stl' | 'ply';
}

export interface ModelViewerProps {
  /** Pre-load these models on mount */
  initialModels?: DentalModel[];
  /** Called with a DentalModel whenever a file finishes loading */
  onModelLoad?: (model: DentalModel) => void;
  /** Called with an error message when loading fails */
  onError?: (message: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_UPPER_COLOR = '#e8d5c4'; // ivory / tooth color
const DEFAULT_LOWER_COLOR = '#c8bdb8'; // slightly darker plaster
const BACKGROUND_COLOR    = 0x1a1a2e;  // deep navy – comfortable for dental review
const GRID_COLOR          = 0x2a2a4a;

// ─── Scene helpers ────────────────────────────────────────────────────────────

/** Build a Three.js scene with floor grid + sky gradient background */
function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND_COLOR);

  // Subtle floor grid – gives spatial reference without distracting
  const grid = new THREE.GridHelper(200, 40, GRID_COLOR, GRID_COLOR);
  (grid.material as THREE.Material).opacity = 0.3;
  (grid.material as THREE.Material).transparent = true;
  scene.add(grid);

  return scene;
}

/**
 * Three-point lighting rig:
 *  1. Ambient  – fills shadows softly
 *  2. Key      – primary directional from upper-front-right
 *  3. Fill     – softer light from left to reduce harsh shadows
 */
function createLights(): THREE.Object3D[] {
  const ambient = new THREE.AmbientLight(0xffffff, 0.45);

  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(60, 80, 60);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);

  const fill = new THREE.DirectionalLight(0xffeedd, 0.4);
  fill.position.set(-60, 40, -20);

  return [ambient, key, fill];
}

/** Create a PerspectiveCamera positioned above and in front of origin */
function createCamera(width: number, height: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
  camera.position.set(0, 60, 120);
  camera.lookAt(0, 0, 0);
  return camera;
}

/** Configure OrbitControls for dental review workflow */
function createControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;   // smooth deceleration
  controls.dampingFactor = 0.08;
  controls.minDistance = 20;
  controls.maxDistance = 500;
  controls.maxPolarAngle = Math.PI; // allow full vertical rotation
  controls.screenSpacePanning = true;
  return controls;
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/** Center + scale a geometry to fit a 100-unit bounding box. */
function normaliseGeometry(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box    = geometry.boundingBox!;
  const center = new THREE.Vector3();
  box.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);

  const size   = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale  = maxDim > 0 ? 100 / maxDim : 1;
  geometry.scale(scale, scale, scale);

  geometry.computeVertexNormals();
}

/** Build a MeshStandardMaterial, using vertex colors if available. */
function buildMaterial(geometry: THREE.BufferGeometry, color: string): THREE.MeshStandardMaterial {
  const hasVertexColor = !!geometry.attributes.color;
  return new THREE.MeshStandardMaterial({
    color:        hasVertexColor ? undefined : new THREE.Color(color),
    vertexColors: hasVertexColor,
    roughness:    0.55,
    metalness:    0.05,
    side:         THREE.DoubleSide,
  });
}

// ─── STL / PLY loading ───────────────────────────────────────────────────────

/** Load an STL or PLY file from a URL and return a Three.js Mesh. */
async function loadModel(
  url: string,
  color: string,
  format?: 'stl' | 'ply',
): Promise<THREE.Mesh> {
  // Fetch the raw bytes ourselves — more reliable for blob:// object URLs
  // than delegating to the loader's internal XHR (which can silently fail).
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching model`);
  }
  const buffer = await response.arrayBuffer();

  // Prefer explicit format, fall back to URL extension
  const ext = format ?? url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';

  let geometry: THREE.BufferGeometry;
  if (ext === 'ply') {
    geometry = new PLYLoader().parse(buffer);
  } else {
    geometry = new STLLoader().parse(buffer);
  }

  normaliseGeometry(geometry);
  return new THREE.Mesh(geometry, buildMaterial(geometry, color));
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ModelViewer({
  initialModels = [],
  onModelLoad,
  onError,
}: ModelViewerProps) {
  const canvasRef    = useRef<HTMLDivElement>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef     = useRef<THREE.Scene | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef  = useRef<OrbitControls | null>(null);
  const frameIdRef   = useRef<number>(0);
  /** Map from DentalModel.id → Three.js Mesh, for future tool operations */
  const meshMapRef   = useRef<Map<string, THREE.Mesh>>(new Map());

  const [loadedModels, setLoadedModels] = useState<DentalModel[]>([]);
  const [isDragOver,   setIsDragOver]   = useState(false);
  const [isLoading,    setIsLoading]    = useState(false);
  const [webglError,   setWebglError]   = useState(false);
  const [sceneReady,   setSceneReady]   = useState(false);

  // ── Scene initialisation ──────────────────────────────────────────────────

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    const W = container.clientWidth  || 600;
    const H = container.clientHeight || 480;

    // Renderer — try/catch handles environments without WebGL (SSR, low-end GPUs)
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        failIfMajorPerformanceCaveat: false,
      });
    } catch {
      setWebglError(true);
      return;
    }
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene + camera + controls
    const scene    = createScene();
    const camera   = createCamera(W, H);
    const controls = createControls(camera, renderer.domElement);
    sceneRef.current   = scene;
    cameraRef.current  = camera;
    controlsRef.current = controls;
    setSceneReady(true);

    // Lights
    createLights().forEach((light) => scene.add(light));

    // Animation loop
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize observer – keeps canvas filling its container
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(frameIdRef.current);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  // ── Load initial models once scene is confirmed ready ────────────────────

  useEffect(() => {
    if (!sceneReady || !initialModels.length) return;
    initialModels.forEach((model) => addModelToScene(model));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneReady]);

  // ── Core: add a model to the Three.js scene ───────────────────────────────

  const addModelToScene = useCallback(
    async (model: DentalModel) => {
      const scene = sceneRef.current;
      if (!scene) return;

      setIsLoading(true);
      try {
        // Remove old mesh with the same id if it exists (re-load scenario)
        const existing = meshMapRef.current.get(model.id);
        if (existing) {
          scene.remove(existing);
          existing.geometry.dispose();
          (existing.material as THREE.Material).dispose();
          meshMapRef.current.delete(model.id);
        }

        const mesh = await loadModel(model.url, model.color, model.format);
        mesh.name  = model.id;
        mesh.receiveShadow = true;
        mesh.castShadow    = true;

        // Offset upper/lower jaw so they don't overlap when both are loaded
        if (model.id === 'upper') mesh.position.y =  12;
        if (model.id === 'lower') mesh.position.y = -12;

        scene.add(mesh);
        meshMapRef.current.set(model.id, mesh);

        setLoadedModels((prev) => {
          const filtered = prev.filter((m) => m.id !== model.id);
          return [...filtered, model];
        });

        onModelLoad?.(model);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[ModelViewer] load failed:', msg);
        onError?.(`Failed to load "${model.label}": ${msg}`);
      } finally {
        setIsLoading(false);
      }
    },
    [onModelLoad, onError],
  );

  // ── Drag & drop handlers ──────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files).filter((f) =>
        /\.(stl|ply)$/i.test(f.name),
      );

      if (!files.length) {
        onError?.('Please drop one or more .stl or .ply files.');
        return;
      }

      files.forEach((file, index) => {
        const objectUrl = URL.createObjectURL(file);
        const isPly     = file.name.toLowerCase().endsWith('.ply');
        const isUpper   = file.name.toLowerCase().includes('upper') || file.name.toLowerCase().includes('ust');
        const isLower   = file.name.toLowerCase().includes('lower') || file.name.toLowerCase().includes('alt');

        const id    = isUpper ? 'upper' : isLower ? 'lower' : `model_${Date.now()}_${index}`;
        const color = isPly
          ? '#b0d4e8'   // PLY often has vertex colors; fallback to light blue
          : isUpper
          ? DEFAULT_UPPER_COLOR
          : isLower
          ? DEFAULT_LOWER_COLOR
          : '#b0c4de';

        const model: DentalModel = {
          id,
          label: file.name.replace(/\.(stl|ply)$/i, ''),
          color,
          url: objectUrl,
        };

        addModelToScene(model);
      });
    },
    [addModelToScene, onError],
  );

  // ── Remove a model ────────────────────────────────────────────────────────

  const removeModel = useCallback((id: string) => {
    const scene = sceneRef.current;
    const mesh  = meshMapRef.current.get(id);
    if (scene && mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      meshMapRef.current.delete(id);
    }
    setLoadedModels((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // ── Reset camera to default position ─────────────────────────────────────

  const resetCamera = useCallback(() => {
    const camera   = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    camera.position.set(0, 60, 120);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  }, []);

  // ── Snap to a named view (Exocad-style) ───────────────────────────────────

  const setView = useCallback((view: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom') => {
    const camera   = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const target = controls.target.clone();
    const dist   = camera.position.distanceTo(target) || 130;
    // For top/bottom, tilt slightly off-axis so OrbitControls doesn't lock up
    const positions: Record<string, [number, number, number]> = {
      front:  [0,       0,       dist   ],
      back:   [0,       0,      -dist   ],
      left:   [-dist,   0,       0      ],
      right:  [dist,    0,       0      ],
      top:    [0.001,   dist,    0      ],
      bottom: [0.001,  -dist,    0      ],
    };
    const [dx, dy, dz] = positions[view];
    camera.position.set(target.x + dx, target.y + dy, target.z + dz);
    camera.lookAt(target);
    controls.update();
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  // WebGL not available — show a graceful fallback instead of crashing
  if (webglError) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>⬡</div>
          <p style={styles.emptyTitle}>3D görüntüleyici kullanılamıyor</p>
          <p style={styles.emptySubtitle}>
            Tarayıcınız WebGL desteklemiyor.{'\n'}
            Dosya iş emri gönderildiğinde laboratuvara iletilecek.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <style>{`@keyframes mv-spin { to { transform: rotate(360deg); } } .mv-spinner { animation: mv-spin 0.8s linear infinite; }`}</style>
      {/* ── 3D canvas ───────────────────────────────────────────────── */}
      <div
        ref={canvasRef}
        style={{
          ...styles.canvas,
          outline: isDragOver ? '3px dashed #2563EB' : '3px dashed transparent',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />

      {/* ── Drop overlay ────────────────────────────────────────────── */}
      {isDragOver && (
        <div style={styles.dropOverlay}>
          <span style={styles.dropLabel}>Drop STL / PLY files here</span>
        </div>
      )}

      {/* ── Loading spinner ─────────────────────────────────────────── */}
      {isLoading && (
        <div style={styles.loadingOverlay}>
          <div style={styles.spinner} className="mv-spinner" />
        </div>
      )}

      {/* ── Empty state hint ────────────────────────────────────────── */}
      {!isLoading && loadedModels.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>⬆</div>
          <p style={styles.emptyTitle}>Drag & drop STL / PLY files</p>
          <p style={styles.emptySubtitle}>
            "upper" / "ust" → üst çene &nbsp;·&nbsp; "lower" / "alt" → alt çene
          </p>
        </div>
      )}

      {/* ── View toolbar (bottom-center) ────────────────────────────── */}
      <div style={styles.viewBar}>
        {(
          [
            { id: 'front',  label: 'Ön'   },
            { id: 'back',   label: 'Arka' },
            { id: 'left',   label: 'Sol'  },
            { id: 'right',  label: 'Sağ'  },
            { id: 'top',    label: 'Üst'  },
            { id: 'bottom', label: 'Alt'  },
          ] as const
        ).map(({ id, label }) => (
          <button key={id} style={styles.viewBarBtn} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
        <div style={styles.viewBarSep} />
        <button style={styles.viewBarBtn} onClick={resetCamera} title="Perspektif">⟳</button>
      </div>

      {/* ── Legend (bottom-left) ────────────────────────────────────── */}
      {loadedModels.length > 0 && (
        <div style={styles.legend}>
          {loadedModels.map((m) => (
            <div key={m.id} style={styles.legendRow}>
              <span style={{ ...styles.legendDot, background: m.color }} />
              <span style={styles.legendLabel}>{m.label}</span>
              <button
                style={styles.legendRemove}
                onClick={() => removeModel(m.id)}
                title="Remove model"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position:        'relative',
    width:           '100%',
    height:          '100%',
    minHeight:       480,
    borderRadius:    12,
    overflow:        'hidden',
    backgroundColor: '#1a1a2e',
  },
  canvas: {
    width:          '100%',
    height:         '100%',
    display:        'block',
    borderRadius:   12,
    transition:     'outline 0.15s',
  },
  dropOverlay: {
    position:       'absolute',
    inset:          0,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    background:     'rgba(37,99,235,0.18)',
    borderRadius:   12,
    pointerEvents:  'none',
  },
  dropLabel: {
    color:      '#93c5fd',
    fontSize:   22,
    fontWeight: 600,
    letterSpacing: 0.5,
  },
  loadingOverlay: {
    position:       'absolute',
    inset:          0,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    background:     'rgba(0,0,0,0.35)',
    borderRadius:   12,
  },
  spinner: {
    width:        40,
    height:       40,
    borderRadius: '50%',
    border:       '3px solid rgba(255,255,255,0.15)',
    borderTop:    '3px solid #2563EB',
    // animation applied via className (React Native Web doesn't support 'animation' key)
  } as React.CSSProperties,
  emptyState: {
    position:       'absolute',
    inset:          0,
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    pointerEvents:  'none',
    gap:            8,
  },
  emptyIcon: {
    fontSize:   48,
    color:      '#334155',
    lineHeight: 1,
  },
  emptyTitle: {
    margin:     0,
    color:      '#64748b',
    fontSize:   18,
    fontWeight: 600,
  },
  emptySubtitle: {
    margin:     0,
    color:      '#475569',
    fontSize:   13,
    textAlign:  'center',
    lineHeight: 1.6,
  },
  /* ── View toolbar ── */
  viewBar: {
    position:        'absolute',
    bottom:          14,
    left:            '50%',
    transform:       'translateX(-50%)',
    display:         'flex',
    alignItems:      'center',
    gap:             4,
    background:      'rgba(10,18,32,0.82)',
    border:          '1px solid rgba(255,255,255,0.10)',
    borderRadius:    12,
    padding:         '5px 8px',
    backdropFilter:  'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    userSelect:      'none',
  } as React.CSSProperties,
  viewBarBtn: {
    height:          30,
    minWidth:        38,
    paddingLeft:     10,
    paddingRight:    10,
    borderRadius:    8,
    border:          'none',
    background:      'transparent',
    color:           '#94a3b8',
    fontSize:        12,
    fontWeight:      600,
    cursor:          'pointer',
    transition:      'background 0.12s, color 0.12s',
    letterSpacing:   0.3,
  } as React.CSSProperties,
  viewBarSep: {
    width:           1,
    height:          18,
    background:      'rgba(255,255,255,0.12)',
    margin:          '0 2px',
  } as React.CSSProperties,
  legend: {
    position:        'absolute',
    bottom:          14,
    left:            14,
    background:      'rgba(15,23,42,0.78)',
    border:          '1px solid rgba(255,255,255,0.08)',
    borderRadius:    10,
    padding:         '8px 12px',
    display:         'flex',
    flexDirection:   'column',
    gap:             6,
    backdropFilter:  'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
  },
  legendRow: {
    display:     'flex',
    alignItems:  'center',
    gap:         8,
  },
  legendDot: {
    width:        12,
    height:       12,
    borderRadius: '50%',
    flexShrink:   0,
    border:       '1px solid rgba(255,255,255,0.2)',
  },
  legendLabel: {
    color:      '#cbd5e1',
    fontSize:   13,
    flexGrow:   1,
    whiteSpace: 'nowrap',
  },
  legendRemove: {
    background:  'none',
    border:      'none',
    color:       '#475569',
    cursor:      'pointer',
    fontSize:    11,
    padding:     '0 2px',
    lineHeight:  1,
  },
};
