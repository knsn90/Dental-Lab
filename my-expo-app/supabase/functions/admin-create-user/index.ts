import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Klinik, çağıranın lab'ına bağlı mı? (doğrudan clinics.lab_id VEYA
// clinic_lab_memberships onaylı üyeliği). Lab yoksa/klinik yoksa false.
// admin-update-user / admin-delete-user ile birebir aynı kapı (B-02).
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
      .select('user_type, role, lab_id, clinic_id, clinic_name')
      .eq('id', userData.user.id)
      .single();

    // Platform admin? (yalnız o başka bir lab'ı hedefleyebilir)
    const { data: callerPlatRow } = await adminClient
      .from('platform_admins').select('user_id').eq('user_id', userData.user.id).maybeSingle();
    const callerIsPlatformAdmin = !!callerPlatRow;

    // Admin / lab MÜDÜRÜ / clinic_admin (kendi hekimini ekleyebilir)
    const callerIsClinicAdmin = callerProfile?.role === 'clinic_admin' || callerProfile?.user_type === 'clinic_admin';
    const callerIsExecAdmin = callerProfile?.user_type === 'admin';   // lab-başına exec rolü
    const callerIsLabManager = callerProfile?.user_type === 'lab' && callerProfile?.role === 'manager';
    if (!callerProfile || !(callerIsPlatformAdmin || callerIsExecAdmin || callerIsLabManager || callerIsClinicAdmin)) {
      throw new Error('Yetkiniz yok');
    }

    const body = await req.json();

    // Yeni lab kullanıcısı caller'ın lab_id'sini miras alır.
    // İSTİSNA: YALNIZ platform yöneticisi başka bir lab için hesap açabilir
    // (konsoldan lab kurup sahibine giriş bilgisi vermek için). Lab müdürü ve
    // lab-başına exec 'admin' body.target_lab_id ile KENDİ labının dışına ÇIKAMAZ
    // → target_lab_id yok sayılır, caller'ın kendi lab_id'si kullanılır.
    const inheritedLabId = (callerIsPlatformAdmin && body.target_lab_id)
      ? String(body.target_lab_id)
      : (callerProfile.lab_id ?? null);
    const { email, password, full_name, user_type, role, phone, address, clinic_type, specialty, department, level, monthly_salary, clinic_permissions, skip_doctor_row } = body;
    let { clinic_name, clinic_id } = body;

    // Lab müdürü admin (exec) hesabı AÇAMAZ; yalnız kendi ekibi + klinik hesapları
    const LAB_MANAGER_TYPES_ALLOWED = ['lab', 'doctor', 'clinic_admin', 'clinic_secretary'];
    if (callerIsLabManager && !callerIsPlatformAdmin && !LAB_MANAGER_TYPES_ALLOWED.includes(user_type)) {
      throw new Error('Bu kullanıcı tipini oluşturma yetkiniz yok');
    }

    // Clinic_admin caller ise clinic_id'yi caller'ın profili üzerinden zorla
    if (callerIsClinicAdmin) {
      const CLINIC_ROLES_ALLOWED = ['doctor', 'clinic_admin', 'clinic_secretary'];
      if (!CLINIC_ROLES_ALLOWED.includes(user_type)) {
        throw new Error('Klinik yöneticisi yalnızca hekim, sekreter veya klinik yöneticisi ekleyebilir');
      }
      clinic_id = callerProfile.clinic_id ?? clinic_id;
      if (!clinic_id) {
        throw new Error('Hesabınıza bağlı klinik bulunamadı — destekle iletişime geçin');
      }
    }

    // B-02: bir kliniğe kullanıcı BAĞLAMA yalnız caller'ın kendi tenant'ına ait
    // klinikle olur. body.clinic_id / body.lab_id tenant sahipliği KANITI DEĞİLDİR;
    // clinic.lab_id (veya onaylı clinic_lab_memberships) server-side doğrulanır.
    // Platform admin muaf (meşru cross-lab kurulum). clinic_admin zaten yukarıda
    // kendi profilinin clinic_id'sine sabitlendi. Lab müdürü / exec 'admin' için
    // body'den gelen clinic_id başka bir lab'a AİT OLAMAZ. Bu kontrol createUser'dan
    // ÖNCE çalışır → red durumunda hiçbir kullanıcı/profil/klinik oluşmaz.
    if (clinic_id && !callerIsPlatformAdmin && !callerIsClinicAdmin) {
      const ok = await clinicInCallerLab(adminClient, String(clinic_id), callerProfile.lab_id ?? null);
      if (!ok) {
        throw new Error('Bu kliniğe kullanıcı ekleme yetkiniz yok (klinik sizin laboratuvarınıza bağlı değil)');
      }
    }

    // clinic_name verilmediyse ve clinic_id varsa otomatik lookup (klinik adı zorunlu hatasını önler)
    if (!clinic_name && clinic_id) {
      const { data: clinicRow } = await adminClient.from('clinics').select('name').eq('id', clinic_id).maybeSingle();
      if (clinicRow?.name) clinic_name = clinicRow.name;
    }

    if (!email || !password || !full_name || !user_type) {
      throw new Error('Zorunlu alanlar eksik (e-posta / şifre / ad / kullanıcı tipi)');
    }

    // Hekim/klinik/sekreter ekliyorsa klinik adı zorunlu (artık otomatik lookup sonrası boş olmamalı)
    if (['doctor', 'clinic_admin', 'clinic_secretary'].includes(user_type) && !clinic_name) {
      throw new Error('Klinik adı bulunamadı — clinic_id geçersiz olabilir');
    }

    // Varsayılan klinik yetki şablonları
    const DEFAULT_PERMS_BY_ROLE: Record<string, Record<string, boolean>> = {
      doctor: {
        orders_view: true, orders_create: true, orders_edit: true,
      },
      clinic_secretary: {
        orders_view: true, orders_create: true, orders_edit: true,
        doctors_manage: false, users_manage: false, settings_manage: false, billing_view: true,
      },
      clinic_admin: {
        orders_view: true, orders_create: true, orders_edit: true,
        doctors_manage: true, users_manage: true, settings_manage: true, billing_view: true,
      },
    };
    const effectivePermissions = ['doctor', 'clinic_admin', 'clinic_secretary'].includes(user_type)
      ? { ...(DEFAULT_PERMS_BY_ROLE[user_type] ?? {}), ...(clinic_permissions ?? {}) }
      : null;

    // Migration 033 sonrası 'clinic_admin' geçerli bir user_type — coerce etmeye gerek yok.
    // Eskiden 'doctor' + role='clinic_admin' olarak yazılıyordu; bu kullanıcı listesinde
    // klinik admin olarak görünmesini engelliyordu.
    const effectiveUserType = user_type;
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
    // Lab kullanıcısı: caller'ın lab_id'sini miras al + otomatik onaylı
    // Doktor/klinik: lab_id yok, approval_status = 'approved'
    const isLabUser = effectiveUserType === 'lab';
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
        // Lab kullanıcısı caller'ın lab_id'sini alır — wizard'a düşmez
        lab_id: isLabUser ? inheritedLabId : null,
        // Clinic_admin tarafından eklenen hekim/sekreter/yedek-admin caller'ın clinic_id'sini alır
        clinic_id: callerIsClinicAdmin && ['doctor', 'clinic_admin', 'clinic_secretary'].includes(effectiveUserType)
          ? (callerProfile.clinic_id ?? null)
          : (clinic_id ?? null),
        clinic_permissions: effectivePermissions,
        // Lab/admin'den eklendiğinde otomatik onaylı (manuel kayıt değil)
        approval_status: 'approved',
        phone_verified: true,
      });

    // Hekim veya klinik admin ise clinic + doctor kaydı oluştur
    if (user_type === 'doctor' || user_type === 'clinic_admin') {
      // Clinic_admin caller ise: kendi kliniğini kullan, yeni klinik açma
      let targetClinicId: string | null = null;
      if (callerIsClinicAdmin && callerProfile.clinic_id) {
        targetClinicId = callerProfile.clinic_id;
      } else if (clinic_id) {
        targetClinicId = clinic_id;
      } else {
        // Yeni klinik oluştur (admin/lab tarafından kayıt akışı)
        const { data: newClinic } = await adminClient
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
        if (newClinic) targetClinicId = newClinic.id;
      }

      // doctors tablosuna sadece gerçek hekim ekle — clinic_admin yönetici, hekim değil.
      // skip_doctor_row=true: caller (ör. DoctorModal) `doctors` satırını ZATEN
      // createDoctor ile oluşturdu (specialty/notes/tckn dâhil) → burada ikinci
      // satır açma, aksi halde hekim listede çift görünür.
      if (targetClinicId && user_type === 'doctor' && !skip_doctor_row) {
        await adminClient.from('doctors').insert({
          full_name,
          phone: phone ?? null,
          clinic_id: targetClinicId,
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
