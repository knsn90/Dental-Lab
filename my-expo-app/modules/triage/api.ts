// modules/triage/api.ts
// Yeni Plan Önizleme & Onay ekranının veri katmanı.
// MEVCUT şemayı/RPC'yi kullanır — backend'e dokunmaz (Faz 1, additive).
//   • lab_stations  → istasyon havuzu
//   • workflow_templates / case_type_stage_presets → şablon (sıralı station_ids)
//   • profiles (lab) → atanabilir teknisyenler
//   • order_stages (aktif WIP) → teknisyen iş yükü (gerçek)
//   • triage_order(p_order_id, p_lines, p_first_tech_id) → kaydet (mevcut RPC)

import { supabase } from '../../core/api/supabase';
import { fetchStationSkillsMap } from '../../core/api/stationSkills';
import { getStationKind, type StationKind } from '../orders/stations/registry';

export interface TriageStation {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  sequence_hint: number | null;
  is_critical: boolean;
  applicable_work_types: string[] | null;
  default_technician_id: string | null;
  /** Bu istasyonda çalışmak için gereken yetkinlikler (boş = herkes uygun) */
  required_skills: string[];
  /** Faz 3: aşamanın varsayılan tahmini işlem süresi (dakika) */
  est_duration_min: number | null;
  /** Faz 3: aşamanın hedef teslim süresi / SLA (saat) */
  sla_hours: number | null;
}

export interface TriageTech {
  id: string;
  full_name: string;
  role: string | null;
  /** Pasif personel atanmaz / yetkinlik listesinde görünmez. undefined = bilinmiyor (engelleme). */
  is_active?: boolean | null;
  /** Aktif iş yükü — devam eden order_stages sayısı */
  load: number;
  /** Teknisyenin yetkinlik etiketleri (eski serbest model — sadece görüntü) */
  skills: string[];
  /** Yetkili olduğu istasyon id'leri (user_station_skills — kanonik). */
  stationIds?: string[];
  /** Günlük eşzamanlı iş kapasitesi (yük çubuğu referansı); null = varsayılan */
  capacity: number | null;
}

export interface TriageTemplate {
  id: string;
  name: string;
  case_types: string[] | null;
  station_ids: string[];
  is_default: boolean;
  source: 'workflow' | 'preset';
}

export interface TriageOrderSummary {
  order_number: string | null;
  patient_name: string | null;
  patient_gender: string | null;
  work_type: string | null;
  tooth_numbers: number[] | null;
  shade: string | null;
  model_type: string | null;
  machine_type: string | null;
  is_urgent: boolean;
  delivery_date: string | null;
  created_at: string | null;
  notes: string | null;
  lab_notes: string | null;
  doctor_id: string | null;
  measurement_type: 'manual' | 'digital' | null;
}

export interface TriageFile {
  id: string;
  name: string;
  storage_path: string;
  signed_url: string | null;
  is3d: boolean;
  isImage: boolean;
}

export interface TriageOrderItem {
  id: string;
  name: string;
  quantity: number;
  /** Bu kalemin uygulandığı dişler (FDI) — diş↔işlem şeması için */
  tooth_numbers: number[] | null;
}

export interface TriageMessage {
  id: string;
  content: string | null;
  created_at: string;
  attachment_name: string | null;
  attachment_url: string | null;
  sender_name: string | null;
}

export interface TriageData {
  order: TriageOrderSummary | null;
  stations: TriageStation[];
  technicians: TriageTech[];
  templates: TriageTemplate[];
  files: TriageFile[];
  messages: TriageMessage[];
  doctorName: string | null;
  clinicName: string | null;
  /** Sipariş kalemleri — diş↔işlem şeması için (her kalem hangi dişlere uygulanır) */
  items: TriageOrderItem[];
}

// Teknisyenin "aktif yük" sayılan stage durumları (tamamlanan/atlanan hariç)
const ACTIVE_STAGE_STATUSES = [
  'aktif', 'bekliyor', 'durakladi', 'makine_bekliyor', 'onay_bekliyor', 'bloklu', 'yeniden',
];

/**
 * Bir work-order dosyası için TAZE imzalı URL üretir (önizleme tıklamasında).
 * Sayfa açılışındaki URL süresi dolmuş olabilir; tıklama anında yeniden imzalanır.
 */
export async function signWorkOrderFile(storagePath: string, expiresInSec = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from('work-order-photos').createSignedUrl(storagePath, expiresInSec);
  return data?.signedUrl ?? null;
}

export async function fetchTriageData(orderId: string, labId: string): Promise<TriageData> {
  // 1) Sipariş
  const { data: ord } = await supabase
    .from('work_orders')
    .select('order_number, patient_name, patient_gender, work_type, tooth_numbers, shade, model_type, machine_type, is_urgent, delivery_date, created_at, notes, lab_notes, doctor_id, measurement_type')
    .eq('id', orderId)
    .maybeSingle();

  // 2) İstasyonlar · teknisyenler · şablonlar (paralel)
  const [stRes, techRes, wfRes, presetRes] = await Promise.all([
    supabase
      .from('lab_stations')
      .select('id, name, color, icon, sequence_hint, is_critical, applicable_work_types, default_technician_id, required_skills, est_duration_min, sla_hours')
      .eq('is_active', true)
      .order('sequence_hint', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name, role, skills, daily_capacity, is_active')
      .eq('lab_id', labId)
      .eq('user_type', 'lab')
      .eq('approval_status', 'approved')
      .order('full_name'),
    supabase
      .from('workflow_templates')
      .select('id, name, case_types, station_ids, is_default')
      .eq('lab_id', labId)
      .eq('is_active', true),
    supabase
      .from('case_type_stage_presets')
      .select('id, case_type, case_type_label, station_ids, is_default')
      .eq('lab_id', labId),
  ]);

  const stations: TriageStation[] = ((stRes.data ?? []) as any[]).map((s) => ({
    id: s.id, name: s.name, color: s.color, icon: s.icon, sequence_hint: s.sequence_hint,
    is_critical: !!s.is_critical, applicable_work_types: s.applicable_work_types,
    default_technician_id: s.default_technician_id, required_skills: s.required_skills ?? [],
    est_duration_min: s.est_duration_min ?? null, sla_hours: s.sla_hours ?? null,
  }));

  // 3) Teknisyen iş yükü — aktif order_stages sayısı
  const techIds = (techRes.data ?? []).map((t: any) => t.id);
  const loadMap = new Map<string, number>();
  if (techIds.length > 0) {
    const { data: wip } = await supabase
      .from('order_stages')
      .select('technician_id')
      .in('technician_id', techIds)
      .in('status', ACTIVE_STAGE_STATUSES);
    (wip ?? []).forEach((r: any) => {
      if (r.technician_id) loadMap.set(r.technician_id, (loadMap.get(r.technician_id) ?? 0) + 1);
    });
  }
  const stMap = await fetchStationSkillsMap(); // user_id → Set<station_id>
  const technicians: TriageTech[] = (techRes.data ?? []).map((t: any) => ({
    id: t.id, full_name: t.full_name, role: t.role, is_active: t.is_active, load: loadMap.get(t.id) ?? 0,
    skills: t.skills ?? [], stationIds: Array.from(stMap.get(t.id) ?? []),
    capacity: t.daily_capacity ?? null,
  }));

  // 4) Şablonları birleştir (workflow_templates önde)
  const templates: TriageTemplate[] = [
    ...((wfRes.data ?? []) as any[]).map((w): TriageTemplate => ({
      id: w.id, name: w.name, case_types: w.case_types ?? null,
      station_ids: w.station_ids ?? [], is_default: !!w.is_default, source: 'workflow',
    })),
    ...((presetRes.data ?? []) as any[]).map((p): TriageTemplate => ({
      id: p.id, name: p.case_type_label ?? p.case_type, case_types: p.case_type ? [p.case_type] : null,
      station_ids: p.station_ids ?? [], is_default: !!p.is_default, source: 'preset',
    })),
  ];

  // 5) Hekim & klinik adı (polymorphic: doctors VEYA profiles)
  let doctorName: string | null = null, clinicName: string | null = null;
  if (ord?.doctor_id) {
    const [d, p] = await Promise.all([
      supabase.from('doctors').select('full_name, clinic:clinics(name)').eq('id', ord.doctor_id).maybeSingle(),
      supabase.from('profiles').select('full_name, clinic_name').eq('id', ord.doctor_id).maybeSingle(),
    ]);
    if (d.data) {
      doctorName = (d.data as any).full_name ?? null;
      const cl = (d.data as any).clinic;
      clinicName = Array.isArray(cl) ? cl[0]?.name ?? null : cl?.name ?? null;
    } else if (p.data) {
      doctorName = (p.data as any).full_name ?? null;
      clinicName = (p.data as any).clinic_name ?? null;
    }
  }

  // 6) Dosyalar (work_order_photos) + imzalı URL
  const { data: ph } = await supabase
    .from('work_order_photos')
    .select('id, storage_path, caption')
    .eq('work_order_id', orderId)
    .order('created_at', { ascending: true });
  const files: TriageFile[] = await Promise.all(((ph ?? []) as any[]).map(async (f) => {
    const { data: signed } = await supabase.storage.from('work-order-photos').createSignedUrl(f.storage_path, 60 * 60);
    const name = f.caption || (f.storage_path.split('/').pop() ?? 'Dosya');
    return {
      id: f.id, name, storage_path: f.storage_path,
      signed_url: signed?.signedUrl ?? null,
      is3d: /\.(stl|ply|obj)$/i.test(f.storage_path) || /\.(stl|ply|obj)$/i.test(name),
      isImage: /\.(png|jpe?g|webp|gif|heic|heif|bmp)$/i.test(f.storage_path),
    };
  }));

  // 6b) Sipariş kalemleri (order_items) — diş↔işlem şeması için
  const { data: oi } = await supabase
    .from('order_items')
    .select('id, name, quantity, tooth_numbers')
    .eq('work_order_id', orderId)
    .order('created_at', { ascending: true });
  const items: TriageOrderItem[] = ((oi ?? []) as any[]).map((it) => ({
    id: it.id, name: it.name ?? '', quantity: it.quantity ?? 1,
    tooth_numbers: Array.isArray(it.tooth_numbers) ? it.tooth_numbers : null,
  }));

  // 7) Hekim/klinik mesajları (order_messages) — sender user_type doctor | clinic_admin
  const { data: msgs } = await supabase
    .from('order_messages')
    .select('id, content, created_at, attachment_name, attachment_url, sender:profiles!order_messages_sender_id_fkey(full_name, user_type)')
    .eq('work_order_id', orderId)
    .order('created_at', { ascending: true });
  const messages: TriageMessage[] = ((msgs ?? []) as any[])
    .filter((m) => {
      const s = Array.isArray(m.sender) ? m.sender[0] : m.sender;
      if (!s) return true; // sender bilinmiyorsa yine göster (lab/admin değilse)
      return s.user_type === 'doctor' || s.user_type === 'clinic_admin';
    })
    .map((m) => {
      const s = Array.isArray(m.sender) ? m.sender[0] : m.sender;
      return {
        id: m.id, content: m.content, created_at: m.created_at,
        attachment_name: m.attachment_name ?? null, attachment_url: m.attachment_url ?? null,
        sender_name: s?.full_name ?? null,
      };
    });

  return { order: (ord as TriageOrderSummary) ?? null, stations, technicians, templates, files, messages, doctorName, clinicName, items };
}

/** İş tipine en uygun şablonu seç (case_types eşleşmesi → default → ilk). */
export function matchTemplate(templates: TriageTemplate[], workType: string | null): TriageTemplate | null {
  if (templates.length === 0) return null;
  if (workType) {
    // En uzun (en özel) eşleşen case_type kazanır — per-service şablonlarda
    // tam başlık, jenerik anahtar kelimeden önce gelir.
    const wt = workType.toLocaleLowerCase('tr-TR');
    let best: TriageTemplate | null = null;
    let bestLen = 0;
    for (const t of templates) {
      for (const c of (t.case_types ?? [])) {
        const cl = (c ?? '').toLocaleLowerCase('tr-TR');
        if (cl && wt.includes(cl) && cl.length > bestLen) { best = t; bestLen = cl.length; }
      }
    }
    if (best) return best;
  }
  return templates.find(t => t.is_default) ?? null;
}

/**
 * Teknisyen bu istasyonda çalışmaya yetkili mi? (İSTASYON BAZLI — user_station_skills)
 * Teknisyenin hiç istasyon yetkisi yoksa "henüz tanımlanmamış" sayılır → geriye uyumlu (herkes uygun).
 */
export function isQualified(station: TriageStation, tech: TriageTech): boolean {
  // KATI yetkinlik: yalnız user_station_skills'te bu istasyona yetkili işaretlenmiş
  // teknisyen uygundur. Yetkinliği hiç tanımlanmamış (0 istasyon) kullanıcı UYGUN
  // DEĞİLDİR — eskiden true dönüyordu ve 0-yetkinlikli kurye/yönetici her aşamaya
  // "uygun" sayılıp otomatik atanıyordu.
  const ids = tech.stationIds;
  if (!ids || ids.length === 0) return false;
  return ids.includes(station.id);
}

/**
 * Yetkinlik + iş yüküne göre en uygun teknisyeni öner.
 *   1) İstasyona yetkili teknisyenler aday.
 *   2) Hiç yetkili aday yoksa → tüm teknisyenler (planlama kilitlenmesin) → o da yoksa istasyon varsayılanı.
 *   3) Adaylar arasında en az yüklü (kapasiteye göre oransal); eşitlikte istasyon varsayılanı.
 */
export function autoAssignTech(station: TriageStation, technicians: TriageTech[]): string | null {
  // Kurye ASLA üretim istasyonuna atanmaz; pasif personele de iş verilmez.
  // (is_active undefined = bilinmiyor → engelleme; yalnız açıkça false olan elenir.)
  const pool = technicians.filter(t => t.role !== 'courier' && t.is_active !== false);
  // Yalnız bu istasyona YETKİN teknisyenler aday olur. Yetkin yoksa aşama BOŞ kalır:
  // yetkin olmayan birine (ya da varsayılan teknisyene) düşürmeyiz — müdür elle atar.
  const candidates = pool.filter(t => isQualified(station, t));
  if (candidates.length === 0) return null;
  const ratio = (t: TriageTech) => t.load / (t.capacity && t.capacity > 0 ? t.capacity : 6);
  // Yetkin TEKNİSYEN varsa önce o gelir; yönetici yalnız fallback (yöneticiye
  // teknisyen gibi rutin iş atanmasın — yetkinliği olsa bile).
  const rank = (t: TriageTech) => ((t.role ?? 'technician') === 'technician' ? 0 : 1);
  const sorted = [...candidates].sort((a, b) => {
    const rk = rank(a) - rank(b);
    if (rk !== 0) return rk;
    const r = ratio(a) - ratio(b);
    if (Math.abs(r) > 0.0001) return r;
    if (a.id === station.default_technician_id) return -1;
    if (b.id === station.default_technician_id) return 1;
    return a.full_name.localeCompare(b.full_name);
  });
  return sorted[0]?.id ?? null;
}

export interface PlanLine {
  station_id: string;
  sequence_order: number;
  status: 'aktif' | 'bekliyor' | 'skipped';
  skipped_reason: string | null;
  technician_id: string | null;
  is_critical: boolean;
  /** Faz 5: aynı parallel_group → eşzamanlı yürüyen aşamalar. null = seri. */
  parallel_group: number | null;
}

// ── Faz 5c: sıfır-tıkla oto-triaj ───────────────────────────────────────────
/** Lab'ın oto-triaj ayarı (opt-in). Açıksa güvenli tek-şablon eşleşmesinde plan otomatik uygulanır+onaylanır. */
export async function fetchAutoTriage(labId: string): Promise<boolean> {
  const { data } = await supabase.from('lab_settings').select('auto_triage').eq('lab_id', labId).maybeSingle();
  return !!data?.auto_triage;
}

/** Oto-triaj ayarını değiştir (lab/müdür). */
export async function setAutoTriage(labId: string, enabled: boolean) {
  return supabase.from('lab_settings').upsert({ lab_id: labId, auto_triage: enabled }, { onConflict: 'lab_id' });
}

/** Triaj planını onayla (ilk aşamayı aktive eder). Mevcut approve_triage RPC. */
export async function approveTriagePlan(orderId: string) {
  return supabase.rpc('approve_triage', { p_order_id: orderId });
}

/** Mevcut triage_order RPC sözleşmesiyle kaydet. */
export async function saveTriagePlan(orderId: string, lines: PlanLine[], firstTechId: string | null) {
  return supabase.rpc('triage_order', {
    p_order_id: orderId,
    p_lines: lines,
    p_first_tech_id: firstTechId,
  });
}

/** Yeniden planla — mevcut aşamaların SIRA + TEKNİSYEN'ini güncelle.
 *  Üretim başlamış aşama varsa RPC reddeder. */
export async function replanOrder(
  orderId: string,
  lines: Array<{ stage_id: string; sequence_order: number; technician_id: string | null }>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('replan_order', { p_order_id: orderId, p_lines: lines });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Şablon Stüdyosu ──────────────────────────────────────────────────────────

export interface StudioTemplate {
  id: string;
  name: string;
  description: string | null;
  case_types: string[];
  station_ids: string[];
  is_default: boolean;
  is_active: boolean;
}

export interface StudioData {
  stations: TriageStation[];
  templates: StudioTemplate[];
}

export async function fetchStudioData(labId: string): Promise<StudioData> {
  const [stRes, wfRes] = await Promise.all([
    supabase
      .from('lab_stations')
      .select('id, name, color, icon, sequence_hint, is_critical, applicable_work_types, default_technician_id')
      .eq('is_active', true)
      .order('sequence_hint', { ascending: true }),
    supabase
      .from('workflow_templates')
      .select('id, name, description, case_types, station_ids, is_default, is_active')
      .eq('lab_id', labId)
      .order('created_at', { ascending: true }),
  ]);
  return {
    stations: (stRes.data ?? []) as TriageStation[],
    templates: ((wfRes.data ?? []) as any[]).map((w): StudioTemplate => ({
      id: w.id, name: w.name, description: w.description ?? null,
      case_types: w.case_types ?? [], station_ids: w.station_ids ?? [],
      is_default: !!w.is_default, is_active: w.is_active !== false,
    })),
  };
}

export interface TemplateInput {
  name: string;
  description?: string | null;
  case_types: string[];
  station_ids: string[];
  is_default: boolean;
  is_active: boolean;
}

export async function createTemplate(labId: string, t: TemplateInput) {
  return supabase.from('workflow_templates').insert({ lab_id: labId, ...t });
}

export async function updateTemplate(id: string, t: TemplateInput) {
  return supabase.from('workflow_templates').update({ ...t, updated_at: new Date().toISOString() }).eq('id', id);
}

export async function deleteTemplate(id: string) {
  return supabase.from('workflow_templates').delete().eq('id', id);
}

// ─── Fiyat listesinden otomatik şablon üretimi ────────────────────────────────
// Her lab_service için, ad/kategori anahtar kelimelerine göre bir üretim rotası
// (sıralı StationKind) seçilir; lab'ın gerçek istasyonlarına çözülür ve o hizmet
// adıyla bir workflow_template oluşturulur. Yeni iş geldiğinde matchTemplate
// case_types (= hizmet adı) üzerinden başlığa göre otomatik eşleştirir.

/** Üretim rotaları — StationKind dizileri (lab istasyon adlarına çözülür). */
const SERVICE_ROUTES: Record<string, StationKind[]> = {
  zirkon:  ['CAD', 'CAM', 'MILLING', 'SINTER', 'PORCELAIN', 'GLAZE', 'POLISH', 'QC', 'PACKAGING', 'READY'],
  emax:    ['CAD', 'CAM', 'MILLING', 'SINTER', 'GLAZE', 'POLISH', 'QC', 'PACKAGING', 'READY'],
  metal:   ['CAD', 'CAM', 'MILLING', 'METAL_CAST', 'PORCELAIN', 'GLAZE', 'POLISH', 'QC', 'PACKAGING', 'READY'],
  print:   ['CAD', 'PRINT_3D', 'WASH_CURE', 'POLISH', 'QC', 'PACKAGING', 'READY'],
  guide:   ['CAD', 'PRINT_3D', 'WASH_CURE', 'QC', 'PACKAGING', 'READY'],
  implant: ['CAD', 'CAM', 'MILLING', 'SINTER', 'IMPLANT_MOUNT', 'POLISH', 'QC', 'PACKAGING', 'READY'],
  protez:  ['SCAN', 'MODEL_PREP', 'CAD', 'PRINT_3D', 'WASH_CURE', 'POLISH', 'QC', 'PACKAGING', 'READY'],
  veneer:  ['CAD', 'CAM', 'MILLING', 'GLAZE', 'POLISH', 'QC', 'PACKAGING', 'READY'],
  generic: ['CAD', 'CAM', 'MILLING', 'QC', 'PACKAGING', 'READY'],
};

/** Hizmet adı + kategorisinden üretim rotasını sınıflandırır. Sıra önemlidir. */
export function classifyServiceRoute(name: string, category?: string | null): StationKind[] {
  const s = `${name} ${category ?? ''}`.toLocaleLowerCase('tr-TR');
  const has = (...kw: string[]) => kw.some(k => s.includes(k));
  if (has('guide', 'rehber', 'cerrahi şablon', 'cerrahi sablon', 'surgical')) return SERVICE_ROUTES.guide;
  if (has('implant', 'abutment', 'dayanak', 'scan body', 'scanbody'))          return SERVICE_ROUTES.implant;
  if (has('total protez', 'tam protez', 'hareketli', 'iskelet', 'döküm protez', 'immediat', 'kaide')) return SERVICE_ROUTES.protez;
  if (has('veneer', 'lamina', 'laminate'))                                     return SERVICE_ROUTES.veneer;
  if (has('e.max', 'emax', 'e max', 'cam seramik', 'tam seramik', 'empress'))  return SERVICE_ROUTES.emax;
  if (has('metal', 'döküm', 'metal destekli', 'metal seramik'))                return SERVICE_ROUTES.metal;
  if (has('zirkon', 'zirconia', 'monolitik', 'kron', 'köprü', 'kuron'))        return SERVICE_ROUTES.zirkon;
  if (has('baskı', 'baski', 'print', '3d', 'model', 'gece pla', 'splint', 'aparey', 'aligner', 'ortodonti', 'plak')) return SERVICE_ROUTES.print;
  return SERVICE_ROUTES.generic;
}

export interface GenerateTemplatesResult {
  created: number;
  skipped: number;   // zaten şablonu olan hizmetler
  noStations: boolean; // lab'da hiç istasyon yoksa
}

/**
 * Lab'ın fiyat listesindeki (lab_services) her aktif hizmet için — şablonu yoksa —
 * sınıflandırılmış bir üretim akışı şablonu oluşturur. Idempotent: ad eşleşen
 * şablonu olan hizmetler atlanır.
 */
export async function generateTemplatesFromServices(labId: string): Promise<GenerateTemplatesResult> {
  const [svcRes, stRes, tplRes] = await Promise.all([
    supabase.from('lab_services').select('id, name, category').eq('is_active', true),
    supabase.from('lab_stations').select('id, name').eq('is_active', true),
    supabase.from('workflow_templates').select('name').eq('lab_id', labId),
  ]);

  const services = (svcRes.data ?? []) as { id: string; name: string; category: string | null }[];
  const stations = (stRes.data ?? []) as { id: string; name: string }[];
  const existing = new Set(
    ((tplRes.data ?? []) as { name: string }[]).map(t => (t.name ?? '').trim().toLocaleLowerCase('tr-TR'))
  );

  // StationKind → o lab'daki ilk uygun istasyon id'si
  const kindToId = new Map<StationKind, string>();
  for (const st of stations) {
    const k = getStationKind(st.name);
    if (!kindToId.has(k)) kindToId.set(k, st.id);
  }
  if (kindToId.size === 0) return { created: 0, skipped: 0, noStations: true };

  let created = 0;
  let skipped = 0;
  for (const svc of services) {
    const key = (svc.name ?? '').trim().toLocaleLowerCase('tr-TR');
    if (!key || existing.has(key)) { skipped++; continue; }
    const route = classifyServiceRoute(svc.name, svc.category);
    const station_ids = route.map(k => kindToId.get(k)).filter((x): x is string => !!x);
    if (station_ids.length === 0) { skipped++; continue; }
    const { error } = await createTemplate(labId, {
      name: svc.name,
      description: 'Fiyat listesinden otomatik üretildi',
      case_types: [svc.name],
      station_ids,
      is_default: false,
      is_active: true,
    });
    if (error) { skipped++; continue; }
    existing.add(key);
    created++;
  }
  return { created, skipped, noStations: false };
}

// ─── Yetkinlikler (istasyon gereksinimi + teknisyen yetkinliği) ───────────────

export interface SkillsData {
  stations: TriageStation[];
  technicians: TriageTech[];
  /** Lab'da kullanılan tüm yetkinlik etiketleri (öneri için) */
  allSkills: string[];
}

export async function fetchSkillsData(labId: string): Promise<SkillsData> {
  const [stRes, techRes] = await Promise.all([
    supabase
      .from('lab_stations')
      .select('id, name, color, icon, sequence_hint, is_critical, applicable_work_types, default_technician_id, required_skills, est_duration_min, sla_hours')
      .eq('is_active', true)
      .order('sequence_hint', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name, role, skills, daily_capacity, is_active')
      .eq('lab_id', labId)
      .eq('user_type', 'lab')
      .eq('approval_status', 'approved')
      .order('full_name'),
  ]);
  const stations: TriageStation[] = ((stRes.data ?? []) as any[]).map((s) => ({
    id: s.id, name: s.name, color: s.color, icon: s.icon, sequence_hint: s.sequence_hint,
    is_critical: !!s.is_critical, applicable_work_types: s.applicable_work_types,
    default_technician_id: s.default_technician_id, required_skills: s.required_skills ?? [],
    est_duration_min: s.est_duration_min ?? null, sla_hours: s.sla_hours ?? null,
  }));
  const technicians: TriageTech[] = ((techRes.data ?? []) as any[]).map((t) => ({
    id: t.id, full_name: t.full_name, role: t.role, is_active: t.is_active, load: 0, skills: t.skills ?? [], capacity: t.daily_capacity ?? null,
  }));
  const allSkills = Array.from(new Set([
    ...stations.flatMap(s => s.required_skills),
    ...technicians.flatMap(t => t.skills),
  ])).sort();
  return { stations, technicians, allSkills };
}

export async function updateStationSkills(stationId: string, skills: string[]) {
  return supabase.from('lab_stations').update({ required_skills: skills }).eq('id', stationId);
}

// ── Faz 3: plan zaman çizelgesi yardımcıları (saf fonksiyon) ────────────────
export interface PlanTiming {
  totalMin: number;       // Σ est_duration_min (tahmini aktif işlem süresi)
  totalSlaH: number;      // Σ sla_hours (hedef teslim süresi toplamı)
  anyDuration: boolean;   // en az bir aşamada süre tanımlı mı
  anySla: boolean;        // en az bir aşamada SLA tanımlı mı
}

export function summarizePlanTiming(
  stagesInOrder: { est_duration_min: number | null; sla_hours: number | null; parallel_group?: number | null }[],
): PlanTiming {
  // Faz 5: aynı parallel_group eşzamanlı yürür → grup içinde MAX, gruplar arası TOPLA.
  // parallel_group null → her aşama kendi grubudur (eski davranışla aynı: seri toplam).
  const groups = new Map<string, { dur: number; durSet: boolean; sla: number; slaSet: boolean }>();
  stagesInOrder.forEach((s, i) => {
    const key = s.parallel_group != null ? `g${s.parallel_group}` : `s${i}`;
    const g = groups.get(key) ?? { dur: 0, durSet: false, sla: 0, slaSet: false };
    if (s.est_duration_min != null) { g.dur = Math.max(g.dur, s.est_duration_min); g.durSet = true; }
    if (s.sla_hours != null) { g.sla = Math.max(g.sla, s.sla_hours); g.slaSet = true; }
    groups.set(key, g);
  });
  let totalMin = 0, totalSlaH = 0, anyDuration = false, anySla = false;
  groups.forEach(g => {
    if (g.durSet) { totalMin += g.dur; anyDuration = true; }
    if (g.slaSet) { totalSlaH += g.sla; anySla = true; }
  });
  return { totalMin, totalSlaH, anyDuration, anySla };
}

/** Dakikayı "2 sa 30 dk" / "45 dk" / "3 sa" biçiminde gösterir. */
export function fmtDuration(min: number): string {
  if (!min || min <= 0) return '—';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (h && m) return `${h} sa ${m} dk`;
  if (h) return `${h} sa`;
  return `${m} dk`;
}

/** Faz 3: aşamanın varsayılan süresi (dk) + SLA (saat). null = sıfırla. */
export async function updateStationTiming(
  stationId: string,
  est_duration_min: number | null,
  sla_hours: number | null,
) {
  return supabase
    .from('lab_stations')
    .update({ est_duration_min, sla_hours })
    .eq('id', stationId);
}

export async function updateTechSkills(techId: string, skills: string[], capacity: number | null) {
  return supabase.from('profiles').update({ skills, daily_capacity: capacity }).eq('id', techId);
}

// ── Faz 2: yönetilen yetkinlik kataloğu (lab_skills) ────────────────────────
export interface LabSkill {
  id: string;
  lab_id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  cert_level: string | null;   // 'temel' | 'orta' | 'uzman' | null
  sort_order: number;
}
export interface LabSkillInput {
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  cert_level?: string | null;
  sort_order?: number;
}

export async function fetchLabSkills(labId: string) {
  return supabase.from('lab_skills').select('id, lab_id, name, description, color, icon, cert_level, sort_order')
    .eq('lab_id', labId).order('sort_order', { ascending: true }).order('name');
}
export async function createLabSkill(labId: string, s: LabSkillInput) {
  return supabase.from('lab_skills').insert({ lab_id: labId, ...s }).select().single();
}
export async function updateLabSkill(id: string, s: Partial<LabSkillInput>) {
  return supabase.from('lab_skills').update(s).eq('id', id).select().single();
}
export async function deleteLabSkill(id: string) {
  return supabase.from('lab_skills').delete().eq('id', id);
}

// ── AI Workflow Builder (ai-workflow-builder edge function) ─────────────────
export interface AiWorkflowResult {
  stages: { name: string; est_duration_min: number | null; sla_hours: number | null; required_skills: string[] }[];
  skills: { name: string; description?: string | null; cert_level?: string | null; color?: string | null; icon?: string | null }[];
  staffing: { role: string; count: number; skills: string[] }[];
  summary: string;
}
export async function aiBuildWorkflow(
  answers: Record<string, unknown>, stations: string[], skills: string[],
): Promise<{ ok: boolean; data?: AiWorkflowResult; error?: string }> {
  const { data, error } = await supabase.functions.invoke('ai-workflow-builder', { body: { answers, stations, skills } });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; data?: AiWorkflowResult; error?: string };
}
