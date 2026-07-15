import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
const NewOrderScreen: any = React.lazy(() => import('../../modules/orders/screens/NewOrderScreen').then(m => ({ default: (m as any).NewOrderScreen })));
const MessagesPopup: any = React.lazy(() => import('../../modules/orders/components/MessagesPopup').then(m => ({ default: (m as any).MessagesPopup })));
const CommandPalette: any = React.lazy(() => import('../../core/ui/CommandPalette').then(m => ({ default: (m as any).CommandPalette })));
const ScanB6Mobile: any = React.lazy(() => import('../../modules/orders/screens/ScanB6Mobile').then(m => ({ default: (m as any).ScanB6Mobile })));
const MoreMenuSheet: any = React.lazy(() => import('../../core/ui/mobile/MoreMenuSheet').then(m => ({ default: (m as any).MoreMenuSheet })));
import { Modal, View } from 'react-native';
import { Tabs, useRouter, Redirect, Slot } from 'expo-router';
import {
  Home, Briefcase, ClipboardList, QrCode, MessageCircle, User, Plus, MoreHorizontal, Search,
  Landmark as Landmark2, FileSpreadsheet as FileSpreadsheet2, Banknote as Banknote2,
  Package as Package2, Building2 as Building22, Truck as Truck2,
  CheckCircle2 as CheckCircle22, Camera as Camera2, Users as Users2, Settings as Settings2,
} from 'lucide-react-native';

import { PatternsShell, useIsDesktop } from '../../core/layout/PatternsShell';
import { usePendingApprovals as useDesignPending } from '../../modules/approvals/hooks/usePendingApprovals';
import { useMaterialRequestPending } from '../../modules/material-requests/hooks/usePendingCount';
import { useStockAlert } from '../../core/hooks/useStockAlert';
import { PillTabBar, type PillTabItem } from '../../core/ui/mobile/PillTabBar';
import { TopActionBar } from '../../core/ui/mobile/TopActionBar';
import { LabTopHeader } from '../../core/ui/mobile/LabTopHeader';
import { usePathname } from 'expo-router';
import { MOBILE_PANEL_THEMES } from '../../core/theme/mobileDesignTokens';


import { useThemeModeStore } from '../../core/store/themeModeStore';

// usePendingLeaveCount removed — leave tracking no longer in this module
import { useAuthStore } from '../../core/store/authStore';
import { useOrderChatInbox } from '../../modules/orders/hooks/useOrderChatInbox';
import { useScanStore } from '../../core/store/scanStore';
import { useNewOrderModalStore } from '../../core/store/newOrderModalStore';
import { usePendingActionCount } from '../../modules/orders/hooks/usePendingActionCount';
import { useColorThemeStore, applyColorThemeWeb } from '../../core/store/colorThemeStore';
import { usePermissionStore } from '../../core/store/permissionStore';
import { supabase } from '../../core/api/supabase';


// NOT: Desktop'ta "Yeni İş Emri" tıklanınca route navigate eder (/(lab)/new-order),
// böylece DesktopShell sidebar kaybolmaz. Modal SADECE mobil için.

// Patterns lab teması — saffron sarı
const LAB_DEFAULT_ACCENT = '#F5C24B';

export default function LabLayout() {
  // ── ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURN ──────────────────────
  const router = useRouter();
  const pathname = usePathname();
  // Detay sayfaları (order/[id], invoice/[id], statement, vs.) kendi sticky
  // header'larını taşıyor — global TopActionBar onlarla çakışmasın.
  // NOT: expo-router usePathname route group parens'i döndürmez → "/order/..." vs.
  const hideTopActionBar =
    /^\/(order|invoice|statement|delivery)\//.test(pathname);
  const { approvals: pendingDesign } = useDesignPending();
  const pendingMaterial = useMaterialRequestPending();
  const pendingCount = pendingDesign.length + pendingMaterial;
  const stockAlert      = useStockAlert();
  const { t } = useTranslation();
  const [pendingPaperCount, setPendingPaperCount] = useState(0);
  const isDesktop       = useIsDesktop();
  const { profile, loading } = useAuthStore();
  const { totalUnread: chatUnread } = useOrderChatInbox();
  const pendingActionCount = usePendingActionCount();
  const isManager = profile?.role === 'manager' || profile?.user_type === 'admin';

  // Global store — dashboard CTA card, FAB ve diğer yerler aynı modal'ı tetikler
  const newOrderOpen    = useNewOrderModalStore(s => s.open);
  const setNewOrderOpen = useNewOrderModalStore(s => s.setOpen);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [moreOpen,     setMoreOpen]     = useState(false);
  // Global scan modal — dashboard QR butonu da bu store'u tetikler
  const scanOpen    = useScanStore(s => s.open);
  const setScanOpen = useScanStore(s => s.setOpen);
  const isDark = useThemeModeStore(s => s.resolvedDark);

  const { getTheme, loadTheme } = useColorThemeStore();
  const { fetchForPanel, invalidate } = usePermissionStore();
  const canCreate = usePermissionStore(s => s.can('manage_order_create'));
  const canPerm    = usePermissionStore(s => s.can);
  const permLoaded = usePermissionStore(s => s.loaded);

  // Bekleyen kağıt sipariş sayısı (WhatsApp/webhook ile gelen, OCR sonrası)
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
      .channel(`paper-inbox-${labId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'pending_paper_orders',
        filter: `lab_id=eq.${labId}`,
      }, () => load())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [profile?.id]);

  useEffect(() => {
    const theme = loadTheme('lab');
    applyColorThemeWeb(theme, LAB_DEFAULT_ACCENT);
  }, []);
  const accentColor = getTheme('lab').primary;

  useEffect(() => {
    fetchForPanel('lab', profile?.user_type);
  }, [profile?.user_type]);

  // NOT: Eskiden burada visibilitychange ile permission store invalidate edip
  // fetchForPanel'i tekrar çağırıyorduk. Bu, başka taba geçip geri dönüldüğünde
  // dashboard'ı sıfırdan yüklüyor ve sidebar collapse state'inin alt componentlerde
  // re-mount sebebiyle resetlenmesine yol açıyordu. Supabase realtime + manuel
  // pull-to-refresh zaten güncel veri sağlar — bu listener kaldırıldı.

  // ── Early returns now happen AFTER all hooks ──────────────────────────────
  // Teknisyen yanlışlıkla /(lab)'a düşerse direkt /(station)'a yönlendir.
  if (profile?.user_type === 'lab' && profile?.role === 'technician') {
    return <Redirect href={"/(station)" as any} />;
  }
  // Kurye → /(courier)
  if (profile?.user_type === 'lab' && (profile?.role as string) === 'courier') {
    return <Redirect href={"/(courier)" as any} />;
  }

  // Profile yoksa veya yanlış user_type → sidebar çizme.
  // NOT: loading'i koşuldan çıkardık. Aksi halde token refresh / arka plan
  // refetch sırasında shell unmount olup sidebar kayboluyor, sonra remount
  // ediliyor (tüm data baştan yükleniyor).
  if (!profile || (profile.user_type !== 'lab' && profile.user_type !== 'admin')) {
    return <Slot />;
  }

  // Sıra: Bugün · Siparişler · Kağıt Siparişler · Onaylar · Sağlık Kurumları ·
  //       Ekip · Stok ve Depo · Kurye Takip · Finans · Destek · Mesajlar · Ayarlar
  const LAB_NAV = [
    // ── Ana ekran ──────────────────────────────────────────────────────────
    { label: t('nav.items.today'),            emoji: '📅', href: '/(lab)',                  iconName: 'home' },

    // ── İş Yönetimi ────────────────────────────────────────────────────────
    { label: t('nav.items.orders'),       emoji: '📋', href: '/(lab)/all-orders',       iconName: 'list-check', matchPrefix: true,
      sectionLabel: t('nav.sections.work'),
      badgeCount: pendingActionCount > 0 ? pendingActionCount : undefined,
      requiresPermission: 'view_orders' },
    { label: t('nav.items.paperOrders'), emoji: '📷', href: '/(lab)/pending-paper',    iconName: 'inbox',          matchPrefix: false,
      badgeCount: pendingPaperCount > 0 ? pendingPaperCount : undefined,
      requiresPermission: 'view_orders' },
    { label: t('nav.items.approvals'),          emoji: '✅', href: '/(lab)/approvals',         iconName: 'check-circle',   matchPrefix: true,
      badgeCount: pendingCount > 0 ? pendingCount : undefined,
      requiresPermission: 'view_approvals' },

    // ── Müşteriler ─────────────────────────────────────────────────────────
    { label: t('nav.items.clinics'), emoji: '🏥', href: '/(lab)/clinics',          iconName: 'building-2',     matchPrefix: true, sectionLabel: t('nav.sections.customers') },

    // ── Ekip ───────────────────────────────────────────────────────────────
    { label: t('nav.items.team'),             emoji: '👨‍💼', href: '/(lab)/ik-depo',         iconName: 'users',         matchPrefix: false, sectionLabel: t('nav.sections.team'),
      requiresPermission: 'view_team' },

    // ── Stok & Depo ───────────────────────────────────────────────────────
    { label: t('nav.items.stock'),     emoji: '📦', href: '/(lab)/stock',             iconName: 'package',        matchPrefix: true, sectionLabel: t('nav.sections.warehouse'),
      badgeCount: stockAlert,
      requiresPermission: 'view_stock' },

    // ── Üretim (canlı pano + şablonlar) ───────────────────────────────────
    { label: t('nav.items.production'),                  href: '/(lab)/production',       iconName: 'activity',       matchPrefix: true, sectionLabel: t('nav.sections.production') },
    { label: t('nav.items.workflows'),                    href: '/(lab)/workflows',        iconName: 'list-todo',      matchPrefix: true },

    // ── Teslimat ──────────────────────────────────────────────────────────
    { label: t('nav.items.courier'),                    href: '/(lab)/courier-tracking', iconName: 'scooter',        matchPrefix: true, sectionLabel: t('nav.sections.delivery') },

    // ── Finans (tek hub) ──────────────────────────────────────────────────
    { label: t('nav.items.finance'),           emoji: '💰', href: '/(lab)/finance',           iconName: 'landmark',       matchPrefix: false, sectionLabel: t('nav.sections.finance'),
      requiresPermission: 'view_financials' },
    { label: t('nav.items.priceList'),                 href: '/(lab)/finance?tab=pricelist', iconName: 'tag',        matchPrefix: false,
      requiresPermission: 'view_financials' },

    // ── Yardım / İletişim / Hesap ─────────────────────────────────────────
    { label: t('nav.items.support'),           emoji: '💬', href: '/(lab)/support',           iconName: 'help-circle',    matchPrefix: true, sectionLabel: t('nav.sections.help') },
    { label: t('nav.items.messages'),         emoji: '✉️', href: '/(lab)/messages',          iconName: 'messages-square', matchPrefix: false,
      onPress: () => setMessagesOpen(true),
      badgeCount: chatUnread > 0 ? chatUnread : undefined },
    { label: t('nav.items.settings'),          emoji: '⚙️', href: '/(lab)/settings',          iconName: 'settings',       matchPrefix: true,
      requiresPermission: 'view_settings' },
  ];

  // RBAC: CommandPalette (mobil + desktop) yalnız yetkili nav öğelerini göstermeli.
  // PatternsShell sidebar'ı kendi içinde filtreler; CommandPalette'e filtreli liste geçilir.
  const filteredNavForPalette = permLoaded
    ? LAB_NAV.filter((item: any) => !item.requiresPermission || canPerm(item.requiresPermission))
    : LAB_NAV;

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
          navItems={filteredNavForPalette}
          accentColor={accentColor}
          onPressMessages={() => setMessagesOpen(true)}
          messagesUnreadCount={chatUnread}
          hideSidebarMessages
          panelType="lab"
          newOrderHref={canCreate ? '/(lab)/new-order' : undefined}
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
            navItems={filteredNavForPalette}
            onNavigate={(href: string) => router.push(href as any)}
            accentColor={accentColor}
          />
        </React.Suspense>
      </>
    );
  }

  const PILL_TABS: PillTabItem[] = ([
    { routeName: 'index',      label: t('nav.items.summary'),     icon: Home },
    { routeName: 'all-orders', requires: 'view_orders',    label: t('nav.items.cases'), icon: ClipboardList },
    { routeName: 'approvals',  requires: 'view_approvals', label: t('nav.items.approvals'), icon: CheckCircle22, badgeCount: pendingCount > 0 ? pendingCount : undefined },
    // Mesaj artık üst bardaki (TopActionBar) butonda — bu slot Ara oldu.
    { routeName: 'search',     label: t('nav.items.search'),     icon: Search },
    // "Daha" → ekstra menüleri bottom sheet'te açar
    { routeName: 'more',       label: t('nav.items.more'),    icon: MoreHorizontal, onPress: () => setMoreOpen(true) },
  ] as any[]).filter((it: any) => !permLoaded || !it.requires || canPerm(it.requires));
  const SEARCH_ITEMS = filteredNavForPalette.map((n: any) => ({ label: n.label, href: n.href, sublabel: n.sectionLabel }));
  const FAB_ITEM: PillTabItem = {
    routeName: 'new',
    label: t('nav.items.new'),
    icon: Plus,
    onPress: () => setNewOrderOpen(true),
  };

  // "Daha" bottom-sheet'inde gösterilecek ekstra menüler — Onaylar pill'de
  // RBAC: yetkisi kapalı olan menü öğesi HİÇ gösterilmez (clinics/courier perm'siz → hep görünür).
  const MORE_ITEMS: import('../../core/ui/mobile/MoreMenuSheet').MoreItem[] = ([
    { key: 'paper',    requires: 'view_orders',     label: t('nav.items.paperInbox'),     sub: 'OCR · WhatsApp',                 icon: Camera2,   badge: pendingPaperCount > 0 ? pendingPaperCount : undefined, onPress: () => router.push('/(lab)/pending-paper' as any) },
    { key: 'clinics',                               label: t('nav.items.clinics'),sub: 'Klinik & hekimler',              icon: Building22,onPress: () => router.push('/(lab)/clinics' as any) },
    { key: 'courier',                               label: t('nav.items.courier'),     sub: 'Teslimat akışı',                 icon: Truck2,    onPress: () => router.push('/(lab)/courier-tracking' as any) },
    { key: 'finance',  requires: 'view_financials', label: t('nav.items.finance'),          sub: 'Kasa · Fatura · Gider · Çek',    icon: Landmark2, onPress: () => router.push('/(lab)/finance' as any) },
    { key: 'team',     requires: 'view_team',       label: t('nav.items.team'),            sub: 'Personel · maaş · izin',         icon: Users2,    onPress: () => router.push('/(lab)/ik-depo' as any) },
    { key: 'stock',    requires: 'view_stock',      label: t('nav.items.stock'),     sub: 'Envanter · alarm',               icon: Package2,  onPress: () => router.push('/(lab)/stock' as any) },
    { key: 'settings', requires: 'view_settings',   label: t('nav.items.settings'),         sub: 'Genel · Bildirim · Entegrasyon', icon: Settings2, onPress: () => router.push('/(lab)/settings' as any) },
  ] as any[]).filter((it: any) => !permLoaded || !it.requires || canPerm(it.requires));

  return (
    <>
      {/* NOT: navigator (PatternsShell'in <Slot/>'u / <Tabs>) lazy kardeşlerle AYNI
            Suspense sınırında OLMAMALI. Lazy chunk yüklenirken sınır askıya alınır ve
            fallback={null} alt ağacın tamamını — navigator dahil — söker; o pencerede
            expo-router render edilmiş çocuk rotası bulamayıp durumunu kaybeder ve
            index'e sıfırlanır (alt sayfada yenileyince özete dönme hatası).
            Lazy kardeşler kendi sınırlarında durur. */}
      <View style={{ flex: 1, backgroundColor: isDark ? '#0E0E0E' : MOBILE_PANEL_THEMES.lab.bgPage }}>
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
        <Tabs.Screen name="pending-paper" options={{ title: 'Kağıt Sipariş Inbox', href: null }} />
        <Tabs.Screen name="production"  options={{ title: 'Üretim Panosu' }} />
        <Tabs.Screen name="deliveries"    options={{ title: 'Teslimatlar' }} />
        <Tabs.Screen name="courier"       options={{ title: 'Kurye Paneli' }} />
        {/* delivery/[id] nested — auto-discover; declaring inside Tabs triggers filter crash */}
        <Tabs.Screen name="analytics"     options={{ title: 'Analitik' }} />
        <Tabs.Screen name="stock"        options={{ title: 'Stok & Depo' }} />
        <Tabs.Screen name="workflows"    options={{ title: 'İş Akışları' }} />
        {/* suppliers route Settings hub içinden açılır — tabs'ta gizli */}
        <Tabs.Screen name="suppliers"    options={{ title: 'Tedarikçiler', href: null }} />
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
        {/* Nested route declarations (order/[id], order/route/[id], invoice/[id])
           kaldırıldı — Tabs içinde nested route declare etmek RN 0.76'da
           BottomTabNavigator "filter of undefined" crash'ine yol açıyor.
           expo-router bunları otomatik keşfediyor zaten. */}
        <Tabs.Screen name="setup-wizard" options={{ title: 'Kurulum' }} />
        </Tabs>

        {/* Asymmetric tab bar — pill + accent FAB (hidden when fullscreen modal open) */}
        {!newOrderOpen && !scanOpen && (
          <PillTabBar
            items={PILL_TABS}
            fabItem={canCreate ? FAB_ITEM : undefined}
            baseRoute="/(lab)"
            accentColor={accentColor}
            searchItems={SEARCH_ITEMS}
            onSearchNavigate={(href) => router.push(href as any)}
          />
        )}
      </View>

      {/* Yeni İş Emri — her zaman modal olarak açılır */}
      <Modal
        visible={newOrderOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNewOrderOpen(false)}
      >
        <React.Suspense fallback={null}>
          <NewOrderScreen onClose={() => setNewOrderOpen(false)} />
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
            onOpenOrder={(id: string) => { setScanOpen(false); router.push(`/(lab)/order/${id}` as any); }}
          />
        </React.Suspense>
      </Modal>

      {/* Command Palette — modal, tüm sayfalarda erişilebilir */}
      <React.Suspense fallback={null}>
        <CommandPalette
          navItems={filteredNavForPalette}
          onNavigate={(href: string) => router.push(href as any)}
          accentColor={accentColor}
        />
      </React.Suspense>

      {/* Daha menüsü (mobil PillTabBar 'Daha' tab'ından açılır) */}
      <React.Suspense fallback={null}>
        <MoreMenuSheet
          visible={moreOpen}
          onClose={() => setMoreOpen(false)}
          title="Tüm Menü"
          subtitle="Sık kullanılmayan ekranlar"
          items={MORE_ITEMS}
          accentColor={accentColor}
        />
      </React.Suspense>

      {/* Search button moved to TopActionBar (top-right) */}

      {/* Sağ üst kalıcı aksiyon butonları (mobile only) — Search · QR · Bell · Profile
          Detay sayfaları kendi header'ını taşıyor (back + chat), TopActionBar çakışmasın */}
      {!hideTopActionBar && <TopActionBar routePrefix="/(lab)" accentColor={accentColor} />}
      {/* Global sabit lab başlığı — logo + üst blur şeridi (her sayfada) */}
      {!hideTopActionBar && <LabTopHeader />}
    </>
  );
}
