// Tarama zamanlaması — konum ve yol süresi servisi (spec 4.6).
// Koordinat: önce saklı (scan_clinic_geo, adres özeti tutuyorsa), değilse web+anahtar varsa Google Geocoder,
// yoksa mevcut ücretsiz geocodeTR (Nominatim; native'de de çalışır). Bulunan koordinat saklanır.
// Süre: web+anahtar varsa Google (trafikli, gün dilimine göre önbellekte); yoksa scanModel tahmini.
import { Platform } from 'react-native';
import { supabase } from '../../core/api/supabase';
import { formatAddress } from '../../core/util/formatAddress';
import { geocodeTR } from '../courier/geocoder';
import { loadGoogleMapsOnce, googleDriveMinutes, googleGeocode } from '../../core/maps/googleMaps';
import { addrHash, clinicAddressLine, labLocalToIso, makeTravelFn, travelKey, type GeoPoint, type TravelFn } from './scanModel';
import type { ScanClinicRef } from './types';

let keyPromise: Promise<string | null> | null = null;

/** Lab'ın Google Maps tarayıcı anahtarı (yalnız web); yoksa null */
export function getMapsKey(): Promise<string | null> {
  if (Platform.OS !== 'web') return Promise.resolve(null);
  if (!keyPromise) {
    keyPromise = Promise.resolve(supabase.rpc('get_maps_browser_key')).then(
      ({ data, error }: any) => (!error && typeof data === 'string' && data.length > 20 ? data : null),
      () => null,
    );
  }
  return keyPromise;
}

async function googleOrNull(): Promise<any | null> {
  const k = await getMapsKey();
  if (!k) return null;
  try { return await loadGoogleMapsOnce(k); } catch { return null; }
}

const lineOf = (raw: string | null) => clinicAddressLine(raw, (r) => formatAddress(r));

async function geocodeRaw(raw: string): Promise<GeoPoint | null> {
  const line = lineOf(raw);
  if (!line) return null;
  const g = await googleOrNull();
  if (g) {
    const c = await googleGeocode(g, line);
    if (c) return c;
  }
  try { return await geocodeTR(raw); } catch { return null; }
}

/** Kliniğin koordinatı; adres değiştiyse yeniden çıkarılıp saklanır. Bulunamazsa (varsa eski) saklı değer */
export async function ensureClinicGeo(c: Pick<ScanClinicRef, 'id' | 'address' | 'geo'>): Promise<GeoPoint | null> {
  const stored = c.geo ? { lat: Number(c.geo.lat), lng: Number(c.geo.lng) } : null;
  const line = lineOf(c.address);
  if (!line) return stored;
  const h = addrHash(line);
  if (stored && c.geo?.addr_hash === h) return stored;
  const p = await geocodeRaw(c.address as string);
  if (p) {
    await supabase.rpc('scan_set_clinic_geo', { p_clinic: c.id, p_lat: p.lat, p_lng: p.lng, p_addr_hash: h });
    return p;
  }
  return stored;
}

const labGeo = new Map<string, GeoPoint | null>();

/** Lab'ın konumu (devam kontrolü koordinatı; boşsa adresten), oturum boyunca bellekte */
export async function ensureLabGeo(labId: string): Promise<GeoPoint | null> {
  if (labGeo.has(labId)) return labGeo.get(labId) ?? null;
  const { data } = await supabase.from('labs')
    .select('location_lat, location_lng, address, street, district, city').eq('id', labId).maybeSingle();
  const d: any = data ?? {};
  let p: GeoPoint | null = d.location_lat != null && d.location_lng != null
    ? { lat: Number(d.location_lat), lng: Number(d.location_lng) } : null;
  if (!p) {
    const raw = [d.street, d.district, d.city].filter(Boolean).join(', ') || d.address || '';
    if (raw) p = await geocodeRaw(raw);
  }
  labGeo.set(labId, p);
  return p;
}

/** Aday klinik için gereken çiftler: LAB→aday ve o günün klinikleriyle iki yön */
export function pairsFor(candidateClinicId: string, dayClinicIds: string[]): [string, string][] {
  const out: [string, string][] = [['LAB', candidateClinicId]];
  for (const x of new Set(dayClinicIds)) {
    if (x === candidateClinicId) continue;
    out.push([x, candidateClinicId], [candidateClinicId, x], ['LAB', x]);
  }
  return out;
}

const SLOT_SAMPLE: [('sabah' | 'ogle' | 'aksam'), number][] = [['sabah', 600], ['ogle', 780], ['aksam', 1020]];
const googleCache: Record<string, number> = {};

/** Senkron TravelFn: Google sonuçları (web+anahtar) önceden çekilir; olmayan çiftlerde tahmin ya da null */
export async function buildTravelFn(points: Record<string, GeoPoint | null>, pairs: [string, string][], date: string, tz: string): Promise<TravelFn> {
  const g = await googleOrNull();
  if (g) {
    const jobs: Promise<void>[] = [];
    for (const [from, to] of pairs) {
      const a = points[from];
      const b = points[to];
      if (from === to || !a || !b) continue;
      for (const [slot, min] of SLOT_SAMPLE) {
        const k = travelKey(from, to, slot);
        if (k in googleCache) continue;
        jobs.push(googleDriveMinutes(g, a, b, new Date(labLocalToIso(date, min, tz)))
          .then((m) => { if (m != null) googleCache[k] = m; }));
      }
    }
    await Promise.all(jobs);
  }
  return makeTravelFn(points, googleCache);
}
