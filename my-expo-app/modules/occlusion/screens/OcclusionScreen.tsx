// modules/occlusion/screens/OcclusionScreen.tsx
// Oklüzyon analiz ana ekranı — Viewer + Toolbar + ModePanel + Report + Overlays
// Route: /(lab)/order/occlusion/[workOrderId] ve /(admin)/order/occlusion/[workOrderId]

import React, { useCallback, useRef, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OcclusionViewer }       from '../components/OcclusionViewer';
import { OcclusionToolbar, ViewPresets } from '../components/OcclusionToolbar';
import { ModePanel }             from '../components/ModePanel';
import { PenetrationMarkers }    from '../components/PenetrationMarkers';
import { MeasurementOverlay }    from '../components/MeasurementOverlay';
import { OcclusionReport }       from '../components/OcclusionReport';

import { useOcclusionAnalysis }  from '../hooks/useOcclusionAnalysis';
import { useMeasurement }        from '../hooks/useMeasurement';

import type { PenetrationPoint, Severity, SceneClickEvent } from '../types/occlusion';

export default function OcclusionScreen() {
  const router = useRouter();
  const { id: workOrderId } = useLocalSearchParams<{ id: string }>();

  const { width: _viewportW } = useWindowDimensions();
  const isMobile = _viewportW < 769;

  const analysis    = useOcclusionAnalysis();
  const measurement = useMeasurement();

  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [reportExpanded, setReportExpanded] = useState(false);
  const [panelOpen, setPanelOpen] = useState(!isMobile);
  const [activePen, setActivePen] = useState<PenetrationPoint | null>(null);
  const [severityFilter, setSeverityFilter] = useState<Record<Severity, boolean>>({
    low: true, medium: true, high: true,
  });

  const fileInputUpperRef = useRef<HTMLInputElement | null>(null);
  const fileInputLowerRef = useRef<HTMLInputElement | null>(null);
  const [pendingUpper, setPendingUpper] = useState<File | null>(null);
  const [pendingLower, setPendingLower] = useState<File | null>(null);

  // ─── Viewer callback'leri ────────────────────────────────
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

  // ─── File picker handlers ────────────────────────────────
  const pickUpper = () => fileInputUpperRef.current?.click();
  const pickLower = () => fileInputLowerRef.current?.click();

  const handleUpperFile = (e: any) => {
    const file = e.target.files?.[0];
    if (file) setPendingUpper(file);
  };
  const handleLowerFile = (e: any) => {
    const file = e.target.files?.[0];
    if (file) setPendingLower(file);
  };

  const startAnalysis = async () => {
    if (pendingUpper && pendingLower) {
      await analysis.runAnalysis(pendingUpper, pendingLower);
    }
  };

  const handleSaveToOrder = useCallback(async () => {
    if (!workOrderId) {
      alert('İş emri ID bulunamadı');
      return;
    }
    try {
      await analysis.saveToSupabase(workOrderId as string);
      alert('Analiz iş emrine başarıyla eklendi.');
    } catch (err) {
      alert('Kayıt hatası: ' + String(err));
    }
  }, [analysis, workOrderId]);

  // ─── Filtered penetration points ────────────────────────
  const filteredPen = useMemo(
    () => (analysis.result?.penetrationPoints ?? []).filter((p) => severityFilter[p.severity]),
    [analysis.result, severityFilter],
  );

  const hasMeshes = analysis.upperMeshRef.current && analysis.lowerMeshRef.current;
  const showPenMarkers      = hasMeshes && analysis.activeMode === 'penetration';
  const showMeasureOverlay  = hasMeshes && analysis.activeMode === 'measurement';

  // ─── Empty / loading states ──────────────────────────────
  if (!analysis.result && !analysis.isAnalyzing) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <TopBar onBack={() => router.back()} workOrderId={workOrderId as string} isMobile={isMobile} />

        <View style={[s.empty, isMobile && { padding: 20, gap: 12 }]}>
          <View style={s.emptyIcon}>
            <MaterialCommunityIcons name="molecule" size={48} color="#94A3B8" />
          </View>
          <Text style={[s.emptyTitle, isMobile && { fontSize: 18, textAlign: 'center' }]}>Oklüzyon Analizi Başlat</Text>
          <Text style={s.emptySub}>
            Üst ve alt çene STL/PLY dosyalarını yükleyerek ısı haritası ve penetrasyon analizini başlatın.
          </Text>

          <View style={[s.uploadGrid, isMobile && { flexDirection: 'column', gap: 10 }]}>
            <UploadCard
              label="Üst Çene"
              file={pendingUpper}
              onPick={pickUpper}
            />
            <UploadCard
              label="Alt Çene"
              file={pendingLower}
              onPick={pickLower}
            />
          </View>

          <TouchableOpacity
            style={[s.analyzeBtn, (!pendingUpper || !pendingLower) && s.analyzeBtnDisabled]}
            disabled={!pendingUpper || !pendingLower}
            onPress={startAnalysis}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="play-circle" size={16} color="#FFFFFF" />
            <Text style={s.analyzeBtnText}>Analizi Başlat</Text>
          </TouchableOpacity>

          {/* Hidden file inputs (web) */}
          {Platform.OS === 'web' && (
            <>
              {/* @ts-ignore */}
              <input
                ref={fileInputUpperRef}
                type="file"
                accept=".stl,.ply"
                onChange={handleUpperFile}
                style={{ display: 'none' } as any}
              />
              {/* @ts-ignore */}
              <input
                ref={fileInputLowerRef}
                type="file"
                accept=".stl,.ply"
                onChange={handleLowerFile}
                style={{ display: 'none' } as any}
              />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main viewer state ───────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <TopBar
        onBack={() => router.back()}
        workOrderId={workOrderId as string}
        analysisDone={!!analysis.result}
        onSave={handleSaveToOrder}
        isMobile={isMobile}
      />

      <View style={s.stage}>
        <OcclusionViewer
          upperMesh={analysis.upperMeshRef.current}
          lowerMesh={analysis.lowerMeshRef.current}
          mode={analysis.activeMode}
          viewPreset={analysis.viewPreset}
          onReady={handleReady}
          onClick={handleClick}
        />

        {/* Loading overlay */}
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

        {/* Error */}
        {analysis.error && (
          <View style={s.errorLayer}>
            <Text style={s.errorText}>{analysis.error}</Text>
          </View>
        )}

        {/* Left toolbar */}
        {analysis.result && (
          <OcclusionToolbar
            mode={analysis.activeMode}
            onModeChange={analysis.setMode}
            position={isMobile ? 'top' : 'left'}
          />
        )}

        {/* View presets */}
        {analysis.result && (
          <ViewPresets value={analysis.viewPreset} onChange={analysis.setViewPreset} isMobile={isMobile} />
        )}

        {/* Mobile panel toggle */}
        {analysis.result && isMobile && (
          <TouchableOpacity
            style={s.panelToggle}
            onPress={() => setPanelOpen((v) => !v)}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons
              name={panelOpen ? 'chevron-down' : 'tune-vertical'}
              size={18}
              color="#0F172A"
            />
          </TouchableOpacity>
        )}

        {/* Right mode panel */}
        {analysis.result && (!isMobile || panelOpen) && (
          <ModePanel
            mode={analysis.activeMode}
            isMobile={isMobile}
            onClose={isMobile ? () => setPanelOpen(false) : undefined}
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

        {/* Penetration markers overlay */}
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

        {/* Bottom report */}
        {analysis.result && (
          <OcclusionReport
            stats={analysis.result.statistics}
            penPoints={analysis.result.penetrationPoints}
            expanded={reportExpanded}
            onToggle={() => setReportExpanded((e) => !e)}
            onSaveToOrder={workOrderId ? handleSaveToOrder : undefined}
            isMobile={isMobile}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── TopBar ────────────────────────────────────────────────
function TopBar({
  onBack, workOrderId, analysisDone, onSave, isMobile,
}: {
  onBack: () => void; workOrderId?: string; analysisDone?: boolean; onSave?: () => void; isMobile?: boolean;
}) {
  return (
    <View style={[tb.bar, isMobile && { paddingHorizontal: 12, paddingVertical: 10, gap: 8 }]}>
      <TouchableOpacity onPress={onBack} style={tb.back}>
        <MaterialCommunityIcons name="arrow-left" size={18} color="#0F172A" />
      </TouchableOpacity>
      <View style={tb.titleWrap}>
        <Text style={[tb.title, isMobile && { fontSize: 14 }]} numberOfLines={1}>Oklüzyon Analizi</Text>
        {workOrderId && (
          <Text style={tb.sub}>İş Emri · {workOrderId.slice(0, 8)}</Text>
        )}
      </View>
      {analysisDone && !isMobile && (
        <View style={tb.chip}>
          <View style={tb.dot} />
          <Text style={tb.chipText}>Analiz tamamlandı</Text>
        </View>
      )}
      {analysisDone && onSave && (
        <TouchableOpacity
          style={[tb.primary, isMobile && { paddingHorizontal: 10, paddingVertical: 8 }]}
          onPress={onSave}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="link-variant" size={14} color="#FFFFFF" />
          {!isMobile && <Text style={tb.primaryText}>İş Emrine Ekle</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── UploadCard ────────────────────────────────────────────
function UploadCard({ label, file, onPick }: {
  label: string; file: File | null; onPick: () => void;
}) {
  return (
    <TouchableOpacity style={[uc.card, file && uc.cardFilled]} onPress={onPick} activeOpacity={0.85}>
      <View style={uc.iconWrap}>
        <MaterialCommunityIcons
          name={file ? 'check-circle' : 'tooth-outline'}
          size={28}
          color={file ? '#22C55E' : '#94A3B8'}
        />
      </View>
      <Text style={uc.label}>{label}</Text>
      {file ? (
        <Text style={uc.fileName} numberOfLines={1}>{file.name}</Text>
      ) : (
        <Text style={uc.hint}>STL / PLY dosyası seçin</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Styles ────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  stage: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#F8FAFC',
  },

  // Empty state
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 22, fontWeight: '800', color: '#0F172A',
    letterSpacing: -0.5,
  },
  emptySub: {
    fontSize: 13, color: '#64748B', textAlign: 'center',
    maxWidth: 420, lineHeight: 20,
  },
  uploadGrid: {
    flexDirection: 'row', gap: 12, marginTop: 16,
    width: '100%', maxWidth: 480,
  },
  analyzeBtn: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, paddingHorizontal: 24, paddingVertical: 12,
    backgroundColor: '#0F172A', borderRadius: 10,
    marginTop: 8,
  },
  analyzeBtnDisabled: { opacity: 0.4 },
  analyzeBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  // Loading
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

  // Error
  errorLayer: {
    position: 'absolute', top: 16, left: 16, right: 16,
    padding: 12, backgroundColor: '#FEF2F2',
    borderWidth: 1, borderColor: '#FECACA', borderRadius: 8,
  },
  errorText: { color: '#DC2626', fontSize: 12 },

  // Mobile panel toggle FAB
  panelToggle: {
    position: 'absolute',
    right: 12,
    top: 68,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    zIndex: 10,
  },
});

const tb = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  back: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  titleWrap: { flex: 1 },
  title: { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  sub:   { fontSize: 11, color: '#94A3B8', marginTop: 2, fontVariant: ['tabular-nums'] },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, backgroundColor: '#ECFDF5',
    borderWidth: 1, borderColor: '#A7F3D0',
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#059669' },
  chipText: { fontSize: 11, color: '#059669', fontWeight: '600' },

  primary: {
    flexDirection: 'row', alignItems: 'center',
    gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#0F172A', borderRadius: 8,
  },
  primaryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});

const uc = StyleSheet.create({
  card: {
    flex: 1,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    backgroundColor: '#FFFFFF',
    alignItems: 'center', gap: 8,
  },
  cardFilled: {
    borderStyle: 'solid',
    borderColor: '#22C55E',
    backgroundColor: '#F0FDF4',
  },
  iconWrap: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  fileName: {
    fontSize: 11, color: '#059669', fontWeight: '600',
    maxWidth: 200,
  },
  hint: { fontSize: 10, color: '#94A3B8' },
});
