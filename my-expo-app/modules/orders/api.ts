import { supabase } from '../../core/api/supabase';
import { sanitizeIlikeTerm } from '../../core/util/search';
import { WorkOrderStatus, MachineType, CreateWorkOrderParams } from './types';
import { createCaseSteps } from '../workflow/engine';
import { dispatchNotification } from '../../core/notifications/dispatch';

export async function createWorkOrder(params: CreateWorkOrderParams & { measurement_type?: string; doctor_approval_required?: boolean }) {
  // Strip columns that do not yet exist in the production DB schema.
  // Only send fields confirmed to be in work_orders.
  const {
    patient_phone,        // migration 004 — not applied yet (kolon yok)
    measurement_type,     // workflow plan — not applied yet
    doctor_approval_required, // workflow plan — not applied yet
    ...safeParams
  } = params as any;
  // NOT: patient_dob + patient_nationality/country/city kolonları artık VAR — strip'lenmez.

  let { data, error } = await supabase
    .from('work_orders')
    .insert(safeParams)
    .select()
    .single();

  // delivery_method kolonu canlıda henüz yoksa (migration uygulanmadıysa) insert
  // patlamasın — o alanı çıkarıp tekrar dene (sipariş oluşturma akışı bozulmasın).
  if (error && /delivery_method/i.test(error.message ?? '')) {
    const { delivery_method, ...withoutDelivery } = safeParams as any;
    ({ data, error } = await supabase
      .from('work_orders')
      .insert(withoutDelivery)
      .select()
      .single());
  }

  if (!error && data) {
    const measurementType = (params.measurement_type ?? 'manual') as 'manual' | 'digital';
    await createCaseSteps(data.id, measurementType);

    // ─── Notification: new_order → admin + lab manager (teknisyen değil) ─────
    // Async fire-and-forget, hata olursa sipariş akışını bozma
    try {
      const labId = (data as any).lab_id as string | null;
      if (labId) {
        const orderNum   = (data as any).order_number ?? '';
        const patient    = (data as any).patient_name ?? '';
        const workType   = Array.from(new Set(String((data as any).work_type ?? '').split(',').map((s: string) => s.trim()).filter(Boolean))).join(', ');
        const clinicName = (data as any).clinic_name ?? '';
        // Yalnızca admin (user_type=admin) veya lab manager (user_type=lab, role=manager)
        const { data: targetUsers } = await supabase
          .from('profiles')
          .select('id')
          .eq('lab_id', labId)
          .or('user_type.eq.admin,and(user_type.eq.lab,role.eq.manager)');
        const managerIds = (targetUsers ?? []).map((r: any) => r.id as string);
        if (managerIds.length > 0) {
          dispatchNotification({
            category:     'new_order',
            userIds:      managerIds,
            title:        `Yeni iş emri${orderNum ? ` · ${orderNum}` : ''}`,
            body:         [patient, workType, clinicName].filter(Boolean).join(' · '),
            resourceType: 'work_order',
            resourceId:   (data as any).id,
            actionUrl:    `/(lab)/order/${(data as any).id}`,
            payload: {
              orderNumber: orderNum,
              patient,
              workType,
              clinic:      clinicName,
            },
          }).catch(() => null);
        }
      }
    } catch { /* sessiz */ }

    // ─── Notification: new_order → hekim + klinik (oluşturan hariç) ──────────
    // Sipariş hekimin kendisi dışında biri (klinik/lab/Denty) tarafından açıldıysa
    // hekime ve klinik kullanıcılarına "yeni sipariş" bildirimi gider.
    try {
      const orderId  = (data as any).id as string;
      const clinicId = (data as any).clinic_id as string | null;
      const docId    = (data as any).doctor_id as string | null;
      const orderNum = (data as any).order_number ?? '';
      const patient  = (data as any).patient_name ?? '';
      const workType = Array.from(new Set(String((data as any).work_type ?? '').split(',').map((s: string) => s.trim()).filter(Boolean))).join(', ');

      // Oluşturan kullanıcı — kendi siparişine bildirim gitmesin
      let creatorId: string | null = null;
      try { const { data: u } = await supabase.auth.getUser(); creatorId = u?.user?.id ?? null; } catch {}

      const targets = new Set<string>();

      // Hekim — doctor_id bir profiles (app kullanıcısı) ise
      if (docId) {
        const { data: docProfile } = await supabase.from('profiles').select('id').eq('id', docId).maybeSingle();
        if ((docProfile as any)?.id) targets.add((docProfile as any).id as string);
      }
      // Klinik kullanıcıları
      if (clinicId) {
        const { data: clinicUsers } = await supabase.from('profiles').select('id').eq('clinic_id', clinicId);
        for (const r of (clinicUsers ?? []) as any[]) if (r?.id) targets.add(r.id as string);
      }
      if (creatorId) targets.delete(creatorId);

      if (targets.size > 0) {
        await dispatchNotification({
          category:     'new_order',
          userIds:      Array.from(targets),
          title:        `Yeni sipariş${orderNum ? ` · ${orderNum}` : ''}`,
          body:         [patient, workType].filter(Boolean).join(' · '),
          resourceType: 'work_order',
          resourceId:   orderId,
          actionUrl:    `/order/${orderId}`,
          payload:      { orderNumber: orderNum, patient, workType },
        }).catch(() => null);
      }
    } catch { /* sessiz */ }
  }

  return { data, error };
}

// Kanban / liste için iş emrinin mevcut stage'inin istasyon adını da pull ederiz.
// PostgREST embed: current_stage:order_stages!fk_work_orders_stage(...)
// Sonra display tarafında current_stage_name string'e map'leriz.
// Embed sadece flattenStageName'in kullandığı 2 alanı çeker (name + color).
// Diğer kolonlar (stage id/status/sequence_order, station.id) yıkıma uğramasın.
const LIST_SELECT = `
  *,
  current_stage:order_stages!fk_work_orders_stage(
    station:lab_stations(name, color)
  )
`;

/** Embedded `current_stage` objesini düz `current_stage_name` string'ine map'ler. */
function flattenStageName(rows: any[]): any[] {
  return rows.map(r => ({
    ...r,
    current_stage_name: r.current_stage?.station?.name ?? null,
    current_stage_color: r.current_stage?.station?.color ?? null,
  }));
}

/**
 * Liste satırlarına hekim (`doctor`) objesini ekler.
 *
 *   work_orders.doctor_id polimorfik (doctors.id VEYA profiles.id) olduğundan
 *   PostgREST embed çalışmaz — tüm doctor_id'leri toplayıp iki tabloyu TEK
 *   batch sorguyla çözer, satırlara `doctor:{ id, full_name, clinic }` yapıştırır.
 *   doctors kaydı öncelikli; yoksa profiles (app kullanıcısı) fallback.
 */
async function attachDoctors(rows: any[]): Promise<any[]> {
  const ids = Array.from(new Set(rows.map(r => r.doctor_id).filter(Boolean)));
  if (ids.length === 0) return rows.map(r => ({ ...r, doctor: null }));

  const [docsRes, profsRes] = await Promise.all([
    supabase.from('doctors').select('id, full_name, clinic:clinics(id, name)').in('id', ids),
    supabase.from('profiles').select('id, full_name, clinic_name').in('id', ids),
  ]);

  const map = new Map<string, any>();
  for (const d of (docsRes.data ?? [])) map.set((d as any).id, d);
  for (const p of (profsRes.data ?? [])) {
    if (map.has((p as any).id)) continue;            // doctors önceliği
    map.set((p as any).id, {
      id: (p as any).id,
      full_name: (p as any).full_name,
      clinic: (p as any).clinic_name ? { id: null, name: (p as any).clinic_name } : null,
    });
  }

  return rows.map(r => ({ ...r, doctor: r.doctor_id ? (map.get(r.doctor_id) ?? null) : null }));
}

export async function fetchWorkOrdersForDoctor(doctorId: string) {
  const res = await supabase
    .from('work_orders')
    .select(LIST_SELECT)
    .eq('doctor_id', doctorId)
    .or('is_archived.is.null,is_archived.eq.false')
    .order('created_at', { ascending: false });
  if (res.data) (res as any).data = await attachDoctors(flattenStageName(res.data as any[]));
  return res;
}

export async function fetchAllWorkOrders(opts: { includeArchived?: boolean; limit?: number } = {}) {
  // NOTE: work_orders.doctor_id is polymorphic (profiles.id OR doctors.id).
  // Migration 037 intentionally dropped the FK constraint, so PostgREST
  // embedded resource joins using !work_orders_doctor_id_fkey no longer work.
  // current_stage_id FK ise duruyor — onu embed ediyoruz.
  // Pasife alınmış siparişler default listede gizli; admin "Arşivi göster" toggle'ı
  // ile is_archived=TRUE olanları da çekebilir.
  let q = supabase
    .from('work_orders')
    .select(LIST_SELECT)
    .order('delivery_date', { ascending: true })
    .limit(opts.limit ?? 300);
  if (!opts.includeArchived) {
    q = q.or('is_archived.is.null,is_archived.eq.false');
  }
  const res = await q;
  if (res.data) (res as any).data = await attachDoctors(flattenStageName(res.data as any[]));
  return res;
}

export async function fetchWorkOrderById(idOrNumber: string) {
  // Önce siparişi ve auxiliary join'leri (assignee/photos/status/items) çek.
  // doctor_id polymorphic (doctors.id VEYA profiles.id) olduğundan otomatik
  // FK embed yapmıyoruz — manuel olarak iki tabloyu dener, bulduğumuzu yapıştırırız.
  // UUID pattern'i (8-4-4-4-12 hex) eşleşirse `id`, değilse `order_number` üzerinden ara
  // → /order/LAB-2026-0086 gibi kısa human-readable URL'leri destekler.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrNumber);
  const query = supabase
    .from('work_orders')
    .select(
      `
      *,
      assignee:profiles!work_orders_assigned_to_fkey(id, full_name, role),
      photos:work_order_photos(*),
      status_history(*, changer:profiles!status_history_changed_by_fkey(id, full_name, role)),
      order_items(*)
    `
    )
    .order('created_at', { ascending: true, referencedTable: 'status_history' });

  const result = await (isUuid
    ? query.eq('id', idOrNumber)
    : query.eq('order_number', idOrNumber)
  ).single();

  if (result.error || !result.data) return result;

  const doctorId: string | null = (result.data as any).doctor_id ?? null;
  if (doctorId) {
    // doctor_id polymorphic — iki tabloyu paralel sorgula, ilk bulunanı kullan.
    const [extRes, profRes] = await Promise.all([
      supabase
        .from('doctors')
        .select('id, full_name, phone, clinic:clinics(id, name)')
        .eq('id', doctorId)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id, full_name, phone, clinic_name')
        .eq('id', doctorId)
        .maybeSingle(),
    ]);

    if (extRes.data) {
      (result.data as any).doctor = extRes.data;
    } else if (profRes.data) {
      (result.data as any).doctor = {
        id: profRes.data.id,
        full_name: profRes.data.full_name,
        phone: profRes.data.phone,
        clinic: profRes.data.clinic_name
          ? { id: null, name: profRes.data.clinic_name }
          : null,
      };
    } else {
      (result.data as any).doctor = null;
    }
  } else {
    (result.data as any).doctor = null;
  }

  return result;
}

export async function advanceOrderStatus(
  workOrderId: string,
  newStatus: WorkOrderStatus,
  changedBy: string,
  note?: string
) {
  return supabase.rpc('update_work_order_status', {
    p_work_order_id: workOrderId,
    p_new_status: newStatus,
    p_changed_by: changedBy,
    p_note: note ?? null,
  });
}

// ─── Tasarım (hekim) onayı ───────────────────────────────────────────────────

/** Lab → tasarımı hekim onayına gönderir. status='pending' + token + 48s. */
export async function requestDesignApproval(workOrderId: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  const { data, error } = await supabase.rpc('request_design_approval', { p_work_order_id: workOrderId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, token: data as string };
}

/** Tasarım dosyası silinince/değişince onayı sıfırla (lab manager/admin). */
export async function resetDesignApproval(workOrderId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('reset_design_approval', { p_work_order_id: workOrderId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Hekim/klinik → in-app onay/red kararı + not. */
export async function clinicDecideDesignApproval(
  workOrderId: string, approved: boolean, note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('clinic_decide_design_approval', {
    p_work_order_id: workOrderId, p_approved: approved, p_note: note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface PendingDesignApproval {
  id: string;
  order_number: string | null;
  patient_name: string | null;
  work_type: string | null;
  shade: string | null;
  delivery_date: string | null;
  doctor_approval_expires_at: string | null;
  created_at: string | null;
  doctor?: { full_name: string | null } | null;
}

/** Bekleyen tasarım onayları — RLS kullanıcının (hekim/klinik) siparişleriyle sınırlar. */
export async function fetchPendingDesignApprovals(): Promise<PendingDesignApproval[]> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('id, order_number, patient_name, work_type, shade, delivery_date, doctor_approval_expires_at, created_at')
    .eq('doctor_approval_status', 'pending')
    .order('doctor_approval_expires_at', { ascending: true });
  if (error) { console.warn('[design-approval] fetch failed:', error.message); return []; }
  return (data ?? []) as any;
}

export async function assignTechnician(workOrderId: string, technicianId: string) {
  return supabase
    .from('work_orders')
    .update({ assigned_to: technicianId })
    .eq('id', workOrderId);
}

/** Müdür/admin triajı onaylar → ilk bekliyor aşama aktif olur, status='asamada'. */
export async function approveTriage(workOrderId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('approve_triage', { p_order_id: workOrderId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Teslimat oluştur (internal kurye veya external firma). */
export async function createDelivery(params: {
  workOrderId: string;
  mode: 'internal' | 'external';
  courierId?: string;
  externalProvider?: string;
  externalTrackingNo?: string;
  notes?: string;
}): Promise<{ ok: boolean; deliveryId?: string; error?: string }> {
  const { data, error } = await supabase.rpc('create_delivery', {
    p_work_order_id:        params.workOrderId,
    p_mode:                 params.mode,
    p_courier_id:           params.courierId ?? null,
    p_external_provider:    params.externalProvider ?? null,
    p_external_tracking_no: params.externalTrackingNo ?? null,
    p_notes:                params.notes ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, deliveryId: data as string };
}

/** Teslimat status güncelle (kurye veya manager). */
export async function updateDeliveryStatus(
  deliveryId: string,
  status: 'beklemede' | 'teslim_alindi' | 'yolda' | 'teslim_edildi' | 'iptal',
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('update_delivery_status', {
    p_delivery_id: deliveryId,
    p_status:      status,
    p_note:        note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Müdür/admin: aktif aşamayı bir önceki tamamlanan aşamaya geri al. */
export async function revertStage(workOrderId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('revert_stage', { p_order_id: workOrderId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Müdür/admin bir 'bekliyor' aşamayı manuel olarak 'aktif' yapar. */
export async function forceActivateStage(stageId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('force_activate_stage', { p_stage_id: stageId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Canlı siparişe manuel aşama ekle (müdür/admin) — p_after_sequence'tan sonra. */
export async function addOrderStage(orderId: string, stationId: string, afterSequence: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('order_stage_add', {
    p_order_id: orderId, p_station_id: stationId, p_after_sequence: afterSequence,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Canlı siparişten aşamayı sil (müdür/admin) — sırayı yeniden düzenler. */
export async function removeOrderStage(stageId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('order_stage_remove', { p_stage_id: stageId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Admin/müdür aşama override (her durumda müdahale) ──────────────────────
// migration: 20260628120000_admin_stage_override.sql
/** Herhangi durumdaki aşamayı tamamla + sonrakine ilerlet (admin/müdür). */
export async function adminCompleteStage(stageId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('admin_complete_stage', { p_stage_id: stageId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
/** Aşamayı atla (skipped) + sonrakine ilerlet (admin/müdür). */
export async function adminSkipStage(stageId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('admin_skip_stage', { p_stage_id: stageId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
/** Aşamayı (duraklamış/ara durum dahil) tekrar aktif et (admin/müdür). */
export async function adminActivateStage(stageId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('admin_activate_stage', { p_stage_id: stageId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchTodayAndOverdueOrders() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  // FK constraint dropped (migration 037) — use plain select, no embedded join
  return supabase
    .from('work_orders')
    .select('*')
    .lte('delivery_date', today)
    .neq('status', 'teslim_edildi')
    .neq('status', 'iptal')
    .order('delivery_date', { ascending: true });
}

export async function fetchLabTechnicians() {
  return supabase.from('profiles').select('id, full_name, role').eq('user_type', 'lab');
}

// ─── Order Items ─────────────────────────────────────────────────────────────

export async function fetchOrderItems(workOrderId: string) {
  return supabase
    .from('order_items')
    .select('*')
    .eq('work_order_id', workOrderId)
    .order('created_at');
}

export async function addOrderItem(data: {
  work_order_id: string;
  service_id?: string;
  name: string;
  price: number;
  quantity?: number;
  notes?: string;
  /** Bu hizmete denk gelen diş FDI numaraları (renk haritası + raporlama için) */
  tooth_numbers?: number[];
}) {
  return supabase.from('order_items').insert(data).select().single();
}

export async function updateOrderItem(
  id: string,
  data: Partial<{ price: number; quantity: number; notes: string }>
) {
  return supabase.from('order_items').update(data).eq('id', id).select().single();
}

export async function deleteOrderItem(id: string) {
  return supabase.from('order_items').delete().eq('id', id);
}

// ─── Hekim/Klinik: planlama-öncesi direkt düzenle & iptal (SECURITY DEFINER RPC) ──
// Yetki + planlama-öncesi (triaged_at IS NULL) kapısı SUNUCUDA zorlanır.

/** Sipariş, düzenle/iptal için hâlâ "planlama öncesi" mi? (client ön-kontrol). */
export function isOrderPrePlanning(order: { triaged_at?: string | null; status?: string | null } | null): boolean {
  if (!order) return false;
  const status = String(order.status ?? '');
  return !order.triaged_at && status !== 'iptal' && status !== 'teslim_edildi';
}

/** Planlama öncesi direkt iptal (hekim/klinik). */
export async function cancelOrderClient(orderId: string) {
  const { data, error } = await supabase.rpc('client_cancel_order', { p_order_id: orderId });
  return { data, error };
}

export interface ClientOrderEditFields {
  patient_name?: string | null;
  patient_id?: string | null;
  patient_gender?: string | null;
  patient_dob?: string | null;
  patient_nationality?: string | null;
  patient_country?: string | null;
  patient_city?: string | null;
  work_type?: string | null;
  shade?: string | null;
  model_type?: string | null;
  delivery_method?: string | null;
  delivery_date?: string | null;
  is_urgent?: boolean | null;
  notes?: string | null;
  tooth_numbers?: number[];
}

export interface ClientOrderEditItem {
  name: string;
  price?: number;
  quantity?: number;
  tooth_numbers?: number[];
  notes?: string | null;
}

/**
 * Planlama öncesi direkt düzenleme (hekim/klinik).
 * fields → work_orders (yalnız verilen alanlar). items verilirse order_items TÜMÜYLE yeniden yazılır.
 */
export async function updateOrderClient(
  orderId: string,
  fields: ClientOrderEditFields,
  items?: ClientOrderEditItem[] | null,
) {
  const { data, error } = await supabase.rpc('client_update_order', {
    p_order_id: orderId,
    p_fields: fields,
    p_items: items ?? null,
  });
  return { data, error };
}

/** Admin/lab: kapsamlı düzenleme — planlama kapısı YOK (her aşamada). */
export async function updateOrderAdmin(
  orderId: string,
  fields: ClientOrderEditFields,
  items?: ClientOrderEditItem[] | null,
) {
  const { data, error } = await supabase.rpc('admin_update_order', {
    p_order_id: orderId,
    p_fields: fields,
    p_items: items ?? null,
  });
  return { data, error };
}

// ─── Admin-only: arşivleme & silme ───────────────────────────────────────────

/** Soft-delete: pasife al. Geri alınabilir. Admin only (RPC içinde kontrol). */
export async function archiveOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('archive_order', { p_order_id: orderId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Pasife alınmış bir siparişi geri al (admin only). */
export async function restoreOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('restore_order', { p_order_id: orderId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Kalıcı sil — geri dönüşü yok. Admin only. CASCADE'lerle stages/items/photos da silinir. */
export async function hardDeleteOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('hard_delete_order', { p_order_id: orderId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Hybrid Material Consumption — Phase 2 fetch helpers
// ─────────────────────────────────────────────────────────────────────

export interface StageMaterialContext {
  stage: {
    id: string;
    work_order_id: string;
    sequence_order: number;
    status: string;
    is_critical: boolean;
  };
  station: {
    id: string;
    name: string;
    consumes_materials: boolean;
    allowed_material_types: string[];
    default_consumption_rules: any[];
  };
  order: {
    id: string;
    lab_id: string | null;
    work_type: string | null;
    tooth_numbers: number[] | null;
  };
  /** Lab'a ait, bu istasyonla eşleşen stok kalemleri */
  candidateItems: Array<{
    id: string;
    name: string;
    category: string | null;
    type: string | null;
    unit: string | null;
    quantity: number;
    unit_cost: number | null;
    units_per_tooth: number | null;
    consume_at_stage: string | null;
  }>;
}

/**
 * Stage tamamlama akışı için tüm context'i tek seferde çek:
 * stage + station config + order + matching stock items.
 */
export async function fetchStageMaterialContext(
  stageId: string,
): Promise<{ data: StageMaterialContext | null; error?: string }> {
  // 1) stage + station + order
  const { data: stageRow, error: e1 } = await supabase
    .from('order_stages')
    .select(`
      id, work_order_id, sequence_order, status, is_critical,
      station:lab_stations (
        id, name, consumes_materials, allowed_material_types,
        default_consumption_rules, lab_profile_id
      ),
      work_order:work_orders!work_order_id ( id, lab_id, work_type, tooth_numbers )
    `)
    .eq('id', stageId)
    .single();

  if (e1 || !stageRow) {
    return { data: null, error: e1?.message ?? 'Stage not found' };
  }

  const station: any = (stageRow as any).station;
  const order: any = (stageRow as any).work_order;
  const labId = order?.lab_id ?? station?.lab_profile_id ?? null;

  if (!station || !order) {
    return { data: null, error: 'Stage missing station or order relation' };
  }

  // 2) Eşleşen stok kalemleri (consume_at_stage = station.name VEYA category in allowed_types)
  let candidateItems: any[] = [];
  if (station.consumes_materials && labId) {
    const allowed: string[] = station.allowed_material_types ?? [];
    let q = supabase
      .from('stock_items')
      .select('id, name, category, type, unit, quantity, unit_cost, units_per_tooth, consume_at_stage')
      .eq('lab_id', labId)
      .gt('quantity', 0);

    if (allowed.length > 0) {
      // .or() gramerini bozan , ( ) temizlenir (enjeksiyon koruması)
      const safeName = sanitizeIlikeTerm(String(station.name ?? ''));
      const safeCats = allowed.map(a => `"${String(a).replace(/"/g, '')}"`).join(',');
      q = safeName
        ? q.or(`consume_at_stage.eq.${safeName},category.in.(${safeCats})`)
        : q.or(`category.in.(${safeCats})`);
    } else {
      q = q.eq('consume_at_stage', station.name);
    }
    const { data: items } = await q;
    candidateItems = items ?? [];
  }

  return {
    data: {
      stage: {
        id: stageRow.id,
        work_order_id: stageRow.work_order_id,
        sequence_order: stageRow.sequence_order,
        status: stageRow.status,
        is_critical: stageRow.is_critical,
      },
      station: {
        id: station.id,
        name: station.name,
        consumes_materials: !!station.consumes_materials,
        allowed_material_types: station.allowed_material_types ?? [],
        default_consumption_rules: station.default_consumption_rules ?? [],
      },
      order: {
        id: order.id,
        lab_id: order.lab_id ?? null,
        work_type: order.work_type ?? null,
        tooth_numbers: order.tooth_numbers ?? null,
      },
      candidateItems,
    },
  };
}

/**
 * Stage'ı malzeme onayıyla birlikte tamamla — confirm_stage_materials RPC
 *
 * @param stageId Stage uuid
 * @param lines Onaylı malzeme satırları (estimated + actual + waste)
 * @param advanceStage true → stage tamamlandı'ya çevir + sıradakini aktif et
 */
export async function confirmStageMaterials(
  stageId: string,
  lines: any[],
  advanceStage = true,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('confirm_stage_materials', {
    p_stage_id: stageId,
    p_lines: lines,
    p_advance_stage: advanceStage,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
