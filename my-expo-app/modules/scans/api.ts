// Tarama randevuları — Supabase okuma + RPC sarmalayıcıları.
// Yazmalar yalnız DEFINER RPC'lerle (supabase/migrations/20261028141000_tarama_kayit_rpc.sql);
// sunucu hata metinleri Türkçe kaynak, burada autoT ile çevrilir.
import { supabase } from '../../core/api/supabase';
import { autoT } from '../../core/i18n/autoTranslate';
import { parseScanSettings, type Decision, type ScanSettings } from './scanModel';
import type {
  ScanAppointmentRow, ScanServiceOption, ScanDeviceOption, ScanTechnicianOption,
  SaveAppointmentInput, SavePatientInput, ScanResult,
} from './types';

const APPT_SELECT = `
  id, lab_id, clinic_id, doctor_id, starts_at, duration_min, technician_id, status, source, note,
  cancel_reason, done_at, done_note, created_by, created_at, intent, intended_order_id,
  intended_order:work_orders!scan_appointments_intended_order_id_fkey(id, order_number),
  clinic:clinics(id, name, address, geo:scan_clinic_geo(lat, lng, addr_hash)),
  technician:profiles!scan_appointments_technician_id_fkey(id, full_name),
  services:scan_appointment_services(service_id, equipment_id, service:lab_services(name, scan_kind)),
  patients:scan_patients(id, appointment_id, patient_name, note, work_order_id, status, decision, decided_at,
    charges:scan_patient_charges(id, service_id, status, bill_with_order, price, currency, invoice_item_id))
`;

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

function normalize(r: any): ScanAppointmentRow {
  const clinic = one<any>(r.clinic);
  const geo = clinic ? one<any>(clinic.geo) : null;
  return {
    ...r,
    clinic: clinic ? {
      id: clinic.id, name: clinic.name ?? '', address: clinic.address ?? null,
      geo: geo ? { lat: Number(geo.lat), lng: Number(geo.lng), addr_hash: geo.addr_hash ?? null } : null,
    } : null,
    technician: one<any>(r.technician),
    intended_order: one<any>(r.intended_order),
    services: (r.services ?? []).map((s: any) => {
      const svc = one<any>(s.service);
      return { service_id: s.service_id, equipment_id: s.equipment_id ?? null, name: svc?.name ?? '', scan_kind: svc?.scan_kind ?? null };
    }),
    patients: (r.patients ?? [])
      .map((p: any) => ({ ...p, charges: p.charges ?? [] }))
      .sort((a: any, b: any) => String(a.id).localeCompare(String(b.id))),
  };
}

/** [fromIso, toIso) aralığındaki iptal edilmemiş randevular, saat sırasıyla */
export async function fetchScanDay(labId: string, fromIso: string, toIso: string): Promise<ScanAppointmentRow[]> {
  const { data, error } = await supabase.from('scan_appointments').select(APPT_SELECT)
    .eq('lab_id', labId).gte('starts_at', fromIso).lt('starts_at', toIso).neq('status', 'iptal')
    .order('starts_at', { ascending: true });
  if (error || !data) return [];
  return (data as any[]).map(normalize);
}

export async function fetchScanAppointment(id: string): Promise<ScanAppointmentRow | null> {
  const { data, error } = await supabase.from('scan_appointments').select(APPT_SELECT).eq('id', id).maybeSingle();
  if (error || !data) return null;
  return normalize(data);
}

/** Karar bekleyenler: "yapıldı" denmiş randevular + saati geçmiş ama işaretlenmemiş olanlar */
export async function fetchPendingDecisions(labId: string): Promise<ScanAppointmentRow[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase.from('scan_appointments').select(APPT_SELECT)
    .eq('lab_id', labId)
    .or(`status.eq.yapildi,and(status.eq.planlandi,starts_at.lt.${nowIso})`)
    .order('starts_at', { ascending: true });
  if (error || !data) return [];
  return (data as any[]).map(normalize);
}

export async function fetchScanSettings(labId: string): Promise<ScanSettings> {
  const { data } = await supabase.from('lab_settings')
    .select('scan_hours_start, scan_hours_end, scan_workdays, scan_default_minutes, scan_buffer_minutes')
    .eq('lab_id', labId).maybeSingle();
  return parseScanSettings(data ?? null);
}

/** lab_settings'teki teknisyen havuzu ve bildirim saatleri (ayarlar ekranı ve öneri için) */
export async function fetchScanPool(labId: string): Promise<string[]> {
  const { data } = await supabase.from('lab_settings').select('scan_technician_ids').eq('lab_id', labId).maybeSingle();
  return Array.isArray((data as any)?.scan_technician_ids) ? (data as any).scan_technician_ids : [];
}

export async function fetchScanServices(labId: string): Promise<ScanServiceOption[]> {
  const { data } = await supabase.from('lab_services')
    .select('id, name, scan_kind, scan_free_if_order, currency')
    .eq('lab_id', labId).not('scan_kind', 'is', null).eq('is_active', true).order('name');
  return (data ?? []) as ScanServiceOption[];
}

export async function fetchScanDevices(labId: string): Promise<ScanDeviceOption[]> {
  const { data } = await supabase.from('equipment').select('id, name, scan_kind')
    .eq('lab_id', labId).not('scan_kind', 'is', null).order('name');
  return (data ?? []).map((d: any) => ({ id: d.id, name: d.name ?? '', kind: d.scan_kind }));
}

/** Randevuya gidebilecek teknisyenler: havuz boşsa lab'ın bütün aktif teknisyenleri */
export async function fetchScanTechnicians(labId: string, poolIds: string[]): Promise<ScanTechnicianOption[]> {
  let q = supabase.from('profiles').select('id, full_name').eq('lab_id', labId).eq('user_type', 'lab')
    .not('is_active', 'is', false);
  q = poolIds.length ? q.in('id', poolIds) : q.eq('role', 'technician');
  const { data } = await q.order('full_name');
  return (data ?? []).map((p: any) => ({ id: p.id, name: p.full_name ?? '' }));
}

// ── RPC sarmalayıcıları ──
async function call(fn: string, args: Record<string, unknown>): Promise<ScanResult> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: autoT(error.message || 'İşlem tamamlanamadı') };
  return { ok: true, id: typeof data === 'string' ? data : undefined };
}

export function saveAppointment(i: SaveAppointmentInput): Promise<ScanResult> {
  return call('scan_appt_save', {
    p_id: i.id, p_clinic: i.clinicId, p_doctor: i.doctorId, p_starts_at: i.startsAt, p_minutes: i.minutes,
    p_technician: i.technicianId, p_source: i.source, p_note: i.note, p_services: i.services,
    p_intent: i.intent, p_order: i.intent === 'mevcut_siparis' ? i.orderId : null,
  });
}

export function savePatient(i: SavePatientInput): Promise<ScanResult> {
  return call('scan_patient_save', {
    p_id: i.id, p_appointment: i.appointmentId, p_patient_name: i.patientName,
    p_service_ids: i.serviceIds, p_note: i.note, p_work_order: i.workOrderId,
  });
}

export const deletePatient = (id: string) => call('scan_patient_delete', { p_id: id });
export const markDone = (id: string, note: string | null) => call('scan_appt_mark_done', { p_id: id, p_note: note });
export const undoDone = (id: string) => call('scan_appt_undo_done', { p_id: id });
export const cancelAppointment = (id: string, reason: string) => call('scan_appt_cancel', { p_id: id, p_reason: reason });

// ── Karar ve faturalama (supabase/migrations/20261028142000_tarama_karar_fatura.sql) ──
export async function decide(
  patientIds: string[], decision: Decision, workOrderId: string | null,
): Promise<{ ok: boolean; invoices?: string[]; pooled?: number; free?: number; error?: string }> {
  const { data, error } = await supabase.rpc('scan_decide', {
    p_patient_ids: patientIds, p_decision: decision, p_work_order: workOrderId,
  });
  if (error) return { ok: false, error: autoT(error.message || 'İşlem tamamlanamadı') };
  const d: any = data ?? {};
  return { ok: true, invoices: Array.isArray(d.invoices) ? d.invoices : [], pooled: Number(d.pooled) || 0, free: Number(d.free) || 0 };
}

export const undoDecision = (patientId: string) => call('scan_undo_decision', { p_patient: patientId });

/** Aylık faturalanan kliniğin "yalnız tarama" havuzunu taslak faturaya dönüştürür (para birimi başına bir) */
export async function createPoolInvoice(clinicId: string): Promise<{ ok: boolean; invoices?: string[]; error?: string }> {
  const { data, error } = await supabase.rpc('scan_create_pool_invoice', { p_clinic: clinicId });
  if (error) return { ok: false, error: autoT(error.message || 'İşlem tamamlanamadı') };
  return { ok: true, invoices: Array.isArray(data) ? (data as string[]) : [] };
}

// ── Tarama dosyaları (scan-files: <lab>/<randevu>/<hasta>/<dosya>) ──
export const SCAN_BUCKET = 'scan-files';
const SIGNED_TTL = 60 * 60;

export type ScanAsset = { uri: string; name: string; mimeType?: string | null; blob?: Blob | null };

function safeName(name: string): string {
  const base = name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-80);
  return base || 'dosya';
}

export async function uploadScanFile(
  labId: string, apptId: string, patientId: string, asset: ScanAsset,
): Promise<{ path: string | null; error: string | null }> {
  const path = `${labId}/${apptId}/${patientId}/${Date.now()}-${safeName(asset.name)}`;
  const contentType = asset.mimeType || 'application/octet-stream';
  let body: any = asset.blob ?? null;
  if (!body) {
    if (typeof (globalThis as any).document !== 'undefined' && /^(blob:|data:|https?:)/.test(asset.uri)) {
      body = await (await fetch(asset.uri)).blob();
    } else {
      const fd = new FormData();
      fd.append('file', { uri: asset.uri, name: safeName(asset.name), type: contentType } as any);
      body = fd;
    }
  }
  const { error } = await supabase.storage.from(SCAN_BUCKET).upload(path, body, { contentType, upsert: false });
  if (error) return { path: null, error: autoT(error.message || 'İşlem tamamlanamadı') };
  return { path, error: null };
}

export async function listScanFiles(
  labId: string, apptId: string, patientId: string,
): Promise<{ path: string; name: string; size: number }[]> {
  const dir = `${labId}/${apptId}/${patientId}`;
  const { data } = await supabase.storage.from(SCAN_BUCKET).list(dir, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  return (data ?? []).filter((f: any) => f.name && f.id).map((f: any) => ({
    path: `${dir}/${f.name}`,
    name: String(f.name).replace(/^\d+-/, ''),
    size: Number(f.metadata?.size) || 0,
  }));
}

export async function signScanFiles(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(SCAN_BUCKET).createSignedUrls(paths, SIGNED_TTL);
  const out: Record<string, string> = {};
  (data ?? []).forEach((d: any, i: number) => { if (d.signedUrl) out[d.path ?? paths[i]] = d.signedUrl; });
  return out;
}

export interface ScanFileItem {
  id: string;
  work_order_id: string;
  /** `scan/<bucket yolu>` — work-order-photos ve chat/ yollarıyla çakışmasın diye önekli */
  storage_path: string;
  scan_path: string;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
  tooth_number: null;
  __scan: true;
}

/** Siparişe bağlı taramaların dosyaları (Ekler listesi için; sohbet eklerinin kalıbı) */
export async function fetchScanFilesForOrder(
  workOrderId: string,
): Promise<{ photos: ScanFileItem[]; urls: Record<string, string> }> {
  // Klasörler DEFINER RPC'den: siparişi okuyabilen klinik/hekim de (kararla bağlanmış) taramayı bulur
  // (scan_patients RLS'i kliniğe kapalı — 20261028147000)
  const { data: dirs } = await supabase.rpc('scan_order_file_dirs', { p_order: workOrderId });
  if (!Array.isArray(dirs) || !dirs.length) return { photos: [], urls: {} };
  const photos: ScanFileItem[] = [];
  for (const dir of dirs as string[]) {
    const { data } = await supabase.storage.from(SCAN_BUCKET).list(dir, { limit: 100 });
    for (const f of (data ?? []) as any[]) {
      if (!f.id || !f.name) continue;
      const path = `${dir}/${f.name}`;
      photos.push({
        id: `scan-${f.id}`, work_order_id: workOrderId, storage_path: `scan/${path}`, scan_path: path,
        caption: String(f.name).replace(/^\d+-/, ''), uploaded_by: f.owner ?? null,
        created_at: f.created_at ?? new Date().toISOString(), tooth_number: null, __scan: true,
      });
    }
  }
  if (!photos.length) return { photos: [], urls: {} };
  const signed = await signScanFiles(photos.map((p) => p.scan_path));
  const urls: Record<string, string> = {};
  for (const p of photos) if (signed[p.scan_path]) urls[p.storage_path] = signed[p.scan_path];
  return { photos, urls };
}

// ── Form katalogları ──
export interface ScanClinicOption { id: string; name: string; address: string | null; geo: { lat: number; lng: number; addr_hash: string | null } | null }

/** Siparişe bağlı tarama randevuları (sipariş detayındaki çip) — RLS lab dışına boş döner */
export interface OrderScanRef { appointmentId: string; startsAt: string; services: string[] }
export async function fetchOrderScans(workOrderId: string): Promise<OrderScanRef[]> {
  const { data } = await supabase.from('scan_patients')
    .select('appointment:scan_appointments(id, starts_at, status, services:scan_appointment_services(service:lab_services(name)))')
    .eq('work_order_id', workOrderId);
  const byId = new Map<string, OrderScanRef>();
  for (const r of (data ?? []) as any[]) {
    const a = one<any>(r.appointment);
    if (!a || a.status === 'iptal' || byId.has(a.id)) continue;
    const names = (a.services ?? []).map((x: any) => one<any>(x.service)?.name).filter(Boolean) as string[];
    byId.set(a.id, { appointmentId: a.id, startsAt: a.starts_at, services: Array.from(new Set(names)) });
  }
  return [...byId.values()].sort((x, y) => x.startsAt.localeCompare(y.startsAt));
}

export async function fetchScanClinics(labId: string): Promise<ScanClinicOption[]> {
  const { data } = await supabase.from('clinics')
    .select('id, name, address, geo:scan_clinic_geo(lat, lng, addr_hash)')
    .eq('lab_id', labId).eq('is_active', true).order('name');
  return (data ?? []).map((c: any) => {
    const g = one<any>(c.geo);
    return { id: c.id, name: c.name ?? '', address: c.address ?? null,
      geo: g ? { lat: Number(g.lat), lng: Number(g.lng), addr_hash: g.addr_hash ?? null } : null };
  });
}

export async function fetchClinicDoctors(clinicId: string): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase.from('doctors').select('id, full_name')
    .eq('clinic_id', clinicId).eq('is_active', true).order('full_name');
  return (data ?? []).map((d: any) => ({ id: d.id, name: d.full_name ?? '' }));
}

export async function fetchLabTz(labId: string): Promise<string> {
  const { data } = await supabase.from('labs').select('timezone').eq('id', labId).maybeSingle();
  return ((data as any)?.timezone as string) || 'Europe/Istanbul';
}

// ── Karar penceresi ──
export interface ClinicOrderOption { id: string; order_number: string | null; patient_name: string | null; work_type: string | null; created_at: string }

/** Kliniğin iptal edilmemiş siparişleri (hekim + klinik kullanıcıları üzerinden), en yenisi önce */
export async function fetchClinicOrders(labId: string, clinicId: string): Promise<ClinicOrderOption[]> {
  const [{ data: docs }, { data: profs }] = await Promise.all([
    supabase.from('doctors').select('id').eq('clinic_id', clinicId),
    supabase.from('profiles').select('id').eq('clinic_id', clinicId),
  ]);
  const ids = [...(docs ?? []), ...(profs ?? [])].map((x: any) => x.id);
  if (!ids.length) return [];
  const { data } = await supabase.from('work_orders')
    .select('id, order_number, patient_name, work_type, created_at')
    .eq('lab_id', labId).in('doctor_id', ids).neq('status', 'iptal')
    .order('created_at', { ascending: false }).limit(40);
  return (data ?? []) as ClinicOrderOption[];
}

/** Fiyat önizlemesi: sipariş kalemleriyle aynı kural (klinik fiyatı → kampanya → katalog) */
export async function previewPrice(labId: string, serviceId: string, clinicId: string): Promise<{ price: number; currency: string } | null> {
  const { data, error } = await supabase.rpc('resolve_item_price', { p_lab_id: labId, p_service_id: serviceId, p_clinic_id: clinicId });
  const r: any = Array.isArray(data) ? data[0] : data;
  if (error || !r) return null;
  return { price: Number(r.price) || 0, currency: String(r.currency || 'TRY') };
}

export async function fetchClinicBillingMode(clinicId: string): Promise<'per_order' | 'monthly_bulk'> {
  const { data } = await supabase.from('clinics').select('billing_mode').eq('id', clinicId).maybeSingle();
  return (data as any)?.billing_mode === 'per_order' ? 'per_order' : 'monthly_bulk';
}

/** Aylık faturalanacak "yalnız tarama" havuzu, klinik başına (adet + para birimine göre toplam) */
export async function fetchPoolSummary(labId: string): Promise<{ clinicId: string; clinicName: string; count: number; totals: Record<string, number> }[]> {
  const { data } = await supabase.from('scan_patient_charges')
    .select('price, currency, patient:scan_patients(appointment:scan_appointments(clinic_id, clinic:clinics(name)))')
    .eq('lab_id', labId).eq('status', 'ucretli').eq('bill_with_order', false).is('invoice_item_id', null);
  const m = new Map<string, { clinicId: string; clinicName: string; count: number; totals: Record<string, number> }>();
  for (const c of (data ?? []) as any[]) {
    const ap = one<any>(one<any>(c.patient)?.appointment);
    if (!ap?.clinic_id) continue;
    const e = m.get(ap.clinic_id) ?? { clinicId: ap.clinic_id, clinicName: one<any>(ap.clinic)?.name ?? '', count: 0, totals: {} as Record<string, number> };
    e.count += 1;
    const cur = String(c.currency || 'TRY');
    e.totals[cur] = (e.totals[cur] ?? 0) + (Number(c.price) || 0);
    m.set(ap.clinic_id, e);
  }
  return Array.from(m.values()).sort((a, b) => a.clinicName.localeCompare(b.clinicName, 'tr'));
}
