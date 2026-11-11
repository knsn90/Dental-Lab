import { supabase } from '../../../core/api/supabase';
import { fetchAllPages } from './fetchAllPages';
import { fetchFromIso, monthKeyOfIso, type MonthKey } from './months';
import type { RawOrder } from './aggregate';

export type Refs = {
  clinicByDoctor: Map<string, string>;
  clinicName: Map<string, string>;
  unitByServiceName: Map<string, string | null>;
  firstMonth: MonthKey | null;
};

/** Seçili ayın geri yıl penceresindeki siparişler (sayfalı). Hata fırlatır. */
export async function fetchWorkStatsWindow(labId: string, selected: MonthKey): Promise<RawOrder[]> {
  const fromIso = fetchFromIso(selected);
  return fetchAllPages<RawOrder>((from, to) =>
    supabase
      .from('work_orders')
      .select('id, order_number, work_type, status, created_at, tooth_numbers, doctor_id')
      .eq('lab_id', labId)
      .gte('created_at', fromIso)
      .order('created_at')
      .order('id')
      .range(from, to) as any,
  );
}

/** Klinik/hekim/hizmet-birimi eşlemleri + lab'ın ilk sipariş ayı. Hata fırlatır. */
export async function fetchWorkStatsRefs(labId: string): Promise<Refs> {
  const [doctors, clinics, services, first] = await Promise.all([
    fetchAllPages<{ id: string; clinic_id: string | null }>((from, to) =>
      supabase.from('doctors').select('id, clinic_id').eq('lab_id', labId).order('id').range(from, to) as any),
    fetchAllPages<{ id: string; name: string | null }>((from, to) =>
      supabase.from('clinics').select('id, name').eq('lab_id', labId).order('id').range(from, to) as any),
    fetchAllPages<{ name: string | null; unit: string | null }>((from, to) =>
      supabase.from('lab_services').select('name, unit').eq('lab_id', labId).order('name').range(from, to) as any),
    supabase.from('work_orders').select('created_at').eq('lab_id', labId)
      .order('created_at', { ascending: true }).limit(1),
  ]);
  if (first.error) throw first.error;

  const clinicByDoctor = new Map<string, string>();
  for (const d of doctors) if (d.clinic_id) clinicByDoctor.set(d.id, d.clinic_id);
  const clinicName = new Map<string, string>();
  for (const c of clinics) clinicName.set(c.id, c.name ?? '');
  // Anahtar Admin Özet kartıyla aynı: trim + tr-TR küçük harf.
  const unitByServiceName = new Map<string, string | null>();
  for (const s of services) {
    unitByServiceName.set(String(s.name ?? '').trim().toLocaleLowerCase('tr-TR'), s.unit ?? null);
  }
  const firstMonth = monthKeyOfIso((first.data as any)?.[0]?.created_at ?? null);
  return { clinicByDoctor, clinicName, unitByServiceName, firstMonth };
}
