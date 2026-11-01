// supabase/functions/efatura-luca/index.ts
//
// TÜRMOB Luca e-fatura — gönder / durum sorgula / mükellef sorgula.
//
// Luca yalnız whitelist'teki statik IP'yi kabul eder ve şifre istemez (yetki =
// IP + VKN). Bu yüzden çağrılar VPS'teki imzalı proxy'den geçer
// (infra/luca-proxy): LUCA_PROXY_BASE + /luca/<test|prod>/<Servis>.
//
// Fatura DB'den BURADA kurulur (istemcinin gönderdiği veriye güvenilmez —
// resmi vergi belgesi) ve sonuç (ETTN, Luca no, durum, log) burada yazılır;
// istemci arada kapansa da ETTN kaybolmaz.
//
//   body: { action: 'send' | 'status' | 'preview', invoice_id } | { action: 'mukellef', vkn }
//       | { action: 'merge_preview' | 'merge_send', invoice_ids, preview_token? }
//       | { action: 'link_lookup' | 'link', invoice_ids, ettn }
//       | { action: 'incoming_list', page?, per_page? } | { action: 'incoming_list', ettn, with_pdf?, debug? }
//       | { action: 'outgoing_list', page?, per_page? }   (Luca'da kesilen e-faturalar — Toplu e-Fatura › Luca'da kesildi)
//       | { action: 'pdf', invoice_id }   (resmi e-fatura PDF'i — lab VE klinik/hekim; yetki = faturayı RLS ile görebilmek)
//       | { action: 'status_sweep' }      (cron, x-notify-secret; 'sent' e-faturaların durumunu sorgular, red/hatada bildirir)
//
// GELEN e-FATURA (incoming_list, 2026-10-21): tedarikçilerin lab'a kestiği e-faturalar.
// SALT OKUNUR — Luca'da arar, DB'ye yazmaz. Liste: özetler; ettn ile: yapılandırılmış
// ayrıntı (kalemler) + isteğe bağlı PDF (base64). Alış faturasına aktarım istemcide
// (create_purchase_invoice_from_efatura RPC'si; ETTN lab başına tekil).
//
// TOPLU e-FATURA (merge_*): bir kliniğin birden çok Siman faturası → tek Luca
// faturası (bugünün tarihi + kuru). Aynı önizleme kapısı: jeton fatura KÜMESİNE
// ve içeriğe bağlıdır. Başarıda tüm faturalar aynı ETTN/numarayı alır; taslak
// olanlar "kesildi" olur. Hata faturaları işaretlemez, yalnız loglanır.
// BAĞLA (link_*): Luca portalında elle kesilmiş faturanın ETTN'si Luca'da aranır,
// bulunursa seçilen faturalara yazılır → bir daha e-faturalanamazlar.
//
// preview: gönderimle AYNI hazırlık (mükellef sorgusu → e-Fatura/e-Arşiv, kur,
// künye, kalemler) ama Luca'ya GÖNDERMEZ ve hiçbir şey YAZMAZ. Luca'nın taslak
// işlemi yok; "taslak → gör → gönder" adımı bununla Siman'da yapılır.
//
// ÖNİZLEME ZORUNLU (2026-10-21, kullanıcı kuralı "hiçbir zaman direkt gerçek fatura"):
// preview imzalı bir `preview_token` döner (içerik özeti + 30 dk). send jetonsuz,
// süresi dolmuş ya da fatura önizlemeden sonra DEĞİŞMİŞSE Luca'ya hiç gitmeden
// reddeder (fatura durumu da yazılmaz) → gönderilen = onaylanan. Bkz. _shared/lucaPreviewToken.ts
//
// Secrets: LUCA_PROXY_BASE (https://simanapp.tech) · LUCA_PROXY_SECRET
// Deploy:  supabase functions deploy efatura-luca --project-ref <REF> --use-api

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildSendEnvelope, buildGetTaxPayerEnvelope, buildSearchEnvelope,
  parseSendResponse, parseTaxPayerResponse, parseSearchResponse, parseInvoiceList, xmlOutline, parseIncomingInvoice, incomingSummary, signLucaRequest,
  type LucaEnvelope, type LucaKind,
} from '../_shared/luca.ts';
import { buildLucaInput, buildLucaPreview, mapLucaStatus, type SellerConfig } from '../_shared/lucaInvoice.ts';
import { previewDigest, signPreviewToken, verifyPreviewToken, PREVIEW_TOKEN_TTL_MS } from '../_shared/lucaPreviewToken.ts';
import { mergeKey, validateMergeSet, mergeInvoices, isEttn, MERGE_MAX, type MergeRow } from '../_shared/lucaMerge.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const PROXY_BASE = (Deno.env.get('LUCA_PROXY_BASE') ?? 'https://simanapp.tech').replace(/\/+$/, '');
const PROXY_SECRET = Deno.env.get('LUCA_PROXY_SECRET') ?? '';
// Önizleme jetonu anahtarı proxy sırrından türetilir (ayrı kullanım alanı). Sır yoksa gönderim kapalı.
const PREVIEW_SECRET = PROXY_SECRET ? `efatura-preview-token:${PROXY_SECRET}` : '';
/** Test ortamında gönderen: Luca Demo Firma 1 (GİB ortak test VKN'si) */
const DEFAULT_TEST_VKN = '1234567801';

type LucaEnvName = 'test' | 'prod';

async function callLuca(env: LucaEnvName, e: LucaEnvelope): Promise<{ ok: true; xml: string } | { ok: false; error: string; http?: number }> {
  const path = `/luca/${env}/${e.service}`;
  const ts = Math.floor(Date.now() / 1000);
  try {
    const res = await fetch(PROXY_BASE + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: e.soapAction,
        'X-Luca-Ts': String(ts),
        'X-Luca-Sig': await signLucaRequest(PROXY_SECRET, ts, path, e.soapAction, e.body),
      },
      body: e.body,
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    if (res.status === 200) return { ok: true, xml: text };
    // Luca SOAP fault'ları 500 döner — gövde XML ise çözümleyiciye bırak.
    if (text.trimStart().startsWith('<')) return { ok: true, xml: text };
    let reason = text.slice(0, 200);
    try { reason = JSON.parse(text).error ?? reason; } catch { /* düz metin */ }
    return { ok: false, error: `e-Fatura köprüsü: ${reason}`, http: res.status };
  } catch (err) {
    return { ok: false, error: `e-Fatura köprüsüne ulaşılamadı: ${(err as Error)?.message ?? err}` };
  }
}

const NOTIFY_SECRET = Deno.env.get('NOTIFY_FN_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Lab'ın AKTİF Luca ayarından ortam + gönderen VKN + senaryo (çağıranın değil, faturanın lab'ı). */
async function labContext(service: any, labId: string): Promise<{ env: LucaEnvName; companyTaxCode: string; scenario: 'TEMELFATURA' | 'TICARIFATURA' } | null> {
  const { data: cred } = await service.from('provider_credentials').select('environment, credentials')
    .eq('lab_id', labId).eq('type', 'efatura').eq('provider', 'luca').eq('is_active', true).maybeSingle();
  if (!cred) return null;
  const c = ((cred as any).credentials ?? {}) as Record<string, string>;
  const env: LucaEnvName = (cred as any).environment === 'production' ? 'prod' : 'test';
  const { data: labRow } = await service.from('labs').select('tax_number').eq('id', labId).single();
  const labVkn = String((labRow as any)?.tax_number ?? '').replace(/\s+/g, '');
  return {
    env,
    companyTaxCode: env === 'prod' ? labVkn : (String(c.test_vkn ?? '').trim() || DEFAULT_TEST_VKN),
    scenario: c.scenario === 'TICARIFATURA' ? 'TICARIFATURA' : 'TEMELFATURA',
  };
}

/** Resmi e-fatura PDF'i. Yetki: çağıran faturayı kendi oturumuyla (RLS) görebiliyorsa — lab, klinik, hekim. */
async function invoicePdf(service: any, caller: any, invoiceId: string) {
  if (!invoiceId) return { ok: false, error: 'Fatura bulunamadı' };
  const { data: inv } = await caller.from('invoices')
    .select('id, lab_id, efatura_uuid, efatura_type, efatura_number').eq('id', invoiceId).maybeSingle();
  if (!inv) return { ok: false, error: 'Fatura bulunamadı' };
  if (!(inv as any).efatura_uuid) return { ok: false, error: 'Bu faturanın e-faturası yok' };
  const ctx = await labContext(service, (inv as any).lab_id);
  if (!ctx) return { ok: false, error: 'Laboratuvarın e-fatura ayarı yok' };
  const kind: LucaKind = (inv as any).efatura_type === 'e_arsiv' ? 'e_arsiv' : 'e_fatura';
  const r = await callLuca(ctx.env, buildSearchEnvelope(kind, ctx.companyTaxCode, { ettn: (inv as any).efatura_uuid, includePdf: true }));
  if (!r.ok) return { ok: false, error: r.error };
  const p = parseSearchResponse(r.xml);
  if (!p.ok) return { ok: false, error: p.error };
  if (!p.found || !p.pdfBase64) return { ok: false, error: 'e-Fatura PDF\'i Luca\'da bulunamadı' };
  return { ok: true, pdf_base64: p.pdfBase64, number: (inv as any).efatura_number ?? p.invoiceNumber ?? null };
}

/** Red / hata: lab yöneticilerine uygulama içi bildirim + e-posta (günlük iş takibiyle aynı alıcılar). */
async function notifyEFaturaProblem(service: any, g: any, status: string, error: string | null) {
  const { data: users } = await service.from('profiles').select('id, user_type')
    .eq('lab_id', g.lab_id).or('user_type.eq.admin,and(user_type.eq.lab,role.eq.manager)');
  const title = status === 'rejected' ? 'e-Fatura reddedildi' : 'e-Fatura hatası';
  const body = `${g.efatura_number ?? g.invoice_number} · ${g.clinic?.name ?? ''}${error ? ` — ${error}` : ''}`;
  for (const u of (users ?? []) as Array<{ id: string; user_type: string }>) {
    const actionUrl = `/${u.user_type === 'admin' ? '(admin)' : '(lab)'}/invoice/${g.invoice_number ?? g.id}`;
    const { data: n } = await service.from('notifications').insert({
      user_id: u.id, lab_id: g.lab_id, category: 'efatura', title, body,
      resource_type: 'invoice', action_url: actionUrl, payload: { ettn: g.efatura_uuid, status },
    }).select('id').single();
    if (NOTIFY_SECRET && SUPABASE_URL) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-email-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-notify-secret': NOTIFY_SECRET },
        body: JSON.stringify({
          userIds: [u.id], category: 'efatura', notificationId: (n as any)?.id,
          payload: { title, body, actionUrl, resourceType: 'invoice' },
        }),
      }).catch(() => {});
    }
  }
}

/**
 * Günlük durum taraması (cron 09:00 TR): son 30 günde gönderilmiş ve hâlâ 'sent' olan
 * e-faturalar (ETTN başına bir sorgu) Luca'da sorgulanır. Durum değiştiyse aynı ETTN'li
 * TÜM faturalar güncellenir + log; red/hata ise yöneticilere bildirim.
 */
async function statusSweep(service: any) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: rows } = await service.from('invoices')
    .select('id, lab_id, invoice_number, efatura_uuid, efatura_type, efatura_number, clinic:clinics(name)')
    .eq('efatura_status', 'sent').not('efatura_uuid', 'is', null).gte('efatura_sent_at', since).limit(1000);
  const groups = new Map<string, any>();
  for (const r of (rows ?? []) as any[]) {
    const k = `${r.lab_id}|${String(r.efatura_uuid).toLowerCase()}`;
    if (!groups.has(k)) groups.set(k, r);
  }
  const ctxByLab = new Map<string, Awaited<ReturnType<typeof labContext>>>();
  let checked = 0, changed = 0, alerts = 0;
  for (const g of [...groups.values()].slice(0, 40)) {
    if (!ctxByLab.has(g.lab_id)) ctxByLab.set(g.lab_id, await labContext(service, g.lab_id));
    const ctx = ctxByLab.get(g.lab_id);
    if (!ctx) continue;
    const kind: LucaKind = g.efatura_type === 'e_arsiv' ? 'e_arsiv' : 'e_fatura';
    const r = await callLuca(ctx.env, buildSearchEnvelope(kind, ctx.companyTaxCode, { ettn: g.efatura_uuid }));
    checked++;
    if (!r.ok) continue;
    const f = parseSearchResponse(r.xml);
    if (!f.ok || !f.found) continue;
    const mapped = mapLucaStatus(kind, f, ctx.scenario);
    if (mapped.status === 'sent') continue;
    await service.from('invoices').update({
      efatura_status: mapped.status, efatura_error: mapped.error ?? null,
      ...(f.invoiceNumber && !g.efatura_number ? { efatura_number: f.invoiceNumber } : {}),
    }).eq('lab_id', g.lab_id).eq('efatura_uuid', g.efatura_uuid);
    await service.from('efatura_logs').insert({
      lab_id: g.lab_id, invoice_id: g.id, provider: 'luca', action: 'status_check', efatura_uuid: g.efatura_uuid,
      efatura_status: mapped.status, error_message: mapped.error ?? null, request_body: { op: 'sweep' },
      response_body: { status: f.status, detailStatus: f.detailStatus, reportStatus: f.reportStatus },
    });
    changed++;
    if (mapped.status === 'rejected' || mapped.status === 'error') {
      await notifyEFaturaProblem(service, g, mapped.status, mapped.error ?? null);
      alerts++;
    }
  }
  return { ok: true, groups: groups.size, checked, changed, alerts };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Yalnız POST' }, 405);
  if (PROXY_SECRET.length < 32) return json({ ok: false, error: 'Luca köprüsü yapılandırılmamış' }, 500);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? '');

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── Zamanlanmış durum taraması (kullanıcı yok) — yalnız paylaşılan sırla ──
    if (action === 'status_sweep') {
      const secret = req.headers.get('x-notify-secret') ?? '';
      if (!NOTIFY_SECRET || !timingSafeEqualStr(secret, NOTIFY_SECRET)) return json({ ok: false, error: 'Yetkisiz erişim' }, 401);
      return json(await statusSweep(service));
    }

    // ── Kimlik + yetki: lab çağıranın KENDİ profilinden (body'den değil) ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ ok: false, error: 'Yetkisiz erişim' }, 401);
    const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await caller.auth.getUser();
    if (authErr || !userData?.user) return json({ ok: false, error: 'Yetkisiz erişim' }, 401);
    const callerId = userData.user.id;

    // ── Resmi e-fatura PDF'i: klinik/hekim de indirir → e-fatura gönderme yetkisi ARANMAZ,
    //    yetki = faturayı kendi oturumuyla (RLS) görebilmek ──
    if (action === 'pdf') return json(await invoicePdf(service, caller, String(body?.invoice_id ?? '')));
    const { data: allowed } = await caller.rpc('has_permission', { p_key: 'send_einvoice' });
    if (allowed !== true) return json({ ok: false, error: 'e-Fatura gönderme yetkiniz yok' }, 403);
    const { data: profile } = await service.from('profiles').select('lab_id').eq('id', callerId).single();
    const labId: string | null = (profile as any)?.lab_id ?? null;
    if (!labId) return json({ ok: false, error: 'Hesabınıza bağlı laboratuvar yok' }, 403);

    // ── Lab'ın Luca ayarı: 'test' kaydedilmiş (aktif olmayabilir) kaydı, diğerleri aktif olanı kullanır ──
    let credQ = service
      .from('provider_credentials')
      .select('environment, credentials')
      .eq('lab_id', labId).eq('type', 'efatura').eq('provider', 'luca');
    credQ = action === 'test' ? credQ.eq('id', String(body?.credential_id ?? '')) : credQ.eq('is_active', true);
    const { data: cred } = await credQ.maybeSingle();
    if (!cred) return json({ ok: false, error: 'Aktif Luca e-Fatura ayarı yok (Ayarlar → Entegrasyonlar)' }, 400);
    const c = ((cred as any).credentials ?? {}) as Record<string, string>;
    const env: LucaEnvName = (cred as any).environment === 'production' ? 'prod' : 'test';
    // Satıcı künyesi LAB'a ait (Ayarlar → Genel → Fatura Bilgileri) — entegratör ayarında değil.
    const { data: labRow } = await service
      .from('labs')
      .select('name, legal_name, tax_number, tax_office, street, district, city, postal_code, email, phone')
      .eq('id', labId)
      .single();
    const lab = (labRow ?? {}) as Record<string, string | null>;
    const labVkn = String(lab.tax_number ?? '').replace(/\s+/g, '');
    const companyTaxCode = env === 'prod' ? labVkn : (String(c.test_vkn ?? '').trim() || DEFAULT_TEST_VKN);
    const scenario = c.scenario === 'TICARIFATURA' ? 'TICARIFATURA' : 'TEMELFATURA';

    // ── Mükellef sorgusu ──
    async function lookupTaxPayer(vkn: string) {
      const r = await callLuca(env, buildGetTaxPayerEnvelope(vkn));
      if (!r.ok) return r;
      return parseTaxPayerResponse(r.xml);
    }

    if (action === 'mukellef') {
      const vkn = String(body?.vkn ?? '').trim();
      if (!/^\d{10,11}$/.test(vkn)) return json({ ok: false, error: 'Geçersiz VKN/TCKN' }, 400);
      const tp = await lookupTaxPayer(vkn);
      if (!tp.ok) return json({ ok: false, vkn, is_registered: false, error: tp.error });
      return json({ ok: true, vkn, is_registered: tp.registered, alias: tp.inboxTags[0] ?? null, title: (tp as any).name ?? null });
    }

    // ── Bağlantı testi: köprü + Luca ayakta mı, bu VKN için yetki var mı (kontör sorgusu) ──
    if (action === 'test') {
      if (env === 'prod' && !/^(\d{10}|\d{11})$/.test(companyTaxCode)) {
        return json({ ok: false, message: 'Lab VKN/TCKN geçersiz — Ayarlar → Genel → Fatura Bilgileri' });
      }
      const ns = 'xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/" xmlns:ein="http://schemas.datacontract.org/2004/07/EInvoice.Service.Model"';
      const balanceEnv: LucaEnvelope = {
        service: 'InvoiceService', op: 'GetCompanyBalance',
        soapAction: 'http://tempuri.org/IInvoiceService/GetCompanyBalance',
        body: `<soapenv:Envelope ${ns}><soapenv:Header/><soapenv:Body><tem:GetCompanyBalance><tem:request><ein:CompanyTaxCode>${companyTaxCode.replace(/\D/g, '')}</ein:CompanyTaxCode></tem:request></tem:GetCompanyBalance></soapenv:Body></soapenv:Envelope>`,
      };
      const r = await callLuca(env, balanceEnv);
      if (!r.ok) return json({ ok: false, message: r.error });
      const m = /<(?:\w+:)?Result>([^<]*)</.exec(r.xml)?.[1];
      const bal = /<(?:\w+:)?Balance>([^<]*)</.exec(r.xml)?.[1];
      const errMsg = /<(?:\w+:)?ErrorMessage>([^<]*)</.exec(r.xml)?.[1];
      const where = env === 'prod' ? 'Canlı' : 'Test';
      return m === 'Success'
        ? json({ ok: true, message: `${where} ortam bağlantısı başarılı · VKN ${companyTaxCode} · kontör: ${bal ?? '—'}` })
        : json({ ok: false, message: `${where} ortam: ${errMsg || 'Luca bu VKN için işlem yetkisi vermedi'}` });
    }

    // ── Ortak hazırlık (tekli ve toplu fatura) ──
    const seller: SellerConfig = {
      vkn: labVkn, tax_office: lab.tax_office ?? '', city: lab.city ?? '', town: lab.district ?? '', street: lab.street ?? '',
      postal_code: lab.postal_code ?? null, email: lab.email ?? null, phone: lab.phone ?? null, scenario,
    };
    const sellerName = String(lab.legal_name ?? '').trim() || String(lab.name ?? '').trim();

    // e-Fatura mı e-Arşiv mi: alıcı VKN'si GİB'de kayıtlıysa e-Fatura (sunucuda, taze sorgu).
    async function resolveKindFor(clinic: any): Promise<
      { ok: true; kind: LucaKind; inboxTag: string | null; tp: any | null } | { ok: false; error: string }
    > {
      const vkn = String(clinic?.vkn ?? '').replace(/\s+/g, '');
      if (!vkn) return { ok: true, kind: 'e_arsiv', inboxTag: null, tp: null };
      const tp = await lookupTaxPayer(vkn);
      if (!tp.ok) return { ok: false, error: `Mükellef sorgusu başarısız: ${tp.error}` };
      if (!tp.registered) return { ok: true, kind: 'e_arsiv', inboxTag: null, tp };
      const inboxTag = clinic.efatura_alias && tp.inboxTags.includes(clinic.efatura_alias) ? clinic.efatura_alias : tp.inboxTags[0];
      return { ok: true, kind: 'e_fatura', inboxTag, tp };
    }

    // Döviz: TCMB kuru (yer tutucu kurla resmi fatura kesilmez).
    async function resolveCrossRateFor(currency: string, atDate: string): Promise<number | null> {
      if (currency === 'TRY') return null;
      const { data: rateRows } = await service.rpc('get_currency_rate_info', {
        p_lab_id: labId, p_currency: currency, p_base_currency: 'TRY', p_at_date: atDate,
      });
      const row = Array.isArray(rateRows) ? rateRows[0] : rateRows;
      return row && !row.is_placeholder && Number(row.rate) > 0 ? Number(row.rate) : null;
    }

    // Önizlenen ve gönderilen içeriğin karşılaştırma özeti. externalCode hariç (yeniden
    // denemede gönderimde değişir; vergi içeriği değil).
    const digestFor = (kind: LucaKind, currency: string, crossRate: number | null, input: Record<string, unknown>) =>
      previewDigest({ env, kind, currency, crossRate, input: { ...input, externalCode: undefined } });

    /** Mükellef sorgusunun sonucunu önbelleğe ve kliniğe yaz (gönderimden önce). */
    async function rememberTaxPayer(clinicId: string | null, clinic: any, tp: any, inboxTag: string | null) {
      if (!tp) return;
      await service.from('mukellef_cache').upsert({
        vkn: String(clinic?.vkn ?? '').replace(/\s+/g, ''), is_registered: tp.registered, alias: tp.inboxTags[0] ?? null,
        title: tp.name ?? null, provider: 'luca', checked_at: new Date().toISOString(),
      }, { onConflict: 'vkn' });
      if (clinicId) {
        await service.from('clinics').update({
          efatura_registered: tp.registered, efatura_alias: inboxTag ?? clinic?.efatura_alias ?? null,
          efatura_checked_at: new Date().toISOString(),
        }).eq('id', clinicId);
      }
    }

    const previewGateError = (reason: string) => reason === 'expired'
      ? 'Önizlemenin süresi doldu — faturayı yeniden önizleyip onaylayın'
      : reason === 'mismatch'
        ? 'Fatura önizlemeden sonra değişti — yeniden önizleyip onaylayın'
        : 'Önce önizleme gerekli — Gönder ile önizlemeyi açıp onaylayın';

    // ── Toplu e-Fatura / Luca'da kesilmiş faturayı bağla (birden çok fatura) ──
    if (action === 'merge_preview' || action === 'merge_send' || action === 'link_lookup' || action === 'link') {
      const ids = [...new Set((Array.isArray(body?.invoice_ids) ? body.invoice_ids : []).map((x: unknown) => String(x)))] as string[];
      if (!ids.length) return json({ ok: false, error: 'En az bir fatura seçmelisiniz' }, 400);
      if (ids.length > MERGE_MAX) return json({ ok: false, error: `Tek e-faturada birleştirilebilecek en çok fatura sayısı: ${MERGE_MAX}` }, 400);
      const { data: rowsRaw, error: rowsErr } = await service
        .from('invoices')
        .select(`id, lab_id, clinic_id, invoice_number, status, issue_date, currency, tax_rate, total, notes,
                 efatura_uuid, efatura_status,
                 items:invoice_items(description, quantity, unit_price, total, net_total, sort_order),
                 orders:invoice_orders(work_order:work_orders(order_number))`)
        .in('id', ids);
      if (rowsErr) return json({ ok: false, error: 'Faturalar okunamadı' }, 500);
      const rows: MergeRow[] = ((rowsRaw ?? []) as any[]).map((r) => ({
        ...r,
        order_numbers: ((r.orders ?? []) as any[]).map((o) => o?.work_order?.order_number).filter(Boolean),
      }));
      const v = validateMergeSet(rows, ids, labId);
      if (!v.ok) return json({ ok: false, error: v.error }, 400);
      const selectedTotal = Math.round(rows.reduce((a, r) => a + (Number(r.total) || 0), 0) * 100) / 100;
      const logAll = (row: Record<string, unknown>) => service.from('efatura_logs').insert(
        ids.map((id) => ({ lab_id: labId, invoice_id: id, provider: 'luca', created_by: callerId, ...row })),
      );
      // Yazımda tekrar e-faturalanmayı önle: yalnız hâlâ ETTN'siz satırlar güncellenir.
      const writeIssued = async (patch: Record<string, unknown>) => {
        const { data: upd, error } = await service.from('invoices').update(patch)
          .in('id', ids).eq('lab_id', labId).is('efatura_uuid', null).select('id');
        if (!error && v.promoteIds.length) {
          await service.from('invoices').update({ status: 'kesildi' }).in('id', v.promoteIds).eq('status', 'taslak');
        }
        return { error, updated: (upd ?? []).length };
      };

      if (action === 'link_lookup' || action === 'link') {
        const ettn = String(body?.ettn ?? '').trim().toLowerCase();
        if (!isEttn(ettn)) return json({ ok: false, error: 'Geçersiz ETTN — faturadaki 36 karakterlik kodu girin' }, 400);
        const { data: used } = await service.from('invoices').select('id, invoice_number').eq('lab_id', labId).eq('efatura_uuid', ettn);
        const others = ((used ?? []) as any[]).filter((u) => !ids.includes(u.id));
        if (others.length) {
          return json({ ok: false, error: `Bu ETTN zaten başka faturalara bağlı: ${others.map((o) => o.invoice_number).join(', ')}` }, 409);
        }
        let kind: LucaKind = 'e_fatura';
        let found: { status?: string; detailStatus?: string; reportStatus?: string; invoiceNumber?: string } | null = null;
        for (const k of ['e_fatura', 'e_arsiv'] as LucaKind[]) {
          const r = await callLuca(env, buildSearchEnvelope(k, companyTaxCode, { ettn }));
          if (!r.ok) return json({ ok: false, error: r.error });
          const p = parseSearchResponse(r.xml);
          if (!p.ok) return json({ ok: false, error: p.error });
          if (p.found) { kind = k; found = p; break; }
        }
        if (!found) return json({ ok: false, error: env === 'prod' ? "Bu ETTN Luca'da bulunamadı (canlı ortam)" : "Bu ETTN Luca'da bulunamadı (test ortamı)" });
        const mapped = mapLucaStatus(kind, found, scenario);
        const info = { ettn, kind, number: found.invoiceNumber ?? null, status: mapped.status, count: ids.length, total: selectedTotal, currency: v.currency };
        if (action === 'link_lookup') return json({ ok: true, ...info });

        const w = await writeIssued({
          efatura_uuid: ettn, efatura_number: found.invoiceNumber ?? null, efatura_type: kind, efatura_status: mapped.status,
          efatura_provider: 'luca', efatura_sent_at: new Date().toISOString(), efatura_error: mapped.error ?? null,
        });
        if (w.error) return json({ ok: false, error: 'Faturalar güncellenemedi' }, 500);
        await logAll({
          action: 'status_check', efatura_uuid: ettn, efatura_status: mapped.status,
          request_body: { op: 'link', count: ids.length },
          response_body: { invoiceNumber: found.invoiceNumber, status: found.status, detailStatus: found.detailStatus },
        });
        return json({ ok: true, ...info, updated: w.updated });
      }

      // merge_preview / merge_send — bugünün tarihi ve kuru (kullanıcı kararı 2026-10-21)
      const { data: clinicRow } = await service
        .from('clinics').select('name, vkn, tax_office, address, email, phone, efatura_alias').eq('id', v.clinicId).maybeSingle();
      const clinic = (clinicRow ?? null) as any;
      if (!clinic) return json({ ok: false, error: 'Klinik bulunamadı' }, 404);
      const issueDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
      const merged = mergeInvoices(rows, issueDate);
      const k = await resolveKindFor(clinic);
      if (!k.ok) return json({ ok: false, error: k.error });
      const crossRate = await resolveCrossRateFor(v.currency, issueDate);
      const built = buildLucaInput({
        invoice: merged, clinic, doctor: null, seller, kind: k.kind, companyTaxCode, inboxTag: k.inboxTag, crossRate,
        totalTolerance: Math.round(ids.length) / 100,
      });
      if (!built.ok) return json({ ok: false, error: built.error });
      if (!PREVIEW_SECRET) return json({ ok: false, error: 'Önizleme jetonu üretilemedi (sunucu yapılandırması)' }, 500);
      const key = mergeKey(ids);
      const digest = await digestFor(k.kind, v.currency, crossRate, built.input as unknown as Record<string, unknown>);

      if (action === 'merge_preview') {
        const expiresAt = Date.now() + PREVIEW_TOKEN_TTL_MS;
        return json({
          ok: true,
          preview: buildLucaPreview(built.input, { env, sellerName, invoiceNumber: '' }),
          preview_token: await signPreviewToken(PREVIEW_SECRET, key, digest, expiresAt),
          preview_expires_at: new Date(expiresAt).toISOString(),
          count: ids.length, total: selectedTotal, currency: v.currency,
        });
      }

      const check = await verifyPreviewToken(PREVIEW_SECRET, body?.preview_token, key, digest, Date.now());
      if (!check.ok) {
        const error = previewGateError(check.reason);
        await logAll({ action: 'send', error_message: `Önizleme kapısı (${check.reason}): Toplu e-fatura — ${error}` });
        return json({ ok: false, error, needs_preview: true }, 409);
      }
      await rememberTaxPayer(v.clinicId, clinic, k.tp, k.inboxTag);

      // Her toplu deneme yeni bir dış kod alır (Luca aynı kodu ikinci kez kabul etmeyebilir).
      built.input.externalCode = crypto.randomUUID();
      const envelope = buildSendEnvelope(built.input);
      const r = await callLuca(env, envelope);
      const sent = r.ok ? parseSendResponse(r.xml) : r;
      const request_body = { env, kind: k.kind, op: 'merge', count: ids.length, externalCode: built.input.externalCode, currency: v.currency, crossRate };
      if (!sent.ok) {
        // Faturalar "hatalı" işaretlenmez: Luca'da hiçbir şey oluşmadı, tekli akış etkilenmesin.
        await logAll({ action: 'send', error_message: `Toplu e-fatura: ${sent.error}`, request_body, http_status: (r as any).http ?? 200 });
        return json({ ok: false, error: sent.error });
      }
      const s = sent as { ettn: string; invoiceNumber?: string };
      const w = await writeIssued({
        efatura_uuid: s.ettn, efatura_number: s.invoiceNumber ?? null, efatura_type: k.kind, efatura_status: 'sent',
        efatura_provider: 'luca', efatura_sent_at: new Date().toISOString(), efatura_error: null,
      });
      await logAll({ action: 'send', request_body, response_body: s, http_status: 200, efatura_uuid: s.ettn, efatura_status: 'sent' });
      return json({ ok: true, uuid: s.ettn, number: s.invoiceNumber ?? null, type: k.kind, status: 'sent', count: ids.length, updated: w.updated, persisted: !w.error });
    }

    // ── Luca'da kesilen (giden) e-faturalar — salt okunur; bağlama penceresinde seçilir ──
    if (action === 'outgoing_list') {
      const page = Math.max(1, Math.floor(Number(body?.page) || 1));
      const perPage = Math.min(50, Math.max(1, Math.floor(Number(body?.per_page) || 20)));
      const r = await callLuca(env, buildSearchEnvelope('e_fatura', companyTaxCode, { direction: 'Outgoing', page, perPage }));
      if (!r.ok) return json({ ok: false, error: r.error });
      const list = parseInvoiceList(r.xml);
      if (!list.ok) return json({ ok: false, error: list.error });
      // Giden kayıtta Receiver = alıcı (klinik); özet alanları gelenle aynı biçimde.
      const items = list.invoices.map((f) => {
        const x = incomingSummary(f);
        const mapped = mapLucaStatus('e_fatura', { status: f.Status, detailStatus: f.DetailStatus }, x.scenario ?? scenario);
        return {
          ettn: x.ettn, number: x.number, date: x.date, buyerName: x.supplierName, buyerVkn: x.supplierVkn,
          currency: x.currency, payable: x.payable, status: mapped.status, lucaStatus: x.status, scenario: x.scenario,
        };
      });
      return json({
        ok: true, env, page, per_page: perPage,
        total: Number(list.meta.TotalNumberOfRecords) || items.length, pages: Number(list.meta.TotalNumberOfPages) || 1, items,
      });
    }

    // ── Gelen e-faturalar (salt okunur) ──
    if (action === 'incoming_list') {
      const page = Math.max(1, Math.floor(Number(body?.page) || 1));
      const perPage = Math.min(50, Math.max(1, Math.floor(Number(body?.per_page) || 20)));
      const ettn = body?.ettn ? String(body.ettn).trim().toLowerCase() : '';
      if (ettn && !isEttn(ettn)) return json({ ok: false, error: 'Geçersiz ETTN — faturadaki 36 karakterlik kodu girin' }, 400);
      const r = await callLuca(env, buildSearchEnvelope('e_fatura', companyTaxCode, ettn
        ? { direction: 'Incoming', ettn, includeDetail: true, includePdf: body?.with_pdf === true }
        : { direction: 'Incoming', page, perPage }));
      if (!r.ok) return json({ ok: false, error: r.error });
      const list = parseInvoiceList(r.xml);
      if (!list.ok) return json({ ok: false, error: list.error });
      if (ettn) {
        const invoice = parseIncomingInvoice(r.xml);
        if (!invoice) return json({ ok: false, error: 'Fatura Luca\'da bulunamadı' }, 404);
        // PDF ayrı alınır (InvoicePdf base64; liste ayrıştırıcısı uzun değeri kısaltır).
        const pdf = body?.with_pdf === true
          ? (/<(?:[\w.-]+:)?InvoicePdf>([^<]+)<\/(?:[\w.-]+:)?InvoicePdf>/.exec(r.xml)?.[1] ?? null) : null;
        const extra = body?.debug === true
          ? { outline: xmlOutline(/<(?:[\w.-]+:)?Invoice(?:\s[^>]*)?>[\s\S]*?<\/(?:[\w.-]+:)?Invoice>/.exec(r.xml)?.[0] ?? '') } : {};
        return json({ ok: true, env, invoice, pdf_base64: pdf, ...extra });
      }
      const total = Number(list.meta.TotalNumberOfRecords) || list.invoices.length;
      const pages = Number(list.meta.TotalNumberOfPages) || 1;
      return json({ ok: true, env, page, per_page: perPage, total, pages, items: list.invoices.map(incomingSummary) });
    }

    if (action !== 'send' && action !== 'status' && action !== 'preview') return json({ ok: false, error: 'Bilinmeyen işlem' }, 400);

    // ── Fatura (tenant kapısı) ──
    const invoiceId = String(body?.invoice_id ?? '');
    const { data: inv, error: invErr } = await service
      .from('invoices')
      .select(`id, lab_id, invoice_number, issue_date, currency, tax_rate, subtotal, tax_amount, total, notes, status,
               efatura_uuid, efatura_type, efatura_status, efatura_number, clinic_id,
               clinic:clinics(name, vkn, tax_office, address, email, phone, efatura_alias),
               doctor:doctors(full_name, tckn),
               items:invoice_items(description, quantity, unit_price, total, net_total, sort_order)`)
      .eq('id', invoiceId)
      .maybeSingle();
    if (invErr || !inv) return json({ ok: false, error: 'Fatura bulunamadı' }, 404);
    const invoice = inv as any;
    if (invoice.lab_id !== labId) return json({ ok: false, error: 'Bu fatura sizin laboratuvarınıza ait değil' }, 403);

    const log = (row: Record<string, unknown>) =>
      service.from('efatura_logs').insert({ lab_id: labId, invoice_id: invoice.id, provider: 'luca', created_by: callerId, ...row });

    // ── Durum sorgula ──
    if (action === 'status') {
      if (!invoice.efatura_uuid) return json({ ok: false, error: 'Fatura henüz e-faturaya gönderilmemiş' }, 400);
      const kind: LucaKind = invoice.efatura_type === 'e_arsiv' ? 'e_arsiv' : 'e_fatura';
      const r = await callLuca(env, buildSearchEnvelope(kind, companyTaxCode, { ettn: invoice.efatura_uuid }));
      const found = r.ok ? parseSearchResponse(r.xml) : r;
      if (!found.ok || !(found as any).found) {
        const error = !found.ok ? found.error : "Fatura Luca'da bulunamadı";
        await log({ action: 'status_check', efatura_uuid: invoice.efatura_uuid, error_message: error });
        return json({ ok: false, error });
      }
      const f = found as { status?: string; detailStatus?: string; reportStatus?: string; invoiceNumber?: string };
      const mapped = mapLucaStatus(kind, f, scenario);
      await service.from('invoices').update({
        efatura_status: mapped.status,
        efatura_error: mapped.error ?? null,
        ...(f.invoiceNumber && !invoice.efatura_number ? { efatura_number: f.invoiceNumber } : {}),
      }).eq('lab_id', labId).eq('efatura_uuid', invoice.efatura_uuid); // toplu e-faturada aynı ETTN'li tüm faturalar
      await log({
        action: 'status_check', efatura_uuid: invoice.efatura_uuid, efatura_status: mapped.status,
        response_body: { status: f.status, detailStatus: f.detailStatus, reportStatus: f.reportStatus },
        error_message: mapped.error ?? null,
      });
      return json({ ok: true, status: mapped.status, error: mapped.error, number: f.invoiceNumber ?? invoice.efatura_number ?? null });
    }

    // ── Gönderilebilir mi? (önizleme de aynı kapıdan geçer) ──
    // Toplu e-faturanın parçası olan fatura tek başına yeniden kesilemez (durumu "hata" olsa bile).
    if (invoice.efatura_uuid) {
      const { count: shared } = await service.from('invoices')
        .select('id', { count: 'exact', head: true }).eq('lab_id', labId).eq('efatura_uuid', invoice.efatura_uuid);
      if ((shared ?? 0) > 1) {
        return json({ ok: false, error: 'Bu fatura toplu e-faturanın parçası — tek başına yeniden kesilemez' }, 409);
      }
    }
    if (invoice.status === 'taslak') return json({ ok: false, error: 'Taslak fatura e-faturaya gönderilemez — önce faturayı kesin' }, 400);
    if (invoice.status === 'iptal') return json({ ok: false, error: 'İptal edilmiş fatura gönderilemez' }, 400);
    if (invoice.efatura_uuid && invoice.efatura_status !== 'error') {
      return json({ ok: false, error: 'Bu fatura zaten e-faturaya gönderildi' }, 409);
    }

    const clinic = invoice.clinic ?? null;
    const clinicVkn = String(clinic?.vkn ?? '').replace(/\s+/g, '');
    const resolveKind = () => resolveKindFor(clinic);
    const currency = String(invoice.currency ?? 'TRY').toUpperCase();
    const resolveCrossRate = () => resolveCrossRateFor(currency, invoice.issue_date);
    const items = [...(invoice.items ?? [])].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const buildInput = (kind: LucaKind, inboxTag: string | null, crossRate: number | null) => buildLucaInput({
      invoice: { ...invoice, items }, clinic, doctor: invoice.doctor ?? null, seller, kind, companyTaxCode, inboxTag, crossRate,
    });

    // Önizlenen ve gönderilen içeriğin karşılaştırma özeti. externalCode hariç (yeniden
    // denemede gönderimde değişir; vergi içeriği değil).
    const contentDigest = (kind: LucaKind, crossRate: number | null, input: Record<string, unknown>) =>
      digestFor(kind, currency, crossRate, input);

    // ── Önizle: Luca'ya gitmez, DB'ye yazmaz ──
    if (action === 'preview') {
      const k = await resolveKind();
      if (!k.ok) return json({ ok: false, error: k.error });
      const previewRate = await resolveCrossRate();
      const built = buildInput(k.kind, k.inboxTag, previewRate);
      if (!built.ok) return json({ ok: false, error: built.error });
      if (!PREVIEW_SECRET) return json({ ok: false, error: 'Önizleme jetonu üretilemedi (sunucu yapılandırması)' }, 500);
      const expiresAt = Date.now() + PREVIEW_TOKEN_TTL_MS;
      const digest = await contentDigest(k.kind, previewRate, built.input as unknown as Record<string, unknown>);
      return json({
        ok: true,
        preview: buildLucaPreview(built.input, {
          env, sellerName, invoiceNumber: invoice.invoice_number,
        }),
        preview_token: await signPreviewToken(PREVIEW_SECRET, invoice.id, digest, expiresAt),
        preview_expires_at: new Date(expiresAt).toISOString(),
      });
    }

    // ── Gönder ──
    const fail = async (error: string, extra: Record<string, unknown> = {}) => {
      await service.from('invoices').update({ efatura_status: 'error', efatura_error: error, efatura_provider: 'luca' }).eq('id', invoice.id);
      await log({ action: 'send', error_message: error, ...extra });
      return json({ ok: false, error, persisted: true });
    };

    const k = await resolveKind();
    if (!k.ok) return fail(k.error);
    const { kind, inboxTag, tp } = k;
    if (tp) {
      await service.from('mukellef_cache').upsert({
        vkn: clinicVkn, is_registered: tp.registered, alias: tp.inboxTags[0] ?? null,
        title: (tp as any).name ?? null, provider: 'luca', checked_at: new Date().toISOString(),
      }, { onConflict: 'vkn' });
      if (invoice.clinic_id) {
        await service.from('clinics').update({
          efatura_registered: tp.registered, efatura_alias: inboxTag ?? clinic.efatura_alias ?? null,
          efatura_checked_at: new Date().toISOString(),
        }).eq('id', invoice.clinic_id);
      }
    }

    const crossRate = await resolveCrossRate();
    const built = buildInput(kind, inboxTag, crossRate);
    if (!built.ok) return fail(built.error);

    // ── Önizleme kapısı: jetonsuz / süresi dolmuş / içerik değişmiş → Luca'ya GİTMEZ ──
    // fail() KULLANILMAZ: fatura hatalı işaretlenmez, yalnız yeniden önizleme istenir.
    {
      const digest = await contentDigest(kind, crossRate, built.input as unknown as Record<string, unknown>);
      const check = PREVIEW_SECRET
        ? await verifyPreviewToken(PREVIEW_SECRET, body?.preview_token, invoice.id, digest, Date.now())
        : ({ ok: false, reason: 'missing' } as const);
      if (!check.ok) {
        const error = check.reason === 'expired'
          ? 'Önizlemenin süresi doldu — faturayı yeniden önizleyip onaylayın'
          : check.reason === 'mismatch'
            ? 'Fatura önizlemeden sonra değişti — yeniden önizleyip onaylayın'
            : 'Önce önizleme gerekli — Gönder ile önizlemeyi açıp onaylayın';
        // efatura_logs.action CHECK yalnız send/query/cancel/status_check kabul eder → 'send' + açıklama
        // (efatura_uuid boş kalır; yeniden-gönderim sayacı yalnız ETTN'li satırları sayar).
        await log({ action: 'send', error_message: `Önizleme kapısı (${check.reason}): ${error}` });
        return json({ ok: false, error, needs_preview: true }, 409);
      }
    }

    // Hata sonrası yeniden gönderimde Luca aynı dış kodu tekrar kabul etmeyebilir → deneme sayısıyla ayır.
    const { count: prevSends } = await service.from('efatura_logs')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', invoice.id).eq('action', 'send').not('efatura_uuid', 'is', null);
    if (prevSends) built.input.externalCode = `${invoice.id}-${prevSends + 1}`;

    const envelope = buildSendEnvelope(built.input);
    const r = await callLuca(env, envelope);
    const sent = r.ok ? parseSendResponse(r.xml) : r;
    const request_body = { env, kind, op: envelope.op, externalCode: built.input.externalCode, currency, crossRate };
    if (!sent.ok) return fail(sent.error, { request_body, http_status: (r as any).http ?? 200 });

    const s = sent as { ettn: string; invoiceNumber?: string };
    await service.from('invoices').update({
      efatura_uuid: s.ettn,
      efatura_number: s.invoiceNumber ?? null,
      efatura_type: kind,
      efatura_status: 'sent',
      efatura_provider: 'luca',
      efatura_sent_at: new Date().toISOString(),
      efatura_error: null,
    }).eq('id', invoice.id);
    await log({ action: 'send', request_body, response_body: s, http_status: 200, efatura_uuid: s.ettn, efatura_status: 'sent' });
    return json({ ok: true, uuid: s.ettn, number: s.invoiceNumber ?? null, type: kind, status: 'sent', persisted: true });
  } catch (e) {
    return json({ ok: false, error: (e as Error)?.message ?? 'Sunucu hatası' }, 500);
  }
});
