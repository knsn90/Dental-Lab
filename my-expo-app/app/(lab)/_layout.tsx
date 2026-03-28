import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { C as Colors } from '../../core/theme/colors';
import { DesktopShell, useIsDesktop } from '../../core/layout/DesktopShell';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 24 : 22, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

const LAB_NAV = [
  { label: 'Bugün',     emoji: '📅', href: '/(lab)',              iconName: 'home-outline',           iconSet: 'mdi' as const },
  { label: 'Tüm İşler',emoji: '📋', href: '/(lab)/all-orders',   iconName: 'format-list-bulleted',            iconSet: 'mdi' as const },
  { label: 'Yeni İş Emri', emoji: '➕', href: '/(lab)/new-order', iconName: 'plus-circle-outline', iconSet: 'mdi' as const, subtitle: 'Formu adım adım doldurun' },
  { label: 'Klinikler',emoji: '🏥', href: '/(lab)/clinics',      iconName: 'office-building-outline',        iconSet: 'mdi' as const },
  { label: 'Hizmetler',emoji: '💰', href: '/(lab)/lab-services', iconName: 'tag-outline',        iconSet: 'mdi' as const },
  { label: 'Profil',   emoji: '👤', href: '/(lab)/profile',      iconName: 'account-outline',          iconSet: 'mdi' as const },
];

export default function LabLayout() {
  const isDesktop = useIsDesktop();

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
      <Tabs.Screen
        name="index"
        options={{
          title: 'Bugün',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="all-orders"
        options={{
          title: 'Tüm İşler',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="new-order"
        options={{
          title: 'Yeni İş',
          tabBarIcon: ({ focused }) => <TabIcon emoji="➕" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="clinics"
        options={{
          title: 'Klinikler',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏥" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="lab-services"
        options={{
          title: 'Hizmetler',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💰" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="order/[id]"
        options={{ href: null }}
      />
    </Tabs>
  );
}
