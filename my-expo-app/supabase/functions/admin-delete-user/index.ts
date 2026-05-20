import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { corsHeaders } from '../_shared/cors.ts'
import { unauthorized, forbidden, badRequest, errorResponse } from '../_shared/errors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw unauthorized();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authError } = await callerClient.auth.getUser();
    if (authError || !userData.user) throw unauthorized();

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('user_type')
      .eq('id', userData.user.id)
      .single();

    if (!callerProfile || callerProfile.user_type !== 'admin') {
      throw forbidden('Sadece adminler kullanıcı silebilir');
    }

    const { userId } = await req.json();
    if (!userId) throw badRequest('Kullanıcı ID gerekli');

    if (userId === userData.user.id) {
      throw badRequest('Kendinizi silemezsiniz');
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) throw new Error(deleteError.message);

    await adminClient.from('profiles').delete().eq('id', userId);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return errorResponse(err, corsHeaders(req));
  }
});
