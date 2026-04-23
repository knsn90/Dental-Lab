// ─────────────────────────────────────────────────────────────────────────
//  DoctorDashboardScreen — hekim için özet ekran
//  • İş emri istatistikleri (aktif, teslim, gecikmiş)
//  • Kısayollar (Yeni İş Emri, Faturalarım, Kliniğim)
//  • Son iş emirleri (5 adet)
//  • Cari bakiye özeti
// ─────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '../../../core/store/authStore';
import { useOrders } from '../../orders/hooks/useOrders';
import { useDoctorScope } from '../../clinics/hooks/useDoctorScope';
import { useDoctorBalance } from '../../invoices/hooks/useDoctorBalance';
import { WorkOrderCard } from '../../orders/components/WorkOrderCard';
import { Card } from '../../../core/ui/Card';
import { C } from '../../../core/theme/colors';

function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return '—';
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function DoctorDashboardScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { clinic } = useDoctorScope();
  const { orders, loading, refetch } = useOrders('doctor', profile?.id);
  const { balance, refetch: refetchBalance } = useDoctorBalance();

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let active = 0, delivered = 0, overdue = 0;
    for (const o of orders) {
      if (o.status === 'teslim_edildi') { delivered++; continue; }
      active++;
      const due = new Date((o.delivery_date ?? '') + 'T00:00:00');
      if (!isNaN(due.getTime()) && due < today) overdue++;
    }
    return { active, delivered, overdue };
  }, [orders]);

  const recent = orders.slice(0, 5);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => { void refetch(); void refetchBalance(); }}
          />
        }
      >
        {/* Başlık */}
        <View style={s.header}>
          <Text style={s.greeting}>
            Merhaba, Dr. {profile?.full_name?.split(' ')[0] ?? ''}
          </Text>
          {clinic?.name ? (
            <Text style={s.subtitle}>{clinic.name}</Text>
          ) : null}
        </View>

        {/* İstatistik kartları */}
        <View style={s.statsRow}>
          <Card style={s.statCard}>
            <Text style={s.statLabel}>Aktif</Text>
            <Text style={s.statValue}>{stats.active}</Text>
          </Card>
          <Card style={s.statCard}>
            <Text style={s.statLabel}>Gecikmiş</Text>
            <Text style={[s.statValue, stats.overdue > 0 && { color: C.danger }]}>
              {stats.overdue}
            </Text>
          </Card>
          <Card style={s.statCard}>
            <Text style={s.statLabel}>Teslim</Text>
            <Text style={[s.statValue, { color: C.success }]}>
              {stats.delivered}
            </Text>
          </Card>
        </View>

        {/* Kısayollar */}
        <View style={s.shortcutsRow}>
          <Shortcut
            icon="➕" label="Yeni İş Emri"
            onPress={() => router.push('/(doctor)/new-order' as any)}
            color={C.primary}
          />
          <Shortcut
            icon="🧾" label="Faturalarım"
            onPress={() => router.push('/(doctor)/invoices' as any)}
            color={C.warning}
          />
          <Shortcut
            icon="🏥" label="Kliniğim"
            onPress={() => router.push('/(doctor)/clinic' as any)}
            color={C.info}
          />
        </View>

        {/* Cari özet */}
        {balance && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/(doctor)/balance' as any)}
          >
            <Card style={s.balanceCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.balanceLabel}>Güncel Bakiye</Text>
                <Text style={[
                  s.balanceValue,
                  Number(balance.balance) > 0 && { color: C.danger },
                ]}>
                  {fmtMoney(balance.balance)}
                </Text>
                {Number(balance.overdue_amount) > 0 && (
                  <Text style={s.balanceOverdue}>
                    Vadesi geçmiş: {fmtMoney(balance.overdue_amount)}
                  </Text>
                )}
              </View>
              <Text style={s.chevron}>›</Text>
            </Card>
          </TouchableOpacity>
        )}

        {/* Son iş emirleri */}
        <View style={s.listHeader}>
          <Text style={s.listTitle}>Son İş Emirleri</Text>
          <TouchableOpacity onPress={() => router.push('/(doctor)/orders' as any)}>
            <Text style={s.linkText}>Tümünü gör →</Text>
          </TouchableOpacity>
        </View>

        {recent.length === 0 && !loading && (
          <Card style={s.emptyCard}>
            <Text style={s.emptyIcon}>📋</Text>
            <Text style={s.emptyTitle}>Henüz iş emri yok</Text>
            <Text style={s.emptySub}>
              İlk iş emrinizi oluşturmak için aşağıdaki düğmeye dokunun.
            </Text>
            <TouchableOpacity
              style={s.emptyBtn}
              onPress={() => router.push('/(doctor)/new-order' as any)}
            >
              <Text style={s.emptyBtnText}>+ Yeni İş Emri</Text>
            </TouchableOpacity>
          </Card>
        )}

        {recent.map(o => (
          <WorkOrderCard
            key={o.id}
            order={o}
            onPress={() => router.push(`/(doctor)/order/${o.id}` as any)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Shortcut({
  icon, label, onPress, color,
}: { icon: string; label: string; onPress: () => void; color: string }) {
  return (
    <TouchableOpacity onPress={onPress} style={sh.wrap} activeOpacity={0.75}>
      <View style={[sh.circle, { backgroundColor: color + '15' }]}>
        <Text style={sh.icon}>{icon}</Text>
      </View>
      <Text style={sh.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const sh = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center' },
  circle: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  icon: { fontSize: 24 },
  label: { fontSize: 12, color: C.textSecondary, fontWeight: '600', textAlign: 'center' },
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  scroll: { paddingBottom: 40 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  greeting: { fontSize: 22, fontWeight: '800', color: C.textPrimary },
  subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  statCard: { flex: 1, padding: 12, alignItems: 'flex-start' },
  statLabel: { fontSize: 11, color: C.textSecondary, fontWeight: '600' },
  statValue: { fontSize: 22, fontWeight: '800', color: C.textPrimary, marginTop: 4 },
  shortcutsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 16 },
  balanceCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 12, padding: 16,
  },
  balanceLabel: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
  balanceValue: { fontSize: 22, fontWeight: '800', color: C.textPrimary, marginTop: 2 },
  balanceOverdue: { fontSize: 11, color: C.danger, fontWeight: '600', marginTop: 2 },
  chevron: { fontSize: 26, color: C.textMuted },
  listHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginTop: 8, marginBottom: 8,
  },
  listTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary },
  linkText: { fontSize: 13, color: C.primary, fontWeight: '700' },
  emptyCard: {
    marginHorizontal: 16, padding: 24,
    alignItems: 'center',
  },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary, marginTop: 6 },
  emptySub: { fontSize: 13, color: C.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: 12 },
  emptyBtn: {
    backgroundColor: C.primary, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
