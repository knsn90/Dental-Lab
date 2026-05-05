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

    // Admin veya lab manager kullanıcı ekleyebilir
    if (!callerProfile || (callerProfile.user_type !== 'admin' && callerProfile.user_type !== 'lab')) {
      throw new Error('Yetkiniz yok');
    }

    const { email, password, full_name, user_type, role, clinic_name, phone, address, clinic_type, specialty, department, level, monthly_salary } = await req.json();

    if (!email || !password || !full_name || !user_type) {
      throw new Error('Zorunlu alanlar eksik');
    }

    // Hekim/klinik ekliyorsa klinik adı zorunlu
    if ((user_type === 'doctor' || user_type === 'clinic_admin') && !clinic_name) {
      throw new Error('Klinik adı zorunludur');
    }

    const effectiveUserType = user_type === 'clinic_admin' ? 'doctor' : user_type;
    const effectiveRole = user_type === 'clinic_admin' ? 'clinic_admin' : (role ?? null);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        user_type: effectiveUserType,
        clinic_name: clinic_name ?? null,
        phone: phone ?? null,
        role: effectiveRole,
      },
    });

    if (createError) throw new Error(createError.message);

    // Profile oluştur
    await adminClient
      .from('profiles')
      .upsert({
        id: created.user.id,
        full_name,
        user_type: effectiveUserType,
        role: effectiveRole,
        clinic_name: clinic_name ?? null,
        phone: phone ?? null,
        specialty: specialty ?? null,
        department: department ?? null,
        skill_level: level ?? null,
        allowed_types: (specialty && effectiveUserType === 'lab') ? specialty.split(', ').filter(Boolean) : null,
        allowed_stages: (department && effectiveUserType === 'lab') ? department.split(', ').filter(Boolean) : null,
        monthly_salary: monthly_salary ?? null,
        is_active: true,
        approval_status: (user_type === 'doctor' || user_type === 'clinic_admin') ? 'approved' : null,
        phone_verified: true,
      });

    // Hekim veya klinik admin ise clinic + doctor kaydı oluştur
    if (user_type === 'doctor' || user_type === 'clinic_admin') {
      const { data: clinic } = await adminClient
        .from('clinics')
        .insert({
          name: clinic_name,
          phone: phone ?? null,
          address: address ?? null,
          contact_person: full_name,
          ...(clinic_type ? { clinic_type } : {}),
        })
        .select()
        .single();

      if (clinic) {
        await adminClient.from('doctors').insert({
          full_name,
          phone: phone ?? null,
          clinic_id: clinic.id,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, userId: created.user.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: String(err?.message ?? err) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
