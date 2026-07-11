// modules/courier/useGpsTracker.ts
// Aktif teslimat varsa konumu 30sn'de bir gps_pings tablosuna yazar.
// Web: navigator.geolocation, Native: expo-location (lazy require).

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { postGpsPing } from './api';

const INTERVAL_MS = 30_000;

export function useGpsTracker(deliveryId: string | null, active: boolean) {
  const lastTickRef = useRef(0);
  const watchIdRef  = useRef<any>(null);

  useEffect(() => {
    if (!active || !deliveryId) return;

    const tick = (lat: number, lng: number, acc?: number) => {
      const now = Date.now();
      if (now - lastTickRef.current < INTERVAL_MS) return;
      lastTickRef.current = now;
      postGpsPing(deliveryId, lat, lng, acc);
    };

    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return;
      const id = navigator.geolocation.watchPosition(
        (pos) => tick(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        (err) => console.warn('[gps] web error', err.message),
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
      );
      watchIdRef.current = id;
      return () => navigator.geolocation.clearWatch(id);
    }

    // Native — expo-location
    let cancelled = false;
    (async () => {
      try {
        const Loc = require('expo-location');
        const { status } = await Loc.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const sub = await Loc.watchPositionAsync(
          { accuracy: Loc.Accuracy.High, timeInterval: 15_000, distanceInterval: 20 },
          (pos: any) => tick(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        );
        if (cancelled) sub.remove(); else watchIdRef.current = sub;
      } catch (e: any) { console.warn('[gps] native error', e?.message); }
    })();
    return () => {
      cancelled = true;
      if (watchIdRef.current?.remove) watchIdRef.current.remove();
    };
  }, [active, deliveryId]);
}
