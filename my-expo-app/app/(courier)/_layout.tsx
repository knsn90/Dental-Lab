// app/(courier)/_layout.tsx — Kurye paneli responsive shell
// Desktop: PatternsShell sidebar 220px (DS.tech mavi tema)
// Mobile: Tabs + PillTabBar (Home / Liste / QR FAB / Harita / Profil)

import React from 'react';
import { useTranslation } from 'react-i18next';
import { localeTag } from '../../core/i18n';
import { View, Modal } from 'react-native';
import { Tabs, Slot, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Home, ClipboardList, QrCode, Map as MapIcon, User,
} from '../../core/ui/icons';
import { PatternsShell, useIsDesktop } from '../../core/layout/PatternsShell';
import { PillTabBar, type PillTabItem } from '../../core/ui/mobile/PillTabBar';
import { useAuthStore } from '../../core/store/authStore';
import { useScanStore } from '../../core/store/scanStore';
import { DS } from '../../core/theme/dsTokens';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useCourierTracking } from '../../modules/courier/useCourierTracking';

// QR/kamera tarayıcı — Tara FAB (setScanOpen) ile açılır (station ile aynı).
const ScanB6Mobile: any = React.lazy(() => import('../../modules/orders/screens/ScanB6Mobile').then(m => ({ default: (m as any).ScanB6Mobile })));

// Kurye paneli — tech mavi accent
const COURIER_ACCENT = DS.tech.primary; // #3B82F6

export default function CourierLayout() {
  const isDesktop = useIsDesktop();
  const { profile, loading } = useAuthStore();
  const isCourier = profile?.user_type === 'lab' && (profile as any)?.role === 'courier';
  const scanOpen    = useScanStore(s => s.open);
  const setScanOpen = useScanStore(s => s.setOpen);
  const router = useRouter();
  const { t, i18n } = useTranslation();

  // Panel-seviyesi konum takibi — kurye herhangi bir ekrandayken, taşıdığı/yolda
  // iş varken (ön plan) konumu tüm aktif teslimatlara yazar. (Hook kuralı: early
  // return'den ÖNCE; kurye değilse null → no-op.)
  useCourierTracking(isCourier ? profile?.id : null);

  if (loading) return <LoadingSpinner fullScreen message={t('common.loading')} />;
  if (!profile || !isCourier) return <Slot />;

  const todayLabel = new Date().toLocaleDateString(localeTag(i18n.language), { day: '2-digit', month: 'long' });
  const COURIER_NAV = [
    { label: todayLabel,            href: '/(courier)',            iconName: 'home' },
    { label: t('nav.items.deliveries'), href: '/(courier)/deliveries', iconName: 'clipboard-list', matchPrefix: true },
    { label: t('nav.items.map'),        href: '/(courier)/map',        iconName: 'truck',          matchPrefix: true },
    { label: t('nav.items.stats'),      href: '/(courier)/stats',      iconName: 'bar-chart-3',    matchPrefix: true, sectionLabel: t('nav.sections.performance') },
    { label: t('nav.items.support'),    href: '/(courier)/support',    iconName: 'help-circle',    matchPrefix: true, sectionLabel: t('nav.sections.help') },
  ];

  // ── Desktop ────────────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <PatternsShell
        navItems={COURIER_NAV}
        accentColor={COURIER_ACCENT}
        panelType="station"
      />
    );
  }

  // ── Mobile ────────────────────────────────────────────────────────────
  const PILL_TABS: PillTabItem[] = [
    { routeName: 'index',      label: t('nav.items.today'),  icon: Home },
    { routeName: 'deliveries', label: t('nav.items.list'),   icon: ClipboardList },
    { routeName: 'map',        label: t('nav.items.map'),    icon: MapIcon },
    { routeName: 'stats',      label: t('nav.items.profile'),icon: User },
  ];

  const FAB_ITEM: PillTabItem = {
    routeName: 'scan',
    label: t('nav.items.scan'),
    icon: QrCode,
    onPress: () => setScanOpen(true),
  };

  return (
    <View style={{ flex: 1, backgroundColor: DS.tech.bg }}>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: DS.tech.bg },
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="index"      options={{ title: t('nav.items.today') }} />
        <Tabs.Screen name="deliveries" options={{ title: t('nav.items.deliveries'), href: null } as any} />
        <Tabs.Screen name="map"        options={{ title: t('nav.items.map'),     href: null } as any} />
        <Tabs.Screen name="stats"      options={{ title: t('nav.items.stats') }} />
        <Tabs.Screen name="support"    options={{ title: t('nav.items.support'),     href: null } as any} />
        <Tabs.Screen name="delivery"   options={{ href: null } as any} />
      </Tabs>

      {!scanOpen && (
        <PillTabBar
          items={PILL_TABS}
          fabItem={FAB_ITEM}
          baseRoute="/(courier)"
          accentColor={COURIER_ACCENT}
        />
      )}

      {/* QR/kamera tarayıcı — Tara FAB ile tam ekran açılır (station ile aynı desen) */}
      <Modal
        visible={scanOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setScanOpen(false)}
      >
        <React.Suspense fallback={null}>
          <ScanB6Mobile
            onClose={() => setScanOpen(false)}
            onOpenOrder={(id: string) => { setScanOpen(false); router.push(`/(courier)/delivery/${id}` as any); }}
          />
        </React.Suspense>
      </Modal>
    </View>
  );
}
