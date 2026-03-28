import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { C as Colors } from '../../core/theme/colors';
import { DesktopShell, useIsDesktop } from '../../core/layout/DesktopShell';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 24 : 22, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

const DOCTOR_NAV = [
  { label: 'İşlerim',     emoji: '📋', href: '/(doctor)',            iconName: 'file-document-outline', iconSet: 'mdi' as const },
  { label: 'Yeni İş Emri', emoji: '➕', href: '/(doctor)/new-order', iconName: 'plus-circle-outline', iconSet: 'mdi' as const, subtitle: 'Formu adım adım doldurun' },
  { label: 'Profil',      emoji: '👤', href: '/(doctor)/profile',   iconName: 'account-outline',        iconSet: 'mdi' as const },
];

export default function DoctorLayout() {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <DesktopShell navItems={DOCTOR_NAV} accentColor={Colors.primary} />;
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
          title: 'İşlerim',
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
