/**
 * PatternsShell — Desktop shell with patterns design language sidebar
 *
 *   • Card-styled white sidebar (expanded + collapsed) on krem page bg
 *   • Top-right header bar: search + bell + profile/logout (uygulama geneli)
 *   • Renders <Slot /> for child route content.
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { firstName as displayFirstName } from '../../core/util/personName';
import { safeBack } from '../util/safeBack';
import { View, Text, ScrollView, Pressable, TextInput, Platform, useWindowDimensions, Animated, Easing, Image, Linking } from 'react-native';
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
  DollarSign, MessageSquare, MessagesSquare, Search, Bell, ChevronLeft, ChevronRight,
  LogOut, CheckSquare, CheckCircle, BarChart3, Calendar, Boxes, Wallet,
  Building2, Landmark, UserCog, Briefcase, Box, ShieldCheck, BadgeCheck, ListTodo,
  Camera, ScanLine, Clipboard, Wrench, Tag, ChevronDown, Inbox,
  ListCheck, Scooter, TrendingUp,
  Monitor, Sun, Moon,
} from '../ui/icons';
import { SupportIcon } from '../ui/SupportIcon';
import { WhatsAppGlyph } from '../ui/WhatsAppGlyph';
import { Tooth, Crown, Implant, ZirconiaDisc, DentalArch } from '../ui/dentalIcons';
import { useAuthStore } from '../store/authStore';
import { useActiveLabStore } from '../store/activeLabStore';
import { usePermissionStore } from '../store/permissionStore';
import { usePageTitleStore } from '../store/pageTitleStore';
import { supabase } from '../api/supabase';
import { shortClinicName } from '../utils/clinicName';
import { useLabBrandStore } from '../store/labBrandStore';
import { SimanWordmark } from '../ui/SimanWordmark';
import { LabFlowLogo } from '../ui/LabFlowLogo';
import { NotificationPopover } from '../ui/NotificationPopover';
import { useNotifications } from '../store/notificationsStore';
import { openSupport } from '../store/supportStore';
import { MOBILE_PANEL_THEMES, type MobilePanel } from '../theme/mobileDesignTokens';
import { useThemeModeStore } from '../store/themeModeStore';
import { autoT } from '../i18n/autoTranslate';
import { useHeroSurface, useAccentTones } from '../ui/HeroGlow';
import { isRTL } from '../i18n';
import { amIPlatformAdmin, myLimits } from '../../modules/platform/api';

// ── Types (compatible with DesktopShell's NavItem) ────────────────────
export interface PatternsNavItem {
  label: string;
  emoji?: string;
  href: string;
  matchPrefix?: boolean;
  badge?: boolean;
  badgeCount?: number;
  /** Badge zemini özelleştir (ör. kırmızı acil rozeti); verilmezse panel tonu. */
  badgeColor?: string;
  iconName?: string;
  iconSet?: string;
  subtitle?: string;
  sectionLabel?: string;
  onPress?: () => void;
  /** If set, this nav item is hidden unless the user has this permission */
  requiresPermission?: string;
  /** If set, this nav item is hidden unless the user has ANY of these permissions */
  requiresAnyPermission?: string[];
  /** Alt menü — set edilirse bu öğe açılır/kapanır bir grup butonu olur */
  children?: PatternsNavItem[];
}

interface Props {
  navItems: PatternsNavItem[];
  accentColor?: string;
  onPressMessages?: () => void;
  messagesUnreadCount?: number;
  /**
   * Sidebar'ın altına otomatik "Mesajlar" satırı eklenmesini engeller.
   * Top-right header'daki mesaj ikonu yine `onPressMessages` ile çalışır.
   * Consumer kendi nav item olarak Mesajlar tanımladıysa `true` ver.
   */
  hideSidebarMessages?: boolean;
  panelType?: 'lab' | 'clinic_admin' | 'doctor' | 'admin' | 'station';
  brandName?: string;
  brandSubtitle?: string;
  newOrderHref?: string;
  onSearchSubmit?: (query: string) => void;
  /**
   * İlk-giriş coach-mark turu hedefleri (opsiyonel — yalnız hekim/klinik geçer, diğer
   * paneller undefined → no-op). Masaüstü sidebar öğelerine spotlight ref'i bağlar.
   */
  tourRefs?: { newOrder?: (n: any) => void; orders?: (n: any) => void; messages?: (n: any) => void };
  /** Sidebar'da hangi nav item'ının "Siparişler" hedefi olduğunu belirler (href eşleşmesi). */
  tourOrdersHref?: string;
}

/**
 * WhatsApp marka işareti — Lucide marka ikonu içermez.
 * Glifin kenar payı yok (path 0..24'ü doldurur), Lucide ikonlarında 1px pay +
 * stroke var; aynı `size` ile yan yana konunca iri duruyordu, %88'e indirildi.
 */
const WhatsAppMark: React.ComponentType<any> = ({ size = 16, color }: { size?: number; color?: string }) => (
  <WhatsAppGlyph size={Math.round(size * 0.88)} color={color} />
);

// Lucide icon resolver — kenar çubuğundaki iconName'leri kapsar.
//
// DİKKAT: Bu harita AppIcon'unkinden AYRI. Buraya eklenmeyen bir isim sessizce
// DEFAULT_ICON'a (Grid) düşer — ekranda ızgara görürsen sebebi budur, ikon
// bozuk değildir. Yeni bir iconName kullanmadan önce buraya da ekle.
const ICONS: Record<string, React.ComponentType<any>> = {
  whatsapp:         WhatsAppMark,
  tooth:            Tooth,
  crown:            Crown,
  implant:          Implant,
  'zirconia-disc':  ZirconiaDisc,
  'dental-arch':    DentalArch,
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
  'message-square':  MessageSquare,
  'messages-square': MessagesSquare,
  search:           Search,
  bell:             Bell,
  logout:           LogOut,
  'log-out':        LogOut,
  'help-circle':    SupportIcon,
  'check-square':   CheckSquare,
  'check-circle':   CheckCircle,
  'bar-chart-3':    BarChart3,
  calendar:         Calendar,
  boxes:            Boxes,
  wallet:           Wallet,
  'building-2':     Building2,
  building2:        Building2,
  building:         Building2,
  landmark:         Landmark,
  briefcase:        Briefcase,
  box:              Box,
  'shield-check':   ShieldCheck,
  'badge-check':    BadgeCheck,
  'list-todo':      ListTodo,
  'list-check':     ListCheck,
  scooter:          Scooter,
  camera:           Camera,
  'scan-line':      ScanLine,
  clipboard:        Clipboard,
  wrench:           Wrench,
  tag:              Tag,
  inbox:            Inbox,
  'calendar-days':  Calendar,
  'trending-up':    TrendingUp,
};

const DEFAULT_ICON = Grid;

/**
 * Lab web sitesi bağlantısı — kenar çubuğundaki logo tıklanınca açılır.
 *
 * Kullanıcı ayarlara "nexadentlab.com" gibi protokolsüz yazabiliyor; normalize
 * etmezsek relatif yol sayılır ve uygulama içinde 404'e gider.
 * Web'de yeni sekme + `noopener` (açılan sayfa window.opener üzerinden bize
 * erişmesin), native'de sistem tarayıcısı.
 */
export function normalizeSiteUrl(raw?: string | null): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function openLabSite(raw?: string | null) {
  const url = normalizeSiteUrl(raw);
  if (!url) return;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    Linking.openURL(url).catch(() => {});
  }
}

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
  hideSidebarMessages = false,
  messagesUnreadCount = 0,
  panelType = 'lab',
  brandName,
  brandSubtitle,
  newOrderHref,
  onSearchSubmit,
  tourRefs,
  tourOrdersHref,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useAuthStore();
  const permStore = usePermissionStore();

  // Platform konsolu dışındaki bir panel aktif → platform bağlam bayrağını temizle
  // (aksi halde çift-rol admin lab paneline geçse bile refresh onu platforma geri atardı).
  useEffect(() => {
    try { if (typeof window !== 'undefined') window.localStorage?.removeItem('nx_panel'); } catch {}
  }, []);

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
  const rtl = isRTL();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  useEffect(() => { amIPlatformAdmin().then(setIsPlatformAdmin).catch(() => {}); }, []);
  // Platform duyuruları — aktif olanlar üstte banner
  const [announcements, setAnnouncements] = useState<Array<{ id: number; title: string; body: string | null; level: string }>>([]);
  const [dismissedAnn, setDismissedAnn] = useState<number[]>([]);
  useEffect(() => { (async () => { try { const { data } = await supabase.rpc('active_announcements'); setAnnouncements((data as any) ?? []); } catch { /* yoksay */ } })(); }, []);
  // Limit aşım uyarısı (bloklamaz — enforcement altyapısı)
  const [overLimits, setOverLimits] = useState<string[]>([]);
  useEffect(() => { (async () => { try {
    const { limits, usage } = await myLimits();
    const labels: Record<string, string> = { users: 'kullanıcı', orders_month: 'aylık sipariş' };
    const over = Object.keys(limits || {}).filter((k) => Number(limits[k]) > 0 && Number(usage?.[k] || 0) > Number(limits[k])).map((k) => labels[k] || k);
    setOverLimits(over);
  } catch { /* yoksay */ } })(); }, []);
  const [searchQ, setSearchQ] = useState('');
  const pageTitle = usePageTitleStore(s => s.title);
  const pageSubtitle = usePageTitleStore(s => s.subtitle);
  const pageActions = usePageTitleStore(s => s.actions);

  useEffect(() => { injectPatternsScrollbar(); }, []);

  // Lab marka ayarı değişince (GeneralSection) sidebar'ı tazele
  const labBrandVersion = useLabBrandStore(s => s.version);

  // Lab adını DB'den çek (profile.lab_id → labs.name)
  const [labName, setLabName] = useState<string | null>(null);
  const [labLogo, setLabLogo] = useState<string | null>(null);
  const [brandMode, setBrandMode] = useState<'logo' | 'logo_text'>('logo_text');
  const [brandScale, setBrandScale] = useState(1);
  /** labs.website — doluysa kenar çubuğundaki logo tıklanabilir olur. */
  const [labWebsite, setLabWebsite] = useState<string | null>(null);
  useEffect(() => {
    const labId = (profile as any)?.lab_id;
    if (!labId || (panelType !== 'lab' && panelType !== 'admin' && panelType !== 'station')) {
      setLabName(null); setLabLogo(null); setLabWebsite(null);
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase.from('labs').select('name, logo_url, website, sidebar_brand_mode, sidebar_logo_scale').eq('id', labId).maybeSingle();
      if (alive) {
        setLabName((data as any)?.name ?? null); setLabLogo((data as any)?.logo_url ?? null);
        setLabWebsite((data as any)?.website ?? null);
        setBrandMode(((data as any)?.sidebar_brand_mode === 'logo' ? 'logo' : 'logo_text'));
        setBrandScale(Number((data as any)?.sidebar_logo_scale) || 1);
      }
    })();
    return () => { alive = false; };
  }, [(profile as any)?.lab_id, panelType, labBrandVersion]);

  // Klinik/hekim panelinde klinik logosu + bağlı olunan lab (white-label rozeti)
  const [clinicLogo, setClinicLogo] = useState<string | null>(null);
  const [connectedLab, setConnectedLab] = useState<{ name: string; logo: string | null } | null>(null);
  const activeLabMembership = useActiveLabStore((s) => s.active); // çoklu-lab: marka aktif lab'a göre
  useEffect(() => {
    if (panelType !== 'clinic_admin' && panelType !== 'doctor') { setClinicLogo(null); setConnectedLab(null); return; }
    // NOT: klinik/hekim panelinde de markadaki logo LAB'a ait (white-label),
    // dolayısıyla web sitesi bağlantısı burada da lab'ın sitesine gider.
    let alive = true;
    (async () => {
      const { data } = await supabase.from('clinics').select('logo_url, lab_id').limit(1).maybeSingle();
      if (!alive) return;
      setClinicLogo((data as any)?.logo_url ?? null);
      // Aktif lab (çoklu-lab) varsa markayı ondan çöz; yoksa klinik satırının lab_id'si (tek-lab).
      const labId = activeLabMembership?.lab_id ?? (data as any)?.lab_id;
      if (labId) {
        // NOT: klinik/hekim kullanıcısı labs tablosunu RLS ile okuyamaz
        // (policy: id = get_my_lab_id()). Bağlı lab markasını SECURITY DEFINER
        // RPC ile al (yalnız marka alanları, bağlılık doğrulanır).
        const { data: lab } = await supabase.rpc('get_lab_brand', { p_lab_id: labId }).maybeSingle();
        if (alive && lab) { setConnectedLab({ name: (lab as any).name, logo: (lab as any).logo_url ?? null }); setLabWebsite((lab as any).website ?? null); setBrandMode(((lab as any).sidebar_brand_mode === 'logo' ? 'logo' : 'logo_text')); setBrandScale(Number((lab as any).sidebar_logo_scale) || 1); }
      } else { setConnectedLab(null); setLabWebsite(null); }
    })();
    return () => { alive = false; };
  }, [panelType, (profile as any)?.id, labBrandVersion, activeLabMembership?.lab_id]);

  // Tarayıcı sekme başlığı: "Siman | {Laboratuvar adı}"
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const lab = labName ?? connectedLab?.name ?? null;
    document.title = lab ? `Siman | ${lab}` : 'Siman';
  }, [labName, connectedLab]);

  const brand = useMemo(() => {
    const shortClinic = shortClinicName;  // klinik adı eklerini at (sidebar'a sığsın)
    if (brandName) return { name: brandName, sub: brandSubtitle ?? '' };
    if (panelType === 'lab')          return { name: labName ?? 'Laboratuvar', sub: 'Laboratuvar', logo: labLogo, website: labWebsite };
    // White-label: klinik/hekim panelinde de asıl sahip (lab) markası öne çıkar; klinik kimliği avatarda.
    if (panelType === 'clinic_admin') return { name: shortClinic(connectedLab?.name) || shortClinic(profile?.clinic_name) || 'Klinik', sub: 'Diş Laboratuvarı', logo: connectedLab?.logo ?? null, website: labWebsite };
    if (panelType === 'doctor')       return { name: shortClinic(connectedLab?.name) || shortClinic(profile?.clinic_name) || 'Hekim',  sub: 'Diş Laboratuvarı', logo: connectedLab?.logo ?? null, website: labWebsite };
    if (panelType === 'admin')        return { name: labName ?? 'Admin',       sub: 'Yönetim', logo: labLogo, website: labWebsite };
    if (panelType === 'station')      return { name: profile?.full_name ?? 'Teknisyen', sub: labName ?? 'İstasyon', logo: labLogo, website: labWebsite };
    return { name: 'Panel', sub: '' };
  }, [panelType, profile, brandName, brandSubtitle, labName, labLogo, labWebsite, clinicLogo, connectedLab]);

  // Panel-spesifik zemin paleti — mobile MOBILE_PANEL_THEMES.bgPage ile aynı
  // Dark mode'da koyu zemin.
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const themeMode = useThemeModeStore(s => s.mode);
  const setThemeMode = useThemeModeStore(s => s.setMode);
  // Accent butonlar (yeni sipariş / daralt): koyu temada lacivert gradyan yüzey.
  const accentSurface = useHeroSurface(accentColor);
  // Tema seçicideki dolu daire — koyu temada accent'in derin karşılığı.
  const { fill: accentFill } = useAccentTones(accentColor);
  const palette = useMemo(() => {
    if (isDark) {
      return {
        pageBg:  '#0E0E0E',   // dark canvas
        panelBg: '#1B1916',   // elevated dark surface (sidebar/panel için)
      };
    }
    // panelType → MobilePanel anahtarı
    const mobilePanel: MobilePanel =
      panelType === 'admin'        ? 'exec'
      : panelType === 'clinic_admin' ? 'klinik'
      : panelType === 'doctor'       ? 'doctor'
      : panelType === 'station'      ? 'teknisyen'
      : 'lab';
    const theme = MOBILE_PANEL_THEMES[mobilePanel];
    return {
      pageBg:  theme.bgPage,
      panelBg: theme.surface, // beyaz — sidebar/kart bg
    };
  }, [panelType, isDark]);

  // Shell dark-token seti — sabit açık renkleri tek yerden çevir (toolbar/nav/başlık/profil).
  const SC = isDark ? {
    surface:   '#1B1916',   // toolbar / kart / profil chip
    surfaceEl: '#221F1B',   // dropdown / popover
    ink:       '#F7F2E9',
    ink2:      'rgba(247,242,233,0.72)',
    ink3:      'rgba(247,242,233,0.45)',
    iconMuted: '#B8B2A6',
    hairline:  'rgba(255,255,255,0.10)',
    chip:      'rgba(255,255,255,0.06)',
    chipStrong:'rgba(255,255,255,0.14)',
  } : {
    surface:   '#FFFFFF',
    surfaceEl: '#FFFFFF',
    ink:       '#0A0A0A',
    ink2:      '#2C2C2C',
    ink3:      '#9A9A9A',
    iconMuted: '#2C2C2C',
    hairline:  'rgba(0,0,0,0.06)',
    chip:      'rgba(0,0,0,0.06)',
    chipStrong:'rgba(0,0,0,0.10)',
  };

  // Profil menüsü satırı: ayraç çizgisi yerine hover'da yuvarlak vurgu.
  // Menüyü ayıran her hairline görsel gürültü; boşluk + vurgu yeterli.
  const menuRow = ({ hovered, pressed }: any) => ({
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
    height: 34, paddingHorizontal: 10, borderRadius: 10,
    backgroundColor: hovered ? SC.chip : 'transparent',
    opacity: pressed ? 0.7 : 1,
    ...(Platform.OS === 'web'
      ? { cursor: 'pointer', transitionProperty: 'background-color', transitionDuration: '140ms' } as any
      : {}),
  });

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
  // Profil avatarı/adı: klinik/hekimde klinik logosu + klinik adı (white-label)
  const isClinicSide = panelType === 'clinic_admin' || panelType === 'doctor';
  // Çoklu-lab: klinik >1 aktif lab bağlantısına sahipse profil menüsünde "Lab değiştir".
  const _labActiveCount = useActiveLabStore((s) => s.memberships.filter((m) => m.status === 'active').length);
  const canSwitchLab = isClinicSide && _labActiveCount > 1;
  const headerAvatar = (profile as any)?.avatar_url || (isClinicSide ? clinicLogo : null);
  const clinicShort = shortClinicName(profile?.clinic_name);
  const headerName = isClinicSide && clinicShort ? clinicShort : (displayFirstName(profile?.full_name, 'Kullanıcı'));
  const profileTitle = isClinicSide && clinicShort ? clinicShort : (profile?.full_name ?? 'Kullanıcı');

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const handleLogout = async () => {
    setProfileMenuOpen(false);
    await supabase.auth.signOut();
    router.replace('/(auth)/login' as any);
  };

  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: palette.pageBg, padding: 0, gap: 0 }}>
      {/* ═════════════ SIDEBAR (card) + edge toggle ═════════════ */}
      <View style={{ position: 'relative', alignSelf: 'stretch', overflow: 'visible', marginTop: 16, marginBottom: 16, ...(rtl ? { marginRight: 16 } : { marginLeft: 16 }) }}>
        {collapsed ? (
          <CollapsedSidebar
            navItems={filteredNavItems}
            isActive={isActive}
            accentColor={accentColor}
            panelType={panelType}
            palette={palette}
            onExpand={() => setCollapsed(false)}
            onPressMessages={onPressMessages}
            messagesUnreadCount={messagesUnreadCount}
            hideSidebarMessages={hideSidebarMessages}
            newOrderHref={newOrderHref}
            router={router}
            brand={{ ...brand, mode: brandMode, scale: brandScale }}
            tourRefs={tourRefs}
            tourOrdersHref={tourOrdersHref}
          />
        ) : (
          <ExpandedSidebar
            navItems={filteredNavItems}
            isActive={isActive}
            accentColor={accentColor}
            brand={{ ...brand, mode: brandMode, scale: brandScale }}
            panelType={panelType}
            palette={palette}
            onCollapse={() => setCollapsed(true)}
            onPressMessages={onPressMessages}
            messagesUnreadCount={messagesUnreadCount}
            hideSidebarMessages={hideSidebarMessages}
            newOrderHref={newOrderHref}
            router={router}
            tourRefs={tourRefs}
            tourOrdersHref={tourOrdersHref}
          />
        )}
        {/* ── Collapse toggle — sidebar'ın içinde sağ-alt köşede ── */}
        <Pressable
          onPress={() => setCollapsed(c => !c)}
          style={{
            position: 'absolute',
            ...(rtl ? { left: 12 } : { right: 12 }),
            bottom: 12,
            width: 38,
            height: 38,
            borderRadius: 19,
            ...accentSurface,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            // @ts-ignore web
            boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.12)',
            cursor: 'pointer',
          }}
        >
          {(collapsed !== rtl)
            ? <ChevronRight size={18} color="#FFFFFF" strokeWidth={2.2} />
            : <ChevronLeft size={18} color="#FFFFFF" strokeWidth={2.2} />
          }
        </Pressable>
      </View>

      {/* ═════════════ RIGHT COLUMN: toolbar + content ═════════════ */}
      <View style={{ flex: 1, position: 'relative' as any }}>
       <ScrollView
         className="flex-1 patterns-scroll"
         contentContainerStyle={{ flexGrow: 1 }}
         showsVerticalScrollIndicator={false}
       >
        {/* Platform duyuru banner'ları */}
        {announcements.filter((a) => !dismissedAnn.includes(a.id)).map((a) => {
          const tone = a.level === 'critical' ? '#DC2626' : a.level === 'warning' ? '#D97706' : '#2563EB';
          return (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 16, marginTop: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: `${tone}14`, borderWidth: 1, borderColor: `${tone}33` }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tone, marginTop: 6 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#1A1A1A' }}>{a.title}</Text>
                {a.body ? <Text style={{ fontSize: 12.5, color: '#4B5563', marginTop: 2 }}>{a.body}</Text> : null}
              </View>
              <Pressable onPress={() => setDismissedAnn((p) => [...p, a.id])} style={{ padding: 2 }}>
                <Text style={{ fontSize: 16, color: '#9A9A9A', lineHeight: 16 }}>×</Text>
              </Pressable>
            </View>
          );
        })}

        {/* Limit aşım uyarısı */}
        {overLimits.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(217,119,6,0.10)', borderWidth: 1, borderColor: 'rgba(217,119,6,0.3)' }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#D97706' }} />
            <Text style={{ flex: 1, fontSize: 13, color: '#92400E' }}>
              Plan limiti aşıldı: {overLimits.join(', ')}. Yükseltmek için laboratuvar yöneticinizle veya destek ile iletişime geçin.
            </Text>
          </View>
        )}

        {/* TOP BAR — page title (left) only; toolbar absolute-pinned outside ScrollView */}
        {/* Sayfa başlığının sol kenarı, içerik kartlarının sol kenarıyla aynı hizada olmalı.
           Dikey olarak da sağ-üstteki arama/profil pill'i ile aynı hizada (top: 14). */}
        <View className="flex-row items-center" style={{ zIndex: 1, paddingTop: effectiveTitle ? 16 : 0, paddingBottom: 0, paddingHorizontal: 16, backgroundColor: 'transparent', minHeight: effectiveTitle ? 60 : 0 }}>
          {/* Page title */}
          <View className="flex-1" style={{ ...(rtl ? { paddingLeft: 280 } : { paddingRight: 280 }) }}>
            {effectiveTitle ? (
              <View className="gap-0.5">
                <Text
                  className="text-ink-900 dark:text-white/90"
                  numberOfLines={1}
                  style={{
                    fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
                    fontWeight: '300',
                    fontSize: 34,
                    letterSpacing: -1.36,
                    // Farsça glifler (üst nokta + iner kuyruk) Latin'e göre daha uzun;
                    // 38px satır kutusu üst/alttan kırpıyordu → RTL'de gevşet.
                    lineHeight: rtl ? 50 : 38,
                    // RNW her Text'i dir="auto" ile basar; tarayıcı ilk güçlü yön
                    // karakterine bakar. "NEX-2026-0166" gibi Latin başlayan başlıklar
                    // dir=ltr olup RTL düzende SOLA hizalanıyor ve sol-üstteki araç
                    // çubuğunun altına giriyordu. Blok hizasını dile sabitle —
                    // kodun kendisi LTR okunmaya devam eder, yalnız hizası düzelir.
                    ...(rtl ? { textAlign: 'right' as any } : null),
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
                            <Pressable onPress={() => safeBack('/')}>
                              <Text className="text-[13px] text-ink-400 dark:text-white/55" style={{ textDecorationLine: 'underline' }}>{trimmed}</Text>
                            </Pressable>
                            <Text className="text-[11px] text-ink-300 dark:text-white/35">›</Text>
                          </React.Fragment>
                        );
                      }
                      return <Text key={idx} className="text-[13px] text-ink-400 dark:text-white/55">{trimmed}</Text>;
                    })}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Toolbar moved outside ScrollView for sticky behavior — see block below */}
        </View>

        {/* CONTENT */}
        <Slot />
       </ScrollView>

       {/* ═════════════ STICKY TOOLBAR — absolute, başlık satırıyla hizalı ═════════════ */}
       <View
         className="flex-row items-center gap-1 pl-1.5 pr-1.5 py-1.5 rounded-full"
         style={{
           position: 'absolute' as any,
           top: 16,
           ...(rtl ? { left: 16 } : { right: 16 }),
           zIndex: 200,
           backgroundColor: SC.surface,
           borderWidth: isDark ? 1 : 0, borderColor: SC.hairline,
           // @ts-ignore web shadow
           boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.06)',
         }}
       >
          {/* Search */}
          <View
            className="flex-row items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ width: 180, backgroundColor: palette.panelBg }}
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
                flex: 1, fontSize: 12, color: SC.ink,
                // @ts-ignore web outline reset
                outlineWidth: 0,
              }}
            />
          </View>

          {/* Destek — her panelde görünür yardım butonu */}
          <Pressable
            onPress={() => openSupport({ context: { source: 'manual' } })}
            accessibilityLabel="Destek talebi aç"
            className="w-8 h-8 rounded-full items-center justify-center hover:bg-black/5 relative"
            style={({ hovered }: any) => ({ backgroundColor: hovered ? 'rgba(194,65,12,0.10)' : 'transparent' })}
          >
            <SupportIcon size={14} color="#C2410C" strokeWidth={1.8} />
          </Pressable>

          {/* Bell — bildirim */}
          <Pressable
            onPress={() => setNotifOpen(v => !v)}
            className="w-8 h-8 rounded-full items-center justify-center hover:bg-black/5 relative"
          >
            <Bell size={14} color={SC.iconMuted} strokeWidth={1.8} />
            <BellBadge />
          </Pressable>

          {/* Messages */}
          {onPressMessages && (
            <Pressable
              ref={tourRefs?.messages}
              onPress={onPressMessages}
              className="w-8 h-8 rounded-full items-center justify-center hover:bg-black/5 relative"
            >
              <MessageSquare size={14} color={SC.iconMuted} strokeWidth={1.8} />
              {messagesUnreadCount > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -4, end: -4,
                    minWidth: 18, height: 18, paddingHorizontal: 5,
                    borderRadius: 9, borderWidth: 2, borderColor: '#FFFFFF',
                    backgroundColor: '#EF4444',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.2 }}>
                    {messagesUnreadCount > 99 ? '99+' : String(messagesUnreadCount)}
                  </Text>
                </View>
              )}
            </Pressable>
          )}

          {/* Profile — tüm panellerde görünür */}
          <View className="relative">
            <Pressable
              onPress={() => setProfileMenuOpen(v => !v)}
              className="flex-row items-center gap-1.5 ps-0.5 pe-2.5 py-0.5 rounded-full"
            >
              {headerAvatar ? (
                <Image
                  source={{ uri: headerAvatar }}
                  className="w-7 h-7 rounded-full"
                  style={{ backgroundColor: '#FFFFFF' }}
                />
              ) : (
                <View
                  className="w-7 h-7 rounded-full items-center justify-center"
                  style={{ backgroundColor: accentColor }}
                >
                  <Text className="text-[11px] font-semibold" style={{ color: '#FFFFFF' }}>{initials}</Text>
                </View>
              )}
              <Text className="text-[12px] font-medium text-ink-900 dark:text-white/90" numberOfLines={1}>
                {headerName}
              </Text>
            </Pressable>

            {profileMenuOpen && (
              <>
                <Pressable
                  onPress={() => setProfileMenuOpen(false)}
                  style={{ position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
                />
                <View
                  className="absolute"
                  style={{
                    top: 40, ...(rtl ? { left: 0 } : { right: 0 }), width: 236, zIndex: 100,
                    backgroundColor: SC.surfaceEl,
                    borderRadius: 16, borderWidth: 1, borderColor: SC.hairline,
                    padding: 6,
                    // @ts-ignore web shadow
                    boxShadow: isDark ? '0 12px 32px rgba(0,0,0,0.55)' : '0 10px 30px rgba(15,23,42,0.12)',
                  }}
                >
                  {/* Kimlik — ayraç yok, boşlukla ayrılır */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 12 }}>
                    {headerAvatar ? (
                      <Image source={{ uri: headerAvatar }} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFFFFF' }} />
                    ) : (
                      <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#FFFFFF' }}>{initials}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '600', color: SC.ink, letterSpacing: -0.1 }}>
                        {profileTitle}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 11.5, color: SC.ink3, marginTop: 1 }}>
                        {isClinicSide && clinicShort ? `${profile?.full_name ?? ''} · ${panelTypeLabel(profile?.user_type)}` : panelTypeLabel(profile?.user_type)}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={() => { setProfileMenuOpen(false); router.push('/settings' as any); }}
                    style={menuRow}
                  >
                    <UserCog size={15} color={SC.ink3} strokeWidth={1.8} />
                    <Text style={{ fontSize: 13, color: SC.ink2 }}>Profil</Text>
                  </Pressable>
                  {isPlatformAdmin && (
                    <Pressable
                      onPress={() => { setProfileMenuOpen(false); router.push('/(platform)' as any); }}
                      style={menuRow}
                    >
                      <ShieldCheck size={15} color="#4F8DF7" strokeWidth={1.8} />
                      <Text style={{ fontSize: 13, color: SC.ink2 }}>Platform</Text>
                    </Pressable>
                  )}
                  {canSwitchLab && (
                    <Pressable
                      onPress={() => { setProfileMenuOpen(false); router.push('/(auth)/select-lab' as any); }}
                      style={menuRow}
                    >
                      <Building2 size={15} color={SC.ink3} strokeWidth={1.8} />
                      <Text style={{ fontSize: 13, color: SC.ink2 }}>Lab değiştir</Text>
                    </Pressable>
                  )}

                  {/* Tema — ayrı başlıklı blok yerine satır içi kontrol */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingStart: 10, paddingEnd: 4, marginTop: 2, height: 40 }}>
                    <Text style={{ fontSize: 13, color: SC.ink2 }}>{autoT('Tema')}</Text>
                    {/* Toggle: kapsül ray + seçili olan DOLU accent daire.
                        Seçili durum rengin kendisiyle okunur, kelime gerekmez. */}
                    <View
                      accessibilityRole={'radiogroup' as any}
                      style={{
                        flexDirection: 'row', alignItems: 'center',
                        gap: 1, padding: 2, borderRadius: 999,
                        backgroundColor: SC.chip,
                      }}
                    >
                      {([
                        { value: 'system' as const, Icon: Monitor, label: autoT('Otomatik') },
                        { value: 'light'  as const, Icon: Sun,     label: autoT('Açık tema') },
                        { value: 'dark'   as const, Icon: Moon,    label: autoT('Koyu tema') },
                      ]).map(opt => {
                        const on = themeMode === opt.value;
                        return (
                          <Pressable
                            key={opt.value}
                            onPress={() => setThemeMode(opt.value)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: on }}
                            accessibilityLabel={opt.label}
                            style={({ pressed, hovered }: any) => ({
                              width: 26, height: 26, borderRadius: 13,
                              alignItems: 'center', justifyContent: 'center',
                              backgroundColor: on ? accentFill : hovered ? SC.chipStrong : 'transparent',
                              opacity: pressed ? 0.75 : 1,
                              ...(Platform.OS === 'web'
                                ? { cursor: 'pointer', transitionProperty: 'background-color', transitionDuration: '160ms' } as any
                                : {}),
                            })}
                          >
                            <opt.Icon size={14} color={on ? '#FFFFFF' : SC.ink3} strokeWidth={on ? 2.2 : 1.8} />
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* TEK ayraç — yalnız yıkıcı eylemi ayırır */}
                  <View style={{ height: 1, backgroundColor: SC.hairline, marginVertical: 6, marginHorizontal: 4 }} />

                  <Pressable onPress={handleLogout} style={menuRow}>
                    <LogOut size={15} color="#D9736F" strokeWidth={1.8} />
                    <Text style={{ fontSize: 13, color: isDark ? '#E8918D' : '#9C2E2E' }}>Çıkış yap</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Notifications popover — global for all panels */}
      <NotificationPopover
        visible={notifOpen}
        onClose={() => setNotifOpen(false)}
        anchorTop={56}
        anchorEnd={24}
        panel={
          panelType === 'clinic_admin' ? 'clinic'
          : panelType === 'admin'        ? 'admin'
          : panelType === 'doctor'       ? 'doctor'
          : 'lab'
        }
      />
    </View>
  );
}

// ─── Animated New Order CTA — shimmer glow + hover scale + icon pulse ──
function AnimatedNewOrderCTA({ onPress, accentColor, expanded }: {
  onPress: () => void; accentColor: string; expanded: boolean;
}) {
  // Koyu temada CTA lacivert gradyana döner (hero'larla aynı yüzey dili).
  const accentSurface = useHeroSurface(accentColor);
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

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.42] });
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
          ...accentSurface,
          flexDirection: 'row', alignItems: 'center', gap: 8,
          overflow: 'hidden',
          transform: [{ scale: scaleAnim }],
        }}>
          {/* Shimmer glow overlay */}
          {/* Parıltı: keskin daire değil, YAYILAN ışık. Blur ışığı dağıttığı
              için opaklık bir tık yükseltildi (0.25 → 0.42). */}
          <Animated.View style={{
            position: 'absolute', top: -10, end: -10,
            width: 60, height: 60, borderRadius: 30,
            backgroundColor: '#FFFFFF',
            opacity: glowOpacity,
            ...(Platform.OS === 'web' ? ({ filter: 'blur(18px)' } as any) : {}),
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
        ...accentSurface,
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        transform: [{ scale: scaleAnim }],
      }}>
        <Animated.View style={{
          position: 'absolute', top: -6, end: -6,
          width: 28, height: 28, borderRadius: 14,
          backgroundColor: '#FFFFFF',
          opacity: glowOpacity,
          ...(Platform.OS === 'web' ? ({ filter: 'blur(10px)' } as any) : {}),
        }} pointerEvents="none" />
        <Animated.View style={{ transform: [{ rotate: iconRotate }] }}>
          <PlusCircle size={16} color="#FFFFFF" strokeWidth={2} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

// ─── Expanded sidebar — tek satır (opsiyonel açılır alt menü) ─────────
// Sidebar satırını web'de gerçek bir <a href> ile sarar → sağ-tık "yeni sekmede aç",
// Cmd/Ctrl/orta-tık yeni sekme; normal sol-tık ise SPA gezinmesine (Pressable onPress)
// bırakılır. `display: contents` sayesinde layout hiç değişmez. Native'de no-op.
function NavAnchor({ href, children }: { href?: string; children: React.ReactNode }) {
  if (Platform.OS !== 'web' || !href) return <>{children}</>;
  // expo-router grup öneki tarayıcı URL'inde görünmez: '/(lab)/orders' → '/orders'
  const webHref = href.replace(/^\/\([^)]+\)/, '') || '/';
  return React.createElement(
    'a',
    {
      href: webHref,
      style: { display: 'contents', color: 'inherit', textDecoration: 'none' },
      // CAPTURE fazı — bubble DEĞİL. Kritik fark:
      // İçerideki React Native Web Pressable/TouchableOpacity tıklamayı işlerken
      // propagation'ı durdurabiliyor; o durumda bubble'daki onClick HİÇ çalışmıyor,
      // preventDefault yapılmıyor ve tarayıcı gerçek <a> gezinmesini yapıyordu.
      // Sonuç (ölçülen): onPress ile sayfa SPA olarak açılıyor (~1,4 sn), hemen
      // ardından tarayıcı tam sayfa gezinme yapıp belgeyi baştan kuruyor →
      // lf-splash geri geliyor + 7 MB paket yeniden parse ediliyor = 10-18 sn donma.
      // navigation.type "reload" değil "navigate" olduğu için reload aramaları
      // yanlış yöne gidiyordu.
      // Capture fazında preventDefault, çocuk stopPropagation yapsa bile çalışır.
      onClickCapture: (e: any) => {
        // Yeni sekme/pencere isteği → tarayıcıya bırak (preventDefault YOK)
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
        // Normal tık → tam sayfa gezinmeyi engelle, SPA nav (onPress) çalışsın
        e.preventDefault();
      },
    },
    children as any,
  );
}

function ExpandedNavRow({ item, isActive, accentColor, activeRowBg, router }: any) {
  const rtl = isRTL();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  // Nav renkleri koyu-farkında (koyu sidebar üzerinde okunur).
  const icOn   = isDark ? '#F7F2E9' : '#0A0A0A';
  const icOff  = isDark ? '#B8B2A6' : '#2C2C2C';
  const icOff2 = isDark ? '#9A9488' : '#6B6B6B';
  const badgeOnBg  = isDark ? '#F7F2E9' : '#0A0A0A';
  const badgeOffBg = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
  const badgeOffFg = isDark ? '#B8B2A6' : '#6B6B6B';
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;
  const childActive = hasChildren && item.children.some((c: PatternsNavItem) => isActive(c));
  const [open, setOpen] = useState<boolean>(!!childActive);
  const IconCmp = resolveIcon(item.iconName);

  if (!hasChildren) {
    const active = isActive(item);
    return (
      <NavAnchor href={item.onPress ? undefined : item.href}>
        <Pressable
          onPress={() => item.onPress ? item.onPress() : router.push(item.href)}
          className={`px-3 ${rtl ? "py-2" : "py-2.5"} rounded-[10px] flex-row items-center gap-2.5 relative`}
          style={active ? { backgroundColor: activeRowBg } : undefined}
        >
          {active && <View className="absolute rounded" style={{ ...(rtl ? { right: 0 } : { left: 0 }), top: 8, bottom: 8, width: 2.5, backgroundColor: accentColor }} />}
          <IconCmp size={15} color={active ? icOn : icOff} strokeWidth={1.8} />
          <Text className={`flex-1 text-[13px] ${active ? 'font-medium text-ink-900 dark:text-white/90' : 'text-ink-700 dark:text-white/70'}`}>{item.label}</Text>
          {item.badgeCount != null && item.badgeCount > 0 && (
            <View className="px-1.5 py-px rounded-full" style={{ backgroundColor: item.badgeColor ?? (active ? badgeOnBg : badgeOffBg) }}>
              <Text className="text-[10px] font-semibold" style={{ color: item.badgeColor ? '#FFFFFF' : (active ? accentColor : badgeOffFg) }}>{item.badgeCount}</Text>
            </View>
          )}
        </Pressable>
      </NavAnchor>
    );
  }

  // Parent — açılır grup butonu
  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        className={`px-3 ${rtl ? "py-2" : "py-2.5"} rounded-[10px] flex-row items-center gap-2.5 relative`}
        style={childActive ? { backgroundColor: activeRowBg } : undefined}
      >
        {childActive && <View className="absolute rounded" style={{ ...(rtl ? { right: 0 } : { left: 0 }), top: 8, bottom: 8, width: 2.5, backgroundColor: accentColor }} />}
        <IconCmp size={15} color={childActive ? icOn : icOff} strokeWidth={1.8} />
        <Text className={`flex-1 text-[13px] ${childActive ? 'font-medium text-ink-900 dark:text-white/90' : 'text-ink-700 dark:text-white/70'}`}>{item.label}</Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <ChevronDown size={14} color={icOff2} strokeWidth={2} />
        </View>
      </Pressable>
      {open && item.children.map((c: PatternsNavItem, j: number) => {
        const a = isActive(c);
        const CIcon = resolveIcon(c.iconName);
        return (
          <NavAnchor key={j} href={c.onPress ? undefined : c.href}>
            <Pressable
              onPress={() => c.onPress ? c.onPress() : router.push(c.href)}
              className={`${rtl ? "py-1.5" : "py-2"} rounded-[10px] flex-row items-center gap-2.5 relative`}
              style={[(rtl ? { paddingRight: 34, paddingLeft: 12 } : { paddingLeft: 34, paddingRight: 12 }), a ? { backgroundColor: activeRowBg } : undefined]}
            >
              {a && <View className="absolute rounded" style={{ ...(rtl ? { right: 14 } : { left: 14 }), top: 7, bottom: 7, width: 2.5, backgroundColor: accentColor }} />}
              <CIcon size={14} color={a ? icOn : icOff2} strokeWidth={1.8} />
              <Text className={`flex-1 text-[12.5px] ${a ? 'font-medium text-ink-900 dark:text-white/90' : 'text-ink-500 dark:text-white/55'}`}>{c.label}</Text>
              {c.badgeCount != null && c.badgeCount > 0 && (
                <View className="px-1.5 py-px rounded-full" style={{ backgroundColor: a ? badgeOnBg : badgeOffBg }}>
                  <Text className="text-[10px] font-semibold" style={{ color: a ? accentColor : badgeOffFg }}>{c.badgeCount}</Text>
                </View>
              )}
            </Pressable>
          </NavAnchor>
        );
      })}
    </View>
  );
}

// ─── Expanded sidebar ────────────────────────────────────────────────
function ExpandedSidebar({
  navItems, isActive, accentColor, brand, panelType, palette,
  onCollapse, onPressMessages, messagesUnreadCount, hideSidebarMessages, newOrderHref, router,
  tourRefs, tourOrdersHref,
}: any) {
  const rtl = isRTL();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  // Panel-aware sidebar tonları
  const isStation = panelType === 'station';
  const logoSquareBg = isStation ? '#0F2840' : '#0A0A0A'; // station: koyu denim
  const activeRowBg  = isDark ? 'rgba(255,255,255,0.07)' : (palette?.panelBg ?? '#FBFAF6');      // station: F4F8FC (mavi soluk)
  return (
    <View
      className="rounded-[20px] p-3.5 pt-5 border border-black/[0.05] dark:border-white/[0.06]"
      style={{
        width: 220,
        flex: 1,
        backgroundColor: palette?.panelBg ?? '#FFFFFF',
        // @ts-ignore web shadow
        boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
      }}
    >
      {/* Logo — mode 'logo': sadece büyük logo (text yok) · 'logo_text': solda logo + sağda isim */}
      {brand.mode === 'logo' && brand.logo ? (
        // Logonun üst/altında sabit koruyucu boşluk (ölçekten bağımsız korunur)
        <Pressable
          onPress={brand.website ? () => openLabSite(brand.website) : undefined}
          disabled={!brand.website}
          accessibilityRole={brand.website ? 'link' : undefined}
          accessibilityLabel={brand.website ? `${brand.name} web sitesi` : undefined}
          style={({ hovered }: any) => ({
            alignItems: 'center', justifyContent: 'center',
            paddingHorizontal: 10, paddingTop: 12, paddingBottom: 24,
            opacity: brand.website && hovered ? 0.75 : 1,
            ...(brand.website && Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
          })}
        >
          <Image source={{ uri: brand.logo }} style={{ width: '100%', height: Math.round(60 * (brand.scale ?? 1)) }} resizeMode="contain" />
        </Pressable>
      ) : (
        <View className="flex-row items-center gap-2.5 px-2.5 pb-5">
          <Pressable
            onPress={brand.website ? () => openLabSite(brand.website) : undefined}
            disabled={!brand.website}
            accessibilityRole={brand.website ? 'link' : undefined}
            accessibilityLabel={brand.website ? `${brand.name} web sitesi` : undefined}
            style={({ hovered }: any) => ({
              borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              width: Math.round(46 * (brand.scale ?? 1)), height: Math.round(46 * (brand.scale ?? 1)),
              backgroundColor: brand.logo ? '#FFFFFF' : logoSquareBg,
              borderWidth: brand.logo ? 1 : 0, borderColor: 'rgba(0,0,0,0.06)',
              opacity: brand.website && hovered ? 0.75 : 1,
              ...(brand.website && Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
            })}
          >
            {brand.logo ? (
              <Image source={{ uri: brand.logo }} style={{ width: '88%', height: '88%' }} resizeMode="contain" />
            ) : (
              <Text className="text-[16px] font-bold" style={{ color: accentColor }}>
                {brand.name.slice(0, 1).toUpperCase()}
              </Text>
            )}
          </Pressable>
          <View className="flex-1">
            <Text numberOfLines={1} className="text-[16px] font-bold text-ink-900 dark:text-white/90" style={{ letterSpacing: -0.3 }}>
              {brand.name}
            </Text>
            {brand.sub ? <Text numberOfLines={1} className="text-[10px] text-ink-400 dark:text-white/45">{brand.sub}</Text> : null}
          </View>
        </View>
      )}

      {/* New order CTA — animated */}
      {newOrderHref ? (
        <View ref={tourRefs?.newOrder}>
          <AnimatedNewOrderCTA
            onPress={() => router.push(newOrderHref)}
            accentColor={accentColor}
            expanded
          />
        </View>
      ) : null}

      {/* Section label */}
      <Text className="text-[10px] font-semibold uppercase text-ink-400 dark:text-white/40 px-2.5 pt-1 pb-2" style={{ letterSpacing: 1 }}>
        Çalışma alanı
      </Text>

      {/* Nav items */}
      <ScrollView className="flex-1" contentContainerStyle={{ gap: 2 }} showsVerticalScrollIndicator={false}>
        {navItems.map((item: PatternsNavItem, i: number) => (
          <View key={i} ref={tourOrdersHref && item.href === tourOrdersHref ? tourRefs?.orders : undefined}>
            <ExpandedNavRow
              item={item}
              isActive={isActive}
              accentColor={accentColor}
              activeRowBg={activeRowBg}
              router={router}
            />
          </View>
        ))}

        {onPressMessages && !hideSidebarMessages && (
          <Pressable
            onPress={onPressMessages}
            className={`px-3 ${rtl ? "py-2" : "py-2.5"} rounded-[10px] flex-row items-center gap-2.5`}
          >
            <MessageSquare size={15} color={isDark ? "#B8B2A6" : "#2C2C2C"} strokeWidth={1.8} />
            <Text className="flex-1 text-[13px] text-ink-700 dark:text-white/70">Mesajlar</Text>
            {messagesUnreadCount > 0 && (
              <View
                style={{
                  minWidth: 22, height: 22, paddingHorizontal: 6,
                  borderRadius: 11, backgroundColor: '#EF4444',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.2 }}>
                  {messagesUnreadCount > 99 ? '99+' : String(messagesUnreadCount)}
                </Text>
              </View>
            )}
          </Pressable>
        )}
      </ScrollView>

      {/* Powered by Siman — platform kimliği (white-label). Sola hizalı: sağ-alttaki FAB ile çakışmaz. */}
      {/* "Powered by SIMAN" bir MARKA KİLİDİ — İngilizce ve bütün olarak okunur.
          flex-row CSS'te yön duyarlı olduğu için RTL'de sıra ters dönüyor ve
          "SIMAN Powered by" çıkıyordu; row-reverse bunu geri çevirir. */}
      <View className="items-center gap-1.5 pt-3 mt-1" style={[{ flexDirection: rtl ? 'row-reverse' : 'row' }, rtl ? { paddingRight: 10, paddingLeft: 56 } : { paddingLeft: 10, paddingRight: 56 }]}>
        <Text className="text-[9.5px] text-ink-400 dark:text-white/40" numberOfLines={1}>Powered by</Text>
        <SimanWordmark height={9} color="#9A9A9A" />
      </View>
    </View>
  );
}

// ─── Collapsed sidebar ───────────────────────────────────────────────
function CollapsedSidebar({
  navItems, isActive, accentColor, brand, panelType, palette,
  onExpand, onPressMessages, messagesUnreadCount, hideSidebarMessages, newOrderHref, router,
  tourRefs, tourOrdersHref,
}: any) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const logoSquareBg = panelType === 'station' ? '#0F2840' : '#0A0A0A';
  const activeRowBg  = isDark ? 'rgba(255,255,255,0.07)' : (palette?.panelBg ?? '#FBFAF6');
  return (
    <View
      className="rounded-[20px] py-4 items-center border border-black/[0.05] dark:border-white/[0.06]"
      style={{
        width: 64,
        flex: 1,
        backgroundColor: palette?.panelBg ?? '#FFFFFF',
        // @ts-ignore web shadow
        boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
      }}
    >
      {/* Logo */}
      <Pressable
        onPress={brand?.website ? () => openLabSite(brand.website) : undefined}
        disabled={!brand?.website}
        accessibilityRole={brand?.website ? 'link' : undefined}
        accessibilityLabel={brand?.website ? `${brand.name} web sitesi` : undefined}
        style={({ hovered }: any) => ({
          width: 40, height: 40, borderRadius: 11, marginBottom: 14,
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          backgroundColor: brand?.logo ? '#FFFFFF' : logoSquareBg,
          borderWidth: brand?.logo ? 1 : 0, borderColor: 'rgba(0,0,0,0.06)',
          opacity: brand?.website && hovered ? 0.75 : 1,
          ...(brand?.website && Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
        })}
      >
        {brand?.logo ? (
          <Image source={{ uri: brand.logo }} style={{ width: '86%', height: '86%' }} resizeMode="contain" />
        ) : (
        <Text className="text-[15px] font-bold" style={{ color: accentColor }}>
          {brand?.name?.slice(0, 1)?.toUpperCase() ?? 'P'}
        </Text>
        )}
      </Pressable>

      {newOrderHref && (
        <View ref={tourRefs?.newOrder}>
          <AnimatedNewOrderCTA
            onPress={() => router.push(newOrderHref)}
            accentColor={accentColor}
            expanded={false}
          />
        </View>
      )}
      <View className="w-7 h-px bg-black/[0.08] mb-3" />

      <ScrollView contentContainerStyle={{ gap: 4, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
        {navItems.flatMap((it: PatternsNavItem) => (it.children && it.children.length ? it.children : [it])).map((item: PatternsNavItem, i: number) => {
          const active = isActive(item);
          const IconCmp = resolveIcon(item.iconName);
          return (
            <NavAnchor key={i} href={item.onPress ? undefined : item.href}>
              <Pressable
                ref={tourOrdersHref && item.href === tourOrdersHref ? tourRefs?.orders : undefined}
                onPress={() => item.onPress ? item.onPress() : router.push(item.href)}
                className="w-10 h-10 rounded-[10px] items-center justify-center relative"
                style={active ? { backgroundColor: activeRowBg } : undefined}
              >
                {active && (
                  <View
                    className="absolute start-0 rounded"
                    style={{ top: 8, bottom: 8, width: 2.5, backgroundColor: accentColor }}
                  />
                )}
                <IconCmp size={16} color={active ? (isDark ? "#F7F2E9" : "#0A0A0A") : (isDark ? "#B8B2A6" : "#2C2C2C")} strokeWidth={1.8} />
                {item.badgeCount != null && item.badgeCount > 0 && (
                  <View
                    className="absolute min-w-[16px] h-4 px-1 rounded-full border-2 border-white items-center justify-center"
                    style={{ top: -2, end: -2, backgroundColor: '#9C2E2E' }}
                  >
                    <Text className="text-[9px] font-semibold text-white">{item.badgeCount}</Text>
                  </View>
                )}
              </Pressable>
            </NavAnchor>
          );
        })}
        {onPressMessages && !hideSidebarMessages && (
          <Pressable
            onPress={onPressMessages}
            className="w-10 h-10 rounded-[10px] items-center justify-center relative"
          >
            <MessageSquare size={16} color="#2C2C2C" strokeWidth={1.8} />
            {messagesUnreadCount > 0 && (
              <View
                className="absolute min-w-[16px] h-4 px-1 rounded-full border-2 border-white items-center justify-center"
                style={{ top: -2, end: -2, backgroundColor: '#9C2E2E' }}
              >
                <Text className="text-[9px] font-semibold text-white">{messagesUnreadCount}</Text>
              </View>
            )}
          </Pressable>
        )}
      </ScrollView>
      {/* Powered by Siman — küçük orb */}
      <View className="items-center pt-2 mt-1 border-t border-black/[0.05]">
        <LabFlowLogo size={16} />
      </View>
    </View>
  );
}

function panelTypeLabel(type?: string) {
  switch (type) {
    case 'lab':              return 'Laboratuvar';
    case 'clinic_admin':     return 'Klinik Müdürü';
    case 'clinic_secretary': return 'Klinik Sekreteri';
    case 'doctor':           return 'Hekim';
    case 'admin':            return 'Admin';
    case 'station':          return 'İstasyon';
    default:                 return 'Kullanıcı';
  }
}

// ─── Bell badge — okunmamış bildirim sayısını gösterir ────────────────
function BellBadge() {
  const { unreadCount } = useNotifications();
  if (!unreadCount) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -4, end: -4,
        minWidth: 18, height: 18, paddingHorizontal: 5,
        borderRadius: 9, borderWidth: 2, borderColor: '#FFFFFF',
        backgroundColor: '#EF4444',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.2 }}>
        {unreadCount > 99 ? '99+' : String(unreadCount)}
      </Text>
    </View>
  );
}
