import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { corsHeaders } from '../_shared/cors.ts'
import { unauthorized, forbidden, errorResponse } from '../_shared/errors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw unauthorized();

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!;

    const adminClient  = createClient(supabaseUrl, serviceRoleKey);
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authError } = await callerClient.auth.getUser();
    if (authError || !userData.user) throw unauthorized();

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('user_type, lab_id')
      .eq('id', userData.user.id)
      .single();

    if (!callerProfile || callerProfile.user_type !== 'admin') {
      throw forbidden('Sadece adminler kullanıcı listesini görebilir');
    }

    if (!callerProfile.lab_id) throw forbidden('Admin lab_id bulunamadı');

    // auth.users + profiles birleştir
    const { data: authUsers, error: listError } = await adminClient.auth.admin.listUsers({
      perPage: 1000,
    });
    if (listError) throw new Error(listError.message);

    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id, full_name, user_type, role, clinic_name, phone, specialty, department, skill_level, allowed_types, allowed_stages, monthly_salary, is_active, approval_status, phone_verified, created_at')
      .eq('lab_id', callerProfile.lab_id)
      .order('created_at', { ascending: false });

    const profileMap: Record<string, any> = {};
    (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });

    const merged = authUsers.users.map((u) => ({
      ...(profileMap[u.id] ?? {}),
      id: u.id,
      email: u.email ?? null,
    }));

    merged.sort((a, b) =>
      new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    );

    return new Response(
      JSON.stringify({ users: merged }),
      { status: 200, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return errorResponse(err, corsHeaders(req));
  }
});
