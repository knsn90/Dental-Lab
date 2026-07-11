/**
 * baseCurrency — Lab'ın baz (raporlama) para birimi için tek kaynak.
 *
 *   Finans ekranlarındaki yerel para-formatlama helper'ları sabit '₺' yerine
 *   bunu kullanır → lab default_currency neyse (EUR/USD/GBP/TRY) tüm toplam ve
 *   tek-para-birimli tutarlar o sembolle gösterilir.
 *
 *   • getBaseCurrency() / baseSymbol() — hook OLMAYAN senkron erişim (modül
 *     seviyesindeki fmtMoney helper'larında kullanılır). Store yüklenmemişse TRY.
 *   • useBaseCurrency() — React hook: store'a abone olur + boşsa load() tetikler;
 *     bileşen, ayarlar yüklenince yeniden render olur (helper'lar güncel sembolü alır).
 */
import React from 'react';
import { useLabSettingsStore } from '../store/labSettingsStore';
import { CURRENCY_META, type Currency } from './currency';

export function getBaseCurrency(): string {
  return useLabSettingsStore.getState().settings?.default_currency ?? 'TRY';
}

export function baseSymbol(): string {
  return CURRENCY_META[getBaseCurrency() as Currency]?.symbol ?? '₺';
}

/** Baz para birimine göre tutar formatla (toplam/tek-para-birimli ekranlar için). */
export function fmtBase(n: number | string | null | undefined, fractionDigits = 2): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return '—';
  return baseSymbol() + v.toLocaleString('tr-TR', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

/**
 * Bileşen, baz para birimine abone olur + (gerekirse) bir kez yükler.
 * Dönüş değeri baz para birimi kodu. Yan etki: store boşsa load() çağrılır.
 */
export function useBaseCurrency(): string {
  const code = useLabSettingsStore(s => s.settings?.default_currency ?? null);
  const loading = useLabSettingsStore(s => s.loading);
  const load = useLabSettingsStore(s => s.load);
  React.useEffect(() => {
    if (code === null && !loading) void load();
    // sadece ilk mount + code/loading değişiminde
  }, [code, loading, load]);
  return code ?? 'TRY';
}
