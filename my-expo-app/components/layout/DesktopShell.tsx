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
import { useAuthStore } from '../../store/authStore';
import { ToothIcon } from '../icons/ToothIcon';

import { AppIcon } from '../../core/ui/AppIcon';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  primary:        '#2563EB',
  primaryDark:    '#1D4ED8',
  primaryLight:   '#EFF6FF',
  bg:             '#F8FAFC',
  surface:        '#FFFFFF',
  border:         '#F1F5F9',
  borderMid:      '#F1F5F9',
  textPrimary:    '#0F172A',
  textSecondary:  '#64748B',
  textMuted:      '#94A3B8',
  success:        '#059669',
  successBg:      '#ECFDF5',
  warning:        '#D97706',
  warningBg:      '#FFFBEB',
  danger:         '#DC2626',
};

const SIDEBAR_W = 228;
const RIGHT_W   = 280;

// ─── Exports ──────────────────────────────────────────────────────────────────
export interface NavItem {
  label: string;
  emoji: string;
  href: string;
  matchPrefix?: boolean;
  badge?: boolean;
  iconName?: string;
  iconSet?: 'ionicons' | 'mci' | 'dentist';
}

interface Props {
  navItems: NavItem[];
  accentColor?: string;
  pageTitle?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function NavIcon({ item, active }: { item: NavItem; active: boolean }) {
  const iconColor = active ? '#FFFFFF' : C.textMuted;
  const size = 18;
  if (item.iconName === 'tooth-outline') {
    return <ToothIcon size={size} color={iconColor} />;
  }
  if (item.iconName) {
    return <AppIcon name={item.iconName as any} size={size} color={iconColor} />;
  }
  return null;
}

// ─── Right Panel ──────────────────────────────────────────────────────────────
function RightPanel({ accentColor, initials, fullName, role }: {
  accentColor: string;
  initials: string;
  fullName: string;
  role?: string | null;
}) {
  const upcoming = [
    { title: 'Bugünkü İşler', time: '09:00 - 10:30', doctor: 'Lab Ekibi' },
    { title: 'Teslim Edilecekler', time: '14:00 - 15:00', doctor: 'Sevkiyat' },
    { title: 'Kalite Kontrol', time: '16:00 - 17:00', doctor: 'QC Ekibi' },
  ];

  return (
    <View style={rp.panel}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile */}
        <View style={rp.profileCard}>
          <View style={[rp.avatar, { backgroundColor: accentColor }]}>
            <Text style={rp.avatarText}>{initials}</Text>
          </View>
          <Text style={rp.name} numberOfLines={1}>{fullName}</Text>
          <Text style={rp.role}>{role ?? 'Dental Lab'}</Text>

          <View style={rp.statsRow}>
            {[
              { label: 'Toplam', value: '—' },
              { label: 'Aktif', value: '—' },
              { label: 'Oran', value: '—' },
            ].map(s => (
              <View key={s.label} style={rp.statCell}>
                <Text style={rp.statVal}>{s.value}</Text>
                <Text style={rp.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Divider */}
        <View style={rp.divider} />

        {/* Upcoming */}
        <Text style={rp.sectionTitle}>Yaklaşan Görevler</Text>
        {upcoming.map((u, i) => (
          <TouchableOpacity key={i} style={rp.upcomingRow}>
            <View style={rp.upcomingLeft}>
              <Text style={rp.upcomingTitle}>{u.title}</Text>
              <Text style={rp.upcomingTime}>{u.time}</Text>
              <Text style={rp.upcomingDoc}>{u.doctor}</Text>
            </View>
            <Text style={rp.upcomingArrow}>›</Text>
          </TouchableOpacity>
        ))}

        {/* Divider */}
        <View style={[rp.divider, { marginTop: 16 }]} />

        {/* Mini stats */}
        <Text style={rp.sectionTitle}>Durum Özeti</Text>
        {[
          { label: 'Tamamlanan', color: C.primary, pct: 60 },
          { label: 'Üretimde', color: C.warning, pct: 25 },
          { label: 'Geciken', color: C.danger, pct: 15 },
        ].map(s => (
          <View key={s.label} style={rp.barRow}>
            <View style={rp.barLabelRow}>
              <Text style={rp.barLabel}>{s.label}</Text>
              <Text style={[rp.barPct, { color: s.color }]}>{s.pct}%</Text>
            </View>
            <View style={rp.barTrack}>
              <View style={[rp.barFill, { width: `${s.pct}%` as any, backgroundColor: s.color }]} />
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
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  profileCard: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '700', color: C.textPrimary, marginBottom: 2 },
  role: { fontSize: 12, color: C.textMuted, marginBottom: 14 },
  statsRow: { flexDirection: 'row', gap: 0, width: '100%' },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },
  statVal: { fontSize: 16, fontWeight: '800', color: C.textPrimary },
  statLabel: { fontSize: 10, color: C.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: C.textPrimary,
    marginBottom: 12,
  },
  upcomingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  upcomingLeft: { flex: 1 },
  upcomingTitle: { fontSize: 13, fontWeight: '600', color: C.textPrimary },
  upcomingTime: { fontSize: 11, color: C.textSecondary, marginTop: 1 },
  upcomingDoc: { fontSize: 11, color: C.textMuted, marginTop: 1 },
  upcomingArrow: { fontSize: 18, color: C.textMuted, paddingLeft: 8 },
  barRow: { marginBottom: 12 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  barLabel: { fontSize: 12, color: C.textSecondary, fontWeight: '500' },
  barPct: { fontSize: 12, fontWeight: '700' },
  barTrack: { height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
});

// ─── Main Shell ───────────────────────────────────────────────────────────────
export function DesktopShell({ navItems, accentColor = C.primary, pageTitle }: Props) {
  const router    = useRouter();
  const pathname  = usePathname();
  const { profile, signOut } = useAuthStore();
  const { width } = useWindowDimensions();

  const [hovered, setHovered] = useState<string | null>(null);
  const [search, setSearch]   = useState('');

  const showRight = width >= 1200;

  const initials  = getInitials(profile?.full_name);
  const fullName  = profile?.full_name ?? 'Kullanıcı';
  const firstName = fullName.split(' ')[0];

  // Derive page title from pathname if not passed
  const derivedTitle = pageTitle ?? (() => {
    const found = navItems.find(n =>
      n.matchPrefix ? pathname.startsWith(n.href) : pathname === n.href
    );
    return found?.label ?? 'Dashboard';
  })();

  const isActive = (item: NavItem) =>
    item.matchPrefix
      ? pathname.startsWith(item.href)
      : pathname === item.href || pathname === item.href + '/';

  return (
    <View style={s.shell}>

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <View style={s.sidebar}>
        {/* Logo */}
        <View style={s.logoRow}>
          <View style={[s.logoIcon, { backgroundColor: accentColor }]}>
            <Text style={s.logoEmoji}>🦷</Text>
          </View>
          <Text style={[s.logoText, { color: accentColor }]}>DENTAL LAB</Text>
        </View>

        {/* Nav */}
        <ScrollView style={s.navScroll} showsVerticalScrollIndicator={false}>
          {navItems.map(item => {
            const active = isActive(item);
            return (
              <TouchableOpacity
                key={item.href}
                onPress={() => router.push(item.href as any)}
                style={[
                  s.navItem,
                  active && [s.navItemActive, { backgroundColor: accentColor }],
                  !active && hovered === item.href && s.navItemHover,
                ]}
                // @ts-ignore
                onMouseEnter={() => setHovered(item.href)}
                onMouseLeave={() => setHovered(null)}
                accessibilityLabel={item.label}
              >
                {item.iconName
                  ? <NavIcon item={item} active={active} />
                  : <Text style={[s.navEmoji, active && s.navEmojiActive]}>{item.emoji}</Text>
                }
                <Text style={[s.navLabel, active && s.navLabelActive]}>
                  {item.label}
                </Text>
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
            <AppIcon name="logout" size={18} color={hovered === '__out' ? C.danger : C.textMuted} />
            <Text style={[s.navLabel, hovered === '__out' && { color: C.danger }]}>Çıkış Yap</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* User card at bottom */}
        <View style={s.sidebarUser}>
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

      {/* ── Center ───────────────────────────────────────────────────── */}
      <View style={s.center}>
        {/* Top header bar */}
        <View style={s.header}>
          <Text style={s.headerTitle}>{derivedTitle}</Text>

          <View style={s.headerRight}>
            <View style={s.searchBar}>
              <Text style={s.searchIco}>🔍</Text>
              <TextInput
                style={s.searchInput}
                placeholder="Ara..."
                placeholderTextColor={C.textMuted}
                value={search}
                onChangeText={setSearch}
              />
            </View>
            <TouchableOpacity style={s.headerBtn}>
              <Text style={s.headerBtnIco}>🔔</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Page content */}
        <View style={s.pageArea}>
          <Slot />
        </View>
      </View>

      {/* ── Right panel ──────────────────────────────────────────────── */}
      {showRight && (
        <RightPanel
          accentColor={accentColor}
          initials={initials}
          fullName={fullName}
          role={(profile as any)?.role ?? null}
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
    paddingTop: 24,
    borderRightWidth: 1,
    borderRightColor: C.border,
    // @ts-ignore
    boxShadow: '1px 0 8px rgba(0,0,0,0.04)',
    zIndex: 20,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 28,
    gap: 10,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: { fontSize: 18 },
  logoText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  navScroll: { flex: 1, paddingHorizontal: 12 },

  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 2,
    gap: 10,
  },
  navItemActive: {
    // backgroundColor applied inline
  },
  navItemHover: {
    backgroundColor: C.primaryLight,
  },
  navItemLogout: {
    backgroundColor: '#FEF2F2',
  },
  navEmoji: {
    fontSize: 17,
    opacity: 0.4,
    width: 22,
    textAlign: 'center',
  },
  navEmojiActive: {
    opacity: 1,
    // @ts-ignore
    filter: 'brightness(10)',
  },
  navLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: C.textSecondary,
  },
  navLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  navBadge: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  sidebarUser: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 10,
  },
  userAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  userInfo: { flex: 1 },
  userName: { fontSize: 13, fontWeight: '700', color: C.textPrimary },
  userRole: { fontSize: 11, color: C.textMuted, textTransform: 'capitalize' },
  userChevron: { fontSize: 12, color: C.textMuted },

  /* Center */
  center: {
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
    paddingHorizontal: 24,
    paddingVertical: 16,
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
    width: 200,
    gap: 8,
  },
  searchIco: { fontSize: 13, opacity: 0.45 },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: C.textPrimary,
    // @ts-ignore
    outlineStyle: 'none',
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.borderMid,
  },
  headerBtnIco: { fontSize: 15 },

  /* Page area */
  pageArea: {
    flex: 1,
    overflow: 'hidden',
  },
});
