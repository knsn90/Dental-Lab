// ─────────────────────────────────────────────────────────────────────────────
// "Cards" Design System
// ─────────────────────────────────────────────────────────────────────────────
//   Bu uygulamadaki tüm görsel dilin adı: "Cards".
//
//   Temel öğeler:
//     • Background              — sade gri (#F1F5F9)
//     • Beyaz kartlar            — bg #FFFFFF, ince saydam border
//     • İnce border              — rgba(255,255,255,0.95)
//     • Yumuşak iç gloss         — inset 0 1px 0 rgba(255,255,255,0.85)
//     • ⭐ STANDART KART GÖLGESİ  — `0 8px 24px rgba(0,0,0,0.15)`
//                                  (X=0, Y=8, blur=24, alpha=15%, color=#000)
//                                  Tüm kartlarda (sidebar, ticket, list, vs.)
//                                  bu gölge kullanılır.
//     • Sidebar köşeler          — açık 16, kapalı 9999 (pill)
// ─────────────────────────────────────────────────────────────────────────────
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
import { usePageTitleStore } from '../store/pageTitleStore';
import { useOrders } from '../../modules/orders/hooks/useOrders';
import { supabase } from '../api/supabase';
import { BlurFade } from '../ui/BlurFade';

import { AppIcon } from '../ui/AppIcon';
import { NotificationPopover } from '../ui/NotificationPopover';

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
const RIGHT_W              = 320;
const TOGGLE_W             = 24;

const AUTO_HIDE_PATHS = ['/new-order', '/orders/new'];

// ─── Types ────────────────────────────────────────────────────────────────────
export interface NavItem {
  label: string;
  emoji: string;
  href: string;
  matchPrefix?: boolean;
  badge?: boolean;
  badgeCount?: number;
  /** Lucide ikon adı (kebab-case). Örn: "home", "clipboard-list" */
  iconName?: string;
  subtitle?: string;
  sectionLabel?: string;
  onPress?: () => void;
}

interface Props {
  navItems: NavItem[];
  accentColor?: string;
  /** Header'daki mesaj ikonuna basıldığında çağrılır (popup vs için).
   *  Verilmezse mesaj ikonu gösterilmez. */
  onPressMessages?: () => void;
  /** Mesaj ikonundaki okunmamış badge sayısı */
  messagesUnreadCount?: number;
  /** Bildirim (zil) ikonundaki badge sayısı */
  notificationsCount?: number;
  /** Panel teması — background gradient renklerini belirler (default: lab=gri) */
  panelType?: 'lab' | 'admin' | 'doctor' | 'clinic_admin';
}

// ─── Shared icon badge ────────────────────────────────────────────────────────
function IconBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={s.iconBadge}>
      <Text style={s.iconBadgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

function getInitials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function NavIcon({
  item, active, accentColor, showBadge,
}: { item: NavItem; active: boolean; accentColor: string; showBadge?: boolean }) {
  const iconColor = active ? accentColor : '#94A3B8';
  const badgeNum  = item.badgeCount;
  const badgeDot  = !badgeNum && item.badge;

  return (
    <View style={{ position: 'relative' }}>
      {item.iconName ? (
        <AppIcon name={item.iconName} size={20} color={iconColor} strokeWidth={1.75} />
      ) : (
        <Text style={{ fontSize: 17, opacity: active ? 1 : 0.5, width: 22, textAlign: 'center' }}>{item.emoji}</Text>
      )}
      {showBadge && (badgeNum || badgeDot) && (
        <View
          style={{
            position: 'absolute',
            top: -4, right: -6,
            minWidth: badgeNum && badgeNum > 9 ? 18 : 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: '#DC2626',
            paddingHorizontal: 3,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1.5, borderColor: '#FFFFFF',
          }}
        >
          {badgeNum ? (
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.2 }}>
              {badgeNum > 99 ? '99+' : badgeNum}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
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
      {/* Toggle — hero card hizasında küçük yuvarlak buton */}
      <TouchableOpacity onPress={onToggle} style={rp.toggleBtn} activeOpacity={0.7}>
        <AppIcon
          name={open ? 'chevron-right' : 'chevron-left' as any}
          size={16}
          color="#64748B"
        />
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
    backgroundColor: 'transparent',
    flexDirection: 'row',
    borderLeftWidth: 0,
    paddingTop: 100,   // hero card hizası (header 88 + pageGrid padding 12)
  },
  panelOpen:   { width: RIGHT_W + TOGGLE_W },
  panelClosed: { width: TOGGLE_W + 16 },
  toggleBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    marginTop: 8,
    marginRight: 4,
    ...Platform.select({
      web: {
        // @ts-ignore
        transform: 'translateZ(0)',
        // @ts-ignore
        backdropFilter:       'blur(16px)',
        // @ts-ignore
        WebkitBackdropFilter: 'blur(16px)',
        // @ts-ignore
        boxShadow:
          '0 4px 12px rgba(15,23,42,0.06),' +
          ' inset 0 1px 0 rgba(255,255,255,0.85)',
      } as any,
      default: {},
    }),
  },
  scroll: { paddingTop: 0, paddingBottom: 12 },

  /* Profile — centered glass card */
  profileCard: {
    marginHorizontal: 6, marginBottom: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    padding: 16, alignItems: 'center', gap: 8,
    ...Platform.select({
      web: {
        // @ts-ignore — GPU compositing zorla (banding fix)
        transform: 'translateZ(0)',
        // @ts-ignore
        backdropFilter:       'blur(48px) saturate(220%)',
        // @ts-ignore
        WebkitBackdropFilter: 'blur(48px) saturate(220%)',
        // @ts-ignore
        boxShadow:
          '0 8px 24px rgba(0,0,0,0.15),' +
          ' inset 0 1px 0 rgba(255,255,255,0.85),' +
          ' inset 1px 0 0 rgba(255,255,255,0.55)',
      } as any,
      default: {},
    }),
  },
  avatar:      { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg:   { width: 72, height: 72, borderRadius: 36 },
  avatarText:  { color: '#fff', fontSize: 22, fontWeight: '800' },
  profileName: { fontSize: 14, fontWeight: '700', color: '#1C1C1E', textAlign: 'center' },
  rolePill:    { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  roleLabel:   { fontSize: 11, fontWeight: '600' },

  /* Stats — 2×2 glass card */
  statsCard: {
    marginHorizontal: 6, marginBottom: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        // @ts-ignore — GPU compositing zorla (banding fix)
        transform: 'translateZ(0)',
        // @ts-ignore
        backdropFilter:       'blur(48px) saturate(220%)',
        // @ts-ignore
        WebkitBackdropFilter: 'blur(48px) saturate(220%)',
        // @ts-ignore
        boxShadow:
          '0 8px 24px rgba(0,0,0,0.15),' +
          ' inset 0 1px 0 rgba(255,255,255,0.85),' +
          ' inset 1px 0 0 rgba(255,255,255,0.55)',
      } as any,
      default: {},
    }),
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

  /* Orders — glass card */
  ordersCard: {
    marginHorizontal: 6,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        // @ts-ignore — GPU compositing zorla (banding fix)
        transform: 'translateZ(0)',
        // @ts-ignore
        backdropFilter:       'blur(48px) saturate(220%)',
        // @ts-ignore
        WebkitBackdropFilter: 'blur(48px) saturate(220%)',
        // @ts-ignore
        boxShadow:
          '0 8px 24px rgba(0,0,0,0.15),' +
          ' inset 0 1px 0 rgba(255,255,255,0.85),' +
          ' inset 1px 0 0 rgba(255,255,255,0.55)',
      } as any,
      default: {},
    }),
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
            <AppIcon name="search" size={18} color="#AEAEB2" />
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
                    <AppIcon name="x-circle" size={17} color="#AEAEB2" />
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
                      <AppIcon name={r.icon as any} size={15} color={meta.color} />
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
              <AppIcon name="search" size={32} color="#E5E7EB" />
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
export function DesktopShell({ navItems, accentColor = C.primary, onPressMessages, messagesUnreadCount = 0, notificationsCount = 0, panelType = 'lab' }: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const { profile, signOut } = useAuthStore();
  const { width } = useWindowDimensions();

  const [hovered,    setHovered]    = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [notifOpen, setNotifOpen]   = useState(false);
  const [navTooltip, setNavTooltip] = useState<{ label: string; y: number } | null>(null);
  const isAutoHide = AUTO_HIDE_PATHS.some(p => pathname.startsWith(p));
  const [rightOpen, setRightOpen] = useState(!isAutoHide);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // ── Nav items'ı gruplara ayır ────────────────────────────────────────
  type NavGroup = { label: string | null; items: NavItem[] };
  const navGroups = React.useMemo((): NavGroup[] => {
    const groups: NavGroup[] = [];
    let current: NavGroup = { label: null, items: [] };
    for (const item of navItems) {
      if (item.sectionLabel) {
        if (current.items.length > 0 || current.label !== null) groups.push(current);
        current = { label: item.sectionLabel, items: [item] };
      } else {
        current.items.push(item);
      }
    }
    if (current.items.length > 0 || current.label !== null) groups.push(current);
    return groups;
  }, [navItems]);

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

  const activeItem        = navItems.find(n => isActive(n));
  // Detay ekranları (örn. OrderDetail) override edebilir; yoksa nav item label'ı
  const overrideTitle     = usePageTitleStore(s => s.title);
  const overrideSubtitle  = usePageTitleStore(s => s.subtitle);
  const overrideActions   = usePageTitleStore(s => s.actions);
  const activeLabel       = overrideTitle ?? activeItem?.label ?? 'Dashboard';
  const activeSubtitle    = overrideTitle ? overrideSubtitle : null;
  const activeActions     = overrideTitle ? overrideActions : null;

  // ── Pastel mesh background — beyaz baskın, sönük renk lekeleri ──────────
  // YEDEKLER:
  //   GEOMETRIK: radial-gradient(circle 480px at 88% 8%, ...) + diagonal stripe
  //   AURORA:    linear-gradient(115deg, transparent, rgba(...) 30%, transparent 60%) + 3 katman
  const meshBg = Platform.OS === 'web'
    ? (panelType === 'doctor'
        // Hekim — pastel mint + sky + sage
        ? 'radial-gradient(at 20% 30%, #D1FAE5 0%, transparent 22%),'
          + ' radial-gradient(at 80% 20%, #CFFAFE 0%, transparent 22%),'
          + ' radial-gradient(at 60% 70%, #ECFCCB 0%, transparent 22%),'
          + ' radial-gradient(at 30% 90%, #A7F3D0 0%, transparent 22%)'
        : panelType === 'clinic_admin'
        // Klinik — pastel lavanta + pembe
        ? 'radial-gradient(at 20% 30%, #E9D5FF 0%, transparent 22%),'
          + ' radial-gradient(at 80% 20%, #FCE7F3 0%, transparent 22%),'
          + ' radial-gradient(at 60% 70%, #DDD6FE 0%, transparent 22%),'
          + ' radial-gradient(at 30% 90%, #FBCFE8 0%, transparent 22%)'
        : panelType === 'admin'
        // Admin — sade pastel gri/mavi
        ? 'radial-gradient(at 20% 30%, #E2E8F0 0%, transparent 22%),'
          + ' radial-gradient(at 80% 20%, #F1F5F9 0%, transparent 22%),'
          + ' radial-gradient(at 60% 70%, #E5E7EB 0%, transparent 22%),'
          + ' radial-gradient(at 30% 90%, #DBEAFE 0%, transparent 22%)'
        // Lab (default) — sönük pastel: peach + sky + lavender + mint
        : 'radial-gradient(at 20% 30%, #FFE4E1 0%, transparent 22%),'    // peach pembe
          + ' radial-gradient(at 80% 20%, #DBEAFE 0%, transparent 22%),'  // açık mavi
          + ' radial-gradient(at 60% 70%, #E9D5FF 0%, transparent 22%),'  // lavanta
          + ' radial-gradient(at 30% 90%, #D1FAE5 0%, transparent 22%)')   // nane
    : undefined;

  // Sade gri arkaplan — mesh devre dışı (yedek olarak meshBg yukarıda)
  void meshBg;

  return (
    <View style={[s.shell, ({ backgroundImage: 'none', backgroundColor: '#F1F5F9' } as any)]}>

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

        {/* Nav items — grouped & collapsible */}
        <ScrollView style={s.navScroll} showsVerticalScrollIndicator={false}>
          {navGroups.map((group, gi) => {
            return (
              <View key={gi}>
                {group.items.map(item => {
                  const active = isActive(item);
                  const hover  = hovered === item.href;
                  return (
                    <TouchableOpacity
                      key={item.href}
                      style={[
                        s.navItem,
                        sidebarCollapsed && s.navItemCollapsed,
                        active && [
                          s.navItemActive,
                          {
                            // Cam-vurgu (heroBigActionBtn ile aynı dil): yumuşak diyagonal
                            // gradient + şeffaf beyaz border + üst inset gloss + dış gölge
                            backgroundColor: accentColor + '20',
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.35)',
                            // @ts-ignore
                            backgroundImage: `linear-gradient(135deg, ${accentColor}28 0%, ${accentColor}18 50%, ${accentColor}28 100%)`,
                            // @ts-ignore
                            boxShadow:
                              `0 4px 12px ${accentColor}30,` +
                              ' inset 0 1px 0 rgba(255,255,255,0.55),' +
                              ' inset 0 -1px 0 rgba(255,255,255,0.10)',
                          },
                        ],
                        !active && hover && s.navItemHover,
                      ]}
                      onPress={() => item.onPress ? item.onPress() : router.push(item.href as any)}
                      // @ts-ignore
                      onMouseEnter={(e: any) => { setHovered(item.href); if (sidebarCollapsed) setNavTooltip({ label: item.label, y: e.nativeEvent.pageY }); }}
                      onMouseLeave={() => { setHovered(null); setNavTooltip(null); }}
                      accessibilityLabel={item.label}
                    >
                      {/* Active left accent bar */}
                      {active && !sidebarCollapsed && (
                        <View style={[s.navAccentBar, { backgroundColor: accentColor }]} />
                      )}
                      <NavIcon item={item} active={active} accentColor={accentColor} showBadge={sidebarCollapsed} />
                      {!sidebarCollapsed && (
                        <>
                          <Text style={[s.navLabel, active && { color: accentColor, fontWeight: '700' }]}>
                            {item.label}
                          </Text>
                          {item.badgeCount !== undefined && item.badgeCount > 0 ? (
                            <View style={s.navBadgeCount}>
                              <Text style={s.navBadgeCountText}>{item.badgeCount}</Text>
                            </View>
                          ) : item.badge ? (
                            <View style={s.navBadgeCount}>
                              <Text style={s.navBadgeCountText}>!</Text>
                            </View>
                          ) : null}
                        </>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>

        {/* Bottom: just the collapse toggle */}
        <View style={s.sidebarBottom}>
          <View style={s.navDivider} />
          <TouchableOpacity
            onPress={() => setSidebarCollapsed(v => !v)}
            style={[s.collapseRow, sidebarCollapsed && s.collapseRowCollapsed]}
            activeOpacity={0.7}
          >
            <AppIcon
              name={sidebarCollapsed ? 'chevron-right' : 'chevron-left'}
              size={16}
              color="#94A3B8"
              strokeWidth={2}
            />
            {!sidebarCollapsed && <Text style={s.collapseLabel}>Daralt</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Main ── */}
      <View style={s.main}>
        {/* Header bar — like Overpay: title left, icons + avatar right */}
        <View style={s.header}>
          <BlurFade key={activeLabel + (activeSubtitle ?? '')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View>
                <Text style={s.headerTitle}>{activeLabel}</Text>
                {activeSubtitle ? (
                  <Text style={s.headerSubtitle} numberOfLines={1}>{activeSubtitle}</Text>
                ) : null}
              </View>
              {activeActions}
            </View>
          </BlurFade>
          <View style={s.headerRight}>
            <TouchableOpacity style={s.headerIcon} onPress={() => setShowSearch(true)}>
              <AppIcon name="search" size={18} color={C.textSecondary} />
            </TouchableOpacity>
            {/* Bildirim zili — popover tetikleyici */}
            <TouchableOpacity
              style={[s.headerIcon, hovered === '__notif' && { backgroundColor: C.navHover }]}
              onPress={() => setNotifOpen(v => !v)}
              // @ts-ignore
              onMouseEnter={() => setHovered('__notif')}
              onMouseLeave={() => setHovered(null)}
              accessibilityLabel="Bildirimler"
            >
              <AppIcon name="bell" size={18} color={hovered === '__notif' ? accentColor : C.textSecondary} />
              <IconBadge count={notificationsCount} />
            </TouchableOpacity>

            {/* Mesajlar — popup tetikleyici */}
            {onPressMessages && (
              <TouchableOpacity
                style={[s.headerIcon, hovered === '__msg' && { backgroundColor: C.navHover }]}
                onPress={onPressMessages}
                // @ts-ignore
                onMouseEnter={() => setHovered('__msg')}
                onMouseLeave={() => setHovered(null)}
                accessibilityLabel="Mesajlar"
              >
                <AppIcon name="message-circle" size={18} color={hovered === '__msg' ? accentColor : C.textSecondary} />
                <IconBadge count={messagesUnreadCount} />
              </TouchableOpacity>
            )}

            <View style={s.headerDivider} />

            {/* Profile avatar — tap to open profile */}
            <TouchableOpacity
              style={s.headerProfile}
              onPress={() => {
                const isAdmin = (profile as any)?.user_type === 'admin';
                router.push((isAdmin ? '/(admin)/profile' : '/(lab)/profile') as any);
              }}
              // @ts-ignore
              onMouseEnter={() => setHovered('__prof')}
              onMouseLeave={() => setHovered(null)}
              activeOpacity={0.8}
            >
              <View style={[s.headerAvatar, { backgroundColor: accentColor }]}>
                {(profile as any)?.avatar_url
                  ? <Image source={{ uri: (profile as any).avatar_url }} style={s.headerAvatarImg} />
                  : <Text style={s.headerAvatarText}>{initials}</Text>}
              </View>
              {width >= 1024 && (
                <View style={s.headerProfileMeta}>
                  <Text style={s.headerName} numberOfLines={1}>{firstName}</Text>
                  <Text style={s.headerRole} numberOfLines={1}>
                    {(profile as any)?.role === 'manager'    ? 'Mesul Müdür'
                     : (profile as any)?.role === 'technician' ? 'Teknisyen'
                     : (profile as any)?.user_type === 'admin' ? 'Yönetici'
                     : (profile as any)?.user_type === 'lab'   ? 'Lab'
                     : 'Kullanıcı'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Logout */}
            <TouchableOpacity
              style={[s.headerIcon, hovered === '__out' && s.headerIconLogout]}
              onPress={signOut}
              // @ts-ignore
              onMouseEnter={() => setHovered('__out')}
              onMouseLeave={() => setHovered(null)}
              accessibilityLabel="Çıkış Yap"
            >
              <AppIcon name="log-out" size={18} color={hovered === '__out' ? C.danger : C.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Page content */}
        <View style={s.page}>
          <Slot />
        </View>
      </View>

      {/* ── Global Search ── */}
      {/* Bildirim popover'ı (sadece açıkken mount edilir — useOrders fetch'i tetiklemesin) */}
      {notifOpen && (
        <NotificationPopover
          visible
          onClose={() => setNotifOpen(false)}
          anchorTop={60}
          anchorRight={16}
        />
      )}

      <GlobalSearch
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        userType={(profile as any)?.user_type ?? 'admin'}
      />

      {/* Right panel kaldırıldı */}

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
    backgroundColor: '#FFFFFF', // beyaz taban
    ...Platform.select({
      web: {
        // @ts-ignore — GPU compositing zorla (subpixel banding fix)
        transform: 'translateZ(0)',
        // @ts-ignore — daha geniş yumuşak gradient'lar (banding'i smooth'lar)
        backgroundImage:
          'radial-gradient(ellipse 50% 35% at 12% 15%, rgba(100,116,139,0.30) 0%, transparent 70%),' +
          ' radial-gradient(ellipse 40% 30% at 88% 18%, rgba(71,85,105,0.28) 0%, transparent 75%),' +
          ' radial-gradient(ellipse 55% 38% at 50% 60%, rgba(148,163,184,0.22) 0%, transparent 75%),' +
          ' radial-gradient(ellipse 50% 38% at 18% 85%, rgba(148,163,184,0.32) 0%, transparent 80%),' +
          ' radial-gradient(ellipse 45% 36% at 88% 88%, rgba(71,85,105,0.28) 0%, transparent 75%)',
      } as any,
      default: {},
    }),
  },

  /* ── Sidebar ── floating white card */
  sidebar: {
    backgroundColor: '#FFFFFF',
    flexDirection:   'column',
    paddingTop:      16,
    borderRightWidth: 0,
    zIndex:          100,
    overflow:        'visible' as any,
    margin:          12,
    borderRadius:    9999,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.95)',
    ...Platform.select({
      web: {
        // @ts-ignore — frosted glass
        backdropFilter:       'blur(48px) saturate(220%)',
        // @ts-ignore
        WebkitBackdropFilter: 'blur(48px) saturate(220%)',
        // @ts-ignore — yumuşak tek katman gölge (keskin çizgi olmasın)
        boxShadow:
          '0 8px 24px rgba(0,0,0,0.15),' +
          ' inset 0 1px 0 rgba(255,255,255,0.85),' +
          ' inset 1px 0 0 rgba(255,255,255,0.65)',
        // @ts-ignore
        transition: 'width 0.25s ease, border-radius 0.25s ease',
      } as any,
      default: {
        // Native: backdrop-filter yok, klasik gölge
        shadowColor:   '#0F172A',
        shadowOpacity: 0.10,
        shadowRadius:  24,
        shadowOffset:  { width: 0, height: 6 },
        elevation:     8,
      },
    }),
  },
  sidebarExpanded:  { width: SIDEBAR_W,           borderRadius: 16 },
  sidebarCollapsed: { width: SIDEBAR_COLLAPSED_W, borderRadius: 9999 },

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
  navScroll: { flex: 1, paddingHorizontal: 4 },

  /* Her nav grubu kendi cam kartında */
  navGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.95)',
    paddingVertical: 6,
    paddingHorizontal: 6,
    ...Platform.select({
      web: {
        // @ts-ignore — GPU compositing zorla (banding fix)
        transform: 'translateZ(0)',
        // @ts-ignore
        backdropFilter:       'blur(48px) saturate(220%)',
        // @ts-ignore
        WebkitBackdropFilter: 'blur(48px) saturate(220%)',
        // @ts-ignore
        boxShadow:
          '0 8px 24px rgba(0,0,0,0.15),' +
          ' inset 0 1px 0 rgba(255,255,255,0.85),' +
          ' inset 1px 0 0 rgba(255,255,255,0.55)',
      } as any,
      default: {},
    }),
  },

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
    borderRadius: 10,
  },
  navItemHover:   { backgroundColor: 'rgba(0,0,0,0.04)' },
  navItemLogout:  { backgroundColor: '#FEF2F2' },
  navLabel:       { flex: 1, fontSize: 13, fontWeight: '500', color: '#64748B', letterSpacing: -0.1 },
  navLabelActive: { fontWeight: '600' },
  navAccentBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
  },
  navBadgeDot:       { width: 7, height: 7, borderRadius: 4 },
  navBadgeCount:     { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  navBadgeCountText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },

  // Tooltip — appears to the right when collapsed
  tooltip: {
    // @ts-ignore
    position: 'fixed',
    left: SIDEBAR_COLLAPSED_W + 12 + 12, // card margin (12) + collapsed width + gap
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
  sidebarBottom: { paddingHorizontal: 10, paddingBottom: 12 },

  // Collapse toggle row
  collapseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth: 0,
  },
  collapseRowCollapsed: {
    paddingVertical: 8,
  },
  collapseLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: -0.1,
  },

  /* ── Main ── */
  main: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },

  /* ── Header bar — seamless, no divider ── */
  header: {
    flexDirection:    'row',
    alignItems:       'center',          // dikey ortalı (1 veya 2 satır title fark etmez)
    justifyContent:   'space-between',
    paddingHorizontal: 32,
    paddingVertical:   20,
    minHeight:         88,                // sabit dikey alan → ortalama tutarlı
    backgroundColor:  'transparent',
    borderBottomWidth: 0,
  },
  headerTitle: {
    fontSize:      28,
    fontWeight:    '800',
    color:         '#0F172A',
    letterSpacing: -0.7,
    lineHeight:    34,
  },
  headerSubtitle: {
    fontSize:      13,
    fontWeight:    '500',
    color:         '#64748B',
    letterSpacing: 0.1,
    marginTop:     2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // Cards stilinde beyaz pill kart — viewport sağ üst köşeye sabitlenir
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    ...Platform.select({
      web: {
        // @ts-ignore
        position: 'fixed' as any,
        top: 16,
        right: 16,
        zIndex: 200,
        // @ts-ignore
        boxShadow:
          '0 1px 3px rgba(15,23,42,0.06),' +
          ' 0 8px 24px rgba(15,23,42,0.04),' +
          ' inset 0 1px 0 rgba(255,255,255,0.85)',
      },
      default: {},
    }),
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerIconLogout: { backgroundColor: '#FEF2F2' },
  // Hem bildirim (zil) hem mesaj ikonu için paylaşılan badge
  iconBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  iconBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 14,
  },
  headerDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
  },
  headerProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  headerProfileMeta: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerAvatarImg:  { width: 30, height: 30, borderRadius: 15 },
  headerAvatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  headerName:       { fontSize: 13, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 },
  headerRole:       { fontSize: 10, color: '#94A3B8', marginTop: 1, letterSpacing: 0.2 },

  /* ── Page ── */
  page: { flex: 1, backgroundColor: 'transparent' },
});
