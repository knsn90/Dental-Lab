// kiosk-pair — tableti lab'a eşleştirir (bir kez).
// Girdi: { pairing_code }  (admin panelde lab_device_create ile üretilen tek kullanımlık kod)
// Çıktı: { ok, device_token, device_name, lab_name }
//   • device_token: ham cihaz jetonu — YALNIZ burada döner; tablet güvenli depoya yazar.
//     Sunucuda yalnız SHA-256'sı saklanır (lab_devices.device_token_hash).
// Kimlik doğrulama: kullanıcı JWT'si GEREKMEZ (tablette oturum yok) → deploy: --no-verify-jwt.
// Tek kullanımlık + 15 dk süreli kod, brute-force'a karşı yeterli; eşleşince kod temizlenir.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomToken(): string {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = await req.json().catch(() => ({}));
    const code = String(body?.pairing_code ?? '').trim().toUpperCase();
    if (!/^[A-F0-9]{8}$/.test(code)) return json({ ok: false, error: 'invalid_code' });

    // Eşleşmemiş, süresi dolmamış, aktif cihazı bul
    const { data: dev, error: findErr } = await admin
      .from('lab_devices')
      .select('id, lab_id, name, pairing_expires_at, device_token_hash, active')
      .eq('pairing_code', code)
      .maybeSingle();
    if (findErr) return json({ ok: false, error: 'server_error' });
    if (!dev || !dev.active || dev.device_token_hash) return json({ ok: false, error: 'invalid_code' });
    if (!dev.pairing_expires_at || new Date(dev.pairing_expires_at).getTime() < Date.now())
      return json({ ok: false, error: 'expired' });

    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const { error: updErr } = await admin
      .from('lab_devices')
      .update({ device_token_hash: tokenHash, pairing_code: null, pairing_expires_at: null, last_seen_at: new Date().toISOString() })
      .eq('id', dev.id)
      .is('device_token_hash', null); // yarış koşulu: yalnız henüz eşleşmemişse
    if (updErr) return json({ ok: false, error: 'server_error' });

    let labName = '';
    const { data: lab } = await admin.from('labs').select('name').eq('id', dev.lab_id).maybeSingle();
    labName = (lab as any)?.name ?? '';

    return json({ ok: true, device_token: token, device_name: dev.name, lab_name: labName });
  } catch (_e) {
    return json({ ok: false, error: 'server_error' });
  }
});
