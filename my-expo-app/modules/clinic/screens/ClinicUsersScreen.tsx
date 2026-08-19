/**
 * ClinicUsersScreen — klinik panelinde tüm kullanıcıları yönetir.
 *
 * Roller:
 *  • doctor             — Hekim
 *  • clinic_secretary   — Sekreter
 *  • clinic_admin       — Klinik Yöneticisi (ikinci yönetici dahil)
 *
 * Her rol için fine-grained yetkiler `profiles.clinic_permissions` JSONB'sinde saklanır.
 * Davet flow: admin-create-user edge fn → auth.users + profiles + (doctor ise) doctors.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View, Text, Modal, Pressable, TextInput, Alert, Platform, ScrollView, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  UserPlus, Stethoscope, ShieldCheck, ClipboardList, ChevronDown, Check, X, Users as UsersIcon, Trash2,
} from 'lucide-react-native';

import { fetchMyClinicUsers, updateClinicUser, inviteClinicUser, generateDoctorPassword, deleteClinicUser, updateClinicUserAuth } from '../api';
import { useAuthStore } from '../../../core/store/authStore';
import { toast } from '../../../core/ui/Toast';
import { DS } from '../../../core/theme/dsTokens';
import { titleCaseTR } from '../../../core/utils/textCase';
import { isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';

const SERIF = { fontFamily: DS.font.display as string, fontWeight: '300' as const };
const P     = DS.clinic.primary;
const INK   = DS.ink[900];

type ClinicRole = 'doctor' | 'clinic_secretary' | 'clinic_admin';

// Varsayılan (ilk sıradaki) ünvan "Dt." — sistemdeki hekimlerin tamamı diş
// hekimi. Akademik/uzmanlık ünvanları listede kalır, elle seçilebilir.
const DOCTOR_TITLES = ['Dt.', 'Dr.', 'Uzm. Dt.', 'Doç. Dr.', 'Prof. Dr.', 'Opr. Dr.', 'Yok'] as const;

const ROLE_META: Record<ClinicRole, { labelKey: string; subKey: string; icon: any; accent: string; }> = {
  doctor:           { labelKey: 'clinic.roles.doctor',    subKey: 'clinic.roles.doctorSub',    icon: Stethoscope,  accent: '#0EA5E9' },
  clinic_secretary: { labelKey: 'clinic.roles.secretary', subKey: 'clinic.roles.secretarySub', icon: ClipboardList, accent: '#7C3AED' },
  clinic_admin:     { labelKey: 'clinic.roles.admin',     subKey: 'clinic.roles.adminSub',     icon: ShieldCheck,  accent: P },
};

interface ClinicUser {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  is_active: boolean;
  clinic_id: string | null;
  clinic_name: string | null;
  user_type: ClinicRole;
  specialty: string | null;
  clinic_permissions: Record<string, boolean> | null;
  created_at: string;
}

// Yetki anahtarları + insan-okur etiketler
const PERMISSION_KEYS: { key: string; labelKey: string; subKey: string; }[] = [
  { key: 'orders_view',     labelKey: 'clinic.permissions.ordersView',     subKey: 'clinic.permissions.ordersViewSub' },
  { key: 'orders_create',   labelKey: 'clinic.permissions.ordersCreate',   subKey: 'clinic.permissions.ordersCreateSub' },
  { key: 'orders_edit',     labelKey: 'clinic.permissions.ordersEdit',     subKey: 'clinic.permissions.ordersEditSub' },
  { key: 'doctors_manage',  labelKey: 'clinic.permissions.doctorsManage',  subKey: 'clinic.permissions.doctorsManageSub' },
  { key: 'users_manage',    labelKey: 'clinic.permissions.usersManage',    subKey: 'clinic.permissions.usersManageSub' },
  { key: 'settings_manage', labelKey: 'clinic.permissions.settingsManage', subKey: 'clinic.permissions.settingsManageSub' },
  { key: 'billing_view',    labelKey: 'clinic.permissions.billingView',    subKey: 'clinic.permissions.billingViewSub' },
];

// Her rolün düzenleyebileceği / göreceği yetki anahtarları
const PERMISSION_KEYS_BY_ROLE: Record<ClinicRole, string[]> = {
  doctor:           ['orders_view', 'orders_create', 'orders_edit'],
  clinic_secretary: ['orders_view', 'orders_create', 'orders_edit', 'doctors_manage', 'billing_view'],
  clinic_admin:     ['orders_view', 'orders_create', 'orders_edit', 'doctors_manage', 'users_manage', 'settings_manage', 'billing_view'],
};

const DEFAULT_PERMS: Record<ClinicRole, Record<string, boolean>> = {
  doctor: {
    orders_view: true, orders_create: true, orders_edit: true,
  },
  clinic_secretary: {
    orders_view: true, orders_create: true, orders_edit: true,
    doctors_manage: false, users_manage: false, settings_manage: false, billing_view: true,
  },
  clinic_admin: {
    orders_view: true, orders_create: true, orders_edit: true,
    doctors_manage: true, users_manage: true, settings_manage: true, billing_view: true,
  },
};

function initials(name?: string | null) {
  if (!name) return '?';
  const PREFIX_RE = /^(dr|dt|prof|doç|opr|uzm)\.?$/i;
  const words = name.trim().split(/\s+/).filter(w => !PREFIX_RE.test(w));
  return words.slice(0, 2).map(p => p[0]?.toLocaleUpperCase('tr-TR') ?? '').join('') || '?';
}

// ─── F1 HeroCard (patterns-mobile.tsx F1 canonical) ──────────────────────────
// bg: theme.primary · text: #FFFFFF · blob: rgba(255,255,255,0.18 / 0.12)
function UsersHeroCard({
  accentColor, eyebrow, value, sub, stats, onInvite,
}: {
  accentColor: string;
  eyebrow: string;
  value: string | number;
  sub: string;
  stats: { label: string; value: number | string; icon?: any }[];
  onInvite: () => void;
}) {
  const rtl = isRTL();
  return (
    <View style={{
      borderRadius: 20, overflow: 'hidden',
      backgroundColor: accentColor, padding: 18,
      position: 'relative',
    }}>
      {/* Bloblar — F1 canonical */}
      <View style={{ position: 'absolute', top: -40, ...(rtl ? { left: -40 } : { right: -40 }), width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.18)' }} pointerEvents="none" />
      <View style={{ position: 'absolute', bottom: -50, ...(rtl ? { right: -20 } : { left: -20 }), width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.12)' }} pointerEvents="none" />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)', marginBottom: 8 }}>
            {eyebrow}
          </Text>
          <Text style={{ ...SERIF, fontSize: 32, color: '#FFFFFF', letterSpacing: -0.8, lineHeight: 36 }}>
            {value}
          </Text>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 4 }}>{sub}</Text>
        </View>

        {/* Action stack — solid (Yeni) + ghost (alt) F1 buton şablonu */}
        <View style={{ gap: 6 }}>
          <Pressable
            onPress={onInvite}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              height: 32, paddingHorizontal: 12, borderRadius: 999,
              backgroundColor: '#FFFFFF',
              ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'all 0.15s' } as any : {}),
            }}
          >
            <UserPlus size={12} color={accentColor} strokeWidth={2.4} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: accentColor }}>Ekle</Text>
          </Pressable>
          {/* Ghost — F1 referansı */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            height: 30, paddingHorizontal: 12, borderRadius: 999,
            backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)',
          }}>
            <UsersIcon size={11} color="#FFFFFF" strokeWidth={1.8} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#FFFFFF' }}>Ekip</Text>
          </View>
        </View>
      </View>

      {/* Stat strip (F1 extension — translucent beyaz mini kartlar) */}
      {stats.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          {stats.map((s) => {
            const SIcon = s.icon;
            return (
              <View key={s.label} style={{ flex: 1, minWidth: 90, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  {SIcon ? <SIcon size={10} color="rgba(255,255,255,0.9)" strokeWidth={2} /> : null}
                  <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>{s.label}</Text>
                </View>
                <Text style={{ ...SERIF, fontSize: 20, color: '#FFFFFF', letterSpacing: -0.4, lineHeight: 22 }} numberOfLines={1}>
                  {s.value}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Kompakt rol filtre pill (sadece filtreleme, sayı tekrarı yok) ────────────
function FilterPill({ icon: Icon, label, active, accent, onPress }: {
  icon?: any; label: string; active: boolean; accent: string; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 7,
        paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
        backgroundColor: active ? INK : 'rgba(255,255,255,0.6)',
        borderWidth: 1, borderColor: active ? INK : 'rgba(255,255,255,0.95)',
        ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'all 0.12s' } as any : {}),
      }}
    >
      {Icon ? <Icon size={13} color={active ? '#FFF' : accent} strokeWidth={2} /> : null}
      <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#FFF' : INK }}>{label}</Text>
    </Pressable>
  );
}

function UserRow({ user, onPress }: { user: ClinicUser; onPress: () => void }) {
  const { t } = useTranslation();
  const rtl = isRTL();
  const meta = ROLE_META[user.user_type] ?? ROLE_META.doctor;
  const Icon = meta.icon;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 16, paddingVertical: 14,
        borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)',
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      }}
    >
      {/* Avatar */}
      <View style={{
        width: 42, height: 42, borderRadius: 21, backgroundColor: `${meta.accent}18`,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: meta.accent }}>{initials(user.full_name)}</Text>
      </View>

      {/* Ad + Tür */}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: user.is_active ? INK : DS.ink[400], textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>
          {titleCaseTR(user.full_name)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: `${meta.accent}14` }}>
            <Icon size={11} color={meta.accent} strokeWidth={2} />
            <Text style={{ fontSize: 11, color: meta.accent, fontWeight: '600' }}>{t(meta.labelKey)}</Text>
          </View>
          {user.specialty && (
            <Text style={{ fontSize: 11, color: DS.ink[400] }} numberOfLines={1}>{user.specialty}</Text>
          )}
          {user.phone && (
            <Text style={{ fontSize: 11, color: DS.ink[400] }}>· {user.phone}</Text>
          )}
        </View>
      </View>

      {!user.is_active && (
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.06)' }}>
          <Text style={{ fontSize: 10, color: DS.ink[500], fontWeight: '600', letterSpacing: 0.3 }}>PASİF</Text>
        </View>
      )}
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────────────────
// Davet / Düzenleme modal'ı
// ────────────────────────────────────────────────────────────────────
function UserFormModal({
  visible, onClose, editing, clinicId, clinicName, onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  editing: ClinicUser | null;
  clinicId: string | null;
  clinicName: string | null;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const rtl = isRTL();
  const isEdit = !!editing;
  const [role,        setRole]        = useState<ClinicRole>(editing?.user_type ?? 'doctor');
  const [title,       setTitle]       = useState<string>('Dt.');
  const [titleOpen,   setTitleOpen]   = useState(false);
  const [fullName,    setFullName]    = useState(editing?.full_name ?? '');
  const [phone,       setPhone]       = useState(editing?.phone ?? '');
  const [email,       setEmail]       = useState(editing?.email ?? '');
  const [emailLocked, setEmailLocked] = useState(true);  // edit modunda varsayılan kilitli
  const [password,    setPassword]    = useState('');
  const [pwdEditing,  setPwdEditing]  = useState(false); // edit modunda "Değiştir" tıklanmadan kapalı
  const [showPwd,     setShowPwd]     = useState(false);
  const [specialty,   setSpecialty]   = useState(editing?.specialty ?? '');
  const [perms,       setPerms]       = useState<Record<string, boolean>>(
    editing?.clinic_permissions ?? DEFAULT_PERMS[editing?.user_type ?? 'doctor'],
  );
  const [isActive,    setIsActive]    = useState(editing?.is_active ?? true);
  const [submitting,  setSubmitting]  = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(false);

  // Rol değişince varsayılan yetkileri uygula (yeni davet için)
  useEffect(() => {
    if (!isEdit) setPerms(DEFAULT_PERMS[role]);
  }, [role, isEdit]);

  // Edit prop'u değiştiğinde TÜM form state'ini hedefin değerleriyle senkronize et
  // (Aksi halde önceki kullanıcının kalıntı state'i gözüküyor.)
  useEffect(() => {
    if (editing) {
      setRole(editing.user_type);
      setFullName(editing.full_name ?? '');
      setPhone(editing.phone ?? '');
      setEmail(editing.email ?? '');
      setEmailLocked(true);        // edit modunda varsayılan kilitli (Düzenle butonu ile açılır)
      setPassword('');
      setPwdEditing(false);        // şifre değiştir butonu basılınca açılır
      setShowPwd(false);
      setSpecialty(editing.specialty ?? '');
      setIsActive(editing.is_active ?? true);
      setPerms(
        (editing.clinic_permissions && Object.keys(editing.clinic_permissions).length > 0)
          ? editing.clinic_permissions
          : DEFAULT_PERMS[editing.user_type] ?? {},
      );
      setConfirmDel(false);
    } else if (visible) {
      // Yeni kullanıcı modu — temiz state (her iki alan da editable)
      setRole('doctor');
      setFullName(''); setPhone(''); setEmail(''); setPassword(''); setSpecialty('');
      setEmailLocked(false); setPwdEditing(true);
      setIsActive(true);
      setPerms(DEFAULT_PERMS.doctor);
      setTitle('Dt.'); setTitleOpen(false); setShowPwd(false);
      setConfirmDel(false);
    }
  }, [editing, visible]);

  const togglePerm = (k: string) => setPerms(prev => ({ ...prev, [k]: !prev[k] }));

  const handleSubmit = async () => {
    if (!fullName.trim()) { toast.error(t('clinic.users.validation.nameRequired')); return; }
    if (!isEdit) {
      if (!email.trim())    { toast.error(t('clinic.users.validation.emailRequired')); return; }
      if (!password.trim()) { toast.error(t('clinic.users.validation.passwordRequired')); return; }
      if (password.length < 6) { toast.error(t('clinic.users.validation.passwordLength')); return; }
    }
    if (!clinicId) { toast.error(t('clinic.users.validation.clinicMissing')); return; }

    setSubmitting(true);
    try {
      if (isEdit && editing) {
        // 1) Profil alanları (RLS clinic_id ile filtreler)
        const { error } = await updateClinicUser(editing.id, {
          full_name: titleCaseTR(fullName.trim()),
          phone: phone.trim() || null,
          specialty: specialty.trim() || null,
          is_active: isActive,
          clinic_permissions: perms,
        });
        if (error) throw error;

        // 2) auth.users — email veya şifre değişti mi?
        const newEmail = email.trim().toLowerCase();
        const oldEmail = (editing.email ?? '').trim().toLowerCase();
        const emailChanged    = !emailLocked && newEmail && newEmail !== oldEmail;
        const passwordChanged = pwdEditing && !!password.trim();

        if (emailChanged && password && password.length < 6) {
          toast.error(autoT('Yeni şifre en az 6 karakter olmalı'));
          setSubmitting(false);
          return;
        }
        if (passwordChanged && password.length < 6) {
          toast.error(autoT('Yeni şifre en az 6 karakter olmalı'));
          setSubmitting(false);
          return;
        }

        if (emailChanged || passwordChanged) {
          const { data: authData, error: authErr } = await updateClinicUserAuth({
            user_id: editing.id,
            ...(emailChanged    ? { email: newEmail }   : {}),
            ...(passwordChanged ? { password }          : {}),
          });
          if (authErr) throw authErr;
          if ((authData as any)?.error) throw new Error((authData as any).error);
        }

        toast.success(t('clinic.users.toast.updated'));
        onSaved();
        close();
      } else {
        const fullNameWithTitle =
          role === 'doctor' && title !== 'Yok'
            ? `${title} ${titleCaseTR(fullName.trim())}`
            : titleCaseTR(fullName.trim());

        const { data, error } = await inviteClinicUser({
          email: email.trim().toLowerCase(),
          password,
          full_name: fullNameWithTitle,
          phone: phone.trim() || undefined,
          user_type: role,
          clinic_id: clinicId,
          clinic_name: clinicName ?? undefined,
          specialty: role === 'doctor' ? (specialty.trim() || undefined) : undefined,
          clinic_permissions: perms,
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);

        toast.success(t('clinic.users.toast.created'));
        onSaved();
        close();
      }
    } catch (err: any) {
      Alert.alert(autoT('Hata'), err?.message ?? autoT('Kullanıcı oluşturulamadı'));
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    setFullName(''); setPhone(''); setEmail(''); setPassword(''); setShowPwd(false); setSpecialty('');
    setEmailLocked(false); setPwdEditing(true);
    setRole('doctor'); setPerms(DEFAULT_PERMS.doctor); setIsActive(true);
    setConfirmDel(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!editing) return;
    setDeleting(true);
    try {
      const { data, error } = await deleteClinicUser(editing.id);
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(t('clinic.users.toast.deleted'));
      onSaved();
      close();
    } catch (err: any) {
      Alert.alert(autoT('Silinemedi'), err?.message ?? t('clinic.users.alert.deleteError'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <View style={{ width: '100%', maxWidth: 560, maxHeight: '92%', backgroundColor: '#FFF', borderRadius: 24, overflow: 'hidden' }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
            <View>
              <Text style={{ ...SERIF, fontSize: 22, color: INK }}>
                {isEdit ? t('clinic.users.modal.titleEdit') : t('clinic.users.modal.titleNew')}
              </Text>
              <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 2 }}>
                {isEdit ? t('clinic.users.modal.subtitleEdit') : t('clinic.users.modal.subtitleNew')}
              </Text>
            </View>
            <Pressable onPress={close} style={{ padding: 6 }}>
              <X size={20} color={DS.ink[500]} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
            <>
                {/* Edit modunda — rol banner (rol değiştirilemez, sadece bilgi) */}
                {isEdit && editing && (() => {
                  const meta = ROLE_META[editing.user_type] ?? ROLE_META.doctor;
                  const Icon = meta.icon;
                  return (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      padding: 14, borderRadius: 14,
                      backgroundColor: `${meta.accent}10`,
                      borderWidth: 1, borderColor: `${meta.accent}33`,
                    }}>
                      <View style={{
                        width: 38, height: 38, borderRadius: 12,
                        backgroundColor: meta.accent,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon size={18} color="#FFF" strokeWidth={2} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: meta.accent }}>
                          {t('clinic.users.modal.role')}
                        </Text>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: INK, letterSpacing: -0.2 }}>
                          {t(meta.labelKey)}
                        </Text>
                        <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 1 }}>{t(meta.subKey)}</Text>
                      </View>
                    </View>
                  );
                })()}

                {/* Rol seçici (sadece yeni kullanıcı ekleme ekranında) */}
                {!isEdit && (
                  <View>
                    <Text style={{ fontSize: 12, color: DS.ink[500], marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>{t('clinic.users.modal.role')}</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(['doctor', 'clinic_secretary', 'clinic_admin'] as ClinicRole[]).map(r => {
                        const meta = ROLE_META[r];
                        const Icon = meta.icon;
                        const active = role === r;
                        return (
                          <Pressable
                            key={r}
                            onPress={() => setRole(r)}
                            style={{
                              flex: 1, padding: 12, borderRadius: 14, gap: 6,
                              backgroundColor: active ? `${meta.accent}14` : '#FAFAFA',
                              borderWidth: 1.5, borderColor: active ? meta.accent : 'transparent',
                            }}
                          >
                            <Icon size={18} color={meta.accent} strokeWidth={2} />
                            <Text style={{ fontSize: 13, fontWeight: '700', color: active ? meta.accent : INK }}>{t(meta.labelKey)}</Text>
                            <Text style={{ fontSize: 10, color: DS.ink[400] }} numberOfLines={2}>{t(meta.subKey)}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Hekim için unvan dropdown */}
                {!isEdit && role === 'doctor' && (
                  <View>
                    <Text style={{ fontSize: 12, color: DS.ink[500], marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>{t('clinic.users.modal.title')}</Text>
                    <Pressable
                      onPress={() => setTitleOpen(!titleOpen)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        padding: 12, borderRadius: 12, backgroundColor: '#FAFAFA',
                      }}
                    >
                      <Text style={{ fontSize: 14, color: INK }}>{title}</Text>
                      <ChevronDown size={16} color={DS.ink[500]} />
                    </Pressable>
                    {titleOpen && (
                      <View style={{ marginTop: 6, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
                        {DOCTOR_TITLES.map(t => (
                          <Pressable key={t} onPress={() => { setTitle(t); setTitleOpen(false); }}
                            style={({ hovered }: any) => ({
                              padding: 10, backgroundColor: hovered ? 'rgba(0,0,0,0.03)' : 'transparent',
                              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                            })}>
                            <Text style={{ fontSize: 13, color: INK }}>{t}</Text>
                            {title === t && <Check size={14} color={P} />}
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* Ad Soyad */}
                <FormField label={t('clinic.users.modal.fullName')} value={fullName} onChangeText={setFullName} placeholder={t('clinic.users.modal.fullNamePlaceholder')} autoCapitalize="words" />

                {/* E-posta — edit'te varsayılan kilitli, "Düzenle" ile açılır */}
                <View>
                  <Text style={{ fontSize: 12, color: DS.ink[500], marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>{t('clinic.users.modal.email')}</Text>
                  {isEdit && emailLocked ? (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      backgroundColor: '#FAFAFA', borderRadius: 12, padding: 12, gap: 10,
                    }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, color: INK, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>
                          {email || <Text style={{ color: DS.ink[400], fontStyle: 'italic' }}>—</Text>}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setEmailLocked(false)}
                        style={({ hovered }: any) => ({
                          paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                          backgroundColor: hovered ? `${P}1F` : `${P}14`,
                          ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.12s' } as any : {}),
                        })}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: P, letterSpacing: 0.3 }}>{t('clinic.users.modal.editBtn')}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      backgroundColor: '#FAFAFA', borderRadius: 12,
                    }}>
                      <TextInput
                        value={email}
                        onChangeText={setEmail}
                        placeholder={t('clinic.users.modal.emailPlaceholder')}
                        placeholderTextColor={DS.ink[400]}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoFocus={isEdit}
                        style={{
                          flex: 1, padding: 12, fontSize: 14, color: INK,
                          ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                        }}
                      />
                      {isEdit && (
                        <Pressable
                          onPress={() => { setEmail(editing?.email ?? ''); setEmailLocked(true); }}
                          style={({ hovered }: any) => ({
                            paddingHorizontal: 12, paddingVertical: 8,
                            ...(Platform.OS === 'web' ? { cursor: 'pointer', opacity: hovered ? 1 : 0.75 } as any : {}),
                          })}
                        >
                          <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '600' }}>{t('clinic.users.modal.cancelBtn')}</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>

                {/* Şifre — edit'te "Değiştir" butonu, create'te açık */}
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.4 }}>{t('clinic.users.modal.password')}</Text>
                    {pwdEditing && (
                      <Pressable onPress={() => setPassword(generateDoctorPassword())} style={({ hovered }: any) => ({
                        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                        backgroundColor: hovered ? `${P}1F` : `${P}14`,
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      })}>
                        <Text style={{ fontSize: 10, color: P, fontWeight: '700', letterSpacing: 0.3 }}>{t('clinic.users.modal.autoGenerate')}</Text>
                      </Pressable>
                    )}
                  </View>

                  {isEdit && !pwdEditing ? (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      backgroundColor: '#FAFAFA', borderRadius: 12, padding: 12, gap: 10,
                    }}>
                      <Text style={{ flex: 1, fontSize: 14, color: INK, letterSpacing: 2, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                        ••••••••••
                      </Text>
                      <Pressable
                        onPress={() => { setPwdEditing(true); setPassword(''); }}
                        style={({ hovered }: any) => ({
                          paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                          backgroundColor: hovered ? `${P}1F` : `${P}14`,
                          ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.12s' } as any : {}),
                        })}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: P, letterSpacing: 0.3 }}>DEĞİŞTİR</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      <View style={{
                        flexDirection: 'row', alignItems: 'center',
                        backgroundColor: '#FAFAFA', borderRadius: 12,
                      }}>
                        <TextInput
                          value={password}
                          onChangeText={setPassword}
                          placeholder={isEdit ? t('clinic.users.modal.passwordPlaceholderEdit') : t('clinic.users.modal.passwordPlaceholderNew')}
                          placeholderTextColor={DS.ink[400]}
                          secureTextEntry={!showPwd}
                          autoCapitalize="none"
                          autoFocus={isEdit}
                          style={{
                            flex: 1, padding: 12, fontSize: 14, color: INK,
                            fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
                            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                          }}
                        />
                        <Pressable onPress={() => setShowPwd(s => !s)} style={({ hovered }: any) => ({
                          paddingHorizontal: 10, paddingVertical: 8,
                          ...(Platform.OS === 'web' ? { cursor: 'pointer', opacity: hovered ? 1 : 0.75 } as any : {}),
                        })}>
                          <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '600' }}>{showPwd ? t('clinic.users.modal.hideBtn') : t('clinic.users.modal.showBtn')}</Text>
                        </Pressable>
                        {isEdit && (
                          <Pressable
                            onPress={() => { setPassword(''); setPwdEditing(false); setShowPwd(false); }}
                            style={({ hovered }: any) => ({
                              paddingHorizontal: 10, paddingVertical: 8, ...(rtl ? { marginLeft: 4 } : { marginRight: 4 }),
                              ...(Platform.OS === 'web' ? { cursor: 'pointer', opacity: hovered ? 1 : 0.75 } as any : {}),
                            })}
                          >
                            <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '600' }}>{t('clinic.users.modal.cancelBtn')}</Text>
                          </Pressable>
                        )}
                      </View>
                      <Text style={{ fontSize: 10.5, color: DS.ink[400], marginTop: 4 }}>
                        {isEdit
                          ? t('clinic.users.modal.passwordHintEdit')
                          : t('clinic.users.modal.passwordHintNew')}
                      </Text>
                    </>
                  )}
                </View>

                {/* Telefon */}
                <FormField label={t('clinic.users.modal.phone')} value={phone} onChangeText={setPhone} placeholder={t('clinic.users.modal.phonePlaceholder')} keyboardType="phone-pad" />

                {/* Hekim için uzmanlık */}
                {(role === 'doctor' || (isEdit && editing?.user_type === 'doctor')) && (
                  <FormField label={t('clinic.users.modal.specialty')} value={specialty} onChangeText={setSpecialty} placeholder={t('clinic.users.modal.specialtyPlaceholder')} />
                )}

                {/* Yetkiler — rol-bazlı filtre */}
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Text style={{ fontSize: 12, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.4 }}>{t('clinic.users.modal.permissions')}</Text>
                    <Text style={{ fontSize: 10.5, color: DS.ink[400] }}>
                      {role === 'doctor' ? t('clinic.users.modal.permissionsHintDoctor')
                       : role === 'clinic_secretary' ? t('clinic.users.modal.permissionsHintSecretary')
                       : t('clinic.users.modal.permissionsHintAdmin')}
                    </Text>
                  </View>
                  <View style={{ gap: 8 }}>
                    {PERMISSION_KEYS
                      .filter(p => PERMISSION_KEYS_BY_ROLE[role].includes(p.key))
                      .map(p => (
                        <PermissionToggle key={p.key} label={t(p.labelKey)} sub={t(p.subKey)} value={!!perms[p.key]} onToggle={() => togglePerm(p.key)} />
                      ))}
                  </View>
                </View>

                {/* Aktiflik (sadece edit) */}
                {isEdit && (
                  <View>
                    <Text style={{ fontSize: 12, color: DS.ink[500], marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>{t('clinic.users.modal.accountStatus')}</Text>
                    <PermissionToggle label="Aktif" sub="Pasif kullanıcı sisteme giriş yapamaz" value={isActive} onToggle={() => setIsActive(!isActive)} />
                  </View>
                )}

                {/* Submit + Sil */}
                {isEdit && confirmDel ? (
                  <View style={{ backgroundColor: 'rgba(220,38,38,0.06)', borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: 'rgba(220,38,38,0.18)' }}>
                    <Text style={{ fontSize: 13, color: '#991B1B', fontWeight: '700' }}>{t('clinic.users.modal.deleteConfirm')}</Text>
                    <Text style={{ fontSize: 11.5, color: '#7F1D1D' }}>
                      {t('clinic.users.modal.deleteWarning')}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <Pressable
                        onPress={() => setConfirmDel(false)}
                        style={({ hovered }: any) => ({
                          flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                          backgroundColor: hovered ? 'rgba(0,0,0,0.04)' : '#FFF',
                          borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        })}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '600', color: INK }}>{t('clinic.users.modal.cancelBtn')}</Text>
                      </Pressable>
                      <Pressable
                        onPress={handleDelete}
                        disabled={deleting}
                        style={({ hovered }: any) => ({
                          flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                          flexDirection: 'row', justifyContent: 'center', gap: 6,
                          backgroundColor: deleting ? 'rgba(127,29,29,0.6)' : hovered ? '#991B1B' : '#DC2626',
                          ...(Platform.OS === 'web' ? { cursor: deleting ? 'not-allowed' : 'pointer', transition: 'background-color 0.12s' } as any : {}),
                        })}
                      >
                        <Trash2 size={14} color="#FFF" strokeWidth={2.2} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>
                          {deleting ? t('clinic.users.modal.deletingBtn') : t('clinic.users.modal.deleteBtn')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={handleSubmit}
                      disabled={submitting}
                      style={({ hovered }: any) => ({
                        flex: 1,
                        backgroundColor: submitting ? 'rgba(0,0,0,0.4)' : hovered ? '#19B06B' : P,
                        paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                        ...(Platform.OS === 'web' ? { cursor: submitting ? 'not-allowed' : 'pointer', transition: 'background-color 0.12s' } as any : {}),
                      })}
                    >
                      <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>
                        {submitting ? t('clinic.users.modal.savingBtn') : isEdit ? t('clinic.users.modal.saveBtn') : t('clinic.users.modal.createBtn')}
                      </Text>
                    </Pressable>
                    {isEdit && (
                      <Pressable
                        onPress={() => setConfirmDel(true)}
                        style={({ hovered }: any) => ({
                          paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: hovered ? 'rgba(220,38,38,0.12)' : 'rgba(220,38,38,0.06)',
                          borderWidth: 1, borderColor: 'rgba(220,38,38,0.18)',
                          ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.12s' } as any : {}),
                        })}
                      >
                        <Trash2 size={16} color="#DC2626" strokeWidth={2} />
                      </Pressable>
                    )}
                  </View>
                )}
            </>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FormField({ label, ...props }: any) {
  return (
    <View>
      <Text style={{ fontSize: 12, color: DS.ink[500], marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
      <TextInput
        {...props}
        style={{
          backgroundColor: '#FAFAFA', borderRadius: 12, padding: 12, fontSize: 14, color: INK,
          ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
        }}
        placeholderTextColor={DS.ink[400]}
      />
    </View>
  );
}

function PermissionToggle({ label, sub, value, onToggle }: { label: string; sub: string; value: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 12, borderRadius: 12,
        backgroundColor: '#FAFAFA',
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: INK }}>{label}</Text>
        <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 2 }}>{sub}</Text>
      </View>
      <View style={{
        width: 40, height: 22, borderRadius: 11, padding: 2,
        backgroundColor: value ? P : 'rgba(0,0,0,0.12)',
        justifyContent: 'center',
      }}>
        <View style={{
          width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFF',
          alignSelf: value ? 'flex-end' : 'flex-start',
        }} />
      </View>
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────────────────
// Ana ekran
// ────────────────────────────────────────────────────────────────────
export function ClinicUsersScreen() {
  const { t } = useTranslation();
  const rtl = isRTL();
  const { profile } = useAuthStore();
  const [users,      setUsers]      = useState<ClinicUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState<'all' | ClinicRole>('all');
  const [editing,    setEditing]    = useState<ClinicUser | null>(null);
  const [formOpen,   setFormOpen]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchMyClinicUsers();
    if (!error && data) setUsers(data as ClinicUser[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    all: users.length,
    doctor:           users.filter(u => u.user_type === 'doctor').length,
    clinic_secretary: users.filter(u => u.user_type === 'clinic_secretary').length,
    clinic_admin:     users.filter(u => u.user_type === 'clinic_admin').length,
  }), [users]);

  const filtered = useMemo(() =>
    filter === 'all' ? users : users.filter(u => u.user_type === filter),
  [users, filter]);

  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const insets = useSafeAreaInsets();
  // PatternsShell (üst başlığı render eden) yalnızca >=1024'te aktif (useIsDesktop).
  // Sayfa başlığını sadece shell yokken göster → 1024 altı.
  const showsShellHeader = width >= 1024;

  const activeMeta = filter === 'all'
    ? { label: autoT('Tüm kullanıcılar'), sub: autoT('Hekim, sekreter ve yöneticiler bir arada'), accent: INK }
    : { ...ROLE_META[filter as ClinicRole], label: t(ROLE_META[filter as ClinicRole].labelKey), sub: t(ROLE_META[filter as ClinicRole].subKey) };

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <ScrollView contentContainerStyle={{
        paddingHorizontal: isDesktop ? 28 : 16,
        paddingTop: isDesktop ? 28 : Math.max(insets.top, 8) + 30,
        paddingBottom: 100,
        maxWidth: 1280, width: '100%', alignSelf: 'center',
      }}>

        {/* ════════ SAYFA BAŞLIĞI ════════
            >=1024'te PatternsShell zaten üstte "Kullanıcılar" başlığını gösteriyor →
            tekrarı önlemek için sayfa başlığı yalnızca shell yokken (1024 altı) render edilir. */}
        {!showsShellHeader && (
          <View style={{ gap: 4, marginBottom: 18 }}>
            <Text style={{ fontSize: 11, color: P, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>
              {t('clinic.users.pageKicker')}
            </Text>
            <Text style={{
              ...SERIF,
              fontSize: 34,
              letterSpacing: -0.025 * 34,
              lineHeight: 36,
              color: INK,
            }}>
              {t('clinic.users.pageTitle')}
            </Text>
          </View>
        )}

        {/* ════════ F1 HERO CARD (patterns-mobile.tsx F1 canonical) ════════ */}
        <UsersHeroCard
          accentColor={P}
          eyebrow={t('clinic.users.teamSummary')}
          value={counts.all}
          sub={`${counts.all} ${t('clinic.users.summaryDesc')}`}
          onInvite={() => { setEditing(null); setFormOpen(true); }}
          stats={[
            { label: t('clinic.users.statDoctor'),    value: counts.doctor,           icon: Stethoscope },
            { label: t('clinic.users.statSecretary'), value: counts.clinic_secretary, icon: ClipboardList },
            { label: t('clinic.users.statAdmin'),     value: counts.clinic_admin,     icon: ShieldCheck },
          ]}
        />

        {/* ════════ KOMPAKT FİLTRE + LİSTE BAŞLIK ════════ */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 22, marginBottom: 12 }}>
          <FilterPill label={t('clinic.users.filterAll')}     active={filter === 'all'}              accent={INK}    onPress={() => setFilter('all')} />
          <FilterPill icon={Stethoscope}   label={t('clinic.users.filterDoctor')}    active={filter === 'doctor'}           accent="#0EA5E9" onPress={() => setFilter('doctor')} />
          <FilterPill icon={ClipboardList} label={t('clinic.users.filterSecretary')} active={filter === 'clinic_secretary'} accent="#7C3AED" onPress={() => setFilter('clinic_secretary')} />
          <FilterPill icon={ShieldCheck}   label={t('clinic.users.filterAdmin')} active={filter === 'clinic_admin'}     accent={P}      onPress={() => setFilter('clinic_admin')} />
          <View style={{ flex: 1 }} />
          <Text style={{ fontSize: 12, color: DS.ink[400] }}>{filtered.length} {t('clinic.users.recordCount')}</Text>
        </View>

        {/* ════════ LİSTE ════════ */}
        <View style={{
          backgroundColor: '#FFF', borderRadius: 22, overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 12px 28px rgba(0,0,0,0.05)' } as any : {}),
        }}>
          {loading ? (
            <View style={{ padding: 64, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: DS.ink[400] }}>{t('common.loading')}</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={{ padding: isDesktop ? 56 : 36, alignItems: 'center', gap: 18 }}>
              {/* İllüstrasyon yerine 3 mini avatar stack */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {[
                  { c: '#0EA5E9', i: Stethoscope },
                  { c: '#7C3AED', i: ClipboardList },
                  { c: P,         i: ShieldCheck },
                ].map((item, idx) => {
                  const Icon = item.i;
                  return (
                    <View key={idx} style={{
                      width: 56, height: 56, borderRadius: 28,
                      backgroundColor: `${item.c}1A`,
                      borderWidth: 3, borderColor: '#FFF',
                      alignItems: 'center', justifyContent: 'center',
                      ...(idx === 0 ? {} : (rtl ? { marginRight: -14 } : { marginLeft: -14 })),
                    }}>
                      <Icon size={22} color={item.c} strokeWidth={1.8} />
                    </View>
                  );
                })}
              </View>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text style={{ ...SERIF, fontSize: 22, color: INK, letterSpacing: -0.4 }}>
                  {filter === 'all' ? t('clinic.users.emptyAll') : t('clinic.users.emptyFilteredFmt', { role: activeMeta.label.toLocaleLowerCase() })}
                </Text>
                <Text style={{ fontSize: 13, color: DS.ink[500], textAlign: 'center', maxWidth: 380 }}>
                  {t('clinic.users.emptyDesc')}
                </Text>
              </View>
              <Pressable
                onPress={() => { setEditing(null); setFormOpen(true); }}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: hovered ? '#19B06B' : P,
                  paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, marginTop: 4,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.15s' } as any : {}),
                })}
              >
                <UserPlus size={14} color="#FFF" strokeWidth={2.2} />
                <Text style={{ fontSize: 13, color: '#FFF', fontWeight: '700' }}>{t('clinic.users.addFirst')}</Text>
              </Pressable>
            </View>
          ) : (
            filtered.map(u => (
              <UserRow key={u.id} user={u} onPress={() => { setEditing(u); setFormOpen(true); }} />
            ))
          )}
        </View>
      </ScrollView>

      <UserFormModal
        visible={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        editing={editing}
        clinicId={profile?.clinic_id ?? null}
        clinicName={profile?.clinic_name ?? null}
        onSaved={load}
      />
    </View>
  );
}
