/**
 * TransactionFormModal — cari hesaba ödeme/iade/manuel fatura/düzeltme ekle.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform, Modal, TextInput, ScrollView} from 'react-native';
import { X, Check, ArrowDownCircle, ArrowUpCircle, RotateCcw, Settings as Adjust, AlertCircle, FileUp, Sparkles } from '../../../core/ui/icons';
import {
  Supplier, SupplierTransaction, TransactionType, PaymentMethod,
  TX_TYPE_LABELS, PAYMENT_METHOD_LABELS, recordTransaction, updateTransaction,
} from '../api';
import { useAuthStore } from '../../../core/store/authStore';
import { MoneyInput } from '../../../core/money/MoneyInput';
import { DatePicker } from '../../../core/ui/DatePicker';
import { type Currency, useExchangeRate , useExchangeRateInfo } from '../../../core/money/currency';
import { supabase } from '../../../core/api/supabase';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

interface Props {
  visible: boolean;
  type: TransactionType;
  supplier: Supplier;
  /** Edit modu — bu varsa form mevcut hareketi düzenler. Tip prop'u "type" alanından okunur. */
  editing?: SupplierTransaction | null;
  accentColor?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function TransactionFormModal({ visible, type, supplier, editing = null, accentColor = '#0A0A0A', onClose, onSaved }: Props) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const isEdit = !!editing;
  const profile = useAuthStore(s => s.profile);
  const labId = (profile as any)?.lab_id ?? null;

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transfer');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [description, setDescription] = useState('');
  const [bankName, setBankName] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [iban, setIban] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseInfo, setParseInfo] = useState<string | null>(null);

  // ── Cari (hesap) para birimine çevirme — elle kur ────────────────────────
  // acctRate = 1 birim CARİ para birimi kaç birim İŞLEM para birimi (1 EUR = 38,50 ₺).
  // Tek doğruluk kaynağı acctRate; karşılık alanı ondan türetilir. Kullanıcı
  // karşılığı yazarsa kur anında geri hesaplanır (iki yönlü).
  const acctCurrency = (supplier.default_currency ?? 'TRY') as Currency;
  const needsRate = currency !== acctCurrency;
  const [acctRate, setAcctRate] = useState('');
  const [acctAmtDraft, setAcctAmtDraft] = useState<string | null>(null);

  const amtNum = parseFloat(amount.replace(',', '.'));
  const rateNum = parseFloat(acctRate.replace(',', '.'));
  const acctAmtComputed = Number.isFinite(amtNum) && Number.isFinite(rateNum) && rateNum > 0
    ? amtNum / rateNum : null;
  const acctAmtShown = acctAmtDraft ?? (acctAmtComputed != null
    ? acctAmtComputed.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '');

  // Otomatik kur ile ön-doldur (kullanıcı üzerine yazabilir).
  // Kaynak da okunur: TCMB mi, yer tutucu mu — ekranda söylenir.
  const txInfo   = useExchangeRateInfo(currency, 'TRY', date);
  const acctInfo = useExchangeRateInfo(acctCurrency, 'TRY', date);
  const rateTxBase   = txInfo.rate;
  const rateAcctBase = acctInfo.rate;
  const ratePlaceholder = txInfo.isPlaceholder || acctInfo.isPlaceholder;
  const rateSourceLabel = (() => {
    const src = txInfo.source === 'same' ? acctInfo.source : txInfo.source;
    const eff = txInfo.source === 'same' ? acctInfo.effectiveDate : txInfo.effectiveDate;
    if (!src) return null;
    if (src === 'tcmb')   return `TCMB · ${eff ?? ''}`;
    if (src === 'manual') return `Elle girilen kur · ${eff ?? ''}`;
    if (src === 'system') return 'Yer tutucu kur';
    return null;
  })();
  useEffect(() => {
    if (!visible || !needsRate) return;
    if (acctRate) return;                       // kullanıcı zaten girdi
    if (!rateTxBase || !rateAcctBase) return;
    const auto = rateAcctBase / rateTxBase;
    if (Number.isFinite(auto) && auto > 0) setAcctRate(auto.toFixed(4));
  }, [visible, needsRate, rateTxBase, rateAcctBase, acctRate]);

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setAmount(String(editing.amount));
      setCurrency((editing.currency as Currency) ?? 'TRY');
      setPaymentMethod((editing.payment_method as PaymentMethod) ?? 'transfer');
      setInvoiceNo(editing.invoice_no ?? '');
      setDescription(editing.description ?? '');
      setBankName(editing.bank_name ?? '');
      setReferenceNo(editing.reference_no ?? '');
      setIban(editing.iban ?? '');
      setDate(editing.transaction_date);
      setDueDate(editing.due_date ?? '');
    } else {
      setAmount('');
      setCurrency(supplier.default_currency ?? 'TRY');
      setPaymentMethod('transfer');
      setInvoiceNo('');
      setDescription('');
      setBankName(''); setReferenceNo(''); setIban('');
      setDate(new Date().toISOString().slice(0, 10));
      setDueDate('');
    }
    setError('');
    setAcctRate(editing?.account_rate_at_time != null ? String(editing.account_rate_at_time) : '');
    setAcctAmtDraft(null);
    setParseInfo(null); setParsing(false);
  }, [visible, type, supplier, editing]);

  // ── Dekont OCR ──
  const handleParseReceipt = async (file: File) => {
    setError(''); setParseInfo(null); setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      const file_base64 = btoa(binary);
      const mime_type = file.type || 'application/pdf';

      const { data, error: fnErr } = await supabase.functions.invoke('parse-receipt', {
        body: { file_base64, mime_type },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (!data?.ok) throw new Error(data?.error ?? 'Parse başarısız');

      const d = data.data;
      if (d.amount != null)         setAmount(String(d.amount));
      if (d.currency && ['TRY','USD','EUR','GBP','IRT'].includes(d.currency)) setCurrency(d.currency as Currency);
      if (d.transaction_date)       setDate(d.transaction_date);
      if (d.payment_method && ['transfer','cash','card','check'].includes(d.payment_method)) {
        setPaymentMethod(d.payment_method as PaymentMethod);
      }
      if (d.bank_name)      setBankName(String(d.bank_name));
      if (d.reference_no)   setReferenceNo(String(d.reference_no));
      if (d.recipient_iban) setIban(String(d.recipient_iban));
      if (d.description)    setDescription(String(d.description));

      setParseInfo('Dekont okundu — alanları kontrol et.');
    } catch (e: any) {
      setError('Dekont işlenemedi: ' + (e?.message ?? 'bilinmeyen hata'));
    } finally {
      setParsing(false);
    }
  };

  const handlePickReceipt = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/png,image/jpeg,image/webp';
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) handleParseReceipt(f);
    };
    input.click();
  };

  const handleSave = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!amt || amt <= 0) { setError('Geçerli bir tutar girin'); return; }
    if (needsRate && !(rateNum > 0)) {
      setError(`Cari ${acctCurrency} tutulduğu için kur gerekli — 1 ${acctCurrency} kaç ${currency}?`);
      return;
    }
    setSaving(true); setError('');

    if (isEdit && editing) {
      const result = await updateTransaction(editing.id, {
        amount: amt,
        paymentMethod: type === 'PURCHASE' || type === 'PAYMENT' ? paymentMethod : null,
        invoiceNo: invoiceNo.trim() || null,
        description: description.trim() || null,
        transactionDate: date,
        dueDate: dueDate || null,
        bankName: bankName.trim() || null,
        referenceNo: referenceNo.trim() || null,
        iban: iban.trim().replace(/\s+/g, '') || null,
        // Kur da gönderilmeli — yoksa düzenlemede girilen kur yok sayılıyordu.
        accountRate: needsRate ? rateNum : null,
      });
      setSaving(false);
      if (!result.ok) { setError(result.error ?? 'Güncelleme hatası'); return; }
      onSaved();
      return;
    }

    const result = await recordTransaction({
      labId,
      supplierId: supplier.id,
      type,
      amount: amt,
      currency,
      paymentMethod: type === 'PURCHASE' || type === 'PAYMENT' ? paymentMethod : undefined,
      invoiceNo: invoiceNo.trim() || undefined,
      description: description.trim() || undefined,
      transactionDate: date,
      dueDate: dueDate || null,
      bankName: bankName.trim() || null,
      referenceNo: referenceNo.trim() || null,
      iban: iban.trim().replace(/\s+/g, '') || null,
      accountRate: needsRate ? rateNum : null,
    });
    setSaving(false);
    if (!result.ok) { setError(result.error ?? 'Kayıt hatası'); return; }
    onSaved();
  };

  const Icon = type === 'PURCHASE' ? ArrowUpCircle : type === 'PAYMENT' ? ArrowDownCircle : type === 'RETURN' ? RotateCcw : Adjust;
  const typeColor = type === 'PURCHASE' ? '#9C2E2E' : type === 'PAYMENT' ? '#1F6B47' : type === 'RETURN' ? '#0F766E' : '#6B6B6B';
  const typeHint =
    type === 'PURCHASE'   ? 'Manuel olarak fatura ekle (cariye borç olarak yazılır).' :
    type === 'PAYMENT'    ? 'Tedarikçiye yapılan ödeme. Cari bakiyeden düşer.' :
    type === 'RETURN'     ? 'İade alınan tutar. Cari bakiyeden düşer.' :
                            'Manuel düzeltme. Mutabakat farkı, açılış bakiyesi vb.';

  const DisplayFont = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';
  const inputStyle: any = {
    backgroundColor: T.cardSoft, borderRadius: 12, borderWidth: 1, borderColor: T.hairline,
    paddingHorizontal: 14, height: 44, fontSize: 14, color: T.ink,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  };
  const label: any = { fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 0.6, marginBottom: 6 };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', justifyContent: 'center', alignItems: 'center', padding: 20, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
        <View style={{
          backgroundColor: T.card, borderRadius: 20, width: 480, maxWidth: '100%', maxHeight: '90%',
          ...(Platform.OS === 'web' ? { boxShadow: '0 16px 48px rgba(0,0,0,0.2)' } as any : {}),
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: T.hairline2 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: typeColor + '14' }}>
                <Icon size={18} color={typeColor} strokeWidth={1.6} />
              </View>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>{supplier.name}</Text>
                <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 22, letterSpacing: -0.4, color: T.ink }}>
                  {isEdit ? `${TX_TYPE_LABELS[type]} · Düzenle` : TX_TYPE_LABELS[type]}
                </Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <X size={14} color={T.ink3} strokeWidth={1.8} />
            </Pressable>
          </View>

          <ScrollView style={{ padding: 20 }} contentContainerStyle={{ gap: 14 }}>
            {/* Dekont OCR — sadece PAYMENT/RETURN için */}
            {Platform.OS === 'web' && (type === 'PAYMENT' || type === 'RETURN') && (
              <View>
                <Pressable
                  onPress={handlePickReceipt}
                  disabled={parsing}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    paddingVertical: 11, paddingHorizontal: 14,
                    borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
                    borderColor: typeColor + '55',
                    backgroundColor: typeColor + '08',
                    opacity: parsing ? 0.6 : 1,
                    ...(Platform.OS === 'web' ? { cursor: parsing ? 'wait' : 'pointer' } as any : {}),
                  }}
                >
                  <FileUp size={15} color={typeColor} strokeWidth={1.8} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: typeColor }}>
                    {parsing ? 'Dekont okunuyor…' : 'Dekont/Makbuz Yükle (PDF, JPG, PNG)'}
                  </Text>
                  {!parsing && <Sparkles size={12} color={typeColor} strokeWidth={1.8} />}
                </Pressable>
                {parseInfo && (
                  <View style={{
                    marginTop: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
                    backgroundColor: 'rgba(16,185,129,0.08)',
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                  }}>
                    <Check size={12} color="#0F6E50" strokeWidth={2} />
                    <Text style={{ fontSize: 11, color: '#0F6E50', fontWeight: '600' }}>{parseInfo}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Hint card */}
            <View style={{
              flexDirection: 'row', alignItems: 'flex-start', gap: 8,
              padding: 12, backgroundColor: typeColor + '0A',
              borderRadius: 12, borderWidth: 1, borderColor: typeColor + '22',
            }}>
              <AlertCircle size={14} color={typeColor} strokeWidth={1.8} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12, color: T.ink2, lineHeight: 17 }}>{typeHint}</Text>
            </View>

            {/* Amount */}
            <View>
              <Text style={label}>TUTAR *</Text>
              <MoneyInput
                value={amount}
                onChangeValue={setAmount}
                currency={currency}
                onChangeCurrency={setCurrency}
                accentColor={accentColor}
                placeholder="0,00"
                showBasePreview
                autoFocus
              />
            </View>

            {/* Cari para birimine çevirme — işlem para birimi cariden farklıysa */}
            {needsRate && (
              <View style={{
                gap: 10, padding: 12, borderRadius: 12,
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F7F7F5',
                borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.10)' : '#EAEAEA',
              }}>
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: T.ink3, textTransform: 'uppercase' }}>
                  Cari karşılığı ({acctCurrency})
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10.5, color: T.ink3, marginBottom: 4 }}>
                      KUR — 1 {acctCurrency} = ? {currency}
                    </Text>
                    <TextInput
                      value={acctRate}
                      onChangeText={(t) => { setAcctRate(t); setAcctAmtDraft(null); }}
                      keyboardType="decimal-pad"
                      placeholder="0,0000"
                      placeholderTextColor={T.ink3}
                      style={{
                        borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.16)' : '#DDD',
                        borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9,
                        fontSize: 14, color: T.ink,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFF',
                        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10.5, color: T.ink3, marginBottom: 4 }}>
                      TUTAR ({acctCurrency})
                    </Text>
                    <TextInput
                      value={acctAmtShown}
                      onChangeText={(t) => {
                        setAcctAmtDraft(t);
                        const eur = parseFloat(t.replace(/\./g, '').replace(',', '.'));
                        if (Number.isFinite(amtNum) && Number.isFinite(eur) && eur > 0) {
                          setAcctRate(String(Number((amtNum / eur).toFixed(6))));
                        }
                      }}
                      keyboardType="decimal-pad"
                      placeholder="0,00"
                      placeholderTextColor={T.ink3}
                      style={{
                        borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.16)' : '#DDD',
                        borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9,
                        fontSize: 14, fontWeight: '700', color: T.ink,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFF',
                        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                      }}
                    />
                  </View>
                </View>
                <Text style={{ fontSize: 11, color: T.ink3, lineHeight: 16 }}>
                  Cari {acctCurrency} tutulur. Kur, işlem tarihinin Merkez Bankası kurundan
                  gelir; elle değiştirebilirsin — iki alandan birini yazınca diğeri
                  hesaplanır. Bu kur işlemle birlikte kaydedilir.
                  {rateSourceLabel ? `  (${rateSourceLabel})` : ''}
                </Text>
                {ratePlaceholder ? (
                  <View style={{
                    flexDirection: 'row', gap: 8, marginTop: 6,
                    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
                    backgroundColor: 'rgba(217,75,75,0.10)',
                  }}>
                    <Text style={{ flex: 1, fontSize: 11, lineHeight: 16, color: '#9B2C2C' }}>
                      Bu tarih için gerçek kur kaydı yok — gösterilen değer kurulum sırasında
                      konmuş bir yer tutucu. Ödemeyi bununla kaydederseniz hesap kapanmış
                      görünmez. Faturanın kurunu elle girin.
                    </Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* Date */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={label}>İŞLEM TARİHİ</Text>
                <DatePicker value={date} onChange={setDate} placeholder="Tarih seç" />
              </View>
              {(type === 'PURCHASE') && (
                <View style={{ flex: 1 }}>
                  <Text style={label}>VADE TARİHİ (ops.)</Text>
                  <DatePicker value={dueDate} onChange={setDueDate} placeholder="Vade tarihi" />
                </View>
              )}
            </View>

            {/* Payment method */}
            {(type === 'PURCHASE' || type === 'PAYMENT') && (
              <View>
                <Text style={label}>ÖDEME YÖNTEMİ</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(m => {
                    const active = paymentMethod === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => setPaymentMethod(m)}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                          backgroundColor: active ? accentColor : 'transparent',
                          borderWidth: 1, borderColor: active ? accentColor : T.hairline,
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? '#FFF' : T.ink2 }}>{PAYMENT_METHOD_LABELS[m]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Invoice no (PURCHASE) */}
            {type === 'PURCHASE' && (
              <View>
                <Text style={label}>FATURA NO (ops.)</Text>
                <TextInput style={inputStyle} value={invoiceNo} onChangeText={setInvoiceNo} placeholder="örn. ABC-2026/00123" placeholderTextColor={isDark ? (T.ink3 as string) : '#9A9A9A'} />
              </View>
            )}

            {/* Bank fields — sadece PAYMENT/RETURN için */}
            {(type === 'PAYMENT' || type === 'RETURN') && (
              <>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={label}>BANKA</Text>
                    <TextInput
                      style={inputStyle}
                      value={bankName}
                      onChangeText={setBankName}
                      placeholder="Vakıf, Ziraat, İş Bankası…"
                      placeholderTextColor={isDark ? (T.ink3 as string) : '#9A9A9A'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={label}>HAVALE / DEKONT NO</Text>
                    <TextInput
                      style={inputStyle}
                      value={referenceNo}
                      onChangeText={setReferenceNo}
                      placeholder="Ref / işlem no"
                      placeholderTextColor={isDark ? (T.ink3 as string) : '#9A9A9A'}
                    />
                  </View>
                </View>
                <View>
                  <Text style={label}>IBAN</Text>
                  <TextInput
                    style={inputStyle}
                    value={iban}
                    onChangeText={setIban}
                    placeholder="TR.. .... .... .... .... .... .."
                    placeholderTextColor={isDark ? (T.ink3 as string) : '#9A9A9A'}
                    autoCapitalize="characters"
                  />
                </View>
              </>
            )}

            {/* Description */}
            <View>
              <Text style={label}>AÇIKLAMA</Text>
              <TextInput
                style={[inputStyle, { height: 60, paddingTop: 11, paddingBottom: 11, textAlignVertical: 'top' }]}
                value={description}
                onChangeText={setDescription}
                placeholder={type === 'PAYMENT' ? 'Havale dekontu, ödeme notu vb.' : 'Açıklama / not'}
                placeholderTextColor={isDark ? (T.ink3 as string) : '#9A9A9A'}
                multiline
              />
            </View>

            {error ? <Text style={{ fontSize: 12, color: '#9C2E2E', fontWeight: '500' }}>{error}</Text> : null}
          </ScrollView>

          {/* Footer */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: T.hairline2, backgroundColor: isDark ? T.cardSoft : '#FBF9F4' }}>
            <Pressable onPress={onClose} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: T.ink2 }}>Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999,
                backgroundColor: typeColor, opacity: saving ? 0.5 : 1,
                ...(Platform.OS === 'web' ? { cursor: saving ? 'wait' : 'pointer' } as any : {}),
              }}
            >
              <Check size={13} color="#FFF" strokeWidth={2} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Kaydet</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
