/**
 * MoneyMultiX — KATI per-currency para gösterimi (ERP standardı).
 *
 * Kural: farklı para birimleri ASLA toplanmaz, base'e ÇEVRİLMEZ, "≈ ₺" gösterilmez.
 * Her para birimi kendi orijinal tutarında, ayrı kart / satır / chip olarak yan yana.
 * Tüm yeni finans ekranları (Kasa, Cari, Faturalar, Raporlar, Dashboard) bunu kullanır.
 *
 * Veri: `groupByCurrency()` / `groupAmountFields()` (core/money/aggregations) → CurrencyTotal[].
 *
 * Kullanım:
 *   const slices = groupAmountFields(payments);     // [{currency,total,count}, ...]
 *   <MoneyMultiX slices={slices} variant="cards" label="Toplam Tahsilat" accentColor={accent} />
 *
 * Varyantlar:
 *   • cards  — yan yana mini kartlar (dashboard / hero)
 *   • rows   — alt alta satırlar (rapor / liste özetleri)
 *   • inline — kompakt chip şeridi  "₺125K · €18,5K · $4,2K" (dar alan / liste satırı)
 */

import React from 'react';
import { View, Text, Platform, TextStyle } from 'react-native';
import { formatMoney, formatNumber, CURRENCY_META, type Currency } from './currency';
import type { CurrencyTotal } from './aggregations';
import { useInkUI, type InkUI } from '../theme/inkScale';

const DISPLAY_FONT =
  Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';

const DANGER = '#D94B4B';
const SUCCESS = '#2D9A6B';

type Variant = 'cards' | 'rows' | 'inline';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  /** groupByCurrency / groupAmountFields çıktısı. */
  slices: CurrencyTotal[];
  variant?: Variant;
  /** Üst etiket (UPPERCASE micro) — opsiyonel. */
  label?: string;
  /** Panel accent rengi (chip/sayaç tonları). Verilmezse nötr. */
  accentColor?: string;
  /** Sayı boyutu. */
  size?: Size;
  /** Pozitif/negatife göre renk (cari bakiye: + yeşil, − kırmızı). */
  colorBySign?: boolean;
  /** Pozitifte +' işareti. */
  signed?: boolean;
  fractionDigits?: number;
  /** İşlem adedini göster (rows/cards). */
  showCount?: boolean;
  /** Slices boşsa gösterilecek metin. */
  emptyText?: string;
  style?: any;
  numberStyle?: TextStyle;
}

const NUM_SIZE: Record<Size, number> = { sm: 18, md: 24, lg: 32 };

function toneFor(U: InkUI, total: number, colorBySign?: boolean): string {
  if (!colorBySign) return U.ink[900];
  if (total > 0) return SUCCESS;
  if (total < 0) return DANGER;
  return U.ink[700];
}

export function MoneyMultiX({
  slices,
  variant = 'cards',
  label,
  accentColor,
  size = 'md',
  colorBySign = false,
  signed = false,
  fractionDigits = 0,
  showCount = false,
  emptyText = '—',
  style,
  numberStyle,
}: Props) {
  const U = useInkUI();
  const accent = accentColor ?? U.ink[700];

  // ── Boş durum ──
  if (!slices || slices.length === 0) {
    return (
      <View style={style}>
        {label ? <SectionLabel label={label} /> : null}
        <Text style={{ fontFamily: DISPLAY_FONT, fontWeight: '300', fontSize: NUM_SIZE[size], color: U.ink[400] }}>
          {emptyText}
        </Text>
      </View>
    );
  }

  // ── inline: kompakt chip şeridi ──
  if (variant === 'inline') {
    return (
      <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }, style]}>
        {slices.map(s => (
          <View
            key={s.currency}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999,
              backgroundColor: U.chipNeutral,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: U.ink[500] }}>
              {CURRENCY_META[s.currency].symbol}
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: toneFor(U, s.total, colorBySign) }}>
              {formatCompact(s.total, signed)}
            </Text>
            {showCount ? <Text style={{ fontSize: 9, color: U.ink[400] }}>· {s.count}</Text> : null}
          </View>
        ))}
      </View>
    );
  }

  // ── rows: alt alta satırlar ──
  if (variant === 'rows') {
    return (
      <View style={[{ gap: 8 }, style]}>
        {label ? <SectionLabel label={label} count={slices.length} accent={accent} /> : null}
        {slices.map(s => (
          <View key={s.currency} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <CurrencyBadge currency={s.currency} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700] }}>
                {CURRENCY_META[s.currency].label}
              </Text>
              {showCount ? (
                <Text style={{ fontSize: 10, color: U.ink[400], marginTop: 1 }}>{s.count} işlem</Text>
              ) : null}
            </View>
            <Text style={[{ fontFamily: DISPLAY_FONT, fontWeight: '300', fontSize: NUM_SIZE[size === 'lg' ? 'md' : size], letterSpacing: -0.4, color: toneFor(U, s.total, colorBySign) }, numberStyle]}>
              {formatMoney(s.total, s.currency, { fractionDigits, signed })}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  // ── cards: yan yana mini kartlar (varsayılan) ──
  return (
    <View style={style}>
      {label ? <SectionLabel label={label} count={slices.length} accent={accent} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: label ? 8 : 0 }}>
        {slices.map(s => (
          <View
            key={s.currency}
            style={{
              minWidth: 104, flexGrow: 1,
              paddingHorizontal: 12, paddingVertical: 10,
              borderRadius: 14, backgroundColor: U.surface,
              borderWidth: 1, borderColor: U.hairline,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: U.ink[500] }}>
                  {CURRENCY_META[s.currency].symbol}
                </Text>
                <Text style={{ fontSize: 10, fontWeight: '700', color: U.ink[400], letterSpacing: 0.5 }}>
                  {s.currency}
                </Text>
              </View>
              {showCount ? (
                <Text style={{ fontSize: 9, fontWeight: '600', color: accent }}>{s.count}</Text>
              ) : null}
            </View>
            <Text
              numberOfLines={1}
              style={[{ fontFamily: DISPLAY_FONT, fontWeight: '300', fontSize: NUM_SIZE[size], letterSpacing: -0.6, color: toneFor(U, s.total, colorBySign) }, numberStyle]}
            >
              {formatMoney(s.total, s.currency, { fractionDigits, signed })}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Parçalar ────────────────────────────────────────────────────────────────

function SectionLabel({ label, count, accent }: { label: string; count?: number; accent?: string }) {
  const U = useInkUI();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: U.ink[400], letterSpacing: 1, textTransform: 'uppercase' }}>
        {label}
      </Text>
      {count && count > 1 ? (
        <Text style={{ fontSize: 10, fontWeight: '600', color: accent ?? U.ink[500] }}>
          {count} para birimi
        </Text>
      ) : null}
    </View>
  );
}

function CurrencyBadge({ currency }: { currency: Currency }) {
  const U = useInkUI();
  return (
    <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipNeutral }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: U.ink[500] }}>
        {CURRENCY_META[currency].symbol}
      </Text>
    </View>
  );
}

/** "1.250.000" → "1,3M" · "18.500" → "18,5K" (kompakt, inline chip için). */
function formatCompact(n: number, signed?: boolean): string {
  const sign = n < 0 ? '-' : (signed && n > 0 ? '+' : '');
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return sign + formatNumber(abs / 1_000_000, 1) + 'M';
  if (abs >= 1_000)     return sign + formatNumber(abs / 1_000, 1) + 'K';
  return sign + formatNumber(abs, 0);
}

export default MoneyMultiX;
