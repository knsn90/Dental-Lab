// modules/orders/components/StageFileUpload.tsx
// İşin dosyaları — sipariş bazlı, tek havuz, tek modal (FilesUploadModal).
// Workstation, sipariş detay, yeni sipariş — hepsi aynı work_order_photos
// tablosunu okur/yazar. Bir yerde yüklenen dosya tüm yerlerde aynı görünür.
// Caption = kategori etiketi (Ekartörlü Resim / Üst Çene / vb).

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Platform, Linking, Modal, Image } from 'react-native';
import { useSegments } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { FileUp, FileText, Image as ImageIcon, FileBox, Eye, Trash2, UploadCloud, Download, UserCheck, Clock as ClockIcon, ChevronDown } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { useStationTheme, hexA } from '../../../core/theme/stationPalette';
import { toast } from '../../../core/ui/Toast';
import { useAuthStore } from '../../../core/store/authStore';
import { recordStageActivity } from '../api/timing';
import { requestDesignApproval, resetDesignApproval } from '../api';
import { FilesUploadModal, type UploadAttachment } from './FilesUploadModal';
import { isImplantWorkType } from '../constants';
import { getStationDescriptor, allStationFileCategories } from '../stations/registry';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

// Viewer3D — tek paylaşılan lazy (retry'lı; Metro dev async-chunk {} sorununa dayanıklı)
import { Viewer3DModalLazy as Viewer3DModal } from '../../viewer-3d/Viewer3DLazy';

// HTML tasarım (exocad) native önizleme — sadece native'de WebView yükle (web iframe kullanır).
const HtmlWebView: any = Platform.OS !== 'web' ? require('react-native-webview').WebView : null;

/**
 * İstemci tarafı yükleme sınırı. work-order-photos bucket'ı 200 MB'a izin veriyor;
 * bu sınır o tavanın altında bilinçli olarak duruyor — 200 MB'lık bir STL mobil
 * veride dakikalarca sürer ve kullanıcıya hiçbir geri bildirim vermeden başarısız
 * olabilir. chatApi.ts ile aynı değer (100 MB).
 */
const MAX_UPLOAD_MB = 100;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

function is3DFile(filename: string): 'stl' | 'ply' | 'obj' | null {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'stl') return 'stl';
  if (ext === 'ply') return 'ply';
  if (ext === 'obj') return 'obj';
  return null;
}

interface StageFile {
  id:           string;
  storage_path: string;
  caption:      string | null;
  uploaded_by:  string;
  created_at:   string;
  filename:     string;
  signed_url?:  string;
  /** Revizyonda asıl (ebeveyn) işten devralınan dosya — salt okunur, silinemez. */
  __inherited?: boolean;
}

/** Web XHR upload — gerçek progress event'leriyle Supabase Storage'a doğrudan yazar. */
async function uploadWithXhr({
  file, path, contentType, onProgress,
}: {
  file:        File | Blob;
  path:        string;
  contentType: string;
  onProgress:  (pct: number) => void;
}): Promise<string | null> {
  // Supabase config'ten URL ve auth token al
  const supabaseUrl  = (supabase as any).supabaseUrl  ?? (supabase as any).restUrl?.replace(/\/rest\/v1\/?$/, '');
  const session      = (await supabase.auth.getSession()).data.session;
  const accessToken  = session?.access_token;
  const anonKey      = (supabase as any).supabaseKey ?? (supabase as any).rest?.headers?.apikey;

  if (!supabaseUrl || !accessToken) {
    return 'auth missing for XHR upload';
  }

  return new Promise<string | null>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/work-order-photos/${encodeURI(path)}`);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    if (anonKey) xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        onProgress(pct);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve(null);
      } else {
        let msg = `HTTP ${xhr.status}`;
        try { const j = JSON.parse(xhr.responseText); msg = j.message ?? j.error ?? msg; } catch {}
        resolve(msg);
      }
    };
    xhr.onerror = () => resolve('network error');
    xhr.onabort = () => resolve('aborted');
    xhr.send(file);
  });
}

/** Accent rengine en yakın patterns DS theme'ini seç. */
function pickProgressTheme(accent: string): 'lab' | 'clinic' | 'exec' | 'tech' | 'plum' | 'teal' {
  const h = accent.toLowerCase();
  if (/3b82f6|2563eb|0ea5e9|0891b2/.test(h))         return 'tech';
  if (/d97757|ea580c|f97316|d97706/.test(h))         return 'exec';
  if (/16a34a|10b981|22c55e|059669|6ba888/.test(h))  return 'clinic';
  if (/7c3aed|8b5cf6|a855f7/.test(h))                return 'plum';
  if (/14b8a6|0d9488/.test(h))                        return 'teal';
  return 'lab';
}

function inferIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (['stl','obj','ply','dcm','3mf'].includes(ext))           return FileBox;
  if (['jpg','jpeg','png','webp','gif','heic'].includes(ext))  return ImageIcon;
  if (['pdf','doc','docx','xls','xlsx','txt'].includes(ext))   return FileText;
  return FileUp;
}

/**
 * Dosyaları TÜRÜNE göre gruplar.
 *
 * Yükleme sırasında caption "Gülüş Fotoğrafı · DSC05981.JPG" biçiminde yazılıyor;
 * kategori zaten " · " öncesinde duruyor. Caption yoksa uzantıdan aile çıkarılır.
 *
 * NEDEN: 29 dosyanın 25'i "Gülüş Fotoğrafı · DSC0598…" diye birbirinin aynı
 * görünüyordu; teknisyen aradığı STL'i bulmak için düz listede kaydırmak
 * zorundaydı. Kategori + sayı, aramayı tek bakışa indirir.
 */
function fileCategory(f: { filename: string; storage_path: string }): string {
  const cap = (f.filename ?? '').split('·')[0].trim();
  if (cap && cap !== f.filename.trim()) return cap;
  const ext = (f.storage_path || f.filename).split('.').pop()?.toLowerCase() ?? '';
  if (['stl', 'obj', 'ply', 'dcm', '3mf'].includes(ext))          return '3D Model';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(ext)) return 'Fotoğraf';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'].includes(ext))  return 'Belge';
  return 'Diğer';
}

export function StageFileUpload({
  stageId, workOrderId, accentColor, onUploaded, stationName,
  hideFileList = false, triggerStyle = 'card', fillHeight = false,
}: {
  /** Stage bağlamı — workstation kullanımında verilir; sipariş detayda boş geçilebilir */
  stageId?:     string;
  workOrderId:  string;
  accentColor?: string;
  onUploaded?:  () => void;
  /** İstasyon adı — modal'a aşama-spesifik kategori grubu eklemek için */
  stationName?: string | null;
  /**
   * true ise alttaki inline dosya listesini gizler (sadece "Dosya Yükle" butonu).
   */
  hideFileList?: boolean;
  /**
   * 'card' (default) — bordered card + header + button (workstation için)
   * 'row'  — sadece tek satır integrated trigger (sipariş detayında foto listesinin yanına otursun diye)
   */
  triggerStyle?: 'card' | 'row';
  /**
   * true ise card variant'ının kökü flex:1 alır → split layout'ta yan kart ile aynı yüksekliğe esner.
   */
  fillHeight?: boolean;
}) {
  const P = useStationTheme();
  const accent = accentColor ?? P.accent;
  // Hekim/klinik panelinde lab çıktı kategorilerinde boş upload slotlarını gizle —
  // sadece yüklenmiş lab dosyaları görünsün (hekimin kendi girdileri etkilenmez).
  const segments = useSegments();
  const isClientPanel = (() => {
    const seg = String(segments?.[0] ?? '');
    return seg === '(clinic)' || seg === '(doctor)';
  })();
  const { profile } = useAuthStore();
  const isAdmin = profile?.user_type === 'admin';
  const isManager = profile?.role === 'manager' || isAdmin;
  // Hekim onayına gönder (lab manager/admin)
  const handleSendApproval = async () => {
    if (sendingApproval) return;
    setSendingApproval(true);
    const res = await requestDesignApproval(workOrderId);
    setSendingApproval(false);
    if (!res.ok) { toast.error(res.error ?? 'Gönderilemedi'); return; }
    toast.success('Tasarım hekim onayına gönderildi');
    refreshWoMeta();
  };
  // Yetki: admin tüm dosyaları, herkes kendi yüklediğini silebilir
  const canRemoveFile = (uploadedBy: string) =>
    isAdmin || profile?.id === uploadedBy;

  const [files, setFiles] = useState<StageFile[]>([]);
  const [loading, setLoading] = useState(true);
  /** Açık kategori grupları. Az dosyada hepsi açık, kalabalıkta hepsi kapalı. */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const fileGroups = useMemo(() => {
    const map = new Map<string, StageFile[]>();
    for (const f of files) {
      const k = fileCategory(f);
      const arr = map.get(k); if (arr) arr.push(f); else map.set(k, [f]);
    }
    // Çok dosyalı kategori üstte — aradığın büyük ihtimalle orada.
    return Array.from(map.entries())
      .map(([key, items]) => ({ key, items }))
      .sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key, 'tr'));
  }, [files]);

  /** 8'den az dosyada gruplamanın anlamı yok — hepsi açık gelsin. */
  const defaultOpen = files.length <= 8;
  const [uploading, setUploading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  // Yükleme tamamlandıktan sonra gelen "spurious" close event'lerini bloke etmek için
  const lastUploadEndedAt = React.useRef<number>(0);

  // Yükleme progress state'i — paralel uploadları destekler (Map<uploadId, state>)
  const [uploadProgress, setUploadProgress] = useState<Record<string, {
    id: string;
    filename: string;
    progress: number | null;     // null = indeterminate
    label?: string;              // Hangi kategori kartı — kart ring overlay için
  }>>({});
  const hasActiveUpload = Object.keys(uploadProgress).length > 0;
  const uploadProgressList = React.useMemo(() => Object.values(uploadProgress), [uploadProgress]);

  // Modal'a verilen attachments — kategori başlığı + dosya adı
  const [attachments, setAttachments] = useState<UploadAttachment[]>([]);

  // İş türü — "İmplant Bilgileri" grubunu yalnız implant işlerde göstermek için.
  const [workType, setWorkType] = useState<string | null>(null);
  const [scanDelivered, setScanDelivered] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [sendingApproval, setSendingApproval] = useState(false);
  const refreshWoMeta = React.useCallback(() => {
    supabase.from('work_orders').select('work_type, scan_bodies_delivered, doctor_approval_status').eq('id', workOrderId).maybeSingle()
      .then(({ data }) => {
        setWorkType((data as any)?.work_type ?? null);
        setScanDelivered(!!(data as any)?.scan_bodies_delivered);
        setApprovalStatus((data as any)?.doctor_approval_status ?? null);
      });
  }, [workOrderId]);
  useEffect(() => { refreshWoMeta(); }, [refreshWoMeta]);

  // 3D viewer state (STL/PLY/OBJ dosyaları için)
  const [viewer3DFile, setViewer3DFile] = useState<{ id: string; name: string; url: string; format: 'stl'|'ply'|'obj' } | null>(null);
  // Çoklu 3D viewer — tüm taramaları üst üste aç
  const [viewer3DFiles, setViewer3DFiles] = useState<Array<{ id: string; name: string; url: string; format: 'stl'|'ply'|'obj' }> | null>(null);
  // Uygulama-içi görsel önizleme (yeni tab yerine popup)
  const [imageViewer, setImageViewer] = useState<{ url: string; name: string } | null>(null);
  // Uygulama-içi HTML tasarım önizleme (exocad web viewer — web: iframe · native: WebView)
  const [htmlViewer, setHtmlViewer] = useState<{ url?: string; html?: string; name: string } | null>(null);

  // Siparişe ait TÜM dosyaları yükle — yeni sipariş, detay, workstation
  // hepsinde aynı liste görünür.
  const loadFiles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('work_order_photos')
      .select('id, storage_path, caption, uploaded_by, created_at')
      .eq('work_order_id', workOrderId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) { console.warn('[stage-files] load error:', error.message); setLoading(false); return; }

    const list: StageFile[] = (data ?? []).map((r: any) => {
      const parts = (r.storage_path as string).split('/');
      const fname = parts[parts.length - 1] ?? r.storage_path;
      // Caption varsa onu göster (kategori etiketi); yoksa dosya adını
      const display = r.caption?.trim() || decodeURIComponent(fname.split('-').slice(1).join('-') || fname);
      return {
        id:           r.id,
        storage_path: r.storage_path,
        caption:      r.caption,
        uploaded_by:  r.uploaded_by,
        created_at:   r.created_at,
        filename:     display,
      };
    });
    // Revizyon ise: asıl (ebeveyn) işin dosyalarını da devral — salt okunur.
    // Böylece "Dosyalar" modülü/workstation revizyonda boş görünmez; teknisyen
    // asıl taramaları görür. Kopyalanmaz; ebeveynin storage_path'i imzalanır.
    try {
      const { data: woRow } = await supabase
        .from('work_orders').select('revision_of_id, continues_order_id').eq('id', workOrderId).maybeSingle();
      // Revizyon → revision_of_id, devam siparişi → continues_order_id ile ASIL işin
      // taramalarını devralır (salt okunur).
      const parentId = ((woRow as any)?.revision_of_id ?? (woRow as any)?.continues_order_id) as string | undefined;
      if (parentId) {
        const { data: pdata } = await supabase
          .from('work_order_photos')
          .select('id, storage_path, caption, uploaded_by, created_at')
          .eq('work_order_id', parentId)
          .order('created_at', { ascending: false })
          .limit(100);
        const ownPaths = new Set(list.map(f => f.storage_path));
        for (const r of (pdata ?? []) as any[]) {
          if (ownPaths.has(r.storage_path)) continue;   // aynı path tekrarını atla
          const parts = (r.storage_path as string).split('/');
          const fname = parts[parts.length - 1] ?? r.storage_path;
          const display = r.caption?.trim() || decodeURIComponent(fname.split('-').slice(1).join('-') || fname);
          list.push({
            id: r.id, storage_path: r.storage_path, caption: r.caption,
            uploaded_by: r.uploaded_by, created_at: r.created_at,
            filename: display, __inherited: true,
          });
        }
      }
    } catch { /* devralma opsiyonel — hata olsa da kendi dosyaları gösterilir */ }

    setFiles(list);
    setLoading(false);
  };

  useEffect(() => { void loadFiles(); }, [stageId, workOrderId]);

  // Modal açıldığında, mevcut yüklü dosyaları attachments'a yansıt
  // (FilesUploadModal label'ı startsWith ile eşler — caption direkt label).
  // Görsel kartlarında thumbnail için her dosyaya signed URL üretilir (private bucket).
  useEffect(() => {
    if (!modalOpen) return;
    let alive = true;
    const base = files.map(f => ({
      id:        f.id,
      name:      f.caption?.trim() || f.filename,
      uri:       '',
      kind:      detectKind(f.storage_path) || detectKind(f.filename),
      canRemove: f.__inherited ? false : canRemoveFile(f.uploaded_by),
      filename:  f.storage_path,  // 3D format tespiti için gerçek uzantılı path
      created_at: f.created_at,
    }) as UploadAttachment);
    setAttachments(base);  // önce uri'siz göster (hızlı), sonra thumbnail'leri doldur
    (async () => {
      const paths = files.map(f => f.storage_path);
      if (paths.length === 0) return;
      const { data: signed } = await supabase.storage
        .from('work-order-photos')
        .createSignedUrls(paths, 3600);
      if (!alive || !signed) return;
      const urlByPath: Record<string, string> = {};
      signed.forEach((sgn: any) => { if (sgn?.signedUrl && sgn?.path) urlByPath[sgn.path] = sgn.signedUrl; });
      setAttachments(files.map(f => ({
        id:        f.id,
        name:      f.caption?.trim() || f.filename,
        uri:       urlByPath[f.storage_path] ?? '',
        kind:      detectKind(f.storage_path) || detectKind(f.filename),
        canRemove: f.__inherited ? false : canRemoveFile(f.uploaded_by),
        filename:  f.storage_path,
        created_at: f.created_at,
      })));
    })();
    return () => { alive = false; };
  }, [modalOpen, files, profile?.id, isAdmin]);

  function detectKind(filename: string): UploadAttachment['kind'] {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    if (['stl','obj','ply','3mf','dcm'].includes(ext))           return 'scan';
    if (['mp4','mov','webm','avi'].includes(ext))                return 'video';
    if (['pdf'].includes(ext))                                    return 'pdf';
    return 'image';
  }

  async function handleOpen(file: StageFile) {
    const { data, error } = await supabase.storage
      .from('work-order-photos')
      .createSignedUrl(file.storage_path, 60 * 5);
    if (error || !data?.signedUrl) {
      toast.error('Önizleme alınamadı');
      return;
    }
    // STL/PLY/OBJ → 3D Viewer. file.filename caption olabilir, gerçek uzantı
    // storage_path'te. İkisini de dene.
    const fmt = is3DFile(file.storage_path) || is3DFile(file.filename);
    if (fmt && Platform.OS === 'web') {
      setViewer3DFile({ id: file.id, name: file.filename, url: data.signedUrl, format: fmt });
      return;
    }
    const ext = (file.storage_path.split('.').pop() || '').toLowerCase();
    // HTML tasarım dosyası (exocad web viewer) → uygulama-içi iframe popup.
    // Signed URL content-type'ı çoğu zaman octet-stream/text olduğundan iframe
    // dosyayı YAZI olarak gösteriyor. İçeriği çekip text/html blob URL'i ile
    // gömüyoruz → tarayıcı HTML olarak render eder (exocad self-contained).
    if (ext === 'html' || ext === 'htm') {
      try {
        const res = await fetch(data.signedUrl);
        const text = await res.text();
        if (Platform.OS === 'web') {
          const blobUrl = URL.createObjectURL(new Blob([text], { type: 'text/html' }));
          setHtmlViewer({ url: blobUrl, name: file.filename });
        } else {
          // Native: dosya dışarı çıkmadan uygulama-içi WebView'de exocad viewer açılır.
          setHtmlViewer({ html: text, name: file.filename });
        }
      } catch (e) {
        console.error('[html viewer] içerik alınamadı:', e);
        if (Platform.OS === 'web') window.open(data.signedUrl, '_blank');
        else Linking.openURL(data.signedUrl);
      }
      return;
    }
    // Görsel → uygulama-içi popup viewer (gerçek görsel uzantısı; html buraya düşmesin).
    if (['jpg','jpeg','png','gif','webp','bmp','heic','heif','svg','avif'].includes(ext)) {
      setImageViewer({ url: data.signedUrl, name: file.filename });
      return;
    }
    // PDF / video / diğer → varsayılan davranış.
    if (Platform.OS === 'web') window.open(data.signedUrl, '_blank');
    else Linking.openURL(data.signedUrl);
  }

  /** Direct download — preview YOK, dosyayı diske kaydet. */
  async function handleDownload(file: StageFile) {
    const { data, error } = await supabase.storage
      .from('work-order-photos')
      .createSignedUrl(file.storage_path, 60 * 5, { download: file.filename });
    if (error || !data?.signedUrl) {
      toast.error('İndirme bağlantısı alınamadı');
      return;
    }
    if (Platform.OS === 'web') {
      // <a download> ile zorla indirme — popup engellemesi yapmaz
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.download = file.filename;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { document.body.removeChild(a); } catch {} }, 100);
    } else {
      Linking.openURL(data.signedUrl);
    }
  }

  async function handleDelete(file: StageFile) {
    if (uploading) return;
    if (file.__inherited) {
      toast.error('Asıl işin dosyası — revizyondan silinemez');
      return;
    }
    if (!canRemoveFile(file.uploaded_by)) {
      toast.error('Bu dosyayı silme yetkiniz yok');
      return;
    }
    const { error: dbErr } = await supabase
      .from('work_order_photos').delete().eq('id', file.id);
    if (dbErr) { toast.error('Silinemedi: ' + dbErr.message); return; }
    void supabase.storage.from('work-order-photos').remove([file.storage_path]);
    toast.success('Dosya silindi');
    if (stageId) void recordStageActivity(stageId, 'file_deleted', 'manual', { filename: file.filename });
    // Tasarım dosyası değişti → varsa hekim onayını sıfırla (buton tekrar aktif).
    if (approvalStatus === 'pending' || approvalStatus === 'approved') {
      await resetDesignApproval(workOrderId);
      refreshWoMeta();
    }
    void loadFiles();
  }

  /** Belirli bir kategori (label) için dosya yükle. */
  async function uploadOne(label: string, asset: { uri: string; name?: string; mimeType?: string; size?: number; file?: any }) {
    if (!profile) return;

    // İstemci tarafı boyut sınırı. Bucket sınırı 200 MB; oraya kadar sessizce
    // yüklemeye çalışmak mobil veride dakikalarca sürüp sonunda başarısız
    // olabiliyor. Sınırı erken ve anlaşılır şekilde bildir.
    const assetSize = asset.size ?? asset.file?.size;
    if (typeof assetSize === 'number' && assetSize > MAX_UPLOAD_BYTES) {
      toast.error(`Dosya ${MAX_UPLOAD_MB} MB sınırını aşıyor (${(assetSize / 1024 / 1024).toFixed(1)} MB).`);
      return;
    }

    const uploadId = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const safeName = (asset.name ?? `${label}.bin`).replace(/[^a-zA-Z0-9._-]/g, '_');
    // Çok-dosyalı slot: caption = `${label} · orijinalAd` — startsWith(label)
    // gruplaması korunur, aynı slottaki dosyalar birbirinden ayırt edilir.
    const caption = asset.name
      ? `${label} · ${asset.name.replace(/\.[^.]+$/, '').slice(0, 48)}.${asset.name.split('.').pop() ?? 'bin'}`
      : label;
    setUploadProgress(prev => ({ ...prev, [uploadId]: { id: uploadId, filename: safeName, progress: null, label } }));
    try {
      const ts = Date.now();
      const stagePart = stageId ? `stage-${stageId}-` : '';
      const path = `orders/${workOrderId}/${stagePart}${ts}-${safeName}`;

      // Web'de gerçek progress için XHR — Supabase JS SDK fetch kullanıyor, progress yok.
      // Native (FormData) için Supabase SDK indeterminate ile devam eder.
      let upErr: { message: string } | null = null;
      if (Platform.OS === 'web' && asset.file) {
        const xhrErr = await uploadWithXhr({
          file:        asset.file,
          path,
          contentType: asset.mimeType ?? 'application/octet-stream',
          onProgress:  (pct) => setUploadProgress(prev => prev[uploadId]
            ? { ...prev, [uploadId]: { ...prev[uploadId], progress: pct } }
            : prev),
        });
        if (xhrErr) upErr = { message: xhrErr };
      } else {
        const fd = new FormData();
        fd.append('file', { uri: asset.uri, name: safeName, type: asset.mimeType ?? 'application/octet-stream' } as any);
        const { error } = await supabase.storage
          .from('work-order-photos')
          .upload(path, fd, { contentType: asset.mimeType ?? undefined, upsert: false });
        if (error) upErr = { message: error.message };
      }

      if (upErr) {
        toast.error('Yükleme başarısız: ' + upErr.message);
        return;
      }

      const { error: dbErr } = await supabase
        .from('work_order_photos')
        .insert({
          work_order_id: workOrderId,
          storage_path:  path,
          uploaded_by:   profile.id,
          lab_id:        (profile as any).lab_id ?? null,
          // Caption = `${label} · orijinalAd` — yeni sipariş & workstation aynı format
          caption,
        });
      if (dbErr) {
        toast.error('Kayıt başarısız: ' + dbErr.message);
        void supabase.storage.from('work-order-photos').remove([path]);
        return;
      }

      if (stageId) void recordStageActivity(stageId, 'file_uploaded', 'system', {
        label, filename: safeName, size: asset.size, mime: asset.mimeType,
      });
      toast.success(`${label} yüklendi`);
      onUploaded?.();
      // Hem files listesini hem modal attachments'i tazele
      await loadFiles();
    } finally {
      setUploadProgress(prev => {
        const next = { ...prev };
        delete next[uploadId];
        return next;
      });
      lastUploadEndedAt.current = Date.now();
    }
  }

  // uploading bayrağını uploadProgress üzerinden senkron tut
  React.useEffect(() => {
    setUploading(hasActiveUpload);
  }, [hasActiveUpload]);

  // ── Picker handlers (FilesUploadModal callbacks) ─────────────────
  async function handlePickPhoto(label: string) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { toast.error('Galeri izni reddedildi'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85, allowsEditing: false, allowsMultipleSelection: true,
    });
    if (r.canceled || !r.assets?.length) return;
    for (const a of r.assets) {
      await uploadOne(label, { uri: a.uri, name: a.fileName ?? `${label}.jpg`, mimeType: a.mimeType ?? 'image/jpeg', size: a.fileSize, file: (a as any).file });
    }
  }

  async function handlePickVideo(label: string) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { toast.error('Galeri izni reddedildi'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.85, allowsMultipleSelection: true,
    });
    if (r.canceled || !r.assets?.length) return;
    for (const a of r.assets) {
      await uploadOne(label, { uri: a.uri, name: a.fileName ?? `${label}.mp4`, mimeType: a.mimeType ?? 'video/mp4', size: a.fileSize, file: (a as any).file });
    }
  }

  async function handlePickScan(label: string) {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.length) return;
    for (const a of r.assets) {
      await uploadOne(label, { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream', size: a.size, file: (a as any).file });
    }
  }

  async function handlePickPdf(label: string) {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: true, copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.length) return;
    for (const a of r.assets) {
      await uploadOne(label, { uri: a.uri, name: a.name, mimeType: 'application/pdf', size: a.size, file: (a as any).file });
    }
  }

  // Modal — her iki triggerStyle için de aynı; aşağıda paylaşılır
  // "Tasarım Çıktıları" grubunun altına "Hekim Onayına Gönder" / durum rozeti.
  const designCta = (!isClientPanel && isManager) ? (
    approvalStatus === 'pending' ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 42, borderRadius: 12, backgroundColor: '#E89B2A18' }}>
        <ClockIcon size={15} color="#B7791F" strokeWidth={2} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#B7791F' }}>Hekim onayı bekliyor</Text>
      </View>
    ) : approvalStatus === 'approved' ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 42, borderRadius: 12, backgroundColor: '#2D9A6B18' }}>
        <UserCheck size={15} color="#1E7A52" strokeWidth={2} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E7A52' }}>Hekim onayladı</Text>
      </View>
    ) : (
      <Pressable onPress={handleSendApproval} disabled={sendingApproval}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 12, backgroundColor: accent }}>
        <UserCheck size={16} color="#fff" strokeWidth={2.2} />
        <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#fff' }}>{sendingApproval ? 'Gönderiliyor…' : 'Hekim Onayına Gönder'}</Text>
      </Pressable>
    )
  ) : undefined;

  const baseGroups = (stationName ? getStationDescriptor(stationName).fileCategories : allStationFileCategories()) ?? [];
  const extraGroupsWithCta = designCta
    ? baseGroups.map((g: any) => g.title === 'Tasarım Çıktıları' ? { ...g, cta: designCta } : g)
    : baseGroups;

  const modalEl = (
    <FilesUploadModal
      visible={modalOpen}
      onClose={() => {
        const elapsed = Date.now() - lastUploadEndedAt.current;
        if (hasActiveUpload || elapsed < 1000) {
          console.log('[stage-file-upload] modal close suppressed (recent upload, elapsed=', elapsed, 'ms)');
          return;
        }
        setModalOpen(false);
      }}
      accentColor={accent}
      title="Sipariş Dosyaları"
      splitView
      showImplant={isImplantWorkType(workType) || attachments.some(a => (a.name ?? '').toLowerCase().includes('scan body'))}
      scanBodiesDelivered={scanDelivered}
      attachments={attachments}
      extraGroups={extraGroupsWithCta}
      hideEmptyExtraGroups={isClientPanel}
      uploadingStates={uploadProgressList}
      progressTheme={pickProgressTheme(accent)}
      onPickPhoto={handlePickPhoto}
      onPickVideo={handlePickVideo}
      onPickScan={handlePickScan}
      onPickPdf={handlePickPdf}
      onPreview={(att) => {
        const f = files.find(x => x.id === att.id);
        if (f) void handleOpen(f);
      }}
      onRemove={(id) => {
        const f = files.find(x => x.id === id);
        if (f) void handleDelete(f);
      }}
      onDownload={(att) => {
        const f = files.find(x => x.id === att.id);
        if (f) void handleDownload(f);
      }}
      count3D={files.filter(f => is3DFile(f.storage_path) || is3DFile(f.filename)).length}
      onPreviewAll3D={async () => {
        const targets = files.filter(f => is3DFile(f.storage_path) || is3DFile(f.filename));
        const items: Array<{ id: string; name: string; url: string; format: 'stl'|'ply'|'obj' }> = [];
        for (const f of targets) {
          const fmt = is3DFile(f.storage_path) || is3DFile(f.filename);
          if (!fmt) continue;
          const { data } = await supabase.storage
            .from('work-order-photos')
            .createSignedUrl(f.storage_path, 60 * 10);
          if (data?.signedUrl) {
            items.push({ id: f.id, name: f.filename, url: data.signedUrl, format: fmt });
          }
        }
        if (items.length > 0) setViewer3DFiles(items);
      }}
    />
  );

  // 3D Viewer modal — STL/PLY/OBJ dosyaları için ayrı lazy chunk
  const viewer3DEl = viewer3DFile && Platform.OS === 'web' ? (
    <React.Suspense fallback={null}>
      <Viewer3DModal
        visible={!!viewer3DFile}
        files={[viewer3DFile]}
        title={viewer3DFile.name}
        onClose={() => setViewer3DFile(null)}
      />
    </React.Suspense>
  ) : null;
  // Çoklu 3D viewer — tüm taramaları aynı sahnede üst üste
  const viewer3DAllEl = viewer3DFiles && Platform.OS === 'web' ? (
    <React.Suspense fallback={null}>
      <Viewer3DModal
        visible={!!viewer3DFiles}
        files={viewer3DFiles}
        title={`${viewer3DFiles.length} tarama birlikte`}
        onClose={() => setViewer3DFiles(null)}
      />
    </React.Suspense>
  ) : null;

  // Uygulama-içi görsel önizleme — koyu zemin, dosyaya/dışına dokununca kapanır.
  const imageViewerEl = imageViewer ? (
    <Modal visible transparent animationType="fade" onRequestClose={() => setImageViewer(null)}>
      <Pressable
        onPress={() => setImageViewer(null)}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        <Image source={{ uri: imageViewer.url }} style={{ width: '100%', height: '82%' }} resizeMode="contain" />
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 18 }}>
          <Text style={{ flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{imageViewer.name}</Text>
          <Pressable onPress={() => setImageViewer(null)} hitSlop={10} style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 18, lineHeight: 18 }}>×</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  ) : null;

  // Uygulama-içi HTML tasarım önizleme — exocad web viewer'ı iframe ile gömer.
  const closeHtmlViewer = () => {
    if (htmlViewer?.url?.startsWith('blob:')) { try { URL.revokeObjectURL(htmlViewer.url); } catch {} }
    setHtmlViewer(null);
  };
  const htmlViewerEl = htmlViewer && Platform.OS === 'web' ? (
    <Modal visible transparent animationType="fade" onRequestClose={closeHtmlViewer}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', padding: 16 }}>
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
            {React.createElement('iframe', {
              src: htmlViewer.url,
              style: { flex: 1, width: '100%', height: '100%', border: 0, backgroundColor: '#FFFFFF' },
              title: htmlViewer.name,
            })}
          </View>
        </View>
      </View>
    </Modal>
  ) : htmlViewer && Platform.OS !== 'web' && HtmlWebView ? (
    <Modal visible transparent animationType="fade" onRequestClose={closeHtmlViewer}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', padding: 12 }}>
        <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#0A0A0A' }} numberOfLines={1}>{htmlViewer.name}</Text>
            <Pressable onPress={closeHtmlViewer} hitSlop={10} style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 18, lineHeight: 18, color: '#334155' }}>×</Text>
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
                  <ActivityIndicator size="large" color={accent} />
                </View>
              )}
            />
          </View>
        </View>
      </View>
    </Modal>
  ) : null;

  // ── triggerStyle='row' — kompakt drop-zone (sipariş detay için) ──
  // Card variant ile aynı görsel dil: ortalı ikon kutusu + başlık + alt yazı.
  if (triggerStyle === 'row') {
    return (
      <>
        <Pressable
          onPress={() => setModalOpen(true)}
          disabled={uploading}
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 18,
            paddingHorizontal: 14,
            opacity: uploading ? 0.5 : 1,
            ...(Platform.OS === 'web' ? {
              cursor: uploading ? 'wait' : 'pointer',
              transition: 'background-color 0.15s',
            } as any : {}),
          }}
        >
          <View style={{
            width: 44, height: 44, borderRadius: 12,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: hexA(accent, 0.10),
          }}>
            <UploadCloud size={20} color={accent} strokeWidth={1.8} />
          </View>
          <Text style={{
            fontSize: 13.5, fontWeight: '600', color: accent,
            letterSpacing: -0.1,
          }}>
            {uploading ? 'Yükleniyor…' : 'Dosya Yükleme'}
          </Text>
          <Text style={{ fontSize: 11, color: P.ink400, textAlign: 'center' }}>
            Fotoğraf, STL, PLY, PDF eklemek için tıklayın
          </Text>
        </Pressable>
        {modalEl}
        {viewer3DEl}
        {viewer3DAllEl}
        {imageViewerEl}
        {htmlViewerEl}
      </>
    );
  }

  // ── triggerStyle='card' — DS panel pattern ──
  //   rounded-card 14 · border P.ink100 · shadow-cardLite (web)
  return (
    <View style={{
      borderRadius: 14,
      backgroundColor: P.surface, overflow: 'hidden',
      ...(fillHeight ? { flex: 1 } : {}),
      ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.06)' } as any : {}),
    }}>
      {/* Header — arka plan ve alt çizgi yok, gövdeyle akışkan */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{
            width: 22, height: 22, borderRadius: 7,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: hexA(accent, 0.12),
          }}>
            <FileUp size={12} color={accent} strokeWidth={1.8} />
          </View>
          <Text style={{ fontSize: 11, fontWeight: '700', color: P.ink900, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            Sipariş Dosyaları
          </Text>
        </View>
        <Text style={{ fontSize: 10.5, color: P.ink400 }}>
          {files.length === 0 ? '—' : `${files.length} dosya`}
        </Text>
      </View>

      {/* Yükle drop-zone — mavi accent tonunda, kompakt, ORTALI */}
      <Pressable
        onPress={() => setModalOpen(true)}
        disabled={uploading}
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 18,
          paddingHorizontal: 14,
          opacity: uploading ? 0.5 : 1,
          ...(Platform.OS === 'web' ? {
            cursor: uploading ? 'wait' : 'pointer',
            transition: 'background-color 0.15s',
          } as any : {}),
        }}
      >
        {/* İkon kutusu — accent mavi tonu */}
        <View style={{
          width: 44, height: 44, borderRadius: 12,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: hexA(accent, 0.10),
        }}>
          <UploadCloud size={20} color={accent} strokeWidth={1.8} />
        </View>

        {/* Başlık */}
        <Text style={{
          fontSize: 13.5, fontWeight: '600', color: accent,
          letterSpacing: -0.1,
        }}>
          {uploading ? 'Yükleniyor…' : 'Dosya Yükleme'}
        </Text>

        {/* Alt yazı */}
        <Text style={{ fontSize: 11, color: P.ink400, textAlign: 'center' }}>
          Fotoğraf, STL, PLY, PDF eklemek için tıklayın
        </Text>
      </Pressable>

      {/* Files list — hideFileList ise hiç render etme (sipariş detayda dış liste var) */}
      {hideFileList ? null : loading ? (
        <View style={{ paddingVertical: 16, alignItems: 'center', ...(fillHeight ? { flex: 1 } as any : {}) }}>
        </View>
      ) : files.length === 0 ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, ...(fillHeight ? { flex: 1, justifyContent: 'center' } as any : {}) }}>
          <Text style={{ fontSize: 11, color: P.ink400, textAlign: 'center' }}>
            Henüz dosya yüklenmedi
          </Text>
        </View>
      ) : (
        <View style={fillHeight ? { flex: 1, paddingBottom: 8 } : { paddingBottom: 8 }}>
          {fileGroups.map((g) => {
          const isOpen = openGroups[g.key] ?? defaultOpen;
          const GIcon = inferIcon(g.items[0]?.storage_path ?? g.items[0]?.filename ?? '');
          return (
          <View key={g.key}>
            {/* Kategori başlığı — dokunulunca açılır/kapanır */}
            <Pressable
              onPress={() => setOpenGroups(prev => ({ ...prev, [g.key]: !isOpen }))}
              style={({ pressed }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingHorizontal: 12, paddingVertical: 8,
                backgroundColor: pressed ? P.ink50 : 'transparent',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <GIcon size={12} color={P.ink400} strokeWidth={1.8} />
              <Text style={{ flex: 1, fontSize: 11.5, fontWeight: '700', color: P.ink700 }} numberOfLines={1}>
                {g.key}
              </Text>
              <Text style={{ fontSize: 10.5, fontWeight: '600', color: P.ink400 }}>{g.items.length}</Text>
              <ChevronDown
                size={13}
                color={P.ink400}
                strokeWidth={2}
                style={Platform.OS === 'web'
                  ? ({ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] } as any)
                  : undefined}
              />
            </Pressable>

            {isOpen && g.items.map((f) => {
            const Icon = inferIcon(f.filename);
            return (
              <View
                key={f.id}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 9,
                  paddingHorizontal: 12, paddingVertical: 5,
                }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 6,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: hexA(accent, 0.10),
                  borderWidth: 1, borderColor: hexA(accent, 0.20),
                }}>
                  <Icon size={11} color={accent} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: P.ink900 }} numberOfLines={1}>
                    {f.filename}
                  </Text>
                  <Text style={{ fontSize: 10, color: P.ink400 }} numberOfLines={1}>
                    {new Date(f.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {f.__inherited && (
                    <Text style={{
                      fontSize: 8.5, fontWeight: '700', color: accent, letterSpacing: 0.3,
                      textTransform: 'uppercase', backgroundColor: hexA(accent, 0.10),
                      paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, overflow: 'hidden',
                    }}>
                      Asıl iş
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={() => handleOpen(f)}
                  hitSlop={6}
                  style={({ hovered }: any) => ({
                    width: 22, height: 22, borderRadius: 6,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: hovered ? P.ink50 : 'transparent',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                  // @ts-ignore web tooltip
                  title="Önizle"
                >
                  <Eye size={11} color={P.ink500} strokeWidth={1.8} />
                </Pressable>
                <Pressable
                  onPress={() => handleDownload(f)}
                  hitSlop={6}
                  style={({ hovered }: any) => ({
                    width: 22, height: 22, borderRadius: 6,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: hovered ? P.ink50 : 'transparent',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                  // @ts-ignore web tooltip
                  title="İndir"
                >
                  <Download size={11} color={P.ink500} strokeWidth={1.8} />
                </Pressable>
                {!f.__inherited && canRemoveFile(f.uploaded_by) && (
                  <Pressable
                    onPress={() => handleDelete(f)}
                    hitSlop={6}
                    style={({ hovered }: any) => ({
                      width: 22, height: 22, borderRadius: 6,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: hovered ? hexA('#DC2626', 0.10) : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    })}
                  >
                    <Trash2 size={11} color="#DC2626" strokeWidth={1.8} />
                  </Pressable>
                )}
              </View>
            );
            })}
          </View>
          );
          })}
        </View>
      )}

      {/* Modal — yukarıda tanımlanan paylaşılan element */}
      {modalEl}
      {viewer3DEl}
      {viewer3DAllEl}
      {imageViewerEl}
      {htmlViewerEl}
    </View>
  );
}
