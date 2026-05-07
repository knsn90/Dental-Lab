/**
 * TransactionFormModal — cari hesaba ödeme/iade/manuel fatura/düzeltme ekle.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform, Modal, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { X, Check, ArrowDownCircle, ArrowUpCircle, RotateCcw, Settings as Adjust, AlertCircle } from 'lucide-react-native';
import {
  Supplier, TransactionType, PaymentMethod,
  TX_TYPE_LABELS, PAYMENT_METHOD_LABELS, recordTransaction,
} from '../api';
import { useAuthStore } from '../../../core/store/authStore';
import { MoneyInput } from '../../../core/money/MoneyInput';
import { DatePicker } from '../../../core/ui/DatePicker';
import type { Currency } from '../../../core/money/currency';

interface Props {
  visible: boolean;
  type: TransactionType;
  supplier: Supplier;
  accentColor?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function TransactionFormModal({ visible, type, supplier, accentColor = '#0A0A0A', onClose, onSaved }: Props) {
  const profile = useAuthStore(s => s.profile);
  const labId = (profile as any)?.lab_id ?? null;

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transfer');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setAmount('');
    setCurrency(supplier.default_currency ?? 'TRY');
    setPaymentMethod('transfer');
    setInvoiceNo('');
    setDescription('');
    setDate(new Date().toISOString().slice(0, 10));
    setDueDate('');
    setError('');
  }, [visible, type, supplier]);

  const handleSave = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!amt || amt <= 0) { setError('Geçerli bir tutar girin'); return; }
    setSaving(true); setError('');
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
    backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 14, height: 44, fontSize: 14, color: '#0A0A0A',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  };
  const label: any = { fontSize: 11, fontWeight: '600', color: '#6B6B6B', letterSpacing: 0.6, marginBottom: 6 };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          backgroundColor: '#FFFFFF', borderRadius: 20, width: 480, maxWidth: '100%', maxHeight: '90%',
          ...(Platform.OS === 'web' ? { boxShadow: '0 16px 48px rgba(0,0,0,0.2)' } as any : {}),
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: typeColor + '14' }}>
                <Icon size={18} color={typeColor} strokeWidth={1.6} />
              </View>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#9A9A9A', letterSpacing: 1, textTransform: 'uppercase' }}>{supplier.name}</Text>
                <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 22, letterSpacing: -0.4, color: '#0A0A0A' }}>
                  {TX_TYPE_LABELS[type]}
                </Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <X size={14} color="#6B6B6B" strokeWidth={1.8} />
            </Pressable>
          </View>

          <ScrollView style={{ padding: 20 }} contentContainerStyle={{ gap: 14 }}>
            {/* Hint card */}
            <View style={{
              flexDirection: 'row', alignItems: 'flex-start', gap: 8,
              padding: 12, backgroundColor: typeColor + '0A',
              borderRadius: 12, borderWidth: 1, borderColor: typeColor + '22',
            }}>
              <AlertCircle size={14} color={typeColor} strokeWidth={1.8} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12, color: '#2C2C2C', lineHeight: 17 }}>{typeHint}</Text>
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
                          backgroundColor: active ? accentColor : '#FFFFFF',
                          borderWidth: 1, borderColor: active ? accentColor : 'rgba(0,0,0,0.08)',
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? '#FFF' : '#6B6B6B' }}>{PAYMENT_METHOD_LABELS[m]}</Text>
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
                <TextInput style={inputStyle} value={invoiceNo} onChangeText={setInvoiceNo} placeholder="örn. ABC-2026/00123" placeholderTextColor="#9A9A9A" />
              </View>
            )}

            {/* Description */}
            <View>
              <Text style={label}>AÇIKLAMA</Text>
              <TextInput
                style={[inputStyle, { height: 60, paddingTop: 11, paddingBottom: 11, textAlignVertical: 'top' }]}
                value={description}
                onChangeText={setDescription}
                placeholder={type === 'PAYMENT' ? 'Havale dekontu, ödeme notu vb.' : 'Açıklama / not'}
                placeholderTextColor="#9A9A9A"
                multiline
              />
            </View>

            {error ? <Text style={{ fontSize: 12, color: '#9C2E2E', fontWeight: '500' }}>{error}</Text> : null}
          </ScrollView>

          {/* Footer */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)' }}>
            <Pressable onPress={onClose} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999, backgroundColor: 'rgba(0,0,0,0.04)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#6B6B6B' }}>Vazgeç</Text>
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
              {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Check size={13} color="#FFF" strokeWidth={2} />}
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Kaydet</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
