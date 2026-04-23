import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Feather from '@expo/vector-icons/Feather';
import { useOrders } from '../../modules/orders/hooks/useOrders';
import { supabase } from '../api/supabase';
import { BlurFade } from '../ui/BlurFade';

// ─── Tokens ───────────────────────────────────────────────────────────────────
const C = {
  primary:       '#2563EB',
  primaryLight:  '#EFF6FF',
  bg:            '#FFFFFF',
  surface:       '#FFFFFF',
  border:        '#F1F5F9',
  borderMid:     '#F1F5F9',
  textPrimary:   '#1C1C1E',
  textSecondary: '#6C6C70',
  textMuted:     '#AEAEB2',
  danger:        '#FF3B30',
  dangerBg:      '#FFF1F0',
  navHover:      '#F4F4F8',
  // keep old aliases
  background:    '#FFFFFF',
  statsBg:       '#FAFAFA',
  logoutHover:   '#FFF1F0',
};

const SIDEBAR_W            = 228;
const SIDEBAR_COLLAPSED_W  = 64;
const RIGHT_W              = 272;
const TOGGLE_W             = 32;

const AUTO_HIDE_PATHS = ['/new-order', '/orders/new'];

// ─── Types ────────────────────────────────────────────────────────────────────
export interface NavItem {
  label: string;
  emoji: string;
  href: string;
  matchPrefix?: boolean;
  badge?: boolean;
  badgeCount?: number; // shows a numeric count badge (e.g. low-stock count)
  iconName?: string;
  iconSet?: 'ionicons' | 'mci' | 'mdi' | string;
  subtitle?: string;
  sectionLabel?: string; // renders a section divider + label before this item
  /** Navigasyon yerine modal açmak için override. Verildiğinde router.push atlanır. */
  onPress?: () => void;
}

interface Props {
  navItems: NavItem[];
  accentColor?: string;
}

function getInitials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function NavIcon({ item, active, accentColor }: { item: NavItem; active: boolean; accentColor: string }) {
  const iconColor = active ? accentColor : '#64748B';
  if (item.iconName) {
    return <Feather name={item.iconName as any} size={18} color={iconColor} />;
  }
  return <Text style={{ fontSize: 17, opacity: active ? 1 : 0.55, width: 22, textAlign: 'center' }}>{item.emoji}</Text>;
}

// ─── Right panel ──────────────────────────────────────────────────────────────
function RightPanel({ accentColor, profile, open, onToggle }: {
  accentColor: string;
  profile: any;
  open: boolean;
  onToggle: () => void;
}) {
  const isManager    = profile?.user_type === 'lab' && profile?.role === 'manager';
  const isTechnician = profile?.user_type === 'lab' && profile?.role === 'technician';
  const { orders } = useOrders('lab');

  const myOrders = isTechnician && profile?.id
    ? orders.filter((o: any) => o.assigned_to === profile.id)
    : orders;

  const today      = new Date().toISOString().split('T')[0];
  const active     = myOrders.filter((o: any) => o.status === 'uretimde').length;
  const overdue    = myOrders.filter((o: any) => o.delivery_date < today && o.status !== 'teslim_edildi').length;
  const unassigned = isManager ? orders.filter((o: any) => o.status === 'alindi' && !o.assigned_to).length : 0;
  const kk         = myOrders.filter((o: any) => o.status === 'kalite_kontrol').length;

  const stats = [
    { label: 'Toplam',    value: myOrders.length, alert: false },
    { label: 'Üretimde',  value: active,          alert: false },
    { label: 'Geciken',   value: overdue,         alert: overdue > 0 },
    isManager
      ? { label: 'Atanmamış', value: unassigned, alert: unassigned > 0 }
      : { label: 'KK',        value: kk,         alert: false },
  ];

  const pending = [...myOrders]
    .filter((o: any) => o.status !== 'teslim_edildi')
    .sort((a: any, b: any) => a.delivery_date.localeCompare(b.delivery_date))
    .slice(0, 8);

  const STATUS_COLOR: Record<string, string> = {
    alindi:          '#CBD5E1',
    uretimde:        '#60A5FA',
    kalite_kontrol:  '#A78BFA',
    teslimata_hazir: '#34D399',
    teslim_edildi:   '#6EE7B7',
  };

  const initials  = profile?.full_name
    ? profile.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  const fullName  = profile?.full_name ?? 'Kullanıcı';
  const roleLabel = profile?.role === 'manager'    ? 'Mesul Müdür'
                  : profile?.role === 'technician' ? 'Teknisyen'
                  : profile?.user_type === 'lab'   ? 'Lab'
                  : profile?.user_type ?? 'Kullanıcı';

  function daysUntil(deliveryDate: string) {
    const d    = new Date(deliveryDate + 'T00:00:00');
    const t    = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.ceil((d.getTime() - t.getTime()) / 86_400_000);
    if (diff <  0) return { text: `${Math.abs(diff)}g geç`, overdue: true };
    if (diff === 0) return { text: 'Bugün',                  overdue: false };
    if (diff === 1) return { text: 'Yarın',                  overdue: false };
    return           { text: `${diff} gün`,                  overdue: false };
  }

  return (
    <View style={[rp.panel, open ? rp.panelOpen : rp.panelClosed]}>
      {/* Toggle strip */}
      <TouchableOpacity onPress={onToggle} style={rp.toggleStrip} activeOpacity={0.7}>
        <Feather
          name={open ? 'chevron-right' : 'chevron-left' as any}
          size={14}
          color="#AEAEB2"
        />
        {!open && <Text style={rp.toggleHint}>{'İşler'}</Text>}
      </TouchableOpacity>

      {/* Content */}
      {open && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={rp.scroll} style={{ flex: 1 }}>

          {/* Profile card — centered */}
          <View style={rp.profileCard}>
            <View style={[rp.avatar, { backgroundColor: accentColor }]}>
              {profile?.avatar_url
                ? <Image source={{ uri: profile.avatar_url }} style={rp.avatarImg} />
                : <Text style={rp.avatarText}>{initials}</Text>}
            </View>
            <Text style={rp.profileName} numberOfLines={1}>{fullName}</Text>
            <View style={[rp.rolePill, { backgroundColor: accentColor + '18' }]}>
              <Text style={[rp.roleLabel, { color: accentColor }]}>{roleLabel}</Text>
            </View>
          </View>

          {/* Stats — 2×2 grid */}
          <View style={rp.statsCard}>
            {stats.map((st, i) => (
              <View
                key={st.label}
                style={[
                  rp.statItem,
                  i % 2 === 0 && rp.statItemRight,
                  i >= 2     && rp.statItemTop,
                ]}
              >
                <Text style={[rp.statValue, st.alert && rp.statValueAlert]}>{st.value}</Text>
                <Text style={rp.statLabel}>{st.label}</Text>
              </View>
            ))}
          </View>

          {/* Active orders */}
          <Text style={rp.sectionTitle}>
            {isTechnician ? 'İşlerim' : 'Aktif İşler'}
          </Text>

          {pending.length === 0 ? (
            <Text style={rp.emptyText}>Aktif iş bulunmuyor</Text>
          ) : (
            <View style={rp.ordersCard}>
              {pending.map((order: any, idx: number) => {
                const { text, overdue: isOverdue } = daysUntil(order.delivery_date);
                const dotColor = STATUS_COLOR[order.status] ?? '#CBD5E1';
                return (
                  <View key={order.id} style={[rp.orderRow, idx < pending.length - 1 && rp.orderRowBorder]}>
                    <View style={[rp.statusAccent, { backgroundColor: dotColor }]} />
                    <View style={rp.orderInfo}>
                      <Text style={rp.orderType} numberOfLines={1}>{order.work_type}</Text>
                      <Text style={rp.orderNum}>{order.order_number}</Text>
                    </View>
                    <View style={[rp.dateChip, isOverdue && rp.dateChipAlert]}>
                      <Text style={[rp.dateText, isOverdue && rp.dateTextAlert]}>{text}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

        </ScrollView>
      )}
    </View>
  );
}

const rp = StyleSheet.create({
  panel: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    borderLeftWidth: 1,
    borderLeftColor: '#F1F5F9',
  },
  panelOpen:   { width: RIGHT_W + TOGGLE_W },
  panelClosed: { width: TOGGLE_W },
  toggleStrip: {
    width: TOGGLE_W,
    alignItems: 'center',
    paddingTop: 20,
    gap: 10,
    borderRightWidth: 1,
    borderRightColor: '#EDEFF4',
  },
  toggleHint: {
    fontSize: 9, fontWeight: '700', color: '#AEAEB2',
    letterSpacing: 1.2, textTransform: 'uppercase',
    // @ts-ignore
    writingMode: 'vertical-rl',
    transform: [{ rotate: '180deg' }],
    marginTop: 4,
  },
  scroll: { paddingTop: 14, paddingBottom: 32 },

  /* Profile — centered card */
  profileCard: {
    marginHorizontal: 14, marginBottom: 12,
    borderRadius: 16, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#F1F5F9',
    padding: 16, alignItems: 'center', gap: 8,
  },
  avatar:      { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg:   { width: 72, height: 72, borderRadius: 36 },
  avatarText:  { color: '#fff', fontSize: 22, fontWeight: '800' },
  profileName: { fontSize: 14, fontWeight: '700', color: '#1C1C1E', textAlign: 'center' },
  rolePill:    { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  roleLabel:   { fontSize: 11, fontWeight: '600' },

  /* Stats — 2×2 white card */
  statsCard: {
    marginHorizontal: 14, marginBottom: 12,
    borderRadius: 16, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#F1F5F9',
    overflow: 'hidden',
    flexDirection: 'row', flexWrap: 'wrap',
  },
  statItem:      { width: '50%', padding: 14, alignItems: 'center', gap: 3 },
  statItemRight: { borderRightWidth: 1, borderRightColor: '#F1F5F9' },
  statItemTop:   { borderTopWidth: 1,   borderTopColor:  '#F1F5F9' },
  statValue:      { fontSize: 24, fontWeight: '800', color: '#1C1C1E', letterSpacing: -0.5 },
  statValueAlert: { color: '#FF3B30' },
  statLabel:      { fontSize: 9, fontWeight: '600', color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: 0.5 },

  /* Section title */
  sectionTitle: {
    fontSize: 10, fontWeight: '700', color: '#AEAEB2',
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 14, marginBottom: 8,
  },

  /* Orders — white card */
  ordersCard: {
    marginHorizontal: 14,
    borderRadius: 16, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  orderRow:       { flexDirection: 'row', alignItems: 'center', paddingRight: 12, paddingVertical: 11, gap: 10 },
  orderRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  statusAccent:   { width: 3, height: 34, borderRadius: 2, marginLeft: 10, flexShrink: 0 },
  orderInfo:      { flex: 1 },
  orderType:      { fontSize: 12, fontWeight: '600', color: '#1C1C1E' },
  orderNum:       { fontSize: 10, color: '#AEAEB2', marginTop: 1 },
  dateChip:       { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: '#F1F5F9' },
  dateChipAlert:  { backgroundColor: '#FEF2F2' },
  dateText:       { fontSize: 11, color: '#6C6C70', fontWeight: '600' },
  dateTextAlert:  { color: '#FF3B30', fontWeight: '700' },
  emptyText:      { fontSize: 12, color: '#AEAEB2', paddingHorizontal: 14, paddingTop: 8 },
});

// ─── Global Search ────────────────────────────────────────────────────────────
type SRType = 'clinic' | 'doctor' | 'order' | 'user';
interface SR {
  id: string; type: SRType;
  title: string; subtitle?: string;
  icon: string; href: string;
}
const SR_META: Record<SRType, { label: string; color: string; bg: string }> = {
  clinic: { label: 'Klinik',    color: '#2563EB', bg: '#EFF6FF' },
  doctor: { label: 'Hekim',     color: '#7C3AED', bg: '#EDE9FE' },
  order:  { label: 'Sipariş',   color: '#059669', bg: '#D1FAE5' },
  user:   { label: 'Kullanıcı', color: '#D97706', bg: '#FEF3C7' },
};

function GlobalSearch({
  visible, onClose, userType,
}: {
  visible: boolean; onClose: () => void; userType: string;
}) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<SR[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const isAdmin = userType === 'admin';

  useEffect(() => {
    if (!visible) { setQuery(''); setResults([]); }
    else { setTimeout(() => inputRef.current?.focus(), 100); }
  }, [visible]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    const timer = setTimeout(() => runSearch(q), 280);
    return () => clearTimeout(timer);
  }, [query]);

  async function runSearch(q: string) {
    setLoading(true);
    const like = `%${q}%`;
    const adminPrefix = '/(admin)';
    const labPrefix   = '/(lab)';

    const [c, d, o, u] = await Promise.all([
      supabase.from('clinics').select('id,name,contact_person,category').or(`name.ilike.${like},contact_person.ilike.${like}`).limit(5),
      supabase.from('doctors').select('id,full_name,specialty').ilike('full_name', like).limit(5),
      supabase.from('work_orders').select('id,patient_name,work_type').ilike('patient_name', like).limit(5),
      isAdmin
        ? supabase.from('profiles').select('id,full_name,email').ilike('full_name', like).limit(4)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const out: SR[] = [];

    (c.data ?? []).forEach(r => out.push({
      id: r.id, type: 'clinic',
      title: r.name,
      subtitle: [r.category, r.contact_person].filter(Boolean).join(' · ') || undefined,
      icon: 'briefcase',
      href: isAdmin ? `${adminPrefix}/clinics` : `${labPrefix}/clinics`,
    }));

    (d.data ?? []).forEach(r => out.push({
      id: r.id, type: 'doctor',
      title: r.full_name,
      subtitle: r.specialty ?? undefined,
      icon: 'activity',
      href: isAdmin ? `${adminPrefix}/clinics` : `${labPrefix}/clinics`,
    }));

    (o.data ?? []).forEach(r => out.push({
      id: r.id, type: 'order',
      title: r.patient_name ?? 'İsimsiz',
      subtitle: r.work_type ?? undefined,
      icon: 'file-text',
      href: isAdmin ? `/admin/orders/${r.id}` : `${labPrefix}/all-orders`,
    }));

    ((u as any).data ?? []).forEach((r: any) => out.push({
      id: r.id, type: 'user',
      title: r.full_name ?? 'Kullanıcı',
      subtitle: r.email ?? undefined,
      icon: 'user',
      href: `${adminPrefix}/users`,
    }));

    setResults(out);
    setLoading(false);
  }

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={gs.overlay} activeOpacity={1} onPress={onClose}>
        <View style={gs.panel} onStartShouldSetResponder={() => true}>

          {/* Input row */}
          <View style={gs.inputRow}>
            <Feather name="search" size={18} color="#AEAEB2" />
            <TextInput
              ref={inputRef}
              style={gs.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Klinik, hekim, sipariş, kullanıcı ara..."
              placeholderTextColor="#AEAEB2"
              returnKeyType="search"
              clearButtonMode="never"
            />
            {loading
              ? <ActivityIndicator size="small" color="#AEAEB2" />
              : query.length > 0
                ? (
                  <TouchableOpacity onPress={() => setQuery('')}>
                    <Feather name="x-circle" size={17} color="#AEAEB2" />
                  </TouchableOpacity>
                ) : null
            }
          </View>

          {/* Divider */}
          <View style={gs.divider} />

          {/* Results */}
          {results.length > 0 ? (
            <ScrollView style={gs.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {results.map(r => {
                const meta = SR_META[r.type];
                return (
                  <TouchableOpacity
                    key={`${r.type}-${r.id}`}
                    style={gs.row}
                    onPress={() => { router.push(r.href as any); onClose(); }}
                    activeOpacity={0.7}
                  >
                    <View style={[gs.rowIcon, { backgroundColor: meta.bg }]}>
                      <Feather name={r.icon as any} size={15} color={meta.color} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={gs.rowTitle} numberOfLines={1}>{r.title}</Text>
                      {r.subtitle ? <Text style={gs.rowSub} numberOfLines={1}>{r.subtitle}</Text> : null}
                    </View>
                    <View style={[gs.badge, { backgroundColor: meta.bg }]}>
                      <Text style={[gs.badgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : query.trim().length > 0 && !loading ? (
            <View style={gs.empty}>
              <Feather name="search" size={32} color="#E5E7EB" />
              <Text style={gs.emptyText}>Sonuç bulunamadı</Text>
            </View>
          ) : (
            <View style={gs.empty}>
              <Text style={gs.hintText}>Aramak istediğinizi yazın</Text>
            </View>
          )}

        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const gs = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 80 : 60,
    paddingHorizontal: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 600,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.18,
    shadowRadius: 40,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1C1C1E',
    outlineStyle: 'none',
  } as any,
  divider: { height: 1, backgroundColor: '#F1F5F9' },
  list:    { maxHeight: 420 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle:  { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  rowSub:    { fontSize: 12, color: '#AEAEB2' },
  badge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  empty: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 32, gap: 8,
  },
  emptyText: { fontSize: 14, color: '#AEAEB2' },
  hintText:  { fontSize: 13, color: '#AEAEB2', paddingBottom: 4 },
});

// ─── Shell ────────────────────────────────────────────────────────────────────
export function DesktopShell({ navItems, accentColor = C.primary }: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const { profile, signOut } = useAuthStore();
  const { width } = useWindowDimensions();

  const [hovered,    setHovered]    = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [navTooltip, setNavTooltip] = useState<{ label: string; y: number } | null>(null);
  const isAutoHide = AUTO_HIDE_PATHS.some(p => pathname.startsWith(p));
  const [rightOpen, setRightOpen] = useState(!isAutoHide);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const initials  = getInitials(profile?.full_name);
  const firstName = profile?.full_name?.split(' ')[0] ?? 'Kullanıcı';

  const normalizeHref = (href: string) => href.replace(/^\/\([^)]+\)/, '') || '/';

  const isActive = (item: NavItem) => {
    const h = normalizeHref(item.href);
    return item.matchPrefix
      ? pathname.startsWith(h)
      : pathname === h || pathname === h + '/';
  };

  const isDashboard = pathname === '/' || pathname === '';
  const showRight = width >= 1200 && !isDashboard;

  const activeItem     = navItems.find(n => isActive(n));
  const activeLabel    = activeItem?.label ?? 'Dashboard';

  return (
    <View style={s.shell}>

      {/* ── Sidebar ── */}
      <View style={[s.sidebar, sidebarCollapsed ? s.sidebarCollapsed : s.sidebarExpanded]}>

        {/* Logo */}
        <View style={[s.logoRow, sidebarCollapsed && s.logoRowCollapsed]}>
          <Image
            source={require('../../assets/images/icon.png')}
            style={s.logoImg}
            resizeMode="contain"
          />
          {!sidebarCollapsed && (
            <Text style={s.logoTitle}>Dental Lab</Text>
          )}
        </View>

        {/* Nav items */}
        <ScrollView style={s.navScroll} showsVerticalScrollIndicator={false}>
          {navItems.map(item => {
            const active = isActive(item);
            const hover  = hovered === item.href;
            return (
              <React.Fragment key={item.href}>
              {item.sectionLabel && (
                <View style={s.navSectionRow}>
                  {sidebarCollapsed
                    ? <View style={s.navSectionLine} />
                    : <Text style={s.navSectionLabel}>{item.sectionLabel}</Text>
                  }
                </View>
              )}
              <TouchableOpacity
                style={[
                  s.navItem,
                  sidebarCollapsed && s.navItemCollapsed,
                  active && [s.navItemActive, { backgroundColor: accentColor + '14' }],
                  !active && hover && s.navItemHover,
                ]}
                onPress={() => item.onPress ? item.onPress() : router.push(item.href as any)}
                // @ts-ignore
                onMouseEnter={(e: any) => { setHovered(item.href); if (sidebarCollapsed) setNavTooltip({ label: item.label, y: e.nativeEvent.pageY }); }}
                onMouseLeave={() => { setHovered(null); setNavTooltip(null); }}
                accessibilityLabel={item.label}
              >
                <NavIcon item={item} active={active} accentColor={accentColor} />
                {!sidebarCollapsed && (
                  <>
                    <Text style={[s.navLabel, active && { color: accentColor, fontWeight: '600' }]}>{item.label}</Text>
                    {item.badgeCount !== undefined && item.badgeCount > 0
                      ? <View style={s.navBadgeCount}><Text style={s.navBadgeCountText}>{item.badgeCount}</Text></View>
                      : item.badge && <View style={[s.navBadgeDot, { backgroundColor: active ? accentColor : C.danger }]} />
                    }
                  </>
                )}
              </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </ScrollView>

        {/* Bottom: logout + user + toggle */}
        <View style={s.sidebarBottom}>
          <View style={s.navDivider} />

          {/* Logout */}
          <TouchableOpacity
            style={[s.navItem, sidebarCollapsed && s.navItemCollapsed, hovered === '__out' && s.navItemLogout]}
            onPress={signOut}
            // @ts-ignore
            onMouseEnter={(e: any) => { setHovered('__out'); if (sidebarCollapsed) setNavTooltip({ label: 'Çıkış Yap', y: e.nativeEvent.pageY }); }}
            onMouseLeave={() => { setHovered(null); setNavTooltip(null); }}
          >
            <Feather name="log-out" size={17} color={hovered === '__out' ? C.danger : '#64748B'} />
            {!sidebarCollapsed && (
              <Text style={[s.navLabel, hovered === '__out' && { color: C.danger }]}>Çıkış Yap</Text>
            )}
          </TouchableOpacity>

          {/* User row + toggle */}
          <View style={[s.userCard, sidebarCollapsed && s.userCardCollapsed]}>
            <View style={[s.userAvatar, { backgroundColor: accentColor }]}>
              {(profile as any)?.avatar_url
                ? <Image source={{ uri: (profile as any).avatar_url }} style={s.userAvatarImg} />
                : <Text style={s.userAvatarText}>{initials}</Text>}
            </View>
            {!sidebarCollapsed && (
              <View style={s.userInfo}>
                <Text style={s.userName} numberOfLines={1}>{firstName}</Text>
                <Text style={s.userRole} numberOfLines={1}>
                  {(profile as any)?.role ?? (profile as any)?.user_type ?? 'Kullanıcı'}
                </Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => setSidebarCollapsed(v => !v)}
              style={[s.sidebarToggle, sidebarCollapsed && s.sidebarToggleCollapsed]}
              activeOpacity={0.7}
            >
              <Feather
                name={sidebarCollapsed ? 'chevron-right' : 'chevron-left' as any}
                size={13}
                color="#AEAEB2"
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Main ── */}
      <View style={s.main}>
        {/* Header bar — like Overpay: title left, icons + avatar right */}
        <View style={s.header}>
          <BlurFade key={activeLabel}>
            <Text style={s.headerTitle}>{activeLabel}</Text>
          </BlurFade>
          <View style={s.headerRight}>
            <TouchableOpacity style={s.headerIcon} onPress={() => setShowSearch(true)}>
              <Feather name="search" size={18} color={C.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={s.headerIcon}>
              <Feather name="bell" size={18} color={C.textSecondary} />
              {/* Notification red dot */}
              <View style={s.notifDot} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Page content */}
        <View style={s.page}>
          <Slot />
        </View>
      </View>

      {/* ── Global Search ── */}
      <GlobalSearch
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        userType={(profile as any)?.user_type ?? 'admin'}
      />

      {/* ── Right panel ── */}
      {showRight && (
        <RightPanel
          accentColor={accentColor}
          profile={profile}
          open={rightOpen}
          onToggle={() => setRightOpen(v => !v)}
        />
      )}

      {/* ── Collapsed sidebar tooltip (shell-level to avoid ScrollView clipping) ── */}
      {sidebarCollapsed && navTooltip && (
        <View
          style={[s.tooltip, { top: navTooltip.y - 14 }]}
          pointerEvents="none"
        >
          <Text style={s.tooltipText}>{navTooltip.label}</Text>
        </View>
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
    backgroundColor: '#FFFFFF',
  },

  /* ── Sidebar (Stitch) ── */
  sidebar: {
    backgroundColor: '#F8FAFC',
    flexDirection: 'column',
    paddingTop: 22,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    zIndex: 100,
    overflow: 'visible' as any,
  },
  sidebarExpanded:  { width: SIDEBAR_W },
  sidebarCollapsed: { width: SIDEBAR_COLLAPSED_W },

  // Logo
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginBottom: 24,
    gap: 10,
    minHeight: 40,
  },
  logoRowCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  logoImg: { width: 34, height: 34, flexShrink: 0 },
  logoTitle:  { fontSize: 14, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  logoSub:    { fontSize: 10, color: '#94A3B8', marginTop: 1 },

  // Nav
  navScroll: { flex: 1, paddingHorizontal: 10 },
  navSectionRow: {
    paddingHorizontal: 14, paddingTop: 18, paddingBottom: 4,
  },
  navSectionLine:  { height: 1, backgroundColor: '#E2E8F0', marginVertical: 8 },
  navSectionLabel: { fontSize: 9, fontWeight: '800' as const, color: '#94A3B8', letterSpacing: 1.4,
                     textTransform: 'uppercase' as const },

  navDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 10,
    marginBottom: 6,
  },

  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 2,
    gap: 12,
    minHeight: 42,
  },
  navItemCollapsed: {
    width: 44,
    height: 44,
    minHeight: 44,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginBottom: 4,
  },
  navItemActive: {
    backgroundColor: '#FFFFFF',
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 0 0 1px rgba(15,23,42,0.04)',
  },
  navItemHover:   { backgroundColor: 'rgba(255,255,255,0.6)' },
  navItemLogout:  { backgroundColor: '#FEF2F2' },
  navLabel:       { flex: 1, fontSize: 13, fontWeight: '500', color: '#64748B', letterSpacing: -0.1 },
  navLabelActive: { fontWeight: '600' },
  navBadgeDot:       { width: 7, height: 7, borderRadius: 4 },
  navBadgeCount:     { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  navBadgeCountText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },

  // Tooltip — appears to the right when collapsed
  tooltip: {
    // @ts-ignore
    position: 'fixed',
    left: SIDEBAR_COLLAPSED_W + 8,
    backgroundColor: '#1C1C1E',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    zIndex: 9999,
    // @ts-ignore
    boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
    // @ts-ignore
    whiteSpace: 'nowrap',
    // @ts-ignore
    pointerEvents: 'none',
  },
  tooltipText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },

  // Bottom section
  sidebarBottom: { paddingHorizontal: 10, paddingBottom: 16 },

  // User card + toggle
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 2,
    gap: 10,
  },
  userCardCollapsed: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: 0,
    gap: 8,
  },
  userAvatar:     { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  userAvatarImg:  { width: 34, height: 34, borderRadius: 17 },
  userAvatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  userInfo:       { flex: 1 },
  userName:       { fontSize: 13, fontWeight: '700', color: '#0F172A', letterSpacing: -0.1 },
  userRole:       { fontSize: 11, color: '#94A3B8', textTransform: 'capitalize', marginTop: 1 },
  sidebarToggle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sidebarToggleCollapsed: {
    marginTop: 4,
  },

  /* ── Main ── */
  main: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },

  /* ── Header bar (Stitch style — big extrabold title) ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingVertical: 24,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.9,
    lineHeight: 38,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  headerDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 8,
  },
  headerProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  headerName: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },

  /* ── Page ── */
  page: { flex: 1, backgroundColor: '#FFFFFF' },
});
