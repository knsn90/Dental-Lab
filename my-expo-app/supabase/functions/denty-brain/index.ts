// denty-brain — Denty AI asistanının güvenli Claude proxy'si.
//
// Bu fonksiyon SADECE bir aracıdır:
//   • ANTHROPIC_API_KEY'i sunucuda tutar (asla client'a sızmaz)
//   • Yalnızca giriş yapmış (JWT'li) uygulama kullanıcılarına yanıt verir
//   • Claude'a {system, messages, tools} iletir, dönen yanıtı aynen geri verir
//
// Araçların (tool) ÇALIŞTIRILMASI client'ta olur — bu fonksiyon hiçbir
// veriyi yazmaz / değiştirmez. Böylece Denty, kullanıcının kendi oturumuyla
// (RLS + izinler) sınırlı kalır.
//
// Input  : { system, messages, tools?, model?, max_tokens? }
// Output : { ok: true, stop_reason, content, usage } | { ok: false, error }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ─── 1. Kimlik doğrula (sadece giriş yapmış kullanıcılar) ────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return json({ ok: false, error: 'unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const sb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user) return json({ ok: false, error: 'unauthorized' }, 401);

    // ─── 1b. Günlük kota (kullanıcı başına) ─────────────────────────────────
    // Asistan tüm panellerde açık; döngüye giren bir sohbet sınırsız Claude
    // çağrısı üretebiliyordu. Sayaç service role ile artar (RLS baypas), limit
    // aşılırsa Claude'a HİÇ gidilmez. Servis anahtarı yoksa limit uygulanmaz
    // (fonksiyon çalışmaya devam eder — geriye dönük güvenli).
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const dailyLimit = Number(Deno.env.get('DENTY_DAILY_LIMIT') ?? '120');
    if (serviceKey && dailyLimit > 0) {
      try {
        const admin = createClient(supabaseUrl, serviceKey);
        const { data: quota } = await admin.rpc('denty_consume_quota', {
          p_user: userData.user.id,
          p_limit: dailyLimit,
        });
        const row = Array.isArray(quota) ? quota[0] : quota;
        if (row && row.allowed === false) {
          return json({
            ok: false,
            error: `Günlük Simanty limitine ulaştın (${row.quota} istek). Yarın sıfırlanır.`,
          }, 200);
        }
      } catch (_) { /* sayaç tablosu yoksa/erişilemezse limit uygulanmaz */ }
    }

    // ─── 2. İstek gövdesi ────────────────────────────────────────────────────
    const body = await req.json();
    const system: string = body.system ?? '';
    const messages: unknown[] = body.messages ?? [];
    const tools: unknown[] | undefined = body.tools;
    const model: string = body.model ?? 'claude-sonnet-4-5';
    const maxTokens: number = body.max_tokens ?? 1024;

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ ok: false, error: 'messages zorunlu' }, 200);
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ ok: false, error: 'ANTHROPIC_API_KEY tanımlı değil' }, 200);

    // ─── 3. Claude çağrısı (retry'li) ────────────────────────────────────────
    const payload: Record<string, unknown> = { model, max_tokens: maxTokens, messages };
    if (system) payload.system = system;
    if (Array.isArray(tools) && tools.length > 0) payload.tools = tools;

    let resp: Response | null = null;
    let lastErr = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
      });
      if (resp.ok) break;
      lastErr = `${resp.status}: ${(await resp.text()).slice(0, 300)}`;
      if (resp.status < 500 && resp.status !== 429) break;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
    if (!resp || !resp.ok) return json({ ok: false, error: `Claude API: ${lastErr}` }, 200);

    const jr = await resp.json();
    return json({
      ok: true,
      stop_reason: jr?.stop_reason ?? 'end_turn',
      content: jr?.content ?? [],
      usage: jr?.usage ?? null,
    }, 200);
  } catch (e) {
    return json({ ok: false, error: (e as Error)?.message ?? String(e) }, 200);
  }
});
