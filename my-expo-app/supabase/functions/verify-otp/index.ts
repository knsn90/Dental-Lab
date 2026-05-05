/**
 * verify-otp — SMS OTP doğrulama Edge Function
 *
 * Kullanıcının girdiği kodu phone_verifications tablosundan kontrol eder.
 * Başarılı doğrulama sonrası profile.phone_verified = true yapılır.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_ATTEMPTS = 5

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Yetkisiz erişim')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Caller'ın kimliğini doğrula
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: authError } = await callerClient.auth.getUser()
    if (authError || !userData.user) throw new Error('Yetkisiz erişim')

    const userId = userData.user.id
    const { code } = await req.json()
    if (!code) throw new Error('Doğrulama kodu gerekli')

    // Service role client
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Aktif OTP'yi bul
    const { data: verification, error: fetchError } = await adminClient
      .from('phone_verifications')
      .select('*')
      .eq('user_id', userId)
      .eq('verified', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (fetchError || !verification) {
      return new Response(
        JSON.stringify({ error: 'Geçerli bir doğrulama kodu bulunamadı. Lütfen yeni kod isteyin.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Max deneme kontrolü
    if (verification.attempts >= MAX_ATTEMPTS) {
      // Kodu sil — çok fazla deneme
      await adminClient
        .from('phone_verifications')
        .delete()
        .eq('id', verification.id)

      return new Response(
        JSON.stringify({ error: 'Çok fazla hatalı deneme. Lütfen yeni kod isteyin.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Kodu kontrol et
    if (verification.code !== code.trim()) {
      // Deneme sayısını artır
      await adminClient
        .from('phone_verifications')
        .update({ attempts: verification.attempts + 1 })
        .eq('id', verification.id)

      const remaining = MAX_ATTEMPTS - verification.attempts - 1
      return new Response(
        JSON.stringify({
          error: `Doğrulama kodu hatalı. ${remaining} deneme hakkınız kaldı.`,
          remaining_attempts: remaining,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ✅ Doğrulama başarılı
    // 1. OTP kaydını verified yap
    await adminClient
      .from('phone_verifications')
      .update({ verified: true })
      .eq('id', verification.id)

    // 2. Profile'da phone_verified flag'ini güncelle
    await adminClient
      .from('profiles')
      .update({
        phone_verified: true,
        phone: verification.phone,
      })
      .eq('id', userId)

    return new Response(
      JSON.stringify({ success: true, phone: verification.phone }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
