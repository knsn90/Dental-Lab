import React, { useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  TouchableOpacity, RefreshControl, ScrollView,
  useWindowDimensions, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';
import { useOrderChatInbox } from '../hooks/useOrderChatInbox';
import { STATUS_CONFIG } from '../constants';
import { WorkOrderStatus } from '../../../lib/types';

// ── Tokens (aligned with frontend-design skill) ──────────────────────
const BG = '#F7F9FB';
const CLR = {
  red:    '#EF4444', redBg:    '#FEE2E2',
  green:  '#16A34A', greenBg:  '#DCFCE7',
  amber:  '#F59E0B', amberBg:  '#FEF3C7',
  purple: '#7C3AED', purpleBg: '#EDE9FE',
};

// ── Icons ────────────────────────────────────────────────────────────
type IconName = 'search' | 'message-circle' | 'image' | 'mic' | 'paperclip' | 'filter' | 'arrow-right' | 'x';
function Icon({ name, size = 18, color = '#0F172A', strokeWidth = 1.8 }: {
  name: IconName; size?: number; color?: string; strokeWidth?: number;
}) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (name) {
    case 'search':         return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="11" cy="11" r="8" {...p}/><Line x1="21" y1="21" x2="16.65" y2="16.65" {...p}/></Svg>;
    case 'message-circle': return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" {...p}/></Svg>;
    case 'image':          return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14" {...p}/><Circle cx="8.5" cy="8.5" r="1.5" {...p}/><Polyline points="21 15 16 10 5 21" {...p}/></Svg>;
    case 'mic':            return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" {...p}/><Path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" {...p}/></Svg>;
    case 'paperclip':      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" {...p}/></Svg>;
    case 'filter':         return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" {...p}/></Svg>;
    case 'arrow-right':    return <Svg width={size} height={size} viewBox="0 0 24 24"><Line x1="5" y1="12" x2="19" y2="12" {...p}/><Polyline points="12 5 19 12 12 19" {...p}/></Svg>;
    case 'x':              return <Svg width={size} height={size} viewBox="0 0 24 24"><Line x1="18" y1="6" x2="6" y2="18" {...p}/><Line x1="6" y1="6" x2="18" y2="18" {...p}/></Svg>;
    default: return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────
function hexA(hex: string, a: number) {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  } catch { return hex; }
}

function initials(name?: string | null) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function formatTime(ts?: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const date  = new Date(d); date.setHours(0, 0, 0, 0);
  const diff = (today.getTime() - date.getTime()) / 86_400_000;
  if (diff === 0) {
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff === 1) return 'Dün';
  if (diff <= 6) {
    return ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'][d.getDay()];
  }
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
}

// Color seed based on order_id for avatar tint consistency
const AVATAR_PALETTE = ['#0EA5E9','#059669','#D97706','#7C3AED','#DB2777','#0891B2','#EA580C','#4F46E5'];
function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xff;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function lastPreview(item: {
  last_content?: string | null;
  last_attachment_type?: string | null;
  last_sender_id?: string | null;
  last_sender_type?: string | null;
}, currentUserId: string | null): { text: string; isMine: boolean } {
  const isMine = !!item.last_sender_id && item.last_sender_id === currentUserId;
  if (!item.last_content && !item.last_attachment_type) {
    return { text: 'Henüz mesaj yok', isMine: false };
  }
  const prefix = isMine ? 'Siz: ' : '';
  if (item.last_attachment_type === 'image') {
    return { text: `${prefix}📷 Fotoğraf${item.last_content ? ` · ${item.last_content}` : ''}`, isMine };
  }
  if (item.last_attachment_type === 'audio') {
    return { text: `${prefix}🎙️ Sesli mesaj`, isMine };
  }
  if (item.last_attachment_type === 'file') {
    return { text: `${prefix}📎 Dosya${item.last_content ? ` · ${item.last_content}` : ''}`, isMine };
  }
  return { text: `${prefix}${item.last_content ?? ''}`, isMine };
}

// ── Inbox Row ────────────────────────────────────────────────────────
interface InboxRowProps {
  item: any;
  accent: string;
  currentUserId: string | null;
  onPress: () => void;
}
function InboxRow({ item, accent, currentUserId, onPress }: InboxRowProps) {
  const hasUnread = item.unread_for_me > 0;
  const preview   = lastPreview(item, currentUserId);
  const avatarBg  = colorFor(item.work_order_id);
  const statusCfg = STATUS_CONFIG[item.status as WorkOrderStatus];
  const title = item.work_type || 'İş emri';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={row.wrap}>
      {/* Avatar — colored with work order initials */}
      <View style={[row.avatar, { backgroundColor: avatarBg }]}>
        <Text style={row.avatarText}>{initials(title)}</Text>
        {statusCfg && (
          <View style={[row.statusDot, { backgroundColor: statusCfg.color, borderColor: '#FFFFFF' }]} />
        )}
      </View>

      {/* Middle — title + preview */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={row.topLine}>
          <Text style={row.title} numberOfLines={1}>
            {title}
            {item.is_urgent && <Text style={row.urgentTag}>  · ACİL</Text>}
          </Text>
          <Text style={[row.time, hasUnread && { color: accent, fontWeight: '800' }]}>
            {formatTime(item.last_created_at)}
          </Text>
        </View>

        <View style={row.bottomLine}>
          <Text style={[row.preview, hasUnread && row.previewUnread, preview.isMine && row.previewMine]} numberOfLines={1}>
            {preview.text}
          </Text>
          {hasUnread ? (
            <View style={[row.unreadPill, { backgroundColor: accent }]}>
              <Text style={row.unreadText}>{item.unread_for_me > 99 ? '99+' : item.unread_for_me}</Text>
            </View>
          ) : null}
        </View>

        <View style={row.metaLine}>
          <Text style={row.metaText}>
            #{item.order_number}
            {item.patient_name ? ` · ${item.patient_name}` : ''}
            {item.doctor_name ? ` · ${item.doctor_name}` : ''}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const row = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  avatarText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  statusDot: {
    position: 'absolute', right: -2, bottom: -2,
    width: 13, height: 13, borderRadius: 7,
    borderWidth: 2,
  },

  topLine:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  title:      { flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 },
  urgentTag:  { color: CLR.red, fontWeight: '800', fontSize: 11, letterSpacing: 0.3 },
  time:       { fontSize: 11, color: '#94A3B8', fontWeight: '500' },

  bottomLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  preview:    { flex: 1, fontSize: 13, color: '#64748B' },
  previewUnread: { color: '#0F172A', fontWeight: '600' },
  previewMine:   { color: '#94A3B8' },

  unreadPill: {
    minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center',
  },
  unreadText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },

  metaLine: { flexDirection: 'row', alignItems: 'center' },
  metaText: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
});

// ── Filter Chip ──────────────────────────────────────────────────────
function FilterChip({ label, active, onPress, count, accent }: {
  label: string; active: boolean; onPress: () => void; count?: number; accent: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}
      style={[fc.chip, active && { backgroundColor: accent, borderColor: accent }]}
    >
      <Text style={[fc.text, active && fc.textActive]}>{label}</Text>
      {typeof count === 'number' && count > 0 && (
        <View style={[fc.count, active && fc.countActive]}>
          <Text style={[fc.countText, active && fc.countTextActive]}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
const fc = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9' },
  text:        { fontSize: 12, fontWeight: '700', color: '#64748B' },
  textActive:  { color: '#FFFFFF' },
  count:            { backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 6, minWidth: 20, alignItems: 'center' },
  countActive:      { backgroundColor: 'rgba(255,255,255,0.22)' },
  countText:        { fontSize: 10, fontWeight: '800', color: '#64748B' },
  countTextActive:  { color: '#FFFFFF' },
});

// ── Main Screen ──────────────────────────────────────────────────────
interface Props {
  /** Accent & route prefix e.g. '/(lab)'  or  '/(doctor)'  or  '/(admin)'  or  '/(clinic)' */
  accentColor?: string;
  routePrefix:  string;
  currentUserId?: string | null;
}

export function MessagesInboxScreen({
  accentColor = '#2563EB',
  routePrefix,
  currentUserId = null,
}: Props) {
  const router = useRouter();
  const { items, loading, totalUnread, refetch } = useOrderChatInbox();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [query,  setQuery]  = useState('');
  const [filter, setFilter] = useState<'tumu' | 'unread' | 'urgent'>('tumu');

  const filtered = useMemo(() => {
    let out = items;
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(i =>
        i.order_number.toLowerCase().includes(q) ||
        (i.work_type?.toLowerCase() ?? '').includes(q) ||
        (i.patient_name?.toLowerCase() ?? '').includes(q) ||
        (i.doctor_name?.toLowerCase() ?? '').includes(q) ||
        (i.last_content?.toLowerCase() ?? '').includes(q),
      );
    }
    if (filter === 'unread') out = out.filter(i => i.unread_for_me > 0);
    if (filter === 'urgent') out = out.filter(i => i.is_urgent);
    return out;
  }, [items, query, filter]);

  const urgentCount = items.filter(i => i.is_urgent).length;

  const ListHeader = (
    <View>
      {/* Title block */}
      <View style={s.titleRow}>
        <Text style={s.title}>Mesajlar</Text>
        {totalUnread > 0 && (
          <View style={[s.totalBadge, { backgroundColor: accentColor }]}>
            <Text style={s.totalBadgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
          </View>
        )}
      </View>
      <Text style={s.subtitle}>Her iş emrinin kendi sohbeti</Text>

      {/* Search bar */}
      <View style={s.searchBar}>
        <Icon name="search" size={16} color="#94A3B8" strokeWidth={2} />
        <TextInput
          style={s.searchInput}
          placeholder="İş emri, hekim, hasta veya mesaj ara..."
          placeholderTextColor="#94A3B8"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7} style={{ padding: 4 }}>
            <Icon name="x" size={14} color="#94A3B8" strokeWidth={2.2} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
        <FilterChip label="Tümü"    active={filter === 'tumu'}   count={items.length}   onPress={() => setFilter('tumu')}   accent={accentColor} />
        <FilterChip label="Okunmamış" active={filter === 'unread'} count={totalUnread}  onPress={() => setFilter('unread')} accent={accentColor} />
        <FilterChip label="Acil"    active={filter === 'urgent'} count={urgentCount}  onPress={() => setFilter('urgent')} accent={accentColor} />
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.work_order_id}
        ListHeaderComponent={ListHeader}
        renderItem={({ item, index }) => (
          <View>
            <InboxRow
              item={item}
              accent={accentColor}
              currentUserId={currentUserId}
              onPress={() => router.push(`${routePrefix}/order/${item.work_order_id}` as any)}
            />
            {index < filtered.length - 1 && <View style={s.divider} />}
          </View>
        )}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={accentColor} />}
        ListEmptyComponent={
          !loading ? (
            <View style={s.emptyState}>
              <View style={[s.emptyIcon, { backgroundColor: hexA(accentColor, 0.10) }]}>
                <Icon name="message-circle" size={32} color={accentColor} strokeWidth={1.8} />
              </View>
              <Text style={s.emptyTitle}>
                {query || filter !== 'tumu' ? 'Sonuç bulunamadı' : 'Henüz mesaj yok'}
              </Text>
              <Text style={s.emptySub}>
                {query || filter !== 'tumu'
                  ? 'Filtreyi değiştirmeyi veya aramayı temizlemeyi dene.'
                  : 'Bir iş emri detayına git, chat başlat — mesajlar burada listelenir.'}
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  list: { paddingBottom: 100 },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16, marginBottom: 2 },
  title:    { fontSize: 30, fontWeight: '800', color: '#0F172A', letterSpacing: -0.8 },
  totalBadge: { minWidth: 26, height: 26, paddingHorizontal: 8, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  totalBadgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  subtitle: { fontSize: 13, color: '#64748B', paddingHorizontal: 20, marginBottom: 16 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, marginBottom: 14,
    backgroundColor: '#FFFFFF', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  searchInput: {
    flex: 1, fontSize: 14, color: '#0F172A', fontWeight: '500',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },

  filterRow: { gap: 8, paddingHorizontal: 20, paddingBottom: 12 },

  divider: { height: 1, backgroundColor: '#F1F5F9', marginLeft: 76 }, // after avatar

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 10, paddingHorizontal: 40 },
  emptyIcon:  { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  emptySub:   { fontSize: 13, color: '#64748B', textAlign: 'center', maxWidth: 320, lineHeight: 18 },
});
