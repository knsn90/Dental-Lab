// InvoiceDiscountField — "Fatura indirimi" (fatura altı indirim) alanı: Yüzde/Tutar + değer.
//
// Değer ham metin olarak taşınır ("7,5", "1.250,50"); doğrulama çağıranda
// validateInvoiceDiscount (lib/invoiceDiscount) ile yapılır, hata buraya `error` ile gelir
// ve alanın hemen altında görünür. Alan boş açılır; boş = indirim yok.
import React from 'react';
import { View, Text, Pressable, TextInput, Platform } from 'react-native';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import type { InvoiceDiscountType } from '../lib/invoiceDiscount';

export function InvoiceDiscountField({
  type, value, onChange, error, disabled, lockedHint,
}: {
  type: InvoiceDiscountType;
  value: string;
  onChange: (type: InvoiceDiscountType, value: string) => void;
  error?: string | null;
  disabled?: boolean;
  lockedHint?: string;
}) {
  const U = useInkUI();
  const web = Platform.OS === 'web' ? ({ cursor: disabled ? 'not-allowed' : 'pointer' } as any) : {};
  const kind = type ?? 'percent';

  return (
    <View style={{ opacity: disabled ? 0.6 : 1 }}>
      <Text style={{ ...U.colHeader, marginBottom: 6 }}>{autoT('Fatura indirimi')}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 4, padding: 3, backgroundColor: U.ink[100], borderRadius: 14 }}>
          {([
            { key: 'percent', label: 'Yüzde' },
            { key: 'fixed', label: 'Tutar' },
          ] as const).map(opt => {
            const active = kind === opt.key;
            return (
              <Pressable key={opt.key} disabled={disabled} onPress={() => onChange(opt.key, value)}
                accessibilityRole="button" accessibilityState={{ selected: active, disabled: !!disabled }}
                style={[{
                  paddingHorizontal: active ? 16 : 12, paddingVertical: 9, borderRadius: 11,
                  backgroundColor: active ? U.segActive : 'transparent',
                }, web]}>
                <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? U.ink[900] : U.ink[500] }}>
                  {autoT(opt.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={value}
          editable={!disabled}
          onChangeText={t => onChange(kind, t)}
          keyboardType="decimal-pad"
          placeholder={kind === 'percent' ? '%' : '0,00'}
          placeholderTextColor={U.ink[400]}
          accessibilityLabel={autoT('Fatura indirimi')}
          style={[U.inputStyle as any, { flex: 1, minWidth: 0 },
            error ? { borderColor: U.chipTones.danger.fg } : null]}
        />
      </View>
      {error ? (
        <Text style={{ marginTop: 6, fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }}>
          {autoT(error)}
        </Text>
      ) : disabled && lockedHint ? (
        <Text style={{ marginTop: 6, fontSize: 12, color: U.ink[400] }}>{lockedHint}</Text>
      ) : null}
    </View>
  );
}
