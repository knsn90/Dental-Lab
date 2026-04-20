import React from 'react';
import { Slot, Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { DesktopShell, useIsDesktop } from '../../core/layout/DesktopShell';
import { usePendingApprovals } from '../../core/hooks/usePendingApprovals';
import { useStockAlert } from '../../core/hooks/useStockAlert';
import { useAuthStore } from '../../core/store/authStore';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 24 : 22, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

export default function AdminLayout() {
  const { profile, loading } = useAuthStore();
  const pendingCount = usePendingApprovals();
  const stockAlert   = useStockAlert();
  const isDesktop = useIsDesktop();

  // Yükleme tamamlandı ve kesinlikle admin değil → sidebar gösterme
  if (!loading && profile && profile.user_type !== 'admin') {
    return <Slot />;
  }

  const ADMIN_NAV = [
    { label: 'Özet',         emoji: '📊', href: '/(admin)',              iconName: 'grid',         iconSet: 'mdi' as const },
    { label: 'Yeni İş Emri', emoji: '➕', href: '/(admin)/new-order',   iconName: 'plus-circle',  iconSet: 'mdi' as const, subtitle: 'Formu adım adım doldurun' },
    { label: 'Kullanıcılar', emoji: '👥', href: '/(admin)/users',       iconName: 'users',        iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Klinikler & Hekimler', emoji: '🏥', href: '/(admin)/clinics', iconName: 'briefcase', iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Siparişler',   emoji: '📋', href: '/(admin)/orders',      iconName: 'clipboard',    iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Stok',         emoji: '📦', href: '/(admin)/stock',        iconName: 'package',      iconSet: 'mdi' as const, matchPrefix: true, badgeCount: stockAlert },
    { label: 'Onaylar',      emoji: '✅', href: '/(admin)/approvals',   iconName: 'check-circle', iconSet: 'mdi' as const, badge: pendingCount > 0, matchPrefix: true },
    { label: 'Loglar',       emoji: '📜', href: '/(admin)/logs',        iconName: 'file-text',    iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Profil',       emoji: '⚙️', href: '/(admin)/profile',     iconName: 'settings',     iconSet: 'mdi' as const, matchPrefix: true },
  ];

  if (isDesktop) {
    return <DesktopShell navItems={ADMIN_NAV} accentColor="#0F172A" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0F172A',
        tabBarInactiveTintColor: '#6C6C70',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#F1F5F9',
          paddingBottom: 6,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Özet', tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} /> }} />
      <Tabs.Screen name="new-order" options={{ title: 'Yeni İş', tabBarIcon: ({ focused }) => <TabIcon emoji="➕" focused={focused} /> }} />
      <Tabs.Screen name="users" options={{ title: 'Kullanıcılar', tabBarIcon: ({ focused }) => <TabIcon emoji="👥" focused={focused} /> }} />
      <Tabs.Screen name="clinics" options={{ title: 'Klinikler', tabBarIcon: ({ focused }) => <TabIcon emoji="🏥" focused={focused} /> }} />
      <Tabs.Screen name="doctors" options={{ title: 'Hekimler', tabBarIcon: ({ focused }) => <TabIcon emoji="👨‍⚕️" focused={focused} /> }} />
      <Tabs.Screen name="orders" options={{ title: 'Siparişler', tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} /> }} />
      <Tabs.Screen name="stock" options={{ title: 'Stok', tabBarIcon: ({ focused }) => <TabIcon emoji="📦" focused={focused} /> }} />
      <Tabs.Screen
        name="approvals"
        options={{
          title: 'Onaylar',
          tabBarIcon: ({ focused }) => <TabIcon emoji="✅" focused={focused} />,
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#D97706', fontSize: 10 },
        }}
      />
      <Tabs.Screen name="logs" options={{ title: 'Loglar', tabBarIcon: ({ focused }) => <TabIcon emoji="📜" focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} /> }} />
      <Tabs.Screen name="order/[id]" options={{ tabBarButton: () => null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="order/occlusion/[id]" options={{ tabBarButton: () => null, tabBarStyle: { display: 'none' } }} />
    </Tabs>
  );
}
