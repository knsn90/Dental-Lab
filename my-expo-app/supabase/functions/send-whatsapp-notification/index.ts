/**
 * send-whatsapp-notification — WhatsApp kanal dispatcher (Twilio).
 *
 *   Bir veya birden çok kullanıcıya WhatsApp bildirimi gönderir.
 *   whatsapp_notifications tablosuna audit kaydı atar (pending → sent/failed).
 *
 *   Çağrı (dispatch.ts içinden):
 *     supabase.functions.invoke('send-whatsapp-notification', {
 *       body: {
 *         userIds: ['uuid-1'],
 *         category: 'new_order',
 *         payload: {
 *           title:     'Yeni iş emri',
 *           body:      'Klinik Saberi 24/A — zirkonya kron',
 *           actionUrl: 'https://siman.app/(lab)/order/abc',
 *           extra:     { orderNumber: 'WO-2310' },
 *         },
 *         notificationId: 'optional-uuid',
 *       },
 *     });
 *
 *   Gerekli env (Supabase Edge Function Secrets):
 *     TWILIO_ACCOUNT_SID      — ACxxxxxxxx
 *     TWILIO_AUTH_TOKEN       — auth token
 *     TWILIO_WHATSAPP_FROM    — gönderici, "whatsapp:" önekli.
 *                               Sandbox: whatsapp:+14155238886
 *                               Prod:    whatsapp:+90XXXXXXXXXX (onaylı sender)
 *   Opsiyonel — kategori bazlı Meta-onaylı şablon (Content SID, HXxxxx):
 *     TWILIO_TEMPLATE_NEW_ORDER, TWILIO_TEMPLATE_ORDER_STATUS,
 *     TWILIO_TEMPLATE_PAYMENT, TWILIO_TEMPLATE_APPROVAL
 *     → varsa ContentSid + ContentVariables({"1":title,"2":body}) ile gönderilir.
 *     → yoksa düz Body gönderilir (yalnız Sandbox / 24s müşteri penceresinde çalışır).
 *
 *   Pref kontrolü: profiles.notification_prefs.categories[cat].whatsapp == true
 *   Alıcı numarası: profiles.whatsapp_phone (E.164, örn. +905551112233)
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authorizeNotification } from '../_shared/notify-authz.ts';

const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
const supabaseSrvKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!;
const twilioSid      = Deno.env.get('TWILIO_ACCOUNT_SID')  ?? '';
const twilioToken    = Deno.env.get('TWILIO_AUTH_TOKEN')   ?? '';
const twilioFrom     = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '';

// Kategori → Content SID (opsiyonel onaylı şablon)
const TEMPLATE_BY_CATEGORY: Record<string, string> = {
  new_order:    Deno.env.get('TWILIO_TEMPLATE_NEW_ORDER')    ?? '',
  order_status: Deno.env.get('TWILIO_TEMPLATE_ORDER_STATUS') ?? '',
  payment:      Deno.env.get('TWILIO_TEMPLATE_PAYMENT')      ?? '',
  approval:     Deno.env.get('TWILIO_TEMPLATE_APPROVAL')     ?? '',
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Yetki: paylaşılan authorizeNotification helper'ı (F-01 düzeltmesi) ──
const NOTIFY_FN_SECRET = Deno.env.get('NOTIFY_FN_SECRET') ?? '';

interface WaPayload {
  title:      string;
  body?:      string;
  actionUrl?: string;
  extra?:     Record<string, unknown>;
}
interface RequestBody {
  userIds:         string[];
  category:        string;
  payload:         WaPayload;
  notificationId?: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

/** Telefon → E.164 (varsayılan ülke TR/+90). Yerel formatları (05XX, 5XX, 90XX) düzeltir. */
function normalizePhone(raw: string, defaultCc = '90'): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  if (hasPlus) return '+' + digits;
  if (digits.startsWith('00')) return '+' + digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return '+' + defaultCc + digits.slice(1);
  if (digits.length === 10 && digits.startsWith('5')) return '+' + defaultCc + digits;
  if (digits.startsWith(defaultCc) && digits.length === 12) return '+' + digits;
  return '+' + digits;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  if (!twilioSid || !twilioToken || !twilioFrom) {
    return json({ error: 'twilio_not_configured' }, 200);
  }

  let body: RequestBody;
  try { body = await req.json(); }
  catch { return json({ error: 'invalid_json' }, 400); }

  if (!body.userIds?.length) return json({ ok: true, sent: 0, reason: 'no_users' });

  // ── Yetkilendirme: çağıran yalnız YETKİLİ alıcılara gönderebilir (F-01) ──
  const authz = await authorizeNotification({
    supabaseUrl, anonKey, serviceKey: supabaseSrvKey,
    authHeader: req.headers.get('Authorization') ?? '',
    internalSecret: NOTIFY_FN_SECRET || undefined,
    internalSecretHeader: req.headers.get('x-notify-secret'),
    requestedUserIds: body.userIds ?? [],
    resourceType: (body.payload as any)?.resourceType, resourceId: (body.payload as any)?.resourceId,
  });
  if (!authz.ok) return json({ ok: false, error: authz.error }, authz.status);
  const recipients = authz.recipients;
  if (!recipients.length) return json({ ok: true, sent: 0, skipped: (body.userIds?.length ?? 0), reason: 'no_authorized_recipients' });

  const supabase = createClient(supabaseUrl, supabaseSrvKey);

  // 1. Yetkili alıcıların whatsapp_phone + prefs bilgisi (recipients numara taşımaz);
  //    yalnız authz'ın döndürdüğü id'ler sorgulanır — pref + numara filtrelenir.
  const recipientIds = recipients.map((r) => r.id);
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, full_name, whatsapp_phone, notification_prefs')
    .in('id', recipientIds);

  if (profErr) return json({ error: profErr.message }, 500);

  const cat = body.category;
  const targets = (profiles ?? []).filter((p: any) => {
    if (!p.whatsapp_phone) return false;
    const prefs = p.notification_prefs;
    if (!prefs || prefs.master_enabled === false) return false;
    if (prefs.channels?.whatsapp === false) return false;
    if (cat && prefs.categories?.[cat]?.whatsapp !== true) return false;  // opt-in
    return true;
  });

  if (targets.length === 0) {
    return json({ ok: true, sent: 0, skipped: body.userIds.length, reason: 'no_targets' });
  }

  // 2. audit insert (pending)
  const contentSid = (cat && TEMPLATE_BY_CATEGORY[cat]) || '';
  const auditRows = targets.map((p: any) => ({
    notification_id: body.notificationId ?? null,
    user_id:    p.id,
    phone_to:   normalizePhone(p.whatsapp_phone),
    category:   cat,
    template:   contentSid || 'freeform',
    payload:    body.payload as Record<string, unknown>,
    status:     'pending',
    provider:   'twilio',
  }));

  const { data: insertedRows } = await supabase
    .from('whatsapp_notifications')
    .insert(auditRows)
    .select('id, user_id, phone_to');

  // 3. Twilio Messages API'ye gönder (paralel)
  const messagesUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
  const authHeader  = 'Basic ' + btoa(`${twilioSid}:${twilioToken}`);
  const title = body.payload.title ?? '';
  const text  = body.payload.body ?? '';

  const results = await Promise.all((insertedRows ?? auditRows).map(async (audit: any) => {
    const to = `whatsapp:${audit.phone_to}`;
    const form = new URLSearchParams();
    form.set('To', to);
    form.set('From', twilioFrom);
    if (contentSid) {
      // Onaylı şablon — pozisyonel değişkenler: {{1}}=title, {{2}}=body
      form.set('ContentSid', contentSid);
      form.set('ContentVariables', JSON.stringify({ '1': title, '2': text }));
    } else {
      // Freeform (sandbox / 24s pencere)
      form.set('Body', text ? `${title}\n\n${text}` : title);
    }

    try {
      const resp = await fetch(messagesUrl, {
        method: 'POST',
        headers: {
          authorization: authHeader,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
      const data = await resp.json();
      if (!resp.ok) {
        const msg = data?.message ?? `HTTP ${resp.status}`;
        await supabase.from('whatsapp_notifications')
          .update({ status: 'failed', error: msg })
          .eq('id', audit.id);
        return { ok: false, error: msg };
      }
      await supabase.from('whatsapp_notifications')
        .update({ status: 'sent', provider_id: data?.sid ?? null, sent_at: new Date().toISOString() })
        .eq('id', audit.id);
      return { ok: true, sid: data?.sid };
    } catch (e: any) {
      await supabase.from('whatsapp_notifications')
        .update({ status: 'failed', error: e?.message ?? String(e) })
        .eq('id', audit.id);
      return { ok: false, error: e?.message };
    }
  }));

  const sent   = results.filter(r => r.ok).length;
  const failed = results.length - sent;

  // 4. notifications.delivered güncelle
  if (body.notificationId && sent > 0) {
    await supabase.from('notifications')
      .update({ delivered: { whatsapp: { ts: new Date().toISOString(), count: sent } } })
      .eq('id', body.notificationId)
      .then(() => null, () => null);
  }

  return json({ ok: true, sent, failed, totalTargets: targets.length });
});
