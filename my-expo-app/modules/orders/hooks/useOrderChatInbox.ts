import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { fetchOrderChatInbox, OrderChatInboxItem } from '../chatApi';

/**
 * Inbox hook — kullanıcının tüm iş emri chat'lerini listeler,
 * realtime güncellemelerle yeniden yükler.
 */
export function useOrderChatInbox() {
  const { profile } = useAuthStore();
  const [items,   setItems]   = useState<OrderChatInboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.id) { setLoading(false); return; }
    const { data, error } = await fetchOrderChatInbox(profile.id);
    if (error) {
      console.warn('[chat-inbox] load error:', error.message);
      setItems([]);
    } else {
      setItems(data ?? []);
    }
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    load();

    // Realtime — herhangi bir chat'e yeni mesaj gelirse listeyi yenile
    const channel = supabase
      .channel('order_chat_inbox_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_messages' },
        () => { load(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const totalUnread = items.reduce((s, it) => s + it.unread_for_me, 0);

  return { items, loading, totalUnread, refetch: load };
}
