/**
 * send-otp — SMS OTP gönderme Edge Function
 *
 * Yerli SMS sağlayıcı desteği: NetGSM, İleti Merkezi, Mutlucell
 *
 * Environment variables (birincil sağlayıcı):
 *   SMS_PROVIDER   = "netgsm" | "iletimerkezi" | "mutlucell"
 *   SMS_API_KEY    = API anahtarı / usercode
 *   SMS_SECRET     = API şifresi
 *   SMS_SENDER     = Gönderici başlığı (örn: "ESENKIM")
 *   SMS_MSGHEADER  = (NetGSM mesaj başlığı)
 *
 * Yedek sağlayıcı (opsiyonel — birincil down olursa otomatik devreye girer):
 *   SMS_PROVIDER_FALLBACK  = "netgsm" | "iletimerkezi" | "mutlucell"
 *   SMS_API_KEY_FALLBACK
 *   SMS_SECRET_FALLBACK
 *   SMS_SENDER_FALLBACK    (boş bırakılırsa SMS_SENDER kullanılır)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OTP_LENGTH = 4
const OTP_EXPIRY_MINUTES = 5
const MAX_RESEND_COOLDOWN_SECONDS = 60

interface ProviderConfig {
  name: string
  apiKey: string
  secret: string
  sender: string
}

function generateOtp(): string {
  const digits = '0123456789'
  let code = ''
  const arr = new Uint8Array(OTP_LENGTH)
  crypto.getRandomValues(arr)
  for (let i = 0; i < OTP_LENGTH; i++) code += digits[arr[i] % 10]
  return code
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '')
}

/** Yapılandırılmış sağlayıcı listesini döndür (birincil + yedek) */
function buildProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = []

  const primary = Deno.env.get('SMS_PROVIDER')
  if (primary) {
    providers.push({
      name: primary.toLowerCase(),
      apiKey: Deno.env.get('SMS_API_KEY') || '',
      secret: Deno.env.get('SMS_SECRET') || '',
      sender: Deno.env.get('SMS_SENDER') || '',
    })
  }

  const fallback = Deno.env.get('SMS_PROVIDER_FALLBACK')
  if (fallback) {
    providers.push({
      name: fallback.toLowerCase(),
      apiKey: Deno.env.get('SMS_API_KEY_FALLBACK') || '',
      secret: Deno.env.get('SMS_SECRET_FALLBACK') || '',
      sender: Deno.env.get('SMS_SENDER_FALLBACK') || Deno.env.get('SMS_SENDER') || '',
    })
  }

  return providers
}

/** Belirli sağlayıcıya gönder */
async function sendViaProvider(
  cfg: ProviderConfig, phone: string, message: string
): Promise<{ success: boolean; error?: string }> {
  const cleanPhone = phone.replace(/\D/g, '')
  try {
    switch (cfg.name) {
      case 'netgsm':       return await sendViaNetGSM(cleanPhone, message, cfg.apiKey, cfg.secret, cfg.sender)
      case 'iletimerkezi': return await sendViaIletiMerkezi(cleanPhone, message, cfg.apiKey, cfg.secret, cfg.sender)
      case 'mutlucell':    return await sendViaMutlucell(cleanPhone, message, cfg.apiKey, cfg.secret, cfg.sender)
      default:
        console.log(`[SMS-DEV] ${cfg.name} | ${cleanPhone} | ${message}`)
        return { success: true }
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/** Birincil sağlayıcıyı dene, başarısız olursa yedek sağlayıcıya geç */
async function sendSmsWithFallback(
  phone: string, message: string
): Promise<{ success: boolean; error?: string }> {
  const providers = buildProviders()

  if (providers.length === 0) {
    // Hiç provider tanımlanmamış → dev mode
    console.log(`[SMS-DEV] No provider configured. Phone: ${phone}, Message: ${message}`)
    return { success: true }
  }

  for (const provider of providers) {
    const result = await sendViaProvider(provider, phone, message)
    if (result.success) return { success: true }
    console.warn(`[SMS] ${provider.name} başarısız: ${result.error}${providers.indexOf(provider) < providers.length - 1 ? ' — yedek sağlayıcı deneniyor' : ''}`)
  }

  return { success: false, error: 'Tüm SMS sağlayıcıları başarısız oldu. Lütfen daha sonra tekrar deneyin.' }
}

async function sendViaNetGSM(
  phone: string, message: string, usercode: string, password: string, msgheader: string
): Promise<{ success: boolean; error?: string }> {
  const url = 'https://api.netgsm.com.tr/sms/send/get'
  const params = new URLSearchParams({
    usercode, password, gsmno: phone, message,
    msgheader: msgheader || Deno.env.get('SMS_MSGHEADER') || '',
    dil: 'TR',
  })
  const res = await fetch(`${url}?${params.toString()}`)
  const text = await res.text()
  if (text.startsWith('00') || text.startsWith('0')) return { success: true }
  return { success: false, error: `NetGSM: ${text}` }
}

async function sendViaIletiMerkezi(
  phone: string, message: string, apiKey: string, secret: string, sender: string
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('https://api.iletimerkezi.com/v1/send-sms/json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request: {
        authentication: { key: apiKey, hash: secret },
        order: {
          sender, sendDateTime: '',
          message: { text: message, receipts: { receipt: [{ number: phone }] } },
        },
      },
    }),
  })
  const data = await res.json()
  if (data?.response?.status?.code === '200') return { success: true }
  return { success: false, error: `İleti Merkezi: ${data?.response?.status?.message || 'Bilinmeyen hata'}` }
}

async function sendViaMutlucell(
  phone: string, message: string, apiKey: string, secret: string, sender: string
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('https://smsgw.mutlucell.com/smsgw-ws/sndblkex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<smspack ka="${apiKey}" pwd="${secret}" org="${sender}">
  <mesaj><metin>${message}</metin><nums>${phone}</nums></mesaj>
</smspack>`,
  })
  const text = await res.text()
  const code = parseInt(text.trim(), 10)
  if (code > 0) return { success: true }
  return { success: false, error: `Mutlucell: ${text}` }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Yetkisiz erişim')

    const supabaseUrl     = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey         = Deno.env.get('SUPABASE_ANON_KEY')!

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: authError } = await callerClient.auth.getUser()
    if (authError || !userData.user) throw new Error('Yetkisiz erişim')

    const userId = userData.user.id
    const { phone } = await req.json()
    if (!phone) throw new Error('Telefon numarası gerekli')

    const normalizedPhone = normalizePhone(phone)
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Rate limit: son 60 sn içinde bu kullanıcıya gönderilmiş mi?
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

    // Eski doğrulanmamış kodları temizle
    await adminClient
      .from('phone_verifications')
      .delete()
      .eq('user_id', userId)
      .eq('verified', false)

    // Yeni OTP oluştur ve kaydet
    const code = generateOtp()
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString()

    const { error: insertError } = await adminClient
      .from('phone_verifications')
      .insert({ user_id: userId, phone: normalizedPhone, code, expires_at: expiresAt })

    if (insertError) throw new Error(`OTP kaydedilemedi: ${insertError.message}`)

    // SMS gönder (birincil → yedek)
    const smsResult = await sendSmsWithFallback(normalizedPhone, `Esenkim doğrulama kodunuz: ${code}`)

    if (!smsResult.success) {
      // OTP kaydını geri al — SMS gitmedi, kullanıcı kodu alamayacak
      await adminClient.from('phone_verifications').delete().eq('user_id', userId).eq('code', code)
      throw new Error(smsResult.error || 'SMS gönderilemedi.')
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
