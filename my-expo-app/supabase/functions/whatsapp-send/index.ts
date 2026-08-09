// whatsapp-send — Siman'dan bir müşteriye ELLE WhatsApp mesajı yazma.
//
// NEDEN VAR:
// Lab, müşteriye telefondaki WhatsApp Business uygulamasından yazdı ama bot yine
// cevapladı. Sebep: iş numarası Meta'da `platform_type = CLOUD_API` — saf Cloud
// API hattı. Meta `message_echoes` webhook'unu yalnız Coexistence (SMB_APP)
// numaraları için gönderir, dolayısıyla "lab elle yazdı" olayı sisteme HİÇ
// ulaşmıyordu. Üstelik Cloud API hattının gelen kutusu da yok: lab, müşterinin
// ne yazdığını okuyabildiği tek yer botun gördüğü kadarıydı.
//
// Bu fonksiyon her iki sorunu da kökten çözer: mesaj Siman'dan gider, dolayısıyla
// "insan yazdı" bilgisi tanım gereği kesindir — tahmine gerek yok.
//
// NE YAPAR:
//   1. Çağıranın gerçekten o labın yöneticisi olduğunu doğrular (JWT).
//   2. Metni Cloud API ile gönderir (24 saat penceresi içinde şablon gerekmez).
//   3. Oturumu 'human' yapar → bot o sohbette susar.
//   4. Mesajı whatsapp_messages'a yazar (sohbet geçmişi + wamid kanıtı).
//
// Input : { phone: string, text: string }
// Output: { ok: true, wamid } | { ok: false, error }
//
// Deploy:
//   supabase functions deploy whatsapp-send --project-ref <REF> --workdir my-expo-app --use-api

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GRAPH_VERSION = 'v21.0';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

/** Meta E.164 bekler: yalnız rakam. TR yerel yazımlarını (0…, 5…) normalize et. */
function normalizePhone(raw: string): string {
  let d = String(raw ?? '').replace(/[^\d]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('5')) d = '90' + d;        // 5XXXXXXXXX
  else if (d.length === 11 && d.startsWith('05')) d = '90' + d.slice(1);
  return d;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // ── 1. Kimlik + yetki ──────────────────────────────────────────────────
    // Bu uç müşteriye mesaj GÖNDERİR; anon anahtarla çağrılabilir olamaz.
    // Çağıranın kim olduğu JWT'den çözülür, lab_id İSTEMCİDEN ALINMAZ —
    // istemciden gelen lab_id ile başka labın müşterisine mesaj atılabilirdi.
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ ok: false, error: 'unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userErr } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !userData?.user) return json({ ok: false, error: 'unauthorized' }, 401);

    const { data: profile } = await admin
      .from('profiles')
      .select('id, lab_id, user_type, role')
      .eq('id', userData.user.id)
      .maybeSingle();

    const allowed = profile
      && (profile.user_type === 'admin'
          || (profile.user_type === 'lab' && ['manager', 'admin'].includes(profile.role ?? '')));
    if (!allowed || !profile?.lab_id) return json({ ok: false, error: 'forbidden' }, 403);

    const labId = profile.lab_id as string;

    // ── 2. Girdi ───────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const phone = normalizePhone(body?.phone ?? '');
    const text  = String(body?.text ?? '').trim();
    if (!phone || phone.length < 10) return json({ ok: false, error: 'bad_phone' }, 400);
    if (!text) return json({ ok: false, error: 'empty_text' }, 400);
    if (text.length > 4096) return json({ ok: false, error: 'too_long' }, 400);

    // ── 3. Labın WhatsApp kimlik bilgisi ───────────────────────────────────
    const { data: cred } = await admin
      .from('provider_credentials')
      .select('credentials')
      .eq('lab_id', labId).eq('type', 'messaging').eq('provider', 'whatsapp-cloud')
      .eq('is_active', true)
      .maybeSingle();

    const phoneNumberId = (cred?.credentials as any)?.phone_number_id;
    const accessToken   = (cred?.credentials as any)?.access_token;
    if (!phoneNumberId || !accessToken) return json({ ok: false, error: 'not_configured' }, 400);

    // ── 4. Gönder ──────────────────────────────────────────────────────────
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }),
    });
    const meta = await res.json().catch(() => null);

    if (!res.ok) {
      // Meta hatasını YUTMA — en sık sebep 24 saat penceresinin kapanmış
      // olması (131047). Kullanıcı bunu görmeli, yoksa mesajın gitmediğini
      // hiç anlamaz.
      const code = meta?.error?.code;
      const detail = meta?.error?.error_user_msg ?? meta?.error?.message ?? '';
      console.error('[wa-send] meta err:', res.status, code, detail);
      return json({
        ok: false,
        error: code === 131047 ? 'window_closed' : 'meta_error',
        detail: String(detail).slice(0, 300),
      }, 502);
    }

    const wamid: string | null = meta?.messages?.[0]?.id ?? null;

    // ── 5. Oturumu insana devret — asıl amaç bu ────────────────────────────
    // Mevcut context korunur, `human_lab` bayrağı eklenir. Bot artık o
    // sohbette susar; devri lab bitirir (/bot ya da "Sohbeti bitir").
    const { data: sess } = await admin
      .from('whatsapp_sessions')
      .select('context, human_since')
      .eq('lab_id', labId).eq('sender_phone', phone)
      .maybeSingle();

    const ctx = (sess?.context && typeof sess.context === 'object') ? sess.context : {};
    await admin.from('whatsapp_sessions').upsert({
      lab_id: labId,
      sender_phone: phone,
      mode: 'human',
      flow: null,
      step: null,
      human_since: sess?.human_since ?? new Date().toISOString(),
      context: { ...ctx, human_lab: true },
      last_msg_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'lab_id,sender_phone' });

    // ── 6. Sohbet geçmişi ──────────────────────────────────────────────────
    await admin.from('whatsapp_messages').insert({
      lab_id: labId, peer_phone: phone, direction: 'out',
      body: text, wamid, source: 'human', sent_by: profile.id,
    });

    return json({ ok: true, wamid });
  } catch (e: any) {
    console.error('[wa-send] err:', e);
    return json({ ok: false, error: e?.message ?? 'server_error' }, 500);
  }
});
