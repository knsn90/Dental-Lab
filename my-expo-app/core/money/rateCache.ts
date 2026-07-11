/**
 * rateCache — anlık (bugünün) döviz→baz kurları için senkron okunabilir cache.
 *
 *   Klinik finans ekranlarında her tutar "₺<baz> (€<döviz>)" gösterilir: döviz
 *   tutarı bugünün get_currency_rate kuruyla (manuel kayıt yoksa TCMB günün kuru)
 *   baz paraya çevrilip baz birim ANA, döviz tutarı parantez içinde yazılır.
 *
 *   • rateToBase(cur) — senkron getter (formatlayıcı M() için). Yüklenmemişse 1.
 *   • useRates()      — React hook: kurlara abone olur + gerekirse 1 kez yükler;
 *                       kurlar gelince bileşen yeniden render olur (M güncel kuru alır).
 *
 *   p_lab_id = null → lab'a özel manuel kur değil, TCMB/sistem günün kuru kullanılır
 *   (kullanıcı isteği: "anlık merkez bankası kuru"). Klinik kullanıcıların lab_id'si
 *   yoktur, bu yüzden null doğru ve yeterli.
 */
import React from 'react';
import { create } from 'zustand';
import { supabase } from '../api/supabase';
import { getBaseCurrency } from './baseCurrency';
import { SUPPORTED_CURRENCIES } from './currency';
import { ymdLocal } from '../util/dates';

interface RateState {
  rates: Record<string, number>;   // currency code → kur (1 birim döviz = X baz para)
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
}

// Eşzamanlı load() çağrıları aynı fetch'i beklesin (data fetch'leri await edebilsin).
let _inflight: Promise<void> | null = null;

export const useRateStore = create<RateState>((set, get) => ({
  rates: {},
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loaded) return;
    if (_inflight) return _inflight;
    set({ loading: true });
    _inflight = (async () => {
      const base = getBaseCurrency();
      const today = ymdLocal(); // yerel gün — UTC kayması yok
      const out: Record<string, number> = { [base]: 1 };
      try {
        await Promise.all(SUPPORTED_CURRENCIES.map(async (c) => {
          if (c === base) { out[c] = 1; return; }
          const { data } = await supabase.rpc('get_currency_rate', {
            p_lab_id: null, p_currency: c, p_base_currency: base, p_at_date: today,
          });
          // Kur bulunamadıysa rates'e HİÇ yazma → rateToBaseOrNull null döner,
          // rateToBase uyarı loglayıp 1'e düşer (sessiz-yanlış dönüşüm yerine görünür uyarı).
          if (data != null && Number(data) > 0) {
            out[c] = Number(data);
          } else {
            console.warn(`[rateCache] ${c}→${base} kuru bulunamadı (get_currency_rate boş döndü) — bu para birimi için dönüşüm yapılamaz`);
          }
        }));
        set({ rates: out, loaded: true, loading: false });
      } catch {
        set({ loaded: true, loading: false });
      } finally {
        _inflight = null;
      }
    })();
    return _inflight;
  },
}));

/**
 * Senkron: 1 birim `cur` kaç baz para eder — kur BİLİNMİYORSA `null` döner.
 * Dönüşüm gösteren ekranlar null'ı "kur yok" olarak ele alabilir ('≈' basmak yerine).
 * (Store henüz yüklenmemişken de null döner — çağıran useRates() ile abone olmalı.)
 */
export function rateToBaseOrNull(cur?: string | null): number | null {
  const base = getBaseCurrency();
  if (!cur || cur === base) return 1;
  const r = useRateStore.getState().rates[cur];
  return r != null && r > 0 ? r : null;
}

// Aynı para birimi için uyarıyı bir kez logla (render döngülerinde spam olmasın).
const _warnedMissingRate = new Set<string>();

/**
 * Senkron: 1 birim `cur` kaç baz para eder (yüklenmemişse / bilinmiyorsa 1).
 * GERİYE UYUMLU imza — ama kur yüklendiği hâlde bulunamamışsa artık sessiz
 * kalmaz, console.warn ile uyarır. Null isteyen yeni kod rateToBaseOrNull kullansın.
 */
export function rateToBase(cur?: string | null): number {
  const r = rateToBaseOrNull(cur);
  if (r != null) return r;
  // Yüklenme tamamlandıysa ve hâlâ kur yoksa → gerçekten tanımsız kur, uyar.
  if (useRateStore.getState().loaded && cur && !_warnedMissingRate.has(cur)) {
    _warnedMissingRate.add(cur);
    console.warn(`[rateCache] ${cur} için kur tanımsız — 1 varsayılıyor, baza çevrilen tutarlar YANLIŞ olabilir. Ayarlar → Döviz Kurları'ndan kur ekleyin.`);
  }
  return 1;
}

/** Bileşeni kurlara abone eder + gerekirse bir kez yükler. */
export function useRates(): Record<string, number> {
  const rates   = useRateStore(s => s.rates);
  const loaded  = useRateStore(s => s.loaded);
  const loading = useRateStore(s => s.loading);
  const load    = useRateStore(s => s.load);
  React.useEffect(() => {
    if (!loaded && !loading) void load();
  }, [loaded, loading, load]);
  return rates;
}
