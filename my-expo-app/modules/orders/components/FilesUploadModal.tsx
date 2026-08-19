// modules/orders/components/FilesUploadModal.tsx
// Ortak Dosya Yükleme Modali — NewOrderScreen'in upload modal'ı baz alındı.
// Hem yeni iş emri hem mevcut iş detay popup'ı tarafından kullanılır.
//
// Veri akışı: caller `attachments` listesi geçer; her kategori kartı,
// `name.startsWith(label)` eşleşmesine göre dolu/boş gösterilir. Pick
// callback'leri ile dosya yükleme caller tarafında yapılır (lokal draft
// veya backend upload — component bunu bilmez).

import React from 'react';
import { isRTL } from '../../../core/i18n';
import { dirIcon } from '../../../core/i18n';
import {
  View, Text, ScrollView, Modal, Pressable, TouchableOpacity, Image, Platform, StyleSheet,
  Animated, Easing, useWindowDimensions,
} from 'react-native';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { AppIcon } from '../../../core/ui/AppIcon';
import { F } from '../../../core/theme/typography';
import { LinearProgressX, PercentRingX } from '../../../core/ui/ProgressX';
import { dsTheme, type DsTheme } from '../../../core/theme/dsTokens';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

/**
 * Satırda küçük resim gösterilsin mi? `kind` her zaman set edilmiyor (WhatsApp/
 * devralınan dosyalarda boş gelebiliyor), o yüzden uzantıya da bakılır.
 * SVG bilerek dışarıda: RN Image onu çizemiyor, boş kutu görünürdü.
 */
/** "Gülüş Fotoğrafı · WhatsApp Image 2026….jpeg" → "Gülüş Fotoğrafı".
 *  Etiket yoksa uzantısız dosya adına düşer. */
/** Hero görselin üstünde yüzen ileri/geri düğmesi. */
const heroNavBtn = {
  position: 'absolute' as const,
  top: '50%' as any, marginTop: -17,
  width: 34, height: 34, borderRadius: 17,
  alignItems: 'center' as const, justifyContent: 'center' as const,
  backgroundColor: 'rgba(255,255,255,0.9)',
  ...(Platform.OS === 'web'
    ? ({ cursor: 'pointer', backdropFilter: 'blur(6px)', boxShadow: '0 2px 8px rgba(15,23,42,0.16)' } as any)
    : {}),
};

function shortLabel(name: string): string {
  const first = String(name ?? '').split('·')[0].trim();
  if (first && first !== name.trim()) return first;
  return first.replace(/\.[a-z0-9]{2,5}$/i, '');
}

function isPreviewable(att: UploadAttachment): boolean {
  if (!att.uri) return false;
  const n = `${att.filename ?? ''} ${att.name ?? ''}`.toLowerCase();
  // Uzantı önce: `kind` çağıran tarafta yanlış set edilebiliyor (bilinmeyen
  // türler 'image'a düşüyordu → zip için boş küçük resim kutusu çiziliyordu).
  if (/\.(zip|rar|7z|tar|gz|stl|ply|obj|3mf|dcm|pdf|mp4|mov|webm)(\s|$|\?)/.test(n)) return false;
  if (/\.(png|jpe?g|webp|gif|bmp|heic|heif|avif)(\s|$|\?)/.test(n)) return true;
  return att.kind === 'image';
}

export interface UploadAttachment {
  id:    string;
  name:  string;                          // örn: "Ekartörlü Resim.jpg" (label/caption)
  uri:   string;
  kind?: 'image' | 'video' | 'pdf' | 'scan';
  /** Yükleme zamanı — sağ panelde "yeni üstte" sıralaması için. */
  created_at?: string | null;
  /** Bu dosya üzerinde silme/düzenleme yetkisi var mı? Caller hesaplayıp geçer. */
  canRemove?: boolean;
  /** Orijinal dosya adı (uzantı dahil) — 3D viewer için format tespiti. */
  filename?: string;
}

export interface FilesUploadModalProps {
  visible:     boolean;
  onClose:     () => void;
  accentColor: string;
  attachments: UploadAttachment[];

  /** Picker handlers — caller fotoğraf/video/tarama/PDF seçtirir ve attachments'a ekler */
  onPickPhoto: (label: string) => void;
  onPickVideo: (label: string) => void;
  onPickScan:  (label: string) => void;
  onPickPdf:   (label: string) => void;
  /** Opsiyonel — tarayıcıdan çıkan ZIP/arşiv seçtirir. Verilmezse ZIP kartı gizli. */
  onPickZip?:  (label: string) => void;

  onPreview?:  (att: UploadAttachment) => void;
  onRemove?:   (id: string) => void;
  /** Dosyayı doğrudan indir — preview butonunun yanında ikinci buton. */
  onDownload?: (att: UploadAttachment) => void;
  /** Tüm 3D taramaları (STL/PLY/OBJ) tek viewer'da aç. */
  onPreviewAll3D?: () => void;
  /** Yüklenen 3D dosya sayısı — "Tümünü 3D Aç (N)" butonu için. */
  count3D?: number;

  /** İsteğe bağlı render slot'ları (NewOrder'daki implant marka dropdown'u, kapanış analizi vb.) */
  occlusionCta?:    React.ReactNode;
  implantBrandSlot?: React.ReactNode;
  /** İmplant Bilgileri grubunun TÜM içeriğini (scan body + marka + download)
   *  custom bir component ile değiştir. Verilirse default scan card + brand slot
   *  render edilmez. Premium implant section render slot. */
  implantSectionContent?: React.ReactNode;

  /** Modal başlığını özelleştir */
  title?: string;

  /** İş türü implant değilse "İmplant Bilgileri" grubunu gizle (default: true = göster). */
  showImplant?: boolean;

  /** Footer'da (Tamam'ın solunda) opsiyonel CTA — ör. "Hekim Onayına Gönder". */
  footerCta?: React.ReactNode;
  /** Tarama parçaları (scan body) laboratuvara fiziksel teslim edildi mi? */
  scanBodiesDelivered?: boolean;
  /** Verilirse toggle tıklanabilir olur (doktor); verilmezse salt-okunur (lab görür). */
  onToggleScanBodiesDelivered?: () => void;

  /**
   * Aşama-spesifik ekstra dosya kategorileri — modal'ın EN ÜSTÜNDE açık olarak
   * render edilir. Stage workspace'inden geçirilir (örn. CAD aşamasında "Tasarım"
   * grubu otomatik açık gelir).
   */
  extraGroups?: Array<{
    title: string;
    color: string;
    items: Array<{ label: string; kind: 'image' | 'video' | 'scan' | 'pdf' | 'any' }>;
    /** Grup kartlarının altında opsiyonel aksiyon (ör. "Hekim Onayına Gönder"). */
    cta?: React.ReactNode;
  }>;

  /**
   * Split view — sol kategori grid + sağ yüklenmiş dosyalar listesi.
   * Workstation kullanımında varsayılan true; new order için false.
   */
  splitView?: boolean;

  /**
   * Aktif yüklemeler — sağ panel listesinin tepesinde her yükleme için bir
   * progress bar gösterir + yüklenen kategori kartlarının üzerinde ring overlay.
   * Paralel yüklemeleri destekler.
   */
  uploadingStates?: Array<{
    id: string;
    filename: string;
    progress?: number | null;       // 0-100 veya null (indeterminate)
    /** Hangi kategori kartı yükleniyor — kart üstünde ring göstermek için */
    label?: string;
  }> | null;

  /** Patterns tema seçimi — LinearProgressX/PercentRingX renk skalası */
  progressTheme?: DsTheme;

  /**
   * true ise `extraGroups` (lab/istasyon çıktı kategorileri) içinde YALNIZCA
   * yüklenmiş dosyaya sahip kartlar gösterilir; boş upload slotları ve hiç
   * dosyası olmayan gruplar gizlenir. Hekim/klinik panelinde lab çıktılarını
   * "sadece yüklenmiş olanları göster" görünümüne çevirir. Hekimin kendi girdi
   * kategorileri (Tarama/Gülüş/İmplant/Ek) etkilenmez.
   */
  hideEmptyExtraGroups?: boolean;
}

// ─── Slot etiketleri — TR diş hekimliği terminolojisi, tutarlı genitif kullanımı
const SMILE_PHOTO_LABELS: ReadonlyArray<string> = ['Ekartörlü Fotoğraf', 'Gülüş Fotoğrafı'];
const SMILE_VIDEO_LABEL = 'Gülüş Videosu';
// Tarama Verileri — hepsi "… Taraması" formatında, parantezsiz
const SCAN_LABELS:       ReadonlyArray<string> = ['Üst Çene Taraması', 'Alt Çene Taraması', 'Kapanış Taraması', 'Diş Eti Taraması'];
// Tarayıcıdan çıkan tek ZIP/arşiv (çoklu STL/PLY + meta) — Tarama Verileri grubunda.
const SCAN_ZIP_LABEL = 'Tarama Arşivi (ZIP)';
const IMPLANT_SCAN_LABEL = 'Scan Body Taraması';
const SCAN_PARTS_PHOTO_LABEL = 'Tarama Parçaları Görseli';
const PDF_LABEL          = 'PDF Belgesi';
const REF_PHOTO_LABEL    = 'Referans Fotoğrafı';

export function FilesUploadModal({
  visible, onClose, accentColor, attachments,
  onPickPhoto, onPickVideo, onPickScan, onPickPdf, onPickZip,
  onPreview, onRemove, onDownload, onPreviewAll3D, count3D = 0,
  occlusionCta, implantBrandSlot, implantSectionContent,
  title = 'Dosya Yükleme',
  extraGroups,
  splitView = false,
  uploadingStates,
  progressTheme = 'exec',
  hideEmptyExtraGroups = false,
  showImplant = true,
  footerCta,
  scanBodiesDelivered = false,
  onToggleScanBodiesDelivered,
}: FilesUploadModalProps) {
  // Eski caption isimleri yeni etiketlerle eşleşmeye devam etsin (legacy uyumluluk).
  const LEGACY_LABEL_ALIASES: Record<string, string[]> = {
    'Ekartörlü Fotoğraf':  ['Ekartörlü Resim'],
    'Gülüş Fotoğrafı':     ['Gülüş Resmi'],
    'Üst Çene Taraması':   ['Üst Çene'],
    'Alt Çene Taraması':   ['Alt Çene'],
    'Kapanış Taraması':    ['Bite (Kapanış)', 'Bite'],
    'Scan Body Taraması':  ['Scan Body STL'],
    'Referans Fotoğrafı':  ['Referans Fotoğraf'],
  };
  const findByLabel = (label: string) => {
    const direct = attachments.find(a => a.name.startsWith(label));
    if (direct) return direct;
    const aliases = LEGACY_LABEL_ALIASES[label] ?? [];
    for (const alt of aliases) {
      const hit = attachments.find(a => a.name.startsWith(alt));
      if (hit) return hit;
    }
    return null;
  };
  // Çok-dosyalı slot: bir etiketin (legacy alias'lar dahil) TÜM dosyaları.
  const filterByLabel = (label: string): UploadAttachment[] => {
    const prefixes = [label, ...(LEGACY_LABEL_ALIASES[label] ?? [])];
    const seen = new Set<string>();
    const out: UploadAttachment[] = [];
    for (const a of attachments) {
      if (!seen.has(a.id) && prefixes.some(p => a.name.startsWith(p))) {
        seen.add(a.id);
        out.push(a);
      }
    }
    return out;
  };
  const P = accentColor;
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { width: SW } = useWindowDimensions();
  const isMobile = SW < 768;

  // Theme-aware overrides — merged via array at usage sites
  const themeGroup = {
    backgroundColor: 'transparent',
    borderColor: isDark ? 'rgba(255,255,255,0.10)' : T.hairline,
    // Mobile: tek kolon, full-width
    ...(isMobile ? { flexBasis: '100%' as any, flexGrow: 1 } : {}),
  };
  const themeGroupTitle = { color: T.ink };
  const themeCard = {
    backgroundColor: T.cardSoft,
    borderColor: isDark ? 'rgba(255,255,255,0.10)' : '#E2E8F0',
  };
  const themeCardDashed = {
    borderColor: isDark ? 'rgba(255,255,255,0.18)' : '#CBD5E1',
  };
  const themeCardLabel = { color: T.ink };
  const themeCardLabelMuted = { color: T.ink3 };

  const activeUploads = uploadingStates ?? [];
  const hasUploads = activeUploads.length > 0;

  // Bu kart şu an yükleniyor mu? — herhangi bir aktif yüklemede label eşleşirse true.
  const findUploadForLabel = (label: string) => {
    const prefixes = [label, ...(LEGACY_LABEL_ALIASES[label] ?? [])];
    return activeUploads.find(u => prefixes.some(p => (u.label ?? '').startsWith(p))) ?? null;
  };
  const isUploadingLabel = (label: string) => !!findUploadForLabel(label);

  const renderUploadingButton = (label: string) => {
    const u = findUploadForLabel(label);
    const pct = u?.progress != null
      ? Math.max(0, Math.min(100, Math.round(u.progress)))
      : 0;
    return (
      <View style={{
        position: 'absolute' as any,
        bottom: 4, end: 4,
        width: 36, height: 36,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <PercentRingX
          value={pct}
          size={36}
          theme={progressTheme}
          weight="700"
          animate={false}
          textColor={P}
        />
      </View>
    );
  };

  // ── Çok-dosyalı slot yardımcıları ───────────────────────────────────────
  // Bir etiket altında BİRDEN ÇOK dosya olabilir (Alt Çene için STL+PLY, 6 foto…).
  // Her dosya kendi kutusudur; kutudaki buton satırının SONUNDA "+" ile aynı
  // slota yeni dosya eklenir — "+" her dosya kutusunda kalır.

  // Tek bir yüklenmiş dosya kutusu (önizle / indir / + ekle / sil).
  const renderFileTile = (att: UploadAttachment, color: string, iconName: string, onAdd: () => void) => {
    const isImg = att.kind === 'image';
    const ext = (att.filename || att.name).split('.').pop() || '';
    return (
      <TouchableOpacity
        key={att.id}
        style={[s.uploadCard, themeCard]}
        onPress={() => onPreview?.(att)}
        activeOpacity={0.8}
      >
        <View style={[s.uploadCardTab, { backgroundColor: '#22C55E' }]} />
        <View style={s.uploadCardBody}>
          {isImg ? (
            <View style={s.uploadCardThumbWrap}>
              <Image source={{ uri: att.uri }} style={s.uploadCardThumbImg} resizeMode="cover" />
              <View style={s.uploadCardThumbOverlay}>
                <AppIcon name={'eye-outline' as any} size={18} color="#FFFFFF" />
              </View>
            </View>
          ) : (
            <View style={s.uploadCardIcon}>
              <AppIcon name={iconName as any} size={28} color="#22C55E" />
            </View>
          )}
          <Text style={[s.uploadCardLabel, { color: T.ink }]} numberOfLines={2}>{att.name}</Text>
          {!isImg && /^[a-z0-9]{2,5}$/i.test(ext) && (
            <Text style={[s.uploadCardFileName, { color: '#22C55E' }]} numberOfLines={1}>
              {ext.toUpperCase()}
            </Text>
          )}
        </View>
        <View style={{
          position: 'absolute', bottom: 6, left: 6, right: 6,
          flexDirection: 'row', justifyContent: 'center', gap: 5,
        }}>
          <TouchableOpacity
            style={{ flex: 1, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: '#22C55E' }}
            onPress={(e) => { (e as any).stopPropagation?.(); onPreview?.(att); }}
            activeOpacity={0.85}
          >
            <AppIcon name={'eye-outline' as any} size={13} color="#FFFFFF" />
          </TouchableOpacity>
          {onDownload && (
            <TouchableOpacity
              style={{ flex: 1, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: '#94A3B8' }}
              onPress={(e) => { (e as any).stopPropagation?.(); onDownload(att); }}
              activeOpacity={0.85}
            >
              <AppIcon name={'download' as any} size={13} color="#FFFFFF" />
            </TouchableOpacity>
          )}
          {/* Sona "+" — aynı slota yeni dosya ekle, butonu hep yerinde kalır */}
          <TouchableOpacity
            style={{ flex: 1, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: color }}
            onPress={(e) => { (e as any).stopPropagation?.(); onAdd(); }}
            activeOpacity={0.85}
          >
            <AppIcon name={'plus' as any} size={15} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        {onRemove && att.canRemove && (
          <TouchableOpacity
            style={s.uploadCardDel}
            onPress={(e) => { (e as any).stopPropagation?.(); onRemove(att.id); }}
            activeOpacity={0.8}
          >
            <AppIcon name={'close' as any} size={12} color="#EF4444" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  // Boş slot — kategori ikonu + etiket + yükle butonu (ilk dosya); yüklenirken ring.
  const renderEmptyTile = (label: string, color: string, iconName: string, onPick: () => void) => (
    <TouchableOpacity
      key={`add-${label}`}
      style={[s.uploadCard, themeCard, s.uploadCardDashed, themeCardDashed]}
      onPress={onPick}
      activeOpacity={0.8}
    >
      <View style={[s.uploadCardTab, { backgroundColor: color }]} />
      <View style={s.uploadCardBody}>
        <View style={s.uploadCardIcon}>
          <AppIcon name={iconName as any} size={28} color={color} />
        </View>
        <Text style={[s.uploadCardLabel, { color: T.ink3 }]} numberOfLines={2}>{label}</Text>
      </View>
      {isUploadingLabel(label) ? renderUploadingButton(label) : (
        <View style={[s.uploadCardBtn, { backgroundColor: color }]}>
          <AppIcon name={'upload'} size={16} color="#FFFFFF" />
        </View>
      )}
    </TouchableOpacity>
  );

  // Dolu slotta yeni dosya yüklenirken gösterilen geçici "yükleniyor" kutusu (ring).
  const renderUploadingTile = (label: string, color: string) => (
    <View key={`uploading-${label}`} style={[s.uploadCard, themeCard, s.uploadCardDashed, themeCardDashed]}>
      <View style={[s.uploadCardTab, { backgroundColor: color }]} />
      <View style={s.uploadCardBody}>
        <View style={s.uploadCardIcon}>
          <AppIcon name={'cloud-upload-outline' as any} size={26} color={color} />
        </View>
        <Text style={[s.uploadCardLabel, { color: T.ink3 }]} numberOfLines={2}>Yükleniyor…</Text>
      </View>
      {renderUploadingButton(label)}
    </View>
  );

  // Slot = boşsa tek yükleme kutusu; doluysa her dosya kutusu (+ butonlu)
  // ve yeni yükleme varsa sonda "yükleniyor" kutusu.
  const renderSlot = (label: string, color: string, iconName: string, onPick: () => void) => {
    const files = filterByLabel(label);
    if (files.length === 0) {
      return renderEmptyTile(label, color, iconName, onPick);
    }
    return (
      <React.Fragment key={`slot-${label}`}>
        {files.map(f => renderFileTile(f, color, iconName, onPick))}
        {isUploadingLabel(label) && renderUploadingTile(label, color)}
      </React.Fragment>
    );
  };

  const renderPhotoCard = (label: string, color: string) =>
    renderSlot(label, color, 'image-outline', () => onPickPhoto(label));

  const renderVideoCard = (label: string, color: string) =>
    renderSlot(label, color, 'video-outline', () => onPickVideo(label));

  const renderScanCard = (label: string, color: string, iconName: string) =>
    renderSlot(label, color, iconName, () => onPickScan(label));

  const renderPdfCard = (label: string, color: string) =>
    renderSlot(label, color, 'file-pdf-box', () => onPickPdf(label));

  // Tarama parçaları (scan body) lab'a fiziksel teslim edildi — tıklanabilir kart.
  // onToggle verilirse doktor değiştirir; verilmezse lab salt-okunur görür.
  const renderScanDeliveredCard = () => {
    const on = scanBodiesDelivered;
    const interactive = !!onToggleScanBodiesDelivered;
    const green = '#22C55E';
    const offBorder = isDark ? 'rgba(255,255,255,0.16)' : '#CBD5E1';
    return (
      <TouchableOpacity
        key="scan-delivered"
        style={[
          s.uploadCard,
          {
            borderWidth: 1.5,
            borderStyle: 'solid' as any,
            borderColor: on ? green : offBorder,
            backgroundColor: on ? green + '12' : (themeCard.backgroundColor as any),
          },
        ]}
        onPress={interactive ? onToggleScanBodiesDelivered : undefined}
        activeOpacity={interactive ? 0.8 : 1}
      >
        <View style={[s.uploadCardBody, { justifyContent: 'center' }]}>
          {/* Onay kutusu */}
          <View style={{
            width: 30, height: 30, borderRadius: 9,
            borderWidth: 2,
            borderColor: on ? green : '#94A3B8',
            backgroundColor: on ? green : 'transparent',
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 9,
          }}>
            {on && <AppIcon name={'check' as any} size={18} color="#FFFFFF" />}
          </View>
          <Text style={[s.uploadCardLabel, { color: on ? T.ink : T.ink3, textAlign: 'center' }]} numberOfLines={2}>
            Tarama parçaları lab'a teslim
          </Text>
          <Text style={[s.uploadCardFileName, { color: on ? green : T.ink3, textAlign: 'center' }]} numberOfLines={1}>
            {on ? 'Teslim edildi' : (interactive ? 'İşaretlemek için dokun' : 'Bekleniyor')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Hero önizleme: üstte büyük görsel, altta küçük karolar. Seçim yapılmadıysa
  // ilk görsel gösterilir; görsel yoksa hero hiç çizilmez (STL/ZIP'in önizlemesi yok).
  const [heroId, setHeroId] = React.useState<string | null>(null);
  // Silme yıkıcı ve geri alınamaz — kullanıcı onaylamadan dosya kaldırılmaz.
  const [confirm, setConfirm] = React.useState<ConfirmState | null>(null);
  const askRemove = React.useCallback((att: UploadAttachment) => {
    setConfirm({
      title: 'Dosyayı sil',
      highlight: shortLabel(att.name),
      message: 'dosyası siparişten kaldırılacak. Bu işlem geri alınamaz.',
      variant: 'danger',
      label: 'Evet, sil',
      onConfirm: () => { onRemove?.(att.id); },
    });
  }, [onRemove]);
  const heroImages = React.useMemo(() => attachments.filter(isPreviewable), [attachments]);
  const heroFile = React.useMemo(
    () => (heroImages.length ? (heroImages.find(a => a.id === heroId) ?? heroImages[0]) : null),
    [heroImages, heroId],
  );
  const stepHero = React.useCallback((d: number) => {
    if (heroImages.length < 2 || !heroFile) return;
    const i = heroImages.findIndex(a => a.id === heroFile.id);
    setHeroId(heroImages[(i + d + heroImages.length) % heroImages.length].id);
  }, [heroImages, heroFile]);

  // ── Sağ panel "Yüklenen Dosyalar" — yükleme KUTUSU (kategori) bazlı gruplama,
  //    yeni yüklenen üstte (en son eklenen → en üst kategori + grup içinde en üst).
  const uploadedGroups = React.useMemo(() => {
    const cats: Array<{ title: string; color: string; labels: string[] }> = [
      ...(extraGroups ?? []).map(g => ({ title: g.title, color: g.color, labels: g.items.map(i => i.label) })),
      { title: 'Tarama Verileri',   color: '#0EA5E9', labels: [...SCAN_LABELS, SCAN_ZIP_LABEL] },
      { title: 'Gülüş Tasarımı',    color: P,         labels: [...SMILE_PHOTO_LABELS, SMILE_VIDEO_LABEL] },
      { title: 'İmplant Bilgileri', color: '#8B5CF6', labels: [IMPLANT_SCAN_LABEL, SCAN_PARTS_PHOTO_LABEL] },
      { title: 'Ek Dosyalar',       color: '#F59E0B', labels: [PDF_LABEL, REF_PHOTO_LABEL] },
    ];
    const catFor = (name: string) => {
      for (const c of cats) {
        for (const lbl of c.labels) {
          if (name.startsWith(lbl)) return c;
          for (const alt of (LEGACY_LABEL_ALIASES[lbl] ?? [])) if (name.startsWith(alt)) return c;
        }
      }
      return { title: 'Diğer', color: '#94A3B8', labels: [] };
    };
    // Recency: created_at varsa gerçek zaman; yoksa dizi sırası (append → artan = daha yeni).
    const rec = (att: UploadAttachment, idx: number) => {
      const t = att.created_at ? Date.parse(att.created_at) : NaN;
      return Number.isNaN(t) ? idx : t;
    };
    const map = new Map<string, { title: string; color: string; items: Array<{ att: UploadAttachment; r: number }> }>();
    attachments.forEach((att, idx) => {
      const c = catFor(att.name);
      if (!map.has(c.title)) map.set(c.title, { title: c.title, color: c.color, items: [] });
      map.get(c.title)!.items.push({ att, r: rec(att, idx) });
    });
    return Array.from(map.values())
      .map(g => ({
        title: g.title, color: g.color,
        maxR: g.items.reduce((m, x) => Math.max(m, x.r), -Infinity),
        items: g.items.sort((a, b) => b.r - a.r).map(x => x.att),  // grup içi: yeni üstte
      }))
      .sort((a, b) => b.maxR - a.maxR);  // en son yüklenen kategori en üstte
  }, [attachments, extraGroups, P]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      // Android donanım geri tuşu — yükleme sırasında engelle
      onRequestClose={() => { if (!hasUploads) onClose(); }}
    >
      {/* Overlay click-to-close KALDIRILDI — picker/upload sonrası
          istem dışı kapanmayı önlemek için. Yalnızca üstteki X veya
          alttaki Tamam butonu kapatır. */}
      <View style={s.umOverlay}>
        <View
          style={[
            s.umCard,
            { backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline },
            splitView && { maxWidth: 1400 },
          ]}
        >
          {/* Header */}
          <View style={[s.umHeader, { borderBottomColor: T.hairline }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[s.umHeaderIcon, { backgroundColor: P + '18' }]}>
                <AppIcon name={'cloud-upload-outline' as any} size={20} color={P} />
              </View>
              <Text style={[s.umHeaderTitle, { color: T.ink }]}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[s.umCloseBtn, { backgroundColor: T.cardSoft }]}>
              <AppIcon name={'close' as any} size={20} color={T.ink2} />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1, flexDirection: splitView && !isMobile ? 'row' : 'column' }}>
          <ScrollView
            style={{ flex: splitView && !isMobile ? 1.6 : 1, borderEndWidth: splitView && !isMobile ? 1 : 0, borderEndColor: T.hairline }}
            contentContainerStyle={{ padding: isMobile ? 14 : 24 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.umGrid}>
              {/* SIRA: önce hekim/klinik kaynak dosyaları (tarama, gülüş, implant,
                  ek/referans), sonra lab üretim çıktıları (Tasarım Çıktıları,
                  Kalite Kontrol — extraGroups) en sonda gösterilir. */}

              {/* ── Grup 1: Tarama Verileri ── */}
              <View style={[s.umGroup, themeGroup]}>
                <View style={[s.umGroupHeader, { flexDirection: 'row', alignItems: 'center' }]}>
                  <View style={[s.umGroupDot, { backgroundColor: '#0EA5E9' }]} />
                  <Text style={[s.umGroupTitle, themeGroupTitle]}>Tarama Verileri</Text>
                  {onPreviewAll3D && count3D >= 2 && (
                    <TouchableOpacity
                      onPress={onPreviewAll3D}
                      style={{
                        marginStart: 'auto' as any,
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                        backgroundColor: accentColor,
                      }}
                      activeOpacity={0.85}
                    >
                      <AppIcon name="cube-outline" size={12} color="#FFFFFF" />
                      <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                        Tümünü 3D Aç ({count3D})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={s.uploadCardRow}>
                  {SCAN_LABELS.map(label => renderScanCard(label, '#0EA5E9', 'cube-outline'))}
                  {onPickZip && renderSlot(SCAN_ZIP_LABEL, '#0EA5E9', 'folder-zip-outline', () => onPickZip(SCAN_ZIP_LABEL))}
                </View>
                {occlusionCta}
              </View>

              {/* ── Grup 2: Gülüş Tasarımı ── */}
              <View style={[s.umGroup, themeGroup]}>
                <View style={s.umGroupHeader}>
                  <View style={[s.umGroupDot, { backgroundColor: P }]} />
                  <Text style={[s.umGroupTitle, themeGroupTitle]}>Gülüş Tasarımı</Text>
                </View>
                <View style={s.uploadCardRow}>
                  {SMILE_PHOTO_LABELS.map(label => renderPhotoCard(label, P))}
                  {renderVideoCard(SMILE_VIDEO_LABEL, P)}
                </View>
              </View>

              {/* ── Grup 3: İmplant Bilgileri (yalnız implant iş türünde) ── */}
              {showImplant && (
              <View style={[s.umGroup, themeGroup]}>
                <View style={s.umGroupHeader}>
                  <View style={[s.umGroupDot, { backgroundColor: '#8B5CF6' }]} />
                  <Text style={[s.umGroupTitle, themeGroupTitle]}>İmplant Bilgileri</Text>
                </View>
                {implantSectionContent ?? (
                  <View style={s.uploadCardRow}>
                    {renderScanCard(IMPLANT_SCAN_LABEL, '#8B5CF6', 'tooth-outline')}
                    {renderPhotoCard(SCAN_PARTS_PHOTO_LABEL, '#8B5CF6')}
                    {renderScanDeliveredCard()}
                  </View>
                )}
              </View>
              )}

              {/* ── Grup 4: Ek Dosyalar ── */}
              <View style={[s.umGroup, themeGroup]}>
                <View style={s.umGroupHeader}>
                  <View style={[s.umGroupDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={[s.umGroupTitle, themeGroupTitle]}>Ek Dosyalar</Text>
                </View>
                <View style={s.uploadCardRow}>
                  {renderPdfCard(PDF_LABEL, '#F59E0B')}
                  {renderPhotoCard(REF_PHOTO_LABEL, '#F59E0B')}
                </View>
              </View>

              {/* ── Aşama-spesifik (Tasarım Çıktıları / Kalite Kontrol / CAD-CAM)
                  — lab üretim çıktıları EN SONDA (hekim kaynak dosyalarından sonra) ── */}
              {extraGroups?.map((group, gi) => {
                const renderForKind = (label: string, kind: 'image'|'video'|'scan'|'pdf'|'any') => {
                  if (kind === 'video') return renderVideoCard(label, group.color);
                  if (kind === 'pdf')   return renderPdfCard(label, group.color);
                  if (kind === 'scan')  return renderScanCard(label, group.color, 'cube-outline');
                  // 'any' = her tür (görsel/STL/PLY/HTML/belge). scan picker'ı ('*/*')
                  // kullanır ama önizleme slotu olduğu için göz ikonu taşır.
                  if (kind === 'any')   return renderScanCard(label, group.color, 'eye-outline');
                  return renderPhotoCard(label, group.color);
                };
                // Hekim/klinik: sadece yüklenmiş kartları göster; boş slotları ve
                // hiç dosyası olmayan grupları gizle.
                const visibleItems = hideEmptyExtraGroups
                  ? group.items.filter(it => !!findByLabel(it.label))
                  : group.items;
                if (hideEmptyExtraGroups && visibleItems.length === 0) return null;
                return (
                  <View key={`extra-${gi}-${group.title}`} style={[s.umGroup, themeGroup]}>
                    <View style={s.umGroupHeader}>
                      <View style={[s.umGroupDot, { backgroundColor: group.color }]} />
                      <Text style={[s.umGroupTitle, themeGroupTitle]}>{group.title}</Text>
                    </View>
                    <View style={s.uploadCardRow}>
                      {visibleItems.map(item => (
                        <React.Fragment key={item.label}>
                          {renderForKind(item.label, item.kind)}
                        </React.Fragment>
                      ))}
                    </View>
                    {group.cta ? <View style={{ marginTop: 10 }}>{group.cta}</View> : null}
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {/* ═══ SAĞ PANEL — split view: yüklenmiş dosyalar listesi
              (Mobile'da gizli — upload kartları zaten dolu/boş durumu gösteriyor) ═══ */}
          {splitView && !isMobile && (
            <ScrollView
              style={{ flex: 1, backgroundColor: isDark ? T.bg : '#FAFAF9' }}
              contentContainerStyle={{ padding: 20 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#475569', letterSpacing: 1.0, textTransform: 'uppercase' as any }}>
                  Yüklenen Dosyalar
                </Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: P + '14', borderWidth: 1, borderColor: P + '30' }}>
                  <Text style={{ fontSize: 11, fontFamily: F.bold, color: P }}>
                    {attachments.length}
                  </Text>
                </View>
              </View>

              {/* ── Hero önizleme ── */}
              {heroFile && (
                <View style={{ marginBottom: 14 }}>
                  {/* Oklar görselin İÇİNDE konumlanmalı — daha önce dış kaba
                      göre yerleşip şeridin arkasında kalıyorlardı. */}
                  <View style={{ position: 'relative' }}>
                    <Pressable
                      onPress={() => onPreview?.(heroFile)}
                      style={({ hovered }: any) => ({
                        width: '100%', height: 240, borderRadius: 12, overflow: 'hidden',
                        backgroundColor: '#0F172A08',
                        ...(Platform.OS === 'web'
                          ? ({ cursor: 'pointer',
                               boxShadow: hovered ? '0 10px 28px rgba(15,23,42,0.18)' : '0 1px 4px rgba(15,23,42,0.08)',
                               transition: 'box-shadow 150ms ease-out' } as any)
                          : {}),
                      })}
                    >
                      <Image source={{ uri: heroFile.uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                    </Pressable>
                    {heroImages.length > 1 && (
                      <>
                        <TouchableOpacity onPress={() => stepHero(-1)} style={[heroNavBtn, isRTL() ? { right: 8 } : { left: 8 }]} hitSlop={8} accessibilityLabel="Önceki">
                          <AppIcon name={dirIcon('chevron-left') as any} size={18} color="#0F172A" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => stepHero(1)} style={[heroNavBtn, isRTL() ? { left: 8 } : { right: 8 }]} hitSlop={8} accessibilityLabel="Sonraki">
                          <AppIcon name={dirIcon('chevron-right') as any} size={18} color="#0F172A" />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, fontFamily: F.semibold, color: '#475569' }}>
                      {shortLabel(heroFile.name)}
                    </Text>
                    <Text style={{ fontSize: 10.5, color: '#94A3B8' }}>
                      {heroImages.findIndex(a => a.id === heroFile.id) + 1} / {heroImages.length}
                    </Text>
                    {onRemove && heroFile.canRemove && (
                      <TouchableOpacity
                        onPress={() => askRemove(heroFile)}
                        style={{ width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEE2E2' }}
                        accessibilityLabel="Bu fotoğrafı sil"
                      >
                        <AppIcon name={'trash-2' as any} size={13} color="#DC2626" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* TEK şerit — fotoğraflar kategorilere dağılmıyor, hepsi burada.
                      Esnek pay: kaç tane olursa olsun tek sıraya sığar. */}
                  {heroImages.length > 1 && (
                    <View style={{
                      flexDirection: 'row', marginTop: 8, gap: 2,
                      borderRadius: 8, overflow: 'hidden', backgroundColor: '#FFFFFF',
                    }}>
                      {heroImages.map(a => {
                        const active = a.id === heroFile.id;
                        return (
                          <Pressable
                            key={a.id}
                            onPress={() => setHeroId(a.id)}
                            style={{
                              flex: active ? 2.4 : 1, height: 64, minWidth: 0,
                              backgroundColor: '#EEF2F6',
                              opacity: active ? 1 : 0.78,
                              ...(Platform.OS === 'web'
                                ? ({ cursor: 'pointer', transition: 'flex-grow 220ms ease-out, opacity 220ms ease-out' } as any)
                                : {}),
                            }}
                          >
                            <Image source={{ uri: a.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {/* Aktif yüklemeler — listenin EN ÜSTÜNDE her dosya için ayrı progress bar */}
              {activeUploads.map((u, idx) => (
                <UploadProgressRow
                  key={u.id}
                  accentColor={P}
                  filename={u.filename}
                  progress={u.progress ?? null}
                  current={idx + 1}
                  total={activeUploads.length}
                  theme={progressTheme}
                />
              ))}

              {attachments.length === 0 && !hasUploads ? (
                <View style={{ paddingVertical: 30, alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                    <AppIcon name={'file-outline' as any} size={20} color="#94A3B8" />
                  </View>
                  <Text style={{ fontSize: 12, color: '#64748B', textAlign: 'center', fontFamily: F.regular }}>
                    Henüz dosya yüklenmedi
                  </Text>
                  <Text style={{ fontSize: 10.5, color: '#94A3B8', textAlign: 'center', fontFamily: F.regular, maxWidth: 220 }}>
                    Soldaki kategori kartlarından dosya seç — yüklenince burada listelenir
                  </Text>
                </View>
              ) : (
                uploadedGroups.map(group => {
                  // Fotoğraflar üstteki tek galeriye taşındı; burada yalnız
                  // görsel OLMAYANLAR (STL, ZIP, PDF…) listelenir. Grubun tamamı
                  // fotoğraftan ibaretse başlık da çizilmez, boş başlık kalmasın.
                  const rest = group.items.filter(a => !isPreviewable(a));
                  if (!rest.length) return null;
                  return (
                  <View key={group.title} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: group.color }} />
                      <Text style={{ fontSize: 10.5, fontFamily: F.bold, color: '#0F172A', letterSpacing: 0.6, textTransform: 'uppercase' as any }}>
                        {group.title} · {rest.length}
                      </Text>
                    </View>
                    {rest.map(att => (
                      <Pressable
                        key={att.id}
                        onPress={() => onPreview?.(att)}
                        style={({ hovered }: any) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 9,
                          paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9,
                          backgroundColor: hovered ? '#FFFFFF' : 'transparent',
                          borderWidth: 1, borderColor: hovered ? '#E2E8F0' : 'transparent',
                          marginBottom: 4,
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } as any : {}),
                        })}
                      >
                        {/* Fotoğraflarda ikon yerine gerçek küçük resim.
                            `uri` zaten elimizde (yerel object URL / signed URL),
                            ek istek gerekmiyor. Görsel olmayanlar ikonda kalır. */}
                        {isPreviewable(att) ? (
                          <View style={{
                            width: 40, height: 40, borderRadius: 8, overflow: 'hidden',
                            backgroundColor: '#F1F5F9',
                            borderWidth: 1, borderColor: '#E2E8F0',
                          }}>
                            <Image
                              source={{ uri: att.uri }}
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="cover"
                            />
                          </View>
                        ) : (() => {
                          const m = fileTypeMeta(att.name, att.kind);
                          return (
                            <View style={{
                              width: 40, height: 40, borderRadius: 8,
                              backgroundColor: m.color + '18',
                              alignItems: 'center', justifyContent: 'center',
                              borderWidth: 1, borderColor: m.color + '33',
                              gap: 1,
                            }}>
                              <AppIcon name={m.icon as any} size={14} color={m.color} />
                              <Text style={{ fontSize: 7.5, fontFamily: F.bold, color: m.color, letterSpacing: 0.3 }}>
                                {m.badge}
                              </Text>
                            </View>
                          );
                        })()}
                        <Text
                          style={{ flex: 1, fontSize: 12, fontFamily: F.semibold, color: '#0F172A' }}
                          numberOfLines={1}
                        >
                          {att.name}
                        </Text>
                        {onRemove && att.canRemove && (
                          <TouchableOpacity
                            onPress={(e) => { (e as any).stopPropagation?.(); askRemove(att); }}
                            style={{ width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEE2E2' }}
                          >
                            <AppIcon name={'close' as any} size={11} color="#EF4444" />
                          </TouchableOpacity>
                        )}
                      </Pressable>
                    ))}
                  </View>
                  );
                })
              )}
            </ScrollView>
          )}
          </View>

          {/* Footer */}
          <View style={[s.umFooter, { borderTopColor: T.hairline, backgroundColor: T.card, gap: 10 }]}>
            {footerCta}
            <TouchableOpacity
              style={[s.umOkBtn, { backgroundColor: P }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <AppIcon name={'check' as any} size={18} color="#FFFFFF" />
              <Text style={s.umOkBtnText}>Tamam</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      {/* Silme onayı — modalın İÇİNDE, üstünde görünsün */}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </Modal>
  );
}

// ── Upload progress row — sağ panel listesinin tepesine inline ─────────────
// Patterns'taki LinearProgressX'i kullanıyor (pill kapsül + accent fill + knob).
function UploadProgressRow({
  accentColor, filename, progress, current, total, theme,
}: {
  accentColor: string;
  filename: string;
  progress: number | null;
  current?: number;
  total?: number;
  theme: DsTheme;
}) {
  const pct = progress != null ? Math.max(0, Math.min(100, Math.round(progress))) : null;

  return (
    <View style={{
      marginBottom: 14,
      borderWidth: 1, borderColor: accentColor + '40',
      borderRadius: 12,
      backgroundColor: accentColor + '0A',
      padding: 12,
      gap: 10,
    }}>
      {/* Üst satır: ikon + dosya adı + yüzde */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <View style={{
          width: 30, height: 30, borderRadius: 8,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: accentColor + '20',
          borderWidth: 1, borderColor: accentColor + '40',
        }}>
          <AppIcon name={'cloud-upload-outline' as any} size={14} color={accentColor} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={{ fontSize: 9.5, fontFamily: F.bold, color: accentColor, letterSpacing: 0.6, textTransform: 'uppercase' as any }}>
              Yükleniyor
            </Text>
            {(total ?? 0) > 1 && (
              <Text style={{ fontSize: 9.5, fontFamily: F.semibold, color: accentColor + 'AA' }}>
                · {current ?? 1}/{total}
              </Text>
            )}
          </View>
          <Text style={{ fontSize: 12.5, fontFamily: F.semibold, color: '#0F172A', marginTop: 1 }} numberOfLines={1}>
            {filename}
          </Text>
        </View>
        <Text style={{ fontSize: 14, fontFamily: F.bold, color: accentColor, minWidth: 48, textAlign: 'end' as any as any }}>
          {pct != null ? `%${pct}` : '...'}
        </Text>
      </View>

      {/* Patterns LinearProgressX — pill rail + accent fill + knob */}
      <LinearProgressX
        value={pct ?? 0}
        theme={theme}
        compact
        hideLabel
        animate={false}
        fillColor={accentColor}
      />
    </View>
  );
}

// ── Split view helpers ──────────────────────────────────────────────────────
/**
 * Dosya türü görünümü — ikon, renk ve uzantı rozeti.
 *
 * NEDEN rozet: STL/PLY/OBJ hepsi aynı küp ikonuyla çiziliyordu, teknisyen
 * hangisinin ne olduğunu ancak dosya adını sonuna kadar okuyarak anlıyordu.
 * Uzantı metni ikondan daha hızlı taranıyor.
 */
function fileTypeMeta(name: string, kind?: UploadAttachment['kind']): {
  icon: string; color: string; badge: string;
} {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
    return { icon: 'file-archive', color: '#D97706', badge: ext.toUpperCase() };
  if (['stl', 'ply', 'obj', '3mf'].includes(ext))
    return { icon: 'box', color: '#3B82F6', badge: ext.toUpperCase() };
  if (ext === 'pdf')
    return { icon: 'file-pdf-box', color: '#DC2626', badge: 'PDF' };
  if (['html', 'htm'].includes(ext))
    return { icon: 'globe', color: '#8B5CF6', badge: 'HTML' };
  if (['mp4', 'mov', 'webm', 'avi'].includes(ext))
    return { icon: 'play-circle', color: '#0EA5E9', badge: ext.toUpperCase() };
  if (['dcm'].includes(ext))
    return { icon: 'file-text', color: '#0891B2', badge: 'DCM' };
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext))
    return { icon: 'image', color: '#22C55E', badge: ext.toUpperCase() };
  return { icon: iconForKind(kind, name), color: '#64748B', badge: ext ? ext.toUpperCase().slice(0, 4) : 'DOSYA' };
}

function iconForKind(kind: UploadAttachment['kind'], name: string): string {
  // Uzantı önce bakılır: tarama arşivi kind='scan' gelse de .zip ise
  // küp değil arşiv ikonu gösterilmeli.
  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return 'file-archive';
  if (kind === 'video') return 'video-outline';
  if (kind === 'pdf')   return 'file-pdf-box';
  if (kind === 'scan')  return 'cube-outline';
  if (kind === 'image') return 'image-outline';
  // Fallback by extension
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['zip','rar','7z','tar','gz'].includes(ext))  return 'file-archive';
  if (['stl','obj','ply','3mf'].includes(ext))      return 'cube-outline';
  if (['mp4','mov','webm','avi'].includes(ext))     return 'video-outline';
  if (['pdf'].includes(ext))                         return 'file-pdf-box';
  if (['jpg','jpeg','png','webp','gif','heic'].includes(ext)) return 'image-outline';
  return 'file-outline';
}

function groupAttachmentsByKind(attachments: UploadAttachment[]): Array<{ title: string; color: string; items: UploadAttachment[] }> {
  const groups: Record<string, { title: string; color: string; items: UploadAttachment[] }> = {
    scan:  { title: 'Tarama / STL', color: '#0EA5E9', items: [] },
    image: { title: 'Görsel',        color: '#22C55E', items: [] },
    video: { title: 'Video',         color: '#7C3AED', items: [] },
    pdf:   { title: 'Belge / PDF',   color: '#F59E0B', items: [] },
    other: { title: 'Diğer',         color: '#94A3B8', items: [] },
  };
  for (const att of attachments) {
    const k = (att.kind ?? 'other') as keyof typeof groups;
    (groups[k] ?? groups.other).items.push(att);
  }
  return Object.values(groups).filter(g => g.items.length > 0);
}

// ── Bilinen kategori etiketleri (caller tarafında match için export) ────────
export const FILE_CATEGORY_LABELS = {
  smilePhotos: SMILE_PHOTO_LABELS,
  smileVideo:  SMILE_VIDEO_LABEL,
  scans:       SCAN_LABELS,
  implantScan: IMPLANT_SCAN_LABEL,
  pdf:         PDF_LABEL,
  refPhoto:    REF_PHOTO_LABEL,
} as const;

const s = StyleSheet.create({
  umOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  umCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24,
    width: '100%', maxWidth: 1000,
    // Mobile'da kart açık görünür yükseklik kazansın; height %92 + maxHeight %95 birlikte
    height: '92%' as any, maxHeight: '95%' as any,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 20px 60px rgba(0,0,0,0.25)' } as any)
      : { shadowColor: '#0F172A', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 16 }, elevation: 18 }),
  },
  umHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 18,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  umHeaderIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  umHeaderTitle: { fontSize: 16, fontFamily: F.bold, color: '#0F172A' },
  umCloseBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center',
  },
  umFooter: {
    padding: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9', alignItems: 'flex-end',
  },
  umOkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 28, borderRadius: 12,
  },
  umOkBtnText: { fontSize: 14, fontFamily: F.semibold, color: '#FFFFFF' },

  umGrid: { flexDirection: 'row' as any, flexWrap: 'wrap' as any, gap: 14 },
  umGroup: {
    flexBasis: 'calc(50% - 7px)' as any,
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
    padding: 14,
  },
  umGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  umGroupDot:    { width: 8, height: 8, borderRadius: 4 },
  umGroupTitle:  { fontSize: 13, fontFamily: F.bold, color: '#0F172A' },

  uploadCardRow: { flexDirection: 'row' as any, flexWrap: 'wrap' as any, gap: 8 },
  uploadCard: {
    width: 110, height: 138, borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E2E8F0',
    overflow: 'hidden' as any,
    position: 'relative' as any,
  },
  uploadCardDashed: { borderStyle: 'dashed' as any, borderColor: '#CBD5E1' },
  uploadCardTab: {
    height: 10, width: '55%', alignSelf: 'center' as any,
    borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
  },
  uploadCardBody: {
    paddingHorizontal: 8, paddingTop: 6, paddingBottom: 44,
    alignItems: 'center' as any,
  },
  uploadCardIcon: {
    alignItems: 'center' as any, justifyContent: 'center' as any,
    width: '100%', paddingVertical: 6,
  },
  uploadCardThumbWrap: {
    width: '100%', height: 54,
    borderRadius: 8, overflow: 'hidden' as any,
    position: 'relative' as any, marginBottom: 4,
  },
  uploadCardThumbImg: { width: '100%', height: 54 },
  uploadCardThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center' as any, justifyContent: 'center' as any,
  },
  uploadCardLabel:    { fontSize: 11, fontFamily: F.semibold, color: '#0F172A', textAlign: 'center' as any },
  uploadCardFileName: { fontSize: 10, fontFamily: F.regular, color: '#059669', marginTop: 3, width: '100%' },
  uploadCardBtn: {
    position: 'absolute' as any, bottom: 8, end: 8,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center' as any, justifyContent: 'center' as any,
  },
  uploadCardDel: {
    position: 'absolute' as any, top: 18, end: 8,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#FEE2E2',
    alignItems: 'center' as any, justifyContent: 'center' as any,
  },
});

export default FilesUploadModal;
