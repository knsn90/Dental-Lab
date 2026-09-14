import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Klinik, çağıranın lab'ına bağlı mı? (clinics.lab_id VEYA clinic_lab_memberships).
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

    // Platform admin? (yalnız o cross-tenant silebilir)
    const { data: callerPlatRow } = await adminClient
      .from('platform_admins').select('user_id').eq('user_id', callerId).maybeSingle();
    const callerIsPlatformAdmin = !!callerPlatRow;

    const callerIsClinicAdmin = callerProfile?.role === 'clinic_admin' || callerProfile?.user_type === 'clinic_admin';
    const callerIsExecAdmin = callerProfile?.user_type === 'admin';   // lab-başına exec rolü (cross-tenant DEĞİL)
    const callerIsLabManager = callerProfile?.user_type === 'lab' && callerProfile?.role === 'manager';
    if (!callerProfile || !(callerIsPlatformAdmin || callerIsExecAdmin || callerIsLabManager || callerIsClinicAdmin)) {
      throw new Error('Yetkiniz yok');
    }

    // Body — { userId } legacy + { user_id } yeni — ikisini de kabul et
    const body = await req.json();
    const targetId: string | undefined = body?.user_id ?? body?.userId;
    if (!targetId) throw new Error('Kullanıcı ID gerekli');
    if (targetId === callerId) throw new Error('Kendinizi silemezsiniz');

    // Hedef profili çek
    const { data: target } = await adminClient
      .from('profiles')
      .select('id, user_type, clinic_id, lab_id, full_name')
      .eq('id', targetId)
      .maybeSingle();

    // Profile yoksa doctors tablosunda olabilir (auth hesabı olmayan eski hekim)
    if (!target) {
      const { data: doctorRow } = await adminClient
        .from('doctors')
        .select('id, clinic_id, full_name')
        .eq('id', targetId)
        .maybeSingle();
      if (!doctorRow) throw new Error('Kullanıcı bulunamadı');

      // Tenant kapısı: clinic_admin kendi kliniği; lab müdürü/exec kendi lab'ı;
      // platform admin serbest.
      if (!callerIsPlatformAdmin) {
        if (callerIsClinicAdmin) {
          if (doctorRow.clinic_id !== callerProfile.clinic_id) {
            throw new Error('Bu kullanıcı sizin kliniğinizde değil');
          }
        } else {
          const inLab = await clinicInCallerLab(adminClient, doctorRow.clinic_id, callerProfile.lab_id);
          if (!inLab) throw new Error('Bu kullanıcı sizin laboratuvarınıza bağlı değil');
        }
      }

      await adminClient.from('doctors').delete().eq('id', targetId);
      return new Response(
        JSON.stringify({ success: true, type: 'doctor_only' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Tenant + rol-hiyerarşisi (platform admin dışında herkese uygulanır).
    if (!callerIsPlatformAdmin) {
      // Hedef platform admin mi? (daha yüksek yetki — silinemez)
      const { data: targetPlatRow } = await adminClient
        .from('platform_admins').select('user_id').eq('user_id', targetId).maybeSingle();
      if (targetPlatRow) throw new Error('Bu kullanıcıyı silemezsiniz');

      if (callerIsClinicAdmin) {
        if (target.clinic_id !== callerProfile.clinic_id) {
          throw new Error('Bu kullanıcı sizin kliniğinizde değil');
        }
        if (!['doctor', 'clinic_admin', 'clinic_secretary'].includes(target.user_type)) {
          throw new Error('Bu kullanıcı türünü silemezsiniz');
        }
      } else {
        // Lab müdürü / exec admin: exec 'admin' hesabı silemez; kendi lab kapsamı.
        if (target.user_type === 'admin') {
          throw new Error('Bu kullanıcı türünü silemezsiniz');
        }
        if (!['lab', 'doctor', 'clinic_admin', 'clinic_secretary'].includes(target.user_type)) {
          throw new Error('Bu kullanıcı türünü silme yetkiniz yok');
        }
        if (target.user_type === 'lab') {
          if (!callerProfile.lab_id || target.lab_id !== callerProfile.lab_id) {
            throw new Error('Bu kullanıcı sizin laboratuvarınızda değil');
          }
        } else {
          const inLab = await clinicInCallerLab(adminClient, target.clinic_id, callerProfile.lab_id);
          if (!inLab) throw new Error('Bu kullanıcı sizin laboratuvarınıza bağlı değil');
        }
      }
    }

    // İlişkili doctors satırı (auth hesaplı hekim) — önce id eşleşmesi (doctors.id
    // profile id'siyle açılmış olabilir); yoksa aynı klinikte ad eşleşmesi (legacy)
    if (target.user_type === 'doctor') {
      const { data: byId } = await adminClient.from('doctors')
        .delete()
        .eq('id', targetId)
        .select('id');
      if ((!byId || byId.length === 0) && target.clinic_id) {
        await adminClient.from('doctors')
          .delete()
          .eq('clinic_id', target.clinic_id)
          .ilike('full_name', target.full_name ?? '');
      }
    }

    // auth.users sil — profiles cascade ile silinir (ON DELETE CASCADE)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetId);
    if (deleteError) throw new Error(deleteError.message);

    // Güvenlik için profile'ı manuel de sil (cascade yoksa)
    await adminClient.from('profiles').delete().eq('id', targetId);

    return new Response(
      JSON.stringify({ success: true, type: 'profile_user' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: String(err?.message ?? err) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
