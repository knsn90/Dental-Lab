/**
 * MobileViewer3D — Native (iOS/Android) için react-native-webview wrapper.
 *
 * three.js mobile native'de doğrudan zor (expo-gl + expo-three RN bridge'i
 * şişiriyor). Onun yerine: web build'i tek HTML asset olarak WebView'a yükle,
 * GPU native render etsin. RN UI overlay (katman paneli + araç çubuğu) postMessage
 * ile WebView'daki three.js state'ini değiştirir.
 *
 * Katman paneli (PWA paritesi): her mesh için renk + etiket (Üst Çene / Alt Çene /
 * Bite …) + görünürlük aç-kapa + opaklık (Tam / %50 / %25). "Sığdır" kamerayı fit'ler.
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, Modal, ScrollView, useWindowDimensions, ActivityIndicator, PanResponder } from 'react-native';
import { X, Layers, Eye, EyeOff, Maximize2, ExternalLink, Grid3x3, RotateCcw, Box, Camera, SlidersHorizontal, ChevronUp, PenLine } from '../../../core/ui/icons';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Viewer3DProps, LayerStyle, ViewerFile } from '../types';
import { buildViewerHtml } from './htmlTemplate';
import { classifyFile, paletteColor } from '../lib/layerMap';
import { openFileUrl } from '../../../core/util/openFile';
import { toast } from '../../../core/ui/Toast';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useViewerTheme } from '../lib/viewerTheme';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useScanAnnotations } from '../annotations/useScanAnnotations';
import { PEN_COLORS, PEN_WIDTHS } from '../annotations/types';
import type { AnnotationCamera, AnnotationKind, Point3 } from '../annotations/types';
import { PenOptionsBar, NoteTextPrompt } from '../components/PenControls';

// Dental kamera açıları (template SET_PRESET ile birebir eşleşir).
const CAMERA_PRESETS: { key: string; label: string }[] = [
  { key: 'frontal',  label: 'Önden' },
  { key: 'occlusal', label: 'Oklüzal' },
  { key: 'left',     label: 'Sol Bukkal' },
  { key: 'right',    label: 'Sağ Bukkal' },
  { key: 'upper',    label: 'Üst Çene' },
  { key: 'lower',    label: 'Alt Çene' },
  { key: 'iso',      label: 'İzometrik' },
];

/** Koyu temanın krem accent'i — light temada panel accent'i kullanılır. */
const ACCENT = '#E8D5C4';

/**
 * Native viewer chrome paleti.
 *
 * Koyu değerler ESKİSİYLE BİREBİR aynı (viewer koyu temada bit-bit korunur);
 * açık tema yalnız EKLENDİ. Eskiden bütün yüzeyler `#0e0e0e` / `#1A1A1A` /
 * beyaz-alfa olarak sabitti → uygulama açık temadayken 3D önizleme tek başına
 * koyu açılıyordu (kullanıcı cihazda gördü).
 *
 * Her alt bileşen (ToolButton, OpacitySlider) bu hook'u KENDİSİ çağırır —
 * prop ile taşınmaz (bkz. CLAUDE.md koyu tema tuzağı #1).
 */
function useViewerChrome() {
  const T = useViewerTheme();
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  const sceneHex = '#' + (T.sceneBg >>> 0).toString(16).padStart(6, '0');
  return isDark
    ? {
        isDark: true,
        page: '#0e0e0e',
        bar: '#1A1A1A',
        barBorder: 'rgba(255,255,255,0.06)',
        accent: ACCENT,
        accentFg: '#1A1A1A',
        ink: '#FFFFFF',
        ink2: 'rgba(255,255,255,0.5)',
        ink3: 'rgba(255,255,255,0.4)',
        inkFaint: 'rgba(255,255,255,0.45)',
        surface: 'rgba(20,20,20,0.97)',
        surfaceBorder: 'rgba(255,255,255,0.08)',
        popSurface: 'rgba(28,28,30,0.98)',
        popBorder: 'rgba(255,255,255,0.12)',
        chipBg: 'rgba(255,255,255,0.08)',
        iconBtnBg: 'rgba(255,255,255,0.06)',
        rowDivider: 'rgba(255,255,255,0.05)',
        track: 'rgba(255,255,255,0.12)',
        swatchBorder: 'rgba(255,255,255,0.2)',
        swatchActive: '#FFFFFF',
        gridLine: 'rgba(255,255,255,0.07)',
      }
    : {
        isDark: false,
        // Sahne zemini = aktif panelin sayfa zemini (web viewer ile aynı kural)
        page: sceneHex,
        bar: '#FFFFFF',
        barBorder: 'rgba(0,0,0,0.06)',
        accent: T.accent,
        accentFg: '#FFFFFF',
        ink: '#0A0A0A',
        ink2: 'rgba(0,0,0,0.55)',
        ink3: 'rgba(0,0,0,0.45)',
        inkFaint: 'rgba(0,0,0,0.45)',
        surface: '#FFFFFF',
        surfaceBorder: 'rgba(0,0,0,0.10)',
        popSurface: '#FFFFFF',
        popBorder: 'rgba(0,0,0,0.10)',
        chipBg: 'rgba(0,0,0,0.05)',
        iconBtnBg: 'rgba(0,0,0,0.05)',
        rowDivider: 'rgba(0,0,0,0.06)',
        track: 'rgba(0,0,0,0.10)',
        swatchBorder: 'rgba(0,0,0,0.18)',
        swatchActive: '#0A0A0A',
        gridLine: 'rgba(0,0,0,0.08)',
      };
}

// Renk paleti — diş taraması/tasarımı için uygun tonlar (alçı, bite, dişeti, tasarım vb.).
const PALETTE = [
  '#E8D5C4', '#EFE4CC', '#F5F5F5', '#C9CDD2', '#9AA0A6',
  '#7AAFE0', '#5B8DEF', '#6FBFB5', '#8FCB9B', '#A8C3A0',
  '#E8A0A0', '#E7B4CB', '#D4AF7A', '#E0A82E', '#B58BD8',
];

/** Sürüklenebilir opaklık çubuğu (harici slider paketi yok). 0.1–1.0 arası. */
function OpacitySlider({ value, color, onChange }: { value: number; color: string; onChange: (v: number) => void }) {
  const C = useViewerChrome();
  const [w, setW] = useState(0);
  const wRef = useRef(0);
  const emit = useCallback((x: number) => {
    const width = wRef.current || 1;
    let v = Math.max(0.1, Math.min(1, x / width));
    v = Math.round(v * 20) / 20; // 0.05 adım
    onChange(v);
  }, [onChange]);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => emit(e.nativeEvent.locationX),
      onPanResponderMove: (e) => emit(e.nativeEvent.locationX),
    }),
  ).current;
  const pct = Math.round(value * 100);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        {...pan.panHandlers}
        onLayout={(ev) => { const width = ev.nativeEvent.layout.width; wRef.current = width; setW(width); }}
        style={{ flex: 1, height: 26, justifyContent: 'center' }}
      >
        <View style={{ height: 6, borderRadius: 3, backgroundColor: C.track, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
        </View>
        {/* knob */}
        <View style={{ position: 'absolute', left: Math.max(0, (w * value) - 8), width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: color }} />
      </View>
      <Text style={{ width: 38, textAlign: 'end' as any, color: C.isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] }}>%{pct}</Text>
    </View>
  );
}

/** Dikey araç çubuğu butonu (desktop ViewerToolbar paritesi). */
function ToolButton({ Icon, onPress, active, loading, label }: { Icon: any; onPress: () => void; active?: boolean; loading?: boolean; label?: string }) {
  const C = useViewerChrome();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={label}
      style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? C.accent : 'transparent' }}
    >
      {loading ? <ActivityIndicator size="small" color={C.accent} /> : <Icon size={19} color={active ? C.accentFg : C.accent} strokeWidth={2} />}
    </Pressable>
  );
}

/** Dock kapalıyken duran tek başına yuvarlak düğme (web ViewerToolbar paritesi). */
function RoundButton({ Icon, onPress, active, label }: { Icon: any; onPress: () => void; active?: boolean; label: string }) {
  const C = useViewerChrome();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={label}
      style={{
        width: 44, height: 44, borderRadius: 22,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: active ? C.accent : C.surface,
        borderWidth: 1, borderColor: C.surfaceBorder,
        shadowColor: '#000', shadowOpacity: C.isDark ? 0.45 : 0.2, shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 }, elevation: 8,
      }}
    >
      <Icon size={19} color={active ? C.accentFg : C.accent} strokeWidth={2} />
    </Pressable>
  );
}

function MobileViewer3D({ visible, files: filesProp, title, onClose, zipUrl, orderId }: Viewer3DProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const C = useViewerChrome();
  const webviewRef = useRef<WebView | null>(null);
  const [ready, setReady] = useState(false);
  // ZIP modu: arşiv WebView'de açılır; mesh listesi WebView'den MANIFEST ile gelir.
  // (Eskiden RN JS thread'inde unzipSync + base64 yapılıyordu → büyük taramada
  // uygulama dakikalarca donuyor, kapat/navbar bile çalışmıyordu.)
  const [zipFiles, setZipFiles] = useState<ViewerFile[] | null>(null);
  const [progress, setProgress] = useState<{ phase: string; pct?: number } | null>(null);
  const [progressTick, setProgressTick] = useState(0);
  useEffect(() => { setZipFiles(null); setProgress(null); }, [zipUrl]);
  const files = zipUrl ? (zipFiles ?? []) : filesProp;
  const [_loadErr, setLoadErr] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [gridOn, setGridOn] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);
  // ── 3D kalem (tarama üzerine not) ───────────────────────────────────────
  const annots = useScanAnnotations(orderId, visible);
  const [penMode, setPenMode] = useState(false);
  const [penKind, setPenKind] = useState<AnnotationKind>('stroke');
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0]);
  const [penWidth, setPenWidth] = useState<number>(PEN_WIDTHS[1]);
  const [noteDraft, setNoteDraft] = useState<{
    fileName: string | null; points: Point3[]; camera: AnnotationCamera;
  } | null>(null);
  const [noteText, setNoteText] = useState('');
  // Araç dock'u: kapalı başlar, açıldıktan sonra kendini gizler (web paritesi).
  const [dockOpen, setDockOpen] = useState(false);
  const dockTimer = useRef<any>(null);
  const clearDockTimer = useCallback(() => {
    if (dockTimer.current) { clearTimeout(dockTimer.current); dockTimer.current = null; }
  }, []);
  /** Her dokunuş otomatik gizleme sayacını baştan başlatır. */
  const bumpDock = useCallback(() => {
    clearDockTimer();
    dockTimer.current = setTimeout(() => { setDockOpen(false); setPresetOpen(false); }, 4500);
  }, [clearDockTimer]);
  useEffect(() => {
    // Kamera açıları popup'ı açıkken sayaç DURUR (liste altından kaçmasın).
    if (dockOpen && !presetOpen) bumpDock();
    else clearDockTimer();
    return clearDockTimer;
  }, [dockOpen, presetOpen, bumpDock, clearDockTimer]);

  // Format ayrımı (desktop paritesi): STL/PLY/OBJ farklı koordinat sistemlerinde
  // olabilir → aynı sahnede yanlış hizalanır. Karışık format varsa TEK format göster;
  // kullanıcı üstteki sekmeden seçer. Tek format içindeki dosyalar doğru çakışır.
  const formatsPresent = useMemo(() => {
    const s = new Set(files.map((f) => f.format));
    return (['stl', 'ply', 'obj'] as const).filter((f) => s.has(f));
  }, [files]);
  const multiFormat = formatsPresent.length > 1;
  const [activeFormat, setActiveFormat] = useState<string | null>(null);
  const effectiveFormat = activeFormat && formatsPresent.includes(activeFormat as any)
    ? activeFormat : (formatsPresent[0] ?? null);
  const visibleFiles = useMemo(
    () => (multiFormat && effectiveFormat ? files.filter((f) => f.format === effectiveFormat) : files),
    [files, multiFormat, effectiveFormat],
  );
  // Yeni dosya seti gelince format seçimini sıfırla (ilk formata dön). Sekme
  // değişiminde SIFIRLANMAZ — o kullanıcının seçimi.
  const allFilesKey = useMemo(() => files.map((f) => f.id).join('|'), [files]);
  useEffect(() => { setActiveFormat(null); }, [allFilesKey]);

  // visibleFiles prop'u satır-içi [obj] olarak gelebildiğinden her render'da YENİ referans.
  // id+url+format'a dayalı sabit anahtara indirger; böylece meta/html/effect gereksiz
  // yere yeniden çalışmaz (WebView reload + "ready" sıfırlanması sorununu önler).
  const filesKey = useMemo(() => visibleFiles.map((f) => f.id + '@' + f.url).join('|'), [visibleFiles]);

  // Her mesh için katman meta'sı (etiket + varsayılan renk/opaklık)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const meta = useMemo(
    () =>
      visibleFiles.map((f, i) => {
        const layer = classifyFile(f.name);
        return {
          id: f.id,
          name: f.name,
          label: layer.label,
          // Her katmana index'e göre ayırt edilebilir renk (desktop paritesi) —
          // aynı tip iki dosya bile farklı renk alır. OBJ texture rengi varsa korunur.
          color: (f as any).color ?? paletteColor(i),
          defaultOpacity: layer.opacity ?? 1,
        };
      }),
    [filesKey],
  );

  const initialStyles = useMemo<Record<string, LayerStyle>>(() => {
    const init: Record<string, LayerStyle> = {};
    for (const m of meta) {
      init[m.id] = { visible: true, opacity: m.defaultOpacity, color: m.color, wireframe: false };
    }
    return init;
  }, [meta]);

  // RN tarafı katman state'i (panelden kontrol) — görünürlük + opaklık + renk
  const [layers, setLayers] = useState<Record<string, { visible: boolean; opacity: number; color: string }>>({});
  useEffect(() => {
    const init: Record<string, { visible: boolean; opacity: number; color: string }> = {};
    for (const m of meta) init[m.id] = { visible: true, opacity: m.defaultOpacity, color: m.color };
    setLayers(init);
    // Yeni dosya seti → yükleme durumunu sıfırla (ready sadece burada sıfırlanır, her render'da değil).
    setReady(false);
    setLoadErr(null);
    setGridOn(false); // yeni model → grid varsayılan kapalı (WebView reload ile senkron)
    setActivePreset(null);
    setPresetOpen(false);
  }, [meta]);

  // ZIP modunda HTML yalnız URL'e bağlı: manifest gelince meta değişir ama WebView
  // YENİDEN YÜKLENMEZ (yoksa arşiv baştan indirilirdi).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(
    () => (zipUrl
      ? buildViewerHtml({ files: [], layerStyles: {}, bg: C.page, gridLine: C.gridLine, zip: { url: zipUrl, idPrefix: 'zip' } })
      : buildViewerHtml({ files: visibleFiles, layerStyles: initialStyles, bg: C.page, gridLine: C.gridLine })),
    [zipUrl, zipUrl ? null : initialStyles, C.page, C.gridLine],
  );

  // Yükleme zaman aşımı: CDN/three.js 15 sn'de gelmezse hata göster (siyah ekranda takılı kalma).
  // ZIP modunda her ilerleme mesajı sayacı sıfırlar (büyük arşiv indirilirken hata verme).
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => {
      setReady((r) => { if (!r) setLoadErr((e) => e ?? 'zaman-asimi'); return r; });
    }, zipUrl ? 30000 : 15000);
    return () => clearTimeout(t);
  }, [ready, progressTick, zipUrl]);

  // WebView'in bildirdiği mesh listesinden katman stilleri (meta ile aynı kural).
  const stylesFor = useCallback((list: ViewerFile[]) => {
    const out: Record<string, LayerStyle> = {};
    list.forEach((f, i) => {
      const layer = classifyFile(f.name);
      out[f.id] = { visible: true, opacity: layer.opacity ?? 1, color: paletteColor(i), wireframe: false };
    });
    return out;
  }, []);

  const send = useCallback((msg: object) => {
    webviewRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  // Notları WebView'e gönder. `ready` bağımlılığı ŞART: WebView yeniden
  // yüklendiğinde (tema/dosya değişimi) sahne boşalıyor, notlar tekrar basılmalı.
  useEffect(() => {
    if (!ready) return;
    send({
      type: 'ANNOTATIONS',
      list: annots.annotations.map((a) => ({
        id: a.id, kind: a.kind, color: a.color, width: a.width,
        points: a.points, text: a.text, fileName: a.fileName,
      })),
    });
  }, [ready, annots.annotations, send]);

  useEffect(() => {
    if (!ready) return;
    send({ type: 'ANNOT_VISIBLE', on: annots.visible });
  }, [ready, annots.visible, send]);

  useEffect(() => {
    if (!ready) return;
    send({ type: 'SET_PEN', on: penMode && annots.enabled, kind: penKind, color: penColor, width: penWidth });
  }, [ready, penMode, penKind, penColor, penWidth, annots.enabled, send]);

  const toggleVisible = useCallback((id: string) => {
    setLayers((prev) => {
      const cur = prev[id] ?? { visible: true, opacity: 1, color: ACCENT };
      const visible = !cur.visible;
      send({ type: 'TOGGLE_LAYER', fileId: id, visible });
      return { ...prev, [id]: { ...cur, visible } };
    });
  }, [send]);

  const setOpacity = useCallback((id: string, value: number) => {
    setLayers((prev) => {
      const cur = prev[id] ?? { visible: true, opacity: 1, color: ACCENT };
      send({ type: 'SET_OPACITY', fileId: id, value });
      return { ...prev, [id]: { ...cur, opacity: value } };
    });
  }, [send]);

  const setColor = useCallback((id: string, hex: string) => {
    setLayers((prev) => {
      const cur = prev[id] ?? { visible: true, opacity: 1, color: hex };
      send({ type: 'SET_COLOR', fileId: id, hex });
      return { ...prev, [id]: { ...cur, color: hex } };
    });
  }, [send]);

  const toggleGrid = useCallback(() => {
    setGridOn((on) => { const next = !on; send({ type: 'SET_GRID', on: next }); return next; });
  }, [send]);

  const applyPreset = useCallback((key: string) => {
    send({ type: 'SET_PRESET', preset: key });
    setActivePreset(key);
    setPresetOpen(false);
  }, [send]);

  const takeScreenshot = useCallback(() => {
    setShooting(true);
    send({ type: 'SCREENSHOT' });
    // Yanıt onMessage → SHOT ile gelir; 8 sn güvenlik zaman aşımı.
    setTimeout(() => setShooting((s) => (s ? false : s)), 8000);
  }, [send]);

  // WebView'den gelen PNG data-URI'yi dosyaya yazıp paylaş sayfasını aç (Fotoğraflar/AirDrop).
  const saveShot = useCallback(async (dataUrl: string) => {
    try {
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      const dir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory;
      const name = (visibleFiles[0]?.name || '3d').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_');
      const uri = `${dir}${name}-3d.png`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' as any });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: autoT('Ekran görüntüsü'), UTI: 'public.png' });
      } else {
        toast.info(autoT('Ekran görüntüsü kaydedildi.'));
      }
    } catch (e: any) {
      toast.error(autoT('Ekran görüntüsü alınamadı.'));
    } finally {
      setShooting(false);
    }
  }, [visibleFiles]);

  const setAllVisible = useCallback((visible: boolean) => {
    setLayers((prev) => {
      const next = { ...prev };
      for (const m of meta) {
        next[m.id] = { ...(next[m.id] ?? { opacity: 1, color: m.color }), visible };
        send({ type: 'TOGGLE_LAYER', fileId: m.id, visible });
      }
      return next;
    });
  }, [meta, send]);

  const visibleCount = meta.filter((m) => layers[m.id]?.visible !== false).length;
  const multi = visibleFiles.length > 1;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <View style={{ flex: 1, backgroundColor: C.page, paddingTop: insets.top }}>
        {/* Top bar */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingHorizontal: 16, paddingVertical: 12,
          backgroundColor: C.bar,
          borderBottomWidth: 1, borderBottomColor: C.barBorder,
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.accent, fontSize: 13, fontWeight: '700', letterSpacing: -0.2 }} numberOfLines={1}>
              3D Viewer
            </Text>
            <Text style={{ color: C.ink2, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
              {title ?? (files.length === 1 ? files[0].name : `${files.length} dosya`)}
            </Text>
          </View>

          {multi && (
            <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: C.iconBtnBg }}>
              <Text style={{ color: C.accent, fontSize: 11, fontWeight: '800' }}>{visibleCount}/{files.length}</Text>
            </View>
          )}

          <Pressable onPress={onClose} hitSlop={10} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} color={C.accent} strokeWidth={2} />
          </Pressable>
        </View>

        {/* WebView + katman paneli overlay */}
        <View style={{ flex: 1, backgroundColor: C.page }}>
          <WebView
            ref={webviewRef}
            originWhitelist={['*']}
            // baseUrl ŞART: source={{html}} baseUrl'süz → doküman origin'i "null" olur ve
            // dinamik ESM import'ları (three.js) WKWebView'de sessizce yüklenmez → siyah ekran.
            // Birincil CDN (esm.sh) origin'i verince three.js SAME-ORIGIN yüklenir; jsdelivr
            // fallback + mesh fetch (Supabase imzalı URL CORS:* / data-URI) cross-origin çalışır.
            source={{ html, baseUrl: 'https://esm.sh/' }}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            scrollEnabled={false}
            bounces={false}
            mixedContentMode="always"
            style={{ flex: 1, backgroundColor: C.page }}
            onMessage={(ev) => {
              try {
                const msg = JSON.parse(ev.nativeEvent.data);
                if (msg.type === 'READY') { setReady(true); setProgress(null); }
                if (msg.type === 'ERROR') setLoadErr(msg.message ?? 'Yüklenemedi');
                if (msg.type === 'PROGRESS') { setProgress({ phase: msg.phase, pct: msg.pct }); setProgressTick((n) => n + 1); }
                if (msg.type === 'ZIP_EMPTY') setLoadErr('zip-empty');
                if (msg.type === 'MANIFEST' && Array.isArray(msg.files)) {
                  const list: ViewerFile[] = msg.files.map((f: any) => ({ id: f.id, name: f.name, format: f.format, url: '' }));
                  setZipFiles(list);
                  send({ type: 'LAYER_STYLES', styles: stylesFor(list) });
                }
                if (msg.type === 'PEN_CAPTURE' && Array.isArray(msg.points)) {
                  const cap = {
                    fileName: (msg.fileName as string) ?? null,
                    points: msg.points as Point3[],
                    camera: msg.camera as AnnotationCamera,
                  };
                  if (penKind === 'note') { setNoteText(''); setNoteDraft(cap); }
                  else {
                    void annots.add({
                      kind: penKind, points: cap.points, fileName: cap.fileName,
                      color: penColor, width: penWidth, camera: cap.camera,
                    });
                  }
                }
                if (msg.type === 'SHOT' && msg.data) saveShot(msg.data);
                if (msg.type === 'SHOT_ERR') { setShooting(false); toast.error(autoT('Ekran görüntüsü alınamadı.')); }
              } catch { /* noop */ }
            }}
            onError={(e) => setLoadErr(e.nativeEvent.description)}
          />

          {/* Yükleme göstergesi — model gelene kadar (siyah ekran yerine) */}
          {!ready && !_loadErr && (
            // Opak: WebView'in kendi yükleme yazısıyla üst üste binmesin.
            <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: C.page }}>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={{ color: C.isDark ? 'rgba(255,255,255,0.55)' : C.ink2, fontSize: 12, fontWeight: '500' }}>
                {progress?.phase === 'download'
                  ? `${autoT('Arşiv indiriliyor…')}${progress.pct != null ? ` %${progress.pct}` : ''}`
                  : progress?.phase === 'extract'
                    ? autoT('Arşiv açılıyor…')
                    : autoT('3D model yükleniyor…')}
              </Text>
            </View>
          )}

          {/* Hata durumu — CDN/motor yüklenemedi → tarayıcıda aç fallback (kullanıcı isteği) */}
          {!!_loadErr && (
            <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }}>
              <Text style={{ color: C.isDark ? '#FCA5A5' : '#DC2626', fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 20 }}>
                {_loadErr === 'zip-empty'
                  ? autoT('Arşivde 3D model bulunamadı')
                  : <>3D önizleme açılamadı{'\n'}(internet bağlantısı gerekiyor)</>}
              </Text>
              {(zipUrl || visibleFiles[0]?.url) ? (
                <Pressable
                  onPress={() => openFileUrl(zipUrl || visibleFiles[0].url)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, backgroundColor: C.accent }}
                >
                  <ExternalLink size={15} color={C.accentFg} strokeWidth={2.2} />
                  <Text style={{ color: C.accentFg, fontSize: 13, fontWeight: '700' }}>Tarayıcıda aç</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {/* Format sekmesi (STL/PLY/OBJ ayrı) — karışık format varsa üst-orta (desktop paritesi) */}
          {multiFormat && ready && (
            <View pointerEvents="box-none" style={{ position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', backgroundColor: C.surface, borderRadius: 999, padding: 3, gap: 2, borderWidth: 1, borderColor: C.surfaceBorder }}>
                {formatsPresent.map((fmt) => {
                  const active = fmt === effectiveFormat;
                  const count = files.filter((f) => f.format === fmt).length;
                  return (
                    <Pressable
                      key={fmt}
                      onPress={() => setActiveFormat(fmt)}
                      style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, backgroundColor: active ? C.accent : 'transparent' }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.3, color: active ? C.accentFg : C.ink2 }}>
                        {fmt.toUpperCase()} · {count}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Sağ dikey araç çubuğu — yalnız model hazırken.
              Dock KAPALI başlar: sürekli açık kaldığında modelin sağ şeridini
              kapatıyordu. Kapalıyken iki ayrı düğme (Katmanlar · Araçlar),
              açıldıktan sonra 4.5 sn dokunulmazsa kendi kapanır. */}
          {ready && !_loadErr && !dockOpen && (
            <View style={{ position: 'absolute', end: 10, top: 12, gap: 8 }} pointerEvents="box-none">
              <RoundButton
                Icon={Layers}
                active={panelOpen}
                label={panelOpen ? autoT('Katmanları gizle') : autoT('Katmanlar')}
                onPress={() => setPanelOpen((v) => !v)}
              />
              {annots.enabled && (
                <RoundButton
                  Icon={PenLine}
                  active={penMode}
                  label={penMode ? autoT('Kalemi kapat') : autoT('Tarama üzerine not')}
                  onPress={() => setPenMode((v) => !v)}
                />
              )}
              <RoundButton
                Icon={SlidersHorizontal}
                label={autoT('Araçları göster')}
                onPress={() => setDockOpen(true)}
              />
            </View>
          )}
          {ready && !_loadErr && dockOpen && (
            <View style={{ position: 'absolute', end: 10, top: 0, bottom: 0, justifyContent: 'center' }} pointerEvents="box-none">
              <View style={{
                backgroundColor: C.surface, borderRadius: 26,
                borderWidth: 1, borderColor: C.surfaceBorder,
                paddingVertical: 8, paddingHorizontal: 5, gap: 4, alignItems: 'center',
              }}>
                <ToolButton Icon={ChevronUp} label={autoT('Araçları gizle')} onPress={() => { setPresetOpen(false); setDockOpen(false); }} />
                <ToolButton Icon={Maximize2} label={autoT('Sığdır')} onPress={() => { bumpDock(); send({ type: 'FIT' }); }} />
                <ToolButton Icon={RotateCcw} label={autoT('Sıfırla')} onPress={() => { bumpDock(); send({ type: 'RESET' }); }} />
                <ToolButton Icon={Box} label={autoT('Görünüm açıları')} active={presetOpen} onPress={() => { bumpDock(); setPresetOpen((v) => !v); }} />
                <ToolButton Icon={Grid3x3} label={autoT('Izgara')} active={gridOn} onPress={() => { bumpDock(); toggleGrid(); }} />
                <ToolButton Icon={Camera} label={autoT('Ekran görüntüsü')} loading={shooting} onPress={() => { bumpDock(); takeScreenshot(); }} />
                <ToolButton Icon={Layers} label={autoT('Katmanlar')} active={panelOpen} onPress={() => { bumpDock(); setPanelOpen((v) => !v); }} />
                {annots.enabled && (
                  <ToolButton
                    Icon={PenLine}
                    label={penMode ? autoT('Kalemi kapat') : autoT('Tarama üzerine not')}
                    active={penMode}
                    onPress={() => { bumpDock(); setPenMode((v) => !v); }}
                  />
                )}
              </View>
            </View>
          )}

          {/* Kamera açıları popup */}
          {presetOpen && ready && (
            <View style={{
              position: 'absolute', end: 64, top: '13%', width: 224,
              backgroundColor: C.popSurface, borderRadius: 20,
              borderWidth: 1, borderColor: C.popBorder,
              paddingVertical: 8, paddingHorizontal: 8,
              shadowColor: '#000', shadowOpacity: C.isDark ? 0.5 : 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12,
            }}>
              <Text style={{ color: C.ink3, fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }}>
                Kamera Açıları
              </Text>
              {CAMERA_PRESETS.map((p) => {
                const active = activePreset === p.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => applyPreset(p.key)}
                    style={({ pressed }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, marginBottom: 2,
                      backgroundColor: active ? C.accent + '2A' : (pressed ? C.iconBtnBg : 'transparent'),
                    })}
                  >
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: active ? C.accent : C.ink3 }} />
                    <Text style={{ flex: 1, color: active ? C.accent : C.ink, fontSize: 14.5, fontWeight: active ? '700' : '500' }}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Katman / ayar paneli — telefonda ALT ŞERİT: sağa yapışık tam boy
              kart modelin tamamını kapatıyordu. Model üstte açıkta kalır. */}
          {panelOpen && (
            <View
              style={{
                position: 'absolute', left: 10, right: 10, bottom: 12, maxHeight: '52%',
                backgroundColor: C.surface,
                borderRadius: 18, borderWidth: 1, borderColor: C.surfaceBorder,
                overflow: 'hidden',
                shadowColor: '#000', shadowOpacity: C.isDark ? 0.45 : 0.2, shadowRadius: 24,
                shadowOffset: { width: 0, height: 12 }, elevation: 14,
              }}
            >
              {/* Panel başlık */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rowDivider }}>
                <Layers size={13} color={C.accent} strokeWidth={2.2} />
                <Text style={{ flex: 1, color: C.ink, fontSize: 13, fontWeight: '700' }}>{multi ? 'Katmanlar' : 'Katman ayarı'}</Text>
                {multi ? (
                  <Pressable onPress={() => setAllVisible(visibleCount < meta.length)} hitSlop={6} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: C.iconBtnBg }}>
                    <Text style={{ color: C.accent, fontSize: 11, fontWeight: '700' }}>
                      {visibleCount < meta.length ? 'Tümünü aç' : 'Tümünü gizle'}
                    </Text>
                  </Pressable>
                ) : null}
                {/* Kapat — çok dosyalı panelde de olmalı: eskiden yalnız tek
                    dosyada vardı, çok dosyada paneli kapatmanın tek yolu
                    dock'taki katman düğmesiydi. */}
                <Pressable onPress={() => setPanelOpen(false)} hitSlop={8} style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.iconBtnBg }}>
                  <X size={14} color={C.ink2} strokeWidth={2.2} />
                </Pressable>
              </View>

              {/* Notlar katmanı — 3D kalemle bırakılan işaretler ayrı katman;
                  tarama dosyasına dokunulmuyor, buradan gizlenebiliyor. */}
              {annots.enabled && annots.annotations.length > 0 && (
                <Pressable
                  onPress={() => annots.setVisible(!annots.visible)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 9,
                    paddingHorizontal: 14, paddingVertical: 11,
                    borderBottomWidth: 1, borderBottomColor: C.rowDivider,
                  }}
                >
                  <PenLine size={14} color={C.accent} strokeWidth={2.2} />
                  <Text style={{ flex: 1, color: C.ink, fontSize: 12.5, fontWeight: '600' }} numberOfLines={1}>
                    {autoT('Notlar')}
                  </Text>
                  <Text style={{ color: C.ink3, fontSize: 10.5, fontWeight: '700' }}>{annots.annotations.length}</Text>
                  <View style={{
                    width: 30, height: 30, borderRadius: 15,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: annots.visible ? C.accent : C.iconBtnBg,
                  }}>
                    {annots.visible
                      ? <Eye size={15} color={C.accentFg} strokeWidth={2} />
                      : <EyeOff size={15} color={C.ink3} strokeWidth={2} />}
                  </View>
                </Pressable>
              )}

              <ScrollView showsVerticalScrollIndicator={false}>
                {meta.map((m) => {
                  const st = layers[m.id] ?? { visible: true, opacity: m.defaultOpacity, color: m.color };
                  return (
                    <View key={m.id} style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rowDivider, opacity: st.visible ? 1 : 0.5 }}>
                      {/* Başlık satırı: renk noktası + etiket + görünürlük */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                        <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: st.color, borderWidth: 1, borderColor: C.swatchBorder }} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: C.ink, fontSize: 12.5, fontWeight: '600' }} numberOfLines={1}>{m.label}</Text>
                          <Text style={{ color: C.ink3, fontSize: 10, marginTop: 1 }} numberOfLines={1}>{m.name}</Text>
                        </View>
                        <Pressable onPress={() => toggleVisible(m.id)} hitSlop={8} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.iconBtnBg }}>
                          {st.visible ? <Eye size={15} color={C.accent} strokeWidth={2} /> : <EyeOff size={15} color={C.ink3} strokeWidth={2} />}
                        </Pressable>
                      </View>

                      {st.visible && (
                        <>
                          {/* Opaklık — sürüklenebilir çubuk */}
                          <View style={{ marginTop: 12 }}>
                            <Text style={{ color: C.inkFaint, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>Opaklık</Text>
                            <OpacitySlider value={st.opacity} color={st.color} onChange={(v) => setOpacity(m.id, v)} />
                          </View>

                          {/* Renk — palet */}
                          <View style={{ marginTop: 12 }}>
                            <Text style={{ color: C.inkFaint, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 7 }}>Renk</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                              {PALETTE.map((hex) => {
                                const active = st.color.toUpperCase() === hex.toUpperCase();
                                return (
                                  <Pressable
                                    key={hex}
                                    onPress={() => setColor(m.id, hex)}
                                    hitSlop={4}
                                    style={{
                                      width: 24, height: 24, borderRadius: 12, backgroundColor: hex,
                                      borderWidth: active ? 2.5 : 1,
                                      borderColor: active ? C.swatchActive : C.swatchBorder,
                                    }}
                                  />
                                );
                              })}
                            </View>
                          </View>
                        </>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* 3D kalem seçenekleri — kalem açıkken alt-orta */}
          {penMode && annots.enabled && ready && !_loadErr && (
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
              kind: 'note', points: draft.points, fileName: draft.fileName,
              color: penColor, width: penWidth, text, camera: draft.camera,
            });
          }}
        />

        {/* Footer hint */}
        <View style={{
          paddingHorizontal: 16, paddingVertical: 10,
          paddingBottom: Math.max(insets.bottom, 10) + 4,
          backgroundColor: C.bar,
          borderTopWidth: 1, borderTopColor: C.barBorder,
        }}>
          <Text style={{ color: C.ink3, fontSize: 10, textAlign: 'center', letterSpacing: 0.5 }}>
            Tek parmakla döndür · Pinch ile yakınlaştır · İki parmakla kaydır
          </Text>
        </View>
      </View>
    </Modal>
  );
}

export { MobileViewer3D };
export default MobileViewer3D;
