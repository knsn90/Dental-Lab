import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  Image, TouchableOpacity, TextInput,
  ActivityIndicator, Platform, Modal, Pressable,
  KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';
import { useAuthStore } from '../../../core/store/authStore';
import { useOrderDetail } from '../hooks/useOrderDetail';
import { useChatMessages } from '../hooks/useChatMessages';
import { StatusBadge } from '../components/StatusBadge';
import { StatusTimeline } from '../components/StatusTimeline';
import { Card } from '../../../core/ui/Card';
import { BrandedQR } from '../../../core/ui/BrandedQR';
import { isOrderOverdue, formatDeliveryDate } from '../constants';
import { C } from '../../../core/theme/colors';

const ACCENT = '#0EA5E9'; // doctor sky blue

// ── Helpers ──────────────────────────────────────────────────────
function initials(name?: string | null) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function hexA(hex: string, a: number) {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  } catch { return hex; }
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

// ── Icons ────────────────────────────────────────────────────────
type IconName = 'send' | 'qr-code' | 'arrow-left' | 'check-check' | 'message-circle' | 'x';
function Icon({ name, size = 18, color = '#0F172A', strokeWidth = 1.8 }: {
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
    default: return null;
  }
}

// ── InfoRow ──────────────────────────────────────────────────────
function InfoRow({ label, value, valueStyle }: {
  label: string; value: string; valueStyle?: object;
}) {
  return (
    <View style={info.row}>
      <Text style={info.label}>{label}</Text>
      <Text style={[info.value, valueStyle]}>{value}</Text>
    </View>
  );
}
const info = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  label: { fontSize: 14, color: C.textSecondary, fontWeight: '500' },
  value: { fontSize: 14, color: C.textPrimary, fontWeight: '600', flex: 1, textAlign: 'right' },
});

// ── Message Bubble ───────────────────────────────────────────────
function Bubble({ msg, isMine }: { msg: any; isMine: boolean }) {
  return (
    <View style={[bs.row, isMine ? bs.rowMine : bs.rowOther]}>
      {!isMine && (
        <View style={[bs.avatar, { backgroundColor: '#94A3B8' }]}>
          <Text style={bs.avatarText}>{initials(msg.sender?.full_name)}</Text>
        </View>
      )}
      <View style={[bs.bubble, isMine ? [bs.bubbleMine, { backgroundColor: ACCENT }] : bs.bubbleOther]}>
        {!isMine && msg.sender?.full_name && (
          <Text style={bs.sender}>{msg.sender.full_name}</Text>
        )}
        {msg.content ? (
          <Text style={[bs.text, isMine && { color: '#FFFFFF' }]}>{msg.content}</Text>
        ) : null}
        <View style={bs.foot}>
          <Text style={[bs.time, isMine && { color: 'rgba(255,255,255,0.78)' }]}>
            {formatTime(msg.created_at)}
          </Text>
          {isMine && <Icon name="check-check" size={11} color="rgba(255,255,255,0.85)" strokeWidth={2.2} />}
        </View>
      </View>
    </View>
  );
}
const bs = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginVertical: 3 },
  rowMine:    { justifyContent: 'flex-end' },
  rowOther:   { justifyContent: 'flex-start' },
  avatar:     { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  bubble:     { maxWidth: '78%', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 7, gap: 3 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleOther:{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.border, borderBottomLeftRadius: 4 },
  sender:     { fontSize: 10, color: '#94A3B8', fontWeight: '700' },
  text:       { fontSize: 13, color: C.textPrimary, lineHeight: 18 },
  foot:       { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 1 },
  time:       { fontSize: 9, color: '#94A3B8', fontWeight: '600' },
});

// ── Inline Chat Section ──────────────────────────────────────────
function ChatSection({ workOrderId }: { workOrderId: string }) {
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
    <Card style={styles.card}>
      <View style={chat.header}>
        <Icon name="message-circle" size={18} color={ACCENT} strokeWidth={2} />
        <Text style={styles.sectionTitle}>Mesajlar</Text>
        <View style={{ flex: 1 }} />
        {messages.length > 0 && (
          <View style={chat.countPill}>
            <Text style={chat.countText}>{messages.length}</Text>
          </View>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={chat.area}
        contentContainerStyle={{ paddingVertical: 8 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {loading ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <ActivityIndicator color={ACCENT} />
          </View>
        ) : messages.length === 0 ? (
          <View style={chat.empty}>
            <Text style={chat.emptyText}>
              Henüz mesaj yok. Lab ile bu iş hakkında yazışabilirsin.
            </Text>
          </View>
        ) : (
          messages.map(m => (
            <Bubble key={m.id} msg={m} isMine={m.sender_id === profile?.id} />
          ))
        )}
      </ScrollView>

      <View style={chat.composer}>
        <TextInput
          style={chat.input}
          value={text}
          onChangeText={setText}
          placeholder="Mesaj yaz..."
          placeholderTextColor="#94A3B8"
          multiline
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!text.trim() || sending}
          activeOpacity={0.7}
          style={[
            chat.sendBtn,
            { backgroundColor: text.trim() ? ACCENT : hexA(ACCENT, 0.3) },
          ]}
        >
          {sending
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Icon name="send" size={15} color="#FFFFFF" strokeWidth={2.2} />
          }
        </TouchableOpacity>
      </View>
    </Card>
  );
}
const chat = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  countPill: { backgroundColor: hexA(ACCENT, 0.12), borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, minWidth: 24, alignItems: 'center' },
  countText: { color: ACCENT, fontSize: 11, fontWeight: '800' },
  area:      { maxHeight: 360, backgroundColor: '#F7F9FB', borderRadius: 12, padding: 8, marginBottom: 10 },
  empty:     { padding: 20, alignItems: 'center' },
  emptyText: { fontSize: 12, color: C.textSecondary, textAlign: 'center', maxWidth: 240, lineHeight: 17 },
  composer:  { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1, minHeight: 38, maxHeight: 100,
    backgroundColor: '#F7F9FB', borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 9,
    fontSize: 13, color: C.textPrimary,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  sendBtn:   { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});

// ── QR Section ───────────────────────────────────────────────────
function QRSection({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [open, setOpen] = useState(false);

  const qrUrl =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}/order/${orderId}`
      : `https://dental-lab-steel.vercel.app/order/${orderId}`;

  return (
    <Card style={styles.card}>
      <View style={qr.row}>
        <View style={qr.thumbWrap}>
          <BrandedQR value={qrUrl} size={80} color="#0F172A" backgroundColor="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>QR Kodu</Text>
          <Text style={qr.sub}>
            Tarayan kişi bu siparişi anında açar. Etikete bas, takip kolaylaşsın.
          </Text>
          <TouchableOpacity
            onPress={() => setOpen(true)}
            activeOpacity={0.85}
            style={[qr.btn, { backgroundColor: ACCENT }]}
          >
            <Icon name="qr-code" size={14} color="#FFFFFF" strokeWidth={2} />
            <Text style={qr.btnText}>Büyüt & Yazdır</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal — büyük QR */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={qr.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={qr.modalCard} onPress={() => {}}>
            <View style={qr.modalHeader}>
              <Text style={qr.modalTitle}>İş Emri QR Kodu</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={qr.closeBtn}>
                <Icon name="x" size={16} color={C.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <Text style={qr.modalSub}>{orderNumber}</Text>
            <View style={qr.bigQr}>
              <BrandedQR value={qrUrl} size={240} color="#0F172A" backgroundColor="#FFFFFF" />
            </View>
            <Text style={qr.hint}>Tarayan kullanıcı bu siparişi panelinde açar</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </Card>
  );
}
const qr = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', gap: 14 },
  thumbWrap:  { padding: 6, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: C.border },
  sub:        { fontSize: 12, color: C.textSecondary, marginTop: 4, marginBottom: 10, lineHeight: 16 },
  btn:        { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  btnText:    { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },

  backdrop:   { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard:  { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, alignItems: 'center', gap: 4, maxWidth: 360, width: '100%' },
  modalHeader:{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: C.textPrimary, letterSpacing: -0.3 },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  modalSub:   { fontSize: 12, color: C.textSecondary, marginTop: 2, fontWeight: '600' },
  bigQr:      { padding: 12, backgroundColor: '#FFFFFF', borderRadius: 14, marginTop: 16, marginBottom: 6 },
  hint:       { fontSize: 11, color: C.textSecondary, textAlign: 'center' },
});

// ── Main Screen ──────────────────────────────────────────────────
export function DoctorOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { order, signedUrls, loading, error } = useOrderDetail(id);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.textSecondary }}>Yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
          <Text style={{ fontSize: 32 }}>⚠️</Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.textPrimary, textAlign: 'center' }}>
            Sipariş yüklenemedi
          </Text>
          <Text style={{ fontSize: 13, color: C.textSecondary, textAlign: 'center', maxWidth: 320 }}>
            {error ?? 'Sipariş bulunamadı veya erişim yetkiniz yok.'}
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginTop: 8, backgroundColor: ACCENT, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 }}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>← Geri</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const overdue = isOrderOverdue(order.delivery_date, order.status);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Icon name="arrow-left" size={18} color={ACCENT} strokeWidth={2} />
            <Text style={styles.back}>Geri</Text>
          </TouchableOpacity>
          <Text style={styles.orderNumber}>{order.order_number}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Status */}
          <Card style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <StatusBadge status={order.status} />
              {overdue && <Text style={styles.overdueWarning}>⚠️ Teslim tarihi geçti!</Text>}
            </View>
          </Card>

          {/* Work Details */}
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>İş Detayları</Text>
            <InfoRow label="İş Türü" value={order.work_type} />
            <InfoRow label="Diş Numaraları" value={order.tooth_numbers.join(', ')} />
            {order.shade && <InfoRow label="Renk" value={order.shade} />}
            <InfoRow
              label="Makine"
              value={order.machine_type === 'milling' ? '⚙️ Frezeleme' : '🖨️ 3D Baskı'}
            />
            <InfoRow
              label="Teslim Tarihi"
              value={formatDeliveryDate(order.delivery_date)}
              valueStyle={overdue ? { color: C.danger } : undefined}
            />
            {order.notes && <InfoRow label="Notlar" value={order.notes} />}
          </Card>

          {/* QR */}
          <QRSection orderId={order.id} orderNumber={order.order_number} />

          {/* Mesajlar — bu işin chat kutusu */}
          <ChatSection workOrderId={order.id} />

          {/* Photos */}
          {order.photos && order.photos.length > 0 && (
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>Fotoğraflar</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.photoRow}>
                  {order.photos.map((photo) => {
                    const url = signedUrls[photo.storage_path];
                    return url ? (
                      <Image key={photo.id} source={{ uri: url }} style={styles.photo} />
                    ) : null;
                  })}
                </View>
              </ScrollView>
            </Card>
          )}

          {/* Status History */}
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Durum Geçmişi</Text>
            <StatusTimeline history={order.status_history ?? []} />
          </Card>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 4 },
  back: { fontSize: 14, color: ACCENT, fontWeight: '700' },
  orderNumber: { fontSize: 13, fontWeight: '700', color: C.textSecondary, letterSpacing: 0.3 },
  content: { padding: 16 },
  card: { marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.textPrimary, marginBottom: 10 },
  overdueWarning: { color: C.danger, fontWeight: '700', fontSize: 12 },
  photoRow: { flexDirection: 'row', gap: 10 },
  photo: { width: 120, height: 120, borderRadius: 10 },
});
