/**
 * notificationsStore — In-app bildirim feed yönetimi.
 *
 *  - Realtime: Supabase subscription ile yeni bildirim push edilir
 *  - Cache:    son N bildirim local state'te tutulur
 *  - Actions:  markRead, markAllRead, dismiss
 *
 *  Kullanım:
 *    const { items, unreadCount } = useNotifications();
 *    const refresh = useNotificationsActions().refresh;
 *
 *  İlk yükleme `notification-bootstrap.ts` içinde otomatik tetiklenir
 *  (app açılışında authStore profile'ı yükledikten sonra).
 */
import { create } from 'zustand';
import { supabase } from '../api/supabase';
import type { NotificationCategory } from './notificationPrefsStore';
import { useNotificationPrefs, showBrowserPush } from './notificationPrefsStore';

export interface NotificationRow {
  id: string;
  user_id: string;
  lab_id: string | null;
  category: NotificationCategory;
  title: string;
  body: string | null;
  resource_type: string | null;
  resource_id: string | null;
  action_url: string | null;
  payload: Record<string, any>;
  read_at: string | null;
  delivered: Record<string, any>;
  created_at: string;
}

interface State {
  items: NotificationRow[];
  loaded: boolean;
  loading: boolean;
  unreadCount: number;
  /** Initial fetch + setup realtime subscription */
  init: (userId: string | null | undefined) => Promise<void>;
  /** Manual refresh (örn. pull-to-refresh) */
  refresh: () => Promise<void>;
  /** Single mark as read */
  markRead: (id: string) => Promise<void>;
  /** Bulk mark all as read */
  markAllRead: () => Promise<void>;
  /** Sil (kullanıcı arşivlerse) */
  dismiss: (id: string) => Promise<void>;
  /** Cleanup — logout vs. */
  reset: () => void;
}

let _channel: ReturnType<typeof supabase.channel> | null = null;
let _currentUserId: string | null = null;
const MAX_KEEP = 100;

export const useNotificationsStore = create<State>((set, get) => ({
  items: [],
  loaded: false,
  loading: false,
  unreadCount: 0,

  init: async (userId) => {
    if (!userId) {
      get().reset();
      return;
    }
    if (_currentUserId === userId && _channel) return; // already subscribed
    _currentUserId = userId;

    set({ loading: true });
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_KEEP);

    if (error) {
      // Tablo henüz yoksa sessiz geç (migration uygulanmamış olabilir)
      // eslint-disable-next-line no-console
      console.warn('[notifications] load failed:', error.message);
      set({ loading: false, loaded: true });
      return;
    }

    const items = (data ?? []) as NotificationRow[];
    set({
      items,
      unreadCount: items.filter(n => !n.read_at).length,
      loaded: true,
      loading: false,
    });

    // ─── Realtime subscription ──────────────────────────────────────
    if (_channel) {
      try { supabase.removeChannel(_channel); } catch { /* */ }
      _channel = null;
    }
    _channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (msg) => {
          const row = msg.new as NotificationRow;
          set(s => ({
            items: [row, ...s.items].slice(0, MAX_KEEP),
            unreadCount: s.unreadCount + (row.read_at ? 0 : 1),
          }));

          // Browser push tetikleyici (pref kontrolü içeride)
          try {
            const allowPush = useNotificationPrefs.getState().shouldNotify(row.category, 'browser_push');
            if (allowPush) {
              showBrowserPush(row.title, row.body ?? '', {
                tag: `notif-${row.id}`,
                data: { id: row.id, url: row.action_url },
                onClick: () => {
                  if (row.action_url && typeof window !== 'undefined') {
                    window.location.assign(row.action_url);
                  }
                },
              });
            }
          } catch { /* sessiz */ }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (msg) => {
          const row = msg.new as NotificationRow;
          set(s => {
            const items = s.items.map(it => it.id === row.id ? row : it);
            return {
              items,
              unreadCount: items.filter(it => !it.read_at).length,
            };
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (msg) => {
          const id = (msg.old as any).id as string;
          set(s => {
            const items = s.items.filter(it => it.id !== id);
            return {
              items,
              unreadCount: items.filter(it => !it.read_at).length,
            };
          });
        },
      )
      .subscribe();
  },

  refresh: async () => {
    if (!_currentUserId) return;
    set({ loading: true });
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', _currentUserId)
      .order('created_at', { ascending: false })
      .limit(MAX_KEEP);
    const items = (data ?? []) as NotificationRow[];
    set({
      items,
      unreadCount: items.filter(n => !n.read_at).length,
      loading: false,
    });
  },

  markRead: async (id) => {
    // Optimistic update
    set(s => {
      const items = s.items.map(it => it.id === id && !it.read_at
        ? { ...it, read_at: new Date().toISOString() }
        : it);
      return { items, unreadCount: items.filter(it => !it.read_at).length };
    });
    await supabase.rpc('mark_notifications_read', { p_ids: [id] });
  },

  markAllRead: async () => {
    const now = new Date().toISOString();
    set(s => ({
      items: s.items.map(it => it.read_at ? it : { ...it, read_at: now }),
      unreadCount: 0,
    }));
    await supabase.rpc('mark_all_notifications_read');
  },

  dismiss: async (id) => {
    set(s => {
      const items = s.items.filter(it => it.id !== id);
      return { items, unreadCount: items.filter(it => !it.read_at).length };
    });
    await supabase.from('notifications').delete().eq('id', id);
  },

  reset: () => {
    if (_channel) {
      try { supabase.removeChannel(_channel); } catch { /* */ }
      _channel = null;
    }
    _currentUserId = null;
    set({ items: [], unreadCount: 0, loaded: false, loading: false });
  },
}));

// ── Convenience selectors ────────────────────────────────────────────
export const useNotifications = () => {
  const items = useNotificationsStore(s => s.items);
  const unreadCount = useNotificationsStore(s => s.unreadCount);
  const loaded = useNotificationsStore(s => s.loaded);
  const loading = useNotificationsStore(s => s.loading);
  return { items, unreadCount, loaded, loading };
};

export const useNotificationsActions = () => {
  const init = useNotificationsStore(s => s.init);
  const refresh = useNotificationsStore(s => s.refresh);
  const markRead = useNotificationsStore(s => s.markRead);
  const markAllRead = useNotificationsStore(s => s.markAllRead);
  const dismiss = useNotificationsStore(s => s.dismiss);
  const reset = useNotificationsStore(s => s.reset);
  return { init, refresh, markRead, markAllRead, dismiss, reset };
};
