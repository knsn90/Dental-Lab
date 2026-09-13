// modules/orders/components/FilesList.tsx
// OrderDetailScreenV2 icinden CIKARILDI (birebir) — teknisyen aktif-is ekrani da
// ayni kategori+galeri dosya bolumunu kullanabilsin diye paylasilan bilesen.
// OrderDetailScreenV2 lazyRoute ile yuklendiginden ona statik import YASAK
// (#130 unknown-module cokmesi) -> bilesen kendi modulunde yasamali.
import React, { useState, useMemo, useRef } from "react";
import { View, Text, Pressable, Platform, Image, Modal, ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Layers, ChevronRight, ChevronLeft, ChevronDown, Download, Eye, Image as ImageIcon, File as FileIcon, PenLine } from "../../../core/ui/icons";
import { localeTag, isRTL } from "../../../core/i18n";
import { autoT } from "../../../core/i18n/autoTranslate";
import { useScanAnnotationCount } from "../../viewer-3d/annotations/useScanAnnotationCount";
import { openFileUrl } from "../../../core/util/openFile";
import { Viewer3DModalLazy as Viewer3DModal } from "../../viewer-3d/Viewer3DLazy";
import MobileViewer3D from "../../viewer-3d/mobile/MobileViewer3D";
import { StageFileUpload } from "./StageFileUpload";
import { FaceScanButton } from "./FaceScanButton";
import { unzipToViewer, isArchiveExt } from "../fileArchive";
import { toast } from "../../../core/ui/Toast";
import { saveMeshThumb } from "../../../lib/photos";
import { ImageLightbox } from "../../../core/ui/ImageLightbox";
import { NativeImageViewer } from "../../../core/ui/mobile/NativeImageViewer";
import { useMobileTokens } from "../../../core/theme/mobileDesignTokens";
import { useThemeModeStore } from "../../../core/store/themeModeStore";
import type { WorkOrderPhoto } from "../../../lib/types";

// HTML tasarim (exocad) native onizleme — web iframe, native WebView.
const HtmlWebView: any = Platform.OS !== "web" ? require("react-native-webview").WebView : null;

function is3DFileExt(path: string): 'stl' | 'ply' | 'obj' | null {
  const ext = path.toLowerCase().split('.').pop();
  if (ext === 'stl') return 'stl';
  if (ext === 'ply') return 'ply';
  if (ext === 'obj') return 'obj';
  return null;
}

function onAccent(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#FFFFFF';
  const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(parseInt(h.slice(0, 2), 16))
          + 0.7152 * lin(parseInt(h.slice(2, 4), 16))
          + 0.0722 * lin(parseInt(h.slice(4, 6), 16));
  return L > 0.5 ? '#0A0A0A' : '#FFFFFF';
}
/** #RRGGBB → rgba(...) */
function alphaOf(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

// Dosya kategorisi — Taramalar (3D/zip) · Fotoğraflar (görsel) · Belgeler (diğer)
type FileCat = 'scan' | 'photo' | 'doc';
function fileCategoryOf(pathOrName: string): FileCat {
  const p = (pathOrName || '').toLowerCase();
  if (/\.(stl|ply|obj|zip|3mf|dcm)$/.test(p)) return 'scan';
  if (/\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|svg)$/.test(p)) return 'photo';
  return 'doc';
}
/** Galeri ileri/geri düğmesi — görselin dikey ortasında yüzer. */
const galleryNavBtn = {
  position: 'absolute' as const,
  top: '50%' as any, marginTop: -15,
  width: 30, height: 30, borderRadius: 15,
  alignItems: 'center' as const, justifyContent: 'center' as const,
  backgroundColor: 'rgba(255,255,255,0.92)',
  ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 2px 8px rgba(15,23,42,0.16)' } as any) : {}),
};

const FILE_CAT_META: { key: FileCat; label: string }[] = [
  { key: 'scan',  label: 'Taramalar' },
  { key: 'photo', label: 'Fotoğraflar' },
  { key: 'doc',   label: 'Belgeler' },
];

export function FilesList({
  photos, signedUrls, thumbUrls, workOrderId, accentColor, onUploaded, stageId, stationName,
}: {
  photos: WorkOrderPhoto[];
  signedUrls: Record<string, string>;
  /** Küçük boy URL'ler (Supabase render/image). Boşsa tam boya düşülür. */
  thumbUrls?: Record<string, string>;
  workOrderId: string;
  accentColor: string;
  onUploaded?: () => void;
  /** Teknisyen aktif-iş ekranı: yükleme aşamaya iliştirilsin diye (opsiyonel). */
  stageId?: string;
  stationName?: string;
}) {
  const insets = useSafeAreaInsets();
  const T = useMobileTokens();
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  // Kategori aç/kapa durumu (varsayılan: KAPALI — kullanıcı isterse açar)
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  // 3D viewer state
  const [viewer3DFile, setViewer3DFile] = useState<{ id: string; name: string; url: string; format: 'stl'|'ply'|'obj'; textureUrl?: string|null } | null>(null);
  // Uygulama-içi görsel / HTML tasarım önizleme (yeni tab yerine popup) — dosya modalı ile aynı davranış
  const [imageViewer, setImageViewer] = useState<{ url: string; name: string } | null>(null);
  const [htmlViewer, setHtmlViewer]   = useState<{ url?: string; html?: string; name: string } | null>(null);
  // Zip tarama arşivi: açılıyor göstergesi + zip içi görseller + revoke edilecek blob URL'ler
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [zipImages, setZipImages] = useState<{ url: string; name: string }[] | null>(null);
  // Native ZIP önizleme — arşivi WebView içinde açan görüntüleyici
  const [zipViewer, setZipViewer] = useState<{ url: string; name: string } | null>(null);
  const zipUrlsRef = useRef<string[]>([]);
  const revokeZipUrls = () => {
    zipUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
    zipUrlsRef.current = [];
  };
  const closeHtmlViewer = () => {
    if (htmlViewer?.url?.startsWith('blob:')) { try { URL.revokeObjectURL(htmlViewer.url); } catch {} }
    setHtmlViewer(null);
  };

  // OBJ'nin AYNI KLASÖRÜNDEKİ texture (PNG/JPG) signed URL'ini bul.
  // Object Capture çıktısı: facescan-{ts}/baked_mesh.obj + baked_mesh_tex0.png
  const siblingTextureUrl = (objPath: string): string | null => {
    const slash = objPath.lastIndexOf('/');
    if (slash < 0) return null;
    const dir = objPath.slice(0, slash);
    const tex = photos.find(p =>
      p.storage_path.startsWith(dir + '/') && /\.(png|jpe?g)$/i.test(p.storage_path)
    );
    if (!tex) return null;
    return signedUrls[tex.storage_path] ?? (tex as any).signed_url ?? null;
  };

  // İndirme dosya adı — caption'da uzantı yoksa gerçek uzantıyı ekle (zip zip iner).
  const zipDownloadName = (f: WorkOrderPhoto): string => {
    const base = f.storage_path.split('/').pop() ?? 'file';
    const realExt = base.includes('.') ? base.split('.').pop()!.toLowerCase() : '';
    let name = (f.caption?.trim() || base);
    if (realExt && !name.toLowerCase().endsWith('.' + realExt)) name = `${name}.${realExt}`;
    return name;
  };

  const openPreview = (f: WorkOrderPhoto) => {
    const url = signedUrls[f.storage_path] ?? (f as any).signed_url ?? null;
    // İmzalı URL yok (henüz yüklenmedi ya da storage erişimi yok) → sessiz kalma.
    if (!url) { toast.error('Dosyaya erişilemedi. Birazdan tekrar deneyin.'); return; }
    const filename = f.caption ?? f.storage_path.split('/').pop() ?? '';
    const ext = (f.storage_path.split('.').pop() || '').toLowerCase();
    // Görsel → uygulama-içi lightbox (web + native). SVG native'de RN Image ile
    // render olmaz → native'de aşağıdaki sistem-tarayıcı yoluna düşer.
    const isRasterImg = ['jpg','jpeg','png','gif','webp','bmp','heic','heif','avif'].includes(ext);
    if (isRasterImg || (ext === 'svg' && Platform.OS === 'web')) {
      setImageViewer({ url, name: filename });
      return;
    }
    // 3D (STL/PLY/OBJ) → uygulama-içi viewer (web three.js · native WebView+three.js).
    const fmt = is3DFileExt(f.storage_path);
    if (fmt) {
      const textureUrl = fmt === 'obj' ? siblingTextureUrl(f.storage_path) : null;
      setViewer3DFile({ id: f.id, name: filename, url, format: fmt, textureUrl });
      return;
    }
    // ZIP → native: arşiv 3D görüntüleyicinin WebView'inde indirilip açılır.
    // Eskiden burada RN JS thread'inde unzipSync + base64 yapılıyordu: büyük
    // taramada uygulama dakikalarca donuyor, vazgeçmek/navbar bile çalışmıyordu.
    // Artık görüntüleyici hemen açılır, ilerlemeyi gösterir, kapatılabilir.
    if (isArchiveExt(f.storage_path) && Platform.OS !== 'web') {
      setZipViewer({ url, name: filename });
      return;
    }
    // HTML tasarım (exocad web viewer) → uygulama-içi görüntüleyici (web: iframe · native: WebView).
    // content-type text olabildiği için içeriği çekip gömüyoruz (yazı değil tasarım render edilir).
    // Desktop/webapp ile birebir: dosya dışarı çıkmadan uygulama içinde açılır.
    if (ext === 'html' || ext === 'htm') {
      setExtractingId(f.id);
      (async () => {
        try {
          const res = await fetch(url); const text = await res.text();
          if (Platform.OS === 'web') {
            setHtmlViewer({ url: URL.createObjectURL(new Blob([text], { type: 'text/html' })), name: filename });
          } else {
            setHtmlViewer({ html: text, name: filename });
          }
        } catch { openFileUrl(url); }
        finally { setExtractingId(null); }
      })();
      return;
    }
    // Native: kalan tipler (PDF vb.) için web-içi görüntüleyici yok → sistem tarayıcısı.
    if (Platform.OS !== 'web') { openFileUrl(url); return; }
    // ZIP → tarayıcı içinde aç, içindeki mesh'leri 3D viewer'da göster (klinikler tüm
    // taramaları tek zip içine koyuyor). Mesh yoksa görsel lightbox, o da yoksa indir.
    if (isArchiveExt(f.storage_path) && Platform.OS === 'web') {
      setExtractingId(f.id);
      (async () => {
        try {
          revokeZipUrls();
          const r = await unzipToViewer(url, { idPrefix: f.id });
          zipUrlsRef.current = r.objectUrls;
          if (r.files.length > 0) {
            setZipImages(r.images.length ? r.images : null);
            setZipSource({ url, name: zipDownloadName(f) });   // indirme → kaynak zip
            setViewerAll(r.files);
          } else if (r.images.length > 0) {
            setZipImages(r.images);
            setImageViewer(r.images[0]);
          } else if (typeof window !== 'undefined') {
            window.open(url, '_blank');
          }
        } catch { if (typeof window !== 'undefined') window.open(url, '_blank'); }
        finally { setExtractingId(null); }
      })();
      return;
    }
    if (typeof window !== 'undefined') window.open(url, '_blank');
  };

  const forceDownload = async (f: WorkOrderPhoto) => {
    const url = signedUrls[f.storage_path] ?? (f as any).signed_url ?? null;
    if (!url) return;
    // Dosya adı — caption'da uzantı yoksa gerçek uzantıyı ekle (ör. "Üst Çene · OrthoCAD" → ".zip").
    // Böylece ZIP, ZIP olarak iner (içi AÇILMAZ) — tüm platformlarda ham dosya.
    const base = f.storage_path.split('/').pop() ?? 'file';
    const realExt = (base.includes('.') ? base.split('.').pop()! : '').toLowerCase();
    let name = (f.caption?.trim() || base);
    if (realExt && !name.toLowerCase().endsWith('.' + realExt)) name = `${name}.${realExt}`;
    // Supabase signed URL'e `download` parametresi → sunucu Content-Disposition: attachment
    // döner; tarayıcı ham dosyayı İNDİRİR (blob/CORS/iOS-PWA sorunları olmadan, zip açılmadan).
    const dlUrl = url + (url.includes('?') ? '&' : '?') + 'download=' + encodeURIComponent(name);
    // Native: sistem indiricisi/tarayıcısı. Web (desktop + PWA): <a download> ile tetikle.
    if (Platform.OS !== 'web' || typeof document === 'undefined') { openFileUrl(dlUrl); return; }
    try {
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { document.body.removeChild(a); } catch {} }, 100);
    } catch {
      try { window.open(dlUrl, '_blank'); } catch {}
    }
  };

  // Multi-file viewer (tüm 3D dosyaları üst üste aç) — Faz 7
  const [viewerAll, setViewerAll] = useState<Array<{ id: string; name: string; url: string; format: 'stl'|'ply'|'obj'; textureUrl?: string|null }> | null>(null);
  // 3D kalem notu sayısı — sipariş detayında rozet; viewer kapanınca tazelenir
  // (içeride not eklenmiş olabilir).
  const { count: annotCount, refresh: refreshAnnotCount } = useScanAnnotationCount(workOrderId);
  // ZIP'ten açılan viewer'da indirme kaynağı (mesh yerine kaynak zip insin)
  const [zipSource, setZipSource] = useState<{ url: string; name: string } | null>(null);
  const all3DFiles = useMemo(() => {
    return photos
      .map(f => {
        const filename = f.caption ?? f.storage_path.split('/').pop() ?? '';
        const fmt = is3DFileExt(f.storage_path);
        const url = signedUrls[f.storage_path] ?? (f as any).signed_url ?? null;
        if (!fmt || !url) return null;
        const textureUrl = fmt === 'obj' ? siblingTextureUrl(f.storage_path) : null;
        return { id: f.id, name: filename, url, format: fmt, textureUrl };
      })
      .filter(Boolean) as Array<{ id: string; name: string; url: string; format: 'stl'|'ply'|'obj'; textureUrl?: string|null }>;
  }, [photos, signedUrls]);

  // 2D referans fotoğraflar — gülüş tasarımı / ekartörlü resim vb. (jpg/png)
  const referenceImages = useMemo(() => {
    return photos
      .map(f => {
        const filename = f.caption ?? f.storage_path.split('/').pop() ?? 'Resim';
        const isImg = /\.(png|jpe?g|webp|gif|heic|heif|bmp)$/i.test(f.storage_path);
        const url = signedUrls[f.storage_path] ?? (f as any).signed_url ?? null;
        // Lightbox alt şeridi küçük boyu kullanır; yoksa tam boya düşer.
        const thumb = (thumbUrls ?? {})[f.storage_path] ?? url;
        return isImg && url ? { id: f.id, name: filename, url, thumb } : null;
      })
      .filter(Boolean) as Array<{ id: string; name: string; url: string; thumb: string }>;
  }, [photos, signedUrls]);

  // Kategori grupları — Taramalar / Fotoğraflar / Belgeler (boş olanlar gizli)
  // Fotoğraf kategorisi galeri olarak gösterilir: üstte büyük görsel, altta
  // küçük karolar. Silme YOK — detay ekranı okuma/inceleme alanı.
  const [galleryId, setGalleryId] = useState<string | null>(null);

  const photoGroups = useMemo(() => {
    const by: Record<FileCat, WorkOrderPhoto[]> = { scan: [], photo: [], doc: [] };
    for (const f of photos) by[fileCategoryOf(f.caption || f.storage_path)].push(f);
    return FILE_CAT_META.map(m => ({ ...m, files: by[m.key] })).filter(g => g.files.length > 0);
  }, [photos]);

  // ÖNEMLİ: StageFileUpload her zaman aynı JSX pozisyonunda render edilmeli;
  // photos.length 0→1 geçişinde unmount olmamalı. Aksi halde modalOpen state
  // sıfırlanır ve modal kapanır.
  return (
    <View className="gap-3">
      {/* Multi-file "Tümünü 3D Aç" butonu — 2+ STL/PLY/OBJ varsa görünür (web + native).
          Tüm taramaları tek sahnede katmanlar halinde açar (desktop paritesi). */}
      {all3DFiles.length >= 2 && (() => {
        // Panel accent'li pill CTA (tasarım dili: radius 999, accent = panel primary,
        // accent-tonlu yumuşak gölge). Ön-plan kontrast-farkında: lab safranında ink.
        const fg = onAccent(accentColor);
        return (
          <Pressable
            onPress={() => { setZipSource(null); setViewerAll(all3DFiles); }}
            android_ripple={{ color: alphaOf(fg, 0.12) }}
            /* NOT: object style ZORUNLU — NativeWind v4'te fonksiyon-stilli Pressable
               native'de backgroundColor'ı düşürüyor (buton beyaz kalıyordu). */
            style={{
              alignSelf: 'center',
              flexDirection: 'row', alignItems: 'center', gap: 9,
              height: 40, paddingHorizontal: 13, borderRadius: 999,
              backgroundColor: accentColor,
              shadowColor: accentColor, shadowOpacity: 0.30, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
              elevation: 3,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}
          >
            <Layers size={16} color={fg} strokeWidth={2.2} />
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: fg, letterSpacing: -0.2 }} numberOfLines={1}>
              Tümünü 3D Aç
            </Text>
            <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: alphaOf(fg, 0.20), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: fg }}>{all3DFiles.length}</Text>
            </View>
          </Pressable>
        );
      })()}

      {/* 3D kalem notu rozeti — karşı taraf taramaya çizim/not bıraktıysa
          sipariş detayında görünür olmalı; yoksa notlar viewer'ın içinde
          saklı kalıyor ve kimse açmıyor. */}
      {annotCount > 0 && all3DFiles.length > 0 && (
        <Pressable
          onPress={() => { setZipSource(null); setViewerAll(all3DFiles); }}
          style={{
            alignSelf: 'center',
            flexDirection: 'row', alignItems: 'center', gap: 7,
            height: 30, paddingHorizontal: 12, borderRadius: 999,
            backgroundColor: alphaOf(accentColor, 0.10),
            borderWidth: 1, borderColor: alphaOf(accentColor, 0.28),
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          }}
        >
          <PenLine size={13} color={accentColor} strokeWidth={2.2} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: accentColor }} numberOfLines={1}>
            {`${annotCount} ${autoT('tarama notu')}`}
          </Text>
        </Pressable>
      )}

      {photos.length === 0 ? (
        <View className="py-4 items-center">
          <Text className="text-[12px] text-ink-400">Bu siparişe henüz dosya eklenmedi</Text>
        </View>
      ) : (
        <View>
          {photoGroups.map((g) => {
          const isCollapsed = !openCats[g.key];
          const catColor = g.key === 'photo' ? '#10B981' : g.key === 'scan' ? '#3B82F6' : '#6B7280';
          return (
          <View key={g.key} style={{ marginBottom: 2 }}>
            {/* Kategori başlığı — tıklayınca aç/kapa (varsayılan kapalı) */}
            <Pressable
              onPress={() => setOpenCats(s => ({ ...s, [g.key]: !s[g.key] }))}
              hitSlop={4}
              /* NOT: object style ZORUNLU — NativeWind v4'te fonksiyon-stilli
                 Pressable native'de stili düşürüp satırı column'a çeviriyor;
                 rozet tam-genişlik bar oluyordu (web'de sorun yok). */
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              {isCollapsed ? <ChevronRight size={14} color="#64748B" strokeWidth={2} /> : <ChevronDown size={14} color="#64748B" strokeWidth={2} />}
              <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: isDark ? T.ink2 : "#475569" }}>{g.label}</Text>
              <View style={{ minWidth: 20, height: 18, paddingHorizontal: 6, borderRadius: 9, backgroundColor: catColor + '1A', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: catColor }}>{g.files.length}</Text>
              </View>
            </Pressable>
            {!isCollapsed && g.key === 'photo' && (() => {
              // İmzalı URL'i olan görseller — henüz gelmemiş olanlar atlanır,
              // boş kutu göstermek yerine geldiğinde kendiliğinden belirir.
              const imgs = g.files
                .map(f => ({
                  f,
                  url: signedUrls[f.storage_path] ?? (f as any).signed_url ?? null,
                  // Şerit karoları küçük boyu kullanır; henüz gelmediyse tam boya düşer.
                  thumb: (thumbUrls ?? {})[f.storage_path] ?? signedUrls[f.storage_path] ?? (f as any).signed_url ?? null,
                }))
                .filter(x => !!x.url) as Array<{ f: typeof g.files[number]; url: string; thumb: string }>;
              if (!imgs.length) return null;
              const cur = imgs.find(x => x.f.id === galleryId) ?? imgs[0];
              const idx = imgs.findIndex(x => x.f.id === cur.f.id);
              const step = (d: number) => setGalleryId(imgs[(idx + d + imgs.length) % imgs.length].f.id);
              return (
                <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
                  {/* Büyük görsel — tıklayınca mevcut önizleyici açılır */}
                  <View style={{ position: 'relative' }}>
                    <Pressable
                      onPress={() => openPreview(cur.f)}
                      style={{
                        width: '100%', height: 220, borderRadius: 12, overflow: 'hidden',
                        backgroundColor: '#0F172A08',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      }}
                    >
                      <Image source={{ uri: cur.url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                    </Pressable>
                    {imgs.length > 1 && (
                      <>
                        {/* Konum start/end ile aynalanır; ok da aynalanmazsa
                            RTL'de "geri" düğmesi ileri ok gösterirdi. */}
                        <Pressable onPress={() => step(-1)} style={[galleryNavBtn, isRTL() ? { right: 8 } : { left: 8 }]} hitSlop={8}>
                          {isRTL()
                            ? <ChevronRight size={16} color="#0F172A" strokeWidth={2} />
                            : <ChevronLeft size={16} color="#0F172A" strokeWidth={2} />}
                        </Pressable>
                        <Pressable onPress={() => step(1)} style={[galleryNavBtn, isRTL() ? { left: 8 } : { right: 8 }]} hitSlop={8}>
                          {isRTL()
                            ? <ChevronLeft size={16} color="#0F172A" strokeWidth={2} />
                            : <ChevronRight size={16} color="#0F172A" strokeWidth={2} />}
                        </Pressable>
                        <View style={{
                          position: 'absolute', bottom: 8, alignSelf: 'center',
                          paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999,
                          backgroundColor: 'rgba(15,23,42,0.72)',
                        }}>
                          <Text style={{ fontSize: 10.5, color: '#FFF', fontWeight: '600' }}>{idx + 1} / {imgs.length}</Text>
                        </View>
                      </>
                    )}
                  </View>
                  {/* Seçili fotoğrafın eklenme tarihi */}
                  {cur.f.created_at ? (
                    <Text style={{ fontSize: 10, color: isDark ? T.ink3 : "#9A9A9A", marginTop: 6 }} numberOfLines={1}>
                      {(cur.f.caption ?? 'Fotoğraf')} · Eklendi: {new Date(cur.f.created_at).toLocaleString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  ) : null}
                  {/* Şerit — tek sıra, bitişik karolar; seçili olan genişler.
                      Sarmalayan ızgara yerine yatay kaydırma: 20 fotoğrafta bile
                      tek satır kalır, büyük görselin altındaki yükseklik sabit. */}
                  {imgs.length > 1 && (
                    /* Sabit genişlik + yatay kaydırma yerine ESNEK pay: kaç
                       fotoğraf olursa olsun hepsi tek sıraya sığar, taşma yok.
                       Seçili karo 2.4 kat pay alıp öne çıkar.
                       Aradaki beyaz çizgi: satır zemini beyaz + 2px gap. */
                    <View style={{
                      flexDirection: 'row', marginTop: 8, gap: 2,
                      borderRadius: 8, overflow: 'hidden', backgroundColor: isDark ? T.cardSoft : '#FFFFFF',
                    }}>
                      {imgs.map(x => {
                        const active = x.f.id === cur.f.id;
                        return (
                          <Pressable
                            key={x.f.id}
                            onPress={() => setGalleryId(x.f.id)}
                            style={{
                              flex: active ? 2.4 : 1,
                              height: 68, minWidth: 0,
                              backgroundColor: isDark ? T.cardSoft : "#EEF2F6",
                              opacity: active ? 1 : 0.78,
                              ...(Platform.OS === 'web'
                                ? ({ cursor: 'pointer',
                                     transition: 'flex-grow 220ms ease-out, opacity 220ms ease-out' } as any)
                                : {}),
                            }}
                          >
                            <Image source={{ uri: x.thumb }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })()}
            {!isCollapsed && g.key !== 'photo' && g.files.map((f) => {
            const ext = (f.storage_path.split('.').pop() ?? '').toUpperCase().slice(0, 4);
            const isImage = /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.storage_path);
            // Tür ayrımı: STL/PLY/OBJ, ZIP, HTML ve PDF ayrı renk+ikon alır.
            // Öncesinde görsel olmayan her şey aynı mavi dosya ikonuydu.
            const lowExt = ext.toLowerCase();
            const isMesh = ['stl', 'ply', 'obj', '3mf'].includes(lowExt);
            const isZip  = ['zip', 'rar', '7z', 'gz'].includes(lowExt);
            const isHtml = ['html', 'htm'].includes(lowExt);
            const isPdf  = lowExt === 'pdf';
            const color = isImage ? '#10B981'
                        : isMesh ? '#3B82F6'
                        : isZip  ? '#D97706'
                        : isHtml ? '#8B5CF6'
                        : isPdf  ? '#DC2626'
                        : '#64748B';
            const Icon = isImage ? ImageIcon : isMesh ? Layers : FileIcon;
            const filename = f.caption ?? f.storage_path.split('/').pop() ?? '—';
            const uploadedAt = f.created_at
              ? new Date(f.created_at).toLocaleString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : '';
            return (
              <View
                key={f.id}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 9,
                  paddingHorizontal: 12, paddingVertical: 5, paddingStart: 28,
                }}
              >
                <View
                  style={{
                    width: 22, height: 22, borderRadius: 6,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: color + '1A',
                    borderWidth: 1, borderColor: color + '33',
                  }}
                >
                  <Icon size={11} color={color} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                    <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: isDark ? T.ink : "#0A0A0A", flexShrink: 1 }}>
                      {filename}
                    </Text>
                    <Text style={{ fontSize: 10, color: isDark ? T.ink3 : "#9A9A9A", flexShrink: 0 }} numberOfLines={1}>
                      {ext}{f.tooth_number != null ? ` · Diş ${f.tooth_number}` : ''}
                    </Text>
                  </View>
                  {uploadedAt ? (
                    <Text style={{ fontSize: 9.5, color: isDark ? T.ink3 : "#B0B0B0", marginTop: 1 }} numberOfLines={1}>
                      Eklendi: {uploadedAt}
                    </Text>
                  ) : null}
                </View>
                {/* Preview button — STL/PLY/OBJ ise 3D viewer, zip ise açıp 3D, diğerleri yeni tab */}
                <Pressable
                  onPress={() => openPreview(f)}
                  disabled={extractingId === f.id}
                  hitSlop={6}
                  // @ts-ignore web tooltip
                  title={isArchiveExt(f.storage_path) ? 'Zip aç ve 3D göster' : 'Önizle'}
                  style={{
                    width: 24, height: 24, borderRadius: 6,
                    alignItems: 'center', justifyContent: 'center',
                    ...(Platform.OS === 'web' && extractingId !== f.id ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  {extractingId === f.id
                    ? <ActivityIndicator size="small" color="#475569" />
                    : <Eye size={12} color="#475569" strokeWidth={1.8} />}
                </Pressable>
                {/* Download button — zorla indirme */}
                <Pressable
                  onPress={() => forceDownload(f)}
                  hitSlop={6}
                  // @ts-ignore web tooltip
                  title="İndir"
                  style={{
                    width: 24, height: 24, borderRadius: 6,
                    alignItems: 'center', justifyContent: 'center',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Download size={12} color="#475569" strokeWidth={1.8} />
                </Pressable>
              </View>
            );
            })}
          </View>
          );
          })}
        </View>
      )}
      {/* 3D Yüz Tarama — sadece TrueDepth'li iPhone'larda görünür, diğer
          platformlarda null döner. Mevcut StageFileUpload akışını bozmaz. */}
      <FaceScanButton
        workOrderId={workOrderId}
        accentColor={accentColor}
        onUploaded={onUploaded}
      />

      {/* StageFileUpload sabit pozisyon — re-render'da unmount olmaz.
          triggerStyle='row': iç içe kart yerine inline trigger satırı (üstteki foto listesiyle aynı tarz). */}
      <StageFileUpload
        workOrderId={workOrderId}
        stageId={stageId}
        stationName={stationName}
        accentColor={accentColor}
        onUploaded={onUploaded}
        hideFileList
        triggerStyle="row"
      />

      {/* 3D Viewer Modal — STL/PLY/OBJ önizleme için lazy chunk */}
      {viewer3DFile && Platform.OS === 'web' && (
        <React.Suspense fallback={null}>
          <Viewer3DModal
            visible={!!viewer3DFile}
            files={[viewer3DFile]}
            referenceImages={referenceImages}
            title={viewer3DFile.name}
            orderId={workOrderId}
            onClose={() => { setViewer3DFile(null); refreshAnnotCount(); }}
          />
        </React.Suspense>
      )}
      {/* 3D Viewer — native (WebView + three.js) */}
      {viewer3DFile && Platform.OS !== 'web' && (
        <MobileViewer3D
          visible={!!viewer3DFile}
          files={[viewer3DFile]}
          title={viewer3DFile.name}
          orderId={workOrderId}
          onClose={() => { setViewer3DFile(null); refreshAnnotCount(); }}
          onThumbnail={(dataUrl) => {
            // Mesh zaten yüklü — küçük resmi bir kez üretip sakla. Sonraki
            // açılışlarda dosya listesi 16-29 MB indirmeden önizleme gösterir.
            const f = photos.find(p => p.id === viewer3DFile.id);
            if (f?.storage_path) void saveMeshThumb(f.storage_path, dataUrl);
          }}
        />
      )}

      {/* Görsel önizleme — zoom (scroll/pinch) + pan + next/prev + safe-area (uygulama-içi).
          Zip içi görseller varsa onlar arasında gezilir. */}
      {imageViewer && (() => {
        const src = (zipImages ?? referenceImages) as Array<{ url: string; name: string; thumb?: string }>;
        const lbImages = src.length
          ? src.map(r => ({ url: r.url, name: r.name, thumb: r.thumb }))
          : [imageViewer];
        let lbIndex = lbImages.findIndex(im => im.url === imageViewer.url);
        if (lbIndex < 0) { lbImages.unshift(imageViewer); lbIndex = 0; }
        const close = () => { setImageViewer(null); if (zipImages) { setZipImages(null); revokeZipUrls(); } };
        return (
          <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
            {Platform.OS === 'web' ? (
              <ImageLightbox
                images={lbImages}
                index={lbIndex}
                topInset={insets.top}
                onClose={close}
                onIndexChange={(i) => setImageViewer({ url: lbImages[i].url, name: lbImages[i].name })}
              />
            ) : (
              <NativeImageViewer
                images={lbImages}
                index={lbIndex}
                topInset={insets.top}
                onClose={close}
                onIndexChange={(i) => setImageViewer({ url: lbImages[i].url, name: lbImages[i].name })}
              />
            )}
          </Modal>
        );
      })()}

      {/* HTML tasarım önizleme — exocad web viewer iframe (uygulama-içi) */}
      {htmlViewer && Platform.OS === 'web' && (
        <Modal visible transparent animationType="fade" onRequestClose={closeHtmlViewer}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16,
            // env() CSS fallback — modal context'inde insets.top 0 dönse bile notch'u temizler
            paddingTop: (`max(${Math.max(16, insets.top + 8)}px, calc(env(safe-area-inset-top, 0px) + 12px))`) as any,
            paddingBottom: (`max(${Math.max(16, insets.bottom)}px, calc(env(safe-area-inset-bottom, 0px) + 12px))`) as any }}>
            <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: isDark ? T.ink : "#0A0A0A" }} numberOfLines={1}>{htmlViewer.name}</Text>
                <Pressable onPress={() => window.open(htmlViewer.url, '_blank')} hitSlop={8} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: isDark ? T.cardSoft : "#F1F5F9" }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? T.ink2 : "#334155" }}>Yeni sekmede aç</Text>
                </Pressable>
                <Pressable onPress={closeHtmlViewer} hitSlop={10} style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: isDark ? T.cardSoft : "#F1F5F9", alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18, lineHeight: 18, color: isDark ? T.ink2 : "#334155" }}>×</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1 }}>
                {React.createElement('iframe', {
                  src: htmlViewer.url,
                  style: { flex: 1, width: '100%', height: '100%', border: 0, backgroundColor: '#FFFFFF' },
                  title: htmlViewer.name,
                })}
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* HTML tasarım önizleme — native (WebView, uygulama-içi exocad viewer) */}
      {htmlViewer && Platform.OS !== 'web' && HtmlWebView && (
        <Modal visible transparent animationType="fade" onRequestClose={closeHtmlViewer}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12,
            paddingTop: Math.max(insets.top, 12) + 8, paddingBottom: Math.max(insets.bottom, 12) }}>
            <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: isDark ? T.ink : "#0A0A0A" }} numberOfLines={1}>{htmlViewer.name}</Text>
                <Pressable onPress={closeHtmlViewer} hitSlop={10} style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: isDark ? T.cardSoft : "#F1F5F9", alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18, lineHeight: 18, color: isDark ? T.ink2 : "#334155" }}>×</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
                <HtmlWebView
                  originWhitelist={['*']}
                  source={{ html: htmlViewer.html ?? '' }}
                  style={{ flex: 1, backgroundColor: '#FFFFFF' }}
                  javaScriptEnabled
                  domStorageEnabled
                  allowFileAccess
                  allowUniversalAccessFromFileURLs
                  originAllowsMixedContent
                  scalesPageToFit
                  startInLoadingState
                  renderLoading={() => (
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                      <ActivityIndicator size="large" color="#4771AB" />
                    </View>
                  )}
                />
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Multi-file viewer — "Tümünü 3D Aç" veya zip'ten çıkan mesh'ler tek sahnede.
          Zip'ten geldiyse referans görseller zip içindekiler olur. */}
      {viewerAll && Platform.OS === 'web' && (
        <React.Suspense fallback={null}>
          <Viewer3DModal
            visible={!!viewerAll}
            files={viewerAll}
            referenceImages={zipImages ?? referenceImages}
            title={`${viewerAll.length} dosya birlikte`}
            orderId={workOrderId}
            sourceDownload={zipSource ?? undefined}
            onClose={() => { setViewerAll(null); setZipImages(null); setZipSource(null); revokeZipUrls(); refreshAnnotCount(); }}
          />
        </React.Suspense>
      )}
      {/* ZIP taraması — native: arşiv görüntüleyicinin WebView'inde açılır */}
      {zipViewer && Platform.OS !== 'web' && (
        <MobileViewer3D
          visible={!!zipViewer}
          files={[]}
          zipUrl={zipViewer.url}
          title={zipViewer.name}
          orderId={workOrderId}
          onClose={() => { setZipViewer(null); refreshAnnotCount(); }}
        />
      )}
      {/* Çoklu 3D — native (WebView + three.js) */}
      {viewerAll && Platform.OS !== 'web' && (
        <MobileViewer3D
          visible={!!viewerAll}
          files={viewerAll}
          title={`${viewerAll.length} dosya birlikte`}
          orderId={workOrderId}
          onClose={() => { setViewerAll(null); setZipImages(null); setZipSource(null); refreshAnnotCount(); }}
        />
      )}
    </View>
  );
}

