/**
 * notificationPrefsStore — Bildirim tercihlerinin tek kaynaklı yönetimi.
 *
 * • Hydrate: app açılışında profile'tan çekilir (loadFromProfile)
 * • Update : kullanıcı toggle'a basınca local update + DB'ye persist
 * • Reader : modüller `shouldNotify(category, channel)` ile karar verir
 *
 * Şema:
 *   {
 *     master_enabled: boolean,             // tek tıkla hepsi kapanır
 *     channels: { in_app, browser_push, email },
 *     categories: {
 *       new_order, order_status, chat, approval, payment, stock, delivery, paper_order
 *     }
 *   }
 */
import { create } from 'zustand';
import { Platform } from 'react-native';
import { supabase } from '../api/supabase';

export type NotificationCategory =
  | 'new_order'    | 'order_status'    | 'chat'      | 'approval'
  | 'payment'      | 'stock'           | 'delivery'  | 'paper_order'
  | 'material_request' | 'order_watch' | 'stage_critical' | 'stock_count'
  | 'implant_parts' | 'scan_annotation';

export type NotificationChannel = 'in_app' | 'browser_push' | 'email' | 'whatsapp';

export interface CategoryToggles {
  in_app:       boolean;
  browser_push: boolean;
  email:        boolean;
  whatsapp:     boolean;
}

export interface NotificationPrefs {
  master_enabled: boolean;
  channels:   CategoryToggles;
  categories: Record<NotificationCategory, CategoryToggles>;
}

const DEFAULT_PREFS: NotificationPrefs = {
  master_enabled: true,
  channels:   { in_app: true,  browser_push: false, email: true,  whatsapp: false },
  // Email default — "önemliler" açık (new_order/approval/payment/delivery),
  // chat & order_status & stock & paper_order email'i kapalı (spam olmasın).
  categories: {
    new_order:    { in_app: true,  browser_push: true,  email: true,  whatsapp: false },
    order_status: { in_app: true,  browser_push: false, email: false, whatsapp: false },
    chat:         { in_app: true,  browser_push: true,  email: false, whatsapp: false },
    approval:     { in_app: true,  browser_push: true,  email: true,  whatsapp: false },
    payment:      { in_app: true,  browser_push: false, email: true,  whatsapp: false },
    stock:        { in_app: true,  browser_push: false, email: false, whatsapp: false },
    delivery:     { in_app: true,  browser_push: false, email: true,  whatsapp: false },
    paper_order:  { in_app: true,  browser_push: true,  email: false, whatsapp: false },
    material_request: { in_app: true, browser_push: true,  email: false, whatsapp: false },
    // İmplant parçaları (scan body, dijital analog …) — klinik aksiyon alacak:
    // talep maili gider, diğer adımlar yalnız uygulama içi.
    implant_parts: { in_app: true, browser_push: true, email: true, whatsapp: false },
    // Tarama üzerine 3D kalem notu — karşı taraf için aksiyon işareti, ama
    // yazışma temposunda geliyor: uygulama içi + push, mail YOK (gürültü).
    scan_annotation: { in_app: true, browser_push: true, email: false, whatsapp: false },
    // Günlük geciken + beklemedeki iş digest'i (yalnız admin/lab-manager alır) — önemli: in-app + push + email açık, whatsapp opt-in.
    order_watch:  { in_app: true,  browser_push: true,  email: true,  whatsapp: false },
    // Kritik aşama tamamlandı (hekim/klinik/müdür/admin) — önemli kilometre taşı: in-app + push + email açık.
    stage_critical: { in_app: true, browser_push: true, email: true, whatsapp: false },
    // Fiziksel sayım hatırlatması (yalnız admin/lab-manager) — aksiyon gerektirir,
    // ayda birkaç kez çıkar: in-app + push + email açık, whatsapp kapalı.
    stock_count:  { in_app: true,  browser_push: true,  email: true,  whatsapp: false },
  },
};

const LS_KEY = 'notif_prefs_v1';

function readCache(): NotificationPrefs | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) as NotificationPrefs : null;
  } catch { return null; }
}

function writeCache(p: NotificationPrefs) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try { window.localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* */ }
}

interface State {
  prefs: NotificationPrefs;
  loaded: boolean;
  /** profiles.notification_prefs'i çek */
  loadFromProfile: (userId: string | null | undefined) => Promise<void>;
  /** Master switch */
  setMaster: (on: boolean) => Promise<void>;
  /** Genel kanal toggle (tüm kategorilerde varsayılan) */
  setChannel: (ch: NotificationChannel, on: boolean) => Promise<void>;
  /** Kategori × kanal toggle */
  setCategoryChannel: (cat: NotificationCategory, ch: NotificationChannel, on: boolean) => Promise<void>;
  /**
   * Toplu kategori × kanal toggle ("Tümünü Aç/Kapat").
   * Tek persist yapar — tek tek çağırmak N ayrı profiles UPDATE'i üretiyordu.
   */
  setCategoriesBulk: (cats: NotificationCategory[], chs: NotificationChannel[], on: boolean) => Promise<void>;
  /** Modüllerin kullanacağı karar fonksiyonu */
  shouldNotify: (cat: NotificationCategory, ch: NotificationChannel) => boolean;
}

async function persist(userId: string | null, prefs: NotificationPrefs) {
  writeCache(prefs);
  if (!userId) return;
  await supabase.from('profiles')
    .update({ notification_prefs: prefs })
    .eq('id', userId);
}

let _currentUserId: string | null = null;

export const useNotificationPrefs = create<State>((set, get) => ({
  prefs: readCache() ?? DEFAULT_PREFS,
  loaded: !!readCache(),

  loadFromProfile: async (userId) => {
    _currentUserId = userId ?? null;
    if (!userId) { set({ prefs: DEFAULT_PREFS, loaded: true }); return; }
    const { data, error } = await supabase
      .from('profiles')
      .select('notification_prefs')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) {
      set({ prefs: readCache() ?? DEFAULT_PREFS, loaded: true });
      return;
    }
    const prefs = ((data as any).notification_prefs as NotificationPrefs | null) ?? DEFAULT_PREFS;
    // Eksik kategori varsa default'tan tamamla (forward-compat)
    const merged: NotificationPrefs = {
      master_enabled: prefs.master_enabled ?? true,
      channels:   { ...DEFAULT_PREFS.channels, ...(prefs.channels ?? {}) },
      categories: { ...DEFAULT_PREFS.categories, ...(prefs.categories ?? {}) },
    };
    writeCache(merged);
    set({ prefs: merged, loaded: true });
  },

  setMaster: async (on) => {
    const next = { ...get().prefs, master_enabled: on };
    set({ prefs: next });
    await persist(_currentUserId, next);
  },

  setChannel: async (ch, on) => {
    const cur = get().prefs;
    const next: NotificationPrefs = {
      ...cur,
      channels: { ...cur.channels, [ch]: on },
    };
    set({ prefs: next });
    await persist(_currentUserId, next);
  },

  setCategoryChannel: async (cat, ch, on) => {
    const cur = get().prefs;
    const catState = cur.categories[cat] ?? DEFAULT_PREFS.categories[cat];
    const next: NotificationPrefs = {
      ...cur,
      categories: {
        ...cur.categories,
        [cat]: { ...catState, [ch]: on },
      },
    };
    set({ prefs: next });
    await persist(_currentUserId, next);
  },

  setCategoriesBulk: async (cats, chs, on) => {
    const cur = get().prefs;
    const categories = { ...cur.categories };
    for (const cat of cats) {
      const catState = categories[cat] ?? DEFAULT_PREFS.categories[cat];
      const nextCat = { ...catState };
      for (const ch of chs) nextCat[ch] = on;
      categories[cat] = nextCat;
    }
    const next: NotificationPrefs = { ...cur, categories };
    set({ prefs: next });
    await persist(_currentUserId, next);
  },

  shouldNotify: (cat, ch) => {
    const p = get().prefs;
    if (!p.master_enabled) return false;
    if (p.channels?.[ch] === false) return false;     // global kanal kapalı
    const catState = p.categories?.[cat];
    if (!catState) return false;
    return catState[ch] === true;
  },
}));

/**
 * Tarayıcı push permission iste — kullanıcı izin verirse browser_push otomatik açılır.
 *
 * Eğer userId verilirse Service Worker push subscription'ını oluşturur ve
 * push_tokens tablosuna kaydeder (closed-tab push için gerekli). Aksi takdirde
 * sadece window.Notification API hazır olur (sekme açıkken çalışır).
 */
export async function requestBrowserPushPermission(userId?: string | null): Promise<NotificationPermission | 'unsupported'> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  // SW + VAPID destekliyse subscription'a kadar git
  if (userId) {
    try {
      const { subscribeWebPush } = require('../notifications/webPush');
      const state = await subscribeWebPush(userId);
      if (state.status === 'subscribed') return 'granted';
      if (state.status === 'denied')     return 'denied';
      // unsupported / no_vapid_key — fallback olarak basic permission flow
    } catch { /* fallback */ }
  }

  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied')  return 'denied';
  return await Notification.requestPermission();
}

/** İçeride tarayıcı push notification göster (permission kontrolü içeride) */
export function showBrowserPush(
  title: string,
  body: string,
  opts?: { icon?: string; tag?: string; data?: any; onClick?: () => void },
) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body, icon: opts?.icon, tag: opts?.tag, data: opts?.data,
    });
    if (opts?.onClick) n.onclick = (e) => {
      e.preventDefault();
      window.focus();
      opts.onClick!();
      n.close();
    };
  } catch { /* SecurityError vb. — sessiz geç */ }
}
