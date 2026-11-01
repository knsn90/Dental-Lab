// Google Maps JS — web'de yol süresi ve adres → koordinat (tarama zamanlaması).
// Kurye haritasının yükleyicisinden (modules/courier/CourierTrackingMapGoogle.tsx) bağımsızdır, ona dokunmaz:
// sayfada Maps zaten yüklüyse ya da başka bir <script> yüklüyorsa onu bekler, ikinci kez yüklemez.
import { Platform } from 'react-native';
import { localeTag } from '../i18n';

export interface GeoCoord { lat: number; lng: number }

let loading: Promise<any> | null = null;

function waitForGoogle(timeoutMs: number): Promise<any> {
  const w: any = globalThis as any;
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (w.google?.maps) return resolve(w.google);
      if (Date.now() - t0 > timeoutMs) return reject(new Error('maps timeout'));
      setTimeout(tick, 200);
    };
    tick();
  });
}

export function loadGoogleMapsOnce(key: string): Promise<any> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return Promise.reject(new Error('web-only'));
  const w: any = globalThis as any;
  if (w.google?.maps) return Promise.resolve(w.google);
  if (loading) return loading;
  const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
  if (existing) {
    loading = waitForGoogle(10000).catch((e) => { loading = null; throw e; });
    return loading;
  }
  loading = new Promise((resolve, reject) => {
    const cb = '__simanScanMapsReady';
    w[cb] = () => resolve(w.google);
    const s = document.createElement('script');
    const lang = (localeTag() || 'tr').split('-')[0];
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=${lang}&loading=async&callback=${cb}`;
    s.async = true;
    s.onerror = () => { loading = null; reject(new Error('maps load')); };
    document.head.appendChild(s);
  });
  return loading;
}

async function lib(g: any, name: string): Promise<any> {
  return typeof g?.maps?.importLibrary === 'function' ? g.maps.importLibrary(name) : g.maps;
}

/** Trafik dahil sürüş süresi (dk); geçmiş bir an verilirse "şimdi" kullanılır. Hata/sonuçsuz → null */
export async function googleDriveMinutes(g: any, from: GeoCoord, to: GeoCoord, departAt: Date): Promise<number | null> {
  try {
    const routes = await lib(g, 'routes');
    const svc = new routes.DistanceMatrixService();
    const when = departAt.getTime() > Date.now() + 60000 ? departAt : new Date(Date.now() + 60000);
    const res = await svc.getDistanceMatrix({
      origins: [from], destinations: [to], travelMode: 'DRIVING',
      drivingOptions: { departureTime: when },
    });
    const el = res?.rows?.[0]?.elements?.[0];
    if (!el || el.status !== 'OK') return null;
    const sec = el.duration_in_traffic?.value ?? el.duration?.value;
    return typeof sec === 'number' ? Math.ceil(sec / 60) : null;
  } catch {
    return null;
  }
}

/** Tek satırlık adres → koordinat; bulunamazsa null */
export async function googleGeocode(g: any, line: string): Promise<GeoCoord | null> {
  try {
    const geo = await lib(g, 'geocoding');
    const r = await new geo.Geocoder().geocode({ address: line });
    const loc = r?.results?.[0]?.geometry?.location;
    return loc ? { lat: Number(loc.lat()), lng: Number(loc.lng()) } : null;
  } catch {
    return null;
  }
}
