// kiosk-login — kayıtlı tablette kod ile giriş → kullanıcının GERÇEK oturumunu üretir.
// Girdi: { device_token, code }
// Çıktı: { ok, email, token_hash }  → istemci: supabase.auth.verifyOtp({ token_hash, type:'magiclink' })
// Kimlik: kullanıcı JWT'si GEREKMEZ (tablette oturum yok) → deploy: --no-verify-jwt.
//   Kimlik/kapsam = cihaz jetonu (SHA-256 eşleşmesi) + kiosk_resolve_user (cihaz-kapsamlı,
//   bcrypt kod eşleşmesi, hız-sınırı/kilit). generateLink e-postayı auth.users'tan alır.
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = await req.json().catch(() => ({}));
    const deviceToken = String(body?.device_token ?? '').trim();
    const code = String(body?.code ?? '').trim();
    if (!/^[a-f0-9]{64}$/.test(deviceToken) || !/^[0-9]{6}$/.test(code))
      return json({ ok: false, error: 'invalid_input' });

    // 1) Cihazı jeton hash'iyle bul (aktif)
    const tokenHash = await sha256Hex(deviceToken);
    const { data: dev } = await admin
      .from('lab_devices')
      .select('id, active')
      .eq('device_token_hash', tokenHash)
      .maybeSingle();
    if (!dev || !dev.active) return json({ ok: false, error: 'device_invalid' });

    // 2) Kod → kullanıcı (cihaz-kapsamlı, hız-sınırlı; service_role RPC)
    const { data: userId, error: resolveErr } = await admin.rpc('kiosk_resolve_user', {
      p_device_id: dev.id,
      p_code: code,
    });
    if (resolveErr || !userId) {
      const msg = String(resolveErr?.message ?? '');
      const reason = /device_locked/.test(msg) ? 'device_locked'
        : /user_locked/.test(msg) ? 'user_locked'
        : /device_invalid/.test(msg) ? 'device_invalid'
        : 'no_match';
      return json({ ok: false, error: reason });
    }

    // 3) Kullanıcı aktif mi? (kod eşleşse de pasif/onaysızsa giriş yok)
    const { data: prof } = await admin
      .from('profiles')
      .select('is_active, approval_status')
      .eq('id', userId)
      .maybeSingle();
    if (prof && (prof.is_active === false || (prof.approval_status && prof.approval_status !== 'approved')))
      return json({ ok: false, error: 'user_inactive' });

    // 4) Kararlı e-posta auth.users'tan (profiles.email nullable)
    const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(String(userId));
    const email = authUser?.user?.email;
    if (getErr || !email) return json({ ok: false, error: 'server_error' });

    // 5) Tek kullanımlık magic-link OTP üret → istemci verifyOtp ile GERÇEK oturum kurar
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const tokenHashOtp = (link as any)?.properties?.hashed_token;
    if (linkErr || !tokenHashOtp) return json({ ok: false, error: 'server_error' });

    return json({ ok: true, email, token_hash: tokenHashOtp });
  } catch (_e) {
    return json({ ok: false, error: 'server_error' });
  }
});
