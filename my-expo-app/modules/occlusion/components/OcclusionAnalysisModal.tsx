// modules/occlusion/components/OcclusionAnalysisModal.tsx
// Fullscreen modal wrapper around OcclusionViewer — fed by URIs, auto-runs analysis.
// Used by NewOrderScreen'in "Kapanış Analizi" butonu.
//
// Flow:
//  - visible açıldığında upperUri/lowerUri'den File objeleri üretilir
//  - useOcclusionAnalysis.runAnalysis() otomatik başlar
//  - Toolbar, ModePanel, Rapor, Overlay'ler render edilir
//  - "Kapat" → onClose(), sonuç varsa onResult(result) ile aktarılır

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { OcclusionViewer }       from './OcclusionViewer';
import { OcclusionToolbar, ViewPresets } from './OcclusionToolbar';
import { ModePanel }             from './ModePanel';
import { PenetrationMarkers }    from './PenetrationMarkers';
import { MeasurementOverlay }    from './MeasurementOverlay';
import { OcclusionReport }       from './OcclusionReport';

import { useOcclusionAnalysis }  from '../hooks/useOcclusionAnalysis';
import { useMeasurement }        from '../hooks/useMeasurement';
import { captureSnapshot }       from '../utils/heatmapGenerator';

import type {
  OcclusionAnalysisResult,
  PenetrationPoint,
  SceneClickEvent,
  Severity,
} from '../types/occlusion';

export interface OcclusionAnalysisModalProps {
  visible:      boolean;
  upperUri:     string | null;
  upperName?:   string;        // default: 'upper.stl'
  lowerUri:     string | null;
  lowerName?:   string;        // default: 'lower.stl'
  biteUri?:     string | null; // opsiyonel — gelecekte align için
  onClose:      (snapshotDataUrl?: string) => void;
  onResult?:    (result: OcclusionAnalysisResult) => void;
}

// ─── URI → File helper ────────────────────────────────────────────
async function uriToFile(uri: string, name: string): Promise<File> {
  const resp = await fetch(uri);
  const blob = await resp.blob();
  const ext  = (name.split('.').pop() ?? 'stl').toLowerCase();
  return new File([blob], name, { type: blob.type || `model/${ext}` });
}

// ─── Modal component ──────────────────────────────────────────────
export function OcclusionAnalysisModal({
  visible,
  upperUri, upperName = 'upper.stl',
  lowerUri, lowerName = 'lower.stl',
  biteUri: _biteUri,
  onClose, onResult,
}: OcclusionAnalysisModalProps) {
  const analysis    = useOcclusionAnalysis();
  const measurement = useMeasurement();

  const [canvasSize,     setCanvasSize]     = useState({ w: 0, h: 0 });
  const [reportExpanded, setReportExpanded] = useState(false);
  const [activePen,      setActivePen]      = useState<PenetrationPoint | null>(null);
  const [severityFilter, setSeverityFilter] = useState<Record<Severity, boolean>>({
    low: true, medium: true, high: true,
  });
  const [started,        setStarted]        = useState(false);
  const [loadError,      setLoadError]      = useState<string | null>(null);

  // ── Auto-start analysis when modal becomes visible with both URIs ──
  useEffect(() => {
    if (!visible) return;
    if (started) return;
    if (!upperUri || !lowerUri) return;

    let cancelled = false;
    setStarted(true);
    setLoadError(null);

    (async () => {
      try {
        const [upperFile, lowerFile] = await Promise.all([
          uriToFile(upperUri, upperName),
          uriToFile(lowerUri, lowerName),
        ]);
        if (cancelled) return;
        await analysis.runAnalysis(upperFile, lowerFile);
      } catch (e) {
        if (!cancelled) setLoadError('Dosya yüklenemedi: ' + String(e));
      }
    })();

    return () => { cancelled = true; };
  }, [visible, started, upperUri, lowerUri, upperName, lowerName, analysis]);

  // ── Emit result to parent when analysis completes ──
  const lastEmittedRef = useRef<OcclusionAnalysisResult | null>(null);
  useEffect(() => {
    if (analysis.result && analysis.result !== lastEmittedRef.current) {
      lastEmittedRef.current = analysis.result;
      onResult?.(analysis.result);
    }
  }, [analysis.result, onResult]);

  // ── Reset on close ──
  const handleClose = useCallback(() => {
    // Snapshot'ı kapanmadan önce yakala (renderer henüz ayakta)
    let snap: string | undefined;
    try {
      if (analysis.rendererRef.current && analysis.result) {
        snap = captureSnapshot(analysis.rendererRef.current);
      }
    } catch { /* noop */ }

    onClose(snap);
    // Delay reset so exit animation doesn't re-flash empty UI
    setTimeout(() => {
      setStarted(false);
      setActivePen(null);
      setReportExpanded(false);
      setLoadError(null);
      lastEmittedRef.current = null;
      measurement.clearAll();
    }, 200);
  }, [onClose, measurement, analysis]);

  // ── Viewer callbacks ──
  const handleReady = useCallback(
    (renderer: any, camera: any, size: { w: number; h: number }) => {
      analysis.rendererRef.current = renderer;
      analysis.cameraRef.current   = camera;
      setCanvasSize(size);
    }, [analysis],
  );

  const handleClick = useCallback((event: SceneClickEvent) => {
    if (analysis.activeMode === 'measurement') {
      measurement.handleClick(event);
    }
  }, [analysis.activeMode, measurement]);

  const filteredPen = useMemo(
    () => (analysis.result?.penetrationPoints ?? []).filter((p) => severityFilter[p.severity]),
    [analysis.result, severityFilter],
  );

  const hasMeshes          = analysis.upperMeshRef.current && analysis.lowerMeshRef.current;
  const showPenMarkers     = hasMeshes && analysis.activeMode === 'penetration';
  const showMeasureOverlay = hasMeshes && analysis.activeMode === 'measurement';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={handleClose}
      transparent={false}
      presentationStyle="fullScreen"
    >
      <View style={s.root}>
        {/* ── Top bar ── */}
        <View style={s.topBar}>
          <View style={s.titleRow}>
            <View style={s.titleIcon}>
              <MaterialCommunityIcons name={'cube-scan' as any} size={18} color="#0F172A" />
            </View>
            <View>
              <Text style={s.title}>Kapanış Analizi</Text>
              <Text style={s.sub}>Alt / Üst çene oklüzyon karşılaştırması</Text>
            </View>
            {analysis.result && (
              <View style={s.chip}>
                <View style={s.chipDot} />
                <Text style={s.chipText}>Analiz tamamlandı</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={s.closeBtn} onPress={handleClose} activeOpacity={0.8}>
            <MaterialCommunityIcons name={'close' as any} size={16} color="#0F172A" />
            <Text style={s.closeBtnText}>Kapat</Text>
          </TouchableOpacity>
        </View>

        {/* ── Stage ── */}
        <View style={s.stage}>
          <OcclusionViewer
            upperMesh={analysis.upperMeshRef.current}
            lowerMesh={analysis.lowerMeshRef.current}
            mode={analysis.activeMode}
            viewPreset={analysis.viewPreset}
            onReady={handleReady}
            onClick={handleClick}
          />

          {/* Loading */}
          {analysis.isAnalyzing && (
            <View style={s.loadingLayer}>
              <View style={s.loadingCard}>
                <ActivityIndicator size="small" color="#0F172A" />
                <Text style={s.loadingText}>3D mesh analiz ediliyor…</Text>
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { width: `${analysis.progress * 100}%` }]} />
                </View>
                <Text style={s.progressText}>{Math.round(analysis.progress * 100)}%</Text>
              </View>
            </View>
          )}

          {/* Errors */}
          {(analysis.error || loadError) && (
            <View style={s.errorLayer}>
              <MaterialCommunityIcons name={'alert-circle' as any} size={14} color="#DC2626" />
              <Text style={s.errorText}>{loadError ?? analysis.error}</Text>
            </View>
          )}

          {/* Toolbar + view presets */}
          {analysis.result && (
            <>
              <OcclusionToolbar mode={analysis.activeMode} onModeChange={analysis.setMode} />
              <ViewPresets value={analysis.viewPreset} onChange={analysis.setViewPreset} />
            </>
          )}

          {/* Mode panel (right sidebar) */}
          {analysis.result && (
            <ModePanel
              mode={analysis.activeMode}
              upperOpacity={analysis.upperOpacity}
              setUpperOpacity={analysis.setUpperOpacity}
              heatmapConfig={analysis.heatmapConfig}
              setPalette={analysis.setPalette}
              setMaxDistance={analysis.setMaxDistance}
              penetrationPoints={analysis.result.penetrationPoints}
              severityFilter={severityFilter}
              setSeverityFilter={setSeverityFilter}
              activePen={activePen}
              setActivePen={setActivePen}
              measurements={measurement.measurements}
              pendingPoint={measurement.pendingPoint}
              removeMeasurement={measurement.removeMeasurement}
              clearMeasurements={measurement.clearAll}
              resetPending={measurement.resetPending}
            />
          )}

          {/* Penetration markers */}
          {showPenMarkers && analysis.result && (
            <PenetrationMarkers
              points={filteredPen}
              camera={analysis.cameraRef.current}
              canvasW={canvasSize.w}
              canvasH={canvasSize.h}
              activePen={activePen}
              setActivePen={setActivePen}
            />
          )}

          {/* Measurement overlay */}
          {showMeasureOverlay && (
            <MeasurementOverlay
              measurements={measurement.measurements}
              pendingPoint={measurement.pendingPoint}
              camera={analysis.cameraRef.current}
              canvasW={canvasSize.w}
              canvasH={canvasSize.h}
            />
          )}

          {/* Report (bottom expandable) */}
          {analysis.result && (
            <OcclusionReport
              stats={analysis.result.statistics}
              penPoints={analysis.result.penetrationPoints}
              expanded={reportExpanded}
              onToggle={() => setReportExpanded((e) => !e)}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, flex: 1, minWidth: 0,
  },
  titleIcon: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EFF6FF',
  },
  title: { fontSize: 15, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  sub:   { fontSize: 11, color: '#94A3B8', marginTop: 1 },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, backgroundColor: '#ECFDF5',
    borderWidth: 1, borderColor: '#A7F3D0',
    marginLeft: 8,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#059669' },
  chipText: { fontSize: 11, color: '#059669', fontWeight: '700' },

  closeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  closeBtnText: { fontSize: 12, fontWeight: '700', color: '#0F172A' },

  stage: {
    flex: 1, position: 'relative',
    backgroundColor: '#F8FAFC',
  },

  loadingLayer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(248,250,252,0.85)',
  },
  loadingCard: {
    backgroundColor: '#FFFFFF', padding: 24, borderRadius: 12,
    alignItems: 'center', gap: 12, minWidth: 260,
    borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#000', shadowOpacity: 0.05,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  loadingText: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  progressBar: {
    width: '100%', height: 4, backgroundColor: '#F1F5F9',
    borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#0F172A' },
  progressText: {
    fontSize: 11, fontWeight: '700', color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },

  errorLayer: {
    position: 'absolute', top: 16, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, backgroundColor: '#FEF2F2',
    borderWidth: 1, borderColor: '#FECACA', borderRadius: 8,
  },
  errorText: { color: '#DC2626', fontSize: 12, flex: 1 },
});
