import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AppSwitch } from '../../core/ui/AppSwitch';
import { supabase } from '../../lib/supabase';
const P = '#0F172A';
const ERR = '#FF3B30';
import { Profile } from '../../lib/types';

type FilterType = 'all' | 'admin' | 'lab' | 'doctor';
type StatusFilter = 'all' | 'active' | 'inactive';

type NewUserRole = 'admin' | 'manager' | 'technician';

const ROLE_OPTIONS: { key: NewUserRole; label: string; sub: string; icon: string }[] = [
  { key: 'admin',      label: 'Admin',        sub: 'Tam yönetim yetkisi',    icon: 'shield-outline' },
  { key: 'manager',    label: 'Mesul Müdür',  sub: 'Lab yöneticisi',         icon: 'account-circle-outline' },
  { key: 'technician', label: 'Teknisyen',    sub: 'Üretim personeli',       icon: 'wrench-outline' },
];

export default function AdminUsersScreen() {
  const [profiles,       setProfiles]       = useState<Profile[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [typeFilter,     setTypeFilter]     = useState<FilterType>('all');
  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>('all');
  const [draftStatus,    setDraftStatus]    = useState<StatusFilter>('all');
  const [showFilter,     setShowFilter]     = useState(false);
  const [search,         setSearch]         = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchFocused,  setSearchFocused]  = useState(false);
  const [updatingId,     setUpdatingId]     = useState<string | null>(null);
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

  useEffect(() => { loadProfiles(); }, []);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-list-users');
      if (!error && data?.users) setProfiles(data.users as Profile[]);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (profile: Profile) => {
    const newVal = !profile.is_active;
    setUpdatingId(profile.id);
    try {
      const { error } = await supabase.from('profiles').update({ is_active: newVal }).eq('id', profile.id);
      if (!error) setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, is_active: newVal } : p));
    } finally { setUpdatingId(null); }
  };

  const handleDeleteUser = (profile: Profile) => {
    Alert.alert('Kullanıcıyı Sil', `"${profile.full_name}" adlı kullanıcıyı silmek istediğinizden emin misiniz?\nBu işlem geri alınamaz.`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        setUpdatingId(profile.id);
        try {
          const { data, error: fnError } = await supabase.functions.invoke('admin-delete-user', { body: { userId: profile.id } });
          if (fnError || data?.error) Alert.alert('Hata', data?.error ?? fnError?.message ?? 'Silme işlemi başarısız');
          else setProfiles(prev => prev.filter(p => p.id !== profile.id));
        } catch (e: any) {
          Alert.alert('Hata', e.message ?? 'Bir hata oluştu');
        } finally { setUpdatingId(null); }
      }},
    ]);
  };

  const q = search.trim().toLowerCase();
  const filtered = profiles.filter(p => {
    if (typeFilter !== 'all' && p.user_type !== typeFilter) return false;
    if (statusFilter === 'active'   && !p.is_active) return false;
    if (statusFilter === 'inactive' &&  p.is_active) return false;
    if (!q) return true;
    return p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q);
  });

  const activeFilterCount = statusFilter !== 'all' ? 1 : 0;

  const TYPE_TABS = [
    { key: 'all'   as FilterType, label: 'Tümü' },
    { key: 'admin' as FilterType, label: 'Admin' },
    { key: 'lab'   as FilterType, label: 'Lab' },
  ];

  const typeBadge = (profile: Profile) =>
    profile.user_type === 'admin'   ? { bg: '#0F172A', text: '#FFFFFF', label: 'Admin',     avatarBg: '#1E293B', avatarText: '#FFFFFF' } :
    profile.user_type === 'doctor'  ? { bg: '#DBEAFE', text: '#1D4ED8', label: 'Hekim',     avatarBg: '#EFF6FF', avatarText: '#2563EB' } :
    profile.role      === 'manager' ? { bg: '#EFF6FF', text: '#2563EB', label: 'Müdür',     avatarBg: '#EFF6FF', avatarText: '#2563EB' } :
                                      { bg: '#F1F5F9', text: '#475569', label: 'Teknisyen', avatarBg: '#F1F5F9', avatarText: '#475569' };

  const getSwitchColor = (_profile: Profile) => '#0F172A';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* Toolbar: tabs + actions — mirrors ClinicsScreen layout */}
        <View style={styles.toolbarRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsScroll}
            contentContainerStyle={styles.tabsContent}
          >
            <View style={styles.tabBar}>
              {TYPE_TABS.map(tab => {
                const active = typeFilter === tab.key;
                const count  = tab.key === 'all'
                  ? profiles.length
                  : profiles.filter(p => p.user_type === tab.key).length;
                return (
                  <TouchableOpacity key={tab.key}
                    style={[styles.tabItem, active && styles.tabItemActive]}
                    onPress={() => setTypeFilter(tab.key)} activeOpacity={0.75}>
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>
                      {tab.label}{count > 0 ? `  ${count}` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.rightGroup}>
            <TouchableOpacity
              style={[styles.iconBtn, (searchExpanded || search.length > 0) && styles.iconBtnActive]}
              onPress={() => setSearchExpanded(!searchExpanded)} activeOpacity={0.75}>
              <Feather name="search" size={18} color={(searchExpanded || search.length > 0) ? '#0F172A' : '#94A3B8'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, activeFilterCount > 0 && styles.iconBtnActive]}
              onPress={() => { setDraftStatus(statusFilter); setShowFilter(true); }} activeOpacity={0.75}>
              <MaterialCommunityIcons name={'tune-variant' as any} size={18} color={activeFilterCount > 0 ? '#0F172A' : '#94A3B8'} />
              {activeFilterCount > 0 && (
                <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{activeFilterCount}</Text></View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)} activeOpacity={0.8}>
              <Feather name="plus" size={15} color="#FFFFFF" />
              <Text style={styles.addBtnText}>Kullanıcı Ekle</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Expandable search */}
        {(searchExpanded || search.length > 0) && (
          <View style={styles.searchRow}>
            <View style={[styles.searchWrap, searchFocused && styles.searchWrapFocused]}>
              <Feather name="search" size={16} color={searchFocused ? '#0F172A' : '#AEAEB2'} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Kullanıcı ara..."
                placeholderTextColor="#AEAEB2"
                returnKeyType="search"
                autoFocus={searchExpanded && search.length === 0}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => { setSearch(''); setSearchExpanded(false); }}>
                  <Feather name="x-circle" size={15} color="#AEAEB2" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* User cards */}
        {loading ? (
          <ActivityIndicator size="large" color={P} style={{ marginTop: 60 }} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="account-off-outline" size={40} color="#AEAEB2" />
            <Text style={styles.emptyTitle}>{q ? 'Sonuç bulunamadı' : 'Kullanıcı bulunamadı'}</Text>
            {q && <Text style={styles.emptySub}>"{q}" ile eşleşen kullanıcı yok</Text>}
          </View>
        ) : (
          <View style={styles.cardList}>
            {filtered.map((profile) => {
              const badge = typeBadge(profile);
              const switchColor = getSwitchColor(profile);
              return (
                <View key={profile.id} style={[styles.card, !profile.is_active && styles.cardInactive]}>
                  {/* Avatar */}
                  <View style={[styles.avatar, { backgroundColor: badge.avatarBg }]}>
                    {(profile as any).avatar_url
                      ? <Image source={{ uri: (profile as any).avatar_url }} style={styles.avatarImg} />
                      : <Text style={[styles.avatarText, { color: badge.avatarText }]}>
                          {profile.full_name?.charAt(0).toUpperCase() ?? '?'}
                        </Text>}
                  </View>
                  {/* Info */}
                  <View style={styles.cardInfo}>
                    <View style={styles.cardNameRow}>
                      <Text style={styles.cardName} numberOfLines={1}>{profile.full_name}</Text>
                      <View style={[styles.typeBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.typeBadgeText, { color: badge.text }]}>{badge.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.cardEmail} numberOfLines={1}>{profile.email ?? '—'}</Text>
                  </View>
                  {/* Right */}
                  <View style={styles.cardRight}>
                    {updatingId === profile.id ? (
                      <ActivityIndicator size="small" color={P} />
                    ) : (
                      <AppSwitch
                        value={profile.is_active ?? true}
                        onValueChange={() => handleToggleActive(profile)}
                        accentColor={switchColor}
                      />
                    )}
                    <TouchableOpacity style={styles.actionBtn} onPress={() => setEditingProfile(profile)} activeOpacity={0.7}>
                      <Feather name="edit-2" size={14} color="#6C6C70" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeleteUser(profile)} activeOpacity={0.7}>
                      <Feather name="trash-2" size={14} color={ERR} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Filter panel — matches ClinicsScreen right-aligned dropdown */}
      <Modal visible={showFilter} transparent animationType="fade" onRequestClose={() => setShowFilter(false)}>
        <TouchableOpacity style={fp.backdrop} activeOpacity={1} onPress={() => setShowFilter(false)}>
          <View style={fp.panel} onStartShouldSetResponder={() => true}>
            <View style={fp.header}>
              <View style={fp.headerLeft}>
                <MaterialCommunityIcons name={'tune-variant' as any} size={16} color="#0F172A" />
                <Text style={fp.headerTitle}>Filtrele</Text>
                {activeFilterCount > 0 && (
                  <View style={fp.countBadge}>
                    <Text style={fp.countBadgeText}>{activeFilterCount}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => { setDraftStatus('all'); }} activeOpacity={0.7}>
                <Text style={fp.clearText}>Temizle</Text>
              </TouchableOpacity>
            </View>
            <View style={fp.divider} />
            <View style={fp.section}>
              <Text style={fp.sectionLabel}>DURUM</Text>
              <View style={fp.chipRow}>
                {([['all','Tümü'],['active','Aktif'],['inactive','Pasif']] as [StatusFilter,string][]).map(([val,lbl]) => (
                  <TouchableOpacity key={val} style={[fp.chip, draftStatus === val && fp.chipActive]}
                    onPress={() => setDraftStatus(val)} activeOpacity={0.75}>
                    <Text style={[fp.chipText, draftStatus === val && fp.chipTextActive]}>{lbl}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={fp.divider} />
            <View style={fp.footer}>
              <TouchableOpacity style={fp.cancelBtn} onPress={() => setShowFilter(false)} activeOpacity={0.7}>
                <Text style={fp.cancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={fp.applyBtn} onPress={() => { setStatusFilter(draftStatus); setShowFilter(false); }} activeOpacity={0.7}>
                <Text style={fp.applyText}>Uygula</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

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
            <TouchableOpacity onPress={onClose} style={m.closeBtn}>
              <Feather name="x" size={16} color="#0F172A" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={m.body}>

            {/* ── Kişisel Bilgiler ── */}
            <Text style={m.sectionLabel}>Kişisel Bilgiler</Text>

            <Text style={m.fieldLabel}>Ad Soyad *</Text>
            <TextInput style={m.input} value={fullName} onChangeText={setFullName}
              placeholder="Örn: Ahmet Yılmaz" placeholderTextColor={'#AEAEB2'} />

            <Text style={m.fieldLabel}>Telefon</Text>
            <TextInput style={m.input} value={phone} onChangeText={setPhone}
              placeholder="0555 000 00 00" placeholderTextColor={'#AEAEB2'}
              keyboardType="phone-pad" />

            {isDoctorUser && (
              <>
                <Text style={m.fieldLabel}>Klinik Adı</Text>
                <TextInput style={m.input} value={clinicName} onChangeText={setClinicName}
                  placeholder="Örn: Sağlık Kliniği" placeholderTextColor={'#AEAEB2'} />
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
              placeholder="kullanici@ornek.com" placeholderTextColor={'#AEAEB2'}
              keyboardType="email-address" autoCapitalize="none" />

            <Text style={m.fieldLabel}>Yeni Şifre</Text>
            <View style={m.inputRow}>
              <TextInput
                style={[m.input, { flex: 1, marginBottom: 0 }]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Boş bırakılırsa değişmez"
                placeholderTextColor={'#AEAEB2'}
                secureTextEntry={!showPass}
              />
              <TouchableOpacity style={m.eyeBtn} onPress={() => setShowPass(v => !v)}>
                <MaterialCommunityIcons
                  name={showPass ? 'eye-off-outline' : 'eye-outline'}
                  size={18} color={'#AEAEB2'}
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
              <AppSwitch
                value={isActive}
                onValueChange={setIsActive}
                accentColor={P}
              />
            </View>

            {error ? (
              <View style={m.errorBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={14} color={ERR} />
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
              <MaterialCommunityIcons name="close" size={22} color={'#6C6C70'} />
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
              placeholder="Örn: Ahmet Yılmaz" placeholderTextColor={'#AEAEB2'} />

            <Text style={m.fieldLabel}>E-posta *</Text>
            <TextInput style={m.input} value={email} onChangeText={setEmail}
              placeholder="kullanici@ornek.com" placeholderTextColor={'#AEAEB2'}
              keyboardType="email-address" autoCapitalize="none" />

            <Text style={m.fieldLabel}>Şifre *</Text>
            <TextInput style={m.input} value={password} onChangeText={setPassword}
              placeholder="En az 6 karakter" placeholderTextColor={'#AEAEB2'}
              secureTextEntry />

            {error ? (
              <View style={m.errorBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={14} color={ERR} />
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
  safe:      { flex: 1, backgroundColor: '#FFFFFF' },
  container: { padding: 24, paddingBottom: 60 },

  // Toolbar — mirrors ClinicsScreen
  toolbarRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  tabsScroll:   { flex: 1 },
  tabsContent:  { alignItems: 'center', paddingRight: 8 },
  tabBar:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 100, padding: 3, gap: 2 },
  tabItem:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100 },
  tabItemActive:{ backgroundColor: '#FFFFFF', boxShadow: '0 1px 6px rgba(15,23,42,0.12)' } as any,
  tabText:      { fontSize: 13, fontWeight: '500', color: '#94A3B8' },
  tabTextActive:{ fontSize: 13, fontWeight: '600', color: '#0F172A' },

  // Icon buttons
  rightGroup:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn:       { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  iconBtnActive: { backgroundColor: '#F1F5F9' },
  filterBadge:     { position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
  filterBadgeText: { fontSize: 8, fontWeight: '700', color: '#FFFFFF' },

  // Add button
  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: P, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 100 },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  // Search
  searchRow:         { marginBottom: 12 },
  searchWrap:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', paddingHorizontal: 12, height: 42 },
  searchWrapFocused: { borderColor: '#CBD5E1' },
  searchInput:       { flex: 1, fontSize: 14, color: '#1C1C1E', height: 42, outlineStyle: 'none' } as any,

  // User cards
  cardList:    { gap: 10 },
  card:        {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  } as any,
  cardInactive: { opacity: 0.5 },
  avatar:       { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  avatarImg:    { width: 48, height: 48, borderRadius: 14 },
  avatarText:   { fontSize: 18, fontWeight: '800' },
  cardInfo:     { flex: 1, gap: 4 },
  cardNameRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardName:     { fontSize: 15, fontWeight: '700', color: '#0F172A', letterSpacing: -0.3 },
  cardEmail:    { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  typeBadge:    { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText:{ fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  cardRight:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },

  // Empty
  empty:      { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  emptySub:   { fontSize: 13, color: '#AEAEB2' },
});

const fp = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.25)', alignItems: 'flex-end', paddingTop: 70, paddingRight: 24 },
  panel:    { width: 300, backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden',
              shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 32 },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  countBadge:  { backgroundColor: '#0F172A', borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  countBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  clearText:   { fontSize: 13, fontWeight: '500', color: '#94A3B8' },
  divider:     { height: 1, backgroundColor: '#F1F5F9' },
  section:     { paddingHorizontal: 16, paddingVertical: 14 },
  sectionLabel:{ fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 },
  chipRow:     { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: '#F1F5F9', backgroundColor: '#FAFAFA' },
  chipActive:  { borderColor: '#0F172A', backgroundColor: '#F1F5F9' },
  chipText:    { fontSize: 13, fontWeight: '500', color: '#94A3B8' },
  chipTextActive: { color: '#0F172A', fontWeight: '600' },
  footer:      { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  cancelBtn:   { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  cancelText:  { fontSize: 14, fontWeight: '600', color: '#6C6C70' },
  applyBtn:    { flex: 2, paddingVertical: 11, borderRadius: 10, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
  applyText:   { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});

const m = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  popup: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    width: '100%', maxWidth: 520, maxHeight: '92%', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15, shadowRadius: 48,
  } as any,
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 22, paddingBottom: 18,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  title:    { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  body: { padding: 20 },

  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: '#64748B',
    letterSpacing: 0.5, marginBottom: 10, marginTop: 4,
  },
  fieldLabel: { fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 },
  input: {
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#0F172A',
    backgroundColor: '#FFFFFF', marginBottom: 14, outlineStyle: 'none',
  } as any,

  closeBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
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
  hint: { fontSize: 11, color: '#AEAEB2', marginBottom: 14, marginTop: 2 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10, marginBottom: 12,
  },
  errorText: { fontSize: 13, color: ERR, flex: 1 },

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
