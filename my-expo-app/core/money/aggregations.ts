/**
 * Money aggregation helpers (Phase 4).
 *
 * Çoklu para birimi raporlamada iki temel ihtiyaç:
 *   1. Base currency'de TOPLAM (tek sayı, summary için)
 *   2. Currency breakdown (her para biriminde kaç işlem, ne kadar)
 *
 * Kullanım:
 *   const summary = sumByCurrency(expenses, e => ({
 *     amount: Number(e.amount),
 *     currency: e.currency ?? 'TRY',
 *     amountBase: Number(e.amount_base ?? e.amount),
 *   }));
 *   summary.totalBase     → 125_430 (TRY)
 *   summary.byCurrency    → { TRY: { count: 14, total: 75200 }, EUR: { count: 3, total: 1300 }, ... }
 *   summary.baseCurrency  → 'TRY'
 */

import type { Currency } from './currency';

export interface MoneyEntry {
  amount: number;
  currency: Currency;
  amountBase: number;        // snapshot base currency tutarı
}

export interface CurrencySlice {
  currency: Currency;
  count: number;
  total: number;             // orijinal currency'de toplam
  totalBase: number;         // base currency'de toplam (snapshot)
}

export interface MoneySummary {
  totalBase: number;
  count: number;
  byCurrency: Record<Currency, CurrencySlice>;
  /** Sıralı liste (en büyük totalBase önce) */
  slices: CurrencySlice[];
  /** Birden fazla para birimi var mı? */
  multiCurrency: boolean;
}

/**
 * Generic aggregator. Mapper fonksiyon her satır için MoneyEntry döner.
 */
export function sumByCurrency<T>(
  items: T[],
  mapper: (item: T) => MoneyEntry | null,
): MoneySummary {
  const byCurrency: Record<string, CurrencySlice> = {};
  let totalBase = 0;
  let count = 0;

  for (const item of items) {
    const entry = mapper(item);
    if (!entry) continue;

    const cur = entry.currency;
    if (!byCurrency[cur]) {
      byCurrency[cur] = { currency: cur, count: 0, total: 0, totalBase: 0 };
    }
    byCurrency[cur].count += 1;
    byCurrency[cur].total += entry.amount;
    byCurrency[cur].totalBase += entry.amountBase;
    totalBase += entry.amountBase;
    count += 1;
  }

  const slices = Object.values(byCurrency).sort((a, b) => b.totalBase - a.totalBase);

  return {
    totalBase,
    count,
    byCurrency: byCurrency as Record<Currency, CurrencySlice>,
    slices,
    multiCurrency: slices.length > 1,
  };
}

/**
 * Quick mapper for rows that have `amount`, `currency`, `amount_base` fields
 * (after Phase 3 migration).
 */
export function mapAmountFields(row: any): MoneyEntry | null {
  const amount = Number(row?.amount ?? 0);
  if (!amount) return null;
  const currency = (row?.currency ?? 'TRY') as Currency;
  const amountBase = Number(row?.amount_base ?? row?.amount ?? 0);
  return { amount, currency, amountBase };
}
