/**
 * e-Fatura — High-level API
 *
 *  - sendInvoice(invoiceId)        → DB'den çek, provider'a yolla, log + invoice durumu güncelle
 *  - queryStatus(invoiceId)        → uuid varsa entegratörden durum sor, güncelle
 *  - cancelEFatura(invoiceId)      → İptal et, log + durum güncelle
 *  - checkMukellef(vkn)            → Cache'den ya da provider'dan sorgula
 *  - fetchEFaturaLogs(invoiceId)   → Geçmiş gönderimler
 */
import { supabase } from '../../core/api/supabase';
import { getActiveProvider } from './providers';
import type {
  EFaturaInvoice, EFaturaCustomer, EFaturaLab,
  EFaturaSendResult, EFaturaQueryResult, EFaturaStatus,
  MukellefCheckResult,
} from './types';

const MUKELLEF_CACHE_TTL_HOURS = 24;

// ─── Yardımcı: DB'den EFaturaInvoice domain modelini kur ──────────────────
async function buildDomainInvoice(invoiceId: string): Promise<EFaturaInvoice | { error: string }> {
  // Invoice + clinic + doctor + lab + items
  const { data: inv, error } = await supabase
    .from('invoices')
    .select(`
      *,
      clinic:clinics(id, name, address, phone, email, vkn, tax_office, efatura_alias),
      doctor:doctors(id, full_name, tckn),
      lab:labs(id, name, address, phone, email, website, tax_number),
      items:invoice_items(*)
    `)
    .eq('id', invoiceId)
    .single();

  if (error || !inv) return { error: error?.message ?? 'Fatura bulunamadı' };

  const lab = (inv as any).lab;
  if (!lab?.tax_number) return { error: 'Lab VKN tanımlı değil' };

  // Müşteri tipi: clinic.vkn varsa corporate, yoksa doctor.tckn ile individual
  const clinic = (inv as any).clinic;
  const doctor = (inv as any).doctor;
  const isCorporate = !!clinic?.vkn;

  const customer: EFaturaCustomer = isCorporate
    ? {
        type: 'corporate',
        name: clinic.name,
        vkn: clinic.vkn,
        tax_office: clinic.tax_office ?? null,
        address: clinic.address ?? '—',
        email: clinic.email ?? null,
        phone: clinic.phone ?? null,
        alias: clinic.efatura_alias ?? null,
      }
    : {
        type: 'individual',
        name: doctor?.full_name ?? clinic?.name ?? 'Müşteri',
        tckn: doctor?.tckn ?? null,
        address: clinic?.address ?? '—',
        email: clinic?.email ?? null,
        phone: clinic?.phone ?? null,
      };

  const labDom: EFaturaLab = {
    id:          lab.id,
    name:        lab.name,
    vkn:         lab.tax_number,
    tax_office:  lab.tax_office ?? '—',
    address:     lab.address ?? '—',
    phone:       lab.phone ?? undefined,
    email:       lab.email ?? undefined,
    website:     lab.website ?? undefined,
  };

  const items = ((inv as any).items ?? []).map((it: any) => ({
    description: it.description ?? it.name ?? 'Hizmet',
    quantity:    Number(it.quantity ?? 1),
    unit:        'C62',                                     // Adet
    unit_price:  Number(it.unit_price ?? 0),
    tax_rate:    Number(it.tax_rate ?? inv.tax_rate ?? 20),
    discount:    it.discount ? Number(it.discount) : undefined,
  }));

  // efatura_type karar: corporate + VKN cache'de registered → e_fatura, aksi e_arsiv
  let type: 'e_fatura' | 'e_arsiv' = 'e_arsiv';
  if (isCorporate && clinic.vkn) {
    const { data: cache } = await supabase
      .from('mukellef_cache')
      .select('is_registered')
      .eq('vkn', clinic.vkn)
      .maybeSingle();
    if ((cache as any)?.is_registered) type = 'e_fatura';
  }

  return {
    invoice_number: inv.invoice_number,
    issue_date:     inv.issue_date,
    due_date:       inv.due_date,
    currency:       (inv.currency ?? 'TRY') as 'TRY',
    type,
    lab:            labDom,
    customer,
    items,
    notes:          inv.notes,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────
export async function sendInvoice(invoiceId: string): Promise<EFaturaSendResult> {
  const provider = getActiveProvider();
  const built = await buildDomainInvoice(invoiceId);
  if ('error' in built) return { ok: false, error: built.error };

  // Status: queued
  await supabase.from('invoices').update({
    efatura_status:   'queued',
    efatura_provider: provider.key,
    efatura_type:     built.type,
  }).eq('id', invoiceId);

  const result = await provider.send(built);

  // Log
  await supabase.from('efatura_logs').insert({
    invoice_id:    invoiceId,
    provider:      provider.key,
    action:        'send',
    request_body:  { invoice_number: built.invoice_number, type: built.type },
    response_body: result.raw_response ?? null,
    http_status:   result.http_status ?? null,
    efatura_uuid:  result.uuid ?? null,
    efatura_status: result.status ?? null,
    error_code:    result.error_code ?? null,
    error_message: result.error ?? null,
  });

  // Invoice güncelle
  await supabase.from('invoices').update({
    efatura_uuid:    result.uuid ?? null,
    efatura_etag:    result.etag ?? null,
    efatura_status:  result.ok ? (result.status ?? 'sent') : 'error',
    efatura_sent_at: result.ok ? new Date().toISOString() : null,
    efatura_error:   result.ok ? null : (result.error ?? 'Bilinmeyen hata'),
  }).eq('id', invoiceId);

  return result;
}

export async function queryEFaturaStatus(invoiceId: string): Promise<EFaturaQueryResult> {
  const provider = getActiveProvider();
  const { data: inv } = await supabase
    .from('invoices')
    .select('efatura_uuid, efatura_status')
    .eq('id', invoiceId)
    .single();

  const uuid = (inv as any)?.efatura_uuid;
  if (!uuid) return { ok: false, error: 'UUID yok — fatura henüz gönderilmemiş' };

  const result = await provider.queryStatus(uuid);

  await supabase.from('efatura_logs').insert({
    invoice_id:     invoiceId,
    provider:       provider.key,
    action:         'status_check',
    response_body:  result.raw_response ?? null,
    efatura_uuid:   uuid,
    efatura_status: result.status ?? null,
    error_message:  result.error ?? null,
  });

  if (result.ok && result.status) {
    await supabase.from('invoices').update({
      efatura_status: result.status,
    }).eq('id', invoiceId);
  }

  return result;
}

export async function cancelEFatura(invoiceId: string, reason?: string): Promise<EFaturaSendResult> {
  const provider = getActiveProvider();
  const { data: inv } = await supabase
    .from('invoices')
    .select('efatura_uuid')
    .eq('id', invoiceId)
    .single();

  const uuid = (inv as any)?.efatura_uuid;
  if (!uuid) return { ok: false, error: 'UUID yok — iptal edilecek e-Fatura bulunamadı' };

  const result = await provider.cancel(uuid, reason);

  await supabase.from('efatura_logs').insert({
    invoice_id:     invoiceId,
    provider:       provider.key,
    action:         'cancel',
    request_body:   { reason },
    response_body:  result.raw_response ?? null,
    efatura_uuid:   uuid,
    efatura_status: result.status ?? null,
    error_message:  result.error ?? null,
  });

  if (result.ok) {
    await supabase.from('invoices').update({ efatura_status: 'cancelled' }).eq('id', invoiceId);
  }
  return result;
}

// ─── Mükellef sorgu (cache + provider fallback) ───────────────────────────
export async function checkMukellef(vkn: string): Promise<MukellefCheckResult> {
  if (!vkn) return { ok: false, vkn, is_registered: false, error: 'VKN boş' };

  // Cache hit?
  const { data: cached } = await supabase
    .from('mukellef_cache')
    .select('*')
    .eq('vkn', vkn)
    .maybeSingle();

  if (cached) {
    const ageMs   = Date.now() - new Date((cached as any).checked_at).getTime();
    const fresh   = ageMs < MUKELLEF_CACHE_TTL_HOURS * 3600 * 1000;
    if (fresh) {
      return {
        ok:            true,
        vkn,
        is_registered: (cached as any).is_registered,
        alias:         (cached as any).alias,
        title:         (cached as any).title,
        tax_office:    (cached as any).tax_office,
      };
    }
  }

  // Provider'dan sorgula
  const provider = getActiveProvider();
  const result = await provider.checkMukellef(vkn);

  if (result.ok) {
    // Upsert cache
    await supabase.from('mukellef_cache').upsert({
      vkn,
      is_registered: result.is_registered,
      alias:         result.alias ?? null,
      title:         result.title ?? null,
      tax_office:    result.tax_office ?? null,
      provider:      provider.key,
      checked_at:    new Date().toISOString(),
    }, { onConflict: 'vkn' });

    // Clinic varsa onun da efatura_registered cache'ini güncelle
    await supabase.from('clinics').update({
      efatura_registered: result.is_registered,
      efatura_alias:      result.alias ?? null,
      efatura_checked_at: new Date().toISOString(),
    }).eq('vkn', vkn);
  }
  return result;
}

// ─── Logs ─────────────────────────────────────────────────────────────────
export async function fetchEFaturaLogs(invoiceId: string) {
  return supabase
    .from('efatura_logs')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });
}

// ─── UI yardımcıları ──────────────────────────────────────────────────────
export const STATUS_LABELS: Record<EFaturaStatus, { label: string; color: string }> = {
  pending:   { label: 'Hazırlanmadı',  color: '#94A3B8' },
  queued:    { label: 'Sırada',         color: '#0EA5E9' },
  sent:      { label: 'Gönderildi',     color: '#2563EB' },
  accepted:  { label: 'Kabul Edildi',   color: '#059669' },
  rejected:  { label: 'Reddedildi',     color: '#DC2626' },
  cancelled: { label: 'İptal Edildi',   color: '#64748B' },
  error:     { label: 'Hata',           color: '#DC2626' },
};
