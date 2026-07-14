import { localeTag } from '../../../core/i18n';
// modules/triage/screens/PlanReviewScreen.tsx
// Plan Önizleme & Onay — planlama bekleyen sipariş açılınca ilk bu ekran gelir.
// Gerçek veriyle çalışır; onayda mevcut triage_order RPC'sini çağırır.
// Panel-aware (usePanelTheme) — lab müdür panelinde safran accent.

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, ScrollView, Platform, Modal, TextInput, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';
import {
  ListChecks, GripVertical, X, Plus, AlertTriangle, Sparkles, ChevronUp, ChevronDown,
  Play, FileText, Stethoscope, Cpu, UserCheck, ChevronDown as Caret, Check, ArrowLeft, Layers, Box, MessageSquare, Save, Clock, Eye,
} from 'lucide-react-native';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { DS } from '../../../core/theme/dsTokens';
import { useAuthStore } from '../../../core/store/authStore';
import { ChatDetail } from '../../orders/components/MessagesPopup';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import {
  fetchTriageData, matchTemplate, saveTriagePlan, autoAssignTech, isQualified, createTemplate,
  summarizePlanTiming, fmtDuration, fetchAutoTriage, approveTriagePlan, signWorkOrderFile,
  type TriageStation, type TriageTech, type TriageData, type PlanLine,
} from '../api';
import { getStationKind, type StationKind } from '../../orders/stations/registry';

// Lazy viewer-3d (three.js ayrı chunk) — tek paylaşılan retry'lı lazy instance.
import { Viewer3DModalLazy as Viewer3DModal } from '../../viewer-3d/Viewer3DLazy';
import { unzipToViewer, isArchiveExt } from '../../orders/fileArchive';
// Uygulama-içi görsel önizleme (zoom + ileri/geri + safe-area) — sipariş detayı kalıbı.
import { ImageLightbox } from '../../../core/ui/ImageLightbox';

function is3DFileFmt(path: string): 'stl' | 'ply' | 'obj' | null {
  const ext = (path ?? '').toLowerCase().split('.').pop();
  return ext === 'stl' || ext === 'ply' || ext === 'obj' ? ext : null;
}

function isImagePath(path: string): boolean {
  const ext = (path ?? '').toLowerCase().split('.').pop() ?? '';
  return ['jpg','jpeg','png','gif','webp','bmp','heic','heif','svg','avif'].includes(ext);
}

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
function initials(n: string | null) {
  if (!n) return '?';
  return n.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}
function loadColor(load: number) {
  return load >= 5 ? '#D94B4B' : load >= 3 ? '#E89B2A' : '#2D9A6B';
}

interface Row {
  stationId: string;
  active: boolean;
  technicianId: string | null;
  /** Faz 5: önceki aktif aşamayla eşzamanlı (paralel) yürür */
  parallelWithPrev?: boolean;
}

export function PlanReviewScreen({ orderId }: { orderId: string }) {
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

  const [data, setData] = useState<TriageData | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pickerFor, setPickerFor] = useState<string | null>(null); // teknisyen seçici açık olan stationId
  const [chatOpen, setChatOpen] = useState(false);                   // sipariş yazışması modal'ı
  const [dragIndex, setDragIndex] = useState<number | null>(null);   // sürüklenen aktif satır
  const [overIndex, setOverIndex] = useState<number | null>(null);   // üzerine gelinen satır
  const [tplOpen, setTplOpen] = useState(false);                      // "Şablon kaydet" modalı
  const [tplName, setTplName] = useState('');
  const [tplSaving, setTplSaving] = useState(false);
  const [tplDone, setTplDone] = useState(false);
  const [selProc, setSelProc] = useState<string | null>(null);   // seçili işlem (diş vurgusu)
  const [selTooth, setSelTooth] = useState<number | null>(null); // seçili diş (işlem detayı)
  const [autoTriage, setAutoTriage] = useState(false);           // Faz 5c: oto-triaj ayarı
  const [matchedTpl, setMatchedTpl] = useState(false);           // Faz 5c: şablon güvenle eşleşti mi

  // 3D önizleme — tekil dosya + tümünü katmanlı (OrderDetailScreenV2 kalıbı)
  type ViewerMesh = { id: string; name: string; url: string; format: 'stl'|'ply'|'obj'; textureUrl?: string | null };
  const [viewer3DFile, setViewer3DFile] = useState<ViewerMesh | null>(null);
  const [viewerAll, setViewerAll] = useState<ViewerMesh[] | null>(null);
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
    if (!url) return;
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
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank');
  }, []);

  // Tümünü katmanlı aç — her 3D dosya için taze URL üret, sonra viewer'ı aç.
  const openAllLayered = useCallback(async () => {
    const signed = await Promise.all(all3DFiles.map(async (f) => ({
      id: f.id, name: f.name, format: f.format,
      url: (await signWorkOrderFile(f.storage_path)) ?? f.url,
    })));
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
      initial = initial.map((r) => {
        const st = stationById.get(r.stationId);
        return st && skipKinds.includes(getStationKind(st.name)) ? { ...r, active: false } : r;
      });
    }

    setRows(initial);
    setLoading(false);
  }, [orderId, labId]);

  useEffect(() => { load(); }, [load]);

  const stationById = useMemo(() => new Map((data?.stations ?? []).map(s => [s.id, s])), [data]);
  const techById = useMemo(() => new Map((data?.technicians ?? []).map(t => [t.id, t])), [data]);
  const activeRows = rows.filter(r => r.active);
  const poolRows = rows.filter(r => !r.active);

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

  const handleSave = async (opts?: { approve?: boolean }) => {
    setError('');
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

  // Diş ↔ işlem eşlemesi (work_type pozisyonel olarak tooth_numbers ile hizalı)
  const teeth = o?.tooth_numbers ?? [];
  const wtParts = (o?.work_type ?? '').split(/,\s*/).map(s => s.trim()).filter(Boolean);
  const positional = teeth.length > 0 && wtParts.length === teeth.length;
  const toothProc: Record<number, string> = {};
  const procTeeth: Record<string, number[]> = {};
  if (positional) {
    teeth.forEach((t, i) => { toothProc[t] = wtParts[i]; (procTeeth[wtParts[i]] ??= []).push(t); });
  }
  // Tekrarsız işlem listesi (özet + lejant). Pozisyonel değilse yine de tekrarları at.
  const distinctProcs = Array.from(new Set(wtParts));
  const PROC_PALETTE = [A, '#3B82F6', '#8B5CB8', '#2BA39B', '#E89B2A', '#D94B4B', '#0EA5E9'];
  const procColor = (p: string) => PROC_PALETTE[distinctProcs.indexOf(p) % PROC_PALETTE.length];

  return (
    <View style={{ flex: 1, backgroundColor: PAGE }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20 + insets.top, paddingBottom: (isNarrow ? 300 : 130) + insets.bottom, width: '100%' }}>
        {/* Geri + başlık */}
        <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
          <ArrowLeft size={16} color={INK[500]} strokeWidth={2} />
          <Text style={{ fontSize: 13, color: INK[500], fontWeight: '600' }}>Geri</Text>
        </Pressable>

        {/* Sipariş başlık kartı */}
        <View style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18,
            // @ts-ignore web gradient
            backgroundImage: `linear-gradient(135deg, ${tint(A, 0.16)} 0%, #FFFFFF 70%)` }}>
            <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: A }}>
              <ListChecks size={22} color={theme.accent} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: A_DEEP, letterSpacing: 1, textTransform: 'uppercase' }}>Plan Önizleme</Text>
              <Text style={{ fontSize: 23, color: INK[900], fontFamily: DISPLAY, letterSpacing: -0.6, marginTop: 2 }} numberOfLines={1}>
                #{o?.order_number ?? '—'} · {o?.patient_name ?? 'Hasta'}
              </Text>
              <Text style={{ fontSize: 12.5, color: INK[500], marginTop: 2 }} numberOfLines={1}>
                {distinctProcs.length > 0 ? distinctProcs.join(' · ') : 'Sipariş'}
              </Text>
            </View>
            {o?.is_urgent && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: tint('#D94B4B', 0.10), borderWidth: 1, borderColor: tint('#D94B4B', 0.25) }}>
                <AlertTriangle size={12} color="#9C2E2E" strokeWidth={2} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#9C2E2E' }}>Acil</Text>
              </View>
            )}
            {/* Sipariş yazışması — sorun olursa hekim/klinikle mesajlaş */}
            <Pressable
              onPress={() => setChatOpen(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: tint(A, 0.12), borderWidth: 1, borderColor: tint(A, 0.28), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
            >
              <MessageSquare size={14} color={A_DEEP} strokeWidth={2} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: A_DEEP }}>Mesaj{(data?.messages.length ?? 0) > 0 ? ` · ${data!.messages.length}` : ''}</Text>
            </Pressable>
          </View>

          {/* Detay şeridi — işin künyesi */}
          {(() => {
            const meta: { label: string; value: string }[] = [
              ...(teeth.length ? [{ label: 'Üye', value: `${teeth.length} diş` }] : []),
              ...(o?.shade ? [{ label: 'Renk', value: o.shade }] : []),
              ...(o?.model_type ? [{ label: 'Model', value: o.model_type }] : []),
              ...(o?.machine_type ? [{ label: 'Makine', value: o.machine_type }] : []),
              ...(o?.patient_gender ? [{ label: 'Cinsiyet', value: o.patient_gender }] : []),
              ...(o?.delivery_date ? [{ label: 'Teslim', value: new Date(o.delivery_date).toLocaleDateString(localeTag()) }] : []),
              ...(o?.created_at ? [{ label: 'Oluşturma', value: new Date(o.created_at).toLocaleDateString(localeTag()) }] : []),
            ];
            if (meta.length === 0) return null;
            return (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
                {meta.map(m => (
                  <View key={m.label} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: PAGE, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: INK[400], letterSpacing: 0.6, textTransform: 'uppercase' }}>{m.label}</Text>
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: INK[900], marginTop: 1 }}>{m.value}</Text>
                  </View>
                ))}
              </View>
            );
          })()}

          {/* Diş şeması & işlemler — tıklanabilir */}
          {teeth.length > 0 && (
            <View style={{ paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', gap: 10 }}>
              {/* İşlem lejantı — tıkla → dişleri vurgula */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {distinctProcs.map(p => {
                  const c = procColor(p);
                  const active = selProc === p;
                  const count = procTeeth[p]?.length ?? 0;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => { setSelProc(active ? null : p); setSelTooth(null); }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                        backgroundColor: active ? c : tint(c, 0.12),
                        borderWidth: 1, borderColor: active ? c : tint(c, 0.25),
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      }}
                    >
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: active ? '#FFF' : c }} />
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: active ? '#FFF' : INK[800] }}>{p}</Text>
                      {positional && count > 0 && (
                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: active ? 'rgba(255,255,255,0.85)' : INK[400] }}>{count}</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>

              {/* Diş çipleri — tıkla → işlemi göster */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {teeth.map((t, i) => {
                  const proc = positional ? toothProc[t] : null;
                  const c = proc ? procColor(proc) : INK[400];
                  const dim = selProc != null && proc !== selProc;
                  const sel = selTooth === t;
                  return (
                    <Pressable
                      key={`${t}-${i}`}
                      onPress={() => setSelTooth(sel ? null : t)}
                      style={{
                        width: 34, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: sel ? c : tint(c, 0.12),
                        borderWidth: sel ? 0 : 1, borderColor: tint(c, 0.3),
                        opacity: dim ? 0.3 : 1,
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? '#FFF' : INK[800] }}>{t}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Seçili diş → işlemi */}
              {selTooth != null && positional && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: tint(procColor(toothProc[selTooth]), 0.10) }}>
                  <View style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: procColor(toothProc[selTooth]) }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFF' }}>{selTooth}</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: INK[900] }}>Diş {selTooth} · {toothProc[selTooth]}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={{ flexDirection: isNarrow ? 'column' : 'row', gap: 16, flexWrap: 'wrap' }}>
          {/* Sol referans */}
          <View style={{ width: isNarrow ? '100%' : 240, gap: 12 }}>
            <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 14, gap: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: INK[400], letterSpacing: 1, textTransform: 'uppercase' }}>Hekim & Klinik</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: tint(A, 0.16), alignItems: 'center', justifyContent: 'center' }}>
                  <Stethoscope size={14} color={A_DEEP} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: INK[900] }} numberOfLines={1}>{data?.doctorName ?? '—'}</Text>
                  <Text style={{ fontSize: 11, color: INK[500] }} numberOfLines={1}>{data?.clinicName ?? ''}</Text>
                </View>
              </View>
            </View>
            {o?.notes ? (
              <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 14, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <FileText size={12} color={INK[400]} strokeWidth={1.8} />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: INK[400], letterSpacing: 1, textTransform: 'uppercase' }}>Hekim Notu</Text>
                </View>
                <Text style={{ fontSize: 12.5, color: INK[800], lineHeight: 18 }}>{o.notes}</Text>
              </View>
            ) : null}

            {/* Hekim / klinik mesajları */}
            {(data?.messages.length ?? 0) > 0 && (
              <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 14, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MessageSquare size={12} color={INK[400]} strokeWidth={1.8} />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: INK[400], letterSpacing: 1, textTransform: 'uppercase' }}>Hekim Mesajları</Text>
                  <Text style={{ fontSize: 11, color: INK[400] }}>({data!.messages.length})</Text>
                </View>
                {data!.messages.map((m, i) => (
                  <View key={m.id} style={{ gap: 3, paddingBottom: i < data!.messages.length - 1 ? 10 : 0, borderBottomWidth: i < data!.messages.length - 1 ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.05)' }}>
                    {m.content ? <Text style={{ fontSize: 12.5, color: INK[800], lineHeight: 18 }}>{m.content}</Text> : null}
                    {m.attachment_name ? (
                      <Pressable
                        onPress={() => {
                          if (!m.attachment_url || Platform.OS !== 'web') return;
                          if (isImagePath(m.attachment_name ?? '')) { setImageViewer({ url: m.attachment_url, name: m.attachment_name ?? '' }); return; }
                          window.open(m.attachment_url, '_blank');
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, ...(Platform.OS === 'web' && m.attachment_url ? { cursor: 'pointer' } as any : {}) }}
                      >
                        <FileText size={11} color={m.attachment_url ? A_DEEP : INK[400]} strokeWidth={1.8} />
                        <Text numberOfLines={1} style={{ fontSize: 11, fontStyle: 'italic', color: m.attachment_url ? A_DEEP : INK[500], textDecorationLine: m.attachment_url ? 'underline' : 'none' }}>{m.attachment_name}</Text>
                      </Pressable>
                    ) : null}
                    <Text style={{ fontSize: 10, color: INK[400] }}>{m.sender_name ?? 'Hekim'} · {new Date(m.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Dosyalar */}
            <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 14, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Box size={12} color={INK[400]} strokeWidth={1.8} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: INK[400], letterSpacing: 1, textTransform: 'uppercase' }}>Dosyalar</Text>
                <Text style={{ fontSize: 11, color: INK[400] }}>({data?.files.length ?? 0})</Text>
              </View>
              {/* Tümünü katmanlı göster — 2+ 3D dosya varsa */}
              {all3DFiles.length >= 2 && Platform.OS === 'web' && (
                <Pressable
                  onPress={openAllLayered}
                  style={({ hovered }: any) => ({
                    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                    backgroundColor: hovered ? A_DEEP : A,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                >
                  <Layers size={12} color={theme.accent} strokeWidth={2.2} />
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: theme.accent }}>Tümünü katmanlı göster ({all3DFiles.length})</Text>
                </Pressable>
              )}
              {(data?.files.length ?? 0) === 0 ? (
                <Text style={{ fontSize: 12, color: INK[400], fontStyle: 'italic' }}>Dosya yok.</Text>
              ) : (
                data!.files.map(f => {
                  const previewable = !!(f.storage_path || f.signed_url); // tıklamada taze imzalanır
                  const isZip = isArchiveExt(f.name || f.storage_path);
                  const isBusy = extractingId === f.id;
                  return (
                  <View
                    key={f.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10 }}
                  >
                    <View style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(f.is3d || isZip ? A : INK[400], 0.12) }}>
                      {f.is3d || isZip ? <Box size={14} color={A_DEEP} strokeWidth={1.8} /> : <FileText size={14} color={INK[500]} strokeWidth={1.8} />}
                    </View>
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: INK[800] }} numberOfLines={1}>{f.name}</Text>
                    {(f.is3d || isZip) && (
                      <View style={{ paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 999, backgroundColor: tint(A, 0.16) }}>
                        <Text style={{ fontSize: 8.5, fontWeight: '800', color: A_DEEP }}>{isZip ? 'ZIP · 3D' : '3D'}</Text>
                      </View>
                    )}
                    {/* Önizleme butonu — 3D ise viewer, diğeri yeni sekme */}
                    <Pressable
                      onPress={() => openFilePreview(f)}
                      disabled={!previewable || isBusy}
                      hitSlop={6}
                      // @ts-ignore web tooltip
                      title={isZip ? 'Zip aç ve 3D göster' : 'Önizle'}
                      style={({ hovered }: any) => ({
                        width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: hovered && previewable ? tint(A, 0.14) : 'transparent', opacity: previewable ? 1 : 0.4,
                        ...(Platform.OS === 'web' && previewable && !isBusy ? { cursor: 'pointer' } as any : {}),
                      })}
                    >
                      {isBusy
                        ? <ActivityIndicator size="small" color={A_DEEP} />
                        : <Eye size={13} color={previewable ? A_DEEP : INK[400]} strokeWidth={1.9} />}
                    </Pressable>
                  </View>
                  );
                })
              )}
            </View>
          </View>

          {/* Sağ: pipeline */}
          <View style={{ flex: 1, minWidth: isNarrow ? 0 : 320, width: isNarrow ? '100%' : undefined, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: INK[700] }}>Üretim Akışı · {activeRows.length} aşama</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Sparkles size={12} color={A_DEEP} strokeWidth={2} />
                <Text style={{ fontSize: 11, color: INK[500] }}>İstasyon varsayılan teknisyeni + canlı iş yükü</Text>
              </View>
            </View>

            {/* Faz 3: tahmini süre + SLA özeti */}
            {(planTiming.anyDuration || planTiming.anySla) && (() => {
              const tones = {
                ok:   { bg: tint('#2D9A6B', 0.10), bd: tint('#2D9A6B', 0.28), fg: '#1F6B47' },
                warn: { bg: tint('#E89B2A', 0.12), bd: tint('#E89B2A', 0.30), fg: '#9A6710' },
                late: { bg: tint('#D94B4B', 0.10), bd: tint('#D94B4B', 0.28), fg: '#9C2E2E' },
              } as const;
              const t = slaStatus ? tones[slaStatus.tone] : null;
              const slaLabel = slaStatus
                ? slaStatus.tone === 'late'
                  ? `Termine ${Math.abs(Math.round(slaStatus.slackH))} sa geç`
                  : `Termine ${Math.round(slaStatus.slackH)} sa pay`
                : null;
              return (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
                  {planTiming.anyDuration && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: PAGE }}>
                      <Clock size={14} color={A_DEEP} strokeWidth={2} />
                      <View>
                        <Text style={{ fontSize: 9.5, fontWeight: '700', color: INK[400], letterSpacing: 0.5, textTransform: 'uppercase' }}>Tahmini Süre</Text>
                        <Text style={{ fontSize: 13.5, fontWeight: '700', color: INK[900] }}>{fmtDuration(planTiming.totalMin)}</Text>
                      </View>
                    </View>
                  )}
                  {planTiming.anySla && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: PAGE }}>
                      <Layers size={14} color={A_DEEP} strokeWidth={2} />
                      <View>
                        <Text style={{ fontSize: 9.5, fontWeight: '700', color: INK[400], letterSpacing: 0.5, textTransform: 'uppercase' }}>Hedef Teslim (SLA)</Text>
                        <Text style={{ fontSize: 13.5, fontWeight: '700', color: INK[900] }}>{planTiming.totalSlaH} sa</Text>
                      </View>
                    </View>
                  )}
                  {t && slaLabel && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: t.bg, borderWidth: 1, borderColor: t.bd }}>
                      <AlertTriangle size={13} color={t.fg} strokeWidth={2} />
                      <View>
                        <Text style={{ fontSize: 9.5, fontWeight: '700', color: t.fg, letterSpacing: 0.5, textTransform: 'uppercase', opacity: 0.8 }}>Termin</Text>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: t.fg }}>{slaLabel}</Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })()}

            {error ? (
              <View style={{ padding: 10, borderRadius: 10, backgroundColor: tint('#D94B4B', 0.08), borderWidth: 1, borderColor: tint('#D94B4B', 0.2) }}>
                <Text style={{ fontSize: 12, color: '#9C2E2E', fontWeight: '600' }}>{error}</Text>
              </View>
            ) : null}

            {activeRows.map((r, i) => {
              const st = stationById.get(r.stationId);
              if (!st) return null;
              const tech = r.technicianId ? techById.get(r.technicianId) ?? null : null;
              return (
                <StageRow
                  key={r.stationId}
                  st={st} idx={i} first={i === 0} last={i === activeRows.length - 1}
                  tech={tech} accent={A} accentDeep={A_DEEP}
                  technicians={data?.technicians ?? []}
                  parallelGroup={activeGroups[i]}
                  parallelOn={!!r.parallelWithPrev}
                  onToggleParallel={() => toggleParallel(r.stationId)}
                  pickerOpen={pickerFor === r.stationId}
                  onTogglePicker={() => setPickerFor(p => p === r.stationId ? null : r.stationId)}
                  onAssign={(tid) => assignTech(r.stationId, tid)}
                  onRemove={() => setActive(r.stationId, false)}
                  onUp={() => move(r.stationId, -1)}
                  onDown={() => move(r.stationId, 1)}
                  dragging={dragIndex === i}
                  isOver={overIndex === i && dragIndex !== null && dragIndex !== i}
                  onDragStart={() => setDragIndex(i)}
                  onDragEnter={() => setOverIndex(i)}
                  onDrop={() => { if (dragIndex !== null) reorderActive(dragIndex, i); setDragIndex(null); setOverIndex(null); }}
                  onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
                />
              );
            })}

            {/* Havuz: + Aşama ekle */}
            {poolRows.length > 0 && (
              <View style={{ borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: INK[300], padding: 12, gap: 8, marginTop: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: INK[400], letterSpacing: 0.8, textTransform: 'uppercase' }}>+ Aşama Ekle</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {poolRows.map(r => {
                    const st = stationById.get(r.stationId);
                    if (!st) return null;
                    return (
                      <Pressable key={r.stationId} onPress={() => setActive(r.stationId, true)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                        <Plus size={13} color={INK[500]} strokeWidth={2} />
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: st.color }} />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: INK[700] }}>{st.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Sticky özet + onay */}
      {(() => {
        const assignedTechs = Array.from(new Set(activeRows.map(r => r.technicianId).filter(Boolean) as string[]))
          .map(id => techById.get(id)).filter(Boolean) as TriageTech[];
        const firstStation = activeRows[0] ? (stationById.get(activeRows[0].stationId)?.name ?? '—') : '—';
        // Planlama (üretime başlatma) yetkisi: yalnız müdür veya admin
        const isPlanner = (profile as any)?.role === 'manager' || (profile as any)?.user_type === 'admin';
        const canStart = !saving && activeRows.length > 0 && isPlanner;
        return (
        <View style={{ position: Platform.OS === 'web' ? ('sticky' as any) : 'absolute', left: 0, right: 0, bottom: isNarrow ? (Math.max(insets.bottom, 8) + 70) : 0, paddingHorizontal: 16, paddingTop: 16, paddingBottom: isNarrow ? 12 : 16 + insets.bottom, backgroundColor: 'transparent' }}>
          <View style={{
            width: '100%', flexDirection: isNarrow ? 'column' : 'row', alignItems: isNarrow ? 'stretch' : 'center', gap: isNarrow ? 12 : 14, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: INK[900],
            ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0,0,0,0.22)' } as any : {}),
          }}>
            {/* Özet — hairline ayraçlı (mobilde sarar) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap', flexShrink: 1 }}>
            <FooterStat icon={<Layers size={13} color={A} strokeWidth={2} />} label="Aşama" value={String(activeRows.length)} />
            <View style={{ width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.10)' }} />
            <FooterStat icon={<Play size={12} color={A} strokeWidth={2} />} label="İlk istasyon" value={firstStation} />
            <View style={{ width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.10)' }} />
            {planTiming.anyDuration && (<>
              <FooterStat icon={<Clock size={12} color={A} strokeWidth={2} />} label="Tahmini süre" value={fmtDuration(planTiming.totalMin)} />
              <View style={{ width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.10)' }} />
            </>)}
            <FooterStat
              icon={<Clock size={12} color={o?.is_urgent ? '#FBBF77' : A} strokeWidth={2} />}
              label="Teslim"
              value={o?.delivery_date ? new Date(o.delivery_date).toLocaleDateString(localeTag()) : '—'}
              warn={o?.is_urgent}
            />

            {/* Atanan ekip — avatar yığını */}
            {assignedTechs.length > 0 && (
              <>
                <View style={{ width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.10)' }} />
                <View style={{ gap: 3 }}>
                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.8, textTransform: 'uppercase' }}>Ekip</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {assignedTechs.slice(0, 4).map((t, i) => (
                      <View key={t.id} style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(A, 0.22), borderWidth: 1.5, borderColor: INK[900], marginLeft: i === 0 ? 0 : -8 }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFF' }}>{initials(t.full_name)}</Text>
                      </View>
                    ))}
                    {assignedTechs.length > 4 && (
                      <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1.5, borderColor: INK[900], marginLeft: -8 }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFF' }}>+{assignedTechs.length - 4}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </>
            )}
            </View>{/* /stats */}

            {!isNarrow && <View style={{ flex: 1 }} />}

            {!isPlanner && (
              <Text style={{ fontSize: 11, color: '#FBBF77', maxWidth: 220, ...(isNarrow ? { width: '100%' } : {}) }}>
                Üretime başlatmak için yönetici (müdür) veya admin yetkisi gerekir.
              </Text>
            )}

            {/* Aksiyonlar — mobilde tam genişlik sarar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, ...(isNarrow ? { width: '100%', flexWrap: 'wrap' } : {}) }}>
            <Pressable
              disabled={activeRows.length === 0}
              onPress={openSaveTemplate}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12,
                backgroundColor: hovered ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
                opacity: activeRows.length === 0 ? 0.4 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <Save size={14} color="rgba(255,255,255,0.9)" strokeWidth={1.9} />
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.9)' }}>Şablon Kaydet</Text>
            </Pressable>
            {/* Faz 5c: şablon eşleştiyse tek tıkla uygula + onayla */}
            {matchedTpl && (
              <Pressable
                disabled={!canStart}
                onPress={() => handleSave({ approve: true })}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12,
                  backgroundColor: hovered ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)',
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
                  opacity: !canStart ? 0.4 : 1, ...(Platform.OS === 'web' ? { cursor: canStart ? 'pointer' : 'default' } as any : {}),
                })}
              >
                <Sparkles size={14} color="#FFFFFF" strokeWidth={2} />
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#FFFFFF' }}>Tek Tıkla Uygula</Text>
              </Pressable>
            )}
            <Pressable
              disabled={!canStart}
              onPress={() => handleSave()}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12,
                backgroundColor: A, opacity: !canStart ? 0.5 : 1,
                ...(isNarrow ? { flexGrow: 1, flexBasis: '100%' as any } : {}),
                ...(Platform.OS === 'web' ? { cursor: canStart ? 'pointer' : 'default', boxShadow: hovered && canStart ? `0 6px 18px ${tint(A, 0.5)}` : 'none', transition: 'box-shadow 140ms ease' } as any : {}),
              })}
            >
              <Play size={15} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.2 }}>{saving ? 'Kaydediliyor…' : 'Onayla & Üretime Başlat'}</Text>
            </Pressable>
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
            onClose={() => { setViewerAll(null); setZipImages(null); revokeZipUrls(); }}
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
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,10,10,0.45)', paddingTop: insets.top }}>
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

function FooterStat({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: string; warn?: boolean }) {
  return (
    <View style={{ gap: 3, minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {icon}
        <Text style={{ fontSize: 9.5, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '800', color: warn ? '#FBBF77' : '#FFF', fontFamily: DISPLAY, letterSpacing: -0.3 }}>{value}</Text>
    </View>
  );
}

function StageRow({
  st, idx, first, last, tech, accent, accentDeep, technicians, pickerOpen, onTogglePicker, onAssign, onRemove, onUp, onDown,
  parallelGroup, parallelOn, onToggleParallel,
  dragging, isOver, onDragStart, onDragEnter, onDrop, onDragEnd,
}: {
  st: TriageStation; idx: number; first: boolean; last: boolean; tech: TriageTech | null;
  accent: string; accentDeep: string; technicians: TriageTech[];
  pickerOpen: boolean; onTogglePicker: () => void; onAssign: (id: string | null) => void;
  onRemove: () => void; onUp: () => void; onDown: () => void;
  parallelGroup: number | null; parallelOn: boolean; onToggleParallel: () => void;
  dragging?: boolean; isOver?: boolean;
  onDragStart?: () => void; onDragEnter?: () => void; onDrop?: () => void; onDragEnd?: () => void;
}) {
  const isWeb = Platform.OS === 'web';
  const { width: _w } = useWindowDimensions();
  const narrow = _w < 640;   // dar ekranda teknisyen seçici ad altına iner (çakışma önlenir)
  // Teknisyen seçici bloğu — geniş ekranda satır içi, dar ekranda ad altında tam satır
  const techBlock = (
    <Pressable onPress={onTogglePicker} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, ...(narrow ? { justifyContent: 'flex-end' } : {}), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
      <View style={{ alignItems: 'flex-end', gap: 2, minWidth: 0, flexShrink: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: tech ? INK[800] : INK[400] }} numberOfLines={1}>{tech?.full_name ?? 'Otomatik atanacak'}</Text>
        {tech ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 46, height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, (tech.load / (tech.capacity && tech.capacity > 0 ? tech.capacity : 6)) * 100)}%`, height: 5, borderRadius: 3, backgroundColor: loadColor(tech.load) }} />
            </View>
            <Text style={{ fontSize: 10, fontWeight: '700', color: loadColor(tech.load) }}>{tech.load} aktif</Text>
          </View>
        ) : (
          <Text style={{ fontSize: 9.5, color: INK[400] }}>en uygun teknisyen</Text>
        )}
      </View>
      {tech ? (
        <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(st.color, 0.16) }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: st.color }}>{initials(tech.full_name)}</Text>
        </View>
      ) : (
        <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: INK[300] }}>
          <Sparkles size={14} color={INK[400]} strokeWidth={1.8} />
        </View>
      )}
      <Caret size={14} color={INK[400]} strokeWidth={2} />
    </Pressable>
  );
  const card = (
    <View style={{
      borderRadius: 16, backgroundColor: '#FFFFFF',
      borderWidth: 1, borderColor: isOver ? accent : 'rgba(0,0,0,0.06)',
      opacity: dragging ? 0.4 : 1,
      ...(isWeb ? { transition: 'border-color 120ms ease, opacity 120ms ease' } as any : {}),
    }}>
      <View style={{ padding: 13, gap: narrow ? 10 : 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* Sürükle tutamacı (web) — mobilde ↑↓ okları */}
        {isWeb ? (
          React.createElement('div', {
            draggable: true,
            onDragStart: (e: any) => { try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)); } catch {} onDragStart?.(); },
            onDragEnd: () => onDragEnd?.(),
            style: { cursor: 'grab', display: 'flex', alignItems: 'center', touchAction: 'none' },
            title: 'Sürükleyerek sırala',
          }, <GripVertical size={17} color={INK[400]} strokeWidth={2} />)
        ) : (
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Pressable onPress={onUp} disabled={first} style={{ opacity: first ? 0.2 : 1 }}>
              <ChevronUp size={15} color={INK[400]} strokeWidth={2} />
            </Pressable>
            <Pressable onPress={onDown} disabled={last} style={{ opacity: last ? 0.2 : 1 }}>
              <ChevronDown size={15} color={INK[400]} strokeWidth={2} />
            </Pressable>
          </View>
        )}

        {/* sıra numarası — nötr, daire */}
        <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(accent, 0.12) }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: accentDeep, fontFamily: DISPLAY }}>{idx + 1}</Text>
        </View>

        {/* ad + rozetler */}
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: INK[900], flexShrink: 1 }} numberOfLines={1}>{st.name}</Text>
            {first && (
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: tint(accent, 0.16) }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: accentDeep, letterSpacing: 0.4 }}>İLK AŞAMA</Text>
              </View>
            )}
            {st.is_critical && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: tint('#D94B4B', 0.12) }}>
                <AlertTriangle size={9} color="#9C2E2E" strokeWidth={2} />
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#9C2E2E', letterSpacing: 0.4 }}>KRİTİK</Text>
              </View>
            )}
            {parallelGroup != null && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: tint(accent, 0.14) }}>
                <Layers size={9} color={accentDeep} strokeWidth={2.2} />
                <Text style={{ fontSize: 9, fontWeight: '800', color: accentDeep, letterSpacing: 0.4 }}>PARALEL · G{parallelGroup}</Text>
              </View>
            )}
          </View>
        </View>

        {!narrow && techBlock}

        {!first && (
          <Pressable
            onPress={onToggleParallel}
            accessibilityLabel="Önceki aşamayla paralel"
            style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: parallelOn ? accent : 'rgba(0,0,0,0.04)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
          >
            <Layers size={13} color={parallelOn ? '#FFFFFF' : INK[400]} strokeWidth={2} />
          </Pressable>
        )}
        <Pressable onPress={onRemove} style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
          <X size={13} color={INK[400]} strokeWidth={2} />
        </Pressable>
      </View>
      {narrow && (
        <View style={{ paddingLeft: 42 }}>{techBlock}</View>
      )}
      </View>

      {/* teknisyen dropdown */}
      {pickerOpen && (
        <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', padding: 8, gap: 4 }}>
          <Pressable onPress={() => onAssign(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 10, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: INK[300] }}>
              <Sparkles size={13} color={INK[400]} strokeWidth={1.8} />
            </View>
            <Text style={{ fontSize: 12.5, color: INK[700], fontWeight: '600' }}>Otomatik (en uygun teknisyen)</Text>
            {!tech && <Check size={15} color={accentDeep} strokeWidth={2.5} style={{ marginLeft: 'auto' as any }} />}
          </Pressable>
          {[...technicians].sort((a, b) => {
            // Uygun (yetkin) teknisyenler önce, sonra az yüklü
            const qa = isQualified(st, a) ? 0 : 1, qb = isQualified(st, b) ? 0 : 1;
            if (qa !== qb) return qa - qb;
            return a.load - b.load;
          }).map(t => {
            const sel = tech?.id === t.id;
            const qualified = isQualified(st, t);
            const cap = t.capacity && t.capacity > 0 ? t.capacity : 6;
            return (
              <Pressable key={t.id} onPress={() => onAssign(t.id)}
                style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 10, opacity: qualified ? 1 : 0.5, backgroundColor: sel ? tint(accent, 0.08) : hovered ? 'rgba(0,0,0,0.03)' : 'transparent', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}>
                <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(st.color, 0.16) }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: st.color }}>{initials(t.full_name)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 12.5, color: INK[800], fontWeight: '600' }} numberOfLines={1}>{t.full_name}</Text>
                  {st.required_skills.length > 0 && qualified && (
                    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: tint(accent, 0.16) }}>
                      <Text style={{ fontSize: 8.5, fontWeight: '800', color: accentDeep }}>UYGUN</Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                    <View style={{ width: `${Math.min(100, (t.load / cap) * 100)}%`, height: 5, borderRadius: 3, backgroundColor: loadColor(t.load) }} />
                  </View>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: loadColor(t.load) }}>{t.load}</Text>
                </View>
                {sel && <Check size={15} color={accentDeep} strokeWidth={2.5} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  if (isWeb) {
    return React.createElement('div', {
      onDragOver: (e: any) => { e.preventDefault(); onDragEnter?.(); },
      onDrop: (e: any) => { e.preventDefault(); onDrop?.(); },
    }, card);
  }
  return card;
}
