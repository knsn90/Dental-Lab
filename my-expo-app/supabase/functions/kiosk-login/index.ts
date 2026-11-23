// kiosk-login — kayıtlı tablette kod ile giriş → kullanıcının GERÇEK oturumunu üretir.
// Girdi: { action:'users', device_token }            → { ok, users:[{user_id, full_name, avatar_url}] }
//        { device_token, user_id, code }               → giriş
// Çıktı: { ok, token_hash }  → istemci: supabase.auth.verifyOtp({ token_hash, type:'magiclink' })
// Kimlik: kullanıcı JWT'si GEREKMEZ (tablette oturum yok) → deploy: --no-verify-jwt.
//   Kimlik/kapsam = cihaz jetonu (SHA-256 eşleşmesi) + kiosk_resolve_user (seçilen kişinin
//   bcrypt kodu, kişi + cihaz hız-sınırı/kilit). generateLink e-postayı auth.users'tan alır.
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
    const action = String(body?.action ?? 'login');
    const deviceToken = String(body?.device_token ?? '').trim();
    if (!/^[a-f0-9]{64}$/.test(deviceToken)) return json({ ok: false, error: 'invalid_input' });

    // 1) Cihazı jeton hash'iyle bul (aktif)
    const tokenHash = await sha256Hex(deviceToken);
    const { data: dev } = await admin
      .from('lab_devices')
      .select('id, active')
      .eq('device_token_hash', tokenHash)
      .maybeSingle();
    if (!dev || !dev.active) return json({ ok: false, error: 'device_invalid' });

    // 1b) Tabletteki kişi listesi (yalnız kodu tanımlı + aktif kişiler; ad + avatar)
    if (action === 'users') {
      const { data: users, error: listErr } = await admin.rpc('kiosk_list_users', { p_device_id: dev.id });
      if (listErr) return json({ ok: false, error: 'server_error' });
      return json({ ok: true, users: users ?? [] });
    }

    // 2) Seçilen kişi + kod → doğrulama (kişi + cihaz hız-sınırlı; service_role RPC).
    //    Kişi seçimi ZORUNLU: yalnız-kod girişte aynı kodu seçen iki kişi çakışıyordu.
    const userIdIn = String(body?.user_id ?? '').trim();
    const code = String(body?.code ?? '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(userIdIn)) return json({ ok: false, error: 'user_required' });
    if (!/^[0-9]{6}$/.test(code)) return json({ ok: false, error: 'invalid_input' });

    const { data: res, error: resolveErr } = await admin.rpc('kiosk_resolve_user', {
      p_device_id: dev.id,
      p_user_id: userIdIn,
      p_code: code,
    });
    if (resolveErr || !res) return json({ ok: false, error: 'server_error' });
    const r = res as { ok: boolean; user_id?: string; error?: string };
    if (!r.ok || !r.user_id) return json({ ok: false, error: r.error ?? 'no_match' });
    const userId = r.user_id;

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

    return json({ ok: true, token_hash: tokenHashOtp });
  } catch (_e) {
    return json({ ok: false, error: 'server_error' });
  }
});
