import React, { useState } from 'react';
import { Modal } from 'react-native';
import { Slot, Tabs } from 'expo-router';
import { DesktopShell, useIsDesktop } from '../../core/layout/DesktopShell';
import { usePendingApprovals } from '../../core/hooks/usePendingApprovals';
import { useStockAlert } from '../../core/hooks/useStockAlert';
import { useAuthStore } from '../../core/store/authStore';
import { MobileTabBar, type MobileTabItem } from '../../core/ui/MobileTabBar';
import { NewOrderScreen } from '../../modules/orders/screens/NewOrderScreen';
import { usePendingLeaveCount } from '../../modules/hr/hooks/useHR';

// NOT: Desktop'ta "Yeni İş Emri" → route navigate eder (/(admin)/new-order),
// sidebar kaybolmaz. Modal SADECE mobil için.

export default function AdminLayout() {
  const { profile, loading } = useAuthStore();
  const pendingCount      = usePendingApprovals();
  const stockAlert        = useStockAlert();
  const isDesktop         = useIsDesktop();
  const pendingLeaveCount = usePendingLeaveCount(); // Admin her zaman görebilir
  const [newOrderOpen, setNewOrderOpen] = useState(false);

  // Yükleme tamamlandı ve kesinlikle admin değil → sidebar gösterme
  if (!loading && profile && profile.user_type !== 'admin') {
    return <Slot />;
  }

  const ADMIN_NAV = [
    // ── Ana ekran ──────────────────────────────────────────────────────────
    { label: 'Özet',         emoji: '📊', href: '/(admin)',              iconName: 'grid',          iconSet: 'mdi' as const },

    // ── İş Yönetimi ────────────────────────────────────────────────────────
    { label: 'Siparişler',   emoji: '📋', href: '/(admin)/orders',       iconName: 'clipboard',     iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'İş Yönetimi' },
    { label: 'Yeni İş Emri', emoji: '➕', href: '/(admin)/new-order',   iconName: 'plus-circle',   iconSet: 'mdi' as const },
    { label: 'Onaylar',      emoji: '✅', href: '/(admin)/approvals',   iconName: 'check-circle',  iconSet: 'mdi' as const, badge: pendingCount > 0, matchPrefix: true },

    // ── Müşteriler ─────────────────────────────────────────────────────────
    { label: 'Klinikler',    emoji: '🏥', href: '/(admin)/clinics',      iconName: 'briefcase',     iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'Müşteriler' },
    { label: 'Kullanıcılar', emoji: '👥', href: '/(admin)/users',        iconName: 'users',         iconSet: 'mdi' as const, matchPrefix: true },

    // ── Mali İşlemler ──────────────────────────────────────────────────────
    { label: 'Giderler',     emoji: '💸', href: '/(admin)/expenses',       iconName: 'trending-down', iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'Mali İşlemler' },
    { label: 'Çek/Senet',   emoji: '📝', href: '/(admin)/checks',         iconName: 'credit-card',  iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Kasa/Banka',   emoji: '🏦', href: '/(admin)/cash',           iconName: 'archive',      iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Gelir/Gider',  emoji: '📊', href: '/(admin)/finance-report', iconName: 'bar-chart-2',  iconSet: 'mdi' as const, matchPrefix: true },

    // ── İK & Depo ─────────────────────────────────────────────────────────
    { label: 'Çalışanlar',  emoji: '👨‍💼', href: '/(admin)/employees',     iconName: 'users',           iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'İK & Depo' },
    { label: 'İzin & Devam', emoji: '📅', href: '/(admin)/hr',            iconName: 'calendar',         iconSet: 'mdi' as const, matchPrefix: true,
      badgeCount: pendingLeaveCount > 0 ? pendingLeaveCount : undefined },
    { label: 'Bordro',        emoji: '💰', href: '/(admin)/payroll',       iconName: 'dollar-sign',      iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Performans',    emoji: '🏆', href: '/(admin)/performance',   iconName: 'award',            iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Dosyalar',      emoji: '📁', href: '/(admin)/documents',     iconName: 'folder',           iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Stok',         emoji: '📦', href: '/(admin)/stock',         iconName: 'package',          iconSet: 'mdi' as const, matchPrefix: true, badgeCount: stockAlert },

    // ── Sistem ─────────────────────────────────────────────────────────────
    { label: 'QR Check-in',  emoji: '📷', href: '/(admin)/checkin-settings', iconName: 'camera',    iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'Sistem' },
    { label: 'Loglar',       emoji: '📜', href: '/(admin)/logs',             iconName: 'file-text', iconSet: 'mdi' as const, matchPrefix: true },
    { label: 'Profil',       emoji: '⚙️', href: '/(admin)/profile',         iconName: 'settings',  iconSet: 'mdi' as const, matchPrefix: true },
  ];

  if (isDesktop) {
    // Desktop: DesktopShell içinde route render edilir, sidebar hiç kaybolmaz.
    return <DesktopShell navItems={ADMIN_NAV} accentColor="#0F172A" />;
  }

  const MOBILE_TABS: MobileTabItem[] = [
    { routeName: 'index',     label: 'Özet',      icon: 'grid' },
    { routeName: 'orders',    label: 'Sipariş',   icon: 'clipboard' },
    { routeName: 'new-order', label: 'Yeni',      icon: 'plus-circle', onPress: () => setNewOrderOpen(true) },
    { routeName: 'approvals', label: 'Onaylar',   icon: 'check-circle', badge: pendingCount > 0 },
    { routeName: 'profile',   label: 'Profil',    icon: 'settings' },
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
            accentColor="#0F172A"
          />
        )}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Özet' }} />
        <Tabs.Screen name="new-order" options={{ title: 'Yeni İş' }} />
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
        <Tabs.Screen name="hr" options={{ title: 'İzin & Devam', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="payroll" options={{ title: 'Bordro', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="performance" options={{ title: 'Performans', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="documents" options={{ title: 'Dosyalar', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="checkin-settings" options={{ title: 'QR Check-in', tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="approvals" options={{ title: 'Onaylar' }} />
        <Tabs.Screen name="logs" options={{ title: 'Loglar' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
        <Tabs.Screen name="order/[id]" options={{ tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="order/occlusion/[id]" options={{ tabBarStyle: { display: 'none' } }} />
      </Tabs>

      {/* Yeni İş Emri — SADECE mobilde modal olarak açılır */}
      <Modal
        visible={newOrderOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNewOrderOpen(false)}
      >
        <NewOrderScreen accentColor="#0F172A" onClose={() => setNewOrderOpen(false)} />
      </Modal>
    </>
  );
}
