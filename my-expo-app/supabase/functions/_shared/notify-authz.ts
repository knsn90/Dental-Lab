// _shared/notify-authz.ts
//
// Bildirim yetkilendirme çekirdeği (F-01 düzeltmesi).
//
// İLKE: istemci bir bildirim TALEP edebilir ama YETKİYİ tanımlayamaz.
//   • userIds = TALEP edilen alıcılar (güvenilmez)
//   • Sunucu, çağıranın kimliğinden yetkiyi türetir ve zorlar.
//
// Yetki modeli (pattern C — kaynak ilişkisi):
//   Bir work_order bildirimi için MEŞRU alıcılar = o siparişin TARAFLARI:
//     - siparişin lab'ının personeli (lab/admin, lab_id = order.lab_id)
//     - siparişin hekimi (profiles.id = order.doctor_id)
//     - siparişin kliniğinin kullanıcıları (clinic_id = hekimin clinic_id'si)
//   Çağıran, work_order'ı RLS ile GÖREBİLMELİ (görebiliyorsa taraftır).
//   Kaynak yoksa: alıcılar yalnız çağıranın kendi lab'ından + kendisi.
//
// Servis-rol (admin) YALNIZCA yetki doğrulandıktan SONRA kullanılır
// (alıcı taraf-kümesini ve zenginleştirmeyi hesaplamak için) — asla yetki
// mekanizması olarak değil.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { timingSafeEqualStr, isServiceRoleBearer } from './security.ts';

export interface WorkOrderLite {
  id: string;
  lab_id: string | null;
  order_number: string | null;
  patient_name: string | null;
  work_type: string | null;
  status: string | null;
  delivery_date: string | null;
  is_urgent: boolean | null;
  clinic_name: string | null;
}

export interface NotifyRecipient {
  id: string;
  email: string | null;
  full_name: string | null;
  notification_prefs: any;
  lab_id: string | null;
}

export interface AuthzResult {
  ok: boolean;
  status: number;
  error?: string;
  trusted: boolean;                         // internal/system caller (secret or service-role)
  callerId: string | null;
  callerLab: string | null;
  isPlatformAdmin: boolean;
  recipients: NotifyRecipient[];            // AUTHORIZED, resolved profiles (send only to these)
  deniedUserIds: string[];                  // requested but not authorized
  workOrder: WorkOrderLite | null;          // only when caller is authorized for the resource
  brandLab: { id: string; name: string; logo: string } | null;
}

function fail(status: number, error: string): AuthzResult {
  return { ok: false, status, error, trusted: false, callerId: null, callerLab: null,
    isPlatformAdmin: false, recipients: [], deniedUserIds: [], workOrder: null, brandLab: null };
}

export async function authorizeNotification(opts: {
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  authHeader: string;
  internalSecret?: string;         // e.g. NOTIFY_FN_SECRET
  internalSecretHeader?: string | null;
  requestedUserIds: string[];
  resourceType?: string;
  resourceId?: string;
}): Promise<AuthzResult> {
  const admin = createClient(opts.supabaseUrl, opts.serviceKey, { auth: { persistSession: false } });
  const requested = [...new Set((opts.requestedUserIds ?? []).filter(Boolean))];
  const woId = (opts.resourceType === 'work_order' && opts.resourceId) ? String(opts.resourceId).trim() : '';

  // helper: minimal, explicit work_order projection (data minimization)
  const loadWoLite = async (id: string): Promise<WorkOrderLite | null> => {
    const { data: wo } = await admin.from('work_orders')
      .select('id, lab_id, order_number, patient_name, work_type, status, delivery_date, is_urgent, doctor_id')
      .eq('id', id).maybeSingle();
    if (!wo) return null;
    let clinic_name: string | null = null;
    if ((wo as any).doctor_id) {
      const { data: doc } = await admin.from('doctors').select('clinic:clinics(name)').eq('id', (wo as any).doctor_id).maybeSingle();
      clinic_name = (doc as any)?.clinic?.name ?? null;
    }
    return { id: (wo as any).id, lab_id: (wo as any).lab_id, order_number: (wo as any).order_number,
      patient_name: (wo as any).patient_name, work_type: (wo as any).work_type, status: (wo as any).status,
      delivery_date: (wo as any).delivery_date, is_urgent: (wo as any).is_urgent, clinic_name };
  };
  const brandOf = async (labId: string | null) => {
    if (!labId) return null;
    const { data: l } = await admin.from('labs').select('id, name, logo_url').eq('id', labId).maybeSingle();
    return l ? { id: (l as any).id, name: (l as any).name ?? '', logo: (l as any).logo_url ?? '' } : null;
  };
  const resolveProfiles = async (ids: string[]): Promise<NotifyRecipient[]> => {
    if (!ids.length) return [];
    const { data } = await admin.from('profiles')
      .select('id, email, full_name, notification_prefs, lab_id, is_active').in('id', ids);
    return ((data ?? []) as any[]).filter(p => p.is_active !== false)
      .map(p => ({ id: p.id, email: p.email, full_name: p.full_name, notification_prefs: p.notification_prefs, lab_id: p.lab_id }));
  };

  // ── 1) TRUSTED internal/system caller: secret match OR service-role bearer ──
  const secretOk = !!opts.internalSecret && opts.internalSecretHeader != null
    && timingSafeEqualStr(opts.internalSecretHeader, opts.internalSecret);
  const srvOk = isServiceRoleBearer(opts.authHeader, opts.serviceKey);
  if (secretOk || srvOk) {
    const wo = woId ? await loadWoLite(woId) : null;
    return { ok: true, status: 200, trusted: true, callerId: null, callerLab: null, isPlatformAdmin: false,
      recipients: await resolveProfiles(requested), deniedUserIds: [], workOrder: wo,
      brandLab: wo ? await brandOf(wo.lab_id) : null };
  }

  // ── 2) authenticate caller (untrusted client path) ──
  if (!opts.authHeader) return fail(401, 'Yetkisiz erişim');
  const userClient = createClient(opts.supabaseUrl, opts.anonKey, {
    global: { headers: { Authorization: opts.authHeader } }, auth: { persistSession: false } });
  const { data: ures, error: uerr } = await userClient.auth.getUser();
  if (uerr || !ures?.user) return fail(401, 'Yetkisiz erişim');
  const callerId = ures.user.id;
  const { data: me } = await admin.from('profiles').select('lab_id').eq('id', callerId).maybeSingle();
  const callerLab = (me as any)?.lab_id ?? null;
  const { data: pa } = await admin.from('platform_admins').select('user_id').eq('user_id', callerId).maybeSingle();
  const isPlatformAdmin = !!pa;

  // ── 3) platform admin may notify anyone ──
  if (isPlatformAdmin) {
    const wo = woId ? await loadWoLite(woId) : null;
    return { ok: true, status: 200, trusted: false, callerId, callerLab, isPlatformAdmin: true,
      recipients: await resolveProfiles(requested), deniedUserIds: [], workOrder: wo,
      brandLab: wo ? await brandOf(wo.lab_id) : (callerLab ? await brandOf(callerLab) : null) };
  }

  // ── 4) resource path: caller must SEE the work_order via RLS (authorization gate) ──
  let authorizedIds: string[] = [];
  let workOrder: WorkOrderLite | null = null;
  let brandLabId: string | null = callerLab;
  if (woId) {
    const { data: seen } = await userClient.from('work_orders').select('id').eq('id', woId).maybeSingle();
    if (seen) {
      // caller IS a party → service-role now justified to compute the party set
      const wo = await loadWoLite(woId);
      workOrder = wo;
      brandLabId = wo?.lab_id ?? callerLab;
      const partyIds = new Set<string>();
      if (wo?.lab_id) {
        const { data: staff } = await admin.from('profiles').select('id')
          .eq('lab_id', wo.lab_id).in('user_type', ['lab', 'admin']);
        for (const s of (staff ?? []) as any[]) partyIds.add(s.id);
      }
      // order's doctor (as a profile) + clinic users
      const { data: woFull } = await admin.from('work_orders').select('doctor_id').eq('id', woId).maybeSingle();
      const docId = (woFull as any)?.doctor_id ?? null;
      if (docId) {
        partyIds.add(docId); // doctor_id may be a profile id
        const { data: dp } = await admin.from('profiles').select('id, clinic_id').eq('id', docId).maybeSingle();
        let clinicId = (dp as any)?.clinic_id ?? null;
        if (!clinicId) {
          const { data: d } = await admin.from('doctors').select('clinic_id').eq('id', docId).maybeSingle();
          clinicId = (d as any)?.clinic_id ?? null;
        }
        if (clinicId) {
          const { data: cu } = await admin.from('profiles').select('id').eq('clinic_id', clinicId);
          for (const c of (cu ?? []) as any[]) partyIds.add(c.id);
        }
      }
      authorizedIds = requested.filter(id => partyIds.has(id));
    } else {
      // caller cannot see the work_order → NOT authorized for the resource:
      // no enrichment; fall back to same-lab recipients only.
      authorizedIds = [];
    }
  }

  // ── 5) no (authorized) resource: recipients limited to caller's own lab + self ──
  if (!workOrder) {
    const profs = await resolveProfiles(requested);
    authorizedIds = profs.filter(p => p.id === callerId || (callerLab && p.lab_id === callerLab)).map(p => p.id);
  }

  const recipients = await resolveProfiles(authorizedIds);
  const deniedUserIds = requested.filter(id => !authorizedIds.includes(id));
  const brandLab = await brandOf(brandLabId);
  return { ok: true, status: 200, trusted: false, callerId, callerLab, isPlatformAdmin: false,
    recipients, deniedUserIds, workOrder, brandLab };
}
