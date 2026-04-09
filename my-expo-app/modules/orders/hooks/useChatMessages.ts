import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../core/api/supabase';
import { fetchMessages, sendMessage, OrderMessage, ChatAttachment } from '../chatApi';

export function useChatMessages(workOrderId: string) {
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [sending, setSending]   = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await fetchMessages(workOrderId);
      // If table doesn't exist yet, silently show empty list
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

  useEffect(() => {
    load();

    // Only subscribe if table likely exists (avoid crash on missing table)
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
          () => { load(); }
        )
        .subscribe();
    } catch (e) {
      console.warn('[chat] realtime subscribe error:', e);
    }

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [workOrderId, load]);

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

  return { messages, loading, sending, send, sendWithAttachment };
}
