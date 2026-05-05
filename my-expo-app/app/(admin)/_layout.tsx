import React, { useState, useEffect } from 'react';
import { Modal } from 'react-native';
import { Slot, Tabs, useRouter } from 'expo-router';
import { PatternsShell, useIsDesktop } from '../../core/layout/PatternsShell';
import { usePendingApprovals } from '../../core/hooks/usePendingApprovals';
import { useStockAlert } from '../../core/hooks/useStockAlert';
import { useAuthStore } from '../../core/store/authStore';
import { MobileTabBar, type MobileTabItem } from '../../core/ui/MobileTabBar';
import { NewOrderScreen } from '../../modules/orders/screens/NewOrderScreen';
import { MessagesPopup } from '../../modules/orders/components/MessagesPopup';
// usePendingLeaveCount removed — leave tracking no longer in this module
import { useOrderChatInbox } from '../../modules/orders/hooks/useOrderChatInbox';
import { useColorThemeStore, applyColorThemeWeb } from '../../core/store/colorThemeStore';
import { usePermissionStore } from '../../core/store/permissionStore';
import { CommandPalette, CommandPaletteFAB } from '../../core/ui/CommandPalette';

// Patterns admin teması — coral mercan
const ADMIN_DEFAULT_ACCENT = '#E97757';

// NOT: Desktop'ta "Yeni İş Emri" → route navigate eder (/(admin)/new-order),
// sidebar kaybolmaz. Modal SADECE mobil için.

export default function AdminLayout() {
  const router = useRouter();
  const { profile, loading } = useAuthStore();
  const pendingCount      = usePendingApprovals();
  const stockAlert        = useStockAlert();
  const isDesktop         = useIsDesktop();
  // pendingLeaveCount removed
  const { totalUnread: chatUnread } = useOrderChatInbox();
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);

  // Load saved color theme
  const { getTheme, loadTheme } = useColorThemeStore();
  const { fetchForPanel } = usePermissionStore();
  useEffect(() => {
    const theme = loadTheme('admin');
    applyColorThemeWeb(theme, ADMIN_DEFAULT_ACCENT);
  }, []);
  const accentColor = getTheme('admin').primary;

  // Fetch permissions for admin panel
  useEffect(() => {
    fetchForPanel('admin', profile?.user_type);
  }, [profile?.user_type]);

  // Yükleme tamamlandı ve kesinlikle admin değil → sidebar gösterme
  if (!loading && profile && profile.user_type !== 'admin') {
    return <Slot />;
  }

  const ADMIN_NAV = [
    // ── Ana ekran ──────────────────────────────────────────────────────────
    { label: 'Özet',         href: '/(admin)',              iconName: 'home' },

    // ── İş Yönetimi ────────────────────────────────────────────────────────
    // "Yeni İş Emri" CTA pill artık sidebar üst kısmında — nav'dan kaldırıldı
    { label: 'Siparişler',   href: '/(admin)/orders',       iconName: 'clipboard-list',  matchPrefix: true, sectionLabel: 'İş Yönetimi',
      requiresPermission: 'view_orders' },
    { label: 'Onaylar',      href: '/(admin)/approvals',    iconName: 'check-circle',    matchPrefix: true,
      badgeCount: pendingCount > 0 ? pendingCount : undefined,
      requiresPermission: 'view_approvals' },

    // ── Müşteriler ─────────────────────────────────────────────────────────
    { label: 'Klinikler',    href: '/(admin)/clinics',      iconName: 'building-2',      matchPrefix: true, sectionLabel: 'Müşteriler' },

    // ── Mali İşlemler — tek hub
    { label: 'Mali İşlemler', href: '/(admin)/finance',     iconName: 'landmark',        matchPrefix: false, sectionLabel: 'Mali İşlemler',
      requiresPermission: 'view_financials' },

    // ── Ekip & Performans — tek hub ──────────────────────────────────────
    { label: 'Ekip & Performans', href: '/(admin)/ik-depo',  iconName: 'users',           matchPrefix: false, sectionLabel: 'Ekip & Performans',
      requiresPermission: 'view_team' },

    // ── Stok & Depo ───────────────────────────────────────────────────────
    { label: 'Stok & Depo',  href: '/(admin)/stock',        iconName: 'package',         matchPrefix: true, sectionLabel: 'Stok & Depo', badgeCount: stockAlert,
      requiresPermission: 'view_stock' },

    // ── Sistem ─────────────────────────────────────────────────────────────
    { label: 'Ayarlar',      href: '/(admin)/settings',         iconName: 'settings',    matchPrefix: true, sectionLabel: 'Sistem',
      requiresPermission: 'view_settings' },
  ];

  if (isDesktop) {
    return (
      <>
        <PatternsShell
          navItems={ADMIN_NAV}
          accentColor={accentColor}
          onPressMessages={() => setMessagesOpen(true)}
          messagesUnreadCount={chatUnread}
          panelType="admin"
          newOrderHref="/(admin)/new-order"
        />
        <MessagesPopup
          visible={messagesOpen}
          onClose={() => setMessagesOpen(false)}
          accentColor={accentColor}
        />
        <CommandPalette
          navItems={ADMIN_NAV}
          onNavigate={(href) => router.push(href as any)}
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
        <Tabs.Screen name="new-order" options={{ title: 'Yeni Sipariş' }} />
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
        <Tabs.Screen name="performance" options={{ title: 'Performans', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="documents" options={{ title: 'Dosyalar', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="ik-depo" options={{ title: 'Ekip & Performans', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="checkin-settings" options={{ title: 'QR Check-in', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="approvals" options={{ title: 'Onaylar' }} />
        <Tabs.Screen name="logs" options={{ title: 'Loglar' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
        <Tabs.Screen name="permissions" options={{ title: 'Yetkiler', tabBarStyle: { display: 'none' } }} />
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
