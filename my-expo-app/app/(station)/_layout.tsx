// app/(station)/_layout.tsx
// Teknisyen istasyon paneli — desktop'ta PatternsShell, mobilde Stack + adaptive PillTabBar.

import React, { useEffect, useState } from 'react';
import { Modal, View } from 'react-native';
import { useTranslation } from 'react-i18next';
const MessagesPopup: any = React.lazy(() => import('../../modules/orders/components/MessagesPopup').then(m => ({ default: (m as any).MessagesPopup })));
const ScanB6Mobile: any = React.lazy(() => import('../../modules/orders/screens/ScanB6Mobile').then(m => ({ default: (m as any).ScanB6Mobile })));
// Malzeme Talebi — Talepler sheet'inden doğrudan ortada popup olarak açılır (tam sayfa yerine).
// Talepler menüsü — admin "Devam" menüsüyle aynı popover
const MoreMenuSheet: any = React.lazy(() => import('../../core/ui/mobile/MoreMenuSheet').then(m => ({ default: (m as any).MoreMenuSheet })));
const NewRequestModal: any = React.lazy(() => import('../../modules/material-requests/components/NewRequestModal').then(m => ({ default: (m as any).NewRequestModal })));
import { useOrderChatInbox } from '../../modules/orders/hooks/useOrderChatInbox';
import { Tabs, Slot, useRouter, Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Home, ListChecks, QrCode, History, User, Search, Inbox, Wrench, Wallet, CalendarDays } from '../../core/ui/icons';
import { CommandPalette } from '../../core/ui/CommandPalette';
import { useCommandPalette } from '../../core/store/commandPaletteStore';
import { PatternsShell, useIsDesktop } from '../../core/layout/PatternsShell';
import { PillTabBar, type PillTabItem } from '../../core/ui/mobile/PillTabBar';
import { TopActionBar } from '../../core/ui/mobile/TopActionBar';
import { PanelTopHeader } from '../../core/ui/mobile/PanelTopHeader';
import { MOBILE_PANEL_THEMES } from '../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../core/store/themeModeStore';
import { useAuthStore } from '../../core/store/authStore';
import { usePermissionStore } from '../../core/store/permissionStore';
import { useScanStore } from '../../core/store/scanStore';


// Patterns "tech" paneli — parlak mavi
const STATION_DEFAULT_ACCENT = '#3B82F6';

export default function StationLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { profile, loading } = useAuthStore();
  const { fetchForPanel } = usePermissionStore();
  const canCreateOrder = usePermissionStore(s => s.can('manage_order_create'));
  const canViewOrders = usePermissionStore(s => s.can('view_orders'));
  const scanOpen    = useScanStore(s => s.open);
  const setScanOpen = useScanStore(s => s.setOpen);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [talepOpen, setTalepOpen] = useState(false);
  const [matReqOpen, setMatReqOpen] = useState(false);
  const { totalUnread: chatUnread } = useOrderChatInbox();

  // Talepler — mobil sheet ve sidebar grubunda ortak liste
  const TALEP_LINKS = [
    { label: t('station.requests.materialRequest'), href: '/(station)/material-requests', icon: Wrench },
    { label: t('station.requests.advanceRequest'),   href: '/(station)/avans-talebi',      icon: Wallet },
    { label: t('station.requests.leaveRequest'),    href: '/(station)/izin-talebi',       icon: CalendarDays },
  ];

  // Permissions yine 'lab' panel altında çekilir (technician = lab kullanıcısı)
  useEffect(() => {
    fetchForPanel('lab', profile?.user_type);
  }, [profile?.user_type]);

  const accentColor = STATION_DEFAULT_ACCENT;

  // Teknisyen sidebar — Dashboard ana sayfa, İşlerim ayrı rota
  const STATION_NAV = [
    { label: t('nav.items.panel'),            emoji: '📊', href: '/(station)',                   iconName: 'trending-up',    matchPrefix: false, sectionLabel: t('nav.sections.workArea') },
    { label: t('nav.items.myJobs'),          emoji: '🔧', href: '/(station)/jobs',              iconName: 'list-todo',      matchPrefix: true },
    ...(canViewOrders ? [{ label: t('nav.items.orders'), emoji: '📦', href: '/(station)/orders', iconName: 'list-check',     matchPrefix: true }] : []),
    { label: t('nav.items.history'),           emoji: '📋', href: '/(station)/history',           iconName: 'clipboard-list', matchPrefix: true },
    { label: t('nav.items.requests'), emoji: '📨', href: '#talepler', iconName: 'inbox', sectionLabel: t('nav.items.requests'),
      children: [
        { label: t('station.requests.materialRequest'), href: '/(station)/material-requests', iconName: 'wrench',        matchPrefix: true },
        { label: t('station.requests.advanceRequest'),   href: '/(station)/avans-talebi',      iconName: 'wallet',        matchPrefix: true },
        { label: t('station.requests.leaveRequest'),    href: '/(station)/izin-talebi',       iconName: 'calendar-days', matchPrefix: true },
      ] },
    { label: t('nav.items.support'),           emoji: '💬', href: '/(station)/support',           iconName: 'help-circle',    matchPrefix: true, sectionLabel: t('nav.sections.help') },
    { label: t('nav.items.settings'),          emoji: '⚙️', href: '/(station)/settings',          iconName: 'settings',       matchPrefix: true, sectionLabel: t('nav.sections.account') },
  ];

  // Düz liste — arama / komut paleti için (alt menüler açılır, '#' linkleri elenir)
  const STATION_NAV_FLAT = STATION_NAV
    .flatMap((n: any) => (n.children?.length ? n.children : [n]))
    .filter((n: any) => n.href && !String(n.href).startsWith('#'));

  if (!profile) {
    return <Slot />;  // profil yükleniyor (optimistic) → kabuk
  }
  if (profile.user_type !== 'lab') {
    return <Redirect href="/" />;  // yanlış panel → doğru panele yönlendir
  }

  if (isDesktop) {
    return (
      <>
        <PatternsShell
          navItems={STATION_NAV}
          accentColor={accentColor}
          newOrderHref={canCreateOrder ? '/(station)/new-order' : undefined}
          onPressMessages={() => setMessagesOpen(true)}
          messagesUnreadCount={chatUnread}
          panelType="station"
        />
        <React.Suspense fallback={null}>
          <MessagesPopup
            visible={messagesOpen}
            onClose={() => setMessagesOpen(false)}
          />
        </React.Suspense>
      </>
    );
  }

  // Mobile — adaptive PillTabBar (same design as doctor panel)
  const TEKNISYEN = MOBILE_PANEL_THEMES.teknisyen;

  const PILL_TABS: PillTabItem[] = [
    { routeName: 'index',    label: t('nav.items.summary'),     icon: Home },
    { routeName: 'jobs',     label: t('nav.items.myJobs'), icon: ListChecks },
    { routeName: 'history',  label: t('nav.items.history'),  icon: History },
    { routeName: 'talepler', label: t('nav.items.requests'), icon: Inbox, menuAnchor: true, onPress: () => setTalepOpen(v => !v) },
    // Profil artık üst bardaki (TopActionBar) profil butonunda — bu slot Ara oldu.
    { routeName: 'search',   label: t('nav.items.search'),     icon: Search, onPress: () => { try { useCommandPalette.getState().openPalette(); } catch { /* noop */ } } },
  ];
  // Technician primary action — QR scan for check-in
  const FAB_ITEM: PillTabItem = {
    routeName: 'scan',
    label: t('station.actions.scan'),
    icon: QrCode,
    onPress: () => setScanOpen(true),
  };

  return (
    <>
    {/* NOT: navigator (PatternsShell'in <Slot/>'u / <Tabs>) lazy kardeşlerle AYNI
            Suspense sınırında OLMAMALI. Lazy chunk yüklenirken sınır askıya alınır ve
            fallback={null} alt ağacın tamamını — navigator dahil — söker; o pencerede
            expo-router render edilmiş çocuk rotası bulamayıp durumunu kaybeder ve
            index'e sıfırlanır (alt sayfada yenileyince özete dönme hatası).
            Lazy kardeşler kendi sınırlarında durur. */}
    <View style={{ flex: 1, backgroundColor: isDark ? '#0E0E0E' : TEKNISYEN.bgPage }}>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: 'transparent' },
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="index"      options={{ title: t('nav.items.panel')      }} />
        <Tabs.Screen name="jobs"       options={{ title: t('nav.items.myJobs')    }} />
        <Tabs.Screen name="new-order"  options={{ title: t('station.actions.newOrder'), href: null } as any} />
        <Tabs.Screen name="orders"     options={{ title: t('nav.items.orders'), href: null } as any} />
        {/* order/[id] nested route — expo-router auto-discovers; declaring it inside
           Tabs triggers BottomTabNavigator "filter of undefined" crash on RN 0.76+ */}
        <Tabs.Screen name="job-detail" options={{ title: t('station.screens.jobDetail'), href: null } as any} />
        <Tabs.Screen name="history"    options={{ title: t('nav.items.history')     }} />
        <Tabs.Screen name="stats"      options={{ title: t('nav.items.panel'), href: null } as any} />
        <Tabs.Screen name="profile"    options={{ title: t('nav.items.profile')     }} />
        <Tabs.Screen name="settings"   options={{ title: t('nav.items.settings'), href: null } as any} />
        <Tabs.Screen name="material-requests" options={{ title: t('station.requests.materialRequest') }} />
        <Tabs.Screen name="avans-talebi"      options={{ title: t('station.requests.advanceRequest'), href: null } as any} />
        <Tabs.Screen name="izin-talebi"       options={{ title: t('station.requests.leaveRequest'), href: null } as any} />
        <Tabs.Screen name="support"           options={{ title: t('nav.items.support') }} />
      </Tabs>

      {/* Asymmetric tab bar — pill + QR Tara FAB (hidden when scan modal open) */}
      {!scanOpen && (
        <PillTabBar
          items={PILL_TABS}
          fabItem={FAB_ITEM}
          baseRoute="/(station)"
          accentColor={TEKNISYEN.primary}
          searchItems={STATION_NAV_FLAT.map((n: any) => ({ label: n.label, href: n.href, sublabel: n.sectionLabel }))}
          onSearchNavigate={(href) => router.push(href as any)}
        />
      )}

      {/* Sağ üst sabit aksiyon butonları — QR · Mesaj · Bildirim · Profil
         (tüm station sayfalarında görünür; scan modal açıkken gizli) */}
      {!scanOpen && (
        <TopActionBar routePrefix="/(station)" accentColor={TEKNISYEN.primary} />
      )}
      {!scanOpen && <PanelTopHeader />}

      {/* Command palette — navbar'daki "Ara" butonundan açılır */}
      <CommandPalette
        navItems={STATION_NAV_FLAT}
        onNavigate={(href) => router.push(href as any)}
        accentColor={accentColor}
      />
    </View>

    {/* Talepler — admin'deki Devam menüsü gibi navbar'daki Talepler hücresinden
        yukarı açılan popover (MoreMenuSheet, altında "Powered by Siman"). */}
    <React.Suspense fallback={null}>
      <MoreMenuSheet
        visible={talepOpen}
        onClose={() => setTalepOpen(false)}
        title={t('nav.items.requests')}
        items={TALEP_LINKS.map(l => ({
          key: l.href,
          label: l.label,
          icon: l.icon,
          // Malzeme Talebi → ortada popup (NewRequestModal); diğerleri tam sayfa rota.
          onPress: () => {
            if (l.href === '/(station)/material-requests') { setMatReqOpen(true); return; }
            router.push(l.href as any);
          },
        }))}
        accentColor={TEKNISYEN.primary}
      />
    </React.Suspense>

    {/* Malzeme Talebi — ortada popup (Talepler sheet'ten doğrudan) */}
    {matReqOpen && (
      <React.Suspense fallback={null}>
        <NewRequestModal visible={matReqOpen} onClose={() => setMatReqOpen(false)} />
      </React.Suspense>
    )}

    {/* Scan (B6) — Tara FAB → kamera + QR scan (check-in token detected by ScanB6Mobile) */}
    <Modal
      visible={scanOpen}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => setScanOpen(false)}
    >
      <React.Suspense fallback={null}>
        <ScanB6Mobile
          onClose={() => setScanOpen(false)}
          onOpenOrder={(id: string) => {
            setScanOpen(false);
            router.push(`/(station)/job-detail?id=${id}` as any);
          }}
        />
      </React.Suspense>
    </Modal>
    </>
  );
}
