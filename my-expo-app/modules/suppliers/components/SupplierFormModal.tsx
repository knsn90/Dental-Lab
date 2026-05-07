/**
 * SupplierFormModal — yeni / düzenle tedarikçi modalı.
 * Patterns design language uyumlu.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform, Modal, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { X, Check, Building2 } from 'lucide-react-native';
import {
  Supplier, SupplierCategory, CATEGORY_LABELS,
  createSupplier, updateSupplier,
} from '../api';
import { SUPPORTED_CURRENCIES, type Currency } from '../../../core/money/currency';

interface Props {
  visible: boolean;
  supplier: Supplier | null;
  accentColor?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function SupplierFormModal({ visible, supplier, accentColor = '#0A0A0A', onClose, onSaved }: Props) {
  const isEdit = supplier !== null;

  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [taxNo, setTaxNo] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [iban, setIban] = useState('');
  const [bankName, setBankName] = useState('');
  const [category, setCategory] = useState<SupplierCategory>('material');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [paymentTerms, setPaymentTerms] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(supplier?.name ?? '');
    setContactPerson(supplier?.contact_person ?? '');
    setPhone(supplier?.phone ?? '');
    setEmail(supplier?.email ?? '');
    setWebsite(supplier?.website ?? '');
    setAddress(supplier?.address ?? '');
    setTaxNo(supplier?.tax_no ?? '');
    setTaxOffice(supplier?.tax_office ?? '');
    setIban(supplier?.iban ?? '');
    setBankName(supplier?.bank_name ?? '');
    setCategory(supplier?.category ?? 'material');
    setCurrency(supplier?.default_currency ?? 'TRY');
    setPaymentTerms(String(supplier?.payment_terms_days ?? 0));
    setNotes(supplier?.notes ?? '');
    setError('');
  }, [visible, supplier]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Firma adı zorunlu'); return; }
    setSaving(true); setError('');
    const payload: any = {
      name: name.trim(),
      contact_person: contactPerson.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      website: website.trim() || null,
      address: address.trim() || null,
      tax_no: taxNo.trim() || null,
      tax_office: taxOffice.trim() || null,
      iban: iban.trim() || null,
      bank_name: bankName.trim() || null,
      category, default_currency: currency,
      payment_terms_days: parseInt(paymentTerms || '0', 10) || 0,
      notes: notes.trim() || null,
    };
    const res = isEdit
      ? await updateSupplier(supplier!.id, payload)
      : await createSupplier(payload);
    setSaving(false);
    if (res.error) { setError((res.error as any).message ?? 'Kayıt hatası'); return; }
    onSaved();
  };

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
          backgroundColor: '#FFFFFF', borderRadius: 20, width: 560, maxWidth: '100%', maxHeight: '90%',
          ...(Platform.OS === 'web' ? { boxShadow: '0 16px 48px rgba(0,0,0,0.2)' } as any : {}),
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor + '14' }}>
                <Building2 size={18} color={accentColor} strokeWidth={1.6} />
              </View>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#9A9A9A', letterSpacing: 1, textTransform: 'uppercase' }}>Tedarikçi</Text>
                <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 22, letterSpacing: -0.4, color: '#0A0A0A' }}>
                  {isEdit ? 'Düzenle' : 'Yeni tedarikçi'}
                </Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <X size={14} color="#6B6B6B" strokeWidth={1.8} />
            </Pressable>
          </View>

          <ScrollView style={{ padding: 20 }} contentContainerStyle={{ gap: 14 }}>
            {/* Name */}
            <View>
              <Text style={label}>FİRMA ADI *</Text>
              <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="ABC Dental Tic. Ltd. Şti." placeholderTextColor="#9A9A9A" />
            </View>

            {/* Category + Currency */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={label}>KATEGORİ</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {(Object.keys(CATEGORY_LABELS) as SupplierCategory[]).map(c => {
                    const active = category === c;
                    return (
                      <Pressable
                        key={c}
                        onPress={() => setCategory(c)}
                        style={{
                          paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9999,
                          backgroundColor: active ? accentColor : '#FFFFFF',
                          borderWidth: 1, borderColor: active ? accentColor : 'rgba(0,0,0,0.08)',
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: active ? '600' : '500', color: active ? '#FFF' : '#6B6B6B' }}>{CATEGORY_LABELS[c]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={{ width: 140 }}>
                <Text style={label}>VARSAYILAN PARA</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {SUPPORTED_CURRENCIES.map(c => {
                    const active = currency === c;
                    return (
                      <Pressable
                        key={c}
                        onPress={() => setCurrency(c)}
                        style={{
                          paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9999,
                          backgroundColor: active ? accentColor : '#FFFFFF',
                          borderWidth: 1, borderColor: active ? accentColor : 'rgba(0,0,0,0.08)',
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500', color: active ? '#FFF' : '#6B6B6B', letterSpacing: 0.3 }}>{c}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Contact */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={label}>İLGİLİ KİŞİ</Text>
                <TextInput style={inputStyle} value={contactPerson} onChangeText={setContactPerson} placeholder="Ad Soyad" placeholderTextColor="#9A9A9A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={label}>TELEFON</Text>
                <TextInput style={inputStyle} value={phone} onChangeText={setPhone} placeholder="+90 5xx…" placeholderTextColor="#9A9A9A" keyboardType="phone-pad" />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={label}>E-POSTA</Text>
                <TextInput style={inputStyle} value={email} onChangeText={setEmail} placeholder="info@firma.com" placeholderTextColor="#9A9A9A" keyboardType="email-address" autoCapitalize="none" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={label}>WEB SİTESİ</Text>
                <TextInput style={inputStyle} value={website} onChangeText={setWebsite} placeholder="firma.com" placeholderTextColor="#9A9A9A" autoCapitalize="none" />
              </View>
            </View>

            {/* Address */}
            <View>
              <Text style={label}>ADRES</Text>
              <TextInput
                style={[inputStyle, { height: 56, paddingTop: 11, paddingBottom: 11, textAlignVertical: 'top' }]}
                value={address} onChangeText={setAddress}
                placeholder="Tam adres…" placeholderTextColor="#9A9A9A" multiline
              />
            </View>

            {/* Tax */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={label}>VERGİ NO (VKN/TCKN)</Text>
                <TextInput style={inputStyle} value={taxNo} onChangeText={setTaxNo} placeholder="1234567890" placeholderTextColor="#9A9A9A" keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={label}>VERGİ DAİRESİ</Text>
                <TextInput style={inputStyle} value={taxOffice} onChangeText={setTaxOffice} placeholder="örn. Beşiktaş" placeholderTextColor="#9A9A9A" />
              </View>
            </View>

            {/* Bank */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1.4 }}>
                <Text style={label}>IBAN</Text>
                <TextInput style={inputStyle} value={iban} onChangeText={setIban} placeholder="TR…" placeholderTextColor="#9A9A9A" autoCapitalize="characters" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={label}>BANKA</Text>
                <TextInput style={inputStyle} value={bankName} onChangeText={setBankName} placeholder="örn. Garanti BBVA" placeholderTextColor="#9A9A9A" />
              </View>
            </View>

            {/* Payment terms */}
            <View>
              <Text style={label}>VADE (GÜN)</Text>
              <TextInput style={inputStyle} value={paymentTerms} onChangeText={setPaymentTerms} placeholder="0 = peşin" placeholderTextColor="#9A9A9A" keyboardType="numeric" />
              <Text style={{ fontSize: 11, color: '#9A9A9A', marginTop: 4 }}>0 peşin · 30 = 30 gün vade · 60 = 60 gün vade vb.</Text>
            </View>

            {/* Notes */}
            <View>
              <Text style={label}>NOT</Text>
              <TextInput
                style={[inputStyle, { height: 64, paddingTop: 11, paddingBottom: 11, textAlignVertical: 'top' }]}
                value={notes} onChangeText={setNotes}
                placeholder="Hatırlatma, anlaşma şartı vb." placeholderTextColor="#9A9A9A" multiline
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
                backgroundColor: accentColor, opacity: saving ? 0.5 : 1,
                ...(Platform.OS === 'web' ? { cursor: saving ? 'wait' : 'pointer' } as any : {}),
              }}
            >
              {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Check size={13} color="#FFF" strokeWidth={2} />}
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>{isEdit ? 'Güncelle' : 'Kaydet'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
