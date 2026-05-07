/**
 * SetupWizardScreen — Yeni lab kurulum sihirbazı (v2)
 *
 * Düzeltmeler v1'e göre:
 *   ✓ Deferred save — veriler adım adım DB'ye yazılmaz, sonunda toplu kaydedilir
 *   ✓ Geri dönünce duplike kayıt oluşmaz
 *   ✓ Dark mode desteği
 *   ✓ Adım geçiş animasyonu (fade + slide)
 *   ✓ Telefon / e-posta format validasyonu
 *   ✓ Hizmet adımında fiyatlar + detay gösterimi
 *   ✓ Mevcut lab bilgileri auto-fill (admin testi için)
 *   ✓ Keyboard dismiss + keyboardAvoidingView
 *   ✓ Tamamlandı ekranında gerçek özet
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  useWindowDimensions, Platform, Animated, KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import {
  Building2, Users, Stethoscope, Tag,
  ChevronRight, ChevronLeft, Check, Sparkles,
  ArrowRight, Phone, Mail, MapPin, User,
  CircleCheck, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react-native';
import { DS } from '../../../core/theme/dsTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import {
  loadExistingData, saveWizardData,
  SERVICE_TEMPLATES, fmtPrice,
} from '../api';
import type { WizardPayload } from '../api';

// ── Design tokens ──────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};
const SANS = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
};
const ACCENT = '#F5C24B';

// ── Step definitions ───────────────────────────────────────────────
const STEPS = [
  { key: 'welcome',   label: 'Hoşgeldin',    icon: Sparkles },
  { key: 'lab',       label: 'Lab Bilgileri', icon: Building2 },
  { key: 'clinic',    label: 'İlk Klinik',   icon: Building2 },
  { key: 'doctor',    label: 'İlk Hekim',    icon: Stethoscope },
  { key: 'employee',  label: 'Ekip',         icon: Users },
  { key: 'services',  label: 'Hizmetler',    icon: Tag },
  { key: 'complete',  label: 'Tamamlandı',   icon: Check },
] as const;

const CONTENT_STEPS = STEPS.filter(s => s.key !== 'welcome' && s.key !== 'complete');

// ── Validation helpers ─────────────────────────────────────────────
function isValidPhone(v: string) {
  if (!v.trim()) return true; // optional
  return /^[0-9\s\-\+\(\)]{7,20}$/.test(v.trim());
}
function isValidEmail(v: string) {
  if (!v.trim()) return true; // optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

// ── Props ──────────────────────────────────────────────────────────
interface Props {
  onComplete: () => void;
}

// ════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════
export function SetupWizardScreen({ onComplete }: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const scrollRef = useRef<ScrollView>(null);

  // ── Theme-aware colors ─────────────────────────────────────────
  const BG   = isDark ? '#0E0E0E' : '#FAF8F2';
  const CARD = isDark ? '#1A1A1A' : '#FFFFFF';
  const INK  = isDark ? '#F5F5F5' : DS.ink[900];
  const INK2 = isDark ? '#BBBBBB' : DS.ink[500];
  const INK3 = isDark ? '#888888' : DS.ink[400];
  const INK4 = isDark ? '#555555' : DS.ink[300];
  const FIELD_BG    = isDark ? '#222222' : DS.ink[50];
  const FIELD_BORDER = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const PILL_BG      = isDark ? '#2A2A2A' : DS.ink[100];
  const PILL_ACTIVE  = isDark ? '#F5F5F5' : DS.ink[900];
  const PILL_TEXT    = isDark ? '#0A0A0A' : '#FFFFFF';
  const CARD_SHADOW  = isDark ? 0 : 0.06;

  const cardSolid = {
    backgroundColor: CARD,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: CARD_SHADOW,
    shadowRadius: 12,
    elevation: isDark ? 0 : 3,
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'transparent',
  };

  // ── State ──────────────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form data — sadece local state, DB'ye yazılmaz (deferred)
  const [ownerName, setOwnerName] = useState('');
  const [lab, setLab] = useState({ name: '', phone: '', email: '', address: '' });
  const [clinic, setClinic] = useState({ name: '', phone: '', contact_person: '', category: 'klinik' });
  const [doctor, setDoctor] = useState({ full_name: '', phone: '', specialty: '' });
  const [employee, setEmployee] = useState({ full_name: '', role: 'teknisyen', phone: '' });
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['Zirkonyum', 'Metal Seramik']);

  // Skipped steps tracking
  const [skippedClinic, setSkippedClinic] = useState(false);
  const [skippedDoctor, setSkippedDoctor] = useState(false);
  const [skippedEmployee, setSkippedEmployee] = useState(false);

  // ── Animation ──────────────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const animateTransition = (direction: 'forward' | 'back', callback: () => void) => {
    const toX = direction === 'forward' ? -30 : 30;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: toX, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      callback();
      slideAnim.setValue(direction === 'forward' ? 30 : -30);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  };

  // ── Auto-fill existing lab data + owner name ───────────────────
  useEffect(() => {
    loadExistingData()
      .then(({ lab: existing, ownerName: name }) => {
        if (name) setOwnerName(name);
        if (existing) {
          setLab({
            name: existing.name || '',
            phone: existing.phone || '',
            email: existing.email || '',
            address: existing.address || '',
          });
        }
      })
      .finally(() => setInitialLoading(false));
  }, []);

  const currentStep = STEPS[step];

  // ── Validation per step ────────────────────────────────────────
  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};

    switch (currentStep.key) {
      case 'lab':
        if (ownerName.trim().length < 2) errs.owner_name = 'Ad soyad en az 2 karakter olmalı';
        if (lab.name.trim().length < 2) errs.lab_name = 'Lab adı en az 2 karakter olmalı';
        if (!isValidPhone(lab.phone)) errs.lab_phone = 'Geçerli bir telefon numarası girin';
        if (!isValidEmail(lab.email)) errs.lab_email = 'Geçerli bir e-posta adresi girin';
        break;
      case 'clinic':
        if (clinic.name.trim().length < 2) errs.clinic_name = 'Klinik adı en az 2 karakter olmalı';
        if (!isValidPhone(clinic.phone)) errs.clinic_phone = 'Geçerli bir telefon numarası girin';
        break;
      case 'doctor':
        if (doctor.full_name.trim().length < 2) errs.doctor_name = 'Hekim adı en az 2 karakter olmalı';
        if (!isValidPhone(doctor.phone)) errs.doctor_phone = 'Geçerli bir telefon numarası girin';
        break;
      case 'employee':
        if (employee.full_name.trim().length < 2) errs.emp_name = 'Ad soyad en az 2 karakter olmalı';
        if (!isValidPhone(employee.phone)) errs.emp_phone = 'Geçerli bir telefon numarası girin';
        break;
      case 'services':
        if (selectedCategories.length === 0) errs.services = 'En az bir kategori seçin';
        break;
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }, [step, ownerName, lab, clinic, doctor, employee, selectedCategories]);

  const canGoNext = useCallback(() => {
    switch (currentStep.key) {
      case 'lab':      return ownerName.trim().length >= 2 && lab.name.trim().length >= 2;
      case 'clinic':   return clinic.name.trim().length >= 2;
      case 'doctor':   return doctor.full_name.trim().length >= 2;
      case 'employee': return employee.full_name.trim().length >= 2;
      case 'services': return selectedCategories.length > 0;
      default:         return true;
    }
  }, [step, ownerName, lab, clinic, doctor, employee, selectedCategories]);

  // ── Navigation ─────────────────────────────────────────────────
  const goNext = async () => {
    setError('');

    // Services adımından sonra → toplu kaydet + complete'e geç
    if (currentStep.key === 'services') {
      if (!validate()) return;
      setSaving(true);
      try {
        const payload: WizardPayload = {
          ownerName: ownerName.trim() || undefined,
          lab,
          clinic: skippedClinic ? undefined : (clinic.name.trim() ? clinic : undefined),
          doctor: skippedDoctor ? undefined : (doctor.full_name.trim() ? doctor : undefined),
          employee: skippedEmployee ? undefined : (employee.full_name.trim() ? employee : undefined),
          serviceCategories: selectedCategories,
        };
        await saveWizardData(payload);
        animateTransition('forward', () => setStep(s => s + 1));
      } catch (e: any) {
        setError(e.message || 'Kayıt sırasında bir hata oluştu');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Diğer adımlar — sadece validate + geç
    if (currentStep.key !== 'welcome' && !validate()) return;

    animateTransition('forward', () => {
      setStep(s => s + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    });
  };

  const goBack = () => {
    if (step > 0) {
      setError('');
      setFieldErrors({});
      animateTransition('back', () => {
        setStep(s => s - 1);
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      });
    }
  };

  const skipStep = () => {
    if (currentStep.key === 'clinic')   setSkippedClinic(true);
    if (currentStep.key === 'doctor')   setSkippedDoctor(true);
    if (currentStep.key === 'employee') setSkippedEmployee(true);

    animateTransition('forward', () => {
      setStep(s => s + 1);
      setFieldErrors({});
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    });
  };

  // ── Loading ────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  // ── Shared props for step components ───────────────────────────
  const theme = { INK, INK2, INK3, INK4, FIELD_BG, FIELD_BORDER, PILL_BG, PILL_ACTIVE, PILL_TEXT, CARD, isDark };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: isDesktop ? 40 : 20,
            paddingBottom: 60,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Card wrapper */}
          <View
            style={[
              cardSolid,
              {
                width: '100%',
                maxWidth: isDesktop ? 560 : undefined,
                padding: isDesktop ? 48 : 28,
                minHeight: isDesktop ? 480 : undefined,
              },
            ]}
          >
            {/* Progress dots */}
            {currentStep.key !== 'welcome' && currentStep.key !== 'complete' && (
              <View style={{ marginBottom: 28 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                  {CONTENT_STEPS.map((s) => {
                    const idx = STEPS.findIndex(st => st.key === s.key);
                    const isActive = idx === step;
                    const isDone = idx < step;
                    return (
                      <View
                        key={s.key}
                        style={{
                          width: isActive ? 32 : 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: isDone ? ACCENT : isActive ? INK : (isDark ? '#444' : DS.ink[200]),
                          // @ts-ignore web
                          transition: 'all 0.3s ease',
                        }}
                      />
                    );
                  })}
                </View>
                <Text style={{ ...SANS, fontSize: 12, fontWeight: '600', color: INK3, textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase' }}>
                  Adım {CONTENT_STEPS.findIndex(s => STEPS.indexOf(s) === step) + 1} / {CONTENT_STEPS.length}
                </Text>
              </View>
            )}

            {/* Animated step content */}
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
              {currentStep.key === 'welcome'  && <WelcomeStep theme={theme} />}
              {currentStep.key === 'lab'      && <LabStep data={lab} onChange={setLab} ownerName={ownerName} onOwnerNameChange={setOwnerName} errors={fieldErrors} theme={theme} />}
              {currentStep.key === 'clinic'   && <ClinicStep data={clinic} onChange={setClinic} errors={fieldErrors} theme={theme} />}
              {currentStep.key === 'doctor'   && <DoctorStep data={doctor} onChange={setDoctor} errors={fieldErrors} theme={theme} />}
              {currentStep.key === 'employee' && <EmployeeStep data={employee} onChange={setEmployee} errors={fieldErrors} theme={theme} />}
              {currentStep.key === 'services' && <ServicesStep selected={selectedCategories} onToggle={setSelectedCategories} errors={fieldErrors} theme={theme} />}
              {currentStep.key === 'complete' && (
                <CompleteStep
                  labName={lab.name}
                  hasClinic={!skippedClinic && !!clinic.name.trim()}
                  hasDoctor={!skippedDoctor && !!doctor.full_name.trim()}
                  hasEmployee={!skippedEmployee && !!employee.full_name.trim()}
                  serviceCount={selectedCategories.reduce((sum, cat) => sum + (SERVICE_TEMPLATES[cat]?.length || 0), 0)}
                  theme={theme}
                />
              )}
            </Animated.View>

            {/* Error */}
            {error ? (
              <View style={{ marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: isDark ? '#3B1111' : '#FEF2F2', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={16} color="#DC2626" strokeWidth={1.8} />
                <Text style={{ ...SANS, fontSize: 13, color: '#DC2626', flex: 1 }}>{error}</Text>
              </View>
            ) : null}

            {/* Navigation buttons */}
            <View style={{ marginTop: 28, gap: 12 }}>
              {currentStep.key === 'complete' ? (
                <Pressable
                  onPress={onComplete}
                  style={{
                    backgroundColor: INK,
                    paddingVertical: 16,
                    borderRadius: 9999,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    // @ts-ignore web
                    cursor: 'pointer',
                  }}
                >
                  <Text style={{ ...SANS, fontSize: 15, fontWeight: '600', color: isDark ? '#0A0A0A' : '#FFFFFF' }}>
                    Panele Git
                  </Text>
                  <ArrowRight size={16} color={isDark ? '#0A0A0A' : '#FFFFFF'} strokeWidth={2} />
                </Pressable>
              ) : (
                <>
                  <Pressable
                    onPress={goNext}
                    disabled={saving}
                    style={{
                      backgroundColor: saving ? INK3 : INK,
                      paddingVertical: 16,
                      borderRadius: 9999,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      opacity: saving ? 0.7 : 1,
                      // @ts-ignore web
                      cursor: 'pointer',
                    }}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={isDark ? '#0A0A0A' : '#FFFFFF'} />
                    ) : (
                      <>
                        <Text style={{ ...SANS, fontSize: 15, fontWeight: '600', color: isDark ? '#0A0A0A' : '#FFFFFF' }}>
                          {currentStep.key === 'welcome' ? 'Başlayalım' : currentStep.key === 'services' ? 'Kurulumu Tamamla' : 'Devam Et'}
                        </Text>
                        <ChevronRight size={16} color={isDark ? '#0A0A0A' : '#FFFFFF'} strokeWidth={2} />
                      </>
                    )}
                  </Pressable>

                  {/* Back + Skip row */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    {step > 0 && currentStep.key !== 'welcome' ? (
                      <Pressable
                        onPress={goBack}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                          paddingVertical: 8, paddingHorizontal: 12,
                          // @ts-ignore web
                          cursor: 'pointer',
                        }}
                      >
                        <ChevronLeft size={14} color={INK3} strokeWidth={2} />
                        <Text style={{ ...SANS, fontSize: 13, color: INK3 }}>Geri</Text>
                      </Pressable>
                    ) : <View />}

                    {['clinic', 'doctor', 'employee'].includes(currentStep.key) && (
                      <Pressable
                        onPress={skipStep}
                        style={{
                          paddingVertical: 8, paddingHorizontal: 12,
                          // @ts-ignore web
                          cursor: 'pointer',
                        }}
                      >
                        <Text style={{ ...SANS, fontSize: 13, color: INK3 }}>Şimdilik Atla →</Text>
                      </Pressable>
                    )}
                  </View>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════
// THEME TYPE
// ════════════════════════════════════════════════════════════════════
interface Theme {
  INK: string; INK2: string; INK3: string; INK4: string;
  FIELD_BG: string; FIELD_BORDER: string;
  PILL_BG: string; PILL_ACTIVE: string; PILL_TEXT: string;
  CARD: string; isDark: boolean;
}

// ════════════════════════════════════════════════════════════════════
// STEP COMPONENTS
// ════════════════════════════════════════════════════════════════════

// ── Welcome ────────────────────────────────────────────────────────
function WelcomeStep({ theme }: { theme: Theme }) {
  return (
    <View style={{ alignItems: 'center', gap: 16 }}>
      <View
        style={{
          width: 72, height: 72, borderRadius: 20,
          backgroundColor: ACCENT + '20',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 8,
        }}
      >
        <Sparkles size={32} color={ACCENT} strokeWidth={1.5} />
      </View>

      <Text style={{ ...DISPLAY, fontSize: 28, letterSpacing: -0.5, color: theme.INK, textAlign: 'center' }}>
        Laboratuvarınızı{'\n'}Kuralım
      </Text>
      <Text style={{ ...SANS, fontSize: 15, color: theme.INK2, textAlign: 'center', lineHeight: 22, maxWidth: 360 }}>
        Birkaç adımda laboratuvarınızı hazırlayın.{'\n'}
        Bilgileri daha sonra istediğiniz zaman değiştirebilirsiniz.
      </Text>

      {/* Feature pills */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 }}>
        {[
          { icon: Building2, label: 'Lab & Klinik' },
          { icon: Stethoscope, label: 'Hekim Tanımla' },
          { icon: Users, label: 'Ekip Oluştur' },
          { icon: Tag, label: 'Hizmet Listesi' },
        ].map(f => (
          <View
            key={f.label}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 12, paddingVertical: 8,
              borderRadius: 9999, backgroundColor: theme.PILL_BG,
            }}
          >
            <f.icon size={13} color={theme.INK2} strokeWidth={1.8} />
            <Text style={{ ...SANS, fontSize: 12, fontWeight: '500', color: theme.INK }}>{f.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Lab Info ───────────────────────────────────────────────────────
function LabStep({ data, onChange, ownerName, onOwnerNameChange, errors, theme }: { data: any; onChange: (d: any) => void; ownerName: string; onOwnerNameChange: (v: string) => void; errors: Record<string, string>; theme: Theme }) {
  return (
    <View style={{ gap: 4 }}>
      <StepHeader icon={Building2} title="Lab Bilgileri" subtitle="Önce kendinizi tanıtın, sonra lab bilgilerini girin" theme={theme} />
      <FormField label="Ad Soyad" placeholder="ör. Ahmet Yılmaz" value={ownerName}
        onChangeText={onOwnerNameChange} required icon={User} error={errors.owner_name} theme={theme} />
      <View style={{ height: 1, backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : '#E8EDF4', marginVertical: 12 }} />
      <FormField label="Laboratuvar Adı" placeholder="ör. Esen Dental Lab" value={data.name}
        onChangeText={(v: string) => onChange({ ...data, name: v })} required icon={Building2} error={errors.lab_name} theme={theme} />
      <FormField label="Telefon" placeholder="ör. 0212 555 00 00" value={data.phone}
        onChangeText={(v: string) => onChange({ ...data, phone: v })} icon={Phone} keyboardType="phone-pad" error={errors.lab_phone} theme={theme} />
      <FormField label="E-posta" placeholder="ör. info@esenlab.com" value={data.email}
        onChangeText={(v: string) => onChange({ ...data, email: v })} icon={Mail} keyboardType="email-address" error={errors.lab_email} theme={theme} />
      <FormField label="Adres" placeholder="ör. Fatih Cd. No:12, Beylikdüzü" value={data.address}
        onChangeText={(v: string) => onChange({ ...data, address: v })} icon={MapPin} theme={theme} />
    </View>
  );
}

// ── Clinic ─────────────────────────────────────────────────────────
function ClinicStep({ data, onChange, errors, theme }: { data: any; onChange: (d: any) => void; errors: Record<string, string>; theme: Theme }) {
  const categories = [
    { key: 'klinik', label: 'Klinik' },
    { key: 'poliklinik', label: 'Poliklinik' },
    { key: 'hastane', label: 'Hastane' },
  ];

  return (
    <View style={{ gap: 4 }}>
      <StepHeader icon={Building2} title="İlk Kliniğiniz" subtitle="İlk müşteri kliniğinizi ekleyin — sonra daha fazla ekleyebilirsiniz" theme={theme} />
      <FormField label="Klinik Adı" placeholder="ör. Gülüş Ağız ve Diş Sağlığı" value={data.name}
        onChangeText={(v: string) => onChange({ ...data, name: v })} required icon={Building2} error={errors.clinic_name} theme={theme} />

      {/* Category pills */}
      <View style={{ marginTop: 4, marginBottom: 8 }}>
        <Text style={{ ...SANS, fontSize: 13, fontWeight: '500', color: theme.INK, marginBottom: 8 }}>Tür</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {categories.map(c => {
            const active = data.category === c.key;
            return (
              <Pressable key={c.key} onPress={() => onChange({ ...data, category: c.key })}
                style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9999,
                  backgroundColor: active ? theme.PILL_ACTIVE : theme.PILL_BG,
                  // @ts-ignore web
                  cursor: 'pointer',
                }}>
                <Text style={{ ...SANS, fontSize: 13, fontWeight: active ? '600' : '400', color: active ? theme.PILL_TEXT : theme.INK }}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FormField label="İletişim Kişisi" placeholder="ör. Dr. Ahmet Yılmaz" value={data.contact_person}
        onChangeText={(v: string) => onChange({ ...data, contact_person: v })} icon={User} theme={theme} />
      <FormField label="Telefon" placeholder="ör. 0212 555 00 00" value={data.phone}
        onChangeText={(v: string) => onChange({ ...data, phone: v })} icon={Phone} keyboardType="phone-pad" error={errors.clinic_phone} theme={theme} />
    </View>
  );
}

// ── Doctor ──────────────────────────────────────────────────────────
function DoctorStep({ data, onChange, errors, theme }: { data: any; onChange: (d: any) => void; errors: Record<string, string>; theme: Theme }) {
  const specialties = ['Protez', 'Endodonti', 'Ortodonti', 'İmplantoloji', 'Estetik', 'Genel'];

  return (
    <View style={{ gap: 4 }}>
      <StepHeader icon={Stethoscope} title="İlk Hekim" subtitle="Kliniğinize bağlı ilk hekimi tanımlayın" theme={theme} />
      <FormField label="Hekim Adı" placeholder="ör. Dr. Ayşe Kaya" value={data.full_name}
        onChangeText={(v: string) => onChange({ ...data, full_name: v })} required icon={User} error={errors.doctor_name} theme={theme} />
      <FormField label="Telefon" placeholder="ör. 0532 555 00 00" value={data.phone}
        onChangeText={(v: string) => onChange({ ...data, phone: v })} icon={Phone} keyboardType="phone-pad" error={errors.doctor_phone} theme={theme} />

      <View style={{ marginTop: 4 }}>
        <Text style={{ ...SANS, fontSize: 13, fontWeight: '500', color: theme.INK, marginBottom: 8 }}>Uzmanlık</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {specialties.map(s => {
            const active = data.specialty === s;
            return (
              <Pressable key={s} onPress={() => onChange({ ...data, specialty: active ? '' : s })}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999,
                  backgroundColor: active ? theme.PILL_ACTIVE : theme.PILL_BG,
                  // @ts-ignore web
                  cursor: 'pointer',
                }}>
                <Text style={{ ...SANS, fontSize: 12, fontWeight: active ? '600' : '400', color: active ? theme.PILL_TEXT : theme.INK }}>{s}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ── Employee ───────────────────────────────────────────────────────
function EmployeeStep({ data, onChange, errors, theme }: { data: any; onChange: (d: any) => void; errors: Record<string, string>; theme: Theme }) {
  const roles = [
    { key: 'teknisyen',     label: 'Teknisyen' },
    { key: 'sef_teknisyen', label: 'Şef Teknisyen' },
    { key: 'muhasebe',      label: 'Muhasebe' },
    { key: 'sekreter',      label: 'Sekreter' },
    { key: 'yonetici',      label: 'Yönetici' },
  ];

  return (
    <View style={{ gap: 4 }}>
      <StepHeader icon={Users} title="Ekibiniz" subtitle="İlk ekip üyenizi ekleyin — sonra daha fazla ekleyebilirsiniz" theme={theme} />
      <FormField label="Ad Soyad" placeholder="ör. Mehmet Demir" value={data.full_name}
        onChangeText={(v: string) => onChange({ ...data, full_name: v })} required icon={User} error={errors.emp_name} theme={theme} />

      <View style={{ marginTop: 4, marginBottom: 8 }}>
        <Text style={{ ...SANS, fontSize: 13, fontWeight: '500', color: theme.INK, marginBottom: 8 }}>Görev</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {roles.map(r => {
            const active = data.role === r.key;
            return (
              <Pressable key={r.key} onPress={() => onChange({ ...data, role: r.key })}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999,
                  backgroundColor: active ? theme.PILL_ACTIVE : theme.PILL_BG,
                  // @ts-ignore web
                  cursor: 'pointer',
                }}>
                <Text style={{ ...SANS, fontSize: 12, fontWeight: active ? '600' : '400', color: active ? theme.PILL_TEXT : theme.INK }}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FormField label="Telefon" placeholder="ör. 0532 555 00 00" value={data.phone}
        onChangeText={(v: string) => onChange({ ...data, phone: v })} icon={Phone} keyboardType="phone-pad" error={errors.emp_phone} theme={theme} />
    </View>
  );
}

// ── Services ───────────────────────────────────────────────────────
function ServicesStep({ selected, onToggle, errors, theme }: {
  selected: string[]; onToggle: (s: string[]) => void;
  errors: Record<string, string>; theme: Theme;
}) {
  const categories = Object.keys(SERVICE_TEMPLATES);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const toggle = (cat: string) => {
    if (selected.includes(cat)) {
      onToggle(selected.filter(c => c !== cat));
    } else {
      onToggle([...selected, cat]);
    }
  };

  const totalServices = selected.reduce(
    (sum, cat) => sum + (SERVICE_TEMPLATES[cat]?.length || 0), 0
  );

  return (
    <View style={{ gap: 4 }}>
      <StepHeader icon={Tag} title="Hizmet Listesi" subtitle="Sunduğunuz hizmet kategorilerini seçin — fiyatları sonra düzenleyebilirsiniz" theme={theme} />

      {errors.services && (
        <Text style={{ ...SANS, fontSize: 12, color: '#DC2626', marginBottom: 4 }}>{errors.services}</Text>
      )}

      <View style={{ gap: 8, marginTop: 8 }}>
        {categories.map(cat => {
          const isSelected = selected.includes(cat);
          const isExpanded = expandedCat === cat;
          const services = SERVICE_TEMPLATES[cat];
          return (
            <View key={cat}>
              <Pressable
                onPress={() => toggle(cat)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  padding: 14, borderRadius: 16,
                  backgroundColor: isSelected ? theme.PILL_ACTIVE : theme.FIELD_BG,
                  borderWidth: 1,
                  borderColor: isSelected ? theme.PILL_ACTIVE : theme.FIELD_BORDER,
                  // @ts-ignore web
                  cursor: 'pointer',
                }}
              >
                <View style={{ width: 24, height: 24, borderRadius: 8,
                  backgroundColor: isSelected ? ACCENT : (theme.isDark ? '#444' : DS.ink[200]),
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {isSelected && <Check size={14} color={DS.ink[900]} strokeWidth={2.5} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...SANS, fontSize: 14, fontWeight: '600', color: isSelected ? theme.PILL_TEXT : theme.INK }}>
                    {cat}
                  </Text>
                  <Text style={{ ...SANS, fontSize: 12, color: isSelected ? (theme.isDark ? '#666' : 'rgba(255,255,255,0.6)') : theme.INK3, marginTop: 2 }}>
                    {services.length} hizmet · {fmtPrice(services.reduce((s, x) => s + x.price, 0) / services.length)} ort.
                  </Text>
                </View>

                {/* Expand/collapse */}
                <Pressable
                  onPress={(e) => { e.stopPropagation?.(); setExpandedCat(isExpanded ? null : cat); }}
                  hitSlop={8}
                  style={{
                    width: 28, height: 28, borderRadius: 8,
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.15)' : theme.PILL_BG,
                    alignItems: 'center', justifyContent: 'center',
                    // @ts-ignore web
                    cursor: 'pointer',
                  }}
                >
                  {isExpanded
                    ? <ChevronUp size={14} color={isSelected ? theme.PILL_TEXT : theme.INK3} strokeWidth={2} />
                    : <ChevronDown size={14} color={isSelected ? theme.PILL_TEXT : theme.INK3} strokeWidth={2} />
                  }
                </Pressable>
              </Pressable>

              {/* Expanded service list */}
              {isExpanded && (
                <View style={{
                  marginTop: 4, marginLeft: 12, marginRight: 12, padding: 12,
                  borderRadius: 12, backgroundColor: theme.FIELD_BG,
                  borderWidth: 1, borderColor: theme.FIELD_BORDER,
                }}>
                  {services.map((svc, i) => (
                    <View key={i} style={{
                      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                      paddingVertical: 8,
                      borderBottomWidth: i < services.length - 1 ? 1 : 0,
                      borderBottomColor: theme.FIELD_BORDER,
                    }}>
                      <Text style={{ ...SANS, fontSize: 13, color: theme.INK, flex: 1 }} numberOfLines={1}>{svc.name}</Text>
                      <Text style={{ ...SANS, fontSize: 13, fontWeight: '600', color: theme.INK2, marginLeft: 12 }}>{fmtPrice(svc.price)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {totalServices > 0 && (
        <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: theme.FIELD_BG }}>
          <Text style={{ ...SANS, fontSize: 13, color: theme.INK2, textAlign: 'center' }}>
            Toplam <Text style={{ fontWeight: '700', color: theme.INK }}>{totalServices}</Text> hizmet eklenecek
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Complete ───────────────────────────────────────────────────────
function CompleteStep({ labName, hasClinic, hasDoctor, hasEmployee, serviceCount, theme }: {
  labName: string; hasClinic: boolean; hasDoctor: boolean; hasEmployee: boolean; serviceCount: number; theme: Theme;
}) {
  const items = [
    { label: `${labName} kuruldu`, color: '#059669', done: true },
    { label: hasClinic ? 'Klinik eklendi' : 'Klinik atlandı', color: hasClinic ? '#2563EB' : theme.INK3, done: hasClinic },
    { label: hasDoctor ? 'Hekim tanımlandı' : 'Hekim atlandı', color: hasDoctor ? '#7C3AED' : theme.INK3, done: hasDoctor },
    { label: hasEmployee ? 'Ekip üyesi eklendi' : 'Ekip atlandı', color: hasEmployee ? '#0EA5E9' : theme.INK3, done: hasEmployee },
    { label: `${serviceCount} hizmet eklendi`, color: '#D97706', done: serviceCount > 0 },
  ];

  return (
    <View style={{ alignItems: 'center', gap: 16 }}>
      <View style={{
        width: 80, height: 80, borderRadius: 24,
        backgroundColor: theme.isDark ? '#0D2818' : '#ECFDF5',
        alignItems: 'center', justifyContent: 'center', marginBottom: 8,
      }}>
        <CircleCheck size={36} color="#059669" strokeWidth={1.5} />
      </View>

      <Text style={{ ...DISPLAY, fontSize: 28, letterSpacing: -0.5, color: theme.INK, textAlign: 'center' }}>
        Kurulum Tamamlandı!
      </Text>
      <Text style={{ ...SANS, fontSize: 15, color: theme.INK2, textAlign: 'center', lineHeight: 22, maxWidth: 340 }}>
        <Text style={{ fontWeight: '600', color: theme.INK }}>{labName}</Text> kullanıma hazır.{'\n'}
        Artık ilk siparişinizi oluşturabilirsiniz.
      </Text>

      {/* Summary — real data */}
      <View style={{ width: '100%', gap: 8, marginTop: 12 }}>
        {items.map(p => (
          <View
            key={p.label}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              paddingHorizontal: 14, paddingVertical: 10,
              borderRadius: 14, backgroundColor: theme.FIELD_BG,
            }}
          >
            <View style={{
              width: 22, height: 22, borderRadius: 7,
              backgroundColor: p.done ? p.color + '18' : 'transparent',
              borderWidth: p.done ? 0 : 1.5,
              borderColor: p.done ? undefined : theme.INK4,
              alignItems: 'center', justifyContent: 'center',
            }}>
              {p.done && <Check size={12} color={p.color} strokeWidth={2.5} />}
            </View>
            <Text style={{
              ...SANS, fontSize: 13, fontWeight: '500',
              color: p.done ? theme.INK : theme.INK3,
              textDecorationLine: p.done ? 'none' : 'line-through',
            }}>
              {p.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ════════════════════════════════════════════════════════════════════

function StepHeader({ icon: Icon, title, subtitle, theme }: { icon: any; title: string; subtitle: string; theme: Theme }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: ACCENT + '20', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} color={ACCENT} strokeWidth={1.8} />
        </View>
        <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.3, color: theme.INK }}>{title}</Text>
      </View>
      <Text style={{ ...SANS, fontSize: 14, color: theme.INK2, lineHeight: 20 }}>{subtitle}</Text>
    </View>
  );
}

function FormField({
  label, placeholder, value, onChangeText, required, icon: Icon, keyboardType, error, theme,
}: {
  label: string; placeholder: string; value: string; onChangeText: (v: string) => void;
  required?: boolean; icon?: any; keyboardType?: string; error?: string; theme: Theme;
}) {
  const hasError = !!error;
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ ...SANS, fontSize: 13, fontWeight: '500', color: theme.INK, marginBottom: 6 }}>
        {label}
        {required && <Text style={{ color: '#DC2626' }}> *</Text>}
      </Text>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: theme.FIELD_BG, borderRadius: 14,
        borderWidth: 1, borderColor: hasError ? '#DC2626' : theme.FIELD_BORDER,
        paddingHorizontal: 14,
      }}>
        {Icon && <Icon size={16} color={hasError ? '#DC2626' : theme.INK3} strokeWidth={1.6} style={{ marginRight: 10 }} />}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.INK4}
          keyboardType={keyboardType as any}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
          style={{
            flex: 1, paddingVertical: 14, fontSize: 14, color: theme.INK,
            // @ts-ignore web
            fontFamily: SANS.fontFamily, outlineStyle: 'none',
          }}
        />
      </View>
      {hasError && (
        <Text style={{ ...SANS, fontSize: 11, color: '#DC2626', marginTop: 4, marginLeft: 4 }}>{error}</Text>
      )}
    </View>
  );
}
