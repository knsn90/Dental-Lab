/**
 * MessagesB5Mobile — Variant B B5 inbox + B5b thread.
 * Self-contained: manages list ↔ thread navigation internally.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, Pressable, ScrollView, FlatList, TextInput,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import {
  ChevronLeft, X, Send, Mic, Camera, Sparkles,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DS } from '../../../core/theme/dsTokens';
import { MFONT, useMobileTheme } from '../../../core/theme/mobileTheme';
import { useOrderChatInbox } from '../hooks/useOrderChatInbox';
import { useChatMessages } from '../hooks/useChatMessages';
import { sendMessage } from '../chatApi';
import { useAuthStore } from '../../../core/store/authStore';

interface Props {
  onClose: () => void;
}

export function MessagesB5Mobile({ onClose }: Props) {
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [openOrderHeader, setOpenOrderHeader] = useState<{ name: string; sub: string } | null>(null);

  if (openOrderId) {
    return (
      <ThreadView
        orderId={openOrderId}
        senderName={openOrderHeader?.name ?? 'Sohbet'}
        sub={openOrderHeader?.sub ?? ''}
        onBack={() => { setOpenOrderId(null); setOpenOrderHeader(null); }}
      />
    );
  }
  return (
    <InboxView
      onClose={onClose}
      onOpenOrder={(id, name, sub) => { setOpenOrderId(id); setOpenOrderHeader({ name, sub }); }}
    />
  );
}

// ─── Inbox ───────────────────────────────────────────────────────────────────
function InboxView({
  onClose, onOpenOrder,
}: {
  onClose: () => void;
  onOpenOrder: (orderId: string, senderName: string, sub: string) => void;
}) {
  const theme = useMobileTheme();
  const { items, loading } = useOrderChatInbox();

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.topRow}>
        <Pressable onPress={onClose} hitSlop={8} style={styles.topBtn}>
          <X size={20} color={DS.ink[900]} strokeWidth={2} />
        </Pressable>
        <Text style={styles.eyebrow}>MESAJLAR</Text>
        <View style={styles.topBtn} />
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 8 }}>
        <Text style={styles.h1}>Sohbetler</Text>
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
            const senderName = item.doctor_name ?? item.clinic_name ?? 'Sohbet';
            const sub = item.work_type ?? `Sipariş #${item.order_number}`;
            return (
              <Pressable onPress={() => onOpenOrder(item.work_order_id, senderName, sub)}>
                <View style={[
                  styles.inboxCard,
                  unread
                    ? { backgroundColor: theme.accent }
                    : { backgroundColor: '#FFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
                ]}>
                  <View style={styles.inboxHead}>
                    <View style={[styles.avatar, { backgroundColor: unread ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)' }]}>
                      <Text style={[styles.avatarText, { color: unread ? '#FFF' : DS.ink[700] }]}>
                        {senderName.slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[
                        styles.sender,
                        { color: unread ? '#FFF' : DS.ink[900], fontWeight: unread ? '700' : '600' },
                      ]} numberOfLines={1}>
                        {senderName}
                      </Text>
                      <Text style={[
                        styles.preview,
                        { color: unread ? 'rgba(255,255,255,0.85)' : DS.ink[500] },
                      ]} numberOfLines={2}>
                        {item.last_content ?? sub}
                      </Text>
                    </View>
                    <Text style={[styles.timeMeta, { color: unread ? 'rgba(255,255,255,0.55)' : DS.ink[400] }]}>
                      {item.last_created_at ? formatTimeShort(item.last_created_at) : ''}
                    </Text>
                  </View>

                  {unread && (
                    <View style={[styles.unreadPill, { backgroundColor: theme.primary }]}>
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
  orderId, senderName, sub, onBack,
}: {
  orderId: string;
  senderName: string;
  sub: string;
  onBack: () => void;
}) {
  const theme = useMobileTheme();
  const { profile } = useAuthStore();
  const { messages, loading, refetch } = useChatMessages(orderId, profile?.id);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    // Scroll to bottom on new messages
    setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 100);
  }, [messages.length]);

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

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.bg }]}>
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
              return (
                <View style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
                  <View style={[
                    styles.bubble,
                    mine
                      ? { backgroundColor: theme.accent, borderTopRightRadius: 22, borderBottomRightRadius: 6 }
                      : { backgroundColor: '#FFF', borderColor: 'rgba(0,0,0,0.06)', borderWidth: 1, borderTopLeftRadius: 22, borderBottomLeftRadius: 6 },
                  ]}>
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
                  </View>
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
          <Pressable style={styles.composerCircle} hitSlop={6}>
            <Camera size={18} color={DS.ink[700]} strokeWidth={1.8} />
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
              { backgroundColor: theme.accent, opacity: !draft.trim() || sending ? 0.6 : 1 },
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
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 4,
  },
  topBtn: {
    width: 36,
    height: 36,
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
    backgroundColor: 'rgba(255,255,255,0.6)',
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
  },
  bubble: {
    maxWidth: '80%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
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
