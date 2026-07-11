/**
 * viewer-3d — Public API.
 *
 * KULLANIM (kritik — modülün hızlı olması için ZORUNLU):
 *
 * Çağıran component (örn. OrderDetailScreen) modal'ı ASLA static import
 * etmez. Her zaman React.lazy + Suspense + conditional render:
 *
 *   const Viewer3DModal = React.lazy(() =>
 *     import('modules/viewer-3d').then(m => ({ default: m.Viewer3DModal }))
 *   );
 *   ...
 *   {viewerOpen && (
 *     <React.Suspense fallback={null}>
 *       <Viewer3DModal visible={viewerOpen} files={files} onClose={...} />
 *     </React.Suspense>
 *   )}
 *
 * Bu sayede three.js + scene helpers + loader'lar **ayrı chunk**'ta kalır,
 * kullanıcı viewer butonuna basana kadar HİÇBİR byte indirilmez.
 *
 * Faz 1: STL only, single file, orbit + fit.
 */

export { Viewer3DModal } from './components/Viewer3DModal';
export { detectFormat } from './lib/loaders';
export { classifyFile, detectLayerType, getLayerInfo } from './lib/layerMap';
export { PRESETS, applyPreset } from './lib/cameraPresets';
export type { LayerType } from './lib/layerMap';
export type { CameraPreset } from './lib/cameraPresets';
export type { ViewerFile, Viewer3DProps, FileFormat } from './types';
