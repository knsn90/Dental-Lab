/**
 * Upload / üretim hatalarını yakalayıp toast'ta "Destek aç" linkiyle gösteren helper.
 *
 *   try { await uploadFile(...); }
 *   catch (e) { reportUploadError(e, { context: { order_id, ... } }); }
 */
import { toast } from '../../../core/ui/Toast';
import { openSupport } from '../../../core/store/supportStore';
import type { SupportCategory, SupportContext } from '../types';

interface ReportOptions {
  context?: SupportContext;
  category?: SupportCategory;
  errorCode?: string;
  subjectHint?: string;
  workOrderId?: string | null;
  stageKey?: string | null;
  /** toast'un başlığını override et (default: "Hata oluştu") */
  toastTitle?: string;
  /** Açıklayıcı kısa mesaj (toast'ta görünür) */
  description?: string;
}

export function reportUploadError(err: unknown, opts: ReportOptions = {}) {
  const errMsg =
    err && typeof err === 'object' && 'message' in err
      ? String((err as any).message)
      : typeof err === 'string'
      ? err
      : 'Bilinmeyen hata';

  const ctx: SupportContext = {
    source: opts.context?.source ?? 'upload',
    error_message: errMsg,
    error_code: opts.errorCode ?? opts.context?.error_code,
    ...(opts.context ?? {}),
  };

  const desc = opts.description ?? errMsg;

  toast.error(
    `${opts.toastTitle ?? 'Hata oluştu'} — ${desc}`,
    {
      // toast.error API tek string alıyor — destek için ayrı bir buton lazımsa wrapper'a kalır
      // burada hızlı yol: 3 saniye sonra otomatik bir "Destek aç" call-to-action toast'u
    } as any,
  );

  // İkinci bir CTA toast'u — kullanıcı sayfada kalmaya devam ederken "Destek aç"a tıklayabilsin
  setTimeout(() => {
    toast.info?.('💬 Destek aç → otomatik bağlamla') ??
      // toast.info yoksa toast.success kullanmayalım — onPress yok sade text
      toast.success('Destek aç → otomatik bağlamla');
  }, 100);

  // Programatik olarak direkt destek modalı da aç — kullanıcı isterse iptal eder
  openSupport({
    context: ctx,
    category: opts.category ?? 'teknik_sorun',
    subjectHint: opts.subjectHint,
    workOrderId: opts.workOrderId ?? null,
    stageKey: opts.stageKey ?? null,
    errorCode: opts.errorCode ?? null,
  });
}

/**
 * Sadece toast göster, modal açma (sessiz mod).
 */
export function reportUploadErrorSilent(err: unknown, opts: ReportOptions = {}) {
  const errMsg =
    err && typeof err === 'object' && 'message' in err
      ? String((err as any).message)
      : typeof err === 'string'
      ? err
      : 'Bilinmeyen hata';
  toast.error(`${opts.toastTitle ?? 'Hata'} — ${opts.description ?? errMsg}`);
}
