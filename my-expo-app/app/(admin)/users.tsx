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
import Colors from '../../constants/colors';
import { Profile } from '../../lib/types';

type FilterType = 'all' | 'admin' | 'lab' | 'doctor';

type NewUserRole = 'admin' | 'manager' | 'technician';

const ROLE_OPTIONS: { key: NewUserRole; label: string; sub: string; icon: string }[] = [
  { key: 'admin',      label: 'Admin',        sub: 'Tam yönetim yetkisi',    icon: 'shield-outline' },
  { key: 'manager',    label: 'Mesul Müdür',  sub: 'Lab yöneticisi',         icon: 'account-circle-outline' },
  { key: 'technician', label: 'Teknisyen',    sub: 'Üretim personeli',       icon: 'wrench-outline' },
];

export default function AdminUsersScreen() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

  useEffect(() => { loadProfiles(); }, []);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-list-users');
      if (!error && data?.users) {
        setProfiles(data.users as Profile[]);
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (profile: Profile) => {
    const newVal = !profile.is_active;
    setUpdatingId(profile.id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: newVal })
        .eq('id', profile.id);
      if (!error) {
        setProfiles((prev) =>
          prev.map((p) => (p.id === profile.id ? { ...p, is_active: newVal } : p))
        );
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteUser = (profile: Profile) => {
    Alert.alert(
      'Kullanıcıyı Sil',
      `"${profile.full_name}" adlı kullanıcıyı silmek istediğinizden emin misiniz?\nBu işlem geri alınamaz.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setUpdatingId(profile.id);
            try {
              const { data, error: fnError } = await supabase.functions.invoke('admin-delete-user', {
                body: { userId: profile.id },
              });
              if (fnError || data?.error) {
                Alert.alert('Hata', data?.error ?? fnError?.message ?? 'Silme işlemi başarısız');
              } else {
                setProfiles((prev) => prev.filter((p) => p.id !== profile.id));
              }
            } catch (e: any) {
              Alert.alert('Hata', e.message ?? 'Bir hata oluştu');
            } finally {
              setUpdatingId(null);
            }
          },
        },
      ]
    );
  };

  const filtered = profiles.filter((p) => filter === 'all' || p.user_type === filter);
  const adminCount  = profiles.filter((p) => p.user_type === 'admin').length;
  const labCount    = profiles.filter((p) => p.user_type === 'lab').length;
  const doctorCount = profiles.filter((p) => p.user_type === 'doctor').length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.pageHeader}>
          <Text style={styles.title}>Kullanıcılar</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
            <MaterialCommunityIcons name="account-plus-outline" size={16} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Kullanıcı Ekle</Text>
          </TouchableOpacity>
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {([
            { key: 'all',    label: `Tümü (${profiles.length})` },
            { key: 'admin',  label: `Admin (${adminCount})` },
            { key: 'lab',    label: `Lab (${labCount})` },
            { key: 'doctor', label: `Hekim (${doctorCount})` },
          ] as const).map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              onPress={() => setFilter(key)}
              style={[styles.chip, filter === key && styles.chipActive]}
            >
              <Text style={[styles.chipText, filter === key && styles.chipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="account-off-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Kullanıcı bulunamadı</Text>
          </View>
        ) : (
          filtered.map((profile) => (
            <UserCard
              key={profile.id}
              profile={profile}
              updating={updatingId === profile.id}
              onToggleActive={() => handleToggleActive(profile)}
              onEdit={() => setEditingProfile(profile)}
              onDelete={() => handleDeleteUser(profile)}
            />
          ))
        )}
      </ScrollView>

      <AddUserModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => { setShowAddModal(false); loadProfiles(); }}
      />

      <EditUserModal
        profile={editingProfile}
        onClose={() => setEditingProfile(null)}
        onSuccess={(updated) => {
          setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          setEditingProfile(null);
        }}
      />
    </SafeAreaView>
  );
}

// ─── User Card ───────────────────────────────────────────────────────────────

function UserCard({
  profile, updating, onToggleActive, onEdit, onDelete,
}: {
  profile: Profile;
  updating: boolean;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const typeLabel =
    profile.user_type === 'admin'  ? 'Admin' :
    profile.user_type === 'doctor' ? 'Hekim' : 'Lab';

  const typeBadgeColor =
    profile.user_type === 'admin'  ? { bg: '#FEF3C7', text: '#92400E' } :
    profile.user_type === 'doctor' ? { bg: '#DBEAFE', text: '#1D4ED8' } :
                                     { bg: '#DCFCE7', text: '#166534' };

  const roleLabel =
    profile.role === 'manager'    ? 'Mesul Müdür' :
    profile.role === 'technician' ? 'Teknisyen'   : null;

  const createdDate = new Date(profile.created_at).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <View style={[styles.card, !profile.is_active && styles.cardInactive]}>
      {/* Header: avatar + name + switch */}
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profile.full_name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, !profile.is_active && styles.nameInactive]} numberOfLines={1}>
            {profile.full_name}
          </Text>
          <View style={styles.badgeRow}>
            <View style={[styles.typeBadge, { backgroundColor: typeBadgeColor.bg }]}>
              <Text style={[styles.typeBadgeText, { color: typeBadgeColor.text }]}>{typeLabel}</Text>
            </View>
            {roleLabel && (
              <Text style={styles.roleText}>· {roleLabel}</Text>
            )}
          </View>
        </View>
        {updating ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Switch
            value={profile.is_active ?? true}
            onValueChange={onToggleActive}
            trackColor={{ false: Colors.border, true: '#D1D5DB' }}
            thumbColor={profile.is_active ? '#0F172A' : Colors.textMuted}
            disabled={updating}
          />
        )}
      </View>

      {/* Body: detail rows */}
      <View style={styles.cardBody}>
        <View style={styles.detailRow}>
          <MaterialCommunityIcons name="email-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.detail} numberOfLines={1}>{profile.email ?? '—'}</Text>
        </View>
        {profile.phone ? (
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="phone-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.detail}>{profile.phone}</Text>
          </View>
        ) : null}
        {profile.user_type === 'doctor' && profile.clinic_name ? (
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="office-building-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.detail}>{profile.clinic_name}</Text>
          </View>
        ) : null}
        <View style={styles.detailRow}>
          <MaterialCommunityIcons name="calendar-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.detail}>Kayıt: {createdDate}</Text>
        </View>
        {!profile.is_active && (
          <Text style={styles.inactiveLabel}>PASİF</Text>
        )}
      </View>

      {/* Actions */}
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.editBtn} onPress={onEdit} disabled={updating}>
          {updating ? (
            <ActivityIndicator size="small" color="#374151" />
          ) : (
            <>
              <MaterialCommunityIcons name="pencil-outline" size={14} color="#374151" />
              <Text style={styles.editBtnText}>Düzenle</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} disabled={updating}>
          <MaterialCommunityIcons name="trash-can-outline" size={14} color={Colors.error} />
          <Text style={styles.deleteBtnText}>Sil</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────

function EditUserModal({
  profile,
  onClose,
  onSuccess,
}: {
  profile: Profile | null;
  onClose: () => void;
  onSuccess: (updated: Profile) => void;
}) {
  const [fullName,    setFullName]    = useState('');
  const [email,       setEmail]       = useState('');
  const [phone,       setPhone]       = useState('');
  const [clinicName,  setClinicName]  = useState('');
  const [role,        setRole]        = useState<'manager' | 'technician'>('technician');
  const [isActive,    setIsActive]    = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [successMsg,  setSuccessMsg]  = useState('');

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setEmail(profile.email ?? '');
      setPhone(profile.phone ?? '');
      setClinicName(profile.clinic_name ?? '');
      setRole(profile.role === 'manager' ? 'manager' : 'technician');
      setIsActive(profile.is_active ?? true);
      setNewPassword('');
      setError('');
      setSuccessMsg('');
    }
  }, [profile]);

  const handleSave = async () => {
    if (!profile) return;
    setError(''); setSuccessMsg('');
    if (!fullName.trim()) { setError('Ad Soyad zorunludur'); return; }
    if (!email.trim())    { setError('E-posta zorunludur'); return; }
    if (newPassword && newPassword.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır'); return;
    }

    setSaving(true);
    try {
      // 1. Profiles tablosunu güncelle
      const profileUpdates: Partial<Profile> = {
        full_name:  fullName.trim(),
        phone:      phone.trim() || null,
        is_active:  isActive,
        ...(profile.user_type === 'doctor' ? { clinic_name: clinicName.trim() || null } : { clinic_name: null }),
        ...(profile.user_type === 'lab'    ? { role } : {}),
      };

      const { error: dbError } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', profile.id);

      if (dbError) throw new Error(dbError.message);

      // 2. Email veya şifre değişmişse edge function çağır
      const emailChanged    = email.trim() !== (profile.email ?? '');
      const passwordChanged = newPassword.length >= 6;

      if (emailChanged || passwordChanged) {
        const body: Record<string, string> = { userId: profile.id };
        if (emailChanged)    body.email    = email.trim();
        if (passwordChanged) body.password = newPassword;

        const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-update-user', { body });
        if (fnError || fnData?.error) throw new Error(fnData?.error ?? fnError?.message ?? 'Auth güncellenemedi');
      }

      onSuccess({ ...profile, ...profileUpdates, email: email.trim() });
    } catch (e: any) {
      setError(e.message ?? 'Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const isLabUser    = profile?.user_type === 'lab';
  const isDoctorUser = profile?.user_type === 'doctor';

  return (
    <Modal visible={!!profile} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={m.overlay}
      >
        <View style={m.popup}>
          {/* Header */}
          <View style={m.header}>
            <View>
              <Text style={m.title}>Kullanıcıyı Düzenle</Text>
              {profile && (
                <Text style={m.subtitle}>
                  {profile.user_type === 'admin'  ? 'Admin' :
                   profile.user_type === 'doctor' ? 'Hekim' : 'Lab Personeli'}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={m.body}>

            {/* ── Kişisel Bilgiler ── */}
            <Text style={m.sectionLabel}>Kişisel Bilgiler</Text>

            <Text style={m.fieldLabel}>Ad Soyad *</Text>
            <TextInput style={m.input} value={fullName} onChangeText={setFullName}
              placeholder="Örn: Ahmet Yılmaz" placeholderTextColor={Colors.textMuted} />

            <Text style={m.fieldLabel}>Telefon</Text>
            <TextInput style={m.input} value={phone} onChangeText={setPhone}
              placeholder="0555 000 00 00" placeholderTextColor={Colors.textMuted}
              keyboardType="phone-pad" />

            {isDoctorUser && (
              <>
                <Text style={m.fieldLabel}>Klinik Adı</Text>
                <TextInput style={m.input} value={clinicName} onChangeText={setClinicName}
                  placeholder="Örn: Sağlık Kliniği" placeholderTextColor={Colors.textMuted} />
              </>
            )}

            {/* ── Rol — sadece lab ── */}
            {isLabUser && (
              <>
                <Text style={m.sectionLabel}>Rol</Text>
                <View style={m.roleRow}>
                  {(['manager', 'technician'] as const).map((r) => {
                    const active = role === r;
                    const label  = r === 'manager' ? 'Mesul Müdür' : 'Teknisyen';
                    const icon   = r === 'manager' ? 'account-circle-outline' : 'wrench-outline';
                    return (
                      <TouchableOpacity key={r}
                        style={[m.roleCard, active && m.roleCardActive]}
                        onPress={() => setRole(r)}
                      >
                        <MaterialCommunityIcons name={icon as any} size={20} color={active ? '#FFF' : '#374151'} />
                        <Text style={[m.roleLabel, active && m.roleLabelActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* ── Hesap & Güvenlik ── */}
            <Text style={m.sectionLabel}>Hesap & Güvenlik</Text>

            <Text style={m.fieldLabel}>E-posta *</Text>
            <TextInput style={m.input} value={email} onChangeText={setEmail}
              placeholder="kullanici@ornek.com" placeholderTextColor={Colors.textMuted}
              keyboardType="email-address" autoCapitalize="none" />

            <Text style={m.fieldLabel}>Yeni Şifre</Text>
            <View style={m.inputRow}>
              <TextInput
                style={[m.input, { flex: 1, marginBottom: 0 }]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Boş bırakılırsa değişmez"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPass}
              />
              <TouchableOpacity style={m.eyeBtn} onPress={() => setShowPass(v => !v)}>
                <MaterialCommunityIcons
                  name={showPass ? 'eye-off-outline' : 'eye-outline'}
                  size={18} color={Colors.textMuted}
                />
              </TouchableOpacity>
            </View>
            <Text style={m.hint}>En az 6 karakter. Boş bırakılırsa şifre değişmez.</Text>

            {/* ── Hesap Durumu ── */}
            <View style={[m.toggleRow, { marginTop: 16 }]}>
              <View style={{ flex: 1 }}>
                <Text style={m.toggleLabel}>Hesap Aktif</Text>
                <Text style={m.toggleSub}>
                  {isActive ? 'Kullanıcı giriş yapabilir' : 'Kullanıcı giriş yapamaz'}
                </Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: Colors.border, true: '#D1D5DB' }}
                thumbColor={isActive ? '#0F172A' : Colors.textMuted}
              />
            </View>

            {error ? (
              <View style={m.errorBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={14} color={Colors.error} />
                <Text style={m.errorText}>{error}</Text>
              </View>
            ) : null}

            {successMsg ? (
              <View style={m.successBox}>
                <MaterialCommunityIcons name="check-circle-outline" size={14} color="#16A34A" />
                <Text style={m.successText}>{successMsg}</Text>
              </View>
            ) : null}

          </ScrollView>

          {/* Footer */}
          <View style={m.footer}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose}>
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
                  <MaterialCommunityIcons name="content-save-outline" size={16} color="#FFFFFF" />
                  <Text style={m.saveText}>Kaydet</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Add User Modal ───────────────────────────────────────────────────────────

function AddUserModal({
  visible,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<NewUserRole>('technician');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const reset = () => {
    setFullName(''); setEmail(''); setPassword('');
    setSelectedRole('technician'); setError('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSave = async () => {
    setError('');
    if (!fullName.trim())    { setError('Ad Soyad zorunludur'); return; }
    if (!email.trim())       { setError('E-posta zorunludur'); return; }
    if (password.length < 6) { setError('Şifre en az 6 karakter olmalıdır'); return; }

    const user_type = selectedRole === 'admin' ? 'admin' : 'lab';
    const role      = selectedRole === 'admin' ? null : selectedRole;

    setSaving(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('admin-create-user', {
        body: { email: email.trim(), password, full_name: fullName.trim(), user_type, role },
      });
      if (fnError || data?.error) {
        setError(data?.error ?? fnError?.message ?? 'Bir hata oluştu');
      } else {
        reset();
        onSuccess();
      }
    } catch (e: any) {
      setError(e.message ?? 'Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={m.overlay}
      >
        <View style={m.popup}>
          <View style={m.header}>
            <Text style={m.title}>Yeni Kullanıcı</Text>
            <TouchableOpacity onPress={handleClose}>
              <MaterialCommunityIcons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={m.body}>
            <Text style={m.sectionLabel}>Kullanıcı Rolü</Text>
            <View style={m.roleGrid}>
              {ROLE_OPTIONS.map((opt) => {
                const active = selectedRole === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[m.roleCard, active && m.roleCardActive]}
                    onPress={() => setSelectedRole(opt.key)}
                  >
                    <MaterialCommunityIcons name={opt.icon as any} size={20} color={active ? '#FFFFFF' : '#374151'} />
                    <Text style={[m.roleLabel, active && m.roleLabelActive]}>{opt.label}</Text>
                    <Text style={[m.roleSub, active && m.roleSubActive]}>{opt.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={m.sectionLabel}>Bilgiler</Text>

            <Text style={m.fieldLabel}>Ad Soyad *</Text>
            <TextInput style={m.input} value={fullName} onChangeText={setFullName}
              placeholder="Örn: Ahmet Yılmaz" placeholderTextColor={Colors.textMuted} />

            <Text style={m.fieldLabel}>E-posta *</Text>
            <TextInput style={m.input} value={email} onChangeText={setEmail}
              placeholder="kullanici@ornek.com" placeholderTextColor={Colors.textMuted}
              keyboardType="email-address" autoCapitalize="none" />

            <Text style={m.fieldLabel}>Şifre *</Text>
            <TextInput style={m.input} value={password} onChangeText={setPassword}
              placeholder="En az 6 karakter" placeholderTextColor={Colors.textMuted}
              secureTextEntry />

            {error ? (
              <View style={m.errorBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={14} color={Colors.error} />
                <Text style={m.errorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

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
                  <Text style={m.saveText}>Kullanıcı Ekle</Text>
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
    backgroundColor: '#0F172A', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },

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
  name: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  nameInactive: { color: Colors.textMuted },

  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  roleText: { fontSize: 12, color: Colors.textSecondary },

  cardBody: {
    gap: 4, borderTopWidth: 1, borderTopColor: Colors.border,
    paddingTop: 10, marginBottom: 10,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detail: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  inactiveLabel: { fontSize: 11, fontWeight: '800', color: Colors.error, letterSpacing: 1, marginTop: 4 },

  cardActions: {
    flexDirection: 'row', gap: 8,
    borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10,
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
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  popup: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    width: '100%', maxWidth: 520, maxHeight: '90%', overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  title:    { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  body: { padding: 20 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#9CA3AF',
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10, marginTop: 4,
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#0F172A',
    backgroundColor: '#FAFAFA', marginBottom: 14,
  },

  roleGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  roleRow:  { flexDirection: 'row', gap: 8, marginBottom: 20 },
  roleCard: {
    flex: 1, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA', alignItems: 'center', gap: 4,
  },
  roleCardActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  roleLabel: { fontSize: 12, fontWeight: '700', color: '#374151', textAlign: 'center' },
  roleLabelActive: { color: '#FFFFFF' },
  roleSub: { fontSize: 10, color: '#9CA3AF', textAlign: 'center' },
  roleSubActive: { color: 'rgba(255,255,255,0.6)' },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F9FAFB', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 16,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#0F172A', marginBottom: 2 },
  toggleSub:   { fontSize: 12, color: '#9CA3AF' },

  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
  },
  eyeBtn: {
    padding: 11, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    backgroundColor: '#FAFAFA',
  },
  hint: { fontSize: 11, color: Colors.textMuted, marginBottom: 14, marginTop: 2 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10, marginBottom: 12,
  },
  errorText: { fontSize: 13, color: Colors.error, flex: 1 },

  successBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0FDF4', borderRadius: 8, padding: 10, marginBottom: 12,
  },
  successText: { fontSize: 13, color: '#16A34A', flex: 1 },

  footer: {
    flexDirection: 'row', gap: 10, padding: 16,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
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
