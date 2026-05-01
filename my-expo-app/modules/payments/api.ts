/**
 * Online Payments — High-level API
 */
import { supabase } from '../../core/api/supabase';
import { getActivePaymentProvider } from './providers';
import type {
  PaymentIntent, PublicPaymentIntent, CardInput,
  ChargeInitResult, ChargeQueryResult, RefundResult, InstallmentOption,
} from './types';

// ─── Lab tarafı: ödeme linki oluştur ─────────────────────────────────────
export async function createPaymentLink(params: {
  invoice_id: string;
  amount?:    number;          // verilmezse fatura bakiyesi alınır
  currency?:  'TRY' | 'USD' | 'EUR';
  expires_in_days?: number;    // default 7
}) {
  // 1) Faturayı çek
  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .select('id, lab_id, clinic_id, doctor_id, total, paid_amount, currency, status')
    .eq('id', params.invoice_id)
    .single();
  if (invErr || !inv) return { error: invErr?.message ?? 'Fatura bulunamadı', intent: null };

  if ((inv as any).status === 'odendi') {
    return { error: 'Bu fatura zaten tahsil edildi', intent: null };
  }
  if ((inv as any).status === 'iptal') {
    return { error: 'İptal edilmiş fatura için ödeme linki oluşturulamaz', intent: null };
  }

  const balance = Number((inv as any).total) - Number((inv as any).paid_amount);
  const amount  = params.amount ?? balance;
  if (amount <= 0) return { error: 'Geçerli tutar yok', intent: null };
  if (amount > balance) return { error: 'Tutar fatura bakiyesini aşıyor', intent: null };

  // 2) Token üret (DB tarafında)
  const { data: tokRes } = await supabase.rpc('generate_payment_token');
  const token = (tokRes as string | null) ?? Math.random().toString(36).slice(2, 24);

  const provider = getActivePaymentProvider();
  const expiresAt = new Date(Date.now() + (params.expires_in_days ?? 7) * 86400 * 1000).toISOString();

  // 3) Intent insert
  const { data, error } = await supabase
    .from('payment_intents')
    .insert({
      invoice_id:   (inv as any).id,
      lab_id:       (inv as any).lab_id,
      clinic_id:    (inv as any).clinic_id,
      doctor_id:    (inv as any).doctor_id,
      public_token: token,
      amount,
      currency:     params.currency ?? (inv as any).currency ?? 'TRY',
      provider:     provider.key,
      status:       'pending',
      expires_at:   expiresAt,
    })
    .select()
    .single();

  if (error) return { error: error.message, intent: null };
  return { error: null, intent: data as PaymentIntent };
}

// ─── Halka açık ödeme intent'i çek ────────────────────────────────────────
export async function fetchPublicIntent(token: string) {
  const { data, error } = await supabase
    .rpc('fetch_public_payment_intent', { p_token: token });
  if (error) return { error: error.message, intent: null };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { error: 'Ödeme bulunamadı veya süresi geçmiş', intent: null };
  return { error: null, intent: row as PublicPaymentIntent };
}

// ─── 3DS akışı başlat ────────────────────────────────────────────────────
export async function chargeWithCard(params: {
  intent_id: string;
  token:     string;
  card:      CardInput;
}): Promise<ChargeInitResult> {
  // Intent'i public token ile çek
  const { data: intentRow } = await supabase
    .from('payment_intents')
    .select('*')
    .eq('id', params.intent_id)
    .eq('public_token', params.token)
    .maybeSingle();

  if (!intentRow) return { ok: false, error: 'Geçersiz ödeme linki' };
  const intent = intentRow as PaymentIntent;
  if (intent.status === 'paid') {
    return { ok: false, error: 'Bu ödeme zaten alındı', error_code: 'ALREADY_PAID' };
  }
  if (new Date(intent.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'Ödeme linki süresi dolmuş', error_code: 'EXPIRED' };
  }

  const provider = getActivePaymentProvider();

  // Log: init
  await supabase.from('payment_attempts').insert({
    intent_id: intent.id, action: 'init',
    request_body: { masked_pan: '****' + params.card.number.slice(-4), installment: params.card.installment ?? 1 },
  });

  const result = await provider.charge3D(intent, params.card);

  // Status & provider_ref güncelle
  await supabase.from('payment_intents').update({
    status:       result.status ?? (result.ok ? 'awaiting_3ds' : 'failed'),
    provider_ref: result.provider_ref ?? null,
    installments: params.card.installment ?? 1,
    error_code:   result.error_code ?? null,
    error_message:result.error ?? null,
    updated_at:   new Date().toISOString(),
  }).eq('id', intent.id);

  // Eğer demo otomatik success döndüyse, hemen invoice'a yansıt
  if (result.ok && result.status === 'paid' && result.provider_ref) {
    await supabase.rpc('confirm_payment_intent', {
      p_intent_id: intent.id,
      p_provider_ref: result.provider_ref,
    });
  }

  // Log: response
  await supabase.from('payment_attempts').insert({
    intent_id: intent.id, action: '3ds_redirect',
    response_body: result.raw_response ?? null,
    http_status:   result.http_status ?? null,
    error_code:    result.error_code ?? null,
    error_message: result.error ?? null,
  });

  return result;
}

// ─── 3DS callback (provider tamamlandığında çağrılır) ────────────────────
export async function confirmPayment(intentId: string, providerRef?: string) {
  const { data, error } = await supabase.rpc('confirm_payment_intent', {
    p_intent_id:    intentId,
    p_provider_ref: providerRef ?? null,
  });
  return { paymentId: data as string | null, error };
}

// ─── Lab tarafı: durum sorgu ─────────────────────────────────────────────
export async function queryIntent(intentId: string): Promise<ChargeQueryResult> {
  const { data: intent } = await supabase
    .from('payment_intents')
    .select('provider_ref')
    .eq('id', intentId)
    .single();
  const ref = (intent as any)?.provider_ref;
  if (!ref) return { ok: false, error: 'Provider referansı yok' };

  const provider = getActivePaymentProvider();
  return provider.query(ref);
}

// ─── İade ────────────────────────────────────────────────────────────────
export async function refundIntent(intentId: string, amount?: number): Promise<RefundResult> {
  const { data: intent } = await supabase
    .from('payment_intents')
    .select('provider_ref, amount')
    .eq('id', intentId)
    .single();
  const ref = (intent as any)?.provider_ref;
  if (!ref) return { ok: false, error: 'Provider referansı yok' };

  const provider = getActivePaymentProvider();
  const result = await provider.refund(ref, amount);

  if (result.ok) {
    await supabase.from('payment_intents').update({
      status:      result.status ?? 'refunded',
      refunded_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    }).eq('id', intentId);
  }
  return result;
}

// ─── Taksit seçenekleri ──────────────────────────────────────────────────
export async function getInstallments(binNumber: string, amount: number): Promise<InstallmentOption[]> {
  const provider = getActivePaymentProvider();
  return provider.getInstallments(binNumber, amount);
}

// ─── Lab tarafı: bir fatura için tüm intent'leri çek ─────────────────────
export async function fetchIntentsForInvoice(invoiceId: string) {
  return supabase
    .from('payment_intents')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });
}

// ─── UI helpers ───────────────────────────────────────────────────────────
export const PAYMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:             { label: 'Bekliyor',       color: '#94A3B8' },
  awaiting_3ds:        { label: '3DS Bekliyor',   color: '#0EA5E9' },
  authorized:          { label: 'Yetkilendirildi',color: '#7C3AED' },
  paid:                { label: 'Ödendi',          color: '#059669' },
  failed:              { label: 'Başarısız',       color: '#DC2626' },
  expired:             { label: 'Süresi Geçti',   color: '#64748B' },
  cancelled:           { label: 'İptal',           color: '#64748B' },
  refunded:            { label: 'İade Edildi',     color: '#0F172A' },
  partially_refunded:  { label: 'Kısmi İade',      color: '#0F172A' },
};

/** Public payment URL'i (production'da APP_URL env kullanılmalı) */
export function buildPaymentUrl(token: string, baseUrl?: string): string {
  const base = baseUrl
    ?? (typeof window !== 'undefined' ? window.location.origin : 'https://dental-lab.app');
  return `${base}/pay/${token}`;
}
