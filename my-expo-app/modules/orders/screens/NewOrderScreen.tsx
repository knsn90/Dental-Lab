import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, ActivityIndicator, Platform, useWindowDimensions,
  Modal, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAuthStore } from '../../../core/store/authStore';
import { createWorkOrder, addOrderItem } from '../api';
import { fetchClinics, fetchAllDoctors, createClinic, createDoctor } from '../../clinics/api';
import { fetchLabServices } from '../../services/api';
import { MachineType, PendingItem } from '../types';
import { Clinic, Doctor } from '../../clinics/types';
import { LabService } from '../../services/types';
import { ToothNumberPicker } from '../components/ToothNumberPicker';
import { WORK_TYPES, ALL_SHADES, DEPARTMENTS, ORDER_TAGS } from '../constants';
import { C } from '../../../core/theme/colors';
import { F } from '../../../core/theme/typography';

type Step = 1 | 2 | 3 | 4;

interface FormData {
  clinic_id: string;
  doctor_id: string;
  patient_name: string;
  patient_id: string;
  patient_gender: 'erkek' | 'kadın' | 'belirtilmedi';
  patient_dob: Date | null;
  patient_phone: string;
  is_urgent: boolean;
  model_type: string;
  delivery_date: Date;
  notes: string;
  lab_notes: string;
  tooth_numbers: number[];
  department: string;
  work_type: string;
  shade: string;
  machine_type: MachineType;
  tags: string[];
  pending_items: PendingItem[];
  measurement_type: 'manual' | 'digital';
  doctor_approval_required: boolean;
}

const INITIAL_FORM: FormData = {
  clinic_id: '', doctor_id: '',
  patient_name: '', patient_id: '', patient_gender: 'belirtilmedi',
  patient_dob: null, patient_phone: '',
  is_urgent: false, model_type: '',
  delivery_date: (() => { const d = new Date(); d.setDate(d.getDate() + 5); return d; })(),
  notes: '', lab_notes: '',
  tooth_numbers: [], department: '', work_type: '', shade: '',
  machine_type: 'milling', tags: [], pending_items: [],
  measurement_type: 'manual',
  doctor_approval_required: false,
};

const MODEL_TYPES = [
  { value: 'dijital', label: '💻 Dijital Tarama' },
  { value: 'fiziksel', label: '📦 Fiziksel Model' },
  { value: 'fotograf', label: '📷 Fotoğraf/Video' },
  { value: 'cad', label: '🖥️ CAD Dosyası' },
];

const GENDERS = [
  { value: 'erkek', label: '♂ Erkek' },
  { value: 'kadın', label: '♀ Kadın' },
];

export function NewOrderScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);

  // Clinic add modal
  const [clinicModal, setClinicModal] = useState<{ visible: boolean; prefill: string }>({ visible: false, prefill: '' });
  const [clinicSaving, setClinicSaving] = useState(false);
  const [validationError, setValidationError] = useState('');

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [services, setServices] = useState<LabService[]>([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchClinics(), fetchAllDoctors(), fetchLabServices()]).then(
      ([clinicsRes, doctorsRes, servicesRes]) => {
        setClinics((clinicsRes.data as Clinic[]) ?? []);
        setAllDoctors((doctorsRes.data as Doctor[]) ?? []);
        setServices((servicesRes.data as LabService[]) ?? []);
        setDataLoading(false);
      }
    );
  }, []);

  const set = <K extends keyof FormData>(key: K) =>
    (val: FormData[K]) => {
      setForm((f) => ({ ...f, [key]: val }));
      setValidationError('');
    };

  // Filter doctors by selected clinic
  const filteredDoctors = form.clinic_id
    ? allDoctors.filter((d) => d.clinic_id === form.clinic_id)
    : allDoctors;

  const itemTotal = form.pending_items.reduce((s, i) => s + i.price * i.quantity, 0);

  const addPendingItem = (service: LabService) => {
    const existing = form.pending_items.find((i) => i.service_id === service.id);
    if (existing) {
      set('pending_items')(
        form.pending_items.map((i) =>
          i.service_id === service.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      set('pending_items')([
        ...form.pending_items,
        { service_id: service.id, name: service.name, price: service.price, quantity: 1 },
      ]);
    }
  };

  const removePendingItem = (idx: number) => {
    set('pending_items')(form.pending_items.filter((_, i) => i !== idx));
  };

  const validateStep1 = () => {
    if (!form.doctor_id)                               { setValidationError('Hekim seçin.');                    return false; }
    if (!form.patient_name.trim())                     { setValidationError('Hasta adı soyadı zorunludur.');    return false; }
    if (form.patient_gender === 'belirtilmedi')        { setValidationError('Cinsiyet seçin.');                 return false; }
    if (!form.patient_dob)                             { setValidationError('Doğum tarihi zorunludur.');        return false; }
    return true;
  };

  const validateStep3 = () => {
    if (form.tooth_numbers.length === 0) { setValidationError('En az bir diş seçin.'); return false; }
    if (!form.work_type && form.pending_items.length === 0) {
      setValidationError('İş türü seçin veya katalogdan protez ekleyin.'); return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 3 && !validateStep3()) return;
    setValidationError('');
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  };

  const handleSubmit = async () => {
    if (!profile) return;
    setLoading(true);

    const workType = form.work_type ||
      (form.pending_items.length > 0 ? form.pending_items.map((i) => i.name).join(', ') : 'Belirtilmedi');

    const { data: order, error } = await createWorkOrder({
      doctor_id: form.doctor_id,
      patient_name: form.patient_name || undefined,
      patient_id: form.patient_id || undefined,
      patient_gender: form.patient_gender !== 'belirtilmedi' ? form.patient_gender : undefined,
      patient_dob: form.patient_dob ? form.patient_dob.toISOString().split('T')[0] : undefined,
      patient_phone: form.patient_phone || undefined,
      department: form.department || undefined,
      tags: form.tags.length > 0 ? form.tags : undefined,
      tooth_numbers: form.tooth_numbers,
      work_type: workType,
      shade: form.shade || undefined,
      machine_type: form.machine_type,
      model_type: form.model_type || undefined,
      is_urgent: form.is_urgent || undefined,
      notes: form.notes || undefined,
      lab_notes: form.lab_notes || undefined,
      delivery_date: form.delivery_date.toISOString().split('T')[0],
      measurement_type: form.measurement_type,
      doctor_approval_required: form.doctor_approval_required,
    });

    if (error || !order) {
      setValidationError((error as any)?.message ?? 'İş emri oluşturulamadı.');
      setLoading(false);
      return;
    }

    // Create order items
    for (const item of form.pending_items) {
      await addOrderItem({
        work_order_id: order.id,
        service_id: item.service_id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      });
    }

    setLoading(false);
    setForm(INITIAL_FORM);
    setStep(1);
    router.push('/(lab)');
  };

  const selectedClinic = clinics.find((c) => c.id === form.clinic_id);
  const selectedDoctor = allDoctors.find((d) => d.id === form.doctor_id);

  const filteredServices = services.filter(
    (s) => !serviceSearch || s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );
  const servicesByCategory: Record<string, LabService[]> = {};
  filteredServices.forEach((s) => {
    const cat = s.category ?? 'Diğer';
    if (!servicesByCategory[cat]) servicesByCategory[cat] = [];
    servicesByCategory[cat].push(s);
  });

  if (dataLoading) return (
    <SafeAreaView style={styles.safe}>
      <ActivityIndicator color={C.primary} style={{ flex: 1 }} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.outerWrap, isDesktop && styles.outerWrapDesktop]}>

        {/* ── Vertical step sidebar (desktop only) ── */}
        {isDesktop && <StepSidebar currentStep={step} />}

        {/* ── Main content column ── */}
        <View style={styles.mainCol}>

          {/* Mobile-only horizontal step header */}
          {!isDesktop && (
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Yeni İş Emri</Text>
              <View style={styles.steps}>
                {([1, 2, 3, 4] as Step[]).map((s) => (
                  <View key={s} style={styles.stepWrap}>
                    <View style={[styles.stepDot, s <= step && styles.stepDotActive, s === step && styles.stepDotCurrent]}>
                      <Text style={[styles.stepNum, s <= step && styles.stepNumActive]}>{s}</Text>
                    </View>
                    {s < 4 && <View style={[styles.stepLine, s < step && styles.stepLineActive]} />}
                  </View>
                ))}
              </View>
              <Text style={styles.stepLabel}>
                {step === 1 ? 'Klinik & Hasta' : step === 2 ? 'Vaka Detayları' : step === 3 ? 'Diş & Protez Seçimi' : 'Özet & Gönder'}
              </Text>
            </View>
          )}

      {/* Step 1 — Clinic & Patient */}
      {step === 1 && (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Clinic & Doctor */}
          <SectionCard title="Klinik & Hekim" icon="business-outline">
            <View style={styles.twoCol}>
              <SearchableDropdown
                label="Klinik"
                placeholder="Klinik seçin veya ekleyin"
                options={clinics.filter(c => c.is_active).map(c => ({ id: c.id, label: c.name, sublabel: c.phone ?? undefined }))}
                selectedId={form.clinic_id}
                onSelect={(id) => { set('clinic_id')(id); set('doctor_id')(''); }}
                onAddNew={async (name) => {
                  setClinicModal({ visible: true, prefill: name });
                }}
                addNewLabel="Yeni klinik ekle"
              />
              <SearchableDropdown
                label="Hekim *"
                placeholder="Hekim seçin veya ekleyin"
                options={filteredDoctors.map(d => ({ id: d.id, label: d.full_name, sublabel: d.clinic?.name ?? undefined }))}
                selectedId={form.doctor_id}
                onSelect={set('doctor_id')}
                onAddNew={async (name) => {
                  const { data } = await createDoctor({ full_name: name, clinic_id: form.clinic_id || null });
                  if (data) {
                    setAllDoctors(prev => [...prev, data as any]);
                    set('doctor_id')((data as any).id);
                  }
                }}
                addNewLabel="Yeni hekim ekle"
              />
            </View>
          </SectionCard>

          {/* Patient info */}
          <SectionCard title="Hasta Bilgileri" icon="person-outline">
            <View style={styles.twoCol}>
              <Field label="Ad Soyad *" value={form.patient_name}
                onChangeText={set('patient_name')} placeholder="Ad Soyad" flex />
              <Field label="TC Kimlik No (opsiyonel)" value={form.patient_id}
                onChangeText={set('patient_id')} placeholder="12345678901" flex />
            </View>

            <Text style={styles.fieldLabel}>Cinsiyet</Text>
            <View style={styles.chipRow}>
              {GENDERS.map((g) => (
                <TouchableOpacity key={g.value} onPress={() => set('patient_gender')(g.value as any)}
                  style={[styles.chip, form.patient_gender === g.value && styles.chipActive]}>
                  <Text style={[styles.chipText, form.patient_gender === g.value && styles.chipTextActive]}>
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.twoCol, { alignItems: 'flex-start' }]}>
              <DateField
                label="Doğum Tarihi (opsiyonel)"
                value={form.patient_dob}
                onChange={set('patient_dob')}
                maxDate={new Date()}
                placeholder="Tarih seçin"
                flex
              />
              <Field label="İletişim (opsiyonel)" value={form.patient_phone}
                onChangeText={set('patient_phone')} placeholder="05XX XXX XX XX" flex />
            </View>
          </SectionCard>
        </ScrollView>
      )}

      {/* Step 2 — Case Details */}
      {step === 2 && (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* ── Öncelik & Onay ── */}
          <SectionCard title="Öncelik & Onay" icon={'tune' as any}>
            <View style={styles.twoCol}>
              {/* Acil Vaka */}
              <TouchableOpacity
                style={[s2.toggleCard, form.is_urgent && s2.toggleCardDanger]}
                onPress={() => set('is_urgent')(!form.is_urgent)}
                activeOpacity={0.82}
              >
                <View style={[s2.toggleIconWrap, form.is_urgent ? s2.toggleIconDanger : s2.toggleIconDefault]}>
                  <MaterialCommunityIcons name={'alarm' as any} size={18} color={form.is_urgent ? '#DC2626' : '#94A3B8'} />
                </View>
                <View style={s2.toggleMid}>
                  <Text style={[s2.toggleTitle, form.is_urgent && { color: '#DC2626' }]}>Acil Vaka</Text>
                  <Text style={s2.toggleSub}>Öncelikli işleme alınır</Text>
                </View>
                <Switch
                  value={form.is_urgent}
                  onValueChange={set('is_urgent')}
                  trackColor={{ false: '#E2E8F0', true: '#FECACA' }}
                  thumbColor={form.is_urgent ? '#DC2626' : '#CBD5E1'}
                />
              </TouchableOpacity>

              {/* Tasarım Onayı */}
              <TouchableOpacity
                style={[s2.toggleCard, form.doctor_approval_required && s2.toggleCardPrimary]}
                onPress={() => set('doctor_approval_required')(!form.doctor_approval_required)}
                activeOpacity={0.82}
              >
                <View style={[s2.toggleIconWrap, form.doctor_approval_required ? s2.toggleIconPrimary : s2.toggleIconDefault]}>
                  <MaterialCommunityIcons name={'check-decagram-outline' as any} size={18} color={form.doctor_approval_required ? C.primary : '#94A3B8'} />
                </View>
                <View style={s2.toggleMid}>
                  <Text style={[s2.toggleTitle, form.doctor_approval_required && { color: C.primary }]}>Tasarım Onayı</Text>
                  <Text style={s2.toggleSub}>Bitmeden onay istenir</Text>
                </View>
                <Switch
                  value={form.doctor_approval_required}
                  onValueChange={set('doctor_approval_required')}
                  trackColor={{ false: '#E2E8F0', true: '#BFDBFE' }}
                  thumbColor={form.doctor_approval_required ? C.primary : '#CBD5E1'}
                />
              </TouchableOpacity>
            </View>
          </SectionCard>

          {/* ── Ölçüm Yöntemi ── */}
          <SectionCard title="Ölçüm Yöntemi" icon={'ruler' as any}>
            <View style={styles.twoCol}>
              {[
                { value: 'manual'  as const, icon: 'gesture-tap-hold',   label: 'Manuel',  sub: 'Fiziksel ölçü alımı' },
                { value: 'digital' as const, icon: 'monitor-eye',        label: 'Dijital', sub: 'STL / tarama dosyası' },
              ].map((m) => {
                const active = form.measurement_type === m.value;
                return (
                  <TouchableOpacity
                    key={m.value}
                    style={[s2.optionCard, active && s2.optionCardActive]}
                    onPress={() => set('measurement_type')(m.value)}
                    activeOpacity={0.82}
                  >
                    {active && (
                      <View style={s2.optionCheck}>
                        <MaterialCommunityIcons name="check" size={10} color="#FFFFFF" />
                      </View>
                    )}
                    <View style={[s2.optionIconWrap, active && s2.optionIconWrapActive]}>
                      <MaterialCommunityIcons name={m.icon as any} size={22} color={active ? '#FFFFFF' : '#94A3B8'} />
                    </View>
                    <Text style={[s2.optionLabel, active && s2.optionLabelActive]}>{m.label}</Text>
                    <Text style={s2.optionSub}>{m.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SectionCard>

          {/* ── Model Tipi ── */}
          <SectionCard title="Model Tipi" icon={'cube-outline' as any}>
            <View style={s2.modelGrid}>
              {[
                { value: 'dijital',  icon: 'monitor',           label: 'Dijital Tarama', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
                { value: 'fiziksel', icon: 'package-variant',   label: 'Fiziksel Model', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
                { value: 'fotograf', icon: 'camera-outline',    label: 'Fotoğraf/Video', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
                { value: 'cad',      icon: 'drawing-box',       label: 'CAD Dosyası',    color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
              ].map((m) => {
                const active = form.model_type === m.value;
                return (
                  <TouchableOpacity
                    key={m.value}
                    style={[s2.modelCard, active && { borderColor: m.border, backgroundColor: m.bg }]}
                    onPress={() => set('model_type')(form.model_type === m.value ? '' : m.value)}
                    activeOpacity={0.82}
                  >
                    {active && (
                      <View style={[s2.modelCheck, { backgroundColor: m.color }]}>
                        <MaterialCommunityIcons name="check" size={9} color="#FFFFFF" />
                      </View>
                    )}
                    <MaterialCommunityIcons name={m.icon as any} size={24} color={active ? m.color : '#94A3B8'} />
                    <Text style={[s2.modelLabel, active && { color: m.color, fontFamily: F.semibold, fontWeight: '600' }]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SectionCard>

          {/* ── Teslim Tarihi ── */}
          <SectionCard title="Teslim Tarihi" icon={'calendar-check-outline' as any}>
            <View style={s2.deliveryRow}>
              <View style={s2.deliveryIconWrap}>
                <MaterialCommunityIcons name={'truck-outline' as any} size={18} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s2.deliveryLabel}>Teslim Edilecek Tarih</Text>
                <DateField
                  value={form.delivery_date}
                  onChange={set('delivery_date')}
                  minDate={new Date()}
                />
              </View>
            </View>
          </SectionCard>

          {/* ── Notlar ── */}
          <SectionCard title="Notlar" icon={'note-text-outline' as any}>
            <Field
              label="Doktor Talimatları / Açıklaması"
              value={form.notes}
              onChangeText={set('notes')}
              placeholder="Hekimin özel gereksinimleri, talimatları..."
              multiline
            />
            <View style={s2.labNoteWrap}>
              <View style={s2.labNoteHeader}>
                <MaterialCommunityIcons name="lock-outline" size={12} color="#D97706" />
                <Text style={s2.labNoteTitle}>Lab İç Notu</Text>
                <Text style={s2.labNoteHint}>· doktora görünmez</Text>
              </View>
              <TextInput
                style={s2.labNoteInput}
                value={form.lab_notes}
                onChangeText={set('lab_notes')}
                placeholder="Teknisyen notları, hatırlatmalar..."
                placeholderTextColor={C.textMuted}
                multiline
                textAlignVertical="top"
                // @ts-ignore
                outlineStyle="none"
              />
            </View>
          </SectionCard>

        </ScrollView>
      )}

      {/* Step 3 — Teeth & Dentures */}
      {step === 3 && (
        <View style={[styles.step2Container, isDesktop && styles.step2ContainerDesktop]}>
          {/* Left: Tooth picker */}
          <ScrollView style={[styles.step2Left, isDesktop && styles.step2LeftDesktop]}
            contentContainerStyle={styles.step2LeftContent}>
            <SectionCard title="Diş Seçimi" icon="medical-outline">
              <ToothNumberPicker selected={form.tooth_numbers} onChange={set('tooth_numbers')} />
            </SectionCard>

            <SectionCard title="İş Detayları" icon="options-outline">
              <Text style={styles.fieldLabel}>Departman</Text>
              <View style={styles.chipRow}>
                {DEPARTMENTS.map((dep) => (
                  <TouchableOpacity key={dep}
                    onPress={() => set('department')(form.department === dep ? '' : dep)}
                    style={[styles.chip, form.department === dep && styles.chipActive]}>
                    <Text style={[styles.chipText, form.department === dep && styles.chipTextActive]}>{dep}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>İş Türü (isteğe bağlı)</Text>
              <View style={styles.chipRow}>
                {WORK_TYPES.map((wt) => (
                  <TouchableOpacity key={wt} onPress={() => set('work_type')(form.work_type === wt ? '' : wt)}
                    style={[styles.chip, form.work_type === wt && styles.chipActive]}>
                    <Text style={[styles.chipText, form.work_type === wt && styles.chipTextActive]}>{wt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Renk (Shade)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 4 }}>
                  {ALL_SHADES.map((s) => (
                    <TouchableOpacity key={s} onPress={() => set('shade')(form.shade === s ? '' : s)}
                      style={[styles.shadeChip, form.shade === s && styles.shadeChipActive]}>
                      <Text style={[styles.shadeText, form.shade === s && styles.shadeTextActive]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Makine Tipi</Text>
              <View style={styles.machineRow}>
                {([
                  { v: 'milling', l: '⚙️ Frezeleme', d: 'Zirkonyum / kuru kazıma' },
                  { v: '3d_printing', l: '🖨️ 3D Baskı', d: 'SprintRay reçine' },
                ] as { v: MachineType; l: string; d: string }[]).map((m) => (
                  <TouchableOpacity key={m.v} onPress={() => set('machine_type')(m.v)}
                    style={[styles.machineCard, form.machine_type === m.v && styles.machineCardActive]}>
                    <Text style={styles.machineEmoji}>{m.l}</Text>
                    <Text style={[styles.machineDesc, form.machine_type === m.v && styles.machineDescActive]}>{m.d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Etiketler</Text>
              <View style={styles.chipRow}>
                {ORDER_TAGS.map((tag) => {
                  const active = form.tags.includes(tag);
                  return (
                    <TouchableOpacity key={tag}
                      onPress={() => set('tags')(active ? form.tags.filter((t) => t !== tag) : [...form.tags, tag])}
                      style={[styles.chip, active && styles.tagChipActive]}>
                      <Text style={[styles.chipText, active && styles.tagChipTextActive]}>{tag}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </SectionCard>
          </ScrollView>

          {/* Right: Service catalog */}
          <View style={[styles.step2Right, isDesktop && styles.step2RightDesktop]}>
            <View style={styles.catalogHeader}>
              <Text style={styles.catalogTitle}>🦷 Protez Listesi</Text>
              {form.pending_items.length > 0 && (
                <View style={styles.totalBadge}>
                  <Text style={styles.totalBadgeText}>
                    Toplam: {form.pending_items.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)} TRY
                  </Text>
                </View>
              )}
            </View>

            {/* Selected items */}
            {form.pending_items.length > 0 && (
              <View style={styles.pendingItems}>
                {form.pending_items.map((item, idx) => (
                  <View key={idx} style={styles.pendingRow}>
                    <Text style={styles.pendingName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.pendingPrice}>{(item.price * item.quantity).toFixed(2)}</Text>
                    <TouchableOpacity onPress={() => removePendingItem(idx)} style={styles.removeBtn}>
                      <Text style={styles.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={styles.pendingTotal}>
                  <Text style={styles.pendingTotalLabel}>Toplam</Text>
                  <Text style={styles.pendingTotalValue}>{itemTotal.toFixed(2)} TRY</Text>
                </View>
              </View>
            )}

            <TextInput
              style={styles.catalogSearch}
              value={serviceSearch} onChangeText={setServiceSearch}
              placeholder="🔍  Protez ara..."
              placeholderTextColor={C.textMuted}
            />

            <ScrollView style={styles.catalogScroll} showsVerticalScrollIndicator={false}>
              {services.length === 0 ? (
                <View style={styles.catalogEmpty}>
                  <Text style={styles.catalogEmptyText}>Hizmet Kataloğu'ndan protez ekleyin.</Text>
                </View>
              ) : (
                Object.entries(servicesByCategory).map(([cat, items]) => (
                  <View key={cat}>
                    <Text style={styles.catGroupLabel}>{cat}</Text>
                    {items.map((s) => {
                      const addedItem = form.pending_items.find((i) => i.service_id === s.id);
                      return (
                        <TouchableOpacity key={s.id} style={styles.catalogItem} onPress={() => addPendingItem(s)}>
                          <View style={[styles.addCircle, addedItem && styles.addCircleActive]}>
                            <Text style={[styles.addCircleText, addedItem && styles.addCircleTextActive]}>
                              {addedItem ? addedItem.quantity : '+'}
                            </Text>
                          </View>
                          <Text style={styles.catalogItemName} numberOfLines={2}>{s.name}</Text>
                          <Text style={styles.catalogItemPrice}>
                            {s.price > 0 ? `${s.price.toFixed(2)} ${s.currency}` : '—'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Step 4 — Summary */}
      {step === 4 && (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Vaka Özeti</Text>

            {form.is_urgent && (
              <View style={styles.urgentBanner}>
                <Text style={styles.urgentBannerText}>🔴 ACİL VAKA</Text>
              </View>
            )}

            <SummaryGroup title="Klinik & Hekim">
              {selectedClinic && <SummaryRow label="Klinik" value={selectedClinic.name} />}
              {selectedDoctor && <SummaryRow label="Hekim" value={selectedDoctor.full_name} />}
            </SummaryGroup>

            <SummaryGroup title="Hasta">
              {form.patient_name && <SummaryRow label="Ad Soyad" value={form.patient_name} />}
              {form.patient_id && <SummaryRow label="TC Kimlik" value={form.patient_id} />}
              {form.patient_gender !== 'belirtilmedi' && <SummaryRow label="Cinsiyet" value={form.patient_gender === 'erkek' ? '♂ Erkek' : '♀ Kadın'} />}
              {form.patient_dob && <SummaryRow label="Doğum Tarihi" value={form.patient_dob.toLocaleDateString('tr-TR')} />}
              {form.patient_phone && <SummaryRow label="İletişim" value={form.patient_phone} />}
            </SummaryGroup>

            <SummaryGroup title="Vaka">
              {form.model_type && <SummaryRow label="Model Tipi" value={MODEL_TYPES.find((m) => m.value === form.model_type)?.label ?? form.model_type} />}
              {form.department && <SummaryRow label="Departman" value={form.department} />}
              {form.work_type && <SummaryRow label="İş Türü" value={form.work_type} />}
              {form.shade && <SummaryRow label="Renk" value={form.shade} />}
              <SummaryRow label="Makine" value={form.machine_type === 'milling' ? '⚙️ Frezeleme' : '🖨️ 3D Baskı'} />
              <SummaryRow label="Teslim" value={form.delivery_date.toLocaleDateString('tr-TR')} />
              {form.tooth_numbers.length > 0 && (
                <SummaryRow label="Dişler" value={[...form.tooth_numbers].sort((a, b) => a - b).join(', ')} />
              )}
            </SummaryGroup>

            {form.pending_items.length > 0 && (
              <SummaryGroup title={`Protez Listesi (${form.pending_items.length} kalem)`}>
                {form.pending_items.map((item, i) => (
                  <SummaryRow key={i} label={item.name}
                    value={`${(item.price * item.quantity).toFixed(2)} TRY${item.quantity > 1 ? ` (x${item.quantity})` : ''}`} />
                ))}
                <View style={styles.summaryTotal}>
                  <Text style={styles.summaryTotalLabel}>Toplam Tutar</Text>
                  <Text style={styles.summaryTotalValue}>{itemTotal.toFixed(2)} TRY</Text>
                </View>
              </SummaryGroup>
            )}

            {form.notes ? (
              <SummaryGroup title="Doktor Talimatları">
                <Text style={styles.noteText}>{form.notes}</Text>
              </SummaryGroup>
            ) : null}
            {form.lab_notes ? (
              <SummaryGroup title="🔒 Lab İç Notu">
                <Text style={[styles.noteText, { color: '#92400E' }]}>{form.lab_notes}</Text>
              </SummaryGroup>
            ) : null}
          </View>
        </ScrollView>
      )}

      {/* Validation error */}
      {validationError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {validationError}</Text>
        </View>
      ) : null}

      {/* Navigation */}
      <View style={styles.navBar}>
        {step > 1 && (
          <TouchableOpacity style={styles.backBtn}
            onPress={() => { setValidationError(''); setStep((s) => (s - 1) as Step); }}>
            <Text style={styles.backBtnText}>← Geri</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        {step < 4 ? (
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
            <Text style={styles.nextBtnText}>İleri →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.nextBtn, styles.submitBtn, loading && { opacity: 0.6 }]}
            onPress={handleSubmit} disabled={loading}>
            <Text style={styles.nextBtnText}>{loading ? 'Kaydediliyor...' : '✓ İş Emrini Kaydet'}</Text>
          </TouchableOpacity>
        )}
      </View>{/* navBar */}

        </View>{/* mainCol */}
      </View>{/* outerWrap */}

{/* Clinic add modal */}
      <ClinicAddModal
        visible={clinicModal.visible}
        prefillName={clinicModal.prefill}
        saving={clinicSaving}
        onClose={() => setClinicModal({ visible: false, prefill: '' })}
        onSave={async (data) => {
          setClinicSaving(true);
          const { data: created } = await createClinic(data);
          setClinicSaving(false);
          if (created) {
            setClinics(prev => [...prev, created as any]);
            set('clinic_id')((created as any).id);
            set('doctor_id')('');
          }
          setClinicModal({ visible: false, prefill: '' });
        }}
      />
    </SafeAreaView>
  );
}

// ── ClinicAddModal ──────────────────────────────────────────────

interface ClinicFormData {
  name: string;
  phone: string;
  email: string;
  address: string;
  contact_person: string;
  notes: string;
}

function ClinicAddModal({
  visible, prefillName, saving, onClose, onSave,
}: {
  visible: boolean;
  prefillName: string;
  saving: boolean;
  onClose: () => void;
  onSave: (data: { name: string; phone?: string; email?: string; address?: string; contact_person?: string; notes?: string }) => Promise<void>;
}) {
  const [form, setForm] = useState<ClinicFormData>({
    name: '', phone: '', email: '', address: '', contact_person: '', notes: '',
  });

  // Pre-fill name when modal opens
  useEffect(() => {
    if (visible) {
      setForm({ name: prefillName, phone: '', email: '', address: '', contact_person: '', notes: '' });
    }
  }, [visible, prefillName]);

  const setField = (key: keyof ClinicFormData) => (val: string) =>
    setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    await onSave({
      name: form.name.trim(),
      phone: form.phone || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
      contact_person: form.contact_person || undefined,
      notes: form.notes || undefined,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={cm.overlay}>
        <View style={cm.sheet}>
          {/* Header */}
          <View style={cm.header}>
            <View>
              <Text style={cm.title}>Yeni Klinik</Text>
              <Text style={cm.subtitle}>Klinik bilgilerini doldurun</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={cm.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={cm.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Klinik Adı */}
            <Text style={cm.label}>Klinik Adı *</Text>
            <TextInput style={cm.input} value={form.name} onChangeText={setField('name')}
              placeholder="Klinik adı" placeholderTextColor="#B0BAC9"
              // @ts-ignore
              outlineStyle="none" />

            {/* Telefon + E-posta */}
            <View style={cm.row}>
              <View style={{ flex: 1 }}>
                <Text style={cm.label}>Telefon</Text>
                <TextInput style={cm.input} value={form.phone} onChangeText={setField('phone')}
                  placeholder="05XX XXX XX XX" placeholderTextColor="#B0BAC9" keyboardType="phone-pad"
                  // @ts-ignore
                  outlineStyle="none" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={cm.label}>E-posta</Text>
                <TextInput style={cm.input} value={form.email} onChangeText={setField('email')}
                  placeholder="ornek@klinik.com" placeholderTextColor="#B0BAC9" keyboardType="email-address"
                  autoCapitalize="none"
                  // @ts-ignore
                  outlineStyle="none" />
              </View>
            </View>

            {/* Adres */}
            <Text style={cm.label}>Adres</Text>
            <TextInput style={[cm.input, cm.inputMulti]} value={form.address} onChangeText={setField('address')}
              placeholder="Klinik adresi" placeholderTextColor="#B0BAC9"
              multiline textAlignVertical="top"
              // @ts-ignore
              outlineStyle="none" />

            {/* İletişim Kişisi */}
            <Text style={cm.label}>İletişim Kişisi</Text>
            <TextInput style={cm.input} value={form.contact_person} onChangeText={setField('contact_person')}
              placeholder="Sekreter, yönetici adı..." placeholderTextColor="#B0BAC9"
              // @ts-ignore
              outlineStyle="none" />

            {/* Notlar */}
            <Text style={cm.label}>Notlar</Text>
            <TextInput style={[cm.input, cm.inputMulti]} value={form.notes} onChangeText={setField('notes')}
              placeholder="Ek bilgiler..." placeholderTextColor="#B0BAC9"
              multiline textAlignVertical="top"
              // @ts-ignore
              outlineStyle="none" />
          </ScrollView>

          {/* Footer */}
          <View style={cm.footer}>
            <TouchableOpacity style={cm.cancelBtn} onPress={onClose}>
              <Text style={cm.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[cm.saveBtn, (!form.name.trim() || saving) && cm.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!form.name.trim() || saving}
            >
              <Text style={cm.saveText}>{saving ? 'Kaydediliyor...' : 'Klinik Ekle'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const cm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    maxHeight: '90%' as any,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title:    { fontSize: 16, fontWeight: '600', fontFamily: F.semibold, color: '#0F172A' },
  subtitle: { fontSize: 12, fontWeight: '400', fontFamily: F.regular, color: '#94A3B8', marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  body: { paddingHorizontal: 24, paddingTop: 16 },
  row: { flexDirection: 'row', gap: 12 },
  label: {
    fontSize: 11, fontWeight: '500', fontFamily: F.medium, color: '#64748B',
    marginBottom: 6, marginTop: 14, letterSpacing: 0.4, textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, fontWeight: '400', fontFamily: F.regular, color: '#0F172A', backgroundColor: '#FFFFFF',
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '400', fontFamily: F.regular, color: '#64748B' },
  saveBtn: {
    flex: 2, paddingVertical: 13, borderRadius: 12,
    backgroundColor: C.primary, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveText: { fontSize: 14, fontWeight: '500', fontFamily: F.medium, color: '#FFFFFF' },
});

const dob = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  sheet: {
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    paddingBottom: 24,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#F2F2F7',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  toolbarTitle: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  clearBtn: { fontSize: 15, color: '#8E8E93' },
  doneBtn:  { fontSize: 15, fontWeight: '700', color: C.primary },
});

// ── Sub-components ─────────────────────────────────────────────

function SectionCard({ title, subtitle, icon, children }: {
  title: string; subtitle?: string; icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name']; children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionCardHeader}>
        <View style={styles.sectionCardTitleRow}>
          {icon && (
            <View style={styles.sectionCardIconWrap}>
              <MaterialCommunityIcons name={icon} size={14} color={C.primary} />
            </View>
          )}
          <Text style={styles.sectionCardTitle}>{title}</Text>
        </View>
        {subtitle && <Text style={styles.sectionCardSub}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline, flex, style }: any) {
  return (
    <View style={[styles.fieldWrap, flex && { flex: 1 }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMulti, style]}
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor={C.textMuted}
        multiline={multiline} textAlignVertical={multiline ? 'top' : 'auto'}
      />
    </View>
  );
}

// ── Drum-roll Wheel Picker ──────────────────────────────────────

const WHEEL_ITEM_H = 44;
const WHEEL_VISIBLE = 5;
const WHEEL_H = WHEEL_ITEM_H * WHEEL_VISIBLE;

function WheelPickerColumn({
  items, selectedIndex, onChange, width = 80,
}: {
  items: string[]; selectedIndex: number; onChange: (i: number) => void; width?: number;
}) {
  const scrollRef = useRef<any>(null);
  const [displayIdx, setDisplayIdx] = useState(selectedIndex);
  const debounceRef = useRef<any>(null);

  // Scroll to position on mount / external change
  useEffect(() => {
    const offset = selectedIndex * WHEEL_ITEM_H;
    if (Platform.OS === 'web') {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = offset;
      });
    } else {
      scrollRef.current?.scrollTo({ y: offset, animated: false });
    }
    setDisplayIdx(selectedIndex);
  }, [selectedIndex]);

  const handleScroll = (e: any) => {
    const top = Platform.OS === 'web'
      ? (e.target as HTMLElement).scrollTop
      : e.nativeEvent.contentOffset.y;
    const raw = Math.round(top / WHEEL_ITEM_H);
    const idx = Math.max(0, Math.min(raw, items.length - 1));
    setDisplayIdx(idx);
    if (Platform.OS === 'web') {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onChange(idx), 120);
    }
  };

  const handleNativeScrollEnd = (e: any) => {
    const top = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(Math.round(top / WHEEL_ITEM_H), items.length - 1));
    onChange(idx);
  };

  if (Platform.OS === 'web') {
    return (
      <div style={{ position: 'relative', width, height: WHEEL_H, flexShrink: 0 }}>
        {/* Selection indicator lines */}
        <div style={{
          position: 'absolute', top: WHEEL_ITEM_H * 2, left: 6, right: 6,
          height: WHEEL_ITEM_H,
          borderTop: '1.5px solid #E2E8F0',
          borderBottom: '1.5px solid #E2E8F0',
          pointerEvents: 'none', zIndex: 2,
        }} />
        {/* Fade gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, white 0%, transparent 30%, transparent 70%, white 100%)',
          pointerEvents: 'none', zIndex: 3,
        }} />
        {/* Scroll column */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            height: WHEEL_H, overflowY: 'scroll',
            scrollSnapType: 'y mandatory',
            scrollbarWidth: 'none' as any,
            // @ts-ignore
            msOverflowStyle: 'none',
          }}
        >
          <div style={{ height: WHEEL_ITEM_H * 2 }} />
          {items.map((item, i) => {
            const dist = Math.abs(i - displayIdx);
            return (
              <div
                key={i}
                onClick={() => {
                  onChange(i);
                  scrollRef.current?.scrollTo({ top: i * WHEEL_ITEM_H, behavior: 'smooth' });
                }}
                style={{
                  scrollSnapAlign: 'center',
                  height: WHEEL_ITEM_H,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: dist === 0 ? 17 : 15,
                  fontWeight: dist === 0 ? '600' : '400',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  color: '#0F172A',
                  opacity: dist === 0 ? 1 : dist === 1 ? 0.38 : 0.14,
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'opacity 0.12s, font-size 0.12s',
                } as any}
              >
                {item}
              </div>
            );
          })}
          <div style={{ height: WHEEL_ITEM_H * 2 }} />
        </div>
      </div>
    );
  }

  // Native ScrollView-based picker
  return (
    <View style={{ width, height: WHEEL_H }}>
      <View style={{
        position: 'absolute', top: WHEEL_ITEM_H * 2, left: 4, right: 4, height: 1, backgroundColor: '#E2E8F0',
      }} />
      <View style={{
        position: 'absolute', top: WHEEL_ITEM_H * 3, left: 4, right: 4, height: 1, backgroundColor: '#E2E8F0',
      }} />
      <ScrollView
        ref={scrollRef}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleNativeScrollEnd}
        style={{ height: WHEEL_H }}
      >
        <View style={{ height: WHEEL_ITEM_H * 2 }} />
        {items.map((item, i) => {
          const dist = Math.abs(i - displayIdx);
          return (
            <View key={i} style={{ height: WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{
                fontSize: dist === 0 ? 17 : 15,
                fontFamily: dist === 0 ? F.semibold : F.regular,
                fontWeight: dist === 0 ? '600' : '400',
                color: '#0F172A',
                opacity: dist === 0 ? 1 : dist === 1 ? 0.38 : 0.14,
              }}>
                {item}
              </Text>
            </View>
          );
        })}
        <View style={{ height: WHEEL_ITEM_H * 2 }} />
      </ScrollView>
    </View>
  );
}

// ── Date Wheel Picker Modal ──────────────────────────────────────

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function DateWheelPickerModal({
  visible, value, onChange, onClose, minDate, maxDate, title,
}: {
  visible: boolean;
  value: Date | null;
  onChange: (d: Date) => void;
  onClose: () => void;
  minDate?: Date;
  maxDate?: Date;
  title?: string;
}) {
  const now = new Date();
  const minY = minDate ? minDate.getFullYear() : 1930;
  const maxY = maxDate ? maxDate.getFullYear() : now.getFullYear();

  const [selYear,  setSelYear]  = useState(value ? value.getFullYear() : now.getFullYear());
  const [selMonth, setSelMonth] = useState(value ? value.getMonth()    : now.getMonth());
  const [selDay,   setSelDay]   = useState(value ? value.getDate()     : now.getDate());

  useEffect(() => {
    if (visible) {
      const d = value ?? now;
      setSelYear(d.getFullYear());
      setSelMonth(d.getMonth());
      setSelDay(d.getDate());
    }
  }, [visible]);

  const years = Array.from({ length: maxY - minY + 1 }, (_, i) => String(minY + i));
  const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));
  const clampedDay = Math.min(selDay, daysInMonth);

  const handleSubmit = () => {
    onChange(new Date(selYear, selMonth, clampedDay, 12, 0, 0));
    onClose();
  };

  const yearIdx  = Math.max(0, years.indexOf(String(selYear)));
  const dayIdx   = Math.max(0, clampedDay - 1);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={dp.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={dp.card}>
          {/* Header */}
          <View style={dp.header}>
            <Text style={dp.headerTitle}>{(title ?? 'Tarih Seç').toUpperCase()}</Text>
            <TouchableOpacity style={dp.closeBtn} onPress={onClose}>
              <Text style={dp.closeX}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Column labels */}
          <View style={dp.colLabels}>
            <Text style={[dp.colLabel, { width: 88 }]}>YIL</Text>
            <Text style={[dp.colLabel, { width: 72 }]}>AY</Text>
            <Text style={[dp.colLabel, { width: 64 }]}>GÜN</Text>
          </View>

          {/* Three scroll columns */}
          <View style={dp.columns}>
            <WheelPickerColumn
              items={years}
              selectedIndex={yearIdx}
              onChange={(i) => setSelYear(parseInt(years[i]))}
              width={88}
            />
            <WheelPickerColumn
              items={TR_MONTHS}
              selectedIndex={selMonth}
              onChange={setSelMonth}
              width={72}
            />
            <WheelPickerColumn
              items={days}
              selectedIndex={dayIdx}
              onChange={(i) => setSelDay(i + 1)}
              width={64}
            />
          </View>

          {/* Submit */}
          <TouchableOpacity style={dp.submitBtn} onPress={handleSubmit}>
            <Text style={dp.submitText}>KAYDET</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const dp = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: 260,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 11, fontWeight: '500', fontFamily: F.medium,
    color: '#94A3B8', letterSpacing: 1.8,
  },
  closeBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  closeX: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  colLabels: {
    flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 4, gap: 0,
  },
  colLabel: {
    fontSize: 9, fontWeight: '500', fontFamily: F.medium,
    color: '#CBD5E1', letterSpacing: 1.2, textAlign: 'center', textTransform: 'uppercase',
  },
  columns: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  submitBtn: {
    margin: 14,
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: {
    color: '#FFFFFF', fontSize: 12,
    fontWeight: '600', fontFamily: F.semibold,
    letterSpacing: 1.8,
  },
});

// ── DateField ────────────────────────────────────────────────────

function DateField({ label, value, onChange, minDate, maxDate, placeholder, flex }: {
  label?: string;
  value: Date | null;
  onChange: (d: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  flex?: boolean;
}) {
  const [showPicker, setShowPicker] = useState(false);

  const displayText = value
    ? value.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
    : (placeholder ?? 'Tarih seçin');

  return (
    <View style={[styles.fieldWrap, flex && { flex: 1 }]}>
      {label && <Text style={styles.fieldLabel}>{label}</Text>}
      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPicker(true)}>
        <MaterialCommunityIcons name="calendar-outline" size={16} color="#64748B" />
        <Text style={[styles.dateBtnText, !value && { color: '#94A3B8' }]}>{displayText}</Text>
      </TouchableOpacity>
      <DateWheelPickerModal
        visible={showPicker}
        value={value}
        onChange={onChange}
        onClose={() => setShowPicker(false)}
        minDate={minDate}
        maxDate={maxDate}
        title={label}
      />
    </View>
  );
}

function SummaryGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.summaryGroup}>
      <Text style={styles.summaryGroupTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

// ── SearchableDropdown ──────────────────────────────────────────

interface DropdownOption { id: string; label: string; sublabel?: string; }

function SearchableDropdown({
  label, placeholder, options, selectedId, onSelect, onAddNew, addNewLabel,
}: {
  label: string;
  placeholder: string;
  options: DropdownOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAddNew?: (name: string) => Promise<void>;
  addNewLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [query, setQuery]     = useState('');
  const [adding, setAdding]   = useState(false);

  const selected = options.find(o => o.id === selectedId);

  // Keep input text in sync with external selection changes (e.g. clinic reset clears doctor)
  useEffect(() => {
    if (!focused) {
      setQuery(selected ? selected.label : '');
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const exactMatch = options.some(o => o.label.toLowerCase() === query.trim().toLowerCase());
  const showList   = focused;
  const showAdd    = !!onAddNew && query.trim().length > 0 && !exactMatch;

  const handleSelect = (id: string, itemLabel: string) => {
    onSelect(id);
    setQuery(itemLabel);
    setFocused(false);
  };

  const handleClear = () => {
    onSelect('');
    setQuery('');
    setFocused(false);
  };

  const handleAdd = async () => {
    if (!onAddNew || adding) return;
    setAdding(true);
    await onAddNew(query.trim());
    setAdding(false);
    setFocused(false);
  };

  return (
    <View style={[dd.wrap, { flex: 1 }]}>
      <Text style={dd.label}>{label}</Text>

      {/* Text input — always visible, acts as both search & display */}
      <View style={[dd.inputWrap, focused && dd.inputWrapFocused]}>
        <MaterialCommunityIcons name="magnify" size={15} color="#94A3B8" />
        <TextInput
          style={dd.input}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            if (!text) onSelect('');
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 250)}
          placeholder={placeholder}
          placeholderTextColor="#B0BAC9"
          // @ts-ignore
          outlineStyle="none"
        />
        {selectedId ? (
          <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="close-circle-outline" size={16} color="#B0BAC9" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Dropdown list — inline, opens below input */}
      {/* onMouseDown preventDefault keeps input focused so onPress fires before onBlur */}
      {showList && (
        <View style={dd.panel} {...(Platform.OS === 'web' ? { onMouseDown: (e: any) => e.preventDefault() } : {})}>
          <ScrollView
            style={dd.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {filtered.length === 0 && !showAdd && (
              <Text style={dd.emptyText}>Sonuç bulunamadı</Text>
            )}
            {filtered.map(item => {
              const active = item.id === selectedId;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[dd.item, active && dd.itemActive]}
                  onPress={() => handleSelect(item.id, item.label)}
                >
                  <View style={dd.itemLeft}>
                    <Text style={[dd.itemLabel, active && dd.itemLabelActive]}>{item.label}</Text>
                    {item.sublabel && <Text style={dd.itemSub}>{item.sublabel}</Text>}
                  </View>
                  {active && <MaterialCommunityIcons name="check" size={16} color="#2563EB" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {showAdd && (
            <TouchableOpacity style={dd.addRow} onPress={handleAdd} disabled={adding}>
              <View style={dd.addIcon}>
                <MaterialCommunityIcons name="plus" size={16} color="#2563EB" />
              </View>
              <Text style={dd.addText}>
                {adding ? 'Ekleniyor...' : `${addNewLabel ?? 'Ekle'}: "${query.trim()}"`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const dd = StyleSheet.create({
  wrap:  { position: 'relative' },
  label: { fontSize: 11, fontWeight: '500', fontFamily: F.medium, color: '#64748B', marginBottom: 7, letterSpacing: 0.5, textTransform: 'uppercase' },

  /* Direct text input */
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: '#FFFFFF',
  },
  inputWrapFocused: { borderColor: '#2563EB' },
  input: {
    flex: 1, fontSize: 14, fontWeight: '400', fontFamily: F.regular, color: '#0F172A',
  },

  /* Inline panel — appears directly below input, pushes content down */
  panel: {
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    // @ts-ignore
    boxShadow: '0 4px 16px rgba(15,23,42,0.10)',
  },

  list:      { maxHeight: 240 },
  emptyText: { textAlign: 'center', fontFamily: F.regular, color: '#94A3B8', paddingVertical: 24, fontSize: 13 },

  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F8FAFC', gap: 10,
  },
  itemActive:      { backgroundColor: '#EFF6FF' },
  itemLeft:        { flex: 1 },
  itemLabel:       { fontSize: 14, fontWeight: '400', fontFamily: F.regular, color: '#0F172A' },
  itemLabelActive: { color: '#2563EB', fontWeight: '500', fontFamily: F.medium },
  itemSub:         { fontSize: 12, fontFamily: F.regular, color: '#94A3B8', marginTop: 1 },

  addRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFF',
  },
  addIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
  },
  addText: { fontSize: 14, fontWeight: '500', fontFamily: F.medium, color: '#2563EB' },
});

// ── Step Sidebar (desktop) ──────────────────────────────────────

const STEP_DEFS = [
  { num: 1 as Step, label: 'Klinik & Hasta',    sub: 'Klinik, hekim, hasta bilgileri' },
  { num: 2 as Step, label: 'Vaka Detayları',    sub: 'Ölçüm, teslim tarihi, notlar'  },
  { num: 3 as Step, label: 'Diş & Protez',      sub: 'Diş seçimi, iş detayları'      },
  { num: 4 as Step, label: 'Özet & Gönder',     sub: 'Kontrol et ve kaydet'           },
];

function StepSidebar({ currentStep }: { currentStep: Step }) {
  return (
    <View style={sb.sidebar}>
      <View style={sb.stepsWrap}>
        {STEP_DEFS.map((s, i) => {
          const done   = currentStep > s.num;
          const active = currentStep === s.num;
          const isLast = i === STEP_DEFS.length - 1;
          return (
            <View key={s.num} style={sb.stepItem}>
              {/* Left column: circle + connector line */}
              <View style={sb.indicatorCol}>
                <View style={[sb.ring, done && sb.ringDone, active && sb.ringActive]}>
                  <View style={[sb.dot, done && sb.dotDone, active && sb.dotActive]} />
                </View>
                {!isLast && (
                  <View style={sb.lineSegment}>
                    <View style={[sb.line, done && sb.lineDone]} />
                  </View>
                )}
              </View>
              {/* Right column: label card */}
              <View style={[sb.labelCard, active && sb.labelCardActive]}>
                <Text style={[sb.stepLabel, active && sb.stepLabelActive, done && sb.stepLabelDone]}>
                  {s.label}
                </Text>
                {(active || done) && (
                  <Text style={[sb.stepSub, done && sb.stepSubDone]}>{s.sub}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const sb = StyleSheet.create({
  sidebar: {
    width: 240,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 20,
  },
  stepsWrap: { flex: 1 },

  // Each step is a horizontal row: [indicator col] + [label card]
  stepItem: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },

  // Left column — circle on top, line filling the rest
  indicatorCol: {
    width: 38,
    alignItems: 'center',
    paddingTop: 16,
  },

  // Line segment that fills from bottom-of-circle to top-of-next-circle
  lineSegment: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 0,
    minHeight: 24,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: '#E2E8F0',
    borderRadius: 1,
  },
  lineDone: { backgroundColor: C.primary },

  // Radio ring
  ring: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  ringDone:   { borderColor: C.primary, backgroundColor: C.primary },
  ringActive: { borderColor: C.primary, backgroundColor: C.primary },

  // Inner dot
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  dotDone:   { backgroundColor: '#FFFFFF' },
  dotActive: { backgroundColor: '#FFFFFF' },

  // Right column — label card
  labelCard: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 0,
  },
  labelCardActive: {
    backgroundColor: '#EFF6FF',
  },

  stepLabel: {
    fontSize: 13, fontWeight: '400', fontFamily: F.regular, color: '#94A3B8',
  },
  stepLabelActive: { color: C.textPrimary, fontWeight: '600', fontFamily: F.semibold },
  stepLabelDone:   { color: C.primary,     fontWeight: '500', fontFamily: F.medium },
  stepSub: {
    fontSize: 11, fontWeight: '400', fontFamily: F.regular, color: '#B0BAC9', marginTop: 2,
  },
  stepSubDone: { color: '#93C5FD' },
});

// ── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },

  /* Outer layout */
  outerWrap:        { flex: 1, backgroundColor: '#FFFFFF' },
  outerWrapDesktop: { flexDirection: 'row' },
  mainCol:          { flex: 1, backgroundColor: '#FFFFFF' },

  /* Mobile step header */
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#EEF2F7',
  },
  headerTitle: { fontSize: 16, fontWeight: '600', fontFamily: F.semibold, color: '#0F172A', marginBottom: 14 },
  steps: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stepWrap: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: '#DDE3ED',
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive:  { backgroundColor: '#EFF6FF', borderWidth: 2, borderColor: C.primary },
  stepDotCurrent: { backgroundColor: C.primary, borderColor: C.primary },
  stepNum:       { fontSize: 11, fontWeight: '600', fontFamily: F.semibold, color: '#94A3B8' },
  stepNumActive: { color: C.primary },
  stepLine:       { width: 40, height: 2, backgroundColor: '#DDE3ED', marginHorizontal: 4 },
  stepLineActive: { backgroundColor: C.primary },
  stepLabel: { fontSize: 13, color: '#64748B', fontWeight: '500', fontFamily: F.medium },

  /* Form content area — light background so cards pop */
  content: { padding: 16, paddingBottom: 32, backgroundColor: '#FFFFFF', gap: 0 },

  /* Section cards — real cards with shadow */
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E9EEF4',
    overflow: 'visible',
    marginBottom: 12,
    padding: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionCardHeader: {
    paddingBottom: 14,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sectionCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionCardIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  sectionCardTitle: { fontSize: 13, fontWeight: '600', fontFamily: F.semibold, color: '#1E293B', letterSpacing: 0.1 },
  sectionCardSub:   { fontSize: 12, fontWeight: '400', fontFamily: F.regular, color: C.textMuted, marginTop: 4, marginLeft: 36 },

  /* Legacy clinic card selectors (unused but kept for type safety) */
  cardRow: { flexDirection: 'row', gap: 10, paddingVertical: 12 },
  selectCard: { width: 148, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', alignItems: 'center', gap: 6 },
  selectCardActive: { borderColor: C.primary, backgroundColor: '#EFF6FF' },
  selectCardEmoji: { fontSize: 22 },
  selectCardName: { fontSize: 12, fontWeight: '600', fontFamily: F.semibold, color: C.textPrimary, textAlign: 'center' },
  selectCardNameActive: { color: C.primary },
  selectCardSub: { fontSize: 11, fontFamily: F.regular, color: C.textMuted },
  emptyNote: { paddingVertical: 14, fontSize: 13, fontFamily: F.regular, color: C.textMuted, fontStyle: 'italic' },
  doctorGrid: { paddingVertical: 10, gap: 8 },
  doctorCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', gap: 12 },
  doctorCardActive: { borderColor: C.primary, backgroundColor: '#EFF6FF' },
  doctorAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  doctorAvatarActive: { backgroundColor: C.primary },
  doctorAvatarText: { fontSize: 16, fontWeight: '600', fontFamily: F.semibold, color: '#FFFFFF' },
  doctorName: { fontSize: 14, fontWeight: '500', fontFamily: F.medium, color: C.textPrimary },
  doctorNameActive: { color: C.primary },
  doctorClinic: { fontSize: 12, fontFamily: F.regular, color: C.textSecondary, marginTop: 1 },
  checkMark: { fontSize: 16, color: C.primary, fontWeight: '600', fontFamily: F.semibold },

  /* Form fields */
  twoCol: { flexDirection: 'row', gap: 12, overflow: 'visible' },
  fieldWrap: { paddingBottom: 14 },
  fieldLabel: {
    fontSize: 11, fontWeight: '500', fontFamily: F.medium, color: '#64748B',
    marginBottom: 7, letterSpacing: 0.5, textTransform: 'uppercase',
  },
  fieldSub: { fontSize: 11, fontFamily: F.regular, color: C.textMuted },
  fieldInput: {
    borderWidth: 1, borderColor: '#DDE3ED', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 14, fontWeight: '400', fontFamily: F.regular, color: '#0F172A', backgroundColor: '#FAFBFC',
    // @ts-ignore
    outlineStyle: 'none',
  },
  fieldInputMulti: { minHeight: 88, textAlignVertical: 'top' },

  /* Toggles and chips */
  urgentRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1, borderColor: '#E9EEF4',
    backgroundColor: '#FAFBFC', marginBottom: 14,
  },
  rowBetween: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1, borderColor: '#E9EEF4',
    backgroundColor: '#FAFBFC', marginBottom: 14,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingBottom: 12, paddingTop: 2 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#DDE3ED', backgroundColor: '#FAFBFC',
  },
  chipActive:     { borderColor: C.primary, backgroundColor: '#EFF6FF' },
  chipText:       { fontSize: 12, fontWeight: '400', fontFamily: F.regular, color: '#64748B' },
  chipTextActive: { color: C.primary, fontWeight: '500', fontFamily: F.medium },
  tagChipActive:     { borderColor: C.warning, backgroundColor: C.warningBg },
  tagChipTextActive: { color: C.warning, fontWeight: '500', fontFamily: F.medium },

  /* Date buttons — consistent with field inputs */
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 14, backgroundColor: '#FAFBFC',
    borderWidth: 1, borderColor: '#DDE3ED', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  dateBtnText: { fontSize: 14, fontWeight: '400', fontFamily: F.regular, color: '#0F172A', flex: 1 },

  /* Shade + machine chips */
  shadeChip:       { borderWidth: 1, borderColor: '#DDE3ED', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 11, backgroundColor: '#FAFBFC' },
  shadeChipActive: { borderColor: C.primary, backgroundColor: '#EFF6FF' },
  shadeText:       { fontSize: 12, fontWeight: '400', fontFamily: F.regular, color: C.textSecondary },
  shadeTextActive: { color: C.primary, fontFamily: F.medium },
  machineRow: { flexDirection: 'row', gap: 10, paddingBottom: 14 },
  machineCard: {
    flex: 1, borderWidth: 1.5, borderColor: '#DDE3ED',
    borderRadius: 12, padding: 16, alignItems: 'center', backgroundColor: '#FAFBFC',
  },
  machineCardActive: { borderColor: C.primary, backgroundColor: '#EFF6FF' },
  machineEmoji:      { fontSize: 18, marginBottom: 6 },
  machineDesc:       { fontSize: 11, fontFamily: F.regular, color: C.textSecondary, textAlign: 'center' },
  machineDescActive: { color: C.primary, fontFamily: F.medium },

  /* Step 2 layout */
  step2Container:        { flex: 1, backgroundColor: '#FFFFFF' },
  step2ContainerDesktop: { flexDirection: 'row' },
  step2Left:             { flex: 1, backgroundColor: '#FFFFFF' },
  step2LeftDesktop:      { flex: 1, borderRightWidth: 1, borderRightColor: '#EEF2F7' },
  step2LeftContent:      { padding: 16, paddingBottom: 24, gap: 0 },
  step2Right:            { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF2F7', maxHeight: 380 },
  step2RightDesktop:     { width: 300, borderTopWidth: 0, maxHeight: undefined },
  catalogHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  catalogTitle:      { fontSize: 14, fontWeight: '600', fontFamily: F.semibold, color: '#0F172A' },
  totalBadge:        { backgroundColor: C.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  totalBadgeText:    { color: '#FFFFFF', fontSize: 11, fontWeight: '500', fontFamily: F.medium },
  pendingItems:      { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  pendingRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  pendingName:       { flex: 1, fontSize: 13, fontFamily: F.regular, color: C.textPrimary },
  pendingPrice:      { fontSize: 13, fontWeight: '500', fontFamily: F.medium, color: C.primary },
  removeBtn:         { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  removeBtnText:     { fontSize: 11, color: '#DC2626', fontWeight: '600', fontFamily: F.semibold },
  pendingTotal:      { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#EFF6FF' },
  pendingTotalLabel: { fontSize: 13, fontWeight: '500', fontFamily: F.medium, color: C.primary },
  pendingTotalValue: { fontSize: 14, fontWeight: '600', fontFamily: F.semibold, color: C.primary },
  catalogSearch: {
    margin: 12, backgroundColor: '#FAFBFC', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 13, fontWeight: '400', fontFamily: F.regular, color: '#0F172A',
    borderWidth: 1, borderColor: '#DDE3ED',
    // @ts-ignore
    outlineStyle: 'none',
  },
  catalogScroll:    { flex: 1 },
  catalogEmpty:     { padding: 28, alignItems: 'center' },
  catalogEmptyText: { fontSize: 13, fontFamily: F.regular, color: C.textMuted, textAlign: 'center' },
  catGroupLabel: {
    fontSize: 10, fontWeight: '500', fontFamily: F.medium, color: C.textMuted,
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6, letterSpacing: 0.8, textTransform: 'uppercase',
  },
  catalogItem:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F8FAFC', gap: 10 },
  addCircle:           { width: 26, height: 26, borderRadius: 13, backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#86EFAC', alignItems: 'center', justifyContent: 'center' },
  addCircleActive:     { backgroundColor: C.primary, borderColor: C.primary },
  addCircleText:       { fontSize: 14, color: '#16A34A', fontWeight: '600', fontFamily: F.semibold, lineHeight: 20 },
  addCircleTextActive: { color: '#FFFFFF' },
  catalogItemName:  { flex: 1, fontSize: 13, fontFamily: F.regular, color: C.textPrimary },
  catalogItemPrice: { fontSize: 12, fontWeight: '500', fontFamily: F.medium, color: C.primary },

  /* Step 3 summary */
  summaryCard: {
    margin: 16, backgroundColor: '#FFFFFF',
    borderRadius: 14, borderWidth: 1, borderColor: '#E9EEF4', overflow: 'hidden',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  summaryTitle: {
    fontSize: 14, fontWeight: '600', fontFamily: F.semibold, color: '#0F172A',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  urgentBanner:     { backgroundColor: '#FEF2F2', padding: 10, margin: 14, borderRadius: 8, alignItems: 'center' },
  urgentBannerText: { color: '#DC2626', fontWeight: '600', fontFamily: F.semibold, fontSize: 13, letterSpacing: 0.3 },
  summaryGroup:      { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  summaryGroupTitle: { fontSize: 10, fontWeight: '500', fontFamily: F.medium, color: '#94A3B8', letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase' },
  summaryRow:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  summaryLabel:      { fontSize: 13, fontWeight: '400', fontFamily: F.regular, color: C.textSecondary, flex: 1 },
  summaryValue:      { fontSize: 13, fontWeight: '500', fontFamily: F.medium, color: '#0F172A', flex: 2, textAlign: 'right' },
  summaryTotal:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, marginTop: 4 },
  summaryTotalLabel: { fontSize: 14, fontWeight: '500', fontFamily: F.medium, color: C.primary },
  summaryTotalValue: { fontSize: 16, fontWeight: '600', fontFamily: F.semibold, color: C.primary },
  noteText:          { fontSize: 13, fontFamily: F.regular, color: C.textPrimary, lineHeight: 20, paddingBottom: 8 },

  /* Navigation bar */
  errorBanner: { backgroundColor: '#FEF2F2', borderTopWidth: 1, borderTopColor: '#FECACA', paddingHorizontal: 20, paddingVertical: 10 },
  errorText:   { fontSize: 13, color: '#DC2626', fontWeight: '500', fontFamily: F.medium },
  navBar: {
    flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#EEF2F7',
    backgroundColor: '#FFFFFF', alignItems: 'center', gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 6,
  },
  backBtn: {
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#DDE3ED', backgroundColor: '#FAFBFC',
  },
  backBtnText: { fontSize: 14, fontWeight: '400', fontFamily: F.regular, color: '#64748B' },
  nextBtn: {
    paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12,
    backgroundColor: C.primary,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtn:   { backgroundColor: '#059669', shadowColor: '#059669' },
  nextBtnText: { fontSize: 14, fontWeight: '500', fontFamily: F.medium, color: '#FFFFFF', letterSpacing: 0.3 },
});

// ── Step 2 styles ────────────────────────────────────────────────
const s2 = StyleSheet.create({
  /* Toggle cards (Acil Vaka / Tasarım Onayı) */
  toggleCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 13, borderRadius: 13,
    borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#FAFBFC',
  },
  toggleCardDanger:  { borderColor: '#FECACA', backgroundColor: '#FFF5F5' },
  toggleCardPrimary: { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  toggleIconWrap: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleIconDefault: { backgroundColor: '#F1F5F9' },
  toggleIconDanger:  { backgroundColor: '#FEE2E2' },
  toggleIconPrimary: { backgroundColor: '#DBEAFE' },
  toggleMid:  { flex: 1 },
  toggleTitle: { fontSize: 13, fontWeight: '600', fontFamily: F.semibold, color: '#1E293B' },
  toggleSub:   { fontSize: 11, fontFamily: F.regular, color: '#94A3B8', marginTop: 2 },

  /* Option cards (Ölçüm Yöntemi) */
  optionCard: {
    flex: 1, alignItems: 'center', gap: 7,
    paddingVertical: 18, paddingHorizontal: 12,
    borderRadius: 14, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#FAFBFC',
    position: 'relative',
  },
  optionCardActive: { borderColor: C.primary, backgroundColor: '#EFF6FF' },
  optionIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  optionIconWrapActive: { backgroundColor: C.primary },
  optionLabel:       { fontSize: 14, fontWeight: '600', fontFamily: F.semibold, color: '#475569' },
  optionLabelActive: { color: C.primary },
  optionSub:         { fontSize: 11, fontFamily: F.regular, color: '#94A3B8', textAlign: 'center' },
  optionCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
  },

  /* Model grid (2×2) */
  modelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  modelCard: {
    width: '47.5%', alignItems: 'center', gap: 8,
    paddingVertical: 16, paddingHorizontal: 10,
    borderRadius: 13, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#FAFBFC',
    position: 'relative',
  },
  modelLabel: {
    fontSize: 12, fontWeight: '500', fontFamily: F.medium,
    color: '#64748B', textAlign: 'center',
  },
  modelCheck: {
    position: 'absolute', top: 7, right: 7,
    width: 17, height: 17, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },

  /* Delivery date row */
  deliveryRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  deliveryIconWrap: {
    width: 42, height: 42, borderRadius: 12, marginTop: 0,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
  },
  deliveryLabel: {
    fontSize: 11, fontWeight: '500', fontFamily: F.medium, color: '#64748B',
    marginBottom: 7, letterSpacing: 0.5, textTransform: 'uppercase',
  },

  /* Lab note */
  labNoteWrap: {
    borderRadius: 12, overflow: 'hidden',
    borderWidth: 1.5, borderColor: '#FDE68A',
  },
  labNoteHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 9,
    backgroundColor: '#FFFBEB',
    borderBottomWidth: 1, borderBottomColor: '#FDE68A',
  },
  labNoteTitle: {
    fontSize: 11, fontWeight: '600', fontFamily: F.semibold, color: '#92400E',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  labNoteHint: { fontSize: 10, fontFamily: F.regular, color: '#B45309' },
  labNoteInput: {
    paddingHorizontal: 13, paddingVertical: 11,
    fontSize: 14, fontFamily: F.regular, color: '#0F172A',
    backgroundColor: '#FFFDF5', minHeight: 88,
    textAlignVertical: 'top',
  },
});
