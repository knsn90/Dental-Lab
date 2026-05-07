/**
 * CurrencyBreakdown — para birimi dağılımı popup/inline gösterimi.
 *
 * 3 mod:
 *   • inline:  küçük chip'ler "₺ 120K · € 5K · $ 800"
 *   • compact: tek satır toplam + tıklayınca detay popup
 *   • full:    expanded liste (her currency için satır)
 *
 * Kullanım:
 *   const summary = sumByCurrency(expenses, mapAmountFields);
 *   <CurrencyBreakdown summary={summary} mode="compact" baseCurrency="TRY" />
 */

import React, { useState } from 'react';
import { View, Text, Pressable, Platform, Modal, TextStyle } from 'react-native';
import { ChevronDown, ChevronUp, Globe } from 'lucide-react-native';
import { formatMoney, type Currency, CURRENCY_META } from './currency';
import type { MoneySummary } from './aggregations';

interface Props {
  summary: MoneySummary;
  baseCurrency: Currency;
  mode?: 'inline' | 'compact' | 'full';
  accentColor?: string;
  /** Başlık (full mode için). */
  title?: string;
  /** "Toplam" yerine farklı bir kelime (örn. "Gider", "Gelir") */
  label?: string;
  style?: any;
  numberStyle?: TextStyle;
}

export function CurrencyBreakdown({
  summary,
  baseCurrency,
  mode = 'compact',
  accentColor = '#0A0A0A',
  title,
  label = 'Toplam',
  style,
  numberStyle,
}: Props) {
  const [popupOpen, setPopupOpen] = useState(false);
  const DisplayFont = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';

  // ── Inline mode: küçük chip strip ──
  if (mode === 'inline') {
    return (
      <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }, style]}>
        {summary.slices.map(s => (
          <View key={s.currency} style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999,
            backgroundColor: 'rgba(0,0,0,0.04)',
          }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#6B6B6B' }}>{CURRENCY_META[s.currency].symbol}</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#0A0A0A' }}>
              {formatCompact(s.total)}
            </Text>
            <Text style={{ fontSize: 9, color: '#9A9A9A' }}>· {s.count}</Text>
          </View>
        ))}
      </View>
    );
  }

  // ── Compact mode: toplam + popup tetik ──
  if (mode === 'compact') {
    const trigger = (
      <Pressable
        onPress={() => summary.multiCurrency && setPopupOpen(true)}
        disabled={!summary.multiCurrency}
        style={[
          { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
          summary.multiCurrency && Platform.OS === 'web' ? { cursor: 'pointer' as any } : {},
          style,
        ]}
      >
        <Text style={[{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 28, letterSpacing: -0.8, color: '#0A0A0A' }, numberStyle]}>
          {formatMoney(summary.totalBase, baseCurrency, { fractionDigits: 0 })}
        </Text>
        {summary.multiCurrency ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9999, backgroundColor: accentColor + '14' }}>
            <Globe size={9} color={accentColor} strokeWidth={1.8} />
            <Text style={{ fontSize: 10, fontWeight: '600', color: accentColor }}>
              {summary.slices.length}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );

    return (
      <>
        {trigger}
        <BreakdownModal
          visible={popupOpen}
          onClose={() => setPopupOpen(false)}
          summary={summary}
          baseCurrency={baseCurrency}
          accentColor={accentColor}
          title={title ?? label}
        />
      </>
    );
  }

  // ── Full mode: tüm slices listesi ──
  return (
    <View style={[{ gap: 10 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: '#9A9A9A', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
        {summary.multiCurrency ? (
          <Text style={{ fontSize: 10, color: accentColor, fontWeight: '600' }}>
            {summary.slices.length} para birimi
          </Text>
        ) : null}
      </View>
      <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 32, letterSpacing: -1, color: '#0A0A0A', lineHeight: 38 }}>
        {formatMoney(summary.totalBase, baseCurrency, { fractionDigits: 0 })}
      </Text>
      {summary.multiCurrency && (
        <View style={{ gap: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)' }}>
          {summary.slices.map(s => (
            <BreakdownRow key={s.currency} slice={s} baseCurrency={baseCurrency} />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Breakdown row ───────────────────────────────────────────────────────────

function BreakdownRow({ slice, baseCurrency }: { slice: any; baseCurrency: Currency }) {
  const m = CURRENCY_META[slice.currency as Currency];
  const isBase = slice.currency === baseCurrency;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)' }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6B6B6B' }}>{m.symbol}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: '500', color: '#2C2C2C' }}>{slice.currency} · {slice.count} işlem</Text>
        {!isBase ? (
          <Text style={{ fontSize: 10, color: '#9A9A9A', marginTop: 1 }}>
            ≈ {formatMoney(slice.totalBase, baseCurrency, { fractionDigits: 0 })}
          </Text>
        ) : null}
      </View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#0A0A0A' }}>
        {formatMoney(slice.total, slice.currency as Currency, { fractionDigits: 0 })}
      </Text>
    </View>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function BreakdownModal({
  visible, onClose, summary, baseCurrency, accentColor, title,
}: {
  visible: boolean;
  onClose: () => void;
  summary: MoneySummary;
  baseCurrency: Currency;
  accentColor: string;
  title: string;
}) {
  const DisplayFont = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: '#FFFFFF', borderRadius: 18, width: 380, maxWidth: '100%',
            padding: 20, gap: 14,
            ...(Platform.OS === 'web' ? { boxShadow: '0 16px 48px rgba(0,0,0,0.18)' } as any : {}),
          }}
        >
          {/* Header */}
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#9A9A9A', letterSpacing: 1, textTransform: 'uppercase' }}>
              {title} · Para birimi dağılımı
            </Text>
            <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 28, letterSpacing: -0.8, color: '#0A0A0A' }}>
              {formatMoney(summary.totalBase, baseCurrency, { fractionDigits: 0 })}
            </Text>
            <Text style={{ fontSize: 11, color: '#9A9A9A' }}>
              {summary.count} işlem · {summary.slices.length} para birimi
            </Text>
          </View>

          {/* Slices */}
          <View style={{ gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)' }}>
            {summary.slices.map(s => (
              <BreakdownRow key={s.currency} slice={s} baseCurrency={baseCurrency} />
            ))}
          </View>

          {/* Note */}
          <Text style={{ fontSize: 10, color: '#9A9A9A', fontStyle: 'italic' }}>
            Toplam, kayıt anındaki kur (snapshot) ile {baseCurrency} cinsinden hesaplanır.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/** "1.250.000" → "1,25M" gibi kompakt format */
function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}
