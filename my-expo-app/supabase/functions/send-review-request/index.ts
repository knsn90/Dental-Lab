// send-review-request — teslimden birkaç gün sonra hekime WhatsApp puan isteği
// (Meta is_degerlendirme şablonu, üç hızlı cevap düğmesi). Spec:
// docs/superpowers/specs/2026-11-03-whatsapp-puan-istegi-design.md
//
// Tek çağıran: DB'deki _review_dispatch (fn_review_request_tick, saatlik cron).
// Uygunluk, numara ve günde-bir sınırı DB'de karar verilir; satır buraya
// status='sending' olarak gelir. Burada yalnız son anda değişmiş olabilecekler
// yeniden doğrulanır (iş geri alındı / bu arada değerlendirildi / kimlik kapatıldı).
//
// Deploy: --no-verify-jwt (net.http_post anon + x-notify-secret ile çağırır).
// x-notify-secret ZORUNLU; NOTIFY_FN_SECRET tanımlı değilse 503 (fail closed).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { timingSafeEqualStr } from '../_shared/security.ts';
import { buildReviewTemplateMessage } from '../_shared/reviewRequest.ts';

const GRAPH_VERSION = 'v20.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notify-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const NOTIFY_SECRET  = Deno.env.get('NOTIFY_FN_SECRET') ?? '';

const admin = createClient(supabaseUrl, serviceRoleKey);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

// Yalnız hâlâ 'sending' olan satıra yazılır — saatlik bakım bu arada 'failed/timeout'
// yaptıysa üzerine yazılmaz.
async function finish(id: string, patch: Record<string, unknown>) {
  await admin.from('review_requests')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'sending');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  if (!NOTIFY_SECRET) {
    console.error('[send-review-request] NOTIFY_FN_SECRET tanımlı değil — istek reddedildi');
    return json({ ok: false, error: 'not_configured' }, 503);
  }
  if (!timingSafeEqualStr(req.headers.get('x-notify-secret') ?? '', NOTIFY_SECRET)) {
    return json({ ok: false, error: 'forbidden' }, 401);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }
  const requestId = String(body?.requestId ?? '').trim();
  if (!UUID_RE.test(requestId)) return json({ ok: true, skipped: 'not_found' });

  const { data: rr } = await admin.from('review_requests')
    .select('id, work_order_id, lab_id, phone_to, status')
    .eq('id', requestId).maybeSingle();
  if (!rr) return json({ ok: true, skipped: 'not_found' });
  if ((rr as any).status !== 'sending') return json({ ok: true, skipped: 'not_sending' });
  const r = rr as { id: string; work_order_id: string; lab_id: string; phone_to: string | null };

  // ── Son anda yeniden doğrulama ─────────────────────────────────────────────
  const { data: wo } = await admin.from('work_orders')
    .select('id, status, patient_name, order_number, work_type')
    .eq('id', r.work_order_id).maybeSingle();
  if (!wo || (wo as any).status !== 'teslim_edildi') {
    await finish(r.id, { status: 'skipped', skip_reason: 'not_delivered' });
    return json({ ok: true, skipped: 'not_delivered' });
  }
  const { data: rev } = await admin.from('order_reviews')
    .select('id').eq('work_order_id', r.work_order_id).limit(1).maybeSingle();
  if (rev) {
    await finish(r.id, { status: 'skipped', skip_reason: 'reviewed' });
    return json({ ok: true, skipped: 'reviewed' });
  }

  const { data: credRow } = await admin.from('provider_credentials')
    .select('credentials')
    .eq('lab_id', r.lab_id).eq('type', 'messaging').eq('provider', 'whatsapp-cloud').eq('is_active', true)
    .maybeSingle();
  const cred = (credRow as any)?.credentials ?? null;
  if (!cred?.phone_number_id || !cred?.access_token) {
    await finish(r.id, { status: 'skipped', skip_reason: 'no_wa_cred' });
    return json({ ok: true, skipped: 'no_wa_cred' });
  }
  if (!r.phone_to) {
    await finish(r.id, { status: 'skipped', skip_reason: 'no_phone' });
    return json({ ok: true, skipped: 'no_phone' });
  }

  // ── Gönderim ───────────────────────────────────────────────────────────────
  const w = wo as { patient_name: string | null; order_number: string | null; work_type: string | null };
  const message = buildReviewTemplateMessage({
    to: r.phone_to, requestId: r.id, patient: w.patient_name,
    orderNumber: w.order_number ?? '', workType: w.work_type,
  });

  let wamid: string | null = null;
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${cred.phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cred.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify(message),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(j?.messages)) {
      wamid = j.messages[0]?.id ?? null;
      await finish(r.id, { status: 'sent', sent_at: new Date().toISOString(), wamid, error: null });
    } else {
      const err = String(j?.error?.message ?? `HTTP ${res.status}`).slice(0, 500);
      await finish(r.id, { status: 'failed', error: err });
      return json({ ok: true, sent: false });
    }
  } catch (e) {
    await finish(r.id, { status: 'failed', error: String(e).slice(0, 500) });
    return json({ ok: true, sent: false });
  }

  // Sohbet botu açık lab'da giden mesaj sohbet geçmişine yazılır; webhook'un
  // echo'su bu wamid ile bizim mesajımız olarak tanınır.
  if (String(cred.chat_bot ?? '').toLowerCase() === 'on') {
    try {
      await admin.from('whatsapp_messages').insert({
        lab_id: r.lab_id, peer_phone: r.phone_to, direction: 'out',
        body: `Puan isteği: ${w.order_number ?? ''}`.trim(), wamid, source: 'bot',
      });
    } catch { /* sohbet kaydı opsiyonel */ }
  }

  return json({ ok: true, sent: true });
});
