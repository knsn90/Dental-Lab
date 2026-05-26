import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { corsHeaders } from '../_shared/cors.ts'

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

const MAX_ATTEMPTS = 3

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
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
        { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
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
        { status: 429, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Kodu kontrol et (timing-safe karşılaştırma)
    if (!timingSafeEqual(verification.code, code.trim())) {
      const newAttempts = verification.attempts + 1
      await adminClient
        .from('phone_verifications')
        .update({ attempts: newAttempts })
        .eq('id', verification.id)

      // Bilgi sızıntısını önle: kalan deneme sayısını açıklamıyoruz
      return new Response(
        JSON.stringify({ error: 'Doğrulama kodu hatalı. Lütfen tekrar deneyin.' }),
        { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
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
      { status: 200, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
