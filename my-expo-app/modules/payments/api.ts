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

  const provider = await getActivePaymentProvider();
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

// ─── Klinik/hekim: kendi faturası için ödeme başlat ──────────────────────
//
// Klinik kullanıcısının `payment_intents` üzerinde RLS yetkisi YOK (tablo
// lab'a kapalı; profiles.lab_id klinikte NULL). Bu yüzden intent'i
// SECURITY DEFINER RPC açar: sahipliği kendi doğrular ve tutarı SUNUCUDA
// (total − paid_amount) hesaplar — istemciden tutar alınmaz.
//
// Aynı fatura için geçerli bekleyen intent varsa yenisi açılmaz, mevcut
// token döner (`reused`).
export async function startMyInvoicePayment(invoiceId: string): Promise<{
  error: string | null;
  token: string | null;
  amount?: number;
  currency?: string;
  /** Lab'ın aktif POS'u (iyzico, demo…) — RPC aktif sağlayıcı yoksa hata döner. */
  provider?: string;
}> {
  const { data, error } = await supabase
    .rpc('create_my_invoice_payment_intent', { p_invoice_id: invoiceId });
  if (error) return { error: error.message, token: null };
  const row: any = Array.isArray(data) ? data[0] : data;
  if (!row?.public_token) return { error: 'Ödeme başlatılamadı', token: null };
  return {
    error: null,
    token: String(row.public_token),
    amount: Number(row.amount) || 0,
    currency: String(row.currency ?? 'TRY'),
    provider: row.provider ? String(row.provider) : undefined,
  };
}

// ─── Klinik: toplu ödeme (birden çok faturayı tek kartla) ────────────────
//
// Tutar SUNUCUDA doğrulanır (0 < tutar ≤ o para birimindeki açık bakiye) ve
// ödeme onaylanınca faturalara EN ESKİDEN başlayarak dağıtılır — nakit toplu
// tahsilatta kullanılan kuralın aynısı.

export interface OpenBalanceRow {
  currency: string;
  balance: number;
  invoice_count: number;
}

/** Kliniğin para birimi bazında açık bakiyesi. */
export async function fetchMyOpenBalances(): Promise<OpenBalanceRow[]> {
  const { data, error } = await supabase.rpc('my_open_balance_by_currency');
  if (error) return [];
  return ((data ?? []) as any[]).map(r => ({
    currency: String(r.currency ?? 'TRY'),
    balance: Number(r.balance) || 0,
    invoice_count: Number(r.invoice_count) || 0,
  }));
}

export async function startMyBulkPayment(currency: string, amount: number): Promise<{
  error: string | null;
  token: string | null;
  amount?: number;
  currency?: string;
  provider?: string;
  invoiceCount?: number;
}> {
  const { data, error } = await supabase
    .rpc('create_my_bulk_payment_intent', { p_currency: currency, p_amount: amount });
  if (error) return { error: error.message, token: null };
  const row: any = Array.isArray(data) ? data[0] : data;
  if (!row?.public_token) return { error: 'Ödeme başlatılamadı', token: null };
  return {
    error: null,
    token: String(row.public_token),
    amount: Number(row.amount) || 0,
    currency: String(row.currency ?? currency),
    provider: row.provider ? String(row.provider) : undefined,
    invoiceCount: Number(row.invoice_count) || 0,
  };
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
//
// GÜVENLİK (2026-08-02): tüm akış payments-charge edge function'ına taşındı.
// Eskiden tarayıcı hem sağlayıcıyı çağırıyor hem de sonucu kendisi yazıyordu
// (`UPDATE payment_intents SET status=...`, `INSERT payment_attempts`) — yani
// ödemenin başarılı sayılıp sayılmayacağına istemci karar veriyordu.
// Artık istemcinin payment_intents üzerinde UPDATE/DELETE, payment_attempts
// üzerinde INSERT yetkisi yok; ödeme durumunu yalnız service_role yazar.
export async function chargeWithCard(params: {
  intent_id: string;
  token:     string;
  card:      CardInput;
}): Promise<ChargeInitResult> {
  const { data, error } = await supabase.functions.invoke('payments-charge', {
    body: {
      action:       'charge',
      intent_id:    params.intent_id,
      public_token: params.token,
      card:         params.card,
      installment:  params.card.installment ?? 1,
    },
  });
  if (error) return { ok: false, error: error.message ?? 'Ödeme başlatılamadı' };
  return (data ?? { ok: false, error: 'Boş yanıt' }) as ChargeInitResult;
}

// ─── 3DS onayı ───────────────────────────────────────────────────────────
//
// GÜVENLİK (2026-08-02): eskiden burada confirm_payment_intent RPC'si DOĞRUDAN
// çağrılıyordu. O RPC SECURITY DEFINER'dı, EXECUTE yetkisi anon'daydı ve tek
// argümanı intent UUID'siydi — token/oturum/tutar doğrulaması yoktu. Ödeme
// linkini açan herkes (fetch_public_payment_intent zaten intent_id döndürür)
// kart girmeden faturayı "ödendi" yapabilirdi. RPC artık yalnız service_role'a
// açık; onay edge function üzerinden geçiyor ve orada da yalnız laba açıkça
// 'demo' POS tanımlıysa kabul ediliyor. Gerçek sağlayıcıda onayın tek kaynağı
// imzası doğrulanmış payments-callback'tir.
export async function confirmPayment(intentId: string, providerRef?: string, token?: string) {
  const { data, error } = await supabase.functions.invoke('payments-charge', {
    body: {
      action:       'confirm',
      intent_id:    intentId,
      public_token: token,
      provider_ref: providerRef ?? null,
    },
  });
  if (error)          return { paymentId: null, error };
  if (!data?.ok)      return { paymentId: null, error: new Error(data?.error ?? 'Onaylanamadı') };
  return { paymentId: intentId, error: null };
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

  const provider = await getActivePaymentProvider();
  return provider.query(ref);
}

// ─── İade ────────────────────────────────────────────────────────────────
export async function refundIntent(intentId: string, amount?: number): Promise<RefundResult> {
  // GÜVENLİK: iade İSTEMCİDEN yapılmaz. Eskiden burada provider.refund()
  // çağrılıyordu; gerçek POS'ta bu, sağlayıcı anahtarını tarayıcıya taşımak
  // ve iade kararını istemciye bırakmak demekti. Artık tek yol edge function:
  // yetkiyi (manage_finance) ve lab sahipliğini o doğrular, önce sağlayıcıya
  // iade eder, ANCAK ONAY GELİRSE faturayı geri açar.
  const { data, error } = await supabase.functions.invoke('payments-charge', {
    body: { action: 'refund', intent_id: intentId, amount },
  });
  if (error) return { ok: false, error: error.message ?? 'İade başarısız' };
  const r: any = data ?? {};
  if (!r.ok) return { ok: false, error: r.error ?? 'İade başarısız' };
  const row = Array.isArray(r.result) ? r.result[0] : r.result;
  return {
    ok: true,
    refunded_amount: Number(r.refunded) || undefined,
    status: row?.fully_refunded === false ? 'partially_refunded' : 'refunded',
    raw_response: r,
  };
}

// ─── Taksit seçenekleri ──────────────────────────────────────────────────
export async function getInstallments(binNumber: string, amount: number): Promise<InstallmentOption[]> {
  const provider = await getActivePaymentProvider();
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
