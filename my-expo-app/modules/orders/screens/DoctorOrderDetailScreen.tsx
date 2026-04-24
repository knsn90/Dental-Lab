import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  Image, TouchableOpacity, TextInput,
  ActivityIndicator, Platform, Modal, Pressable,
  KeyboardAvoidingView, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Path, Circle, Line, Polyline,
  Defs, RadialGradient, Stop, Rect,
} from 'react-native-svg';
import { useAuthStore } from '../../../core/store/authStore';
import { useOrderDetail } from '../hooks/useOrderDetail';
import { useChatMessages } from '../hooks/useChatMessages';
import { StatusBadge } from '../components/StatusBadge';
import { StatusTimeline } from '../components/StatusTimeline';
import { BrandedQR } from '../../../core/ui/BrandedQR';
import { isOrderOverdue, formatDeliveryDate, STATUS_CONFIG } from '../constants';

// ── Design tokens ────────────────────────────────────────────────
const ACCENT      = '#0EA5E9';
const ACCENT_DARK = '#0284C7';
const BG          = '#F7F9FB';
const SURFACE     = '#FFFFFF';
const BORDER      = '#F1F5F9';
const TEXT        = '#0F172A';
const MUTED       = '#64748B';
const SUBTLE      = '#94A3B8';
const DANGER      = '#EF4444';

// ── Helpers ──────────────────────────────────────────────────────
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
function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
function daysUntil(deliveryDate: string, status: string): { text: string; tone: 'green' | 'amber' | 'red' | 'neutral' } {
  if (status === 'teslim_edildi') return { text: 'Teslim edildi', tone: 'neutral' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(deliveryDate + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0)  return { text: `${Math.abs(diff)} gün gecikti`, tone: 'red' };
  if (diff === 0) return { text: 'Bugün teslim',                 tone: 'amber' };
  if (diff === 1) return { text: 'Yarın teslim',                 tone: 'amber' };
  if (diff <= 3)  return { text: `${diff} gün kaldı`,            tone: 'amber' };
  return { text: `${diff} gün kaldı`, tone: 'green' };
}

// ── Icons ────────────────────────────────────────────────────────
type IconName =
  | 'send' | 'qr-code' | 'arrow-left' | 'check-check' | 'message-circle'
  | 'x' | 'package' | 'palette' | 'cog' | 'calendar' | 'tooth' | 'note'
  | 'image' | 'history' | 'printer';
function Icon({ name, size = 18, color = TEXT, strokeWidth = 1.8 }: {
  name: IconName; size?: number; color?: string; strokeWidth?: number;
}) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (name) {
    case 'send':           return <Svg width={size} height={size} viewBox="0 0 24 24"><Line x1="22" y1="2" x2="11" y2="13" {...p}/><Polyline points="22 2 15 22 11 13 2 9 22 2" {...p}/></Svg>;
    case 'qr-code':        return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14h1v1h-1zM18 17h3v1h-3zM20 19h1v2h-1zM14 18h3v3h-3z" fill={color} stroke="none" /></Svg>;
    case 'arrow-left':     return <Svg width={size} height={size} viewBox="0 0 24 24"><Line x1="19" y1="12" x2="5" y2="12" {...p}/><Polyline points="12 19 5 12 12 5" {...p}/></Svg>;
    case 'check-check':    return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="18 6 7 17 2 12" {...p}/><Polyline points="22 10 13 19" {...p}/></Svg>;
    case 'message-circle': return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" {...p}/></Svg>;
    case 'x':              return <Svg width={size} height={size} viewBox="0 0 24 24"><Line x1="18" y1="6" x2="6" y2="18" {...p}/><Line x1="6" y1="6" x2="18" y2="18" {...p}/></Svg>;
    case 'package':        return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" {...p}/></Svg>;
    case 'palette':        return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="12" cy="12" r="10" {...p}/><Circle cx="7" cy="11" r="1" {...p}/><Circle cx="11" cy="7" r="1" {...p}/><Circle cx="17" cy="11" r="1" {...p}/></Svg>;
    case 'cog':            return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="12" cy="12" r="3" {...p}/><Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" {...p}/></Svg>;
    case 'calendar':       return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M3 9h18M21 10V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8" {...p}/><Polyline points="8 2 8 6" {...p}/><Polyline points="16 2 16 6" {...p}/></Svg>;
    case 'tooth':          return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M5 4c0-1 1-2 3-2 1.5 0 2.5 1 4 1s2.5-1 4-1c2 0 3 1 3 2v6c0 4-2 11-3 11s-1-3-2-3h-4c-1 0-1 3-2 3s-3-7-3-11V4z" {...p}/></Svg>;
    case 'note':           return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" {...p}/><Polyline points="14 2 14 8 20 8" {...p}/><Line x1="16" y1="13" x2="8" y2="13" {...p}/><Line x1="16" y1="17" x2="8" y2="17" {...p}/></Svg>;
    case 'image':          return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14" {...p}/><Circle cx="8.5" cy="8.5" r="1.5" {...p}/><Polyline points="21 15 16 10 5 21" {...p}/></Svg>;
    case 'history':        return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="1 4 1 10 7 10" {...p}/><Path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" {...p}/><Polyline points="12 7 12 12 16 14" {...p}/></Svg>;
    case 'printer':        return <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="6 9 6 2 18 2 18 9" {...p}/><Path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" {...p}/><Rect x="6" y="14" width="12" height="8" {...p}/></Svg>;
    default: return null;
  }
}

// ── HERO ─────────────────────────────────────────────────────────
function Hero({ order, daysInfo }: { order: any; daysInfo: ReturnType<typeof daysUntil> }) {
  const cfg = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG];
  const toneColor =
    daysInfo.tone === 'red'    ? DANGER :
    daysInfo.tone === 'amber'  ? '#F59E0B' :
    daysInfo.tone === 'green'  ? '#16A34A' :
                                 SUBTLE;
  const toneBg = hexA(toneColor, 0.12);

  return (
    <View style={hero.wrap}>
      {/* Layered radial gradient background */}
      <Svg width="100%" height="100%" viewBox="0 0 800 240" preserveAspectRatio="none" style={StyleSheet.absoluteFillObject}>
        <Defs>
          <RadialGradient id="ord-g1" cx="10%" cy="20%" r="55%">
            <Stop offset="0%"   stopColor={ACCENT} stopOpacity="0.16" />
            <Stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="ord-g2" cx="95%" cy="90%" r="55%">
            <Stop offset="0%"   stopColor={ACCENT_DARK} stopOpacity="0.10" />
            <Stop offset="100%" stopColor={ACCENT_DARK} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="800" height="240" fill="url(#ord-g1)" />
        <Rect width="800" height="240" fill="url(#ord-g2)" />
      </Svg>

      <View style={hero.content}>
        <View style={hero.topRow}>
          <View style={[hero.statusPill, { backgroundColor: cfg?.bgColor ?? '#F1F5F9' }]}>
            <View style={[hero.statusDot, { backgroundColor: cfg?.color ?? SUBTLE }]} />
            <Text style={[hero.statusText, { color: cfg?.color ?? MUTED }]}>{cfg?.label ?? order.status}</Text>
          </View>
          {order.is_urgent && (
            <View style={hero.urgentBadge}>
              <Text style={hero.urgentText}>ACİL</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <View style={[hero.daysBadge, { backgroundColor: toneBg }]}>
            <Icon name="calendar" size={11} color={toneColor} strokeWidth={2} />
            <Text style={[hero.daysText, { color: toneColor }]}>{daysInfo.text}</Text>
          </View>
        </View>

        <Text style={hero.title} numberOfLines={2}>
          {order.work_type || 'İş türü belirtilmemiş'}
        </Text>

        {order.patient_name && (
          <Text style={hero.patient}>{order.patient_name}</Text>
        )}

        <View style={hero.metaRow}>
          {order.tooth_numbers?.length > 0 && (
            <View style={hero.metaChip}>
              <Icon name="tooth" size={11} color={ACCENT_DARK} strokeWidth={2} />
              <Text style={hero.metaText}>
                Diş {order.tooth_numbers.slice(0, 4).join(', ')}
                {order.tooth_numbers.length > 4 ? ` +${order.tooth_numbers.length - 4}` : ''}
              </Text>
            </View>
          )}
          {order.shade && (
            <View style={hero.metaChip}>
              <Icon name="palette" size={11} color={ACCENT_DARK} strokeWidth={2} />
              <Text style={hero.metaText}>Renk {order.shade}</Text>
            </View>
          )}
          <View style={hero.metaChip}>
            <Icon name="cog" size={11} color={ACCENT_DARK} strokeWidth={2} />
            <Text style={hero.metaText}>
              {order.machine_type === 'milling' ? 'Frezeleme' : '3D Baskı'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
const hero = StyleSheet.create({
  wrap: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: 1, borderColor: BORDER,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 16,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: `0 1px 2px ${hexA(ACCENT, 0.04)}, 0 8px 24px ${hexA(ACCENT, 0.06)}` } as any)
      : { shadowColor: ACCENT, shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3 }),
  },
  content:    { padding: 20, zIndex: 1 },
  topRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot:  { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' as const },
  urgentBadge:{ backgroundColor: hexA(DANGER, 0.12), paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  urgentText: { fontSize: 9, fontWeight: '900', color: DANGER, letterSpacing: 0.6 },
  daysBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  daysText:   { fontSize: 11, fontWeight: '800' },

  title:   { fontSize: 26, fontWeight: '800', color: TEXT, letterSpacing: -0.6, lineHeight: 30 },
  patient: { fontSize: 13, color: MUTED, fontWeight: '500', marginTop: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  metaChip:{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: hexA(ACCENT, 0.10), paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
  metaText:{ fontSize: 11, fontWeight: '700', color: ACCENT_DARK },
});

// ── Card primitive ───────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[card.wrap, style]}>{children}</View>;
}
function CardHeader({ icon, title, right }: { icon?: IconName; title: string; right?: React.ReactNode }) {
  return (
    <View style={card.header}>
      {icon && (
        <View style={card.headerIcon}>
          <Icon name={icon} size={14} color={ACCENT} strokeWidth={2} />
        </View>
      )}
      <Text style={card.title}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}
const card = StyleSheet.create({
  wrap:  { backgroundColor: SURFACE, borderRadius: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  header:{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  headerIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: hexA(ACCENT, 0.10), alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '700', color: TEXT, letterSpacing: -0.1 },
});

// ── Detail row ───────────────────────────────────────────────────
function DetailRow({ icon, label, value, valueColor }: {
  icon?: IconName; label: string; value: string; valueColor?: string;
}) {
  return (
    <View style={dr.row}>
      <View style={dr.left}>
        {icon && <Icon name={icon} size={13} color={SUBTLE} strokeWidth={2} />}
        <Text style={dr.label}>{label}</Text>
      </View>
      <Text style={[dr.value, valueColor ? { color: valueColor } : undefined]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}
const dr = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 11, gap: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  left:  { flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 90 },
  label: { fontSize: 12, color: MUTED, fontWeight: '500' },
  value: { fontSize: 13, color: TEXT, fontWeight: '700', flex: 1, textAlign: 'right' },
});

// ── Message bubble ───────────────────────────────────────────────
function Bubble({ msg, isMine, showSender }: { msg: any; isMine: boolean; showSender: boolean }) {
  return (
    <View style={[mb.row, isMine ? mb.rowMine : mb.rowOther]}>
      {!isMine && showSender && (
        <View style={[mb.avatar, { backgroundColor: SUBTLE }]}>
          <Text style={mb.avatarText}>{initials(msg.sender?.full_name)}</Text>
        </View>
      )}
      {!isMine && !showSender && <View style={{ width: 26 }} />}
      <View style={[mb.bubble, isMine ? [mb.bubbleMine, { backgroundColor: ACCENT }] : mb.bubbleOther]}>
        {!isMine && showSender && msg.sender?.full_name && (
          <Text style={mb.sender}>{msg.sender.full_name}</Text>
        )}
        {msg.content ? (
          <Text style={[mb.text, isMine && { color: '#FFFFFF' }]}>{msg.content}</Text>
        ) : null}
        <View style={mb.foot}>
          <Text style={[mb.time, isMine && { color: 'rgba(255,255,255,0.78)' }]}>
            {formatTime(msg.created_at)}
          </Text>
          {isMine && <Icon name="check-check" size={11} color="rgba(255,255,255,0.85)" strokeWidth={2.2} />}
        </View>
      </View>
    </View>
  );
}
const mb = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginVertical: 2 },
  rowMine:    { justifyContent: 'flex-end' },
  rowOther:   { justifyContent: 'flex-start' },
  avatar:     { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  bubble:     { maxWidth: '78%', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 7, gap: 3 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleOther:{ backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderBottomLeftRadius: 4 },
  sender:     { fontSize: 10, color: SUBTLE, fontWeight: '700' },
  text:       { fontSize: 13, color: TEXT, lineHeight: 18 },
  foot:       { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 1 },
  time:       { fontSize: 9, color: SUBTLE, fontWeight: '600' },
});

// ── Chat panel ───────────────────────────────────────────────────
function ChatPanel({ workOrderId, fillHeight }: { workOrderId: string; fillHeight: boolean }) {
  const { profile } = useAuthStore();
  const { messages, loading, sending, send } = useChatMessages(workOrderId);
  const [text, setText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!profile || !text.trim()) return;
    const c = text.trim();
    setText('');
    await send(profile.id, c);
  };

  return (
    <View style={[card.wrap, fillHeight && { flex: 1, minHeight: 480 }]}>
      <CardHeader
        icon="message-circle"
        title="Mesajlar"
        right={
          messages.length > 0 ? (
            <View style={cp.countPill}>
              <Text style={cp.countText}>{messages.length}</Text>
            </View>
          ) : null
        }
      />
      <ScrollView
        ref={scrollRef}
        style={[cp.area, fillHeight && { flex: 1 }]}
        contentContainerStyle={{ padding: 12 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {loading ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <ActivityIndicator color={ACCENT} />
          </View>
        ) : messages.length === 0 ? (
          <View style={cp.empty}>
            <View style={cp.emptyIcon}>
              <Icon name="message-circle" size={20} color={ACCENT} strokeWidth={1.6} />
            </View>
            <Text style={cp.emptyTitle}>Henüz mesaj yok</Text>
            <Text style={cp.emptySub}>Lab ile bu iş hakkında yazışabilirsin.</Text>
          </View>
        ) : (
          messages.map((m, i) => {
            const isMine = m.sender_id === profile?.id;
            const prev   = messages[i - 1];
            const showSender = !isMine && (!prev || prev.sender_id !== m.sender_id);
            return <Bubble key={m.id} msg={m} isMine={isMine} showSender={showSender} />;
          })
        )}
      </ScrollView>
      <View style={cp.composer}>
        <TextInput
          style={cp.input}
          value={text}
          onChangeText={setText}
          placeholder="Mesaj yaz..."
          placeholderTextColor={SUBTLE}
          multiline
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!text.trim() || sending}
          activeOpacity={0.7}
          style={[
            cp.sendBtn,
            { backgroundColor: text.trim() ? ACCENT : hexA(ACCENT, 0.3) },
          ]}
        >
          {sending
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Icon name="send" size={15} color="#FFFFFF" strokeWidth={2.2} />
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}
const cp = StyleSheet.create({
  area:      { backgroundColor: BG },
  empty:     { padding: 32, alignItems: 'center', gap: 6 },
  emptyIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: hexA(ACCENT, 0.10), alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:{ fontSize: 14, fontWeight: '800', color: TEXT },
  emptySub:  { fontSize: 12, color: MUTED, textAlign: 'center' },
  countPill: { backgroundColor: hexA(ACCENT, 0.12), borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, minWidth: 24, alignItems: 'center' },
  countText: { color: ACCENT_DARK, fontSize: 11, fontWeight: '800' },
  composer:  { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: SURFACE },
  input: {
    flex: 1, minHeight: 40, maxHeight: 120,
    backgroundColor: BG, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 13, color: TEXT,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  sendBtn:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

// ── QR Card ──────────────────────────────────────────────────────
function QRCard({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [open, setOpen] = useState(false);
  const qrUrl =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}/order/${orderId}`
      : `https://dental-lab-steel.vercel.app/order/${orderId}`;

  return (
    <Card>
      <CardHeader icon="qr-code" title="QR Kodu" />
      <View style={qrs.body}>
        <View style={qrs.thumbWrap}>
          <BrandedQR value={qrUrl} size={110} color={TEXT} backgroundColor="#FFFFFF" />
        </View>
        <View style={{ flex: 1, gap: 10 }}>
          <Text style={qrs.desc}>
            Tarayan kişi bu siparişi anında açar. Etikete bas, takip kolaylaşsın.
          </Text>
          <View style={qrs.btnRow}>
            <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.85} style={[qrs.btn, qrs.btnPrimary]}>
              <Icon name="qr-code" size={13} color="#FFFFFF" strokeWidth={2} />
              <Text style={qrs.btnPrimaryText}>Büyüt</Text>
            </TouchableOpacity>
            {Platform.OS === 'web' && (
              <TouchableOpacity onPress={() => typeof window !== 'undefined' && window.print()} activeOpacity={0.85} style={[qrs.btn, qrs.btnGhost]}>
                <Icon name="printer" size={13} color={ACCENT_DARK} strokeWidth={2} />
                <Text style={qrs.btnGhostText}>Yazdır</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={qrs.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={qrs.modalCard} onPress={() => {}}>
            <View style={qrs.modalHeader}>
              <Text style={qrs.modalTitle}>İş Emri QR Kodu</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={qrs.closeBtn}>
                <Icon name="x" size={16} color={MUTED} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <Text style={qrs.modalSub}>{orderNumber}</Text>
            <View style={qrs.bigQr}>
              <BrandedQR value={qrUrl} size={260} color={TEXT} backgroundColor="#FFFFFF" />
            </View>
            <Text style={qrs.hint}>Tarayan kullanıcı bu siparişi panelinde açar</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </Card>
  );
}
const qrs = StyleSheet.create({
  body:      { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18 },
  thumbWrap: { padding: 8, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: BORDER },
  desc:      { fontSize: 12, color: MUTED, lineHeight: 17 },
  btnRow:    { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  btnPrimary:    { backgroundColor: ACCENT },
  btnPrimaryText:{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  btnGhost:      { backgroundColor: hexA(ACCENT, 0.10) },
  btnGhostText:  { color: ACCENT_DARK, fontSize: 12, fontWeight: '800' },

  backdrop:   { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard:  { backgroundColor: SURFACE, borderRadius: 20, padding: 24, alignItems: 'center', gap: 4, maxWidth: 380, width: '100%' },
  modalHeader:{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: TEXT, letterSpacing: -0.3 },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  modalSub:   { fontSize: 12, color: MUTED, marginTop: 2, fontWeight: '600' },
  bigQr:      { padding: 12, backgroundColor: SURFACE, borderRadius: 14, marginTop: 16, marginBottom: 6 },
  hint:       { fontSize: 11, color: MUTED, textAlign: 'center' },
});

// ── Photos grid ──────────────────────────────────────────────────
function PhotosGrid({ photos, signedUrls }: { photos: any[]; signedUrls: Record<string, string> }) {
  return (
    <Card>
      <CardHeader icon="image" title="Fotoğraflar" right={
        <View style={cp.countPill}>
          <Text style={cp.countText}>{photos.length}</Text>
        </View>
      } />
      <View style={ph.grid}>
        {photos.map(p => {
          const url = signedUrls[p.storage_path];
          return url ? (
            <View key={p.id} style={ph.cell}>
              <Image source={{ uri: url }} style={ph.img} />
            </View>
          ) : null;
        })}
      </View>
    </Card>
  );
}
const ph = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 14 },
  cell: { width: 110, height: 110, borderRadius: 12, overflow: 'hidden', backgroundColor: BG },
  img:  { width: '100%', height: '100%' },
});

// ── Main Screen ──────────────────────────────────────────────────
export function DoctorOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { order, signedUrls, loading, error, refetch } = useOrderDetail(id);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const isWide    = width >= 1200;

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator color={ACCENT} size="large" />
          <Text style={{ color: MUTED, marginTop: 12 }}>Yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={[s.center, { padding: 24, gap: 12 }]}>
          <Text style={{ fontSize: 32 }}>⚠️</Text>
          <Text style={{ fontSize: 16, fontWeight: '800', color: TEXT, textAlign: 'center' }}>
            Sipariş yüklenemedi
          </Text>
          <Text style={{ fontSize: 13, color: MUTED, textAlign: 'center', maxWidth: 360 }}>
            {error ?? 'Sipariş bulunamadı veya erişim yetkiniz yok.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}
              style={{ backgroundColor: BG, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}>
              <Text style={{ color: TEXT, fontWeight: '700' }}>← Geri</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={refetch} activeOpacity={0.8}
              style={{ backgroundColor: ACCENT, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const overdue   = isOrderOverdue(order.delivery_date, order.status);
  const daysInfo  = daysUntil(order.delivery_date, order.status);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top bar — sade breadcrumb */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
            <Icon name="arrow-left" size={16} color={ACCENT} strokeWidth={2.2} />
            <Text style={s.backText}>İşlerim</Text>
          </TouchableOpacity>
          <Text style={s.crumbSep}>/</Text>
          <Text style={s.crumb} numberOfLines={1}>#{order.order_number}</Text>
        </View>

        <ScrollView
          contentContainerStyle={[s.scroll, isWide && { maxWidth: 1400, alignSelf: 'center', width: '100%' }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <Hero order={order} daysInfo={daysInfo} />

          {/* Main grid — desktop 2-col (left details, right chat) */}
          <View style={[s.grid, isDesktop && s.gridDesktop]}>
            {/* LEFT — details, qr, photos, history */}
            <View style={[s.col, isDesktop && { flex: 1.3, gap: 16 }]}>
              {/* Detaylar */}
              <Card>
                <CardHeader icon="package" title="İş Detayları" />
                <View>
                  <DetailRow icon="package"  label="İş Türü"        value={order.work_type || '—'} />
                  <DetailRow icon="tooth"    label="Diş Numaraları" value={order.tooth_numbers?.length > 0 ? order.tooth_numbers.join(', ') : '—'} />
                  {order.shade && <DetailRow icon="palette" label="Renk" value={order.shade} />}
                  <DetailRow icon="cog"      label="Makine"
                    value={order.machine_type === 'milling' ? '⚙️ Frezeleme' : '🖨️ 3D Baskı'} />
                  <DetailRow icon="calendar" label="Teslim"
                    value={formatDeliveryDate(order.delivery_date)}
                    valueColor={overdue ? DANGER : undefined} />
                  {order.notes && <DetailRow icon="note" label="Notlar" value={order.notes} />}
                </View>
              </Card>

              {/* QR */}
              <QRCard orderId={order.id} orderNumber={order.order_number} />

              {/* Mobile chat — desktop'ta sağ kolonda */}
              {!isDesktop && <ChatPanel workOrderId={order.id} fillHeight={false} />}

              {/* Fotoğraflar */}
              {order.photos && order.photos.length > 0 && (
                <PhotosGrid photos={order.photos} signedUrls={signedUrls} />
              )}

              {/* Durum geçmişi */}
              <Card>
                <CardHeader icon="history" title="Durum Geçmişi" />
                <View style={{ padding: 16 }}>
                  <StatusTimeline history={order.status_history ?? []} />
                </View>
              </Card>
            </View>

            {/* RIGHT — sticky chat (desktop only) */}
            {isDesktop && (
              <View style={[s.col, { flex: 1, alignSelf: 'stretch' }]}>
                <View style={s.stickyChat}>
                  <ChatPanel workOrderId={order.id} fillHeight />
                </View>
              </View>
            )}
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: BG },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
    backgroundColor: SURFACE,
  },
  backBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 4 },
  backText:  { fontSize: 13, color: ACCENT, fontWeight: '700' },
  crumbSep:  { fontSize: 13, color: SUBTLE },
  crumb:     { fontSize: 13, color: MUTED, fontWeight: '600' },

  scroll:    { padding: 16 },

  grid:        { gap: 16 },
  gridDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  col:         { gap: 16 },

  stickyChat:  { ...(Platform.OS === 'web' ? ({ position: 'sticky' as any, top: 16 }) : {}) },
});
