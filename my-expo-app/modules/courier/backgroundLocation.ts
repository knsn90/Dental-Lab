// modules/courier/backgroundLocation.ts
// Kurye ARKA PLAN konum takibi (native — iOS/Android).
//   • Uygulama kapalı/arkadayken bile, kuryenin taşıdığı aktif teslimatlara
//     GPS ping'ler. Ön-plan takibi (useCourierTracking) web/PWA içindir; bu
//     modül yalnız native build'de anlam taşır (expo-task-manager + native izin).
//   • Task, React ağacının DIŞINDA çalışır → hook yok; supabase istemcisini
//     doğrudan kullanır, kurye kimliğini auth oturumundan çözer.
//
// ÖNEMLİ: TaskManager.defineTask, cold-relaunch'ta (iOS uygulamayı bir konum
// olayı için yeniden başlattığında) yeniden kayıt olabilmesi için uygulama
// açılışında import edilmelidir → app/_layout.tsx bu modülü native'de import eder.

import { Platform } from 'react-native';
import { fetchActiveDeliveryIds, postGpsPingMany } from './api';

export const COURIER_BG_LOCATION_TASK = 'courier-bg-location';

const isNative = Platform.OS !== 'web';

// Task tanımı — yalnız native. Web'de expo-task-manager yok, hiç dokunma.
if (isNative) {
  try {
    const TaskManager = require('expo-task-manager');
    // Aynı task iki kez tanımlanırsa expo uyarır; guard'la.
    if (!TaskManager.isTaskDefined?.(COURIER_BG_LOCATION_TASK)) {
      TaskManager.defineTask(
        COURIER_BG_LOCATION_TASK,
        async ({ data, error }: { data?: any; error?: any }) => {
          if (error) { console.warn('[bg-gps] task error', error?.message); return; }
          const locs: any[] = data?.locations ?? [];
          if (!locs.length) return;
          const last = locs[locs.length - 1];
          const { latitude, longitude, accuracy } = last.coords ?? {};
          if (typeof latitude !== 'number' || typeof longitude !== 'number') return;
          try {
            const { supabase } = require('../../core/api/supabase');
            const { data: u } = await supabase.auth.getUser();
            const courierId = u?.user?.id;
            if (!courierId) return;
            const ids = await fetchActiveDeliveryIds(courierId);
            if (!ids.length) {
              // Aktif iş kalmadıysa arka plan takibini kendiliğinden durdur.
              await stopBackgroundTracking();
              return;
            }
            await postGpsPingMany(ids, latitude, longitude, accuracy ?? undefined);
          } catch (e: any) { console.warn('[bg-gps] ping fail', e?.message); }
        },
      );
    }
  } catch (e: any) {
    console.warn('[bg-gps] defineTask skipped', e?.message);
  }
}

/** Arka plan konum güncellemelerini başlat (native + izin varsa). Idempotent. */
export async function startBackgroundTracking(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const Loc = require('expo-location');
    // Önce ön-plan, sonra arka-plan izni (iOS "Always" için ikisi de gerekir).
    const fg = await Loc.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;
    const bg = await Loc.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return false;

    const already = await Loc.hasStartedLocationUpdatesAsync(COURIER_BG_LOCATION_TASK);
    if (already) return true;

    await Loc.startLocationUpdatesAsync(COURIER_BG_LOCATION_TASK, {
      accuracy: Loc.Accuracy.High,
      timeInterval: 30_000,        // en sık 30 sn
      distanceInterval: 25,        // veya 25 m hareket
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true, // iOS: mavi konum çubuğu (şeffaflık)
      foregroundService: {         // Android: kalıcı bildirim (zorunlu)
        notificationTitle: 'Teslimat takibi açık',
        notificationBody: 'Konumunuz aktif teslimatlar için paylaşılıyor.',
        notificationColor: '#3B82F6',
      },
      activityType: Loc.ActivityType?.AutomotiveNavigation,
    });
    return true;
  } catch (e: any) {
    console.warn('[bg-gps] start fail', e?.message);
    return false;
  }
}

/** Arka plan konum güncellemelerini durdur. Idempotent. */
export async function stopBackgroundTracking(): Promise<void> {
  if (!isNative) return;
  try {
    const Loc = require('expo-location');
    const started = await Loc.hasStartedLocationUpdatesAsync(COURIER_BG_LOCATION_TASK);
    if (started) await Loc.stopLocationUpdatesAsync(COURIER_BG_LOCATION_TASK);
  } catch (e: any) {
    console.warn('[bg-gps] stop fail', e?.message);
  }
}
