import React from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../core/store/authStore';
import { useOrders } from '../../orders/hooks/useOrders';
import { WorkOrderCard } from '../../orders/components/WorkOrderCard';
import { C } from '../../../core/theme/colors';

export function DoctorDashboardScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { orders, loading, refetch } = useOrders('doctor', profile?.id);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Merhaba, Dr. {profile?.full_name?.split(' ')[0]}</Text>
        <Text style={styles.title}>İş Emirlerim</Text>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <WorkOrderCard
            order={item}
            onPress={() => router.push(`/(doctor)/order/${item.id}`)}
          />
        )}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>Henüz iş emri yok</Text>
              <Text style={styles.emptySub}>Yeni bir iş emri oluşturmak için + düğmesine dokunun.</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  greeting: { fontSize: 14, color: C.textSecondary, marginBottom: 2 },
  title: { fontSize: 26, fontWeight: '800', color: C.textPrimary },
  list: { padding: 16, paddingTop: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary },
  emptySub: { fontSize: 14, color: C.textSecondary, textAlign: 'center', maxWidth: 280 },
});
