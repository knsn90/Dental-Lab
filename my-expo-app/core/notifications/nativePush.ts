/**
 * nativePush.ts — Expo Notifications (iOS + Android) yönetimi.
 *
 *  Akış:
 *    1. setNotificationHandler  → foreground'da nasıl gösterilsin (alert + sound)
 *    2. requestPermissionsAsync → iOS'ta izin diyaloğu
 *    3. getExpoPushTokenAsync   → ExponentPushToken[…] alır
 *    4. push_tokens.upsert      → platform='ios'|'android', token
 *    5. addNotificationResponseReceivedListener → tıklayınca deep-link
 *
 *  Token tek seferlik elde edilir, kalıcı (cihaz başına unique).
 *  Edge function `send-expo-push` bu token'ı Expo Push API'ye gönderir.
 */
import { Platform } from 'react-native';
import { supabase } from '../api/supabase';

export type NativePushStatus =
  | 'unsupported'
  | 'web_platform'
  | 'simulator'
  | 'denied'
  | 'granted'
  | 'error';

export interface NativePushState {
  status:       NativePushStatus;
  token?:       string;
  errorMessage?: string;
}

let _initialized = false;
let _navigateHandler: ((url: string) => void) | null = null;

/**
 * Tek seferlik setup — foreground handler kurulur, click listener bağlanır.
 * App layout'ta login akışı içinde çağrılır.
 */
export function setupNativePush(onNavigate?: (url: string) => void): void {
  if (_initialized) return;
  if (Platform.OS === 'web') return;
  _navigateHandler = onNavigate ?? null;

  try {
    // Lazy-require — web bundle'a girmesin
    const Notifications = require('expo-notifications');

    // Foreground davranışı: alert + sound göster
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    // Notification tap → in-app navigate
    Notifications.addNotificationResponseReceivedListener((response: any) => {
      const data = response?.notification?.request?.content?.data ?? {};
      const url = data.url as string | undefined;
      if (url && _navigateHandler) {
        try { _navigateHandler(url); } catch { /* */ }
      }
    });

    // Android channel — bildirimi görünür yapmak için zorunlu
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'Siman',
        importance: 4, // HIGH
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#EA7A4C',
        sound: 'default',
      }).catch(() => null);
    }

    _initialized = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[nativePush] setup failed:', (e as any)?.message);
  }
}

/**
 * Permission iste, token al, push_tokens'a kaydet.
 * Idempotent — birden çok kez çağrılabilir.
 */
export async function registerForNativePush(userId: string): Promise<NativePushState> {
  if (Platform.OS === 'web') return { status: 'web_platform' };

  try {
    const Notifications = require('expo-notifications');
    const Device = require('expo-device');
    const Constants = require('expo-constants');

    if (!Device.isDevice) {
      return { status: 'simulator', errorMessage: 'Push bildirimleri gerçek cihazda çalışır' };
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let perm = existing;
    if (perm !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      perm = req.status;
    }

    if (perm !== 'granted') {
      return { status: 'denied' };
    }

    // Expo projectId — eas.json'dan veya app config'den
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      undefined;

    let tokenResp: any = null;
    try {
      tokenResp = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );
    } catch (err: any) {
      // iOS 26 beta + fresh APNs setup: bridge native exception fırlatabiliyor.
      // App crash etmesin diye yutuyoruz.
      console.warn('[nativePush] getExpoPushTokenAsync failed:', err?.message ?? err);
      return { status: 'error', errorMessage: err?.message ?? 'token alma başarısız' };
    }
    const token: string = tokenResp?.data;
    if (!token) {
      return { status: 'error', errorMessage: 'Expo push token boş döndü' };
    }

    const deviceId = (Device.osInternalBuildId ?? Device.modelId ?? Device.modelName) ?? null;

    await supabase.from('push_tokens').upsert({
      user_id:      userId,
      token,
      platform:     Platform.OS === 'ios' ? 'ios' : 'android',
      device_id:    deviceId,
      user_agent:   `${Device.brand ?? ''} ${Device.modelName ?? ''}`.trim() || null,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'user_id,token' });

    return { status: 'granted', token };
  } catch (e: any) {
    return { status: 'error', errorMessage: e?.message ?? String(e) };
  }
}

/** Token'ı DB'den sil (logout veya kullanıcı devre dışı bırakırsa) */
export async function unregisterNativePush(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = require('expo-notifications');
    const Constants = require('expo-constants');
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      undefined;
    const tokenResp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token: string = tokenResp.data;
    if (token) {
      await supabase.from('push_tokens').delete()
        .eq('user_id', userId)
        .eq('token', token);
    }
  } catch { /* */ }
}

/** Mevcut native push state'i sorgula (UI badge için) */
export async function getNativePushState(): Promise<NativePushState> {
  if (Platform.OS === 'web') return { status: 'web_platform' };
  try {
    const Notifications = require('expo-notifications');
    const Device = require('expo-device');
    if (!Device.isDevice) return { status: 'simulator' };
    const { status } = await Notifications.getPermissionsAsync();
    return { status: status === 'granted' ? 'granted' : 'denied' };
  } catch (e: any) {
    return { status: 'error', errorMessage: e?.message };
  }
}
