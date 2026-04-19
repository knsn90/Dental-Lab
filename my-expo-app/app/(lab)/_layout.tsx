import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { C as Colors } from '../../core/theme/colors';
import { DesktopShell, useIsDesktop } from '../../core/layout/DesktopShell';
import { usePendingApprovals as useDesignPending } from '../../modules/approvals/hooks/usePendingApprovals';
import { useStockAlert } from '../../core/hooks/useStockAlert';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 24 : 22, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

export default function LabLayout() {
  const { approvals: pendingDesign } = useDesignPending();
  const pendingCount = pendingDesign.length;
  const stockAlert   = useStockAlert();
  const isDesktop = useIsDesktop();

  const LAB_NAV = [
    { label: 'Bugün',        emoji: '📅', href: '/(lab)',              iconName: 'home',         iconSet: 'mdi' as const },
    { label: 'Siparişler',   emoji: '📋', href: '/(lab)/all-orders',   iconName: 'clipboard',    iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Yeni İş Emri', emoji: '➕', href: '/(lab)/new-order',   iconName: 'plus-circle',  iconSet: 'mdi' as const, subtitle: 'Formu adım adım doldurun' },
    { label: 'Klinikler & Hekimler', emoji: '🏥', href: '/(lab)/clinics', iconName: 'briefcase', iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Hizmetler',    emoji: '💰', href: '/(lab)/lab-services', iconName: 'tag',          iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Stok',         emoji: '📦', href: '/(lab)/stock',        iconName: 'package',      iconSet: 'mdi' as const, matchPrefix: true, badgeCount: stockAlert },
    { label: 'Onaylar',      emoji: '✅', href: '/(lab)/approvals',   iconName: 'check-circle', iconSet: 'mdi' as const, badge: pendingCount > 0, matchPrefix: true },
    { label: 'Profil',       emoji: '👤', href: '/(lab)/profile',     iconName: 'user',         iconSet: 'mdi' as const, matchPrefix: true },
  ];

  if (isDesktop) {
    return <DesktopShell navItems={LAB_NAV} accentColor={Colors.primary} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
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
      <Tabs.Screen name="index" options={{ title: 'Bugün', tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} /> }} />
      <Tabs.Screen name="all-orders" options={{ title: 'Tüm İşler', tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} /> }} />
      <Tabs.Screen name="stock" options={{ title: 'Stok', tabBarIcon: ({ focused }) => <TabIcon emoji="📦" focused={focused} /> }} />
      <Tabs.Screen name="new-order" options={{ title: 'Yeni İş', tabBarIcon: ({ focused }) => <TabIcon emoji="➕" focused={focused} /> }} />
      <Tabs.Screen name="clinics" options={{ title: 'Klinikler', tabBarIcon: ({ focused }) => <TabIcon emoji="🏥" focused={focused} /> }} />
      <Tabs.Screen name="lab-services" options={{ title: 'Hizmetler', tabBarIcon: ({ focused }) => <TabIcon emoji="💰" focused={focused} /> }} />
      <Tabs.Screen
        name="approvals"
        options={{
          title: 'Onaylar',
          tabBarIcon: ({ focused }) => <TabIcon emoji="✅" focused={focused} />,
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#D97706', fontSize: 10 },
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }} />
      <Tabs.Screen
        name="order/[id]"
        options={{ tabBarButton: () => null, tabBarStyle: { display: 'none' } }}
      />
    </Tabs>
  );
}
