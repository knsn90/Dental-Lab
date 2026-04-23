import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Platform,
} from 'react-native';
import { toast } from '../../../core/ui/Toast';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuthStore } from '../../../core/store/authStore';
import { createWorkOrder } from '../api';
import { uploadPhoto, pickPhoto, takePhoto } from '../../../lib/photos';
import { MachineType } from '../types';
import { ToothNumberPicker } from '../components/ToothNumberPicker';
import { Input } from '../../../core/ui/Input';
import { Button } from '../../../core/ui/Button';
import { WORK_TYPES, ALL_SHADES, ORDER_TAGS, deriveDepartment } from '../constants';
import { C } from '../../../core/theme/colors';

type Step = 1 | 2 | 3;

interface FormData {
  patient_name: string;
  patient_id: string;
  tags: string[];
  tooth_numbers: number[];
  work_type: string;
  shade: string;
  notes: string;
  machine_type: MachineType;
  delivery_date: Date;
  photo_uris: string[];
}

const INITIAL_FORM: FormData = {
  patient_name: '',
  patient_id: '',
  tags: [],
  tooth_numbers: [],
  work_type: '',
  shade: '',
  notes: '',
  machine_type: 'milling',
  delivery_date: (() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d;
  })(),
  photo_uris: [],
};

export function DoctorNewOrderScreen({ onClose }: { onClose?: () => void } = {}) {
  const router = useRouter();
  const { profile } = useAuthStore();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [validationError, setValidationError] = useState('');

  const setField = <K extends keyof FormData>(key: K) =>
    (val: FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: val }));
      setValidationError('');
    };

  const validateStep1 = () => {
    if (form.tooth_numbers.length === 0) {
      setValidationError('En az bir diş numarası seçin.');
      return false;
    }
    if (!form.work_type) {
      setValidationError('İş türü seçin.');
      return false;
    }
    setValidationError('');
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    setValidationError('');
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
  };

  const handleAddPhoto = () => {
    Alert.alert('Fotoğraf Ekle', 'Kaynak seçin', [
      { text: 'Galeri', onPress: async () => { const uri = await pickPhoto(); if (uri) setField('photo_uris')([...form.photo_uris, uri]); } },
      { text: 'Kamera', onPress: async () => { const uri = await takePhoto(); if (uri) setField('photo_uris')([...form.photo_uris, uri]); } },
      { text: 'İptal', style: 'cancel' },
    ]);
  };

  const handleSubmit = async () => {
    if (!profile) return;
    setLoading(true);

    const dateStr = form.delivery_date.toISOString().split('T')[0];

    const { data: order, error } = await createWorkOrder({
      doctor_id: profile.id,
      patient_name: form.patient_name || undefined,
      patient_id: form.patient_id || undefined,
      department: deriveDepartment(form.work_type),
      tags: form.tags.length > 0 ? form.tags : undefined,
      tooth_numbers: form.tooth_numbers,
      work_type: form.work_type,
      shade: form.shade || undefined,
      machine_type: form.machine_type,
      notes: form.notes || undefined,
      delivery_date: dateStr,
    });

    if (error || !order) {
      toast.error((error as any)?.message ?? 'İş emri oluşturulamadı.');
      setLoading(false);
      return;
    }

    // Upload photos
    for (const uri of form.photo_uris) {
      await uploadPhoto(uri, order.id, profile.id);
    }

    setLoading(false);
    toast.success(`${order.order_number} numaralı iş emri oluşturuldu.`);
    setForm(INITIAL_FORM);
    setStep(1);
    if (onClose) { onClose(); } else { router.push('/(doctor)'); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressTitle}>Yeni İş Emri</Text>
        <View style={styles.progressBar}>
          {[1, 2, 3].map((s) => (
            <View
              key={s}
              style={[styles.progressStep, s <= step && styles.progressStepActive]}
            />
          ))}
        </View>
        <Text style={styles.progressLabel}>Adım {step} / 3</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <View>
            {/* Patient info */}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Hasta Adı"
                  value={form.patient_name}
                  onChangeText={setField('patient_name')}
                  placeholder="Ad Soyad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Hasta TC / ID"
                  value={form.patient_id}
                  onChangeText={setField('patient_id')}
                  placeholder="TC Kimlik No"
                />
              </View>
            </View>

            {/* Tags */}
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Etiketler</Text>
            <View style={styles.optionGrid}>
              {ORDER_TAGS.map((tag) => {
                const active = form.tags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    onPress={() =>
                      setField('tags')(
                        active ? form.tags.filter((t) => t !== tag) : [...form.tags, tag]
                      )
                    }
                    style={[styles.optionChip, active && styles.tagChipActive]}
                  >
                    <Text style={[styles.optionChipText, active && styles.tagChipTextActive]}>
                      {tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Diş Numaraları</Text>
            <ToothNumberPicker
              selected={form.tooth_numbers}
              onChange={setField('tooth_numbers')}
            />

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>İş Türü</Text>
            <View style={styles.optionGrid}>
              {WORK_TYPES.map((wt) => (
                <TouchableOpacity
                  key={wt}
                  onPress={() => setField('work_type')(wt)}
                  style={[styles.optionChip, form.work_type === wt && styles.optionChipActive]}
                >
                  <Text style={[styles.optionChipText, form.work_type === wt && styles.optionChipTextActive]}>
                    {wt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Renk (Shade)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.shadeRow}>
                {ALL_SHADES.map((shade) => (
                  <TouchableOpacity
                    key={shade}
                    onPress={() => setField('shade')(shade)}
                    style={[styles.shadeChip, form.shade === shade && styles.shadeChipActive]}
                  >
                    <Text style={[styles.shadeText, form.shade === shade && styles.shadeTextActive]}>
                      {shade}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Input
              label="Notlar"
              value={form.notes}
              onChangeText={setField('notes')}
              placeholder="Ek bilgi veya talimatlar..."
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: 'top', marginTop: 16 }}
            />
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.sectionTitle}>Makine Tipi</Text>
            <View style={styles.machineRow}>
              {[
                { value: 'milling' as MachineType, label: '⚙️ Frezeleme', desc: 'Zirkonyum kuru kazıma' },
                { value: '3d_printing' as MachineType, label: '🖨️ 3D Baskı', desc: 'SprintRay reçine baskı' },
              ].map((m) => (
                <TouchableOpacity
                  key={m.value}
                  onPress={() => setField('machine_type')(m.value)}
                  style={[styles.machineBtn, form.machine_type === m.value && styles.machineBtnActive]}
                >
                  <Text style={styles.machineEmoji}>{m.label}</Text>
                  <Text style={[styles.machineDesc, form.machine_type === m.value && styles.machineDescActive]}>
                    {m.desc}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Teslim Tarihi</Text>
            <TouchableOpacity
              style={styles.datePicker}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.dateText}>
                📅  {form.delivery_date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={form.delivery_date}
                mode="date"
                minimumDate={new Date()}
                onChange={(_, date) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (date) setField('delivery_date')(date);
                }}
              />
            )}
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={styles.sectionTitle}>Fotoğraflar (isteğe bağlı)</Text>
            <View style={styles.photoGrid}>
              {form.photo_uris.map((uri, i) => (
                <View key={i} style={styles.photoWrapper}>
                  <Image source={{ uri }} style={styles.photo} />
                  <TouchableOpacity
                    style={styles.removePhoto}
                    onPress={() => setField('photo_uris')(form.photo_uris.filter((_, j) => j !== i))}
                  >
                    <Text style={styles.removePhotoText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {form.photo_uris.length < 5 && (
                <TouchableOpacity style={styles.addPhoto} onPress={handleAddPhoto}>
                  <Text style={styles.addPhotoText}>+</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>Özet</Text>
              {form.patient_name && <Text style={styles.summaryRow}>Hasta: {form.patient_name}</Text>}
              {form.patient_id && <Text style={styles.summaryRow}>TC/ID: {form.patient_id}</Text>}
              {form.tags.length > 0 && <Text style={styles.summaryRow}>Etiketler: {form.tags.join(', ')}</Text>}
              <Text style={styles.summaryRow}>Diş: {form.tooth_numbers.join(', ')}</Text>
              <Text style={styles.summaryRow}>İş Türü: {form.work_type}</Text>
              {form.shade && <Text style={styles.summaryRow}>Renk: {form.shade}</Text>}
              <Text style={styles.summaryRow}>Makine: {form.machine_type === 'milling' ? 'Frezeleme' : '3D Baskı'}</Text>
              <Text style={styles.summaryRow}>
                Teslim: {form.delivery_date.toLocaleDateString('tr-TR')}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Validation error */}
      {validationError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {validationError}</Text>
        </View>
      ) : null}

      {/* Navigation buttons */}
      <View style={styles.navButtons}>
        {step > 1 && (
          <Button
            onPress={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
            label="Geri"
            variant="secondary"
            style={styles.navBtn}
          />
        )}
        {step < 3 ? (
          <Button onPress={handleNext} label="İleri" style={styles.navBtnRight as any} />
        ) : (
          <Button
            onPress={handleSubmit}
            label="Gönder"
            loading={loading}
            style={styles.navBtnRight as any}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  progressContainer: { padding: 20, paddingBottom: 0 },
  progressTitle: { fontSize: 22, fontWeight: '800', color: C.textPrimary, marginBottom: 12 },
  progressBar: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  progressStep: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.border },
  progressStepActive: { backgroundColor: C.primary },
  progressLabel: { fontSize: 12, color: C.textSecondary, marginBottom: 4 },
  content: { padding: 20, paddingBottom: 100 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary, marginBottom: 12 },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 20,
    paddingVertical: 7, paddingHorizontal: 14, backgroundColor: C.surface,
  },
  optionChipActive: { borderColor: C.primary, backgroundColor: C.primaryBg },
  optionChipText: { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
  optionChipTextActive: { color: C.primary, fontWeight: '700' },
  shadeRow: { flexDirection: 'row', gap: 8, paddingBottom: 8 },
  shadeChip: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 12, backgroundColor: C.surface,
  },
  shadeChipActive: { borderColor: C.primary, backgroundColor: C.primaryBg },
  shadeText: { fontSize: 13, fontWeight: '600', color: C.textSecondary },
  shadeTextActive: { color: C.primary },
  machineRow: { flexDirection: 'row', gap: 12 },
  machineBtn: {
    flex: 1, borderWidth: 2, borderColor: C.border, borderRadius: 12,
    padding: 18, alignItems: 'center', backgroundColor: C.surface,
  },
  machineBtnActive: { borderColor: C.primary, backgroundColor: C.primaryBg },
  machineEmoji: { fontSize: 20, marginBottom: 6 },
  machineDesc: { fontSize: 12, color: C.textSecondary, textAlign: 'center' },
  machineDescActive: { color: C.primary },
  datePicker: {
    backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 10, padding: 16,
  },
  dateText: { fontSize: 16, color: C.textPrimary, fontWeight: '600' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  photoWrapper: { width: 90, height: 90, position: 'relative' },
  photo: { width: 90, height: 90, borderRadius: 10 },
  removePhoto: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: C.danger, borderRadius: 12, width: 22, height: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  removePhotoText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  addPhoto: {
    width: 90, height: 90, borderRadius: 10, borderWidth: 2,
    borderColor: C.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface,
  },
  addPhotoText: { fontSize: 32, color: C.textMuted },
  summary: {
    backgroundColor: C.surface, borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: C.border,
  },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary, marginBottom: 12 },
  summaryRow: { fontSize: 14, color: C.textSecondary, marginBottom: 6 },
  errorBanner: {
    backgroundColor: '#FEF2F2', borderTopWidth: 1, borderTopColor: '#FECACA',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  errorText: { fontSize: 14, color: '#DC2626', fontWeight: '600' },
  navButtons: {
    flexDirection: 'row', padding: 16, gap: 12,
    borderTopWidth: 1, borderTopColor: C.border,
    backgroundColor: C.surface,
  },
  navBtn: { flex: 1 },
  navBtnRight: {},
  row: { flexDirection: 'row', gap: 12 },
  tagChipActive: { borderColor: C.warning, backgroundColor: C.warningBg },
  tagChipTextActive: { color: C.warning, fontWeight: '700' },
});
