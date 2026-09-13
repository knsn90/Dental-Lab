// modules/courier/useCourierTracking.ts
// Panel-seviyesi kurye konum takibi (ÖN PLAN).
//   • Kurye panelinde herhangi bir ekrandayken çalışır (detay ekranı ŞART DEĞİL).
//   • Taşıdığı/yolda EN AZ 1 teslimat varken cihaz konumunu izler.
//   • Tek konumu, kuryenin TÜM aktif teslimatlarına ping'ler (toplu rota).
//   • Web: navigator.geolocation (PWA ön-plan — kurye app'i açık tutar).
//   • Native: expo-location ARKA PLAN (backgroundLocation.ts) — uygulama
//     kapalı/arkada olsa bile aktif iş varken takip sürer. Native build gerekir.

import { useEffect, useRef, useState } from 'react';
import { Platform, AppState } from 'react-native';
import { fetchActiveDeliveryIds, postGpsPingMany } from './api';
import { useCourierTrackingStore } from '../../core/store/courierTrackingStore';

const PING_MS   = 30_000;   // en sık 30 sn'de bir yaz
const REFRESH_MS = 60_000;  // aktif iş listesini 60 sn'de bir tazele

export function useCourierTracking(courierId: string | null | undefined) {
  const idsRef      = useRef<string[]>([]);
  const lastPingRef = useRef(0);
  const [hasActive, setHasActive] = useState(false);

  // ── 1. Aktif teslimat ID'lerini periyodik + öne-gelince tazele ──
  useEffect(() => {
    if (!courierId) {
      idsRef.current = []; setHasActive(false);
      useCourierTrackingStore.getState().setActive(false);
      return;
    }
    let alive = true;
    const refresh = async () => {
      const ids = await fetchActiveDeliveryIds(courierId);
      if (!alive) return;
      idsRef.current = ids;
      setHasActive(ids.length > 0);
      useCourierTrackingStore.getState().setActive(ids.length > 0);
    };
    refresh();
    const iv = setInterval(refresh, REFRESH_MS);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') refresh(); });
    // PWA: sekme yeniden görünür olunca tazele
    let visHandler: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      visHandler = () => { if (document.visibilityState === 'visible') refresh(); };
      document.addEventListener('visibilitychange', visHandler);
    }
    return () => {
      alive = false;
      clearInterval(iv);
      sub.remove();
      if (visHandler && typeof document !== 'undefined') document.removeEventListener('visibilitychange', visHandler);
    };
  }, [courierId]);

  // ── 2. Aktif iş varken konumu izle (ön plan) ──
  useEffect(() => {
    if (!hasActive) return;

    const ping = (lat: number, lng: number, acc?: number) => {
      const now = Date.now();
      if (now - lastPingRef.current < PING_MS) return;
      lastPingRef.current = now;
      const ids = idsRef.current;
      if (ids.length) {
        postGpsPingMany(ids, lat, lng, acc);
        useCourierTrackingStore.getState().markPing();
      }
    };

    // Web / PWA — navigator.geolocation (ön plan)
    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return;
      const id = navigator.geolocation.watchPosition(
        pos => ping(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        err => console.warn('[gps] web error', err?.message),
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
      );
      return () => navigator.geolocation.clearWatch(id);
    }

    // Native (iOS/Android) — expo-location ARKA PLAN (uygulama kapalı/arkada olsa
    // bile devam eder). startLocationUpdatesAsync hem ön-planda hem arka planda
    // güncelleme verir; ping'i task'in kendisi atar (bkz. backgroundLocation.ts).
    let cancelled = false;
    (async () => {
      try {
        const { startBackgroundTracking } = require('./backgroundLocation');
        await startBackgroundTracking();
      } catch (e: any) { console.warn('[gps] native bg start error', e?.message); }
    })();
    return () => {
      cancelled = true;
      try {
        const { stopBackgroundTracking } = require('./backgroundLocation');
        stopBackgroundTracking();
      } catch {}
    };
  }, [hasActive]);

  return { tracking: hasActive };
}
