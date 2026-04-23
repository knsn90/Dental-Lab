// ─────────────────────────────────────────────────────────────────────────
//  DoctorClinicScreen — hekim kendi kliniğini görür/düzenler ve kliniğe
//  bağlı diğer hekimleri yönetir (RLS: 033 migration).
// ─────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { toast } from '../../../core/ui/Toast';
import { useDoctorScope } from '../hooks/useDoctorScope';
import { updateClinic, fetchDoctors, createDoctor, updateDoctor } from '../api';
import type { Doctor } from '../../../lib/types';
import { C } from '../../../core/theme/colors';
import { Card } from '../../../core/ui/Card';
import { Input } from '../../../core/ui/Input';
import { Button } from '../../../core/ui/Button';

export function DoctorClinicScreen() {
  const { clinic, clinicId, doctor, loading: scopeLoading, refetch } = useDoctorScope();

  // Klinik form alanları
  const [name,    setName]    = useState('');
  const [address, setAddress] = useState('');
  const [phone,   setPhone]   = useState('');
  const [email,   setEmail]   = useState('');
  const [saving,  setSaving]  = useState(false);

  // Hekim listesi
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  // Yeni hekim formu
  const [addOpen,   setAddOpen]   = useState(false);
  const [newName,   setNewName]   = useState('');
  const [newPhone,  setNewPhone]  = useState('');
  const [newSpec,   setNewSpec]   = useState('');
  const [addSaving, setAddSaving] = useState(false);

  useEffect(() => {
    if (!clinic) return;
    setName(clinic.name ?? '');
    setAddress(clinic.address ?? '');
    setPhone(clinic.phone ?? '');
    setEmail(clinic.email ?? '');
  }, [clinic?.id]);

  const loadDoctors = useCallback(async () => {
    if (!clinicId) return;
    setDocsLoading(true);
    const { data } = await fetchDoctors(clinicId);
    setDoctors((data as Doctor[]) ?? []);
    setDocsLoading(false);
  }, [clinicId]);

  useEffect(() => { void loadDoctors(); }, [loadDoctors]);

  const saveClinic = async () => {
    if (!clinicId) return;
    if (!name.trim()) { toast.error('Klinik adı boş olamaz'); return; }

    setSaving(true);
    const { error } = await updateClinic(clinicId, {
      name: name.trim(),
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
    });
    setSaving(false);

    if (error) { toast.error((error as any).message ?? 'Güncellenemedi'); return; }
    toast.success('Klinik bilgileri güncellendi');
    await refetch();
  };

  const addDoctor = async () => {
    if (!clinicId) return;
    if (!newName.trim()) { toast.error('Hekim adı gerekli'); return; }

    setAddSaving(true);
    const { error } = await createDoctor({
      clinic_id: clinicId,
      full_name: newName.trim(),
      phone: newPhone.trim() || null,
      specialty: newSpec.trim() || null,
    });
    setAddSaving(false);

    if (error) { toast.error((error as any).message ?? 'Eklenemedi'); return; }

    toast.success('Hekim eklendi');
    setNewName(''); setNewPhone(''); setNewSpec('');
    setAddOpen(false);
    await loadDoctors();
  };

  const toggleDoctorActive = (d: Doctor) => {
    Alert.alert(
      d.is_active ? 'Pasif yap' : 'Aktif yap',
      `${d.full_name} adlı hekim ${d.is_active ? 'pasif' : 'aktif'} edilsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Onayla',
          onPress: async () => {
            const { error } = await updateDoctor(d.id, { is_active: !d.is_active });
            if (error) toast.error((error as any).message ?? 'Güncellenemedi');
            else { toast.success('Güncellendi'); await loadDoctors(); }
          },
        },
      ],
    );
  };

  if (scopeLoading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.center}><ActivityIndicator color={C.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!clinicId || !clinic) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}><Text style={s.title}>Kliniğim</Text></View>
        <View style={s.center}>
          <Text style={s.emptyIcon}>🏥</Text>
          <Text style={s.emptyTitle}>Klinik kaydı bulunamadı</Text>
          <Text style={s.emptySub}>
            Hekim kaydınız bir klinik ile eşleşmedi. Lütfen laboratuvar ile
            iletişime geçin.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Kliniğim</Text>
        <Text style={s.subtitle}>{clinic.name}</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={docsLoading} onRefresh={() => { void refetch(); void loadDoctors(); }} />
        }
      >
        {/* Klinik bilgisi */}
        <Card style={s.card}>
          <Text style={s.sectionTitle}>Klinik Bilgileri</Text>

          <Input label="Klinik Adı" value={name} onChangeText={setName} placeholder="Klinik adı" />
          <Input label="Adres"      value={address} onChangeText={setAddress} placeholder="Tam adres" multiline numberOfLines={2} />
          <Input label="Telefon"    value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="05xx xxx xx xx" />
          <Input label="E-posta"    value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="ornek@eposta.com" />

          <Button onPress={saveClinic} label="Kaydet" loading={saving} />
        </Card>

        {/* Kliniğin hekimleri */}
        <Card style={s.card}>
          <View style={s.listHeader}>
            <Text style={s.sectionTitle}>Klinik Hekimleri</Text>
            <TouchableOpacity onPress={() => setAddOpen(v => !v)}>
              <Text style={s.linkText}>{addOpen ? 'Kapat' : '+ Hekim Ekle'}</Text>
            </TouchableOpacity>
          </View>

          {addOpen && (
            <View style={s.addForm}>
              <Input label="Ad Soyad" value={newName}  onChangeText={setNewName}  placeholder="Dr. ..." />
              <Input label="Telefon"  value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" placeholder="İsteğe bağlı" />
              <Input label="Branş"    value={newSpec}  onChangeText={setNewSpec}  placeholder="Örn: Ortodonti" />
              <Button onPress={addDoctor} label="Hekimi Ekle" loading={addSaving} />
            </View>
          )}

          {doctors.length === 0 && !docsLoading && (
            <Text style={s.emptyRow}>Kliniğinizde başka hekim kaydı yok.</Text>
          )}

          {doctors.map(d => (
            <View key={d.id} style={s.docRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.docName}>
                  {d.full_name}
                  {doctor?.id === d.id ? (
                    <Text style={s.youTag}>  (Siz)</Text>
                  ) : null}
                </Text>
                <Text style={s.docSub}>
                  {d.specialty ?? 'Branş belirtilmemiş'}
                  {d.phone ? `  •  ${d.phone}` : ''}
                </Text>
              </View>
              {doctor?.id !== d.id && (
                <TouchableOpacity onPress={() => toggleDoctorActive(d)} style={s.pillBtn}>
                  <Text style={[
                    s.pillText,
                    { color: d.is_active ? C.danger : C.success },
                  ]}>
                    {d.is_active ? 'Pasif yap' : 'Aktif yap'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: C.textPrimary },
  subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  content: { padding: 16 },
  card: { padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary, marginBottom: 12 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  linkText: { fontSize: 13, color: C.primary, fontWeight: '700' },
  addForm: {
    padding: 12, marginBottom: 10, borderRadius: 10,
    backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border,
  },
  docRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  docName: { fontSize: 14, fontWeight: '700', color: C.textPrimary },
  docSub:  { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  youTag:  { fontSize: 12, color: C.primary, fontWeight: '700' },
  pillBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  pillText: { fontSize: 11, fontWeight: '700' },
  emptyRow: { fontSize: 13, color: C.textSecondary, fontStyle: 'italic', paddingVertical: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary },
  emptySub: { fontSize: 14, color: C.textSecondary, textAlign: 'center', maxWidth: 320 },
});
