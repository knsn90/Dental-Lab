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

    // Çağıran admin mi?
    const { data: userData, error: authError } = await callerClient.auth.getUser();
    if (authError || !userData.user) throw new Error('Yetkisiz erişim');

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('user_type')
      .eq('id', userData.user.id)
      .single();

    if (!callerProfile || callerProfile.user_type !== 'admin') {
      throw new Error('Sadece adminler bu işlemi yapabilir');
    }

    const { userId, email, password } = await req.json();
    if (!userId) throw new Error('Kullanıcı ID gerekli');

    // E-posta veya şifre değişikliği
    const authUpdates: { email?: string; password?: string } = {};
    if (email)    authUpdates.email    = email.trim();
    if (password) authUpdates.password = password;

    if (Object.keys(authUpdates).length === 0) {
      throw new Error('Güncellenecek alan yok');
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      userId,
      authUpdates
    );

    if (updateError) throw new Error(updateError.message);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: String(err?.message ?? err) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
