import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { setActiveChatOrder, getActiveChatOrder } from '../../../core/notifications/activeChat';
import {
  fetchMessages, markMessagesAsRead, sendMessage, deleteMessage,
  approveMessage, rejectMessage, approveAllPending,
  OrderMessage, ChatAttachment,
} from '../chatApi';

// Stale-while-revalidate cache — iş emri başına ayrı kayıt
const CACHE_PREFIX = 'order_chat_msgs_v1:';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat

function readMsgCache(workOrderId: string): OrderMessage[] | null {
  if (Platform.OS !== 'web' || !workOrderId) return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + workOrderId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.items)) return null;
    if (typeof parsed.ts === 'number' && Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.items as OrderMessage[];
  } catch { return null; }
}

function writeMsgCache(workOrderId: string, items: OrderMessage[]) {
  if (Platform.OS !== 'web' || !workOrderId) return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + workOrderId, JSON.stringify({ ts: Date.now(), items }));
  } catch { /* quota / disabled */ }
}

export function useChatMessages(workOrderId: string, currentUserId?: string | null) {
  // İlk render → cache varsa anında dolu
  const initial = workOrderId ? readMsgCache(workOrderId) : null;
  const [messages, setMessages] = useState<OrderMessage[]>(initial ?? []);
  const [loading, setLoading]   = useState(!initial);
  const [sending, setSending]   = useState(false);

  const load = useCallback(async () => {
    if (!workOrderId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    try {
      // Cache yoksa spinner; varsa sessiz arka plan refresh
      if (!readMsgCache(workOrderId)) setLoading(true);
      const { data, error } = await fetchMessages(workOrderId);
      if (error) {
        console.warn('[chat] fetchMessages error:', error.message);
        if (!readMsgCache(workOrderId)) setMessages([]);
      } else {
        const arr = (data as OrderMessage[]) ?? [];
        setMessages(arr);
        writeMsgCache(workOrderId, arr);
      }
    } catch (e) {
      console.warn('[chat] unexpected error:', e);
      if (!readMsgCache(workOrderId)) setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  // Mesajları otomatik "okundu" işaretle
  const markRead = useCallback(async () => {
    if (!workOrderId || !currentUserId) return;
    try {
      await markMessagesAsRead(workOrderId, currentUserId);
    } catch (e) {
      // Tablo henüz yoksa sessizce geç (migration uygulanmamış olabilir)
    }
  }, [workOrderId, currentUserId]);

  useEffect(() => {
    if (!workOrderId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    load();
    // Chat açıldığında karşı tarafın mesajlarını okundu yap
    markRead();
    // Bu thread artık EKRANDA AÇIK → buna gelen yeni mesaj için in-app toast
    // gösterilmesin (kullanıcı zaten okuyor). Unmount'ta temizle.
    setActiveChatOrder(workOrderId);

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`order_messages_${workOrderId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'order_messages',
            filter: `work_order_id=eq.${workOrderId}`,
          },
          () => {
            load();
            // Yeni gelen mesajı hemen okundu işaretle
            markRead();
          }
        )
        .on(
          'postgres_changes',
          {
            // UPDATE: karşı taraf bizim mesajlarımızı okudu → read_at set edildi
            // Bu event bize tick'leri güncelleme sinyali verir.
            event: 'UPDATE',
            schema: 'public',
            table: 'order_messages',
            filter: `work_order_id=eq.${workOrderId}`,
          },
          () => { load(); }
        )
        .on(
          'postgres_changes',
          {
            // DELETE: karşı taraf mesajını sildi → ekrandan da kaldır.
            // (REPLICA IDENTITY FULL gerektirir; yoksa filtre eşleşmez ve
            //  bir sonraki fetch'te güncellenir — graceful degradation.)
            event: 'DELETE',
            schema: 'public',
            table: 'order_messages',
            filter: `work_order_id=eq.${workOrderId}`,
          },
          (payload: any) => {
            const goneId = payload?.old?.id;
            if (goneId) setMessages(prev => prev.filter(m => m.id !== goneId));
            else load();
          }
        )
        .subscribe();
    } catch (e) {
      console.warn('[chat] realtime subscribe error:', e);
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
      // Thread kapandı → aktif sohbet işaretini kaldır (yalnız hâlâ bu order ise;
      // başka bir thread araya girdiyse onun işaretini ezme)
      if (getActiveChatOrder() === workOrderId) setActiveChatOrder(null);
    };
  }, [workOrderId, load, markRead]);

  const send = async (senderId: string, content: string): Promise<string | null> => {
    if (!content.trim()) return null;
    setSending(true);
    const { error } = await sendMessage(workOrderId, senderId, content);
    setSending(false);
    if (error) {
      console.warn('[chat] send error:', error.message);
      return error.message;
    }
    await load();
    return null;
  };

  const sendWithAttachment = async (
    senderId: string,
    content: string,
    attachment: ChatAttachment
  ): Promise<string | null> => {
    setSending(true);
    const { error } = await sendMessage(workOrderId, senderId, content, attachment);
    setSending(false);
    if (error) {
      console.warn('[chat] sendWithAttachment error:', error.message);
      return error.message;
    }
    await load();
    return null;
  };

  // Kendi mesajını sil (hard delete) — optimistik kaldır, hata olursa geri yükle.
  // RLS gönderici+5dk / admin / lab-manager dışında reddeder.
  const remove = async (messageId: string): Promise<string | null> => {
    const snapshot = messages;
    setMessages(prev => prev.filter(m => m.id !== messageId));
    const { error } = await deleteMessage(messageId);
    if (error) {
      console.warn('[chat] delete error:', error.message);
      setMessages(snapshot);   // geri al
      return error.message;
    }
    writeMsgCache(workOrderId, snapshot.filter(m => m.id !== messageId));
    return null;
  };

  const approve = async (messageId: string) => {
    const { error } = await approveMessage(messageId);
    if (error) console.warn('[chat] approve error:', error.message);
    else await load();
  };

  const reject = async (messageId: string) => {
    const { error } = await rejectMessage(messageId);
    if (error) console.warn('[chat] reject error:', error.message);
    else await load();
  };

  const approveAll = async () => {
    const { error } = await approveAllPending(workOrderId);
    if (error) console.warn('[chat] approveAll error:', error.message);
    else await load();
  };

  const pendingCount = messages.filter(m => m.approval_status === 'pending').length;

  return { messages, loading, sending, send, sendWithAttachment, remove, approve, reject, approveAll, pendingCount, refetch: load };
}
