// modules/delivery/hooks/useCourierDelivery.ts
// Kurye için aktif teslimat + GPS gönderme

import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { sendGpsPing, updateDeliveryStatus, type Delivery, type DeliveryStatus } from '../api';

const GPS_INTERVAL_MS = 60_000; // 60 saniyede bir ping

async function getCurrentPosition(): Promise<{ lat: number; lng: number; accuracy?: number; speed?: number } | null> {
  // Web / Expo web → tarayıcı Geolocation API
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed:    pos.coords.speed ?? undefined,
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10_000 },
      );
    });
  }

  // Native → expo-location (dinamik import ile)
  try {
    const Location = await import('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      lat:      loc.coords.latitude,
      lng:      loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? undefined,
      speed:    loc.coords.speed != null ? loc.coords.speed * 3.6 : undefined, // m/s → km/h
    };
  } catch {
    return null;
  }
}

export function useCourierDelivery(courierId: string | null) {
  const [delivery,   setDelivery]   = useState<Delivery | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [tracking,   setTracking]   = useState(false);
  const [lastPingAt, setLastPingAt] = useState<Date | null>(null);
  const [pingError,  setPingError]  = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Teslimat yükle ──────────────────────────────────────────────────────────

  const loadDelivery = useCallback(async () => {
    if (!courierId) return;
    setLoading(true);

    // Kurye'nin aktif teslimatını bul
    const { data, error } = await supabase
      .from('deliveries')
      .select(`
        id, work_order_id, courier_id, status,
        assigned_at, picked_up_at, delivered_at,
        work_order:work_order_id (
          order_number, work_type, delivery_date, tooth_numbers,
          doctor:doctor_id ( full_name, clinic_name )
        )
      `)
      .in('status', ['atandi', 'teslim_alindi', 'yolda'])
      .eq('courier_id', courierId)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) setDelivery(data as unknown as Delivery);
    else setDelivery(null);
    setLoading(false);
  }, [courierId]);

  useEffect(() => { loadDelivery(); }, [loadDelivery]);

  // Realtime: teslimat güncellenince yenile
  useEffect(() => {
    if (!courierId) return;
    const ch = supabase
      .channel(`courier_delivery_${courierId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'deliveries' }, () => loadDelivery())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [courierId, loadDelivery]);

  // ── GPS ping döngüsü ────────────────────────────────────────────────────────

  const ping = useCallback(async () => {
    if (!delivery) return;
    const pos = await getCurrentPosition();
    if (!pos) { setPingError('Konum alınamadı'); return; }

    const { error } = await sendGpsPing(
      delivery.id, pos.lat, pos.lng, pos.accuracy, pos.speed,
    );
    if (error) { setPingError(error.message); return; }

    setPingError(null);
    setLastPingAt(new Date());
  }, [delivery]);

  const startTracking = useCallback(async () => {
    if (!delivery || tracking) return;
    setTracking(true);
    await ping(); // İlk ping hemen
    intervalRef.current = setInterval(ping, GPS_INTERVAL_MS);
  }, [delivery, tracking, ping]);

  const stopTracking = useCallback(() => {
    setTracking(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Teslimat tamamlanınca otomatik durdur
  useEffect(() => {
    if (delivery?.status === 'teslim_edildi') stopTracking();
  }, [delivery?.status, stopTracking]);

  useEffect(() => () => stopTracking(), [stopTracking]);

  // ── Durum Güncelleme ────────────────────────────────────────────────────────

  const updateStatus = useCallback(async (
    status: DeliveryStatus,
    extra?: { recipient_name?: string; recipient_note?: string },
  ) => {
    if (!delivery) return { error: new Error('Teslimat bulunamadı') };
    if (status === 'yolda' && !tracking) await startTracking();
    if (status === 'teslim_edildi') stopTracking();

    const { error } = await updateDeliveryStatus(delivery.id, status, extra);
    if (!error) await loadDelivery();
    return { error };
  }, [delivery, tracking, startTracking, stopTracking, loadDelivery]);

  return {
    delivery, loading, tracking, lastPingAt, pingError,
    startTracking, stopTracking, updateStatus,
    refresh: loadDelivery,
  };
}
