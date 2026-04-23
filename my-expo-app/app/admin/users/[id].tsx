import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAdminUserDetail } from '../../../modules/admin/users/hooks';
import { AppSwitch } from '../../../core/ui/AppSwitch';

const C = {
  primary: '#0F172A', primaryBg: '#F1F5F9',
  accent: '#7C3AED', accentBg: '#F5F3FF',
  background: '#FFFFFF', surface: '#FFFFFF', surfaceAlt: '#F8FAFC',
  textPrimary: '#0F172A', textSecondary: '#64748B', textMuted: '#94A3B8',
  border: '#F1F5F9',
  success: '#059669', successBg: '#ECFDF5',
  warning: '#D97706', warningBg: '#FFFBEB',
  danger: '#DC2626', dangerBg: '#FEF2F2',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  alindi:           { label: 'Alındı',          color: '#0F172A', bgColor: '#F1F5F9' },
  uretimde:         { label: 'Üretimde',         color: '#D97706', bgColor: '#FFFBEB' },
  kalite_kontrol:   { label: 'Kalite Kontrol',   color: '#7C3AED', bgColor: '#F5F3FF' },
  teslimata_hazir:  { label: 'Teslimata Hazır',  color: '#059669', bgColor: '#ECFDF5' },
  teslim_edildi:    { label: 'Teslim Edildi',    color: '#374151', bgColor: '#F3F4F6' },
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

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: C.textSecondary, bgColor: C.surfaceAlt };
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: cfg.bgColor }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: cfg.color }}>{cfg.label}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function AdminUserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, orders, loading, toggleActive } = useAdminUserDetail(id ?? '');
  const { width } = useWindowDimensions();

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={C.accent} size="large" />
          <Text style={styles.loadingText}>Kullanıcı yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.loadingBox}>
          <Text style={styles.errorText}>Kullanıcı bulunamadı</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>← Geri Dön</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isDoctor = user.user_type === 'doctor';
  const avatarColor = isDoctor ? C.primary : C.accent;
  const avatarBg = isDoctor ? C.primaryBg : C.accentBg;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Kullanıcılar</Text>
        </TouchableOpacity>

        {/* User info card */}
        <View style={styles.userInfoCard}>
          <View style={styles.userCardHeader}>
            <View style={[styles.avatarCircleLarge, { backgroundColor: avatarBg }]}>
              <Text style={[styles.avatarTextLarge, { color: avatarColor }]}>
                {getInitials(user.full_name)}
              </Text>
            </View>
            <View style={styles.userCardMeta}>
              <Text style={styles.userNameLarge}>{user.full_name}</Text>
              <View style={[styles.userTypeBadge, { backgroundColor: isDoctor ? C.primaryBg : C.accentBg }]}>
                <Text style={[styles.userTypeBadgeText, { color: isDoctor ? C.primary : C.accent }]}>
                  {isDoctor ? '👨‍⚕️ Hekim' : '🔬 Lab Kullanıcısı'}
                </Text>
              </View>
            </View>
            <View style={styles.activeToggleRow}>
              <Text style={styles.activeLabel}>{user.is_active ? 'Aktif' : 'Pasif'}</Text>
              <AppSwitch
                value={user.is_active}
                onValueChange={() => toggleActive(user.is_active)}
                accentColor="#0F172A"
              />
            </View>
          </View>

          <View style={styles.separator} />

          <View style={styles.infoGrid}>
            <InfoRow label="Rol" value={user.role} />
            <InfoRow label="Klinik" value={user.clinic_name} />
            <InfoRow label="Telefon" value={user.phone} />
            <InfoRow label="Kayıt Tarihi" value={formatDate(user.created_at)} />
            <InfoRow label="Durum" value={user.is_active ? 'Aktif' : 'Pasif'} />
          </View>
        </View>

        {/* Orders */}
        <View style={styles.ordersCard}>
          <Text style={styles.sectionTitle}>
            Son Siparişler
            <Text style={styles.orderCount}> ({orders.length})</Text>
          </Text>

          {orders.length === 0 ? (
            <View style={styles.emptyOrders}>
              <Text style={styles.emptyOrdersText}>Bu kullanıcıya ait sipariş bulunmuyor</Text>
            </View>
          ) : (
            orders.map((order) => (
              <TouchableOpacity
                key={order.id}
                style={styles.orderRow}
                onPress={() => router.push(`/admin/orders/${order.id}` as any)}
              >
                <View style={styles.orderRowLeft}>
                  <Text style={styles.orderNumber}>{order.order_number}</Text>
                  <Text style={styles.orderWorkType}>{order.work_type}</Text>
                </View>
                <View style={styles.orderRowRight}>
                  <StatusBadge status={order.status} />
                  <Text style={styles.orderDate}>{formatDate(order.delivery_date)}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  scroll: { flex: 1 },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { color: C.textSecondary, fontSize: 14 },
  errorText: { color: C.danger, fontSize: 16, fontWeight: '600' },
  backButton: {
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 14,
    color: C.accent,
    fontWeight: '600',
  },
  userInfoCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
  },
  userCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  avatarCircleLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTextLarge: {
    fontSize: 26,
    fontWeight: '800',
  },
  userCardMeta: {
    flex: 1,
    gap: 6,
  },
  userNameLarge: {
    fontSize: 20,
    fontWeight: '800',
    color: C.textPrimary,
  },
  userTypeBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  userTypeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  activeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeLabel: {
    fontSize: 13,
    color: C.textSecondary,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 16,
  },
  infoGrid: {
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  infoLabel: {
    fontSize: 13,
    color: C.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    color: C.textPrimary,
    fontWeight: '600',
  },
  ordersCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 14,
  },
  orderCount: {
    fontSize: 14,
    fontWeight: '500',
    color: C.textMuted,
  },
  emptyOrders: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyOrdersText: {
    fontSize: 13,
    color: C.textMuted,
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  orderRowLeft: {
    flex: 1,
    gap: 2,
  },
  orderNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: C.textPrimary,
  },
  orderWorkType: {
    fontSize: 12,
    color: C.textSecondary,
  },
  orderRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orderDate: {
    fontSize: 11,
    color: C.textMuted,
    minWidth: 72,
    textAlign: 'right',
  },
});
