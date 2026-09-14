// whatsapp-brain — WhatsApp sohbet botunun serbest-metin yanıtlayıcısı.
//
// NEDEN AYRI BİR FONKSİYON:
// `denty-brain` giriş yapmış kullanıcı JWT'si şart koşuyor (`auth.getUser`).
// WhatsApp'tan yazan kişinin oturumu yok — elimizde yalnız telefon numarası var.
// Bu yüzden onu çağıramıyoruz; bu fonksiyon service-role ile çalışır ve
// kimliği paylaşılan sır + lab eşleşmesiyle doğrular.
//
// NE YAPAR / NE YAPMAZ:
//   • Yanıtı YAZAR, veriyi YAZMAZ. Hiçbir tabloya insert/update etmez.
//   • Sipariş oluşturma, diş numarası, tarih, foto ekleme gibi İŞLEMSEL adımlar
//     buraya HİÇ gelmez — onlar webhook'taki deterministik akışta kalır.
//     Oradaki bir yanlış anlama bozuk iş emri üretir; risk getirisinden büyüktür.
//   • Yanıt DEMİRLENMİŞTİR: gönderenin klinik/hekim kimliği ve açık siparişleri
//     sunucuda çekilip prompt'a konur. Bu olmadan model sipariş durumu uydurur
//     ve hata doğrudan hastaya yansır.
//
// Input : { lab_id, phone, text, sender_name?, doctor_id?, clinic_id?,
//           clinic_name?, doctor_name? }
// Output: { ok: true, reply: string, handoff: boolean } | { ok: false, error }
//
// Deploy:
//   supabase functions deploy whatsapp-brain --project-ref <REF> --workdir my-expo-app --use-api
// Secrets: ANTHROPIC_API_KEY, WA_BRAIN_SECRET (opsiyonel — varsa zorunlu kılınır)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { timingSafeEqualStr } from '../_shared/security.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wa-secret',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

/** Günlük çağrı tavanı — WhatsApp hattı herkese açık, maliyeti sınırsız olamaz. */
const DAILY_LIMIT_PER_LAB = Number(Deno.env.get('WA_BRAIN_DAILY_LIMIT') ?? '300');
// Sonnet 5 — 4.5'e göre belirgin biçimde daha doğal/akıcı Türkçe yazıyor.
// Opus tercih edilmedi: WhatsApp hattı herkese açık, her mesaj için en pahalı
// modeli çalıştırmak maliyeti gereksiz büyütür (tavan zaten 300/gün).
const MODEL = 'claude-sonnet-5';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ─── 1. Kimlik: paylaşılan sır — ZORUNLU ───────────────────────────────
    // Sır opsiyonel bırakılamaz: bu uç anon anahtarıyla çağrılabiliyor, yani
    // sırsız hâlde herkes hem LLM maliyeti yakabilir hem de bir lab_id +
    // doctor_id tahminiyle sipariş bilgisi çektirebilirdi. Sır tanımlı değilse
    // fonksiyon hizmet vermez (açık ve gürültülü başarısızlık).
    const expected = Deno.env.get('WA_BRAIN_SECRET') ?? '';
    if (!expected) {
      console.error('[wa-brain] WA_BRAIN_SECRET tanımlı değil — istek reddedildi');
      return json({ ok: false, error: 'not_configured' }, 503);
    }
    if (!timingSafeEqualStr(req.headers.get('x-wa-secret') ?? '', expected)) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const labId: string | null = body.lab_id ?? null;
    const phone: string | null = body.phone ?? null;
    const text: string = String(body.text ?? '').slice(0, 1500);
    if (!labId || !phone || !text.trim()) {
      return json({ ok: false, error: 'lab_id, phone ve text zorunlu' }, 400);
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ ok: false, error: 'ANTHROPIC_API_KEY yok' }, 500);

    const url = Deno.env.get('SUPABASE_URL')!;
    const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, svc);

    // ─── 2. Günlük kota (lab başına) ───────────────────────────────────────
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { count } = await admin
        .from('whatsapp_brain_usage')
        .select('*', { count: 'exact', head: true })
        .eq('lab_id', labId).eq('day', today);
      if ((count ?? 0) >= DAILY_LIMIT_PER_LAB) {
        return json({ ok: false, error: 'quota', handoff: true }, 429);
      }
    } catch { /* sayaç tablosu yoksa limit uygulanmaz — geriye dönük güvenli */ }

    // ─── 3. DEMİRLEME — modele gerçek veriden başka bilgi verilmez ─────────
    const { data: lab } = await admin
      .from('labs').select('name').eq('id', labId).maybeSingle();

    // Çağıran (webhook) kapsamı zaten çözdüyse onu kullan: lab yöneticisi
    // hekim değildir, doctor_id'si yoktur — aşağıdaki sorgu onun için hep boş
    // döner ve model "sipariş göremiyorum" derdi.
    let orders: any[] = Array.isArray(body.orders) ? body.orders.slice(0, 10) : [];
    if (!orders.length && body.doctor_id) {
      // NOT: `.not('status','in','("a","b")')` kullanmayın — tırnaklı biçim
      // PostgREST'te hata döndürüyor, supabase-js data=null veriyor ve sipariş
      // listesi sessizce boşalıyordu (model "sipariş bulamadım" diyordu).
      // İki neq açık ve tartışmasız.
      // Kolon adı `delivery_date` — `due_date` YOK. Olmayan kolon seçilince
      // PostgREST hata döndürür, supabase-js data=null verir ve liste sessizce
      // boşalır; model de "sipariş bulamadım" der. Bu tam olarak yaşandı.
      const { data, error } = await admin
        .from('work_orders')
        .select('order_number, patient_name, work_type, status, delivery_date, created_at')
        .eq('lab_id', labId)
        .eq('doctor_id', body.doctor_id)
        .neq('status', 'teslim_edildi')
        .neq('status', 'iptal')
        .order('created_at', { ascending: false })
        .limit(8);
      if (error) console.error('[wa-brain] siparis sorgusu hatasi:', error.message);
      orders = data ?? [];
    }

    const orderLines = orders.length
      ? orders.map((o) => `- ${o.order_number} · ${o.patient_name ?? '—'} · ${o.work_type ?? '—'}`
          + ` · durum: ${o.status}` + (o.delivery_date ? ` · teslim: ${o.delivery_date}` : '')).join('\n')
      : '(bu numaraya bağlı açık sipariş yok)';

    const who = body.doctor_name || body.clinic_name || body.sender_name || 'değerli hekimimiz';

    // Modelin bugünü bilmesi ŞART. Yoksa teslim tarihini kendi eğitim zamanına
    // göre yorumluyor: testte 7 Ağustos'u "oldukça ileride, muhtemelen sistem
    // hatası" diye niteleyip gereksiz yere insana devretti.
    const today = new Date().toLocaleDateString('tr-TR', {
      day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul',
    });

    const system = [
      `Sen "Simanty"sin — ${lab?.name ?? 'diş laboratuvarı'} adına WhatsApp'tan yazan`,
      'YAPAY ZEKÂ asistanı. İnsan çalışan değilsin.',
      `Muhatabın: ${who}${body.clinic_name ? ` (${body.clinic_name})` : ''}.`,
      `BUGÜN: ${today}. Tarihleri buna göre yorumla; ileri bir teslim tarihini`,
      '"hata olabilir" diye niteleme.',
      '',
      'AŞAĞIDAKİ VERİ TEK GERÇEK KAYNAĞINDIR:',
      orderLines,
      '',
      'KURALLAR — istisnasız:',
      '1. Yukarıdaki listede olmayan hiçbir sipariş numarası, tarih, aşama veya fiyat SÖYLEME.',
      '   Bilmiyorsan "kontrol edip döneceğim" de ve devretme iste.',
      '2. Fiyat, indirim, ödeme ve teslim TAAHHÜDÜ verme. Bunlar laboratuvarın kararı.',
      '3. Sipariş oluşturma / dosya ekleme talebi gelirse KENDİN yapmaya çalışma;',
      '   "menüden ilgili adımı seçin" diyerek yönlendir (bu işlemler menüden yürür).',
      '4. Tıbbi tavsiye verme.',
      '5. ÜSLUP — bunu ciddiye al. Şablon gibi değil, işini bilen bir laboratuvar',
      '   çalışanı gibi yaz. Karşındaki meslektaşın; "siz" diye hitap et ama',
      '   resmî yazışma diliyle değil, sohbet eder gibi.',
      '   • Kısa tut: WhatsApp mesajı, 2-4 cümle yeter. Emoji en fazla bir tane.',
      '   • Doğrudan konuya gir. "Talebiniz tarafımıza ulaşmıştır", "memnuniyetle',
      '     yardımcı olurum", "size nasıl yardımcı olabilirim" gibi kalıpları KULLANMA.',
      '   • Sorulanı önce cevapla, gerekiyorsa sonra bir şey sor.',
      '   • Bilmiyorsan dolandırma; "ona bakıp döneyim" de.',
      '   • Madde işareti ancak gerçekten liste varsa, en fazla 3 madde.',
      '6. Emin olamadığın ya da şikâyet/itiraz içeren mesajlarda insana devret.',
      '7. ŞEFFAFLIK: kendini insan gibi tanıtma, insanmış izlenimi verme.',
      '   "Ben Simanty" diye imzalamana gerek yok (bunu sistem ayrıca bildiriyor),',
      '   ama "yapay zeka mısın / robot musun / insan mısın" diye sorulursa',
      '   TEREDDÜTSÜZ yapay zekâ asistanı olduğunu söyle ve yetkiliye',
      '   bağlanabileceklerini hatırlat.',
      '',
      'Yanıtını SADECE şu JSON ile ver, başka hiçbir şey yazma:',
      '{"reply": "<mesaj metni>", "handoff": <true|false>}',
      'handoff=true ise bir yetkiliye aktarılacak; reply yine de nazik bir ara mesaj olsun.',
    ].join('\n');

    // ─── 4. Claude ─────────────────────────────────────────────────────────
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[wa-brain] anthropic err:', res.status, errText.slice(0, 300));
      return json({ ok: false, error: 'llm_error', handoff: true }, 502);
    }

    const data = await res.json();
    const raw = (data?.content ?? []).map((c: any) => c?.text ?? '').join('').trim();

    let reply = ''; let handoff = false;
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : raw);
      reply = String(parsed.reply ?? '').trim();
      handoff = parsed.handoff === true;
    } catch {
      // Model JSON dışına çıktıysa metni olduğu gibi kullan — sessiz kaybetme.
      reply = raw;
    }
    if (!reply) return json({ ok: false, error: 'empty', handoff: true }, 502);

    // ─── 5. Sayaç (best-effort) ────────────────────────────────────────────
    try {
      await admin.from('whatsapp_brain_usage').insert({
        lab_id: labId, phone, day: new Date().toISOString().slice(0, 10),
      });
    } catch { /* sayaç yoksa akışı bozma */ }

    return json({ ok: true, reply: reply.slice(0, 900), handoff });

  } catch (e: any) {
    console.error('[wa-brain] err:', e?.message);
    return json({ ok: false, error: e?.message ?? 'server_error', handoff: true }, 500);
  }
});
