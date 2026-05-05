/**
 * send-otp — SMS OTP gönderme Edge Function
 *
 * Yerli SMS sağlayıcı desteği: NetGSM, İleti Merkezi, Mutlucell
 * Environment variables:
 *   SMS_PROVIDER = "netgsm" | "iletimerkezi" | "mutlucell"
 *   SMS_API_KEY  = API anahtarı / usercode
 *   SMS_SECRET   = API şifresi
 *   SMS_SENDER   = Gönderici başlığı (örn: "ESENKIM")
 *   SMS_MSGHEADER = (NetGSM için mesaj başlığı)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OTP_LENGTH = 4
const OTP_EXPIRY_MINUTES = 5
const MAX_RESEND_COOLDOWN_SECONDS = 60

/** 6 haneli rastgele kod üret */
function generateOtp(): string {
  const digits = '0123456789'
  let code = ''
  const arr = new Uint8Array(OTP_LENGTH)
  crypto.getRandomValues(arr)
  for (let i = 0; i < OTP_LENGTH; i++) {
    code += digits[arr[i] % 10]
  }
  return code
}

/** Telefon numarasını normalize et (başındaki + ve boşlukları temizle) */
function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '')
}

/** SMS gönder — sağlayıcıya göre */
async function sendSms(phone: string, message: string): Promise<{ success: boolean; error?: string }> {
  const provider = (Deno.env.get('SMS_PROVIDER') || 'netgsm').toLowerCase()
  const apiKey = Deno.env.get('SMS_API_KEY') || ''
  const secret = Deno.env.get('SMS_SECRET') || ''
  const sender = Deno.env.get('SMS_SENDER') || ''

  // Telefonu sadece rakam yap (uluslararası prefix dahil)
  const cleanPhone = phone.replace(/\D/g, '')

  try {
    switch (provider) {
      case 'netgsm': return await sendViaNetGSM(cleanPhone, message, apiKey, secret, sender)
      case 'iletimerkezi': return await sendViaIletiMerkezi(cleanPhone, message, apiKey, secret, sender)
      case 'mutlucell': return await sendViaMutlucell(cleanPhone, message, apiKey, secret, sender)
      default:
        console.log(`[SMS-DEV] Provider: ${provider}, Phone: ${cleanPhone}, Message: ${message}`)
        return { success: true } // Dev mode — sadece log
    }
  } catch (err: any) {
    console.error('[SMS ERROR]', err)
    return { success: false, error: err.message }
  }
}

/** NetGSM API — https://www.netgsm.com.tr/api-dokumantasyonu/ */
async function sendViaNetGSM(
  phone: string, message: string, usercode: string, password: string, msgheader: string
): Promise<{ success: boolean; error?: string }> {
  const url = 'https://api.netgsm.com.tr/sms/send/get'
  const params = new URLSearchParams({
    usercode,
    password,
    gsmno: phone,
    message,
    msgheader: msgheader || Deno.env.get('SMS_MSGHEADER') || '',
    dil: 'TR',
  })

  const res = await fetch(`${url}?${params.toString()}`)
  const text = await res.text()

  // NetGSM başarılı: "00" ile başlar veya bulk ID döner
  if (text.startsWith('00') || text.startsWith('0')) {
    return { success: true }
  }
  return { success: false, error: `NetGSM hata: ${text}` }
}

/** İleti Merkezi API — https://www.iletimerkezi.com/api */
async function sendViaIletiMerkezi(
  phone: string, message: string, apiKey: string, secret: string, sender: string
): Promise<{ success: boolean; error?: string }> {
  const url = 'https://api.iletimerkezi.com/v1/send-sms/json'
  const body = {
    request: {
      authentication: { key: apiKey, hash: secret },
      order: {
        sender,
        sendDateTime: '',
        message: {
          text: message,
          receipts: { receipt: [{ number: phone }] },
        },
      },
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()

  if (data?.response?.status?.code === '200') {
    return { success: true }
  }
  return { success: false, error: `İleti Merkezi: ${data?.response?.status?.message || 'Bilinmeyen hata'}` }
}

/** Mutlucell API — https://www.mutlucell.com.tr/api-dokumantasyonu/ */
async function sendViaMutlucell(
  phone: string, message: string, apiKey: string, _secret: string, sender: string
): Promise<{ success: boolean; error?: string }> {
  const url = 'https://smsgw.mutlucell.com/smsgw-ws/sndblkex'
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<smspack ka="${apiKey}" pwd="${_secret}" org="${sender}">
  <mesaj>
    <metin>${message}</metin>
    <nums>${phone}</nums>
  </mesaj>
</smspack>`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: xmlBody,
  })
  const text = await res.text()

  // Mutlucell başarılı: pozitif sayı döner
  const code = parseInt(text.trim(), 10)
  if (code > 0) return { success: true }
  return { success: false, error: `Mutlucell hata kodu: ${text}` }
}

// ── Main handler ──
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
    const { phone } = await req.json()
    if (!phone) throw new Error('Telefon numarası gerekli')

    const normalizedPhone = normalizePhone(phone)

    // Service role client (DB işlemleri için)
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Rate limit: son 60 sn içinde gönderilmiş mi?
    const cooldownTime = new Date(Date.now() - MAX_RESEND_COOLDOWN_SECONDS * 1000).toISOString()
    const { data: recentOtp } = await adminClient
      .from('phone_verifications')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', cooldownTime)
      .eq('verified', false)
      .limit(1)

    if (recentOtp && recentOtp.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Çok sık istek. Lütfen bekleyin.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Eski doğrulanmamış kodları sil
    await adminClient
      .from('phone_verifications')
      .delete()
      .eq('user_id', userId)
      .eq('verified', false)

    // Yeni OTP oluştur
    const code = generateOtp()
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString()

    const { error: insertError } = await adminClient
      .from('phone_verifications')
      .insert({
        user_id: userId,
        phone: normalizedPhone,
        code,
        expires_at: expiresAt,
      })

    if (insertError) throw new Error(`OTP kaydedilemedi: ${insertError.message}`)

    // SMS gönder
    const smsMessage = `Esenkim doğrulama kodunuz: ${code}`
    const smsResult = await sendSms(normalizedPhone, smsMessage)

    if (!smsResult.success) {
      console.error('[SMS SEND FAILED]', smsResult.error)
      // SMS gönderilemese bile OTP kaydedildi — geliştirme aşamasında log'dan bakılabilir
      // Production'da burada hata dönülmeli:
      // throw new Error(`SMS gönderilemedi: ${smsResult.error}`)
    }

    return new Response(
      JSON.stringify({ success: true, expires_in: OTP_EXPIRY_MINUTES * 60 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
