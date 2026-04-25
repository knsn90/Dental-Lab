import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, Animated, Easing, Modal,
  FlatList, ScrollView, useWindowDimensions, Platform,
  Image, ActivityIndicator, KeyboardAvoidingView, Pressable,
} from 'react-native';
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';
import { useAuthStore } from '../../../core/store/authStore';
import { useOrderChatInbox } from '../hooks/useOrderChatInbox';
import { useChatMessages } from '../hooks/useChatMessages';
import { STATUS_CONFIG } from '../constants';
import { WorkOrderStatus } from '../../../lib/types';

// ── Design tokens ────────────────────────────────────────────────────
const SURFACE = '#FFFFFF';
const BG_SOFT = '#F7F9FB';
const BORDER  = '#F1F5F9';
const TEXT    = '#0F172A';
const MUTED   = '#64748B';
const SUBTLE  = '#94A3B8';

// ── Icons (Lucide-style) ─────────────────────────────────────────────
type IconName =
  | 'x' | 'search' | 'send' | 'paperclip' | 'smile' | 'mic'
  | 'message-circle' | 'video' | 'phone' | 'more-vertical'
  | 'image' | 'file' | 'arrow-left' | 'check' | 'check-check'
  | 'pin' | 'calendar' | 'tooth' | 'palette' | 'cog';
function Icon({ name, size = 18, color = TEXT, strokeWidth = 1.8 }: {
  name: IconName; size?: number; color?: string; strokeWidth?: number;
}) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (name) {
    case 'x':              return <Svg width={size} height={size} viewBox="0 0 24 24"><Line x1="18" y1="6" x2="6" y2="18" {...p}/><Line x1="6" y1="6" x2="18" y2="18" {...p}/></Svg>;
    case 'search':         return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="11" cy="11" r="8" {...p}/><Line x1="21" y1="21" x2="16.65" y2="16.65" {...p}/></Svg>;
    case 'send':           return <Svg width={size} height={size} viewBox="0 0 24 24"><Line x1="22" y1="2" x2="11" y2="13" {...p}/><Polyline points="22 2 15 22 11 13 2 9 22 2" {...p}/></Svg>;
    case 'paperclip':      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" {...p}/></Svg>;
    case 'smile':          return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="12" cy="12" r="10" {...p}/><Path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" {...p}/></Svg>;
    case 'mic':            return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" {...p}/><Path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" {...p}/></Svg>;
    case 'message-circle': return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" {...p}/></Svg>;
    case 'video':          return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="23 7 16 12 23 17 23 7" {...p}/><Path d="M14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" {...p}/></Svg>;
    case 'phone':          return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.95.37 1.88.72 2.77a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.11-.45c.89.35 1.82.59 2.77.72A2 2 0 0 1 22 16.92z" {...p}/></Svg>;
    case 'more-vertical':  return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="12" cy="12" r="1" {...p}/><Circle cx="12" cy="5"  r="1" {...p}/><Circle cx="12" cy="19" r="1" {...p}/></Svg>;
    case 'image':          return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14" {...p}/><Circle cx="8.5" cy="8.5" r="1.5" {...p}/><Polyline points="21 15 16 10 5 21" {...p}/></Svg>;
    case 'file':           return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" {...p}/><Polyline points="14 2 14 8 20 8" {...p}/></Svg>;
    case 'arrow-left':     return <Svg width={size} height={size} viewBox="0 0 24 24"><Line x1="19" y1="12" x2="5" y2="12" {...p}/><Polyline points="12 19 5 12 12 5" {...p}/></Svg>;
    case 'check':          return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="20 6 9 17 4 12" {...p}/></Svg>;
    case 'check-check':    return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="18 6 7 17 2 12" {...p}/><Polyline points="22 10 13 19" {...p}/></Svg>;
    case 'pin':            return <Svg width={size} height={size} viewBox="0 0 24 24"><Line x1="12" y1="17" x2="12" y2="22" {...p}/><Path d="M5 17h14l-2-9V4H7v4l-2 9z" {...p}/></Svg>;
    case 'calendar':       return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" {...p}/><Line x1="16" y1="2" x2="16" y2="6" {...p}/><Line x1="8" y1="2" x2="8" y2="6" {...p}/><Line x1="3" y1="10" x2="21" y2="10" {...p}/></Svg>;
    case 'tooth':          return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M7 3c-2 0-3 1.5-3 4 0 2 .8 3.4 1.2 5.5.4 2 .3 4 .8 6 .5 1.7 1.5 3.5 2.6 3.5 1.2 0 1.4-2 1.6-3.6.2-1.5.5-3 1.8-3s1.6 1.5 1.8 3c.2 1.6.4 3.6 1.6 3.6 1.1 0 2.1-1.8 2.6-3.5.5-2 .4-4 .8-6C18.2 10.4 19 9 19 7c0-2.5-1-4-3-4-1.6 0-2.6 1-4 1s-2.4-1-4-1z" {...p}/></Svg>;
    case 'palette':        return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="13.5" cy="6.5" r="0.5" {...p} fill={color} /><Circle cx="17.5" cy="10.5" r="0.5" {...p} fill={color} /><Circle cx="8.5" cy="7.5" r="0.5" {...p} fill={color} /><Circle cx="6.5" cy="12.5" r="0.5" {...p} fill={color} /><Path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z" {...p}/></Svg>;
    case 'cog':            return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="12" cy="12" r="3" {...p}/><Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" {...p}/></Svg>;
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

const AVATAR_PALETTE = ['#0EA5E9','#059669','#D97706','#7C3AED','#DB2777','#0891B2','#EA580C','#4F46E5'];
function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xff;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function formatTime(ts?: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const date  = new Date(d); date.setHours(0, 0, 0, 0);
  const diff  = (today.getTime() - date.getTime()) / 86_400_000;
  if (diff === 0) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Dün';
  if (diff <= 6) return ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'][d.getDay()];
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
}

function formatTimeFull(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(ts?: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

function lastPreview(item: any, currentUserId: string | null): string {
  const isMine = !!item.last_sender_id && item.last_sender_id === currentUserId;
  if (!item.last_content && !item.last_attachment_type) return 'Henüz mesaj yok';
  const prefix = isMine ? 'Siz: ' : '';
  if (item.last_attachment_type === 'image') return `${prefix}📷 Fotoğraf`;
  if (item.last_attachment_type === 'audio') return `${prefix}🎙️ Sesli mesaj`;
  if (item.last_attachment_type === 'file')  return `${prefix}📎 Dosya`;
  return `${prefix}${item.last_content ?? ''}`;
}

// ── Avatar with unread badge overlay ─────────────────────────────────
function Avatar({ name, color, unreadCount, size = 48, statusColor }: {
  name?: string | null; color: string; unreadCount?: number; size?: number; statusColor?: string;
}) {
  const showBadge = (unreadCount ?? 0) > 0;
  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <View style={[
        avs.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}>
        <Text style={[avs.text, { fontSize: size * 0.32 }]}>{initials(name)}</Text>
      </View>
      {statusColor && (
        <View style={[
          avs.statusDot,
          { backgroundColor: statusColor, right: -1, bottom: -1, width: size * 0.28, height: size * 0.28, borderRadius: size * 0.14 },
        ]} />
      )}
      {showBadge && (
        <View style={avs.badge}>
          <Text style={avs.badgeText}>{unreadCount! > 99 ? '99+' : unreadCount}</Text>
        </View>
      )}
    </View>
  );
}
const avs = StyleSheet.create({
  circle: {
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  text: { color: '#FFFFFF', fontWeight: '800' },
  badge: {
    position: 'absolute',
    top: -4, right: -4,
    minWidth: 20, height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  statusDot: {
    position: 'absolute',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
});

// ── Chat List Item ───────────────────────────────────────────────────
interface ChatListItemProps {
  item: any;
  selected: boolean;
  currentUserId: string | null;
  accentColor: string;
  onPress: () => void;
}
function ChatListItem({ item, selected, currentUserId, accentColor, onPress }: ChatListItemProps) {
  // Title — hasta adı (yoksa iş tipi, en sonda sipariş #)
  const title      = item.patient_name || item.work_type || `#${item.order_number}`;
  const avatarBg   = colorFor(item.work_order_id);
  const statusCfg  = STATUS_CONFIG[item.status as WorkOrderStatus];

  // Meta — klinik · hekim (yoksa fallback)
  const metaParts: string[] = [];
  if (item.clinic_name) metaParts.push(item.clinic_name);
  if (item.doctor_name) metaParts.push(item.doctor_name);
  const metaLine = metaParts.length > 0
    ? metaParts.join(' · ')
    : `#${item.order_number}`;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[cl.row, selected && { backgroundColor: hexA(accentColor, 0.08) }]}
    >
      <Avatar
        name={title}
        color={avatarBg}
        unreadCount={item.unread_for_me}
        statusColor={statusCfg?.color}
        size={46}
      />

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={cl.topRow}>
          <Text style={cl.name} numberOfLines={1}>
            {title}
            {item.is_urgent && <Text style={cl.urgent}>  · ACİL</Text>}
          </Text>
          <Text style={[cl.time, item.unread_for_me > 0 && { color: accentColor, fontWeight: '700' }]}>
            {formatTime(item.last_created_at)}
          </Text>
        </View>
        <Text style={[cl.preview, item.unread_for_me > 0 && cl.previewBold]} numberOfLines={1}>
          {lastPreview(item, currentUserId)}
        </Text>
        <Text style={cl.meta} numberOfLines={1}>
          {metaLine}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
const cl = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  topRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  name:    { flex: 1, fontSize: 13, fontWeight: '700', color: TEXT, letterSpacing: -0.1 },
  urgent:  { color: '#EF4444', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  time:    { fontSize: 10, color: SUBTLE, fontWeight: '500' },
  preview: { fontSize: 12, color: MUTED, marginBottom: 2 },
  previewBold: { color: TEXT, fontWeight: '600' },
  meta:    { fontSize: 10, color: SUBTLE, fontWeight: '500' },
});

// ── Message Bubble ───────────────────────────────────────────────────
function MessageBubble({ msg, isMine, accentColor, showAvatar, senderColor }: {
  msg: any; isMine: boolean; accentColor: string; showAvatar: boolean; senderColor: string;
}) {
  const hasImage = msg.attachment_type === 'image' && msg.attachment_url;
  const hasFile  = msg.attachment_type === 'file'  && msg.attachment_url;
  const hasAudio = msg.attachment_type === 'audio' && msg.attachment_url;

  return (
    <View style={[mb.row, isMine ? mb.rowMine : mb.rowOther]}>
      {!isMine && showAvatar && (
        <View style={[mb.avatar, { backgroundColor: senderColor }]}>
          <Text style={mb.avatarText}>{initials(msg.sender?.full_name)}</Text>
        </View>
      )}
      {!isMine && !showAvatar && <View style={{ width: 28 }} />}

      <View style={[
        mb.bubble,
        isMine
          ? [mb.bubbleMine, { backgroundColor: accentColor }]
          : mb.bubbleOther,
      ]}>
        {hasImage && (
          <Image
            source={{ uri: msg.attachment_url }}
            style={mb.image}
            resizeMode="cover"
          />
        )}
        {hasFile && (
          <View style={mb.fileBlock}>
            <Icon name="file" size={18} color={isMine ? '#FFFFFF' : accentColor} strokeWidth={2} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[mb.fileName, isMine && { color: '#FFFFFF' }]} numberOfLines={1}>
                {msg.attachment_name ?? 'Dosya'}
              </Text>
              {msg.attachment_size && (
                <Text style={[mb.fileSize, isMine && { color: 'rgba(255,255,255,0.75)' }]}>
                  {Math.round(msg.attachment_size / 1024)} KB
                </Text>
              )}
            </View>
          </View>
        )}
        {hasAudio && (
          <View style={mb.audioBlock}>
            <Icon name="mic" size={16} color={isMine ? '#FFFFFF' : accentColor} strokeWidth={2} />
            <Text style={[mb.fileName, isMine && { color: '#FFFFFF' }]}>Sesli mesaj</Text>
          </View>
        )}
        {msg.content ? (
          <Text style={[mb.text, isMine && { color: '#FFFFFF' }]}>{msg.content}</Text>
        ) : null}
        <View style={mb.bubbleFooter}>
          <Text style={[mb.time, isMine && { color: 'rgba(255,255,255,0.75)' }]}>
            {formatTimeFull(msg.created_at)}
          </Text>
          {isMine && (
            <Icon name="check-check" size={12} color="rgba(255,255,255,0.85)" strokeWidth={2.2} />
          )}
        </View>
      </View>
    </View>
  );
}
const mb = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginVertical: 2, paddingHorizontal: 12 },
  rowMine:  { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  avatar:   { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText:{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  bubble:   { maxWidth: '75%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  bubbleMine:  { borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER, borderBottomLeftRadius: 4 },
  image:    { width: 220, height: 180, borderRadius: 10, marginTop: -4, marginHorizontal: -4 },
  fileBlock:{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  audioBlock:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  fileName: { fontSize: 12, fontWeight: '700', color: TEXT },
  fileSize: { fontSize: 10, color: MUTED },
  text:     { fontSize: 13, color: TEXT, lineHeight: 18 },
  bubbleFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 2 },
  time:     { fontSize: 9, color: SUBTLE, fontWeight: '600' },
});

// ── Chat Detail pane ─────────────────────────────────────────────────
interface ChatDetailProps {
  selectedOrder: any | null;
  accentColor: string;
  currentUserId: string | null;
  onBack?: () => void;
}
function ChatDetail({ selectedOrder, accentColor, currentUserId, onBack }: ChatDetailProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [text, setText] = useState('');

  // useChatMessages expects a workOrderId — call with '' when no selection (hook will return empty)
  const chat = useChatMessages(selectedOrder?.work_order_id ?? '');

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (chat.messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [chat.messages.length]);

  if (!selectedOrder) {
    return (
      <View style={cd.empty}>
        <View style={[cd.emptyIcon, { backgroundColor: hexA(accentColor, 0.10) }]}>
          <Icon name="message-circle" size={32} color={accentColor} strokeWidth={1.6} />
        </View>
        <Text style={cd.emptyTitle}>Bir sohbet seç</Text>
        <Text style={cd.emptySub}>
          Soldan bir iş emri seç; bu iş için yapılan tüm yazışmalar burada görünür.
        </Text>
      </View>
    );
  }

  const patientName = selectedOrder.patient_name || 'Hasta belirtilmemiş';
  const workType    = selectedOrder.work_type || 'İş emri';
  const avatarBg    = colorFor(selectedOrder.work_order_id);
  const statusCfg   = STATUS_CONFIG[selectedOrder.status as WorkOrderStatus];

  // Pinned summary chips (sadece dolu olanlar gösterilir)
  const teethStr = Array.isArray(selectedOrder.tooth_numbers) && selectedOrder.tooth_numbers.length > 0
    ? selectedOrder.tooth_numbers.join(', ')
    : null;
  const hasPinDetails =
    !!teethStr || !!selectedOrder.shade ||
    !!selectedOrder.machine_type || !!selectedOrder.delivery_date ||
    !!selectedOrder.notes;

  const handleSend = async () => {
    if (!text.trim() || !currentUserId) return;
    const content = text.trim();
    setText('');
    await chat.send(currentUserId, content);
  };

  return (
    <View style={cd.wrap}>
      {/* Header */}
      <View style={cd.header}>
        {onBack && (
          <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={cd.iconBtn}>
            <Icon name="arrow-left" size={18} color={TEXT} strokeWidth={2} />
          </TouchableOpacity>
        )}
        <View style={[cd.headerAvatar, { backgroundColor: avatarBg }]}>
          <Text style={cd.headerAvatarText}>{initials(patientName)}</Text>
          {statusCfg && (
            <View style={[cd.headerStatusDot, { backgroundColor: statusCfg.color }]} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={cd.headerTitle} numberOfLines={1}>
            {patientName}
            {selectedOrder.is_urgent && <Text style={cd.headerUrgent}>  · ACİL</Text>}
          </Text>
          <Text style={cd.headerSub} numberOfLines={1}>
            #{selectedOrder.order_number}
            {selectedOrder.doctor_name ? ` · ${selectedOrder.doctor_name}` : ''}
            {statusCfg ? ` · ${statusCfg.label}` : ''}
          </Text>
        </View>
      </View>

      {/* Pinned summary — iş açıklaması ve özet (WhatsApp pin tarzı) */}
      {(workType || hasPinDetails) && (
        <View style={[cd.pinWrap, { borderLeftColor: accentColor }]}>
          <View style={cd.pinTopRow}>
            <Icon name="pin" size={12} color={accentColor} strokeWidth={2.2} />
            <Text style={[cd.pinLabel, { color: accentColor }]}>SABİTLENDİ · İş Özeti</Text>
          </View>
          <Text style={cd.pinTitle} numberOfLines={2}>{workType}</Text>
          {hasPinDetails && (
            <View style={cd.pinChipsRow}>
              {teethStr && (
                <View style={cd.pinChip}>
                  <Icon name="tooth" size={11} color={MUTED} strokeWidth={2} />
                  <Text style={cd.pinChipText}>{teethStr}</Text>
                </View>
              )}
              {selectedOrder.shade && (
                <View style={cd.pinChip}>
                  <Icon name="palette" size={11} color={MUTED} strokeWidth={2} />
                  <Text style={cd.pinChipText}>{selectedOrder.shade}</Text>
                </View>
              )}
              {selectedOrder.machine_type && (
                <View style={cd.pinChip}>
                  <Icon name="cog" size={11} color={MUTED} strokeWidth={2} />
                  <Text style={cd.pinChipText}>{selectedOrder.machine_type}</Text>
                </View>
              )}
              {selectedOrder.delivery_date && (
                <View style={cd.pinChip}>
                  <Icon name="calendar" size={11} color={MUTED} strokeWidth={2} />
                  <Text style={cd.pinChipText}>{formatDateShort(selectedOrder.delivery_date)}</Text>
                </View>
              )}
            </View>
          )}
          {selectedOrder.notes && (
            <Text style={cd.pinNote} numberOfLines={2}>“{selectedOrder.notes}”</Text>
          )}
        </View>
      )}

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={cd.messages}
        contentContainerStyle={{ paddingVertical: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {chat.loading ? (
          <View style={cd.loadingBox}>
            <ActivityIndicator color={accentColor} />
          </View>
        ) : chat.messages.length === 0 ? (
          <View style={cd.noMsgs}>
            <Text style={cd.noMsgsText}>Henüz mesaj yok. Bir mesaj yazarak başla.</Text>
          </View>
        ) : (
          chat.messages.map((m, i) => {
            const isMine     = m.sender_id === currentUserId;
            const prev       = chat.messages[i - 1];
            const showAvatar = !isMine && (!prev || prev.sender_id !== m.sender_id);
            const senderColor = colorFor(m.sender_id);
            return (
              <MessageBubble
                key={m.id}
                msg={m}
                isMine={isMine}
                accentColor={accentColor}
                showAvatar={showAvatar}
                senderColor={senderColor}
              />
            );
          })
        )}
      </ScrollView>

      {/* Composer */}
      <View style={cd.composer}>
        <TouchableOpacity activeOpacity={0.7} style={cd.iconBtn}>
          <Icon name="paperclip" size={18} color={MUTED} strokeWidth={2} />
        </TouchableOpacity>
        <TextInput
          style={cd.input}
          value={text}
          onChangeText={setText}
          placeholder="Mesaj yaz..."
          placeholderTextColor={SUBTLE}
          multiline
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!text.trim()}
          activeOpacity={0.7}
          style={[
            cd.sendBtn,
            { backgroundColor: text.trim() ? accentColor : hexA(accentColor, 0.25) },
          ]}
        >
          {chat.sending
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Icon name="send" size={16} color="#FFFFFF" strokeWidth={2.2} />
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}
const cd = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: BG_SOFT },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10, backgroundColor: BG_SOFT },
  emptyIcon: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: TEXT, letterSpacing: -0.3 },
  emptySub:   { fontSize: 13, color: MUTED, textAlign: 'center', maxWidth: 320, lineHeight: 19 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: SURFACE,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  headerAvatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  headerStatusDot: { position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: SURFACE },
  headerTitle: { fontSize: 15, fontWeight: '800', color: TEXT, letterSpacing: -0.2 },
  headerSub:   { fontSize: 11, color: MUTED, marginTop: 2 },
  headerUrgent:{ fontSize: 10, fontWeight: '800', color: '#EF4444', letterSpacing: 0.4 },

  // ── Pinned summary card ──────────────────────────────────────────
  pinWrap: {
    backgroundColor: SURFACE,
    borderBottomWidth: 1, borderBottomColor: BORDER,
    borderLeftWidth: 3,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 11,
    gap: 6,
  },
  pinTopRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pinLabel:  { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6 },
  pinTitle:  { fontSize: 13, fontWeight: '700', color: TEXT, letterSpacing: -0.1, lineHeight: 18 },
  pinChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  pinChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: BG_SOFT,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1, borderColor: BORDER,
  },
  pinChipText: { fontSize: 10.5, fontWeight: '600', color: MUTED, letterSpacing: -0.05 },
  pinNote:   { fontSize: 11, color: MUTED, fontStyle: 'italic', marginTop: 2 },

  messages: { flex: 1 },
  loadingBox: { padding: 40, alignItems: 'center' },
  noMsgs:   { padding: 40, alignItems: 'center' },
  noMsgsText: { fontSize: 13, color: SUBTLE, textAlign: 'center' },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: SURFACE,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    backgroundColor: BG_SOFT,
    borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 13, color: TEXT,
    maxHeight: 100,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

// ── Main Popup Component ─────────────────────────────────────────────
interface MessagesPopupProps {
  visible: boolean;
  onClose: () => void;
  accentColor: string;
}

export function MessagesPopup({ visible, onClose, accentColor }: MessagesPopupProps) {
  const { profile } = useAuthStore();
  const { items, loading, totalUnread } = useOrderChatInbox();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [query,    setQuery]    = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [mounted,  setMounted]  = useState(visible);

  // Entry / exit animations — tek bir progress değeri üzerinden
  // interpolate edilen opacity / scale / translateY kullanıyoruz.
  // Bu, üç ayrı animasyonun zamanlama farkından doğan "kayma" hissini
  // ortadan kaldırır ve hareketin tamamen senkron akmasını sağlar.
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Önce mount et, sonra bir frame sonra animasyonu başlat
      // (böylece ilk render initial state ile basılır, sonra
      // smooth bir geçiş oynanır)
      setMounted(true);
      const id = requestAnimationFrame(() => {
        Animated.timing(progress, {
          toValue: 1,
          duration: 260,
          easing: Easing.bezier(0.16, 1, 0.3, 1), // smooth ease-out
          useNativeDriver: true,
        }).start();
      });
      return () => cancelAnimationFrame(id);
    } else if (mounted) {
      Animated.timing(progress, {
        toValue: 0,
        duration: 180,
        easing: Easing.bezier(0.4, 0, 1, 1), // hızlı ease-in
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const opacity    = progress;
  const scale      = progress.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  // Auto-select first chat on desktop when inbox loads
  useEffect(() => {
    if (visible && isDesktop && !selected && items.length > 0) {
      setSelected(items[0]);
    }
  }, [visible, isDesktop, items, selected]);

  // Reset selection on close
  useEffect(() => {
    if (!visible) setSelected(null);
  }, [visible]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(i =>
      i.order_number.toLowerCase().includes(q) ||
      (i.work_type?.toLowerCase() ?? '').includes(q) ||
      (i.patient_name?.toLowerCase() ?? '').includes(q) ||
      (i.doctor_name?.toLowerCase() ?? '').includes(q) ||
      (i.last_content?.toLowerCase() ?? '').includes(q),
    );
  }, [items, query]);

  if (!mounted) return null;

  // Mobile: tek pane modu — seçim yoksa liste, varsa chat
  const showListOnMobile = !selected;

  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
      animationType="none"
    >
      {/* Backdrop */}
      <Animated.View style={[p.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Panel */}
      <View style={p.centerWrap} pointerEvents="box-none">
        <Animated.View
          style={[
            p.panel,
            isDesktop ? p.panelDesktop : p.panelMobile,
            { opacity, transform: [{ scale }, { translateY }] },
          ]}
        >
          {/* Desktop: split pane */}
          {isDesktop ? (
            <View style={p.split}>
              {/* Left: chat list */}
              <View style={p.left}>
                <View style={p.listHeader}>
                  <View style={p.listTitleRow}>
                    <Text style={p.listTitle}>Mesajlar</Text>
                    {totalUnread > 0 && (
                      <View style={[p.totalBadge, { backgroundColor: accentColor }]}>
                        <Text style={p.totalBadgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={p.closeBtn}>
                      <Icon name="x" size={16} color={MUTED} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                  <View style={p.searchBar}>
                    <Icon name="search" size={14} color={SUBTLE} strokeWidth={2} />
                    <TextInput
                      style={p.searchInput}
                      placeholder="Ara..."
                      placeholderTextColor={SUBTLE}
                      value={query}
                      onChangeText={setQuery}
                    />
                  </View>
                </View>

                {loading ? (
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <ActivityIndicator color={accentColor} />
                  </View>
                ) : filtered.length === 0 ? (
                  <View style={p.emptyList}>
                    <Text style={p.emptyListText}>
                      {query ? 'Sonuç bulunamadı' : 'Henüz mesaj yok'}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={filtered}
                    keyExtractor={(it) => it.work_order_id}
                    renderItem={({ item }) => (
                      <ChatListItem
                        item={item}
                        selected={selected?.work_order_id === item.work_order_id}
                        currentUserId={profile?.id ?? null}
                        accentColor={accentColor}
                        onPress={() => setSelected(item)}
                      />
                    )}
                    ItemSeparatorComponent={() => <View style={p.divider} />}
                  />
                )}
              </View>

              {/* Right: chat detail */}
              <View style={p.right}>
                <ChatDetail
                  selectedOrder={selected}
                  accentColor={accentColor}
                  currentUserId={profile?.id ?? null}
                />
              </View>
            </View>
          ) : (
            /* Mobile: single pane */
            <View style={{ flex: 1 }}>
              {showListOnMobile ? (
                <View style={{ flex: 1 }}>
                  <View style={p.listHeader}>
                    <View style={p.listTitleRow}>
                      <Text style={p.listTitle}>Mesajlar</Text>
                      {totalUnread > 0 && (
                        <View style={[p.totalBadge, { backgroundColor: accentColor }]}>
                          <Text style={p.totalBadgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }} />
                      <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={p.closeBtn}>
                        <Icon name="x" size={16} color={MUTED} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                    <View style={p.searchBar}>
                      <Icon name="search" size={14} color={SUBTLE} strokeWidth={2} />
                      <TextInput
                        style={p.searchInput}
                        placeholder="Ara..."
                        placeholderTextColor={SUBTLE}
                        value={query}
                        onChangeText={setQuery}
                      />
                    </View>
                  </View>
                  {loading ? (
                    <View style={{ padding: 32, alignItems: 'center' }}>
                      <ActivityIndicator color={accentColor} />
                    </View>
                  ) : filtered.length === 0 ? (
                    <View style={p.emptyList}>
                      <Text style={p.emptyListText}>
                        {query ? 'Sonuç bulunamadı' : 'Henüz mesaj yok'}
                      </Text>
                    </View>
                  ) : (
                    <FlatList
                      data={filtered}
                      keyExtractor={(it) => it.work_order_id}
                      renderItem={({ item }) => (
                        <ChatListItem
                          item={item}
                          selected={false}
                          currentUserId={profile?.id ?? null}
                          accentColor={accentColor}
                          onPress={() => setSelected(item)}
                        />
                      )}
                      ItemSeparatorComponent={() => <View style={p.divider} />}
                    />
                  )}
                </View>
              ) : (
                <ChatDetail
                  selectedOrder={selected}
                  accentColor={accentColor}
                  currentUserId={profile?.id ?? null}
                  onBack={() => setSelected(null)}
                />
              )}
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Popup styles ─────────────────────────────────────────────────────
const p = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' } as any) : {}),
  },
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    padding: 16,
  },
  panel: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 24px 64px rgba(15,23,42,0.18), 0 8px 20px rgba(15,23,42,0.08)' } as any)
      : { shadowColor: '#0F172A', shadowOpacity: 0.22, shadowRadius: 32, shadowOffset: { width: 0, height: 16 }, elevation: 24 }),
  },
  panelDesktop: {
    width: '95%', maxWidth: 1000, height: '85%', maxHeight: 720,
  },
  panelMobile: {
    width: '100%', height: '92%',
  },

  split: { flex: 1, flexDirection: 'row' },
  left:  { width: 320, backgroundColor: SURFACE, borderRightWidth: 1, borderRightColor: BORDER },
  right: { flex: 1, backgroundColor: BG_SOFT },

  listHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  listTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  listTitle:   { fontSize: 18, fontWeight: '800', color: TEXT, letterSpacing: -0.4 },
  totalBadge:  { minWidth: 22, height: 22, paddingHorizontal: 7, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  totalBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  closeBtn:    { width: 30, height: 30, borderRadius: 15, backgroundColor: BG_SOFT, alignItems: 'center', justifyContent: 'center' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: BG_SOFT, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  searchInput: {
    flex: 1, fontSize: 12, color: TEXT,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },

  divider: { height: 1, backgroundColor: BORDER, marginLeft: 72 },

  emptyList: { padding: 40, alignItems: 'center' },
  emptyListText: { fontSize: 12, color: SUBTLE, textAlign: 'center' },
});
