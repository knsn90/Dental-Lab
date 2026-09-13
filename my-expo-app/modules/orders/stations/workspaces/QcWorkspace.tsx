// modules/orders/stations/workspaces/QcWorkspace.tsx
// Kalite Kontrol istasyonuna özel workspace —
// reddetme sebebi seçimi, QC notu, fotoğraf alanı.
//
// CTA (QC'yi Onayla) hâlâ SelectedJobDetail footer'ında.
// Burası işin geri gönderilmesi/notlanması için aksiyon yüzeyi.

import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, Platform } from 'react-native';
import { ImageOff, RotateCcw, MessageSquare, AlertOctagon, X } from '../../../../core/ui/icons';
import { useStationTheme, hexA, type StationPalette } from '../../../../core/theme/stationPalette';
import { toast } from '../../../../core/ui/Toast';
import { recordStageActivity } from '../../api/timing';
import type { StageWorkspaceProps } from './types';

// ── Reddetme sebepleri (QC standartı) ───────────────────────────────
const REJECT_REASONS = [
  { key: 'shade',         label: 'Renk Uyumsuz' },
  { key: 'fit',           label: 'Uyum Problemi' },
  { key: 'occlusion',     label: 'Oklüzyon Hatalı' },
  { key: 'contact',       label: 'Kontak Uygun Değil' },
  { key: 'margin',        label: 'Margin Hatalı' },
  { key: 'anatomy',       label: 'Anatomi Hatalı' },
  { key: 'fracture',      label: 'Kırık / Çatlak' },
  { key: 'porcelain',     label: 'Porselen Sorunu' },
  { key: 'screw',         label: 'Vida / Bağlantı' },
  { key: 'other',         label: 'Diğer' },
] as const;

type RejectKey = typeof REJECT_REASONS[number]['key'];

export function QcWorkspace({
  stageId, stationName, toothNumbers, shade, isActive,
}: StageWorkspaceProps) {
  const P = useStationTheme();
  const [rejectMode, setRejectMode] = useState(false);
  const [reasons, setReasons] = useState<Set<RejectKey>>(new Set());
  const [rejectNote, setRejectNote] = useState('');
  const [qcNote, setQcNote] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  const toggleReason = (k: RejectKey) => setReasons(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const canReject = reasons.size > 0 && !submittingReject;

  async function handleReject() {
    if (!canReject) return;
    setSubmittingReject(true);
    try {
      // QC reject event'i kaydet — backend rework RPC'si ileride bunu okuyabilir
      const reasonList = Array.from(reasons);
      const res = await recordStageActivity(stageId, 'qc_rejected', 'manual', {
        reasons:    reasonList,
        note:       rejectNote.trim() || null,
        station:    stationName,
      });
      if (!res.ok) {
        toast.error('Red kaydedilemedi: ' + (res.error ?? ''));
        return;
      }
      toast.success(`Red kaydedildi · ${reasonList.length} sebep`);
      setRejectMode(false);
      setReasons(new Set());
      setRejectNote('');
    } catch (e: any) {
      toast.error('Reddetme işlemi başarısız');
    } finally {
      setSubmittingReject(false);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      {/* ═══ QC Aksiyonları kartı ═══ */}
      <View style={{
        borderWidth: 1, borderColor: P.ink100, borderRadius: 14,
        backgroundColor: P.surface, overflow: 'hidden',
      }}>
        <SectionHeader p={P} title="QC Aksiyonları" sub={stationName ?? 'Kalite Kontrol'} />

        {!rejectMode ? (
          <View style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 10 }}>
            <Text style={{ fontSize: 12, color: P.ink500, lineHeight: 18 }}>
              İşi onaylamak için aşama kontrol listesini tamamlayıp aşağıdaki <Text style={{ fontWeight: '700', color: P.ink900 }}>"QC'yi Onayla"</Text> butonuna bas. Sorun varsa üretime geri gönder.
            </Text>
            <Pressable
              onPress={() => isActive && setRejectMode(true)}
              disabled={!isActive}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                paddingVertical: 11, borderRadius: 12,
                backgroundColor: hovered ? P.dangerBg : hexA(P.danger, 0.06),
                borderWidth: 1, borderColor: hexA(P.danger, 0.30),
                opacity: isActive ? 1 : 0.5,
                ...(Platform.OS === 'web' ? { cursor: isActive ? 'pointer' : 'not-allowed' } as any : {}),
              })}
            >
              <RotateCcw size={14} color={P.danger} strokeWidth={2} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: P.danger, letterSpacing: 0.3 }}>
                Üretime Geri Gönder
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AlertOctagon size={14} color={P.danger} strokeWidth={2} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: P.danger, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  Red Sebepleri Seç
                </Text>
              </View>
              <Pressable onPress={() => { setRejectMode(false); setReasons(new Set()); setRejectNote(''); }}>
                <X size={14} color={P.ink400} strokeWidth={2} />
              </Pressable>
            </View>

            {/* Sebep chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {REJECT_REASONS.map(r => {
                const on = reasons.has(r.key);
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => toggleReason(r.key)}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                      backgroundColor: on ? P.danger : P.surface,
                      borderWidth: 1,
                      borderColor: on ? P.danger : P.ink100,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <Text style={{
                      fontSize: 11.5, fontWeight: '600',
                      color: on ? '#FFFFFF' : P.ink700,
                    }}>
                      {r.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Detay notu */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: P.ink400, letterSpacing: 0.9, textTransform: 'uppercase' }}>
                Detay Notu (Opsiyonel)
              </Text>
              <TextInput
                value={rejectNote}
                onChangeText={setRejectNote}
                placeholder="Operatöre gönderilecek açıklama..."
                placeholderTextColor={P.ink300}
                multiline
                numberOfLines={3}
                style={{
                  borderWidth: 1, borderColor: P.ink100, borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 10,
                  fontSize: 13, color: P.ink900, backgroundColor: P.surfaceAlt,
                  minHeight: 70, textAlignVertical: 'top',
                  // @ts-ignore web
                  outlineWidth: 0,
                }}
              />
            </View>

            <Pressable
              onPress={handleReject}
              disabled={!canReject}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                paddingVertical: 12, borderRadius: 12,
                backgroundColor: canReject ? P.danger : P.ink100,
                opacity: submittingReject ? 0.5 : 1,
                ...(Platform.OS === 'web' ? { cursor: canReject ? 'pointer' : 'not-allowed' } as any : {}),
              }}
            >
              <RotateCcw size={14} color={canReject ? '#FFFFFF' : P.ink400} strokeWidth={2} />
              <Text style={{
                fontSize: 13, fontWeight: '700',
                color: canReject ? '#FFFFFF' : P.ink400,
                letterSpacing: 0.3,
              }}>
                {submittingReject ? 'Gönderiliyor…' : `Üretime Geri Gönder${reasons.size > 0 ? ` (${reasons.size})` : ''}`}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ═══ QC Notu ═══ */}
      <View style={{
        borderWidth: 1, borderColor: P.ink100, borderRadius: 14,
        backgroundColor: P.surface, overflow: 'hidden',
      }}>
        <SectionHeader p={P} title="QC Onay Notu" icon={MessageSquare} />
        <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
          <TextInput
            value={qcNote}
            onChangeText={setQcNote}
            placeholder="Teslim öncesi gözleminiz veya özel uyarılar..."
            placeholderTextColor={P.ink300}
            multiline
            numberOfLines={3}
            editable={isActive}
            style={{
              borderWidth: 1, borderColor: P.ink100, borderRadius: 10,
              paddingHorizontal: 12, paddingVertical: 10,
              fontSize: 13, color: P.ink900, backgroundColor: P.surfaceAlt,
              minHeight: 64, textAlignVertical: 'top',
              opacity: isActive ? 1 : 0.5,
              // @ts-ignore web
              outlineWidth: 0,
            }}
          />
        </View>
      </View>

      {/* ═══ Görsel Kanıt (placeholder) ═══ */}
      <View style={{
        borderWidth: 1, borderColor: P.ink100, borderRadius: 14,
        backgroundColor: P.surface, overflow: 'hidden',
      }}>
        <SectionHeader p={P} title="Görsel Kanıt" sub="Önce / sonra fotoğrafları" />
        <View style={{
          paddingHorizontal: 16, paddingVertical: 22,
          alignItems: 'center', gap: 8,
          backgroundColor: P.surfaceAlt,
        }}>
          <View style={{
            width: 44, height: 44, borderRadius: 12,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: P.ink50,
            borderWidth: 1, borderColor: P.ink100,
          }}>
            <ImageOff size={20} color={P.ink400} strokeWidth={1.6} />
          </View>
          <Text style={{ fontSize: 12, color: P.ink500, textAlign: 'center' }}>
            Henüz fotoğraf eklenmedi
          </Text>
          <Text style={{ fontSize: 11, color: P.ink400, textAlign: 'center', maxWidth: 280 }}>
            Fotoğraf yükleme yakında eklenecek. Şimdilik notu kullanın.
          </Text>
        </View>
      </View>

      {/* Quick context — diş + renk hatırlatması */}
      {(toothNumbers.length > 0 || shade) && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          paddingHorizontal: 14, paddingVertical: 10,
          borderRadius: 10,
          backgroundColor: hexA(P.accent, 0.06),
          borderWidth: 1, borderColor: hexA(P.accent, 0.18),
        }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: P.accentDeep, letterSpacing: 0.9, textTransform: 'uppercase' }}>
            QC Kontrol Hedefi
          </Text>
          {toothNumbers.length > 0 && (
            <Text style={{ fontSize: 12, color: P.ink700 }}>
              <Text style={{ fontWeight: '700' }}>{toothNumbers.length} diş</Text>
              {' · '}
              <Text style={{ color: P.ink500 }}>{toothNumbers.join(', ')}</Text>
            </Text>
          )}
          {shade && (
            <Text style={{ fontSize: 12, color: P.ink700 }}>
              · Renk <Text style={{ fontWeight: '700' }}>{shade}</Text>
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function SectionHeader({ p: P, title, sub, icon: Icon }: { p: StationPalette; title: string; sub?: string; icon?: any }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: P.ink100,
      backgroundColor: P.surfaceAlt,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {Icon && <Icon size={13} color={P.ink500} strokeWidth={1.7} />}
        <Text style={{ fontSize: 10, fontWeight: '700', color: P.ink500, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          {title}
        </Text>
      </View>
      {sub && (
        <Text style={{ fontSize: 11, color: P.ink400 }}>
          {sub}
        </Text>
      )}
    </View>
  );
}
