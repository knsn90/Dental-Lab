// modules/courier/CourierTrackingMapNative.native.tsx
//
// Native (iOS/Android) gerçek harita — react-native-maps. iOS'te Leaflet WebView
// yerine kullanılır. İki platformda da PROVIDER_GOOGLE + web ile aynı gri MONO
// stil (Apple Haritalar renkli ve stillenemiyor; bkz. provider notu).
//
// ÖNEMLİ: react-native-maps'in WEB desteği YOK. Bu yüzden yalnız .native.tsx'te
// import edilir; web tarafı CourierTrackingMapNative.web.tsx stub'ını çözer.
//
// Veri mantığı CourierTrackingMap'teki Leaflet ile birebir aynı (geocode +
// gps_pings realtime + OSRM rota). Helper'lar burada tekrarlanır (paylaşılan
// dosyaya web-kirlenmesi olmadan bağımsız kalsın diye).

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { supabase } from '../../core/api/supabase';
import { geocodeTR } from './geocoder';
import { useThemeModeStore } from '../../core/store/themeModeStore';
import { useAccentTones } from '../../core/ui/HeroGlow';
import { MONO_LIGHT, MONO_DARK } from './monoMapStyle';
import { COURIER_ICON_URI } from './courierIcon';

interface Coord { lat: number; lng: number; }
interface Ping extends Coord { recorded_at: string; accuracy_m?: number | null; }
interface RouteResult { coords: [number, number][]; durationSec: number | null; distanceM: number | null; }

export interface Props {
  deliveryId?: string | null;
  origin?: Coord | null;
  destination?: Coord | null;
  destinationLabel?: string;
  originLabel?: string;
  height?: number | string;
  accent?: string;
  style?: any;
  externalPosition?: Coord | null;
  onRouteInfo?: (info: { durationSec: number | null; distanceM: number | null; live: boolean } | null) => void;
  /** Altta haritanın üzerine binen yüzen panelin ölçülmüş yüksekliği (px). */
  bottomInset?: number;
}

const geocode = geocodeTR;

function haversineM(a: Coord, b: Coord): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function fetchRoute(from: Coord, to: Coord, via?: Coord | null): Promise<RouteResult | null> {
  try {
    const pts = [from, ...(via ? [via] : []), to].map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${pts}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const json = await res.json();
    const r0 = json.routes?.[0];
    if (r0?.geometry?.coordinates) {
      return {
        coords: r0.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]),
        durationSec: typeof r0.duration === 'number' ? r0.duration : null,
        distanceM:   typeof r0.distance === 'number' ? r0.distance : null,
      };
    }
  } catch (e) { console.warn('[osrm] failed', e); }
  return null;
}


/** Web haritadaki numaralı kırmızı damla pin'in native karşılığı (aynı renk/oran). */
function NumberedPin({ n }: { n: number }) {
  return (
    <View style={{ alignItems: 'center', width: 28, height: 36 }}>
      <View style={{
        width: 26, height: 26, borderRadius: 13, backgroundColor: '#D9483B',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>{n}</Text>
      </View>
      <View style={{
        width: 0, height: 0, marginTop: -2,
        borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 10,
        borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#D9483B',
      }} />
    </View>
  );
}

export function CourierTrackingMapNative({
  deliveryId, origin, destination, destinationLabel,
  height = '100%', accent = '#2563EB', style, externalPosition, originLabel, onRouteInfo,
  bottomInset = 0,
}: Props) {
  const [lastPing, setLastPing] = useState<Ping | null>(null);
  // Özel View marker'ları iOS'te ilk karede boş kalabiliyor; kısa süre izleyip kapat.
  const [tracksViews, setTracksViews] = useState(true);
  const [destCoord, setDestCoord] = useState<Coord | null>(destination ?? null);
  const [originCoord, setOriginCoord] = useState<Coord | null>(origin ?? null);
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const routeColor = useAccentTones(accent).ink;

  useEffect(() => {
    const t = setTimeout(() => setTracksViews(false), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (destination) { setDestCoord(destination); return; }
    if (!destinationLabel) { setDestCoord(null); return; }
    let cancelled = false;
    geocode(destinationLabel).then(c => { if (!cancelled) setDestCoord(c); });
    return () => { cancelled = true; };
  }, [destination?.lat, destination?.lng, destinationLabel]);
  useEffect(() => {
    if (origin) { setOriginCoord(origin); return; }
    if (!originLabel) { setOriginCoord(null); return; }
    let cancelled = false;
    geocode(originLabel).then(c => { if (!cancelled) setOriginCoord(c); });
    return () => { cancelled = true; };
  }, [origin?.lat, origin?.lng, originLabel]);

  const routeStart = lastPing ? { lat: lastPing.lat, lng: lastPing.lng } : (originCoord ?? null);
  const routeVia = (() => {
    if (!lastPing || !originCoord || !destCoord) return null;
    const c = { lat: lastPing.lat, lng: lastPing.lng };
    const dCO = haversineM(c, originCoord); const dCD = haversineM(c, destCoord); const dOD = haversineM(originCoord, destCoord);
    return (dCO > 150 && dCD > dOD + 100) ? originCoord : null;
  })();
  useEffect(() => {
    if (!routeStart || !destCoord) { setRouteCoords(null); onRouteInfo?.(null); return; }
    let cancelled = false;
    fetchRoute(routeStart, destCoord, routeVia).then(r => {
      if (cancelled) return;
      setRouteCoords(r?.coords ?? null);
      if (r) onRouteInfo?.({ durationSec: r.durationSec, distanceM: r.distanceM, live: !!lastPing });
      else onRouteInfo?.(null);
    });
    return () => { cancelled = true; };
  }, [routeStart?.lat, routeStart?.lng, destCoord?.lat, destCoord?.lng, routeVia?.lat, routeVia?.lng, !!lastPing]);

  useEffect(() => {
    if (!externalPosition) return;
    setLastPing({ lat: externalPosition.lat, lng: externalPosition.lng, accuracy_m: null, recorded_at: new Date().toISOString() } as any);
  }, [externalPosition?.lat, externalPosition?.lng]);
  useEffect(() => {
    if (externalPosition) return;
    if (!deliveryId) { setLastPing(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('gps_pings').select('lat, lng, accuracy_m, recorded_at')
        .eq('delivery_id', deliveryId).order('recorded_at', { ascending: false }).limit(1).maybeSingle();
      if (!cancelled && data) setLastPing(data as any);
    })();
    const ch = supabase.channel(`gps-native-${deliveryId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gps_pings', filter: `delivery_id=eq.${deliveryId}` },
        (payload: any) => { if (!cancelled) setLastPing(payload.new as Ping); })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [deliveryId, !!externalPosition]);

  useEffect(() => {
    const pts = [originCoord, destCoord, lastPing].filter(Boolean) as Coord[];
    if (!mapRef.current || pts.length === 0) return;
    if (pts.length === 1) {
      mapRef.current.animateToRegion({ latitude: pts[0].lat, longitude: pts[0].lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 350);
    } else {
      mapRef.current.fitToCoordinates(pts.map(p => ({ latitude: p.lat, longitude: p.lng })),
        // Alt pay: üzerine binen yüzen panel kadar (ölçülüp geçilir) — yoksa
        // rotanın alt ucu panelin arkasında kalır.
        { edgePadding: { top: 70, right: 70, bottom: Math.max(70, bottomInset + 16), left: 70 }, animated: true });
    }
  }, [originCoord?.lat, originCoord?.lng, destCoord?.lat, destCoord?.lng, lastPing?.lat, lastPing?.lng, bottomInset]);

  // Her iki platformda Google + gri MONO stil (web ile birebir).
  // NOT: eskiden iOS'te anahtar `Constants.expoConfig.ios.config.googleMapsApiKey`
  // ile kontrol ediliyordu — ama Expo gömülü (public) config'ten `ios.config`'i
  // SİLER (@expo/config Config.js isPublicConfig) → koşul yayında hep false,
  // harita her zaman renkli Apple Haritalar'a düşüyordu. iOS native kurulumu
  // hazır: Podfile 'Google' subspec + AppDelegate GMSServices.provideAPIKey +
  // Info.plist GMSApiKey. (Google derlenmemiş bir build'de react-native-maps
  // PROVIDER_GOOGLE'ı sessizce Apple'a düşürür — çökme yok.)
  const provider = PROVIDER_GOOGLE;
  const first = originCoord ?? destCoord ?? (lastPing ? { lat: lastPing.lat, lng: lastPing.lng } : null);

  return (
    <View style={[{ height: height as any, borderRadius: 16, overflow: 'hidden', backgroundColor: isDark ? '#1f2226' : '#eef0f2' }, style]}>
      <MapView
        ref={mapRef}
        provider={provider}
        style={{ flex: 1 }}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        // Google → web ile BİREBİR aynı gri MONO stil.
        customMapStyle={isDark ? MONO_DARK : MONO_LIGHT}
        showsPointsOfInterests={false}
        showsTraffic={false}
        showsBuildings={false}
        showsCompass={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        initialRegion={{
          latitude: first?.lat ?? 41.0082, longitude: first?.lng ?? 28.9784,
          latitudeDelta: 0.05, longitudeDelta: 0.05,
        }}
      >
        {originCoord && (
          <Marker
            coordinate={{ latitude: originCoord.lat, longitude: originCoord.lng }}
            title={originLabel ?? 'Çıkış'}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={tracksViews}
          >
            <NumberedPin n={1} />
          </Marker>
        )}
        {destCoord && (
          <Marker
            coordinate={{ latitude: destCoord.lat, longitude: destCoord.lng }}
            title={destinationLabel ?? 'Teslim'}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={tracksViews}
            zIndex={500}
          >
            <NumberedPin n={originCoord ? 2 : 1} />
          </Marker>
        )}
        {lastPing && (
          <Marker
            coordinate={{ latitude: lastPing.lat, longitude: lastPing.lng }}
            title="Kurye"
            anchor={{ x: 0.5, y: 0.9 }}
            tracksViewChanges={tracksViews}
            zIndex={1000}
          >
            {/* Web haritadaki scooter ikonunun aynısı — oran korunur (90×128). */}
            <Image source={{ uri: COURIER_ICON_URI }} style={{ width: 45, height: 64 }} resizeMode="contain" />
          </Marker>
        )}
        {routeCoords && routeCoords.length > 1 && (
          <>
            {/* Casing (web ile aynı iki katmanlı rota çizgisi) */}
            <Polyline
              coordinates={routeCoords.map(c => ({ latitude: c[0], longitude: c[1] }))}
              strokeColor={isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.9)'}
              strokeWidth={8}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={routeCoords.map(c => ({ latitude: c[0], longitude: c[1] }))}
              strokeColor={routeColor}
              strokeWidth={4.5}
              lineCap="round"
              lineJoin="round"
            />
          </>
        )}
      </MapView>
    </View>
  );
}
