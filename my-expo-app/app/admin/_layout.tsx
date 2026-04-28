import React from 'react';
import { Text, View, StyleSheet, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DesktopShell, useIsDesktop } from '../../core/layout/DesktopShell';
import { useAuthStore } from '../../core/store/authStore';

import { AppIcon } from '../../core/ui/AppIcon';

const ADMIN_ACCENT = '#0F172A';

// Lab/(admin) ile aynı bölümlü yapı: sectionLabel'lar ile gruplandı
const NAV_ITEMS = [
  // ── Ana ekran ────────────────────────────────────────────────────────────
  { label: 'Özet',         emoji: '📊', href: '/admin',           iconName: 'grid',          iconSet: 'mdi' as const },

  // ── İş Yönetimi ──────────────────────────────────────────────────────────
  { label: 'Siparişler',   emoji: '📋', href: '/admin/orders',    iconName: 'clipboard',     iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'İş Yönetimi' },

  // ── Müşteriler ───────────────────────────────────────────────────────────
  { label: 'Kullanıcılar', emoji: '👥', href: '/admin/users',     iconName: 'users',         iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'Müşteriler' },

  // ── Stok & Depo ──────────────────────────────────────────────────────────
  { label: 'Materyaller',  emoji: '💎', href: '/admin/materials', iconName: 'package',       iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'Stok & Depo' },

  // ── Sistem ───────────────────────────────────────────────────────────────
  { label: 'Raporlar',     emoji: '📈', href: '/admin/reports',   iconName: 'bar-chart-2',   iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'Sistem' },
  { label: 'Ayarlar',      emoji: '⚙️', href: '/admin/settings',  iconName: 'settings',      iconSet: 'mdi' as const, matchPrefix: true },
];

export default function AdminLayout() {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <DesktopShell navItems={NAV_ITEMS} accentColor={ADMIN_ACCENT} />;
  }

  // Mobile: bottom tab bar
  return (
    <AdminMobileLayout />
  );
}

function AdminMobileLayout() {
  const pathname  = usePathname();
  const router    = useRouter();
  const { signOut } = useAuthStore();

  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin' || pathname === '/admin/';
    return pathname.startsWith(href);
  }

  return (
    <SafeAreaView style={mob.safe} edges={['top']}>
      <View style={mob.content}>
        <Slot />
      </View>
      <View style={mob.tabBar}>
        {NAV_ITEMS.map(item => {
          const active = isActive(item.href);
          return (
            <TouchableOpacity
              key={item.href}
              style={mob.tabItem}
              onPress={() => router.push(item.href as any)}
            >
              <AppIcon
                name={item.iconName as any}
                size={20}
                color={active ? ADMIN_ACCENT : '#94A3B8'}
              />
              <Text style={[mob.tabLabel, active && mob.tabLabelActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const mob = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    paddingBottom: Platform.OS === 'ios' ? 16 : 8,
    paddingTop: 8,
    // @ts-ignore
    boxShadow: '0 -2px 10px rgba(0,0,0,0.06)',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
  },
  tabLabelActive: {
    color: ADMIN_ACCENT,
    fontWeight: '700',
  },
});
