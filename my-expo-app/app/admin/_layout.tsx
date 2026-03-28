import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useAuthStore } from '../../core/store/authStore';
import { SafeAreaView } from 'react-native-safe-area-context';

const ACCENT = '#7C3AED';
const ACCENT_BG = '#F5F3FF';
const BG = '#E8EDF5';
const WHITE = '#FFFFFF';
const TEXT_PRIMARY = '#0F172A';
const TEXT_SECONDARY = '#64748B';
const BORDER = '#E2E8F0';

const NAV_ITEMS = [
  { label: 'Özet',         emoji: '📊', href: '/admin' },
  { label: 'Siparişler',   emoji: '📋', href: '/admin/orders' },
  { label: 'Kullanıcılar', emoji: '👥', href: '/admin/users' },
  { label: 'Raporlar',     emoji: '📈', href: '/admin/reports' },
  { label: 'Ayarlar',      emoji: '⚙️', href: '/admin/settings' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin' || pathname === '/admin/';
  return pathname.startsWith(href);
}

function getPageTitle(pathname: string): string {
  if (pathname === '/admin' || pathname === '/admin/') return 'Özet';
  if (pathname.startsWith('/admin/orders')) return 'Siparişler';
  if (pathname.startsWith('/admin/users')) return 'Kullanıcılar';
  if (pathname.startsWith('/admin/reports')) return 'Raporlar';
  if (pathname.startsWith('/admin/settings')) return 'Ayarlar';
  return 'Admin Paneli';
}

function formatDate(): string {
  const now = new Date();
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return 'A';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0][0].toUpperCase();
}

interface TooltipNavItemProps {
  item: typeof NAV_ITEMS[0];
  active: boolean;
  onPress: () => void;
}

function TooltipNavItem({ item, active, onPress }: TooltipNavItemProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <View style={styles.navItemWrapper}>
      <TouchableOpacity
        onPress={onPress}
        style={[styles.navItem, active && styles.navItemActive]}
        // @ts-ignore
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        accessibilityLabel={item.label}
      >
        <Text style={styles.navEmoji}>{item.emoji}</Text>
      </TouchableOpacity>
      {hovered && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>{item.label}</Text>
        </View>
      )}
    </View>
  );
}

export default function AdminLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuthStore();

  if (isDesktop) {
    return (
      <View style={styles.desktopContainer}>
        {/* Sidebar */}
        <View style={styles.sidebar}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={styles.logoBox}>
              <Text style={styles.logoEmoji}>🦷</Text>
            </View>
          </View>

          {/* Nav Items */}
          <View style={styles.navList}>
            {NAV_ITEMS.map((item) => (
              <TooltipNavItem
                key={item.href}
                item={item}
                active={isActive(pathname, item.href)}
                onPress={() => router.push(item.href as any)}
              />
            ))}
          </View>

          {/* Logout */}
          <View style={styles.sidebarBottom}>
            <TooltipNavItem
              item={{ label: 'Çıkış', emoji: '🚪', href: '' }}
              active={false}
              onPress={async () => {
                await signOut();
                router.replace('/(auth)/login' as any);
              }}
            />
          </View>
        </View>

        {/* Main area */}
        <View style={styles.mainArea}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <View style={styles.topBarLeft}>
              <Text style={styles.topBarTitle}>Admin Paneli</Text>
              <Text style={styles.topBarSeparator}>›</Text>
              <Text style={styles.topBarPage}>{getPageTitle(pathname)}</Text>
            </View>
            <View style={styles.topBarRight}>
              <Text style={styles.topBarDate}>{formatDate()}</Text>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{getInitials(profile?.full_name)}</Text>
              </View>
            </View>
          </View>

          {/* Content */}
          <View style={styles.contentArea}>
            <Slot />
          </View>
        </View>
      </View>
    );
  }

  // Mobile layout
  return (
    <SafeAreaView style={styles.mobileContainer} edges={['top']}>
      <View style={styles.mobileContent}>
        <Slot />
      </View>
      {/* Bottom tab bar */}
      <View style={styles.mobileTabBar}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <TouchableOpacity
              key={item.href}
              style={styles.mobileTabItem}
              onPress={() => router.push(item.href as any)}
            >
              <Text style={styles.mobileTabEmoji}>{item.emoji}</Text>
              <Text style={[styles.mobileTabLabel, active && styles.mobileTabLabelActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Desktop
  desktopContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: BG,
  },
  sidebar: {
    width: 68,
    backgroundColor: WHITE,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    alignItems: 'center',
    paddingVertical: 12,
    // @ts-ignore
    boxShadow: '2px 0 8px rgba(0,0,0,0.06)',
  },
  logoContainer: {
    marginBottom: 20,
    marginTop: 4,
  },
  logoBox: {
    width: 44,
    height: 44,
    backgroundColor: ACCENT,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: {
    fontSize: 22,
  },
  navList: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  navItemWrapper: {
    position: 'relative',
    alignItems: 'center',
  },
  navItem: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  navItemActive: {
    backgroundColor: ACCENT_BG,
    // @ts-ignore
    boxShadow: `inset 0 0 0 1.5px ${ACCENT}33`,
  },
  navEmoji: {
    fontSize: 20,
  },
  tooltip: {
    position: 'absolute',
    left: 52,
    top: 10,
    backgroundColor: TEXT_PRIMARY,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    zIndex: 999,
    // @ts-ignore
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    minWidth: 80,
  },
  tooltipText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '600',
    // @ts-ignore
    whiteSpace: 'nowrap',
  },
  sidebarBottom: {
    marginBottom: 8,
  },
  mainArea: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: BG,
    overflow: 'hidden',
  },
  topBar: {
    height: 56,
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    // @ts-ignore
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: ACCENT,
  },
  topBarSeparator: {
    fontSize: 14,
    color: TEXT_SECONDARY,
  },
  topBarPage: {
    fontSize: 14,
    fontWeight: '500',
    color: TEXT_PRIMARY,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topBarDate: {
    fontSize: 13,
    color: TEXT_SECONDARY,
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '700',
  },
  contentArea: {
    flex: 1,
    overflow: 'hidden',
  },
  // Mobile
  mobileContainer: {
    flex: 1,
    backgroundColor: BG,
  },
  mobileContent: {
    flex: 1,
  },
  mobileTabBar: {
    flexDirection: 'row',
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingBottom: Platform.OS === 'ios' ? 16 : 8,
    paddingTop: 8,
    // @ts-ignore
    boxShadow: '0 -2px 8px rgba(0,0,0,0.06)',
  },
  mobileTabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  mobileTabEmoji: {
    fontSize: 18,
  },
  mobileTabLabel: {
    fontSize: 10,
    color: TEXT_SECONDARY,
    fontWeight: '500',
  },
  mobileTabLabelActive: {
    color: ACCENT,
    fontWeight: '700',
  },
});
