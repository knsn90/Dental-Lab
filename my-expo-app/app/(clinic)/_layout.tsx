import { useState } from 'react';
import { Modal, Text } from 'react-native';
import { Slot, Tabs } from 'expo-router';
import { C as Colors } from '../../core/theme/colors';
import { DesktopShell, useIsDesktop } from '../../core/layout/DesktopShell';
import { useAuthStore } from '../../core/store/authStore';
import { NewOrderScreen } from '../../modules/orders/screens/NewOrderScreen';
import { MessagesPopup } from '../../modules/orders/components/MessagesPopup';

// Klinik paneli teması — daha koyu sky blue (otorite/yönetici hissi)
// Hekim     #0EA5E9 · Klinik müdürü #0369A1 · Lab #2563EB · Admin #0F172A
const CLINIC_ACCENT = '#0369A1';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 24 : 22, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

export default function ClinicLayout() {
  const { profile, loading } = useAuthStore();
  const isDesktop = useIsDesktop();
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);

  const CLINIC_NAV = [
    { label: 'Dashboard',    emoji: '📊', href: '/(clinic)',           iconName: 'grid',           iconSet: 'mdi' as const },
    { label: 'Hekimler',     emoji: '🩺', href: '/(clinic)/doctors',   iconName: 'activity',       iconSet: 'mdi' as const },
    { label: 'Siparişler',   emoji: '📋', href: '/(clinic)/orders',    iconName: 'file-text',      iconSet: 'mdi' as const },
    { label: 'Yeni İş Emri', emoji: '➕', href: '/(clinic)/new-order', iconName: 'plus-circle',    iconSet: 'mdi' as const },
    { label: 'Profil',       emoji: '👤', href: '/(clinic)/profile',   iconName: 'user',           iconSet: 'mdi' as const },
  ];

  // Klinik müdürü olmayan kullanıcı bu layout'a düştüyse sidebar gösterme
  if (loading || !profile || profile.user_type !== 'clinic_admin') {
    return <Slot />;
  }

  if (isDesktop) {
    return (
      <>
        <DesktopShell
          navItems={CLINIC_NAV}
          accentColor={CLINIC_ACCENT}
          onPressMessages={() => setMessagesOpen(true)}
        />
        <MessagesPopup
          visible={messagesOpen}
          onClose={() => setMessagesOpen(false)}
          accentColor={CLINIC_ACCENT}
        />
      </>
    );
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: CLINIC_ACCENT,
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
            title: 'Siparişler',
            tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: 'Mesajlar',
            tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setMessagesOpen(true);
            },
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
          name="doctors"
          options={{
            title: 'Hekimler',
            tabBarIcon: ({ focused }) => <TabIcon emoji="🩺" focused={focused} />,
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

      {/* Mobilde sayfa üstü modal yeni iş emri (opsiyonel kullanım) */}
      <Modal
        visible={newOrderOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNewOrderOpen(false)}
      >
        <NewOrderScreen
          clinicMode
          accentColor={CLINIC_ACCENT}
          onClose={() => setNewOrderOpen(false)}
        />
      </Modal>

      {/* Mesajlar Popup */}
      <MessagesPopup
        visible={messagesOpen}
        onClose={() => setMessagesOpen(false)}
        accentColor={CLINIC_ACCENT}
      />
    </>
  );
}
