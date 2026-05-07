import React, { useState, useEffect } from 'react';
import { Modal, View } from 'react-native';
import { Slot, Tabs, useRouter } from 'expo-router';
import { PatternsShell, useIsDesktop } from '../../core/layout/PatternsShell';
import { MobileHeader } from '../../core/ui/MobileHeader';
import { usePendingApprovals } from '../../core/hooks/usePendingApprovals';
import { useStockAlert } from '../../core/hooks/useStockAlert';
import { useAuthStore } from '../../core/store/authStore';
import { MobileTabBar } from '../../core/ui/MobileTabBar';
import type { MobileTabItem } from '../../core/ui/MobileTabBar';
import { NewOrderScreen } from '../../modules/orders/screens/NewOrderScreen';
import { ScanB6Mobile } from '../../modules/orders/screens/ScanB6Mobile';
import { MessagesPopup } from '../../modules/orders/components/MessagesPopup';
// usePendingLeaveCount removed — leave tracking no longer in this module
import { useOrderChatInbox } from '../../modules/orders/hooks/useOrderChatInbox';
import { useColorThemeStore, applyColorThemeWeb } from '../../core/store/colorThemeStore';
import { usePermissionStore } from '../../core/store/permissionStore';
import { CommandPalette, CommandPaletteFAB } from '../../core/ui/CommandPalette';
import { useThemeModeStore } from '../../core/store/themeModeStore';

// Patterns admin teması — krem/mercan palette
const ADMIN_DEFAULT_ACCENT = '#EA7A4C';

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
  const [scanOpen,     setScanOpen]     = useState(false);
  const isDark = useThemeModeStore(s => s.resolvedDark);

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
    { label: 'Sağlık Kurumları', href: '/(admin)/clinics',  iconName: 'building-2',      matchPrefix: true, sectionLabel: 'Müşteriler' },

    // ── Finans — tek hub
    { label: 'Finans',       href: '/(admin)/finance',     iconName: 'landmark',        matchPrefix: false, sectionLabel: 'Finans',
      requiresPermission: 'view_financials' },

    // ── Ekip — tek hub ──────────────────────────────────────────────────
    { label: 'Ekip', href: '/(admin)/ik-depo',  iconName: 'users',           matchPrefix: false, sectionLabel: 'Ekip',
      requiresPermission: 'view_team' },

    // ── Stok & Depo ───────────────────────────────────────────────────────
    { label: 'Stok & Depo',  href: '/(admin)/stock',        iconName: 'package',         matchPrefix: true, sectionLabel: 'Stok & Depo', badgeCount: stockAlert,
      requiresPermission: 'view_stock' },
    { label: 'Tedarikçiler', href: '/(admin)/suppliers',    iconName: 'building',        matchPrefix: true, sectionLabel: 'Stok & Depo',
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
    { routeName: 'index',     label: 'Ana',     icon: 'home' },
    { routeName: 'orders',    label: 'Vakalar', icon: 'clipboard-list' },
    { routeName: 'scan',      label: 'Tara',    icon: 'qr-code',         onPress: () => setScanOpen(true), fab: true },
    { routeName: 'messages',  label: 'Mesaj',   icon: 'message-circle',  onPress: () => setMessagesOpen(true), badgeCount: chatUnread },
    { routeName: 'profile',   label: 'Profil',  icon: 'user' },
  ];
  void stockAlert;

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
        <Tabs.Screen name="index" options={{ title: 'Özet' }} />
        <Tabs.Screen name="new-order" options={{ title: 'Yeni Sipariş' }} />
        <Tabs.Screen name="users" options={{ title: 'Kullanıcılar' }} />
        <Tabs.Screen name="clinics" options={{ title: 'Sağlık Kurumları' }} />
        <Tabs.Screen name="doctors" options={{ title: 'Hekimler' }} />
        <Tabs.Screen name="orders" options={{ title: 'Siparişler' }} />
        <Tabs.Screen name="stock" options={{ title: 'Stok' }} />
        <Tabs.Screen name="suppliers" options={{ title: 'Tedarikçiler' }} />
        <Tabs.Screen name="expenses" options={{ title: 'Giderler' }} />
        <Tabs.Screen name="checks" options={{ title: 'Çek/Senet' }} />
        <Tabs.Screen name="cash" options={{ title: 'Kasa/Banka' }} />
        <Tabs.Screen name="finance-report" options={{ title: 'Gelir/Gider' }} />
        <Tabs.Screen name="employees" options={{ title: 'Ekip' }} />
        <Tabs.Screen name="performance" options={{ title: 'Performans' }} />
        <Tabs.Screen name="documents" options={{ title: 'Dosyalar' }} />
        <Tabs.Screen name="ik-depo" options={{ title: 'Ekip' }} />
        <Tabs.Screen name="checkin-settings" options={{ title: 'QR Check-in' }} />
        <Tabs.Screen name="approvals" options={{ title: 'Onaylar' }} />
        <Tabs.Screen name="logs" options={{ title: 'Loglar' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
        <Tabs.Screen name="permissions" options={{ title: 'Yetkiler' }} />
        <Tabs.Screen name="settings" options={{ title: 'Ayarlar' }} />
        <Tabs.Screen name="order/[id]" options={{ title: 'İş Emri' }} />
        <Tabs.Screen name="order/occlusion/[id]" options={{ title: 'Oklüzyon' }} />
        <Tabs.Screen name="setup-wizard" options={{ title: 'Kurulum' }} />
        </Tabs>

        {/* Floating tab bar — rendered OUTSIDE Tabs so its pointerEvents are fully ours */}
        <MobileTabBar
          items={MOBILE_TABS}
          baseRoute="/(admin)"
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
        <NewOrderScreen accentColor={accentColor} onClose={() => setNewOrderOpen(false)} />
      </Modal>

      {/* Mesajlar Popup */}
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
          onOpenOrder={(id) => { setScanOpen(false); router.push(`/(admin)/order/${id}` as any); }}
        />
      </Modal>
    </>
  );
}
