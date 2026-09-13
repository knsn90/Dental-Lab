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

  // Boş string ("") uuid kolonuna gidince Postgres "invalid input syntax for type
  // uuid: ''" verir (ör. hekim seçilmemiş WhatsApp/OCR siparişinde doctor_id=""). Bu
  // kolonlar nullable → "" değerini NULL'a çevir (sipariş oluşturma akışı bozulmasın).
  for (const k of ['doctor_id', 'assigned_to', 'revision_of_id', 'lab_id', 'continues_order_id'] as const) {
    if ((safeParams as any)[k] === '') (safeParams as any)[k] = null;
  }

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

    // Klinik çöz: work_orders'ta clinic_id kolonu YOK + clinic_name boş olabilir →
    // doctor_id (doctors.id VEYA profiles.id) → clinic_id → clinics.name.
    // Hem admin bildirimi payload'ında ("şu klinikten") hem hekim/klinik hedeflemesinde kullanılır.
    let resolvedClinicId: string | null = null;
    let resolvedClinicName: string = (data as any).clinic_name ?? '';
    try {
      const docId0 = (data as any).doctor_id as string | null;
      if (docId0) {
        const { data: dp } = await supabase.from('profiles').select('clinic_id').eq('id', docId0).maybeSingle();
        if ((dp as any)?.clinic_id) resolvedClinicId = (dp as any).clinic_id as string;
        else {
          const { data: dr } = await supabase.from('doctors').select('clinic_id').eq('id', docId0).maybeSingle();
          if ((dr as any)?.clinic_id) resolvedClinicId = (dr as any).clinic_id as string;
        }
        if (!resolvedClinicName && resolvedClinicId) {
          const { data: c } = await supabase.from('clinics').select('name').eq('id', resolvedClinicId).maybeSingle();
          if ((c as any)?.name) resolvedClinicName = (c as any).name as string;
        }
      }
    } catch { /* sessiz */ }

    // ─── Notification: new_order → admin + lab manager (teknisyen değil) ─────
    // Async fire-and-forget, hata olursa sipariş akışını bozma
    try {
      const labId = (data as any).lab_id as string | null;
      if (labId) {
        const orderNum   = (data as any).order_number ?? '';
        const patient    = (data as any).patient_name ?? '';
        const workType   = Array.from(new Set(String((data as any).work_type ?? '').split(',').map((s: string) => s.trim()).filter(Boolean))).join(', ');
        const clinicName = resolvedClinicName;
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
      const clinicId = resolvedClinicId;   // yukarıda doctor_id → doctors.clinic_id ile çözüldü
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
  ),
  all_stages:order_stages!order_stages_work_order_id_fkey(status)
`;

/** Embedded `current_stage` objesini düz `current_stage_name` string'ine map'ler. */
function flattenStageName(rows: any[]): any[] {
  return rows.map(r => {
    // Üretim ilerleme mini-göstergesi için: skipped hariç toplam + tamamlanan sayısı.
    const stages: any[] = Array.isArray(r.all_stages) ? r.all_stages : [];
    const stagesTotal = stages.filter(s => s?.status !== 'skipped').length;
    const stagesDone  = stages.filter(s => s?.status === 'tamamlandi').length;
    const { all_stages, ...rest } = r;
    return {
      ...rest,
      current_stage_name: r.current_stage?.station?.name ?? null,
      current_stage_color: r.current_stage?.station?.color ?? null,
      stages_total: stagesTotal,
      stages_done: stagesDone,
    };
  });
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
    // logo_url: lab/admin/teknisyen listelerinde hasta baş harfleri yerine
    // KLİNİK LOGOSU gösterilir — hangi klinikten geldiği bir bakışta anlaşılsın.
    supabase.from('doctors').select('id, full_name, clinic:clinics(id, name, logo_url)').in('id', ids),
    supabase.from('profiles').select('id, full_name, clinic_id, clinic_name').in('id', ids),
  ]);

  const map = new Map<string, any>();
  for (const d of (docsRes.data ?? [])) map.set((d as any).id, d);
  // Profil-hekimlerde klinik yalnız isim olarak duruyor; logolar tek batch ile çözülür.
  const profClinicIds = Array.from(new Set(
    (profsRes.data ?? []).map((p: any) => p.clinic_id).filter(Boolean),
  ));
  const clinicLogos = new Map<string, string | null>();
  if (profClinicIds.length) {
    const { data: cls } = await supabase.from('clinics').select('id, logo_url').in('id', profClinicIds);
    for (const c of (cls ?? []) as any[]) clinicLogos.set(c.id, c.logo_url ?? null);
  }
  for (const p of (profsRes.data ?? [])) {
    if (map.has((p as any).id)) continue;            // doctors önceliği
    const cid = (p as any).clinic_id as string | null;
    map.set((p as any).id, {
      id: (p as any).id,
      full_name: (p as any).full_name,
      clinic: (p as any).clinic_name || cid
        ? { id: cid, name: (p as any).clinic_name, logo_url: cid ? (clinicLogos.get(cid) ?? null) : null }
        : null,
    });
  }

  return rows.map(r => ({ ...r, doctor: r.doctor_id ? (map.get(r.doctor_id) ?? null) : null }));
}

/**
 * Bir dizi (polimorfik) doctor_id için hekim + klinik ADINI tek batch'te çözer.
 * work_orders.doctor_id doctors.id VEYA profiles.id olabilir; doctors önceliklidir,
 * yoksa profiles (app kullanıcısı) fallback. Logo çözmez — sade metin için.
 * Teknisyen paneli gibi yalnız ada ihtiyaç duyan yerler kullanır.
 */
export async function resolveDoctorClinicNames(
  ids: string[],
): Promise<Map<string, { doctorName: string | null; clinicName: string | null }>> {
  const out = new Map<string, { doctorName: string | null; clinicName: string | null }>();
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (uniq.length === 0) return out;

  const [docsRes, profsRes] = await Promise.all([
    supabase.from('doctors').select('id, full_name, clinic:clinics(name)').in('id', uniq),
    supabase.from('profiles').select('id, full_name, clinic_name').in('id', uniq),
  ]);

  for (const d of (docsRes.data ?? []) as any[]) {
    out.set(d.id, { doctorName: d.full_name ?? null, clinicName: d.clinic?.name ?? null });
  }
  for (const p of (profsRes.data ?? []) as any[]) {
    if (out.has(p.id)) continue;                 // doctors önceliği
    out.set(p.id, { doctorName: p.full_name ?? null, clinicName: p.clinic_name ?? null });
  }
  return out;
}

export async function fetchWorkOrdersForDoctor(_doctorId: string) {
  // NOT: work_orders.doctor_id POLİMORFİK (doctors.id VEYA profiles.id). Sipariş
  // oluşturulurken doctor_id doctors-satırına çevriliyor, bu yüzden `.eq('doctor_id',
  // profile.id)` hekimin KENDİ siparişlerini KAÇIRIYORDU (liste boş görünüyordu).
  // RLS "Doctors see own orders" (doctor_owns_order_doctor) zaten yalnız hekimin
  // kendi siparişlerini döndürür → istemci filtresi gereksiz ve hatalı. Kaldırıldı.
  const res = await supabase
    .from('work_orders')
    .select(LIST_SELECT)
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

// ─── Revizyon siparişi (teslim sonrası yeniden yapım) ────────────────────────

export type RevisionResponsible = 'lab' | 'client';

/** Teslim edilmiş siparişin revizyonunu BAĞLI YENİ sipariş olarak açar.
 *  responsible='lab' → garanti (kalem fiyatları 0), 'client' → orijinal fiyatlar.
 *  Yeni sipariş status='alindi' ile normal triaj/planlamaya düşer. */
export async function createRevisionOrder(
  orderId: string,
  reason: string,
  responsible: RevisionResponsible,
  deliveryDate?: string | null,
  faultStationId?: string | null,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('create_revision_order', {
    p_order_id:         orderId,
    p_reason:           reason,
    p_responsible:      responsible,
    p_delivery_date:    deliveryDate ?? null,
    p_fault_station_id: faultStationId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data as string };
}

/** Mevcut bir siparişi başka siparişin DEVAM'ı veya REVİZYON'u yap (geriye dönük bağ). */
export async function linkOrderRelation(
  orderId: string,
  parentId: string,
  type: 'continuation' | 'revision',
  reason?: string | null,
  responsible?: 'lab' | 'client' | null,
  faultStationId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('link_order_relation', {
    p_order_id:         orderId,
    p_parent_id:        parentId,
    p_type:             type,
    p_reason:           reason ?? null,
    p_responsible:      responsible ?? null,
    p_fault_station_id: faultStationId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface LinkableOrder {
  id: string; order_number: string; patient_name: string | null; status: string | null; created_at: string;
  work_type: string | null; delivery_date: string | null;
}
/** Bağlanacak ebeveyn sipariş araması — sipariş no/hasta ile (RLS lab'a sınırlar). */
export async function searchLinkableOrders(query: string, excludeId?: string, patientName?: string | null): Promise<LinkableOrder[]> {
  const q = query.trim();
  let req = supabase.from('work_orders')
    .select('id, order_number, patient_name, status, created_at, work_type, delivery_date')
    .or('is_archived.is.null,is_archived.eq.false')
    .order('created_at', { ascending: false })
    .limit(50);
  // Devam/revizyon aynı hastaya bağlanır → yalnız aynı hasta adındaki siparişler.
  const pn = patientName?.trim();
  if (pn) req = req.ilike('patient_name', pn);   // wildcard yok = case-insensitive tam eşleşme
  if (q) req = req.or(`order_number.ilike.%${q}%,patient_name.ilike.%${q}%`);
  const { data } = await req;
  return ((data ?? []) as LinkableOrder[]).filter(o => o.id !== excludeId);
}

export interface RevisionLink {
  id: string;
  order_number: string;
  revision_no?: number | null;
  revision_responsible?: RevisionResponsible | null;
  status?: string | null;
}

/** Siparişin revizyon bağlantıları: kaynağı (bunun revizyonu olduğu sipariş)
 *  + bundan açılmış revizyonlar. Rozetlerde karşılıklı gösterilir. */
export async function fetchRevisionLinks(
  orderId: string,
  revisionOfId?: string | null,
): Promise<{ parent: RevisionLink | null; children: RevisionLink[] }> {
  const [parentRes, childRes] = await Promise.all([
    revisionOfId
      ? supabase.from('work_orders')
          .select('id, order_number, revision_no, revision_responsible, status')
          .eq('id', revisionOfId).maybeSingle()
      : Promise.resolve({ data: null } as any),
    supabase.from('work_orders')
      .select('id, order_number, revision_no, revision_responsible, status')
      .eq('revision_of_id', orderId)
      .order('revision_no', { ascending: true }),
  ]);
  return {
    parent:   (parentRes?.data as RevisionLink) ?? null,
    children: ((childRes as any)?.data as RevisionLink[]) ?? [],
  };
}

// ─── Yeniden-yapım (remake) KPI ──────────────────────────────────────────────

export interface RemakeRow {
  id: string;
  order_number: string;
  created_at: string;
  revision_reason: string | null;
  revision_responsible: RevisionResponsible | null;
  fault_station: string | null;
  parent_order_number: string | null;
}

export interface RemakeStats {
  delivered: number;          // dönemde teslim edilen sipariş
  revisionsLab: number;       // lab kaynaklı revizyon (garanti)
  revisionsClient: number;    // hekim kaynaklı revizyon (ücretli)
  rate: number;               // yeniden-yapım oranı % = lab / teslim
  byStation: { name: string; count: number }[];
  rows: RemakeRow[];
}

/** Yeniden-yapım panosu verisi. RLS lab'a göre kapsar; ek filtre gerekmez.
 *  Oran = dönemdeki LAB kaynaklı revizyon / dönemde teslim edilen sipariş. */
export async function fetchRemakeStats(from: string, to: string): Promise<RemakeStats> {
  const [deliveredRes, revRes] = await Promise.all([
    supabase.from('work_orders')
      .select('id', { count: 'exact', head: true })
      .gte('delivered_at', from).lte('delivered_at', `${to}T23:59:59`),
    supabase.from('work_orders')
      .select('id, order_number, created_at, revision_reason, revision_responsible, station:revision_fault_station_id(name), parent:revision_of_id(order_number)')
      .not('revision_of_id', 'is', null)
      .gte('created_at', from).lte('created_at', `${to}T23:59:59`)
      .order('created_at', { ascending: false }),
  ]);

  const rows: RemakeRow[] = ((revRes.data ?? []) as any[]).map(r => ({
    id: r.id,
    order_number: r.order_number,
    created_at: r.created_at,
    revision_reason: r.revision_reason ?? null,
    revision_responsible: r.revision_responsible ?? null,
    fault_station: r.station?.name ?? null,
    parent_order_number: r.parent?.order_number ?? null,
  }));

  const revisionsLab    = rows.filter(r => r.revision_responsible === 'lab').length;
  const revisionsClient = rows.filter(r => r.revision_responsible === 'client').length;
  const delivered       = deliveredRes.count ?? 0;

  // İstasyon kırılımı — yalnız lab kaynaklılar (hekim değişikliği hata değildir)
  const stationMap = new Map<string, number>();
  rows.filter(r => r.revision_responsible === 'lab').forEach(r => {
    const k = r.fault_station ?? 'Belirtilmemiş';
    stationMap.set(k, (stationMap.get(k) ?? 0) + 1);
  });
  const byStation = [...stationMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    delivered,
    revisionsLab,
    revisionsClient,
    rate: delivered > 0 ? (revisionsLab / delivered) * 100 : 0,
    byStation,
    rows,
  };
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

/**
 * Kurye hareketinin amacı. `teslimat` = siparişin final teslimatı (timeline'daki
 * Kurye aşamasını besleyen kayıt); diğerleri üretim sırasındaki ara hareketler.
 */
export type DeliveryPurpose =
  | 'teslimat' | 'model_alma' | 'eksik_parca'
  | 'prova_gidis' | 'prova_donus' | 'iade' | 'diger';

export type DeliveryDirection = 'lab_to_clinic' | 'clinic_to_lab';

export const DELIVERY_PURPOSE_LABELS: Record<DeliveryPurpose, string> = {
  teslimat:    'Teslimat',
  model_alma:  'Model alma',
  eksik_parca: 'Eksik parça',
  prova_gidis: 'Prova gidiş',
  prova_donus: 'Prova dönüş',
  iade:        'İade',
  diger:       'Diğer',
};

/** Teslimat oluştur (internal kurye veya external firma). */
export async function createDelivery(params: {
  workOrderId: string;
  mode: 'internal' | 'external';
  courierId?: string;
  externalProvider?: string;
  externalTrackingNo?: string;
  notes?: string;
  /** Varsayılan 'teslimat' — ara kurye hareketlerinde amaç verilir. */
  purpose?: DeliveryPurpose;
  direction?: DeliveryDirection;
  /** Kurye ücreti; verilmezse sonradan setDeliveryFee ile girilebilir. */
  feeAmount?: number | null;
  /** Verilmezse lab'ın baz para birimi kullanılır. */
  feeCurrency?: string | null;
  feeSource?: 'banabikurye' | 'manuel' | 'shipink';
  /** Çağrı anındaki üretim aşaması adı. */
  stageSnapshot?: string | null;
}): Promise<{ ok: boolean; deliveryId?: string; error?: string }> {
  const { data, error } = await supabase.rpc('create_delivery', {
    p_work_order_id:        params.workOrderId,
    p_mode:                 params.mode,
    p_courier_id:           params.courierId ?? null,
    p_external_provider:    params.externalProvider ?? null,
    p_external_tracking_no: params.externalTrackingNo ?? null,
    p_notes:                params.notes ?? null,
    p_purpose:              params.purpose ?? 'teslimat',
    p_direction:            params.direction ?? 'lab_to_clinic',
    p_fee_amount:           params.feeAmount ?? null,
    p_fee_currency:         params.feeCurrency ?? null,
    p_fee_source:           params.feeSource ?? null,
    p_stage_snapshot:       params.stageSnapshot ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, deliveryId: data as string };
}

/** Kurye ücretini sonradan gir / düzelt (lab manager + admin). */
export async function setDeliveryFee(
  deliveryId: string,
  amount: number | null,
  currency?: string | null,
  source: 'banabikurye' | 'manuel' | 'shipink' = 'manuel',
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('set_delivery_fee', {
    p_delivery_id: deliveryId,
    p_amount:      amount,
    p_currency:    currency ?? null,
    p_source:      source,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
  /** Sipariş anındaki para birimi (lab_services.currency / resolve_item_price).
   *  Yazılmazsa NULL kalır → tüketiciler lab varsayılanına düşer. Fiyatı olan
   *  her kalemde DOLDUR: yoksa 7 EUR ekranda ₺7 olarak görünür. */
  currency?: string;
  quantity?: number;
  notes?: string;
  /** Bu hizmete denk gelen diş FDI numaraları (renk haritası + raporlama için) */
  tooth_numbers?: number[];
}) {
  // Custom (hizmet seçilmemiş) kalemde service_id "" olabilir → uuid kolonuna ""
  // gitmesin (invalid input syntax for type uuid). "" veya undefined → NULL.
  const clean = { ...data, service_id: data.service_id || null };
  return supabase.from('order_items').insert(clean).select().single();
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
  /** İmplant alanları — anahtar gönderilirse yazılır (null = temizle). */
  implant_brand?: string | null;
  implant_teeth?: number[] | null;
  implant_details?: Record<string, { system: string; type: string; abutment: string; screw: string }> | null;
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
  /** Lab'a ait, bu istasyonla eşleşen stok kalemleri (tahmin motoru için) */
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
  /** Lab'a ait TÜM aktif stok kalemleri (modal "Stoktan seç" picker'ı için) */
  allStockItems: Array<{
    id: string;
    name: string;
    category: string | null;
    unit: string | null;
    quantity: number;
    unit_cost: number | null;
    /** Paket içeriği (örn 50) — doluysa tüketim content_unit'te girilir, kesirli adet düşer */
    pack_size: number | null;
    content_unit: string | null;
    /** Kalemin maliyet para birimi (EUR/USD/TRY…) */
    currency: string | null;
    /** Bu malzemenin kullanılabileceği aşamalar (istasyon adları). Boş = genel. */
    usable_stages: string[] | null;
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
      .select('id, name, category, type, unit, quantity, unit_cost, units_per_tooth, consume_at_stage, pack_size, content_unit, last_unit_cost_currency, default_purchase_currency')
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
    candidateItems = (items ?? []).map((it: any) => ({
      ...it,
      currency: it.last_unit_cost_currency || it.default_purchase_currency || 'TRY',
    }));
  }

  // 3) Modal picker için labın TÜM aktif stok kalemleri (istasyon/kategori
  //    filtresi yok — teknisyen elle istediği kalemi seçebilsin). consumes_materials
  //    false olsa bile picker çalışsın diye yalnız labId'ye bağlı.
  let allStockItems: any[] = [];
  if (labId) {
    const { data: allItems } = await supabase
      .from('stock_items')
      .select('id, name, category, unit, quantity, unit_cost, pack_size, content_unit, usable_stages, last_unit_cost_currency, default_purchase_currency')
      .eq('lab_id', labId)
      .eq('is_active', true)
      .order('name');
    allStockItems = (allItems ?? []).map((it: any) => ({
      id: it.id,
      name: it.name,
      category: it.category,
      unit: it.unit,
      quantity: it.quantity,
      unit_cost: it.unit_cost,
      pack_size: it.pack_size ?? null,
      content_unit: it.content_unit ?? null,
      currency: it.last_unit_cost_currency || it.default_purchase_currency || 'TRY',
      usable_stages: Array.isArray(it.usable_stages) ? it.usable_stages : null,
    }));
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
      allStockItems,
    },
  };
}

/**
 * Modaldan hızlı stok kalemi oluştur — teknisyen ihtiyaç duyduğu malzeme
 * stokta yoksa buradan ekler, satıra bağlanır ve onayda düşer.
 * RLS "Lab users manage stock_items" ile lab_id = get_my_lab_id() zorunlu;
 * lab_id açıkça verilir (order.lab_id).
 */
export async function createStockItem(input: {
  lab_id: string;
  name: string;
  unit?: string | null;
  category?: string | null;
  quantity?: number;
  unit_cost?: number;
  consume_at_stage?: string | null;
  pack_size?: number | null;
  content_unit?: string | null;
  currency?: string | null;
  usable_stages?: string[] | null;
}): Promise<{
  data: {
    id: string; name: string; category: string | null; unit: string | null;
    quantity: number; unit_cost: number | null;
    pack_size: number | null; content_unit: string | null; currency: string | null;
    usable_stages: string[] | null;
  } | null;
  error?: string;
}> {
  const ccy = input.currency || 'TRY';
  const { data, error } = await supabase
    .from('stock_items')
    .insert({
      lab_id: input.lab_id,
      name: input.name.trim(),
      unit: input.unit ?? null,
      category: input.category ?? null,
      quantity: input.quantity ?? 0,
      unit_cost: input.unit_cost ?? 0,
      consume_at_stage: input.consume_at_stage ?? null,
      pack_size: input.pack_size ?? null,
      content_unit: input.content_unit ?? null,
      usable_stages: (input.usable_stages && input.usable_stages.length) ? input.usable_stages : null,
      default_purchase_currency: ccy,
      last_unit_cost_currency: ccy,
      usage_category: 'production',
    })
    .select('id, name, category, unit, quantity, unit_cost, pack_size, content_unit, usable_stages, last_unit_cost_currency, default_purchase_currency')
    .single();
  if (error) return { data: null, error: error.message };
  const d: any = data;
  return {
    data: {
      id: d.id, name: d.name, category: d.category, unit: d.unit,
      quantity: d.quantity, unit_cost: d.unit_cost,
      pack_size: d.pack_size ?? null, content_unit: d.content_unit ?? null,
      currency: d.last_unit_cost_currency || d.default_purchase_currency || 'TRY',
      usable_stages: Array.isArray(d.usable_stages) ? d.usable_stages : null,
    },
  };
}

// ── Miktarsız malzeme seçimi (Envanter D2) ─────────────────────────────────

/** Bu aşamada seçilebilecek üretim malzemesi + ona bağlı gerçek stok kalemi */
export interface StageMaterialOption {
  production_material_id: string;
  production_code: string;
  production_name: string;
  /** false → seçilebilir ama tüketim hesaplanamaz (stok düşmez) */
  has_rule: boolean;
  stock_item_id: string;
  stock_item_name: string;
  stock_unit: string | null;
  quantity: number;
  already_selected: number;
}

/** Labın miktarsız akışı açık mı? Kapalıysa eski miktar girişli modal kullanılır. */
export async function fetchQtylessEnabled(): Promise<boolean> {
  const { data, error } = await supabase
    .from('lab_settings')
    .select('inventory_qtyless_enabled')
    .maybeSingle();
  if (error || !data) return false;
  return !!(data as any).inventory_qtyless_enabled;
}

export async function fetchStageMaterialOptions(
  stageId: string,
): Promise<{ data: StageMaterialOption[]; error?: string }> {
  const { data, error } = await supabase.rpc('list_stage_material_options', {
    p_stage_id: stageId,
  });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as StageMaterialOption[] };
}

/**
 * Miktarsız onay. Teknisyen yalnız kullandığı ürünleri gönderir; miktarı
 * profil hesaplar. Aynı ürün birden çok kez gönderilirse ayrı kullanım
 * olayı olur (fire / yeniden üretim).
 */
export async function confirmStageMaterialsV2(
  stageId: string,
  selections: { stock_item_id: string; usage_kind?: 'normal' | 'fire' | 'rework' }[],
  advanceStage = true,
  idempotencyKey?: string | null,
): Promise<{ ok: boolean; applied?: number; pending?: number; error?: string }> {
  const { data, error } = await supabase.rpc('confirm_stage_materials_v2', {
    p_stage_id: stageId,
    p_selections: selections,
    p_advance_stage: advanceStage,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as { applied?: number; pending?: number };
  return { ok: true, applied: r.applied ?? 0, pending: r.pending ?? 0 };
}

/**
 * Onay oturumu başına benzersiz idempotency anahtarı.
 * Aynı anahtarla yapılan tekrar denemeler stoğu İKİNCİ KEZ düşürmez
 * (ağ zaman aşımı, çift dokunuş, fallback zinciri).
 */
export function newIdempotencyKey(prefix = 'stage-mat'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}:${rand}`;
}

/**
 * Stage'ı malzeme onayıyla birlikte tamamla — confirm_stage_materials RPC
 *
 * @param stageId Stage uuid
 * @param lines Onaylı malzeme satırları (estimated + actual + waste)
 * @param advanceStage true → stage tamamlandı'ya çevir + sıradakini aktif et
 * @param idempotencyKey Aynı onay için tekrar denemelerde AYNI anahtar gönderilmeli
 */
export async function confirmStageMaterials(
  stageId: string,
  lines: any[],
  advanceStage = true,
  idempotencyKey?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('confirm_stage_materials', {
    p_stage_id: stageId,
    p_lines: lines,
    p_advance_stage: advanceStage,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
