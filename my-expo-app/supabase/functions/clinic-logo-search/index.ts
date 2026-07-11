// clinic-logo-search — klinik adından VE/VEYA web sitesinden aday logolar getirir; ayrıca
// seçilen logoyu SERVER-SIDE indirip storage'a yükler (apply modu — tarayıcı CORS'undan kaçınır).
// Sonuç KULLANICIYA onaylatılır. CORS açık, JWT zorunlu; tüm DB/storage işlemleri caller (RLS) ile.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
function absUrl(base: string, u: string): string | null {
  try { return new URL(u, base).toString() } catch { return null }
}
function domainOf(input: string): string | null {
  let s = (input || '').trim().toLowerCase()
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '')
  s = s.split('/')[0].split('?')[0]
  return s && s.includes('.') ? s : null
}
async function scrapeSite(domain: string): Promise<string[]> {
  const out: string[] = []
  const base = `https://${domain}`
  try {
    const r = await fetch(base, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SimanBot/1.0)' }, redirect: 'follow' })
    if (!r.ok) return out
    const html = await r.text()
    const baseUrl = r.url || base
    const pick = (re: RegExp) => { const m = html.match(re); return m?.[1] ? absUrl(baseUrl, m[1]) : null }
    const og = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    const tw = pick(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
    const apple = pick(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i) || pick(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*apple-touch-icon[^"']*["']/i)
    const icon = pick(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i) || pick(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i)
    for (const u of [og, tw, apple, icon]) if (u) out.push(u)
    const imgTag = html.match(/<img[^>]*\b(?:class|alt|id)=["'][^"']*logo[^"']*["'][^>]*>/i)?.[0] || html.match(/<img[^>]*\bsrc=["'][^"']*logo[^"']*["'][^>]*>/i)?.[0]
    if (imgTag) { const src = imgTag.match(/\bsrc=["']([^"']+)["']/i)?.[1]; const a = src && absUrl(baseUrl, src); if (a) out.push(a) }
  } catch (_) { /* ulaşılamadı */ }
  return out
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Yetkisiz' })
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: u, error: e } = await caller.auth.getUser()
    if (e || !u.user) return json({ error: 'Yetkisiz' })

    const payload = await req.json().catch(() => ({}))

    // ── APPLY: seçilen logoyu server-side indir + storage'a yükle + clinics.logo_url ──
    if (payload?.apply && payload?.url && payload?.clinicId) {
      // Yetki: caller bu kliniği görebiliyor/yönetebiliyor mu? (RLS)
      const { data: cl } = await caller.from('clinics').select('id').eq('id', payload.clinicId).maybeSingle()
      if (!cl) return json({ error: 'Bu klinik için yetkiniz yok' })

      const imgResp = await fetch(payload.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SimanBot/1.0)' }, redirect: 'follow' })
      if (!imgResp.ok) return json({ error: 'Logo indirilemedi' })
      const ct = (imgResp.headers.get('content-type') || 'image/png').split(';')[0]
      if (!ct.startsWith('image/')) return json({ error: 'Geçerli bir görsel değil' })
      const ext = (ct.split('/')[1] || 'png').split('+')[0]
      const buf = new Uint8Array(await imgResp.arrayBuffer())
      const path = `clinics/${payload.clinicId}/logo.${ext}`
      // Storage upload service role ile (avatars bucket uid-klasör kısıtını aşar); yetki yukarıda doğrulandı.
      const admin = createClient(supabaseUrl, serviceKey)
      const { error: upErr } = await admin.storage.from('avatars').upload(path, buf, { upsert: true, contentType: ct })
      if (upErr) return json({ error: upErr.message })
      const { data: pub } = admin.storage.from('avatars').getPublicUrl(path)
      const { error: dbErr } = await caller.from('clinics').update({ logo_url: pub.publicUrl }).eq('id', payload.clinicId)
      if (dbErr) return json({ error: dbErr.message })
      return json({ logo_url: pub.publicUrl })
    }

    // ── SEARCH ──
    const query = (payload?.q ?? '').toString().trim()
    const website = (payload?.website ?? '').toString().trim()
    const candidates: { name: string; domain: string; url: string }[] = []
    const seen = new Set<string>()
    const add = (name: string, domain: string, url: string | null) => { if (url && !seen.has(url)) { seen.add(url); candidates.push({ name, domain, url }) } }

    const wdom = website ? domainOf(website) : null
    if (wdom) {
      for (const url of await scrapeSite(wdom)) add('Site logosu', wdom, url)
      add('Clearbit', wdom, `https://logo.clearbit.com/${wdom}`)
      add('Favicon', wdom, `https://www.google.com/s2/favicons?sz=256&domain=${wdom}`)
    }
    if (query) {
      try {
        const r = await fetch(`https://api.brandfetch.io/v2/search/${encodeURIComponent(query)}`)
        if (r.ok) {
          const arr = await r.json()
          for (const b of (Array.isArray(arr) ? arr : []).slice(0, 6)) {
            if (b?.icon) add(b.name ?? b.domain ?? query, b.domain ?? '', b.icon)
            if (b?.domain) { add(`${b.name ?? b.domain}`, b.domain, `https://logo.clearbit.com/${b.domain}`); add(`${b.name ?? b.domain}`, b.domain, `https://www.google.com/s2/favicons?sz=256&domain=${b.domain}`) }
          }
        }
      } catch (_) { /* arama başarısız */ }
    }
    return json({ candidates })
  } catch (err) {
    return json({ error: String((err as any)?.message ?? err) })
  }
})
