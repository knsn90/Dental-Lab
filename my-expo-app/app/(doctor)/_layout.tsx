import { useState, useEffect } from 'react';
import { Modal, Text, View } from 'react-native';
import { Slot, Tabs, useRouter } from 'expo-router';
import { C as Colors } from '../../core/theme/colors';
import { PatternsShell, useIsDesktop } from '../../core/layout/PatternsShell';
import { MobileHeader } from '../../core/ui/MobileHeader';
import { MobileTabBar } from '../../core/ui/MobileTabBar';
import type { MobileTabItem } from '../../core/ui/MobileTabBar';
import { useAuthStore } from '../../core/store/authStore';
import { NewOrderScreen } from '../../modules/orders/screens/NewOrderScreen';
import { ScanB6Mobile } from '../../modules/orders/screens/ScanB6Mobile';
import { useThemeModeStore } from '../../core/store/themeModeStore';
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
  const router = useRouter();
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [scanOpen,     setScanOpen]     = useState(false);
  const isDark = useThemeModeStore(s => s.resolvedDark);
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

  const MOBILE_TABS: MobileTabItem[] = [
    { routeName: 'index',     label: 'Ana',     icon: 'home' },
    { routeName: 'orders',    label: 'Vakalar', icon: 'clipboard-list' },
    { routeName: 'scan',      label: 'Tara',    icon: 'qr-code',        onPress: () => setScanOpen(true), fab: true },
    { routeName: 'messages',  label: 'Mesaj',   icon: 'message-circle', onPress: () => setMessagesOpen(true), badgeCount: totalUnread },
    { routeName: 'profile',   label: 'Profil',  icon: 'user' },
  ];

  return (
    <>
      <View style={{ flex: 1, backgroundColor: isDark ? '#0E0E0E' : '#F5F2EA' }}>
        <MobileHeader accentColor={accentColor} />
        <Tabs
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: 'transparent' },
            tabBarStyle: { display: 'none' },
          }}
        >
          <Tabs.Screen name="index"      options={{ title: 'Dashboard' }} />
          <Tabs.Screen name="orders"     options={{ title: 'Siparişlerim' }} />
          <Tabs.Screen name="messages"   options={{ title: 'Mesajlar' }} />
          <Tabs.Screen name="new-order"  options={{ title: 'Yeni Sipariş' }} />
          <Tabs.Screen name="settings"   options={{ title: 'Ayarlar' }} />
          <Tabs.Screen name="profile"    options={{ href: null } as any} />
          <Tabs.Screen name="order/[id]" options={{ href: null, title: 'İş Emri' } as any} />
        </Tabs>

        {/* Floating tab bar — rendered OUTSIDE Tabs so its pointerEvents are fully ours */}
        <MobileTabBar
          items={MOBILE_TABS}
          baseRoute="/(doctor)"
          accentColor={accentColor}
        />
      </View>

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

      {/* Scan (B6) — Tara FAB → kamera + QR scan */}
      <Modal
        visible={scanOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setScanOpen(false)}
      >
        <ScanB6Mobile
          onClose={() => setScanOpen(false)}
          onOpenOrder={(id) => { setScanOpen(false); router.push(`/(doctor)/order/${id}` as any); }}
        />
      </Modal>
    </>
  );
}
