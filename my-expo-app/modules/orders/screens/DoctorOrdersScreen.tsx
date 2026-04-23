// ─────────────────────────────────────────────────────────────────────────
//  DoctorOrdersScreen — hekim iş emirleri tam listesi
//  Filtre chip'leri ile durum bazlı daraltma.
// ─────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '../../../core/store/authStore';
import { useOrders } from '../hooks/useOrders';
import { WorkOrderCard } from '../components/WorkOrderCard';
import { C } from '../../../core/theme/colors';
import type { WorkOrderStatus } from '../types';

type Filter = 'all' | 'active' | 'overdue' | 'delivered';

export function DoctorOrdersScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { orders, loading, refetch } = useOrders('doctor', profile?.id);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const q = search.trim().toLowerCase();

    return orders.filter(o => {
      // Durum filtresi
      if (filter === 'delivered' && o.status !== 'teslim_edildi') return false;
      if (filter === 'active'    && o.status === 'teslim_edildi') return false;
      if (filter === 'overdue') {
        if (o.status === 'teslim_edildi') return false;
        const due = new Date((o.delivery_date ?? '') + 'T00:00:00');
        if (isNaN(due.getTime()) || due >= today) return false;
      }

      // Arama
      if (q) {
        const haystack = [
          o.order_number, o.patient_name, o.patient_id,
          o.work_type, o.notes,
          (o.tooth_numbers ?? []).join(' '),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [orders, filter, search]);

  const countByFilter = (f: Filter) => {
    if (f === 'all') return orders.length;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return orders.filter(o => {
      if (f === 'delivered') return o.status === 'teslim_edildi';
      if (f === 'active')    return o.status !== 'teslim_edildi';
      if (f === 'overdue') {
        if (o.status === 'teslim_edildi') return false;
        const due = new Date((o.delivery_date ?? '') + 'T00:00:00');
        return !isNaN(due.getTime()) && due < today;
      }
      return false;
    }).length;
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>İşlerim</Text>
        <Text style={s.subtitle}>Tüm iş emirleriniz</Text>
      </View>

      {/* Arama */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          placeholder="İş emri, hasta, diş no ara..."
          placeholderTextColor={C.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Filtre chip'leri */}
      <View style={s.chipsRow}>
        {([
          ['all',       'Tümü'],
          ['active',    'Aktif'],
          ['overdue',   'Gecikmiş'],
          ['delivered', 'Teslim'],
        ] as const).map(([val, label]) => (
          <TouchableOpacity
            key={val}
            onPress={() => setFilter(val)}
            style={[s.chip, filter === val && s.chipActive]}
          >
            <Text style={[s.chipText, filter === val && s.chipTextActive]}>
              {label}
              <Text style={s.chipCount}>  {countByFilter(val)}</Text>
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <WorkOrderCard
            order={item}
            onPress={() => router.push(`/(doctor)/order/${item.id}` as any)}
          />
        )}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
        ListEmptyComponent={
          !loading ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>📋</Text>
              <Text style={s.emptyTitle}>Sonuç yok</Text>
              <Text style={s.emptySub}>
                {search
                  ? 'Aramanızla eşleşen iş emri bulunamadı.'
                  : 'Bu filtrede iş emri yok.'}
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  title: { fontSize: 24, fontWeight: '800', color: C.textPrimary },
  subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 2, marginBottom: 8 },
  searchWrap: { paddingHorizontal: 16, marginBottom: 8 },
  searchInput: {
    backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: C.textPrimary,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  chipActive: { backgroundColor: C.primaryBg, borderColor: C.primary },
  chipText: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  chipTextActive: { color: C.primary, fontWeight: '700' },
  chipCount: { fontSize: 11, color: C.textMuted },
  list: { padding: 16, paddingTop: 4 },
  empty: { alignItems: 'center', padding: 40, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary },
  emptySub: { fontSize: 14, color: C.textSecondary, textAlign: 'center', maxWidth: 280 },
});
