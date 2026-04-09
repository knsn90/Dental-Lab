import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchClinics, createClinic, updateClinic, fetchAllDoctors, createDoctor, updateDoctor } from '../api';
import { Clinic, Doctor } from '../types';
import { C } from '../../../core/theme/colors';
import { ClinicIcon } from '../../../core/ui/ClinicIcon';

// ─── Doctor Modal ─────────────────────────────────────────────────────────────

interface DoctorModalProps {
  visible: boolean;
  clinic: Clinic | null;
  doctor: Doctor | null;
  clinics: Clinic[];
  onClose: () => void;
  onSave: () => void;
  onClinicCreated: (clinic: Clinic) => void;
}

function DoctorModal({ visible, clinic, doctor, clinics, onClose, onSave, onClinicCreated }: DoctorModalProps) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedClinicId, setSelectedClinicId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Clinic picker state
  const [clinicSearch, setClinicSearch] = useState('');
  const [clinicPickerOpen, setClinicPickerOpen] = useState(false);

  // Nested clinic add modal
  const [clinicModalVisible, setClinicModalVisible] = useState(false);
  const [clinicModalPrefill, setClinicModalPrefill] = useState('');
  const [clinicModalSaving, setClinicModalSaving] = useState(false);
  const [clinicForm, setClinicForm] = useState({ name: '', contact_person: '', phone: '', address: '', email: '', notes: '' });
  const [clinicError, setClinicError] = useState('');

  useEffect(() => {
    if (visible) {
      if (doctor) {
        setFullName(doctor.full_name);
        setPhone(doctor.phone ?? '');
        setSpecialty(doctor.specialty ?? '');
        setNotes(doctor.notes ?? '');
        setSelectedClinicId(doctor.clinic_id ?? clinic?.id ?? '');
      } else {
        setFullName(''); setPhone(''); setSpecialty(''); setNotes('');
        setSelectedClinicId(clinic?.id ?? '');
      }
      setError(''); setClinicSearch(''); setClinicPickerOpen(false);
    }
  }, [doctor, clinic, visible]);

  const handleSave = async () => {
    if (!fullName.trim()) { setError('Hekim adı zorunludur.'); return; }
    setSaving(true);
    const payload = {
      full_name: fullName.trim(),
      phone: phone || null,
      specialty: specialty || null,
      notes: notes || null,
      clinic_id: selectedClinicId || null,
    };
    let err: any = null;
    if (doctor) {
      const res = await updateDoctor(doctor.id, payload);
      err = res.error;
    } else {
      const res = await createDoctor(payload);
      err = res.error;
    }
    setSaving(false);
    if (err) {
      setError(`Veritabanı hatası: ${err.message ?? JSON.stringify(err)}`);
      return;
    }
    onSave();
    onClose();
  };

  const handleSaveClinic = async () => {
    if (!clinicForm.name.trim()) { setClinicError('Klinik adı zorunludur.'); return; }
    setClinicModalSaving(true);
    const { data, error: err } = await createClinic({
      name: clinicForm.name.trim(),
      contact_person: clinicForm.contact_person || undefined,
      phone: clinicForm.phone || undefined,
      address: clinicForm.address || undefined,
      email: clinicForm.email || undefined,
      notes: clinicForm.notes || undefined,
    });
    setClinicModalSaving(false);
    if (err || !data) { setClinicError('Klinik kaydedilemedi.'); return; }
    const newClinic = data as Clinic;
    onClinicCreated(newClinic);
    setSelectedClinicId(newClinic.id);
    setClinicModalVisible(false);
    setClinicForm({ name: '', contact_person: '', phone: '', address: '', email: '', notes: '' });
  };

  const selectedClinic = clinics.find(c => c.id === selectedClinicId);
  const filteredClinics = clinics.filter(c =>
    c.is_active && (!clinicSearch || c.name.toLowerCase().includes(clinicSearch.toLowerCase()))
  );

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={dm.overlay}>
          <View style={dm.sheet}>
            <View style={dm.header}>
              <Text style={dm.title}>
                {doctor ? 'Hekimi Düzenle' : '+ Hekim Ekle'}
              </Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={dm.close}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <DField label="Hekim Adı *" value={fullName} onChangeText={(v: string) => { setFullName(v); setError(''); }} placeholder="Dr. Adı Soyadı" />
              <DField label="Uzmanlık" value={specialty} onChangeText={setSpecialty} placeholder="Örn: Ortodonti, İmplant..." />
              <DField label="Telefon" value={phone} onChangeText={setPhone} placeholder="0532 000 0000" keyboardType="phone-pad" />

              {/* Klinik seçici */}
              <View style={dm.field}>
                <Text style={dm.label}>Klinik / Muayenehane</Text>
                <TouchableOpacity
                  style={[dm.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => setClinicPickerOpen(v => !v)}
                >
                  <Text style={selectedClinic ? { color: '#1E293B', fontSize: 14 } : { color: '#B0BAC9', fontSize: 14 }}>
                    {selectedClinic ? selectedClinic.name : 'Klinik seçin...'}
                  </Text>
                  <Text style={{ color: '#94A3B8', fontSize: 12 }}>{clinicPickerOpen ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {clinicPickerOpen && (
                  <View style={dm.pickerPanel}>
                    <TextInput
                      style={dm.pickerSearch}
                      value={clinicSearch}
                      onChangeText={setClinicSearch}
                      placeholder="Klinik ara..."
                      placeholderTextColor="#B0BAC9"
                    />
                    <ScrollView style={{ maxHeight: 160 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                      {selectedClinicId ? (
                        <TouchableOpacity style={dm.pickerItem} onPress={() => { setSelectedClinicId(''); setClinicPickerOpen(false); setClinicSearch(''); }}>
                          <Text style={{ color: '#EF4444', fontSize: 13 }}>✕ Kliniği kaldır</Text>
                        </TouchableOpacity>
                      ) : null}
                      {filteredClinics.map(c => (
                        <TouchableOpacity
                          key={c.id}
                          style={[dm.pickerItem, c.id === selectedClinicId && dm.pickerItemActive]}
                          onPress={() => { setSelectedClinicId(c.id); setClinicPickerOpen(false); setClinicSearch(''); }}
                        >
                          <Text style={[{ fontSize: 14, color: '#1E293B' }, c.id === selectedClinicId && { color: '#2563EB', fontWeight: '700' }]}>
                            {c.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      {filteredClinics.length === 0 && (
                        <Text style={{ padding: 10, color: '#94A3B8', fontSize: 13 }}>Sonuç bulunamadı</Text>
                      )}
                      <TouchableOpacity
                        style={dm.pickerAddBtn}
                        onPress={() => {
                          setClinicPickerOpen(false);
                          setClinicModalPrefill(clinicSearch);
                          setClinicForm(f => ({ ...f, name: clinicSearch }));
                          setClinicError('');
                          setClinicModalVisible(true);
                        }}
                      >
                        <Text style={dm.pickerAddText}>+ Yeni klinik ekle{clinicSearch ? `: "${clinicSearch}"` : ''}</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </View>
                )}
              </View>

              <DField label="Notlar" value={notes} onChangeText={setNotes} placeholder="Ek bilgi..." multiline />
              {error ? (
                <View style={dm.error}><Text style={dm.errorText}>⚠️ {error}</Text></View>
              ) : null}
              <TouchableOpacity style={[dm.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                <Text style={dm.saveBtnText}>{saving ? 'Kaydediliyor...' : doctor ? 'Güncelle' : 'Hekimi Kaydet'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Nested clinic add modal */}
      <Modal visible={clinicModalVisible} transparent animationType="fade" onRequestClose={() => setClinicModalVisible(false)}>
        <View style={dm.overlay}>
          <View style={dm.sheet}>
            <View style={dm.header}>
              <Text style={dm.title}>Yeni Klinik</Text>
              <TouchableOpacity onPress={() => setClinicModalVisible(false)}>
                <Text style={dm.close}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <DField label="Klinik Adı *" value={clinicForm.name} onChangeText={(v: string) => { setClinicForm(f => ({ ...f, name: v })); setClinicError(''); }} placeholder="Örn: Merkez Diş Kliniği" />
              <DField label="İletişim Kişisi" value={clinicForm.contact_person} onChangeText={(v: string) => setClinicForm(f => ({ ...f, contact_person: v }))} placeholder="Dr. Ahmet Kaya" />
              <DField label="Telefon" value={clinicForm.phone} onChangeText={(v: string) => setClinicForm(f => ({ ...f, phone: v }))} placeholder="0532 000 0000" keyboardType="phone-pad" />
              <DField label="Adres" value={clinicForm.address} onChangeText={(v: string) => setClinicForm(f => ({ ...f, address: v }))} placeholder="Mahalle, Cadde, İl..." multiline />
              <DField label="E-posta" value={clinicForm.email} onChangeText={(v: string) => setClinicForm(f => ({ ...f, email: v }))} placeholder="klinik@ornek.com" keyboardType="email-address" />
              <DField label="Notlar" value={clinicForm.notes} onChangeText={(v: string) => setClinicForm(f => ({ ...f, notes: v }))} placeholder="Ek bilgiler..." multiline />
              {clinicError ? <View style={dm.error}><Text style={dm.errorText}>⚠️ {clinicError}</Text></View> : null}
              <TouchableOpacity style={[dm.saveBtn, clinicModalSaving && { opacity: 0.6 }]} onPress={handleSaveClinic} disabled={clinicModalSaving}>
                <Text style={dm.saveBtnText}>{clinicModalSaving ? 'Kaydediliyor...' : 'Kliniği Kaydet'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function DField({ label, value, onChangeText, placeholder, multiline, keyboardType }: any) {
  return (
    <View style={dm.field}>
      <Text style={dm.label}>{label}</Text>
      <TextInput
        style={[dm.input, multiline && { minHeight: 60, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

// ─── Doctor Card ──────────────────────────────────────────────────────────────

function DoctorCard({
  doctor,
  onEdit,
  onToggle,
}: {
  doctor: Doctor;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <View style={dc.card}>
      <View style={dc.avatar}>
        <Text style={dc.avatarText}>{doctor.full_name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={dc.body}>
        <Text style={dc.name}>{doctor.full_name}</Text>
        {doctor.specialty ? <Text style={dc.meta}>🎓 {doctor.specialty}</Text> : null}
        {doctor.phone ? <Text style={dc.meta}>📞 {doctor.phone}</Text> : null}
      </View>
      <View style={dc.actions}>
        <Switch
          value={doctor.is_active}
          onValueChange={onToggle}
          trackColor={{ false: C.border, true: C.primaryBg }}
          thumbColor={doctor.is_active ? C.primary : C.textMuted}
        />
        <TouchableOpacity style={dc.editBtn} onPress={onEdit}>
          <Text style={dc.editBtnText}>Düzenle</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

interface ClinicForm {
  name: string; contact_person: string; phone: string;
  address: string; email: string; notes: string;
}
const EMPTY_FORM: ClinicForm = { name: '', contact_person: '', phone: '', address: '', email: '', notes: '' };

export function ClinicsScreen() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedClinic, setExpandedClinic] = useState<string | null>(null);

  const [clinicModal, setClinicModal] = useState(false);
  const [editClinic, setEditClinic] = useState<Clinic | null>(null);
  const [form, setForm] = useState<ClinicForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [clinicError, setClinicError] = useState('');

  const [doctorModal, setDoctorModal] = useState(false);
  const [editDoctor, setEditDoctor] = useState<Doctor | null>(null);
  const [doctorClinic, setDoctorClinic] = useState<Clinic | null>(null);

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'clinics' | 'doctors'>('clinics');

  const load = async () => {
    setLoading(true);
    const [clinicRes, doctorRes] = await Promise.all([fetchClinics(), fetchAllDoctors()]);
    setClinics((clinicRes.data as Clinic[]) ?? []);
    setDoctors((doctorRes.data as Doctor[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAddClinic = () => {
    setEditClinic(null); setForm(EMPTY_FORM); setClinicError('');
    setClinicModal(true);
  };
  const openEditClinic = (c: Clinic) => {
    setEditClinic(c);
    setForm({ name: c.name, contact_person: c.contact_person ?? '', phone: c.phone ?? '', address: c.address ?? '', email: c.email ?? '', notes: c.notes ?? '' });
    setClinicError('');
    setClinicModal(true);
  };
  const handleSaveClinic = async () => {
    if (!form.name.trim()) { setClinicError('Klinik adı zorunludur.'); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      contact_person: form.contact_person || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
      email: form.email || undefined,
      notes: form.notes || undefined,
    };
    if (editClinic) await updateClinic(editClinic.id, payload);
    else await createClinic(payload);
    setSaving(false);
    setClinicModal(false);
    load();
  };
  const handleToggleClinic = async (c: Clinic) => {
    await updateClinic(c.id, { is_active: !c.is_active });
    load();
  };

  const openAddDoctor = (clinic: Clinic) => {
    setEditDoctor(null); setDoctorClinic(clinic); setDoctorModal(true);
  };
  const openEditDoctor = (doctor: Doctor) => {
    setEditDoctor(doctor);
    setDoctorClinic(clinics.find(c => c.id === doctor.clinic_id) ?? null);
    setDoctorModal(true);
  };
  const handleToggleDoctor = async (d: Doctor) => {
    await updateDoctor(d.id, { is_active: !d.is_active });
    load();
  };

  const filteredClinics = clinics.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact_person ?? '').toLowerCase().includes(search.toLowerCase())
  );
  const filteredDoctors = doctors.filter(d =>
    d.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (d.specialty ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Klinikler & Hekimler</Text>
          <Text style={s.headerSub}>{clinics.length} klinik · {doctors.length} hekim</Text>
        </View>
        <TouchableOpacity
          style={s.addBtn}
          onPress={activeTab === 'clinics' ? openAddClinic : () => {
            setEditDoctor(null); setDoctorClinic(null); setDoctorModal(true);
          }}
        >
          <Text style={s.addBtnText}>{activeTab === 'clinics' ? '+ Klinik' : '+ Hekim'}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.tabs}>
        <TouchableOpacity
          style={[s.tab, activeTab === 'clinics' && s.tabActive]}
          onPress={() => setActiveTab('clinics')}
        >
          <Text style={[s.tabText, activeTab === 'clinics' && s.tabTextActive]}>
            🏥 Klinikler ({clinics.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, activeTab === 'doctors' && s.tabActive]}
          onPress={() => setActiveTab('doctors')}
        >
          <Text style={[s.tabText, activeTab === 'doctors' && s.tabTextActive]}>
            👨‍⚕️ Hekimler ({doctors.length})
          </Text>
        </TouchableOpacity>
      </View>

      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={`🔍  ${activeTab === 'clinics' ? 'Klinik' : 'Hekim'} ara...`}
          placeholderTextColor={C.textMuted}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
      ) : activeTab === 'clinics' ? (
        <FlatList
          data={filteredClinics}
          keyExtractor={c => c.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <View style={s.empty}>
              <ClinicIcon size={52} color="#94A3B8" />
              <Text style={s.emptyText}>{search ? 'Sonuç bulunamadı' : 'Henüz klinik eklenmemiş'}</Text>
              {!search && (
                <TouchableOpacity style={s.emptyBtn} onPress={openAddClinic}>
                  <Text style={s.emptyBtnText}>İlk kliniği ekle</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item: clinic }) => {
            const clinicDoctors = doctors.filter(d => d.clinic_id === clinic.id);
            const expanded = expandedClinic === clinic.id;
            return (
              <View style={[s.card, !clinic.is_active && s.cardInactive]}>
                <View style={s.cardTop}>
                  <View style={s.cardIcon}>
                    <ClinicIcon size={26} color={C.primary} />
                  </View>
                  <View style={s.cardMain}>
                    <Text style={s.cardName}>{clinic.name}</Text>
                    {clinic.contact_person ? <Text style={s.cardSub}>👤 {clinic.contact_person}</Text> : null}
                  </View>
                  <View style={s.cardRight}>
                    <Switch
                      value={clinic.is_active}
                      onValueChange={() => handleToggleClinic(clinic)}
                      trackColor={{ false: C.border, true: C.primaryBg }}
                      thumbColor={clinic.is_active ? C.primary : C.textMuted}
                    />
                  </View>
                </View>

                <View style={s.cardMeta}>
                  {clinic.phone ? <MetaChip icon="📞" text={clinic.phone} /> : null}
                  {clinic.address ? <MetaChip icon="📍" text={clinic.address} /> : null}
                  {clinic.email ? <MetaChip icon="✉️" text={clinic.email} /> : null}
                </View>

                <View style={s.clinicActions}>
                  <TouchableOpacity style={s.editBtn} onPress={() => openEditClinic(clinic)}>
                    <Text style={s.editBtnText}>Düzenle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.doctorsBtn, expanded && s.doctorsBtnActive]}
                    onPress={() => setExpandedClinic(expanded ? null : clinic.id)}
                  >
                    <Text style={[s.doctorsBtnText, expanded && { color: C.primary }]}>
                      👨‍⚕️ {clinicDoctors.length} Hekim {expanded ? '▲' : '▼'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {expanded && (
                  <View style={s.doctorsList}>
                    {clinicDoctors.length === 0 ? (
                      <Text style={s.noDoctorText}>Bu kliniğe bağlı hekim yok</Text>
                    ) : (
                      clinicDoctors.map(d => (
                        <DoctorCard
                          key={d.id}
                          doctor={d}
                          onEdit={() => openEditDoctor(d)}
                          onToggle={() => handleToggleDoctor(d)}
                        />
                      ))
                    )}
                    <TouchableOpacity style={s.addDoctorBtn} onPress={() => openAddDoctor(clinic)}>
                      <Text style={s.addDoctorBtnText}>+ Bu Kliniğe Hekim Ekle</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={filteredDoctors}
          keyExtractor={d => d.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>👨‍⚕️</Text>
              <Text style={s.emptyText}>{search ? 'Sonuç bulunamadı' : 'Henüz hekim eklenmemiş'}</Text>
              {!search && (
                <TouchableOpacity style={s.emptyBtn} onPress={() => { setEditDoctor(null); setDoctorClinic(null); setDoctorModal(true); }}>
                  <Text style={s.emptyBtnText}>İlk hekimi ekle</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item: doctor }) => {
            const clinic = clinics.find(c => c.id === doctor.clinic_id);
            return (
              <View style={s.card}>
                <View style={s.cardTop}>
                  <View style={[s.cardIcon, { backgroundColor: C.primaryBg }]}>
                    <Text style={s.cardIconText}>{doctor.full_name.charAt(0)}</Text>
                  </View>
                  <View style={s.cardMain}>
                    <Text style={s.cardName}>{doctor.full_name}</Text>
                    {clinic ? <Text style={s.cardSub}>🏥 {clinic.name}</Text> : null}
                    {doctor.specialty ? <Text style={s.cardSub}>🎓 {doctor.specialty}</Text> : null}
                  </View>
                  <Switch
                    value={doctor.is_active}
                    onValueChange={() => handleToggleDoctor(doctor)}
                    trackColor={{ false: C.border, true: C.primaryBg }}
                    thumbColor={doctor.is_active ? C.primary : C.textMuted}
                  />
                </View>
                <View style={s.cardMeta}>
                  {doctor.phone ? <MetaChip icon="📞" text={doctor.phone} /> : null}
                </View>
                <TouchableOpacity style={[s.editBtn, { alignSelf: 'flex-end' }]} onPress={() => openEditDoctor(doctor)}>
                  <Text style={s.editBtnText}>Düzenle</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      <Modal visible={clinicModal} transparent animationType="fade" onRequestClose={() => setClinicModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editClinic ? 'Kliniği Düzenle' : 'Yeni Klinik'}</Text>
              <TouchableOpacity onPress={() => setClinicModal(false)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
              <FormField label="Klinik Adı *" value={form.name} onChangeText={(v: string) => { setForm(f => ({ ...f, name: v })); setClinicError(''); }} placeholder="Örn: Merkez Diş Kliniği" />
              <FormField label="İletişim Kişisi" value={form.contact_person} onChangeText={(v: string) => setForm(f => ({ ...f, contact_person: v }))} placeholder="Örn: Dr. Ahmet Kaya" />
              <FormField label="Telefon" value={form.phone} onChangeText={(v: string) => setForm(f => ({ ...f, phone: v }))} placeholder="0532 000 0000" keyboardType="phone-pad" />
              <FormField label="Adres" value={form.address} onChangeText={(v: string) => setForm(f => ({ ...f, address: v }))} placeholder="Mahalle, Cadde, İl..." multiline />
              <FormField label="E-posta" value={form.email} onChangeText={(v: string) => setForm(f => ({ ...f, email: v }))} placeholder="klinik@ornek.com" keyboardType="email-address" />
              <FormField label="Notlar" value={form.notes} onChangeText={(v: string) => setForm(f => ({ ...f, notes: v }))} placeholder="Ek bilgiler..." multiline />
              {clinicError ? <View style={s.errorBanner}><Text style={s.errorText}>⚠️ {clinicError}</Text></View> : null}
              <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSaveClinic} disabled={saving}>
                <Text style={s.saveBtnText}>{saving ? 'Kaydediliyor...' : editClinic ? 'Güncelle' : 'Kaydet'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <DoctorModal
        visible={doctorModal}
        clinic={doctorClinic}
        doctor={editDoctor}
        clinics={clinics}
        onClose={() => setDoctorModal(false)}
        onSave={load}
        onClinicCreated={(clinic) => setClinics(prev => [...prev, clinic])}
      />
    </SafeAreaView>
  );
}

function MetaChip({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={s.metaChip}>
      <Text style={s.metaIcon}>{icon}</Text>
      <Text style={s.metaText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function FormField({ label, value, onChangeText, placeholder, multiline, keyboardType }: any) {
  return (
    <View style={s.formField}>
      <Text style={s.formLabel}>{label}</Text>
      <TextInput
        style={[s.formInput, multiline && s.formInputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        textAlignVertical={multiline ? 'top' : 'auto'}
      />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.textPrimary },
  headerSub: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  addBtn: { backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  tabs: { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2.5, borderBottomColor: C.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: C.textMuted },
  tabTextActive: { color: C.primary, fontWeight: '700' },
  searchWrap: { padding: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  searchInput: {
    backgroundColor: C.background, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.textPrimary,
  },
  list: { padding: 16, gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 16, color: C.textSecondary, textAlign: 'center' },
  emptyBtn: { marginTop: 8, backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '700' },
  card: { backgroundColor: C.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border },
  cardInactive: { opacity: 0.55 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  cardIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center' },
  cardIconText: { fontSize: 22 },
  cardMain: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: C.textPrimary },
  cardSub: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.background, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  metaIcon: { fontSize: 12 },
  metaText: { fontSize: 12, color: C.textSecondary, maxWidth: 160 },
  clinicActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  editBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: C.primary },
  editBtnText: { fontSize: 13, color: C.primary, fontWeight: '600' },
  doctorsBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.background },
  doctorsBtnActive: { borderColor: C.primary, backgroundColor: C.primaryBg },
  doctorsBtnText: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  doctorsList: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, gap: 8 },
  noDoctorText: { fontSize: 13, color: C.textMuted, textAlign: 'center', paddingVertical: 8 },
  addDoctorBtn: { marginTop: 4, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: C.primary, borderStyle: 'dashed', alignItems: 'center', backgroundColor: C.primaryBg },
  addDoctorBtnText: { fontSize: 13, color: C.primary, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox: { backgroundColor: C.surface, borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90%', overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.textPrimary },
  modalClose: { fontSize: 18, color: C.textSecondary, paddingLeft: 20 },
  modalBody: { padding: 20 },
  formField: { marginBottom: 16 },
  formLabel: { fontSize: 13, fontWeight: '600', color: C.textPrimary, marginBottom: 6 },
  formInput: { borderWidth: 1.5, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.textPrimary, backgroundColor: C.background },
  formInputMulti: { minHeight: 80, textAlignVertical: 'top' },
  errorBanner: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { color: '#DC2626', fontWeight: '600', fontSize: 13 },
  saveBtn: { backgroundColor: C.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 32 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});

const dm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet: {
    backgroundColor: C.surface, borderRadius: 16,
    width: '100%', maxWidth: 480, maxHeight: '90%', padding: 20,
    ...(Platform.OS === 'web' ? { boxShadow: '0 20px 60px rgba(0,0,0,0.2)' } as any : {
      shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 20,
    }),
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 17, fontWeight: '800', color: C.textPrimary, flex: 1, marginRight: 8 },
  close: { fontSize: 18, color: C.textMuted, fontWeight: '600', padding: 4 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: C.textSecondary, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, fontSize: 14, color: C.textPrimary, backgroundColor: C.background },
  error: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10, marginBottom: 12 },
  errorText: { fontSize: 13, color: '#DC2626', fontWeight: '600' },
  saveBtn: { backgroundColor: C.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4, marginBottom: 8 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  pickerPanel: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: C.surface,
    marginTop: 4, overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0,0,0,0.1)' } as any : {
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
    }),
  },
  pickerSearch: {
    borderBottomWidth: 1, borderBottomColor: C.border,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: C.textPrimary,
    backgroundColor: C.background,
  },
  pickerItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  pickerItemActive: { backgroundColor: '#EFF6FF' },
  pickerAddBtn: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F0F9FF' },
  pickerAddText: { fontSize: 13, color: C.primary, fontWeight: '700' },
});

const dc = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.background, borderRadius: 10, padding: 10, gap: 10, borderWidth: 1, borderColor: C.border },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: C.primary },
  body: { flex: 1 },
  name: { fontSize: 14, fontWeight: '700', color: C.textPrimary },
  meta: { fontSize: 12, color: C.textSecondary, marginTop: 1 },
  actions: { alignItems: 'flex-end', gap: 6 },
  editBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: C.primary },
  editBtnText: { fontSize: 11, color: C.primary, fontWeight: '600' },
});
