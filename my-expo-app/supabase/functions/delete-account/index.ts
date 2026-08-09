// delete-account — kullanıcının KENDİ hesabını silmesi (App Store 5.1.1(v) uyumu).
//
// Model:
//   • Kişisel veri + giriş silinir (auth.users → profiles CASCADE ile kişisel
//     tablolar da gider: bildirimler, push_tokens, izinler, üyelik vb.).
//   • İş/finans kayıtları KORUNUR, kişi referansı boşalır (FK'lar SET NULL) —
//     yasal/mali saklama; Apple bunu açıkça izin verir.
//   • Silmeyi ENGELLEYEN 4 FK (NO ACTION) önce null'lanır, yoksa delete hata verir.
//   • Bir lab'ın son yöneticisi/sahibi veya bir kliniğin son yöneticisi ise
//     engellenir (tenant yönetici­siz/kilitli kalmasın) — önce devir gerekir.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Yetkisiz erişim')

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!

    const adminClient  = createClient(supabaseUrl, serviceRoleKey)
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Kimlik — yalnızca çağıran kendini silebilir (hedef ID YOK, admin yetkisi YOK).
    const { data: userData, error: authError } = await callerClient.auth.getUser()
    if (authError || !userData.user) throw new Error('Yetkisiz erişim')
    const callerId = userData.user.id

    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, user_type, role, lab_id, clinic_id, doctor_id, full_name')
      .eq('id', callerId)
      .maybeSingle()

    if (profile) {
      // ── Son yönetici/sahip koruması ──
      // Lab: manager rolü veya lab sahibi isen, aynı lab'da başka aktif manager yoksa engelle.
      if (profile.lab_id) {
        let isOwner = false
        const { data: lab } = await adminClient
          .from('labs').select('owner_id').eq('id', profile.lab_id).maybeSingle()
        isOwner = !!lab && lab.owner_id === callerId
        const isManager = (profile.user_type === 'lab' || profile.user_type === 'admin') && profile.role === 'manager'
        if (isOwner || isManager) {
          const { count } = await adminClient
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('lab_id', profile.lab_id)
            .eq('role', 'manager')
            .eq('is_active', true)
            .neq('id', callerId)
          if (!count) {
            return json({
              error: 'Bu laboratuvarın son yöneticisisiniz. Hesabınızı silmeden önce yönetici yetkisini başka bir kullanıcıya devredin.',
              code: 'last_manager',
            })
          }
        }
      }

      // Klinik: son clinic_admin isen engelle.
      if (profile.user_type === 'clinic_admin' && profile.clinic_id) {
        const { count } = await adminClient
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('clinic_id', profile.clinic_id)
          .eq('user_type', 'clinic_admin')
          .eq('is_active', true)
          .neq('id', callerId)
        if (!count) {
          return json({
            error: 'Bu kliniğin son yöneticisisiniz. Hesabınızı silmeden önce yönetici yetkisini başka bir kullanıcıya devredin.',
            code: 'last_admin',
          })
        }
      }

      // ── Silmeyi engelleyen 4 FK'yı temizle (NO ACTION → null) ──
      await adminClient.from('clinic_lab_memberships').update({ approved_by: null }).eq('approved_by', callerId)
      await adminClient.from('employee_advance_requests').update({ approved_by: null }).eq('approved_by', callerId)
      await adminClient.from('lab_connect_codes').update({ created_by: null }).eq('created_by', callerId)
      await adminClient.from('user_permissions').update({ granted_by: null }).eq('granted_by', callerId)

      // ── Bağlı doctors satırı: silme (work_orders FK engeller) yerine PII'yi temizle ──
      if (profile.doctor_id) {
        try {
          await adminClient
            .from('doctors')
            .update({ full_name: 'Silinmiş hesap', is_active: false })
            .eq('id', profile.doctor_id)
        } catch { /* doctors anonimleştirme kritik değil — sürdür */ }
      }
    }

    // ── Auth kullanıcısını sil ──
    // CASCADE: kişisel tablolar (bildirim/izin/token/üyelik...) + profiles satırı silinir.
    // SET NULL: iş/finans kayıtları kimliksiz kalır (korunur).
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(callerId)
    if (deleteError) throw new Error(deleteError.message)

    // Güvenlik için profiles'ı manuel de sil (cascade yoksa).
    await adminClient.from('profiles').delete().eq('id', callerId)

    return json({ success: true })
  } catch (err: any) {
    return json({ error: String(err?.message ?? err) })
  }
})
