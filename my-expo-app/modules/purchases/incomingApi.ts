/**
 * Gelen e-faturalar (tedarikçilerin Luca üzerinden lab'a kestiği) → Alış Faturası.
 *
 * Luca'dan okuma sunucuda (`efatura-luca` incoming_list — salt okunur). Kayıt mevcut
 * Alış Faturası formuyla yapılır; ETTN `purchase_invoices.efatura_ettn`'e yazılır
 * (lab başına tekil → aynı e-fatura iki kez aktarılamaz).
 */
import { supabase } from '../../core/api/supabase';
import { edgeErrorMessage } from '../../core/api/edgeError';
import type { IncomingInvoice, PrefillPdf } from './lib/incomingPrefill';

export interface IncomingSummary {
  ettn: string;
  number: string;
  date: string | null;
  supplierName: string;
  supplierVkn: string;
  currency: string;
  payable: number;
  status: string | null;
  scenario: string | null;
}

async function invoke(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('efatura-luca', { body });
  if (error) return { ok: false, error: await edgeErrorMessage(error, 'e-Fatura sunucusuna ulaşılamadı') };
  return data;
}

export async function listIncoming(page = 1, perPage = 20): Promise<
  { ok: true; items: IncomingSummary[]; total: number; pages: number; page: number } | { ok: false; error: string }
> {
  const r = await invoke({ action: 'incoming_list', page, per_page: perPage });
  return r?.ok === true
    ? { ok: true, items: (r.items ?? []) as IncomingSummary[], total: Number(r.total) || 0, pages: Number(r.pages) || 1, page: Number(r.page) || page }
    : { ok: false, error: r?.error ?? 'Gelen e-faturalar alınamadı' };
}

/** Tek gelen faturanın kalemleri + PDF'i (arşiv için). */
export async function getIncoming(ettn: string): Promise<
  { ok: true; invoice: IncomingInvoice; pdf: PrefillPdf | null } | { ok: false; error: string }
> {
  const r = await invoke({ action: 'incoming_list', ettn, with_pdf: true });
  if (r?.ok !== true || !r.invoice) return { ok: false, error: r?.error ?? 'Fatura alınamadı' };
  const inv = r.invoice as IncomingInvoice;
  const b64 = typeof r.pdf_base64 === 'string' && r.pdf_base64 ? r.pdf_base64 : null;
  const pdf: PrefillPdf | null = b64
    ? {
        name: `${inv.number || 'e-fatura'}.pdf`,
        type: 'application/pdf',
        arrayBuffer: async () => {
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return bytes.buffer;
        },
      }
    : null;
  return { ok: true, invoice: inv, pdf };
}

/** Bu ETTN'lerden hangileri zaten alış faturası olarak kaydedildi → ETTN → alış faturası id. */
export async function fetchImported(ettns: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ettns.length) return out;
  const { data, error } = await supabase
    .from('purchase_invoices')
    .select('id, efatura_ettn')
    .in('efatura_ettn', ettns.map((e) => e.toLowerCase()));
  if (error) return out;
  for (const r of (data ?? []) as Array<{ id: string; efatura_ettn: string | null }>) {
    if (r.efatura_ettn) out.set(r.efatura_ettn.toLowerCase(), r.id);
  }
  return out;
}
