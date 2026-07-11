/**
 * webPush.ts — Web Push (Service Worker) abonelik yönetimi.
 *
 *  Akış:
 *    1. SW kayıtlı mı kontrol et (zaten /sw.js global olarak register ediliyor)
 *    2. Notification.requestPermission()
 *    3. pushManager.subscribe({applicationServerKey: VAPID_PUBLIC})
 *    4. Subscription → push_tokens tablosuna kaydet (platform='web')
 *    5. Edge function `send-web-push` bu endpoint'e VAPID-imzalı POST yapacak
 *
 *  Browser desteği:
 *    - Chrome / Edge / Firefox: tam destek (closed-tab push çalışır)
 *    - Safari: 16.4+ (iOS 16.4+ PWA'da)
 *    - PWA install gerekmez ama Safari iOS'ta install zorunlu
 */
import { Platform } from 'react-native';
import { supabase } from '../api/supabase';

// VAPID public key — env'den alınır.
// Generate: `npx web-push generate-vapid-keys`
const VAPID_PUBLIC_KEY = (process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim();

export type WebPushStatus =
  | 'unsupported'
  | 'denied'
  | 'no_vapid_key'
  | 'permission_required'
  | 'subscribed'
  | 'error';

export interface WebPushState {
  status:       WebPushStatus;
  permission?:  NotificationPermission;
  endpoint?:    string;
  errorMessage?: string;
}

/** Tarayıcı destekliyor mu? */
export function isWebPushSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Mevcut subscription'ı al (varsa) */
export async function getCurrentWebPushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Mevcut state'i sorgula — UI badge için */
export async function getWebPushState(): Promise<WebPushState> {
  if (!isWebPushSupported()) return { status: 'unsupported' };
  if (!VAPID_PUBLIC_KEY)      return { status: 'no_vapid_key', permission: Notification.permission };

  const perm = Notification.permission;
  if (perm === 'denied')       return { status: 'denied', permission: perm };

  const sub = await getCurrentWebPushSubscription();
  if (sub) return { status: 'subscribed', permission: 'granted', endpoint: sub.endpoint };

  return { status: 'permission_required', permission: perm };
}

/**
 * Tam aboneliğe geç:
 *   - Permission iste
 *   - PushManager.subscribe
 *   - push_tokens'a kaydet
 *
 * Throw atmaz, WebPushState döner.
 */
export async function subscribeWebPush(userId: string): Promise<WebPushState> {
  if (!isWebPushSupported())  return { status: 'unsupported' };
  if (!VAPID_PUBLIC_KEY) {
    return {
      status: 'no_vapid_key',
      errorMessage: 'EXPO_PUBLIC_VAPID_PUBLIC_KEY .env\'de tanımlı değil.',
    };
  }

  try {
    // 1. Permission
    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }
    if (perm !== 'granted') {
      return { status: perm === 'denied' ? 'denied' : 'permission_required', permission: perm };
    }

    // 2. SW ready
    const reg = await navigator.serviceWorker.ready;

    // 3. Already subscribed?
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    // 4. Persist to push_tokens
    const subJson = sub.toJSON();
    const endpoint = sub.endpoint;
    const token = JSON.stringify({
      endpoint,
      keys: subJson.keys ?? {},
    });
    const deviceId = await getOrCreateDeviceId();

    await supabase.from('push_tokens').upsert({
      user_id:    userId,
      token,
      platform:   'web',
      device_id:  deviceId,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'user_id,token' });

    return { status: 'subscribed', permission: 'granted', endpoint };
  } catch (e: any) {
    return { status: 'error', errorMessage: e?.message ?? String(e) };
  }
}

/** Aboneliği iptal et + DB'den sil */
export async function unsubscribeWebPush(): Promise<boolean> {
  if (!isWebPushSupported()) return false;
  try {
    const sub = await getCurrentWebPushSubscription();
    if (!sub) return true;
    const subJson = sub.toJSON();
    const token = JSON.stringify({ endpoint: sub.endpoint, keys: subJson.keys ?? {} });

    await sub.unsubscribe();
    await supabase.from('push_tokens').delete().eq('token', token);
    return true;
  } catch {
    return false;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

const DEVICE_ID_KEY = 'lf_device_id';
async function getOrCreateDeviceId(): Promise<string> {
  if (typeof window === 'undefined') return 'unknown';
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

// ── SW message listener — tıklama deeplink + sub-change ────────────
let _listenerInstalled = false;
export function installServiceWorkerMessageListener(onNavigate: (url: string) => void, userId: string | null) {
  if (_listenerInstalled || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  _listenerInstalled = true;

  navigator.serviceWorker.addEventListener('message', async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'NOTIFICATION_CLICK' && msg.url) {
      onNavigate(msg.url);
    }
    if (msg.type === 'PUSH_SUBSCRIPTION_CHANGED' && userId) {
      // Tarayıcı subscription'ı yeniledi — re-subscribe edip DB'yi güncelle
      await subscribeWebPush(userId);
    }
  });
}
