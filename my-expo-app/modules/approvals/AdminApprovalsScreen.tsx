import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PendingApprovalsScreen } from './PendingApprovalsScreen';
import { DesignApprovalsScreen } from './DesignApprovalsScreen';
import { usePendingApprovals as useDesignApprovals } from './hooks/usePendingApprovals';
import { F } from '../../core/theme/typography';
import { SlideTabBar } from '../../core/ui/SlideTabBar';

type Tab = 'doctors' | 'design';

export function AdminApprovalsScreen() {
  const [tab, setTab]     = useState<Tab>('doctors');
  const { approvals }     = useDesignApprovals();
  const designPending     = approvals.length;

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'doctors', label: 'Hekim Kayıtları' },
    { key: 'design',  label: 'Tasarım Onayları', count: designPending > 0 ? designPending : undefined },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      {/* Slide tab bar — tek kayan cursor */}
      <View style={s.toolbarRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.tabsScroll}
          contentContainerStyle={s.tabsContent}
        >
          <SlideTabBar
            items={TABS}
            activeKey={tab}
            onChange={setTab}
            accentColor="#0F172A"
          />
        </ScrollView>
      </View>

      <View style={s.content}>
        {tab === 'doctors' ? <PendingApprovalsScreen /> : <DesignApprovalsScreen />}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },

  toolbarRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  tabsScroll:  { flex: 1 },
  tabsContent: { alignItems: 'center' },
  tabBar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  tabItem: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100,
  },
  tabItemActive: {
    backgroundColor: '#FFFFFF',
    // @ts-ignore
    boxShadow: '0 1px 6px rgba(15,23,42,0.12)',
  },
  tabText:       { fontSize: 13, fontFamily: F.medium,  fontWeight: '500', color: '#94A3B8' },
  tabTextActive: { fontSize: 13, fontFamily: F.semibold, fontWeight: '600', color: '#0F172A' },

  badge: {
    backgroundColor: '#DC2626', borderRadius: 10,
    minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { fontSize: 10, fontWeight: '700', fontFamily: F.bold, color: '#FFFFFF' },

  content: { flex: 1 },
});
