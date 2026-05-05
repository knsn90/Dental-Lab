import { useState, useEffect } from 'react';
import { Modal } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { C as Colors } from '../../core/theme/colors';
import { PatternsShell, useIsDesktop } from '../../core/layout/PatternsShell';
import { usePendingApprovals as useDesignPending } from '../../modules/approvals/hooks/usePendingApprovals';
import { useStockAlert } from '../../core/hooks/useStockAlert';
import { MobileTabBar, type MobileTabItem } from '../../core/ui/MobileTabBar';
import { NewOrderScreen } from '../../modules/orders/screens/NewOrderScreen';
import { MessagesPopup } from '../../modules/orders/components/MessagesPopup';
// usePendingLeaveCount removed — leave tracking no longer in this module
import { useAuthStore } from '../../core/store/authStore';
import { useOrderChatInbox } from '../../modules/orders/hooks/useOrderChatInbox';
import { usePendingActionCount } from '../../modules/orders/hooks/usePendingActionCount';
import { useColorThemeStore, applyColorThemeWeb } from '../../core/store/colorThemeStore';
import { usePermissionStore } from '../../core/store/permissionStore';
import { CommandPalette, CommandPaletteFAB } from '../../core/ui/CommandPalette';

// NOT: Desktop'ta "Yeni İş Emri" tıklanınca route navigate eder (/(lab)/new-order),
// böylece DesktopShell sidebar kaybolmaz. Modal SADECE mobil için.

// Patterns lab teması — saffron sarı
const LAB_DEFAULT_ACCENT = '#F5C24B';

export default function LabLayout() {
  const router = useRouter();
  const { approvals: pendingDesign } = useDesignPending();
  const pendingCount = pendingDesign.length;
  const stockAlert      = useStockAlert();
  const isDesktop       = useIsDesktop();
  const { profile }     = useAuthStore();
  // pendingLeaveCount removed
  const { totalUnread: chatUnread } = useOrderChatInbox();
  const pendingActionCount = usePendingActionCount();
  const isManager = profile?.role === 'manager' || profile?.user_type === 'admin';

  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);

  // Load saved color theme
  const { getTheme, loadTheme } = useColorThemeStore();
  const { fetchForPanel, invalidate } = usePermissionStore();
  useEffect(() => {
    const theme = loadTheme('lab');
    applyColorThemeWeb(theme, LAB_DEFAULT_ACCENT);
  }, []);
  const accentColor = getTheme('lab').primary;

  // Fetch permissions for lab panel (admin viewing lab → lab_manager perms)
  useEffect(() => {
    fetchForPanel('lab', profile?.user_type);
  }, [profile?.user_type]);

  // Re-fetch permissions when tab regains focus (admin may have changed them)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const userType = profile?.user_type;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        invalidate();
        fetchForPanel('lab', userType);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [profile?.user_type]);

  const LAB_NAV = [
    // ── Ana ekran ──────────────────────────────────────────────────────────
    { label: 'Bugün',         emoji: '📅', href: '/(lab)',                iconName: 'home' },

    // ── İş Yönetimi ────────────────────────────────────────────────────────
    // "Yeni Sipariş" CTA pill artık sidebar üst kısmında — nav'dan kaldırıldı
    { label: 'Siparişler',    emoji: '📋', href: '/(lab)/all-orders',     iconName: 'clipboard-list',   matchPrefix: true,
      sectionLabel: 'İş Yönetimi',
      badgeCount: pendingActionCount > 0 ? pendingActionCount : undefined,
      requiresPermission: 'view_orders' },
    { label: 'Onaylar',       emoji: '✅', href: '/(lab)/approvals',      iconName: 'check-circle',     matchPrefix: true,
      badgeCount: pendingCount > 0 ? pendingCount : undefined,
      requiresPermission: 'view_approvals' },

    // ── Müşteriler ─────────────────────────────────────────────────────────
    { label: 'Klinikler',     emoji: '🏥', href: '/(lab)/clinics',        iconName: 'building-2',       matchPrefix: true, sectionLabel: 'Müşteriler' },

    // ── Mali İşlemler — tek hub (Faturalar · Giderler · Çek · Kasa · Fiyat Listesi · Rapor)
    { label: 'Mali İşlemler', emoji: '💰', href: '/(lab)/finance',        iconName: 'landmark',         matchPrefix: false, sectionLabel: 'Mali İşlemler',
      requiresPermission: 'view_financials' },

    // ── Ekip & Performans — tek hub ──────────────────────────────────────
    { label: 'Ekip & Performans', emoji: '👨‍💼', href: '/(lab)/ik-depo',     iconName: 'users',            matchPrefix: false, sectionLabel: 'Ekip & Performans',
      requiresPermission: 'view_team' },

    // ── Stok & Depo ───────────────────────────────────────────────────────
    { label: 'Stok & Depo',   emoji: '📦', href: '/(lab)/stock',          iconName: 'package',          matchPrefix: true, sectionLabel: 'Stok & Depo',
      badgeCount: stockAlert,
      requiresPermission: 'view_stock' },

    // ── Ayarlar (Kullanıcılar + QR Check-in + Genel Ayarlar tek hub) ──────
    { label: 'Ayarlar',       emoji: '⚙️', href: '/(lab)/settings',         iconName: 'settings',       matchPrefix: true,
      requiresPermission: 'view_settings' },
  ];

  if (isDesktop) {
    return (
      <>
        <PatternsShell
          navItems={LAB_NAV}
          accentColor={accentColor}
          onPressMessages={() => setMessagesOpen(true)}
          messagesUnreadCount={chatUnread}
          panelType="lab"
          newOrderHref="/(lab)/new-order"
        />
        <MessagesPopup
          visible={messagesOpen}
          onClose={() => setMessagesOpen(false)}
          accentColor={accentColor}
        />
        <CommandPalette
          navItems={LAB_NAV}
          onNavigate={(href) => router.push(href as any)}
          accentColor={accentColor}
        />
      </>
    );
  }

  const MOBILE_TABS: MobileTabItem[] = [
    { routeName: 'index',      label: 'Bugün',   icon: 'home'                                       },
    { routeName: 'all-orders', label: 'İşler',   icon: 'clipboard-list'                             },
    { routeName: 'new-order',  label: 'Yeni',    icon: 'plus-circle',  onPress: () => setNewOrderOpen(true) },
    { routeName: 'approvals',  label: 'Onaylar', icon: 'check-circle', badge: pendingCount > 0       },
    { routeName: 'settings',   label: 'Ayarlar', icon: 'settings'                                   },
  ];

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
        <Tabs.Screen name="index" options={{ title: 'Bugün' }} />
        <Tabs.Screen name="all-orders" options={{ title: 'Tüm İşler' }} />
        <Tabs.Screen name="production"  options={{ title: 'Üretim Panosu', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="deliveries"    options={{ title: 'Teslimatlar',  tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="courier"       options={{ title: 'Kurye Paneli', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="delivery/[id]" options={{ tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="analytics"     options={{ title: 'Analitik',     tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="stock"        options={{ title: 'Stok & Depo',  tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="new-order"    options={{ title: 'Yeni Sipariş' }} />
        <Tabs.Screen name="users"        options={{ title: 'Kullanıcılar' }} />
        <Tabs.Screen name="clinics"      options={{ title: 'Klinikler' }} />
        <Tabs.Screen name="lab-services" options={{ title: 'Hizmetler',    tabBarStyle: { display: 'none' } }} />
        {/* Mali İşlemler hub — tüm finans sekmelerini içerir */}
        <Tabs.Screen name="finance"        options={{ title: 'Mali İşlemler',  tabBarStyle: { display: 'none' } }} />
        {/* Bireysel finans rotaları — deep link / geriye compat için korunuyor */}
        <Tabs.Screen name="invoices"       options={{ title: 'Faturalar',      tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="expenses"       options={{ title: 'Giderler',       tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="checks"         options={{ title: 'Çek/Senet',      tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="cash"           options={{ title: 'Kasa/Banka',     tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="finance-report" options={{ title: 'Gelir/Gider',    tabBarStyle: { display: 'none' } }} />
        {/* Ekip & Performans hub */}
        <Tabs.Screen name="ik-depo"     options={{ title: 'Ekip & Performans', tabBarStyle: { display: 'none' } }} />
        {/* Bireysel rotalar — deep link compat */}
        <Tabs.Screen name="employees" options={{ title: 'Çalışanlar', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="performance" options={{ title: 'Performans', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="documents" options={{ title: 'Dosyalar', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="balance" options={{ title: 'Cari Hesap', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="checkin-settings" options={{ title: 'QR Check-in', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="approvals" options={{ title: 'Onaylar' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
        <Tabs.Screen name="settings" options={{ title: 'Ayarlar', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="order/[id]" options={{ title: 'İş Emri', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="order/route/[id]" options={{ title: 'Rota', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="order/occlusion/[id]" options={{ title: 'Oklüzyon', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="invoice/[id]" options={{ tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="occlusion-test" options={{ tabBarStyle: { display: 'none' } }} />
      </Tabs>

      {/* Yeni İş Emri — her zaman modal olarak açılır */}
      <Modal
        visible={newOrderOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNewOrderOpen(false)}
      >
        <NewOrderScreen onClose={() => setNewOrderOpen(false)} />
      </Modal>

      {/* Mesajlar Popup */}
      <MessagesPopup
        visible={messagesOpen}
        onClose={() => setMessagesOpen(false)}
        accentColor={accentColor}
      />

      {/* Command Palette — modal, tüm sayfalarda erişilebilir */}
      <CommandPalette
        navItems={LAB_NAV}
        onNavigate={(href) => router.push(href as any)}
        accentColor={accentColor}
      />

      {/* FAB — mobilde arama/komut butonu */}
      <CommandPaletteFAB accentColor={accentColor} />
    </>
  );
}
