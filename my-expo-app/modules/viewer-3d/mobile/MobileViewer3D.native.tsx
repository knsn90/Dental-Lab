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
import { X, Layers, Eye, EyeOff, Maximize2, ExternalLink, Grid3x3, RotateCcw, Box, Camera } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Viewer3DProps, LayerStyle } from '../types';
import { buildViewerHtml } from './htmlTemplate';
import { classifyFile, paletteColor } from '../lib/layerMap';
import { openFileUrl } from '../../../core/util/openFile';
import { toast } from '../../../core/ui/Toast';

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

const ACCENT = '#E8D5C4';

// Renk paleti — diş taraması/tasarımı için uygun tonlar (alçı, bite, dişeti, tasarım vb.).
const PALETTE = [
  '#E8D5C4', '#EFE4CC', '#F5F5F5', '#C9CDD2', '#9AA0A6',
  '#7AAFE0', '#5B8DEF', '#6FBFB5', '#8FCB9B', '#A8C3A0',
  '#E8A0A0', '#E7B4CB', '#D4AF7A', '#E0A82E', '#B58BD8',
];

/** Sürüklenebilir opaklık çubuğu (harici slider paketi yok). 0.1–1.0 arası. */
function OpacitySlider({ value, color, onChange }: { value: number; color: string; onChange: (v: number) => void }) {
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
        <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
        </View>
        {/* knob */}
        <View style={{ position: 'absolute', left: Math.max(0, (w * value) - 8), width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: color }} />
      </View>
      <Text style={{ width: 38, textAlign: 'right', color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] }}>%{pct}</Text>
    </View>
  );
}

/** Dikey araç çubuğu butonu (desktop ViewerToolbar paritesi). */
function ToolButton({ Icon, onPress, active, loading }: { Icon: any; onPress: () => void; active?: boolean; loading?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? ACCENT : 'transparent' }}
    >
      {loading ? <ActivityIndicator size="small" color={ACCENT} /> : <Icon size={19} color={active ? '#1A1A1A' : ACCENT} strokeWidth={2} />}
    </Pressable>
  );
}

function MobileViewer3D({ visible, files, title, onClose }: Viewer3DProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const webviewRef = useRef<WebView | null>(null);
  const [ready, setReady] = useState(false);
  const [_loadErr, setLoadErr] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [gridOn, setGridOn] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(
    () => buildViewerHtml({ files: visibleFiles, layerStyles: initialStyles, bg: '#0e0e0e' }),
    [initialStyles],
  );

  // Yükleme zaman aşımı: CDN/three.js 15 sn'de gelmezse hata göster (siyah ekranda takılı kalma).
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => {
      setReady((r) => { if (!r) setLoadErr((e) => e ?? 'zaman-asimi'); return r; });
    }, 15000);
    return () => clearTimeout(t);
  }, [ready]);

  const send = useCallback((msg: object) => {
    webviewRef.current?.postMessage(JSON.stringify(msg));
  }, []);

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
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Ekran görüntüsü', UTI: 'public.png' });
      } else {
        toast.info('Ekran görüntüsü kaydedildi.');
      }
    } catch (e: any) {
      toast.error('Ekran görüntüsü alınamadı.');
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
      <View style={{ flex: 1, backgroundColor: '#0e0e0e', paddingTop: insets.top }}>
        {/* Top bar */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingHorizontal: 16, paddingVertical: 12,
          backgroundColor: '#1A1A1A',
          borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: ACCENT, fontSize: 13, fontWeight: '700', letterSpacing: -0.2 }} numberOfLines={1}>
              3D Viewer
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }} numberOfLines={1}>
              {title ?? (files.length === 1 ? files[0].name : `${files.length} dosya`)}
            </Text>
          </View>

          {multi && (
            <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' }}>
              <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '800' }}>{visibleCount}/{files.length}</Text>
            </View>
          )}

          <Pressable onPress={onClose} hitSlop={10} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} color={ACCENT} strokeWidth={2} />
          </Pressable>
        </View>

        {/* WebView + katman paneli overlay */}
        <View style={{ flex: 1, backgroundColor: '#0e0e0e' }}>
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
            style={{ flex: 1, backgroundColor: '#0e0e0e' }}
            onMessage={(ev) => {
              try {
                const msg = JSON.parse(ev.nativeEvent.data);
                if (msg.type === 'READY') setReady(true);
                if (msg.type === 'ERROR') setLoadErr(msg.message ?? 'Yüklenemedi');
                if (msg.type === 'SHOT' && msg.data) saveShot(msg.data);
                if (msg.type === 'SHOT_ERR') { setShooting(false); toast.error('Ekran görüntüsü alınamadı.'); }
              } catch { /* noop */ }
            }}
            onError={(e) => setLoadErr(e.nativeEvent.description)}
          />

          {/* Yükleme göstergesi — model gelene kadar (siyah ekran yerine) */}
          {!ready && !_loadErr && (
            <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              <ActivityIndicator size="large" color={ACCENT} />
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '500' }}>3D model yükleniyor…</Text>
            </View>
          )}

          {/* Hata durumu — CDN/motor yüklenemedi → tarayıcıda aç fallback (kullanıcı isteği) */}
          {!!_loadErr && (
            <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }}>
              <Text style={{ color: '#FCA5A5', fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 20 }}>
                3D önizleme açılamadı{'\n'}(internet bağlantısı gerekiyor)
              </Text>
              {visibleFiles[0]?.url ? (
                <Pressable
                  onPress={() => openFileUrl(visibleFiles[0].url)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, backgroundColor: ACCENT }}
                >
                  <ExternalLink size={15} color="#1A1A1A" strokeWidth={2.2} />
                  <Text style={{ color: '#1A1A1A', fontSize: 13, fontWeight: '700' }}>Tarayıcıda aç</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {/* Format sekmesi (STL/PLY/OBJ ayrı) — karışık format varsa üst-orta (desktop paritesi) */}
          {multiFormat && ready && (
            <View pointerEvents="box-none" style={{ position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', backgroundColor: 'rgba(20,20,20,0.92)', borderRadius: 999, padding: 3, gap: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                {formatsPresent.map((fmt) => {
                  const active = fmt === effectiveFormat;
                  const count = files.filter((f) => f.format === fmt).length;
                  return (
                    <Pressable
                      key={fmt}
                      onPress={() => setActiveFormat(fmt)}
                      style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, backgroundColor: active ? ACCENT : 'transparent' }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.3, color: active ? '#1A1A1A' : 'rgba(255,255,255,0.6)' }}>
                        {fmt.toUpperCase()} · {count}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Sağ dikey araç çubuğu (desktop paritesi) — yalnız model hazırken */}
          {ready && !_loadErr && (
            <View style={{ position: 'absolute', right: 10, top: 0, bottom: 0, justifyContent: 'center' }} pointerEvents="box-none">
              <View style={{
                backgroundColor: 'rgba(20,20,20,0.92)', borderRadius: 26,
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
                paddingVertical: 8, paddingHorizontal: 5, gap: 4, alignItems: 'center',
              }}>
                <ToolButton Icon={Maximize2} onPress={() => send({ type: 'FIT' })} />
                <ToolButton Icon={RotateCcw} onPress={() => send({ type: 'RESET' })} />
                <ToolButton Icon={Box} active={presetOpen} onPress={() => setPresetOpen((v) => !v)} />
                <ToolButton Icon={Grid3x3} active={gridOn} onPress={toggleGrid} />
                <ToolButton Icon={Camera} loading={shooting} onPress={takeScreenshot} />
                <ToolButton Icon={Layers} active={panelOpen} onPress={() => setPanelOpen((v) => !v)} />
              </View>
            </View>
          )}

          {/* Kamera açıları popup */}
          {presetOpen && ready && (
            <View style={{
              position: 'absolute', right: 64, top: '13%', width: 224,
              backgroundColor: 'rgba(28,28,30,0.98)', borderRadius: 20,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
              paddingVertical: 8, paddingHorizontal: 8,
              shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12,
            }}>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }}>
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
                      backgroundColor: active ? 'rgba(232,213,196,0.16)' : (pressed ? 'rgba(255,255,255,0.07)' : 'transparent'),
                    })}
                  >
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: active ? ACCENT : 'rgba(255,255,255,0.22)' }} />
                    <Text style={{ flex: 1, color: active ? ACCENT : 'rgba(255,255,255,0.92)', fontSize: 14.5, fontWeight: active ? '700' : '500' }}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Katman / ayar paneli — araç çubuğunun soluna kayan kart (tek dosyada da açılır) */}
          {panelOpen && (
            <View
              style={{
                position: 'absolute', top: 12, right: 64, bottom: 12,
                width: Math.min(300, width - 86),
                backgroundColor: 'rgba(20,20,20,0.97)',
                borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}
            >
              {/* Panel başlık */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }}>
                <Layers size={13} color={ACCENT} strokeWidth={2.2} />
                <Text style={{ flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>{multi ? 'Katmanlar' : 'Katman ayarı'}</Text>
                {multi ? (
                  <Pressable onPress={() => setAllVisible(visibleCount < meta.length)} hitSlop={6} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' }}>
                    <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '700' }}>
                      {visibleCount < meta.length ? 'Tümünü aç' : 'Tümünü gizle'}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => setPanelOpen(false)} hitSlop={8} style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' }}>
                    <X size={14} color="rgba(255,255,255,0.7)" strokeWidth={2.2} />
                  </Pressable>
                )}
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {meta.map((m) => {
                  const st = layers[m.id] ?? { visible: true, opacity: m.defaultOpacity, color: m.color };
                  return (
                    <View key={m.id} style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', opacity: st.visible ? 1 : 0.5 }}>
                      {/* Başlık satırı: renk noktası + etiket + görünürlük */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                        <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: st.color, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '600' }} numberOfLines={1}>{m.label}</Text>
                          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 1 }} numberOfLines={1}>{m.name}</Text>
                        </View>
                        <Pressable onPress={() => toggleVisible(m.id)} hitSlop={8} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' }}>
                          {st.visible ? <Eye size={15} color={ACCENT} strokeWidth={2} /> : <EyeOff size={15} color="rgba(255,255,255,0.4)" strokeWidth={2} />}
                        </Pressable>
                      </View>

                      {st.visible && (
                        <>
                          {/* Opaklık — sürüklenebilir çubuk */}
                          <View style={{ marginTop: 12 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>Opaklık</Text>
                            <OpacitySlider value={st.opacity} color={st.color} onChange={(v) => setOpacity(m.id, v)} />
                          </View>

                          {/* Renk — palet */}
                          <View style={{ marginTop: 12 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 7 }}>Renk</Text>
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
                                      borderColor: active ? '#FFFFFF' : 'rgba(255,255,255,0.2)',
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
        </View>

        {/* Footer hint */}
        <View style={{
          paddingHorizontal: 16, paddingVertical: 10,
          paddingBottom: Math.max(insets.bottom, 10) + 4,
          backgroundColor: '#1A1A1A',
          borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
        }}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textAlign: 'center', letterSpacing: 0.5 }}>
            Tek parmakla döndür · Pinch ile yakınlaştır · İki parmakla kaydır
          </Text>
        </View>
      </View>
    </Modal>
  );
}

export { MobileViewer3D };
export default MobileViewer3D;
