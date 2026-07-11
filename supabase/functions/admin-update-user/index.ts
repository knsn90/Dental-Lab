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

    const { data: userData, error: authError } = await callerClient.auth.getUser();
    if (authError || !userData.user) throw new Error('Yetkisiz erişim');
    const callerId = userData.user.id;

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('user_type, role, lab_id, clinic_id')
      .eq('id', callerId)
      .single();

    const callerIsClinicAdmin = callerProfile?.role === 'clinic_admin' || callerProfile?.user_type === 'clinic_admin';
    const callerAllowed =
      callerProfile && (
        callerProfile.user_type === 'admin'
        || callerProfile.user_type === 'lab'
        || callerIsClinicAdmin
      );
    if (!callerAllowed) throw new Error('Yetkiniz yok');

    // Legacy { userId } + yeni { user_id } iki body formatını da kabul et
    const body = await req.json();
    const targetId: string | undefined = body?.user_id ?? body?.userId;
    const email: string | undefined    = body?.email;
    const password: string | undefined = body?.password;

    if (!targetId) throw new Error('Kullanıcı ID gerekli');

    // Hedef profil — clinic_admin için sahiplik kontrolü
    const { data: target } = await adminClient
      .from('profiles')
      .select('id, user_type, clinic_id, lab_id')
      .eq('id', targetId)
      .maybeSingle();

    if (!target) throw new Error('Kullanıcı bulunamadı (profile yok)');

    if (callerIsClinicAdmin) {
      if (target.clinic_id !== callerProfile.clinic_id) {
        throw new Error('Bu kullanıcı sizin kliniğinizde değil');
      }
      if (!['doctor', 'clinic_admin', 'clinic_secretary'].includes(target.user_type)) {
        throw new Error('Bu kullanıcı türünü güncelleyemezsiniz');
      }
    }

    const authUpdates: { email?: string; password?: string } = {};
    if (email && email.trim()) authUpdates.email = email.trim().toLowerCase();
    if (password)              authUpdates.password = password;

    if (Object.keys(authUpdates).length === 0) {
      throw new Error('Güncellenecek alan yok (email veya password gerekli)');
    }

    if (authUpdates.password && authUpdates.password.length < 6) {
      throw new Error('Şifre en az 6 karakter olmalı');
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      targetId,
      authUpdates,
    );
    if (updateError) throw new Error(updateError.message);

    // profiles.email kolonunu da senkronize et (varsa)
    if (authUpdates.email) {
      await adminClient.from('profiles').update({ email: authUpdates.email }).eq('id', targetId);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: String(err?.message ?? err) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
