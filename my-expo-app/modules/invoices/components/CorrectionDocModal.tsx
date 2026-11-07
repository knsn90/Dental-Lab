// CorrectionDocModal — kesinleşmiş faturanın bir kalemine düzeltme belgesi (DZ) yazar.
//
// DZ, kalemin tutarını eksi yönde düzelten ayrı bir belgedir (spec §2.9): fatura değişmez,
// tutar önce faturanın açık kısmını kapatır, artanı kliniğin alacağına geçer. Hesap ve
// kayıt sunucudadır (record_correction_document); burada yalnız önizleme ve ön kontrol var.
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, Pressable, TextInput, Platform, ActivityIndicator, ScrollView,
  KeyboardAvoidingView, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, AlertCircle } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { DatePicker } from '../../../core/ui/DatePicker';
import { toast } from '../../../core/ui/Toast';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { labTodayOf } from '../../../core/metrics/orderDefs';
import { cachedLabTz } from '../../../core/metrics/useLabToday';
import { recordCorrectionDocument } from '../api';
import {
  correctionCap, correctionSplit, validateCorrection, dzErrorText, correctionDocNo,
} from '../lib/correctionDoc';
import type { Invoice } from '../types';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const toNum = (v: string) => Number(String(v ?? '').replace(',', '.'));

function newIdemKey(): string {
  try {
    const c = (globalThis as any).crypto;
    if (c && typeof c.randomUUID === 'function') return 'dz-' + c.randomUUID();
  } catch { /* yok */ }
  return `dz-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface CorrectionDocModalProps {
  visible: boolean;
  onClose(): void;
  onSaved(): void;
  invoice: Pick<Invoice, 'id' | 'invoice_number' | 'currency' | 'total' | 'paid_amount' | 'efatura_uuid' | 'efatura_status'>;
  item: { id: string; description: string; net_total: number };
  priorOnItem: number;
  /** Hazır tavan (kalem payı ve fatura kalanı; correctionMaxAmount). Yoksa kalem net − önceki DZ. */
  cap?: number;
}

export function CorrectionDocModal({ visible, onClose, onSaved, invoice, item, priorOnItem, cap: capProp }: CorrectionDocModalProps) {
  const U = useInkUI();
  const theme = usePanelTheme();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const narrow = winW < 560;

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(() => labTodayOf(cachedLabTz()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const idemRef = useRef<string>('');

  // Açılışta sıfırla; idempotency anahtarı pencere başına bir kez (çift tıklama tek kayıt).
  useEffect(() => {
    if (!visible) return;
    idemRef.current = newIdemKey();
    setAmount(''); setReason('');
    setDate(labTodayOf(cachedLabTz()));
    setErr(null); setBusy(false);
  }, [visible, item.id]);

  const currency = invoice.currency || 'TRY';
  const fmt = (n: number) => formatMoney(Number(n) || 0, currency as Currency, { fractionDigits: 2 });
  const cap = capProp != null && Number.isFinite(Number(capProp))
    ? Math.max(0, Number(capProp))
    : correctionCap(Number(item.net_total) || 0, Number(priorOnItem) || 0);
  const v = toNum(amount);
  const split = Number.isFinite(v) && v > 0
    ? correctionSplit({ invoiceTotal: Number(invoice.total) || 0, paidAmount: Number(invoice.paid_amount) || 0, amount: v })
    : null;
  const efSent = !!invoice.efatura_uuid && invoice.efatura_status !== 'cancelled';

  const save = async () => {
    if (busy) return;
    setErr(null);
    const code = validateCorrection({ amount: Number.isFinite(v) ? v : 0, reason, cap });
    if (code) { setErr(code); return; }
    if (!ISO.test(date)) { setErr('error'); return; }
    setBusy(true);
    const res = await recordCorrectionDocument({
      invoiceItemId: item.id, amount: v, date, reason: reason.trim(), idempotencyKey: idemRef.current,
    });
    setBusy(false);
    if (res.error || !res.data) { setErr(res.error ?? 'error'); return; }
    toast.success(autoT('Düzeltme belgesi kaydedildi') + ': ' + correctionDocNo(res.data.doc_no));
    onSaved();
  };

  const label: any = { ...U.colHeader, marginBottom: 6 };
  const input: any = U.inputStyle;
  const web = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

  const Row = ({ k, val, strong }: { k: string; val: string; strong?: boolean }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ flex: 1, fontSize: 12.5, color: strong ? U.ink[900] : U.ink[700], fontWeight: strong ? '600' : '400' }}>{k}</Text>
      <Text style={{ fontSize: 13, fontWeight: strong ? '700' : '600', color: U.ink[900] }}>{val}</Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ ...U.modalOverlay, padding: narrow ? 12 : 24 }}>
          <View style={[U.modalCard, { maxWidth: 480 }, narrow ? { maxHeight: '94%' } : null]}>
            {/* Başlık */}
            <View style={U.modalHeaderRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={U.modalTitle} numberOfLines={1}>{autoT('Düzeltme belgesi')}</Text>
                <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 2 }} numberOfLines={1}>
                  {[invoice.invoice_number, item.description].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <GlassTooltip title={autoT('Kapat')} text={autoT('Pencereyi kaydetmeden kapat')} placement="bottom">
                <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={autoT('Kapat')}
                  style={{ ...U.modalCloseBtn, ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}) }}>
                  <X size={15} color={U.ink[500]} strokeWidth={2} />
                </Pressable>
              </GlassTooltip>
            </View>

            <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }} keyboardShouldPersistTaps="handled">
              {efSent ? (
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 12, backgroundColor: U.chipTones.warning.bg }}>
                  <AlertCircle size={15} color={U.chipTones.warning.fg} strokeWidth={1.8} />
                  <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: U.chipTones.warning.fg }}>
                    {autoT('Bu faturanın e-faturası gönderilmiş. E-fatura tarafını (iade/fiyat farkı) muhasebecinizle düzenleyin; DZ yalnız Siman içi belgedir.')}
                  </Text>
                </View>
              ) : null}

              {/* Tutar + kalan */}
              <View>
                <Text style={label}>{autoT('Tutar')}</Text>
                <TextInput value={amount} onChangeText={t => { setAmount(t); setErr(null); }} keyboardType="decimal-pad"
                  style={input} placeholder={currency} placeholderTextColor={U.ink[400]} accessibilityLabel={autoT('Tutar')} />
                <Text style={{ marginTop: 6, fontSize: 12, color: U.ink[500] }}>
                  {autoT('Kalan tutar')}{': '}{fmt(cap)}
                </Text>
              </View>

              {/* Önizleme — faturaya / alacağa */}
              <View style={{ borderRadius: 14, backgroundColor: U.surfaceSoft, borderWidth: 1, borderColor: U.hairline, padding: 14, gap: 8 }}>
                <Row k={autoT('Bu faturaya')} val={split ? `−${fmt(split.toInvoice)}` : '—'} />
                <Row k={autoT('Alacağa')} val={split ? fmt(split.toCredit) : '—'} />
              </View>

              {/* Gerekçe */}
              <View>
                <Text style={label}>{autoT('Gerekçe')}</Text>
                <TextInput value={reason} onChangeText={t => { setReason(t); setErr(null); }} multiline
                  style={[input, { minHeight: 76, textAlignVertical: 'top', paddingTop: 10 }]}
                  placeholder={autoT('Örn. Model ücretsiz olmalıydı')} placeholderTextColor={U.ink[400]}
                  accessibilityLabel={autoT('Gerekçe')} />
              </View>

              {/* Belge tarihi */}
              <View>
                <Text style={label}>{autoT('Belge tarihi')}</Text>
                <DatePicker value={date} onChange={(d) => { setDate(d); setErr(null); }} accent={theme.primary} compact />
              </View>
            </ScrollView>

            {/* Alt bar — hata düğmenin yanında */}
            <View style={{
              flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'flex-end',
              paddingHorizontal: 18, paddingTop: 14,
              paddingBottom: 14 + (Platform.OS === 'web' ? 0 : insets.bottom),
              borderTopWidth: 1, borderTopColor: U.hairline,
            }}>
              {err ? (
                <Text accessibilityRole="alert" style={{ flex: 1, fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }}>
                  {autoT(dzErrorText(err))}
                </Text>
              ) : null}
              <Pressable onPress={onClose}
                style={[{
                  paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
                  borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
                }, web]}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Vazgeç')}</Text>
              </Pressable>
              <GlassTooltip title={autoT('Kaydet')}
                text={autoT('Düzeltme belgesini kaydet; tutar bu faturadan düşer, artan kısım kliniğin alacağına geçer')}
                enabled={!busy}>
                <Pressable onPress={save} disabled={busy} accessibilityRole="button"
                  style={[{
                    flexDirection: 'row', alignItems: 'center', gap: 7,
                    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
                    backgroundColor: U.ink[900], opacity: busy ? 0.6 : 1,
                  }, Platform.OS === 'web' ? ({ cursor: busy ? 'not-allowed' : 'pointer' } as any) : null]}>
                  {busy ? <ActivityIndicator size="small" color={U.onDarkPill} /> : null}
                  <Text style={{ fontSize: 13, fontWeight: '700', color: U.onDarkPill }}>{autoT('Kaydet')}</Text>
                </Pressable>
              </GlassTooltip>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
