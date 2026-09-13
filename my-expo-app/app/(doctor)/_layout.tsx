import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
const NewOrderScreen: any = React.lazy(() => import('../../modules/orders/screens/NewOrderScreen').then(m => ({ default: (m as any).NewOrderScreen })));
const MessagesPopup: any = React.lazy(() => import('../../modules/orders/components/MessagesPopup').then(m => ({ default: (m as any).MessagesPopup })));
const CommandPalette: any = React.lazy(() => import('../../core/ui/CommandPalette').then(m => ({ default: (m as any).CommandPalette })));
const ScanB6Mobile: any = React.lazy(() => import('../../modules/orders/screens/ScanB6Mobile').then(m => ({ default: (m as any).ScanB6Mobile })));
const MoreMenuSheet: any = React.lazy(() => import('../../core/ui/mobile/MoreMenuSheet').then(m => ({ default: (m as any).MoreMenuSheet })));
import { Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Slot, Tabs, useRouter, usePathname, Redirect } from 'expo-router';
import { C as Colors } from '../../core/theme/colors';
import { PatternsShell, useIsDesktop } from '../../core/layout/PatternsShell';
import { PillTabBar, type PillTabItem } from '../../core/ui/mobile/PillTabBar';
import {
  Home, ClipboardList, MessageCircle, User, Plus, MoreHorizontal, Search,
  Truck as Truck2, Settings as Settings2,
} from '../../core/ui/icons';

import { TopActionBar } from '../../core/ui/mobile/TopActionBar';
import { PanelTopHeader } from '../../core/ui/mobile/PanelTopHeader';
import { MOBILE_PANEL_THEMES, useMobileTokens } from '../../core/theme/mobileDesignTokens';
import { useScanStore } from '../../core/store/scanStore';
import { useNewOrderModalStore } from '../../core/store/newOrderModalStore';
import { useAuthStore } from '../../core/store/authStore';


import { useThemeModeStore } from '../../core/store/themeModeStore';

import { useOrderChatInbox } from '../../modules/orders/hooks/useOrderChatInbox';
import { usePendingApprovalsCount } from '../../modules/orders/hooks/usePendingApprovalsCount';
import { useColorThemeStore, applyColorThemeWeb } from '../../core/store/colorThemeStore';

import { supabase } from '../../core/api/supabase';
import { OnboardingOverlay } from '../../core/onboarding/OnboardingOverlay';
import { PaymentReminderGate } from '../../core/finance/PaymentReminderGate';
import { useOnboardingStore } from '../../core/onboarding/onboardingStore';
import { useTourTarget } from '../../core/onboarding/useTourTarget';
import { DOCTOR_TOUR_STEPS } from '../../core/onboarding/tourSteps';


// Patterns doctor teması — sage yeşili (clinic ile aynı palet)
const DOCTOR_DEFAULT_ACCENT = '#32BB78';

// First-login coach-mark tour — checked once per session (module guard so a
// layout remount doesn't re-fire). Only runs for doctors with a null
// doctor_onboarded_at (RPC decides).
let doctorTourChecked = false;

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 24 : 22, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

export default function DoctorLayout() {
  const { t } = useTranslation();
  const { profile, loading } = useAuthStore();
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const pathname = usePathname();
  const hideTopActionBar =
    /^\/(order|invoice|statement|delivery)\//.test(pathname);
  const newOrderOpen    = useNewOrderModalStore(s => s.open);
  const setNewOrderOpen = useNewOrderModalStore(s => s.setOpen);
  const [moreOpen,     setMoreOpen]     = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  // Global scan modal — dashboard QR Tara quick tile'ı da bu store'u tetikler
  const scanOpen    = useScanStore(s => s.open);
  const setScanOpen = useScanStore(s => s.setOpen);
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { totalUnread } = useOrderChatInbox();
  const pendingApprovals = usePendingApprovalsCount();

  // Load saved color theme
  const { getTheme, loadTheme } = useColorThemeStore();
  useEffect(() => {
    const theme = loadTheme('doctor');
    applyColorThemeWeb(theme, DOCTOR_DEFAULT_ACCENT);
  }, []);
  const accentColor = getTheme('doctor').primary;
  const T = useMobileTokens();

  // ─── First-login coach-mark tour ──────────────────────────────────────────
  // Target ref-callbacks (stable per id). Wired into the pill tab bar (FAB +
  // "orders" cell) and the TopActionBar messages button via optional props —
  // other panels never receive these, so they stay isolated.
  const newOrderTargetRef = useTourTarget('tour-new-order');
  const ordersTargetRef   = useTourTarget('tour-orders');
  const messagesTargetRef = useTourTarget('tour-messages');
  const getItemRef = React.useCallback(
    (routeName: string) =>
      routeName === 'new'    ? newOrderTargetRef :
      routeName === 'orders' ? ordersTargetRef   :
      undefined,
    [newOrderTargetRef, ordersTargetRef],
  );

  // Panel-aware "yeni sipariş aç" opener — interaktif form turu bunu çağırır.
  // Masaüstünde route'a git, mobilde modal aç.
  useEffect(() => {
    useOnboardingStore.getState().registerRef('no-open', {
      open: () => {
        if (isDesktop) {
          // Zaten form rotasındaysak tekrar push etme (remount döngüsü olmasın).
          if (!pathname.endsWith('/new-order')) router.push('/(doctor)/new-order' as any);
        } else {
          setNewOrderOpen(true);
        }
      },
    });
    return () => useOnboardingStore.getState().unregisterRef('no-open');
  }, [isDesktop, router, setNewOrderOpen, pathname]);

  useEffect(() => {
    if (doctorTourChecked) return;
    if (!profile || profile.user_type !== 'doctor') return;  // non-doctors never trigger
    doctorTourChecked = true;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('should_show_doctor_onboarding');
        if (cancelled || error || !data) return;
        // Delay so the tab bar / top bar mount and refs register before spotlight.
        setTimeout(() => {
          if (!cancelled) useOnboardingStore.getState().start(DOCTOR_TOUR_STEPS);
        }, 800);
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [profile]);

  const DOCTOR_NAV = [
    { label: t('nav.items.home'),     href: '/(doctor)',                 iconName: 'home' },
    { label: t('nav.items.myOrders'), href: '/(doctor)/orders',          iconName: 'list-check',     matchPrefix: true },
    { label: t('nav.items.approvals'),      href: '/(doctor)/approvals',        iconName: 'badge-check', matchPrefix: true, badgeCount: pendingApprovals, badgeColor: '#D94B4B' },
    { label: t('nav.items.courier'),  href: '/(doctor)/courier-tracking', iconName: 'scooter',        matchPrefix: true, sectionLabel: t('nav.sections.delivery') },
    { label: t('nav.items.finance'), href: '/(doctor)/finance',          iconName: 'wallet',         matchPrefix: true, sectionLabel: t('nav.sections.finance') },
    { label: t('nav.items.support'),       href: '/(doctor)/support',          iconName: 'help-circle',    matchPrefix: true, sectionLabel: t('nav.sections.help') },
    { label: t('nav.items.settings'),      href: '/(doctor)/settings',        iconName: 'settings',       matchPrefix: true, sectionLabel: t('nav.sections.system') },
  ];

  // Hekim olmayan kullanıcı bu layout'a düştüyse sidebar gösterme
  if (!profile) {
    return <Slot />;  // profil yükleniyor (optimistic) → kabuk
  }
  if (profile.user_type !== 'doctor') {
    return <Redirect href="/" />;  // yanlış panel → doğru panele yönlendir
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
          navItems={DOCTOR_NAV}
          accentColor={accentColor}
          onPressMessages={() => setMessagesOpen(true)}
          messagesUnreadCount={totalUnread}
          panelType="doctor"
          newOrderHref="/(doctor)/new-order"
          tourRefs={{ newOrder: newOrderTargetRef, orders: ordersTargetRef, messages: messagesTargetRef }}
          tourOrdersHref="/(doctor)/orders"
        />
        <React.Suspense fallback={null}>
          <MessagesPopup
            visible={messagesOpen}
            onClose={() => setMessagesOpen(false)}
            accentColor={accentColor}
          />
        </React.Suspense>

        {/* First-login coach-mark tour — desktop falls back to centered cards */}
        <OnboardingOverlay />

        {/* Vadesi geçmiş ödeme hatırlatması — masaüstü dalı ayrı return ediyor,
            mobil daldaki mount buraya ULAŞMAZ. */}
        <PaymentReminderGate />
      </>
    );
  }

  // Asymmetric layout — 5 nav items in pill + separate FAB for "Yeni"
  const PILL_TABS: PillTabItem[] = [
    { routeName: 'index',            label: t('nav.items.summary'),    icon: Home },
    { routeName: 'orders',           label: t('nav.items.cases'), icon: ClipboardList },
    { routeName: 'courier-tracking', label: t('doctor.nav.courierShort'),   icon: Truck2 },
    // Mesaj artık üst bardaki (TopActionBar) butonda — bu slot Ara oldu.
    { routeName: 'search',           label: t('nav.items.search'),     icon: Search },
    { routeName: 'settings',         label: t('nav.items.settings'), icon: Settings2 },
  ];
  const SEARCH_ITEMS = DOCTOR_NAV.map((n: any) => ({ label: n.label, href: n.href, sublabel: n.sectionLabel }));

  // "Daha" menüsü artık pill'de değil; ileride genişletmek için boş bırakıldı.
  const MORE_ITEMS: import('../../core/ui/mobile/MoreMenuSheet').MoreItem[] = [];
  const FAB_ITEM: PillTabItem = {
    routeName: 'new',
    label: t('nav.items.new'),
    icon: Plus,
    onPress: () => setNewOrderOpen(true),
  };
  const DOCTOR_THEME = MOBILE_PANEL_THEMES.doctor;

  return (
    <>
      {/* Notch / status bar altında BG akışı için top safe-area uygulanmıyor;
         her ekran kendi paddingTop'una insets.top ekler → bg edge-to-edge */}
      {/* NOT: navigator (PatternsShell'in <Slot/>'u / <Tabs>) lazy kardeşlerle AYNI
            Suspense sınırında OLMAMALI. Lazy chunk yüklenirken sınır askıya alınır ve
            fallback={null} alt ağacın tamamını — navigator dahil — söker; o pencerede
            expo-router render edilmiş çocuk rotası bulamayıp durumunu kaybeder ve
            index'e sıfırlanır (alt sayfada yenileyince özete dönme hatası).
            Lazy kardeşler kendi sınırlarında durur. */}
      <View style={{ flex: 1, backgroundColor: isDark ? '#0E0E0E' : MOBILE_PANEL_THEMES.doctor.bgPage }}>
        {/* MobileHeader kaldırıldı — DoctorMobileDashboard kendi başlığını taşıyor */}
        <Tabs
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: 'transparent' },
            tabBarStyle: { display: 'none' },
          }}
        >
          <Tabs.Screen name="index"            options={{ title: t('nav.items.home') }} />
          <Tabs.Screen name="orders"           options={{ title: t('nav.items.myOrders') }} />
          <Tabs.Screen name="approvals"        options={{ title: t('nav.items.approvals'), href: null }} />
          <Tabs.Screen name="courier-tracking" options={{ title: t('nav.items.courier') }} />
          <Tabs.Screen name="finance"          options={{ title: t('nav.items.finance') }} />
          <Tabs.Screen name="messages"         options={{ title: t('nav.items.messages') }} />
          <Tabs.Screen name="new-order"        options={{ title: t('doctor.nav.newOrder'), href: null }} />
          <Tabs.Screen name="support"          options={{ title: t('nav.items.support') }} />
          <Tabs.Screen name="settings"         options={{ title: t('nav.items.settings') }} />
          <Tabs.Screen name="profile"          options={{ title: t('nav.items.profile'), href: null }} />
          {/* order/[id] nested route — expo-router auto-discovers; declaring it here triggers BottomTabNavigator filter crash on RN 0.76 */}
        </Tabs>

        {/* Asymmetric tab bar — pill + side FAB; hidden when fullscreen modal is open */}
        {!newOrderOpen && !scanOpen && (
          <PillTabBar
            items={PILL_TABS}
            fabItem={FAB_ITEM}
            baseRoute="/(doctor)"
            accentColor={DOCTOR_THEME.primary}
            searchItems={SEARCH_ITEMS}
            onSearchNavigate={(href) => router.push(href as any)}
            getItemRef={getItemRef}
          />
        )}
      </View>

      {/* Yeni İş Emri — SADECE mobilde modal olarak açılır */}
      <Modal
        visible={newOrderOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        transparent={false}
        onRequestClose={() => setNewOrderOpen(false)}
      >
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: MOBILE_PANEL_THEMES.doctor.bgPage }}>
          <React.Suspense fallback={null}>
            <NewOrderScreen doctorMode accentColor={accentColor} onClose={() => setNewOrderOpen(false)} />
          </React.Suspense>
        </SafeAreaView>
      </Modal>

      {/* Mesajlar Popup — her ekran boyutunda */}
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
            onOpenOrder={(id: string) => { setScanOpen(false); router.push(`/(doctor)/order/${id}` as any); }}
          />
        </React.Suspense>
      </Modal>

      {/* Daha menüsü (mobil PillTabBar 'Daha' tab'ından açılır) */}
      <React.Suspense fallback={null}>
        <MoreMenuSheet
          visible={moreOpen}
          onClose={() => setMoreOpen(false)}
          title={t('doctor.nav.allMenu')}
          items={MORE_ITEMS}
          accentColor={accentColor}
        />
      </React.Suspense>

      {/* Sağ üst kalıcı aksiyon butonları (mobile only) — QR · Bell · Profile */}
      {!hideTopActionBar && <TopActionBar routePrefix="/(doctor)" accentColor={accentColor} messagesRef={messagesTargetRef} />}
      {!hideTopActionBar && <PanelTopHeader />}

      {/* Command Palette — mobile search FAB üzerinden de erişilebilir */}
      <React.Suspense fallback={null}>
        <CommandPalette
          navItems={DOCTOR_NAV}
          onNavigate={(href: string) => router.push(href as any)}
          accentColor={accentColor}
        />
      </React.Suspense>

      {/* First-login coach-mark tour — top-most; renders null unless active */}
      <OnboardingOverlay />

      {/* Vadesi geçmiş ödeme hatırlatması — bakiye yoksa hiçbir şey çizmez */}
      <PaymentReminderGate />
    </>
  );
}
