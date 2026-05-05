import { useState, useEffect } from 'react';
import { Modal, Text } from 'react-native';
import { Slot, Tabs } from 'expo-router';
import { C as Colors } from '../../core/theme/colors';
import { PatternsShell, useIsDesktop } from '../../core/layout/PatternsShell';
import { useAuthStore } from '../../core/store/authStore';
import { NewOrderScreen } from '../../modules/orders/screens/NewOrderScreen';
import { MessagesPopup } from '../../modules/orders/components/MessagesPopup';
import { useOrderChatInbox } from '../../modules/orders/hooks/useOrderChatInbox';
import { useColorThemeStore, applyColorThemeWeb } from '../../core/store/colorThemeStore';

// Patterns doctor teması — sage yeşili (clinic ile aynı palet)
const DOCTOR_DEFAULT_ACCENT = '#6BA888';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 24 : 22, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

export default function DoctorLayout() {
  const { profile, loading } = useAuthStore();
  const isDesktop = useIsDesktop();
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const { totalUnread } = useOrderChatInbox();

  // Load saved color theme
  const { getTheme, loadTheme } = useColorThemeStore();
  useEffect(() => {
    const theme = loadTheme('doctor');
    applyColorThemeWeb(theme, DOCTOR_DEFAULT_ACCENT);
  }, []);
  const accentColor = getTheme('doctor').primary;

  const DOCTOR_NAV = [
    { label: 'Dashboard',    href: '/(doctor)',           iconName: 'home' },
    { label: 'Siparişlerim', href: '/(doctor)/orders',    iconName: 'clipboard-list', matchPrefix: true },
    { label: 'Ayarlar',      href: '/(doctor)/settings',  iconName: 'settings',       matchPrefix: true },
  ];

  // Hekim olmayan kullanıcı bu layout'a düştüyse sidebar gösterme
  if (loading || !profile || profile.user_type !== 'doctor') {
    return <Slot />;
  }

  if (isDesktop) {
    return (
      <>
        <PatternsShell
          navItems={DOCTOR_NAV}
          accentColor={accentColor}
          onPressMessages={() => setMessagesOpen(true)}
          messagesUnreadCount={totalUnread}
          panelType="doctor"
          newOrderHref="/(doctor)/new-order"
        />
        <MessagesPopup
          visible={messagesOpen}
          onClose={() => setMessagesOpen(false)}
          accentColor={accentColor}
        />
      </>
    );
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: accentColor,
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
            tabBarBadge: totalUnread > 0 ? totalUnread : undefined,
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
            title: 'Yeni Sipariş',
            tabBarIcon: ({ focused }) => <TabIcon emoji="➕" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Ayarlar',
            tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} />,
          }}
        />
        <Tabs.Screen name="profile"   options={{ href: null } as any} />
        <Tabs.Screen name="order/[id]" options={{ href: null, title: 'İş Emri' } as any} />
      </Tabs>

      {/* Yeni İş Emri — SADECE mobilde modal olarak açılır */}
      <Modal
        visible={newOrderOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNewOrderOpen(false)}
      >
        <NewOrderScreen doctorMode accentColor={accentColor} onClose={() => setNewOrderOpen(false)} />
      </Modal>

      {/* Mesajlar Popup — her ekran boyutunda */}
      <MessagesPopup
        visible={messagesOpen}
        onClose={() => setMessagesOpen(false)}
        accentColor={accentColor}
      />
    </>
  );
}
