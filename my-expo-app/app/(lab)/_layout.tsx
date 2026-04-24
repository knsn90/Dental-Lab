import { useState } from 'react';
import { Modal } from 'react-native';
import { Tabs } from 'expo-router';
import { C as Colors } from '../../core/theme/colors';
import { DesktopShell, useIsDesktop } from '../../core/layout/DesktopShell';
import { usePendingApprovals as useDesignPending } from '../../modules/approvals/hooks/usePendingApprovals';
import { useStockAlert } from '../../core/hooks/useStockAlert';
import { MobileTabBar, type MobileTabItem } from '../../core/ui/MobileTabBar';
import { NewOrderScreen } from '../../modules/orders/screens/NewOrderScreen';
import { usePendingLeaveCount } from '../../modules/hr/hooks/useHR';
import { useAuthStore } from '../../core/store/authStore';

// NOT: Desktop'ta "Yeni İş Emri" tıklanınca route navigate eder (/(lab)/new-order),
// böylece DesktopShell sidebar kaybolmaz. Modal SADECE mobil için.

export default function LabLayout() {
  const { approvals: pendingDesign } = useDesignPending();
  const pendingCount = pendingDesign.length;
  const stockAlert      = useStockAlert();
  const isDesktop       = useIsDesktop();
  const { profile }     = useAuthStore();
  const pendingLeaveCount = usePendingLeaveCount();
  // Badge sadece mesul müdür ve admin için görünür
  const isManager = profile?.role === 'manager' || profile?.user_type === 'admin';

  const [newOrderOpen, setNewOrderOpen] = useState(false);

  const LAB_NAV = [
    // ── Ana ekran ──────────────────────────────────────────────────────────
    { label: 'Bugün',        emoji: '📅', href: '/(lab)',              iconName: 'home',          iconSet: 'mdi' as const },

    // ── İş Yönetimi ────────────────────────────────────────────────────────
    { label: 'Siparişler',   emoji: '📋', href: '/(lab)/all-orders',   iconName: 'clipboard',      iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'İş Yönetimi' },
    { label: 'Mesajlar',     emoji: '💬', href: '/(lab)/messages',    iconName: 'message-circle', iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Yeni İş Emri', emoji: '➕', href: '/(lab)/new-order',   iconName: 'plus-circle',    iconSet: 'mdi' as const },
    { label: 'Onaylar',      emoji: '✅', href: '/(lab)/approvals',   iconName: 'check-circle',   iconSet: 'mdi' as const, badge: pendingCount > 0, matchPrefix: true },

    // ── Müşteriler ─────────────────────────────────────────────────────────
    { label: 'Klinikler',    emoji: '🏥', href: '/(lab)/clinics',      iconName: 'briefcase',     iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'Müşteriler' },
    { label: 'Kullanıcılar', emoji: '👥', href: '/(lab)/users',        iconName: 'users',         iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Hizmetler',    emoji: '💰', href: '/(lab)/lab-services', iconName: 'tag',           iconSet: 'mdi' as const, matchPrefix: true },

    // ── Mali İşlemler ──────────────────────────────────────────────────────
    { label: 'Faturalar',    emoji: '🧾', href: '/(lab)/invoices',       iconName: 'file-text',    iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'Mali İşlemler' },
    { label: 'Giderler',     emoji: '💸', href: '/(lab)/expenses',       iconName: 'trending-down', iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Çek/Senet',   emoji: '📝', href: '/(lab)/checks',         iconName: 'credit-card',  iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Kasa/Banka',   emoji: '🏦', href: '/(lab)/cash',           iconName: 'archive',      iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Gelir/Gider',  emoji: '📊', href: '/(lab)/finance-report', iconName: 'bar-chart-2',  iconSet: 'mdi' as const, matchPrefix: true },

    // ── İnsan Kaynakları & Depo ────────────────────────────────────────────
    { label: 'Çalışanlar',  emoji: '👨‍💼', href: '/(lab)/employees',      iconName: 'users',           iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'İK & Depo' },
    { label: 'İzin & Devam', emoji: '📅', href: '/(lab)/hr',             iconName: 'calendar',         iconSet: 'mdi' as const, matchPrefix: true,
      badgeCount: isManager && pendingLeaveCount > 0 ? pendingLeaveCount : undefined },
    { label: 'Bordro',        emoji: '💰', href: '/(lab)/payroll',        iconName: 'dollar-sign',      iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'SGK',           emoji: '🏛️', href: '/(lab)/sgk',           iconName: 'shield',           iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Performans',    emoji: '🏆', href: '/(lab)/performance',    iconName: 'award',            iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Dosyalar',      emoji: '📁', href: '/(lab)/documents',      iconName: 'folder',           iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Stok',         emoji: '📦', href: '/(lab)/stock',          iconName: 'package',          iconSet: 'mdi' as const, matchPrefix: true, badgeCount: stockAlert },

    // ── Hesap ──────────────────────────────────────────────────────────────
    { label: 'QR Check-in',  emoji: '📷', href: '/(lab)/checkin-settings',  iconName: 'camera',      iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'Hesap' },
    { label: 'Profil',       emoji: '👤', href: '/(lab)/profile',            iconName: 'user',        iconSet: 'mdi' as const, matchPrefix: true },
  ];

  if (isDesktop) {
    // Desktop'ta "Yeni İş Emri" → route navigate eder, sidebar kaybolmaz.
    // Modal sadece mobil için.
    return <DesktopShell navItems={LAB_NAV} accentColor={Colors.primary} />;
  }

  const MOBILE_TABS: MobileTabItem[] = [
    { routeName: 'index',      label: 'Bugün',     icon: 'home' },
    { routeName: 'all-orders', label: 'İşler',     icon: 'clipboard' },
    { routeName: 'new-order',  label: 'Yeni',      icon: 'plus-circle', onPress: () => setNewOrderOpen(true) },
    { routeName: 'approvals',  label: 'Onaylar',   icon: 'check-circle', badge: pendingCount > 0 },
    { routeName: 'profile',    label: 'Profil',    icon: 'user' },
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
            accentColor={Colors.primary}
          />
        )}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Bugün' }} />
        <Tabs.Screen name="all-orders" options={{ title: 'Tüm İşler' }} />
        <Tabs.Screen name="stock" options={{ title: 'Stok' }} />
        <Tabs.Screen name="new-order" options={{ title: 'Yeni İş' }} />
        <Tabs.Screen name="users" options={{ title: 'Kullanıcılar' }} />
        <Tabs.Screen name="clinics" options={{ title: 'Klinikler' }} />
        <Tabs.Screen name="lab-services" options={{ title: 'Hizmetler' }} />
        <Tabs.Screen name="invoices" options={{ title: 'Faturalar' }} />
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
        <Tabs.Screen name="balance" options={{ title: 'Cari Hesap', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="checkin-settings" options={{ title: 'QR Check-in', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="approvals" options={{ title: 'Onaylar' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
        <Tabs.Screen name="order/[id]" options={{ tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="order/occlusion/[id]" options={{ tabBarStyle: { display: 'none' } }} />
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
    </>
  );
}
