// supabase/functions/medit-webhook/index.ts
// ───────────────────────────────────────────────────────────────────────────
// Medit Link Webhook Receiver — Schema 2022-01-28
//
// Reference: Medit Link Webhook Guide (Last Revised: April 17, 2023)
//   https://data.meditlink.com/MeditLink/Webhook/23.04.17_Webhook_Documents_En.pdf
//
// ─── Headers (Medit gönderir) ─────────────────────────────────────────────
//   • x-meditlink-event-code     : "case.created" gibi event adı
//   • x-meditlink-signature      : HMAC-SHA256(raw body, signing_secret) hex
//   • content-type               : application/json
//
// ─── Body shape ────────────────────────────────────────────────────────────
// { schemaVersion: "2022-01-28", dateIssued: "...", <entity>: {...} }
//   entity = patient | case | files[] | order | delivery
//
// ─── Event matrix (PDF "How to Use") ──────────────────────────────────────
//   Clinic Account User: order.created (Case Order), order.deleted (Cancellation)
//   Lab Account User   : order.updated (Accept/Reject)
//   Both Users         : case.created, case.updated, case.deleted
//
// ─── Quirks for Lab account ───────────────────────────────────────────────
//   • patient.* sadece clinic'e; lab sadece case.patient.uuid alır
//   • order.created'da case.uuid yok
//   • order.updated case/files sadece accept eden lab'a gider
//   • files.upload.updated SUCCEED iken download.url verilir
//
// ─── ENV ──────────────────────────────────────────────────────────────────
//   MEDIT_WEBHOOK_TOKEN   - ?token=xxx ile gelmeli (manuel auth)
//   MEDIT_SIGNING_SECRET  - opsiyonel HMAC-SHA256 doğrulama
//   MEDIT_DEFAULT_LAB_ID  - labs.id (work_orders.lab_id FK)
//
// ─── Genel kurallar ───────────────────────────────────────────────────────
//   • Her durumda 200 dönülür (auth/signature dışında). Medit retry'da broken
//     endpoint diye işaretlemesin.
//   • Tüm INSERT'ler idempotent (external_id + external_source unique).
// ───────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-meditlink-event-code, x-meditlink-signature',
};
const SRC = 'medit_link';

// ─── PDF guide tip'leri ───────────────────────────────────────────────────
type MeditPatient = {
  code?: string | null; name?: string; uuid?: string;
  dateCreated?: string; dateUpdated?: string;
};
type CaseStatus = 'FORM'|'SCAN'|'NEED_PROCESSING'|'CAD'|'CAM'|'MILL'|'COMPLETED';
type MeditCase = {
  uuid?: string; name?: string; status?: CaseStatus;
  patient?: { uuid?: string; name?: string };
  dateScanned?: string | null; dateCreated?: string; dateUpdated?: string;
};
type FileType = 'SCAN_DATA'|'CAD_DATA'|'CAM_DATA'|'MILLING_DATA'|'ATTACHED_DATA';
type UploadStatus = 'LOCAL_ONLY'|'STARTED'|'SUCCEED'|'FAILED';
type MeditFile = {
  uuid?: string; name?: string; size?: number;
  fileType?: FileType; uploadStatus?: UploadStatus;
  dateCreated?: string; dateUpdated?: string;
  case?: { uuid?: string };
  download?: {
    fileName?: string; size?: number; dateExpired?: string; url?: string;
    hashValue?: string; hashAlgorithm?: string;
  };
};
type OrderStatus = 'PENDING'|'ACCEPTED'|'REJECTED'|'COMPLETED';
type MeditOrder = {
  orderNumber?: number | string;
  seller?: { name?: string; uuid?: string };
  buyer?:  { name?: string; uuid?: string } | null;
  case?:   { name?: string; uuid?: string; status?: CaseStatus };
  files?:  MeditFile[] | null;
  status?: OrderStatus;
  description?: string;
  dateCreated?: string; dateDesiredDelivery?: string; dateUpdated?: string;
};
type DeliveryStatus = 'PLANNING'|'READY'|'STARTED'|'ARRIVED'|'RECEIVED';
type MeditDelivery = {
  uuid?: string; trackingNumber?: string; company?: string; message?: string;
  status?: DeliveryStatus;
  dateCreated?: string; dateScheduled?: string | null; dateUpdated?: string;
  order?: { orderNumber?: number | string };
};
type Body = {
  schemaVersion?: string; dateIssued?: string;
  patient?:  MeditPatient;
  case?:     MeditCase;
  files?:    MeditFile[];
  order?:    MeditOrder;
  delivery?: MeditDelivery;
};

// ─── HMAC-SHA256 (Appendix B) ────────────────────────────────────────────
async function verifyHmac(raw: string, signatureHex: string | null, secret: string) {
  if (!signatureHex) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === signatureHex.toLowerCase();
}

// ─── Server ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Health check (GET) → Medit "verification" yapıyorsa kabul et
  if (req.method === 'GET') return j({ ok: true, service: 'medit-webhook' });

  if (req.method !== 'POST') return j({ error: 'method' }, 405);

  // 1) Token auth — opsiyonel ?token= veya x-webhook-token
  const expectedToken = Deno.env.get('MEDIT_WEBHOOK_TOKEN');
  if (expectedToken) {
    const url = new URL(req.url);
    const got = url.searchParams.get('token') ?? req.headers.get('x-webhook-token');
    if (got !== expectedToken) return j({ error: 'forbidden' }, 403);
  }

  // 2) Raw body — HMAC için + parse için aynı buffer
  const rawBody = await req.text();

  // 3) Signature (opsiyonel; secret tanımlıysa)
  const signingSecret = Deno.env.get('MEDIT_SIGNING_SECRET');
  if (signingSecret) {
    const ok = await verifyHmac(rawBody, req.headers.get('x-meditlink-signature'), signingSecret);
    if (!ok) return j({ error: 'invalid signature' }, 401);
  }

  // 4) Parse — invalid JSON gelse bile 200 (Medit retry'da pasifleştirmesin)
  let body: Body = {};
  if (rawBody.trim()) {
    try { body = JSON.parse(rawBody); }
    catch (e: any) {
      console.warn('[medit] invalid json', e?.message, rawBody.slice(0, 200));
      return j({ ok: true, ignored: 'invalid_json' });
    }
  }

  // 5) Event header
  const event = (req.headers.get('x-meditlink-event-code') ?? '').toLowerCase();
  console.log('[medit]', event || '(no-event)', '→', rawBody.slice(0, 300));

  if (!event) return j({ ok: true, ignored: 'no_event_header' });

  // 6) Supabase admin
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const defaultLabId = Deno.env.get('MEDIT_DEFAULT_LAB_ID') ?? null;

  // ─── Otomatik iş emri oluşturma — ŞİMDİLİK DEVRE DIŞI ──────────────────
  // case.created / case.updated (backfill) / order.created event'lerinde
  // work_orders insert atılmaz. Diğer event'ler (patient, files, delivery,
  // case.deleted) çalışmaya devam eder. Açmak için: false yap.
  const AUTO_CREATE_WO_DISABLED = true;

  try {
    switch (event) {
      // ═══════════════════════════════════════════════════════════════════
      // PATIENT EVENTS (clinic account only) — uuid→name mapping
      // ═══════════════════════════════════════════════════════════════════
      case 'patient.created':
      case 'patient.updated': {
        const p = body.patient;
        if (!p?.uuid) return j({ ok: true, ignored: 'no_uuid' });
        await supabase.from('medit_patients').upsert({
          uuid:         p.uuid,
          name:         p.name ?? null,
          code:         p.code ?? null,
          date_created: p.dateCreated ?? null,
          date_updated: p.dateUpdated ?? null,
          deleted_at:   null,
          synced_at:    new Date().toISOString(),
        }, { onConflict: 'uuid' });

        // Aynı patient'a bağlı önceki work_orders'lerin patient_name'ini güncelle
        if (p.name) {
          const { data: rows } = await supabase
            .from('work_orders')
            .select('id, notes')
            .eq('external_source', SRC)
            .like('notes', `%patient_uuid=${p.uuid}%`);
          if (rows?.length) {
            await supabase.from('work_orders')
              .update({ patient_name: p.name })
              .in('id', rows.map((r: any) => r.id));
          }
        }
        return j({ ok: true });
      }

      case 'patient.deleted': {
        const p = body.patient;
        if (!p?.uuid) return j({ ok: true, ignored: 'no_uuid' });
        await supabase.from('medit_patients')
          .update({ deleted_at: new Date().toISOString() })
          .eq('uuid', p.uuid);
        return j({ ok: true });
      }

      // ═══════════════════════════════════════════════════════════════════
      // CASE EVENTS
      // ═══════════════════════════════════════════════════════════════════
      case 'case.created': {
        if (AUTO_CREATE_WO_DISABLED) return j({ ok: true, ignored: 'auto_wo_disabled' });
        const c = body.case;
        if (!c?.uuid) return j({ ok: true, ignored: 'no_uuid' });
        const { data: exists } = await supabase.from('work_orders')
          .select('id').eq('external_source', SRC).eq('external_id', c.uuid).maybeSingle();
        if (exists) return j({ ok: true, dedup: true });

        const patientLabel = await resolvePatientName(supabase, c);
        const { data: wo, error } = await supabase.from('work_orders').insert({
          external_id: c.uuid, external_source: SRC,
          lab_id: defaultLabId,
          patient_name: patientLabel,
          notes: `Medit case: ${c.name ?? ''} · status=${c.status ?? 'FORM'}` + (c.patient?.uuid ? ` · patient_uuid=${c.patient.uuid}` : ''),
          status: 'alindi',
          tooth_numbers: [],
          work_type: 'medit_import',
          machine_type: 'milling',
          delivery_date: dayPlus(7),
          created_at: c.dateCreated ?? new Date().toISOString(),
        }).select('id').single();
        if (error) { console.error('[medit] case.created insert', error.message); return j({ ok: true, error: error.message }); }
        return j({ ok: true, work_order_id: wo!.id });
      }

      case 'case.updated': {
        const c = body.case;
        if (!c?.uuid) return j({ ok: true, ignored: 'no_uuid' });

        // Önce var mı bak — yoksa upsert (eski case'leri backfill için)
        const { data: exists } = await supabase.from('work_orders')
          .select('id').eq('external_source', SRC).eq('external_id', c.uuid).maybeSingle();

        if (!exists) {
          // Backfill: webhook eklenmeden önceki case için ilk kez INSERT
          if (AUTO_CREATE_WO_DISABLED) return j({ ok: true, ignored: 'auto_wo_disabled_backfill' });
          const patientLabel = await resolvePatientName(supabase, c);
          const { data: wo, error } = await supabase.from('work_orders').insert({
            external_id: c.uuid, external_source: SRC,
            lab_id: defaultLabId,
            patient_name: patientLabel,
            notes: `Medit case (backfill): ${c.name ?? ''} · status=${c.status ?? 'FORM'}` + (c.patient?.uuid ? ` · patient_uuid=${c.patient.uuid}` : ''),
            status: 'alindi',
            tooth_numbers: [],
            work_type: 'medit_import',
            machine_type: 'milling',
            delivery_date: dayPlus(7),
            created_at: c.dateCreated ?? new Date().toISOString(),
          }).select('id').single();
          if (error) { console.error('[medit] case.updated backfill insert', error.message); return j({ ok: true, error: error.message }); }
          return j({ ok: true, backfilled: true, work_order_id: wo!.id });
        }

        // Var → UPDATE
        const upd: Record<string, unknown> = {};
        if (c.name)   upd.patient_name = c.name;
        if (c.status) upd.notes        = `Medit status: ${c.status}`;
        if (Object.keys(upd).length) {
          await supabase.from('work_orders').update(upd)
            .eq('external_source', SRC).eq('external_id', c.uuid);
        }
        return j({ ok: true });
      }

      case 'case.deleted': {
        const c = body.case;
        if (!c?.uuid) return j({ ok: true, ignored: 'no_uuid' });
        await supabase.from('work_orders')
          .update({ archived_at: new Date().toISOString() })
          .eq('external_source', SRC).eq('external_id', c.uuid);
        return j({ ok: true });
      }

      // ═══════════════════════════════════════════════════════════════════
      // FILES EVENTS
      // ═══════════════════════════════════════════════════════════════════
      case 'files.created':
      case 'files.updated':
      case 'files.upload.updated': {
        const files = body.files ?? [];
        if (!files.length) return j({ ok: true, ignored: 'no_files' });
        const caseUuid = files[0]?.case?.uuid;
        if (!caseUuid) return j({ ok: true, ignored: 'no_case_uuid' });

        const { data: wo } = await supabase.from('work_orders')
          .select('id, lab_id')
          .eq('external_source', SRC).eq('external_id', caseUuid)
          .maybeSingle();
        if (!wo) return j({ ok: true, ignored: 'work_order_not_found' });

        let inserted = 0;
        for (const f of files) {
          if (!f.uuid) continue;
          // dedup
          const { data: dupe } = await supabase.from('work_order_photos')
            .select('id').eq('external_source', SRC).eq('external_id', f.uuid).maybeSingle();
          if (dupe) continue;
          // SUCCEED'de download.url var, diğerlerinde external_id ile placeholder
          const storagePath = f.download?.url ?? `medit://${f.uuid}`;
          await supabase.from('work_order_photos').insert({
            work_order_id:   (wo as any).id,
            storage_path:    storagePath,
            caption:         `${f.fileType ?? 'Medit'} · ${f.name ?? f.uuid}`,
            lab_id:          (wo as any).lab_id ?? defaultLabId,
            external_id:     f.uuid,
            external_source: SRC,
          });
          inserted++;
        }
        return j({ ok: true, inserted, total: files.length });
      }

      case 'files.deleted': {
        const files = body.files ?? [];
        for (const f of files) {
          if (!f.uuid) continue;
          await supabase.from('work_order_photos').delete()
            .eq('external_source', SRC).eq('external_id', f.uuid);
        }
        return j({ ok: true });
      }

      // ═══════════════════════════════════════════════════════════════════
      // ORDER EVENTS — clinic↔lab sipariş akışı
      // ═══════════════════════════════════════════════════════════════════
      case 'order.created': {
        if (AUTO_CREATE_WO_DISABLED) return j({ ok: true, ignored: 'auto_wo_disabled' });
        const o = body.order;
        if (!o?.orderNumber) return j({ ok: true, ignored: 'no_orderNumber' });
        const extId = `order_${o.orderNumber}`;
        const { data: exists } = await supabase.from('work_orders')
          .select('id').eq('external_source', SRC).eq('external_id', extId).maybeSingle();
        if (exists) return j({ ok: true, dedup: true });

        const noteParts = [
          o.description,
          o.seller?.name && `Klinik: ${o.seller.name}`,
          o.buyer?.name  && `Lab: ${o.buyer.name}`,
        ].filter(Boolean);

        const { data: wo, error } = await supabase.from('work_orders').insert({
          external_id: extId, external_source: SRC,
          lab_id: defaultLabId,
          patient_name: o.case?.name ?? `Medit Sipariş #${o.orderNumber}`,
          notes:        noteParts.join(' · ') || null,
          status:       'alindi',
          tooth_numbers: [],
          work_type:     'medit_import',
          machine_type:  'milling',
          delivery_date: o.dateDesiredDelivery
            ? o.dateDesiredDelivery.slice(0, 10)
            : dayPlus(7),
          created_at: o.dateCreated ?? new Date().toISOString(),
        }).select('id').single();
        if (error) { console.error('[medit] order.created insert', error.message); return j({ ok: true, error: error.message }); }
        return j({ ok: true, work_order_id: wo!.id });
      }

      case 'order.updated': {
        const o = body.order;
        if (!o?.orderNumber) return j({ ok: true, ignored: 'no_orderNumber' });
        const extId = `order_${o.orderNumber}`;
        const upd: Record<string, unknown> = {};
        if (o.status === 'ACCEPTED')  upd.status = 'uretimde';
        if (o.status === 'COMPLETED') upd.status = 'teslimata_hazir';
        if (o.status === 'REJECTED')  upd.archived_at = new Date().toISOString();
        if (Object.keys(upd).length) {
          await supabase.from('work_orders').update(upd)
            .eq('external_source', SRC).eq('external_id', extId);
        }
        return j({ ok: true });
      }

      case 'order.deleted': {
        const o = body.order;
        if (!o?.orderNumber) return j({ ok: true, ignored: 'no_orderNumber' });
        await supabase.from('work_orders')
          .update({ archived_at: new Date().toISOString() })
          .eq('external_source', SRC).eq('external_id', `order_${o.orderNumber}`);
        return j({ ok: true });
      }

      // ═══════════════════════════════════════════════════════════════════
      // DELIVERY EVENTS
      // ═══════════════════════════════════════════════════════════════════
      case 'delivery.created': {
        const d = body.delivery;
        if (!d?.order?.orderNumber) return j({ ok: true, ignored: 'no_order' });
        const extId = `order_${d.order.orderNumber}`;
        const { data: wo } = await supabase.from('work_orders')
          .select('id, lab_id')
          .eq('external_source', SRC).eq('external_id', extId).maybeSingle();
        if (!wo) return j({ ok: true, ignored: 'work_order_not_found' });
        // deliveries — external mode
        await supabase.from('deliveries').insert({
          lab_id:               (wo as any).lab_id ?? defaultLabId,
          work_order_id:        (wo as any).id,
          mode:                 'external',
          external_provider:    d.company ?? 'Medit',
          external_tracking_no: d.trackingNumber ?? d.uuid ?? null,
          notes:                d.message ?? null,
          status:               'beklemede',
        });
        return j({ ok: true });
      }

      default:
        return j({ ok: true, ignored: true, event });
    }
  } catch (e: any) {
    console.error('[medit-webhook]', event, e?.message ?? e);
    // Medit retry'a girip pasifleştirmesin — 200 dön ama hata mesajı log'da
    return j({ ok: true, error: e?.message ?? 'internal' });
  }
});

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

function dayPlus(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

// Case'in patient.uuid'sini medit_patients tablosundan çözer.
// Fallback: case.patient.name → "Hasta #uuid" → case.name → "Medit Hasta"
async function resolvePatientName(supabase: any, c: MeditCase): Promise<string> {
  if (c.patient?.name) return c.patient.name;
  if (c.patient?.uuid) {
    const { data: p } = await supabase
      .from('medit_patients')
      .select('name')
      .eq('uuid', c.patient.uuid)
      .maybeSingle();
    if (p?.name) return p.name;
    return `Hasta #${c.patient.uuid}`;
  }
  return c.name ?? 'Medit Hasta';
}
