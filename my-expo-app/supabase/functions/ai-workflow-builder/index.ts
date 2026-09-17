// ai-workflow-builder — Sihirbaz cevaplarından dental lab üretim akışı önerir.
// parse-work-order ile AYNI konvansiyon: Anthropic Claude + ANTHROPIC_API_KEY secret.
// Input  : { answers: {...}, stations?: string[], skills?: string[] }
// Output : { ok, data?: { stages[], skills[], staffing[], summary }, error? }
// Yazma YAPMAZ — sadece öneri üretir; istemci inceleyip uygular.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Claude'u çağırır ve ham metni + durma nedenini döndürür.
 *
 * KESİLME: max_tokens 2200'dü ve çok hizmetli laboratuvar profillerinde (10 hizmet →
 * 11 aşama + 10 yetkinlik + 4 personel) yanıt tam buraya dayanıp YARIDA kesiliyordu.
 * Yarım metin ayrıştırılamayınca kullanıcı "Model geçersiz JSON döndürdü" görüyordu
 * (17.09.2026). Sınır yükseltildi ve `stop_reason` artık çağırana bildiriliyor.
 */
async function callClaude(apiKey: string, prompt: string, maxTokens = 8000): Promise<{ text: string; stopReason: string | null }> {
  let resp: Response | null = null;
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: maxTokens,
        messages: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: '{' }, // JSON'a zorla (prefill)
        ],
      }),
    });
    if (resp.ok) break;
    lastErr = `${resp.status}: ${(await resp.text()).slice(0, 300)}`;
    if (resp.status < 500 && resp.status !== 429) break;
    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
  }
  if (!resp || !resp.ok) throw new Error(`Claude API error ${lastErr}`);
  const json = await resp.json();
  return {
    text: '{' + (json?.content?.[0]?.text ?? ''),
    stopReason: json?.stop_reason ?? null,
  };
}

/**
 * Model çıktısından JSON nesnesini çıkarır.
 * - Markdown kod bloğu (```json … ```) gelirse soyar.
 * - Süslü parantezleri SAYARAK dengeli bloğu keser: açgözlü `\{[\s\S]*\}` kalıbı,
 *   yanıt kesildiğinde bozuk parçayı yakalayıp ayrıştırmayı garanti patlatıyordu.
 */
function extractJson(raw: string): unknown | null {
  const text = raw.replace(/```json\s*/gi, '').replace(/```/g, '');
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;   // dengeli blok yok → yanıt kesilmiş
}

function buildPrompt(answers: Record<string, unknown>, stations: string[], skills: string[]): string {
  return `Sen bir diş laboratuvarı üretim danışmanısın. Aşağıdaki laboratuvar profiline göre ÜRETİM İŞ AKIŞI öner.

LAB PROFİLİ (sihirbaz cevapları):
${JSON.stringify(answers, null, 2)}

LAB'DA HALİHAZIRDA TANIMLI İSTASYONLAR (varsa bu adları AYNEN kullan):
${stations.length ? stations.join(', ') : '(yok)'}

LAB'DA HALİHAZIRDA TANIMLI YETKİNLİKLER:
${skills.length ? skills.join(', ') : '(yok)'}

GÖREV: Bu laboratuvar için mantıklı bir üretim hattı (aşama sırası), gereken yetkinlikler ve personel önerisi üret.
- Aşama sırası gerçek dental üretim akışına uysun (ör. Tarama → CAD → CAM → Frezeleme → Sinterleme → Porselen → Kalite → Paketleme).
- Lab seramik yapmıyorsa porselen/glazür aşamalarını ekleme. İmplant/full-arch yoksa o aşamaları ekleme.
- Süreleri (dakika) ve SLA'yı (saat) gerçekçi ver.
- required_skills, skills listesindeki adlarla tutarlı olsun.
- icon değeri şunlardan biri: cpu, layers, wrench, brush, box, scan, printer, gem, cog, zap.
- cert_level: "temel" | "orta" | "uzman" | null.

SADECE şu şemada JSON döndür, başka metin YAZMA:
{
  "stages": [
    { "name": "Tarama", "est_duration_min": 20, "sla_hours": 4, "required_skills": ["Tarama"] }
  ],
  "skills": [
    { "name": "CAD Tasarım", "description": "...", "cert_level": "orta", "color": "#3B82F6", "icon": "cpu" }
  ],
  "staffing": [
    { "role": "CAD Teknisyeni", "count": 2, "skills": ["CAD Tasarım"] }
  ],
  "summary": "1-2 cümle özet"
}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const answers = (body.answers ?? {}) as Record<string, unknown>;
    const stations = Array.isArray(body.stations) ? body.stations.filter((x: unknown) => typeof x === 'string') : [];
    const skills = Array.isArray(body.skills) ? body.skills.filter((x: unknown) => typeof x === 'string') : [];

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY tanımlı değil');

    const prompt = buildPrompt(answers, stations, skills);
    let res = await callClaude(apiKey, prompt);
    let data = extractJson(res.text);

    // Yanıt token sınırında kesildiyse (ya da dengeli JSON çıkmadıysa) daha geniş
    // bütçeyle BİR KEZ daha dene — çok hizmetli profillerde tek fark bu.
    if (!data && (res.stopReason === 'max_tokens' || res.stopReason === null)) {
      res = await callClaude(apiKey, prompt, 16000);
      data = extractJson(res.text);
    }

    if (!data) {
      throw new Error(
        res.stopReason === 'max_tokens'
          ? 'Yanıt çok uzun olduğu için tamamlanamadı — daha az hizmet seçip tekrar deneyin'
          : 'Model geçersiz JSON döndürdü',
      );
    }

    return new Response(JSON.stringify({ ok: true, data }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (e) {
    const msg = (e && typeof e === 'object' && 'message' in e) ? (e as { message: string }).message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});
