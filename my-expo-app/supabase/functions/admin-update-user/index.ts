import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Klinik, çağıranın lab'ına bağlı mı? (doğrudan clinics.lab_id VEYA
// clinic_lab_memberships onaylı üyeliği). Lab yoksa/klinik yoksa false.
async function clinicInCallerLab(adminClient: any, clinicId: string | null, callerLabId: string | null): Promise<boolean> {
  if (!clinicId || !callerLabId) return false;
  const { data: c } = await adminClient.from('clinics').select('lab_id').eq('id', clinicId).maybeSingle();
  if (c?.lab_id && c.lab_id === callerLabId) return true;
  const { data: m } = await adminClient
    .from('clinic_lab_memberships')
    .select('id')
    .eq('lab_id', callerLabId)
    .eq('member_clinic_id', clinicId)
    .maybeSingle();
  return !!m;
}

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

    // Platform admin? (arbitrary hesabı değiştirebilen tek rol)
    const { data: callerPlatRow } = await adminClient
      .from('platform_admins').select('user_id').eq('user_id', callerId).maybeSingle();
    const callerIsPlatformAdmin = !!callerPlatRow;

    const callerIsClinicAdmin = callerProfile?.role === 'clinic_admin' || callerProfile?.user_type === 'clinic_admin';
    const callerIsLabManager  = callerProfile?.user_type === 'lab' && callerProfile?.role === 'manager';
    const callerIsExecAdmin   = callerProfile?.user_type === 'admin';   // lab-başına exec rolü
    // DÜZ user_type='lab' (manager DEĞİL) BAŞKA kullanıcıyı değiştiremez.
    const callerAllowed =
      callerIsPlatformAdmin || callerIsLabManager || callerIsExecAdmin || callerIsClinicAdmin;
    if (!callerProfile || !callerAllowed) throw new Error('Yetkiniz yok');

    // Legacy { userId } + yeni { user_id } iki body formatını da kabul et
    const body = await req.json();
    const targetId: string | undefined = body?.user_id ?? body?.userId;
    const email: string | undefined    = body?.email;
    const password: string | undefined = body?.password;

    if (!targetId) throw new Error('Kullanıcı ID gerekli');

    // Hedef profil — sahiplik/tenant kontrolü
    const { data: target } = await adminClient
      .from('profiles')
      .select('id, user_type, clinic_id, lab_id')
      .eq('id', targetId)
      .maybeSingle();

    if (!target) throw new Error('Kullanıcı bulunamadı (profile yok)');

    // Platform admin dışında herkes tenant + rol-hiyerarşisiyle sınırlı.
    if (!callerIsPlatformAdmin) {
      // Hedef platform admin mi? (daha yüksek yetki — dokunulamaz)
      const { data: targetPlatRow } = await adminClient
        .from('platform_admins').select('user_id').eq('user_id', targetId).maybeSingle();
      if (targetPlatRow) throw new Error('Bu kullanıcıyı değiştiremezsiniz');

      if (callerIsClinicAdmin) {
        if (target.clinic_id !== callerProfile.clinic_id) {
          throw new Error('Bu kullanıcı sizin kliniğinizde değil');
        }
        if (!['doctor', 'clinic_admin', 'clinic_secretary'].includes(target.user_type)) {
          throw new Error('Bu kullanıcı türünü güncelleyemezsiniz');
        }
      } else {
        // Lab müdürü / exec admin: kendi lab kapsamı + daha yüksek rol yasak
        // Exec 'admin' hesabını yalnız platform admin değiştirebilir.
        if (target.user_type === 'admin') {
          throw new Error('Bu kullanıcı türünü güncelleyemezsiniz');
        }
        const ALLOWED = ['lab', 'doctor', 'clinic_admin', 'clinic_secretary'];
        if (!ALLOWED.includes(target.user_type)) {
          throw new Error('Bu kullanıcı türünü güncelleyemezsiniz');
        }
        if (target.user_type === 'lab') {
          if (!callerProfile.lab_id || target.lab_id !== callerProfile.lab_id) {
            throw new Error('Bu kullanıcı sizin laboratuvarınızda değil');
          }
        } else {
          // Klinik-tipli hedef: kliniği çağıranın lab'ına bağlı olmalı
          const inLab = await clinicInCallerLab(adminClient, target.clinic_id, callerProfile.lab_id);
          if (!inLab) throw new Error('Bu kullanıcı sizin laboratuvarınıza bağlı değil');
        }
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
