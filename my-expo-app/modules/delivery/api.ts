// modules/delivery/api.ts
// Kurye & GPS takip — Supabase API katmanı

import { supabase } from '../../core/api/supabase';

// ── Tipler ────────────────────────────────────────────────────────────────────

export type DeliveryStatus = 'atandi' | 'teslim_alindi' | 'yolda' | 'teslim_edildi' | 'iade';

export interface Courier {
  id: string;
  profile_id: string | null;
  lab_id: string;
  full_name: string;
  phone: string | null;
  courier_type: 'iç' | 'dış';
  company_name: string | null;
  tracking_url_template: string | null;
  is_active: boolean;
}

export interface Delivery {
  id: string;
  work_order_id: string;
  courier_id: string;
  status: DeliveryStatus;
  external_tracking_code: string | null;
  assigned_at: string;
  picked_up_at: string | null;
  delivered_at: string | null;
  recipient_name: string | null;
  recipient_note: string | null;
  // join alanları
  courier?: { full_name: string; phone: string | null; courier_type: string };
  work_order?: {
    order_number: string;
    work_type: string;
    delivery_date: string;
    doctor?: { full_name: string | null; clinic_name: string | null };
  };
  last_ping?: GpsPing | null;
}

export interface GpsPing {
  id: number;
  delivery_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  speed_kmh: number | null;
  recorded_at: string;
}

// ── Kurye CRUD ────────────────────────────────────────────────────────────────

export async function fetchCouriers(labId: string) {
  return supabase
    .from('couriers')
    .select('*')
    .eq('lab_id', labId)
    .eq('is_active', true)
    .order('full_name');
}

export async function createCourier(data: {
  lab_id: string;
  full_name: string;
  phone?: string;
  courier_type: 'iç' | 'dış';
  company_name?: string;
  profile_id?: string;
}) {
  return supabase.from('couriers').insert(data).select().single();
}

export async function updateCourier(id: string, data: Partial<Courier>) {
  return supabase.from('couriers').update(data).eq('id', id).select().single();
}

// ── Teslimat İşlemleri ────────────────────────────────────────────────────────

/** Bir iş emrine kurye ata ve teslimat kaydı oluştur */
export async function createDelivery(
  workOrderId: string,
  courierId: string,
  note?: string,
) {
  const { data, error } = await supabase
    .from('deliveries')
    .insert({
      work_order_id: workOrderId,
      courier_id:    courierId,
      status:        'atandi',
    })
    .select()
    .single();

  if (error) return { data: null, error };

  // İş emrini 'kurye_bekleniyor' durumuna geç
  await supabase
    .from('work_orders')
    .update({ status: 'kurye_bekleniyor' })
    .eq('id', workOrderId);

  return { data, error: null };
}

/** Lab'ın tüm aktif teslimatlarını getir */
export async function fetchActiveDeliveries(labId: string) {
  return supabase
    .from('deliveries')
    .select(`
      id, work_order_id, courier_id, status,
      external_tracking_code, assigned_at, picked_up_at, delivered_at,
      recipient_name, recipient_note,
      courier:courier_id ( full_name, phone, courier_type ),
      work_order:work_order_id (
        order_number, work_type, delivery_date,
        doctor:doctor_id ( full_name, clinic_name )
      )
    `)
    .neq('status', 'teslim_edildi')
    .order('assigned_at', { ascending: false });
}

/** Belirli bir iş emrine ait teslimatları getir */
export async function fetchDeliveriesByOrder(workOrderId: string) {
  return supabase
    .from('deliveries')
    .select(`
      id, status, assigned_at, picked_up_at, delivered_at,
      recipient_name, external_tracking_code,
      courier:courier_id ( full_name, phone, courier_type )
    `)
    .eq('work_order_id', workOrderId)
    .order('assigned_at', { ascending: false });
}

/** Tek teslimat detayı (son GPS ping ile) */
export async function fetchDeliveryById(id: string) {
  const [deliveryRes, pingRes] = await Promise.all([
    supabase
      .from('deliveries')
      .select(`
        id, work_order_id, courier_id, status,
        external_tracking_code, assigned_at, picked_up_at, delivered_at,
        recipient_name, recipient_note,
        courier:courier_id ( full_name, phone, courier_type ),
        work_order:work_order_id (
          order_number, work_type, delivery_date,
          doctor:doctor_id ( full_name, clinic_name )
        )
      `)
      .eq('id', id)
      .single(),
    supabase
      .from('gps_pings')
      .select('id, lat, lng, accuracy_m, speed_kmh, recorded_at')
      .eq('delivery_id', id)
      .order('recorded_at', { ascending: false })
      .limit(10),
  ]);

  return {
    delivery: deliveryRes.data as Delivery | null,
    pings:    (pingRes.data ?? []) as GpsPing[],
    error:    deliveryRes.error ?? pingRes.error,
  };
}

/** Kurye kendi aktif teslimatını getirir */
export async function fetchMyCourierDelivery(profileId: string) {
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
    .eq('courier_id',
      // alt-select: profile_id'ye göre courier_id bul
      supabase
        .from('couriers')
        .select('id')
        .eq('profile_id', profileId)
        .limit(1)
        .single() as any,
    )
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data, error };
}

/** Teslimat durumunu güncelle */
export async function updateDeliveryStatus(
  deliveryId: string,
  status: DeliveryStatus,
  extra?: { recipient_name?: string; recipient_note?: string },
) {
  const now = new Date().toISOString();
  const patch: Record<string, any> = { status, ...extra };

  if (status === 'teslim_alindi') patch.picked_up_at = now;
  if (status === 'yolda')         patch.picked_up_at = patch.picked_up_at ?? now;
  if (status === 'teslim_edildi') patch.delivered_at = now;

  const { data, error } = await supabase
    .from('deliveries')
    .update(patch)
    .eq('id', deliveryId)
    .select()
    .single();

  // İş emrini 'kuryede' veya 'teslim_edildi' yap
  if (!error && data) {
    const woStatus = status === 'teslim_edildi' ? 'teslim_edildi'
                   : status === 'yolda'         ? 'kuryede'
                   : undefined;
    if (woStatus) {
      await supabase
        .from('work_orders')
        .update({ status: woStatus })
        .eq('id', data.work_order_id);
    }
  }

  return { data, error };
}

/** GPS ping gönder */
export async function sendGpsPing(
  deliveryId: string,
  lat: number,
  lng: number,
  accuracy_m?: number,
  speed_kmh?: number,
) {
  return supabase.from('gps_pings').insert({
    delivery_id: deliveryId,
    lat, lng,
    accuracy_m:  accuracy_m ?? null,
    speed_kmh:   speed_kmh  ?? null,
  });
}
