/**
 * DesignApprovalsScreen — Patterns design language
 *
 * Tasarım adımı onay listesi. Admin onaylayabilir, lab/doctor sadece görür.
 * DS tokens, DISPLAY typography, inline styles.
 */
import React from 'react';
import { View, Text, FlatList, RefreshControl, useWindowDimensions } from 'react-native';
import { ClipboardCheck } from '../../core/ui/icons';
import { usePendingApprovals } from './hooks/usePendingApprovals';
import { ApprovalCard } from './components/ApprovalCard';
import { useAuthStore } from '../../core/store/authStore';
import { DS } from '../../core/theme/dsTokens';
import { useInkUI } from '../../core/theme/inkScale';
import { ActivityIndicator } from '../../core/ui/teethCompat';
import { useMobileTokens } from '../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../core/store/themeModeStore';

const DISPLAY: any = { fontFamily: DS.font.display, fontWeight: '300' };

export function DesignApprovalsScreen() {
  const U = useInkUI();
  const { profile } = useAuthStore();
  const { approvals, loading, refetch } = usePendingApprovals();
  const isAdmin = profile?.user_type === 'admin';
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);

  return (
    <View style={{ flex: 1 }}>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={U.ink[500]} />
        </View>
      ) : approvals.length === 0 ? (
        /* ── Empty state — kompakt dashed card ── */
        <View style={{
          margin: isDesktop ? 24 : 12, padding: 36,
          alignItems: 'center', justifyContent: 'center', gap: 8,
          borderRadius: 16, borderWidth: 1, borderStyle: 'dashed' as any,
          borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)', backgroundColor: 'transparent',
        }}>
          <View style={{
            width: 52, height: 52, borderRadius: 16,
            backgroundColor: 'transparent', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.06)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <ClipboardCheck size={22} color="#1F6B47" strokeWidth={1.6} />
          </View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: T.ink }}>
            Bekleyen onay yok
          </Text>
          <Text style={{ fontSize: 11.5, color: T.ink3, textAlign: 'center', lineHeight: 16, maxWidth: 320 }}>
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
            padding: isDesktop ? 24 : 12,
            paddingTop: 8,
            paddingBottom: isDesktop ? 24 : 120,
            gap: 10,
          }}
          columnWrapperStyle={isDesktop ? { gap: 10 } : undefined}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} tintColor={U.ink[500]} />
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
