import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Yetkisiz erişim');

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!;

    const adminClient  = createClient(supabaseUrl, serviceRoleKey);
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Çağıran admin mi kontrol et
    const { data: userData, error: authError } = await callerClient.auth.getUser();
    if (authError || !userData.user) throw new Error('Yetkisiz erişim');

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('user_type')
      .eq('id', userData.user.id)
      .single();

    if (!callerProfile || callerProfile.user_type !== 'admin') {
      throw new Error('Sadece adminler kullanıcı listesini görebilir');
    }

    // auth.users + profiles paralel — eskiden seri idi (~2× round-trip)
    const [authRes, profRes] = await Promise.all([
      adminClient.auth.admin.listUsers({ perPage: 1000 }),
      adminClient
        .from('profiles')
        .select('id, full_name, email, phone, user_type, role, is_active, approval_status, clinic_name, clinic_id, lab_id, avatar_url, skill_level, monthly_salary, bonus_threshold_orders, bonus_per_extra_order, created_at, updated_at')
        .order('created_at', { ascending: false }),
    ]);
    if (authRes.error) throw new Error(authRes.error.message);
    const authUsers = authRes.data;
    const profiles = profRes.data;

    const profileMap: Record<string, any> = {};
    (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });

    const merged = authUsers.users.map((u) => ({
      ...(profileMap[u.id] ?? {}),
      id: u.id,
      email: u.email ?? null,
    }));

    // created_at'e göre sırala (en yeni önce)
    merged.sort((a, b) =>
      new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    );

    return new Response(
      JSON.stringify({ users: merged }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: String(err?.message ?? err) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
