import React, { useEffect, useState, useMemo } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppSwitch } from '../../core/ui/AppSwitch';
import { SlideTabBar } from '../../core/ui/SlideTabBar';
import { IconBtn } from '../../core/ui/IconBtn';
import { supabase } from '../../core/api/supabase';
const K   = '#0F172A';
const ERR = '#FF3B30';
const BG  = '#F7F9FB';
import { Profile } from '../../lib/types';

import { AppIcon } from '../../core/ui/AppIcon';

type FilterType = 'all' | 'admin' | 'lab' | 'doctor';
type StatusFilter = 'all' | 'active' | 'inactive';

type NewUserRole = 'admin' | 'manager' | 'technician' | 'doctor' | 'clinic_admin';

const ROLE_OPTIONS: { key: NewUserRole; label: string; sub: string; icon: string }[] = [
  { key: 'admin',        label: 'Admin',        sub: 'Tam yönetim yetkisi',    icon: 'shield-outline' },
  { key: 'manager',      label: 'Mesul Müdür',  sub: 'Lab yöneticisi',         icon: 'account-circle-outline' },
  { key: 'technician',   label: 'Teknisyen',    sub: 'Üretim personeli',       icon: 'wrench-outline' },
  { key: 'doctor',       label: 'Muayenehane',  sub: 'Tek hekim, kendi kliniği',  icon: 'stethoscope' },
  { key: 'clinic_admin', label: 'Klinik',       sub: 'Çok hekimli kurum',         icon: 'office-building-outline' },
];

function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function fmtDate(dateStr?: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const months = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

interface UserStats {
  total: number;
  active: number;
  overdue: number;
  activeOrders: { id: string; order_number: string; item: string; overdue: boolean }[];
}

export default function AdminUsersScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 1100;

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
  const [selectedId,     setSelectedId]     = useState<string | null>(null);
  const [stats,          setStats]          = useState<UserStats | null>(null);
  const [statsLoading,   setStatsLoading]   = useState(false);

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

  const loadStats = async (userId: string) => {
    setStatsLoading(true);
    try {
      const { data: orders } = await supabase
        .from('work_orders')
        .select('id, order_number, status, delivery_date, order_items(item_name)')
        .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
        .order('created_at', { ascending: false });

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const all = orders ?? [];
      const active = all.filter((o: any) => o.status !== 'teslim_edildi');
      const overdue = active.filter((o: any) => {
        if (!o.delivery_date) return false;
        return new Date(o.delivery_date) < today;
      });

      setStats({
        total: all.length,
        active: active.length,
        overdue: overdue.length,
        activeOrders: active.slice(0, 4).map((o: any) => ({
          id: o.id,
          order_number: o.order_number ?? '—',
          item: o.order_items?.[0]?.item_name ?? 'İş Emri',
          overdue: o.delivery_date ? new Date(o.delivery_date) < today : false,
        })),
      });
    } catch {
      setStats({ total: 0, active: 0, overdue: 0, activeOrders: [] });
    } finally {
      setStatsLoading(false);
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
          else {
            setProfiles(prev => prev.filter(p => p.id !== profile.id));
            if (selectedId === profile.id) { setSelectedId(null); setStats(null); }
          }
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

  const TYPE_TABS: { key: FilterType; label: string }[] = [
    { key: 'all',   label: 'Tümü' },
    { key: 'admin', label: 'Admin' },
    { key: 'lab',   label: 'Lab' },
  ];

  const typeBadge = (profile: Profile) =>
    profile.user_type === 'admin'   ? { bg: K,         text: '#FFFFFF', label: 'Admin',     avatarBg: '#1E293B', avatarText: '#FFFFFF', roleLabel: 'Admin' } :
    profile.user_type === 'doctor'  ? { bg: '#DBEAFE', text: '#1D4ED8', label: 'Hekim',     avatarBg: '#EFF6FF', avatarText: '#2563EB', roleLabel: 'Hekim' } :
    profile.role      === 'manager' ? { bg: '#E2E8F0', text: K,         label: 'Müdür',     avatarBg: '#E2E8F0', avatarText: K,         roleLabel: 'Mesul Müdür' } :
                                      { bg: '#F1F5F9', text: '#475569', label: 'Teknisyen', avatarBg: '#F1F5F9', avatarText: '#475569', roleLabel: 'Teknisyen' };

  const selectedProfile = useMemo(
    () => profiles.find(p => p.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  const handleSelect = (profile: Profile) => {
    if (selectedId === profile.id) return;
    setSelectedId(profile.id);
    setStats(null);
    loadStats(profile.id);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* Tabs + search + actions — single row */}
        <View style={styles.subToolbar}>
          <SlideTabBar
            items={TYPE_TABS.map(t => ({
              key: t.key,
              label: t.label,
              count: t.key === 'all'
                ? profiles.length
                : profiles.filter(p => p.user_type === t.key).length,
            }))}
            activeKey={typeFilter}
            onChange={(k) => setTypeFilter(k as any)}
            accentColor={K}
          />

          <View style={{ flex: 1 }} />

          <IconBtn active={searchExpanded || search.length > 0} onPress={() => setSearchExpanded(!searchExpanded)}>
            <AppIcon name="search" size={20} color={(searchExpanded || search.length > 0) ? K : '#64748B'} />
          </IconBtn>
          <TouchableOpacity
            style={[styles.headerBtn, activeFilterCount > 0 && styles.headerBtnActive]}
            onPress={() => { setDraftStatus(statusFilter); setShowFilter(true); }}
            activeOpacity={0.75}
          >
            <AppIcon name={'tune-variant' as any} size={16} color={K} />
            <Text style={styles.headerBtnText}>Filtrele</Text>
            {activeFilterCount > 0 && (
              <View style={styles.headerBtnBadge}><Text style={styles.headerBtnBadgeText}>{activeFilterCount}</Text></View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)} activeOpacity={0.85}>
            <AppIcon name="user-plus" size={15} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Yeni Kullanıcı</Text>
          </TouchableOpacity>
        </View>

        {(searchExpanded || search.length > 0) && (
          <View style={styles.searchRow}>
            <View style={[styles.searchWrap, searchFocused && styles.searchWrapFocused]}>
              <AppIcon name="search" size={16} color={searchFocused ? K : '#AEAEB2'} />
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
                  <AppIcon name="x-circle" size={15} color="#AEAEB2" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Main: List + Detail Panel */}
        <View style={[styles.grid, isWide && styles.gridWide]}>
          {/* List column */}
          <View style={[styles.listCol, isWide && styles.listColWide]}>
            {loading ? (
              <ActivityIndicator size="large" color={K} style={{ marginTop: 60 }} />
            ) : filtered.length === 0 ? (
              <View style={styles.empty}>
                <AppIcon name="account-off-outline" size={40} color="#AEAEB2" />
                <Text style={styles.emptyTitle}>{q ? 'Sonuç bulunamadı' : 'Kullanıcı bulunamadı'}</Text>
                {q && <Text style={styles.emptySub}>"{q}" ile eşleşen kullanıcı yok</Text>}
              </View>
            ) : (
              <View style={styles.cardList}>
                {filtered.map((profile) => {
                  const badge = typeBadge(profile);
                  const selected = selectedId === profile.id;
                  return (
                    <TouchableOpacity
                      key={profile.id}
                      activeOpacity={0.85}
                      onPress={() => handleSelect(profile)}
                      style={[styles.card, selected ? styles.cardSelected : null, !profile.is_active && styles.cardInactive]}
                    >
                      {selected && <View style={styles.cardAccent} />}
                      <View style={[styles.avatar, { backgroundColor: badge.avatarBg }]}>
                        {(profile as any).avatar_url
                          ? <Image source={{ uri: (profile as any).avatar_url }} style={styles.avatarImg} />
                          : <Text style={[styles.avatarText, { color: badge.avatarText }]}>
                              {initials(profile.full_name)}
                            </Text>}
                      </View>
                      <View style={styles.cardInfo}>
                        <Text style={styles.cardName} numberOfLines={1}>{profile.full_name}</Text>
                        <View style={styles.cardMetaRow}>
                          <View style={[styles.typeBadge, { backgroundColor: badge.bg }]}>
                            <Text style={[styles.typeBadgeText, { color: badge.text }]}>{badge.label}</Text>
                          </View>
                          <Text style={styles.cardEmail} numberOfLines={1}>{profile.email ?? '—'}</Text>
                        </View>
                      </View>
                      <View style={styles.cardRight}>
                        <View style={styles.toggleCluster}>
                          <Text style={[styles.toggleLabel, profile.is_active ? styles.toggleLabelActive : styles.toggleLabelInactive]}>
                            {profile.is_active ? 'AKTİF' : 'PASİF'}
                          </Text>
                          {updatingId === profile.id ? (
                            <ActivityIndicator size="small" color={K} />
                          ) : (
                            <AppSwitch
                              value={profile.is_active ?? true}
                              onValueChange={() => handleToggleActive(profile)}
                              accentColor={K}
                            />
                          )}
                        </View>
                        <View style={styles.actionCluster}>
                          <TouchableOpacity style={styles.actionBtn} onPress={() => setEditingProfile(profile)} activeOpacity={0.7}>
                            <AppIcon name="edit-2" size={14} color="#64748B" />
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeleteUser(profile)} activeOpacity={0.7}>
                            <AppIcon name="trash-2" size={14} color={ERR} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Detail Panel */}
          {selectedProfile && (
            <View style={[styles.detailCol, isWide && styles.detailColWide]}>
              <DetailPanel
                profile={selectedProfile}
                badge={typeBadge(selectedProfile)}
                stats={stats}
                loading={statsLoading}
                primary={K}
                onClose={() => { setSelectedId(null); setStats(null); }}
              />
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Filter panel */}
      <Modal visible={showFilter} transparent animationType="fade" onRequestClose={() => setShowFilter(false)}>
        <TouchableOpacity style={fp.backdrop} activeOpacity={1} onPress={() => setShowFilter(false)}>
          <View style={fp.panel} onStartShouldSetResponder={() => true}>
            <View style={fp.header}>
              <View style={fp.headerLeft}>
                <AppIcon name={'tune-variant' as any} size={16} color={K} />
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

// ─── Detail Panel ────────────────────────────────────────────────────────────

function DetailPanel({
  profile, badge, stats, loading, primary, onClose,
}: {
  profile: Profile;
  badge: { avatarBg: string; avatarText: string; roleLabel: string };
  stats: UserStats | null;
  loading: boolean;
  primary: string;
  onClose: () => void;
}) {
  const productivity = stats && stats.total > 0
    ? Math.round(((stats.total - stats.active) / stats.total) * 100)
    : null;

  return (
    <View style={dp.card}>
      <TouchableOpacity style={dp.closeBtn} onPress={onClose} activeOpacity={0.7} hitSlop={10}>
        <AppIcon name="x" size={14} color="#64748B" />
      </TouchableOpacity>

      <View style={dp.hero}>
        <View style={dp.avatarWrap}>
          <View style={[dp.avatarGlow, { backgroundColor: primary }]} />
          <View style={[dp.avatar, { backgroundColor: badge.avatarBg }]}>
            {(profile as any).avatar_url
              ? <Image source={{ uri: (profile as any).avatar_url }} style={dp.avatarImg} />
              : <Text style={[dp.avatarText, { color: badge.avatarText }]}>{initials(profile.full_name)}</Text>}
          </View>
        </View>
        <Text style={dp.name}>{profile.full_name}</Text>
        <Text style={[dp.role, { color: primary }]}>{badge.roleLabel.toUpperCase()}</Text>
        <Text style={dp.joined}>Katılım: {fmtDate(profile.created_at)}</Text>
      </View>

      <View style={dp.metricGrid}>
        <MetricCell label="Toplam İş" value={loading ? '…' : (stats?.total ?? 0).toString()} icon="flask-outline" tint={primary} />
        <MetricCell label="Tamamlanma" value={loading ? '…' : productivity !== null ? `${productivity}%` : '—'} icon="chart-line" tint={primary} accent />
        <MetricCell label="Geciken" value={loading ? '…' : (stats?.overdue ?? 0).toString()} icon="alert-outline" tint="#DC2626" />
        <MetricCell label="Aktif" value={loading ? '…' : (stats?.active ?? 0).toString()} icon="progress-clock" tint="#64748B" />
      </View>

      <View style={dp.listSection}>
        <Text style={dp.listTitle}>AKTİF İŞLER</Text>
        {loading ? (
          <ActivityIndicator size="small" color={primary} style={{ marginTop: 8 }} />
        ) : !stats?.activeOrders?.length ? (
          <Text style={dp.listEmpty}>Aktif iş yok</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {stats.activeOrders.map(o => (
              <View key={o.id} style={dp.orderRow}>
                <View style={[dp.dot, { backgroundColor: o.overdue ? '#DC2626' : primary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={dp.orderNo}>{o.order_number}</Text>
                  <Text style={dp.orderItem} numberOfLines={1}>{o.item}</Text>
                </View>
                <AppIcon name="chevron-right" size={14} color="#CBD5E1" />
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function MetricCell({ label, value, icon, tint, accent }: {
  label: string; value: string; icon: string; tint: string; accent?: boolean;
}) {
  return (
    <View style={dp.metric}>
      <View style={dp.metricIconWrap}>
        <AppIcon name={icon as any} size={64} color={tint} style={{ opacity: 0.1 }} />
      </View>
      <Text style={dp.metricLabel}>{label}</Text>
      <Text style={[dp.metricValue, accent && { color: tint }]}>{value}</Text>
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
              <AppIcon name="x" size={16} color={K} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={m.body}>

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
                        <AppIcon name={icon as any} size={20} color={active ? '#FFF' : '#374151'} />
                        <Text style={[m.roleLabel, active && m.roleLabelActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

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
                <AppIcon
                  name={showPass ? 'eye-off-outline' : 'eye-outline'}
                  size={18} color={'#AEAEB2'}
                />
              </TouchableOpacity>
            </View>
            <Text style={m.hint}>En az 6 karakter. Boş bırakılırsa şifre değişmez.</Text>

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
                accentColor={K}
              />
            </View>

            {error ? (
              <View style={m.errorBox}>
                <AppIcon name="alert-circle-outline" size={14} color={ERR} />
                <Text style={m.errorText}>{error}</Text>
              </View>
            ) : null}

            {successMsg ? (
              <View style={m.successBox}>
                <AppIcon name="check-circle-outline" size={14} color="#16A34A" />
                <Text style={m.successText}>{successMsg}</Text>
              </View>
            ) : null}

          </ScrollView>

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
                  <AppIcon name="content-save-outline" size={16} color="#FFFFFF" />
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
  const [clinicName, setClinicName] = useState('');
  const [phone, setPhone] = useState('');
  const [level, setLevel] = useState<'junior' | 'mid' | 'senior'>('mid');
  const [stagePerms, setStagePerms] = useState<string[]>([]);
  const [caseTypes, setCaseTypes] = useState<string[]>([]);
  const [salary, setSalary] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const isDoctorType = selectedRole === 'doctor' || selectedRole === 'clinic_admin';
  const isTechnician = selectedRole === 'technician';

  const reset = () => {
    setFullName(''); setEmail(''); setPassword('');
    setSelectedRole('technician'); setClinicName(''); setPhone('');
    setLevel('mid'); setStagePerms([]); setCaseTypes([]); setSalary(''); setError('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSave = async () => {
    setError('');
    if (!fullName.trim())    { setError('Ad Soyad zorunludur'); return; }
    if (!email.trim())       { setError('E-posta zorunludur'); return; }
    if (password.length < 6) { setError('Şifre en az 6 karakter olmalıdır'); return; }
    if (isDoctorType && !clinicName.trim()) { setError('Klinik adı zorunludur'); return; }

    let user_type: string;
    let role: string | null;

    if (selectedRole === 'admin') {
      user_type = 'admin'; role = null;
    } else if (selectedRole === 'doctor' || selectedRole === 'clinic_admin') {
      user_type = selectedRole; role = null;
    } else {
      user_type = 'lab'; role = selectedRole;
    }

    setSaving(true);
    try {
      const body: Record<string, any> = {
        email: email.trim(), password, full_name: fullName.trim(), user_type, role,
      };
      if (isDoctorType) {
        body.clinic_name = clinicName.trim();
        if (phone.trim()) body.phone = phone.trim();
      }
      if (isTechnician) {
        body.specialty = caseTypes.join(', ') || null;
        body.department = stagePerms.join(', ') || null;
        body.level = level;
        body.monthly_salary = salary ? Number(salary) : null;
      }
      const { data, error: fnError } = await supabase.functions.invoke('admin-create-user', { body });
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
              <AppIcon name="close" size={22} color={'#6C6C70'} />
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
                    <AppIcon name={opt.icon as any} size={20} color={active ? '#FFFFFF' : '#374151'} />
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

            {isDoctorType && (
              <>
                <Text style={m.fieldLabel}>Klinik Adı *</Text>
                <TextInput style={m.input} value={clinicName} onChangeText={setClinicName}
                  placeholder="Örn: Yılmaz Diş Kliniği" placeholderTextColor={'#AEAEB2'} />

                <Text style={m.fieldLabel}>Telefon</Text>
                <TextInput style={m.input} value={phone} onChangeText={setPhone}
                  placeholder="05XX XXX XX XX" placeholderTextColor={'#AEAEB2'}
                  keyboardType="phone-pad" />

                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: 'rgba(107,168,136,0.1)', borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
                }}>
                  <AppIcon name="check-circle-outline" size={14} color="#6BA888" />
                  <Text style={{ fontSize: 11, color: '#6BA888', flex: 1 }}>
                    Admin tarafından eklenen hekimler otomatik onaylanır. OTP ve laboratuvar onayı atlanır.
                  </Text>
                </View>
              </>
            )}

            {isTechnician && (
              <>
                <Text style={m.sectionLabel}>Teknisyen Bilgileri</Text>

                {/* Seviye */}
                <Text style={[m.fieldLabel, { color: K }]}>Seviye</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  {([['junior', 'Junior'], ['mid', 'Mid'], ['senior', 'Senior']] as const).map(([key, label]) => {
                    const active = level === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        onPress={() => setLevel(key)}
                        style={{
                          flex: 1, paddingVertical: 10, borderRadius: 20, alignItems: 'center',
                          borderWidth: 1.5,
                          borderColor: active ? K : '#E5E7EB',
                          backgroundColor: active ? K : '#FAFAFA',
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#FFF' : '#374151' }}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Stage Yetkileri */}
                <Text style={[m.fieldLabel, { color: K }]}>Stage Yetkileri</Text>
                <Text style={{ fontSize: 10, color: '#94A3B8', marginBottom: 8, marginTop: -4 }}>Hangi aşamayı yapabilir?</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {['Triyaj', 'Tasarım', 'CAM', 'Frezeleme', 'Sinterleme', 'Bitiş', 'Kalite Kontrol'].map((stage) => {
                    const active = stagePerms.includes(stage);
                    return (
                      <TouchableOpacity
                        key={stage}
                        onPress={() => setStagePerms(active ? stagePerms.filter(s => s !== stage) : [...stagePerms, stage])}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                          borderWidth: 1.5,
                          borderColor: active ? '#0F172A' : '#E5E7EB',
                          backgroundColor: active ? '#F8FAFC' : '#FAFAFA',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '500', color: active ? '#0F172A' : '#6B7280' }}>{stage}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Vaka Türleri */}
                <Text style={[m.fieldLabel, { color: K }]}>Vaka Türleri</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {['zirconia', 'emax', 'pmma', 'metal', 'pfm'].map((ct) => {
                    const active = caseTypes.includes(ct);
                    return (
                      <TouchableOpacity
                        key={ct}
                        onPress={() => setCaseTypes(active ? caseTypes.filter(c => c !== ct) : [...caseTypes, ct])}
                        style={{
                          paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                          backgroundColor: active ? '#0F172A' : '#FAFAFA',
                          borderWidth: 1.5,
                          borderColor: active ? '#0F172A' : '#E5E7EB',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#FFF' : '#374151' }}>{ct}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Saat Ücreti */}
                <Text style={[m.fieldLabel, { color: K }]}>Aylık Maaş (₺)</Text>
                <TextInput style={m.input} value={salary} onChangeText={setSalary}
                  placeholder="0" placeholderTextColor={'#AEAEB2'} keyboardType="numeric" />
              </>
            )}

            {error ? (
              <View style={m.errorBox}>
                <AppIcon name="alert-circle-outline" size={14} color={ERR} />
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
                  <AppIcon name="check" size={16} color="#FFFFFF" />
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
  safe:      { flex: 1, backgroundColor: BG },
  container: { padding: 24, paddingBottom: 60, maxWidth: 1440, width: '100%', alignSelf: 'center' },

  pageHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28 },
  pageTitle:  { fontSize: 34, fontWeight: '800', color: K, letterSpacing: -0.8, lineHeight: 40 },
  pageSub:    { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 1.2, marginTop: 4 },

  headerActions:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(226,232,240,0.4)', padding: 6, borderRadius: 14 },
  headerBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  headerBtnActive:  { backgroundColor: '#F1F5F9' },
  headerBtnText:    { fontSize: 13, fontWeight: '600', color: K },
  headerBtnBadge:   { backgroundColor: K, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 2 },
  headerBtnBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  addBtn:           { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: K, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
  addBtnText:       { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  subToolbar:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  tabBar:          { flexDirection: 'row', alignItems: 'center', gap: 4 },
  searchToggle:       { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F4F6' },
  searchToggleActive: { backgroundColor: '#E6E8EA' },

  searchRow:         { marginBottom: 12 },
  searchWrap:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', paddingHorizontal: 12, height: 42 },
  searchWrapFocused: { borderColor: '#CBD5E1' },
  searchInput:       { flex: 1, fontSize: 14, color: K, height: 42, outlineStyle: 'none' } as any,

  grid:        { gap: 24 },
  gridWide:    { flexDirection: 'row', alignItems: 'flex-start' },
  listCol:     { flex: 1, gap: 12 },
  listColWide: { flex: 2, minWidth: 0 },
  detailCol:   { width: '100%' },
  detailColWide: { flex: 1, position: 'sticky', top: 24 } as any,

  cardList:    { gap: 12 },
  card:        {
    backgroundColor: '#F2F4F6', borderRadius: 14, padding: 16, paddingLeft: 20,
    flexDirection: 'row', alignItems: 'center', gap: 14, position: 'relative', overflow: 'hidden',
  } as any,
  cardSelected: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2, borderColor: 'rgba(15,23,42,0.15)',
    boxShadow: '0 8px 32px rgba(15,23,42,0.05)',
  } as any,
  cardAccent:   { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: K },
  cardInactive: { opacity: 0.55 },
  avatar:       { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  avatarImg:    { width: 52, height: 52, borderRadius: 26 },
  avatarText:   { fontSize: 17, fontWeight: '800' },
  cardInfo:     { flex: 1, gap: 6, minWidth: 0 },
  cardName:     { fontSize: 16, fontWeight: '800', color: K, letterSpacing: -0.3 },
  cardMetaRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  typeBadge:    { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText:{ fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  cardEmail:    { fontSize: 13, color: '#64748B', fontWeight: '500', flexShrink: 1 },

  cardRight:       { flexDirection: 'row', alignItems: 'center', gap: 14 },
  toggleCluster:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleLabel:     { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  toggleLabelActive:   { color: K },
  toggleLabelInactive: { color: '#94A3B8' },
  actionCluster:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtn:       { width: 32, height: 32, borderRadius: 8, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },

  empty:      { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: K },
  emptySub:   { fontSize: 13, color: '#AEAEB2' },
});

const dp = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
    overflow: 'hidden',
    boxShadow: '0 16px 40px rgba(15,23,42,0.04)',
  } as any,
  closeBtn: { position: 'absolute', top: 12, right: 12, zIndex: 2, width: 28, height: 28, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },

  hero: { padding: 28, paddingBottom: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  avatarWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: 14, position: 'relative' },
  avatarGlow: { position: 'absolute', inset: 0, borderRadius: 48, opacity: 0.18, filter: 'blur(20px)' } as any,
  avatar:     { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 4, borderColor: '#FFFFFF', boxShadow: '0 8px 24px rgba(15,23,42,0.08)' } as any,
  avatarImg:  { width: 88, height: 88, borderRadius: 44 },
  avatarText: { fontSize: 28, fontWeight: '800' },
  name:       { fontSize: 22, fontWeight: '800', color: K, letterSpacing: -0.5, marginBottom: 2 },
  role:       { fontSize: 12, fontWeight: '700', letterSpacing: 1.0, marginBottom: 6 },
  joined:     { fontSize: 12, color: '#94A3B8', fontWeight: '500' },

  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 20 },
  metric: {
    flexGrow: 1, flexBasis: '45%', minWidth: 120,
    backgroundColor: '#F8FAFC', borderRadius: 12,
    padding: 14, paddingRight: 16, height: 92,
    justifyContent: 'space-between', position: 'relative', overflow: 'hidden',
  },
  metricIconWrap: { position: 'absolute', top: -10, right: -10 },
  metricLabel:    { fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 0.5, textTransform: 'uppercase' },
  metricValue:    { fontSize: 22, fontWeight: '800', color: K, letterSpacing: -0.5 },

  listSection: { paddingHorizontal: 20, paddingBottom: 20 },
  listTitle:   { fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 0.8, marginBottom: 12 },
  listEmpty:   { fontSize: 13, color: '#94A3B8', paddingVertical: 6 },
  orderRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F1F5F9', borderRadius: 10, padding: 12 },
  dot:         { width: 8, height: 8, borderRadius: 4 },
  orderNo:     { fontSize: 13, fontWeight: '800', color: K },
  orderItem:   { fontSize: 11, color: '#64748B', marginTop: 2 },
});

const fp = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.25)', alignItems: 'flex-end', paddingTop: 70, paddingRight: 24 },
  panel:    { width: 300, backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden',
              shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 32 },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: K },
  countBadge:  { backgroundColor: K, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  countBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  clearText:   { fontSize: 13, fontWeight: '500', color: '#94A3B8' },
  divider:     { height: 1, backgroundColor: '#F1F5F9' },
  section:     { paddingHorizontal: 16, paddingVertical: 14 },
  sectionLabel:{ fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 },
  chipRow:     { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: '#F1F5F9', backgroundColor: '#FAFAFA' },
  chipActive:  { borderColor: K, backgroundColor: '#F1F5F9' },
  chipText:    { fontSize: 13, fontWeight: '500', color: '#94A3B8' },
  chipTextActive: { color: K, fontWeight: '600' },
  footer:      { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  cancelBtn:   { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  cancelText:  { fontSize: 14, fontWeight: '600', color: '#6C6C70' },
  applyBtn:    { flex: 2, paddingVertical: 11, borderRadius: 10, backgroundColor: K, alignItems: 'center', justifyContent: 'center' },
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
  title:    { fontSize: 18, fontWeight: '700', color: K },
  subtitle: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  body: { padding: 20 },

  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: '#64748B',
    letterSpacing: 0.5, marginBottom: 10, marginTop: 4,
  },
  fieldLabel: { fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 },
  input: {
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: K,
    backgroundColor: '#FFFFFF', marginBottom: 14, outlineStyle: 'none',
  } as any,

  closeBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  roleGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  roleRow:  { flexDirection: 'row', gap: 8, marginBottom: 20 },
  roleCard: {
    flex: 1, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA', alignItems: 'center', gap: 4,
  },
  roleCardActive: { backgroundColor: K, borderColor: K },
  roleLabel: { fontSize: 12, fontWeight: '700', color: '#374151', textAlign: 'center' },
  roleLabelActive: { color: '#FFFFFF' },
  roleSub: { fontSize: 10, color: '#9CA3AF', textAlign: 'center' },
  roleSubActive: { color: 'rgba(255,255,255,0.6)' },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F9FAFB', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 16,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: K, marginBottom: 2 },
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
    flex: 2, backgroundColor: K, borderRadius: 10,
    paddingVertical: 13, alignItems: 'center', flexDirection: 'row',
    justifyContent: 'center', gap: 6,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
