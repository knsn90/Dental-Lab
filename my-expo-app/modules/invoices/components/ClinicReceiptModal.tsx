// ClinicReceiptModal — klinikten fatura-bağımsız, çoklu döviz tahsilat.
//
// NEDEN: tahsilat yalnız fatura içinden girilebiliyordu; bir klinikten toplu
// ödeme alındığında (710 EUR borca karşılık 800 USD + 600 TL nakit gibi)
// girilecek yer yoktu. Üstelik ödeme para birimi faturanınkinden farklı
// olamıyordu.
//
// Fiş satırları kasaya giren GERÇEK parayı tutar. Dağıtım önizlemesi
// sunucudaki preview_clinic_receipt'ten gelir — dağıtım mantığının tek kaynağı
// orasıdır, istemcide ikinci bir hesap YAZILMAZ (ikisi zamanla ayrışırdı).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, Pressable, TextInput, Platform, ActivityIndicator, ScrollView,
  KeyboardAvoidingView, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Plus, Trash2 } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { toast } from '../../../core/ui/Toast';
import { getRate } from '../../../core/money/currency';
import { getBaseCurrency } from '../../../core/money/baseCurrency';
import { previewClinicReceipt, recordClinicReceipt } from '../api';
import type { ReceiptLine, ReceiptResult } from '../types';

const CCY: ReceiptLine['currency'][] = ['TRY', 'EUR', 'USD', 'GBP'];
const METHODS = ['nakit', 'kart', 'havale', 'cek', 'diger'] as const;
const METHOD_LABEL: Record<string, string> = {
  nakit: 'Nakit', kart: 'Kart', havale: 'Havale', cek: 'Çek', diger: 'Diğer',
};

type Row = { currency: ReceiptLine['currency']; amount: string; rate: string };

const num = (v: string) => Number(String(v ?? '').replace(',', '.'));
const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ClinicReceiptModal({
  visible, clinicId, clinicName, onClose, onSaved,
}: {
  visible: boolean;
  clinicId: string | null;
  clinicName?: string;
  onClose: () => void;
  onSaved?: (r: ReceiptResult) => void;
}) {
  const U = useInkUI();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const narrow = winW < 560;
  const base = getBaseCurrency();
  const [rows, setRows]       = useState<Row[]>([{ currency: base as any, amount: '', rate: '1' }]);
  const [date, setDate]       = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod]   = useState<string>('nakit');
  const [refNo, setRefNo]     = useState('');
  const [notes, setNotes]     = useState('');
  const [preview, setPreview] = useState<ReceiptResult | null>(null);
  const [busy, setBusy]       = useState(false);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const idemRef = useRef<string>('');
  const debRef  = useRef<any>(null);

  useEffect(() => {
    if (!visible) return;
    idemRef.current = `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setRows([{ currency: base as any, amount: '', rate: '1' }]);
    setPreview(null); setRefNo(''); setNotes(''); setMethod('nakit'); setBusy(false);
    setDate(new Date().toISOString().slice(0, 10));
  }, [visible, base]);

  /** Para birimi değişince kuru o günün kuruyla DOLDUR — üzerine yazılabilir. */
  const setRowCurrency = useCallback(async (i: number, c: ReceiptLine['currency']) => {
    setRows(prev => prev.map((r, k) => (k === i ? { ...r, currency: c } : r)));
    try {
      const rate = await getRate(c as any, base as any);
      setRows(prev => prev.map((r, k) => (k === i ? { ...r, rate: String(rate ?? 1) } : r)));
    } catch { /* kur alınamadı → kullanıcı elle girer */ }
  }, [base]);

  const validLines = useCallback((): ReceiptLine[] => rows
    .map(r => ({ currency: r.currency, amount: num(r.amount), rate: num(r.rate) }))
    .filter(l => isFinite(l.amount) && l.amount > 0 && isFinite(l.rate) && l.rate > 0),
  [rows]);

  // Satırlar değiştikçe sunucudan dağıtım önizlemesi.
  useEffect(() => {
    if (!visible || !clinicId) return;
    const lines = validLines();
    if (debRef.current) clearTimeout(debRef.current);
    if (lines.length === 0) { setPreview(null); return; }
    debRef.current = setTimeout(async () => {
      setLoadingPrev(true);
      try { setPreview(await previewClinicReceipt(clinicId, lines)); }
      catch { setPreview(null); }
      finally { setLoadingPrev(false); }
    }, 400);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [visible, clinicId, validLines]);

  const save = async () => {
    if (!clinicId) return;
    const lines = validLines();
    if (lines.length === 0) { toast.error(autoT('En az bir tahsilat satırı gerekli')); return; }
    setBusy(true);
    try {
      const res = await recordClinicReceipt({
        clinicId, lines, receiptDate: date, method,
        referenceNo: refNo.trim() || null, notes: notes.trim() || null,
        idempotencyKey: idemRef.current,
      });
      toast.success(autoT('Tahsilat kaydedildi'));
      onSaved?.(res);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? autoT('Tahsilat kaydedilemedi'));
    } finally { setBusy(false); }
  };

  const totalBase = validLines().reduce((s, l) => s + l.amount * l.rate, 0);

  // Uygulama genelindeki modal standardi: useInkUI'nin hazir yuzeyleri.
  // useMobileTokens panel zeminini kullaniyor, finans panelinde o mavimsi
  // ciktigi icin form "siteye uygun" gorunmuyordu.
  const label: any = { ...U.colHeader, marginBottom: 6 };
  const input: any = U.inputStyle;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Uygulama modal standardi: U.modalOverlay / modalCard / modalHeaderRow.
          Arka plan ayrica bulaniklastirilir (site geneli popup kalibi). */}
      {/* iOS'ta klavye alt alanlari (tutar/kur/not) kapatiyordu → kart yukari
          kaysin. Dar ekranda overlay dolgusu 24 -> 12: 24 kart genisligini
          gereksiz kirpiyordu. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
      <View style={{
        ...U.modalOverlay,
        padding: narrow ? 12 : 24,
        ...(Platform.OS === 'web'
          ? { backdropFilter: 'blur(10px) saturate(120%)',
              WebkitBackdropFilter: 'blur(10px) saturate(120%)' } as any
          : null),
      }}>
        <View style={[U.modalCard, narrow ? { maxHeight: '94%' } : null]}>
          {/* Başlık */}
          <View style={U.modalHeaderRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={U.modalTitle} numberOfLines={1}>Tahsilat ekle</Text>
              {clinicName ? (
                <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 2 }} numberOfLines={1}>
                  {clinicName}
                </Text>
              ) : null}
            </View>
            <GlassTooltip title={autoT('Kapat')} text={autoT('Pencereyi kaydetmeden kapat')} placement="bottom">
              <Pressable onPress={onClose} hitSlop={8}
                style={{ ...U.modalCloseBtn,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}) }}>
                <X size={15} color={U.ink[500]} strokeWidth={2} />
              </Pressable>
            </GlassTooltip>
          </View>

          <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
            {/* Tarih + yöntem */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={label}>Tarih</Text>
                <TextInput value={date} onChangeText={setDate} style={input}
                  placeholder="YYYY-AA-GG" placeholderTextColor={U.ink[400]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={label}>Referans</Text>
                <TextInput value={refNo} onChangeText={setRefNo} style={input}
                  placeholder={autoT('Dekont no')} placeholderTextColor={U.ink[400]} />
              </View>
            </View>

            <View>
              <Text style={label}>Ödeme yöntemi</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {METHODS.map(m => {
                  const on = method === m;
                  return (
                    <Pressable key={m} onPress={() => setMethod(m)}
                      style={{
                        paddingHorizontal: on ? 14 : 11, paddingVertical: 7, borderRadius: 999,
                        backgroundColor: on ? U.ink[900] : U.surfaceSoft,
                        borderWidth: 1, borderColor: on ? U.ink[900] : U.hairline,
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      }}>
                      <Text style={{ fontSize: 12.5, fontWeight: on ? '700' : '500',
                                     color: on ? U.surface : U.ink[700] }}>
                        {autoT(METHOD_LABEL[m])}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Para birimi satırları */}
            <View>
              <Text style={label}>Alınan para</Text>
              <View style={{ gap: 8 }}>
                {rows.map((r, i) => {
                  const b = num(r.amount) * num(r.rate);
                  return (
                    <View key={i} style={{ gap: 6 }}>
                      {/* Para birimi cipleri AYRI satirda: tek satirda ciplerle
                          birlikte tutar+kur+sil sigmiyor, sil dugmesi karttan
                          disari tasiyordu. */}
                      <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                          {CCY.map(c => {
                            const on = r.currency === c;
                            return (
                              <Pressable key={c} onPress={() => setRowCurrency(i, c)}
                                style={{
                                  paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9,
                                  backgroundColor: on ? `${U.ink[900]}14` : 'transparent',
                                  borderWidth: 1, borderColor: on ? U.ink[700] : U.hairline,
                                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                                }}>
                                <Text style={{ fontSize: 11.5, fontWeight: on ? '700' : '500',
                                               color: on ? U.ink[900] : U.ink[400] }}>{c}</Text>
                              </Pressable>
                            );
                          })}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <TextInput value={r.amount} keyboardType="decimal-pad"
                          onChangeText={v => setRows(p => p.map((x, k) => k === i ? { ...x, amount: v } : x))}
                          style={[input, { flex: 1, minWidth: 0 }]} placeholder={autoT('Tutar')}
                          placeholderTextColor={U.ink[400]} />
                        <TextInput value={r.rate} keyboardType="decimal-pad"
                          onChangeText={v => setRows(p => p.map((x, k) => k === i ? { ...x, rate: v } : x))}
                          style={[input, { width: 104, flexShrink: 0 }]} placeholder={autoT('Kur')}
                          placeholderTextColor={U.ink[400]} />
                        {rows.length > 1 ? (
                          <GlassTooltip title={autoT('Satırı sil')} text={autoT('Bu para birimi satırını kaldır')}>
                            <Pressable onPress={() => setRows(p => p.filter((_, k) => k !== i))} hitSlop={6}
                              style={{ padding: 6, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                              <Trash2 size={15} color={U.ink[400]} strokeWidth={1.9} />
                            </Pressable>
                          </GlassTooltip>
                        ) : null}
                      </View>
                      {b > 0 ? (
                        <Text style={{ fontSize: 11, color: U.ink[400], marginStart: 4 }}>
                          {autoT('Baz karşılığı')}: {fmt(b)} {base}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
              <GlassTooltip title={autoT('Satır ekle')} text={autoT('Farklı para biriminden alınan tutar için satır ekle')}>
                <Pressable
                  onPress={() => setRows(p => [...p, { currency: base as any, amount: '', rate: '1' }])}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8,
                    alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 7,
                    borderRadius: 999, backgroundColor: U.surfaceSoft,
                    borderWidth: 1, borderColor: U.hairline,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}>
                  <Plus size={13} color={U.ink[700]} strokeWidth={2.2} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700] }}>Satır ekle</Text>
                </Pressable>
              </GlassTooltip>
            </View>

            {/* Dağıtım önizlemesi — sunucudan */}
            <View style={{
              borderRadius: 14, backgroundColor: U.surfaceSoft,
              borderWidth: 1, borderColor: U.hairline, padding: 14, gap: 8,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: U.ink[400],
                               letterSpacing: 0.4, textTransform: 'uppercase', flex: 1 }}>
                  Dağıtım
                </Text>
                {loadingPrev ? <ActivityIndicator size="small" color={U.ink[400]} /> : null}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12.5, color: U.ink[700] }}>Toplam tahsilat</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>
                  {fmt(totalBase)} {base}
                </Text>
              </View>

              {(preview?.allocations ?? []).map(a => (
                <View key={a.invoice_id}
                  style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12.5, color: U.ink[400] }} numberOfLines={1}>
                    {a.invoice_no ?? '—'}
                  </Text>
                  <Text style={{ fontSize: 12.5, color: U.ink[700] }}>
                    {fmt(Number(a.amount) || 0)} {a.currency}
                  </Text>
                </View>
              ))}

              {preview && (preview.allocations ?? []).length === 0 ? (
                <Text style={{ fontSize: 12, color: U.ink[400] }}>
                  Kapatılacak açık fatura yok
                </Text>
              ) : null}

              {preview ? (
                <View style={{
                  flexDirection: 'row', justifyContent: 'space-between',
                  borderTopWidth: 1, borderTopColor: U.hairline, paddingTop: 8,
                }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.ink[700] }}>
                    Kalan alacak
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: U.ink[900] }}>
                    {fmt(Number(preview.credit_base) || 0)} {base}
                  </Text>
                </View>
              ) : null}
            </View>

            <View>
              <Text style={label}>Not</Text>
              {/* Cok satirli girdide metin dikeyde ORTALANMAZ; ustten dolgu
                  verilmezse imlec ve yer tutucu kenara yapisiyor. */}
              <TextInput value={notes} onChangeText={setNotes} multiline
                style={[input, { height: 78, paddingTop: 12, paddingBottom: 12,
                                 textAlignVertical: 'top' as any }]}
                placeholder={autoT('İsteğe bağlı')} placeholderTextColor={U.ink[400]} />
            </View>
          </ScrollView>

          {/* Alt bar */}
          <View style={{
            flexDirection: 'row', gap: 8, justifyContent: 'flex-end',
            paddingHorizontal: 18, paddingTop: 14,
            // Home indicator'un altinda kalmasin.
            paddingBottom: 14 + (Platform.OS === 'web' ? 0 : insets.bottom),
            borderTopWidth: 1, borderTopColor: U.hairline,
          }}>
            <Pressable onPress={onClose}
              style={{
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
                borderWidth: 1, borderColor: U.hairline, backgroundColor: U.surfaceSoft,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[700] }}>Vazgeç</Text>
            </Pressable>
            <GlassTooltip title={autoT('Kaydet')}
              text={autoT('Tahsilatı kaydet ve en eski faturadan başlayarak dağıt')}
              enabled={!busy}>
              <Pressable onPress={save} disabled={busy}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 7,
                  paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
                  backgroundColor: U.ink[900], opacity: busy ? 0.6 : 1,
                  ...(Platform.OS === 'web' ? { cursor: busy ? 'not-allowed' : 'pointer' } as any : {}),
                }}>
                {busy ? <ActivityIndicator size="small" color={U.surface} /> : null}
                <Text style={{ fontSize: 13, fontWeight: '700', color: U.surface }}>Kaydet</Text>
              </Pressable>
            </GlassTooltip>
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
