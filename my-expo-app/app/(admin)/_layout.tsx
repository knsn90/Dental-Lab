import React from 'react';
import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import Colors from '../../constants/colors';
import { DesktopShell, useIsDesktop } from '../../components/layout/DesktopShell';
import { DentistIcon } from '../../components/icons/DentistIcon';
import { usePendingApprovals } from '../../core/hooks/usePendingApprovals';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 24 : 22, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

export default function AdminLayout() {
  const pendingCount = usePendingApprovals();
  const isDesktop = useIsDesktop();

  const ADMIN_NAV = [
    { label: 'Özet',      emoji: '📊', href: '/(admin)',             iconName: 'chart-bar',             iconSet: 'mdi' as const },
    { label: 'Kullanıcı', emoji: '👥', href: '/(admin)/users',      iconName: 'account-group-outline', iconSet: 'mdi' as const },
    { label: 'Hekimler',  emoji: '👨‍⚕️', href: '/(admin)/doctors',   iconName: 'tooth-outline',         iconSet: 'mdi' as const },
    { label: 'Klinikler', emoji: '🏥', href: '/(admin)/clinics',    iconName: 'office-building-outline',iconSet: 'mdi' as const },
    { label: 'Siparişler',emoji: '📋', href: '/(admin)/orders',     iconName: 'format-list-bulleted',   iconSet: 'mdi' as const },
    { label: 'Onaylar',   emoji: '✅', href: '/(admin)/approvals',  iconName: 'account-check-outline',  iconSet: 'mdi' as const, badge: pendingCount > 0 },
    { label: 'Loglar',    emoji: '📜', href: '/(admin)/logs',       iconName: 'clipboard-text-outline', iconSet: 'mdi' as const },
    { label: 'Profil',    emoji: '⚙️', href: '/(admin)/profile',    iconName: 'cog-outline',            iconSet: 'mdi' as const },
  ];

  if (isDesktop) {
    return <DesktopShell navItems={ADMIN_NAV} accentColor="#0F172A" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0F172A',
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          paddingBottom: 6,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Özet', tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} /> }} />
      <Tabs.Screen name="users" options={{ title: 'Kullanıcı', tabBarIcon: ({ focused }) => <TabIcon emoji="👥" focused={focused} /> }} />
      <Tabs.Screen
        name="doctors"
        options={{
          title: 'Hekimler',
          tabBarIcon: ({ focused, color }) => <DentistIcon size={focused ? 24 : 22} color={color} />,
        }}
      />
      <Tabs.Screen name="clinics" options={{ title: 'Klinikler', tabBarIcon: ({ focused }) => <TabIcon emoji="🏥" focused={focused} /> }} />
      <Tabs.Screen name="orders" options={{ title: 'Siparişler', tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} /> }} />
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
    </Tabs>
  );
}
