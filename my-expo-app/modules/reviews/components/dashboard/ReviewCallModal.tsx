/**
 * Arama kaydı penceresi (spec §9): "Arandı olarak işaretle" ya da "Notu düzenle".
 * Not isteğe bağlı, en çok 1000 karakter; düzenleme kipinde "İşareti kaldır" da var.
 * Kaydetme hatası düğmelerin yanında görünür.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GlassTooltip } from '../../../../core/ui/GlassTooltip';
import { X } from '../../../../core/ui/icons';
import { useInkUI } from '../../../../core/theme/inkScale';
import { usePanelTheme, onAccentInk } from '../../../../core/theme/usePanelTheme';
import { autoT } from '../../../../core/i18n/autoTranslate';
import { setReviewFollowupCall } from '../../api';
import { metaSep } from '../../dashboardRules';
import type { ReviewCallAction, ReviewCallState, ReviewLowRow } from '../../types';
import { PressScale, useReviewTones } from './dashboardUi';

const NOTE_MAX = 1000;

export function ReviewCallModal({ row, mode, onClose, onSaved }: {
  /** null → pencere kapalı */
  row: ReviewLowRow | null;
  mode: 'mark' | 'edit';
  onClose: () => void;
  onSaved: (workOrderId: string, state: ReviewCallState) => void;
}) {
  const U = useInkUI();
  const { i18n } = useTranslation();
  const tones = useReviewTones();
  const panel = usePanelTheme();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<ReviewCallAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setNote(mode === 'edit' ? (row.call_note ?? '') : '');
    setBusy(null);
    setError(null);
  }, [row?.work_order_id, mode]);

  const submit = async (action: ReviewCallAction) => {
    if (!row || busy) return;
    setBusy(action);
    setError(null);
    const { data, error: err } = await setReviewFollowupCall(row.work_order_id, action, action === 'unmark' ? null : note);
    setBusy(null);
    if (err || !data) { setError(autoT('Kaydedilemedi')); return; }
    onSaved(row.work_order_id, data);
    onClose();
  };

  const title = mode === 'edit' ? autoT('Notu düzenle') : autoT('Arandı olarak işaretle');
  const meta = row ? [`#${row.order_number ?? '—'}`, row.clinic_name, row.work_type_label ? autoT(row.work_type_label) : null].filter(Boolean).join(metaSep(i18n.language)) : '';
  const pill = { paddingHorizontal: 16, height: 38, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const, flexDirection: 'row' as const, gap: 6 };
  const ctaInk = onAccentInk(panel.primary);

  return (
    <Modal visible={!!row} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={U.modalOverlay}>
          <View style={[U.modalCard, { maxWidth: 460 }]}>
            <View style={U.modalHeaderRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={U.modalTitle} numberOfLines={1}>{title}</Text>
                {meta ? <Text style={{ fontSize: 12, color: U.ink[500], marginTop: 2 }} numberOfLines={1}>{meta}</Text> : null}
              </View>
              <GlassTooltip text={autoT('Kapat')}>
                <PressScale onPress={onClose} style={U.modalCloseBtn} accessibilityLabel={autoT('Kapat')}>
                  <X size={14} color={U.ink[500]} strokeWidth={2} />
                </PressScale>
              </GlassTooltip>
            </View>

            <View style={{ padding: 20, gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700] }}>{autoT('Görüşme notu')}</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                maxLength={NOTE_MAX}
                multiline
                placeholder={autoT('Ne konuşuldu, ne karar verildi…')}
                placeholderTextColor={U.ink[400]}
                style={[U.inputStyle, { height: 112, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' }]}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text style={{ fontSize: 11, color: U.ink[400], flex: 1 }}>{autoT('İsteğe bağlı. Yalnız lab yöneticileri görür, klinik görmez.')}</Text>
                <Text style={{ fontSize: 11, color: U.ink[400] }}>{`${note.length}/${NOTE_MAX}`}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingBottom: 20 }}>
              {mode === 'edit' ? (
                <PressScale
                  onPress={() => submit('unmark')}
                  disabled={!!busy}
                  style={[pill, { paddingHorizontal: 12 }]}
                >
                  {busy === 'unmark' ? <ActivityIndicator size="small" color={tones.bad} /> : null}
                  <Text style={{ fontSize: 13, fontWeight: '600', color: tones.bad }}>{autoT('İşareti kaldır')}</Text>
                </PressScale>
              ) : null}
              <View style={{ flex: 1, minWidth: 8 }} />
              {error ? <Text style={{ fontSize: 12, color: tones.bad }}>{error}</Text> : null}
              <PressScale
                onPress={onClose}
                disabled={!!busy}
                style={[pill, { backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border }]}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Vazgeç')}</Text>
              </PressScale>
              <PressScale
                onPress={() => submit(mode === 'edit' ? 'note' : 'mark')}
                disabled={!!busy}
                style={[pill, { backgroundColor: panel.primary }]}
              >
                {busy && busy !== 'unmark' ? <ActivityIndicator size="small" color={ctaInk} /> : null}
                <Text style={{ fontSize: 13, fontWeight: '700', color: ctaInk }}>{autoT('Kaydet')}</Text>
              </PressScale>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
