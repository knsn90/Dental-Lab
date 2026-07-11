import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal,
  Pressable, TextInput, Alert, Platform,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronRight, UserPlus, Stethoscope, ChevronDown, Check } from 'lucide-react-native';
import {
  fetchMyClinicDoctors, updateClinicDoctor, inviteClinicDoctor, generateDoctorPassword,
} from '../api';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { toast } from '../../../core/ui/Toast';
import { DS } from '../../../core/theme/dsTokens';
import { titleCaseTR } from '../../../core/utils/textCase';

// Hekim unvan önekleri — sırayla en çok kullanılanlar
const DOCTOR_TITLES = ['Dr.', 'Dt.', 'Uzm. Dr.', 'Doç. Dr.', 'Prof. Dr.', 'Opr. Dr.', 'Yok'] as const;

// ── Patterns design language — ClinicDashboard ile uyumlu ──────────────
const SERIF = { fontFamily: DS.font.display as string, fontWeight: '300' as const };
const P     = DS.clinic.primary;     // #32BB78 emerald
const INK   = DS.ink[900];

interface ClinicDoctor {
  id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  clinic_id: string | null;
  clinic_name: string | null;
}

function initials(name?: string | null) {
  if (!name) return '?';
  // Önekleri (Dr., Dt., Prof. Dr., vs) atlayıp ilk gerçek ad+soyad harflerini al
  const PREFIX_RE = /^(dr|dt|prof|doç|opr|uzm)\.?$/i;
  const words = name.trim().split(/\s+/).filter(w => !PREFIX_RE.test(w));
  return words.slice(0, 2).map(p => p[0]?.toLocaleUpperCase('tr-TR') ?? '').join('') || '?';
}

// Eski kayıtlar lowercase olabilir — display sırasında Title Case'e çevir
function displayDoctorName(name?: string | null): string {
  if (!name) return '—';
  return titleCaseTR(name);
}

export function ClinicDoctorsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuthStore();
  const [doctors,  setDoctors]  = useState<ClinicDoctor[]>([]);
  const [loading,  setLoading]  = useState(true);
  // refreshing kaldırıldı — pull-to-refresh ClinicDashboard ile uyumlu yapılmadı, load() doğrudan tetiklenir
  const [editing, setEditing]   = useState<ClinicDoctor | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await fetchMyClinicDoctors();
    if (!error && data) setDoctors(data as ClinicDoctor[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeCount  = doctors.filter(d => d.is_active).length;
  const passiveCount = doctors.filter(d => !d.is_active).length;

  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' /* klinik bgPage */ }}>
      <View style={{ maxWidth: 1280, width: '100%', alignSelf: 'center', padding: 16, paddingBottom: 80, gap: 14 }}>

        {/* ════════ HERO (ClinicDashboard pattern) ════════ */}
        <View className={`${isDesktop ? 'flex-row justify-between items-end' : ''}`} style={{ gap: 32, paddingTop: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{
              ...SERIF, fontSize: isDesktop ? 56 : 40,
              letterSpacing: -0.025 * (isDesktop ? 56 : 40),
              lineHeight: isDesktop ? 56 : 42, color: INK,
            }}>
              {t('clinic.doctors.pageTitle')}
            </Text>
            <Text style={{ fontSize: 14, color: DS.ink[500], marginTop: 4 }}>
              {t('clinic.doctors.subtitle')}
            </Text>
            <View className="flex-row flex-wrap items-center" style={{ gap: 14, marginTop: 14 }}>
              <StatPill label={t('clinic.doctors.statTotal')} value={`${doctors.length}`} bg={INK} color="#FFF" />
              <StatPill label={t('clinic.doctors.statActive')}  value={`${activeCount}`}  bg={P}    color="#FFF" />
              {passiveCount > 0 && (
                <StatPill label={t('clinic.doctors.statInactive')} value={`${passiveCount}`} bg="rgba(0,0,0,0.08)" color={INK} />
              )}
            </View>
          </View>

          {/* Davet butonu — dashboard'taki accent pill stilinde */}
          <Pressable
            onPress={() => setInviteOpen(true)}
            style={({ hovered }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: hovered ? '#19B06B' : P,
              paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999,
              alignSelf: isDesktop ? 'flex-end' : 'flex-start',
              ...(Platform.OS === 'web' ? {
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(50,187,120,0.3)',
                transition: 'background-color 0.15s',
              } as any : {}),
            })}
          >
            <UserPlus size={15} color="#FFFFFF" strokeWidth={2} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.1 }}>
              {t('clinic.doctors.inviteBtn')}
            </Text>
          </Pressable>
        </View>

        {/* ════════ LİSTE veya BOŞ DURUM ════════ */}
        {doctors.length === 0 && !loading ? (
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 18,
            borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
            padding: 40, alignItems: 'center', gap: 10,
            ...(Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' } as any : {}),
          }}>
            <View style={{
              width: 56, height: 56, borderRadius: 16,
              backgroundColor: `${P}18`, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: `${P}30`,
            }}>
              <Stethoscope size={24} color={P} strokeWidth={1.6} />
            </View>
            <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: INK, marginTop: 4 }}>
              {t('clinic.doctors.emptyTitle')}
            </Text>
            <Text style={{ fontSize: 13, color: DS.ink[500], textAlign: 'center', maxWidth: 360, lineHeight: 19 }}>
              {t('clinic.doctors.emptyDesc')}
            </Text>
          </View>
        ) : (
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 18,
            borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
            overflow: 'hidden',
            ...(Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' } as any : {}),
          }}>
            {doctors.map((d, i) => (
              <Pressable
                key={d.id}
                onPress={() => setEditing(d)}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 20, paddingVertical: 14,
                  borderBottomWidth: i < doctors.length - 1 ? 1 : 0,
                  borderBottomColor: 'rgba(0,0,0,0.05)',
                  backgroundColor: hovered ? 'rgba(50,187,120,0.05)' : '#FFFFFF',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.12s' } as any : {}),
                })}
              >
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: d.is_active ? P : '#CBD5E1',
                }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>
                    {initials(d.full_name)}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: INK }} numberOfLines={1}>
                    {displayDoctorName(d.full_name)}
                  </Text>
                  {d.phone ? (
                    <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 2 }} numberOfLines={1}>
                      {d.phone}
                    </Text>
                  ) : null}
                </View>
                {!d.is_active && (
                  <View style={{ backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: DS.ink[400], letterSpacing: 0.8 }}>
                      PASİF
                    </Text>
                  </View>
                )}
                <ChevronRight size={18} color="#CBD5E1" strokeWidth={1.6} />
              </Pressable>
            ))}
          </View>
        )}

      </View>

      {/* Hekim ekle/düzenle — comprehensive modal */}
      <DoctorFormModal
        visible={inviteOpen || !!editing}
        editingDoctor={editing as any}
        clinicId={profile?.clinic_id ?? null}
        clinicName={profile?.clinic_name ?? null}
        onClose={() => { setEditing(null); setInviteOpen(false); }}
        onSaved={() => { setEditing(null); setInviteOpen(false); load(); }}
      />
    </View>
  );
}

// ── StatPill — ClinicDashboard ile aynı bileşen ─────────────────────────
function StatPill({ label, value, bg, color }: { label: string; value: string; bg: string; color: string }) {
  return (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <Text style={{ fontSize: 11, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.66 }}>{label}</Text>
      <View className="rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 3, backgroundColor: bg }}>
        <Text style={{ fontSize: 11, fontWeight: '500', color }}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Edit Modal ────────────────────────────────────────────────────────────
function DoctorEditModal({
  doctor, onClose, onSaved,
}: {
  doctor: ClinicDoctor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (doctor) {
      setPhone(doctor.phone ?? '');
      setActive(doctor.is_active);
    }
  }, [doctor]);

  if (!doctor) return null;

  const handleSave = async () => {
    setSaving(true);
    const { error } = await updateClinicDoctor(doctor.id, {
      phone: phone.trim() || null,
      is_active: active,
    });
    setSaving(false);
    if (error) { toast.error((error as any).message ?? t('clinic.doctors.toast.updateError')); return; }
    toast.success(t('clinic.doctors.toast.updated'));
    onSaved();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.header}>
            <Text style={m.title}>{t('clinic.doctors.modal.editTitle')}</Text>
            <TouchableOpacity onPress={onClose} style={m.closeBtn}>
              <Text style={{ fontSize: 18, color: '#475569' }}>×</Text>
            </TouchableOpacity>
          </View>

          <View style={{ padding: 18, gap: 14 }}>
            {/* İsim (read-only) */}
            <View style={m.row}>
              <View style={[m.avatar, { backgroundColor: P }]}>
                <Text style={m.avatarText}>{initials(doctor.full_name)}</Text>
              </View>
              <View>
                <Text style={m.docName}>{displayDoctorName(doctor.full_name)}</Text>
                <Text style={m.docHint}>{t('clinic.doctors.modal.editNameHint')}</Text>
              </View>
            </View>

            {/* Telefon */}
            <View>
              <Text style={m.label}>{t('clinic.doctors.modal.phone')}</Text>
              <TextInput
                style={m.input}
                value={phone}
                onChangeText={setPhone}
                placeholder={t('clinic.doctors.modal.phonePlaceholder')}
                keyboardType="phone-pad"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Aktif toggle */}
            <View style={m.toggleRow}>
              <View>
                <Text style={m.toggleLabel}>{t('clinic.doctors.modal.active')}</Text>
                <Text style={m.toggleHint}>{t('clinic.doctors.modal.activeHint')}</Text>
              </View>
              <TouchableOpacity
                style={[m.toggle, active && m.toggleActive]}
                onPress={() => setActive(v => !v)}
                activeOpacity={0.8}
              >
                <View style={[m.toggleKnob, active && m.toggleKnobActive]} />
              </TouchableOpacity>
            </View>

            {active && doctor.is_active === false && (
              <Text style={m.warn}>⚠️ {t('clinic.doctors.modal.reactivateWarning')}</Text>
            )}
          </View>

          <View style={m.footer}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose}>
              <Text style={m.cancelText}>{t('clinic.doctors.modal.cancelBtn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[m.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              <Text style={m.saveText}>{saving ? t('clinic.doctors.modal.savingBtn') : t('clinic.doctors.modal.saveBtn')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Invite Modal ──────────────────────────────────────────────────────────
function InviteDoctorModal({
  visible, clinicId, clinicName, onClose, onSaved,
}: {
  visible: boolean;
  clinicId: string | null;
  clinicName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState<string>('Dr.');
  const [titleOpen, setTitleOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState(() => generateDoctorPassword());
  const [showPwd, setShowPwd] = useState(true);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy]   = useState(false);

  const handleSend = async () => {
    if (!clinicId) { toast.error(t('clinic.doctors.validation.clinicLoadError')); return; }
    if (!email.trim() || !name.trim()) {
      toast.error(t('clinic.doctors.validation.nameEmailRequired'));
      return;
    }
    if (password.length < 8) {
      toast.error(t('clinic.doctors.validation.passwordLength'));
      return;
    }
    setBusy(true);
    try {
      // Hekim adını Title Case'e çevir + unvan önekini ekle (Yok seçiliyse önek yok)
      const cleanName = titleCaseTR(name);
      const fullName = title && title !== 'Yok' ? `${title} ${cleanName}` : cleanName;
      const res = await inviteClinicDoctor({
        email:       email.trim().toLowerCase(),
        full_name:   fullName,
        phone:       phone.trim() || undefined,
        clinic_id:   clinicId,
        clinic_name: clinicName ?? undefined,
        password,
      });
      console.log('[InviteDoctor] response:', res);
      const { data, error } = res;
      const errMsg = (error as any)?.message ?? (data as any)?.error;
      if (error || errMsg) {
        Alert.alert(t('clinic.doctors.alert.createError'), errMsg ?? t('clinic.doctors.toast.createError') + '.');
        toast.error(errMsg ?? t('clinic.doctors.toast.createError'));
        return;
      }
      if (!(data as any)?.success && !(data as any)?.userId) {
        const msg = t('clinic.doctors.alert.unexpectedResponse');
        Alert.alert(t('clinic.doctors.alert.createError'), msg);
        toast.error(msg);
        return;
      }
      // Başarı — şifreyi göster (kullanıcı paylaşacak)
      setCreated({ email: email.trim(), password });
      toast.success(t('clinic.doctors.toast.created'));
      onSaved();
    } catch (e: any) {
      const msg = e?.message ?? t('clinic.doctors.alert.unexpectedError');
      console.warn('[InviteDoctor] exception:', e);
      Alert.alert(t('clinic.doctors.alert.createError'), msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    setTitle('Dr.'); setTitleOpen(false); setEmail(''); setName(''); setPhone(''); setCreated(null);
    setPassword(generateDoctorPassword());
    onClose();
  };

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== 'undefined' && (navigator as any).clipboard) {
      (navigator as any).clipboard.writeText(text).then(() => toast.success(t('clinic.doctors.toast.copied')));
    }
  };

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.header}>
            <Text style={m.title}>{created ? t('clinic.doctors.modal.createdTitle') : t('clinic.doctors.modal.createTitle')}</Text>
            <TouchableOpacity onPress={handleClose} style={m.closeBtn}>
              <Text style={{ fontSize: 18, color: '#475569' }}>×</Text>
            </TouchableOpacity>
          </View>

          {created ? (
            <View style={{ padding: 18, gap: 14 }}>
              <View style={{ padding: 14, backgroundColor: '#ECFDF5', borderRadius: 10, borderWidth: 1, borderColor: '#A7F3D0' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#065F46', marginBottom: 8 }}>
                  ✓ {t('clinic.doctors.modal.successTitle')}
                </Text>
                <Text style={{ fontSize: 11, color: '#065F46', lineHeight: 16 }}>
                  {t('clinic.doctors.modal.successDesc')}
                </Text>
              </View>
              <View>
                <Text style={m.label}>E-posta</Text>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TextInput style={[m.input, { flex: 1, fontFamily: 'monospace' as any }]} value={created.email} editable={false} />
                  <TouchableOpacity onPress={() => copyToClipboard(created.email)} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1' }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#0F172A' }}>{t('clinic.doctors.modal.copyBtn')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View>
                <Text style={m.label}>Şifre</Text>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TextInput style={[m.input, { flex: 1, fontFamily: 'monospace' as any, fontSize: 14, fontWeight: '700' }]} value={created.password} editable={false} />
                  <TouchableOpacity onPress={() => copyToClipboard(created.password)} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, backgroundColor: '#0F172A' }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>{t('clinic.doctors.modal.copyBtn')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity onPress={() => copyToClipboard(`E-posta: ${created.email}\nŞifre: ${created.password}\nGiriş: https://www.nexadent.net`)} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#2563EB' }}>{t('clinic.doctors.modal.copyBothBtn')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ padding: 18, gap: 14 }}>
              {/* Unvan dropdown */}
              <View style={{ position: 'relative', zIndex: 20 }}>
                <Text style={m.label}>{t('clinic.doctors.modal.titleLabel')}</Text>
                <Pressable
                  onPress={() => setTitleOpen(v => !v)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
                    paddingHorizontal: 12, paddingVertical: 11, backgroundColor: '#FFFFFF',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Text style={{ fontSize: 14, color: '#0F172A', fontWeight: '500' }}>{title}</Text>
                  <ChevronDown size={16} color="#94A3B8" strokeWidth={1.8} />
                </Pressable>
                {titleOpen && (
                  <View style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                    backgroundColor: '#FFFFFF', borderRadius: 10,
                    borderWidth: 1, borderColor: '#E2E8F0',
                    overflow: 'hidden', zIndex: 30,
                    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.12)' } as any : {}),
                  }}>
                    {DOCTOR_TITLES.map((t, i) => {
                      const active = title === t;
                      return (
                        <Pressable
                          key={t}
                          onPress={() => { setTitle(t); setTitleOpen(false); }}
                          style={({ hovered }: any) => ({
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                            paddingHorizontal: 12, paddingVertical: 10,
                            borderBottomWidth: i < DOCTOR_TITLES.length - 1 ? 1 : 0,
                            borderBottomColor: '#F1F5F9',
                            backgroundColor: hovered ? '#F8FAFC' : (active ? `${P}10` : '#FFFFFF'),
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                          })}
                        >
                          <Text style={{ fontSize: 14, color: active ? P : '#0F172A', fontWeight: active ? '700' : '500' }}>
                            {t}
                          </Text>
                          {active && <Check size={14} color={P} strokeWidth={2.2} />}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              <View>
                <Text style={m.label}>{t('clinic.doctors.modal.nameLabel')}</Text>
                <TextInput
                  style={m.input}
                  value={name}
                  onChangeText={setName}
                  onBlur={() => setName(prev => titleCaseTR(prev))}
                  placeholder={t('clinic.doctors.modal.namePlaceholder')}
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="words"
                />
                {name.trim() && (
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 4, fontStyle: 'italic' }}>
                    {t('clinic.doctors.modal.willAppear')} <Text style={{ fontWeight: '600', color: '#0F172A' }}>
                      {title && title !== 'Yok' ? `${title} ${titleCaseTR(name)}` : titleCaseTR(name)}
                    </Text>
                  </Text>
                )}
              </View>
              <View>
                <Text style={m.label}>{t('clinic.doctors.modal.emailLabel')}</Text>
                <TextInput style={m.input} value={email} onChangeText={setEmail}
                  placeholder={t('clinic.doctors.modal.emailPlaceholder')} placeholderTextColor="#94A3B8"
                  keyboardType="email-address" autoCapitalize="none" />
              </View>
              <View>
                <Text style={m.label}>{t('clinic.doctors.modal.phoneLabel')}</Text>
                <TextInput style={m.input} value={phone} onChangeText={setPhone}
                  placeholder={t('clinic.doctors.modal.phonePlaceholder')} placeholderTextColor="#94A3B8" keyboardType="phone-pad" />
              </View>
              <View>
                <Text style={m.label}>{t('clinic.doctors.modal.passwordLabel')}</Text>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TextInput
                    style={[m.input, { flex: 1, fontFamily: 'monospace' as any }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t('clinic.doctors.modal.passwordPlaceholder')}
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showPwd}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowPwd(v => !v)} style={{ paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8, backgroundColor: '#F1F5F9' }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#475569' }}>{showPwd ? t('clinic.doctors.modal.hideBtn') : t('clinic.doctors.modal.showBtn')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setPassword(generateDoctorPassword())} style={{ paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8, backgroundColor: '#0F172A' }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#FFFFFF' }}>{t('clinic.doctors.modal.refreshBtn')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={m.hint}>
                {t('clinic.doctors.modal.createHint')}
              </Text>
            </View>
          )}

          <View style={m.footer}>
            {created ? (
              <TouchableOpacity style={[m.saveBtn, { flex: 1 }]} onPress={handleClose}>
                <Text style={m.saveText}>{t('clinic.doctors.modal.okBtn')}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={m.cancelBtn} onPress={handleClose}>
                  <Text style={m.cancelText}>{t('clinic.doctors.modal.cancelBtn')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[m.saveBtn, busy && { opacity: 0.6 }]} onPress={handleSend} disabled={busy}>
                  <Text style={m.saveText}>{busy ? t('clinic.doctors.modal.creatingBtn') : t('clinic.doctors.modal.createBtn')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles (sadece modaller için — ana ekran ResponsiveCanvas + HeroX + KPICardX) ──
const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet:   { width: '100%', maxWidth: 460, backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden' },
  header:  { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title:   { flex: 1, fontSize: 16, fontWeight: '800', color: '#0F172A' },
  closeBtn:{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },

  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 12 },
  avatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  docName:    { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  docHint:    { fontSize: 11, color: '#94A3B8', marginTop: 2 },

  label:   { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  input:   { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F172A', backgroundColor: '#FFFFFF' },
  hint:    { fontSize: 12, color: '#64748B', lineHeight: 18 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 12 },
  toggleLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A', flex: 1 },
  toggleHint:  { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  toggle: { width: 42, height: 24, borderRadius: 12, padding: 2, backgroundColor: '#E2E8F0' },
  toggleActive: { backgroundColor: '#16A34A' },
  toggleKnob:   { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
  toggleKnobActive: { transform: [{ translateX: 18 }] },

  warn: { fontSize: 12, color: '#D97706', fontWeight: '600' },

  footer:    { flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  cancelText:{ fontSize: 14, fontWeight: '600', color: '#475569' },
  saveBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 10, backgroundColor: P },
  saveText:  { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});

// ════════════════════════════════════════════════════════════════════════
// DoctorFormModal — comprehensive hekim ekle/düzenle modal
// (mevcut DoctorEditModal + InviteDoctorModal'ı tek yere topladı)
// ════════════════════════════════════════════════════════════════════════

const DENTAL_SPECIALTIES = [
  'Genel Diş Hekimliği', 'Ortodonti', 'Ağız, Diş, Çene Cerrahisi', 'Endodonti',
  'Periodontoloji', 'Pedodonti', 'Protetik Diş Tedavisi', 'Restoratif Diş Tedavisi',
  'Oral Diagnoz & Radyoloji', 'İmplantoloji', 'Estetik Diş Hekimliği', 'Diğer',
] as const;

interface DoctorFormState {
  title: string;
  full_name: string;
  phone: string;
  specialty: string;
  tckn: string;
  notes: string;
  is_active: boolean;
  email: string;
  password: string;
}

const EMPTY_DOCTOR_FORM: DoctorFormState = {
  title: 'Dr.', full_name: '', phone: '', specialty: '', tckn: '',
  notes: '', is_active: true, email: '', password: '',
};

function DoctorFormModal({
  visible, editingDoctor, clinicId, clinicName, onClose, onSaved,
}: {
  visible: boolean;
  editingDoctor: ClinicDoctor | null;
  clinicId: string | null;
  clinicName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<DoctorFormState>(EMPTY_DOCTOR_FORM);
  const [titleOpen, setTitleOpen] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [specSearch, setSpecSearch] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  // Edit modunda full doctor row'u çek (specialty, tckn, notes vs.)
  useEffect(() => {
    if (!visible) return;
    if (!editingDoctor) {
      setForm({ ...EMPTY_DOCTOR_FORM, password: generateDoctorPassword() });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('doctors')
        .select('full_name, phone, specialty, tckn, notes, is_active')
        .eq('id', editingDoctor.id)
        .maybeSingle();
      const row: any = data ?? {};
      const nameRaw: string = row.full_name ?? editingDoctor.full_name ?? '';
      const titleMatch = nameRaw.match(/^(Prof\.?\s*Dr\.?|Doç\.?\s*Dr\.?|Uzm\.?\s*Dr\.?|Opr\.?\s*Dr\.?|Dr\.?|Dt\.?)\s+/i);
      const detectedTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').replace(/\.?$/, '.') : 'Yok';
      const stripped = titleMatch ? nameRaw.slice(titleMatch[0].length) : nameRaw;
      const normalizedTitle = (DOCTOR_TITLES as readonly string[]).includes(detectedTitle) ? detectedTitle : 'Yok';
      setForm({
        title: normalizedTitle,
        full_name: stripped,
        phone: row.phone ?? '',
        specialty: row.specialty ?? '',
        tckn: row.tckn ?? '',
        notes: row.notes ?? '',
        is_active: row.is_active ?? true,
        email: '', password: '',
      });
    })();
  }, [editingDoctor, visible]);

  const set = <K extends keyof DoctorFormState>(k: K, v: DoctorFormState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!clinicId) { toast.error(t('clinic.doctors.validation.clinicLoadError')); return; }
    const cleanName = titleCaseTR(form.full_name);
    if (!cleanName.trim()) { toast.error(t('clinic.doctors.validation.nameRequired')); return; }
    const tcknTrim = form.tckn.trim();
    if (tcknTrim && tcknTrim.length !== 11) { toast.error(t('clinic.doctors.validation.tcknLength')); return; }

    const wantsAuth = !editingDoctor && (form.email.trim().length > 0 || form.password.length > 0);
    if (wantsAuth) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { toast.error(t('clinic.doctors.validation.emailInvalid')); return; }
      if (form.password.length < 8) { toast.error(t('clinic.doctors.validation.passwordLength')); return; }
    }

    const fullName = form.title && form.title !== 'Yok' ? `${form.title} ${cleanName}` : cleanName;

    setSaving(true);
    try {
      const payload = {
        full_name: fullName,
        phone: form.phone.trim() || null,
        specialty: form.specialty.trim() || null,
        tckn: tcknTrim || null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
        clinic_id: clinicId,
      };

      if (editingDoctor) {
        const { error } = await supabase.from('doctors').update(payload).eq('id', editingDoctor.id);
        if (error) { toast.error(error.message); return; }
        toast.success(t('clinic.doctors.toast.updated'));
        onSaved();
        return;
      }

      const { error: insertErr } = await supabase.from('doctors').insert(payload);
      if (insertErr) { toast.error(insertErr.message); return; }

      if (wantsAuth) {
        const res = await inviteClinicDoctor({
          email: form.email.trim().toLowerCase(),
          full_name: fullName,
          phone: form.phone.trim() || undefined,
          clinic_id: clinicId,
          clinic_name: clinicName ?? undefined,
          password: form.password,
        });
        const { data, error } = res;
        const errMsg = (error as any)?.message ?? (data as any)?.error;
        if (error || errMsg) {
          Alert.alert(t('clinic.doctors.alert.partialSuccess'), errMsg ?? '');
          onSaved();
          return;
        }
        setCreated({ email: form.email.trim(), password: form.password });
        toast.success(t('clinic.doctors.toast.fullSuccess'));
        return;
      }

      toast.success(t('clinic.doctors.toast.added'));
      onSaved();
    } catch (e: any) {
      Alert.alert(t('clinic.doctors.alert.saveFailed'), e?.message ?? t('clinic.doctors.alert.unexpectedError'));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setForm({ ...EMPTY_DOCTOR_FORM, password: generateDoctorPassword() });
    setTitleOpen(false); setSpecOpen(false); setSpecSearch(''); setShowPwd(false); setCreated(null);
    onClose();
  };

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== 'undefined' && (navigator as any).clipboard) {
      (navigator as any).clipboard.writeText(text).then(() => toast.success(t('clinic.doctors.toast.copied')));
    }
  };

  if (!visible) return null;

  const specFiltered = DENTAL_SPECIALTIES.filter(s =>
    s.toLowerCase().includes(specSearch.toLowerCase()),
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
      <View style={m.overlay}>
        <View style={[m.sheet, { maxWidth: 540 }]}>
          <View style={m.header}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: P, letterSpacing: 1.0, textTransform: 'uppercase' }}>{t('clinic.doctors.modal.kicker')}</Text>
              <Text style={{ ...SERIF, fontSize: 22, color: INK, letterSpacing: -0.4, lineHeight: 26, marginTop: 2 }}>
                {created ? t('clinic.doctors.modal.createdTitle') : (editingDoctor ? t('clinic.doctors.modal.editTitle') : t('clinic.doctors.modal.addTitle'))}
              </Text>
            </View>
            <Pressable onPress={handleClose} style={m.closeBtn}>
              <Text style={{ fontSize: 18, color: '#475569' }}>×</Text>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 540 }} contentContainerStyle={{ padding: 18, gap: 14 }} showsVerticalScrollIndicator={false}>
            {created ? (
              <View style={{ gap: 14 }}>
                <View style={{ padding: 14, backgroundColor: '#ECFDF5', borderRadius: 10, borderWidth: 1, borderColor: '#A7F3D0' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#065F46', marginBottom: 6 }}>✓ {t('clinic.doctors.modal.successMsg')}</Text>
                  <Text style={{ fontSize: 11, color: '#065F46', lineHeight: 16 }}>
                    {t('clinic.doctors.modal.successDesc')}
                  </Text>
                </View>
                <View>
                  <Text style={m.label}>E-posta</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TextInput style={[m.input, { flex: 1, fontFamily: 'monospace' as any }]} value={created.email} editable={false} />
                    <Pressable onPress={() => copyToClipboard(created.email)} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, backgroundColor: '#F1F5F9' }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#0F172A' }}>{t('clinic.doctors.modal.copyBtn')}</Text>
                    </Pressable>
                  </View>
                </View>
                <View>
                  <Text style={m.label}>Şifre</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TextInput style={[m.input, { flex: 1, fontFamily: 'monospace' as any, fontWeight: '700' }]} value={created.password} editable={false} />
                    <Pressable onPress={() => copyToClipboard(created.password)} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, backgroundColor: '#0F172A' }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>{t('clinic.doctors.modal.copyBtn')}</Text>
                    </Pressable>
                  </View>
                </View>
                <Pressable
                  onPress={() => copyToClipboard(`E-posta: ${created.email}\nŞifre: ${created.password}\nGiriş: https://www.nexadent.net`)}
                  style={{ alignSelf: 'flex-start', paddingVertical: 6 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#2563EB' }}>{t('clinic.doctors.modal.copyBothBtn')}</Text>
                </Pressable>
                <Pressable onPress={() => { setCreated(null); onSaved(); }} style={{ height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: P, marginTop: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>{t('clinic.doctors.modal.okBtn')}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 14 }}>
                {/* Unvan dropdown */}
                <View style={{ position: 'relative', zIndex: 30 }}>
                  <Text style={m.label}>{t('clinic.doctors.modal.titleLabel')}</Text>
                  <Pressable
                    onPress={() => { setTitleOpen(v => !v); setSpecOpen(false); }}
                    style={[m.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  >
                    <Text style={{ fontSize: 14, color: '#0F172A', fontWeight: '500' }}>{form.title}</Text>
                    <ChevronDown size={16} color="#94A3B8" strokeWidth={1.8} />
                  </Pressable>
                  {titleOpen && (
                    <View style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                      backgroundColor: '#FFF', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0',
                      overflow: 'hidden', zIndex: 40,
                      ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.12)' } as any : {}),
                    }}>
                      {DOCTOR_TITLES.map((t, i) => {
                        const active = form.title === t;
                        return (
                          <Pressable
                            key={t}
                            onPress={() => { set('title', t); setTitleOpen(false); }}
                            style={({ hovered }: any) => ({
                              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                              paddingHorizontal: 12, paddingVertical: 10,
                              borderBottomWidth: i < DOCTOR_TITLES.length - 1 ? 1 : 0, borderBottomColor: '#F1F5F9',
                              backgroundColor: hovered ? '#F8FAFC' : (active ? `${P}10` : '#FFF'),
                            })}
                          >
                            <Text style={{ fontSize: 14, color: active ? P : '#0F172A', fontWeight: active ? '700' : '500' }}>{t}</Text>
                            {active && <Check size={14} color={P} strokeWidth={2.2} />}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Ad Soyad */}
                <View>
                  <Text style={m.label}>{t('clinic.doctors.modal.nameLabel')}</Text>
                  <TextInput
                    style={m.input}
                    value={form.full_name}
                    onChangeText={v => set('full_name', v)}
                    onBlur={() => set('full_name', titleCaseTR(form.full_name))}
                    placeholder={t('clinic.doctors.modal.namePlaceholder')}
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="words"
                  />
                  {form.full_name.trim() && (
                    <Text style={{ fontSize: 11, color: '#64748B', marginTop: 4, fontStyle: 'italic' }}>
                      {t('clinic.doctors.modal.willAppear')} <Text style={{ fontWeight: '600', color: INK }}>
                        {form.title && form.title !== 'Yok' ? `${form.title} ${titleCaseTR(form.full_name)}` : titleCaseTR(form.full_name)}
                      </Text>
                    </Text>
                  )}
                </View>

                {/* Uzmanlık dropdown */}
                <View style={{ position: 'relative', zIndex: 20 }}>
                  <Text style={m.label}>Uzmanlık</Text>
                  <Pressable
                    onPress={() => { setSpecOpen(v => !v); setTitleOpen(false); }}
                    style={[m.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  >
                    <Text style={{ fontSize: 14, color: form.specialty ? '#0F172A' : '#94A3B8', fontWeight: '500' }}>
                      {form.specialty || 'Seçiniz'}
                    </Text>
                    <ChevronDown size={16} color="#94A3B8" strokeWidth={1.8} />
                  </Pressable>
                  {specOpen && (
                    <View style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                      backgroundColor: '#FFF', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0',
                      overflow: 'hidden', zIndex: 25, maxHeight: 240,
                      ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.12)' } as any : {}),
                    }}>
                      <TextInput
                        value={specSearch}
                        onChangeText={setSpecSearch}
                        placeholder="Ara…"
                        placeholderTextColor="#94A3B8"
                        style={{
                          paddingHorizontal: 12, paddingVertical: 10, fontSize: 13,
                          borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
                          // @ts-ignore web
                          outlineWidth: 0,
                        }}
                      />
                      {specFiltered.map((s, i) => {
                        const active = form.specialty === s;
                        return (
                          <Pressable
                            key={s}
                            onPress={() => { set('specialty', s); setSpecOpen(false); setSpecSearch(''); }}
                            style={({ hovered }: any) => ({
                              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                              paddingHorizontal: 12, paddingVertical: 9,
                              borderBottomWidth: i < specFiltered.length - 1 ? 1 : 0, borderBottomColor: '#F1F5F9',
                              backgroundColor: hovered ? '#F8FAFC' : (active ? `${P}10` : '#FFF'),
                            })}
                          >
                            <Text style={{ fontSize: 13, color: active ? P : '#0F172A', fontWeight: active ? '700' : '500' }}>{s}</Text>
                            {active && <Check size={13} color={P} strokeWidth={2.2} />}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Telefon + TCKN */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={m.label}>{t('clinic.doctors.modal.phoneLabel')}</Text>
                    <TextInput style={m.input} value={form.phone} onChangeText={v => set('phone', v)} placeholder="0555 000 00 00" placeholderTextColor="#94A3B8" keyboardType="phone-pad" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={m.label}>TCKN</Text>
                    <TextInput style={m.input} value={form.tckn} onChangeText={v => set('tckn', v.replace(/[^0-9]/g, ''))} placeholder="11 hane" placeholderTextColor="#94A3B8" keyboardType="number-pad" maxLength={11} />
                  </View>
                </View>

                {/* Notlar */}
                <View>
                  <Text style={m.label}>Notlar</Text>
                  <TextInput
                    style={[m.input, { minHeight: 60, textAlignVertical: 'top' as any }]}
                    value={form.notes}
                    onChangeText={v => set('notes', v)}
                    placeholder="İsteğe bağlı notlar…"
                    placeholderTextColor="#94A3B8"
                    multiline
                    numberOfLines={3}
                  />
                </View>

                {/* Aktif toggle */}
                <View style={m.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={m.toggleLabel}>{t('clinic.doctors.modal.active')}</Text>
                    <Text style={m.toggleHint}>{t('clinic.doctors.modal.activeHint')}</Text>
                  </View>
                  <Pressable
                    style={[m.toggle, form.is_active && m.toggleActive]}
                    onPress={() => set('is_active', !form.is_active)}
                  >
                    <View style={[m.toggleKnob, form.is_active && m.toggleKnobActive]} />
                  </Pressable>
                </View>

                {/* Giriş hesabı (sadece yeni hekim) */}
                {!editingDoctor && (
                  <View style={{ marginTop: 4, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', gap: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      {t('clinic.doctors.modal.loginSection')}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#64748B', lineHeight: 16, marginTop: -6 }}>
                      {t('clinic.doctors.modal.loginHint')}
                    </Text>
                    <View>
                      <Text style={m.label}>{t('clinic.doctors.modal.emailLabel')}</Text>
                      <TextInput style={m.input} value={form.email} onChangeText={v => set('email', v)} placeholder={t('clinic.doctors.modal.emailPlaceholder')} placeholderTextColor="#94A3B8" keyboardType="email-address" autoCapitalize="none" />
                    </View>
                    <View>
                      <Text style={m.label}>{t('clinic.doctors.modal.passwordLabel')}</Text>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <TextInput
                          style={[m.input, { flex: 1, fontFamily: 'monospace' as any }]}
                          value={form.password}
                          onChangeText={v => set('password', v)}
                          placeholder={t('clinic.doctors.modal.passwordPlaceholder')}
                          placeholderTextColor="#94A3B8"
                          secureTextEntry={!showPwd}
                          autoCapitalize="none"
                        />
                        <Pressable onPress={() => setShowPwd(v => !v)} style={{ paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8, backgroundColor: '#F1F5F9' }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#475569' }}>{showPwd ? t('clinic.doctors.modal.hideBtn') : t('clinic.doctors.modal.showBtn')}</Text>
                        </Pressable>
                        <Pressable onPress={() => set('password', generateDoctorPassword())} style={{ paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8, backgroundColor: '#0F172A' }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#FFF' }}>{t('clinic.doctors.modal.refreshBtn')}</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {!created && (
            <View style={m.footer}>
              <Pressable style={m.cancelBtn} onPress={handleClose}>
                <Text style={m.cancelText}>{t('clinic.doctors.modal.cancelBtn')}</Text>
              </Pressable>
              <Pressable style={[m.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                <Text style={m.saveText}>{saving ? t('clinic.doctors.modal.savingBtn') : (editingDoctor ? t('clinic.doctors.modal.saveBtn') : t('clinic.doctors.modal.addBtn'))}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

