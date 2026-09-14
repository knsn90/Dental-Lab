// send-whatsapp-meta — Meta WhatsApp Cloud API ile MÜŞTERİYE (klinik/hekim)
// şablonlu bildirim gönderir. Yalnız 3 kategori: new_order, delivery, approval.
//
// Kaynak: notifications AFTER INSERT trigger (trg_whatsapp_meta_notify) VEYA
// istersen doğrudan invoke. Her kategorinin Meta'da ONAYLI bir şablonu olmalı.
//
// Kural özeti:
//   • Yalnız user_type IN ('doctor','clinic') alıcıya gider (lab/admin'e değil).
//   • whatsapp_phone dolu olmalı.
//   • Opt-out: notification_prefs.categories[cat].whatsapp === false ise gitmez
//     (unset/true → gider — mail filtresiyle aynı mantık).
//   • Gönderen numara: siparişin (work_order.lab_id) lab'ının whatsapp-cloud
//     provider_credentials'ı (aktif). Lab kurmadıysa sessiz atlanır.
//
// Deploy: --no-verify-jwt (net.http_post anon+secret ile çağırır; iç kontrol yok
//   ama sadece şablonlu, müşteriye giden mesaj → düşük risk). NOTIFY_FN_SECRET
//   verilirse header eşleşmesi aranır.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { timingSafeEqualStr } from '../_shared/security.ts';

const GRAPH_VERSION = 'v20.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notify-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const NOTIFY_SECRET  = Deno.env.get('NOTIFY_FN_SECRET') ?? '';

const admin = createClient(supabaseUrl, serviceRoleKey);

// Kategori → şablon eşlemesi. params(payload) her kategori için Meta değişken
// dizisini üretir (sırayla {{1}},{{2}},…). Değişken sayısı Meta'daki şablonla
// birebir aynı olmalı.
// Meta ISIMLI değişken kullanıyor ({{hasta_adi}} …) → parameter_name ile gönderilir.
// İsimler Meta'daki şablon değişkenleriyle BİREBİR aynı olmalı.
type NamedParam = { name: string; text: string };
const TEMPLATES: Record<string, { name: string; lang: string; params: (p: any) => NamedParam[] }> = {
  new_order: {
    name: 'siparis_alindi', lang: 'tr',
    params: (p) => [
      { name: 'hasta_adi',  text: clean(p.patient || p.patient_name) },
      { name: 'siparis_no', text: clean(p.orderNumber || p.order_number) },
    ],
  },
  delivery: {
    name: 'siparis_kuryede', lang: 'tr',
    params: (p) => [
      { name: 'hasta_adi',  text: clean(p.patient || p.patient_name) },
      { name: 'siparis_no', text: clean(p.orderNumber || p.order_number) },
    ],
  },
  approval: {
    name: 'onay_bekliyor', lang: 'tr',
    params: (p) => [
      { name: 'onay_turu',  text: clean(p.kind || 'tasarım') },
      { name: 'siparis_no', text: clean(p.orderNumber || p.order_number || p.patient || p.patient_name) },
    ],
  },
  // Ödeme hatırlatması → kliniğe/hekime. {{detay}} = notification gövdesi (RPC hazırlıyor).
  // Şablon metninde "Bu otomatik bir hatırlatmadır…" notu SABİT var (rahatsız etmesin).
  payment: {
    name: 'odeme_hatirlatma', lang: 'tr',
    params: (p) => [
      { name: 'detay', text: clean(p.__body || p.body || 'Hesabınızda açık bakiye bulunuyor.') },
    ],
  },
};

// Lab ADMIN'e giden AYRI şablon (müşteri metni değil): "Laboratuvarınıza yeni sipariş geldi …".
// Yalnız new_order kategorisi. Değişken adları Meta'daki yeni_siparis_lab şablonuyla BİREBİR.
const LAB_TEMPLATES: Record<string, { name: string; lang: string; params: (p: any) => NamedParam[] }> = {
  new_order: {
    name: 'yeni_siparis_lab', lang: 'tr',
    params: (p) => [
      { name: 'siparis_no', text: clean(p.orderNumber || p.order_number) },
      { name: 'klinik',     text: clean(p.clinic || p.clinicName || p.clinic_name || '—') },
      { name: 'hasta_adi',  text: clean(p.patient || p.patient_name) },
      { name: 'detay',      text: clean(p.workType || p.work_type) },
    ],
  },
};

// Meta şablon değişkeni: boş olamaz, sekme/yeni satır/4+ boşluk olamaz.
function clean(v: any): string {
  const s = String(v ?? '').replace(/[\t\n\r]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  return s.length ? s.slice(0, 200) : '—';
}

// TR telefonunu Meta biçimine (ülke kodlu, ör. 905xxxxxxxxx) çevir.
//   "0535 524 48 59" → 905355244859 · "5355244859" → 905355244859 · "+90…" → 90…
// Tanınmayan biçimde ham rakamı döndürür (Meta reddederse audit'te görünür).
function normalizePhoneTR(raw: any): string {
  let d = String(raw ?? '').replace(/[^\d]/g, '');
  if (!d) return '';
  if (d.startsWith('90') && d.length === 12) return d;          // zaten ülke kodlu
  if (d.startsWith('0') && d.length === 11) return '90' + d.slice(1); // 05xx… → 905xx…
  if (d.length === 10 && d.startsWith('5')) return '90' + d;    // 5xx… → 905xx…
  return d;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  // İç-secret ZORUNLU (fail closed). Bu uç anon anahtarıyla çağrılabildiği için
  // secret olmadan herkes müşteriye şablon mesajı attırabilir + lab hedefleyebilirdi.
  // Sabit-zamanlı karşılaştırma.
  if (!NOTIFY_SECRET) {
    console.error('[send-whatsapp-meta] NOTIFY_FN_SECRET tanımlı değil — istek reddedildi');
    return json({ ok: false, error: 'not_configured' }, 503);
  }
  {
    const given = req.headers.get('x-notify-secret') ?? '';
    if (!timingSafeEqualStr(given, NOTIFY_SECRET)) return json({ ok: false, error: 'forbidden' }, 401);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }

  const category = String(body?.category ?? '');
  const tpl = TEMPLATES[category];
  if (!tpl) return json({ ok: true, skipped: 'no-template-for-category' });   // no-op

  const userIds: string[] = Array.isArray(body?.userIds) ? body.userIds.filter(Boolean) : [];
  if (userIds.length === 0) return json({ ok: true, sent: 0 });

  const extra = body?.payload ?? {};
  const resourceType = String(body?.resource_type ?? '');
  const resourceId   = body?.resource_id ?? null;

  // Gönderen lab'ı SERVER-SIDE, güvenilir kaynak tablosundan çöz (payload'dan DEĞİL).
  let labId: string | null = null;
  if (resourceType === 'work_order' && resourceId) {
    const { data: wo } = await admin.from('work_orders').select('lab_id').eq('id', resourceId).maybeSingle();
    labId = (wo as any)?.lab_id ?? null;
  } else if (resourceType === 'invoice' && resourceId) {
    const { data: inv } = await admin.from('invoices').select('lab_id').eq('id', resourceId).maybeSingle();
    labId = (inv as any)?.lab_id ?? null;
  }
  // clinic_balance gibi server-side lab kaynağı OLMAYAN kategoriler: bu uç artık
  // ZORUNLU x-notify-secret ile korunuyor (yalnız DB trigger'ımız çağırabilir),
  // dolayısıyla payload'daki __lab_id GÜVENİLİR çağırandan gelir — attacker-kontrollü
  // değil. Sadece bu güvenli bağlamda ve yalnız son çare olarak kabul edilir.
  if (!labId && extra?.__lab_id) labId = String(extra.__lab_id) || null;
  if (!labId) return json({ ok: true, sent: 0, skipped: 'no-lab' });

  // Lab'ın aktif whatsapp-cloud kimliği
  const { data: credRow } = await admin
    .from('provider_credentials')
    .select('credentials')
    .eq('lab_id', labId).eq('type', 'messaging').eq('provider', 'whatsapp-cloud').eq('is_active', true)
    .maybeSingle();
  const cred = (credRow as any)?.credentials ?? null;
  if (!cred?.phone_number_id || !cred?.access_token) return json({ ok: true, sent: 0, skipped: 'no-wa-cred' });

  const params = tpl.params(extra);

  // Alıcı profillerini çek
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, user_type, whatsapp_phone, phone, notification_prefs')
    .in('id', userIds);

  let sent = 0;
  const results: any[] = [];
  for (const pr of (profiles ?? []) as any[]) {
    // Şablon alıcı tipine göre: müşteri (doctor/clinic) → müşteri şablonu (siparis_alindi…);
    // lab tarafı (admin + lab yöneticisi) → lab şablonu (yeni_siparis_lab, yalnız
    // new_order). Teknisyen/kurye atlanır.
    //
    // NOT: 'lab' eskiden buraya girmiyordu ve "not-client" diye atlanıyordu —
    // lab müdürleri bildirimi uygulama içinde görüyor ama telefonuna hiç mesaj
    // gelmiyordu (telefonu kayıtlı olsa bile). Bildirimi zaten yalnız
    // role='manager' olan lab profilleri alıyor (trg_work_order_notify_new),
    // yani buraya gelen 'lab' kaydı zaten yöneticidir. Lab şablonu olmayan
    // kategorilerde aşağıdaki `if (!lt)` ile eskisi gibi atlanır.
    let useTpl = tpl; let useParams = params;
    if (pr.user_type === 'admin' || pr.user_type === 'lab') {
      const lt = LAB_TEMPLATES[category];
      if (!lt) { results.push({ id: pr.id, skip: 'admin-no-lab-tpl' }); continue; }
      useTpl = lt; useParams = lt.params(extra);
    } else if (!['doctor', 'clinic', 'clinic_admin', 'clinic_secretary'].includes(pr.user_type)) {
      results.push({ id: pr.id, skip: 'not-client' }); continue;
    }
    // whatsapp_phone öncelikli; boşsa normal telefona düş. Meta ülke kodu ister → normalize.
    const phone = normalizePhoneTR(pr.whatsapp_phone || pr.phone);
    if (!phone) { results.push({ id: pr.id, skip: 'no-phone' }); continue; }
    // Opt-out
    const optedOut = pr?.notification_prefs?.categories?.[category]?.whatsapp === false;
    if (optedOut) { results.push({ id: pr.id, skip: 'opted-out' }); continue; }

    try {
      const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${cred.phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cred.access_token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: useTpl.name,
            language: { code: useTpl.lang },
            components: useParams.length
              ? [{ type: 'body', parameters: useParams.map(pp => ({ type: 'text', parameter_name: pp.name, text: pp.text })) }]
              : [],
          },
        }),
      });
      const j = await r.json();
      const ok = r.ok && Array.isArray(j?.messages);
      if (ok) sent++;
      results.push({ id: pr.id, ok, msg: ok ? 'sent' : (j?.error?.message ?? `HTTP ${r.status}`) });

      // Audit (best-effort)
      try {
        await admin.from('whatsapp_notifications').insert({
          user_id: pr.id, phone_to: phone, category,
          template: useTpl.name, provider: 'meta',
          status: ok ? 'sent' : 'failed',
          provider_id: ok ? (j?.messages?.[0]?.id ?? null) : null,
          error: ok ? null : (j?.error?.message ?? null),
          sent_at: ok ? new Date().toISOString() : null,
          // Yanıt-context korelasyonu: klinik bu bildirime "yanıt" verince
          // inbound-order-message provider_id(=wamid) → work_order_id ile siparişi bulur.
          work_order_id: (resourceType === 'work_order' ? resourceId : null),
          payload: extra ?? {},
        });
      } catch { /* audit opsiyonel */ }
    } catch (e) {
      results.push({ id: pr.id, ok: false, msg: String(e) });
    }
  }

  return json({ ok: true, sent, results });
});
