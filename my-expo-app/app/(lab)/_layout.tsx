import { useState, useEffect } from 'react';
import { Modal, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { C as Colors } from '../../core/theme/colors';
import { PatternsShell, useIsDesktop } from '../../core/layout/PatternsShell';
import { MobileHeader } from '../../core/ui/MobileHeader';
import { usePendingApprovals as useDesignPending } from '../../modules/approvals/hooks/usePendingApprovals';
import { useStockAlert } from '../../core/hooks/useStockAlert';
import { MobileTabBar } from '../../core/ui/MobileTabBar';
import type { MobileTabItem } from '../../core/ui/MobileTabBar';
import { NewOrderScreen } from '../../modules/orders/screens/NewOrderScreen';
import { ScanB6Mobile } from '../../modules/orders/screens/ScanB6Mobile';
import { useThemeModeStore } from '../../core/store/themeModeStore';
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
  const [scanOpen,     setScanOpen]     = useState(false);
  const isDark = useThemeModeStore(s => s.resolvedDark);

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
    { label: 'Sağlık Kurumları', emoji: '🏥', href: '/(lab)/clinics',     iconName: 'building-2',       matchPrefix: true, sectionLabel: 'Müşteriler' },

    // ── Finans — tek hub (Faturalar · Giderler · Çek · Kasa · Fiyat Listesi · Rapor)
    { label: 'Finans', emoji: '💰', href: '/(lab)/finance',        iconName: 'landmark',         matchPrefix: false, sectionLabel: 'Finans',
      requiresPermission: 'view_financials' },

    // ── Ekip — tek hub ──────────────────────────────────────────────────
    { label: 'Ekip', emoji: '👨‍💼', href: '/(lab)/ik-depo',     iconName: 'users',            matchPrefix: false, sectionLabel: 'Ekip',
      requiresPermission: 'view_team' },

    // ── Stok & Depo ───────────────────────────────────────────────────────
    { label: 'Stok & Depo',   emoji: '📦', href: '/(lab)/stock',          iconName: 'package',          matchPrefix: true, sectionLabel: 'Stok & Depo',
      badgeCount: stockAlert,
      requiresPermission: 'view_stock' },
    { label: 'Tedarikçiler',  emoji: '🏢', href: '/(lab)/suppliers',      iconName: 'building',         matchPrefix: true, sectionLabel: 'Stok & Depo',
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
    { routeName: 'index',      label: 'Ana',     icon: 'home' },
    { routeName: 'all-orders', label: 'Vakalar', icon: 'clipboard-list' },
    { routeName: 'scan',       label: 'Tara',    icon: 'qr-code',        onPress: () => setScanOpen(true), fab: true },
    { routeName: 'messages',   label: 'Mesaj',   icon: 'message-circle', onPress: () => setMessagesOpen(true), badgeCount: chatUnread },
    { routeName: 'profile',    label: 'Profil',  icon: 'user' },
  ];

  return (
    <>
      <View style={{ flex: 1, backgroundColor: isDark ? '#0E0E0E' : '#F5F2EA' }}>
        <MobileHeader accentColor={accentColor} />
        <Tabs
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: 'transparent' },
            // Hide the default tab bar entirely — MobileTabBar is rendered below as a free overlay
            tabBarStyle: { display: 'none' },
          }}
        >
        <Tabs.Screen name="index" options={{ title: 'Bugün' }} />
        <Tabs.Screen name="all-orders" options={{ title: 'Tüm İşler' }} />
        <Tabs.Screen name="production"  options={{ title: 'Üretim Panosu' }} />
        <Tabs.Screen name="deliveries"    options={{ title: 'Teslimatlar' }} />
        <Tabs.Screen name="courier"       options={{ title: 'Kurye Paneli' }} />
        <Tabs.Screen name="delivery/[id]" options={{}} />
        <Tabs.Screen name="analytics"     options={{ title: 'Analitik' }} />
        <Tabs.Screen name="stock"        options={{ title: 'Stok & Depo' }} />
        <Tabs.Screen name="suppliers"    options={{ title: 'Tedarikçiler' }} />
        <Tabs.Screen name="new-order"    options={{ title: 'Yeni Sipariş' }} />
        <Tabs.Screen name="users"        options={{ title: 'Kullanıcılar' }} />
        <Tabs.Screen name="clinics"      options={{ title: 'Sağlık Kurumları' }} />
        <Tabs.Screen name="lab-services" options={{ title: 'Hizmetler' }} />
        <Tabs.Screen name="finance"        options={{ title: 'Finans' }} />
        <Tabs.Screen name="invoices"       options={{ title: 'Faturalar' }} />
        <Tabs.Screen name="expenses"       options={{ title: 'Giderler' }} />
        <Tabs.Screen name="checks"         options={{ title: 'Çek/Senet' }} />
        <Tabs.Screen name="cash"           options={{ title: 'Kasa/Banka' }} />
        <Tabs.Screen name="finance-report" options={{ title: 'Gelir/Gider' }} />
        <Tabs.Screen name="ik-depo"     options={{ title: 'Ekip' }} />
        <Tabs.Screen name="employees" options={{ title: 'Ekip' }} />
        <Tabs.Screen name="performance" options={{ title: 'Performans' }} />
        <Tabs.Screen name="documents" options={{ title: 'Dosyalar' }} />
        <Tabs.Screen name="balance" options={{ title: 'Cari Hesap' }} />
        <Tabs.Screen name="checkin-settings" options={{ title: 'QR Check-in' }} />
        <Tabs.Screen name="approvals" options={{ title: 'Onaylar' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
        <Tabs.Screen name="settings" options={{ title: 'Ayarlar' }} />
        <Tabs.Screen name="order/[id]" options={{ title: 'İş Emri' }} />
        <Tabs.Screen name="order/route/[id]" options={{ title: 'Rota' }} />
        <Tabs.Screen name="order/occlusion/[id]" options={{ title: 'Oklüzyon' }} />
        <Tabs.Screen name="invoice/[id]" options={{}} />
        <Tabs.Screen name="occlusion-test" options={{}} />
        <Tabs.Screen name="setup-wizard" options={{ title: 'Kurulum' }} />
        </Tabs>

        {/* Floating tab bar — rendered OUTSIDE Tabs so its pointerEvents are fully ours */}
        <MobileTabBar
          items={MOBILE_TABS}
          baseRoute="/(lab)"
          accentColor={accentColor}
        />
      </View>

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

      {/* Scan (B6) — Tara FAB → kamera + QR scan */}
      <Modal
        visible={scanOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setScanOpen(false)}
      >
        <ScanB6Mobile
          onClose={() => setScanOpen(false)}
          onOpenOrder={(id) => { setScanOpen(false); router.push(`/(lab)/order/${id}` as any); }}
        />
      </Modal>

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
