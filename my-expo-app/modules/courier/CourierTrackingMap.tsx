// modules/courier/CourierTrackingMap.tsx
// Tam ekran kurye takip haritası — origin→destination polyline + canlı marker
// + destination popup. Sağ üst zoom kontrolleri. Footer info card harita üstüne
// floating olarak parent'a bırakıldı.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Platform, Pressable, useWindowDimensions } from 'react-native';
import { MapPin, Plus, Minus, Locate } from 'lucide-react-native';
import { supabase } from '../../core/api/supabase';
import { geocodeTR } from './geocoder';
import { useThemeModeStore } from '../../core/store/themeModeStore';

// Yellow scooter marker — faces right by default
const SCOOTER_SVG = `<svg viewBox="0 0 2122 2122" xmlns="http://www.w3.org/2000/svg"><g><path fill="#FFD353" d="M1891.053,528.119h-204.048h-194.397c-17.922,0-32.45,14.529-32.45,32.453v396.287c-129.002-7.765-328.198-19.95-355.02-15.435c-85.6,14.387-108.738,127.664-75.647,122.733c-35.459,33.491,55.829,248.833,14.185,271.473c-63.827,34.685-248.217,51.81-334.112,17.34c-21.709-8.711-45.187-38.142-77.441-71.04c-69.961-341.713,86.127-532.286,96.362-569.607c10.463-38.144,5.055-122.948-29.345-127.381c-27.007-3.485-92.553-15.825-133.143,8.097c-0.004-0.004-0.007-0.015-0.012-0.02c-4.728-4.438-39.087-0.784-46.044,38.183c-5.773,32.325,18.624,62.497,27.098,55.046c19.272,32.201,52.684,55.604,45.333,55.604c-227.591,184.39-258.947,363.226-262.009,430.844c-115.802,20.382-183.052,101.828-195.684,123.197c-14.212,24.045-11.059,70.848,8.45,66.871c-24.832,38.242-39.309,83.828-39.309,132.822c0,134.908,109.369,244.277,244.277,244.277c134.906,0,244.275-109.369,244.275-244.277c0-5.678-0.264-11.291-0.645-16.873c16.243,20.024,39.465,32.605,76.869,31.055l386.28-15.997c8.011,12.276,21.839,20.723,38.095,20.723h48.678c9.662,126.063,114.939,225.369,243.478,225.369c128.536,0,233.813-99.306,243.475-225.369h29.112c33.871,0,61.295-26.297,63.67-59.189c8.669-8.06,14.17-19.45,14.349-32.138c1.132-79.688-7.323-252.032-93.799-346.255h198.374c13.72,0,24.945-11.225,24.945-24.945s-11.225-24.945-24.945-24.945h50.745c17.922,0,32.451-14.528,32.451-32.448V560.572C1923.504,542.647,1908.975,528.119,1891.053,528.119z"/><path fill="#E84434" d="M1891.053,528.119h-204.048h-194.397c-17.922,0-32.45,14.529-32.45,32.453v396.287v37.715c0,9.271,3.908,17.611,10.143,23.524c5.817,5.517,13.657,8.924,22.307,8.924h5.121h264.73h77.849h50.745c17.922,0,32.451-14.528,32.451-32.448V560.572C1923.504,542.647,1908.975,528.119,1891.053,528.119z"/><path fill="#352E35" d="M1559.039,1514.495h-21.188h-305.448h-21.19h-69.563c9.662,126.063,114.939,225.369,243.478,225.369c128.536,0,233.813-99.306,243.475-225.369H1559.039z"/><path fill="#CCCCCC" d="M1537.851,1514.495h-305.448h-21.19c9.431,87.727,83.684,156.039,173.914,156.039c90.228,0,164.482-68.312,173.912-156.039H1537.851z"/><path fill="#352E35" d="M591.728,1478.714c-8.639-10.651-15.338-23.371-21.07-37.271c-26.596-64.487-79.544-125.797-146.346-158.036c-130.314-62.879-238.579,45.613-271.142,73.778c-3.728,3.224-7.069,4.974-10.04,5.58c-24.832,38.242-39.309,83.828-39.309,132.822c0,134.908,109.369,244.277,244.277,244.277c134.906,0,244.275-109.369,244.275-244.277C592.373,1489.908,592.109,1484.296,591.728,1478.714z"/><path fill="#FCC352" d="M1721.514,1447.328c-8.353-161.534-52.219-340.706-217.354-340.706c-168.255,0-405.561,186.012-454.755,349.846c-4.018,13.381-1.414,26.752,5.472,37.303c8.011,12.276,21.839,20.723,38.095,20.723h48.678h69.563h21.19h305.448h21.188h69.563h29.112c33.871,0,61.295-26.297,63.67-59.189C1721.573,1452.681,1721.654,1450.027,1721.514,1447.328z"/><path fill="#CCCCCC" d="M348.098,1320.634c-96.621,0-174.947,78.329-174.947,174.952s78.326,174.947,174.947,174.947c96.618,0,174.945-78.324,174.945-174.947S444.717,1320.634,348.098,1320.634z"/><path fill="#B3B3B3" d="M348.098,1341.662c-85.011,0-153.922,68.911-153.922,153.925c0,85.013,68.911,153.919,153.922,153.919c85.006,0,153.921-68.906,153.921-153.919C502.02,1410.573,433.104,1341.662,348.098,1341.662z"/><path fill="#808080" d="M348.098,1469.16c-14.594,0-26.424,11.83-26.424,26.426c0,14.592,11.829,26.421,26.424,26.421c14.592,0,26.421-11.829,26.421-26.421C374.52,1480.99,362.69,1469.16,348.098,1469.16z"/><path fill="#FFE67A" d="M556.829,875.987c-11.264,19.776-24.086,38.611-37.367,57.071c-26.753,37.184-55.622,72.984-79.176,112.365c-2.816,4.707-5.552,9.462-8.193,14.271c-8.468,15.425-16.1,32.204-15.447,49.787c0.767,20.721,13.189,39.615,29.089,52.916c15.902,13.301,35.128,21.88,54.076,30.29c12.258,5.437,28.765,10.012,37.286-0.341c2.875-3.493,4.071-8.029,5.191-12.409c13.433-52.521,26.862-105.043,40.295-157.564c13.505-52.809,27.299-105.554,40.509-158.436c3.474-13.905,13.971-44.175-3.876-52.579c-11.768-5.544-27.717,0.224-35.554,9.871c-5.744,7.064-7.995,17.111-11.72,25.315C567.381,856.596,562.29,866.399,556.829,875.987z"/><path fill="#FFE67A" d="M1397.709,1032.717c-9.762-2.699-20.073-2.431-30.188-1.9c-55.218,2.879-109.798,12.804-164.195,22.708c-21.756,3.961-43.515,7.917-65.271,11.878c-21.847,3.98-43.695,7.956-65.549,11.937c-10.799,1.958-21.654,0.39-20.166,14.762c3.025,29.228,9.259,59.917,9.259,89.242c0,14.017-2.236,48.629,3.869,75.143c4.611,20.015,13.978,35.415,32.653,33.846c28.36-2.377,49.474-31.318,69.491-48.429c20.048-17.14,40.041-34.353,60.725-50.728c40.712-32.229,84.589-61.564,134.083-78.392c15.32-5.214,31.486-9.403,44.217-19.391c12.731-9.983,21.055-27.932,14.327-42.645C1416.754,1041.536,1407.47,1035.417,1397.709,1032.717z"/><path fill="#FFD353" d="M1589.809,1228.673c-18.19-25.574-41.447-49.174-71.184-59.206c-30.663-10.339-64.441-5.023-95.366,4.502c-63.06,19.415-120.114,55.698-168.923,100.097c-13.535,12.312-26.485,25.262-38.896,38.704c-22.256,24.098-42.779,49.759-62.051,76.292c-4.897,6.743-9.713,13.545-14.458,20.39c-4.024,5.808-8.865,10.87-12.945,16.561c-8.358,11.649,9.52,24.916,19.374,27.347c12.337,3.05,25.245-0.019,37.693-2.567c125.342-25.672,254.998,1.807,382.886-2.003c26.378-0.784,56.414-4.921,71.281-26.724c10.804-15.844,10.263-36.682,7.561-55.669C1637.758,1316.995,1618.734,1269.336,1589.809,1228.673z"/><path fill="#B3B3B3" d="M1385.127,1649.506c78.6,0,143.397-58.926,152.724-135.011h-305.448C1241.729,1590.58,1306.523,1649.506,1385.127,1649.506z"/></g></svg>`;

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
async function fetchRoute(from: Coord, to: Coord): Promise<[number, number][] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.routes?.[0]?.geometry?.coordinates) {
      // GeoJSON [lng, lat] → Leaflet [lat, lng]
      return json.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
    }
  } catch (e) { console.warn('[osrm] failed', e); }
  return null;
}

export function CourierTrackingMap({
  deliveryId, origin, destination, destinationLabel,
  height = '100%', accent = '#2563EB', style,
}: Props) {
  const [lastPing, setLastPing] = useState<Ping | null>(null);
  const [destCoord, setDestCoord] = useState<Coord | null>(destination ?? null);
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

  // Fetch route when both courier and destination available
  useEffect(() => {
    if (!lastPing || !destCoord) { setRouteCoords(null); return; }
    let cancelled = false;
    fetchRoute({ lat: lastPing.lat, lng: lastPing.lng }, destCoord)
      .then(r => { if (!cancelled) setRouteCoords(r); });
    return () => { cancelled = true; };
  }, [lastPing?.lat, lastPing?.lng, destCoord?.lat, destCoord?.lng]);

  // Ping fetch + realtime
  useEffect(() => {
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
  }, [deliveryId]);

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

      // Destination marker — classic red map pin
      if (destCoord) {
        if (destMarkerRef.current) destMarkerRef.current.remove();
        const destIcon = L.divIcon({
          className: 'tracking-dest',
          html: `
            <div style="width:32px;height:42px;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.3))">
              <svg width="32" height="42" viewBox="0 0 32 42" fill="none">
                <path d="M16 0C7.16 0 0 7.16 0 16c0 11.2 16 26 16 26s16-14.8 16-26C32 7.16 24.84 0 16 0z" fill="#D9483B"/>
                <circle cx="16" cy="15" r="7" fill="#fff"/>
              </svg>
            </div>
          `,
          iconSize: [32, 42], iconAnchor: [16, 42],
        });
        destMarkerRef.current = L.marker([destCoord.lat, destCoord.lng], { icon: destIcon }).addTo(mapRef.current);
        if (destinationLabel) {
          destMarkerRef.current.bindPopup(
            `<div style="font:600 12px system-ui;color:#0A0A0A;line-height:1.4;max-width:240px">${destinationLabel.replace(/</g, '&lt;')}</div>`,
            { closeButton: false, offset: [0, -22] as any, autoClose: false },
          );
        }
      }

      // Origin marker (lab — küçük yeşil)
      if (origin) {
        if (originMarkerRef.current) originMarkerRef.current.remove();
        const originIcon = L.divIcon({
          className: 'tracking-origin',
          html: `<div style="width:12px;height:12px;border-radius:50%;background:#10B981;border:3px solid #fff;box-shadow:0 4px 12px rgba(16,185,129,0.4)"></div>`,
          iconSize: [12, 12], iconAnchor: [6, 6],
        });
        originMarkerRef.current = L.marker([origin.lat, origin.lng], { icon: originIcon }).addTo(mapRef.current);
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
          const icon = L.divIcon({
            className: 'tracking-courier',
            html: `
              <div class="scooter-rotor" style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;transform:rotate(${rot}deg);transition:transform 800ms cubic-bezier(0.4,0,0.2,1);filter:drop-shadow(0 6px 10px rgba(0,0,0,0.3))">
                <div style="width:100%;height:100%">${SCOOTER_SVG}</div>
              </div>
            `,
            iconSize: [48, 48], iconAnchor: [24, 24],
          });
          markerRef.current = L.marker([lastPing.lat, lastPing.lng], { icon }).addTo(mapRef.current);
        } else {
          // Update rotation via DOM (CSS transition handles smoothness)
          const el = markerRef.current.getElement();
          const rotor = el?.querySelector('.scooter-rotor') as HTMLElement | null;
          if (rotor) rotor.style.transform = `rotate(${rot}deg)`;

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
        if (origin)    pts.push([origin.lat, origin.lng]);
        if (lastPing)  pts.push([lastPing.lat, lastPing.lng]);
        if (destCoord) pts.push([destCoord.lat, destCoord.lng]);
      }
      if (pts.length >= 2) {
        routeRef.current = L.polyline(pts, {
          color: accent, weight: 4, opacity: 0.85,
          lineCap: 'round', lineJoin: 'round',
          dashArray: rc ? undefined : '6 8',
        }).addTo(mapRef.current);
        if (!didFitRef.current) {
          try {
            mapRef.current.invalidateSize();
            mapRef.current.fitBounds(routeRef.current.getBounds(), {
              paddingTopLeft: [420, 40], paddingBottomRight: [40, 40],
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
  }, [lastPing, destCoord?.lat, destCoord?.lng, origin?.lat, origin?.lng, destinationLabel, accent]);

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
        color: accent, weight: 4, opacity: 0.85,
        lineCap: 'round', lineJoin: 'round',
      }).addTo(mapRef.current);
      if (!didFitRef.current) {
        try {
          mapRef.current.invalidateSize();
          mapRef.current.fitBounds(routeRef.current.getBounds(), {
            paddingTopLeft: [420, 40], paddingBottomRight: [40, 40],
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
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
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
          right: 12,
          ...(isNarrow
            ? { top: 112 }                              // mobile: floating TopActionBar (QR/Bell/Profile) altında
            : { bottom: 16 }),                          // desktop: altta
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
