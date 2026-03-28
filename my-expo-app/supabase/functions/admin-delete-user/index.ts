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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authError } = await callerClient.auth.getUser();
    if (authError || !userData.user) throw new Error('Yetkisiz erişim');

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('user_type')
      .eq('id', userData.user.id)
      .single();

    if (!callerProfile || callerProfile.user_type !== 'admin') {
      throw new Error('Sadece adminler kullanıcı silebilir');
    }

    const { userId } = await req.json();

    if (!userId) throw new Error('Kullanıcı ID gerekli');

    // Prevent self-deletion
    if (userId === userData.user.id) {
      throw new Error('Kendinizi silemezsiniz');
    }

    // Delete from auth (cascades to profiles via FK or we delete manually)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) throw new Error(deleteError.message);

    // Also delete profile (in case no cascade)
    await adminClient.from('profiles').delete().eq('id', userId);

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
