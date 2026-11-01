/**
 * LucaProvider — TÜRMOB Luca e-fatura.
 *
 * Tüm iş sunucuda (`efatura-luca` edge function): Luca yalnız VPS'imizin statik
 * IP'sini kabul eder ve şifre istemez; fatura DB'den sunucuda kurulur, ETTN /
 * Luca no / durum / log sunucuda yazılır. Bu sınıf yalnız o fonksiyonu çağırır.
 */
import { supabase } from '../../../core/api/supabase';
import { edgeErrorMessage } from '../../../core/api/edgeError';
import { BaseEFaturaProvider } from './BaseProvider';
import type {
  EFaturaInvoice, EFaturaSendResult, EFaturaQueryResult, MukellefCheckResult, EFaturaPreviewResult,
} from '../types';

async function invoke(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('efatura-luca', { body });
  if (error) return { ok: false, error: await edgeErrorMessage(error, 'e-Fatura sunucusuna ulaşılamadı') };
  return data;
}

export class LucaProvider extends BaseEFaturaProvider {
  readonly key = 'luca';
  readonly displayName = 'Luca (TÜRMOB)';

  /** Önizleme jetonu ZORUNLU: sunucu jetonsuz / içeriği değişmiş gönderimi Luca'ya iletmez. */
  async sendById(invoiceId: string, opts?: { previewToken?: string }): Promise<EFaturaSendResult> {
    const r = await invoke({ action: 'send', invoice_id: invoiceId, preview_token: opts?.previewToken ?? null });
    return {
      ok: r?.ok === true,
      uuid: r?.uuid ?? undefined,
      number: r?.number ?? null,
      type: r?.type,
      status: r?.ok ? (r?.status ?? 'sent') : 'error',
      error: r?.ok ? undefined : (r?.error ?? 'Gönderim başarısız'),
      needsPreview: r?.needs_preview === true,
      persisted: true,
    };
  }

  /** Gönderimle aynı hazırlık; Luca'ya gitmez, DB'ye yazmaz (Luca'da taslak işlemi yok). */
  async previewById(invoiceId: string): Promise<EFaturaPreviewResult> {
    const r = await invoke({ action: 'preview', invoice_id: invoiceId });
    return r?.ok === true && r?.preview
      ? {
          ok: true, preview: r.preview,
          previewToken: typeof r.preview_token === 'string' ? r.preview_token : undefined,
          previewExpiresAt: typeof r.preview_expires_at === 'string' ? r.preview_expires_at : undefined,
        }
      : { ok: false, error: r?.error ?? 'Önizleme hazırlanamadı' };
  }

  async queryStatusById(invoiceId: string): Promise<EFaturaQueryResult> {
    const r = await invoke({ action: 'status', invoice_id: invoiceId });
    return r?.ok
      ? { ok: true, status: r.status, error: r.error ?? undefined, number: r.number ?? null, persisted: true }
      : { ok: false, error: r?.error ?? 'Sorgulama başarısız', persisted: true };
  }

  // Luca fatura kimliğiyle çalışır; istemcide kurulan domain faturası kullanılmaz.
  async send(_invoice: EFaturaInvoice): Promise<EFaturaSendResult> {
    return { ok: false, error: 'Luca gönderimi fatura kimliğiyle yapılır' };
  }

  async queryStatus(_uuid: string): Promise<EFaturaQueryResult> {
    return { ok: false, error: 'Luca durumu fatura kimliğiyle sorgulanır' };
  }

  async cancel(_uuid: string, _reason?: string): Promise<EFaturaSendResult> {
    return { ok: false, error: 'Luca iptali henüz desteklenmiyor — iptali Luca portalından yapın' };
  }

  async checkMukellef(vkn: string): Promise<MukellefCheckResult> {
    const r = await invoke({ action: 'mukellef', vkn });
    return {
      ok: r?.ok === true,
      vkn,
      is_registered: r?.is_registered === true,
      alias: r?.alias ?? undefined,
      title: r?.title ?? undefined,
      error: r?.ok ? undefined : (r?.error ?? 'Mükellef sorgusu başarısız'),
    };
  }
}
