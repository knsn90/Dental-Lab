/**
 * MoneyDisplay — para birimi gösterimi.
 *
 * Modlar:
 *   1. "original" : sadece orijinal currency  → "1.250,00 €"
 *   2. "base"     : sadece base currency      → "47.500 ₺"
 *   3. "both"     : ikisi birden               → "1.250,00 €  ·  ≈ 47.500 ₺"
 *
 * Snapshot kullanıyorsa (baseAmount prop verilmişse) o değer kullanılır,
 * aksi halde live conversion yapar.
 */

import React from 'react';
import { Text, TextStyle } from 'react-native';
import { Currency, formatMoney, useExchangeRate, useBaseCurrency } from './currency';

interface Props {
  amount: number | null | undefined;
  currency: Currency;
  /** Snapshot edilmiş base amount — verilirse kur yeniden hesaplanmaz */
  baseAmount?: number | null;
  /** Lab base currency override */
  baseCurrency?: Currency;
  /** Display mode (default: both if currency !== base, else original) */
  mode?: 'original' | 'base' | 'both';
  /** Conversion rate date (default: today) */
  rateDate?: string | Date;
  fractionDigits?: number;
  style?: TextStyle;
  baseStyle?: TextStyle;
  signed?: boolean;
  /** Eksi değerler için kırmızı renk */
  expense?: boolean;
}

export function MoneyDisplay({
  amount,
  currency,
  baseAmount,
  baseCurrency,
  mode,
  rateDate,
  fractionDigits = 2,
  style,
  baseStyle,
  signed,
  expense,
}: Props) {
  const labBase = useBaseCurrency();
  const base = baseCurrency ?? labBase;
  const effectiveMode = mode ?? (currency === base ? 'original' : 'both');

  // Live rate fallback (sadece baseAmount yoksa kullanılır)
  const needsLive = effectiveMode !== 'original' && baseAmount == null && currency !== base;
  const { rate } = useExchangeRate(needsLive ? currency : null, base, rateDate);

  if (amount == null || isNaN(amount)) {
    return <Text style={style}>—</Text>;
  }

  // ── Resolve base amount ──
  let resolvedBase = baseAmount;
  if (resolvedBase == null) {
    if (currency === base) resolvedBase = amount;
    else if (rate != null) resolvedBase = amount * rate;
  }

  const expenseColor = expense && amount > 0 ? { color: '#9C2E2E' } : undefined;
  const merged = { ...style, ...expenseColor };

  // ── Render ──
  const originalText = formatMoney(amount, currency, { fractionDigits, signed });
  const baseText = resolvedBase != null
    ? formatMoney(resolvedBase, base, { fractionDigits: 0, signed })
    : null;

  if (effectiveMode === 'original') {
    return <Text style={merged}>{originalText}</Text>;
  }
  if (effectiveMode === 'base') {
    return <Text style={merged}>{baseText ?? '—'}</Text>;
  }
  // both
  return (
    <Text style={merged}>
      {originalText}
      {baseText && currency !== base ? (
        <Text style={[{ fontSize: 11, fontWeight: '400', color: '#9A9A9A' }, baseStyle]}>
          {'  ·  ≈ '}{baseText}
        </Text>
      ) : null}
    </Text>
  );
}
