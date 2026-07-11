/**
 * send-email-notification — Email kanal dispatcher (Resend).
 *
 *   Bir veya birden çok kullanıcıya kategorize edilmiş HTML email gönderir.
 *   email_notifications tablosuna audit kaydı atar (pending → sent/failed).
 *
 *   Çağrı:
 *     supabase.functions.invoke('send-email-notification', {
 *       body: {
 *         userIds: ['uuid-1'],
 *         category: 'new_order',
 *         payload: {
 *           title:    'Yeni iş emri',
 *           body:     'Klinik Saberi 24/A',
 *           actionUrl: 'https://app.nexadentlab.com/(lab)/order/abc',
 *           resourceType: 'work_order',
 *           resourceId:   'abc',
 *           extra:    { orderNumber: 'WO-2310', clinic: 'Saberi', patient: '...' },
 *         },
 *         notificationId: 'optional-uuid',
 *       },
 *     });
 *
 *   Gerekli env (Supabase Edge Function Secrets):
 *     RESEND_API_KEY      — Resend API anahtarı (https://resend.com/api-keys)
 *     RESEND_FROM         — örn. "Siman <noreply@nexadentlab.com>"
 *     APP_PUBLIC_URL      — Email içindeki link base'i (https://app.nexadentlab.com)
 *
 *   Pref kontrolü: profiles.notification_prefs.categories[cat].email == true
 *
 *   Template seçimi: payload.template > category bazlı default > 'generic'
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
const supabaseSrvKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendApiKey   = Deno.env.get('RESEND_API_KEY')   ?? '';
const resendFrom     = Deno.env.get('RESEND_FROM')      ?? 'Siman <noreply@nexadentlab.com>';
const appPublicUrl   = (Deno.env.get('APP_PUBLIC_URL')  ?? 'https://www.nexadentlab.com').replace(/\/$/, '');

const RESEND_URL = 'https://api.resend.com/emails';
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Yetki: iç çağrı (paylaşılan gizli / service-role) veya oturumlu kullanıcı ──
const NOTIFY_FN_SECRET = Deno.env.get('NOTIFY_FN_SECRET') ?? '';
async function assertCallerAuthorized(req: Request): Promise<boolean> {
  const secret = req.headers.get('x-notify-secret');
  if (NOTIFY_FN_SECRET && secret === NOTIFY_FN_SECRET) return true;
  const auth = req.headers.get('Authorization') ?? '';
  if (auth === `Bearer ${supabaseSrvKey}`) return true;
  try {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const { data, error } = await userClient.auth.getUser();
    return !error && !!data?.user;
  } catch { return false; }
}

interface EmailPayload {
  title:        string;
  body?:        string;
  actionUrl?:   string;
  resourceType?: string;
  resourceId?:  string;
  extra?:       Record<string, unknown>;
  /** Override template seçimi */
  template?:    string;
}

interface RequestBody {
  userIds:         string[];
  category:        string;
  payload:         EmailPayload;
  notificationId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  if (!(await assertCallerAuthorized(req))) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  if (!resendApiKey) {
    return json({ error: 'RESEND_API_KEY env not set' }, 500);
  }

  let body: RequestBody;
  try { body = await req.json() as RequestBody; }
  catch { return json({ error: 'invalid json' }, 400); }

  if (!body.userIds?.length || !body.payload?.title || !body.category) {
    return json({ error: 'userIds[], category, payload.title required' }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseSrvKey);

  // 1. Profiller + email + prefs çek
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, notification_prefs')
    .in('id', body.userIds);

  if (profErr) return json({ error: profErr.message }, 500);

  const targets = (profiles ?? []).filter((p: any) => {
    if (!p.email) return false;
    const prefs = p.notification_prefs;
    if (!prefs || prefs.master_enabled === false) return false;
    if (prefs.channels?.email === false) return false;
    const cat = body.category;
    if (cat && prefs.categories?.[cat]?.email === false) return false;
    return true;
  });

  if (targets.length === 0) {
    return json({ ok: true, sent: 0, skipped: body.userIds.length, reason: 'no_targets' });
  }

  // 2. Template render + email_notifications.insert (pending)
  const templateKey = body.payload.template ?? body.category;
  const subject = renderSubject(body.category, body.payload);

  const auditRows = targets.map((p: any) => ({
    notification_id: body.notificationId ?? null,
    user_id:    p.id,
    email_to:   p.email,
    subject,
    template:   templateKey,
    payload:    body.payload as Record<string, unknown>,
    status:     'pending',
    provider:   'resend',
  }));

  const { data: insertedRows } = await supabase
    .from('email_notifications')
    .insert(auditRows)
    .select('id, user_id, email_to');

  // 3. Resend'e gönder (paralel)
  const results = await Promise.all((insertedRows ?? auditRows).map(async (audit: any, idx: number) => {
    const target = targets[idx] as any;
    const html = renderHtmlBody({
      category: body.category,
      payload:  body.payload,
      name:     target?.full_name ?? null,
      appUrl:   appPublicUrl,
    });
    const text = renderTextBody({
      category: body.category,
      payload:  body.payload,
      appUrl:   appPublicUrl,
    });

    try {
      const resp = await fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          authorization:  `Bearer ${resendApiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from:     resendFrom,
          to:       [audit.email_to ?? target.email],
          subject,
          html,
          text,
          tags:     [
            { name: 'category', value: body.category },
            { name: 'user_id',  value: target.id },
          ],
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        await updateAudit(supabase, audit.id, {
          status:   'failed',
          error:    data?.message ?? `HTTP ${resp.status}`,
        });
        return { ok: false, error: data?.message ?? `HTTP ${resp.status}` };
      }
      await updateAudit(supabase, audit.id, {
        status:      'sent',
        provider_id: data?.id ?? null,
        sent_at:     new Date().toISOString(),
      });
      return { ok: true, providerId: data?.id };
    } catch (e: any) {
      await updateAudit(supabase, audit.id, {
        status: 'failed',
        error:  e?.message ?? String(e),
      });
      return { ok: false, error: e?.message };
    }
  }));

  const sent   = results.filter(r => r.ok).length;
  const failed = results.length - sent;

  // 4. notifications.delivered güncelle
  if (body.notificationId && sent > 0) {
    await supabase.from('notifications')
      .update({ delivered: { email: { ts: new Date().toISOString(), count: sent } } })
      .eq('id', body.notificationId)
      .catch(() => null);
  }

  return json({ ok: true, sent, failed, totalTargets: targets.length });
});

// ── Template helpers ────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  new_order:    'Yeni İş Emri',
  order_status: 'Sipariş Durumu',
  chat:         'Mesaj',
  approval:     'Onay Bekleyen',
  payment:      'Ödeme / Fatura',
  stock:        'Stok Uyarısı',
  delivery:     'Teslimat',
  paper_order:  'Yeni Kağıt Sipariş',
};

function renderSubject(_category: string, p: EmailPayload): string {
  return p.title;
}

function renderTextBody(opts: { category: string; payload: EmailPayload; appUrl: string }): string {
  const { payload, appUrl } = opts;
  const link = payload.actionUrl ? toAbs(payload.actionUrl, appUrl) : appUrl;
  return [
    payload.title,
    payload.body ? `\n${payload.body}` : '',
    `\n\n${link}`,
    '\n\n— Siman',
  ].join('');
}

function toAbs(url: string, base: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

function renderHtmlBody(opts: {
  category: string;
  payload:  EmailPayload;
  name:     string | null;
  appUrl:   string;
}): string {
  const { category, payload, name, appUrl } = opts;
  const label = CATEGORY_LABEL[category] ?? 'Bildirim';
  const link = payload.actionUrl ? toAbs(payload.actionUrl, appUrl) : appUrl;
  const greeting = name ? `Merhaba ${escape(name.split(' ')[0])},` : 'Merhaba,';
  const extra = (payload.extra ?? {}) as Record<string, string>;
  const orderNumber = extra.orderNumber || extra.order_number || '—';
  const clinicName  = extra.clinic || extra.clinicName || '';
  const patientName = extra.patient || extra.patientName || '';
  const workType    = extra.workType || extra.work_type || '';
  const labName     = extra.labName || extra.lab || 'Nexadent';
  const labLogoUrl  = extra.labLogoUrl || extra.lab_logo_url || '';
  const createdAt   = new Date().toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

  // Brand-level meta keys — UI'da brand strip / category chip / hero'da yer alıyor;
  // detail card'da tekrar göstermeye gerek yok.
  const SKIP_KEYS = new Set(['labName', 'lab', 'labLogoUrl', 'lab_logo_url', 'orderNumber', 'order_number']);
  const detailKeys = Object.keys(extra)
    .filter(k => !SKIP_KEYS.has(k))
    .filter(k => extra[k] !== undefined && extra[k] !== null && String(extra[k]).trim() !== '');

  // Lab logo markup — caller'dan gelen URL'i kullan, yoksa "N" placeholder tile
  const labLogoMarkup = labLogoUrl
    ? `<img src="${escape(labLogoUrl)}" alt="${escape(labName)}" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:contain;background:transparent;" />`
    : `<div style="width:56px;height:56px;border-radius:10px;background:#0F172A;text-align:center;line-height:56px;color:#FFFFFF;font-weight:800;font-size:22px;letter-spacing:0.5px;">${escape((labName[0] ?? 'N').toUpperCase())}</div>`;

  // Email-safe: table-based layout, inline styles, no flex/grid.
  // Print preview ile aynı görsel sistem (beyaz bg, ince border kartlar,
  // Inter font, lab brand strip + büyük "İş Emri" başlık + meta strip + CTA).
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${escape(label)}: ${escape(payload.title)}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 16px 12px !important; }
      .metaCell { display: block !important; width: 100% !important; border-right: none !important; border-bottom: 1px solid #F1F5F9; padding: 8px 0 !important; }
      .metaCell:last-child { border-bottom: none; }
      .twoCol { display: block !important; width: 100% !important; }
      .twoCol td { display: block !important; width: 100% !important; padding-bottom: 10px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0F172A;-webkit-font-smoothing:antialiased;">
<center style="width:100%;background:#F8FAFC;">

  <!-- Preheader (inbox preview, hidden in body) -->
  <div style="display:none;font-size:1px;color:#F8FAFC;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${escape(payload.body || payload.title)}
  </div>

  <table role="presentation" class="container" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;margin:0 auto;padding:28px 16px;">
    <tr><td>

      <!-- ── Wrapper card ── -->
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:26px 26px 0;">

          <!-- TOP BAR: brand left + QR right -->
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td valign="top">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td valign="middle" style="padding-right:10px;">
                      ${labLogoMarkup}
                    </td>
                    <td valign="middle">
                      <div style="font-size:17px;font-weight:800;letter-spacing:0.8px;color:#0F172A;line-height:1.1;">${escape(labName.toUpperCase())}</div>
                      <div style="font-size:8px;font-weight:700;color:#64748B;letter-spacing:3.4px;margin-top:4px;">LABORATORY</div>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:10px;display:inline-block;font-size:9px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#64748B;border:1px solid #E2E8F0;border-radius:9999px;padding:4px 10px;background:#F8FAFC;">
                  ${escape(label)}
                </div>
              </td>
              <td valign="top" align="right" width="92">
                <!-- QR — external (qrserver.com) — email-safe img -->
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=2&qzone=1&bgcolor=ffffff&color=0f172a&ecc=M&data=${encodeURIComponent(link)}"
                  alt="Vaka QR"
                  width="84" height="84"
                  style="display:block;width:84px;height:84px;border:1px solid #E2E8F0;border-radius:8px;padding:4px;background:#FFFFFF;" />
                <div style="font-size:8px;font-weight:800;color:#0F172A;letter-spacing:1.4px;margin-top:6px;text-align:center;">VAKA QR</div>
              </td>
            </tr>
          </table>

          <!-- Divider -->
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:18px;border-bottom:2px solid #0F172A;"><tr><td></td></tr></table>

          <!-- HERO TITLE -->
          <div style="font-size:9px;font-weight:700;color:#64748B;letter-spacing:1.8px;text-transform:uppercase;margin-top:14px;">
            ${escape(label)}
          </div>
          <h1 style="margin:6px 0 0 0;font-size:28px;font-weight:300;letter-spacing:-0.7px;color:#0F172A;line-height:1.1;font-family:'Inter Tight','Inter',-apple-system,sans-serif;">
            ${escape(payload.title)}
          </h1>

          <!-- DETAIL CARD — generic: extra payload key'leri + oluşturulma -->
          ${(detailKeys.length > 0) ? `
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:18px;border:1px solid #E2E8F0;border-radius:10px;">
            ${detailKeys.map((k, i) => `
            <tr><td style="padding:10px 14px;${i < detailKeys.length - 1 || true ? 'border-bottom:1px solid #F1F5F9;' : ''}">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td width="110" valign="top"><div style="font-size:10px;color:#94A3B8;letter-spacing:0.4px;text-transform:uppercase;font-weight:600;">${escape(prettyKey(k))}</div></td>
                  <td valign="top"><div style="font-size:12.5px;font-weight:600;color:#0F172A;line-height:1.4;">${escape(String(extra[k]))}</div></td>
                </tr>
              </table>
            </td></tr>`).join('')}
            <tr><td style="padding:10px 14px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td width="110" valign="top"><div style="font-size:10px;color:#94A3B8;letter-spacing:0.4px;text-transform:uppercase;font-weight:600;">Oluşturulma</div></td>
                  <td valign="top"><div style="font-size:12.5px;font-weight:600;color:#0F172A;line-height:1.4;">${escape(createdAt)}</div></td>
                </tr>
              </table>
            </td></tr>
          </table>` : ''}

          <!-- GREETING + CTA -->
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:22px;">
            <tr><td>
              <p style="margin:0 0 6px 0;font-size:14px;line-height:1.55;color:#0F172A;font-weight:600;">${greeting}</p>
              <p style="margin:0 0 18px 0;font-size:13px;line-height:1.55;color:#475569;">
                Detayları görüntülemek için aşağıdaki butonu kullanın.
              </p>

              <!-- Bulletproof button (table-based) -->
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" bgcolor="#0F172A" style="border-radius:10px;">
                    <a href="${escape(link)}" target="_blank" style="display:inline-block;padding:12px 22px;font-size:13.5px;font-weight:600;color:#FFFFFF;text-decoration:none;letter-spacing:0.2px;border-radius:10px;font-family:'Inter',Arial,sans-serif;">
                      İş Emrini Aç &nbsp;→
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:10px 0 0 0;font-size:11px;color:#94A3B8;line-height:1.5;word-break:break-all;">
                Veya linki tarayıcınıza yapıştırın:<br>
                <a href="${escape(link)}" target="_blank" style="color:#64748B;text-decoration:underline;">${escape(link)}</a>
              </p>
            </td></tr>
          </table>

        </td></tr>

        <!-- ── Footer strip ── -->
        <tr><td style="padding:18px 26px 22px;border-top:1px solid #E2E8F0;background:#FAFAFA;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td valign="middle">
                <div style="font-size:10px;font-weight:700;color:#0F172A;letter-spacing:0.5px;">
                  ${escape(labName)} <span style="color:#CBD5E1;">·</span> <span style="color:#64748B;font-weight:600;">Siman</span>
                </div>
                <div style="font-size:9px;color:#94A3B8;margin-top:3px;line-height:1.4;">
                  Bu bildirim, Siman hesabınıza ait tercihler doğrultusunda gönderildi.
                </div>
              </td>
              <td valign="middle" align="right">
                <a href="${escape(appUrl)}/settings?tab=notifications" target="_blank" style="font-size:9.5px;color:#64748B;text-decoration:underline;font-weight:600;">
                  Bildirim tercihleri
                </a>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>

      <!-- Outer brand mark -->
      <div style="margin-top:14px;text-align:center;font-size:9px;color:#94A3B8;letter-spacing:0.5px;">
        © ${new Date().getFullYear()} Siman · Dijital Diş Laboratuvarı Yönetimi
      </div>

    </td></tr>
  </table>

</center>
</body>
</html>`;
}

function renderExtraRows(extra?: Record<string, unknown>): string {
  if (!extra || typeof extra !== 'object') return '';
  const keys = Object.keys(extra).filter(k => extra[k] !== undefined && extra[k] !== null && extra[k] !== '');
  if (keys.length === 0) return '';
  return keys.map(k => `
    <div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.04);">
      <span style="color:#94A3B8;text-transform:uppercase;letter-spacing:0.6px;font-weight:600;font-size:10px;">${escape(prettyKey(k))}</span>
      <span style="color:#0A0A0A;font-weight:500;">${escape(String(extra[k]))}</span>
    </div>
  `).join('');
}

function prettyKey(k: string): string {
  const map: Record<string, string> = {
    // Common
    orderNumber:  'İş Emri No',
    order_number: 'İş Emri No',
    clinic:       'Klinik',
    clinicName:   'Klinik',
    patient:      'Hasta',
    patientName:  'Hasta',
    workType:     'Çalışma',
    work_type:    'Çalışma',
    technician:   'Teknisyen',
    status:       'Durum',
    // Payment
    amount:       'Tutar',
    currency:     'Para Birimi',
    dueDate:      'Vade',
    due_date:     'Vade',
    invoiceNo:    'Fatura No',
    paymentMethod:'Ödeme Yöntemi',
    // Approval
    requestedBy:  'Talep Eden',
    target:       'Hedef',
    // Stock
    item:         'Ürün',
    sku:          'Stok Kodu',
    quantity:     'Miktar',
    threshold:    'Eşik',
    // Delivery
    courier:      'Kurye',
    tracking:     'Takip No',
    eta:          'Tahmini Varış',
    address:      'Adres',
    // Chat
    sender:       'Gönderen',
    preview:      'Mesaj',
  };
  return map[k] ?? (k.charAt(0).toUpperCase() + k.slice(1));
}

const ACCENT_BY_CATEGORY: Record<string, string> = {
  new_order:    '#EA7A4C',
  order_status: '#2563EB',
  chat:         '#7C3AED',
  approval:     '#059669',
  payment:      '#0891B2',
  stock:        '#D97706',
  delivery:     '#0D9488',
  paper_order:  '#9333EA',
};

function escape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function updateAudit(supabase: any, id: string, patch: Record<string, unknown>) {
  if (!id) return;
  await supabase.from('email_notifications').update(patch).eq('id', id);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}
