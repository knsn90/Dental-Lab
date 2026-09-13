// modules/courier/api.ts — Kurye paneli için API yardımcıları
import { supabase } from '../../core/api/supabase';

export interface CourierDelivery {
  id:                   string;
  work_order_id:        string;
  status:               'beklemede' | 'teslim_alindi' | 'yolda' | 'teslim_edildi' | 'iptal' | 'atandi';
  assigned_at:          string;
  picked_up_at:         string | null;
  delivered_at:         string | null;
  destination_name:     string | null;
  destination_address:  string | null;
  destination_phone:    string | null;
  notes:                string | null;
  // Bacak yönü/amacı — kurye akışı (al → bırak) için
  purpose:              string | null;   // teslimat | model_alma | eksik_parca | diger
  direction:            string | null;   // lab_to_clinic | clinic_to_lab
  origin_name:          string | null;   // alım noktası (lab veya klinik)
  origin_address:       string | null;
  mode:                 string | null;   // internal | external
  // joined
  order_number?:        string | null;
  patient_name?:        string | null;
}

/** Kurye için atanmış tüm teslimatları getirir. */
export async function fetchMyDeliveries(courierId: string): Promise<CourierDelivery[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select(`
      id, work_order_id, status, assigned_at, picked_up_at, delivered_at,
      destination_name, destination_address, destination_phone, notes,
      purpose, direction, origin_name, origin_address, mode,
      work_order:work_orders!work_order_id(order_number, patient_name)
    `)
    .eq('courier_id', courierId)
    .order('assigned_at', { ascending: false });
  if (error) { console.error('[courier] fetchMyDeliveries', error); return []; }
  return (data ?? []).map((r: any) => ({
    id:                  r.id,
    work_order_id:       r.work_order_id,
    status:              r.status,
    assigned_at:         r.assigned_at,
    picked_up_at:        r.picked_up_at,
    delivered_at:        r.delivered_at,
    destination_name:    r.destination_name,
    destination_address: r.destination_address,
    destination_phone:   r.destination_phone,
    notes:               r.notes,
    purpose:             r.purpose,
    direction:           r.direction,
    origin_name:         r.origin_name,
    origin_address:      r.origin_address,
    mode:                r.mode,
    order_number:        r.work_order?.order_number ?? null,
    patient_name:        r.work_order?.patient_name ?? null,
  }));
}

/** GPS noktası kaydet. */
export async function postGpsPing(deliveryId: string, lat: number, lng: number, accuracy?: number) {
  const { error } = await supabase
    .from('gps_pings')
    .insert({ delivery_id: deliveryId, lat, lng, accuracy_m: accuracy ?? null });
  if (error) console.warn('[courier] gps ping', error.message);
}

/** Toplu rota: kuryenin TAŞIDIĞI/yolda tüm teslimatların id'leri (canlı konum bunların hepsine yazılır). */
export async function fetchActiveDeliveryIds(courierId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('id')
    .eq('courier_id', courierId)
    .in('status', ['teslim_alindi', 'yolda']);
  if (error) { console.warn('[courier] active ids', error.message); return []; }
  return (data ?? []).map((r: any) => r.id);
}

/** Tek konumu birden çok aktif teslimata ping'ler (toplu rota — kurye tek nokta, işler çok). */
export async function postGpsPingMany(deliveryIds: string[], lat: number, lng: number, accuracy?: number) {
  if (!deliveryIds.length) return;
  const rows = deliveryIds.map(id => ({ delivery_id: id, lat, lng, accuracy_m: accuracy ?? null }));
  const { error } = await supabase.from('gps_pings').insert(rows);
  if (error) console.warn('[courier] gps ping many', error.message);
}
