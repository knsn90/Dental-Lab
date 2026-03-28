import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Platform,
  TextInput,
} from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

// ─── Tokens ───────────────────────────────────────────────────────────────────
const C = {
  primary:       '#2563EB',
  primaryLight:  '#EFF6FF',
  bg:            '#FFFFFF',
  surface:       '#FFFFFF',
  border:        '#F1F5F9',
  borderMid:     '#E2E8F0',
  textPrimary:   '#0F172A',
  textSecondary: '#64748B',
  textMuted:     '#94A3B8',
  danger:        '#DC2626',
  dangerBg:      '#FEF2F2',
  navHover:      '#EFF6FF',
  tooltipBg:     '#1E293B',
  // keep old aliases used by other files
  background:    '#FFFFFF',
  statsBg:       '#F8FAFC',
  logoutHover:   '#FEF2F2',
};

const SIDEBAR_W = 224;
const RIGHT_W   = 272;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface NavItem {
  label: string;
  emoji: string;                   // fallback (still required for mobile tabs)
  href: string;
  matchPrefix?: boolean;
  badge?: boolean;
  iconName?: string;               // MaterialCommunityIcons name
  iconSet?: 'ionicons' | 'mci';   // mci = MaterialCommunityIcons
  subtitle?: string;               // shown in top header when this page is active
}

interface Props {
  navItems: NavItem[];
  accentColor?: string;
}

function getInitials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function NavIcon({ item, active, color }: { item: NavItem; active: boolean; color: string }) {
  const iconColor = active ? '#FFFFFF' : C.textMuted;
  const size = 18;
  if (item.iconName) {
    return <MaterialCommunityIcons name={item.iconName as any} size={size} color={iconColor} />;
  }
  return <Text style={[s.navEmoji, active && s.navEmojiActive]}>{item.emoji}</Text>;
}

// ─── Right panel ──────────────────────────────────────────────────────────────
function RightPanel({ initials, fullName, role, accentColor }: {
  initials: string; fullName: string; role?: string | null; accentColor: string;
}) {
  const upcoming = [
    { title: 'Teslim Edilecekler', time: '09:00 - 10:30', sub: 'Sevkiyat' },
    { title: 'Kalite Kontrol',     time: '14:00 - 15:00', sub: 'QC Ekibi' },
    { title: 'Prova Kontrolü',     time: '16:00 - 17:00', sub: 'Lab Ekibi' },
  ];
  const bars = [
    { label: 'Tamamlanan', color: accentColor, pct: 60 },
    { label: 'Üretimde',   color: '#D97706',   pct: 25 },
    { label: 'Geciken',    color: '#DC2626',    pct: 15 },
  ];

  return (
    <View style={rp.panel}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile */}
        <View style={rp.profileBox}>
          <View style={[rp.avatar, { backgroundColor: accentColor }]}>
            <Text style={rp.avatarText}>{initials}</Text>
          </View>
          <Text style={rp.name} numberOfLines={1}>{fullName}</Text>
          <Text style={rp.role}>{role ?? 'Dental Lab'}</Text>
        </View>

        <View style={rp.divider} />

        {/* Upcoming */}
        <Text style={rp.sectionTitle}>Yaklaşan Görevler</Text>
        {upcoming.map((u, i) => (
          <View key={i} style={rp.upRow}>
            <View style={rp.upLeft}>
              <Text style={rp.upTitle}>{u.title}</Text>
              <Text style={rp.upTime}>{u.time}</Text>
              <Text style={rp.upSub}>{u.sub}</Text>
            </View>
            <Text style={rp.upArrow}>›</Text>
          </View>
        ))}

        <View style={[rp.divider, { marginTop: 12 }]} />

        {/* Durum */}
        <Text style={rp.sectionTitle}>Durum Özeti</Text>
        {bars.map(b => (
          <View key={b.label} style={rp.barRow}>
            <View style={rp.barHead}>
              <Text style={rp.barLabel}>{b.label}</Text>
              <Text style={[rp.barPct, { color: b.color }]}>{b.pct}%</Text>
            </View>
            <View style={rp.track}>
              <View style={[rp.fill, { width: `${b.pct}%` as any, backgroundColor: b.color }]} />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const rp = StyleSheet.create({
  panel: {
    width: RIGHT_W,
    backgroundColor: C.surface,
    borderLeftWidth: 1,
    borderLeftColor: C.border,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  profileBox: { alignItems: 'center', paddingBottom: 14 },
  avatar: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '700', color: C.textPrimary, marginBottom: 2 },
  role: { fontSize: 12, color: C.textMuted },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: C.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  upRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border },
  upLeft: { flex: 1 },
  upTitle: { fontSize: 13, fontWeight: '600', color: C.textPrimary },
  upTime: { fontSize: 11, color: C.textSecondary, marginTop: 1 },
  upSub: { fontSize: 11, color: C.textMuted, marginTop: 1 },
  upArrow: { fontSize: 18, color: C.textMuted, paddingLeft: 8 },
  barRow: { marginBottom: 10 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel: { fontSize: 12, color: C.textSecondary, fontWeight: '500' },
  barPct: { fontSize: 12, fontWeight: '700' },
  track: { height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});

// ─── Shell ────────────────────────────────────────────────────────────────────
export function DesktopShell({ navItems, accentColor = C.primary }: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const { profile, signOut } = useAuthStore();
  const { width } = useWindowDimensions();

  const [hovered, setHovered] = useState<string | null>(null);
  const [search, setSearch]   = useState('');

  const initials  = getInitials(profile?.full_name);
  const firstName = profile?.full_name?.split(' ')[0] ?? 'Kullanıcı';
  const fullName  = profile?.full_name ?? 'Kullanıcı';

  // expo-router strips route groups from pathname: '/(lab)/new-order' → '/new-order'
  const normalizeHref = (href: string) => href.replace(/^\/\([^)]+\)/, '') || '/';

  const isActive = (item: NavItem) => {
    const h = normalizeHref(item.href);
    return item.matchPrefix
      ? pathname.startsWith(h)
      : pathname === h || pathname === h + '/';
  };

  // Right panel only on dashboard (index) routes
  const isDashboard = pathname === '/';
  const showRight = width >= 1200 && isDashboard;

  // Current page label + subtitle for header
  const activeItem   = navItems.find(n => isActive(n));
  const activeLabel  = activeItem?.label    ?? 'Dashboard';
  const activeSubtitle = activeItem?.subtitle ?? null;

  return (
    <View style={s.shell}>

      {/* ── Sidebar ── */}
      <View style={s.sidebar}>
        {/* Logo */}
        <View style={s.logoRow}>
          <View style={[s.logoIcon, { backgroundColor: accentColor }]}>
            <Text style={s.logoEmoji}>🦷</Text>
          </View>
          <Text style={[s.logoText, { color: accentColor }]}>DENTAL LAB</Text>
        </View>

        {/* Nav items */}
        <ScrollView style={s.navScroll} showsVerticalScrollIndicator={false}>
          {navItems.map(item => {
            const active = isActive(item);
            const hover  = hovered === item.href;
            return (
              <TouchableOpacity
                key={item.href}
                style={[
                  s.navItem,
                  active && [s.navItemActive, { backgroundColor: accentColor }],
                  !active && hover && s.navItemHover,
                ]}
                onPress={() => router.push(item.href as any)}
                // @ts-ignore
                onMouseEnter={() => setHovered(item.href)}
                onMouseLeave={() => setHovered(null)}
                accessibilityLabel={item.label}
              >
                <NavIcon item={item} active={active} color={accentColor} />
                <Text style={[s.navLabel, active && s.navLabelActive]}>{item.label}</Text>
                {item.badge && (
                  <View style={[s.navBadge, { backgroundColor: active ? '#fff' : accentColor }]} />
                )}
              </TouchableOpacity>
            );
          })}

          {/* Logout */}
          <TouchableOpacity
            style={[s.navItem, hovered === '__out' && s.navItemLogout]}
            onPress={signOut}
            // @ts-ignore
            onMouseEnter={() => setHovered('__out')}
            onMouseLeave={() => setHovered(null)}
          >
            <MaterialCommunityIcons name="logout" size={18} color={hovered === '__out' ? C.danger : C.textMuted} />
            <Text style={[s.navLabel, hovered === '__out' && { color: C.danger }]}>Çıkış Yap</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* User card */}
        <View style={s.userCard}>
          <View style={[s.userAvatar, { backgroundColor: accentColor }]}>
            <Text style={s.userAvatarText}>{initials}</Text>
          </View>
          <View style={s.userInfo}>
            <Text style={s.userName} numberOfLines={1}>{firstName}</Text>
            <Text style={s.userRole} numberOfLines={1}>
              {(profile as any)?.role ?? (profile as any)?.user_type ?? 'Kullanıcı'}
            </Text>
          </View>
          <Text style={s.userChevron}>▾</Text>
        </View>
      </View>

      {/* ── Main ── */}
      <View style={s.main}>
        {/* Top header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>{activeLabel}</Text>
            {activeSubtitle && (
              <Text style={s.headerSubtitle}>{activeSubtitle}</Text>
            )}
          </View>
          <View style={s.headerRight}>
            <View style={s.searchBar}>
              <MaterialCommunityIcons name="magnify" size={14} color={C.textMuted} />
              <TextInput
                style={s.searchInput}
                placeholder="Sipariş ara..."
                placeholderTextColor={C.textMuted}
                value={search}
                onChangeText={setSearch}
              />
            </View>
            <TouchableOpacity style={s.iconBtn}>
              <MaterialCommunityIcons name="bell-outline" size={18} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Page content */}
        <View style={s.page}>
          <Slot />
        </View>
      </View>

      {/* ── Right panel ── */}
      {showRight && (
        <RightPanel
          initials={initials}
          fullName={fullName}
          role={(profile as any)?.role ?? null}
          accentColor={accentColor}
        />
      )}
    </View>
  );
}

// ─── useIsDesktop ─────────────────────────────────────────────────────────────
export function useIsDesktop() {
  const { width } = useWindowDimensions();
  return width >= 769;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: C.bg,
  },

  /* Sidebar */
  sidebar: {
    width: SIDEBAR_W,
    backgroundColor: C.surface,
    flexDirection: 'column',
    paddingTop: 20,
    borderRightWidth: 1,
    borderRightColor: C.border,
    // @ts-ignore
    boxShadow: '1px 0 6px rgba(0,0,0,0.04)',
    zIndex: 20,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginBottom: 24,
    gap: 10,
  },
  logoIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: { fontSize: 17 },
  logoText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  navScroll: { flex: 1, paddingHorizontal: 10 },

  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 2,
    gap: 10,
  },
  navItemActive: {},   // backgroundColor set inline
  navItemHover:  { backgroundColor: C.navHover },
  navItemLogout: { backgroundColor: C.dangerBg },

  navEmoji:      { fontSize: 16, opacity: 0.4, width: 20, textAlign: 'center' },
  navEmojiActive:{ opacity: 1 },
  navLabel:      { flex: 1, fontSize: 13, fontWeight: '500', color: C.textSecondary },
  navLabelActive:{ color: '#FFFFFF', fontWeight: '700' },
  navBadge:      { width: 7, height: 7, borderRadius: 4 },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 10,
  },
  userAvatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  userAvatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  userInfo: { flex: 1 },
  userName:  { fontSize: 13, fontWeight: '700', color: C.textPrimary },
  userRole:  { fontSize: 11, color: C.textMuted, textTransform: 'capitalize' },
  userChevron: { fontSize: 11, color: C.textMuted },

  /* Main */
  main: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: C.bg,
    overflow: 'hidden',
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 14,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    // @ts-ignore
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderMid,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: 210,
    gap: 8,
  },
  searchInput: {
    flex: 1, fontSize: 13, color: C.textPrimary,
    // @ts-ignore
    outlineStyle: 'none',
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.borderMid,
  },

  /* Page */
  page: { flex: 1, overflow: 'hidden' },
});
