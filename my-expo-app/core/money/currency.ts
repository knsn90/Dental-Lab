/**
 * Çoklu para birimi (Multi-currency) — core helpers.
 *
 * Mimari:
 *   • Base currency = lab_settings.default_currency (genelde TRY)
 *   • currency_rates tablosu: tarih bazlı kur geçmişi
 *   • Snapshot yaklaşımı: movement girişinde günün kuru DONDURULUR
 *     ve satırda saklanır. Geçmiş kayıtlar kur dalgalanmasından
 *     etkilenmez.
 *
 * Kullanım:
 *   import { formatMoney, toBase, useExchangeRate, useBaseCurrency } from 'core/money/currency';
 *   formatMoney(1250, 'EUR')          → "€1.250,00"
 *   await toBase(1250, 'EUR', 'TRY')  → 47500
 */

import { useEffect, useState } from 'react';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/authStore';

// ─── Types ───────────────────────────────────────────────────────────────────

export type Currency = 'TRY' | 'EUR' | 'USD' | 'GBP' | 'IRT';

export const SUPPORTED_CURRENCIES: Currency[] = ['TRY', 'EUR', 'USD', 'GBP', 'IRT'];

export interface CurrencyMeta {
  code: Currency;
  symbol: string;
  label: string;
  /** Ondalık ayraç format (Türkçe locale'i Intl handles automatic) */
  flag?: string;
  /**
   * Varsayılan ondalık hane. Tümen tutarları milyonlarla ifade edilir
   * (bir kron ~5.000.000 تومان) — orada kuruş göstermek hem anlamsız hem
   * okunmaz. Verilmezse 2 kabul edilir.
   */
  fractionDigits?: number;
}

export const CURRENCY_META: Record<Currency, CurrencyMeta> = {
  TRY: { code: 'TRY', symbol: '₺', label: 'Türk Lirası', flag: '🇹🇷' },
  EUR: { code: 'EUR', symbol: '€', label: 'Euro',         flag: '🇪🇺' },
  USD: { code: 'USD', symbol: '$', label: 'ABD Doları',   flag: '🇺🇸' },
  GBP: { code: 'GBP', symbol: '£', label: 'İngiliz Sterlini', flag: '🇬🇧' },
  // Tümen — ISO 4217'de yok (resmî birim Riyal/IRR, 1 تومان = 10 ریال) ama
  // İran'da fiyatlar günlük hayatta Tümen'le konuşulur. `IRT` Tümen için
  // fiilî standart koddur; IRR yazıp Tümen değeri saklamak dışa aktarımda
  // 10× hataya yol açardı.
  IRT: { code: 'IRT', symbol: 'تومان', label: 'İran Tümeni', flag: '🇮🇷', fractionDigits: 0 },
};

export interface ExchangeRate {
  currency: Currency;
  baseCurrency: Currency;
  rate: number;          // 1 currency = rate * baseCurrency
  effectiveDate: string; // YYYY-MM-DD
  source: 'manual' | 'tcmb' | 'api' | 'system';
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/**
 * Para birimini Türkçe locale ile formatla.
 *   formatMoney(1250.5, 'EUR')          → "1.250,50 €"
 *   formatMoney(1250.5, 'TRY', { fractionDigits: 0 }) → "1.251 ₺"
 */
export function formatMoney(
  amount: number | null | undefined,
  currency: Currency = 'TRY',
  opts: { fractionDigits?: number; signed?: boolean } = {},
): string {
  if (amount == null || isNaN(amount)) return '—';
  const fd = opts.fractionDigits ?? CURRENCY_META[currency]?.fractionDigits ?? 2;
  const sym = CURRENCY_META[currency]?.symbol ?? currency;
  // Math.abs: işaret yalnız `sign`den gelir — Intl'in kendi eksisiyle çift '-' basma
  const numStr = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: fd,
    maximumFractionDigits: fd,
  }).format(Math.abs(Number(amount) || 0));
  const sign = (amount < 0 ? '-' : opts.signed && amount > 0 ? '+' : '');
  // TRY: sembol önde (₺1.250), diğerleri: arkada (1.250 €)
  const out = currency === 'TRY' ? `${sign}${sym}${numStr}` : `${sign}${numStr} ${sym}`;
  return out;
}

/** Sadece sayı kısmı, sembolsüz. */
export function formatNumber(amount: number | null | undefined, fractionDigits = 2): string {
  if (amount == null || isNaN(amount)) return '—';
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

// ─── Conversion ──────────────────────────────────────────────────────────────

/**
 * Fetch effective rate for a currency on a given date.
 * Returns 1 if currency === base (no conversion needed).
 *
 * RPC: public.get_currency_rate(p_lab_id, p_currency, p_base_currency, p_at_date)
 */
export async function getRate(
  fromCurrency: Currency,
  toBaseCurrency: Currency = 'TRY',
  atDate?: string | Date,
  labId?: string | null,
): Promise<number | null> {
  if (fromCurrency === toBaseCurrency) return 1;

  const dateStr = atDate
    ? (typeof atDate === 'string' ? atDate : atDate.toISOString().slice(0, 10))
    : new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('get_currency_rate', {
    p_lab_id: labId ?? null,
    p_currency: fromCurrency,
    p_base_currency: toBaseCurrency,
    p_at_date: dateStr,
  });

  if (error || data == null) return null;
  return Number(data);
}

/**
 * Convert amount from `fromCurrency` to base currency.
 * Returns null if rate not found.
 */
export async function toBase(
  amount: number,
  fromCurrency: Currency,
  baseCurrency: Currency = 'TRY',
  atDate?: string | Date,
  labId?: string | null,
): Promise<number | null> {
  const rate = await getRate(fromCurrency, baseCurrency, atDate, labId);
  if (rate == null) return null;
  return amount * rate;
}

/**
 * Convert from base currency back to display currency.
 */
export async function fromBase(
  amountInBase: number,
  toCurrency: Currency,
  baseCurrency: Currency = 'TRY',
  atDate?: string | Date,
  labId?: string | null,
): Promise<number | null> {
  const rate = await getRate(toCurrency, baseCurrency, atDate, labId);
  if (rate == null || rate === 0) return null;
  return amountInBase / rate;
}

/** Synchronous conversion using a known rate. */
export function applyRate(amount: number, rate: number): number {
  return amount * rate;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** Lab'ın base currency'sini döner (lab_settings.default_currency). */
export function useBaseCurrency(): Currency {
  const profile = useAuthStore(s => s.profile);
  const labId = (profile as any)?.lab_id ?? null;
  const [base, setBase] = useState<Currency>('TRY');

  useEffect(() => {
    if (!labId) return;
    (async () => {
      const { data } = await supabase
        .from('lab_settings')
        .select('default_currency')
        .eq('lab_id', labId)
        .single();
      const c = (data as any)?.default_currency as Currency | undefined;
      if (c && SUPPORTED_CURRENCIES.includes(c)) setBase(c);
    })();
  }, [labId]);

  return base;
}

/** Belirli bir kur değerini hook'la getir (loading state ile). */
export function useExchangeRate(
  currency: Currency | null | undefined,
  baseCurrency: Currency = 'TRY',
  atDate?: string | Date,
): { rate: number | null; loading: boolean; refetch: () => void } {
  const profile = useAuthStore(s => s.profile);
  const labId = (profile as any)?.lab_id ?? null;
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const dateKey = atDate
    ? (typeof atDate === 'string' ? atDate : atDate.toISOString().slice(0, 10))
    : new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!currency) { setRate(null); return; }
    if (currency === baseCurrency) { setRate(1); return; }
    let cancelled = false;
    setLoading(true);
    getRate(currency, baseCurrency, dateKey, labId).then(r => {
      if (!cancelled) {
        setRate(r);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [currency, baseCurrency, dateKey, labId, tick]);

  return { rate, loading, refetch: () => setTick(t => t + 1) };
}

// ─── Rate management (CRUD) ──────────────────────────────────────────────────

/**
 * Manuel kur girişi.
 * UPSERT: aynı (lab_id, currency, base_currency, effective_date) zaten varsa
 * günceller.
 */
export async function upsertRate(input: {
  labId: string | null;
  currency: Currency;
  baseCurrency: Currency;
  rate: number;
  effectiveDate: string;          // YYYY-MM-DD
  source?: 'manual' | 'tcmb' | 'api';
  notes?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (input.currency === input.baseCurrency) {
    return { ok: false, error: 'Aynı para birimi için kur girilemez' };
  }
  if (input.rate <= 0) {
    return { ok: false, error: 'Kur değeri pozitif olmalı' };
  }
  const { error } = await supabase
    .from('currency_rates')
    .upsert(
      {
        lab_id: input.labId,
        currency: input.currency,
        base_currency: input.baseCurrency,
        rate: input.rate,
        effective_date: input.effectiveDate,
        source: input.source ?? 'manual',
        notes: input.notes ?? null,
      },
      { onConflict: 'lab_id,currency,base_currency,effective_date' },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Lab için tüm kur geçmişini getir (en yeni → eski). */
export async function listRates(
  labId: string | null,
  baseCurrency: Currency = 'TRY',
  limit = 100,
): Promise<ExchangeRate[]> {
  let q = supabase
    .from('currency_rates')
    .select('currency, base_currency, rate, effective_date, source')
    .eq('base_currency', baseCurrency)
    .order('effective_date', { ascending: false })
    .limit(limit);
  if (labId) {
    q = q.or(`lab_id.eq.${labId},lab_id.is.null`);
  } else {
    q = q.is('lab_id', null);
  }
  const { data, error } = await q;
  if (error) return [];
  return ((data ?? []) as any[]).map(r => ({
    currency: r.currency,
    baseCurrency: r.base_currency,
    rate: Number(r.rate),
    effectiveDate: r.effective_date,
    source: r.source,
  }));
}

/**
 * TCMB'den günlük kur çek.
 * TCMB resmi RSS: https://www.tcmb.gov.tr/kurlar/today.xml
 *
 * NOT: CORS sorunlu olduğu için bunu edge function ile yapmak gerekir.
 * Bu fonksiyon edge function'ı çağırır (henüz deploy edilmemişse fallback).
 */
export async function fetchRatesFromTCMB(): Promise<{
  ok: boolean;
  rates?: { currency: Currency; rate: number }[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('tcmb-rates');
    if (error) return { ok: false, error: error.message };
    if (!data?.rates) return { ok: false, error: 'Boş yanıt' };
    return { ok: true, rates: data.rates };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'TCMB bağlantı hatası' };
  }
}

// ─── Snapshot helper (Phase 3) ───────────────────────────────────────────────

/**
 * Kayıt anı için kur snapshot bilgisi getir.
 * Frontend bunu kayıt INSERT'ünden önce çağırıp `amount_base` hesaplar.
 *
 * Kullanım:
 *   const snap = await getSnapshotRate('EUR', labId);
 *   if (!snap.ok) return alert(snap.error);
 *   const baseAmount = amount * snap.rate;
 *   await supabase.from('expenses').insert({
 *     amount, currency: 'EUR',
 *     rate_at_time: snap.rate,
 *     amount_base: baseAmount,
 *     base_currency_at_time: snap.baseCurrency,
 *   });
 */
export async function getSnapshotRate(
  currency: Currency,
  labId: string | null,
  atDate?: string | Date,
): Promise<
  | { ok: true; rate: number; baseCurrency: Currency }
  | { ok: false; error: string; baseCurrency: Currency }
> {
  const dateStr = atDate
    ? (typeof atDate === 'string' ? atDate : atDate.toISOString().slice(0, 10))
    : new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('get_snapshot_rate', {
    p_lab_id: labId,
    p_currency: currency,
    p_at_date: dateStr,
  });

  if (error) return { ok: false, error: error.message, baseCurrency: 'TRY' };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: 'Snapshot alınamadı', baseCurrency: 'TRY' };

  const base = (row.base_currency ?? 'TRY') as Currency;
  if (row.rate == null) {
    return {
      ok: false,
      error: `${currency} → ${base} kuru tanımlı değil. Ayarlar → Döviz Kurları'ndan ekleyin.`,
      baseCurrency: base,
    };
  }

  return { ok: true, rate: Number(row.rate), baseCurrency: base };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Money değerini orijinal currency + base currency dipnotuyla göster.
 *   "1.250,00 € (≈ 47.500 ₺)"
 */
export function formatMoneyWithBase(
  amount: number,
  currency: Currency,
  baseAmount: number | null,
  baseCurrency: Currency,
): string {
  const main = formatMoney(amount, currency);
  if (currency === baseCurrency || baseAmount == null) return main;
  return `${main} (≈ ${formatMoney(baseAmount, baseCurrency, { fractionDigits: 0 })})`;
}

/**
 * Kur + kaynağı. Ödeme ekranında "hangi kuru kullanıyorum?" sorusunu
 * görünür kılar: TCMB mi, elle mi girilmiş, yoksa yer tutucu mu.
 *
 * Neden gerekli: kur yer tutucuysa (kurulum tohumu) TL ile kapatılmış hesap
 * açık görünüyor ve kimse sebebini anlamıyordu. Artık ekran söylüyor.
 */
export function useExchangeRateInfo(
  currency: Currency | null | undefined,
  baseCurrency: Currency = 'TRY',
  atDate?: string | Date,
): { rate: number | null; source: string | null; effectiveDate: string | null; isPlaceholder: boolean; loading: boolean } {
  const profile = useAuthStore(s => s.profile);
  const labId = (profile as any)?.lab_id ?? null;
  const [state, setState] = useState<{
    rate: number | null; source: string | null; effectiveDate: string | null; isPlaceholder: boolean;
  }>({ rate: null, source: null, effectiveDate: null, isPlaceholder: false });
  const [loading, setLoading] = useState(false);

  const dateKey = atDate
    ? (typeof atDate === 'string' ? atDate : atDate.toISOString().slice(0, 10))
    : new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!currency || !labId) return;
    if (currency === baseCurrency) {
      setState({ rate: 1, source: 'same', effectiveDate: dateKey, isPlaceholder: false });
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .rpc('get_currency_rate_info', {
        p_lab_id: labId, p_currency: currency,
        p_base_currency: baseCurrency, p_at_date: dateKey,
      })
      .then(({ data }) => {
        if (cancelled) return;
        const row = Array.isArray(data) ? data[0] : data;
        setState({
          rate: row?.rate != null ? Number(row.rate) : null,
          source: row?.source ?? null,
          effectiveDate: row?.effective_date ?? null,
          isPlaceholder: !!row?.is_placeholder,
        });
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [currency, baseCurrency, dateKey, labId]);

  return { ...state, loading };
}
