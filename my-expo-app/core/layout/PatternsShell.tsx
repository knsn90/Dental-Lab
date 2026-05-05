/**
 * PatternsShell — Desktop shell with patterns design language sidebar
 *
 *   • Card-styled white sidebar (expanded + collapsed) on krem page bg
 *   • Top-right header bar: search + bell + profile/logout (uygulama geneli)
 *   • Renders <Slot /> for child route content.
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Platform, useWindowDimensions, Animated, Easing, Image } from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';

// ── Patterns scrollbar — krem zemin, ink thumb (web only) ──────────────
let __scrollbarInjected = false;
function injectPatternsScrollbar() {
  if (Platform.OS !== 'web' || __scrollbarInjected || typeof document === 'undefined') return;
  __scrollbarInjected = true;
  const style = document.createElement('style');
  style.dataset.patternsScrollbar = 'true';
  style.textContent = `
    .patterns-scroll, .patterns-scroll * {
      scrollbar-width: thin;
      scrollbar-color: rgba(0,0,0,0.18) transparent;
    }
    .patterns-scroll::-webkit-scrollbar,
    .patterns-scroll *::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    .patterns-scroll::-webkit-scrollbar-track,
    .patterns-scroll *::-webkit-scrollbar-track {
      background: transparent;
    }
    .patterns-scroll::-webkit-scrollbar-thumb,
    .patterns-scroll *::-webkit-scrollbar-thumb {
      background: rgba(0,0,0,0.14);
      border-radius: 999px;
      border: 2px solid transparent;
      background-clip: padding-box;
    }
    .patterns-scroll::-webkit-scrollbar-thumb:hover,
    .patterns-scroll *::-webkit-scrollbar-thumb:hover {
      background: rgba(0,0,0,0.28);
      background-clip: padding-box;
    }
    .patterns-scroll::-webkit-scrollbar-corner,
    .patterns-scroll *::-webkit-scrollbar-corner {
      background: transparent;
    }
  `;
  document.head.appendChild(style);
}
import {
  Home, Grid, ClipboardList, FileText, FilePlus, PlusCircle,
  Activity, Stethoscope, Settings, Users, Package, Truck,
  DollarSign, MessageSquare, Search, Bell, ChevronLeft, ChevronRight,
  LogOut, CheckSquare, CheckCircle, BarChart3, Calendar, Boxes, Wallet,
  Building2, Landmark, UserCog, Briefcase, Box, ShieldCheck, ListTodo,
  Camera, ScanLine, Clipboard,
} from 'lucide-react-native';
import { useAuthStore } from '../store/authStore';
import { usePermissionStore } from '../store/permissionStore';
import { usePageTitleStore } from '../store/pageTitleStore';
import { supabase } from '../api/supabase';

// ── Types (compatible with DesktopShell's NavItem) ────────────────────
export interface PatternsNavItem {
  label: string;
  emoji?: string;
  href: string;
  matchPrefix?: boolean;
  badge?: boolean;
  badgeCount?: number;
  iconName?: string;
  iconSet?: string;
  subtitle?: string;
  sectionLabel?: string;
  onPress?: () => void;
  /** If set, this nav item is hidden unless the user has this permission */
  requiresPermission?: string;
  /** If set, this nav item is hidden unless the user has ANY of these permissions */
  requiresAnyPermission?: string[];
}

interface Props {
  navItems: PatternsNavItem[];
  accentColor?: string;
  onPressMessages?: () => void;
  messagesUnreadCount?: number;
  panelType?: 'lab' | 'clinic_admin' | 'doctor' | 'admin' | 'station';
  brandName?: string;
  brandSubtitle?: string;
  newOrderHref?: string;
  onSearchSubmit?: (query: string) => void;
}

// Lucide icon resolver — tüm DesktopShell iconName'leri kapsar
const ICONS: Record<string, React.ComponentType<any>> = {
  home:             Home,
  grid:             Grid,
  'clipboard-list': ClipboardList,
  'file-text':      FileText,
  'file-plus':      FilePlus,
  'plus-circle':    PlusCircle,
  activity:         Activity,
  stethoscope:      Stethoscope,
  settings:         Settings,
  users:            Users,
  'user-cog':       UserCog,
  package:          Package,
  truck:            Truck,
  'dollar-sign':    DollarSign,
  'message-square': MessageSquare,
  search:           Search,
  bell:             Bell,
  logout:           LogOut,
  'log-out':        LogOut,
  'check-square':   CheckSquare,
  'check-circle':   CheckCircle,
  'bar-chart-3':    BarChart3,
  calendar:         Calendar,
  boxes:            Boxes,
  wallet:           Wallet,
  'building-2':     Building2,
  building2:        Building2,
  landmark:         Landmark,
  briefcase:        Briefcase,
  box:              Box,
  'shield-check':   ShieldCheck,
  'list-todo':      ListTodo,
  camera:           Camera,
  'scan-line':      ScanLine,
  clipboard:        Clipboard,
};

const DEFAULT_ICON = Grid;

function resolveIcon(name?: string) {
  if (!name) return DEFAULT_ICON;
  return ICONS[name] || DEFAULT_ICON;
}

export function useIsDesktop() {
  const { width } = useWindowDimensions();
  return width >= 1024;
}

export function PatternsShell({
  navItems,
  accentColor = '#F5C24B',
  onPressMessages,
  messagesUnreadCount = 0,
  panelType = 'lab',
  brandName,
  brandSubtitle,
  newOrderHref,
  onSearchSubmit,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useAuthStore();
  const permStore = usePermissionStore();

  // Filter nav items by RBAC permissions
  const filteredNavItems = useMemo(() => {
    if (!permStore.loaded) return navItems; // show all while loading
    return navItems.filter(item => {
      if (item.requiresPermission) {
        return permStore.permissions.has(item.requiresPermission);
      }
      if (item.requiresAnyPermission) {
        return item.requiresAnyPermission.some(p => permStore.permissions.has(p));
      }
      return true; // no permission required
    });
  }, [navItems, permStore.loaded, permStore.permissions]);
  const [collapsed, setCollapsed] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const pageTitle = usePageTitleStore(s => s.title);
  const pageSubtitle = usePageTitleStore(s => s.subtitle);
  const pageActions = usePageTitleStore(s => s.actions);

  useEffect(() => { injectPatternsScrollbar(); }, []);

  const brand = useMemo(() => {
    if (brandName) return { name: brandName, sub: brandSubtitle ?? '' };
    if (panelType === 'lab')          return { name: 'Aydın Lab',     sub: 'Laboratuvar' };
    if (panelType === 'clinic_admin') return { name: profile?.clinic_name ?? 'Klinik', sub: 'Klinik Yönetimi' };
    if (panelType === 'doctor')       return { name: profile?.clinic_name ?? 'Hekim',  sub: 'Hekim Paneli' };
    if (panelType === 'admin')        return { name: 'Admin',         sub: 'Yönetim' };
    return { name: 'Panel', sub: '' };
  }, [panelType, profile, brandName, brandSubtitle]);

  // expo-router usePathname() route group prefix'i çıkarır: /(lab)/orders → /orders
  const normalizeHref = (href: string) => href.replace(/^\/\([^)]+\)/, '') || '/';

  // Sipariş detay, fatura detay gibi alt rotalar → ana menü öğesini aktif göster
  const RELATED_ROUTES: Record<string, string[]> = {
    'all-orders': ['/order/'],
    'orders':     ['/order/'],
    'clinics':    ['/clinic/'],
    'invoices':   ['/invoice/'],
    'finance':    ['/invoice/', '/expenses', '/checks', '/cash', '/finance-report'],
    'employees':  ['/employee/'],
    'doctors':    ['/doctor/'],
  };

  const isActive = (item: PatternsNavItem) => {
    if (!pathname) return false;
    const h = normalizeHref(item.href);

    // Tam eşleşme veya prefix eşleşmesi
    if (item.matchPrefix && pathname.startsWith(h)) return true;
    if (pathname === h || pathname === h + '/') return true;

    // Alt rota eşleştirmesi: /order/123 açıkken "Siparişler" aktif olsun
    const lastSeg = h.split('/').filter(Boolean).pop() ?? '';
    const related = RELATED_ROUTES[lastSeg];
    if (related) {
      return related.some(r => pathname.startsWith(r));
    }
    return false;
  };

  // Fallback: aktif nav item label'ı (store'da title yoksa veya cleanup race condition'ında)
  const activeItem = filteredNavItems.find(n => isActive(n));
  const effectiveTitle = pageTitle ?? activeItem?.label ?? null;

  const initials = (profile?.full_name ?? 'KU').trim()
    .split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const handleLogout = async () => {
    setProfileMenuOpen(false);
    await supabase.auth.signOut();
    router.replace('/(auth)/login' as any);
  };

  return (
    <View className="flex-1 flex-row bg-cream-page p-3 gap-3">
      {/* ═════════════ SIDEBAR (card) + edge toggle ═════════════ */}
      <View style={{ position: 'relative', alignSelf: 'stretch', overflow: 'visible' }}>
        {collapsed ? (
          <CollapsedSidebar
            navItems={filteredNavItems}
            isActive={isActive}
            accentColor={accentColor}
            onExpand={() => setCollapsed(false)}
            onPressMessages={onPressMessages}
            messagesUnreadCount={messagesUnreadCount}
            newOrderHref={newOrderHref}
            router={router}
            brand={brand}
          />
        ) : (
          <ExpandedSidebar
            navItems={filteredNavItems}
            isActive={isActive}
            accentColor={accentColor}
            brand={brand}
            onCollapse={() => setCollapsed(true)}
            onPressMessages={onPressMessages}
            messagesUnreadCount={messagesUnreadCount}
            newOrderHref={newOrderHref}
            router={router}
          />
        )}
        {/* ── Edge toggle — sits on the right border, lower area ── */}
        <Pressable
          onPress={() => setCollapsed(c => !c)}
          style={{
            position: 'absolute',
            right: -10,
            bottom: 48,
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: accentColor,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            // @ts-ignore web
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            cursor: 'pointer',
          }}
        >
          {collapsed
            ? <ChevronRight size={14} color="#FFFFFF" strokeWidth={2} />
            : <ChevronLeft size={14} color="#FFFFFF" strokeWidth={2} />
          }
        </Pressable>
      </View>

      {/* ═════════════ RIGHT COLUMN: toolbar + content ═════════════ */}
      <View style={{ flex: 1, borderRadius: 20, overflow: 'hidden' }}>
       <ScrollView
         className="flex-1 patterns-scroll"
         contentContainerStyle={{ flexGrow: 1 }}
         showsVerticalScrollIndicator={false}
         stickyHeaderIndices={[0]}
       >
        {/* TOP BAR — page title (left) + toolbar card (right) — sticky */}
        <View className="flex-row items-center bg-cream-page" style={{ zIndex: 100, paddingRight: 10, paddingTop: 12, paddingBottom: 12 }}>
          {/* Page title */}
          <View className="flex-1" style={{ paddingLeft: 10 }}>
            {effectiveTitle ? (
              <View className="gap-0.5">
                <Text
                  className="text-ink-900"
                  numberOfLines={1}
                  style={{
                    fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
                    fontWeight: '300',
                    fontSize: 28,
                    letterSpacing: -1.12,
                  }}
                >
                  {effectiveTitle}
                </Text>
                {pageSubtitle ? (
                  <View className="flex-row items-center gap-1">
                    {pageSubtitle.split('›').map((part, idx, arr) => {
                      const trimmed = part.trim();
                      const isLast = idx === arr.length - 1;
                      if (!isLast) {
                        return (
                          <React.Fragment key={idx}>
                            <Pressable onPress={() => router.back()}>
                              <Text className="text-[13px] text-ink-400" style={{ textDecorationLine: 'underline' }}>{trimmed}</Text>
                            </Pressable>
                            <Text className="text-[11px] text-ink-300">›</Text>
                          </React.Fragment>
                        );
                      }
                      return <Text key={idx} className="text-[13px] text-ink-400">{trimmed}</Text>;
                    })}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Toolbar card */}
          <View
            className="flex-row items-center gap-1 pl-1.5 pr-1.5 py-1.5 rounded-full bg-white border border-black/[0.05]"
          style={{
            zIndex: 40,
            // @ts-ignore web shadow
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          }}
        >
          {/* Search */}
          <View
            className="flex-row items-center gap-2 px-3 py-1.5 rounded-full bg-cream-panel"
            style={{ width: 220 }}
            {...(Platform.OS === 'web' ? { title: 'Arama — ⌘K ile hızlı aç' } : {})}
          >
            <Search size={13} color="#9A9A9A" strokeWidth={1.8} />
            <TextInput
              value={searchQ}
              onChangeText={setSearchQ}
              placeholder="Ara..."
              placeholderTextColor="#9A9A9A"
              onSubmitEditing={() => onSearchSubmit?.(searchQ)}
              style={{
                flex: 1, fontSize: 12, color: '#0A0A0A',
                // @ts-ignore web outline reset
                outlineWidth: 0,
              }}
            />
          </View>

          {/* Bell */}
          <Pressable className="w-8 h-8 rounded-full items-center justify-center hover:bg-cream-panel">
            <Bell size={14} color="#2C2C2C" strokeWidth={1.8} />
          </Pressable>

          {/* Messages */}
          {onPressMessages && (
            <Pressable
              onPress={onPressMessages}
              className="w-8 h-8 rounded-full items-center justify-center hover:bg-cream-panel relative"
            >
              <MessageSquare size={14} color="#2C2C2C" strokeWidth={1.8} />
              {messagesUnreadCount > 0 && (
                <View
                  className="absolute min-w-[14px] h-[14px] px-1 rounded-full border-2 border-white items-center justify-center"
                  style={{ top: 2, right: 2, backgroundColor: '#9C2E2E' }}
                >
                  <Text className="text-[8px] font-bold text-white">{messagesUnreadCount}</Text>
                </View>
              )}
            </Pressable>
          )}

          {/* Profile */}
          <View className="relative">
            <Pressable
              onPress={() => setProfileMenuOpen(v => !v)}
              className="flex-row items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full"
            >
              {profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  className="w-7 h-7 rounded-full"
                  style={{ backgroundColor: accentColor }}
                />
              ) : (
                <View
                  className="w-7 h-7 rounded-full items-center justify-center"
                  style={{ backgroundColor: accentColor }}
                >
                  <Text className="text-[11px] font-semibold" style={{ color: '#FFFFFF' }}>{initials}</Text>
                </View>
              )}
              <Text className="text-[12px] font-medium text-ink-900" numberOfLines={1}>
                {(profile?.full_name ?? 'Kullanıcı').split(' ')[0]}
              </Text>
            </Pressable>

            {profileMenuOpen && (
              <>
                <Pressable
                  onPress={() => setProfileMenuOpen(false)}
                  style={{ position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
                />
                <View
                  className="absolute bg-white rounded-2xl border border-black/[0.06] overflow-hidden"
                  style={{
                    top: 40, right: 0, width: 220, zIndex: 100,
                    // @ts-ignore web shadow
                    boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
                  }}
                >
                  <View className="px-4 py-3 border-b border-black/[0.06] flex-row items-center gap-2.5">
                    {profile?.avatar_url ? (
                      <Image source={{ uri: profile.avatar_url }} className="w-9 h-9 rounded-full" style={{ backgroundColor: accentColor }} />
                    ) : (
                      <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: accentColor }}>
                        <Text className="text-[13px] font-semibold text-white">{initials}</Text>
                      </View>
                    )}
                    <View className="flex-1">
                      <Text numberOfLines={1} className="text-[13px] font-semibold text-ink-900">
                        {profile?.full_name ?? 'Kullanıcı'}
                      </Text>
                      <Text className="text-[11px] text-ink-400">
                        {panelTypeLabel(profile?.user_type)}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => {
                      setProfileMenuOpen(false);
                      router.push('/settings' as any);
                    }}
                    className="px-4 py-2.5 flex-row items-center gap-2.5"
                  >
                    <UserCog size={14} color="#2C2C2C" strokeWidth={1.8} />
                    <Text className="text-[13px] text-ink-700">Profil</Text>
                  </Pressable>
                  <View className="h-px bg-black/[0.06]" />
                  <Pressable
                    onPress={handleLogout}
                    className="px-4 py-2.5 flex-row items-center gap-2.5"
                  >
                    <LogOut size={14} color="#9C2E2E" strokeWidth={1.8} />
                    <Text className="text-[13px]" style={{ color: '#9C2E2E' }}>Çıkış yap</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
        </View>

        {/* CONTENT */}
        <Slot />
       </ScrollView>
      </View>
    </View>
  );
}

// ─── Animated New Order CTA — shimmer glow + hover scale + icon pulse ──
function AnimatedNewOrderCTA({ onPress, accentColor, expanded }: {
  onPress: () => void; accentColor: string; expanded: boolean;
}) {
  const glowAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const iconAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Shimmer glow — subtle brightness pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();

    // Icon rotate pulse — periodic gentle twist
    Animated.loop(
      Animated.sequence([
        Animated.delay(3000),
        Animated.timing(iconAnim, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(iconAnim, { toValue: 0, duration: 300, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, [glowAnim, iconAnim]);

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.25] });
  const iconRotate = iconAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  const handleHoverIn = () => {
    Animated.spring(scaleAnim, { toValue: 1.04, friction: 8, tension: 200, useNativeDriver: true }).start();
  };
  const handleHoverOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 200, useNativeDriver: true }).start();
  };

  if (expanded) {
    return (
      <Pressable onPress={onPress} onHoverIn={handleHoverIn} onHoverOut={handleHoverOut}
        style={{ marginBottom: 16 }}
        {...(Platform.OS === 'web' ? { title: 'Yeni sipariş oluştur (⌘N)' } : {})}
      >
        <Animated.View style={{
          paddingHorizontal: 14, paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: accentColor,
          flexDirection: 'row', alignItems: 'center', gap: 8,
          overflow: 'hidden',
          transform: [{ scale: scaleAnim }],
        }}>
          {/* Shimmer glow overlay */}
          <Animated.View style={{
            position: 'absolute', top: -10, right: -10,
            width: 60, height: 60, borderRadius: 30,
            backgroundColor: '#FFFFFF',
            opacity: glowOpacity,
          }} pointerEvents="none" />
          <Animated.View style={{ transform: [{ rotate: iconRotate }] }}>
            <PlusCircle size={14} color="#FFFFFF" strokeWidth={1.8} />
          </Animated.View>
          <Text className="text-[13px] font-semibold flex-1" style={{ color: '#FFFFFF' }}>Yeni sipariş</Text>
        </Animated.View>
      </Pressable>
    );
  }

  // Collapsed — icon-only
  return (
    <Pressable onPress={onPress} onHoverIn={handleHoverIn} onHoverOut={handleHoverOut}
      style={{ marginBottom: 12 }}
    >
      <Animated.View style={{
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: accentColor,
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        transform: [{ scale: scaleAnim }],
      }}>
        <Animated.View style={{
          position: 'absolute', top: -6, right: -6,
          width: 28, height: 28, borderRadius: 14,
          backgroundColor: '#FFFFFF',
          opacity: glowOpacity,
        }} pointerEvents="none" />
        <Animated.View style={{ transform: [{ rotate: iconRotate }] }}>
          <PlusCircle size={16} color="#FFFFFF" strokeWidth={2} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

// ─── Expanded sidebar ────────────────────────────────────────────────
function ExpandedSidebar({
  navItems, isActive, accentColor, brand,
  onCollapse, onPressMessages, messagesUnreadCount, newOrderHref, router,
}: any) {
  return (
    <View
      className="bg-white rounded-[20px] p-3.5 pt-5 border border-black/[0.05]"
      style={{
        width: 240,
        flex: 1,
        // @ts-ignore web shadow
        boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
      }}
    >
      {/* Logo */}
      <View className="flex-row items-center gap-2.5 px-2.5 pb-5">
        <View className="w-9 h-9 rounded-[10px] bg-ink-900 items-center justify-center">
          <Text className="text-[14px] font-bold" style={{ color: accentColor }}>
            {brand.name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View className="flex-1">
          <Text numberOfLines={1} className="text-[14px] font-semibold text-ink-900" style={{ letterSpacing: -0.28 }}>
            {brand.name}
          </Text>
          {brand.sub ? <Text numberOfLines={1} className="text-[10px] text-ink-400">{brand.sub}</Text> : null}
        </View>
      </View>

      {/* New order CTA — animated */}
      {newOrderHref ? (
        <AnimatedNewOrderCTA
          onPress={() => router.push(newOrderHref)}
          accentColor={accentColor}
          expanded
        />
      ) : null}

      {/* Section label */}
      <Text className="text-[10px] font-semibold uppercase text-ink-400 px-2.5 pt-1 pb-2" style={{ letterSpacing: 1 }}>
        Çalışma alanı
      </Text>

      {/* Nav items */}
      <ScrollView className="flex-1" contentContainerStyle={{ gap: 2 }} showsVerticalScrollIndicator={false}>
        {navItems.map((item: PatternsNavItem, i: number) => {
          const active = isActive(item);
          const IconCmp = resolveIcon(item.iconName);
          return (
            <Pressable
              key={i}
              onPress={() => item.onPress ? item.onPress() : router.push(item.href)}
              className="px-3 py-2.5 rounded-[10px] flex-row items-center gap-2.5 relative"
              style={active ? { backgroundColor: '#FBFAF6' } : undefined}
            >
              {active && (
                <View
                  className="absolute left-0 rounded"
                  style={{ top: 8, bottom: 8, width: 2.5, backgroundColor: accentColor }}
                />
              )}
              <IconCmp size={15} color={active ? '#0A0A0A' : '#2C2C2C'} strokeWidth={1.8} />
              <Text
                className={`flex-1 text-[13px] ${active ? 'font-medium text-ink-900' : 'text-ink-700'}`}
              >
                {item.label}
              </Text>
              {item.badgeCount != null && item.badgeCount > 0 && (
                <View
                  className="px-1.5 py-px rounded-full"
                  style={{ backgroundColor: active ? '#0A0A0A' : 'rgba(0,0,0,0.06)' }}
                >
                  <Text
                    className="text-[10px] font-semibold"
                    style={{ color: active ? accentColor : '#6B6B6B' }}
                  >{item.badgeCount}</Text>
                </View>
              )}
            </Pressable>
          );
        })}

        {onPressMessages && (
          <Pressable
            onPress={onPressMessages}
            className="px-3 py-2.5 rounded-[10px] flex-row items-center gap-2.5"
          >
            <MessageSquare size={15} color="#2C2C2C" strokeWidth={1.8} />
            <Text className="flex-1 text-[13px] text-ink-700">Mesajlar</Text>
            {messagesUnreadCount > 0 && (
              <View
                className="min-w-[20px] px-1.5 py-px rounded-full items-center"
                style={{ backgroundColor: '#9C2E2E' }}
              >
                <Text className="text-[10px] font-semibold text-white">{messagesUnreadCount}</Text>
              </View>
            )}
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Collapsed sidebar ───────────────────────────────────────────────
function CollapsedSidebar({
  navItems, isActive, accentColor, brand,
  onExpand, onPressMessages, messagesUnreadCount, newOrderHref, router,
}: any) {
  return (
    <View
      className="bg-white rounded-[20px] py-4 items-center border border-black/[0.05]"
      style={{
        width: 64,
        flex: 1,
        // @ts-ignore web shadow
        boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
      }}
    >
      {/* Logo */}
      <View className="w-10 h-10 rounded-[11px] bg-ink-900 items-center justify-center mb-3.5">
        <Text className="text-[15px] font-bold" style={{ color: accentColor }}>
          {brand?.name?.slice(0, 1)?.toUpperCase() ?? 'P'}
        </Text>
      </View>

      {newOrderHref && (
        <AnimatedNewOrderCTA
          onPress={() => router.push(newOrderHref)}
          accentColor={accentColor}
          expanded={false}
        />
      )}
      <View className="w-7 h-px bg-black/[0.08] mb-3" />

      <ScrollView contentContainerStyle={{ gap: 4, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
        {navItems.map((item: PatternsNavItem, i: number) => {
          const active = isActive(item);
          const IconCmp = resolveIcon(item.iconName);
          return (
            <Pressable
              key={i}
              onPress={() => item.onPress ? item.onPress() : router.push(item.href)}
              className="w-10 h-10 rounded-[10px] items-center justify-center relative"
              style={active ? { backgroundColor: '#FBFAF6' } : undefined}
            >
              {active && (
                <View
                  className="absolute left-0 rounded"
                  style={{ top: 8, bottom: 8, width: 2.5, backgroundColor: accentColor }}
                />
              )}
              <IconCmp size={16} color={active ? '#0A0A0A' : '#2C2C2C'} strokeWidth={1.8} />
              {item.badgeCount != null && item.badgeCount > 0 && (
                <View
                  className="absolute min-w-[16px] h-4 px-1 rounded-full border-2 border-white items-center justify-center"
                  style={{ top: -2, right: -2, backgroundColor: '#9C2E2E' }}
                >
                  <Text className="text-[9px] font-semibold text-white">{item.badgeCount}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
        {onPressMessages && (
          <Pressable
            onPress={onPressMessages}
            className="w-10 h-10 rounded-[10px] items-center justify-center relative"
          >
            <MessageSquare size={16} color="#2C2C2C" strokeWidth={1.8} />
            {messagesUnreadCount > 0 && (
              <View
                className="absolute min-w-[16px] h-4 px-1 rounded-full border-2 border-white items-center justify-center"
                style={{ top: -2, right: -2, backgroundColor: '#9C2E2E' }}
              >
                <Text className="text-[9px] font-semibold text-white">{messagesUnreadCount}</Text>
              </View>
            )}
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function panelTypeLabel(type?: string) {
  switch (type) {
    case 'lab':          return 'Laboratuvar';
    case 'clinic_admin': return 'Klinik Müdürü';
    case 'doctor':       return 'Hekim';
    case 'admin':        return 'Admin';
    case 'station':      return 'İstasyon';
    default:             return 'Kullanıcı';
  }
}
