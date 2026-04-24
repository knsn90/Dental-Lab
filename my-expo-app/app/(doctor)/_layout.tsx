import { useState } from 'react';
import { Modal, Text } from 'react-native';
import { Slot, Tabs } from 'expo-router';
import { C as Colors } from '../../core/theme/colors';
import { DesktopShell, useIsDesktop } from '../../core/layout/DesktopShell';
import { useAuthStore } from '../../core/store/authStore';
import { NewOrderScreen } from '../../modules/orders/screens/NewOrderScreen';

// Doktor paneli teması (lab #2563EB / admin #0F172A'dan ayrıştırılmış sky blue)
const DOCTOR_ACCENT = '#0EA5E9';

// NOT: Desktop'ta "Yeni İş Emri" → route navigate eder (/(doctor)/new-order),
// sidebar kaybolmaz. Modal SADECE mobil için.

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 24 : 22, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

export default function DoctorLayout() {
  const { profile, loading } = useAuthStore();
  const isDesktop = useIsDesktop();
  const [newOrderOpen, setNewOrderOpen] = useState(false);

  const DOCTOR_NAV = [
    { label: 'Dashboard',    emoji: '📊', href: '/(doctor)',            iconName: 'grid',         iconSet: 'mdi' as const },
    { label: 'Siparişlerim', emoji: '📋', href: '/(doctor)/orders',    iconName: 'file-text',    iconSet: 'mdi' as const },
    { label: 'Mesajlar',     emoji: '💬', href: '/(doctor)/messages', iconName: 'message-circle', iconSet: 'mdi' as const },
    { label: 'Yeni İş Emri', emoji: '➕', href: '/(doctor)/new-order', iconName: 'plus-circle',  iconSet: 'mdi' as const, subtitle: 'Formu adım adım doldurun' },
    { label: 'Profil',       emoji: '👤', href: '/(doctor)/profile',   iconName: 'user',         iconSet: 'mdi' as const },
  ];

  // Hekim olmayan kullanıcı bu layout'a düştüyse sidebar gösterme
  if (loading || !profile || profile.user_type !== 'doctor') {
    return <Slot />;
  }

  if (isDesktop) {
    // Desktop: DesktopShell içinde route render edilir, sidebar hiç kaybolmaz.
    return <DesktopShell navItems={DOCTOR_NAV} accentColor={DOCTOR_ACCENT} />;
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: DOCTOR_ACCENT,
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
            title: 'Dashboard',
            tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Siparişlerim',
            tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: 'Mesajlar',
            tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
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
          options={{ href: null } as any}
        />
      </Tabs>

      {/* Yeni İş Emri — SADECE mobilde modal olarak açılır */}
      <Modal
        visible={newOrderOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNewOrderOpen(false)}
      >
        <NewOrderScreen doctorMode accentColor={DOCTOR_ACCENT} onClose={() => setNewOrderOpen(false)} />
      </Modal>
    </>
  );
}
