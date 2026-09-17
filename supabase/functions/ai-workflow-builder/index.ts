// ai-workflow-builder — Sihirbaz cevaplarından dental lab üretim akışı önerir.
// parse-work-order ile AYNI konvansiyon: Anthropic Claude + ANTHROPIC_API_KEY secret.
// Input  : { answers: {...}, stations?: string[], skills?: string[] }
// Output : { ok, data?: { stages[], skills[], staffing[], summary }, error? }
// Yazma YAPMAZ — sadece öneri üretir; istemci inceleyip uygular.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function callClaude(apiKey: string, prompt: string, maxTokens = 2200): Promise<string> {
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
  return '{' + (json?.content?.[0]?.text ?? '');
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

    const text = await callClaude(apiKey, buildPrompt(answers, stations, skills));
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Modelden JSON çıkarılamadı');
    let data: unknown;
    try { data = JSON.parse(m[0]); } catch { throw new Error('Model geçersiz JSON döndürdü'); }

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
