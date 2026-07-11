/**
 * MessagesB5Mobile — Variant B B5 inbox + B5b thread.
 * Self-contained: manages list ↔ thread navigation internally.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, Pressable, ScrollView, FlatList, TextInput,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import {
  ChevronLeft, X, Send, Mic, Camera, Sparkles, Paperclip, Trash2,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { DS } from '../../../core/theme/dsTokens';
import { MFONT, useMobileTheme } from '../../../core/theme/mobileTheme';
import { useOrderChatInbox } from '../hooks/useOrderChatInbox';
import { useChatMessages } from '../hooks/useChatMessages';
import { sendMessage, uploadChatAttachment, isWithinDeleteWindow, type AttachmentType } from '../chatApi';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { useAuthStore } from '../../../core/store/authStore';

function _toRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '');
  if (m.length !== 6) return null;
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  };
}

/** accent'i base zemin üzerine `amount` oranında harmanla → OPAK tonlu renk.
 * (Şeffaf rgba değil — backdrop arkadan sızmasın, yazılar okunur kalsın.) */
function tintOver(base: string, accent: string, amount: number): string {
  const b = _toRgb(base);
  const a = _toRgb(accent);
  if (!b || !a) return base;
  const mix = (x: number, y: number) => Math.round(x * (1 - amount) + y * amount);
  return `rgb(${mix(b.r, a.r)},${mix(b.g, a.g)},${mix(b.b, a.b)})`;
}

interface Props {
  onClose: () => void;
  /** Panel rengi — başlık & accent vurguları için (varsayılan: theme.accent) */
  accentColor?: string;
}

export function MessagesB5Mobile({ onClose, accentColor }: Props) {
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [openOrderHeader, setOpenOrderHeader] = useState<{ name: string; sub: string } | null>(null);

  if (openOrderId) {
    return (
      <ThreadView
        orderId={openOrderId}
        senderName={openOrderHeader?.name ?? 'Sohbet'}
        sub={openOrderHeader?.sub ?? ''}
        accentColor={accentColor}
        onBack={() => { setOpenOrderId(null); setOpenOrderHeader(null); }}
      />
    );
  }
  return (
    <InboxView
      onClose={onClose}
      accentColor={accentColor}
      onOpenOrder={(id, name, sub) => { setOpenOrderId(id); setOpenOrderHeader({ name, sub }); }}
    />
  );
}

// ─── Inbox ───────────────────────────────────────────────────────────────────
function InboxView({
  onClose, onOpenOrder, accentColor,
}: {
  onClose: () => void;
  onOpenOrder: (orderId: string, senderName: string, sub: string) => void;
  accentColor?: string;
}) {
  const theme = useMobileTheme();
  const { items, loading } = useOrderChatInbox();
  const { profile } = useAuthStore();
  // Lab tarafı (lab/admin/teknisyen) → klinik adı + altında hekim. Klinik/hekim → hasta adı.
  const isLabSide = profile?.user_type === 'lab' || profile?.user_type === 'admin';
  // Sayfa bg'si: accentColor verildiyse NÖTR beyaz/koyu base üzerine accent'i
  // hafif harmanla — böylece panel rengine çalan temiz beyaz (light) / koyu (dark)
  // zemin olur. accentColor yoksa theme.bg (role default).
  // NOT: theme.bg role-default'u (station→saffron) yansıtabildiği için base'i
  // doğrudan accent'ten türetiyoruz, theme.bg'yi kullanmıyoruz.
  const neutralBase = theme.isDark ? '#101418' : '#FFFFFF';
  const pageBg = accentColor
    ? tintOver(neutralBase, accentColor, theme.isDark ? 0.12 : 0.05)
    : theme.bg;
  // Panel-colored vurgular (unread kart bg + okunmamış pill) — accentColor verildiyse onu kullan.
  const uiAccent  = accentColor ?? theme.accent;
  const uiPrimary = accentColor ?? theme.primary;

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: pageBg }]}>
      <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8, position: 'relative' }}>
        <Text style={[styles.h1, { color: theme.text }]}>Mesajlar</Text>
        <Pressable
          onPress={onClose}
          hitSlop={16}
          style={[styles.topBtn, { position: 'absolute', top: 8, right: 16 }]}
        >
          <X size={22} color={theme.text} strokeWidth={2.2} />
        </Pressable>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : items.length === 0 ? (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <Text style={[styles.subtleText, { textAlign: 'center' }]}>Henüz mesaj yok.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.work_order_id}
          contentContainerStyle={{ padding: 24, paddingTop: 8, paddingBottom: 140, gap: 12 }}
          renderItem={({ item }) => {
            const unread = item.unread_for_me > 0;
            // Panel tarafına göre başlık: lab → klinik adı (alt: hekim), klinik/hekim → hasta adı
            const senderName = isLabSide
              ? (item.clinic_name ?? item.doctor_name ?? 'Sohbet')
              : (item.patient_name ?? item.work_type ?? 'Sohbet');
            const titleSub = isLabSide
              ? (item.clinic_name ? (item.doctor_name ?? null) : null)
              : null;
            const sub = item.work_type ?? `Sipariş #${item.order_number}`;
            return (
              <Pressable onPress={() => onOpenOrder(item.work_order_id, senderName, sub)}>
                <View style={[
                  styles.inboxCard,
                  unread
                    ? { backgroundColor: uiAccent }
                    : { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.border },
                ]}>
                  <View style={styles.inboxHead}>
                    <View style={[styles.avatar, { backgroundColor: unread ? 'rgba(255,255,255,0.10)' : (theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') }]}>
                      <Text style={[styles.avatarText, { color: unread ? '#FFF' : theme.text }]}>
                        {senderName.slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[
                        styles.sender,
                        { color: unread ? '#FFF' : theme.text, fontWeight: unread ? '700' : '600' },
                      ]} numberOfLines={1}>
                        {senderName}
                      </Text>
                      {titleSub ? (
                        <Text style={[
                          styles.preview,
                          { color: unread ? 'rgba(255,255,255,0.9)' : theme.text, fontWeight: '600', marginBottom: 1 },
                        ]} numberOfLines={1}>
                          {titleSub}
                        </Text>
                      ) : null}
                      <Text style={[
                        styles.preview,
                        { color: unread ? 'rgba(255,255,255,0.85)' : theme.textMuted },
                      ]} numberOfLines={2}>
                        {item.last_content ?? sub}
                      </Text>
                    </View>
                    <Text style={[styles.timeMeta, { color: unread ? 'rgba(255,255,255,0.55)' : theme.textDim }]}>
                      {item.last_created_at ? formatTimeShort(item.last_created_at) : ''}
                    </Text>
                  </View>

                  {unread && (
                    <View style={[styles.unreadPill, { backgroundColor: uiPrimary }]}>
                      <Text style={[styles.unreadPillText, { color: theme.accent }]}>
                        {item.unread_for_me} yeni mesaj →
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Thread ──────────────────────────────────────────────────────────────────
function ThreadView({
  orderId, senderName, sub, onBack, accentColor,
}: {
  orderId: string;
  senderName: string;
  sub: string;
  onBack: () => void;
  accentColor?: string;
}) {
  const theme = useMobileTheme();
  const { profile } = useAuthStore();
  const { messages, loading, refetch, remove } = useChatMessages(orderId, profile?.id);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // Kendi mesajını silme onayı — yalnız 5 dk penceresi içinde tetiklenir
  const askDelete = (msg: any) => {
    setConfirm({
      title:   'Mesajı sil',
      message: 'Bu mesaj kalıcı olarak silinecek. Bu işlem geri alınamaz.',
      label:   'Sil',
      variant: 'danger',
      onConfirm: async () => { await remove(msg.id); },
    });
  };
  const listRef = useRef<FlatList>(null);
  const neutralBase = theme.isDark ? '#101418' : '#FFFFFF';
  const threadBg = accentColor ? tintOver(neutralBase, accentColor, theme.isDark ? 0.12 : 0.05) : theme.bg;
  const uiAccent = accentColor ?? theme.accent;

  useEffect(() => {
    // Scroll to bottom on new messages
    setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 100);
  }, [messages.length]);

  const [uploading, setUploading] = useState(false);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending || !profile?.id) return;
    setSending(true);
    setDraft('');
    // chatApi.sendMessage(workOrderId, senderId, content) — pozisyonel imza
    await sendMessage(orderId, profile.id, text);
    setSending(false);
    refetch();
  };

  // Dosya ekle — iOS native DocumentPicker → blob fetch → Supabase upload → mesaj
  const handleAttach = async () => {
    if (uploading || sending || !profile?.id) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      setUploading(true);

      // URI → Blob
      const fileRes = await fetch(asset.uri);
      const blob = await fileRes.blob();
      const fileName = asset.name ?? `dosya_${Date.now()}`;

      const { url, error } = await uploadChatAttachment(blob, orderId, fileName);
      if (error || !url) {
        setUploading(false);
        Alert.alert('Yükleme hatası', error ?? 'Dosya yüklenemedi.');
        return;
      }

      // Tür belirle
      const mime = asset.mimeType ?? '';
      const type: AttachmentType =
        mime.startsWith('image/') ? 'image'
        : mime.startsWith('audio/') ? 'audio'
        : 'file';

      await sendMessage(orderId, profile.id, draft.trim(), {
        url, type, name: fileName, size: asset.size ?? undefined,
      });
      setDraft('');
      setUploading(false);
      refetch();
    } catch (e: any) {
      setUploading(false);
      Alert.alert('Hata', e?.message ?? 'Dosya eklenemedi.');
    }
  };

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: threadBg }]}>
      {/* Sticky header */}
      <View style={styles.threadHead}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.topBtn}>
          <ChevronLeft size={22} color={DS.ink[900]} strokeWidth={2} />
        </Pressable>
        <View style={[styles.threadAvatar, { backgroundColor: 'rgba(0,0,0,0.06)' }]}>
          <Text style={[styles.threadAvatarText, { color: DS.ink[900] }]}>
            {senderName.slice(0, 2).toUpperCase()}
          </Text>
          <View style={styles.onlineDot} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.threadName} numberOfLines={1}>{senderName}</Text>
          <Text style={styles.threadSub} numberOfLines={1}>{sub}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={20}
      >
        {loading && messages.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 12, gap: 8 }}
            renderItem={({ item }) => {
              const mine = item.sender_id === profile?.id;
              // Silinebilir mi: yalnız kendi mesajı + gönderimden sonraki 5 dk
              const canDelete = mine && isWithinDeleteWindow(item.created_at);
              return (
                <View style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
                  {/* Web hover trash — silinebilir kendi mesajları için (balonun solunda) */}
                  {canDelete && Platform.OS === 'web' && (
                    <Pressable
                      onPress={() => askDelete(item)}
                      hitSlop={8}
                      style={styles.bubbleDelWeb}
                      // @ts-ignore web cursor
                      dataSet={{ cursor: 'pointer' }}
                    >
                      <Trash2 size={15} color="#D94B4B" strokeWidth={1.8} />
                    </Pressable>
                  )}
                  <Pressable
                    onLongPress={canDelete ? () => askDelete(item) : undefined}
                    delayLongPress={350}
                    style={[
                      styles.bubble,
                      mine
                        ? { backgroundColor: uiAccent, borderTopRightRadius: 22, borderBottomRightRadius: 6 }
                        : { backgroundColor: '#FFF', borderColor: 'rgba(0,0,0,0.06)', borderWidth: 1, borderTopLeftRadius: 22, borderBottomLeftRadius: 6 },
                    ]}
                  >
                    {!!item.content && (
                      <Text style={{
                        color: mine ? '#FFF' : DS.ink[900],
                        fontFamily: MFONT.uiRegular,
                        fontSize: 14,
                        lineHeight: 20,
                      }}>
                        {item.content}
                      </Text>
                    )}
                  </Pressable>
                </View>
              );
            }}
          />
        )}

        {/* AI suggestion pill (placeholder when no messages yet) */}
        {messages.length === 0 && !loading && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <View style={[styles.aiSuggestion, { backgroundColor: theme.primary }]}>
              <Sparkles size={14} color={theme.accent} strokeWidth={2} />
              <Text style={[styles.aiSuggestionText, { color: theme.accent }]} numberOfLines={2}>
                Önerilen yanıt: "Merhaba, sipariş hakkında konuşalım."
              </Text>
            </View>
          </View>
        )}

        {/* Composer */}
        <View style={styles.composer}>
          <Pressable
            style={styles.composerCircle}
            hitSlop={6}
            onPress={handleAttach}
            disabled={uploading}
          >
            {uploading
              ? <ActivityIndicator color={uiAccent} size="small" />
              : <Paperclip size={18} color={DS.ink[700]} strokeWidth={1.8} />}
          </Pressable>
          <View style={styles.composerInput}>
            <TextInput
              style={styles.composerTextInput}
              placeholder="Mesaj yaz…"
              placeholderTextColor={DS.ink[400]}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={2000}
            />
          </View>
          <Pressable
            onPress={handleSend}
            disabled={sending || !draft.trim()}
            style={[
              styles.composerCircle,
              { backgroundColor: uiAccent, opacity: !draft.trim() || sending ? 0.6 : 1 },
            ]}
          >
            {sending ? (
              <ActivityIndicator color={theme.primary} size="small" />
            ) : draft.trim() ? (
              <Send size={16} color="#FFF" strokeWidth={2} />
            ) : (
              <Mic size={16} color="#FFF" strokeWidth={2} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </SafeAreaView>
  );
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(+d)) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
  if (+dayStart === +today) {
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
  },
  topBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    color: DS.ink[500],
    letterSpacing: 0.66,
  },
  h1: {
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 36,
    color: DS.ink[900],
    letterSpacing: -1.62,
    lineHeight: 38,
    paddingTop: 10,
  },
  subtleText: {
    fontFamily: MFONT.uiRegular,
    fontSize: 13,
    color: DS.ink[500],
  },

  // Inbox card
  inboxCard: {
    padding: 18,
    borderRadius: 22,
  },
  inboxHead: {
    flexDirection: 'row',
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
  },
  sender: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  preview: {
    fontFamily: MFONT.uiRegular,
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
  },
  timeMeta: {
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    marginTop: 1,
  },
  unreadPill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  unreadPillText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 12,
    letterSpacing: -0.1,
  },

  // Thread head
  threadHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    backgroundColor: 'transparent',
  },
  threadAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  threadAvatarText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 13,
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  threadName: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 15,
    color: DS.ink[900],
    letterSpacing: -0.2,
  },
  threadSub: {
    fontFamily: MFONT.uiRegular,
    fontSize: 11,
    color: DS.ink[500],
    marginTop: 1,
  },

  // Bubbles
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bubble: {
    maxWidth: '80%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
  },
  bubbleDelWeb: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },

  // AI suggestion
  aiSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  aiSuggestionText: {
    flex: 1,
    fontFamily: MFONT.uiMedium,
    fontSize: 12,
  },

  // Composer
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  composerCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInput: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 38,
    maxHeight: 100,
    justifyContent: 'center',
  },
  composerTextInput: {
    fontFamily: MFONT.uiRegular,
    fontSize: 14,
    color: DS.ink[900],
    padding: 0,
  },
});
