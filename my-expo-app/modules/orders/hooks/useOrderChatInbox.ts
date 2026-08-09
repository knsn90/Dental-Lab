import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { router, useSegments } from 'expo-router';
import { useAuthStore } from '../../../core/store/authStore';
import { subscribeShared } from '../../../core/api/sharedChannel';
import { toast } from '../../../core/ui/Toast';
import { getActiveChatOrder } from '../../../core/notifications/activeChat';
import { fetchOrderChatInbox, OrderChatInboxItem } from '../chatApi';

// Stale-while-revalidate cache — kullanıcı başına ayrı kayıt
const CACHE_PREFIX = 'order_chat_inbox_v1:';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat

/**
 * Bu hook 12 yerden mount ediliyor (beş panel layout'u + TopActionBar +
 * UnreadMessagesCard + MessagesPopup + MessagesInboxScreen + MessagesB5Mobile +
 * TechnicianMobileDashboard). Eskiden her instance kendi realtime kanalını,
 * kendi fetch'ini ve kendi bildirimini üretiyordu: tek mesaj eklemesi →
 * 12 RLS değerlendirmesi + 12 aynı sorgu + 12 toast.
 *
 * Aşağıdaki üç modül-seviyesi mekanizma bunu teke indirir:
 *   1) subscribeShared      → anahtar başına tek kanal
 *   2) coalescedLoad        → uçuştaki fetch paylaşılır, sonuç herkese yayılır
 *   3) shouldNotifyOnce     → bildirim mesaj id'sine göre bir kez
 */

// ─── 2) Tek fetch, çok abone ──────────────────────────────────────────────
type InboxSnapshot = { items: OrderChatInboxItem[]; loading: boolean };
let snapshot: InboxSnapshot = { items: [], loading: true };
let inFlight: Promise<void> | null = null;
const snapshotListeners = new Set<(s: InboxSnapshot) => void>();

function publish(next: InboxSnapshot) {
  snapshot = next;
  snapshotListeners.forEach((fn) => { try { fn(next); } catch { /* yut */ } });
}

async function coalescedLoad(userId: string, restrictTechnician: boolean): Promise<void> {
  // Aynı anda gelen çağrılar tek isteğe katlanır.
  if (inFlight) return inFlight;
  inFlight = (async () => {
    if (!readInboxCache(userId)) publish({ ...snapshot, loading: true });
    const { data, error } = await fetchOrderChatInbox(userId, { restrictTechnician });
    if (error) {
      console.warn('[chat-inbox] load error:', error.message);
      // Hata olursa cache'i koru, sıfırlama
      if (!readInboxCache(userId)) publish({ items: [], loading: false });
      else publish({ ...snapshot, loading: false });
    } else {
      const arr = data ?? [];
      writeInboxCache(userId, arr);
      publish({ items: arr, loading: false });
    }
  })().finally(() => { inFlight = null; });
  return inFlight;
}

// ─── 3) Bildirimi olay başına bir kez ────────────────────────────────────
const notifiedMessageIds = new Set<string>();
function shouldNotifyOnce(messageId: string | undefined | null): boolean {
  if (!messageId || notifiedMessageIds.has(messageId)) return false;
  notifiedMessageIds.add(messageId);
  if (notifiedMessageIds.size > 500) {
    // Sınırsız büyümesin — en eski yarıyı at (Set ekleme sırasını korur).
    const iter = notifiedMessageIds.values();
    for (let i = 0; i < 250; i++) {
      const v = iter.next();
      if (v.done) break;
      notifiedMessageIds.delete(v.value);
    }
  }
  return true;
}

/** Toast linki AKTİF panelde açılmalı; panel global olduğu için modül seviyesinde. */
let currentPanelBase = '/(lab)';

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
  // Toast linki AKTİF panelde açılmalı: /order/:id yolu (lab)(admin)(clinic)(doctor)
  // gruplarının HEPSİNDE var; öneksiz push belirsiz eşleşme yapıyor.
  const segments = useSegments() as string[];
  currentPanelBase = segments?.[0]?.startsWith('(') ? `/${segments[0]}` : '/(lab)';
  // Teknisyen mi? (lab user_type + technician/courier role) — yalnızca dahil olduğu
  // iş emirlerinin mesajlarını görür.
  const isTechnician =
    profile?.user_type === 'lab' &&
    ((profile as any)?.role === 'technician' || (profile as any)?.role === 'courier');

  // İlk render → cache varsa anında dolu
  const cached = profile?.id ? readInboxCache(profile.id) : null;
  const [state, setState] = useState<InboxSnapshot>(() =>
    snapshot.items.length ? snapshot : { items: cached ?? [], loading: !cached },
  );

  // Paylaşılan anlık görüntüye abone ol — her instance aynı veriyi görür.
  useEffect(() => {
    const onChange = (s: InboxSnapshot) => setState(s);
    snapshotListeners.add(onChange);
    return () => { snapshotListeners.delete(onChange); };
  }, []);

  const load = useCallback(async () => {
    if (!profile?.id) { publish({ items: [], loading: false }); return; }
    await coalescedLoad(profile.id, isTechnician);
  }, [profile?.id, isTechnician]);

  useEffect(() => {
    load();
    if (!profile?.id) return;

    // Realtime — yeni mesaj veya okundu işareti (read_at UPDATE) gelirse yenile.
    //
    // Kanal adı artık kullanıcı başına SABİT ve kanal paylaşılıyor. Eski kod adı
    // `..._${Date.now()}_${random}` yapıyordu; bu, aynı adla ikinci kez
    // `.on('postgres_changes', …)` çağrıldığında gelen
    //   "cannot add `postgres_changes` callbacks ... after `subscribe()`"
    // çökmesini önlemek içindi. subscribeShared o çökmeyi başka türlü çözüyor:
    // bağlamalar kanal kurulurken, subscribe()'dan önce, bir kez yapılıyor;
    // sonraki mount'lar yalnız bellek içi dinleyici ekliyor. Böylece hem çökme
    // olmuyor hem de 12 mount 12 abonelik üretmiyor.
    const unsubscribe = subscribeShared(
      `order_chat_inbox:${profile.id}`,
      [
        { event: 'INSERT', schema: 'public', table: 'order_messages' },
        { event: 'UPDATE', schema: 'public', table: 'order_messages' },
        { event: 'DELETE', schema: 'public', table: 'order_messages' },
      ],
      (payload: any) => {
        load();
        if (payload?.eventType !== 'INSERT') return;
        try {
          const newRow = payload?.new ?? {};
          // Karşı taraftan gelen mesajsa bildir (kendi gönderdiklerimi pas geç).
          if (!newRow.sender_id || newRow.sender_id === profile.id) return;
          // Dinleyici sayısı kadar değil, mesaj başına BİR kez bildir.
          if (!shouldNotifyOnce(newRow.id)) return;

          const orderId = newRow.work_order_id ?? newRow.id;
          const preview = newRow.content
            ? String(newRow.content).slice(0, 120)
            : 'Bir iş emrinde yeni mesaj geldi';

          // 1) Browser/OS push (sekme arka plandayken) — pref'e bağlı
          const { useNotificationPrefs, showBrowserPush } =
            require('../../../core/store/notificationPrefsStore');
          const prefs = useNotificationPrefs.getState();
          if (prefs.shouldNotify('chat', 'browser_push')) {
            showBrowserPush('Siman · Yeni mesaj', preview, { tag: `chat-${orderId}` });
          }

          // 2) In-app toast banner — uygulama ÖN PLANDAYKEN.
          //    Kullanıcı zaten o thread'i açık okuyorsa toast gösterme.
          if (prefs.shouldNotify('chat', 'in_app') && getActiveChatOrder() !== orderId) {
            toast.info(preview, 'Yeni mesaj', {
              onPress: () => { try { router.push(`${currentPanelBase}/order/${orderId}` as any); } catch {} },
            });
          }
        } catch { /* sessiz geç — bildirim hata vermesin akışı bozmasın */ }
      },
    );

    return unsubscribe;
  }, [load, profile?.id]);

  const totalUnread = state.items.reduce((s, it) => s + it.unread_for_me, 0);

  return { items: state.items, loading: state.loading, totalUnread, refetch: load };
}
