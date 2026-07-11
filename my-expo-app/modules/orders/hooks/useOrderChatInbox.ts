import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { toast } from '../../../core/ui/Toast';
import { getActiveChatOrder } from '../../../core/notifications/activeChat';
import { fetchOrderChatInbox, OrderChatInboxItem } from '../chatApi';

// Stale-while-revalidate cache — kullanıcı başına ayrı kayıt
const CACHE_PREFIX = 'order_chat_inbox_v1:';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat

function readInboxCache(userId: string): OrderChatInboxItem[] | null {
  if (Platform.OS !== 'web') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.items)) return null;
    if (typeof parsed.ts === 'number' && Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.items as OrderChatInboxItem[];
  } catch { return null; }
}

function writeInboxCache(userId: string, items: OrderChatInboxItem[]) {
  if (Platform.OS !== 'web') return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify({ ts: Date.now(), items }));
  } catch { /* quota / disabled */ }
}

/**
 * Inbox hook — kullanıcının tüm iş emri chat'lerini listeler,
 * realtime güncellemelerle yeniden yükler.
 * localStorage cache ile anında render, arka planda taze veri çeker.
 */
export function useOrderChatInbox() {
  const { profile } = useAuthStore();
  // Teknisyen mi? (lab user_type + technician/courier role) — yalnızca dahil olduğu
  // iş emirlerinin mesajlarını görür.
  const isTechnician =
    profile?.user_type === 'lab' &&
    ((profile as any)?.role === 'technician' || (profile as any)?.role === 'courier');

  // İlk render → cache varsa anında dolu
  const initial = profile?.id ? readInboxCache(profile.id) : null;
  const [items,   setItems]   = useState<OrderChatInboxItem[]>(initial ?? []);
  const [loading, setLoading] = useState(!initial);

  const load = useCallback(async () => {
    if (!profile?.id) { setLoading(false); return; }
    // Cache yoksa spinner; varsa sessiz arka plan refresh
    if (!readInboxCache(profile.id)) setLoading(true);
    const { data, error } = await fetchOrderChatInbox(profile.id, {
      restrictTechnician: isTechnician,
    });
    if (error) {
      console.warn('[chat-inbox] load error:', error.message);
      // Hata olursa cache'i koru, sıfırlama
      if (!readInboxCache(profile.id)) setItems([]);
    } else {
      const arr = data ?? [];
      setItems(arr);
      writeInboxCache(profile.id, arr);
    }
    setLoading(false);
  }, [profile?.id, isTechnician]);

  useEffect(() => {
    load();

    // Realtime — yeni mesaj veya okundu işareti (read_at UPDATE) gelirse yenile.
    //
    // KRİTİK fix: kanal adı INSTANCE-UNIQUE olmalı. Eski kod sabit
    // 'order_chat_inbox_realtime' kullanıyordu; hook birden fazla yerden
    // mount edilirse (veya React 19 effect re-fire ederse) ikinci instance
    // aynı isimle kanal isteyince Supabase ilk kanalı subscribed bulup
    // `.on('postgres_changes', …)`'a izin vermiyor — exception fırlatıyor:
    //   "cannot add `postgres_changes` callbacks for realtime:... after `subscribe()`"
    // Bu exception React render tree'sini çökertip beyaz/kırmızı ekrana yol açıyordu.
    const channelName = `order_chat_inbox_realtime_${profile?.id ?? 'anon'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_messages' },
        (payload: any) => {
          load();
          // Bildirim tercihleri uyuyorsa browser push tetikle
          try {
            const newRow = payload?.new ?? {};
            // Karşı taraftan gelen mesajsa bildir (kendi gönderdiklerimi pas geç)
            if (newRow.sender_id && newRow.sender_id !== profile?.id) {
              const orderId = newRow.work_order_id ?? newRow.id;
              const preview = newRow.content
                ? String(newRow.content).slice(0, 120)
                : 'Bir iş emrinde yeni mesaj geldi';

              // 1) Browser/OS push (sekme arka plandayken) — pref'e bağlı
              const { useNotificationPrefs, showBrowserPush } =
                require('../../../core/store/notificationPrefsStore');
              const state = useNotificationPrefs.getState();
              if (state.shouldNotify('chat', 'browser_push')) {
                showBrowserPush('Siman · Yeni mesaj', preview, { tag: `chat-${orderId}` });
              }

              // 2) In-app toast banner — uygulama ÖN PLANDAYKEN.
              //    Kullanıcı zaten o thread'i açık okuyorsa toast gösterme.
              if (
                state.shouldNotify('chat', 'in_app') &&
                getActiveChatOrder() !== orderId
              ) {
                toast.info(preview, 'Yeni mesaj', {
                  onPress: () => { try { router.push(`/order/${orderId}` as any); } catch {} },
                });
              }
            }
          } catch { /* sessiz geç — bildirim hata vermesin akışı bozmasın */ }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'order_messages' },
        () => { load(); },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'order_messages' },
        () => { load(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load, profile?.id]);

  const totalUnread = items.reduce((s, it) => s + it.unread_for_me, 0);

  return { items, loading, totalUnread, refetch: load };
}
