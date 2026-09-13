import React, { useState, useEffect } from 'react';
const NewOrderScreen: any = React.lazy(() => import('../../modules/orders/screens/NewOrderScreen').then(m => ({ default: (m as any).NewOrderScreen })));
const MessagesPopup: any = React.lazy(() => import('../../modules/orders/components/MessagesPopup').then(m => ({ default: (m as any).MessagesPopup })));
const ScanB6Mobile: any = React.lazy(() => import('../../modules/orders/screens/ScanB6Mobile').then(m => ({ default: (m as any).ScanB6Mobile })));
const MoreMenuSheet: any = React.lazy(() => import('../../core/ui/mobile/MoreMenuSheet').then(m => ({ default: (m as any).MoreMenuSheet })));
const CommandPalette: any = React.lazy(() => import('../../core/ui/CommandPalette').then(m => ({ default: (m as any).CommandPalette })));
const CommandPaletteFAB: any = React.lazy(() => import('../../core/ui/CommandPalette').then(m => ({ default: (m as any).CommandPaletteFAB })));
import { Modal, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FaceScanQuickAction, useFaceScanAvailable } from '../../modules/orders/components/FaceScanQuickAction';
import { Slot, Tabs, useRouter, usePathname, Redirect } from 'expo-router';
import {
  Home, ClipboardList, QrCode, MessageCircle, User, Plus, MoreHorizontal,
  Landmark as Landmark2, FileSpreadsheet as FileSpreadsheet2, Banknote as Banknote2,
  Package as Package2, Building2 as Building22, Truck as Truck2,
  CheckCircle2 as CheckCircle22, Users as Users2, Settings as Settings2,
  TrendingUp as TrendingUp2, FileText as FileText2,  ScanFace,
} from '../../core/ui/icons';

import { TopActionBar } from '../../core/ui/mobile/TopActionBar';
import { bootMark } from '../../core/debug/bootTrace';
import { PanelTopHeader } from '../../core/ui/mobile/PanelTopHeader';
import { PatternsShell, useIsDesktop } from '../../core/layout/PatternsShell';
import { PillTabBar, type PillTabItem } from '../../core/ui/mobile/PillTabBar';
import { MOBILE_TOKENS as T, MOBILE_PANEL_THEMES } from '../../core/theme/mobileDesignTokens';
import { usePendingApprovals } from '../../core/hooks/usePendingApprovals';
import { useStockAlert } from '../../core/hooks/useStockAlert';
import { useAuthStore } from '../../core/store/authStore';
import { supabase } from '../../core/api/supabase';
import { useScanStore } from '../../core/store/scanStore';
import { useNewOrderModalStore } from '../../core/store/newOrderModalStore';



// usePendingLeaveCount removed — leave tracking no longer in this module
import { useOrderChatInbox } from '../../modules/orders/hooks/useOrderChatInbox';
import { useColorThemeStore, applyColorThemeWeb } from '../../core/store/colorThemeStore';
import { usePermissionStore } from '../../core/store/permissionStore';

import { useThemeModeStore } from '../../core/store/themeModeStore';

// Patterns admin teması — krem/mercan palette
const ADMIN_DEFAULT_ACCENT = '#4771AB';

// NOT: Desktop'ta "Yeni İş Emri" → route navigate eder (/(admin)/new-order),
// sidebar kaybolmaz. Modal SADECE mobil için.

export default function AdminLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const hideTopActionBar =
    /^\/(order|invoice|purchase-invoice|expense|statement|delivery)\//.test(pathname);
  const { profile, loading } = useAuthStore();
  const pendingCount      = usePendingApprovals();
  const stockAlert        = useStockAlert();
  const isDesktop         = useIsDesktop();
  // pendingLeaveCount removed
  const { totalUnread: chatUnread } = useOrderChatInbox();
  // Global store — dashboard CTA card + FAB aynı modal'ı tetikler
  const newOrderOpen    = useNewOrderModalStore(s => s.open);
  const setNewOrderOpen = useNewOrderModalStore(s => s.setOpen);
  const [messagesOpen, setMessagesOpen] = useState(false);
  // Bekleyen manuel sipariş sayısı (WhatsApp/webhook → OCR). Lab panelindeki
  // sayaçla birebir aynı sorgu; admin de aynı gelen kutusunu görür.
  const [pendingPaperCount, setPendingPaperCount] = useState(0);
  const scanOpen    = useScanStore(s => s.open);
  const setScanOpen = useScanStore(s => s.setOpen);
  const [moreOpen,     setMoreOpen]     = useState(false);
  const isDark = useThemeModeStore(s => s.resolvedDark);

  // Load saved color theme
  const { getTheme, loadTheme } = useColorThemeStore();
  const { fetchForPanel } = usePermissionStore();
  useEffect(() => {
    const labId = (profile as any)?.lab_id ?? profile?.id;
    if (!labId) return;
    let mounted = true;
    const load = async () => {
      const { count } = await supabase
        .from('pending_paper_orders')
        .select('id', { count: 'exact', head: true })
        .eq('lab_id', labId)
        .eq('status', 'pending');
      if (mounted) setPendingPaperCount(count ?? 0);
    };
    load();
    const ch = supabase
      .channel(`paper-inbox-admin-${labId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'pending_paper_orders',
        filter: `lab_id=eq.${labId}`,
      }, () => load())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [profile?.id]);

  useEffect(() => {
    const theme = loadTheme('admin');
    applyColorThemeWeb(theme, ADMIN_DEFAULT_ACCENT);
  }, []);
  const accentColor = getTheme('admin').primary;

  // Fetch permissions for admin panel
  useEffect(() => {
    fetchForPanel('admin', profile?.user_type);
  }, [profile?.user_type]);

  // Loading sırasında veya kullanıcı admin değilken hiçbir panel UI çizme
  // (önceki davranış: loading=true iken FabTabBar mount oluyordu → panel flicker)
  // Yüz tarama navbar butonu. HOOK'LAR erken return'lerin ÜSTÜNDE olmalı —
  // aşağıda (!profile / isDesktop) dalları var; altta kalırsa render'lar arası
  // hook sayısı değişiyor ve React "Rendered more hooks" hatası veriyor.
  const faceScanOk = useFaceScanAvailable();
  const [faceScanOpen, setFaceScanOpen] = React.useState(false);

  if (!profile) {
    return <Slot />;  // profil yükleniyor (optimistic) → kabuk
  }
  if (profile.user_type !== 'admin') {
    return <Redirect href="/" />;  // yanlış panel → doğru panele yönlendir
  }

  // Sıra: Özet · Siparişler · Onaylar · Sağlık Kurumları · Ekip ·
  //       Stok ve Depo · Finans · Destek Yönetim · Mesajlar · Ayarlar
  const ADMIN_NAV = [
    // ── Ana ekran ──────────────────────────────────────────────────────────
    { label: t('nav.items.summary'),              href: '/(admin)',                  iconName: 'home' },

    // ── İş Yönetimi ────────────────────────────────────────────────────────
    { label: t('nav.items.orders'),        href: '/(admin)/orders',           iconName: 'list-check',     matchPrefix: true, sectionLabel: t('nav.sections.work'),
      requiresPermission: 'view_orders' },
    { label: t('nav.items.approvals'),           href: '/(admin)/approvals',        iconName: 'check-circle',   matchPrefix: true,
      badgeCount: pendingCount > 0 ? pendingCount : undefined,
      requiresPermission: 'view_approvals' },

    // ── Müşteriler ─────────────────────────────────────────────────────────
    { label: t('nav.items.clinics'),  href: '/(admin)/clinics',          iconName: 'building-2',     matchPrefix: true, sectionLabel: t('nav.sections.customers') },

    // ── Ekip ───────────────────────────────────────────────────────────────
    { label: t('nav.items.team'),              href: '/(admin)/ik-depo',          iconName: 'users',          matchPrefix: false, sectionLabel: t('nav.sections.team'),
      requiresPermission: 'view_team' },

    // ── Depo / Finans ──────────────────────────────────────────────────────
    { label: t('nav.items.stock'),      href: '/(admin)/stock',            iconName: 'package',        matchPrefix: true, sectionLabel: t('nav.sections.warehouse'),
      badgeCount: stockAlert,
      requiresPermission: 'view_stock' },
    { label: t('nav.items.production'),     href: '/(admin)/production',       iconName: 'activity',       matchPrefix: true, sectionLabel: t('nav.sections.production') },

    // ── Teslimat ───────────────────────────────────────────────────────────
    { label: t('nav.items.courier'),       href: '/(admin)/courier-tracking', iconName: 'scooter',        matchPrefix: true, sectionLabel: t('nav.sections.delivery') },
    { label: t('nav.items.finance'),            href: '/(admin)/finance',          iconName: 'landmark',       matchPrefix: false, sectionLabel: t('nav.sections.finance'),
      requiresPermission: 'view_financials' },

    // ── Destek / İletişim / Hesap ─────────────────────────────────────────
    { label: t('nav.items.support'),    href: '/(admin)/support',          iconName: 'help-circle',    matchPrefix: true, sectionLabel: t('nav.sections.help') },
    { label: t('nav.items.waSupport'),  href: '/(admin)/wa-support',       iconName: 'whatsapp', matchPrefix: false,
      requiresPermission: 'manage_settings' },
    { label: t('nav.items.messages'),          href: '/(admin)/messages',         iconName: 'messages-square', matchPrefix: false,
      onPress: () => setMessagesOpen(true),
      badgeCount: chatUnread > 0 ? chatUnread : undefined },
    { label: t('nav.items.settings'),           href: '/(admin)/settings',         iconName: 'settings',       matchPrefix: true, sectionLabel: t('nav.sections.system'),
      requiresPermission: 'view_settings' },
  ];

  if (isDesktop) {
    return (
      <>
        {/* PatternsShell <Slot/>'u içinde barındırır ve LAZY DEĞİL → kendi Suspense'i
            yok, hemen render olur. Eskiden MessagesPopup + CommandPalette (ikisi de
            React.lazy) ile AYNI Suspense sınırı içindeydi: o chunk'lar yüklenirken
            sınır askıya alınıyor, fallback={null} tüm alt ağacı — <Slot/> dahil —
            söküyordu. O pencerede expo-router'ın render edilmiş çocuk rotası kalmıyor
            ve durumu kaybedip index'e (özet) sıfırlanıyordu: /orders'ta yenileyince
            özete dönme hatasının sebebi buydu. Lazy kardeşler artık kendi
            sınırlarında — Slot onları asla beklemez. */}
        <PatternsShell
          navItems={ADMIN_NAV}
          accentColor={accentColor}
          onPressMessages={() => setMessagesOpen(true)}
          messagesUnreadCount={chatUnread}
          hideSidebarMessages
          panelType="admin"
          newOrderHref="/(admin)/new-order"
        />
        <React.Suspense fallback={null}>
          <MessagesPopup
            visible={messagesOpen}
            onClose={() => setMessagesOpen(false)}
            accentColor={accentColor}
          />
        </React.Suspense>
        <React.Suspense fallback={null}>
          <CommandPalette
            navItems={ADMIN_NAV}
            onNavigate={(href: string) => router.push(href as any)}
            accentColor={accentColor}
          />
        </React.Suspense>
      </>
    );
  }

  // Asymmetric pill + side FAB — Ana / Vakalar / Onaylar / Mesaj / Daha
  const PILL_TABS: PillTabItem[] = [
    { routeName: 'index',     label: t('nav.items.summary'),     icon: Home },
    { routeName: 'orders',    label: t('nav.items.cases'), icon: ClipboardList },
    // Yüz Tara navbar'a girince 6 hücre pill'e sığmıyor (••• dışarı taşıyordu) →
    // o cihazlarda Onaylar Devam menüsüne geçer, rozeti •••'ye taşınır.
    ...(!faceScanOk ? [{ routeName: 'approvals', label: t('nav.items.approvals'), icon: CheckCircle22, badgeCount: pendingCount > 0 ? pendingCount : undefined }] : []),
    { routeName: 'messages',  label: t('nav.items.messages'),   icon: MessageCircle, onPress: () => setMessagesOpen(true), badgeCount: chatUnread },
    // Yalnız TrueDepth'li iPhone'da görünür
    ...(faceScanOk ? [{ routeName: 'face-scan', label: 'Yüz Tara', icon: ScanFace, onPress: () => setFaceScanOpen(true) }] : []),
    { routeName: 'more',      label: t('nav.items.more'),    icon: MoreHorizontal, onPress: () => setMoreOpen(true), badgeCount: faceScanOk && pendingCount > 0 ? pendingCount : undefined },
  ];
  const FAB_ITEM: PillTabItem = {
    routeName: 'new',
    label: 'Yeni',
    icon: Plus,
    onPress: () => setNewOrderOpen(true),
  };
  void stockAlert;

  // "Daha" bottom-sheet — Onaylar pill'de
  const MORE_ITEMS: import('../../core/ui/mobile/MoreMenuSheet').MoreItem[] = [
    ...(faceScanOk ? [{ key: 'approvals', label: t('nav.items.approvals'), icon: CheckCircle22 as any, badge: pendingCount > 0 ? pendingCount : undefined, onPress: () => router.push('/(admin)/approvals' as any) }] : []),
    { key: 'clinics',  label: t('nav.items.clinics'), sub: t('admin.more.clinics.sub'),               icon: Building22,onPress: () => router.push('/(admin)/clinics' as any) },
    { key: 'courier',  label: t('nav.items.courier'),      sub: t('admin.more.courier.sub'),                 icon: Truck2,    onPress: () => router.push('/(admin)/courier-tracking' as any) },
    { key: 'finance',  label: t('nav.items.finance'),           sub: t('admin.more.finance.sub'),    icon: Landmark2, onPress: () => router.push('/(admin)/finance' as any) },
    { key: 'team',     label: t('nav.items.team'),             sub: t('admin.more.team.sub'),   icon: Users2,    onPress: () => router.push('/(admin)/ik-depo' as any) },
    { key: 'stock',    label: t('nav.items.stock'),      sub: t('admin.more.stock.sub'),               icon: Package2,  onPress: () => router.push('/(admin)/stock' as any) },
    { key: 'settings', label: t('nav.items.settings'),          sub: t('admin.more.settings.sub'), icon: Settings2, onPress: () => router.push('/(admin)/settings' as any) },
  ];

  return (
    <>
      {/* NOT: navigator (<Tabs>) lazy kardeşlerle AYNI Suspense sınırında OLMAMALI —
          lazy chunk yüklenirken fallback={null} navigator'ı da söker ve expo-router
          durumunu kaybedip index'e sıfırlanır. Bkz. masaüstü dalındaki not. */}
      <View style={{ flex: 1, backgroundColor: isDark ? T.dark : MOBILE_PANEL_THEMES.exec.bgPage }}>
        {/* MobileHeader kaldırıldı — yeni AdminMobileDashboard kendi başlığını taşıyor */}
        <Tabs
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: 'transparent' },
            tabBarStyle: { display: 'none' },
          }}
        >
        <Tabs.Screen name="index" options={{ title: t('nav.items.summary') }} />
        <Tabs.Screen name="wa-support" options={{ href: null }} />
        <Tabs.Screen name="new-order" options={{ title: t('admin.tabs.newOrder') }} />
        <Tabs.Screen name="users" options={{ title: t('admin.tabs.users') }} />
        <Tabs.Screen name="clinics" options={{ title: t('nav.items.clinics') }} />
        <Tabs.Screen name="doctors" options={{ title: t('admin.tabs.doctors') }} />
        <Tabs.Screen name="orders" options={{ title: t('nav.items.orders') }} />
        <Tabs.Screen name="courier-tracking" options={{ title: t('nav.items.courier') }} />
        <Tabs.Screen name="stock" options={{ title: t('admin.tabs.stock') }} />
        <Tabs.Screen name="material-mapping" options={{ title: 'Malzeme Eşleştirme', href: null }} />
        <Tabs.Screen name="consumption-profile" options={{ title: 'Tüketim Profili', href: null }} />
        <Tabs.Screen name="inventory-verification" options={{ title: 'Envanter Doğrulama', href: null }} />
        <Tabs.Screen name="consumption-audit" options={{ title: 'Tüketim Denetimi', href: null }} />
        <Tabs.Screen name="fifo-reorder" options={{ title: 'FIFO & Sipariş', href: null }} />
        <Tabs.Screen name="production" options={{ title: t('nav.items.production') }} />
        <Tabs.Screen name="workflows" options={{ title: t('nav.items.workflows') }} />
        {/* suppliers route Settings hub içinden açılır — tabs'ta gizli */}
        <Tabs.Screen name="suppliers" options={{ title: t('admin.tabs.suppliers'), href: null }} />
        <Tabs.Screen name="expenses" options={{ title: t('admin.tabs.expenses') }} />
        <Tabs.Screen name="checks" options={{ title: t('admin.tabs.checks') }} />
        <Tabs.Screen name="cash" options={{ title: t('admin.tabs.cash') }} />
        <Tabs.Screen name="finance-report" options={{ title: t('admin.tabs.financeReport') }} />
        <Tabs.Screen name="employees" options={{ title: t('nav.items.team') }} />
        <Tabs.Screen name="advance-requests" options={{ title: t('admin.tabs.advanceRequests') }} />
        <Tabs.Screen name="performance" options={{ title: t('admin.tabs.performance') }} />
        <Tabs.Screen name="documents" options={{ title: t('admin.tabs.documents') }} />
        <Tabs.Screen name="ik-depo" options={{ title: t('nav.items.team') }} />
        <Tabs.Screen name="checkin-settings" options={{ title: t('admin.tabs.checkinSettings') }} />
        <Tabs.Screen name="pending-paper" options={{ title: t('nav.items.paperOrders'), href: null }} />
        <Tabs.Screen name="approvals" options={{ title: t('nav.items.approvals') }} />
        <Tabs.Screen name="logs" options={{ title: t('admin.tabs.logs') }} />
        <Tabs.Screen name="profile" options={{ title: t('nav.items.profile') }} />
        <Tabs.Screen name="permissions" options={{ title: t('admin.tabs.permissions') }} />
        <Tabs.Screen name="settings" options={{ title: t('nav.items.settings') }} />
        <Tabs.Screen name="finance" options={{ title: t('nav.items.finance'), href: null }} />
        <Tabs.Screen name="messages" options={{ title: t('nav.items.messages'), href: null }} />
        <Tabs.Screen name="setup-wizard" options={{ title: t('admin.tabs.setupWizard'), href: null }} />
        {/* Nested routes (order/[id], statement/[clinicId]) —
           expo-router auto-discovers; declaring them inside Tabs causes
           "Cannot read properties of undefined (reading 'filter')" in BottomTabNavigator */}
        </Tabs>

        {/* Asymmetric tab bar — pill + accent FAB (hidden when fullscreen modal open) */}
        {!newOrderOpen && !scanOpen && (
          <PillTabBar
            items={PILL_TABS}
            fabItem={FAB_ITEM}
            baseRoute="/(admin)"
            accentColor={accentColor}
          />
        )}
      </View>

      {/* Yeni İş Emri — SADECE mobilde modal olarak açılır */}
      <Modal
        visible={newOrderOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNewOrderOpen(false)}
      >
        <React.Suspense fallback={null}>
          <NewOrderScreen panel="admin" accentColor={accentColor} onClose={() => setNewOrderOpen(false)} />
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
            onOpenOrder={(id: string) => { setScanOpen(false); router.push(`/(admin)/order/${id}` as any); }}
          />
        </React.Suspense>
      </Modal>

      {/* Daha menüsü (mobil PillTabBar 'Daha' tab'ından açılır) */}
      <React.Suspense fallback={null}>
        <MoreMenuSheet
          visible={moreOpen}
          onClose={() => setMoreOpen(false)}
          title={t('admin.moreSheet.title')}
          subtitle={t('admin.moreSheet.subtitle')}
          items={MORE_ITEMS}
          accentColor={accentColor}
        />
      </React.Suspense>

      {/* Yüz tarama — navbar butonundan tetiklenen headless sipariş seçici.
          Buton PILL_TABS içinde; bu bileşen yalnız modalı render eder. */}
      {faceScanOk && (
        <FaceScanQuickAction
          variant="headless"
          accentColor={accentColor}
          open={faceScanOpen}
          onOpenChange={setFaceScanOpen}
        />
      )}

      {/* Sağ üst kalıcı aksiyon butonları (mobile only) — QR · Bell · Profile */}
      {!hideTopActionBar && <TopActionBar routePrefix="/(admin)" accentColor={accentColor} />}
      {!hideTopActionBar && <PanelTopHeader />}

      {/* Command Palette — mobile search FAB üzerinden de erişilebilir */}
      <React.Suspense fallback={null}>
        <CommandPalette
          navItems={ADMIN_NAV}
          onNavigate={(href: string) => router.push(href as any)}
          accentColor={accentColor}
        />
      </React.Suspense>
    </>
  );
}
