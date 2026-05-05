import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../core/api/supabase';
import {
  fetchMessages, markMessagesAsRead, sendMessage,
  approveMessage, rejectMessage, approveAllPending,
  OrderMessage, ChatAttachment,
} from '../chatApi';

export function useChatMessages(workOrderId: string, currentUserId?: string | null) {
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [sending, setSending]   = useState(false);

  const load = useCallback(async () => {
    if (!workOrderId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await fetchMessages(workOrderId);
      if (error) {
        console.warn('[chat] fetchMessages error:', error.message);
        setMessages([]);
      } else {
        setMessages((data as OrderMessage[]) ?? []);
      }
    } catch (e) {
      console.warn('[chat] unexpected error:', e);
      setMessages([]);
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
        .subscribe();
    } catch (e) {
      console.warn('[chat] realtime subscribe error:', e);
    }

    return () => { if (channel) supabase.removeChannel(channel); };
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

  return { messages, loading, sending, send, sendWithAttachment, approve, reject, approveAll, pendingCount };
}
