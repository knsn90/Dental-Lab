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
import { supabase } from '../../lib/supabase';
import { fetchClinics, createClinic, updateClinic } from '../../lib/clinics';
import Colors from '../../constants/colors';

type Clinic = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  contact_person?: string | null;
  notes?: string | null;
  is_active: boolean;
};

type ClinicForm = {
  name: string;
  phone: string;
  email: string;
  address: string;
  contact_person: string;
  notes: string;
  is_active: boolean;
};

const EMPTY_FORM: ClinicForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  contact_person: '',
  notes: '',
  is_active: true,
};

export default function AdminClinicsScreen() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClinic, setEditingClinic] = useState<Clinic | null>(null);

  useEffect(() => { loadClinics(); }, []);

  const loadClinics = async () => {
    setLoading(true);
    const { data, error } = await fetchClinics();
    if (!error && data) setClinics(data as Clinic[]);
    setLoading(false);
  };

  const handleToggleActive = async (clinic: Clinic) => {
    const newVal = !clinic.is_active;
    const { error } = await updateClinic(clinic.id, { is_active: newVal });
    if (!error) {
      setClinics((prev) =>
        prev.map((c) => (c.id === clinic.id ? { ...c, is_active: newVal } : c))
      );
    }
  };

  const handleDelete = (clinic: Clinic) => {
    Alert.alert(
      'Klinik Sil',
      `"${clinic.name}" kliniğini silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('clinics').delete().eq('id', clinic.id);
            if (!error) {
              setClinics((prev) => prev.filter((c) => c.id !== clinic.id));
            } else {
              Alert.alert('Hata', 'Klinik silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleEdit = (clinic: Clinic) => {
    setEditingClinic(clinic);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingClinic(null);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingClinic(null);
  };

  const handleModalSuccess = () => {
    setShowModal(false);
    setEditingClinic(null);
    loadClinics();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.pageHeader}>
          <Text style={styles.title}>Klinikler</Text>
          <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
            <MaterialCommunityIcons name="office-building-outline" size={16} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Klinik Ekle</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : clinics.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="office-building-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Henüz klinik eklenmemiş</Text>
          </View>
        ) : (
          clinics.map((clinic) => (
            <ClinicCard
              key={clinic.id}
              clinic={clinic}
              onToggle={() => handleToggleActive(clinic)}
              onEdit={() => handleEdit(clinic)}
              onDelete={() => handleDelete(clinic)}
            />
          ))
        )}
      </ScrollView>

      <ClinicModal
        visible={showModal}
        editingClinic={editingClinic}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
      />
    </SafeAreaView>
  );
}

// ─── Clinic Card ─────────────────────────────────────────────────────────────

function ClinicCard({
  clinic,
  onToggle,
  onEdit,
  onDelete,
}: {
  clinic: Clinic;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={[styles.card, !clinic.is_active && styles.cardInactive]}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <MaterialCommunityIcons name="office-building-outline" size={20} color="#0F172A" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, !clinic.is_active && styles.nameInactive]}>
            {clinic.name}
          </Text>
          {clinic.contact_person ? (
            <Text style={styles.contactPerson}>{clinic.contact_person}</Text>
          ) : null}
        </View>
        <Switch
          value={clinic.is_active}
          onValueChange={onToggle}
          trackColor={{ false: Colors.border, true: '#D1D5DB' }}
          thumbColor={clinic.is_active ? '#0F172A' : Colors.textMuted}
        />
      </View>

      <View style={styles.cardBody}>
        {clinic.phone ? (
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="phone-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.detail}>{clinic.phone}</Text>
          </View>
        ) : null}
        {clinic.email ? (
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="email-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.detail}>{clinic.email}</Text>
          </View>
        ) : null}
        {clinic.address ? (
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.detail}>{clinic.address}</Text>
          </View>
        ) : null}
        {!clinic.is_active && (
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

// ─── Clinic Modal ─────────────────────────────────────────────────────────────

function ClinicModal({
  visible,
  editingClinic,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  editingClinic: Clinic | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<ClinicForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingClinic) {
      setForm({
        name: editingClinic.name,
        phone: editingClinic.phone ?? '',
        email: editingClinic.email ?? '',
        address: editingClinic.address ?? '',
        contact_person: editingClinic.contact_person ?? '',
        notes: editingClinic.notes ?? '',
        is_active: editingClinic.is_active,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError('');
  }, [editingClinic, visible]);

  const setField = (key: keyof ClinicForm, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleClose = () => { setError(''); onClose(); };

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) { setError('Klinik adı zorunludur'); return; }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        contact_person: form.contact_person.trim() || undefined,
        notes: form.notes.trim() || undefined,
        is_active: form.is_active,
      };

      if (editingClinic) {
        const { error: err } = await updateClinic(editingClinic.id, payload);
        if (err) { setError(err.message ?? 'Bir hata oluştu'); return; }
      } else {
        const { error: err } = await createClinic({ name: payload.name, ...payload });
        if (err) { setError(err.message ?? 'Bir hata oluştu'); return; }
      }
      onSuccess();
    } catch (e: any) {
      setError(e.message ?? 'Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const isEdit = !!editingClinic;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={m.overlay}
      >
        <View style={m.popup}>
          {/* Header */}
          <View style={m.header}>
            <Text style={m.title}>{isEdit ? 'Klinik Düzenle' : 'Yeni Klinik'}</Text>
            <TouchableOpacity onPress={handleClose}>
              <MaterialCommunityIcons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={m.body}>
            <Text style={m.fieldLabel}>Klinik Adı *</Text>
            <TextInput
              style={m.input}
              value={form.name}
              onChangeText={(v) => setField('name', v)}
              placeholder="Örn: Merkez Diş Kliniği"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={m.fieldLabel}>İletişim Kişisi</Text>
            <TextInput
              style={m.input}
              value={form.contact_person}
              onChangeText={(v) => setField('contact_person', v)}
              placeholder="Örn: Mehmet Bey"
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

            <Text style={m.fieldLabel}>E-posta</Text>
            <TextInput
              style={m.input}
              value={form.email}
              onChangeText={(v) => setField('email', v)}
              placeholder="info@klinik.com"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={m.fieldLabel}>Adres</Text>
            <TextInput
              style={[m.input, m.inputMultiline]}
              value={form.address}
              onChangeText={(v) => setField('address', v)}
              placeholder="Mahalle, sokak, no, şehir..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />

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
                  <Text style={m.saveText}>{isEdit ? 'Güncelle' : 'Klinik Ekle'}</Text>
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
  name: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  nameInactive: { color: Colors.textMuted },
  contactPerson: { fontSize: 12, color: Colors.textSecondary },

  cardBody: { gap: 4, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, marginBottom: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detail: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
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
  inputMultiline: { height: 70, paddingTop: 11 },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14,
  },

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
