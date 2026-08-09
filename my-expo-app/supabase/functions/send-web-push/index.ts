/**
 * send-web-push — Web Push notification dispatcher
 *
 *   Bir veya birden çok kullanıcının push_tokens (platform='web')
 *   subscription endpoint'lerine VAPID-imzalı POST gönderir.
 *
 *   Çağrı:
 *     supabase.functions.invoke('send-web-push', {
 *       body: {
 *         userIds: ['uuid-1', 'uuid-2'],
 *         payload: {
 *           title:   'Yeni iş emri',
 *           body:    'Klinik Saberi 24/A',
 *           icon:    '/icons/icon-192.png',
 *           tag:     'order-abc',
 *           data:    { url: '/(lab)/order/abc' },
 *         },
 *       },
 *     });
 *
 *   Gerekli env vars (Supabase Dashboard → Edge Functions → Secrets):
 *     VAPID_PUBLIC_KEY    — public key (web-push generate-vapid-keys)
 *     VAPID_PRIVATE_KEY   — private key (signing için)
 *     VAPID_SUBJECT       — mailto:..., genelde "mailto:noreply@nexadent.net"
 *
 *   notifications.delivered alanı güncellenir:
 *     { browser_push: { ts: ISO, count: N } }
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const supabaseUrl     = Deno.env.get('SUPABASE_URL')!;
const supabaseSrvKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const vapidPublicKey  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? '';
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const vapidSubject    = Deno.env.get('VAPID_SUBJECT')    ?? 'mailto:noreply@siman.app';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Yetki: iç çağrı (paylaşılan gizli / service-role) veya oturumlu kullanıcı ──
const NOTIFY_FN_SECRET = Deno.env.get('NOTIFY_FN_SECRET') ?? '';
async function assertCallerAuthorized(req: Request): Promise<boolean> {
  const secret = req.headers.get('x-notify-secret');
  if (NOTIFY_FN_SECRET && secret === NOTIFY_FN_SECRET) return true;
  const auth = req.headers.get('Authorization') ?? '';
  if (auth === `Bearer ${supabaseSrvKey}`) return true;
  try {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const { data, error } = await userClient.auth.getUser();
    return !error && !!data?.user;
  } catch { return false; }
}

interface PushPayload {
  title:  string;
  body?:  string;
  icon?:  string;
  badge?: string;
  tag?:   string;
  data?:  Record<string, unknown>;
  requireInteraction?: boolean;
  silent?: boolean;
}

interface RequestBody {
  userIds:        string[];
  payload:        PushPayload;
  notificationId?: string;  // notifications.id (opsiyonel — delivered alanı update için)
  /** notifications.category — pref kontrolü için */
  category?:      string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (!(await assertCallerAuthorized(req))) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    return json({ error: 'VAPID keys missing — set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in edge function secrets' }, 500);
  }

  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  if (!body.userIds?.length || !body.payload?.title) {
    return json({ error: 'userIds[] and payload.title required' }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseSrvKey);

  // 1. Pref kontrolü: hangi kullanıcılar browser_push almak istiyor?
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, notification_prefs')
    .in('id', body.userIds);

  if (profErr) return json({ error: profErr.message }, 500);

  const allowedUserIds = (profiles ?? [])
    .filter((p: any) => {
      const prefs = p.notification_prefs;
      if (!prefs || prefs.master_enabled === false) return false;
      if (prefs.channels?.browser_push === false) return false;
      const cat = body.category;
      if (cat && prefs.categories?.[cat]?.browser_push === false) return false;
      return true;
    })
    .map((p: any) => p.id as string);

  if (allowedUserIds.length === 0) {
    return json({ ok: true, sent: 0, skipped: body.userIds.length, reason: 'all_prefs_off' });
  }

  // 2. Subscription'ları topla
  const { data: tokens, error: tokErr } = await supabase
    .from('push_tokens')
    .select('id, user_id, token')
    .eq('platform', 'web')
    .in('user_id', allowedUserIds);

  if (tokErr) return json({ error: tokErr.message }, 500);
  if (!tokens?.length) return json({ ok: true, sent: 0, skipped: 0, reason: 'no_subscriptions' });

  // 3. Her endpoint'e push gönder (paralel)
  const payloadStr = JSON.stringify(body.payload);
  const results = await Promise.all(tokens.map(async (row: any) => {
    let sub: any;
    try { sub = JSON.parse(row.token); } catch { return { ok: false, error: 'invalid_token' }; }
    try {
      await webpush.sendNotification(sub, payloadStr);
      return { ok: true };
    } catch (e: any) {
      const code = e?.statusCode;
      // 404/410 — endpoint expired → token'ı sil
      if (code === 404 || code === 410) {
        await supabase.from('push_tokens').delete().eq('id', row.id);
        return { ok: false, error: 'expired', removed: true };
      }
      return { ok: false, error: e?.message ?? String(e), code };
    }
  }));

  const sent   = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;

  // 4. notifications.delivered güncelle
  // best-effort — PostgrestBuilder'da .catch() YOK (yalnız then), zincirlemek
  // TypeError atar → try/catch kullan. Ayrıca delivered ÜZERİNE YAZILMAMALI:
  // diğer kanalların (email/native push) kaydını silmemek için MERGE edilir.
  if (body.notificationId && sent > 0) {
    const patch = { browser_push: { ts: new Date().toISOString(), count: sent } };
    try {
      const { error } = await supabase.rpc('jsonb_merge_delivered' as any, {
        p_id: body.notificationId, p_patch: patch,
      });
      if (error) throw error;
    } catch {
      try {
        const { data: cur } = await supabase.from('notifications')
          .select('delivered').eq('id', body.notificationId).maybeSingle();
        await supabase.from('notifications')
          .update({ delivered: { ...((cur as any)?.delivered ?? {}), ...patch } })
          .eq('id', body.notificationId);
      } catch { /* delivered izleme opsiyonel */ }
    }
  }

  return json({ ok: true, sent, failed, totalSubs: tokens.length });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}
