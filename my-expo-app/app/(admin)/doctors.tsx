import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ClinicIcon } from '../../core/ui/ClinicIcon';
import { DentistIcon } from '../../components/icons/DentistIcon';
import { supabase } from '../../lib/supabase';
import { fetchDoctors, createDoctor, updateDoctor } from '../../lib/doctors';
import { fetchClinics } from '../../lib/clinics';
import Colors from '../../constants/colors';

type Doctor = {
  id: string;
  full_name: string;
  phone?: string | null;
  specialty?: string | null;
  notes?: string | null;
  clinic_id?: string | null;
  is_active: boolean;
  clinic?: { id: string; name: string } | null;
};

type Clinic = {
  id: string;
  name: string;
};

type DoctorForm = {
  full_name: string;
  phone: string;
  specialty: string;
  notes: string;
  clinic_id: string;
  is_active: boolean;
};

const EMPTY_FORM: DoctorForm = {
  full_name: '',
  phone: '',
  specialty: '',
  notes: '',
  clinic_id: '',
  is_active: true,
};

export default function AdminDoctorsScreen() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [doctorsRes, clinicsRes] = await Promise.all([
      supabase.from('doctors').select('*, clinic:clinics(id, name)').order('full_name'),
      fetchClinics(),
    ]);
    if (!doctorsRes.error && doctorsRes.data) setDoctors(doctorsRes.data as Doctor[]);
    if (!clinicsRes.error && clinicsRes.data) setClinics(clinicsRes.data as Clinic[]);
    setLoading(false);
  };

  const handleToggleActive = async (doctor: Doctor) => {
    const newVal = !doctor.is_active;
    const { error } = await updateDoctor(doctor.id, { is_active: newVal });
    if (!error) {
      setDoctors((prev) =>
        prev.map((d) => (d.id === doctor.id ? { ...d, is_active: newVal } : d))
      );
    }
  };

  const handleDelete = (doctor: Doctor) => {
    Alert.alert(
      'Hekim Sil',
      `"${doctor.full_name}" adlı hekimi silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('doctors').delete().eq('id', doctor.id);
            if (!error) {
              setDoctors((prev) => prev.filter((d) => d.id !== doctor.id));
            } else {
              Alert.alert('Hata', 'Hekim silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleEdit = (doctor: Doctor) => {
    setEditingDoctor(doctor);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingDoctor(null);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingDoctor(null);
  };

  const handleModalSuccess = () => {
    setShowModal(false);
    setEditingDoctor(null);
    loadData();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.pageHeader}>
          <Text style={styles.title}>Hekimler</Text>
          <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
            <DentistIcon size={16} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Hekim Ekle</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : doctors.length === 0 ? (
          <View style={styles.empty}>
            <DentistIcon size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Henüz hekim eklenmemiş</Text>
          </View>
        ) : (
          doctors.map((doctor) => (
            <DoctorCard
              key={doctor.id}
              doctor={doctor}
              onToggle={() => handleToggleActive(doctor)}
              onEdit={() => handleEdit(doctor)}
              onDelete={() => handleDelete(doctor)}
            />
          ))
        )}
      </ScrollView>

      <DoctorModal
        visible={showModal}
        editingDoctor={editingDoctor}
        clinics={clinics}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
      />
    </SafeAreaView>
  );
}

// ─── Doctor Card ─────────────────────────────────────────────────────────────

function DoctorCard({
  doctor,
  onToggle,
  onEdit,
  onDelete,
}: {
  doctor: Doctor;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={[styles.card, !doctor.is_active && styles.cardInactive]}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{doctor.full_name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, !doctor.is_active && styles.nameInactive]}>
            {doctor.full_name}
          </Text>
          {doctor.specialty ? (
            <Text style={styles.specialty}>{doctor.specialty}</Text>
          ) : null}
        </View>
        <Switch
          value={doctor.is_active}
          onValueChange={onToggle}
          trackColor={{ false: Colors.border, true: '#D1D5DB' }}
          thumbColor={doctor.is_active ? '#0F172A' : Colors.textMuted}
        />
      </View>

      <View style={styles.cardBody}>
        {doctor.phone ? (
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="phone-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.detail}>{doctor.phone}</Text>
          </View>
        ) : null}
        {doctor.clinic ? (
          <View style={styles.detailRow}>
            <ClinicIcon size={13} color={Colors.textMuted} />
            <Text style={styles.detail}>{doctor.clinic.name}</Text>
          </View>
        ) : null}
        {!doctor.is_active && (
          <Text style={styles.inactiveLabel}>PASİF</Text>
        )}
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
          <MaterialCommunityIcons name="pencil-outline" size={14} color="#374151" />
          <Text style={styles.editBtnText}>Düzenle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
          <MaterialCommunityIcons name="trash-can-outline" size={14} color={Colors.error} />
          <Text style={styles.deleteBtnText}>Sil</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Doctor Modal ─────────────────────────────────────────────────────────────

function DoctorModal({
  visible,
  editingDoctor,
  clinics,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  editingDoctor: Doctor | null;
  clinics: Clinic[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<DoctorForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingDoctor) {
      setForm({
        full_name: editingDoctor.full_name,
        phone: editingDoctor.phone ?? '',
        specialty: editingDoctor.specialty ?? '',
        notes: editingDoctor.notes ?? '',
        clinic_id: editingDoctor.clinic_id ?? '',
        is_active: editingDoctor.is_active,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError('');
  }, [editingDoctor, visible]);

  const setField = (key: keyof DoctorForm, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleClose = () => { setError(''); onClose(); };

  const handleSave = async () => {
    setError('');
    if (!form.full_name.trim()) { setError('Ad Soyad zorunludur'); return; }

    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        specialty: form.specialty.trim() || null,
        notes: form.notes.trim() || null,
        clinic_id: form.clinic_id || null,
        is_active: form.is_active,
      };

      if (editingDoctor) {
        const { error: err } = await updateDoctor(editingDoctor.id, payload);
        if (err) { setError(err.message ?? 'Bir hata oluştu'); return; }
      } else {
        const { error: err } = await createDoctor(payload);
        if (err) { setError(err.message ?? 'Bir hata oluştu'); return; }
      }
      onSuccess();
    } catch (e: any) {
      setError(e.message ?? 'Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const isEdit = !!editingDoctor;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={m.overlay}
      >
        <View style={m.popup}>
          {/* Header */}
          <View style={m.header}>
            <Text style={m.title}>{isEdit ? 'Hekim Düzenle' : 'Yeni Hekim'}</Text>
            <TouchableOpacity onPress={handleClose}>
              <MaterialCommunityIcons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={m.body}>
            <Text style={m.fieldLabel}>Ad Soyad *</Text>
            <TextInput
              style={m.input}
              value={form.full_name}
              onChangeText={(v) => setField('full_name', v)}
              placeholder="Örn: Dr. Ayşe Kaya"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={m.fieldLabel}>Uzmanlık</Text>
            <TextInput
              style={m.input}
              value={form.specialty}
              onChangeText={(v) => setField('specialty', v)}
              placeholder="Örn: Ortodonti"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={m.fieldLabel}>Telefon</Text>
            <TextInput
              style={m.input}
              value={form.phone}
              onChangeText={(v) => setField('phone', v)}
              placeholder="0555 000 00 00"
              placeholderTextColor={Colors.textMuted}
              keyboardType="phone-pad"
            />

            <Text style={m.fieldLabel}>Klinik</Text>
            <View style={m.clinicList}>
              <TouchableOpacity
                style={[m.clinicOption, form.clinic_id === '' && m.clinicOptionActive]}
                onPress={() => setField('clinic_id', '')}
              >
                <Text style={[m.clinicOptionText, form.clinic_id === '' && m.clinicOptionTextActive]}>
                  Seçilmedi
                </Text>
              </TouchableOpacity>
              {clinics.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[m.clinicOption, form.clinic_id === c.id && m.clinicOptionActive]}
                  onPress={() => setField('clinic_id', c.id)}
                >
                  <Text style={[m.clinicOptionText, form.clinic_id === c.id && m.clinicOptionTextActive]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={m.fieldLabel}>Notlar</Text>
            <TextInput
              style={[m.input, m.inputMultiline]}
              value={form.notes}
              onChangeText={(v) => setField('notes', v)}
              placeholder="İsteğe bağlı notlar..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={m.toggleRow}>
              <Text style={m.fieldLabel}>Aktif</Text>
              <Switch
                value={form.is_active}
                onValueChange={(v) => setField('is_active', v)}
                trackColor={{ false: Colors.border, true: '#D1D5DB' }}
                thumbColor={form.is_active ? '#0F172A' : Colors.textMuted}
              />
            </View>

            {error ? (
              <View style={m.errorBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={14} color={Colors.error} />
                <Text style={m.errorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer */}
          <View style={m.footer}>
            <TouchableOpacity style={m.cancelBtn} onPress={handleClose}>
              <Text style={m.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[m.saveBtn, saving && m.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                  <Text style={m.saveText}>{isEdit ? 'Güncelle' : 'Hekim Ekle'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { padding: 20, paddingBottom: 40 },

  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0F172A', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  card: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardInactive: { opacity: 0.6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  name: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  nameInactive: { color: Colors.textMuted },
  specialty: { fontSize: 12, color: Colors.textSecondary },

  cardBody: { gap: 4, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, marginBottom: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detail: { fontSize: 13, color: Colors.textSecondary },
  inactiveLabel: { fontSize: 11, fontWeight: '800', color: Colors.error, letterSpacing: 1, marginTop: 4 },

  cardActions: {
    flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10,
  },
  editBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: '#F9FAFB',
  },
  editBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  deleteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  deleteBtnText: { fontSize: 13, fontWeight: '600', color: Colors.error },

  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, color: Colors.textMuted },
});

const m = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  popup: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  body: { padding: 20 },

  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#0F172A',
    backgroundColor: '#FAFAFA', marginBottom: 14,
  },
  inputMultiline: { height: 80, paddingTop: 11 },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14,
  },

  clinicList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  clinicOption: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FAFAFA',
  },
  clinicOptionActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  clinicOptionText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  clinicOptionTextActive: { color: '#FFFFFF' },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10, marginBottom: 12,
  },
  errorText: { fontSize: 13, color: Colors.error, flex: 1 },

  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  saveBtn: {
    flex: 2, backgroundColor: '#0F172A', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center', flexDirection: 'row',
    justifyContent: 'center', gap: 6,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
