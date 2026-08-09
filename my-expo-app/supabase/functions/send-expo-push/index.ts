/**
 * send-expo-push — Native push notification dispatcher (iOS + Android).
 *
 *   Bir veya birden çok kullanıcının push_tokens (platform='ios' | 'android')
 *   Expo push token'larına Expo Push API üzerinden bildirim gönderir.
 *
 *   Çağrı:
 *     supabase.functions.invoke('send-expo-push', {
 *       body: {
 *         userIds: ['uuid-1', 'uuid-2'],
 *         category: 'new_order',
 *         payload: {
 *           title:    'Yeni iş emri',
 *           body:     'Klinik Saberi 24/A',
 *           data:     { url: '/(lab)/order/abc' },
 *           sound:    'default',
 *           badge:    1,
 *           priority: 'high',
 *         },
 *       },
 *     });
 *
 *   Pref kontrolü: profiles.notification_prefs.categories[category].browser_push
 *   alanı kullanılıyor (in_app/email yanında "browser_push" alanı hem web hem
 *   native push için ortak — UI'da "Push" olarak gösteriliyor).
 *
 *   Expo Push API:
 *     https://exp.host/--/api/v2/push/send
 *     Body: ExpoPushMessage[] (max 100 per request)
 *     Response: { data: ExpoPushTicket[] }
 *       ticket.status === 'ok'    → kuyrukta
 *       ticket.status === 'error' → details.error: DeviceNotRegistered ise token sil
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
const supabaseSrvKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Expo Access Token opsiyonel — production'da güvenlik için tavsiye edilir.
// Generate: https://expo.dev/accounts/[user]/settings/access-tokens
const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
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

interface ExpoPushPayload {
  title:    string;
  body?:    string;
  data?:    Record<string, unknown>;
  sound?:   'default' | null;
  badge?:   number;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;    // Android
  ttl?:     number;
}

interface RequestBody {
  userIds:         string[];
  payload:         ExpoPushPayload;
  category?:       string;
  notificationId?: string;
}

interface ExpoPushTicket {
  status:  'ok' | 'error';
  id?:     string;
  message?: string;
  details?: { error?: string };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  if (!(await assertCallerAuthorized(req))) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  let body: RequestBody;
  try { body = await req.json() as RequestBody; }
  catch { return json({ error: 'invalid json' }, 400); }

  if (!body.userIds?.length || !body.payload?.title) {
    return json({ error: 'userIds[] and payload.title required' }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseSrvKey);

  // 1. Pref filter (browser_push alanı native + web push için ortak)
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

  // 2. Native token'ları topla (ios + android)
  const { data: tokens, error: tokErr } = await supabase
    .from('push_tokens')
    .select('id, user_id, token, platform')
    .in('platform', ['ios', 'android'])
    .in('user_id', allowedUserIds);

  if (tokErr) return json({ error: tokErr.message }, 500);
  if (!tokens?.length) return json({ ok: true, sent: 0, skipped: 0, reason: 'no_subscriptions' });

  // 3. ExpoPushMessage array hazırla (chunk by 100)
  const messages = tokens.map((row: any) => ({
    to:        row.token,
    title:     body.payload.title,
    body:      body.payload.body  ?? '',
    data:      body.payload.data  ?? {},
    sound:     body.payload.sound ?? 'default',
    badge:     body.payload.badge,
    priority:  body.payload.priority ?? 'high',
    channelId: body.payload.channelId ?? 'default',
    ttl:       body.payload.ttl,
  }));

  const chunks: any[][] = [];
  for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));

  const allTickets: ExpoPushTicket[] = [];
  for (const chunk of chunks) {
    try {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'content-type':     'application/json',
          'accept':           'application/json',
          'accept-encoding':  'gzip, deflate',
          ...(expoAccessToken ? { authorization: `Bearer ${expoAccessToken}` } : {}),
        },
        body: JSON.stringify(chunk),
      });
      const data = await resp.json();
      const tickets: ExpoPushTicket[] = data?.data ?? [];
      allTickets.push(...tickets);
    } catch (e: any) {
      // Tüm chunk'ı hata kabul et
      for (let i = 0; i < chunk.length; i++) {
        allTickets.push({ status: 'error', message: e?.message ?? 'fetch failed' });
      }
    }
  }

  // 4. DeviceNotRegistered / InvalidCredentials → token sil
  const expiredTokenIds: string[] = [];
  for (let i = 0; i < allTickets.length; i++) {
    const t = allTickets[i];
    if (t?.status === 'error') {
      const err = t.details?.error;
      if (err === 'DeviceNotRegistered' || err === 'MismatchSenderId' || err === 'InvalidCredentials') {
        expiredTokenIds.push(tokens[i].id);
      }
    }
  }
  if (expiredTokenIds.length > 0) {
    await supabase.from('push_tokens').delete().in('id', expiredTokenIds);
  }

  const sent   = allTickets.filter(t => t.status === 'ok').length;
  const failed = allTickets.length - sent;

  // 5. notifications.delivered güncelle — best-effort.
  // PostgrestBuilder'da .catch() YOK (yalnız then) → zincirlemek TypeError atar.
  // Ayrıca delivered ÜZERİNE YAZILMAMALI: diğer kanalların kaydını korumak için MERGE.
  if (body.notificationId && sent > 0) {
    const patch = { native_push: { ts: new Date().toISOString(), count: sent } };
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

  return json({
    ok: true,
    sent,
    failed,
    expiredRemoved: expiredTokenIds.length,
    totalSubs: tokens.length,
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}
