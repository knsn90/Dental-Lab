import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
const NewOrderScreen: any = React.lazy(() => import('../../modules/orders/screens/NewOrderScreen').then(m => ({ default: (m as any).NewOrderScreen })));
const MessagesPopup: any = React.lazy(() => import('../../modules/orders/components/MessagesPopup').then(m => ({ default: (m as any).MessagesPopup })));
const CommandPalette: any = React.lazy(() => import('../../core/ui/CommandPalette').then(m => ({ default: (m as any).CommandPalette })));
const ScanB6Mobile: any = React.lazy(() => import('../../modules/orders/screens/ScanB6Mobile').then(m => ({ default: (m as any).ScanB6Mobile })));
const MoreMenuSheet: any = React.lazy(() => import('../../core/ui/mobile/MoreMenuSheet').then(m => ({ default: (m as any).MoreMenuSheet })));
import { Modal, Text, View } from 'react-native';
import { Slot, Tabs, useRouter, usePathname } from 'expo-router';
import {
  Home, ClipboardList, QrCode, MessageCircle, User, Plus, MoreHorizontal, Search, Users,
  Stethoscope as Stethoscope2, Truck as Truck2, Settings as Settings2,
} from 'lucide-react-native';

import { TopActionBar } from '../../core/ui/mobile/TopActionBar';
import { PanelTopHeader } from '../../core/ui/mobile/PanelTopHeader';
import { PatternsShell, useIsDesktop } from '../../core/layout/PatternsShell';
import { PillTabBar, type PillTabItem } from '../../core/ui/mobile/PillTabBar';
import { MOBILE_PANEL_THEMES } from '../../core/theme/mobileDesignTokens';
import { useAuthStore } from '../../core/store/authStore';
import { resolveClinicPerms } from '../../modules/clinic/permissions';


import { useThemeModeStore } from '../../core/store/themeModeStore';

import { useOrderChatInbox } from '../../modules/orders/hooks/useOrderChatInbox';
import { usePendingApprovalsCount } from '../../modules/orders/hooks/usePendingApprovalsCount';
import { useColorThemeStore, applyColorThemeWeb } from '../../core/store/colorThemeStore';
import { useScanStore } from '../../core/store/scanStore';
import { useNewOrderModalStore } from '../../core/store/newOrderModalStore';


// Klinik paneli teması — patterns dili: sage yeşil
// Lab=saffron #F5C24B · Clinic=emerald #32BB78 · Exec=coral #E97757 · Tech=blue #3B82F6
const CLINIC_DEFAULT_ACCENT = '#32BB78';

export default function ClinicLayout() {
  const { t } = useTranslation();
  const { profile, loading } = useAuthStore();
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const pathname = usePathname();
  const hideTopActionBar =
    /^\/(order|invoice|statement|delivery)\//.test(pathname);
  const newOrderOpen    = useNewOrderModalStore(s => s.open);
  const setNewOrderOpen = useNewOrderModalStore(s => s.setOpen);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [moreOpen,     setMoreOpen]     = useState(false);
  // Global scan modal — dashboard QR butonu da bu store'u tetikler
  const scanOpen    = useScanStore(s => s.open);
  const setScanOpen = useScanStore(s => s.setOpen);
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { totalUnread } = useOrderChatInbox();
  const pendingApprovals = usePendingApprovalsCount();

  // Load saved color theme
  const { getTheme, loadTheme } = useColorThemeStore();
  useEffect(() => {
    const theme = loadTheme('clinic_admin');
    applyColorThemeWeb(theme, CLINIC_DEFAULT_ACCENT);
  }, []);
  const accentColor = getTheme('clinic_admin').primary;

  // Klinik kullanıcısının yetki tablosu — clinic_admin: full / secretary: clinic_permissions JSONB
  const perms = resolveClinicPerms(profile as any);
  const isClinicAdmin = profile?.user_type === 'clinic_admin';

  // Nav item'ları yetkilere göre filtrele — sıra: Özet · Siparişler · Kullanıcılar ·
  // Mali İşlemler · Kurye Takip · Destek · Mesajlar · Ayarlar
  const CLINIC_NAV = [
    { label: t('nav.items.summary'), href: '/(clinic)', iconName: 'home' },
    ...(perms.orders_view
      ? [{ label: t('nav.items.orders'), href: '/(clinic)/orders', iconName: 'list-check',     matchPrefix: true }]
      : []),
    ...(perms.orders_view
      ? [{ label: t('nav.items.approvals'), href: '/(clinic)/approvals', iconName: 'badge-check', matchPrefix: true, badgeCount: pendingApprovals, badgeColor: '#D94B4B' }]
      : []),
    ...(perms.users_manage
      ? [{ label: t('nav.items.users'), href: '/(clinic)/users', iconName: 'users', matchPrefix: true }]
      : []),
    { label: t('nav.items.finance'), href: '/(clinic)/finance', iconName: 'wallet', matchPrefix: true },
    { label: t('nav.items.courier'), href: '/(clinic)/courier-tracking', iconName: 'scooter', matchPrefix: true },
    { label: t('nav.items.support'), href: '/(clinic)/support', iconName: 'help-circle', matchPrefix: true },
    // Mesajlar — Ayarlar'dan önce; sidebar'a sabit eklemek yerine nav item
    // (popup açar). hideSidebarMessages=true ile shell'in otomatik alt satırı kapatılır.
    { label: t('nav.items.messages'), href: '/(clinic)/messages', iconName: 'messages-square', matchPrefix: true, onPress: () => setMessagesOpen(true), badgeCount: totalUnread },
    ...(perms.settings_manage
      ? [{ label: t('nav.items.settings'), href: '/(clinic)/settings', iconName: 'settings', matchPrefix: true }]
      : []),
  ];

  // Klinik kullanıcısı (admin veya sekreter) değilse layout chrome'unu gösterme
  if (!profile || !['clinic_admin', 'clinic_secretary'].includes(profile.user_type)) {
    return <Slot />;
  }

  if (isDesktop) {
    return (
      <>
        {/* NOT: navigator (PatternsShell'in <Slot/>'u / <Tabs>) lazy kardeşlerle AYNI
            Suspense sınırında OLMAMALI. Lazy chunk yüklenirken sınır askıya alınır ve
            fallback={null} alt ağacın tamamını — navigator dahil — söker; o pencerede
            expo-router render edilmiş çocuk rotası bulamayıp durumunu kaybeder ve
            index'e sıfırlanır (alt sayfada yenileyince özete dönme hatası).
            Lazy kardeşler kendi sınırlarında durur. */}
        <PatternsShell
          navItems={CLINIC_NAV}
          accentColor={accentColor}
          onPressMessages={() => setMessagesOpen(true)}
          messagesUnreadCount={totalUnread}
          hideSidebarMessages
          panelType="clinic_admin"
          newOrderHref="/(clinic)/new-order"
        />
        <React.Suspense fallback={null}>
          <MessagesPopup
            visible={messagesOpen}
            onClose={() => setMessagesOpen(false)}
            accentColor={accentColor}
          />
        </React.Suspense>
      </>
    );
  }

  const PILL_TABS: PillTabItem[] = [
    { routeName: 'index',    label: t('nav.items.summary'), icon: Home },
    ...(perms.orders_view
      ? [{ routeName: 'orders', label: t('clinic.tabs.cases'), icon: ClipboardList }]
      : []),
    ...(perms.users_manage
      ? [{ routeName: 'users', label: t('clinic.tabs.team'), icon: Users }]
      : []),
    // Mesaj artık üst bardaki (TopActionBar) butonda — bu slot Ara oldu.
    { routeName: 'search',   label: t('clinic.tabs.search'),  icon: Search },
    { routeName: 'more',     label: t('clinic.tabs.more'), icon: MoreHorizontal, onPress: () => setMoreOpen(true) },
  ];
  // Navbar "Ara" → sayfa araması (PillTabBar morph)
  const SEARCH_ITEMS = CLINIC_NAV.map((n: any) => ({ label: n.label, href: n.href, sublabel: n.sectionLabel }));
  // Yeni sipariş FAB — sadece orders_create yetkisi olanlar için
  const FAB_ITEM: PillTabItem | undefined = perms.orders_create
    ? { routeName: 'new', label: t('clinic.fab.newOrder'), icon: Plus, onPress: () => setNewOrderOpen(true) }
    : undefined;

  // "Daha" bottom-sheet — yetkilere göre filtre.
  // Kullanıcılar artık navbar'da, bu menüden kaldırıldı.
  const MORE_ITEMS: import('../../core/ui/mobile/MoreMenuSheet').MoreItem[] = [
    { key: 'courier',  label: t('nav.items.courier'),  sub: t('clinic.moreMenu.courierSub'),           icon: Truck2,    accent: '#059669', onPress: () => router.push('/(clinic)/courier-tracking' as any) },
    ...(perms.settings_manage
      ? [{ key: 'settings', label: t('nav.items.settings'), sub: t('clinic.moreMenu.settingsSub'), icon: Settings2, accent: '#475569', onPress: () => router.push('/(clinic)/settings' as any) }]
      : []),
  ];

  return (
    <>
      {/* NOT: navigator (PatternsShell'in <Slot/>'u / <Tabs>) lazy kardeşlerle AYNI
            Suspense sınırında OLMAMALI. Lazy chunk yüklenirken sınır askıya alınır ve
            fallback={null} alt ağacın tamamını — navigator dahil — söker; o pencerede
            expo-router render edilmiş çocuk rotası bulamayıp durumunu kaybeder ve
            index'e sıfırlanır (alt sayfada yenileyince özete dönme hatası).
            Lazy kardeşler kendi sınırlarında durur. */}
      <View style={{ flex: 1, backgroundColor: isDark ? '#0E0E0E' : MOBILE_PANEL_THEMES.klinik.bgPage }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: 'transparent' },
            tabBarStyle: { display: 'none' },
          }}
        >
          <Tabs.Screen name="index"      options={{ title: t('clinic.screens.home') }} />
          <Tabs.Screen name="orders"     options={{ title: t('nav.items.orders') }} />
          <Tabs.Screen name="approvals"  options={{ title: t('nav.items.approvals'), href: null }} />
          <Tabs.Screen name="messages"   options={{ title: t('nav.items.messages') }} />
          <Tabs.Screen name="new-order"  options={{ title: t('clinic.screens.newOrder') }} />
          <Tabs.Screen name="users"      options={{ title: t('nav.items.users') }} />
          <Tabs.Screen name="doctors"    options={{ href: null } as any} />
          <Tabs.Screen name="settings"   options={{ title: t('nav.items.settings') }} />
          <Tabs.Screen name="profile"    options={{ href: null } as any} />
          <Tabs.Screen name="support"          options={{ title: t('nav.items.support') }} />
          <Tabs.Screen name="courier-tracking" options={{ href: null } as any} />
          <Tabs.Screen name="finance"          options={{ title: t('nav.items.finance') }} />
          {/* order/[id] nested route — expo-router auto-discovers; declaring it inside Tabs triggers BottomTabNavigator "filter of undefined" crash on RN 0.76+ */}
        </Tabs>

        {/* Asymmetric tab bar — pill + accent FAB (hidden when fullscreen modal open) */}
        {!newOrderOpen && !scanOpen && (
          <PillTabBar
            items={PILL_TABS}
            fabItem={FAB_ITEM}
            baseRoute="/(clinic)"
            accentColor={accentColor}
            searchItems={SEARCH_ITEMS}
            onSearchNavigate={(href) => router.push(href as any)}
          />
        )}
      </View>

      {/* Mobilde sayfa üstü modal yeni iş emri (opsiyonel kullanım) */}
      <Modal
        visible={newOrderOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNewOrderOpen(false)}
      >
        <React.Suspense fallback={null}>
          <NewOrderScreen
            clinicMode
            accentColor={accentColor}
            onClose={() => setNewOrderOpen(false)}
          />
        </React.Suspense>
      </Modal>

      {/* Mesajlar Popup */}
      <React.Suspense fallback={null}>
        <MessagesPopup
          visible={messagesOpen}
          onClose={() => setMessagesOpen(false)}
          accentColor={accentColor}
        />
      </React.Suspense>

      {/* Scan (B6) — Tara FAB → kamera + QR scan */}
      <Modal
        visible={scanOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setScanOpen(false)}
      >
        <React.Suspense fallback={null}>
          <ScanB6Mobile
            onClose={() => setScanOpen(false)}
            onOpenOrder={(id: string) => { setScanOpen(false); router.push(`/(clinic)/order/${id}` as any); }}
          />
        </React.Suspense>
      </Modal>

      {/* Daha menüsü (mobil PillTabBar 'Daha' tab'ından açılır) */}
      <React.Suspense fallback={null}>
        <MoreMenuSheet
          visible={moreOpen}
          onClose={() => setMoreOpen(false)}
          title={t('clinic.moreMenu.title')}
          items={MORE_ITEMS}
          accentColor={accentColor}
        />
      </React.Suspense>

      {/* Sağ üst kalıcı aksiyon butonları (mobile only) — QR · Bell · Profile */}
      {!hideTopActionBar && <TopActionBar routePrefix="/(clinic)" accentColor={accentColor} />}
      {!hideTopActionBar && <PanelTopHeader />}

      {/* Command Palette — mobile search FAB üzerinden de erişilebilir */}
      <React.Suspense fallback={null}>
        <CommandPalette
          navItems={CLINIC_NAV}
          onNavigate={(href: string) => router.push(href as any)}
          accentColor={accentColor}
        />
      </React.Suspense>
    </>
  );
}
