// modules/orders/components/FilesUploadModal.tsx
// Ortak Dosya Yükleme Modali — NewOrderScreen'in upload modal'ı baz alındı.
// Hem yeni iş emri hem mevcut iş detay popup'ı tarafından kullanılır.
//
// Veri akışı: caller `attachments` listesi geçer; her kategori kartı,
// `name.startsWith(label)` eşleşmesine göre dolu/boş gösterilir. Pick
// callback'leri ile dosya yükleme caller tarafında yapılır (lokal draft
// veya backend upload — component bunu bilmez).

import React from 'react';
import {
  View, Text, ScrollView, Modal, Pressable, TouchableOpacity, Image, Platform, StyleSheet,
} from 'react-native';
import { AppIcon } from '../../../core/ui/AppIcon';
import { F } from '../../../core/theme/typography';

export interface UploadAttachment {
  id:    string;
  name:  string;                          // örn: "Ekartörlü Resim.jpg"
  uri:   string;
  kind?: 'image' | 'video' | 'pdf' | 'scan';
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

  onPreview?:  (att: UploadAttachment) => void;
  onRemove?:   (id: string) => void;

  /** İsteğe bağlı render slot'ları (NewOrder'daki implant marka dropdown'u, kapanış analizi vb.) */
  occlusionCta?:    React.ReactNode;
  implantBrandSlot?: React.ReactNode;

  /** Modal başlığını özelleştir */
  title?: string;
}

const SMILE_PHOTO_LABELS: ReadonlyArray<string> = ['Ekartörlü Resim', 'Gülüş Resmi'];
const SMILE_VIDEO_LABEL = 'Gülüş Videosu';
const SCAN_LABELS:       ReadonlyArray<string> = ['Alt Çene', 'Üst Çene', 'Bite (Kapanış)', 'Diş Eti Taraması'];
const IMPLANT_SCAN_LABEL = 'Scan Body STL';
const PDF_LABEL          = 'PDF Belgesi';
const REF_PHOTO_LABEL    = 'Referans Fotoğraf';

export function FilesUploadModal({
  visible, onClose, accentColor, attachments,
  onPickPhoto, onPickVideo, onPickScan, onPickPdf,
  onPreview, onRemove,
  occlusionCta, implantBrandSlot,
  title = 'Dosya Yükleme',
}: FilesUploadModalProps) {
  const findByLabel = (label: string) => attachments.find(a => a.name.startsWith(label)) ?? null;
  const P = accentColor;

  const renderPhotoCard = (label: string, color: string) => {
    const existing = findByLabel(label);
    return (
      <TouchableOpacity
        key={label}
        style={[s.uploadCard, !existing && s.uploadCardDashed]}
        onPress={() => existing ? onPreview?.(existing) : onPickPhoto(label)}
        activeOpacity={0.8}
      >
        <View style={[s.uploadCardTab, { backgroundColor: existing ? '#22C55E' : color }]} />
        <View style={s.uploadCardBody}>
          {existing ? (
            <View style={s.uploadCardThumbWrap}>
              <Image source={{ uri: existing.uri }} style={s.uploadCardThumbImg} resizeMode="cover" />
              <View style={s.uploadCardThumbOverlay}>
                <AppIcon name={'eye-outline' as any} size={18} color="#FFFFFF" />
              </View>
            </View>
          ) : (
            <View style={s.uploadCardIcon}>
              <AppIcon name={'image-outline' as any} size={28} color={color} />
            </View>
          )}
          <Text style={[s.uploadCardLabel, { color: existing ? '#0F172A' : '#64748B' }]} numberOfLines={2}>{label}</Text>
        </View>
        <View style={[s.uploadCardBtn, { backgroundColor: existing ? '#22C55E' : color }]}>
          <AppIcon name={existing ? 'check' : 'arrow-up'} size={16} color="#FFFFFF" />
        </View>
        {existing && onRemove && (
          <TouchableOpacity
            style={s.uploadCardDel}
            onPress={(e) => { (e as any).stopPropagation?.(); onRemove(existing.id); }}
            activeOpacity={0.8}
          >
            <AppIcon name={'close' as any} size={12} color="#EF4444" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderVideoCard = (label: string, color: string) => {
    const existing = findByLabel(label);
    return (
      <TouchableOpacity
        key={label}
        style={[s.uploadCard, !existing && s.uploadCardDashed]}
        onPress={() => existing ? onPreview?.(existing) : onPickVideo(label)}
        activeOpacity={0.8}
      >
        <View style={[s.uploadCardTab, { backgroundColor: existing ? '#22C55E' : color }]} />
        <View style={s.uploadCardBody}>
          <View style={s.uploadCardIcon}>
            <AppIcon name={'video-outline' as any} size={28} color={existing ? '#22C55E' : color} />
          </View>
          <Text style={[s.uploadCardLabel, { color: existing ? '#0F172A' : '#64748B' }]} numberOfLines={2}>{label}</Text>
          {existing && (
            <Text style={[s.uploadCardFileName, { color: '#22C55E' }]} numberOfLines={1}>
              {existing.name.split('.').pop()?.toUpperCase()}
            </Text>
          )}
        </View>
        <View style={[s.uploadCardBtn, { backgroundColor: existing ? '#22C55E' : color }]}>
          <AppIcon name={existing ? 'check' : 'arrow-up'} size={16} color="#FFFFFF" />
        </View>
        {existing && onRemove && (
          <TouchableOpacity
            style={s.uploadCardDel}
            onPress={(e) => { (e as any).stopPropagation?.(); onRemove(existing.id); }}
            activeOpacity={0.8}
          >
            <AppIcon name={'close' as any} size={12} color="#EF4444" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderScanCard = (label: string, color: string, iconName: string) => {
    const existing = findByLabel(label);
    return (
      <TouchableOpacity
        key={label}
        style={[s.uploadCard, !existing && s.uploadCardDashed]}
        onPress={() => existing ? onPreview?.(existing) : onPickScan(label)}
        activeOpacity={0.8}
      >
        <View style={[s.uploadCardTab, { backgroundColor: existing ? '#22C55E' : color }]} />
        <View style={s.uploadCardBody}>
          <View style={s.uploadCardIcon}>
            <AppIcon name={iconName as any} size={28} color={existing ? '#22C55E' : color} />
          </View>
          <Text style={[s.uploadCardLabel, { color: existing ? '#0F172A' : '#64748B' }]} numberOfLines={2}>{label}</Text>
          {existing && (
            <Text style={[s.uploadCardFileName, { color: '#22C55E' }]} numberOfLines={1}>
              {existing.name.split('.').pop()?.toUpperCase()}
            </Text>
          )}
        </View>
        <View style={[s.uploadCardBtn, { backgroundColor: existing ? '#22C55E' : color }]}>
          <AppIcon name={existing ? 'check' : 'arrow-up'} size={16} color="#FFFFFF" />
        </View>
        {existing && onRemove && (
          <TouchableOpacity
            style={s.uploadCardDel}
            onPress={(e) => { (e as any).stopPropagation?.(); onRemove(existing.id); }}
            activeOpacity={0.8}
          >
            <AppIcon name={'close' as any} size={12} color="#EF4444" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderPdfCard = (label: string, color: string) => {
    const existing = findByLabel(label);
    return (
      <TouchableOpacity
        key={label}
        style={[s.uploadCard, !existing && s.uploadCardDashed]}
        onPress={() => existing ? onPreview?.(existing) : onPickPdf(label)}
        activeOpacity={0.8}
      >
        <View style={[s.uploadCardTab, { backgroundColor: existing ? '#22C55E' : color }]} />
        <View style={s.uploadCardBody}>
          <View style={s.uploadCardIcon}>
            <AppIcon name={'file-pdf-box' as any} size={28} color={existing ? '#22C55E' : color} />
          </View>
          <Text style={[s.uploadCardLabel, { color: existing ? '#0F172A' : '#64748B' }]} numberOfLines={2}>
            PDF (Reçete vb.)
          </Text>
        </View>
        <View style={[s.uploadCardBtn, { backgroundColor: existing ? '#22C55E' : color }]}>
          <AppIcon name={existing ? 'check' : 'arrow-up'} size={16} color="#FFFFFF" />
        </View>
        {existing && onRemove && (
          <TouchableOpacity
            style={s.uploadCardDel}
            onPress={(e) => { (e as any).stopPropagation?.(); onRemove(existing.id); }}
            activeOpacity={0.8}
          >
            <AppIcon name={'close' as any} size={12} color="#EF4444" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={s.umOverlay} onPress={onClose}>
        <Pressable style={s.umCard} onPress={(e) => (e as any).stopPropagation?.()}>
          {/* Header */}
          <View style={s.umHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[s.umHeaderIcon, { backgroundColor: P + '18' }]}>
                <AppIcon name={'cloud-upload-outline' as any} size={20} color={P} />
              </View>
              <Text style={s.umHeaderTitle}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.umCloseBtn}>
              <AppIcon name={'close' as any} size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.umGrid}>
              {/* ── Grup 1: Gülüş Tasarımı ── */}
              <View style={s.umGroup}>
                <View style={s.umGroupHeader}>
                  <View style={[s.umGroupDot, { backgroundColor: P }]} />
                  <Text style={s.umGroupTitle}>Gülüş Tasarımı</Text>
                </View>
                <View style={s.uploadCardRow}>
                  {SMILE_PHOTO_LABELS.map(label => renderPhotoCard(label, P))}
                  {renderVideoCard(SMILE_VIDEO_LABEL, P)}
                </View>
              </View>

              {/* ── Grup 2: Tarama Verileri ── */}
              <View style={s.umGroup}>
                <View style={s.umGroupHeader}>
                  <View style={[s.umGroupDot, { backgroundColor: '#0EA5E9' }]} />
                  <Text style={s.umGroupTitle}>Tarama Verileri</Text>
                </View>
                <View style={s.uploadCardRow}>
                  {SCAN_LABELS.map(label => renderScanCard(label, '#0EA5E9', 'cube-outline'))}
                </View>
                {occlusionCta}
              </View>

              {/* ── Grup 3: İmplant Bilgileri ── */}
              <View style={s.umGroup}>
                <View style={s.umGroupHeader}>
                  <View style={[s.umGroupDot, { backgroundColor: '#8B5CF6' }]} />
                  <Text style={s.umGroupTitle}>İmplant Bilgileri</Text>
                </View>
                <View style={s.uploadCardRow}>
                  {renderScanCard(IMPLANT_SCAN_LABEL, '#8B5CF6', 'tooth-outline')}
                  {implantBrandSlot}
                </View>
              </View>

              {/* ── Grup 4: Ek Dosyalar ── */}
              <View style={s.umGroup}>
                <View style={s.umGroupHeader}>
                  <View style={[s.umGroupDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={s.umGroupTitle}>Ek Dosyalar</Text>
                </View>
                <View style={s.uploadCardRow}>
                  {renderPdfCard(PDF_LABEL, '#F59E0B')}
                  {renderPhotoCard(REF_PHOTO_LABEL, '#F59E0B')}
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={s.umFooter}>
            <TouchableOpacity
              style={[s.umOkBtn, { backgroundColor: P }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <AppIcon name={'check' as any} size={18} color="#FFFFFF" />
              <Text style={s.umOkBtnText}>Tamam</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
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
    width: '100%', maxWidth: 1000, maxHeight: '95%' as any,
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
    width: 100, height: 118, borderRadius: 12,
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
    paddingHorizontal: 8, paddingTop: 6, paddingBottom: 36,
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
    position: 'absolute' as any, bottom: 8, right: 8,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center' as any, justifyContent: 'center' as any,
  },
  uploadCardDel: {
    position: 'absolute' as any, top: 18, right: 8,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#FEE2E2',
    alignItems: 'center' as any, justifyContent: 'center' as any,
  },
});

export default FilesUploadModal;
