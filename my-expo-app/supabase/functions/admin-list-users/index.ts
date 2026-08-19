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
      .select('user_type, lab_id')
      .eq('id', userData.user.id)
      .single();

    if (!callerProfile || callerProfile.user_type !== 'admin') {
      throw new Error('Sadece adminler kullanıcı listesini görebilir');
    }

    // KİRACI SINIRI — bu fonksiyon service-role ile çalışır, yani RLS'i baypas eder;
    // filtreyi KENDİSİ yapmak zorunda. 'admin' global bir yetki değil, lab-başına bir
    // roldür: filtresiz bırakıldığında her lab admini tüm sistemin kullanıcılarını
    // görüyordu (ölçüldü: 21 profilin 20'si yabancı).
    const callerLab: string | null = callerProfile.lab_id ?? null;
    if (!callerLab) {
      // Laba bağlı olmayan hesap (ör. yetim admin) hiçbir kiracının listesini görmez.
      return new Response(
        JSON.stringify({ users: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Hekim/klinik profillerinin lab_id'si NULL'dur; bağ klinik üzerinden kurulur.
    // Bu yüzden kapsam üç ayaklı: doğrudan lab_id, kliniğin labı, onaylı lab üyeliği.
    const [clinicRes, memberRes] = await Promise.all([
      adminClient.from('clinics').select('id').eq('lab_id', callerLab),
      adminClient.from('clinic_lab_memberships')
        .select('member_profile_id, member_clinic_id')
        .eq('lab_id', callerLab).in('status', ['active', 'approved']),
    ]);
    const labClinicIds = new Set<string>((clinicRes.data ?? []).map((c: any) => c.id));
    const memberProfileIds = new Set<string>();
    for (const m of memberRes.data ?? []) {
      if (m.member_profile_id) memberProfileIds.add(m.member_profile_id);
      if (m.member_clinic_id)  labClinicIds.add(m.member_clinic_id);
    }
    const inMyLab = (p: any): boolean =>
      p.lab_id === callerLab ||
      (p.clinic_id != null && labClinicIds.has(p.clinic_id)) ||
      memberProfileIds.has(p.id);

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

    // Liste labın PROFİLLERİNDEN kurulur. Eskiden authUsers.users üzerinden
    // kuruluyordu; profili olmayan auth kullanıcıları bile e-postasıyla sızıyordu.
    const emailById: Record<string, string | null> = {};
    authUsers.users.forEach((u) => { emailById[u.id] = u.email ?? null; });

    const merged = (profiles ?? [])
      .filter(inMyLab)
      .map((p: any) => ({ ...p, id: p.id, email: emailById[p.id] ?? p.email ?? null }));

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
