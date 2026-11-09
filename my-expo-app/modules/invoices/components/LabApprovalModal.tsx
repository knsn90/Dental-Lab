/**
 * Lab — "Klinik adına onay kaydet" (K5).
 *
 * Ortalanmış popup (U.modalOverlay). Mod seçimi (itirazsızlar / tümü) + ZORUNLU gerekçe.
 * record_clinic_approval'a verilen faturalar sunucudan geldiği gibi gider (updated_at dizgisi
 * aynen — K6). Sonuç popup'ta özetlenir; ebeveyn onDone() ile ekstreyi yeniden çeker.
 * Bu onay ekstrede "Lab tarafından kaydedildi · tarih · gerekçe" diye ayrı görünür.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, Pressable, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { X, FileCheck, Info, CheckCircle2, AlertTriangle } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { recordClinicApproval } from '../preStatementApi';
import { preStatementErrorText, summarizeApproval, undisputedCount } from '../lib/preStatement';
import type { ApprovalMode, PreStatementInvoice } from '../types';

type Summary = { issued: number; changed: number; disputed: number };

export function LabApprovalModal({ open, clinicId, invoices, onClose, onDone }: {
  open: boolean;
  clinicId: string;
  /** Onaylanacak taslaklar — get_pre_statement'tan AYNEN (updated_at dizgisi dokunulmadan). */
  invoices: PreStatementInvoice[];
  onClose: () => void;
  /** Onay sonrası / kapsam hatasında ebeveyn yeniden yükler. */
  onDone: () => Promise<void> | void;
}) {
  const U = useInkUI();
  const total = invoices.length;
  const undisputed = undisputedCount(invoices);
  const [mode, setMode] = useState<ApprovalMode>('undisputed');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  // Çift dokunuşta ikinci kayıt gitmesin (state bir sonraki çizime kadar eski kalır).
  const inFlight = useRef(false);

  // Her açılışta temiz başla; itirazsız fatura yoksa "tümü" seçili gelir.
  useEffect(() => {
    if (!open) return;
    setMode(undisputed > 0 ? 'undisputed' : 'all');
    setReason(''); setError(null); setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (inFlight.current || result) return;
    const text = reason.trim();
    if (!text) { setError(autoT('Gerekçe zorunlu')); return; }
    if (mode === 'undisputed' && undisputed === 0) { setError(autoT('Onaylanacak fatura seçilmedi')); return; }
    inFlight.current = true;
    setBusy(true); setError(null);
    try {
      const r = await recordClinicApproval(clinicId, invoices, mode, text);
      setResult(summarizeApproval(r));
      await onDone();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const known = preStatementErrorText(msg);
      setError(known ? autoT(known) : msg);
      if (/PS_SCOPE|PS_NOT_DRAFT/.test(msg)) void onDone();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const close = () => { if (!busy) onClose(); };

  const Option = ({ value, label, hint, disabled }: { value: ApprovalMode; label: string; hint: string; disabled?: boolean }) => {
    const active = mode === value;
    return (
      <Pressable
        onPress={() => { if (!disabled) { setMode(value); setError(null); } }}
        disabled={disabled || !!result}
        accessibilityRole="radio"
        accessibilityState={{ checked: active, disabled }}
        style={{
          flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 14,
          borderWidth: 1.5, borderColor: active ? U.ink[900] : U.plainBtn.border,
          backgroundColor: U.plainBtn.bg, opacity: disabled ? 0.45 : 1,
          ...(Platform.OS === 'web' ? { cursor: disabled ? 'default' : 'pointer' } as any : {}),
        }}
      >
        <View style={{
          width: 16, height: 16, borderRadius: 8, marginTop: 1, borderWidth: 1.5,
          borderColor: active ? U.ink[900] : U.ink[300], alignItems: 'center', justifyContent: 'center',
        }}>
          {active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: U.ink[900] }} /> : null}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{label}</Text>
          <Text style={{ fontSize: 11.5, color: U.ink[500], lineHeight: 16 }}>{hint}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={U.modalOverlay}>
          <View style={[U.modalCard, { maxWidth: 480 }]}>
            <View style={U.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipTones.warning.bg }}>
                  <FileCheck size={16} color={U.chipTones.warning.fg} strokeWidth={1.8} />
                </View>
                <Text style={U.modalTitle} numberOfLines={1}>{autoT('Klinik adına onay kaydet')}</Text>
              </View>
              <GlassTooltip title={autoT('Kapat')} text={autoT('Pencereyi kapatır')} placement="bottom">
                <Pressable onPress={close} accessibilityLabel={autoT('Kapat')} style={U.modalCloseBtn}>
                  <X size={14} color={U.ink[700]} strokeWidth={2} />
                </Pressable>
              </GlassTooltip>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Info size={14} color={U.ink[400]} strokeWidth={1.8} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 12.5, color: U.ink[500], lineHeight: 18 }}>
                  {autoT('Klinik onayını telefonla ya da yazılı aldıysanız kaydedin. Ekstrede "Lab tarafından kaydedildi" diye ayrıca görünür; kesinleşen fatura düzenlenemez.')}
                </Text>
              </View>

              {total > 1 || undisputed < total ? (
                <View style={{ gap: 8 }}>
                  <Option
                    value="undisputed"
                    label={`${autoT('İtirazsız kalemleri onayla')} (${undisputed})`}
                    hint={autoT('İtirazlı kalem içeren faturalar taslakta kalır')}
                    disabled={undisputed === 0}
                  />
                  <Option
                    value="all"
                    label={`${autoT('Tümünü onayla')} (${total})`}
                    hint={autoT('İtirazlılar dahil tüm taslak faturaları kesinleştirir')}
                  />
                </View>
              ) : (
                <Text style={{ fontSize: 13, color: U.ink[700] }}>
                  {`${total} ${autoT('taslak fatura kesinleşecek; bu işlem geri alınamaz.')}`}
                </Text>
              )}

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.ink[700] }}>{autoT('Gerekçe')}</Text>
                <TextInput
                  value={reason}
                  onChangeText={(v) => { setReason(v); if (error) setError(null); }}
                  editable={!result}
                  placeholder={autoT('Örn. 05.11.2026 telefon görüşmesine göre')}
                  placeholderTextColor={U.ink[400]}
                  multiline
                  maxLength={500}
                  style={[U.inputStyle, { height: 76, paddingTop: 10, textAlignVertical: 'top' }]}
                />
              </View>

              {result ? <ApprovalResultLine r={result} /> : null}

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 4 }}>
                {error ? (
                  <Text style={{ flex: 1, minWidth: 160, fontSize: 12, color: U.chipTones.danger.fg }}>{error}</Text>
                ) : null}
                <Pressable
                  onPress={close}
                  disabled={busy}
                  style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, opacity: busy ? 0.5 : 1 }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.plainBtn.fg }}>{result ? autoT('Kapat') : autoT('Vazgeç')}</Text>
                </Pressable>
                {!result ? (
                  <Pressable
                    onPress={submit}
                    disabled={busy}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 9,
                      borderRadius: 999, backgroundColor: U.ink[900], opacity: busy ? 0.6 : 1,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    {busy ? <ActivityIndicator size="small" color={U.onDarkPill} /> : null}
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.onDarkPill }}>{autoT('Onayı kaydet')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ApprovalResultLine({ r }: { r: Summary }) {
  const U = useInkUI();
  const warn = r.issued === 0 || r.changed > 0 || r.disputed > 0;
  const tone = warn ? U.chipTones.warning : U.chipTones.success;
  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: tone.bg, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {warn
          ? <AlertTriangle size={14} color={tone.fg} strokeWidth={1.8} />
          : <CheckCircle2 size={14} color={tone.fg} strokeWidth={1.8} />}
        <Text style={{ fontSize: 13, fontWeight: '700', color: tone.fg }}>{`${r.issued} ${autoT('fatura kesinleşti')}`}</Text>
      </View>
      {r.changed > 0 ? (
        <Text style={{ fontSize: 12.5, color: tone.fg }}>
          {`${r.changed} ${autoT('fatura bu arada değişti; yeniden gözden geçirin')}`}
        </Text>
      ) : null}
      {r.disputed > 0 ? (
        <Text style={{ fontSize: 12.5, color: tone.fg }}>{`${r.disputed} ${autoT('itirazlı fatura onay bekliyor')}`}</Text>
      ) : null}
    </View>
  );
}
