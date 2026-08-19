// modules/courier/CourierTrackingMap.tsx
// Tam ekran kurye takip haritası — origin→destination polyline + canlı marker
// + destination popup. Sağ üst zoom kontrolleri. Footer info card harita üstüne
// floating olarak parent'a bırakıldı.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Platform, Pressable, useWindowDimensions } from 'react-native';
import { COURIER_ICON_URI } from './courierIcon';
import { MapPin, Plus, Minus, Locate } from 'lucide-react-native';
import { supabase } from '../../core/api/supabase';
import { geocodeTR } from './geocoder';
import { useThemeModeStore } from '../../core/store/themeModeStore';

// Kurye konum marker ikonu — kullanıcının assets/courier-pin.png'i 128px'e
// küçültülüp base64 DATA URI olarak ./courierIcon'a gömüldü (require(png).uri
// production static export'ta çözülmüyordu → "kırık görsel").


interface Coord { lat: number; lng: number; }
interface Ping extends Coord { recorded_at: string; accuracy_m?: number | null; }

interface Props {
  deliveryId?:   string | null;
  origin?:       Coord | null;          // lab konumu — geocoding sonradan eklenir
  destination?:  Coord | null;          // alıcı konumu
  destinationLabel?: string;
  height?:       number | string;
  accent?:       string;
  style?:        any;
  /**
   * Dış kurye (BanaBiKurye) konumu. Kendi kuryemiz gps_pings'e yazar; dış sağlayıcının
   * kuryesi bizim uygulamayı kullanmadığı için konumu API'den gelir ve buradan beslenir.
   * Verildiğinde gps_pings aboneliği kurulmaz, işaretçi bu konumdan çizilir.
   */
  externalPosition?: Coord | null;
  /** Çıkış adresi — koordinat yoksa geokodlanır. Teslim edilmiş gönderilerde rota buradan başlar. */
  originLabel?: string;
  /**
   * Rota hesaplanınca sürüş süresi/mesafesi. `live=true` → rota KURYENİN anlık
   * konumundan başlıyor, yani gerçek tahmini varış. `live=false` → kurye konumu
   * yok; süre çıkış noktası→teslim güzergâhının süresi (varış tahmini değil).
   * Rota hiç çizilemezse null.
   */
  onRouteInfo?: (info: { durationSec: number | null; distanceM: number | null; live: boolean } | null) => void;
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
      link.rel = 'stylesheet'; link.href = LEAFLET_CSS; link.setAttribute('data-leaflet', '1');
      document.head.appendChild(link);
    }
    // Marker styles — eski pulse + yeni drop-pin yan yana
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
        .courier-marker-pulse {
          position: absolute; inset: -4px;
          border-radius: 50%;
          animation: courier-pulse 1.8s ease-out infinite;
        }
      `;
      document.head.appendChild(style);
    }
    // Round, minimal zoom buttons — paylaşılan style tag (idempotent)
    if (!document.querySelector('style[data-leaflet-zoom-pill]')) {
      const zs = document.createElement('style');
      zs.setAttribute('data-leaflet-zoom-pill', '1');
      zs.textContent = `
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
      s.src = LEAFLET_JS; s.setAttribute('data-leaflet', '1');
      s.onload = () => resolve((window as any).L);
      s.onerror = () => reject(new Error('leaflet load failed'));
      document.head.appendChild(s);
    } else { resolve((window as any).L); }
  });
  return leafletLoading;
}

// Geocoding artık ortak helper'dan — TR adres formatını doğru parçalar.
const geocode = geocodeTR;

// ─── Routing (OSRM public) ───────────────────────────────────────────────
// İki nokta arası mesafe (metre) — pickup uğrağı kararı için.
function haversineM(a: Coord, b: Coord): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

interface RouteResult { coords: [number, number][]; durationSec: number | null; distanceM: number | null; }
// `via` verilirse rota o ara noktadan GEÇEREK çizilir (kurye → alım → teslim).
// coords ile birlikte sürüş SÜRESİ (duration) + MESAFE (distance) de döner → tahmini varış.
async function fetchRoute(from: Coord, to: Coord, via?: Coord | null): Promise<RouteResult | null> {
  try {
    const pts = [from, ...(via ? [via] : []), to].map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${pts}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const json = await res.json();
    const r0 = json.routes?.[0];
    if (r0?.geometry?.coordinates) {
      return {
        // GeoJSON [lng, lat] → Leaflet [lat, lng]
        coords: r0.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]),
        durationSec: typeof r0.duration === 'number' ? r0.duration : null,
        distanceM:   typeof r0.distance === 'number' ? r0.distance : null,
      };
    }
  } catch (e) { console.warn('[osrm] failed', e); }
  return null;
}

// Google Maps tarzı NUMARALI kırmızı damla pin (varış sırası: 1=alım, 2=teslim).
function numberedPinHtml(n: number | string): string {
  return `
    <div style="width:26px;height:34px;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.32))">
      <svg width="26" height="34" viewBox="0 0 32 42" fill="none">
        <path d="M16 0C7.16 0 0 7.16 0 16c0 11.2 16 26 16 26s16-14.8 16-26C32 7.16 24.84 0 16 0z" fill="#D9483B"/>
        <text x="16" y="15" text-anchor="middle" dominant-baseline="central"
              font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="15" font-weight="800" fill="#fff">${n}</text>
      </svg>
    </div>`;
}

// Hex rengi belirtilen oranda koyulaştırır (panel renginden gradient tonları üretmek için).
function darkenHex(hex: string, amt: number): string {
  try {
    const h = hex.replace('#', '');
    const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const ch = (i: number) => Math.max(0, Math.min(255, Math.round(parseInt(n.slice(i, i + 2), 16) * (1 - amt))));
    return `#${[ch(0), ch(2), ch(4)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  } catch { return hex; }
}

// Hex rengi beyaza doğru harmanlayıp AÇAR (gradient'in açık ucu için).
function lightenHex(hex: string, amt: number): string {
  try {
    const h = hex.replace('#', '');
    const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const ch = (i: number) => {
      const c = parseInt(n.slice(i, i + 2), 16);
      return Math.max(0, Math.min(255, Math.round(c + (255 - c) * amt)));
    };
    return `#${[ch(0), ch(2), ch(4)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  } catch { return hex; }
}

// Aktif PANEL renginden rota gradient'i: AÇIK ton → TOK (dolgun) ton. Belirgin geçiş.
function panelGradientStops(accent: string): string[] {
  return [lightenHex(accent, 0.55), accent, darkenHex(accent, 0.18)];
}

// Rota çizgisine PANEL-renginde gradient verir: Leaflet SVG overlay'ine linearGradient
// def'i enjekte/GÜNCELLER (panel değişince renk de değişir). Stroke `url(#courierRouteGrad)`.
function ensureRouteGradient(map: any, stops: string[]): void {
  if (typeof document === 'undefined') return;
  try {
    const svg = map?.getPanes?.()?.overlayPane?.querySelector('svg');
    if (!svg) return;
    const NS = 'http://www.w3.org/2000/svg';
    let grad: any = svg.querySelector('#courierRouteGrad');
    if (!grad) {
      const defs = document.createElementNS(NS, 'defs');
      grad = document.createElementNS(NS, 'linearGradient');
      grad.setAttribute('id', 'courierRouteGrad');
      grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
      grad.setAttribute('x2', '1'); grad.setAttribute('y2', '1');
      defs.appendChild(grad);
      svg.insertBefore(defs, svg.firstChild);
    }
    // Stop'ları güncel panel renkleriyle yeniden yaz.
    while (grad.firstChild) grad.removeChild(grad.firstChild);
    const denom = Math.max(1, stops.length - 1);
    stops.forEach((col, i) => {
      const s = document.createElementNS(NS, 'stop');
      s.setAttribute('offset', `${Math.round((i / denom) * 100)}%`);
      s.setAttribute('stop-color', col);
      grad.appendChild(s);
    });
  } catch { /* gradient yoksa düz renk kalır */ }
}

// Polyline'ın SVG path'ine panel-renginde gradient stroke uygular.
function applyRouteGradient(map: any, poly: any, stops: string[]): void {
  ensureRouteGradient(map, stops);
  const set = () => { try { if (poly?._path) poly._path.setAttribute('stroke', 'url(#courierRouteGrad)'); } catch { /* */ } };
  set();
  // Leaflet path'i bazen sonraki frame'de yeniden çiziyor → gradient'i tekrar uygula.
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(set);
}

export function CourierTrackingMap({
  deliveryId, origin, destination, destinationLabel,
  height = '100%', accent = '#2563EB', style, externalPosition, originLabel, onRouteInfo,
}: Props) {
  const [lastPing, setLastPing] = useState<Ping | null>(null);
  const [destCoord, setDestCoord] = useState<Coord | null>(destination ?? null);
  const [originCoord, setOriginCoord] = useState<Coord | null>(origin ?? null);
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef      = useRef<any>(null);
  const markerRef   = useRef<any>(null);
  const routeRef    = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const originMarkerRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const prevPingRef = useRef<{ lat: number; lng: number } | null>(null);
  const headingRef = useRef<number>(0);
  const moveAnimRef = useRef<number | null>(null);
  const didFitRef = useRef<boolean>(false);
  const routeCoordsRef = useRef<[number, number][] | null>(null);
  routeCoordsRef.current = routeCoords;

  // Geocode destination address if no coord provided
  useEffect(() => {
    if (destination) { setDestCoord(destination); return; }
    if (!destinationLabel) { setDestCoord(null); return; }
    let cancelled = false;
    geocode(destinationLabel).then(c => { if (!cancelled) setDestCoord(c); });
    return () => { cancelled = true; };
  }, [destination?.lat, destination?.lng, destinationLabel]);

  // Çıkış noktası: koordinat verilmemişse adresten geokodla (hedefle aynı desen).
  // Teslim edilmiş gönderilerde rota bu noktadan çizilir.
  useEffect(() => {
    if (origin) { setOriginCoord(origin); return; }
    if (!originLabel) { setOriginCoord(null); return; }
    let cancelled = false;
    geocode(originLabel).then(c => { if (!cancelled) setOriginCoord(c); });
    return () => { cancelled = true; };
  }, [origin?.lat, origin?.lng, originLabel]);

  // Rota: canlı konum varsa kuryeden, yoksa çıkış noktasından hedefe.
  // Teslim edilmiş/henüz atanmamış gönderilerde kurye konumu gelmez; o durumda
  // origin → destination çizilerek güzergâh yine gösterilir.
  const routeStart = lastPing
    ? { lat: lastPing.lat, lng: lastPing.lng }
    : (originCoord ?? null);
  // Kurye CANLI + alım noktası (lab) varsa VE kurye henüz alıma uğramadıysa → rota
  // alımdan GEÇEREK gider (kurye → lab → teslim). Kurye laba yaklaşınca/geçince
  // (alımı yaptıysa) düz rota (kurye → teslim). Heuristik: kurye laba >150m uzak VE
  // teslime laboratuvardan daha uzaksa henüz alım yapmamıştır.
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
    fetchRoute(routeStart, destCoord, routeVia)
      .then(r => {
        if (cancelled) return;
        setRouteCoords(r?.coords ?? null);
        // Süre her durumda verilir; "tahmini varış" mı yoksa yalnızca güzergâh
        // süresi mi olduğunu `live` ayırt eder (rota kuryeden mi başlıyor?).
        // Eskiden kurye canlı değilken null gönderiliyordu ve kart hiç görünmüyordu.
        if (r) onRouteInfo?.({ durationSec: r.durationSec, distanceM: r.distanceM, live: !!lastPing });
        else onRouteInfo?.(null);
      });
    return () => { cancelled = true; };
  }, [routeStart?.lat, routeStart?.lng, destCoord?.lat, destCoord?.lng, routeVia?.lat, routeVia?.lng, !!lastPing]);

  // Dış kurye konumu (BanaBiKurye) — gps_pings yerine API'den beslenir.
  useEffect(() => {
    if (!externalPosition) return;
    setLastPing({
      lat: externalPosition.lat,
      lng: externalPosition.lng,
      accuracy_m: null,
      recorded_at: new Date().toISOString(),
    } as any);
  }, [externalPosition?.lat, externalPosition?.lng]);

  // Ping fetch + realtime
  useEffect(() => {
    if (externalPosition) return;   // dış kurye → gps_pings dinleme
    if (!deliveryId) { setLastPing(null); return; }
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
      .channel(`gps-tracking-${deliveryId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gps_pings', filter: `delivery_id=eq.${deliveryId}` },
        (payload: any) => { if (!cancelled) setLastPing(payload.new as Ping); },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [deliveryId, !!externalPosition]);

  // Bir kez global CSS inject: dark mode tile filtresi (sokak okunabilirliği)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.getElementById('tracking-map-dark-style')) return;
    const style = document.createElement('style');
    style.id = 'tracking-map-dark-style';
    style.textContent = `
      .tracking-map-dark .leaflet-tile-pane {
        filter: brightness(1.45) saturate(0.85) contrast(0.95);
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Dark mode değişince tile layer'ı swap et (map zaten initialize edilmişse)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!mapRef.current) return;
    loadLeaflet().then((L) => {
      if (!mapRef.current) return;
      // Eski tile'ı kaldır
      if (tileLayerRef.current) {
        try { mapRef.current.removeLayer(tileLayerRef.current); } catch { /* */ }
      }
      const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
      tileLayerRef.current = L.tileLayer(tileUrl, {
        subdomains: 'abcd', maxZoom: 20,
      }).addTo(mapRef.current);
    });
  }, [isDark]);

  // Leaflet init/update
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current) return;
      const center: [number, number] = lastPing
        ? [lastPing.lat, lastPing.lng]
        : destination
          ? [destination.lat, destination.lng]
          : [41.015137, 28.979530]; // İstanbul fallback

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, { zoomControl: false, attributionControl: false }).setView(center, 13);
        // Tile layer — dark mode'da dark_matter, light'ta positron (Carto)
        const tileUrl = isDark
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        tileLayerRef.current = L.tileLayer(tileUrl, {
          subdomains: 'abcd', maxZoom: 20,
        }).addTo(mapRef.current);
        // Leaflet default zoom kapalı — React tarafında kendi butonlarımız var.
      }

      // Teslim noktası — 2 numaralı kırmızı pin (varış sırası). Alım yoksa (originCoord
      // yoksa) tek durak olduğu için numarasız görünmesin diye yine "2" mantıklı değil →
      // origin yoksa bu tek durak olur; o durumda numara "1".
      if (destCoord) {
        if (destMarkerRef.current) destMarkerRef.current.remove();
        const destIcon = L.divIcon({
          className: 'tracking-dest',
          html: numberedPinHtml(originCoord ? 2 : 1),
          iconSize: [26, 34], iconAnchor: [13, 34],
        });
        destMarkerRef.current = L.marker([destCoord.lat, destCoord.lng], { icon: destIcon }).addTo(mapRef.current);
        if (destinationLabel) {
          destMarkerRef.current.bindPopup(
            `<div style="font:600 12px system-ui;color:#0A0A0A;line-height:1.4;max-width:240px">${destinationLabel.replace(/</g, '&lt;')}</div>`,
            { closeButton: false, offset: [0, -22] as any, autoClose: false },
          );
        }
      }

      // Alım noktası — 1 numaralı kırmızı pin (varış sırası).
      if (originCoord) {
        if (originMarkerRef.current) originMarkerRef.current.remove();
        const originIcon = L.divIcon({
          className: 'tracking-origin',
          html: numberedPinHtml(1),
          iconSize: [26, 34], iconAnchor: [13, 34],
        });
        originMarkerRef.current = L.marker([originCoord.lat, originCoord.lng], { icon: originIcon }).addTo(mapRef.current);
        if (originLabel) {
          originMarkerRef.current.bindPopup(
            `<div style="font:600 12px system-ui;color:#0A0A0A;line-height:1.4;max-width:240px">${originLabel.replace(/</g, '&lt;')}</div>`,
            { closeButton: false, offset: [0, -26] as any, autoClose: false },
          );
        }
      }

      // Courier marker — yellow scooter, rotated toward route direction (animated)
      if (lastPing) {
        const toRad = (d: number) => d * Math.PI / 180;
        const toDeg = (r: number) => r * 180 / Math.PI;
        const bearing = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
          const φ1 = toRad(a.lat), φ2 = toRad(b.lat);
          const Δλ = toRad(b.lng - a.lng);
          const y = Math.sin(Δλ) * Math.cos(φ2);
          const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
          return (toDeg(Math.atan2(y, x)) + 360) % 360;
        };
        let heading = headingRef.current;
        if (routeCoords && routeCoords.length > 1) {
          let bestIdx = 0, bestDist = Infinity;
          for (let i = 0; i < routeCoords.length; i++) {
            const dy = routeCoords[i][0] - lastPing.lat;
            const dx = routeCoords[i][1] - lastPing.lng;
            const d = dy * dy + dx * dx;
            if (d < bestDist) { bestDist = d; bestIdx = i; }
          }
          const ahead = routeCoords[Math.min(bestIdx + 5, routeCoords.length - 1)];
          if (ahead) heading = bearing({ lat: lastPing.lat, lng: lastPing.lng }, { lat: ahead[0], lng: ahead[1] });
        } else if (prevPingRef.current) {
          const d2 = (prevPingRef.current.lat - lastPing.lat) ** 2 + (prevPingRef.current.lng - lastPing.lng) ** 2;
          if (d2 > 1e-10) heading = bearing(prevPingRef.current, { lat: lastPing.lat, lng: lastPing.lng });
        }
        // Shortest rotation path (avoid 359→1 long spin)
        const prevRot = headingRef.current;
        let delta = heading - prevRot;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        const targetRot = prevRot + delta;
        headingRef.current = ((heading % 360) + 360) % 360;

        const rot = targetRot - 90;

        if (!markerRef.current) {
          // Diş-scooter PIN — dik durur (dönmez); ucu tam konuma oturur.
          // Kullanıcının ikonu — base64 data URI (harici istek yok, her ortamda yüklenir).
          const icon = L.divIcon({
            className: 'tracking-courier',
            html: `<div style="width:64px;height:64px;filter:drop-shadow(0 6px 10px rgba(0,0,0,0.32))"><img src="${COURIER_ICON_URI}" style="width:100%;height:100%;object-fit:contain;display:block" draggable="false"/></div>`,
            iconSize: [64, 64], iconAnchor: [32, 54],
          });
          // zIndexOffset yüksek: numaralı pin'ler her poll'de yeniden eklenip
          // (origin/dest remove+readd) kurye marker'ının ÜSTÜNde kalıyordu; kurye
          // alım noktasındayken (pin "1" ile aynı konum) scooter örtülüyordu.
          markerRef.current = L.marker([lastPing.lat, lastPing.lng], { icon, zIndexOffset: 1000 }).addTo(mapRef.current);
        } else {
          // Pin dik durur (dönmez); yalnız konum ~1s yumuşak tween.
          // Animate position by tweening lat/lng over ~1s
          if (moveAnimRef.current != null) cancelAnimationFrame(moveAnimRef.current);
          const start = markerRef.current.getLatLng();
          const end = { lat: lastPing.lat, lng: lastPing.lng };
          const t0 = performance.now();
          const dur = 900;
          const step = (now: number) => {
            const k = Math.min(1, (now - t0) / dur);
            const ease = 1 - Math.pow(1 - k, 3);
            const la = start.lat + (end.lat - start.lat) * ease;
            const ln = start.lng + (end.lng - start.lng) * ease;
            markerRef.current.setLatLng([la, ln]);
            if (k < 1) moveAnimRef.current = requestAnimationFrame(step);
            else moveAnimRef.current = null;
          };
          moveAnimRef.current = requestAnimationFrame(step);
        }
        prevPingRef.current = { lat: lastPing.lat, lng: lastPing.lng };
      }

      // Route fallback (düz çizgi) — gerçek OSRM polyline ayrı effect'te çiziliyor.
      if (routeRef.current) { routeRef.current.remove(); routeRef.current = null; }
      const rc = routeCoordsRef.current;
      let pts: [number, number][] = [];
      if (rc && rc.length > 1) {
        pts = rc;
      } else {
        if (originCoord) pts.push([originCoord.lat, originCoord.lng]);
        if (lastPing)  pts.push([lastPing.lat, lastPing.lng]);
        if (destCoord) pts.push([destCoord.lat, destCoord.lng]);
      }
      if (pts.length >= 2) {
        routeRef.current = L.polyline(pts, {
          color: accent, weight: rc ? 7 : 5, opacity: rc ? 1 : 0.9,
          lineCap: 'round', lineJoin: 'round',
          dashArray: rc ? undefined : '6 10',
        }).addTo(mapRef.current);
        // Gerçek rota (düz tahmin değil) → panel-renginde gradient stroke.
        if (rc) applyRouteGradient(mapRef.current, routeRef.current, panelGradientStops(accent));
        if (!didFitRef.current) {
          try {
            mapRef.current.invalidateSize();
            // Kenar boşlukları overlay panelleri hesaba katar: solda liste (~360px),
            // sağda seçili gönderi kartı (320px + 24 kenar). Aksi hâlde rotanın ucu
            // kartların altında kalıyor ve "tek görünümde tamamı" bozuluyor.
            mapRef.current.fitBounds(routeRef.current.getBounds(), {
              paddingTopLeft: [355, 100], paddingBottomRight: [380, 60],
              maxZoom: 16, animate: true,
            });
            didFitRef.current = true;
          } catch {}
        }
      } else if (lastPing) {
        mapRef.current.panTo([lastPing.lat, lastPing.lng]);
      }
    }).catch((e) => console.warn('[tracking-map]', e?.message ?? e));
    return () => { cancelled = true; };
  }, [lastPing, destCoord?.lat, destCoord?.lng, originCoord?.lat, originCoord?.lng, destinationLabel, accent]);

  // Yeni delivery seçilince fit'i sıfırla
  useEffect(() => { didFitRef.current = false; }, [deliveryId]);

  // Sadece routeCoords değişince polyline'ı güncelle (marker'lar dokunulmaz)
  useEffect(() => {
    if (!mapRef.current || !routeCoords || routeCoords.length < 2) return;
    let cancelled = false;
    loadLeaflet().then((L: any) => {
      if (cancelled || !mapRef.current) return;
      if (routeRef.current) { routeRef.current.remove(); routeRef.current = null; }
      routeRef.current = L.polyline(routeCoords, {
        color: accent, weight: 7, opacity: 1,
        lineCap: 'round', lineJoin: 'round',
      }).addTo(mapRef.current);
      applyRouteGradient(mapRef.current, routeRef.current, panelGradientStops(accent));
      if (!didFitRef.current) {
        try {
          mapRef.current.invalidateSize();
          // Overlay panelleri hesaba kat: solda liste, sağda seçili gönderi kartı.
          // Böylece rotanın tamamı tek görünümde, kartların altında kalmadan görünür.
          mapRef.current.fitBounds(routeRef.current.getBounds(), {
            paddingTopLeft: [355, 100], paddingBottomRight: [380, 60],
            maxZoom: 16, animate: true,
          });
          didFitRef.current = true;
        } catch {}
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [routeCoords, accent]);

  useEffect(() => {
    return () => { if (mapRef.current?.remove) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);

  // ─── Native (iOS/Android): WebView içinde Leaflet + OSM (API key gerekmez) ───
  const webRef = useRef<any>(null);
  const pushMapUpdate = React.useCallback(() => {
    if (Platform.OS === 'web' || !webRef.current) return;
    const data = {
      origin:  origin ? { lat: origin.lat, lng: origin.lng } : null,
      dest:    destCoord ? { lat: destCoord.lat, lng: destCoord.lng } : null,
      courier: lastPing ? { lat: lastPing.lat, lng: lastPing.lng } : null,
      route:   routeCoords ?? null,
      accent,
    };
    const js = `window.__updateMap && window.__updateMap(${JSON.stringify(data)}); true;`;
    try { webRef.current.injectJavaScript(js); } catch { /* noop */ }
  }, [origin?.lat, origin?.lng, destCoord?.lat, destCoord?.lng, lastPing?.lat, lastPing?.lng, routeCoords, accent]);

  useEffect(() => { pushMapUpdate(); }, [pushMapUpdate]);

  if (Platform.OS !== 'web') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { WebView } = require('react-native-webview');
    const html = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{margin:0;height:100%;width:100%;background:${isDark ? '#1A1A1A' : '#E2E8F0'}}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([39.0,35.2],6);
L.tileLayer('https://{s}.basemaps.cartocdn.com/${isDark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png',{maxZoom:20,subdomains:'abcd'}).addTo(map);
var cM=null,dM=null,oM=null,rL=null,fit=false;
function ic(c){return L.divIcon({className:'',html:'<div style="width:18px;height:18px;border-radius:50%;background:'+c+';border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"></div>',iconSize:[18,18],iconAnchor:[9,9]});}
window.__updateMap=function(d){
  if(d.origin){ if(!oM){oM=L.marker([d.origin.lat,d.origin.lng],{icon:ic('#64748B')}).addTo(map);} else oM.setLatLng([d.origin.lat,d.origin.lng]); }
  if(d.dest){ if(!dM){dM=L.marker([d.dest.lat,d.dest.lng],{icon:ic('#DC2626')}).addTo(map);} else dM.setLatLng([d.dest.lat,d.dest.lng]); }
  if(d.courier){ if(!cM){cM=L.marker([d.courier.lat,d.courier.lng],{icon:ic(d.accent||'#2563EB')}).addTo(map);} else cM.setLatLng([d.courier.lat,d.courier.lng]); }
  if(d.route&&d.route.length){ if(rL)map.removeLayer(rL); rL=L.polyline(d.route,{color:d.accent||'#2563EB',weight:4,opacity:.85}).addTo(map); }
  if(!fit){ var p=[]; if(d.courier)p.push([d.courier.lat,d.courier.lng]); if(d.dest)p.push([d.dest.lat,d.dest.lng]); if(d.origin)p.push([d.origin.lat,d.origin.lng]);
    if(p.length>1){map.fitBounds(p,{padding:[48,48]});fit=true;} else if(p.length===1){map.setView(p[0],14);fit=true;} }
};
</script></body></html>`;
    return (
      <View style={[{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: isDark ? '#1A1A1A' : '#E2E8F0' }, style]}>
        <WebView
          ref={webRef}
          source={{ html }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          onLoadEnd={() => pushMapUpdate()}
          style={{ flex: 1, backgroundColor: 'transparent' }}
        />
      </View>
    );
  }

  const { width: _vw } = useWindowDimensions();
  const isNarrow = _vw < 768;
  return (
    <View style={[{ height, position: 'relative' as any }, style]}>
      {/* @ts-ignore web-only */}
      <div
        ref={containerRef as any}
        className={isDark ? 'tracking-map-dark' : ''}
        style={{
          width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden',
          background: isDark ? '#1A1A1A' : '#E2E8F0',
        }}
      />
      {Platform.OS === 'web' && (
        <View style={{
          position: 'absolute',
          end: 12,
          ...(isNarrow
            ? { top: 112 }                              // mobile: floating TopActionBar (QR/Bell/Profile) altında
            // desktop: sağ altta global "Simanty'ye sor" balonu duruyor (~56px + kenar
            // boşluğu). 92 vermezsek zoom-out butonu onun altında kalıyor.
            : { bottom: 92 }),
          gap: 8,
          zIndex: 1100,
        }}>
          <Pressable
            onPress={() => {
              if (!navigator.geolocation || !mapRef.current) return;
              navigator.geolocation.getCurrentPosition(
                (pos) => mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 15),
                () => {},
                { enableHighAccuracy: true, timeout: 8000 }
              );
            }}
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
            <Locate size={16} color={isDark ? '#F7F2E9' : '#0F172A'} strokeWidth={2} />
          </Pressable>
          <Pressable
            onPress={() => mapRef.current?.zoomIn()}
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
            <Plus size={16} color={isDark ? '#F7F2E9' : '#0F172A'} strokeWidth={2} />
          </Pressable>
          <Pressable
            onPress={() => mapRef.current?.zoomOut()}
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
            <Minus size={16} color={isDark ? '#F7F2E9' : '#0F172A'} strokeWidth={2} />
          </Pressable>
        </View>
      )}
    </View>
  );
}
