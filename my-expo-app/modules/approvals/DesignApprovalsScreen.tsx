import React from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { usePendingApprovals } from './hooks/usePendingApprovals';
import { ApprovalCard } from './components/ApprovalCard';
import { useAuthStore } from '../../core/store/authStore';
import { C } from '../../core/theme/colors';
import { F } from '../../core/theme/typography';

import { AppIcon } from '../../core/ui/AppIcon';

export function DesignApprovalsScreen() {
  const { profile } = useAuthStore();
  const { approvals, loading, refetch } = usePendingApprovals();
  const isAdmin = profile?.user_type === 'admin';

  return (
    <View style={s.safe}>
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : approvals.length === 0 ? (
        <View style={s.empty}>
          <AppIcon name="check-all" size={52} color={C.success} />
          <Text style={s.emptyTitle}>Bekleyen Onay Yok</Text>
          <Text style={s.emptySub}>
            Tasarım adımı tamamlandığında onay istekleri burada görünür.
          </Text>
        </View>
      ) : (
        <FlatList
          data={approvals}
          keyExtractor={a => a.id}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} />
          }
          renderItem={({ item }) => (
            <ApprovalCard
              approval={item}
              canApprove={isAdmin}
              onResolved={refetch}
            />
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { padding: 16, gap: 12 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', fontFamily: F.bold, color: '#0F172A' },
  emptySub: {
    fontSize: 14, fontFamily: F.regular, color: '#94A3B8',
    textAlign: 'center', lineHeight: 20,
  },
});
