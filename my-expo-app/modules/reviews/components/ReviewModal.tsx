// ReviewModal — teslim edilen iş için hekim/klinik değerlendirme formu (Faz 1).
// Genel yıldız (zorunlu) + dental QC boyutları (opsiyonel) + yorum.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Modal, Pressable, TextInput, Platform, ActivityIndicator, Image, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Star, X, ImagePlus, Upload } from '../../../core/ui/icons';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { DS } from '../../../core/theme/dsTokens';
import { useInkUI } from '../../../core/theme/inkScale';
import { hexA } from '../../../core/theme/stationPalette';
import { REVIEW_DIMENSIONS } from '../constants';
import { submitReview, updateReview, uploadReviewPhoto, signReviewPhotos } from '../api';
import type { OrderReview, ReviewDimensionKey } from '../types';

const RATING_LABELS = ['Puanlamak için yıldıza dokun', 'Kötü', 'Zayıf', 'Orta', 'İyi', 'Mükemmel'];

interface Props {
  visible: boolean;
  onClose: () => void;
  workOrderId: string;
  orderLabel?: string;                 // "FTR-... / Hasta" gibi başlık altı
  existing?: OrderReview | null;       // varsa düzenleme / salt-okunur
  readOnly?: boolean;                  // lab tarafı görüntüleme
  raterRole?: 'doctor' | 'clinic' | null;
  onSaved?: (r: OrderReview) => void;
}

/** Tek satır yıldız seçici (1–5). */
function StarRow({ value, onChange, color, size = 30, readOnly }: {
  value: number; onChange?: (n: number) => void; color: string; size?: number; readOnly?: boolean;
}) {
  const U = useInkUI();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => {
        const active = value >= n;
        return (
          <Pressable
            key={n}
            disabled={readOnly}
            onPress={() => onChange?.(n)}
            hitSlop={6}
            style={{ cursor: (readOnly ? 'default' : 'pointer') as any }}
          >
            <Star
              size={size}
              strokeWidth={1.8}
              color={active ? color : U.ink[300]}
              fill={active ? color : 'transparent'}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Fotoğraf kategorisi bloğu (thumbnail grid + ekle butonu). */
function PhotoGrid({ label, hint, list, signed, readOnly, accent, uploading, onAdd, onRemove }: {
  label: string; hint?: string; list: string[]; signed: Record<string, string>; readOnly?: boolean;
  accent: string; uploading?: boolean; onAdd?: () => void; onRemove?: (p: string) => void;
}) {
  const U = useInkUI();
  if (readOnly && list.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: U.ink[400], textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</Text>
      {hint ? <Text style={{ fontSize: 11, color: U.ink[400], marginTop: -4 }}>{hint}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {list.map(p => (
          // Dolu kart — dosyalardaki kart tarzı (üst yeşil şerit + görsel + sil)
          <View key={p} style={{ width: 96, height: 116, borderRadius: 12, overflow: 'hidden', backgroundColor: U.surface, borderWidth: 1, borderColor: U.fieldBorder }}>
            <View style={{ height: 8, width: '55%', alignSelf: 'center', borderBottomStartRadius: 6, borderBottomEndRadius: 6, backgroundColor: '#22C55E' }} />
            {signed[p] ? <Image source={{ uri: signed[p] }} style={{ flex: 1, width: '100%' }} resizeMode="cover" /> : <View style={{ flex: 1, backgroundColor: U.ink[100] }} />}
            {!readOnly && (
              <Pressable onPress={() => onRemove?.(p)} style={{ position: 'absolute', top: 6, end: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: U.surface, borderWidth: 1, borderColor: U.chipTones.danger.bg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
                <X size={12} color="#EF4444" strokeWidth={2.4} />
              </Pressable>
            )}
          </View>
        ))}
        {!readOnly && list.length < 6 && (
          // Ekle kartı — dosyalardaki dashed upload kartı tarzı
          <Pressable onPress={onAdd} disabled={uploading} style={{ width: 96, height: 116, borderRadius: 12, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: hexA(accent, 0.4), borderStyle: 'dashed', overflow: 'hidden', cursor: 'pointer' as any }}>
            <View style={{ height: 8, width: '55%', alignSelf: 'center', borderBottomStartRadius: 6, borderBottomEndRadius: 6, backgroundColor: hexA(accent, 0.45) }} />
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 16 }}>
              {uploading ? <ActivityIndicator color={accent} /> : <>
                <ImagePlus size={26} color={accent} strokeWidth={1.7} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: U.ink[500] }}>Foto Ekle</Text>
              </>}
            </View>
            {!uploading && (
              <View style={{ position: 'absolute', bottom: 8, end: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
                <Upload size={14} color="#FFFFFF" strokeWidth={2} />
              </View>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function ReviewModal({ visible, onClose, workOrderId, orderLabel, existing, readOnly, raterRole, onSaved }: Props) {
  const U = useInkUI();
  const T = usePanelTheme();
  const accent = T.primary;
  const { width: winW } = useWindowDimensions();
  const isWide = winW >= 760;   // geniş ekran → 2 sütun

  const [overall, setOverall] = useState(0);
  const [dims, setDims] = useState<Record<ReviewDimensionKey, number>>({
    fit: 0, occlusion: 0, contacts: 0, esthetics: 0, surface: 0, on_time: 0,
  });
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);           // genel fotoğraflar
  const [clinicalPhotos, setClinicalPhotos] = useState<string[]>([]); // ağız içi (klinik)
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mevcut değerlendirmeyi forma yükle
  useEffect(() => {
    if (!visible) return;
    setError(null);
    setOverall(existing?.overall ?? 0);
    setDims({
      fit:       existing?.fit ?? 0,
      occlusion: existing?.occlusion ?? 0,
      contacts:  existing?.contacts ?? 0,
      esthetics: existing?.esthetics ?? 0,
      surface:   existing?.surface ?? 0,
      on_time:   existing?.on_time ?? 0,
    });
    setComment(existing?.comment ?? '');
    const gen = existing?.photos ?? [];
    const clin = existing?.clinical_photos ?? [];
    setPhotos(gen);
    setClinicalPhotos(clin);
    const all = [...gen, ...clin];
    if (all.length) signReviewPhotos(all).then(setSigned); else setSigned({});
  }, [visible, existing]);

  const pickPhoto = async (kind: 'general' | 'clinical') => {
    if (readOnly || uploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError('Galeri izni gerekli'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, allowsMultipleSelection: true, selectionLimit: 6 });
    if (r.canceled || !r.assets?.length) return;
    setUploading(true); setError(null);
    const cur = kind === 'clinical' ? clinicalPhotos : photos;
    const setter = kind === 'clinical' ? setClinicalPhotos : setPhotos;
    const newPaths: string[] = [];
    for (const a of r.assets.slice(0, 6)) {
      const { path, error: upErr } = await uploadReviewPhoto(workOrderId, { uri: a.uri, mimeType: a.mimeType, fileName: a.fileName, fileSize: a.fileSize }, kind);
      if (path) newPaths.push(path); else if (upErr) setError(upErr.message ?? 'Foto yüklenemedi');
    }
    if (newPaths.length) {
      const next = [...cur, ...newPaths].slice(0, 6);
      setter(next);
      const union = Array.from(new Set([...photos, ...clinicalPhotos, ...newPaths]));
      setSigned(await signReviewPhotos(union));
    }
    setUploading(false);
  };

  const removePhoto = (kind: 'general' | 'clinical', p: string) =>
    (kind === 'clinical' ? setClinicalPhotos : setPhotos)(list => list.filter(x => x !== p));

  const canSave = overall >= 1 && !readOnly;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true); setError(null);
    const payload = {
      overall,
      fit: dims.fit || null, occlusion: dims.occlusion || null, contacts: dims.contacts || null,
      esthetics: dims.esthetics || null, surface: dims.surface || null, on_time: dims.on_time || null,
      comment, photos, clinical_photos: clinicalPhotos, rater_role: raterRole ?? null,
    };
    const res = existing
      ? await updateReview(existing.id, payload)
      : await submitReview({ work_order_id: workOrderId, ...payload });
    setSaving(false);
    if (res.error) { setError(res.error.message ?? 'Kaydedilemedi'); return; }
    if (res.data) onSaved?.(res.data);
    onClose();
  };

  const title = readOnly ? 'Değerlendirme' : existing ? 'Değerlendirmeyi Düzenle' : 'İşi Değerlendir';

  const ratedDims = REVIEW_DIMENSIONS.filter(d => dims[d.key] > 0).length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,20,18,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          width: '100%', maxWidth: isWide ? 880 : 480, maxHeight: '90%', backgroundColor: U.surface, borderRadius: 24, overflow: 'hidden',
          ...(U.isDark ? { borderWidth: 1, borderColor: U.hairline } : {}),
          // @ts-ignore web
          boxShadow: U.isDark ? '0 24px 60px rgba(0,0,0,0.7)' : '0 24px 60px rgba(0,0,0,0.28)',
        }}>
          {/* ── Gradient başlık ── */}
          <View style={{
            paddingHorizontal: 20, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: T.primaryDeep,
            // @ts-ignore web gradient (panel accent)
            backgroundImage: `linear-gradient(135deg, ${T.primaryDeep} 0%, ${T.primary} 100%)`,
          }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Star size={20} color="#FFFFFF" strokeWidth={2} fill="rgba(255,255,255,0.9)" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3 }}>{title}</Text>
              {orderLabel ? <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.82)', marginTop: 2 }} numberOfLines={1}>{orderLabel}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
              <X size={17} color="#FFFFFF" strokeWidth={2.2} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
           <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
            {/* ═══ SOL SÜTUN: puan + boyutlar ═══ */}
            <View style={isWide ? { flex: 1, gap: 12 } : { width: '100%', gap: 12 }}>
            {/* ── Genel puan hero ── */}
            <View style={{ alignItems: 'center', gap: 6, backgroundColor: hexA(accent, 0.06), borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: hexA(accent, 0.12) }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: U.ink[500], textTransform: 'uppercase', letterSpacing: 1 }}>Genel Puan</Text>
              <StarRow value={overall} onChange={setOverall} color={accent} size={30} readOnly={readOnly} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: overall > 0 ? accent : U.ink[400] }}>
                {RATING_LABELS[overall]}
              </Text>
            </View>

            {/* ── Detaylı boyutlar ── */}
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: U.ink[400], textTransform: 'uppercase', letterSpacing: 0.8 }}>Detaylı Değerlendirme</Text>
                {!readOnly && <Text style={{ fontSize: 11, color: U.ink[400] }}>{ratedDims}/{REVIEW_DIMENSIONS.length}</Text>}
              </View>
              {REVIEW_DIMENSIONS.map(d => {
                const v = dims[d.key];
                return (
                  <View key={d.key} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: v > 0 ? hexA(accent, 0.05) : U.ink[50],
                    borderRadius: 12, paddingVertical: 7, paddingHorizontal: 12,
                    borderWidth: 1, borderColor: v > 0 ? hexA(accent, 0.14) : 'transparent',
                  }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>{d.label}</Text>
                      <Text style={{ fontSize: 10, color: U.ink[400], marginTop: 1 }}>{d.hint}</Text>
                    </View>
                    <StarRow value={v} onChange={(n) => setDims(s => ({ ...s, [d.key]: n }))} color={accent} size={18} readOnly={readOnly} />
                  </View>
                );
              })}
            </View>
            </View>
            {/* ═══ SAĞ SÜTUN: yorum + foto + lab yanıtı ═══ */}
            <View style={isWide ? { flex: 1, gap: 12 } : { width: '100%', gap: 12 }}>

            {/* ── Yorum ── */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: U.ink[400], textTransform: 'uppercase', letterSpacing: 0.8 }}>Yorum {readOnly ? '' : '· opsiyonel'}</Text>
              {readOnly ? (
                <Text style={{ fontSize: 14, color: comment ? U.ink[800] : U.ink[400], lineHeight: 20 }}>{comment || 'Yorum yok'}</Text>
              ) : (
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder="İşle ilgili görüşlerin…"
                  placeholderTextColor={U.ink[400]}
                  multiline
                  style={{
                    minHeight: 64, fontSize: 14, color: U.ink[900], textAlignVertical: 'top',
                    backgroundColor: U.ink[50], borderRadius: 14, padding: 12,
                    borderWidth: 1, borderColor: U.ink[100],
                    // @ts-ignore web
                    outline: 'none',
                  }}
                />
              )}
            </View>

            {/* ── Ağız İçi Fotoğrafı (klinik) — lab için değerli ── */}
            <PhotoGrid
              label={`Ağız İçi Fotoğrafı${readOnly ? '' : ' · opsiyonel'}`}
              hint="Bitmiş işin hastanın ağzındaki hâli"
              list={clinicalPhotos} signed={signed} readOnly={readOnly} accent={accent} uploading={uploading}
              onAdd={() => pickPhoto('clinical')} onRemove={(p) => removePhoto('clinical', p)}
            />

            {/* ── Diğer Fotoğraflar ── */}
            <PhotoGrid
              label={`Diğer Fotoğraflar${readOnly ? '' : ' · opsiyonel'}`}
              list={photos} signed={signed} readOnly={readOnly} accent={accent} uploading={uploading}
              onAdd={() => pickPhoto('general')} onRemove={(p) => removePhoto('general', p)}
            />

            {/* ── Lab yanıtı ── */}
            {existing?.lab_reply ? (
              <View style={{ backgroundColor: hexA(accent, 0.07), borderRadius: 14, padding: 14, gap: 4, borderWidth: 1, borderColor: hexA(accent, 0.14) }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>Lab Yanıtı</Text>
                <Text style={{ fontSize: 13, color: U.ink[800], lineHeight: 19 }}>{existing.lab_reply}</Text>
              </View>
            ) : null}

            {error ? <Text style={{ fontSize: 12, color: '#D94B4B', fontWeight: '600' }}>{error}</Text> : null}
            </View>
           </View>
          </ScrollView>

          {/* ── Footer ── */}
          {!readOnly && (
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: U.ink[100], backgroundColor: U.surface }}>
              <Pressable onPress={onClose} style={{ flex: 1, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: U.ink[100], cursor: 'pointer' as any }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[700] }}>Vazgeç</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={!canSave || saving}
                style={{
                  flex: 2, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: canSave ? T.primaryDeep : U.ink[200],
                  // @ts-ignore web gradient
                  backgroundImage: canSave ? `linear-gradient(135deg, ${T.primaryDeep} 0%, ${T.primary} 100%)` : undefined,
                  cursor: (canSave ? 'pointer' : 'default') as any,
                }}
              >
                {saving ? <ActivityIndicator color="#FFF" /> : (
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>{existing ? 'Güncelle' : 'Değerlendirmeyi Gönder'}</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
