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

    // auth.users + profiles birleştir
    const { data: authUsers, error: listError } = await adminClient.auth.admin.listUsers({
      perPage: 1000,
    });
    if (listError) throw new Error(listError.message);

    const { data: profiles } = await adminClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

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
