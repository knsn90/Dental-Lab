/**
 * voice-order-lookup — telefon asistanının iş durumu sorgusu (SALT OKUNUR).
 *
 * Çağıran: /opt/voice-agent köprüsü. Kimlik: `x-voice-secret` (VOICE_INTAKE_SECRET) — ZORUNLU.
 * Lab: istekten ALINMAZ; VOICE_LAB_ID sunucu ayarı.
 *
 * Güvenlik kararı (kullanıcı, 2026-10-08): iş detayı YALNIZ Siman'da kayıtlı bir klinik
 * (phone / whatsapp_phone) ya da hekim (phone) numarasından arayana verilir; yalnız o
 * kliniğin/hekimin işleri. PIN yok. Liste okunmaz: arayan hasta adı ya da iş numarası verir,
 * en fazla 3 eşleşme döner. Arayan numarası köprüde SIP arayan kimliğinden gelir (LLM'den değil).
 * Bilinen kabul edilmiş risk: arayan kimliği taklidi.
 *
 * Gövde: { caller_number, patient_name?, order_number? }
 * Cevap: { ok, verified, caller_label?, matches?: [...], too_many?, need? }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { timingSafeEqualStr } from '../_shared/security.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-voice-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const STATUS_LABEL: Record<string, string> = {
  alindi: 'Alındı', kutu_atandi: 'Kutu atandı', atama_bekleniyor: 'Atama bekleniyor',
  asamada: 'Üretimde', uretimde: 'Üretimde', kalite_kontrol: 'Kalite kontrol',
  teslimata_hazir: 'Teslimata hazır', kurye_bekleniyor: 'Kurye bekleniyor', kuryede: 'Kuryede',
  teslim_edildi: 'Teslim edildi', iptal: 'İptal',
};

/** Telefonu son 10 haneye indirger: "+90 532 111 22 33", "05321112233", "532..." -> "5321112233". */
function last10(v: unknown): string {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}

/** Türkçe büyük/küçük harf ve şapka duyarsız karşılaştırma için normalize. */
function norm(s: unknown): string {
  return String(s ?? '').toLocaleLowerCase('tr')
    .replace(/[âà]/g, 'a').replace(/[îì]/g, 'i').replace(/[ûù]/g, 'u')
    .replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  try {
    const expected = Deno.env.get('VOICE_INTAKE_SECRET') ?? '';
    const labId = Deno.env.get('VOICE_LAB_ID') ?? '';
    if (!expected || !labId) return json({ ok: false, error: 'not_configured' }, 503);
    if (!timingSafeEqualStr(req.headers.get('x-voice-secret') ?? '', expected)) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }

    const b = await req.json().catch(() => ({}));
    const caller = last10(b.caller_number);
    if (!caller) return json({ ok: true, verified: false });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // 1) Arayanı tanı: kayıtlı klinik ya da hekim numarası mı?
    const [{ data: clinics }, { data: doctors }] = await Promise.all([
      admin.from('clinics').select('id, name, phone, whatsapp_phone').eq('lab_id', labId),
      admin.from('doctors').select('id, full_name, phone, clinic_id').eq('lab_id', labId),
    ]);
    const clinicHits = (clinics ?? []).filter((c: any) => last10(c.phone) === caller || last10(c.whatsapp_phone) === caller);
    const doctorHits = (doctors ?? []).filter((d: any) => last10(d.phone) === caller);
    if (!clinicHits.length && !doctorHits.length) return json({ ok: true, verified: false });

    const clinicIds = new Set(clinicHits.map((c: any) => c.id));
    const allowedDoctorIds = (doctors ?? [])
      .filter((d: any) => doctorHits.some((h: any) => h.id === d.id) || (d.clinic_id && clinicIds.has(d.clinic_id)))
      .map((d: any) => d.id);
    const callerLabel = clinicHits[0]?.name ?? doctorHits[0]?.full_name ?? null;

    // Numaralandırmayı önle: tek harf/kısa parçayla hasta adı taranamasın.
    const patientQ = norm(b.patient_name).slice(0, 80).split(' ').filter((t) => t.length >= 3).join(' ');
    const orderRaw = String(b.order_number ?? '').replace(/\s/g, '').slice(0, 40);
    const orderQ = orderRaw.replace(/\D/g, '').length >= 3 ? orderRaw : '';
    if (!patientQ && !orderQ) {
      return json({ ok: true, verified: true, caller_label: callerLabel, matches: [], need: 'hasta_adi_veya_is_no' });
    }
    if (!allowedDoctorIds.length) return json({ ok: true, verified: true, caller_label: callerLabel, matches: [] });

    // 2) Yalnız bu kliniğin/hekimin işleri içinde ara
    const { data: orders } = await admin.from('work_orders')
      .select('order_number, patient_name, work_type, status, current_stage_name, delivery_date, is_urgent, hold_status, created_at')
      .eq('lab_id', labId).in('doctor_id', allowedDoctorIds)
      .order('created_at', { ascending: false }).limit(500);

    const tokens = patientQ.split(' ').filter(Boolean);
    const hits = (orders ?? []).filter((o: any) => {
      if (orderQ && String(o.order_number ?? '').replace(/\s/g, '').toLowerCase().endsWith(orderQ.toLowerCase())) return true;
      if (tokens.length) { const n = norm(o.patient_name); return tokens.every((t) => n.includes(t)); }
      return false;
    });

    if (hits.length > 3) return json({ ok: true, verified: true, caller_label: callerLabel, matches: [], too_many: true, count: hits.length });

    const fmtDate = (d: string | null) => d
      ? new Date(String(d) + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })
      : null;
    return json({
      ok: true, verified: true, caller_label: callerLabel,
      matches: hits.map((o: any) => ({
        order_number: o.order_number,
        patient_name: o.patient_name,
        work_type: o.work_type,
        status: STATUS_LABEL[String(o.status)] ?? String(o.status ?? ''),
        stage: o.current_stage_name || null,
        delivery_date: fmtDate(o.delivery_date),
        is_urgent: !!o.is_urgent,
        on_hold: !!o.hold_status && o.hold_status !== 'none',
      })),
    });
  } catch (e) {
    console.error('[voice-lookup] hata:', (e as Error).message);
    return json({ ok: false, error: 'internal' }, 500);
  }
});
