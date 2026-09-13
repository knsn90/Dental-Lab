/**
 * MoneyInput — para birimi seçici + sayı input.
 *
 * Patterns design:
 *   [ 1,250.00      ] [EUR ▾]
 *                     ≈ 47.500 ₺ (kur 38.0)
 *
 * Props:
 *   - value, onChange(amount, currency): controlled
 *   - currency, onCurrencyChange (opsiyonel): currency dışarıdan kontrollü
 *   - showBasePreview: TRY karşılığı dipnot göster (default true)
 *   - accentColor: panel rengi
 */

import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Platform, Modal } from 'react-native';
import { ChevronDown, Check } from '../ui/icons';
import { Currency, CURRENCY_META, SUPPORTED_CURRENCIES, useExchangeRate, useBaseCurrency, formatMoney } from './currency';

interface Props {
  value: string;                                                // string for controlled input
  onChangeValue: (v: string) => void;
  currency: Currency;
  onChangeCurrency: (c: Currency) => void;
  /** Override base currency (default: lab settings) */
  baseCurrency?: Currency;
  /** Effective date for rate lookup (default: today) */
  rateDate?: string | Date;
  /** Show base-currency conversion preview below */
  showBasePreview?: boolean;
  accentColor?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function MoneyInput({
  value,
  onChangeValue,
  currency,
  onChangeCurrency,
  baseCurrency,
  rateDate,
  showBasePreview = true,
  accentColor = '#0A0A0A',
  placeholder = '0,00',
  disabled = false,
  autoFocus = false,
}: Props) {
  const labBase = useBaseCurrency();
  const base = baseCurrency ?? labBase;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  const { rate, loading } = useExchangeRate(currency, base, rateDate);
  const numericValue = parseFloat(value.replace(',', '.'));
  const isValid = !isNaN(numericValue) && numericValue > 0;
  const baseAmount = isValid && rate != null ? numericValue * rate : null;

  const meta = CURRENCY_META[currency];

  return (
    <View>
      {/* Input row */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: focused ? accentColor : 'rgba(0,0,0,0.08)',
        height: 46,
        overflow: 'hidden',
      }}>
        {/* Amount input */}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 6 }}>
          <Text style={{ fontSize: 15, color: '#9A9A9A', fontWeight: '500' }}>{meta.symbol}</Text>
          <TextInput
            value={value}
            onChangeText={(t) => {
              // Sadece sayı + tek nokta/virgül kabul et
              const cleaned = t.replace(/[^\d.,]/g, '').replace(',', '.');
              const parts = cleaned.split('.');
              const final = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
              onChangeValue(final);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            placeholderTextColor="#9A9A9A"
            keyboardType="decimal-pad"
            editable={!disabled}
            autoFocus={autoFocus}
            style={{
              flex: 1, fontSize: 15, color: '#0A0A0A', fontWeight: '500',
              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
            }}
          />
        </View>

        {/* Currency picker button */}
        <Pressable
          onPress={() => !disabled && setPickerOpen(true)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 12, height: '100%',
            borderStartWidth: 1, borderStartColor: 'rgba(0,0,0,0.06)',
            backgroundColor: 'rgba(0,0,0,0.02)',
            ...(Platform.OS === 'web' ? { cursor: disabled ? 'not-allowed' : 'pointer' } as any : {}),
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#0A0A0A', letterSpacing: 0.4 }}>
            {currency}
          </Text>
          <ChevronDown size={12} color="#6B6B6B" strokeWidth={1.8} />
        </Pressable>
      </View>

      {/* Base conversion preview */}
      {showBasePreview && currency !== base && (
        <Text style={{ fontSize: 11, color: '#9A9A9A', marginTop: 6, marginStart: 14 }}>
          {loading
            ? 'Kur yükleniyor…'
            : rate == null
              ? <Text style={{ color: '#D97706' }}>⚠ Kur tanımlı değil — Ayarlar → Kurlar</Text>
              : baseAmount != null
                ? `≈ ${formatMoney(baseAmount, base, { fractionDigits: 0 })}  ·  1 ${currency} = ${rate.toFixed(2)} ${base}`
                : `1 ${currency} = ${rate.toFixed(2)} ${base}`
          }
        </Text>
      )}

      {/* Currency picker modal */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable
          onPress={() => setPickerOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 18,
              padding: 8,
              width: 280,
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.05)',
              ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0,0,0,0.16)' } as any : {}),
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#9A9A9A', letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
              Para birimi
            </Text>
            {SUPPORTED_CURRENCIES.map(c => {
              const m = CURRENCY_META[c];
              const active = c === currency;
              return (
                <Pressable
                  key={c}
                  onPress={() => { onChangeCurrency(c); setPickerOpen(false); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingHorizontal: 14, paddingVertical: 11,
                    borderRadius: 11,
                    backgroundColor: active ? accentColor + '14' : 'transparent',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  {/* Code chip (flag yerine harf rozeti) */}
                  <View style={{
                    width: 32, height: 32, borderRadius: 16,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: active ? accentColor + '22' : 'rgba(0,0,0,0.04)',
                    borderWidth: 1, borderColor: active ? accentColor + '33' : 'rgba(0,0,0,0.05)',
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: active ? accentColor : '#6B6B6B', letterSpacing: 0.3 }}>{m.symbol}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: active ? accentColor : '#0A0A0A', letterSpacing: 0.3 }}>{m.code}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>{m.label}</Text>
                  </View>
                  {active && <Check size={16} color={accentColor} strokeWidth={2} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
