/**
 * DesignApprovalsScreen — Patterns design language
 *
 * Tasarım adımı onay listesi. Admin onaylayabilir, lab/doctor sadece görür.
 * DS tokens, DISPLAY typography, inline styles.
 */
import React from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import { ClipboardCheck } from 'lucide-react-native';
import { usePendingApprovals } from './hooks/usePendingApprovals';
import { ApprovalCard } from './components/ApprovalCard';
import { useAuthStore } from '../../core/store/authStore';
import { DS } from '../../core/theme/dsTokens';

const DISPLAY: any = { fontFamily: DS.font.display, fontWeight: '300' };

export function DesignApprovalsScreen() {
  const { profile } = useAuthStore();
  const { approvals, loading, refetch } = usePendingApprovals();
  const isAdmin = profile?.user_type === 'admin';
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  return (
    <View style={{ flex: 1 }}>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={DS.ink[500]} />
        </View>
      ) : approvals.length === 0 ? (
        /* ── Empty state ── */
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40 }}>
          <View style={{
            width: 64, height: 64, borderRadius: 32,
            backgroundColor: 'rgba(45,154,107,0.1)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <ClipboardCheck size={28} color="#1F6B47" strokeWidth={1.6} />
          </View>
          <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>
            Bekleyen onay yok
          </Text>
          <Text style={{ fontSize: 13, color: DS.ink[400], textAlign: 'center', lineHeight: 20 }}>
            Tasarım adımı tamamlandığında onay istekleri burada görünür.
          </Text>
        </View>
      ) : (
        /* ── Approval list ── */
        <FlatList
          data={approvals}
          keyExtractor={a => a.id}
          numColumns={isDesktop ? 2 : 1}
          key={isDesktop ? 'grid-2' : 'grid-1'}
          contentContainerStyle={{
            padding: isDesktop ? 40 : 16,
            paddingTop: 16,
            gap: 14,
          }}
          columnWrapperStyle={isDesktop ? { gap: 14 } : undefined}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} tintColor={DS.ink[500]} />
          }
          renderItem={({ item }) => (
            <View style={isDesktop ? { flex: 1, maxWidth: '50%' } : undefined}>
              <ApprovalCard
                approval={item}
                canApprove={isAdmin}
                onResolved={refetch}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}
