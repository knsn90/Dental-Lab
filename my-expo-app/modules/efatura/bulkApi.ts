/**
 * Toplu e-Fatura — bir kliniğin birden çok Siman faturası → TEK resmi e-fatura.
 *
 * Siman her teslim edilen siparişe kendi faturasını açar; resmi e-fatura ise
 * çoğu zaman dönem sonunda klinik başına tek kesilir. İş sunucuda
 * (`efatura-luca` merge_* / link_* işlemleri); burası yalnız çağırır.
 *
 *  - fetchBulkCandidates()        → e-faturasız, kesilmeye hazır faturalar (klinik bilgisiyle)
 *  - previewMerge(ids)            → taslak (imzalı jeton, 30 dk) — Luca'ya gitmez
 *  - sendMerge(ids, token)        → asıl faturayı kes; tüm faturalar aynı ETTN'yi alır
 *  - lookupExternal(ids, ettn)    → Luca portalında kesilmiş faturayı ETTN ile bul
 *  - linkExternal(ids, ettn)      → bulunan faturayı seçilen Siman faturalarına bağla
 */
import { supabase } from '../../core/api/supabase';
import { edgeErrorMessage } from '../../core/api/edgeError';
import { invoiceStatusErrorText } from '../invoices/lib/statementDiscount';
import type { EFaturaPreview, EFaturaStatus } from './types';

export interface BulkCandidate {
  id: string;
  invoice_number: string;
  status: string;
  issue_date: string;
  total: number;
  currency: string;
  clinic_id: string;
  clinic_name: string;
  clinic_logo: string | null;
  /** Klinik VKN — Luca'daki faturanın alıcısıyla eşleştirmek için */
  clinic_vkn: string | null;
  /** e-Faturaya hazırlık denetimi (lib/readiness) */
  clinic_tax_office: string | null;
  clinic_address: string | null;
  order_number: string | null;
}

async function invoke(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('efatura-luca', { body });
  const r = error ? { ok: false, error: await edgeErrorMessage(error, 'e-Fatura sunucusuna ulaşılamadı') } : data;
  // Ön ekstre onayı açık + seçimde taslak → sunucu INV_APPROVAL_REQUIRED kodunu döndürür; okunur metne çevir.
  if (r && /INV_APPROVAL_REQUIRED/.test(String(r.error ?? ''))) return { ...r, error: invoiceStatusErrorText(r.error) };
  return r;
}

/** ETTN'si olmayan (Luca'da hiç kesilmemiş), iptal edilmemiş, tutarı olan faturalar. */
export async function fetchBulkCandidates(): Promise<{ data: BulkCandidate[]; error: string | null }> {
  const { data, error } = await supabase
    .from('invoices')
    .select(`id, invoice_number, status, issue_date, total, currency, clinic_id,
             clinic:clinics(name, logo_url, vkn, tax_office, address),
             orders:invoice_orders(work_order:work_orders(order_number))`)
    .neq('status', 'iptal')
    .gt('total', 0)
    .not('clinic_id', 'is', null)
    .is('efatura_uuid', null)
    .order('issue_date', { ascending: true })
    .limit(2000);
  if (error) return { data: [], error: error.message };
  return {
    error: null,
    data: ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      invoice_number: r.invoice_number,
      status: r.status,
      issue_date: r.issue_date,
      total: Number(r.total) || 0,
      currency: String(r.currency ?? 'TRY').toUpperCase(),
      clinic_id: r.clinic_id,
      clinic_name: r.clinic?.name ?? '—',
      clinic_logo: r.clinic?.logo_url ?? null,
      clinic_vkn: r.clinic?.vkn ? String(r.clinic.vkn).replace(/\s+/g, '') : null,
      clinic_tax_office: r.clinic?.tax_office ?? null,
      clinic_address: r.clinic?.address ?? null,
      order_number: r.orders?.[0]?.work_order?.order_number ?? null,
    })),
  };
}

export type MergePreviewResult =
  | { ok: true; preview: EFaturaPreview; token: string; expiresAt: string; count: number }
  | { ok: false; error: string };

export async function previewMerge(invoiceIds: string[]): Promise<MergePreviewResult> {
  const r = await invoke({ action: 'merge_preview', invoice_ids: invoiceIds });
  return r?.ok === true && r?.preview
    ? { ok: true, preview: r.preview, token: String(r.preview_token ?? ''), expiresAt: String(r.preview_expires_at ?? ''), count: Number(r.count) || invoiceIds.length }
    : { ok: false, error: r?.error ?? 'Önizleme hazırlanamadı' };
}

export type MergeSendResult =
  | { ok: true; uuid: string; number: string | null; type: 'e_fatura' | 'e_arsiv'; count: number }
  | { ok: false; error: string; needsPreview: boolean };

export async function sendMerge(invoiceIds: string[], previewToken: string): Promise<MergeSendResult> {
  const r = await invoke({ action: 'merge_send', invoice_ids: invoiceIds, preview_token: previewToken });
  return r?.ok === true
    ? { ok: true, uuid: r.uuid, number: r.number ?? null, type: r.type, count: Number(r.count) || invoiceIds.length }
    : { ok: false, error: r?.error ?? 'Fatura kesilemedi', needsPreview: r?.needs_preview === true };
}

export interface ExternalInvoiceInfo {
  ettn: string;
  kind: 'e_fatura' | 'e_arsiv';
  number: string | null;
  status: EFaturaStatus;
  count: number;
  total: number;
  currency: string;
}

export async function lookupExternal(invoiceIds: string[], ettn: string): Promise<{ ok: true; info: ExternalInvoiceInfo } | { ok: false; error: string }> {
  const r = await invoke({ action: 'link_lookup', invoice_ids: invoiceIds, ettn });
  return r?.ok === true ? { ok: true, info: r as ExternalInvoiceInfo } : { ok: false, error: r?.error ?? 'Luca\'da aranamadı' };
}

export async function linkExternal(invoiceIds: string[], ettn: string): Promise<{ ok: true; info: ExternalInvoiceInfo } | { ok: false; error: string }> {
  const r = await invoke({ action: 'link', invoice_ids: invoiceIds, ettn });
  return r?.ok === true ? { ok: true, info: r as ExternalInvoiceInfo } : { ok: false, error: r?.error ?? 'Bağlanamadı' };
}

/** Aynı e-faturayı paylaşan Siman faturası sayısı (toplu e-fatura rozeti için). */
export async function countSharedEFatura(uuid: string): Promise<number> {
  const { count } = await supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('efatura_uuid', uuid);
  return count ?? 0;
}

/** Luca'da kesilmiş (giden) e-fatura — "Luca'da kesildi" sekmesinde seçilir. */
export interface LucaIssued {
  ettn: string;
  number: string;
  date: string | null;
  buyerName: string;
  buyerVkn: string;
  currency: string;
  payable: number;
  status: EFaturaStatus;
  lucaStatus: string | null;
  scenario: string | null;
}

export async function listLucaIssued(page = 1, perPage = 20): Promise<
  { ok: true; items: LucaIssued[]; total: number; pages: number; page: number } | { ok: false; error: string }
> {
  const r = await invoke({ action: 'outgoing_list', page, per_page: perPage });
  return r?.ok === true
    ? { ok: true, items: (r.items ?? []) as LucaIssued[], total: Number(r.total) || 0, pages: Number(r.pages) || 1, page: Number(r.page) || page }
    : { ok: false, error: r?.error ?? 'Luca\'da kesilen faturalar alınamadı' };
}

/** ETTN → bu e-faturaya bağlı Siman faturası sayısı (Luca'da kesilenler listesinde rozet). */
export async function fetchLinkedCounts(ettns: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = ettns.filter((e) => /^[0-9a-f-]{36}$/i.test(e)).map((e) => e.toLowerCase());
  if (!ids.length) return out;
  const { data, error } = await supabase.from('invoices').select('efatura_uuid').in('efatura_uuid', ids);
  if (error) return out;
  for (const r of (data ?? []) as Array<{ efatura_uuid: string | null }>) {
    const k = String(r.efatura_uuid ?? '').toLowerCase();
    if (k) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** e-Faturası olan tüm Siman faturaları (toplu e-fatura grupları için; gruplama lib/bulkGroups). */
export async function fetchEInvoicedRows(): Promise<{ data: import('./lib/bulkGroups').BulkMemberRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('invoices')
    .select(`id, invoice_number, issue_date, total, currency, status,
             efatura_uuid, efatura_number, efatura_status, efatura_type, efatura_sent_at,
             clinic:clinics(name, logo_url)`)
    .not('efatura_uuid', 'is', null)
    .order('efatura_sent_at', { ascending: false })
    .limit(2000);
  if (error) return { data: [], error: error.message };
  return {
    error: null,
    data: ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      invoice_number: r.invoice_number,
      issue_date: r.issue_date,
      total: Number(r.total) || 0,
      currency: String(r.currency ?? 'TRY').toUpperCase(),
      status: r.status,
      efatura_uuid: r.efatura_uuid,
      efatura_number: r.efatura_number,
      efatura_status: r.efatura_status,
      efatura_type: r.efatura_type,
      efatura_sent_at: r.efatura_sent_at,
      clinic_name: r.clinic?.name ?? '—',
      clinic_logo: r.clinic?.logo_url ?? null,
    })),
  };
}
