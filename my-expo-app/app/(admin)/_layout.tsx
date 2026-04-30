import React, { useState, useEffect } from 'react';
import { Modal } from 'react-native';
import { Slot, Tabs } from 'expo-router';
import { DesktopShell, useIsDesktop } from '../../core/layout/DesktopShell';
import { usePendingApprovals } from '../../core/hooks/usePendingApprovals';
import { useStockAlert } from '../../core/hooks/useStockAlert';
import { useAuthStore } from '../../core/store/authStore';
import { MobileTabBar, type MobileTabItem } from '../../core/ui/MobileTabBar';
import { NewOrderScreen } from '../../modules/orders/screens/NewOrderScreen';
import { MessagesPopup } from '../../modules/orders/components/MessagesPopup';
import { usePendingLeaveCount } from '../../modules/hr/hooks/useHR';
import { useOrderChatInbox } from '../../modules/orders/hooks/useOrderChatInbox';
import { useColorThemeStore, applyColorThemeWeb } from '../../core/store/colorThemeStore';

const ADMIN_DEFAULT_ACCENT = '#0F172A';

// NOT: Desktop'ta "Yeni İş Emri" → route navigate eder (/(admin)/new-order),
// sidebar kaybolmaz. Modal SADECE mobil için.

export default function AdminLayout() {
  const { profile, loading } = useAuthStore();
  const pendingCount      = usePendingApprovals();
  const stockAlert        = useStockAlert();
  const isDesktop         = useIsDesktop();
  const pendingLeaveCount = usePendingLeaveCount();
  const { totalUnread: chatUnread } = useOrderChatInbox();
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);

  // Load saved color theme
  const { getTheme, loadTheme } = useColorThemeStore();
  useEffect(() => {
    const theme = loadTheme('admin');
    applyColorThemeWeb(theme, ADMIN_DEFAULT_ACCENT);
  }, []);
  const accentColor = getTheme('admin').primary;

  // Yükleme tamamlandı ve kesinlikle admin değil → sidebar gösterme
  if (!loading && profile && profile.user_type !== 'admin') {
    return <Slot />;
  }

  const ADMIN_NAV = [
    // ── Ana ekran ──────────────────────────────────────────────────────────
    { label: 'Özet',         emoji: '📊', href: '/(admin)',              iconName: 'grid',          iconSet: 'mdi' as const },

    // ── İş Yönetimi ────────────────────────────────────────────────────────
    { label: 'Siparişler',   emoji: '📋', href: '/(admin)/orders',       iconName: 'clipboard',      iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'İş Yönetimi' },
    { label: 'Yeni İş Emri', emoji: '➕', href: '/(admin)/new-order',   iconName: 'plus-circle',    iconSet: 'mdi' as const },
    { label: 'Onaylar',      emoji: '✅', href: '/(admin)/approvals',   iconName: 'check-circle',   iconSet: 'mdi' as const, badge: pendingCount > 0, matchPrefix: true },

    // ── Müşteriler ─────────────────────────────────────────────────────────
    { label: 'Klinikler',    emoji: '🏥', href: '/(admin)/clinics',      iconName: 'briefcase',     iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'Müşteriler' },
    { label: 'Kullanıcılar', emoji: '👥', href: '/(admin)/users',        iconName: 'users',         iconSet: 'mdi' as const, matchPrefix: true },

    // ── Mali İşlemler — tek hub (Faturalar · Giderler · Çek · Kasa · Fiyat · Rapor)
    { label: 'Mali İşlemler', emoji: '💰', href: '/(admin)/finance',       iconName: 'landmark',         iconSet: 'mdi' as const, matchPrefix: false, sectionLabel: 'Mali İşlemler' },

    // ── İnsan Kaynakları — tek hub ────────────────────────────────────────
    { label: 'İnsan Kaynakları', emoji: '👨‍💼', href: '/(admin)/ik-depo', iconName: 'users',            iconSet: 'mdi' as const, matchPrefix: false, sectionLabel: 'İnsan Kaynakları',
      badgeCount: pendingLeaveCount > 0 ? pendingLeaveCount : undefined },

    // ── Stok & Depo ───────────────────────────────────────────────────────
    { label: 'Stok & Depo',  emoji: '📦', href: '/(admin)/stock',         iconName: 'package',          iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'Stok & Depo', badgeCount: stockAlert },

    // ── Sistem ─────────────────────────────────────────────────────────────
    { label: 'QR Check-in',  emoji: '📷', href: '/(admin)/checkin-settings', iconName: 'camera',    iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'Sistem' },
    { label: 'Loglar',       emoji: '📜', href: '/(admin)/logs',             iconName: 'file-text', iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Ayarlar',      emoji: '⚙️', href: '/(admin)/settings',        iconName: 'settings',  iconSet: 'mdi' as const, matchPrefix: true },
  ];

  if (isDesktop) {
    return (
      <>
        <DesktopShell
          navItems={ADMIN_NAV}
          accentColor={accentColor}
          onPressMessages={() => setMessagesOpen(true)}
          messagesUnreadCount={chatUnread}
          notificationsCount={pendingCount}
          panelType="admin"
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
    { routeName: 'index',     label: 'Özet',      icon: 'grid' },
    { routeName: 'orders',    label: 'Sipariş',   icon: 'clipboard' },
    { routeName: 'new-order', label: 'Yeni',      icon: 'plus-circle', onPress: () => setNewOrderOpen(true) },
    { routeName: 'approvals', label: 'Onaylar',   icon: 'check-circle', badge: pendingCount > 0 },
    { routeName: 'settings',  label: 'Ayarlar',   icon: 'settings' },
  ];
  void stockAlert;

  return (
    <>
      <Tabs
        tabBar={(props) => (
          <MobileTabBar
            state={props.state}
            navigation={props.navigation}
            items={MOBILE_TABS}
            accentColor={accentColor}
          />
        )}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Özet' }} />
        <Tabs.Screen name="new-order" options={{ title: 'Yeni İş' }} />
        <Tabs.Screen name="users" options={{ title: 'Kullanıcılar' }} />
        <Tabs.Screen name="clinics" options={{ title: 'Klinikler' }} />
        <Tabs.Screen name="doctors" options={{ title: 'Hekimler' }} />
        <Tabs.Screen name="orders" options={{ title: 'Siparişler' }} />
        <Tabs.Screen name="stock" options={{ title: 'Stok' }} />
        <Tabs.Screen name="expenses" options={{ title: 'Giderler', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="checks" options={{ title: 'Çek/Senet', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="cash" options={{ title: 'Kasa/Banka', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="finance-report" options={{ title: 'Gelir/Gider', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="employees" options={{ title: 'Çalışanlar', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="hr" options={{ title: 'İzin & Devam', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="payroll" options={{ title: 'Bordro', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="sgk" options={{ title: 'SGK', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="performance" options={{ title: 'Performans', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="documents" options={{ title: 'Dosyalar', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="checkin-settings" options={{ title: 'QR Check-in', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="approvals" options={{ title: 'Onaylar' }} />
        <Tabs.Screen name="logs" options={{ title: 'Loglar' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
        <Tabs.Screen name="settings" options={{ title: 'Ayarlar', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="order/[id]" options={{ title: 'İş Emri', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="order/occlusion/[id]" options={{ title: 'Oklüzyon', tabBarStyle: { display: 'none' } }} />
      </Tabs>

      {/* Yeni İş Emri — SADECE mobilde modal olarak açılır */}
      <Modal
        visible={newOrderOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNewOrderOpen(false)}
      >
        <NewOrderScreen accentColor={accentColor} onClose={() => setNewOrderOpen(false)} />
      </Modal>

      {/* Mesajlar Popup */}
      <MessagesPopup
        visible={messagesOpen}
        onClose={() => setMessagesOpen(false)}
        accentColor={accentColor}
      />
    </>
  );
}
