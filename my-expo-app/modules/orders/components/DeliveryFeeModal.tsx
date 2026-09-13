// modules/orders/components/DeliveryFeeModal.tsx
// Kurye hareketinin ücretini gir / düzelt. Masraf her zaman lab giderdir ve
// siparişin maliyetine yazılır (bkz. set_delivery_fee RPC).

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, Platform } from 'react-native';
import { X, Check } from '../../../core/ui/icons';
import { setDeliveryFee, DELIVERY_PURPOSE_LABELS, type DeliveryPurpose } from '../api';
import { useBaseCurrency, CURRENCY_META, SUPPORTED_CURRENCIES, type Currency } from '../../../core/money/currency';

interface Props {
  /** null → kapalı. Aksi halde ücreti düzenlenecek teslimat kaydı. */
  leg: { id: string; purpose?: string | null; fee_amount?: number | null; fee_currency?: string | null } | null;
  onClose: () => void;
  onSaved: () => void;
  accentColor?: string;
}

export function DeliveryFeeModal({ leg, onClose, onSaved, accentColor = '#0A0A0A' }: Props) {
  const baseCurrency = useBaseCurrency();
  const [amount, setAmount]     = useState('');
  const [currency, setCurrency] = useState<Currency>(baseCurrency);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!leg) return;
    setError(null);
    setAmount(leg.fee_amount != null ? String(leg.fee_amount).replace('.', ',') : '');
    setCurrency(((leg.fee_currency ?? baseCurrency) as Currency));
  }, [leg?.id, baseCurrency]);

  if (!leg) return null;

  const purposeLabel = DELIVERY_PURPOSE_LABELS[(leg.purpose ?? 'teslimat') as DeliveryPurpose] ?? 'Teslimat';

  async function handleSave(clear = false) {
    setError(null);
    let value: number | null = null;
    if (!clear) {
      const s = amount.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
      if (!s) { setError('Tutar gir veya "Ücreti kaldır" kullan.'); return; }
      const n = Number(s);
      if (isNaN(n) || n < 0) { setError('Geçerli bir tutar gir.'); return; }
      value = n;
    }
    setSaving(true);
    const res = await setDeliveryFee(leg!.id, value, value == null ? null : currency);
    setSaving(false);
    if (!res.ok) { setError(res.error ?? 'Kaydedilemedi'); return; }
    onSaved();
    onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Pressable
          onPress={() => { /* swallow */ }}
          style={{
            width: '100%', maxWidth: 400, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 22, gap: 16,
            ...(Platform.OS === 'web' ? { boxShadow: '0 24px 60px rgba(15,23,42,0.20)' } as any : {}),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: accentColor, letterSpacing: 1, textTransform: 'uppercase' }}>
                {purposeLabel}
              </Text>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#0A0A0A' }}>Kurye Ücreti</Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)' }}>
              <X size={14} color="#6B6B6B" />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0,00"
              keyboardType="decimal-pad"
              autoFocus
              style={{
                flex: 1, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 12,
                paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, fontWeight: '600',
                // @ts-ignore web
                outlineWidth: 0,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {SUPPORTED_CURRENCIES.map(c => (
                <Pressable
                  key={c}
                  onPress={() => setCurrency(c)}
                  style={{
                    paddingHorizontal: 9, paddingVertical: 9, borderRadius: 10,
                    borderWidth: 1, borderColor: currency === c ? accentColor : 'rgba(0,0,0,0.08)',
                    backgroundColor: currency === c ? `${accentColor}10` : '#FFF',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: currency === c ? accentColor : '#6B6B6B' }}>
                    {CURRENCY_META[c]?.symbol ?? c}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Text style={{ fontSize: 11, color: '#9A9A9A', lineHeight: 16 }}>
            Bu tutar siparişin maliyetine eklenir ve lab gideri olarak sayılır.
          </Text>

          {error && <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '500' }}>{error}</Text>}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {leg.fee_amount != null && (
              <Pressable
                onPress={() => handleSave(true)}
                disabled={saving}
                style={{ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(217,75,75,0.35)' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#9C2E2E' }}>Ücreti kaldır</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => handleSave(false)}
              disabled={saving}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                paddingVertical: 12, borderRadius: 12, backgroundColor: accentColor, opacity: saving ? 0.6 : 1,
              }}
            >
              <Check size={14} color="#FFF" strokeWidth={2.4} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
