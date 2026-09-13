// modules/courier/CourierTrackingMapGoogle.tsx
// Tam ekran kurye takip haritası — GERÇEK Google Maps (Maps JavaScript SDK).
// Sipariş detayındaki Static Maps ile AYNI anahtarı (get_active_provider('maps'))
// ve AYNI gri "Positron benzeri" MONO stilini kullanır. Rota Google Directions'tan;
// adres çözümü Google Geocoding (başarısızsa geocodeTR fallback).
//
// Web-only: Google Maps JS SDK yalnız tarayıcıda çalışır. Native tarafta
// CourierTrackingMap Leaflet WebView'a düşer. Anahtar yoksa da Leaflet fallback.

import React, { useEffect, useRef, useState } from 'react';
import { View, Platform, Pressable } from 'react-native';
import { useWindowDimensions } from 'react-native';
import { COURIER_ICON_URI } from './courierIcon';
import { MONO_LIGHT, MONO_DARK } from './monoMapStyle';
import { Plus, Minus, Locate } from '../../core/ui/icons';
import { supabase } from '../../core/api/supabase';
import { geocodeTR } from './geocoder';
import { useThemeModeStore } from '../../core/store/themeModeStore';
import { useAccentTones } from '../../core/ui/HeroGlow';

interface Coord { lat: number; lng: number; }
interface Ping extends Coord { recorded_at: string; accuracy_m?: number | null; }

interface Props {
  deliveryId?:   string | null;
  origin?:       Coord | null;
  destination?:  Coord | null;
  destinationLabel?: string;
  height?:       number | string;
  accent?:       string;
  style?:        any;
  externalPosition?: Coord | null;
  originLabel?: string;
  onRouteInfo?: (info: { durationSec: number | null; distanceM: number | null; live: boolean } | null) => void;
  /** Altta haritanın üzerine binen yüzen panelin ölçülmüş yüksekliği (px). */
  bottomInset?: number;
  /** get_active_provider('maps') → credentials.api_key. Zorunlu. */
  apiKey: string;
}

// ─── Google Maps JS SDK yükleyici (idempotent) ────────────────────────────────
let gmapsLoading: Promise<any> | null = null;
export function loadGoogleMaps(key: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('not web'));
  const w = window as any;
  if (w.google?.maps) return Promise.resolve(w.google);
  if (gmapsLoading) return gmapsLoading;
  gmapsLoading = new Promise((resolve, reject) => {
    // Auth hatası (anahtar Maps JS için etkin değil/kısıtlı) — sessiz kalmasın.
    w.gm_authFailure = () => { console.warn('[gmaps] auth failure — Maps JavaScript API anahtar için etkin mi?'); };
    const cb = '__gmapsReady_' + Math.random().toString(36).slice(2);
    w[cb] = () => { resolve(w.google); try { delete w[cb]; } catch { /* */ } };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=tr&region=TR&loading=async&callback=${cb}`;
    s.async = true; s.defer = true;
    s.onerror = () => reject(new Error('gmaps load failed'));
    document.head.appendChild(s);
  });
  return gmapsLoading;
}

// ─── Gri MONO stil — TEK KAYNAK: ./monoMapStyle (native harita da aynısını kullanır)


// ─── Yardımcılar ──────────────────────────────────────────────────────────────
function haversineM(a: Coord, b: Coord): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Numaralı kırmızı damla pin → data URI (Google Marker icon).
function numberedPinUri(n: number | string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 32 42">` +
    `<path d="M16 0C7.16 0 0 7.16 0 16c0 11.2 16 26 16 26s16-14.8 16-26C32 7.16 24.84 0 16 0z" fill="#D9483B"/>` +
    `<text x="16" y="15" text-anchor="middle" dominant-baseline="central" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="15" font-weight="800" fill="#fff">${n}</text>` +
    `</svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

interface RouteResult { coords: Coord[]; durationSec: number | null; distanceM: number | null; }

// Google Directions — rota geometrisi + süre/mesafe (trafik dahil sürüş).
function googleRoute(g: any, from: Coord, to: Coord, via?: Coord | null): Promise<RouteResult | null> {
  return new Promise((resolve) => {
    try {
      new g.maps.DirectionsService().route(
        {
          origin: from,
          destination: to,
          waypoints: via ? [{ location: via, stopover: false }] : [],
          travelMode: g.maps.TravelMode.DRIVING,
          region: 'TR',
        },
        (res: any, status: string) => {
          if (status === 'OK' && res?.routes?.[0]) {
            const r0 = res.routes[0];
            const coords: Coord[] = (r0.overview_path ?? []).map((p: any) => ({ lat: p.lat(), lng: p.lng() }));
            let dur = 0, dist = 0;
            (r0.legs ?? []).forEach((l: any) => { dur += l.duration?.value ?? 0; dist += l.distance?.value ?? 0; });
            resolve({ coords, durationSec: dur || null, distanceM: dist || null });
          } else { resolve(null); }
        },
      );
    } catch { resolve(null); }
  });
}

// Google Geocoding — TR bağlamı ekli; başarısızsa geocodeTR fallback.
async function resolveAddress(g: any, address: string): Promise<Coord | null> {
  const q = /türkiye|turkey/i.test(address) ? address : `${address}, Türkiye`;
  const viaGoogle = await new Promise<Coord | null>((resolve) => {
    try {
      new g.maps.Geocoder().geocode({ address: q, region: 'TR', language: 'tr' }, (r: any, s: string) => {
        if (s === 'OK' && r?.[0]?.geometry?.location) {
          const l = r[0].geometry.location; resolve({ lat: l.lat(), lng: l.lng() });
        } else resolve(null);
      });
    } catch { resolve(null); }
  });
  if (viaGoogle) return viaGoogle;
  try { return await geocodeTR(address); } catch { return null; }
}

// ─── Bileşen ──────────────────────────────────────────────────────────────────
export function CourierTrackingMapGoogle({
  deliveryId, origin, destination, destinationLabel,
  height = '100%', accent = '#2563EB', style, externalPosition, originLabel, onRouteInfo, apiKey,
  bottomInset = 0,
}: Props) {
  const [lastPing, setLastPing] = useState<Ping | null>(null);
  const [destCoord, setDestCoord] = useState<Coord | null>(destination ?? null);
  const [originCoord, setOriginCoord] = useState<Coord | null>(origin ?? null);
  const [routeCoords, setRouteCoords] = useState<Coord[] | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const gRef = useRef<any>(null);            // window.google
  const mapRef = useRef<any>(null);
  const courierRef = useRef<any>(null);
  const destRef = useRef<any>(null);
  const originRef = useRef<any>(null);
  const routeMainRef = useRef<any>(null);
  const routeCasingRef = useRef<any>(null);
  const destInfoRef = useRef<any>(null);
  const originInfoRef = useRef<any>(null);
  const moveAnimRef = useRef<number | null>(null);
  const didFitRef = useRef(false);
  const fittedRealRef = useRef(false);   // gerçek (Directions) rotaya fit edildi mi

  const isDark = useThemeModeStore(s => s.resolvedDark);
  // Rota çizgisi: koyu haritada eski kobalt sönük kalıyor → lacivert ailenin
  // açık ucu (#5AA9E6). Açık haritada panel accent'i korunur.
  const routeColor = useAccentTones(accent).ink;
  const { width: vw } = useWindowDimensions();
  const isNarrow = vw < 768;
  // Dar ekranda yüzen liste paneli haritanın ALTINI kaplar; fitBounds bunu
  // bilmiyordu ve rotanın alt ucu panelin ARKASINDA kalıyordu. Panel içeriğe
  // göre boyutlandığı için yüksekliği ÖLÇÜLÜP `bottomInset` ile geliyor
  // (tahmin yok); gelmezse eski sabit değere düşülür.
  const narrowBottomPad = Math.round((bottomInset > 0 ? bottomInset : 220) + 16);

  // ── Harita init (bir kez) ──────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    loadGoogleMaps(apiKey).then((g) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      gRef.current = g;
      const center = destination ? { lat: destination.lat, lng: destination.lng } : { lat: 41.015137, lng: 28.979530 };
      mapRef.current = new g.maps.Map(containerRef.current, {
        center, zoom: 13,
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: 'greedy',
        styles: isDark ? MONO_DARK : MONO_LIGHT,
        backgroundColor: isDark ? '#1f2226' : '#f6f6f4',
      });
      setMapReady(true);
    }).catch((e) => console.warn('[gmaps] init', e?.message ?? e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Harita temizliği
  useEffect(() => () => {
    if (moveAnimRef.current != null) cancelAnimationFrame(moveAnimRef.current);
    mapRef.current = null;
  }, []);

  // Dark mode → stil swap
  useEffect(() => {
    if (!mapRef.current) return;
    try { mapRef.current.setOptions({ styles: isDark ? MONO_DARK : MONO_LIGHT, backgroundColor: isDark ? '#1f2226' : '#f6f6f4' }); } catch { /* */ }
  }, [isDark, mapReady]);

  // ── Adres → koordinat (prop yoksa geocode) ─────────────────────────────────
  useEffect(() => {
    if (destination) { setDestCoord(destination); return; }
    if (!destinationLabel) { setDestCoord(null); return; }
    let cancelled = false;
    loadGoogleMaps(apiKey).then(g => resolveAddress(g, destinationLabel)).then(c => { if (!cancelled) setDestCoord(c); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination?.lat, destination?.lng, destinationLabel]);

  useEffect(() => {
    if (origin) { setOriginCoord(origin); return; }
    if (!originLabel) { setOriginCoord(null); return; }
    let cancelled = false;
    loadGoogleMaps(apiKey).then(g => resolveAddress(g, originLabel)).then(c => { if (!cancelled) setOriginCoord(c); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.lat, origin?.lng, originLabel]);

  // ── Rota (canlı konumdan/çıkıştan hedefe) ──────────────────────────────────
  const routeStart = lastPing ? { lat: lastPing.lat, lng: lastPing.lng } : (originCoord ?? null);
  const routeVia = (() => {
    if (!lastPing || !originCoord || !destCoord) return null;
    const c = { lat: lastPing.lat, lng: lastPing.lng };
    const dCO = haversineM(c, originCoord);
    const dCD = haversineM(c, destCoord);
    const dOD = haversineM(originCoord, destCoord);
    return (dCO > 150 && dCD > dOD + 100) ? originCoord : null;
  })();
  useEffect(() => {
    if (!routeStart || !destCoord) { setRouteCoords(null); onRouteInfo?.(null); return; }
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(g => googleRoute(g, routeStart, destCoord, routeVia))
      .then(r => {
        if (cancelled) return;
        setRouteCoords(r?.coords ?? null);
        if (r) onRouteInfo?.({ durationSec: r.durationSec, distanceM: r.distanceM, live: !!lastPing });
        else onRouteInfo?.(null);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeStart?.lat, routeStart?.lng, destCoord?.lat, destCoord?.lng, routeVia?.lat, routeVia?.lng, !!lastPing]);

  // ── Dış kurye konumu ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!externalPosition) return;
    setLastPing({ lat: externalPosition.lat, lng: externalPosition.lng, accuracy_m: null, recorded_at: new Date().toISOString() } as any);
  }, [externalPosition?.lat, externalPosition?.lng]);

  // ── Ping fetch + realtime ──────────────────────────────────────────────────
  useEffect(() => {
    if (externalPosition) return;
    if (!deliveryId) { setLastPing(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('gps_pings')
        .select('lat, lng, accuracy_m, recorded_at')
        .eq('delivery_id', deliveryId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) setLastPing(data as any);
    })();
    const ch = supabase
      .channel(`gps-tracking-g-${deliveryId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gps_pings', filter: `delivery_id=eq.${deliveryId}` },
        (payload: any) => { if (!cancelled) setLastPing(payload.new as Ping); },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [deliveryId, !!externalPosition]);

  // Yeni delivery → fit sıfırla
  useEffect(() => { didFitRef.current = false; fittedRealRef.current = false; }, [deliveryId]);

  // ── Marker çizimi ──────────────────────────────────────────────────────────
  useEffect(() => {
    const g = gRef.current, map = mapRef.current;
    if (!g || !map) return;

    // Teslim pini (2 ya da tek duraksa 1)
    if (destCoord) {
      const pos = { lat: destCoord.lat, lng: destCoord.lng };
      const icon = { url: numberedPinUri(originCoord ? 2 : 1), scaledSize: new g.maps.Size(26, 34), anchor: new g.maps.Point(13, 34) };
      if (!destRef.current) {
        destRef.current = new g.maps.Marker({ position: pos, map, icon, zIndex: 500 });
        if (destinationLabel) {
          destInfoRef.current = new g.maps.InfoWindow({
            content: `<div style="font:600 12px system-ui;color:#0A0A0A;line-height:1.4;max-width:240px">${destinationLabel.replace(/</g, '&lt;')}</div>`,
            disableAutoPan: true,
          });
          destRef.current.addListener('click', () => destInfoRef.current.open({ map, anchor: destRef.current }));
        }
      } else { destRef.current.setPosition(pos); destRef.current.setIcon(icon); }
    } else if (destRef.current) { destRef.current.setMap(null); destRef.current = null; }

    // Alım pini (1)
    if (originCoord) {
      const pos = { lat: originCoord.lat, lng: originCoord.lng };
      const icon = { url: numberedPinUri(1), scaledSize: new g.maps.Size(26, 34), anchor: new g.maps.Point(13, 34) };
      if (!originRef.current) {
        originRef.current = new g.maps.Marker({ position: pos, map, icon, zIndex: 500 });
        if (originLabel) {
          originInfoRef.current = new g.maps.InfoWindow({
            content: `<div style="font:600 12px system-ui;color:#0A0A0A;line-height:1.4;max-width:240px">${originLabel.replace(/</g, '&lt;')}</div>`,
            disableAutoPan: true,
          });
          originRef.current.addListener('click', () => originInfoRef.current.open({ map, anchor: originRef.current }));
        }
      } else { originRef.current.setPosition(pos); originRef.current.setIcon(icon); }
    } else if (originRef.current) { originRef.current.setMap(null); originRef.current = null; }

    // Kurye scooter — dik durur; konum ~0.9s yumuşak tween.
    // İkon 90×128 → oranı KORU (kare scaledSize ezerdi). Yükseklik 64 → genişlik ≈45.
    if (lastPing) {
      const icon = { url: COURIER_ICON_URI, scaledSize: new g.maps.Size(45, 64), anchor: new g.maps.Point(22, 58) };
      if (!courierRef.current) {
        courierRef.current = new g.maps.Marker({ position: { lat: lastPing.lat, lng: lastPing.lng }, map, icon, zIndex: 1000 });
      } else {
        if (moveAnimRef.current != null) cancelAnimationFrame(moveAnimRef.current);
        const start = courierRef.current.getPosition();
        const sLat = start.lat(), sLng = start.lng();
        const eLat = lastPing.lat, eLng = lastPing.lng;
        const t0 = performance.now(), dur = 900;
        const step = (now: number) => {
          const k = Math.min(1, (now - t0) / dur);
          const ease = 1 - Math.pow(1 - k, 3);
          courierRef.current.setPosition({ lat: sLat + (eLat - sLat) * ease, lng: sLng + (eLng - sLng) * ease });
          if (k < 1) moveAnimRef.current = requestAnimationFrame(step); else moveAnimRef.current = null;
        };
        moveAnimRef.current = requestAnimationFrame(step);
      }
    }
  }, [mapReady, lastPing, destCoord?.lat, destCoord?.lng, originCoord?.lat, originCoord?.lng, destinationLabel, originLabel]);

  // ── Rota çizimi (casing + ana çizgi) + fitBounds ───────────────────────────
  useEffect(() => {
    const g = gRef.current, map = mapRef.current;
    if (!g || !map) return;

    // Gerçek rota yoksa düz fallback çizgi (kurye→teslim / origin→teslim).
    let path: Coord[] = [];
    const hasReal = !!(routeCoords && routeCoords.length > 1);
    if (hasReal) {
      path = routeCoords!;
    } else {
      if (originCoord) path.push(originCoord);
      if (lastPing) path.push({ lat: lastPing.lat, lng: lastPing.lng });
      if (destCoord) path.push(destCoord);
    }

    if (routeMainRef.current) { routeMainRef.current.setMap(null); routeMainRef.current = null; }
    if (routeCasingRef.current) { routeCasingRef.current.setMap(null); routeCasingRef.current = null; }

    if (path.length >= 2) {
      if (hasReal) {
        // Alt "casing" — rotayı zeminden ayırır. Yalnız AÇIK haritada beyaz kılıf çizilir.
        // Koyu haritada kılıf tamamen kaldırıldı (beyaz stroke istenmiyor) → sade mavi çizgi.
        if (!isDark) {
          routeCasingRef.current = new g.maps.Polyline({
            path, map, strokeColor: '#FFFFFF', strokeOpacity: 0.95, strokeWeight: 9, zIndex: 300,
          });
        }
        routeMainRef.current = new g.maps.Polyline({
          path, map, strokeColor: accent, strokeOpacity: 1, strokeWeight: 6, zIndex: 301,
        });
      } else {
        // Gerçek rota yoksa (Directions başarısız) kesikli accent tahmin çizgisi.
        routeMainRef.current = new g.maps.Polyline({
          path, map, strokeColor: routeColor, strokeOpacity: 0, zIndex: 301,
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeColor: routeColor, strokeOpacity: 0.9, scale: 3 }, offset: '0', repeat: '14px' }],
        });
      }

      // İlk çizimde fit; Directions gerçek rotası gelince (daha geniş sınır) BİR KEZ
      // daha fit — aksi halde fallback düz çizginin küçük sınırında takılı kalır.
      const shouldFit = !didFitRef.current || (hasReal && !fittedRealRef.current);
      if (shouldFit) {
        try {
          const b = new g.maps.LatLngBounds();
          path.forEach(p => b.extend(p));
          // Rota üzerinde olmayan uçları da kat (pinler + kurye).
          if (originCoord) b.extend(originCoord);
          if (destCoord) b.extend(destCoord);
          if (lastPing) b.extend({ lat: lastPing.lat, lng: lastPing.lng });
          const pad = isNarrow
            ? { top: 120, right: 24, bottom: narrowBottomPad, left: 24 }
            : { top: 100, right: 380, bottom: 60, left: 355 };
          map.fitBounds(b, pad);
          g.maps.event.addListenerOnce(map, 'idle', () => {
            if (map.getZoom() > 16) map.setZoom(16);
          });
          didFitRef.current = true;
          if (hasReal) fittedRealRef.current = true;
        } catch { /* */ }
      }
    } else if (lastPing) {
      map.panTo({ lat: lastPing.lat, lng: lastPing.lng });
    }
  }, [mapReady, routeCoords, accent, routeColor, destCoord?.lat, destCoord?.lng, originCoord?.lat, originCoord?.lng, lastPing, isNarrow, isDark, narrowBottomPad]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (Platform.OS !== 'web') return null;
  return (
    // zIndex:0 → kendi stacking context'i. Klasik Google Marker'lar enlem-bazlı
    // dev z-index alır; bağlam olmadan kök yığılmaya sızıp overlay kartların
    // (zIndex 1000) üstüne çıkarlar. Bağlam bunu 0 seviyesinde hapseder → kartlar üstte.
    <View style={[{ height, position: 'relative' as any, zIndex: 0 }, style]}>
      {/* @ts-ignore web-only */}
      <div
        ref={containerRef as any}
        style={{
          width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden',
          background: isDark ? '#1f2226' : '#f6f6f4',
        }}
      />
      <View style={{
        position: 'absolute',
        end: 12,
        ...(isNarrow ? { top: 112 } : { bottom: 92 }),
        gap: 8,
        zIndex: 1100,
      }}>
        {[
          { icon: Locate, onPress: () => {
            if (!navigator.geolocation || !mapRef.current) return;
            navigator.geolocation.getCurrentPosition(
              (pos) => { mapRef.current?.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }); mapRef.current?.setZoom(15); },
              () => {}, { enableHighAccuracy: true, timeout: 8000 },
            );
          } },
          { icon: Plus, onPress: () => mapRef.current?.setZoom((mapRef.current?.getZoom() ?? 13) + 1) },
          { icon: Minus, onPress: () => mapRef.current?.setZoom((mapRef.current?.getZoom() ?? 13) - 1) },
        ].map(({ icon: Icon, onPress }, i) => (
          <Pressable
            key={i}
            onPress={onPress}
            style={{
              width: 38, height: 38, borderRadius: 19,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: isDark ? '#1B1916' : '#FFFFFF',
              borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'transparent',
              ...(Platform.OS === 'web' ? {
                cursor: 'pointer',
                boxShadow: isDark ? '0 6px 18px rgba(0,0,0,0.6)' : '0 6px 18px rgba(15,23,42,0.18)',
              } as any : {}),
            }}
          >
            <Icon size={16} color={isDark ? '#F7F2E9' : '#0F172A'} strokeWidth={2} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
