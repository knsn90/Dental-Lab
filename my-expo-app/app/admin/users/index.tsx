import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAdminUsers, AdminUser } from '../../../modules/admin/users/hooks';

const C = {
  primary: '#2563EB', primaryBg: '#EFF6FF',
  accent: '#7C3AED', accentBg: '#F5F3FF',
  background: '#E8EDF5', surface: '#FFFFFF', surfaceAlt: '#F8FAFC',
  textPrimary: '#0F172A', textSecondary: '#64748B', textMuted: '#94A3B8',
  border: '#E2E8F0',
  success: '#059669', successBg: '#ECFDF5',
  warning: '#D97706', warningBg: '#FFFBEB',
  danger: '#DC2626', dangerBg: '#FEF2F2',
};

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}

const TABS = [
  { key: 'all', label: 'Tümü' },
  { key: 'doctor', label: 'Hekimler' },
  { key: 'lab', label: 'Lab' },
];

interface UserCardProps {
  user: AdminUser;
  onToggleActive: () => void;
  onDetail: () => void;
}

function UserCard({ user, onToggleActive, onDetail }: UserCardProps) {
  const isDoctor = user.user_type === 'doctor';
  const avatarColor = isDoctor ? C.primary : C.accent;
  const avatarBg = isDoctor ? C.primaryBg : C.accentBg;

  return (
    <View style={styles.userCard}>
      {/* Avatar */}
      <View style={styles.cardHeader}>
        <View style={[styles.avatarCircle, { backgroundColor: avatarBg }]}>
          <Text style={[styles.avatarText, { color: avatarColor }]}>
            {getInitials(user.full_name)}
          </Text>
        </View>
        <View style={styles.userTypeBadgeContainer}>
          <View style={[styles.userTypeBadge, { backgroundColor: isDoctor ? C.primaryBg : C.accentBg }]}>
            <Text style={[styles.userTypeBadgeText, { color: isDoctor ? C.primary : C.accent }]}>
              {isDoctor ? '👨‍⚕️ Hekim' : '🔬 Lab'}
            </Text>
          </View>
        </View>
      </View>

      {/* Info */}
      <Text style={styles.userName}>{user.full_name}</Text>
      {user.role && <Text style={styles.userRole}>{user.role}</Text>}
      {user.clinic_name && <Text style={styles.userClinic}>🏥 {user.clinic_name}</Text>}
      {user.phone && <Text style={styles.userPhone}>📞 {user.phone}</Text>}
      <Text style={styles.userDate}>Kayıt: {formatDate(user.created_at)}</Text>

      {/* Footer */}
      <View style={styles.cardFooter}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{user.is_active ? 'Aktif' : 'Pasif'}</Text>
          <Switch
            value={user.is_active}
            onValueChange={onToggleActive}
            trackColor={{ false: C.border, true: C.success }}
            thumbColor={user.is_active ? '#FFFFFF' : '#FFFFFF'}
          />
        </View>
        <TouchableOpacity style={styles.detailButton} onPress={onDetail}>
          <Text style={styles.detailButtonText}>Detay →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AdminUsersScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;
  const router = useRouter();
  const { users, loading, toggleActive, refresh } = useAdminUsers();

  const [tab, setTab] = useState<'all' | 'doctor' | 'lab'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (tab !== 'all' && u.user_type !== tab) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          u.full_name.toLowerCase().includes(q) ||
          (u.clinic_name ?? '').toLowerCase().includes(q) ||
          (u.role ?? '').toLowerCase().includes(q) ||
          (u.phone ?? '').includes(q)
        );
      }
      return true;
    });
  }, [users, tab, search]);

  const doctorCount = users.filter((u) => u.user_type === 'doctor').length;
  const labCount = users.filter((u) => u.user_type === 'lab').length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Kullanıcılar</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={refresh}>
            <Text style={styles.refreshButtonText}>↻ Yenile</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {TABS.map((t) => {
            const count = t.key === 'all' ? users.length : t.key === 'doctor' ? doctorCount : labCount;
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(t.key as any)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                <View style={[styles.tabCount, active && styles.tabCountActive]}>
                  <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="İsim, klinik veya telefon ara..."
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.resultCount}>{filtered.length} kullanıcı</Text>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={C.accent} size="large" />
            <Text style={styles.loadingText}>Kullanıcılar yükleniyor...</Text>
          </View>
        ) : (
          <View style={[styles.grid, isDesktop && styles.gridDesktop]}>
            {filtered.map((user) => (
              <View key={user.id} style={[styles.gridItem, isDesktop && styles.gridItemDesktop]}>
                <UserCard
                  user={user}
                  onToggleActive={() => toggleActive(user.id, user.is_active)}
                  onDetail={() => router.push(`/admin/users/${user.id}` as any)}
                />
              </View>
            ))}
            {filtered.length === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>Kullanıcı bulunamadı</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  scroll: { flex: 1 },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.textPrimary,
  },
  refreshButton: {
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
    gap: 6,
  },
  tabActive: {
    backgroundColor: C.accentBg,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textSecondary,
  },
  tabTextActive: {
    color: C.accent,
  },
  tabCount: {
    backgroundColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tabCountActive: { backgroundColor: C.accent },
  tabCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.textSecondary,
  },
  tabCountTextActive: { color: '#FFFFFF' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: C.border,
    // @ts-ignore
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  searchIcon: { fontSize: 16 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.textPrimary,
    // @ts-ignore
    outlineStyle: 'none',
  },
  clearIcon: {
    fontSize: 14,
    color: C.textMuted,
    paddingHorizontal: 4,
  },
  resultCount: {
    fontSize: 13,
    color: C.textMuted,
    marginBottom: 14,
    fontWeight: '500',
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: { color: C.textSecondary, fontSize: 14 },
  grid: {
    gap: 12,
  },
  gridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '100%',
  },
  gridItemDesktop: {
    width: '48%',
    marginBottom: 4,
  },
  userCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    gap: 6,
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
  },
  userTypeBadgeContainer: {
    alignItems: 'flex-end',
  },
  userTypeBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  userTypeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.textPrimary,
  },
  userRole: {
    fontSize: 12,
    color: C.textSecondary,
  },
  userClinic: {
    fontSize: 12,
    color: C.textSecondary,
  },
  userPhone: {
    fontSize: 12,
    color: C.textSecondary,
  },
  userDate: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchLabel: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: '500',
  },
  detailButton: {
    backgroundColor: C.accentBg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  detailButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.accent,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
    width: '100%',
  },
  emptyText: {
    fontSize: 14,
    color: C.textMuted,
  },
});
