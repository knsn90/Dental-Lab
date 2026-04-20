// modules/occlusion/index.ts
// Barrel export — public API surface of the occlusion analysis module

export { default as OcclusionScreen } from './screens/OcclusionScreen';

export { OcclusionViewer } from './components/OcclusionViewer';
export { OcclusionAnalysisModal } from './components/OcclusionAnalysisModal';
export { OcclusionToolbar, ViewPresets } from './components/OcclusionToolbar';
export { ModePanel } from './components/ModePanel';
export { HeatmapLegend } from './components/HeatmapLegend';
export { OcclusionReport } from './components/OcclusionReport';
export { PenetrationMarkers } from './components/PenetrationMarkers';
export { MeasurementOverlay } from './components/MeasurementOverlay';

export { useOcclusionAnalysis } from './hooks/useOcclusionAnalysis';
export { useMeasurement } from './hooks/useMeasurement';

export * from './types/occlusion';
