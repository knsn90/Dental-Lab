/**
 * Viewer3DModal — Full-screen modal: layer panel + 3D scene.
 *
 * Faz 2:
 *   • Multi-file support (1+ dosya)
 *   • Sol panel: layer listesi + visibility toggle
 *   • Auto-stack by filename (üst/alt/bite Y offset)
 *   • Mobile: panel üstte sheet'e dönüşür (Faz 5 + responsive)
 *
 * Web only — Native'de Platform.OS guard ile çağıran component'te kapatılır.
 */
import React, { useState, useMemo, useRef } from 'react';
import { View, Text, Pressable, Modal, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Download } from '../../../core/ui/icons';
import type { Viewer3DProps, LayerStyle, Measurement, CutAxis } from '../types';
import { ThreeScene, type ThreeSceneHandle } from './ThreeScene';
import { LayerPanel } from './LayerPanel';
import { ViewerToolbar } from './ViewerToolbar';
import { SmileOverlay } from './SmileOverlay';
import type { MeshDiagnostics } from '../lib/meshDiagnostics';
import { classifyFile, paletteColor } from '../lib/layerMap';
import { describeOcclusion, type OcclusionResult } from '../lib/occlusion';
import { describeWaviness, wavinessVerdict, DEFAULT_RANGE_UM, type WavinessResult } from '../lib/waviness';
import { registerViewer, unregisterViewer, type ViewerBridge } from '../viewerBridge';
import { useViewerTheme } from '../lib/viewerTheme';
import { toast } from '../../../core/ui/Toast';
import { autoT } from '../../../core/i18n/autoTranslate';
import { DentyFAB } from '../../denty/components/DentyFAB';
import { useSuppressDentyFab } from '../../../core/store/uiOverlayStore';
import { useScanAnnotations } from '../annotations/useScanAnnotations';
import { PEN_COLORS, PEN_WIDTHS } from '../annotations/types';
import type { AnnotationCamera, AnnotationKind, Point3 } from '../annotations/types';
import { PenOptionsBar, NoteTextPrompt } from './PenControls';

function Viewer3DModal(props: Viewer3DProps) {
  // Native (iOS / Android) → WebView wrapper (Faz 5).
  // RN'de three.js native bridge'i şişiriyor; HTML/WebView native GPU'yu doğrudan kullanır.
  if (Platform.OS !== 'web') {
    // Lazy require — web bundle'a react-native-webview girmesin.
    const Mobile = require('../mobile/MobileViewer3D').default;
    return <Mobile {...props} />;
  }

  const { visible, files, title, onClose, referenceImages = [], sourceDownload, onThumbnail, orderId } = props;
  const T = useViewerTheme();
  const insets = useSafeAreaInsets(); // mobil-web çentik/status bar boşluğu
  const { width: winW } = useWindowDimensions();
  const isNarrow = winW < 768;

  const sceneRef = useRef<ThreeSceneHandle | null>(null);
  const [fov, setFov] = useState(35);

  // Faz 6 state
  const [measureMode, setMeasureMode] = useState(false);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [cutAxis, setCutAxis] = useState<CutAxis>('none');
  const [cutPosition, setCutPosition] = useState(0);
  // Grid
  const [showGrid, setShowGrid] = useState(false);
  // Layers popup — telefonda KAPALI açılır: panel + dock birlikte modeli
  // tamamen gizliyordu. Katmanlar dock'taki katman düğmesinden açılır.
  const [layersOpen, setLayersOpen] = useState(() => winW >= 768);
  // Telefonda katman sayfası alt şerit olarak açılıyor; Simanty orb'u tam onun
  // üstüne (sağ alt) düşüp göz/kilit düğmelerini kapatıyordu. Panel açıkken
  // orb gizlenir, kapanınca geri gelir.
  useSuppressDentyFab(isNarrow && layersOpen);
  // ── 3D kalem (tarama üzerine not) ───────────────────────────────────────
  // Notlar siparişe bağlı saklanıyor; orderId yoksa özellik kapalı.
  const annots = useScanAnnotations(orderId, visible);
  const [penMode, setPenMode] = useState(false);
  const [penKind, setPenKind] = useState<AnnotationKind>('stroke');
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0]);
  const [penWidth, setPenWidth] = useState<number>(PEN_WIDTHS[1]);
  // "note" yakalandı → metin sorulur, sonra kaydedilir
  const [noteDraft, setNoteDraft] = useState<{
    fileName: string | null; points: Point3[]; camera: AnnotationCamera;
  } | null>(null);
  const [noteText, setNoteText] = useState('');
  // S4: X-ray mode + mesh diagnostics
  const [xrayMode, setXrayMode] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Record<string, MeshDiagnostics>>({});
  // Kapanış (oklüzyon) analizi — alt/üst çene mesafe ısı haritası + özet
  const [occlusion, setOcclusion] = useState<OcclusionResult | null>(null);
  const [occlusionBusy, setOcclusionBusy] = useState(false);
  // Yüzey dalgalanma analizi — servikal/kesim hattı artefaktı tespiti
  const [waviness, setWaviness] = useState<WavinessResult | null>(null);
  const [wavinessBusy, setWavinessBusy] = useState(false);
  const [wavinessRange, setWavinessRange] = useState(DEFAULT_RANGE_UM);

  // İki analiz de aynı vertex-renk kanalını kullanıyor; ikisi birden açık
  // olursa ikincisi birincinin haritasını eziyor. Tek aktif harita kuralı.
  const anyBusy = occlusionBusy || wavinessBusy;
  const clearMaps = () => {
    if (occlusion) { sceneRef.current?.clearOcclusion(); setOcclusion(null); }
    if (waviness) { sceneRef.current?.clearWaviness(); setWaviness(null); }
  };

  const toggleOcclusion = async () => {
    if (anyBusy) return;
    if (occlusion) { sceneRef.current?.clearOcclusion(); setOcclusion(null); return; }
    clearMaps();
    setOcclusionBusy(true);
    try {
      const res = (await sceneRef.current?.analyzeOcclusion()) ?? null;
      if (!res) { toast.info('Kapanış analizi için üst + alt çene taraması gerekli.'); }
      setOcclusion(res);
    } catch (e: any) {
      console.error('[occlusion]', e);
      toast.error('Kapanış analizi yapılamadı.');
    } finally {
      setOcclusionBusy(false);
    }
  };

  const toggleWaviness = async () => {
    if (anyBusy) return;
    if (waviness) { sceneRef.current?.clearWaviness(); setWaviness(null); return; }
    clearMaps();
    setWavinessBusy(true);
    try {
      const res = (await sceneRef.current?.analyzeWaviness(wavinessRange)) ?? null;
      if (!res) toast.info(autoT('Dalgalanma analizi için görünür bir yüzey taraması gerekli.'));
      setWaviness(res);
    } catch (e: any) {
      console.error('[waviness]', e);
      toast.error(e?.message ?? autoT('Dalgalanma analizi yapılamadı.'));
      setWaviness(null);
    } finally {
      setWavinessBusy(false);
    }
  };


  // Simanty köprüsü — asistanın 3D araçları (kapanisAnalizi / taramaTeshis) için
  // açık viewer'ın kontrollerini register et. files/diagnostics değişince güncelle.
  React.useEffect(() => {
    const bridge: ViewerBridge = {
      analyzeOcclusion: async () => {
        setOcclusionBusy(true);
        try {
          const res = (await sceneRef.current?.analyzeOcclusion()) ?? null;
          setOcclusion(res);
          return res;
        } catch (e) { console.error('[occlusion]', e); return null; }
        finally { setOcclusionBusy(false); }
      },
      getDiagnostics: () => files.map(f => {
        const d = diagnostics[f.id];
        if (!d) return null;
        return {
          name: f.name, triCount: d.triCount, holeEdges: d.holeEdges,
          nonManifoldEdges: d.nonManifoldEdges, invertedRatio: d.invertedRatio,
          flags: (d.flags ?? []).map(String),
        };
      }).filter(Boolean) as any,
      getLayers: () => files.map(f => ({ name: f.name, type: classifyFile(f.name).type })),
    };
    registerViewer(bridge);
    return () => unregisterViewer(bridge);
  }, [files, diagnostics]);
  // S4 fix: Auto-align — varsayılan kapalı (exocad davranışı, ham koord).
  const [autoAlign, setAutoAlign] = useState(false);
  // Faz A: Smile design foto overlay
  const [smileOpen, setSmileOpen] = useState(false);

  // Layer styles — visibility + opacity + color + wireframe per layer
  // exocad gibi: her layer'a yüklenme sırasına göre paletten ayrı renk ver.
  // file.color (örn. OBJ texture rengi) açıkça verilmişse o korunur.
  const buildDefault = (file: typeof files[number], index: number): LayerStyle => {
    const layer = classifyFile(file.name);
    return {
      visible: true,
      opacity: layer.opacity ?? 1,
      color: file.color ?? paletteColor(index),
      wireframe: false,
    };
  };
  const idxOf = (id: string) => Math.max(0, files.findIndex(f => f.id === id));
  const [layerStyles, setLayerStyles] = useState<Record<string, LayerStyle>>(() => {
    const init: Record<string, LayerStyle> = {};
    files.forEach((f, i) => { init[f.id] = buildDefault(f, i); });
    return init;
  });

  // files prop değişirse yeni dosyalar için default style ekle
  React.useEffect(() => {
    setLayerStyles((prev) => {
      const next = { ...prev };
      let changed = false;
      files.forEach((f, i) => {
        if (!(f.id in next)) { next[f.id] = buildDefault(f, i); changed = true; }
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // ── Format ayrımı ────────────────────────────────────────────────
  // STL ve PLY (ve OBJ) farklı koordinat sistemlerinde olabilir → aynı sahnede
  // farklı konum/açıda görünürler ve otomatik hizalama güvenilir değil (exocad
  // dahil). Çözüm: aynı anda TEK format göster; kullanıcı üstteki sekmeden seçer.
  // Tek format içindeki dosyalar aynı sistemde olduğundan doğru çakışır.
  type Fmt = 'stl' | 'ply' | 'obj';
  const formatsPresent = useMemo<Fmt[]>(() => {
    const s = new Set(files.map(f => f.format));
    return (['stl', 'ply', 'obj'] as Fmt[]).filter(f => s.has(f));
  }, [files]);
  const multiFormat = formatsPresent.length > 1;
  const [activeFormat, setActiveFormat] = useState<Fmt | null>(null);
  const effectiveFormat: Fmt | null =
    activeFormat && formatsPresent.includes(activeFormat) ? activeFormat : (formatsPresent[0] ?? null);
  const visibleFiles = useMemo(
    () => (multiFormat && effectiveFormat ? files.filter(f => f.format === effectiveFormat) : files),
    [files, multiFormat, effectiveFormat],
  );

  const patchLayer = (id: string, patch: Partial<LayerStyle>) => {
    setLayerStyles((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? buildDefault(files.find(f => f.id === id) ?? files[0], idxOf(id))), ...patch },
    }));
  };
  const setAllVisible = (visible: boolean) => {
    setLayerStyles((prev) => {
      const next: Record<string, LayerStyle> = {};
      files.forEach((f, i) => {
        next[f.id] = { ...(prev[f.id] ?? buildDefault(f, i)), visible };
      });
      return next;
    });
  };

  const summaryTitle = useMemo(() => {
    if (title) return title;
    if (files.length === 1) return files[0].name;
    return `${files.length} dosya`;
  }, [title, files]);

  // Yüklü dosyaları indir (kontrol/hata ayıklama için). fetch→blob→objectURL:
  // hem yerel blob URL hem uzak (imzalı) URL için çalışır; orijinal ad korunur.
  const [downloading, setDownloading] = useState(false);
  const downloadFiles = async () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || downloading) return;
    setDownloading(true);
    try {
      // ZIP'ten açıldıysa: tek tek mesh (ply) yerine KAYNAK dosyayı (zip) indir.
      // Supabase `download` parametresi → sunucu attachment döner, ham dosya iner.
      if (sourceDownload?.url) {
        try {
          const u = sourceDownload.url;
          const dlUrl = u + (u.includes('?') ? '&' : '?') + 'download=' + encodeURIComponent(sourceDownload.name || 'dosya.zip');
          const a = document.createElement('a');
          a.href = dlUrl; a.download = sourceDownload.name || 'dosya.zip'; a.rel = 'noopener';
          document.body.appendChild(a); a.click();
          setTimeout(() => { try { a.remove(); } catch {} }, 100);
        } catch { try { window.open(sourceDownload.url, '_blank'); } catch {} }
        return;
      }
      for (const f of files) {
        try {
          const res = await fetch(f.url);
          const blob = await res.blob();
          const objUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = objUrl;
          a.download = f.name || 'model.ply';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[viewer-3d] download failed', f.name, e);
          toast.error(`İndirilemedi: ${f.name}`);
        }
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <View style={{ flex: 1, backgroundColor: T.headerBg }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16,
          // Web'de env() fallback (modal context'inde insets.top 0 dönse bile notch'u temizler); native'de sayı
          paddingTop: (Platform.OS === 'web'
            ? (`max(${Math.max(insets.top, 8) + 12}px, calc(env(safe-area-inset-top, 0px) + 12px))` as any)
            : Math.max(insets.top, 8) + 12),
          paddingBottom: 12,
          backgroundColor: T.headerBg,
          borderBottomWidth: 1, borderBottomColor: T.divider,
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: T.accentText, fontSize: 13, fontWeight: '700', letterSpacing: -0.2 }} numberOfLines={1}>
              3D Viewer
            </Text>
            <Text style={{ color: T.headerSub, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
              {summaryTitle}
            </Text>
          </View>
          {files.length > 0 && (
            <Pressable
              onPress={downloadFiles}
              hitSlop={10}
              accessibilityLabel="Dosyayı indir"
              disabled={downloading}
              style={({ hovered }: any) => ({
                width: 36, height: 36, borderRadius: 18,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: hovered ? T.iconBgHover : 'transparent',
                opacity: downloading ? 0.5 : 1,
                marginEnd: 4,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <Download size={18} color={T.iconFg} strokeWidth={2} />
            </Pressable>
          )}
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={({ hovered }: any) => ({
              width: 36, height: 36, borderRadius: 18,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: hovered ? T.iconBgHover : 'transparent',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <X size={18} color={T.iconFg} strokeWidth={2} />
          </Pressable>
        </View>

        {/* Body: canvas (panel artık floating popup) */}
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, position: 'relative' }}>
            {files.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: T.headerSub, fontSize: 13 }}>
                  Görüntülenecek dosya yok
                </Text>
              </View>
            ) : (
              <>
                <ThreeScene
                  onThumbnail={onThumbnail}
                  ref={sceneRef}
                  files={visibleFiles}
                  layerStyles={layerStyles}
                  bg={T.sceneBg}
                  measureMode={measureMode}
                  measurements={measurements}
                  onAddMeasurement={(m) => setMeasurements(prev => [...prev, m])}
                  cutAxis={cutAxis}
                  cutPosition={cutPosition}
                  showGrid={showGrid}
                  xrayMode={xrayMode}
                  autoAlign={autoAlign}
                  onDiagnostics={(id, d) => setDiagnostics(prev => ({ ...prev, [id]: d }))}
                  penMode={penMode && annots.enabled}
                  penKind={penKind}
                  penColor={penColor}
                  penWidth={penWidth}
                  annotations={annots.annotations}
                  annotationsVisible={annots.visible}
                  onPenCapture={(cap) => {
                    if (penKind === 'note') {
                      setNoteText('');
                      setNoteDraft(cap);
                      return;
                    }
                    void annots.add({
                      kind: penKind,
                      points: cap.points,
                      fileName: cap.fileName,
                      color: penColor,
                      width: penWidth,
                      camera: cap.camera,
                    });
                  }}
                />
                {layersOpen && visibleFiles.length >= 1 && (
                  <LayerPanel
                    files={visibleFiles}
                    layerStyles={layerStyles}
                    diagnostics={diagnostics}
                    onChange={patchLayer}
                    onSetAllVisible={setAllVisible}
                    onClose={() => setLayersOpen(false)}
                    notes={annots.enabled ? {
                      count: annots.annotations.length,
                      visible: annots.visible,
                      onToggle: () => annots.setVisible(!annots.visible),
                    } : undefined}
                  />
                )}

                {/* Format sekmesi — STL/PLY ayrı önizleme (üst-orta) */}
                {multiFormat && (
                  <View
                    pointerEvents="box-none"
                    style={{ position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' }}
                  >
                    <View style={{
                      flexDirection: 'row', backgroundColor: T.toolbarBg,
                      borderRadius: 999, padding: 3, gap: 2,
                      ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0,0,0,0.20)' } as any : {}),
                    }}>
                      {formatsPresent.map((fmt) => {
                        const active = fmt === effectiveFormat;
                        const count = files.filter(f => f.format === fmt).length;
                        return (
                          <Pressable
                            key={fmt}
                            onPress={() => setActiveFormat(fmt)}
                            style={({ hovered }: any) => ({
                              paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999,
                              backgroundColor: active ? T.accent : (hovered ? T.iconBgHover : 'transparent'),
                              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                            })}
                          >
                            <Text style={{
                              fontSize: 12, fontWeight: '700', letterSpacing: 0.3,
                              color: active ? '#FFFFFF' : T.headerSub,
                            }}>
                              {fmt.toUpperCase()} · {count}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Faz A: Smile design foto overlay (manuel hizalama) */}
                <SmileOverlay
                  images={referenceImages}
                  visible={smileOpen}
                  onClose={() => setSmileOpen(false)}
                  accent={T.accent}
                  onApplyCurveRoll={(deg) => sceneRef.current?.setGroupRoll(deg)}
                />
                <ViewerToolbar
                  layersOpen={layersOpen}
                  onToggleLayers={() => setLayersOpen(v => !v)}
                  fov={fov}
                  onFovChange={(v) => { setFov(v); sceneRef.current?.setFov(v); }}
                  onPreset={(p) => sceneRef.current?.setPreset(p)}
                  onFit={() => sceneRef.current?.fit()}
                  onReset={() => sceneRef.current?.reset()}
                  measureMode={measureMode}
                  onToggleMeasure={() => { setPenMode(false); setMeasureMode(v => !v); }}
                  {...(annots.enabled ? {
                    penMode,
                    // Kalem ve ölçüm aynı sürüklemeyi kullanıyor → karşılıklı dışlar
                    onTogglePen: () => { setMeasureMode(false); setPenMode(v => !v); },
                    penCount: annots.annotations.length,
                  } : null)}
                  onClearMeasurements={() => setMeasurements([])}
                  measurementCount={measurements.length}
                  cutAxis={cutAxis}
                  onCutAxisChange={setCutAxis}
                  cutPosition={cutPosition}
                  onCutPositionChange={setCutPosition}
                  wavinessActive={!!waviness || wavinessBusy}
                  onToggleWaviness={toggleWaviness}
                  showGrid={showGrid}
                  onToggleGrid={() => setShowGrid(v => !v)}
                  xrayMode={xrayMode}
                  onToggleXray={() => setXrayMode(v => !v)}
                  autoAlign={autoAlign}
                  onToggleAutoAlign={() => setAutoAlign(v => !v)}
                  smileOpen={smileOpen}
                  onToggleSmile={referenceImages.length > 0 ? () => setSmileOpen(v => !v) : undefined}
                  occlusionActive={!!occlusion || occlusionBusy}
                  onToggleOcclusion={toggleOcclusion}
                  onScreenshot={() => {
                    const dataUrl = sceneRef.current?.screenshot();
                    if (!dataUrl || typeof document === 'undefined') return;
                    const a = document.createElement('a');
                    a.href = dataUrl;
                    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    a.download = `3d-viewer-${stamp}.png`;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => { try { document.body.removeChild(a); } catch {} }, 100);
                  }}
                />

                {/* Kapanış analizi özet + legend (sol alt) */}
                {(occlusion || occlusionBusy) && (
                  <View style={{ position: 'absolute', start: 12, bottom: 12, maxWidth: 300, backgroundColor: 'rgba(15,15,18,0.88)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 6 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Kapanış Analizi</Text>
                    {occlusionBusy
                      ? <Text style={{ color: '#E5E7EB', fontSize: 11, lineHeight: 16 }}>Analiz ediliyor…</Text>
                      : occlusion && <Text style={{ color: '#E5E7EB', fontSize: 11, lineHeight: 16 }}>{describeOcclusion(occlusion)}</Text>}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {[['#E5282E', 'temas'], ['#F5A623', 'yakın'], ['#3FA34D', 'orta'], ['#3B6FE0', 'boşluk']].map(([c, lbl]) => (
                        <View key={lbl} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: c }} />
                          <Text style={{ color: '#CBD5E1', fontSize: 9 }}>{lbl}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Dalgalanma analizi özet + skala (sol üst — sol alt köşe
                    kapanış özeti ve FPS rozetiyle zaten dolu) */}
                {(waviness || wavinessBusy) && (
                  <View style={{
                    position: 'absolute', top: 12, start: 12, width: 268,
                    backgroundColor: T.toolbarBg,
                    borderWidth: 1, borderColor: T.toolbarBorder,
                    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, gap: 7,
                    ...(Platform.OS === 'web' ? {
                      boxShadow: '0 12px 32px rgba(0,0,0,0.20)',
                      backdropFilter: 'blur(14px) saturate(1.2)',
                    } as any : {}),
                  } as any}>
                    <Text style={{
                      color: T.panelLabelMuted, fontSize: 9, fontWeight: '800',
                      letterSpacing: 0.9, textTransform: 'uppercase',
                    }}>
                      Yüzey Dalgalanması
                    </Text>

                    {wavinessBusy ? (
                      <Text style={{ color: T.iconFg, fontSize: 11, lineHeight: 16 }}>
                        Analiz ediliyor… (büyük taramalarda birkaç saniye)
                      </Text>
                    ) : waviness ? (
                      <>
                        {(() => {
                          const v = wavinessVerdict(waviness);
                          const tone = v.tone === 'ok' ? '#2D9A6B' : v.tone === 'warn' ? '#E89B2A' : '#D94B4B';
                          return (
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7 }}>
                              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tone, marginTop: 4 }} />
                              <Text style={{ flex: 1, color: T.iconFg, fontSize: 11.5, fontWeight: '600', lineHeight: 16 }}>
                                {v.text}
                              </Text>
                            </View>
                          );
                        })()}
                        <Text style={{ color: T.panelLabelMuted, fontSize: 10.5, lineHeight: 15 }}>
                          {describeWaviness(waviness)}
                        </Text>

                        {/* Renk skalası — nötr = düz yüzey, iki uç = çukur/tümsek */}
                        <View style={{ gap: 4, marginTop: 2 }}>
                          <View style={{
                            height: 8, borderRadius: 4, overflow: 'hidden',
                            ...(Platform.OS === 'web' ? {
                              backgroundImage: 'linear-gradient(90deg,#2563EB 0%,#7DA9F0 25%,#E3E6EB 50%,#F0A05A 75%,#DC2626 100%)',
                            } as any : { backgroundColor: '#E3E6EB' }),
                          } as any} />
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: T.panelLabelMuted, fontSize: 9 }}>−{waviness.rangeUm} µm</Text>
                            <Text style={{ color: T.panelLabelMuted, fontSize: 9 }}>düz</Text>
                            <Text style={{ color: T.panelLabelMuted, fontSize: 9 }}>+{waviness.rangeUm} µm</Text>
                          </View>
                        </View>

                        {/* Skala penceresi — kusurun büyüklüğü baştan bilinmediği
                            için sabit bir skala her vakada doğru olmuyor */}
                        {Platform.OS === 'web' && (
                          <View style={{ marginTop: 2 }}>
                            <Text style={{ color: T.panelLabelMuted, fontSize: 9.5, marginBottom: 2 }}>
                              Skala penceresi: ±{wavinessRange} µm
                            </Text>
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {React.createElement('input' as any, {
                              type: 'range', min: 20, max: 200, step: 10, value: wavinessRange,
                              onChange: (e: any) => {
                                const v = parseInt(e.target.value, 10);
                                setWavinessRange(v);
                                // Yumuşatma önbellekte — sürüklerken anlık yeniden boyama
                                const res = sceneRef.current?.setWavinessRange(v);
                                if (res) setWaviness(res);
                              },
                              style: { width: '100%', accentColor: T.accent, cursor: 'pointer' },
                            })}
                          </View>
                        )}

                        <Text style={{ color: T.panelLabelMuted, fontSize: 9.5, lineHeight: 13, marginTop: 2 }}>
                          {waviness.bandMm[0]}–{waviness.bandMm[1]} mm bandı. Artefakt mı anatomi mi
                          ayrımını yapmaz — üretim öncesi bakılmasını işaret eder.
                        </Text>
                      </>
                    ) : null}
                  </View>
                )}

                {/* Mesafe ölçümleri overlay (sağ alt) */}
                {measurements.length > 0 && (
                  <View style={{
                    position: 'absolute', bottom: 12, end: 12,
                    backgroundColor: T.toolbarBg,
                    borderRadius: 10, padding: 8,
                    borderWidth: 1, borderColor: T.toolbarBorder,
                    maxWidth: 200, gap: 4,
                  } as any}>
                    <Text style={{ color: T.panelLabelMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>
                      Mesafeler
                    </Text>
                    {measurements.slice(-5).map((m, i) => (
                      <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFEB3B' }} />
                        <Text style={{ flex: 1, color: T.iconFg, fontSize: 11, fontWeight: '700' }}>
                          {m.distance.toFixed(2)} mm
                        </Text>
                        <Pressable
                          onPress={() => setMeasurements(prev => prev.filter(x => x.id !== m.id))}
                          hitSlop={4}
                          style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                        >
                          <Text style={{ color: T.panelLabelMuted, fontSize: 12, fontWeight: '700' }}>×</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}

                {/* 3D kalem seçenekleri — kalem açıkken alt-orta */}
                {penMode && annots.enabled && (
                  <PenOptionsBar
                    kind={penKind}
                    onKind={setPenKind}
                    color={penColor}
                    onColor={setPenColor}
                    width={penWidth}
                    onWidth={setPenWidth}
                    count={annots.annotations.length}
                    canUndo={annots.annotations.length > 0}
                    onUndo={() => {
                      const last = annots.annotations[annots.annotations.length - 1];
                      if (last) void annots.remove(last.id);
                    }}
                    onClose={() => setPenMode(false)}
                  />
                )}

                {/* Measurement mode hint */}
                {measureMode && (
                  <View style={{
                    position: 'absolute', start: 12,
                    // Analiz kartları da sol üstte — üstüne binmesin
                    top: (waviness || wavinessBusy) ? 232 : 12,
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                    backgroundColor: T.accent + 'CC',
                  } as any}>
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                      Ölçüm modu — modele 2 nokta tıkla
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* Footer hint — dokunmatikte yanlış ve yer yiyor ("tekerlek"/"sağ tık"
            yok): yalnız geniş/fare ekranlarında gösterilir. */}
        {!isNarrow && (
          <View style={{
            paddingHorizontal: 16, paddingVertical: 10,
            backgroundColor: T.headerBg,
            borderTopWidth: 1, borderTopColor: T.divider,
          }}>
            <Text style={{ color: T.panelLabelMuted, fontSize: 10, textAlign: 'center', letterSpacing: 0.5 }}>
              Sürükle: döndür · Tekerlek: yakınlaştır · Sağ tık: kaydır
            </Text>
          </View>
        )}
      </View>

      {/* Metin notu — nokta yakalandıktan sonra metin sorulur */}
      <NoteTextPrompt
        visible={!!noteDraft}
        value={noteText}
        onChange={setNoteText}
        onCancel={() => { setNoteDraft(null); setNoteText(''); }}
        onSave={() => {
          const draft = noteDraft;
          const text = noteText.trim();
          setNoteDraft(null);
          setNoteText('');
          if (!draft || !text) return;
          void annots.add({
            kind: 'note',
            points: draft.points,
            fileName: draft.fileName,
            color: penColor,
            width: penWidth,
            text,
            camera: draft.camera,
          });
        }}
      />

      {/* Simanty asistanı — modal içine mount (global FAB modalın altında kalır).
          DentyFAB kendi içinde panel'i (doctor/clinic) gate'ler; 3D araçları
          viewerBridge üzerinden bu açık viewer'a bağlanır. */}
      <DentyFAB />
    </Modal>
  );
}

export { Viewer3DModal };
export default Viewer3DModal;
