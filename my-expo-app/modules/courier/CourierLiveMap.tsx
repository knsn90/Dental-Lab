import { localeTag, isRTL } from '../../core/i18n';
import { autoT } from '../../core/i18n/autoTranslate';
// modules/courier/CourierLiveMap.tsx
// Aktif teslimat için canlı harita — Leaflet via CDN (web).
// Native: koordinat/zaman gösteren özet kart (Faz 3 v1 web öncelikli).

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Platform, Pressable, Linking } from 'react-native';
import { Navigation, MapPin, MessageSquare, Phone, Plus, Minus } from '../../core/ui/icons';
import { supabase } from '../../core/api/supabase';
import { geocodeTR } from './geocoder';
import { useMobileTokens } from '../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../core/store/themeModeStore';

interface Ping { lat: number; lng: number; recorded_at: string; accuracy_m?: number | null; }

interface Props {
  deliveryId:   string;
  destinationLabel?: string;
  height?:      number;
  accent?:      string;
  /** Üst-sol kart için kurye adı (CourierLiveMap kendi fetch eder eğer verilmediyse) */
  courierName?: string;
  /** Kurye telefonu (opsiyonel) */
  courierPhone?: string;
  /** "Mesaj" butonu için handler */
  onMessage?:   () => void;
  /**
   * Compact mode — kart overlay'leri (kurye + trip kartı) gizlenir,
   * yalnız harita + zoom kontrolleri render edilir. Gömülü hero/dashboard
   * kullanımı için.
   */
  compact?:     boolean;
}

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let leafletLoading: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject('not web');
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletLoading) return leafletLoading;
  leafletLoading = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      link.setAttribute('data-leaflet', '1');
      document.head.appendChild(link);
    }
    if (!document.querySelector('style[data-courier-marker]')) {
      const style = document.createElement('style');
      style.setAttribute('data-courier-marker', '1');
      style.textContent = `
        @keyframes courier-pulse {
          0%   { transform: scale(1);   opacity: 1; }
          70%  { transform: scale(2.6); opacity: 0; }
          100% { transform: scale(2.6); opacity: 0; }
        }
        .courier-marker-wrap { position: relative; }
        /* Koyu tema: OSM tam-renkli tile'ları koyulaştır (yalnız raster katman;
           marker/rota ayrı pane'lerde → etkilenmez). html.dark reaktif. */
        html.dark .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9) saturate(0.85); }
        .courier-marker-pulse {
          position: absolute; inset: -4px;
          border-radius: 50%;
          animation: courier-pulse 1.8s ease-out infinite;
        }
        @keyframes progress-knob-pulse {
          0%   { transform: translate(-50%, -50%) scale(1);    opacity: 1; }
          50%  { transform: translate(-50%, -50%) scale(1.25); opacity: .85; }
          100% { transform: translate(-50%, -50%) scale(1);    opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
    // Round, minimal zoom buttons — bağımsız style tag (idempotent)
    if (!document.querySelector('style[data-leaflet-zoom-pill]')) {
      const zs = document.createElement('style');
      zs.setAttribute('data-leaflet-zoom-pill', '1');
      zs.textContent = `
        /* Container: gölge ve border yok, flex column 6px aralık */
        .leaflet-bar.leaflet-control-zoom,
        .leaflet-touch .leaflet-bar.leaflet-control-zoom {
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 6px !important;
          margin: 12px !important;
          border-radius: 0 !important;
        }
        /* Tüm zoom butonları — :first/:last dahil */
        .leaflet-bar.leaflet-control-zoom a,
        .leaflet-bar.leaflet-control-zoom a:first-child,
        .leaflet-bar.leaflet-control-zoom a:last-child,
        .leaflet-bar.leaflet-control-zoom a.leaflet-control-zoom-in,
        .leaflet-bar.leaflet-control-zoom a.leaflet-control-zoom-out {
          width: 34px !important; height: 34px !important;
          line-height: 34px !important;
          border-radius: 50% !important;
          background: #FFFFFF !important;
          color: #0F172A !important;
          border: 1px solid rgba(15,23,42,0.10) !important;
          font-size: 16px !important;
          font-weight: 500 !important;
          box-shadow: none !important;
          transition: background .12s ease, transform .12s ease;
        }
        .leaflet-bar.leaflet-control-zoom a:hover {
          background: #F8FAFC !important;
          transform: translateY(-1px);
        }
        .leaflet-bar.leaflet-control-zoom a:active { transform: translateY(0); }
        .leaflet-bar.leaflet-control-zoom a.leaflet-disabled { opacity: 0.4; cursor: not-allowed; }
      `;
      document.head.appendChild(zs);
    }
    if (!document.querySelector('script[data-leaflet]')) {
      const s = document.createElement('script');
      s.src = LEAFLET_JS;
      s.setAttribute('data-leaflet', '1');
      s.onload = () => resolve((window as any).L);
      s.onerror = () => reject(new Error('leaflet load failed'));
      document.head.appendChild(s);
    } else {
      resolve((window as any).L);
    }
  });
  return leafletLoading;
}

// Geocoding artık ortak helper'dan — TR adres formatını doğru parçalar.
const geocode = geocodeTR;
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sa = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(sa));
}

async function fetchRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<{ coords: [number, number][]; durationSec: number; distanceM: number } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.routes?.[0]?.geometry?.coordinates) {
      return {
        coords: json.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]),
        durationSec: Number(json.routes[0].duration ?? 0),
        distanceM:   Number(json.routes[0].distance ?? 0),
      };
    }
  } catch (e) { console.warn('[osrm]', e); }
  return null;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  const m = Math.round(sec / 60);
  if (m < 1)  return '<1 dk';
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} sa ${r} dk` : `${h} sa`;
}
function formatElapsed(fromISO: string): string {
  const sec = Math.floor((Date.now() - new Date(fromISO).getTime()) / 1000);
  if (sec < 0) return '—';
  if (sec < 60) return `${sec} sn`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} sa ${r} dk` : `${h} sa`;
}

export function CourierLiveMap({
  deliveryId, destinationLabel, height = 360, accent = '#2563EB',
  courierName: courierNameProp, courierPhone, onMessage,
  compact = false,
}: Props) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const T = useMobileTokens();
  // Koyu haritada beyaz glass + koyu metin okunmaz → koyu glass + açık ink.
  const glassBg = isDark ? 'rgba(20,19,18,0.72)' : 'rgba(255,255,255,0.08)';
  const glassBorder = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.55)';
  const [lastPing, setLastPing] = useState<Ping | null>(null);
  const [destCoord, setDestCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const [routeEtaSec, setRouteEtaSec] = useState<number | null>(null);
  // 30sn'de bir "yola çıktı" sayacını tazele
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [nowTick, setNowTick] = useState(Date.now()); // 30sn'lik tetik — elapsed sayaçları için
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const [courierName, setCourierName] = useState<string | null>(courierNameProp ?? null);
  const [courierPhoneState, setCourierPhoneState] = useState<string | null>(courierPhone ?? null);
  const [tripInfo, setTripInfo] = useState<{
    status: string | null;
    orderNumber: string | null;
    destinationName: string | null;
    pickedUpAt: string | null;
    assignedAt: string | null;
    provider: string | null;
  } | null>(null);

  // Kurye + delivery + work_order bilgilerini delivery'den çek
  useEffect(() => {
    if (courierNameProp) setCourierName(courierNameProp);
    if (courierPhone) setCourierPhoneState(courierPhone);
    if (!deliveryId) return;
    let cancelled = false;
    supabase
      .from('deliveries')
      .select(`
        status, picked_up_at, assigned_at, external_provider, destination_name,
        courier:profiles!deliveries_courier_profiles_fkey(full_name, phone),
        work_order:work_orders!work_order_id(order_number)
      `)
      .eq('id', deliveryId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (cancelled || !data) return;
        if (!courierNameProp && data.courier?.full_name) setCourierName(data.courier.full_name);
        if (!courierPhone && data.courier?.phone) setCourierPhoneState(data.courier.phone);
        setTripInfo({
          status: data.status ?? null,
          orderNumber: data.work_order?.order_number ?? null,
          destinationName: data.destination_name ?? null,
          pickedUpAt: data.picked_up_at ?? null,
          assignedAt: data.assigned_at ?? null,
          provider: data.external_provider ?? null,
        });
      });
    return () => { cancelled = true; };
  }, [deliveryId, courierNameProp, courierPhone]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const routeRef = useRef<any>(null);

  // Geocode destination address
  useEffect(() => {
    if (!destinationLabel) { setDestCoord(null); return; }
    let cancelled = false;
    geocode(destinationLabel).then(c => { if (!cancelled) setDestCoord(c); });
    return () => { cancelled = true; };
  }, [destinationLabel]);

  // Fetch route when both points exist
  useEffect(() => {
    if (!lastPing || !destCoord) { setRouteCoords(null); setRouteEtaSec(null); return; }
    let cancelled = false;
    fetchRoute({ lat: lastPing.lat, lng: lastPing.lng }, destCoord)
      .then(r => {
        if (cancelled) return;
        if (r) { setRouteCoords(r.coords); setRouteEtaSec(r.durationSec); }
        else   { setRouteCoords(null);    setRouteEtaSec(null); }
      });
    return () => { cancelled = true; };
  }, [lastPing?.lat, lastPing?.lng, destCoord?.lat, destCoord?.lng]);

  // Son ping çek + realtime subscribe
  useEffect(() => {
    let cancelled = false;
    const fetchLast = async () => {
      const { data } = await supabase
        .from('gps_pings')
        .select('lat, lng, accuracy_m, recorded_at')
        .eq('delivery_id', deliveryId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) setLastPing(data as any);
    };
    fetchLast();
    const ch = supabase
      .channel(`gps-${deliveryId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gps_pings', filter: `delivery_id=eq.${deliveryId}` },
        (payload: any) => { if (!cancelled) setLastPing(payload.new as Ping); },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [deliveryId]);

  // Leaflet init + update
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!lastPing) return;
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, { zoomControl: false, attributionControl: false }).setView([lastPing.lat, lastPing.lng], 14);
        // Positron — minimalist, accent rengi öne çıksın
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          subdomains: 'abc',
          maxZoom: 20,
          attribution: '© OSM contributors © CARTO',
        }).addTo(mapRef.current);
        // Leaflet default zoom control — kapalı. Aşağıda kendi butonlarımız var.
        const icon = L.divIcon({
          className: 'courier-marker',
          html: `
            <div class="courier-marker-wrap" style="width:18px;height:18px">
              <div class="courier-marker-pulse" style="background:${accent}"></div>
              <div style="position:absolute;inset:0;width:18px;height:18px;border-radius:50%;background:${accent};border:3px solid #fff;box-shadow:0 4px 12px ${accent}66"></div>
            </div>
          `,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        markerRef.current = L.marker([lastPing.lat, lastPing.lng], { icon }).addTo(mapRef.current);
      } else {
        markerRef.current.setLatLng([lastPing.lat, lastPing.lng]);
      }

      // Destination marker
      if (destCoord) {
        if (destMarkerRef.current) destMarkerRef.current.remove();
        const destIcon = L.divIcon({
          className: 'tracking-dest',
          html: `<div style="width:12px;height:12px;border-radius:50%;background:#0F172A;border:3px solid #fff;box-shadow:0 4px 12px rgba(15,23,42,0.30)"></div>`,
          iconSize: [12, 12], iconAnchor: [6, 6],
        });
        destMarkerRef.current = L.marker([destCoord.lat, destCoord.lng], { icon: destIcon }).addTo(mapRef.current);
      }

      // Route polyline (OSRM tercih, fallback düz çizgi)
      if (routeRef.current) { routeRef.current.remove(); routeRef.current = null; }
      let pts: [number, number][] = [];
      if (routeCoords && routeCoords.length > 1) {
        pts = routeCoords;
      } else if (destCoord) {
        pts = [[lastPing.lat, lastPing.lng], [destCoord.lat, destCoord.lng]];
      }
      if (pts.length >= 2) {
        routeRef.current = L.polyline(pts, {
          color: accent, weight: 4, opacity: 0.85, lineCap: 'round', lineJoin: 'round',
          dashArray: routeCoords ? undefined : '6 8',
        }).addTo(mapRef.current);
        // Cards sol kolonu ~280px kaplar → fitBounds'a paddingTopLeft ver, route sağ tarafa otur
        try {
          mapRef.current.fitBounds(routeRef.current.getBounds(), {
            paddingTopLeft: [300, 30],
            paddingBottomRight: [30, 30],
          });
        } catch {}
      } else {
        mapRef.current.panTo([lastPing.lat, lastPing.lng]);
      }
    }).catch((e) => console.warn('[map] leaflet', e?.message ?? e));
    return () => { cancelled = true; };
  }, [lastPing, accent, destCoord?.lat, destCoord?.lng, routeCoords]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current?.remove) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  if (!lastPing) {
    return (
      <View style={{ height, borderRadius: 16, backgroundColor: isDark ? T.cardSoft : "#F4F8FC", alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' }}>
        <MapPin size={18} color={isDark ? (T.ink3 as string) : "#94A3B8"} strokeWidth={1.8} />
        <Text style={{ fontSize: 12, color: isDark ? T.ink2 : "#6B6B6B" }}>Kurye henüz konum paylaşmadı</Text>
      </View>
    );
  }

  const lastTime = new Date(lastPing.recorded_at);
  const ageSec = Math.floor((Date.now() - lastTime.getTime()) / 1000);
  const ageLabel = ageSec < 60 ? `${ageSec} ${autoT('sn önce')}` : ageSec < 3600 ? `${Math.floor(ageSec / 60)} ${autoT('dk önce')}` : `${Math.floor(ageSec / 3600)} ${autoT('sa önce')}`;

  // Kurye → destination mesafe (haversine, km)
  const distanceKm = destCoord ? haversineKm(lastPing, destCoord) : null;
  const STATUS_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
    beklemede:     { label: 'Beklemede',  bg: 'rgba(234,122,76,0.16)', fg: '#9C5E0E' },
    atandi:        { label: 'Atandı',     bg: 'rgba(234,122,76,0.16)', fg: '#9C5E0E' },
    teslim_alindi: { label: 'Aldı',       bg: 'rgba(37,99,235,0.16)',  fg: '#1E3A8A' },
    yolda:         { label: 'Yolda',      bg: 'rgba(37,99,235,0.20)',  fg: '#1E3A8A' },
    teslim_edildi: { label: 'Teslim',     bg: 'rgba(16,185,129,0.16)', fg: '#0F6E50' },
    iptal:         { label: 'İptal',      bg: 'rgba(220,38,38,0.16)',  fg: '#9C2E2E' },
  };
  const statusCfgRaw = STATUS_LABELS[tripInfo?.status ?? 'beklemede'] ?? STATUS_LABELS.beklemede;
  const DARK_STATUS_FG: Record<string, string> = {
    '#9C5E0E': '#F5C24B', '#1E3A8A': '#93C5FD', '#0F6E50': '#6EE7B7', '#9C2E2E': '#FCA5A5',
  };
  const statusCfg = isDark
    ? { ...statusCfgRaw, fg: DARK_STATUS_FG[statusCfgRaw.fg] ?? T.ink2 }
    : statusCfgRaw;

  return (
    <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: isDark ? T.card : '#FFF', borderWidth: 1, borderColor: isDark ? T.hairline : 'rgba(0,0,0,0.06)', position: 'relative' }}>
      {Platform.OS === 'web' ? (
        // @ts-ignore — web-only
        <div ref={containerRef as any} style={{ width: '100%', height, background: isDark ? '#0E0E0E' : '#E2E8F0' }} />
      ) : (
        <View style={{ height, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? T.cardSoft : "#F4F8FC", gap: 6 }}>
          <Navigation size={20} color={accent} strokeWidth={1.8} />
          <Text style={{ fontSize: 12, color: isDark ? T.ink2 : "#3C3C3C" }}>
            Son konum: {lastPing.lat.toFixed(5)}, {lastPing.lng.toFixed(5)}
          </Text>
          <Pressable onPress={() => Linking.openURL(`https://maps.google.com/?q=${lastPing.lat},${lastPing.lng}`)}>
            <Text style={{ fontSize: 12, color: accent, fontWeight: '700' }}>Haritada aç →</Text>
          </Pressable>
        </View>
      )}

      {/* ─── Custom zoom buttons (sağ alt, yuvarlak, ayrık) ─── */}
      {Platform.OS === 'web' && (
        <View style={{ position: 'absolute', end: 12, bottom: 12, gap: 8, zIndex: 1000 }}>
          <Pressable
            onPress={() => mapRef.current?.zoomIn()}
            style={{
              width: 38, height: 38, borderRadius: 19,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: glassBg,
              borderWidth: 1, borderColor: glassBorder,
              ...(Platform.OS === 'web' ? {
                cursor: 'pointer',
                backdropFilter: 'blur(3px) saturate(120%)',
                WebkitBackdropFilter: 'blur(3px) saturate(120%)',
                boxShadow: '0 10px 24px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
              } as any : {}),
            }}
          >
            <Plus size={16} color={isDark ? (T.ink as string) : "#0F172A"} strokeWidth={2} />
          </Pressable>
          <Pressable
            onPress={() => mapRef.current?.zoomOut()}
            style={{
              width: 38, height: 38, borderRadius: 19,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: glassBg,
              borderWidth: 1, borderColor: glassBorder,
              ...(Platform.OS === 'web' ? {
                cursor: 'pointer',
                backdropFilter: 'blur(3px) saturate(120%)',
                WebkitBackdropFilter: 'blur(3px) saturate(120%)',
                boxShadow: '0 10px 24px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
              } as any : {}),
            }}
          >
            <Minus size={16} color={isDark ? (T.ink as string) : "#0F172A"} strokeWidth={2} />
          </Pressable>
        </View>
      )}

      {/* ─── Floating card stack (sol kolon) — compact mode'da gizli ─── */}
      {!compact && Platform.OS === 'web' && (courierName || destinationLabel) && (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute', start: 12, top: 12, bottom: 12,
            width: 260, gap: 8,
            // @ts-ignore web — Leaflet panes z-index 200-700
            zIndex: 1000,
          }}
        >
          {/* Kurye kartı */}
          {courierName && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              paddingHorizontal: 10, paddingVertical: 9, borderRadius: 18,
              backgroundColor: glassBg,
              borderWidth: 1, borderColor: glassBorder,
              // @ts-ignore web — glassmorphism
              backdropFilter: 'blur(3px) saturate(120%)',
              // @ts-ignore web (Safari)
              WebkitBackdropFilter: 'blur(3px) saturate(120%)',
              // @ts-ignore web — frosted depth + inner top highlight
              boxShadow: '0 12px 32px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
            }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: `${accent}22` }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: accent }}>
                  {courierName.split(' ').map(s => s[0]).slice(0, 2).join('')}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? T.ink : "#0A0A0A" }} numberOfLines={1}>{courierName}</Text>
                <Text style={{ fontSize: 10, color: isDark ? T.ink3 : "#9A9A9A" }}>Kurye · {ageLabel}</Text>
              </View>
              <Pressable
                onPress={onMessage}
                style={{
                  width: 32, height: 32, borderRadius: 16,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : '#0A0A0A',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}
              >
                <MessageSquare size={13} color="#FFF" strokeWidth={2} />
              </Pressable>
              {courierPhoneState && (
                <Pressable
                  onPress={() => Linking.openURL(`tel:${courierPhoneState}`)}
                  style={{
                    width: 32, height: 32, borderRadius: 16,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: accent,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Phone size={13} color="#FFF" strokeWidth={2} />
                </Pressable>
              )}
            </View>
          )}

          {/* Sefer (trip) kartı — referans tasarımı */}
          {tripInfo && (
            <View style={{
              padding: 14, borderRadius: 20, gap: 10,
              backgroundColor: glassBg,
              borderWidth: 1, borderColor: glassBorder,
              // @ts-ignore web — glassmorphism
              backdropFilter: 'blur(3px) saturate(120%)',
              // @ts-ignore web (Safari)
              WebkitBackdropFilter: 'blur(3px) saturate(120%)',
              // @ts-ignore web — frosted depth + inner top highlight
              boxShadow: '0 16px 40px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
            }}>
              {/* Status badge */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: statusCfg.bg }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: statusCfg.fg }}>{statusCfg.label}</Text>
                </View>
                {tripInfo.orderNumber && (
                  <Text style={{ fontSize: 10, color: isDark ? T.ink3 : "#9A9A9A", fontWeight: '600' }}>#{tripInfo.orderNumber}</Text>
                )}
              </View>

              {/* Route (Lab → Alıcı) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? T.ink : "#0A0A0A" }}>Lab</Text>
                <Text style={{ fontSize: 12, color: isDark ? T.ink3 : "#9A9A9A" }}>→</Text>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: isDark ? T.ink : "#0A0A0A" }} numberOfLines={1}>
                  {tripInfo.destinationName ?? destinationLabel ?? '—'}
                </Text>
              </View>

              {/* Progress bar + animated knob */}
              {(() => {
                const pct = tripInfo.status === 'teslim_edildi' ? 100
                          : tripInfo.status === 'yolda' ? 65
                          : tripInfo.status === 'teslim_alindi' ? 30
                          : 8;
                return (
                  <View style={{ position: 'relative', height: 12, justifyContent: 'center' }}>
                    {/* Track */}
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.06)", overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${pct}%`, backgroundColor: accent }} />
                    </View>
                    {/* Animated knob */}
                    <View
                      // @ts-ignore web
                      style={{
                        position: 'absolute',
                        ...(isRTL() ? { right: `${pct}%` } : { left: `${pct}%` }),
                        top: '50%',
                        width: 12, height: 12, borderRadius: 6,
                        backgroundColor: '#FFF',
                        borderWidth: 2, borderColor: accent,
                        transform: 'translate(-50%, -50%)',
                        // @ts-ignore web
                        boxShadow: `0 2px 8px ${accent}66`,
                        ...({ animation: 'progress-knob-pulse 1.4s ease-out infinite' } as any),
                      }}
                    />
                  </View>
                );
              })()}

              {/* Info grid */}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontSize: 9, color: isDark ? T.ink3 : "#9A9A9A", fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' }}>Yola Çıktı</Text>
                  <Text style={{ fontSize: 11, color: isDark ? T.ink : "#0A0A0A", fontWeight: '600' }} numberOfLines={1}>
                    {tripInfo.pickedUpAt ? `${formatElapsed(tripInfo.pickedUpAt)} önce` : '—'}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontSize: 9, color: isDark ? T.ink3 : "#9A9A9A", fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' }}>Tahmini Varış</Text>
                  <Text style={{ fontSize: 11, color: isDark ? T.ink : "#0A0A0A", fontWeight: '600' }} numberOfLines={1}>
                    {tripInfo.status === 'teslim_edildi'
                      ? 'Teslim edildi'
                      : routeEtaSec != null
                        ? `${formatDuration(routeEtaSec)} (${new Date(Date.now() + routeEtaSec * 1000).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' })})`
                        : '—'}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontSize: 9, color: isDark ? T.ink3 : "#9A9A9A", fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' }}>Mesafe</Text>
                  <Text style={{ fontSize: 11, color: isDark ? T.ink : "#0A0A0A", fontWeight: '600' }}>
                    {distanceKm != null ? `${distanceKm.toFixed(1)} km` : '—'}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontSize: 9, color: isDark ? T.ink3 : "#9A9A9A", fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' }}>GPS Durumu</Text>
                  {(() => {
                    const stale = ageSec > 5 * 60; // 5 dk üstü → eski sinyal
                    const live  = ageSec < 60;
                    const color = stale ? '#9C2E2E' : live ? '#0F6E50' : '#0A0A0A';
                    const dotBg = stale ? '#DC2626' : live ? '#10B981' : '#9CA3AF';
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotBg }} />
                        <Text style={{ fontSize: 11, color, fontWeight: '600' }}>
                          {live ? 'Canlı' : ageLabel}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              </View>

              {/* Teslim Adresi — bilgi kartına entegre */}
              {destinationLabel && (
                <>
                  <View style={{ height: 1, backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.06)", marginTop: 2 }} />
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                    <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: `${accent}18`, marginTop: 1 }}>
                      <MapPin size={10} color={accent} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: isDark ? T.ink3 : "#9A9A9A", letterSpacing: 0.3, textTransform: 'uppercase' }}>Teslim Adresi</Text>
                      <Text style={{ fontSize: 10, color: isDark ? T.ink : "#0A0A0A", fontWeight: '500', lineHeight: 14 }} numberOfLines={5}>
                        {destinationLabel}
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}

        </View>
      )}

    </View>
  );
}
