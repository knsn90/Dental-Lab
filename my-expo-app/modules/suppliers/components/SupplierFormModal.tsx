/**
 * SupplierFormModal — yeni / düzenle tedarikçi modalı.
 * Patterns design language uyumlu.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform, Modal, TextInput, ScrollView} from 'react-native';
import { X, Check, Building2 } from 'lucide-react-native';
import {
  Supplier, SupplierCategory, CATEGORY_LABELS,
  createSupplier, updateSupplier,
} from '../api';
import { SUPPORTED_CURRENCIES, type Currency } from '../../../core/money/currency';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

interface Props {
  visible: boolean;
  supplier: Supplier | null;
  accentColor?: string;
  onClose: () => void;
  onSaved: () => void;
}

// Module-level Section bileşeni — fonksiyon içinde tanımlanırsa her render'da
// yeni identity oluşur ve React remount eder (hooks order sorunlarına neden olabilir).
function Section({
  title, subtitle, eyebrowStyle, children,
}: {
  title: string;
  subtitle?: string;
  eyebrowStyle: any;
  children: any;
}) {
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 2 }}>
        <Text style={eyebrowStyle}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 11, color: '#9A9A9A', fontWeight: '400' }}>{subtitle}</Text> : null}
      </View>
      <View style={{ gap: 12 }}>{children}</View>
    </View>
  );
}

export function SupplierFormModal({ visible, supplier, accentColor = '#0A0A0A', onClose, onSaved }: Props) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
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

  // Patterns §13 form tokens
  const inputStyle: any = {
    backgroundColor: T.cardSoft, borderRadius: 12, borderWidth: 1, borderColor: T.hairline,
    paddingHorizontal: 14, height: 44, fontSize: 14, color: T.ink,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  };
  const label: any = { fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 7 };
  const sectionEyebrow: any = { fontSize: 10, fontWeight: '700', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', justifyContent: 'center', alignItems: 'center', padding: 20, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
        <View style={{
          backgroundColor: T.card, borderRadius: 24, width: 600, maxWidth: '100%', maxHeight: '92%',
          overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.22)' } as any : {}),
        }}>
          {/* Header — Patterns §13 form */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 24, paddingBottom: 18, gap: 16 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 22,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: accentColor + '14',
                borderWidth: 1, borderColor: accentColor + '22',
              }}>
                <Building2 size={20} color={accentColor} strokeWidth={1.6} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  {isEdit ? 'Tedarikçi düzenle' : 'Yeni tedarikçi'}
                </Text>
                <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 26, letterSpacing: -0.6, color: T.ink, lineHeight: 32, marginTop: 2 }} numberOfLines={1}>
                  {isEdit ? name || 'Firma' : 'Cari hesap aç'}
                </Text>
                <Text style={{ fontSize: 12, color: '#9A9A9A', marginTop: 2 }}>
                  Bilgileri tamamla — kayıt sonrası firma cari hesap olarak görünür.
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={{
                width: 36, height: 36, borderRadius: 18,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: T.card,
                borderWidth: 1, borderColor: T.hairline,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <X size={15} color="#6B6B6B" strokeWidth={1.8} />
            </Pressable>
          </View>

          <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)', marginHorizontal: 28 }} />

          <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 22, paddingBottom: 22, gap: 26 }} showsVerticalScrollIndicator={false}>

            {/* ── KIMLIK ── */}
            <Section title="Kimlik" subtitle="Firma adı ve sınıflandırma" eyebrowStyle={sectionEyebrow}>
              <View>
                <Text style={label}>Firma adı *</Text>
                <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="ABC Dental Tic. Ltd. Şti." placeholderTextColor="#9A9A9A" />
              </View>

              <View>
                <Text style={label}>Kategori</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {(Object.keys(CATEGORY_LABELS) as SupplierCategory[]).map(c => {
                    const active = category === c;
                    return (
                      <Pressable
                        key={c}
                        onPress={() => setCategory(c)}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999,
                          backgroundColor: active ? accentColor : 'transparent',
                          borderWidth: 1, borderColor: active ? accentColor : T.hairline,
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? '#FFF' : T.ink2 }}>{CATEGORY_LABELS[c]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View>
                <Text style={label}>Varsayılan para birimi</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {SUPPORTED_CURRENCIES.map(c => {
                    const active = currency === c;
                    return (
                      <Pressable
                        key={c}
                        onPress={() => setCurrency(c)}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999,
                          backgroundColor: active ? accentColor : 'transparent',
                          borderWidth: 1, borderColor: active ? accentColor : T.hairline,
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? '#FFF' : T.ink2, letterSpacing: 0.4 }}>{c}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={{ fontSize: 11, color: '#9A9A9A', marginTop: 6 }}>
                  Bu firmadan alış yapılırken otomatik bu para birimi seçilir.
                </Text>
              </View>
            </Section>

            <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)' }} />

            {/* ── ILETIŞIM ── */}
            <Section title="İletişim" subtitle="Yetkili kişi ve iletişim bilgileri" eyebrowStyle={sectionEyebrow}>
              <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Text style={label}>İlgili kişi</Text>
                  <TextInput style={inputStyle} value={contactPerson} onChangeText={setContactPerson} placeholder="Ad Soyad" placeholderTextColor="#9A9A9A" />
                </View>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Text style={label}>Telefon</Text>
                  <TextInput style={inputStyle} value={phone} onChangeText={setPhone} placeholder="+90 5xx…" placeholderTextColor="#9A9A9A" keyboardType="phone-pad" />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Text style={label}>E-posta</Text>
                  <TextInput style={inputStyle} value={email} onChangeText={setEmail} placeholder="info@firma.com" placeholderTextColor="#9A9A9A" keyboardType="email-address" autoCapitalize="none" />
                </View>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Text style={label}>Web sitesi</Text>
                  <TextInput style={inputStyle} value={website} onChangeText={setWebsite} placeholder="firma.com" placeholderTextColor="#9A9A9A" autoCapitalize="none" />
                </View>
              </View>
              <View>
                <Text style={label}>Adres</Text>
                <TextInput
                  style={[inputStyle, { height: 64, paddingTop: 11, paddingBottom: 11, textAlignVertical: 'top' }]}
                  value={address} onChangeText={setAddress}
                  placeholder="Açık adres…" placeholderTextColor="#9A9A9A" multiline
                />
              </View>
            </Section>

            <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)' }} />

            {/* ── VERGI & BANKA ── */}
            <Section title="Vergi & banka" subtitle="Fatura ve havale için" eyebrowStyle={sectionEyebrow}>
              <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Text style={label}>Vergi no (VKN/TCKN)</Text>
                  <TextInput style={inputStyle} value={taxNo} onChangeText={setTaxNo} placeholder="1234567890" placeholderTextColor="#9A9A9A" keyboardType="numeric" />
                </View>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Text style={label}>Vergi dairesi</Text>
                  <TextInput style={inputStyle} value={taxOffice} onChangeText={setTaxOffice} placeholder="örn. Beşiktaş" placeholderTextColor="#9A9A9A" />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                <View style={{ flex: 1.4, minWidth: 240 }}>
                  <Text style={label}>IBAN</Text>
                  <TextInput style={inputStyle} value={iban} onChangeText={setIban} placeholder="TR…" placeholderTextColor="#9A9A9A" autoCapitalize="characters" />
                </View>
                <View style={{ flex: 1, minWidth: 180 }}>
                  <Text style={label}>Banka</Text>
                  <TextInput style={inputStyle} value={bankName} onChangeText={setBankName} placeholder="örn. Garanti BBVA" placeholderTextColor="#9A9A9A" />
                </View>
              </View>
            </Section>

            <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)' }} />

            {/* ── ANLAŞMA ── */}
            <Section title="Anlaşma" subtitle="Vade koşulları ve özel notlar" eyebrowStyle={sectionEyebrow}>
              <View>
                <Text style={label}>Vade (gün)</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {[
                    { v: '0',  l: 'Peşin' },
                    { v: '15', l: '15 gün' },
                    { v: '30', l: '30 gün' },
                    { v: '60', l: '60 gün' },
                    { v: '90', l: '90 gün' },
                  ].map(opt => {
                    const active = paymentTerms === opt.v;
                    return (
                      <Pressable
                        key={opt.v}
                        onPress={() => setPaymentTerms(opt.v)}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999,
                          backgroundColor: active ? accentColor : 'transparent',
                          borderWidth: 1, borderColor: active ? accentColor : T.hairline,
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? '#FFF' : T.ink2 }}>{opt.l}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  style={[inputStyle, { paddingHorizontal: 14 }]}
                  value={paymentTerms}
                  onChangeText={setPaymentTerms}
                  placeholder="Özel: gün sayısı"
                  placeholderTextColor="#9A9A9A"
                  keyboardType="numeric"
                />
              </View>

              <View>
                <Text style={label}>Not</Text>
                <TextInput
                  style={[inputStyle, { height: 72, paddingTop: 11, paddingBottom: 11, textAlignVertical: 'top' }]}
                  value={notes} onChangeText={setNotes}
                  placeholder="Hatırlatma, anlaşma şartı vb." placeholderTextColor="#9A9A9A" multiline
                />
              </View>
            </Section>

            {error ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                padding: 12, backgroundColor: '#9C2E2E0F', borderRadius: 12,
                borderWidth: 1, borderColor: '#9C2E2E22',
              }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#9C2E2E22' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#9C2E2E' }}>!</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 12, color: '#9C2E2E', fontWeight: '500' }}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 28, paddingVertical: 18, borderTopWidth: 1, borderTopColor: T.hairline2, backgroundColor: isDark ? T.cardSoft : '#FBF9F4' }}>
            {!isEdit ? (
              <Text style={{ flex: 1, fontSize: 11, color: '#9A9A9A', fontStyle: 'italic' }}>
                Kayıt sonrası bu firmaya stok girişi & ödeme yapılabilir.
              </Text>
            ) : <View style={{ flex: 1 }} />}
            <Pressable
              onPress={onClose}
              style={{
                paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999,
                backgroundColor: T.card,
                borderWidth: 1, borderColor: T.hairline,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '500', color: T.ink2 }}>Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 20, paddingVertical: 11, borderRadius: 9999,
                backgroundColor: accentColor, opacity: saving ? 0.5 : 1,
                ...(Platform.OS === 'web' ? { cursor: saving ? 'wait' : 'pointer', boxShadow: `0 6px 20px ${accentColor}44` } as any : {}),
              }}
            >
              <Check size={14} color="#FFF" strokeWidth={2.2} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF', letterSpacing: 0.2 }}>{isEdit ? 'Güncelle' : 'Kaydet'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
