/**
 * voice-lead-intake — telefon asistanının (VPS'teki ses köprüsü) görüşme sonu kaydı.
 *
 * Çağıran: /opt/voice-agent köprüsü, çağrı bittiğinde.
 * Kimlik: paylaşılan sır `x-voice-secret` (VOICE_INTAKE_SECRET) — ZORUNLU.
 *         Anon anahtarıyla çağrılabildiği için sırsız istek reddedilir.
 * Lab: istekten ALINMAZ; sunucu ayarı VOICE_LAB_ID kullanılır (başka lab'a yazılamaz).
 *
 * Gövde: { call_id, caller_number?, contact_name?, contact_phone?, request?, summary?,
 *          wants_callback?, language?, transcript?: [{role, text}], duration_sec? }
 * Yazma + bildirim: public.record_phone_lead() (service_role).
 *
 * Deploy:
 *   supabase functions deploy voice-lead-intake --project-ref kjwjxqfdsxkxgcgophdy \
 *     --workdir my-expo-app --use-api
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { timingSafeEqualStr } from '../_shared/security.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-voice-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const str = (v: unknown, max: number): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  try {
    const expected = Deno.env.get('VOICE_INTAKE_SECRET') ?? '';
    const labId = Deno.env.get('VOICE_LAB_ID') ?? '';
    if (!expected || !labId) {
      console.error('[voice-lead] VOICE_INTAKE_SECRET / VOICE_LAB_ID tanımlı değil');
      return json({ ok: false, error: 'not_configured' }, 503);
    }
    if (!timingSafeEqualStr(req.headers.get('x-voice-secret') ?? '', expected)) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }

    const b = await req.json().catch(() => ({}));
    const callId = str(b.call_id, 64);
    if (!callId) return json({ ok: false, error: 'call_id zorunlu' }, 400);

    const transcript = Array.isArray(b.transcript)
      ? b.transcript.slice(0, 200).map((t: any) => ({
          role: t?.role === 'assistant' ? 'assistant' : 'user',
          text: String(t?.text ?? '').slice(0, 1000),
        }))
      : [];

    const payload = {
      call_id: callId,
      caller_number: str(b.caller_number, 32),
      contact_name: str(b.contact_name, 120),
      contact_phone: str(b.contact_phone, 32),
      request: str(b.request, 1000),
      summary: str(b.summary, 2000),
      wants_callback: b.wants_callback === true,
      language: str(b.language, 8),
      transcript,
      duration_sec: Number.isFinite(Number(b.duration_sec)) ? Math.round(Number(b.duration_sec)) : null,
    };

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await admin.rpc('record_phone_lead', { p_lab_id: labId, p_payload: payload });
    if (error) {
      console.error('[voice-lead] rpc hata:', error.message);
      return json({ ok: false, error: 'db_error' }, 500);
    }
    return json({ ok: true, id: data });
  } catch (e) {
    console.error('[voice-lead] beklenmeyen hata:', (e as Error).message);
    return json({ ok: false, error: 'internal' }, 500);
  }
});
