import { localeTag } from '../../../core/i18n';
import { isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { safeBack } from '../../../core/util/safeBack';
import { openFileUrl } from '../../../core/util/openFile';
import { toast } from '../../../core/ui/Toast';
import { supabase } from '../../../core/api/supabase';
// modules/triage/screens/PlanReviewScreen.tsx
// Plan Önizleme & Onay — planlama bekleyen sipariş açılınca ilk bu ekran gelir.
// Gerçek veriyle çalışır; onayda mevcut triage_order RPC'sini çağırır.
// Panel-aware (usePanelTheme) — lab müdür panelinde safran accent.

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, ScrollView, Platform, Modal, TextInput, useWindowDimensions, Alert, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';
import {
  GripVertical, X, Plus, AlertTriangle, Sparkles, ChevronUp, ChevronDown, ChevronRight, Download,
  Play, FileText, Stethoscope, ChevronDown as Caret, Check, ArrowLeft, Layers, Box, MessageSquare, Save, Clock, Eye, Printer,
  Phone, Mail, User,
} from 'lucide-react-native';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { DS } from '../../../core/theme/dsTokens';
import { useAuthStore } from '../../../core/store/authStore';
import { ChatDetail } from '../../orders/components/MessagesPopup';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import {
  fetchTriageData, matchTemplate, saveTriagePlan, autoAssignTech, isQualified, createTemplate,
  summarizePlanTiming, fmtDuration, fetchAutoTriage, approveTriagePlan, signWorkOrderFile, setOrderItemLanes,
  type TriageStation, type TriageTech, type TriageData, type PlanLine,
} from '../api';
import { getStationKind, type StationKind } from '../../orders/stations/registry';

// Lazy viewer-3d (three.js ayrı chunk) — tek paylaşılan retry'lı lazy instance.
import { Viewer3DModalLazy as Viewer3DModal } from '../../viewer-3d/Viewer3DLazy';
import { unzipToViewer, isArchiveExt } from '../../orders/fileArchive';
import { LivingToothChart } from '../../orders/components/LivingToothChart';
import type { WorkOrder } from '../../orders/types';
// Uygulama-içi görsel önizleme (zoom + ileri/geri + safe-area) — sipariş detayı kalıbı.
import { ImageLightbox } from '../../../core/ui/ImageLightbox';
import { useBottomActionBar } from '../../../core/store/uiOverlayStore';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';

function is3DFileFmt(path: string): 'stl' | 'ply' | 'obj' | null {
  const ext = (path ?? '').toLowerCase().split('.').pop();
  return ext === 'stl' || ext === 'ply' || ext === 'obj' ? ext : null;
}

function isImagePath(path: string): boolean {
  const ext = (path ?? '').toLowerCase().split('.').pop() ?? '';
  return ['jpg','jpeg','png','gif','webp','bmp','heic','heif','svg','avif'].includes(ext);
}

// Dosya kategorisi — Taramalar (3D/zip) · Fotoğraflar (görsel) · Belgeler (diğer)
type FileCat = 'scan' | 'photo' | 'doc';
function fileCategoryOf(s: string): FileCat {
  const p = (s || '').toLowerCase();
  if (/\.(stl|ply|obj|zip|3mf|dcm)$/.test(p)) return 'scan';
  if (/\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|svg)$/.test(p)) return 'photo';
  return 'doc';
}
const FILE_CAT_META: { key: FileCat; label: string }[] = [
  { key: 'scan',  label: 'Taramalar' },
  { key: 'photo', label: 'Fotoğraflar' },
  { key: 'doc',   label: 'Belgeler' },
];

const INK = DS.ink;
const DISPLAY = Platform.select({ web: 'Inter Tight, Inter, sans-serif', default: 'InterTight_300Light' }) as string;
// Panel sayfa zemini (PatternsShell ile birebir) — theme.bg yumuşak dolgudur, zemin değil.
const PANEL_BGPAGE: Record<string, string> = { lab: '#F5F1EB', clinic: '#F9FAFB', exec: '#F7F9FC', tech: '#F5F9FD' };

function tint(hex: string, a: number) {
  try {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  } catch { return hex; }
}
/**
 * Rengi beyazla karıştırıp OPAK bir ton üretir.
 *
 * `tint()` saydam döner; cam bir yüzeyin üstünde saydam dolgu kullanılırsa
 * butonun kendisi de camlaşır ve altındaki içerik içinden geçer. Cam efekti
 * yalnız barın kendisinde olsun diye barın üstündeki dolgular bununla üretilir.
 */
function mixWhite(hex: string, ratio: number) {
  try {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const m = (c: number) => Math.round(255 + (c - 255) * ratio);
    return `rgb(${m(r)},${m(g)},${m(b)})`;
  } catch { return hex; }
}

/**
 * Akış rampası — disk ve bağlantı rengi istasyonun KENDİ renginden değil,
 * aşamanın akıştaki SIRASINDAN gelir.
 *
 * İstasyon renkleri birbirinden bağımsız seçildiği için 9 kart bir geçiş değil
 * kopuk lekeler gibi duruyordu (ikisi neredeyse siyahtı). Rampa panelin kendi
 * renginden başlar ve üretimin bittiğini anlatan yeşilde biter: renk artık
 * "hangi istasyon" değil "akışın neresindeyiz" sorusunu cevaplıyor.
 *
 * Çıktı hex — `tint()` / `mixWhite()` hex bekliyor.
 */
function flowColor(i: number, total: number, from: string, to = '#2D9A6B') {
  const t = total <= 1 ? 0 : Math.min(1, Math.max(0, i / (total - 1)));
  try {
    const ch = (h: string, k: number) => parseInt(h.slice(k, k + 2), 16);
    const mix = (k: number) => {
      const v = Math.round(ch(from, k) + (ch(to, k) - ch(from, k)) * t);
      return Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0');
    };
    return `#${mix(1)}${mix(3)}${mix(5)}`;
  } catch { return from; }
}

/**
 * Ham enum değerini okunur hâle getirir: `dijital_tarama` → "Dijital tarama".
 * Alt çizgi ayrılır, yalnız İLK harf büyütülür (Title Case değil — "Dijital
 * Tarama" bir başlık gibi okunur, bu bir değer). Kod gibi görünen kısa değerler
 * (2M2, A3.5) olduğu gibi bırakılır.
 */
function prettyValue(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return '—';
  if (!/[a-zçğıöşü]/.test(s)) return s;            // 2M2, A3.5 gibi kodlar
  const spaced = s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return spaced.charAt(0).toLocaleUpperCase('tr-TR') + spaced.slice(1);
}

function initials(n: string | null) {
  if (!n) return '?';
  return n.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}
function loadColor(load: number) {
  return load >= 5 ? '#D94B4B' : load >= 3 ? '#E89B2A' : '#2D9A6B';
}

// ── Sunum katmanı ───────────────────────────────────────────────────────────
// Tek hairline değeri (17 farklı gri yerine). Kart kenarı, ayraç, ızgara.
const HAIR = 'rgba(0,0,0,0.07)';

/**
 * Tipografi ölçeği — tracking BOYUTA göre değişir (sabit letter-spacing bir
 * yerde mutlaka yanlıştır): büyük metin sıkışır, küçük etiket ferahlar.
 * Ekranda yalnız bu 5 basamak kullanılır; ara boyut (12.5/13.5/9.5) yok.
 */
const TYPE = {
  display: { fontFamily: DISPLAY, fontSize: 27, letterSpacing: -0.65, lineHeight: 32 } as const,
  title:   { fontSize: 15, fontWeight: '600', letterSpacing: -0.15 } as const,
  body:    { fontSize: 13, letterSpacing: -0.05 } as const,
  meta:    { fontSize: 11.5, letterSpacing: 0 } as const,
  label:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' } as const,
};

/**
 * Basınç geri bildirimi — parmak/imleç DEĞDİĞİ anda, bırakışta değil.
 * Gecikme hissedilmesin diye 110ms; eğri Apple'ın standart giriş eğrisi.
 */
const press = (pressed: boolean, scale = 0.97) => ({
  transform: [{ scale: pressed ? scale : 1 }],
  ...(Platform.OS === 'web' ? { transition: 'transform 110ms cubic-bezier(0.2,0,0,1)' } as any : {}),
});

/**
 * İpucu balonu — ikon butonun ne yaptığını söyler.
 *
 * Tarayıcının yerleşik `title` balonu yerine kendimiz çiziyoruz: o balon ~1 sn
 * gecikiyor, sistem fontuyla geliyor ve konumu kontrol edilemiyor. Bu balon
 * dokunulduğu anda beliriyor ve tasarım diline uyuyor.
 *
 * Genişlik hesabı yok: balon, butondan iki yana taşan geniş ve ortalanmış bir
 * kapsayıcıda duruyor — metin ne kadar uzun olursa olsun ortalı kalıyor.
 * Dokunmatikte hover kavramı olmadığı için native'de hiç render edilmiyor.
 */
function Tip({ label, children, grow, block }: {
  label: string; children: React.ReactNode;
  /** satır içinde tam genişliğe yayılan buton (mobil ana CTA) */
  grow?: boolean;
  /** kolon içinde tam genişlik kaplayan buton (kart içi teknisyen seçici gibi) */
  block?: boolean;
}) {
  const [on, setOn] = useState(false);
  const [dx, setDx] = useState(0);
  if (Platform.OS !== 'web') return <>{children}</>;

  const HALF = 130;   // balon en fazla 260 geniş

  /**
   * Balon, tetikleyiciye göre ABSOLUTE konumlanır — `fixed` denendi ve geri
   * alındı: `backdrop-filter`'lı alt bar (ve transform'lu her ata) fixed için
   * "containing block" yaratıyor, balon barın içine hapsoluyordu.
   *
   * Ekran dışına taşma, hover anında ölçülüp yatay kaydırmayla düzeltilir:
   * balonun merkezi viewport'un içinde kalacak şekilde geri çekilir.
   */
  const show = (e: any) => {
    setOn(true);
    const r = e?.currentTarget?.getBoundingClientRect?.();
    if (!r || typeof window === 'undefined') { setDx(0); return; }
    const cx = r.left + r.width / 2;
    const clamped = Math.min(Math.max(cx, HALF + 8), window.innerWidth - HALF - 8);
    setDx(clamped - cx);
  };

  return React.createElement(
    'div',
    {
      onMouseEnter: show,
      onMouseLeave: () => setOn(false),
      // Sarmalayıcı div, sardığı butonun düzendeki davranışını DEVRALMALI;
      // yoksa tam genişlik isteyen butonlar içeriğe göre büzülür.
      style: {
        position: 'relative',
        display: 'flex',
        ...(grow ? { flex: '1 1 100%', width: '100%' } : null),
        ...(block ? { width: '100%' } : null),
      },
    },
    <>
      {children}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', bottom: '100%', left: -HALF, right: -HALF, marginBottom: 8,
          alignItems: 'center', zIndex: 200, opacity: on ? 1 : 0,
          transform: [{ translateX: dx }],
          transition: 'opacity 120ms ease',
        } as any}
      >
        <View style={{
          maxWidth: HALF * 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9,
          backgroundColor: '#FFFFFF',
          borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)',
          boxShadow: '0 8px 24px rgba(15,23,42,0.16)',
        } as any}>
          <Text style={{ fontSize: 11, fontWeight: '500', color: INK[800], letterSpacing: 0.1, lineHeight: 15, textAlign: 'center' }}>
            {label}
          </Text>
        </View>
      </View>
    </>,
  );
}

/** Bir CSS medya sorgusunu dinler (web dışında hep false). */
function useMediaQuery(query: string) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, [query]);
  return on;
}

/** prefers-reduced-motion — hareketi kapat, geri bildirimi (opaklık) bırak. */
const useReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');

/** prefers-reduced-transparency — camı buzlandır/opaklaştır, blur'u kaldır. */
const useReducedTransparency = () => useMediaQuery('(prefers-reduced-transparency: reduce)');

interface Row {
  stationId: string;
  active: boolean;
  technicianId: string | null;
  /** Faz 5: önceki aktif aşamayla eşzamanlı (paralel) yürür */
  parallelWithPrev?: boolean;
}

export function PlanReviewScreen({ orderId }: { orderId: string }) {
  // Altta yapışkan aksiyon çubuğu (Tek Tıkla Uygula / Onayla) var → Simanty
  // FAB'ı üstüne kaysın, "Onayla" butonunu kapatmasın.
  useBottomActionBar(84);
  const router = useRouter();
  const segments = useSegments() as string[];
  const panelGroup = segments?.[0] && segments[0].startsWith('(') ? segments[0] : '(lab)';
  const theme = usePanelTheme();
  const A = theme.primary;
  const A_DEEP = theme.primaryDeep;
  const PAGE = PANEL_BGPAGE[theme.key] ?? theme.bg;
  const { profile } = useAuthStore();
  const labId = (profile as any)?.lab_id ?? null;
  const { width: winW } = useWindowDimensions();
  const isNarrow = winW < 768; // Faz 6: mobil/dar ekran düzeni
  const insets = useSafeAreaInsets(); // mobil/PWA — alt çentik (home indicator) boşluğu
  const reduced = useReducedMotion();          // hareket azaltma tercihi → geçişler kapanır
  const solidGlass = useReducedTransparency(); // saydamlık azaltma tercihi → cam opaklaşır

  const [data, setData] = useState<TriageData | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Dosya kategorisi aç/kapa (varsayılan: KAPALI)
  const [openFileCats, setOpenFileCats] = useState<Record<string, boolean>>({});
  const [pickerFor, setPickerFor] = useState<string | null>(null); // teknisyen seçici açık olan stationId
  const [chatOpen, setChatOpen] = useState(false);                   // sipariş yazışması modal'ı
  const [printing, setPrinting] = useState(false);                   // iş kağıdı hazırlanıyor
  const [dragIndex, setDragIndex] = useState<number | null>(null);   // sürüklenen aktif satır
  const [overIndex, setOverIndex] = useState<number | null>(null);   // üzerine gelinen satır
  // Çok-şerit sürükle-bırak: hangi şeritte hangi satır sürükleniyor/üzerine geliniyor
  const [dragLane, setDragLane] = useState<{ lane: number; index: number } | null>(null);
  const [overLane, setOverLane] = useState<{ lane: number; index: number } | null>(null);
  const [tplOpen, setTplOpen] = useState(false);                      // "Şablon kaydet" modalı
  const [tplName, setTplName] = useState('');
  const [tplSaving, setTplSaving] = useState(false);
  const [tplDone, setTplDone] = useState(false);
  const [addOpen, setAddOpen] = useState(false);                 // "Aşama Ekle" açılır listesi
  const [selProc, setSelProc] = useState<string | null>(null);   // seçili işlem (diş vurgusu)
  const [selTooth, setSelTooth] = useState<number | null>(null); // seçili diş (işlem detayı)
  const [autoTriage, setAutoTriage] = useState(false);           // Faz 5c: oto-triaj ayarı
  const [matchedTpl, setMatchedTpl] = useState(false);           // Faz 5c: şablon güvenle eşleşti mi
  // Planı ekran açılırken OTOMATİK şekillendiren kararlar — kullanıcıya söylenir,
  // yoksa "9 aşama" listesi sanki elle kurulmuş gibi görünür.
  const [autoSkipped, setAutoSkipped] = useState<string[]>([]);  // dijital ölçüde plandan çıkarılan istasyonlar

  // ── Faz 2: paralel iş şeritleri — İZOLE state. laneCount>1 iken devreye girer;
  //    tek-şerit yolu (rows/handlers/render/save) HİÇ değişmez. laneRows istasyonu
  //    tekrar edebilsin diye `uid` ile anahtarlanır (aynı istasyon 2 şeritte olabilir).
  const [laneCount, setLaneCount] = useState(1);
  const [laneRows, setLaneRows] = useState<{ uid: string; stationId: string; lane: number; technicianId: string | null }[]>([]);
  const [itemLanes, setItemLanes] = useState<Record<string, number>>({});
  const laneUidRef = useRef(0);

  // 3D önizleme — tekil dosya + tümünü katmanlı (OrderDetailScreenV2 kalıbı)
  type ViewerMesh = { id: string; name: string; url: string; format: 'stl'|'ply'|'obj'; textureUrl?: string | null };
  const [viewer3DFile, setViewer3DFile] = useState<ViewerMesh | null>(null);
  const [viewerAll, setViewerAll] = useState<ViewerMesh[] | null>(null);
  // ZIP'ten açılan viewer'da indirme kaynağı (mesh yerine kaynak zip insin)
  const [zipSource, setZipSource] = useState<{ url: string; name: string } | null>(null);
  // 2D görsel önizleme — uygulama-içi lightbox (yeni sekme yerine)
  const [imageViewer, setImageViewer] = useState<{ url: string; name: string } | null>(null);
  // HTML tasarım (exocad vb.) → uygulama-içi iframe
  const [htmlViewer, setHtmlViewer] = useState<{ url: string; name: string } | null>(null);
  const closeHtmlViewer = () => {
    if (htmlViewer?.url?.startsWith('blob:')) { try { URL.revokeObjectURL(htmlViewer.url); } catch {} }
    setHtmlViewer(null);
  };
  // Zip açılıyor göstergesi + zip içi görseller (lightbox) + revoke edilecek blob URL'ler
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [zipImages, setZipImages] = useState<{ url: string; name: string }[] | null>(null);
  const zipUrlsRef = useRef<string[]>([]);
  const revokeZipUrls = () => {
    zipUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
    zipUrlsRef.current = [];
  };

  // Tüm 3D dosyalar (STL/PLY/OBJ) — "tümünü katmanlı göster" için
  const all3DFiles = useMemo(() => (
    (data?.files ?? [])
      .map(f => {
        const fmt = is3DFileFmt(f.storage_path) ?? is3DFileFmt(f.name);
        return fmt && f.signed_url ? { id: f.id, name: f.name, url: f.signed_url, format: fmt, storage_path: f.storage_path } : null;
      })
      .filter(Boolean) as Array<{ id: string; name: string; url: string; format: 'stl'|'ply'|'obj'; storage_path: string }>
  ), [data?.files]);

  // 2D referans fotoğraflar (gülüş tasarımı / ekartörlü) — 3D üstünde overlay
  const referenceImages = useMemo(() => (
    (data?.files ?? [])
      .map(f => (f.isImage && f.signed_url ? { id: f.id, name: f.name, url: f.signed_url } : null))
      .filter(Boolean) as Array<{ id: string; name: string; url: string }>
  ), [data?.files]);

  // Tıklama anında TAZE imzalı URL üret (sayfadaki URL süresi dolmuş olabilir → HTTP 400).
  const openFilePreview = useCallback(async (f: { id: string; name: string; storage_path: string; signed_url: string | null }) => {
    const fmt = is3DFileFmt(f.storage_path) ?? is3DFileFmt(f.name);
    const url = (await signWorkOrderFile(f.storage_path)) ?? f.signed_url;
    // İmzalı URL üretilemedi (ör. storage RLS erişimi yok) → sessiz kalma, bildir.
    if (!url) { toast.error('Dosyaya erişilemedi. Yetki veya dosya sorunu olabilir.'); return; }
    if (fmt && Platform.OS === 'web') { setViewer3DFile({ id: f.id, name: f.name, url, format: fmt }); return; }
    // Görsel → uygulama-içi lightbox (zoom + ileri/geri + safe-area)
    if (isImagePath(f.name || f.storage_path) && Platform.OS === 'web') { setImageViewer({ url, name: f.name }); return; }
    // HTML tasarım (exocad) → uygulama-içi iframe (content-type text olsa da render edilir)
    if (/\.(html?|htm)$/i.test(f.name || f.storage_path) && Platform.OS === 'web') {
      try {
        const res = await fetch(url); const text = await res.text();
        setHtmlViewer({ url: URL.createObjectURL(new Blob([text], { type: 'text/html' })), name: f.name });
      } catch { if (typeof window !== 'undefined') window.open(url, '_blank'); }
      return;
    }
    // ZIP → tarayıcı içinde aç, içindeki mesh'leri 3D viewer'da göster (klinikler
    // tüm taramaları tek zip içine koyuyor). Mesh yoksa görsel lightbox, o da yoksa indir.
    if (isArchiveExt(f.name || f.storage_path) && Platform.OS === 'web') {
      setExtractingId(f.id);
      try {
        revokeZipUrls();
        const r = await unzipToViewer(url, { idPrefix: f.id });
        zipUrlsRef.current = r.objectUrls;
        if (r.files.length > 0) {
          setZipImages(r.images.length ? r.images : null);
          {
            const base = f.storage_path.split('/').pop() ?? 'tarama.zip';
            const realExt = base.includes('.') ? base.split('.').pop()!.toLowerCase() : 'zip';
            let zn = (f.name?.trim() || base);
            if (realExt && !zn.toLowerCase().endsWith('.' + realExt)) zn = `${zn}.${realExt}`;
            setZipSource({ url, name: zn });   // indirme → kaynak zip
          }
          setViewerAll(r.files);
        } else if (r.images.length > 0) {
          setZipImages(r.images);
          setImageViewer(r.images[0]);
        } else if (typeof window !== 'undefined') {
          window.open(url, '_blank');            // içinde tanınan dosya yok → indir
        }
      } catch { if (typeof window !== 'undefined') window.open(url, '_blank'); }
      finally { setExtractingId(null); }
      return;
    }
    openFileUrl(url);
  }, []);

  // Ham dosyayı indir — Supabase `download` parametresi ile (ZIP zip olarak iner, açılmaz).
  const forceDownload = useCallback(async (f: { id: string; name: string; storage_path: string; signed_url: string | null }) => {
    const signed = (await signWorkOrderFile(f.storage_path)) ?? f.signed_url;
    if (!signed) { toast.error('Dosyaya erişilemedi. Birazdan tekrar deneyin.'); return; }
    const base = f.storage_path.split('/').pop() ?? 'file';
    const realExt = base.includes('.') ? base.split('.').pop()!.toLowerCase() : '';
    let name = (f.name?.trim() || base);
    if (realExt && !name.toLowerCase().endsWith('.' + realExt)) name = `${name}.${realExt}`;
    const dlUrl = signed + (signed.includes('?') ? '&' : '?') + 'download=' + encodeURIComponent(name);
    if (Platform.OS !== 'web' || typeof document === 'undefined') { openFileUrl(dlUrl); return; }
    try {
      const a = document.createElement('a');
      a.href = dlUrl; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click();
      setTimeout(() => { try { document.body.removeChild(a); } catch {} }, 100);
    } catch { try { window.open(dlUrl, '_blank'); } catch {} }
  }, []);

  // Kategori grupları — Taramalar / Fotoğraflar / Belgeler (boş olanlar gizli)
  const fileGroups = useMemo(() => {
    const by: Record<FileCat, any[]> = { scan: [], photo: [], doc: [] };
    for (const f of (data?.files ?? [])) by[fileCategoryOf(f.name || f.storage_path)].push(f);
    return FILE_CAT_META.map(m => ({ ...m, files: by[m.key] })).filter(g => g.files.length > 0);
  }, [data?.files]);

  // Tümünü katmanlı aç — her 3D dosya için taze URL üret, sonra viewer'ı aç.
  const openAllLayered = useCallback(async () => {
    const signed = await Promise.all(all3DFiles.map(async (f) => ({
      id: f.id, name: f.name, format: f.format,
      url: (await signWorkOrderFile(f.storage_path)) ?? f.url,
    })));
    setZipSource(null);
    setViewerAll(signed.filter(s => s.url));
  }, [all3DFiles]);
  const autoRanRef = useRef(false);                              // oto-triaj bir kez çalışsın

  const load = useCallback(async () => {
    if (!labId) { setLoading(false); return; }
    setLoading(true);
    const d = await fetchTriageData(orderId, labId);
    setData(d);

    // Başlangıç planı: eşleşen şablon → o istasyonlar aktif & sıralı, gerisi havuzda.
    const tpl = matchTemplate(d.templates, d.order?.work_type ?? null);
    setMatchedTpl(!!(tpl && tpl.station_ids.length > 0));
    fetchAutoTriage(labId).then(setAutoTriage).catch(() => {});
    const stationById = new Map(d.stations.map(s => [s.id, s]));
    let initial: Row[];
    // Otomatik atama: yetkinlik + iş yüküne göre en uygun teknisyen.
    const assign = (s: typeof d.stations[number]) => autoAssignTech(s, d.technicians);
    if (tpl && tpl.station_ids.length > 0) {
      const active = tpl.station_ids
        .filter(id => stationById.has(id))
        .map((id): Row => ({ stationId: id, active: true, technicianId: assign(stationById.get(id)!) }));
      const rest = d.stations
        .filter(s => !tpl.station_ids.includes(s.id))
        .map((s): Row => ({ stationId: s.id, active: false, technicianId: assign(s) }));
      initial = [...active, ...rest];
    } else {
      // Şablon yok → hepsi aktif, sequence_hint sırasıyla (müdür çıkarır)
      initial = d.stations.map((s): Row => ({ stationId: s.id, active: true, technicianId: assign(s) }));
    }

    // Dijital ölçü → Tarama (SCAN) ve alçı modelaj / Model Hazırlık (MODEL_PREP)
    // varsayılan olarak plana girmez (tarama dosyaları hekimden geliyor). İstasyonlar
    // listede kalır — müdür gerekirse triaj'da geri açabilir.
    if (d.order?.measurement_type === 'digital') {
      const skipKinds: StationKind[] = ['SCAN', 'MODEL_PREP'];
      const skipped: string[] = [];
      initial = initial.map((r) => {
        const st = stationById.get(r.stationId);
        if (st && r.active && skipKinds.includes(getStationKind(st.name))) {
          skipped.push(st.name);
          return { ...r, active: false };
        }
        return r;
      });
      setAutoSkipped(skipped);
    } else {
      setAutoSkipped([]);
    }

    setRows(initial);
    setLoading(false);
  }, [orderId, labId]);

  useEffect(() => { load(); }, [load]);

  /**
   * İş kağıdını yazdır — sipariş detayı ekranıyla AYNI A4 çıktısı
   * (`buildOrderPrintDoc` ortak modülü).
   *
   * Triaj sorgusu yazdırma için gereken tüm kolonları çekmiyor (id/lab_id yok),
   * bu yüzden basılacak satır burada ayrıca okunuyor. Hekim/klinik adı ve
   * kalemler zaten elimizde — tekrar sorgulanmıyor.
   */
  const handlePrint = useCallback(async () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    setPrinting(true);
    try {
      const { data: row } = await supabase
        .from('work_orders')
        // Tek parça string — supabase-js dönüş tipini SELECT literalinden çıkarır,
        // parçalı birleştirme tipi GenericStringError'a düşürüyor.
        .select('id, lab_id, order_number, created_at, is_urgent, patient_name, patient_gender, work_type, shade, model_type, machine_type, delivery_date, tooth_numbers, notes, lab_notes')
        .eq('id', orderId)
        .maybeSingle();
      if (!row) { toast.error('Sipariş okunamadı, yazdırılamadı.'); return; }

      const { buildOrderPrintDoc } = await import('../../orders/lib/buildOrderPrintDoc');
      const printable: any = {
        ...row,
        order_items: data?.items ?? [],
        doctor: { full_name: data?.doctorName ?? '—', clinic_name: data?.clinicName ?? '—' },
      };
      const qrUrl = `${window.location.origin}/order/${row.order_number}`;
      const html = await buildOrderPrintDoc(printable, qrUrl, (data?.messages ?? []) as any);

      // Gizli iframe → tarayıcı yazdırma diyaloğu. Sayfanın kendisini
      // yazdırmak yerine iframe kullanılıyor ki ekranın stilleri çıktıya
      // karışmasın. QR ve logo dış kaynaktan geldiği için onload'dan sonra
      // kısa bir bekleme var; erken print boş görsel basıyordu.
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;';
      frame.onload = () => {
        setTimeout(() => {
          try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } catch { /* yoksay */ }
          // Diyalog kapanmadan kaldırırsak yazdırma iptal olur — geç temizle.
          setTimeout(() => frame.remove(), 60_000);
        }, 400);
      };
      document.body.appendChild(frame);
      frame.srcdoc = html;
    } catch (e) {
      console.error('[PlanReview] yazdırma hazırlanamadı:', e);
      toast.error('Yazdırma hazırlanamadı.');
    } finally {
      setPrinting(false);
    }
  }, [orderId, data]);

  const stationById = useMemo(() => new Map((data?.stations ?? []).map(s => [s.id, s])), [data]);
  const techById = useMemo(() => new Map((data?.technicians ?? []).map(t => [t.id, t])), [data]);
  const activeRows = rows.filter(r => r.active);
  const poolRows = rows.filter(r => !r.active);

  // Teknisyeni olmayan aşamalar. autoAssignTech YETKİN aday bulamazsa null döner —
  // yani bu sayı çoğu zaman "otomatiğe bırakıldı" değil, "bu istasyona yetkin
  // kimse yok" demektir ve plan atanmamış aşamalarla üretime girer.
  const unassignedCount = (laneCount > 1 ? laneRows : activeRows).filter(r => !r.technicianId).length;

  // Faz 5: parallelWithPrev bayraklarından grup numaraları türet (aktif satır sırasına hizalı).
  // Bir aşama "önceki ile paralel" ise önceki aşamayla aynı grubu paylaşır; küme dışı → null (seri).
  const activeGroups = useMemo<(number | null)[]>(() => {
    const g: (number | null)[] = new Array(activeRows.length).fill(null);
    let gid = 0;
    for (let i = 1; i < activeRows.length; i++) {
      if (activeRows[i].parallelWithPrev) {
        if (g[i - 1] == null) { gid += 1; g[i - 1] = gid; }
        g[i] = g[i - 1];
      }
    }
    return g;
  }, [activeRows]);

  // Faz 3+5: aktif aşamalardan tahmini süre + SLA (paralel grup = max) + teslim değerlendirmesi
  const planTiming = useMemo(() => {
    const stages = activeRows
      .map((r, i) => {
        const s = stationById.get(r.stationId);
        return s ? { est_duration_min: s.est_duration_min, sla_hours: s.sla_hours, parallel_group: activeGroups[i] } : null;
      })
      .filter(Boolean) as { est_duration_min: number | null; sla_hours: number | null; parallel_group: number | null }[];
    return summarizePlanTiming(stages);
  }, [activeRows, stationById, activeGroups]);

  // SLA → teslim tarihine göre durum (yeşil/sarı/kırmızı). delivery_date varsa kıyasla.
  const slaStatus = useMemo(() => {
    const o = data?.order;
    if (!planTiming.anySla || !o?.delivery_date) return null;
    const now = Date.now();
    const due = new Date(o.delivery_date).getTime();
    if (!Number.isFinite(due)) return null;
    const estFinish = now + planTiming.totalSlaH * 3600_000;
    const slackH = (due - estFinish) / 3600_000;
    const tone: 'ok' | 'warn' | 'late' = slackH >= 12 ? 'ok' : slackH >= 0 ? 'warn' : 'late';
    return { tone, slackH, due, estFinish };
  }, [planTiming, data]);

  const setActive = (id: string, active: boolean) => {
    setRows(prev => {
      const row = prev.find(r => r.stationId === id);
      if (!row) return prev;
      const others = prev.filter(r => r.stationId !== id);
      // aktif edilince aktiflerin sonuna, çıkarılınca havuza
      return active
        ? [...others.filter(r => r.active), { ...row, active: true }, ...others.filter(r => !r.active)]
        : [...others, { ...row, active: false }];
    });
  };
  const move = (id: string, dir: -1 | 1) => {
    setRows(prev => {
      const act = prev.filter(r => r.active);
      const idx = act.findIndex(r => r.stationId === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= act.length) return prev;
      const next = [...act];
      [next[idx], next[j]] = [next[j], next[idx]];
      return [...next, ...prev.filter(r => !r.active)];
    });
  };
  const assignTech = (id: string, techId: string | null) => {
    setRows(prev => prev.map(r => r.stationId === id ? { ...r, technicianId: techId } : r));
    setPickerFor(null);
  };
  // Faz 5: aşamayı önceki aktif aşamayla paralel işaretle/kaldır (ilk aşamada geçersiz)
  const toggleParallel = (id: string) => {
    setRows(prev => prev.map(r => r.stationId === id ? { ...r, parallelWithPrev: !r.parallelWithPrev } : r));
  };
  // Sürükle-bırak: aktif satırlar arası yeniden sıralama (from → to)
  const reorderActive = (from: number, to: number) => {
    setRows(prev => {
      const act = prev.filter(r => r.active);
      const pool = prev.filter(r => !r.active);
      if (from < 0 || to < 0 || from >= act.length || to >= act.length || from === to) return prev;
      const next = [...act];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return [...next, ...pool];
    });
  };

  // ── Faz 2: şerit düzenleyici (yalnız çok-şerit yolunda kullanılır) ───────────
  const newLaneUid = () => `lr${(laneUidRef.current += 1)}`;
  const laneStations = (lane: number) => laneRows.filter(r => r.lane === lane);
  const itemLaneOf = (id: string) => itemLanes[id] ?? 1;

  // Çok-şeride geç / yeni şerit ekle. İlk geçişte mevcut aktif plan = şerit 1;
  // yeni şerit = şerit 1'in klonu (operatör her şeridi kendine göre kırpar).
  const addLane = () => {
    const next = laneCount + 1;
    let base = laneRows;
    if (laneCount === 1) {
      base = activeRows.map(r => ({ uid: newLaneUid(), stationId: r.stationId, lane: 1, technicianId: r.technicianId }));
    }
    const clones = base.filter(r => r.lane === 1)
      .map(r => ({ uid: newLaneUid(), stationId: r.stationId, lane: next, technicianId: r.technicianId }));
    setLaneRows([...base, ...clones]);
    const il: Record<string, number> = { ...itemLanes };
    (data?.items ?? []).forEach(it => { if (il[it.id] == null) il[it.id] = 1; });
    setItemLanes(il);
    setLaneCount(next);
  };

  // Tek şeride dön — laneRows'u at; dokunulmamış `rows` (single-lane) devralır.
  const resetToSingleLane = () => { setLaneRows([]); setItemLanes({}); setLaneCount(1); };

  const removeLane = (lane: number) => {
    if (laneCount <= 2) { resetToSingleLane(); return; }
    setLaneRows(prev => prev.filter(r => r.lane !== lane).map(r => (r.lane > lane ? { ...r, lane: r.lane - 1 } : r)));
    setItemLanes(prev => { const n = { ...prev }; for (const k of Object.keys(n)) { if (n[k] === lane) n[k] = 1; else if (n[k] > lane) n[k] -= 1; } return n; });
    setLaneCount(c => c - 1);
  };

  const removeLaneRow = (uid: string) => setLaneRows(prev => prev.filter(r => r.uid !== uid));
  const setLaneRowTech = (uid: string, techId: string | null) => { setLaneRows(prev => prev.map(r => (r.uid === uid ? { ...r, technicianId: techId } : r))); setPickerFor(null); };
  const addStationToLane = (stationId: string, lane: number) => {
    const st = stationById.get(stationId);
    setLaneRows(prev => [...prev, { uid: newLaneUid(), stationId, lane, technicianId: st ? autoAssignTech(st, data?.technicians ?? []) : null }]);
  };
  const moveLaneRow = (uid: string, lane: number, dir: -1 | 1) => setLaneRows(prev => {
    const arr = prev.filter(r => r.lane === lane);
    const rest = prev.filter(r => r.lane !== lane);
    const idx = arr.findIndex(r => r.uid === uid);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= arr.length) return prev;
    const na = [...arr]; [na[idx], na[j]] = [na[j], na[idx]];
    return [...rest, ...na];
  });
  // Şerit-içi sürükle-bırak sıralama (from → to, aynı şerit içinde)
  const reorderLaneRows = (lane: number, from: number, to: number) => setLaneRows(prev => {
    const arr = prev.filter(r => r.lane === lane);
    const rest = prev.filter(r => r.lane !== lane);
    if (from < 0 || to < 0 || from >= arr.length || to >= arr.length || from === to) return prev;
    const na = [...arr];
    const [moved] = na.splice(from, 1);
    na.splice(to, 0, moved);
    return [...rest, ...na];
  });
  const cycleItemLane = (id: string) => setItemLanes(prev => ({ ...prev, [id]: ((prev[id] ?? 1) % laneCount) + 1 }));

  const handleSave = async (opts?: { approve?: boolean }) => {
    setError('');

    // Faz 2: ÇOK-ŞERİT kaydı — her şerit kendi 1..n sequence'ı, lane damgalı satırlar.
    // Tek-şerit (laneCount===1) yola hiç girmez → bugünkü davranış birebir korunur.
    if (laneCount > 1) {
      const lines: PlanLine[] = [];
      for (let lane = 1; lane <= laneCount; lane++) {
        laneStations(lane).forEach((r, i) => {
          const st = stationById.get(r.stationId);
          if (!st) return;
          lines.push({
            station_id: r.stationId, sequence_order: i + 1,
            status: i === 0 ? 'aktif' : 'bekliyor', skipped_reason: null,
            technician_id: r.technicianId, is_critical: st.is_critical,
            parallel_group: null, lane,
          });
        });
      }
      if (lines.length === 0) { setError('Her şeritte en az 1 aşama olmalı'); return false; }
      // Her şeritte en az 1 aşama var mı? (boş şerit = anlamsız)
      for (let lane = 1; lane <= laneCount; lane++) {
        if (!lines.some(l => l.lane === lane)) { setError(`Şerit ${lane}'de aşama yok`); return false; }
      }
      // Her şeride en az 1 kalem atanmış mı? Atanmayan kalemler bir şeridi boş
      // bırakır → hero/çalışma listesinde "Şerit N" fallback + yanlış yüzde olur.
      // (Kalem yoksa legacy sipariş — atama kontrolü atlanır.)
      const planItems = data?.items ?? [];
      if (planItems.length > 0) {
        for (let lane = 1; lane <= laneCount; lane++) {
          if (!planItems.some(it => itemLaneOf(it.id) === lane)) {
            setError(`Şerit ${lane}'e işlem atanmadı — üstteki işlem çipine dokunup şeridini seç`);
            return false;
          }
        }
      }
      setSaving(true);
      const { error: rpcErr } = await saveTriagePlan(orderId, lines, laneRows[0]?.technicianId ?? null);
      if (rpcErr) { setSaving(false); setError(rpcErr.message ?? 'Kayıt hatası'); return false; }
      await setOrderItemLanes(orderId, (data?.items ?? []).map(it => ({ id: it.id, lane: itemLaneOf(it.id) })));
      if (opts?.approve) {
        const { error: apErr } = await approveTriagePlan(orderId);
        if (apErr) { setSaving(false); setError(apErr.message ?? 'Onay hatası'); return false; }
      }
      setSaving(false);
      router.replace(`/${panelGroup}/order/${orderId}` as any);
      return true;
    }

    if (activeRows.length === 0) { setError('En az 1 aşama aktif olmalı'); return false; }
    setSaving(true);

    // RPC sıralaması: önce aktifler (görsel sıra), sonra havuz (skipped). İlk aktif → bekliyor değil 'aktif'.
    const ordered = [...activeRows, ...poolRows];
    let firstAssigned = false;
    const lines: PlanLine[] = ordered.map((r, idx) => {
      const st = stationById.get(r.stationId)!;
      const isFirst = r.active && !firstAssigned;
      if (isFirst) firstAssigned = true;
      return {
        station_id: r.stationId,
        sequence_order: idx + 1,
        status: !r.active ? 'skipped' : isFirst ? 'aktif' : 'bekliyor',
        skipped_reason: !r.active ? 'Bu siparişte gerekli değil' : null,
        technician_id: r.active ? r.technicianId : null,
        is_critical: st.is_critical,
        // Faz 5: aktif satırlar activeGroups ile hizalı (ordered'da önce geldikleri için idx eşittir)
        parallel_group: r.active ? (activeGroups[idx] ?? null) : null,
      };
    });
    const firstTechId = activeRows[0]?.technicianId ?? null;

    const { error: rpcErr } = await saveTriagePlan(orderId, lines, firstTechId);
    if (rpcErr) { setSaving(false); setError(rpcErr.message ?? 'Kayıt hatası'); return false; }

    // Faz 5c: tek-tıkla / oto-triaj → kaydı hemen onayla (ilk aşamayı aktive eder)
    if (opts?.approve) {
      const { error: apErr } = await approveTriagePlan(orderId);
      if (apErr) { setSaving(false); setError(apErr.message ?? 'Onay hatası'); return false; }
    }
    setSaving(false);
    router.replace(`/${panelGroup}/order/${orderId}` as any);
    return true;
  };

  /**
   * Üretimi başlat — geri dönüşü zor bir işlem. Atanmamış aşama varsa önce sorar.
   * Engelleyici DEĞİL: müdür bilerek atanmadan başlatabilir (yetkin teknisyen
   * gerçekten yoksa başka çaresi de yok), ama bunu bilmeden yapmasın.
   */
  const confirmAndSave = (opts?: { approve?: boolean }) => {
    if (unassignedCount === 0) { handleSave(opts); return; }
    const msg = `${unassignedCount} ${autoT('aşamaya teknisyen atanmadı; bu aşamalar atanmamış olarak üretime girer.')}\n\n${autoT('Yine de başlatılsın mı?')}`;
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || window.confirm(msg)) handleSave(opts);
      return;
    }
    Alert.alert(autoT('Atanmamış aşama var'), msg, [
      { text: autoT('Vazgeç'), style: 'cancel' },
      { text: autoT('Başlat'), onPress: () => { handleSave(opts); } },
    ]);
  };

  // Faz 5c: oto-triaj — ayar açık + şablon güvenle eşleşmiş + aktif aşama var → bir kez otomatik uygula+onayla
  useEffect(() => {
    if (loading || autoRanRef.current) return;
    if (!autoTriage || !matchedTpl || activeRows.length === 0) return;
    autoRanRef.current = true;
    handleSave({ approve: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, autoTriage, matchedTpl, activeRows.length]);

  // Mevcut aktif aşama sırasını yeniden kullanılabilir şablon olarak kaydet
  const openSaveTemplate = () => {
    setTplName(data?.order?.work_type ?? '');
    setTplDone(false);
    setTplOpen(true);
  };
  const handleSaveTemplate = async () => {
    if (!labId || !tplName.trim() || activeRows.length === 0) return;
    setTplSaving(true);
    const res = await createTemplate(labId, {
      name: tplName.trim(),
      case_types: data?.order?.work_type ? [data.order.work_type] : [],
      station_ids: activeRows.map(r => r.stationId),
      is_default: false,
      is_active: true,
    });
    setTplSaving(false);
    if (!(res as any)?.error) { setTplDone(true); setTimeout(() => setTplOpen(false), 900); }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: PAGE, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={A} />
      </View>
    );
  }

  const o = data?.order;

  // Diş ↔ işlem eşlemesi. ÖNCELİK: order_items (her kalem hangi dişlere uygulanır —
  // kesin veri). Yoksa work_type'ı pozisyonel olarak tooth_numbers ile hizala (eski).
  const teeth = o?.tooth_numbers ?? [];
  const orderItems = data?.items ?? [];
  const itemsWithTeeth = orderItems.filter(it => Array.isArray(it.tooth_numbers) && it.tooth_numbers!.length > 0);
  const toothProc: Record<number, string> = {};
  const procTeeth: Record<string, number[]> = {};
  let distinctProcs: string[] = [];
  if (itemsWithTeeth.length > 0) {
    itemsWithTeeth.forEach(it => {
      it.tooth_numbers!.forEach(t => { toothProc[t] = it.name; (procTeeth[it.name] ??= []).push(t); });
    });
    distinctProcs = Array.from(new Set(itemsWithTeeth.map(it => it.name)));
  } else {
    const wtParts = (o?.work_type ?? '').split(/,\s*/).map(s => s.trim()).filter(Boolean);
    if (teeth.length > 0 && wtParts.length === teeth.length) {
      teeth.forEach((t, i) => { toothProc[t] = wtParts[i]; (procTeeth[wtParts[i]] ??= []).push(t); });
    }
    distinctProcs = Array.from(new Set(wtParts));
  }
  const hasToothProc = Object.keys(toothProc).length > 0;
  const PROC_PALETTE = [A, '#3B82F6', '#8B5CB8', '#2BA39B', '#E89B2A', '#D94B4B', '#0EA5E9'];
  const procColor = (p: string) => PROC_PALETTE[Math.max(0, distinctProcs.indexOf(p)) % PROC_PALETTE.length];
  // LivingToothChart için diş→renk (işlem rengi); eşlenmeyen diş = accent
  const toothColorMap: Record<number, string> = {};
  teeth.forEach(t => { toothColorMap[t] = toothProc[t] ? procColor(toothProc[t]) : A; });
  // Lejantta bir işlem seçiliyse yalnız o dişleri vurgula, gerisini soluk göster.
  const displayColorMap: Record<number, string> = {};
  teeth.forEach(t => { displayColorMap[t] = selProc ? (toothProc[t] === selProc ? procColor(selProc) : INK[200]) : toothColorMap[t]; });
  const chartOrder = { tooth_numbers: teeth } as unknown as WorkOrder;
  const chartCardW = isNarrow ? Math.max(200, winW - 32) : 360;   // kart iç genişliği referansı

  return (
    <View style={{ flex: 1, backgroundColor: PAGE }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: PAGE_PADDING, paddingTop: 18 + insets.top, paddingBottom: (isNarrow ? 300 : 150) + insets.bottom, width: '100%' }}>
        {/* Geri — basınca küçülür (dokunuşta, bırakışta değil) */}
        <View style={{ alignSelf: 'flex-start', marginBottom: 16, marginStart: -8 }}>
          <Tip label="Planı kaydetmeden önceki sayfaya dön">
            <Pressable
              onPress={() => safeBack('/')}
              hitSlop={8}
              style={({ pressed, hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999,
                backgroundColor: hovered ? 'rgba(0,0,0,0.04)' : 'transparent',
                ...press(pressed),
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <ArrowLeft size={15} color={INK[500]} strokeWidth={2} />
              <Text style={{ ...TYPE.body, color: INK[500], fontWeight: '600' }}>Geri</Text>
            </Pressable>
          </Tip>
        </View>

        {/* Sipariş künyesi + diş şeması — SPLIT (sol künye · sağ diş şeması).
            İki kart aynı yükseklikte (`stretch`). Künye kartı diş şemasından
            kısa kalırsa fazla yükseklik ALTTA boşluk olarak birikmesin diye
            içeride esnek bir ara verilir: işlem lejantı kartın tabanına oturur,
            boşluk künyeyle lejant ARASINA dağılır. */}
        <View style={{ flexDirection: isNarrow ? 'column' : 'row', gap: 14, marginBottom: 14, alignItems: 'stretch' }}>
          {/* ── SOL: künye kartı ──
              Hiyerarşi hastadan başlar: insan önce "kimin işi" diye bakar, sipariş
              numarası künyedir. Gradyan + ikon kutusu kaldırıldı — sakin yüzey. */}
          {/* Künye = hero. Düz beyaz bir kutu yerine panel renginden doğan
              yumuşak bir gradyan + sağ üstte blur'lu ışık kümesi. Metin koyu
              kalır (sayfanın geri kalanıyla aynı okuma tonu), yüzey ise sayfanın
              geri kalanından ayrışır — bu kart sayfanın başlığı.
              Orb yalnız web'de: native'de `filter: blur` yok, keskin bir daire
              olarak görünürdü. */}
          <View style={{
            flex: 1, minWidth: 0, borderRadius: 22,
            // react-native-web her View'a z-index:0 verir → her kart kendi
            // stacking context'i olur ve DOM'da SONRA gelen kart üste biner.
            // Künyedeki butonların ipucu balonu diş şemasının altında kalmasın
            // diye bu kart bir üst basamağa alınır.
            zIndex: 3,
            backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: tint(A, 0.16),
            ...(Platform.OS === 'web' ? {
              backgroundImage: `linear-gradient(150deg, ${tint(A, 0.17)} 0%, ${tint(A, 0.06)} 34%, #FFFFFF 66%)`,
            } as any : {}),
          }}>
            {/* Işık kümesi AYRI bir kırpma katmanında duruyor; kartın kendisine
                `overflow: hidden` verilseydi içindeki butonların ipucu balonları
                da kırpılırdı. Bu katman içerikle kardeş, atası değil. */}
            {Platform.OS === 'web' && (
              <View
                pointerEvents="none"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 22, overflow: 'hidden' } as any}
              >
                <View
                  style={{
                    position: 'absolute', top: -84, end: -44, width: 230, height: 230, borderRadius: 115,
                    backgroundColor: tint(A, 0.22),
                    filter: 'blur(52px)',
                  } as any}
                />
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 20 }}>
              <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ ...TYPE.label, color: A_DEEP }}>Plan Önizleme</Text>
                  {o?.is_urgent && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: tint('#D94B4B', 0.10) }}>
                      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#D94B4B' }} />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#9C2E2E', letterSpacing: 0.3 }}>Acil</Text>
                    </View>
                  )}
                </View>
                <Text style={{ ...TYPE.display, color: INK[900] }} numberOfLines={1}>
                  {o?.patient_name ?? 'Hasta'}
                </Text>
                <Text style={{ ...TYPE.body, color: INK[500] }} numberOfLines={1}>
                  #{o?.order_number ?? '—'}{distinctProcs.length > 0 ? ` · ${distinctProcs.join(' · ')}` : ''}
                </Text>
              </View>

              {/* İkincil aksiyonlar — sessiz, eşit ağırlıkta. Ana aksiyon altta. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {/* İş kağıdı — planı onaylamadan önce basılı nüsha alınabilsin.
                    Çıktı sipariş detayı ekranıyla birebir aynı (ortak modül). */}
                {Platform.OS === 'web' && (
                  <Tip label="İş kağıdını A4 olarak yazdır">
                    <Pressable
                      onPress={handlePrint}
                      disabled={printing}
                      accessibilityLabel="İş kağıdını yazdır"
                      style={({ pressed, hovered }: any) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                        backgroundColor: hovered && !printing ? 'rgba(0,0,0,0.05)' : 'transparent',
                        borderWidth: 1, borderColor: HAIR, opacity: printing ? 0.55 : 1,
                        ...press(pressed),
                        ...(Platform.OS === 'web' ? { cursor: printing ? 'default' : 'pointer' } as any : {}),
                      })}
                    >
                      <Printer size={14} color={INK[700]} strokeWidth={1.9} />
                      <Text style={{ ...TYPE.meta, fontWeight: '600', color: INK[700] }}>{printing ? 'Hazırlanıyor…' : 'Yazdır'}</Text>
                    </Pressable>
                  </Tip>
                )}
                {/* Sipariş yazışması — sorun olursa hekim/klinikle mesajlaş */}
                <Tip label="Hekim ve klinikle bu sipariş üzerinden yazış">
                  <Pressable
                    onPress={() => setChatOpen(true)}
                    style={({ pressed, hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                      backgroundColor: tint(A, hovered ? 0.18 : 0.11),
                      ...press(pressed),
                      ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'transform 110ms cubic-bezier(0.2,0,0,1), background-color 140ms ease' } as any : {}),
                    })}
                  >
                    <MessageSquare size={14} color={A_DEEP} strokeWidth={2} />
                    <Text style={{ ...TYPE.meta, fontWeight: '600', color: A_DEEP }}>Mesaj{(data?.messages.length ?? 0) > 0 ? ` · ${data!.messages.length}` : ''}</Text>
                  </Pressable>
                </Tip>
              </View>
            </View>

            {/* Detay şeridi — kutu yok. Değer önde, etiket altında; okuma sırası
                "3 diş" → "ÜYE". Yedi çerçeve yerine yedi sessiz sütun. */}
            {(() => {
              const meta: { label: string; value: string; accent?: boolean }[] = [
                ...(teeth.length ? [{ label: 'Üye', value: `${teeth.length} diş` }] : []),
                ...(o?.shade ? [{ label: 'Renk', value: prettyValue(o.shade) }] : []),
                ...(o?.model_type ? [{ label: 'Model', value: prettyValue(o.model_type) }] : []),
                ...(o?.machine_type ? [{ label: 'Makine', value: prettyValue(o.machine_type) }] : []),
                ...(o?.patient_gender ? [{ label: 'Cinsiyet', value: prettyValue(o.patient_gender) }] : []),
                ...(o?.created_at ? [{ label: 'Oluşturma', value: new Date(o.created_at).toLocaleDateString(localeTag()) }] : []),
                // Teslim en sonda ve VURGULU: künyedeki tek karar-kritik alan,
                // yedi eşit sütundan biri olarak kaybolmamalı.
                ...(o?.delivery_date ? [{ label: 'Teslim', value: new Date(o.delivery_date).toLocaleDateString(localeTag()), accent: true }] : []),
              ];
              if (meta.length === 0) return null;
              return (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', rowGap: 14, columnGap: 26, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: HAIR }}>
                  {meta.map(m => (
                    m.accent ? (
                      <View
                        key={m.label}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 7,
                          paddingStart: 10, paddingEnd: 12, paddingVertical: 7, borderRadius: 999,
                          backgroundColor: tint(o?.is_urgent ? '#D94B4B' : A, 0.10),
                        }}
                      >
                        <Clock size={14} color={o?.is_urgent ? '#9C2E2E' : A_DEEP} strokeWidth={2} />
                        <View>
                          <Text style={{ fontSize: 14, fontWeight: '700', letterSpacing: -0.2, color: o?.is_urgent ? '#9C2E2E' : A_DEEP }}>{m.value}</Text>
                          <Text style={{ ...TYPE.label, color: o?.is_urgent ? '#9C2E2E' : A_DEEP, opacity: 0.65, marginTop: 1 }}>{m.label}</Text>
                        </View>
                      </View>
                    ) : (
                      <View key={m.label} style={{ minWidth: 0 }}>
                        <Text style={{ ...TYPE.title, color: INK[900] }} numberOfLines={1}>{m.value}</Text>
                        <Text style={{ ...TYPE.label, color: INK[400], marginTop: 3 }}>{m.label}</Text>
                      </View>
                    )
                  ))}
                </View>
              );
            })()}

            {/* Kartı diş şeması yüksekliğine tamamlayan esnek ara */}
            <View style={{ flex: 1, minHeight: 8 }} />

            {/* İşlem lejantı (tıkla → şemada vurgula) + seçili diş.
                Ayraç çizgisi YOK: üç hairline bant kartı forma benzetiyordu,
                bu blok künyenin devamı olarak boşlukla ayrılıyor. */}
            {teeth.length > 0 && (
              <View style={{ paddingHorizontal: 20, paddingBottom: 18, gap: 10 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                  {distinctProcs.map(p => {
                    const c = procColor(p);
                    const active = selProc === p;
                    const count = procTeeth[p]?.length ?? 0;
                    return (
                      <Tip key={p} label={active ? 'Vurguyu kaldır' : `Şemada yalnız ${p} dişlerini vurgula`}>
                        <Pressable
                          onPress={() => { setSelProc(active ? null : p); setSelTooth(null); }}
                          style={({ pressed, hovered }: any) => ({
                            flexDirection: 'row', alignItems: 'center', gap: 7,
                            paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999,
                            backgroundColor: active ? c : tint(c, hovered ? 0.16 : 0.09),
                            ...press(pressed),
                            ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'transform 110ms cubic-bezier(0.2,0,0,1), background-color 140ms ease' } as any : {}),
                          })}
                        >
                          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: active ? '#FFF' : c }} />
                          <Text style={{ ...TYPE.meta, fontWeight: '600', color: active ? '#FFF' : INK[800] }}>{p}</Text>
                          {hasToothProc && count > 0 && (
                            <Text style={{ fontSize: 10.5, fontWeight: '700', color: active ? 'rgba(255,255,255,0.8)' : INK[400] }}>{count}</Text>
                          )}
                        </Pressable>
                      </Tip>
                    );
                  })}
                </View>

                {/* Seçili diş → işlemi */}
                {selTooth != null && toothProc[selTooth] && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: tint(procColor(toothProc[selTooth]), 0.09) }}>
                    <View style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: procColor(toothProc[selTooth]) }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFF' }}>{selTooth}</Text>
                    </View>
                    <Text style={{ ...TYPE.body, fontWeight: '600', color: INK[900] }}>Diş {selTooth} · {toothProc[selTooth]}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ── SAĞ: diş şeması ── */}
          {teeth.length > 0 && (
          <View style={{ width: isNarrow ? '100%' : 360, gap: 12 }}>
          {teeth.length > 0 && (
            <View style={{ borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: HAIR, padding: 16, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text style={{ ...TYPE.label, color: INK[400] }}>Diş Şeması</Text>
                <Text style={{ ...TYPE.meta, color: INK[400] }}>{teeth.length} diş</Text>
                <View style={{ flex: 1 }} />
                {selProc && (
                  <Tip label="Vurguyu kaldır, tüm dişleri göster">
                    <Pressable
                      onPress={() => setSelProc(null)}
                      hitSlop={8}
                      style={({ pressed }: any) => ({ ...press(pressed), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}
                    >
                      <Text style={{ ...TYPE.meta, fontWeight: '600', color: A_DEEP }}>Tümü</Text>
                    </Pressable>
                  </Tip>
                )}
              </View>
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                <LivingToothChart
                  order={chartOrder}
                  containerWidth={chartCardW - 28}
                  containerHeight={210}
                  colorMap={displayColorMap}
                  activeTooth={selTooth}
                  onToothPress={(t) => setSelTooth(selTooth === t ? null : t)}
                  accentColor={A}
                  frameless
                />
              </View>
              {!hasToothProc && (
                <Text style={{ fontSize: 10.5, color: INK[400], textAlign: 'center', fontStyle: 'italic' }}>
                  Diş-işlem eşlemesi yok — tüm dişler tek renk gösteriliyor.
                </Text>
              )}
            </View>
          )}

          </View>
          )}
        </View>

        <View style={{ flexDirection: isNarrow ? 'column' : 'row', gap: 14, flexWrap: 'wrap' }}>
          {/* Sol referans — tek kart dili: radius 18, padding 16, aynı hairline.
              zIndex 2: dosya satırlarındaki ipucu balonları sağdaki akış
              kolonunun altında kalmasın (DOM'da akış sonra geliyor). */}
          <View style={{ width: isNarrow ? '100%' : 256, gap: 12, zIndex: 2 }}>
            <View style={{ borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: HAIR, padding: 16, gap: 10 }}>
              <Text style={{ ...TYPE.label, color: INK[400] }}>Hekim & Klinik</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: tint(A, 0.12), alignItems: 'center', justifyContent: 'center' }}>
                  <Stethoscope size={15} color={A_DEEP} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ ...TYPE.body, fontWeight: '600', color: INK[900] }} numberOfLines={1}>{data?.doctorName ?? '—'}</Text>
                  <Text style={{ ...TYPE.meta, color: INK[500], marginTop: 1 }} numberOfLines={1}>{data?.clinicName ?? ''}</Text>
                </View>
              </View>

              {/* İletişim — triajda bir şey sorulacaksa (implant markası, eksik
                  tarama) numara başka ekranda aranmasın. Dokunulabilir olanlar
                  tel:/mailto: açar. */}
              {(() => {
                const lines: { key: string; icon: React.ReactNode; text: string; href?: string; tip: string }[] = [
                  ...(data?.doctorPhone ? [{
                    key: 'dp', icon: <Phone size={12} color={A_DEEP} strokeWidth={2} />,
                    text: data.doctorPhone, href: `tel:${data.doctorPhone.replace(/\s/g, '')}`,
                    tip: 'Hekimi ara',
                  }] : []),
                  ...(data?.clinicPhone ? [{
                    key: 'cp', icon: <Phone size={12} color={INK[400]} strokeWidth={2} />,
                    text: `${data.clinicPhone} · ${autoT('klinik')}`, href: `tel:${data.clinicPhone.replace(/\s/g, '')}`,
                    tip: 'Kliniği ara',
                  }] : []),
                  ...(data?.clinicContact ? [{
                    key: 'cc', icon: <User size={12} color={INK[400]} strokeWidth={2} />,
                    text: `${data.clinicContact} · ${autoT('irtibat')}`, tip: 'Klinikteki irtibat kişisi',
                  }] : []),
                  ...(data?.clinicEmail ? [{
                    key: 'ce', icon: <Mail size={12} color={INK[400]} strokeWidth={2} />,
                    text: data.clinicEmail, href: `mailto:${data.clinicEmail}`,
                    tip: 'E-posta gönder',
                  }] : []),
                ];
                if (lines.length === 0) return null;
                return (
                  <View style={{ gap: 2, paddingTop: 10, borderTopWidth: 1, borderTopColor: HAIR }}>
                    {lines.map(l => {
                      const row = (
                        <Pressable
                          disabled={!l.href}
                          onPress={() => { if (l.href) Linking.openURL(l.href).catch(() => {}); }}
                          style={({ pressed, hovered }: any) => ({
                            flexDirection: 'row', alignItems: 'center', gap: 7,
                            paddingHorizontal: 6, paddingVertical: 6, borderRadius: 9, marginHorizontal: -6,
                            backgroundColor: hovered && l.href ? 'rgba(0,0,0,0.035)' : 'transparent',
                            ...press(pressed, 0.99),
                            ...(Platform.OS === 'web' && l.href ? { cursor: 'pointer' } as any : {}),
                          })}
                        >
                          {l.icon}
                          <Text style={{ ...TYPE.meta, color: l.href ? INK[800] : INK[500], flex: 1 }} numberOfLines={1}>{l.text}</Text>
                        </Pressable>
                      );
                      return l.href ? <Tip key={l.key} block label={l.tip}>{row}</Tip> : <View key={l.key}>{row}</View>;
                    })}
                  </View>
                );
              })()}
            </View>
            {/* Hekim / klinik mesajları */}
            {(data?.messages.length ?? 0) > 0 && (
              <View style={{ borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: HAIR, padding: 16, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Text style={{ ...TYPE.label, color: INK[400] }}>Hekim Mesajları</Text>
                  <Text style={{ ...TYPE.meta, color: INK[400] }}>{data!.messages.length}</Text>
                </View>
                {data!.messages.map((m, i) => (
                  <View key={m.id} style={{ gap: 4, paddingBottom: i < data!.messages.length - 1 ? 12 : 0, borderBottomWidth: i < data!.messages.length - 1 ? 1 : 0, borderBottomColor: HAIR }}>
                    {m.content ? <Text style={{ ...TYPE.body, color: INK[800], lineHeight: 19 }}>{m.content}</Text> : null}
                    {m.attachment_name ? (
                      <Pressable
                        onPress={() => {
                          if (!m.attachment_url) return;
                          if (Platform.OS === 'web' && isImagePath(m.attachment_name ?? '')) { setImageViewer({ url: m.attachment_url, name: m.attachment_name ?? '' }); return; }
                          openFileUrl(m.attachment_url);
                        }}
                        style={({ pressed }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, ...press(pressed), ...(Platform.OS === 'web' && m.attachment_url ? { cursor: 'pointer' } as any : {}) })}
                      >
                        <FileText size={11} color={m.attachment_url ? A_DEEP : INK[400]} strokeWidth={1.8} />
                        <Text numberOfLines={1} style={{ ...TYPE.meta, fontWeight: '600', color: m.attachment_url ? A_DEEP : INK[500] }}>{m.attachment_name}</Text>
                      </Pressable>
                    ) : null}
                    <Text style={{ fontSize: 10.5, color: INK[400] }}>{m.sender_name ?? 'Hekim'} · {new Date(m.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Dosyalar */}
            <View style={{ borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: HAIR, padding: 16, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text style={{ ...TYPE.label, color: INK[400] }}>Dosyalar</Text>
                <Text style={{ ...TYPE.meta, color: INK[400] }}>{data?.files.length ?? 0}</Text>
              </View>
              {/* Tümünü katmanlı göster — 2+ 3D dosya varsa.
                  Referans panelindeki yardımcı aksiyon: dolu accent blok yerine
                  yumuşak tonlu yüzey. Koyu metin orta tonlu accent üzerinde
                  okunmuyordu; artık koyu accent metin açık zeminde. */}
              {all3DFiles.length >= 2 && Platform.OS === 'web' && (
                <Tip block label={`${all3DFiles.length} taramayı tek sahnede üst üste aç`}>
                <Pressable
                  onPress={openAllLayered}
                  accessibilityLabel={`${all3DFiles.length} taramayı tek sahnede üst üste aç`}
                  style={({ pressed, hovered }: any) => ({
                    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 9,
                    paddingStart: 10, paddingEnd: 8, paddingVertical: 9, borderRadius: 12,
                    backgroundColor: tint(A, hovered ? 0.17 : 0.10),
                    ...press(pressed, 0.985),
                    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'transform 110ms cubic-bezier(0.2,0,0,1), background-color 140ms ease' } as any : {}),
                  })}
                >
                  <Layers size={14} color={A_DEEP} strokeWidth={2} />
                  <Text style={{ ...TYPE.meta, fontWeight: '600', color: A_DEEP, flex: 1 }} numberOfLines={1}>
                    Katmanlı görüntüle
                  </Text>
                  <View style={{ minWidth: 19, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: tint(A, 0.18), alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: A_DEEP }}>{all3DFiles.length}</Text>
                  </View>
                </Pressable>
                </Tip>
              )}
              {(data?.files.length ?? 0) === 0 ? (
                <Text style={{ ...TYPE.meta, color: INK[400] }}>Dosya yok.</Text>
              ) : (
                fileGroups.map((g) => {
                  const isCollapsed = !openFileCats[g.key];
                  const catColor = g.key === 'photo' ? '#10B981' : g.key === 'scan' ? A : INK[500];
                  return (
                  <View key={g.key}>
                    {/* Kategori başlığı — tıklayınca aç/kapa (varsayılan kapalı).
                        Ok, açılış yönünü baştan söylüyor: kapalıyken sağa, açıkken aşağı. */}
                    <Pressable
                      onPress={() => setOpenFileCats(s => ({ ...s, [g.key]: !s[g.key] }))}
                      hitSlop={4}
                      style={({ pressed, hovered }: any) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10, marginHorizontal: -8,
                        backgroundColor: hovered ? 'rgba(0,0,0,0.035)' : 'transparent',
                        ...press(pressed, 0.985),
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      })}
                    >
                      {isCollapsed ? <ChevronRight size={14} color={INK[400]} strokeWidth={2} /> : <ChevronDown size={14} color={INK[400]} strokeWidth={2} />}
                      <Text style={{ flex: 1, ...TYPE.meta, fontWeight: '600', color: INK[700] }}>{g.label}</Text>
                      <View style={{ minWidth: 20, height: 18, paddingHorizontal: 6, borderRadius: 9, backgroundColor: tint(catColor, 0.13), alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: catColor }}>{g.files.length}</Text>
                      </View>
                    </Pressable>
                    {!isCollapsed && g.files.map(f => {
                  const previewable = !!(f.storage_path || f.signed_url); // tıklamada taze imzalanır
                  const isZip = isArchiveExt(f.name || f.storage_path);
                  const isBusy = extractingId === f.id;
                  return (
                  <View
                    key={f.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingStart: 22, paddingVertical: 5, borderRadius: 10 }}
                  >
                    <View style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(f.is3d || isZip ? A : INK[400], 0.11) }}>
                      {f.is3d || isZip ? <Box size={14} color={A_DEEP} strokeWidth={1.8} /> : <FileText size={14} color={INK[500]} strokeWidth={1.8} />}
                    </View>
                    <Text style={{ flex: 1, ...TYPE.meta, fontWeight: '600', color: INK[800] }} numberOfLines={1}>{f.name}</Text>
                    {(f.is3d || isZip) && (
                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: tint(A, 0.14) }}>
                        <Text style={{ fontSize: 8.5, fontWeight: '700', color: A_DEEP }}>{isZip ? 'ZIP' : '3D'}</Text>
                      </View>
                    )}
                    {/* Önizleme butonu — 3D ise viewer, diğeri yeni sekme */}
                    <Tip label={isZip ? 'Zip’i aç, 3D göster' : 'Önizle'}>
                      <Pressable
                        onPress={() => openFilePreview(f)}
                        disabled={!previewable || isBusy}
                        hitSlop={6}
                        accessibilityLabel={isZip ? 'Zip’i aç ve 3D göster' : 'Önizle'}
                        style={({ pressed, hovered }: any) => ({
                          width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: hovered && previewable ? tint(A, 0.13) : 'transparent', opacity: previewable ? 1 : 0.4,
                          ...press(pressed, 0.9),
                          ...(Platform.OS === 'web' && previewable && !isBusy ? { cursor: 'pointer' } as any : {}),
                        })}
                      >
                        {isBusy
                          ? <ActivityIndicator size="small" color={A_DEEP} />
                          : <Eye size={13} color={previewable ? A_DEEP : INK[400]} strokeWidth={1.9} />}
                      </Pressable>
                    </Tip>
                    {/* İndir butonu — ham dosya (ZIP zip olarak iner) */}
                    <Tip label="İndir">
                      <Pressable
                        onPress={() => forceDownload(f)}
                        disabled={!previewable}
                        hitSlop={6}
                        accessibilityLabel="Dosyayı indir"
                        style={({ pressed, hovered }: any) => ({
                          width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: hovered && previewable ? tint(A, 0.13) : 'transparent', opacity: previewable ? 1 : 0.4,
                          ...press(pressed, 0.9),
                          ...(Platform.OS === 'web' && previewable ? { cursor: 'pointer' } as any : {}),
                        })}
                      >
                        <Download size={13} color={previewable ? A_DEEP : INK[400]} strokeWidth={1.9} />
                      </Pressable>
                    </Tip>
                  </View>
                  );
                })}
                  </View>
                  );
                })
              )}
            </View>

            {/* Hekim notu — dosyaların altında. Triaj kararında önce taramaya
                bakılır, not onu tamamlayan açıklamadır. */}
            {o?.notes ? (
              <View style={{ borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: HAIR, padding: 16, gap: 8 }}>
                <Text style={{ ...TYPE.label, color: INK[400] }}>Hekim Notu</Text>
                <Text style={{ ...TYPE.body, color: INK[800], lineHeight: 19 }}>{o.notes}</Text>
              </View>
            ) : null}
          </View>

          {/* Sağ: pipeline — sol kolonun bir basamak altında kalır (yukarıdaki
              not). Kendi içindeki dropdown/balonlar bu kolonun bağlamında
              sıralanır, ekranda sol kolonla üst üste gelmiyorlar. */}
          <View style={{ flex: 1, minWidth: isNarrow ? 0 : 320, width: isNarrow ? '100%' : undefined, gap: 12, zIndex: 1 }}>
            {/* zIndex yalnız açılır liste AÇIKKEN yükselir. Sabit yüksek kalırsa
                ilk satırdaki aşama kartlarının ipucu balonları bu şeridin
                altında kalıyor (balon yukarı, buraya doğru açılıyor). */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', zIndex: addOpen ? 70 : 1 }}>
            <View style={{ flex: 1, minWidth: 220, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ ...TYPE.title, color: INK[900] }}>Üretim Akışı</Text>
                <Text style={{ ...TYPE.meta, color: INK[400] }}>
                  {laneCount > 1 ? `${laneCount} ${autoT('iş şeridi')}` : `${activeRows.length} ${autoT('aşama')}`} · {autoT('sırayı sürükleyerek değiştir')}
                </Text>
              </View>

              {/* Sessizce plandan ÇIKARILAN istasyonlar söylenir — söylenmezse
                  bu istasyonlar "Aşama Ekle" listesinde gerçekten alakasız
                  olanlarla aynı görünüyor ve çıkarılmaları kaza sanılıyor.
                  (Hangi şablondan kurulduğu bilgisi kaldırıldı: müdür zaten
                  planı gözüyle doğruluyor, satır yer kaplıyordu.) */}
              {autoSkipped.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <Sparkles size={12} color={INK[400]} strokeWidth={2} style={{ marginTop: 2 } as any} />
                  <Text style={{ ...TYPE.meta, color: INK[500], flex: 1, lineHeight: 17 }}>
                    Dijital ölçü geldiği için {autoSkipped.join(' ve ')} plandan çıkarıldı
                  </Text>
                </View>
              )}
            </View>

            {/* Plana girmemiş istasyonlar — TEK buton + açılır liste, başlığın
                yanındaki boşlukta. Eskiden yan yana çip duvarıydı ve akışın en
                altındaydı: istasyon sayısı arttıkça sayfanın en çok yer kaplayan
                bloğu oluyordu, oysa çoğu planda hiç kullanılmıyor. */}
            {/* Başlığın yanındaki araç kümesi: şerit + aşama ekleme.
                İkisi de "akışı kur" işi, aynı yerde durmaları gerekiyor. */}
            {/* nowrap: "Aşama Ekle" eskiden dar panelde width:'100%' alıyordu ve
                şerit butonunu bir alt satıra itiyordu. İkisi tek satırda kalsın;
                yer daralınca esneyen taraf "Aşama Ekle" olur. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, zIndex: 70 }}>
            {((data?.items?.length ?? 0) > 1 || laneCount > 1) && (
              <>
                <Tip label="Farklı işlemleri bağımsız yürüyen ayrı şeritlere böl">
                  <Pressable onPress={addLane}
                    style={({ pressed, hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 7, paddingStart: 12, paddingEnd: 13, paddingVertical: 9, borderRadius: 999,
                      backgroundColor: hovered ? tint(A, 0.12) : '#FFFFFF',
                      borderWidth: 1, borderColor: HAIR,
                      ...press(pressed, 0.98),
                      ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'transform 110ms cubic-bezier(0.2,0,0,1), background-color 140ms ease' } as any : {}),
                    })}>
                    <Plus size={14} color={A_DEEP} strokeWidth={2.2} />
                    <Text style={{ ...TYPE.meta, fontWeight: '600', color: A_DEEP }}>İş Şeridi</Text>
                  </Pressable>
                </Tip>
                {laneCount > 1 && (
                  <Tip label="Şeritleri birleştir, tek sıraya dön">
                    <Pressable onPress={resetToSingleLane} hitSlop={6}
                      style={({ pressed }: any) => ({ paddingHorizontal: 4, paddingVertical: 6, ...press(pressed), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}>
                      <Text style={{ ...TYPE.meta, fontWeight: '600', color: INK[500] }}>Tek şeride dön</Text>
                    </Pressable>
                  </Tip>
                )}
              </>
            )}
            {laneCount === 1 && poolRows.length > 0 && (
              <View style={{ flex: 1, minWidth: 148, maxWidth: 216, zIndex: 70 }}>
                <Tip block label="Plana girmemiş aşamalardan birini akışın sonuna ekle">
                  <Pressable
                    onPress={() => setAddOpen(o => !o)}
                    style={({ pressed, hovered }: any) => ({
                      width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingStart: 12, paddingEnd: 10, paddingVertical: 9, borderRadius: 999,
                      backgroundColor: addOpen || hovered ? tint(A, 0.12) : '#FFFFFF',
                      borderWidth: 1, borderColor: addOpen ? tint(A, 0.35) : HAIR,
                      ...press(pressed, 0.98),
                      ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'transform 110ms cubic-bezier(0.2,0,0,1), background-color 140ms ease, border-color 140ms ease' } as any : {}),
                    })}
                  >
                    <Plus size={14} color={A_DEEP} strokeWidth={2.2} />
                    <Text style={{ ...TYPE.meta, fontWeight: '600', color: A_DEEP, flex: 1 }}>Aşama Ekle</Text>
                    <View style={{ minWidth: 18, height: 17, paddingHorizontal: 5, borderRadius: 9, backgroundColor: tint(A, 0.16), alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: A_DEEP }}>{poolRows.length}</Text>
                    </View>
                    <Caret size={13} color={INK[400]} strokeWidth={2} style={{ transform: [{ rotate: addOpen ? '180deg' : '0deg' }] } as any} />
                  </Pressable>
                </Tip>

                {addOpen && (
                  <View style={{
                    position: 'absolute', top: '100%', end: 0, minWidth: 244, marginTop: 6, zIndex: 80,
                    borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: HAIR, padding: 6,
                    ...(Platform.OS === 'web' ? { boxShadow: '0 16px 40px rgba(15,23,42,0.14)' } as any : {}),
                  }}>
                    <ScrollView style={{ maxHeight: 264 }} showsVerticalScrollIndicator={false}>
                      {poolRows.map(r => {
                        const st = stationById.get(r.stationId);
                        if (!st) return null;
                        return (
                          <Pressable
                            key={r.stationId}
                            onPress={() => { setActive(r.stationId, true); setAddOpen(false); }}
                            style={({ pressed, hovered }: any) => ({
                              flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12,
                              backgroundColor: hovered ? 'rgba(0,0,0,0.035)' : 'transparent',
                              ...press(pressed, 0.99),
                              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                            })}
                          >
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: st.color }} />
                            <Text style={{ ...TYPE.body, fontWeight: '600', color: INK[800], flex: 1 }} numberOfLines={1}>{st.name}</Text>
                            {st.est_duration_min != null && st.est_duration_min > 0 && (
                              <Text style={{ fontSize: 10.5, fontWeight: '600', color: INK[400] }}>{fmtDuration(st.est_duration_min)}</Text>
                            )}
                            <Plus size={13} color={INK[400]} strokeWidth={2} />
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}
            </View>
            </View>

            {/* Çok-şeritteyken işlem→şerit atamasının nasıl yapıldığını söyler */}
            {laneCount > 1 && (
              <Text style={{ ...TYPE.meta, color: INK[400] }}>İşlem çipine dokunup şeridini değiştir</Text>
            )}

            {/* Faz 2: işlem→şerit çipleri (yalnız çok-şerit) */}
            {laneCount > 1 && (data?.items?.length ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {(data?.items ?? []).map(it => (
                  <Tip key={it.id} label="Bu işlemi bir sonraki şeride taşı">
                  <Pressable onPress={() => cycleItemLane(it.id)}
                    style={({ pressed, hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 8, paddingStart: 11, paddingEnd: 6, paddingVertical: 6, borderRadius: 999,
                      backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: hovered ? tint(A, 0.4) : HAIR,
                      ...press(pressed),
                      ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'transform 110ms cubic-bezier(0.2,0,0,1), border-color 140ms ease' } as any : {}),
                    })}>
                    <Text style={{ ...TYPE.meta, fontWeight: '600', color: INK[700] }} numberOfLines={1}>
                      {it.name}{it.tooth_numbers?.length ? ` (${it.tooth_numbers.join(',')})` : ''}
                    </Text>
                    <View style={{ minWidth: 22, height: 20, paddingHorizontal: 6, borderRadius: 999, backgroundColor: tint(A, 0.14), alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: A_DEEP }}>Ş{itemLaneOf(it.id)}</Text>
                    </View>
                  </Pressable>
                  </Tip>
                ))}
              </View>
            )}

            {/* Faz 3: termin değerlendirmesi + süreler.
                Bu ekranda müdürün tek sorusu "bu plan termini tutar mı?" — cevabı
                ilk sütunda, kendi tonuyla duruyor. Eskiden üçüncü sıradaydı ve
                gecikecek bir plan yetişecek olandan ayırt edilemiyordu.
                "8 sa pay" zihinsel hesap istiyor; altına tahmini bitiş yazılıyor. */}
            {(planTiming.anyDuration || planTiming.anySla) && (() => {
              const tones = {
                ok:   { fg: '#1F6B47', dot: '#2D9A6B' },
                warn: { fg: '#9A6710', dot: '#E89B2A' },
                late: { fg: '#9C2E2E', dot: '#D94B4B' },
              } as const;
              const t = slaStatus ? tones[slaStatus.tone] : null;
              const verdict = slaStatus
                ? slaStatus.tone === 'late'
                  ? `Termini ${Math.abs(Math.round(slaStatus.slackH))} sa aşıyor`
                  : `Termine ${Math.round(slaStatus.slackH)} sa pay`
                : null;
              const finishAt = slaStatus ? new Date(slaStatus.estFinish) : null;
              return (
                <View style={{
                  flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, columnGap: 28, alignItems: 'center',
                  paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16,
                  backgroundColor: t ? tint(t.dot, 0.07) : '#FFFFFF',
                  borderWidth: 1, borderColor: t ? tint(t.dot, 0.24) : HAIR,
                }}>
                  {t && verdict && (
                    <View style={{ minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.dot }} />
                        <Text style={{ fontSize: 15, fontWeight: '700', letterSpacing: -0.2, color: t.fg }}>{verdict}</Text>
                      </View>
                      {finishAt && (
                        <Text style={{ ...TYPE.meta, color: t.fg, opacity: 0.75, marginTop: 3 }}>
                          Tahmini bitiş {finishAt.toLocaleString(localeTag(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      )}
                    </View>
                  )}
                  {planTiming.anyDuration && (
                    <View>
                      <Text style={{ ...TYPE.title, color: INK[900] }}>{fmtDuration(planTiming.totalMin)}</Text>
                      <Text style={{ ...TYPE.label, color: INK[400], marginTop: 3 }}>Tahmini Süre</Text>
                    </View>
                  )}
                  {planTiming.anySla && (
                    <View>
                      <Text style={{ ...TYPE.title, color: INK[900] }}>{planTiming.totalSlaH} sa</Text>
                      <Text style={{ ...TYPE.label, color: INK[400], marginTop: 3 }}>Hedef Teslim</Text>
                    </View>
                  )}
                </View>
              );
            })()}

            {error ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, backgroundColor: tint('#D94B4B', 0.07) }}>
                <AlertTriangle size={14} color="#9C2E2E" strokeWidth={2} />
                <Text style={{ ...TYPE.body, color: '#9C2E2E', fontWeight: '600', flex: 1 }}>{error}</Text>
              </View>
            ) : null}

            {/* Tek şerit — akış şeması. Kartlar soldan sağa dizilir, aralarındaki
                bağlaç ilişkiyi söyler: ok = sırayla, ‖ = eşzamanlı. */}
            {laneCount === 1 && (() => {
              const entries: FlowEntry[] = activeRows
                .map((r, i) => {
                  const st = stationById.get(r.stationId);
                  if (!st) return null;
                  return {
                    key: r.stationId,
                    st,
                    tech: r.technicianId ? techById.get(r.technicianId) ?? null : null,
                    parallelGroup: activeGroups[i],
                    parallelOn: !!r.parallelWithPrev,
                  };
                })
                .filter(Boolean) as FlowEntry[];
              if (entries.length === 0) return null;
              return (
                <StageFlow
                  entries={entries}
                  accent={A} accentDeep={A_DEEP} reduced={reduced}
                  technicians={data?.technicians ?? []}
                  pickerKey={pickerFor}
                  onTogglePicker={(i) => { const id = entries[i].key; setPickerFor(p => p === id ? null : id); }}
                  onAssign={(i, tid) => assignTech(entries[i].key, tid)}
                  onRemove={(i) => setActive(entries[i].key, false)}
                  onMove={(i, dir) => move(entries[i].key, dir)}
                  onToggleParallel={(i) => toggleParallel(entries[i].key)}
                  dragIndex={dragIndex} overIndex={overIndex}
                  onDragStart={(i) => setDragIndex(i)}
                  onDragEnter={(i) => setOverIndex(i)}
                  onDrop={(i) => { if (dragIndex !== null) reorderActive(dragIndex, i); setDragIndex(null); setOverIndex(null); }}
                  onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
                />
              );
            })()}

            {/* (Plana girmemiş istasyonlar artık başlığın yanındaki "Aşama Ekle"
                açılır listesinde — akışın altındaki çip duvarı kaldırıldı.) */}

            {/* Faz 2: ÇOK-ŞERİT — her işlem grubu kendi ardışık aşama dizisi (bağımsız yürür) */}
            {laneCount > 1 && Array.from({ length: laneCount }, (_, k) => k + 1).map((lane) => {
              const arr = laneStations(lane);
              const inLane = new Set(arr.map(r => r.stationId));
              const addable = (data?.stations ?? []).filter(s => !inLane.has(s.id));
              return (
                <View key={`lane-${lane}`} style={{ gap: 10, borderRadius: 18, borderWidth: 1, borderColor: tint(A, 0.18), backgroundColor: tint(A, 0.028), padding: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ ...TYPE.label, color: A_DEEP }}>İş Şeridi {lane}</Text>
                    <Tip label="Bu şeridi kaldır">
                      <Pressable
                        onPress={() => removeLane(lane)}
                        hitSlop={8}
                        accessibilityLabel="Bu şeridi kaldır"
                        style={({ pressed, hovered }: any) => ({
                          width: 26, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: hovered ? 'rgba(0,0,0,0.05)' : 'transparent',
                          ...press(pressed, 0.9),
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        })}
                      >
                        <X size={14} color={INK[400]} strokeWidth={2} />
                      </Pressable>
                    </Tip>
                  </View>
                  {arr.length === 0 ? (
                    <Text style={{ ...TYPE.meta, color: INK[400] }}>Bu şeride aşağıdan aşama ekleyin.</Text>
                  ) : (() => {
                    const entries: FlowEntry[] = arr
                      .map(r => {
                        const st = stationById.get(r.stationId);
                        if (!st) return null;
                        return {
                          key: r.uid,
                          st,
                          tech: r.technicianId ? techById.get(r.technicianId) ?? null : null,
                          parallelGroup: null,
                          parallelOn: false,
                        };
                      })
                      .filter(Boolean) as FlowEntry[];
                    if (entries.length === 0) return null;
                    return (
                      <StageFlow
                        entries={entries}
                        accent={A} accentDeep={A_DEEP} reduced={reduced}
                        technicians={data?.technicians ?? []}
                        pickerKey={pickerFor}
                        onTogglePicker={(i) => { const uid = entries[i].key; setPickerFor(p => p === uid ? null : uid); }}
                        onAssign={(i, tid) => setLaneRowTech(entries[i].key, tid)}
                        onRemove={(i) => removeLaneRow(entries[i].key)}
                        onMove={(i, dir) => moveLaneRow(entries[i].key, lane, dir)}
                        onToggleParallel={() => {}}
                        dragIndex={dragLane?.lane === lane ? dragLane.index : null}
                        overIndex={overLane?.lane === lane ? overLane.index : null}
                        onDragStart={(i) => setDragLane({ lane, index: i })}
                        onDragEnter={(i) => setOverLane({ lane, index: i })}
                        onDrop={(i) => { if (dragLane && dragLane.lane === lane) reorderLaneRows(lane, dragLane.index, i); setDragLane(null); setOverLane(null); }}
                        onDragEnd={() => { setDragLane(null); setOverLane(null); }}
                      />
                    );
                  })()}
                  {addable.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                      {addable.map(s => (
                        <Tip key={s.id} label={`${s.name} aşamasını bu şeride ekle`}>
                        <Pressable onPress={() => addStationToLane(s.id, lane)}
                          style={({ pressed, hovered }: any) => ({
                            flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999,
                            backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: hovered ? tint(A, 0.4) : HAIR,
                            ...press(pressed),
                            ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'transform 110ms cubic-bezier(0.2,0,0,1), border-color 140ms ease' } as any : {}),
                          })}>
                          <Plus size={12} color={INK[500]} strokeWidth={2} />
                          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: s.color }} />
                          <Text style={{ ...TYPE.meta, fontWeight: '600', color: INK[700] }}>{s.name}</Text>
                        </Pressable>
                        </Tip>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Sticky özet + onay */}
      {(() => {
        // Faz 2: çok-şeritte özet laneRows'tan; tek-şeritte activeRows'tan (aynı şekil).
        const planRows = laneCount > 1 ? laneRows : activeRows;
        const assignedTechs = Array.from(new Set(planRows.map(r => r.technicianId).filter(Boolean) as string[]))
          .map(id => techById.get(id)).filter(Boolean) as TriageTech[];
        const firstStation = planRows[0] ? (stationById.get(planRows[0].stationId)?.name ?? '—') : '—';
        // Planlama (üretime başlatma) yetkisi: yalnız müdür veya admin
        const isPlanner = (profile as any)?.role === 'manager' || (profile as any)?.user_type === 'admin';
        const canStart = !saving && planRows.length > 0 && isPlanner;
        return (
        <View style={{ position: Platform.OS === 'web' ? ('sticky' as any) : 'absolute', left: 0, right: 0, bottom: isNarrow ? (Math.max(insets.bottom, 8) + 70) : 0, paddingHorizontal: PAGE_PADDING, paddingTop: 16, paddingBottom: isNarrow ? 12 : 16 + insets.bottom, backgroundColor: 'transparent' }}>
          {/* Yüzen aksiyon katmanı — Kurye Takip panelinin cam formülü:
              %8 beyaz zemin + derin gölge + üst kenar inset ışığı
              (bkz. CourierTrackingScreen `glassBg` / `glassStrong`).
              Blur oradaki 3px yerine 10px: kurye panelinin altında yumuşak bir
              harita var, burada metinli kartlar geçiyor — 3px'te yazılar okunur
              hâlde sızıp barın kendi metniyle karışıyordu. Saydamlık aynı kaldı.
              Native'de backdrop-blur yok — orada %8 cam haritayı/kartları
              sızdırıp yazıyı okunmaz yaptığı için opak yüzeye düşülür; aynı
              gerekçe saydamlık azaltma tercihinde de geçerli. */}
          <View style={{
            width: '100%', flexDirection: isNarrow ? 'column' : 'row', alignItems: isNarrow ? 'stretch' : 'center', gap: isNarrow ? 12 : 16,
            borderRadius: 22, paddingVertical: 13, paddingHorizontal: 18,
            backgroundColor: (Platform.OS !== 'web' || solidGlass) ? '#FFFFFF' : 'rgba(255,255,255,0.08)',
            ...((Platform.OS !== 'web' || solidGlass) ? {
              borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)',
            } : {}),
            ...(Platform.OS === 'web' ? {
              ...(solidGlass ? {} : {
                backdropFilter: 'blur(10px) saturate(125%)',
                WebkitBackdropFilter: 'blur(10px) saturate(125%)',
              }),
              boxShadow: '0 12px 32px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
            } as any : {}),
          }}>
            {/* Özet — hairline ayraçlı (mobilde sarar) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap', flexShrink: 1 }}>
            <FooterStat icon={<Layers size={13} color={A} strokeWidth={2} />} label={laneCount > 1 ? 'Şerit·Aşama' : 'Aşama'} value={laneCount > 1 ? `${laneCount}·${planRows.length}` : String(planRows.length)} />
            <View style={{ width: 1, height: 30, backgroundColor: 'rgba(0,0,0,0.08)' }} />
            <FooterStat icon={<Play size={12} color={A} strokeWidth={2} />} label="İlk istasyon" value={firstStation} />
            <View style={{ width: 1, height: 30, backgroundColor: 'rgba(0,0,0,0.08)' }} />
            {planTiming.anyDuration && (<>
              <FooterStat icon={<Clock size={12} color={A} strokeWidth={2} />} label="Tahmini süre" value={fmtDuration(planTiming.totalMin)} />
              <View style={{ width: 1, height: 30, backgroundColor: 'rgba(0,0,0,0.08)' }} />
            </>)}
            <FooterStat
              icon={<Clock size={12} color={o?.is_urgent ? '#9A6710' : A_DEEP} strokeWidth={2} />}
              label="Teslim"
              value={o?.delivery_date ? new Date(o.delivery_date).toLocaleDateString(localeTag()) : '—'}
              warn={o?.is_urgent}
            />

            {/* Atanan ekip — avatar yığını */}
            {assignedTechs.length > 0 && (
              <>
                <View style={{ width: 1, height: 30, backgroundColor: 'rgba(0,0,0,0.08)' }} />
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {assignedTechs.slice(0, 4).map((t, i) => (
                      <View key={t.id} style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: mixWhite(A, 0.18), borderWidth: 1.5, borderColor: '#FFFFFF', marginStart: i === 0 ? 0 : -8 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: A_DEEP }}>{initials(t.full_name)}</Text>
                      </View>
                    ))}
                    {assignedTechs.length > 4 && (
                      <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEEFF1', borderWidth: 1.5, borderColor: '#FFFFFF', marginStart: -8 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: INK[500] }}>+{assignedTechs.length - 4}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 9.5, fontWeight: '600', color: INK[500], letterSpacing: 0.9, textTransform: 'uppercase' }}>Ekip</Text>
                </View>
              </>
            )}
            </View>{/* /stats */}

            {!isNarrow && <View style={{ flex: 1 }} />}

            {!isPlanner && (
              <Text style={{ fontSize: 11, color: '#9A6710', maxWidth: 220, ...(isNarrow ? { width: '100%' } : {}) }}>
                Üretime başlatmak için yönetici (müdür) veya admin yetkisi gerekir.
              </Text>
            )}

            {/* Aksiyonlar — mobilde tam genişlik sarar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, ...(isNarrow ? { width: '100%', flexWrap: 'wrap' } : {}) }}>
            {/* Üç buton, tek ritim: aynı yükseklik (38), hap form, aynı ikon-metin
                aralığı. Ağırlık farkı yüzeyle anlatılır — buzlu / tonlu / dolu —
                köşe ve boyut oynatarak değil. */}
            <Tip label="Bu aşama sırasını yeniden kullanılabilir şablon olarak kaydet">
              <Pressable
                disabled={activeRows.length === 0}
                onPress={openSaveTemplate}
                style={({ pressed, hovered }: any) => ({
                  height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                  paddingHorizontal: 16, borderRadius: 999,
                  backgroundColor: hovered ? '#F1F2F4' : '#FFFFFF',   // OPAK — cam yalnız barda
                  borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)',
                  opacity: activeRows.length === 0 ? 0.4 : 1,
                  ...press(pressed),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'transform 110ms cubic-bezier(0.2,0,0,1), background-color 160ms ease' } as any : {}),
                })}
              >
                <Save size={14} color={INK[500]} strokeWidth={1.9} />
                <Text style={{ fontSize: 13, fontWeight: '600', letterSpacing: -0.1, color: INK[700] }}>Şablon Kaydet</Text>
              </Pressable>
            </Tip>
            {/* Faz 5c: şablon eşleştiyse tek tıkla uygula + onayla */}
            {matchedTpl && (
              <Tip label="Şablondaki planı olduğu gibi uygula ve üretimi başlat">
                <Pressable
                  disabled={!canStart}
                  onPress={() => confirmAndSave({ approve: true })}
                  style={({ pressed, hovered }: any) => ({
                    height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                    paddingHorizontal: 16, borderRadius: 999,
                    backgroundColor: mixWhite(A, hovered ? 0.22 : 0.14),   // OPAK açık accent
                    opacity: !canStart ? 0.4 : 1,
                    ...press(pressed),
                    ...(Platform.OS === 'web' ? { cursor: canStart ? 'pointer' : 'default', transition: 'transform 110ms cubic-bezier(0.2,0,0,1), background-color 160ms ease' } as any : {}),
                  })}
                >
                  <Sparkles size={14} color={A_DEEP} strokeWidth={2} />
                  <Text style={{ fontSize: 13, fontWeight: '600', letterSpacing: -0.1, color: A_DEEP }}>Tek Tıkla Uygula</Text>
                </Pressable>
              </Tip>
            )}
            <Tip
              grow={isNarrow}
              label={unassignedCount > 0
                ? `${unassignedCount} ${autoT('aşama atanmamış — planı kaydeder, ilk aşamayı aktif eder')}`
                : 'Planı kaydeder ve ilk aşamayı üretime açar'}
            >
              <Pressable
                disabled={!canStart}
                onPress={() => confirmAndSave()}
                style={({ pressed, hovered }: any) => ({
                  height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  paddingHorizontal: 20, borderRadius: 999,
                  backgroundColor: hovered && canStart ? A_DEEP : A,
                  opacity: !canStart ? 0.5 : 1,
                  ...(isNarrow ? { flexGrow: 1, width: '100%' as any } : {}),
                  ...press(pressed, 0.98),
                  ...(Platform.OS === 'web' ? {
                    cursor: canStart ? 'pointer' : 'default',
                    boxShadow: hovered && canStart ? `0 8px 20px ${tint(A, 0.42)}` : `0 3px 10px ${tint(A, 0.26)}`,
                    transition: 'transform 110ms cubic-bezier(0.2,0,0,1), box-shadow 180ms ease, background-color 160ms ease',
                  } as any : {}),
                })}
              >
                <Play size={14} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF', letterSpacing: -0.1 }}>{saving ? 'Kaydediliyor…' : 'Onayla & Üretime Başlat'}</Text>
              </Pressable>
            </Tip>
            </View>{/* /actions */}
          </View>
        </View>
        );
      })()}

      {/* Şablon kaydet modalı */}
      <Modal visible={tplOpen} transparent animationType="fade" onRequestClose={() => setTplOpen(false)}>
        <Pressable onPress={() => setTplOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 440, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20, gap: 14 }}>
            <View style={{ gap: 3 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: INK[900] }}>Şablon olarak kaydet</Text>
              <Text style={{ fontSize: 12.5, color: INK[500] }}>Bu plandaki {activeRows.length} aşamalık akış yeniden kullanılabilir şablon olur.</Text>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: INK[700] }}>Şablon adı</Text>
              <TextInput value={tplName} onChangeText={setTplName} placeholder="ör. Zirkonyum Köprü" placeholderTextColor={INK[400]}
                style={{ fontSize: 14, color: INK[900], backgroundColor: PAGE, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' } as any} />
              {o?.work_type ? <Text style={{ fontSize: 11, color: INK[400] }}>Vaka tipi: {o.work_type} (otomatik eşleşme için)</Text> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
              <Pressable onPress={() => setTplOpen(false)} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: INK[500] }}>Vazgeç</Text>
              </Pressable>
              <Pressable onPress={handleSaveTemplate} disabled={tplSaving || !tplName.trim()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: tplDone ? '#2D9A6B' : A, opacity: (tplSaving || !tplName.trim()) ? 0.5 : 1 }}>
                {tplDone ? <Check size={15} color="#FFF" strokeWidth={2.5} /> : <Save size={15} color={theme.accent} strokeWidth={2.1} />}
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: tplDone ? '#FFF' : theme.accent }}>{tplDone ? 'Kaydedildi' : tplSaving ? 'Kaydediliyor…' : 'Kaydet'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 3D Viewer — tekil dosya önizleme (STL/PLY/OBJ) */}
      {viewer3DFile && Platform.OS === 'web' && (
        <React.Suspense fallback={null}>
          <Viewer3DModal
            visible={!!viewer3DFile}
            files={[viewer3DFile]}
            referenceImages={referenceImages}
            title={viewer3DFile.name}
            onClose={() => setViewer3DFile(null)}
          />
        </React.Suspense>
      )}

      {/* 3D Viewer — tümünü katmanlı (tek sahnede üst üste + 2D referans overlay).
          Zip'ten geldiyse referans görseller zip içindekiler olur. */}
      {viewerAll && Platform.OS === 'web' && (
        <React.Suspense fallback={null}>
          <Viewer3DModal
            visible={!!viewerAll}
            files={viewerAll}
            referenceImages={zipImages ?? referenceImages}
            title={`${viewerAll.length} dosya birlikte`}
            sourceDownload={zipSource ?? undefined}
            onClose={() => { setViewerAll(null); setZipImages(null); setZipSource(null); revokeZipUrls(); }}
          />
        </React.Suspense>
      )}

      {/* Görsel önizleme — uygulama-içi lightbox (zoom + ileri/geri + safe-area).
          Zip içi görseller varsa onlar arasında gezilir. */}
      {imageViewer && Platform.OS === 'web' && (() => {
        const src = (zipImages ?? referenceImages) as { url: string; name: string }[];
        const lbImages = src.length
          ? src.map(r => (r.name === imageViewer.name ? { url: imageViewer.url, name: r.name } : { url: r.url, name: r.name }))
          : [imageViewer];
        let lbIndex = lbImages.findIndex(im => im.name === imageViewer.name);
        if (lbIndex < 0) { lbImages.unshift(imageViewer); lbIndex = 0; }
        const close = () => { setImageViewer(null); if (zipImages) { setZipImages(null); revokeZipUrls(); } };
        return (
          <Modal visible transparent animationType="fade" onRequestClose={close}>
            <ImageLightbox
              images={lbImages}
              index={lbIndex}
              topInset={insets.top}
              onClose={close}
              onIndexChange={(i) => setImageViewer({ url: lbImages[i].url, name: lbImages[i].name })}
            />
          </Modal>
        );
      })()}

      {/* HTML tasarım önizleme — uygulama-içi iframe */}
      {htmlViewer && Platform.OS === 'web' && (
        <Modal visible transparent animationType="fade" onRequestClose={closeHtmlViewer}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingTop: Math.max(16, insets.top + 8), paddingBottom: Math.max(16, insets.bottom) }}>
            <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#0A0A0A' }} numberOfLines={1}>{htmlViewer.name}</Text>
                <Pressable onPress={() => window.open(htmlViewer.url, '_blank')} hitSlop={8} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F1F5F9' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155' }}>Yeni sekmede aç</Text>
                </Pressable>
                <Pressable onPress={closeHtmlViewer} hitSlop={10} style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18, lineHeight: 18, color: '#334155' }}>×</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1 }}>
                {React.createElement('iframe', { src: htmlViewer.url, style: { flex: 1, width: '100%', height: '100%', border: 0, backgroundColor: '#FFFFFF' }, title: htmlViewer.name })}
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Sipariş yazışması modal'ı — sorun olursa hekim/klinikle mesajlaş */}
      <Modal visible={chatOpen} transparent animationType="fade" onRequestClose={() => setChatOpen(false)}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,14,26,0.52)', paddingTop: insets.top, ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' } as any) : {}) }}>
          <View style={{ width: '94%', maxWidth: 720, height: '88%', maxHeight: 880, backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden' }}>
            <ChatDetail
              selectedOrder={{
                work_order_id: orderId,
                order_number: o?.order_number,
                patient_name: o?.patient_name,
                work_type: o?.work_type,
                status: (o as any)?.status,
                tooth_numbers: (o as any)?.tooth_numbers,
                shade: o?.shade,
                delivery_date: o?.delivery_date,
                is_urgent: o?.is_urgent,
                doctor: (o as any)?.doctor,
              }}
              accentColor={A}
              currentUserId={profile?.id ?? null}
              viewerType={(profile as any)?.user_type ?? null}
              onBack={() => setChatOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/**
 * Cam yüzey üstünde okunabilirlik (vibrancy): blur'lu zeminde metin kontrastı
 * düşer. Değer önce ve ağır, etiket altında hafif geniş tracking ile yazılır.
 */
function FooterStat({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: string; warn?: boolean }) {
  return (
    <View style={{ gap: 4, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', color: warn ? '#9A6710' : INK[900], fontFamily: DISPLAY, letterSpacing: -0.3 }}>{value}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {icon}
        <Text style={{ fontSize: 9.5, fontWeight: '600', color: INK[500], letterSpacing: 0.9, textTransform: 'uppercase' }}>{label}</Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Akış şeması — aşamalar kart, aralarındaki ilişki bağlaç
// ═══════════════════════════════════════════════════════════════════════════

/** Bir aşamanın akıştaki hâli. Sıra, dizideki konumdur. */
export type FlowEntry = {
  key: string;
  st: TriageStation;
  tech: TriageTech | null;
  parallelGroup: number | null;
  /** önceki aşamayla EŞZAMANLI yürür → aradaki bağlaç ok değil, paralel işareti */
  parallelOn: boolean;
};

const CARD_MIN = 176;   // bir aşama kartının hedef genişliği
const CARD_H   = 148;   // SABİT yükseklik — bütün kartlar birebir aynı boyda
const LINK_W   = 54;    // iki kart arasındaki bağlantı boşluğu
const ROW_GAP  = 48;    // satırlar arası boşluk (U dönüşü buraya iner)
const TURN_PAD = 32;    // ızgaranın iki yanında dönüş kavisine ayrılan koridor
const TURN_R   = 22;    // U dönüşünün köşe yarıçapı
const LINE_W   = 3;     // akış çizgisi kalınlığı — bağlantı grafiğin kahramanı
const NODE     = 42;    // numara diski (çizginin üzerine oturur)

/**
 * Bağlantı — iki kartı gerçekten BİRBİRİNE BAĞLAR: çizgi bir kartın kenarından
 * çıkıp diğerinin kenarına girer, havada durmaz. Ucundaki chevron akış yönünü
 * söyler.
 *
 * Eşzamanlı aşamalarda ok yerine çift çizgi (=) çizilir: "ikisi aynı anda"
 * demenin ayrı bir rozet gerektirmeyen hâli.
 */
function FlowLink({ kind, vertical, rtl, color }: {
  kind: 'next' | 'parallel'; vertical: boolean; rtl?: boolean;
  /** çizginin rengi — GİDİLEN aşamanın istasyon rengi (referanstaki gibi
   *  çizgi bir sonraki diskin rengini taşır) */
  color: string;
}) {
  const parallel = kind === 'parallel';
  const soft = tint(color, 0.45);

  if (vertical) {
    return (
      <View style={{ height: 34, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
        {parallel ? (
          <View style={{ flexDirection: 'row', gap: 5, height: '100%' }}>
            <View style={{ width: LINE_W, height: '100%', borderRadius: 2, backgroundColor: soft }} />
            <View style={{ width: LINE_W, height: '100%', borderRadius: 2, backgroundColor: soft }} />
          </View>
        ) : (
          <View style={{ position: 'absolute', top: 0, bottom: 0, width: LINE_W, borderRadius: 2, backgroundColor: soft }} />
        )}
      </View>
    );
  }

  return (
    <View style={{ width: LINK_W, alignItems: 'center', justifyContent: 'center' }}>
      {parallel ? (
        // çift çizgi = eşzamanlı yürür
        <View style={{ gap: 5, width: '100%' }}>
          <View style={{ height: LINE_W, borderRadius: 2, backgroundColor: soft }} />
          <View style={{ height: LINE_W, borderRadius: 2, backgroundColor: soft }} />
        </View>
      ) : (
        // çizgi kartın kenarından kenarına — boşluğu tam kapatır
        <View style={{ position: 'absolute', left: 0, right: 0, height: LINE_W, borderRadius: 2, backgroundColor: soft }} />
      )}
    </View>
  );
}

/**
 * Satır sonu U dönüşü — çizgi son kartın yan kenarından çıkar, dışarıda yumuşak
 * bir kavisle aşağı iner ve alt satırdaki kartın yan kenarına girer. Yılan
 * (snake) akışın kendisi: göz satır başına geri sıçramaz, çizgiyi takip eder.
 *
 * Üç kenarlı bir kutu olarak çizilir (üst · dış · alt) — köşe yarıçapı kavisi
 * verir. `left` = dönüş kartın sol tarafından yapılıyor (sağdan-sola giden
 * satırın sonu).
 */
/**
 * DİKKAT — buradaki `left` DİL yönü değil, yılankavi satırın yönü.
 * Konum/kenar/kavis üçü de MANTIKSAL (start/end) tutulur: satırlar zaten
 * `flexDirection: row | row-reverse` ile aynalandığı ve CSS'te `row` dil
 * yönüne duyarlı olduğu için, bağlaç da aynı eksende dönmelidir. Üçünden
 * birini fiziksel bırakmak RTL'de kavisi ters tarafta bırakır.
 */
function TurnLoop({ left, color }: { left: boolean; color: string }) {
  const soft = tint(color, 0.45);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: CARD_H / 2 - LINE_W / 2,
        height: CARD_H + ROW_GAP,   // bu kartın ortasından alt kartın ortasına
        width: TURN_PAD,
        borderTopWidth: LINE_W, borderBottomWidth: LINE_W, borderColor: soft,
        // `left` = SERPANTİN yönü (tek/çift satır), dil değil. Satırın GÖRSEL
        // sonu iki şeyin bileşimi: serpantin yönü XOR dil yönü. Mantıksal
        // start/end burada işe yaramıyor (bu uygulamada yön duyarlı çözülmüyor),
        // o yüzden tarafı açıkça hesaplayıp FİZİKSEL yazıyoruz — konum, kenar
        // ve kavis üçü birlikte.
        ...((left !== isRTL())
          ? { left: -TURN_PAD, borderLeftWidth: LINE_W, borderTopLeftRadius: TURN_R, borderBottomLeftRadius: TURN_R }
          : { right: -TURN_PAD, borderRightWidth: LINE_W, borderTopRightRadius: TURN_R, borderBottomRightRadius: TURN_R }),
      }}
    />
  );
}

/**
 * Üretim akışı — kartlar sıra sıra dizilir, aralarında bağlaç.
 *
 * Sarma (wrap) tarayıcıya BIRAKILMAZ: sütun sayısı ölçülen genişlikten
 * hesaplanır ve satırlar elle parçalanır. Böylece "bu kart satır sonunda mı"
 * sorusunun cevabı kesindir — bağlaç asla yanlış yere düşmez, satır sonunda
 * dönüş işareti (↵) çıkar.
 */
function StageFlow({
  entries, accent, accentDeep, technicians, reduced, pickerKey,
  onTogglePicker, onAssign, onRemove, onMove, onToggleParallel,
  dragIndex, overIndex, onDragStart, onDragEnter, onDrop, onDragEnd,
}: {
  entries: FlowEntry[];
  accent: string; accentDeep: string; technicians: TriageTech[]; reduced?: boolean;
  pickerKey: string | null;
  onTogglePicker: (i: number) => void;
  onAssign: (i: number, techId: string | null) => void;
  onRemove: (i: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onToggleParallel: (i: number) => void;
  dragIndex: number | null; overIndex: number | null;
  onDragStart: (i: number) => void; onDragEnter: (i: number) => void; onDrop: (i: number) => void; onDragEnd: () => void;
}) {
  const [boxW, setBoxW] = useState(0);
  const { width: winW } = useWindowDimensions();

  // Dar ekran → dikey akış (yukarıdan aşağı okunur, ok da aşağı bakar).
  const vertical = winW < 720 || (boxW > 0 && boxW < CARD_MIN * 2 + LINK_W);
  // Satır = cols kart + (cols−1) bağlantı. Her satır aynı geometride olduğu için
  // kartlar satırlar arasında birebir hizalanır. İki yanda U dönüşü için koridor
  // ayrılır, o yüzden kullanılabilir genişlik boxW − 2·TURN_PAD.
  const gridW = Math.max(0, boxW - TURN_PAD * 2);
  const cols = vertical ? 1 : Math.max(1, Math.floor((gridW + LINK_W) / (CARD_MIN + LINK_W)));

  // Satırlara böl — sarma kararı bizde, tarayıcıda değil.
  const rows: FlowEntry[][] = [];
  for (let i = 0; i < entries.length; i += cols) rows.push(entries.slice(i, i + cols));

  // Akış boyunca süreklilik: her aşamanın rengi sırasından türer.
  const colorAt = (i: number) => flowColor(i, entries.length, accent);

  const renderCard = (en: FlowEntry, i: number, rtl = false, turnBelow = false) => (
    <StageCard
      entry={en} idx={i} first={i === 0} last={i === entries.length - 1}
      accent={accent} accentDeep={accentDeep} technicians={technicians} reduced={reduced}
      vertical={vertical} rtl={rtl} turnBelow={turnBelow}
      color={colorAt(i)}
      turnColor={colorAt(i + 1)}
      pickerOpen={pickerKey === en.key}
      onTogglePicker={() => onTogglePicker(i)}
      onAssign={(tid) => onAssign(i, tid)}
      onRemove={() => onRemove(i)}
      onUp={() => onMove(i, -1)}
      onDown={() => onMove(i, 1)}
      onToggleParallel={() => onToggleParallel(i)}
      dragging={dragIndex === i}
      isOver={overIndex === i && dragIndex !== null && dragIndex !== i}
      dropBefore={dragIndex !== null && dragIndex > i}
      onDragStart={() => onDragStart(i)}
      onDragEnter={() => onDragEnter(i)}
      onDrop={() => onDrop(i)}
      onDragEnd={onDragEnd}
    />
  );

  // ── Dikey (dar ekran): kart, ok, kart, ok … ──
  if (vertical) {
    return (
      <View onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}>
        {entries.map((en, i) => (
          <View key={en.key} style={{ zIndex: en.key === pickerKey ? 20 : 1 }}>
            {renderCard(en, i)}
            {i < entries.length - 1 && (
              <FlowLink kind={entries[i + 1].parallelOn ? 'parallel' : 'next'} vertical color={colorAt(i + 1)} />
            )}
          </View>
        ))}
      </View>
    );
  }

  // ── Yatay ızgara: yılan (bustrofedon) akış ──
  // Çift satırlar soldan sağa, tek satırlar sağdan sola. Satır sonunda çizgi
  // dışarıdan U yapıp alt satıra iner — göz satır başına geri sıçramaz.
  return (
    // zIndex 2: kart ipucu balonları, üstteki araç şeridinin (zIndex 1) üstünde kalsın
    <View onLayout={(e) => setBoxW(e.nativeEvent.layout.width)} style={{ paddingHorizontal: TURN_PAD, zIndex: 2 }}>
      {rows.map((row, r) => {
        const rowHasPicker = row.some(en => en.key === pickerKey);
        const rtl = r % 2 === 1;
        return (
          <View
            key={`row-${r}`}
            style={{
              flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'stretch',
              marginBottom: r < rows.length - 1 ? ROW_GAP : 0,
              // seçici açık olan satır üstte kalsın (popover alttaki satırın altında kalmasın)
              zIndex: rowHasPicker ? 20 : 1,
            }}
          >
            {Array.from({ length: cols }, (_, j) => {
              const i = r * cols + j;
              const en = row[j];
              const isRowLastCard = j === row.length - 1;
              const next = entries[i + 1];
              return (
                <React.Fragment key={en ? en.key : `slot-${j}`}>
                  {en
                    ? renderCard(en, i, rtl, isRowLastCard && !!next)
                    : <View style={{ flex: 1, minWidth: 0 }} />}
                  {/* Kartlar arası bağlantı — son sütundan sonra yok; satır sonu
                      dönüşü kartın ALTINA çizilir (bkz. TurnDown). */}
                  {j < cols - 1 && (
                    en && row[j + 1]
                      ? <FlowLink kind={row[j + 1].parallelOn ? 'parallel' : 'next'} vertical={false} rtl={rtl} color={colorAt(i + 1)} />
                      : <View style={{ width: LINK_W }} />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Tek aşama kartı.
 *
 * İçerik sırası "ne yapılacak → kim yapacak": üstte numara + istasyon adı,
 * altta atanan teknisyen. Aksiyonlar (paralel / plandan çıkar) silinmez ama
 * geri çekilir — imleç karta gelmeden %35 opaklıkta durur, gelince tam
 * kontrasta çıkar. Klavye erişimi bozulmasın diye hiç gizlenmez.
 */
function StageCard({
  entry, idx, first, last, accent, accentDeep, technicians, reduced, vertical, rtl, turnBelow, turnColor, color,
  pickerOpen, onTogglePicker, onAssign, onRemove, onUp, onDown, onToggleParallel,
  dragging, isOver, dropBefore, onDragStart, onDragEnter, onDrop, onDragEnd,
}: {
  entry: FlowEntry; idx: number; first: boolean; last: boolean;
  accent: string; accentDeep: string; technicians: TriageTech[]; reduced?: boolean;
  vertical: boolean; rtl?: boolean; turnBelow?: boolean; turnColor?: string;
  /** akış rampasındaki rengi — istasyonun kendi rengi DEĞİL (bkz. flowColor) */
  color: string;
  pickerOpen: boolean; onTogglePicker: () => void; onAssign: (id: string | null) => void;
  onRemove: () => void; onUp: () => void; onDown: () => void; onToggleParallel: () => void;
  dragging?: boolean; isOver?: boolean; dropBefore?: boolean;
  onDragStart: () => void; onDragEnter: () => void; onDrop: () => void; onDragEnd: () => void;
}) {
  const { st, tech, parallelGroup, parallelOn } = entry;
  const isWeb = Platform.OS === 'web';
  const [hover, setHover] = useState(false);
  const anim = (props: string) => (isWeb && !reduced ? { transition: props } as any : {});
  const lit = !isWeb || hover || pickerOpen;

  const iconBtn = (key: string, active: boolean, label: string, onPress: () => void, icon: React.ReactNode) => (
    <Tip key={key} label={label}>
      <Pressable
        onPress={onPress} accessibilityLabel={label} hitSlop={4}
        style={({ pressed, hovered }: any) => ({
          width: 24, height: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
          backgroundColor: active ? tint(accent, 0.16) : hovered ? 'rgba(0,0,0,0.06)' : 'transparent',
          opacity: lit || active ? 1 : 0.3,
          ...press(pressed, 0.88),
          ...anim('transform 110ms cubic-bezier(0.2,0,0,1), opacity 160ms ease, background-color 140ms ease'),
          ...(isWeb ? { cursor: 'pointer' } as any : {}),
        })}
      >
        {icon}
      </Pressable>
    </Tip>
  );

  const cap = tech?.capacity && tech.capacity > 0 ? tech.capacity : 6;

  // Atanmamış aşamanın İKİ ayrı sebebi var ve ikisi çok farklı şeyler:
  //  · bu istasyona yetkin hiç kimse yok  → yapılacak bir şey yok, uyarı
  //  · yetkin var ama atanmadı            → müdür dokunup seçebilir
  // Eskiden ikisi de "Otomatik atanacak · en uygun teknisyen" diyordu; bu cümle
  // "sistem halleder" izlenimi veriyor, oysa aşama atanmamış üretime giriyor.
  const qualifiedExists = technicians.some(t => t.role !== 'courier' && t.is_active !== false && isQualified(st, t));
  const unassignedTone = qualifiedExists ? '#9A6710' : '#9C2E2E';

  const body = (
    <View style={{
      // yatay ızgarada slotu doldurur, dikey akışta tam genişlik olur.
      // Yükseklik SABİT: bütün kartlar birebir aynı boyda görünsün.
      ...(vertical ? { width: '100%' as const } : { flex: 1, height: CARD_H }),
      minWidth: 0,
      // İmleç kartın üstündeyken kart, satırdaki komşularının ÜSTÜNE çıkar:
      // aksi hâlde ipucu balonu DOM'da sonra gelen kartın altında kalıyor.
      zIndex: hover || pickerOpen ? 30 : 0,
      borderRadius: 18, backgroundColor: '#FFFFFF',
      borderWidth: 1, borderColor: hover && !dragging ? 'rgba(0,0,0,0.13)' : HAIR,
      opacity: dragging ? 0.3 : 1,
      // Sürüklenmiyorken transform YOK: sabit bir scale(1) bile CSS'te
      // "containing block" yaratıp içindeki fixed konumlu ipucu balonunu
      // karta hapsediyor.
      ...(dragging ? { transform: [{ scale: 0.97 }] } : null),
      ...(isWeb ? { boxShadow: hover && !dragging ? '0 6px 20px rgba(0,0,0,0.07)' : '0 1px 2px rgba(0,0,0,0.03)' } as any : {}),
      ...anim('opacity 160ms ease, transform 180ms cubic-bezier(0.2,0,0,1), border-color 140ms ease, box-shadow 180ms ease'),
    }}>
      {/* Satır sonu U dönüşü — bu kart satırın sonuysa ve akış devam ediyorsa */}
      {!vertical && turnBelow && <TurnLoop left={!!rtl} color={turnColor ?? accent} />}

      {/* Numara diski — akış çizgisinin ÜZERİNE oturur ve kartın kenarına yarı
          biner (referans "snake timeline" dili). İstasyonun kendi rengini taşır,
          böylece çizgi hangi renkse hangi diske gittiği baştan bellidir. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', width: NODE, height: NODE, borderRadius: NODE / 2,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: color,
          borderWidth: 3, borderColor: '#FFFFFF',
          ...(isWeb ? { boxShadow: `0 2px 8px ${tint(color, 0.35)}` } as any : {}),
          ...(vertical
            ? { top: -NODE / 2, start: 16 }
            : rtl
              ? { end: -NODE / 2, top: CARD_H / 2 - NODE / 2 }
              : { start: -NODE / 2, top: CARD_H / 2 - NODE / 2 }),
        }}
      >
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#FFFFFF', fontFamily: DISPLAY, letterSpacing: -0.3 }}>{idx + 1}</Text>
      </View>

      {/* Bırakma göstergesi — kart nereye oturacak. Sürükleme yönünü izler;
          sağdan-sola giden satırda "önce" sağ taraftır, gösterge de oraya gider. */}
      {isOver && (() => {
        const before = !!dropBefore;
        const side = vertical
          ? (before ? { top: -8 } : { bottom: -8 })
          : ((before !== !!rtl) !== isRTL() ? { left: -8 } : { right: -8 });
        return (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', borderRadius: 2, backgroundColor: accent,
              ...(vertical ? { left: 0, right: 0, height: 3 } : { top: 0, bottom: 0, width: 3 }),
              ...side,
            }}
          />
        );
      })()}

      <View style={{
        // Numara diski kartın kenarına biniyor → o taraftan ekstra pay bırak.
        paddingTop: vertical ? 28 : 12, paddingBottom: 12,
        paddingLeft: vertical ? 13 : rtl ? 13 : 27,
        paddingRight: vertical ? 13 : rtl ? 27 : 13,
        gap: 8, flex: 1,
      }}>
        {/* Başlık bloğu — ortalanmış, kalan alanın dikey ortasında.
            Araçlar akıştan çıkıp köşeye sabitlendiği için başlık kartın
            genişliğini tam kullanabiliyor ve sola yaslı durmuyor. */}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 4, paddingTop: 14 }}>
          <Text
            style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.15, lineHeight: 18, color: INK[900], textAlign: 'center' }}
            numberOfLines={2}
          >
            {st.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', columnGap: 8, rowGap: 2 }}>
            {/* Aşama süresi — "hangisini çıkarayım / hangi ikisini paralel
                yürüteyim" kararını veren sayı. Toplamı zaten hesaplanıyordu ama
                kartta görünmüyordu, karar kör veriliyordu. */}
            {st.est_duration_min != null && st.est_duration_min > 0 && (
              <Text style={{ fontSize: 10.5, fontWeight: '600', color: INK[500] }}>{fmtDuration(st.est_duration_min)}</Text>
            )}
            {first && <Text style={{ fontSize: 10.5, color: INK[400] }}>ilk aşama</Text>}
            {st.is_critical && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#D94B4B' }} />
                <Text style={{ fontSize: 10.5, fontWeight: '600', color: '#9C2E2E' }}>Kritik</Text>
              </View>
            )}
            {parallelGroup != null && (
              <Text style={{ fontSize: 10.5, fontWeight: '600', color: accentDeep }}>eşzamanlı G{parallelGroup}</Text>
            )}
          </View>
        </View>

        {/* Tutamaç + aksiyonlar — üst köşede sabit. Diskin bulunduğu kenarın
            KARŞI köşesine konur ki ikisi aynı tarafta sıkışmasın. */}
        <View
          style={{
            position: 'absolute', top: 9, zIndex: 3,
            ...((!!rtl !== isRTL()) && !vertical ? { left: 9 } : { right: 9 }),
            flexDirection: 'row', alignItems: 'center', gap: 0,
          }}
        >
            {isWeb ? (
              <Tip label="Sürükleyerek sıraya taşı">
                {React.createElement('div', {
                  draggable: true,
                  onDragStart: (e: any) => { try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)); } catch {} onDragStart(); },
                  onDragEnd: () => onDragEnd(),
                  style: {
                    cursor: dragging ? 'grabbing' : 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, height: 22, touchAction: 'none',
                    opacity: lit ? 0.7 : 0.22, transition: reduced ? undefined : 'opacity 160ms ease',
                  },
                }, <GripVertical size={14} color={INK[500]} strokeWidth={2} />)}
              </Tip>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Pressable onPress={onUp} disabled={first} hitSlop={6} style={({ pressed }: any) => ({ width: 22, height: 24, alignItems: 'center', justifyContent: 'center', opacity: first ? 0.2 : 1, ...press(pressed, 0.85) })}>
                  <ChevronUp size={14} color={INK[400]} strokeWidth={2} />
                </Pressable>
                <Pressable onPress={onDown} disabled={last} hitSlop={6} style={({ pressed }: any) => ({ width: 22, height: 24, alignItems: 'center', justifyContent: 'center', opacity: last ? 0.2 : 1, ...press(pressed, 0.85) })}>
                  <ChevronDown size={14} color={INK[400]} strokeWidth={2} />
                </Pressable>
              </View>
            )}
            {!first && iconBtn('par', parallelOn, 'Önceki aşamayla eşzamanlı yürüt', onToggleParallel,
              <Layers size={13} color={parallelOn ? accentDeep : INK[400]} strokeWidth={2} />)}
            {iconBtn('rm', false, 'Aşamayı plandan çıkar', onRemove,
              <X size={13} color={INK[400]} strokeWidth={2} />)}
        </View>

        {/* Kim yapacak — kartın tabanına oturur, kartlar aynı ritimde okunur */}
        <Tip block label={tech ? 'Bu aşamanın teknisyenini değiştir' : 'Bu aşamaya teknisyen ata'}>
        <Pressable
          onPress={onTogglePicker}
          style={({ pressed, hovered }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 8, padding: 7, borderRadius: 12,
            backgroundColor: hovered || pickerOpen ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.025)',
            ...press(pressed, 0.985),
            ...anim('transform 110ms cubic-bezier(0.2,0,0,1), background-color 140ms ease'),
            ...(isWeb ? { cursor: 'pointer' } as any : {}),
          })}
        >
          {tech ? (
            <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(color, 0.15) }}>
              <Text style={{ fontSize: 10.5, fontWeight: '700', color: color }}>{initials(tech.full_name)}</Text>
            </View>
          ) : (
            <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(unassignedTone, 0.12) }}>
              <AlertTriangle size={13} color={unassignedTone} strokeWidth={2} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', letterSpacing: -0.05, lineHeight: 15, color: tech ? INK[800] : unassignedTone }} numberOfLines={1}>
              {tech ? tech.full_name : qualifiedExists ? 'Atanmadı' : 'Yetkin teknisyen yok'}
            </Text>
            {tech ? (
              // Yük çubuğu yerine renkli nokta: aynı bilgi (renk = doluluk),
              // yarı yükseklikte. Kart 198→174'e bu satırdan indi.
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: loadColor(tech.load) }} />
                <Text style={{ fontSize: 10, fontWeight: '600', color: loadColor(tech.load) }}>{tech.load} aktif iş</Text>
              </View>
            ) : (
              <Text style={{ fontSize: 10, color: INK[400] }} numberOfLines={1}>
                {qualifiedExists ? 'dokun ve seç' : 'bu istasyona yetki tanımlı değil'}
              </Text>
            )}
          </View>
          <Caret size={13} color={INK[400]} strokeWidth={2} />
        </Pressable>
        </Tip>
      </View>

      {/* Teknisyen seçici — kartın altında yüzen katman. Kart yüksekliğini
          büyütmez, böylece satırdaki diğer kartlar yerinden oynamaz. */}
      {pickerOpen && (
        <View style={{
          position: 'absolute', top: '100%', left: 0, right: 0, minWidth: 232, marginTop: 6, zIndex: 50,
          borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: HAIR, padding: 8,
          ...(isWeb ? { boxShadow: '0 16px 40px rgba(0,0,0,0.14)' } as any : {}),
        }}>
          <ScrollView style={{ maxHeight: 268 }} showsVerticalScrollIndicator={false}>
            <Pressable
              onPress={() => onAssign(null)}
              style={({ pressed, hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 12,
                backgroundColor: hovered ? 'rgba(0,0,0,0.035)' : 'transparent',
                ...press(pressed, 0.99),
                ...(isWeb ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: INK[300] }}>
                <Sparkles size={13} color={INK[400]} strokeWidth={1.8} />
              </View>
              <Text style={{ ...TYPE.body, color: INK[700], fontWeight: '600', flex: 1 }}>Otomatik — en uygun</Text>
              {!tech && <Check size={15} color={accentDeep} strokeWidth={2.5} />}
            </Pressable>
            {[...technicians].sort((a, b) => {
              // Uygun (yetkin) teknisyenler önce, sonra az yüklü
              const qa = isQualified(st, a) ? 0 : 1, qb = isQualified(st, b) ? 0 : 1;
              if (qa !== qb) return qa - qb;
              return a.load - b.load;
            }).map(t => {
              const sel = tech?.id === t.id;
              const qualified = isQualified(st, t);
              const tcap = t.capacity && t.capacity > 0 ? t.capacity : 6;
              return (
                <Pressable key={t.id} onPress={() => onAssign(t.id)}
                  style={({ pressed, hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 12,
                    opacity: qualified ? 1 : 0.5,
                    backgroundColor: sel ? tint(accent, 0.09) : hovered ? 'rgba(0,0,0,0.035)' : 'transparent',
                    ...press(pressed, 0.99),
                    ...anim('background-color 120ms ease, transform 110ms cubic-bezier(0.2,0,0,1)'),
                    ...(isWeb ? { cursor: 'pointer' } as any : {}),
                  })}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(color, 0.15) }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: color }}>{initials(t.full_name)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Text style={{ ...TYPE.body, color: INK[800], fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>{t.full_name}</Text>
                    {st.required_skills.length > 0 && qualified && (
                      <View style={{ paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 999, backgroundColor: tint(accent, 0.14) }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: accentDeep }}>UYGUN</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 34, height: 3, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.09)', overflow: 'hidden' }}>
                      <View style={{ width: `${Math.min(100, (t.load / tcap) * 100)}%`, height: 3, borderRadius: 2, backgroundColor: loadColor(t.load) }} />
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: loadColor(t.load) }}>{t.load}</Text>
                  </View>
                  {sel && <Check size={15} color={accentDeep} strokeWidth={2.5} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );

  // Kartın kendisi bırakma hedefi — sürüklenen kart bunun soluna/sağına oturur.
  if (isWeb) {
    return React.createElement('div', {
      onDragOver: (e: any) => { e.preventDefault(); onDragEnter(); },
      onDrop: (e: any) => { e.preventDefault(); onDrop(); },
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      style: vertical
        ? { display: 'flex', width: '100%', minWidth: 0, position: 'relative' }
        : { display: 'flex', flex: '1 1 0%', minWidth: 0, position: 'relative' },
    }, body);
  }
  return body;
}
