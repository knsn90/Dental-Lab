/**
 * PurchaseExtraLineModal — faturaya stok dışı kalem ekleme.
 *
 * Satın alınan her şey stok kalemi değil: cihaz, demirbaş, hizmet, kargo…
 * Bunlar stok hareketi üretmez ama faturanın içeriğidir. Bu pencere o satırı
 * ekler; cihaz seçilirse mevcut demirbaş kaydına da bağlanır, böylece
 * "hangi fatura ile alındı" sorusu cevaplanabilir hale gelir.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal, View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { Check, X } from 'lucide-react-native';
import { DS } from '../../../core/theme/dsTokens';
import { toast } from '../../../core/ui/Toast';
import {
  addPurchaseInvoiceExtra, listEquipmentOptions,
  PURCHASE_EXTRA_LABELS, type PurchaseExtraKind,
} from '../api';

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};
const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

interface Props {
  visible: boolean;
  purchaseInvoiceId: string;
  accentColor: string;
  currencyLabel: string;
  onClose: () => void;
  onSaved: () => void;
}

export function PurchaseExtraLineModal({
  visible, purchaseInvoiceId, accentColor, currencyLabel, onClose, onSaved,
}: Props) {
  const [kind, setKind]   = useState<PurchaseExtraKind>('equipment');
  const [desc, setDesc]   = useState('');
  const [qty, setQty]     = useState('1');
  const [unit, setUnit]   = useState('adet');
  const [price, setPrice] = useState('');
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<{ id: string; name: string; brand: string | null; purchase_date: string | null }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setKind('equipment'); setDesc(''); setQty('1'); setUnit('adet');
    setPrice(''); setEquipmentId(null);
    listEquipmentOptions().then(r => setEquipment(r.data));
  }, [visible]);

  const pickEquipment = (id: string, name: string) => {
    setEquipmentId(prev => (prev === id ? null : id));
    if (!desc.trim()) setDesc(name);
  };

  const save = useCallback(async () => {
    const q = parseFloat(qty.replace(',', '.'));
    const p = parseFloat(price.replace(',', '.'));
    if (!desc.trim())               { toast.error('Açıklama girin'); return; }
    if (!isFinite(q) || q <= 0)     { toast.error('Miktar sıfırdan büyük olmalı'); return; }
    if (!isFinite(p) || p < 0)      { toast.error('Geçerli bir birim fiyat girin'); return; }

    setSaving(true);
    const res = await addPurchaseInvoiceExtra({
      purchaseInvoiceId, kind, description: desc, quantity: q,
      unit: unit.trim() || null, unitPrice: p,
      equipmentId: kind === 'equipment' ? equipmentId : null,
    });
    setSaving(false);
    if (!res.ok) { toast.error(res.error ?? 'Eklenemedi'); return; }
    toast.success('Kalem eklendi');
    onSaved();
  }, [desc, qty, price, unit, kind, equipmentId, purchaseInvoiceId, onSaved]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{
        flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}>
        <View style={{
          width: '100%', maxWidth: 560, maxHeight: '92%',
          backgroundColor: DS.lab.surface, borderRadius: 18,
          borderWidth: 1, borderColor: DS.ink[200], overflow: 'hidden',
        }}>
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 12,
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: DS.ink[100],
          }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.4, color: DS.ink[900] }}>
                Stok dışı kalem ekle
              </Text>
              <Text style={{ fontSize: 12, color: DS.ink[500], lineHeight: 18 }}>
                Cihaz, demirbaş, hizmet veya kargo gibi stok hareketi üretmeyen
                satırlar. Faturanın içeriğine dahil olur, stok miktarını etkilemez.
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => ({
                width: 30, height: 30, borderRadius: 999, alignItems: 'center',
                justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.05)',
                opacity: pressed ? 0.6 : 1, ...webCursor,
              })}
            >
              <X size={15} color={DS.ink[700]} strokeWidth={1.9} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
            {/* Tür */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.ink[500] }}>
                Kalem türü
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(Object.keys(PURCHASE_EXTRA_LABELS) as PurchaseExtraKind[]).map(k => {
                  const on = kind === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => setKind(k)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                        backgroundColor: on ? DS.ink[900] : 'rgba(0,0,0,0.05)',
                        opacity: pressed ? 0.7 : 1, ...webCursor,
                      })}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '500', color: on ? '#FFF' : DS.ink[800] }}>
                        {PURCHASE_EXTRA_LABELS[k]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Demirbaş eşleştirme */}
            {kind === 'equipment' && equipment.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.ink[500] }}>
                  Mevcut demirbaşa bağla (opsiyonel)
                </Text>
                <View style={{ maxHeight: 150, borderRadius: 14, borderWidth: 1, borderColor: DS.ink[100] }}>
                  <ScrollView>
                    {equipment.map(e => {
                      const on = equipmentId === e.id;
                      return (
                        <Pressable
                          key={e.id}
                          onPress={() => pickEquipment(e.id, e.name)}
                          style={({ pressed }) => ({
                            flexDirection: 'row', alignItems: 'center', gap: 10,
                            paddingHorizontal: 14, paddingVertical: 9,
                            backgroundColor: on ? accentColor + '14' : 'transparent',
                            opacity: pressed ? 0.7 : 1, ...webCursor,
                          })}
                        >
                          <View style={{
                            width: 16, height: 16, borderRadius: 4, borderWidth: 1.5,
                            borderColor: on ? accentColor : DS.ink[300],
                            backgroundColor: on ? accentColor : 'transparent',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            {on ? <Check size={11} color="#FFF" strokeWidth={3} /> : null}
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={1} style={{ fontSize: 13, color: DS.ink[900] }}>{e.name}</Text>
                            <Text style={{ fontSize: 11, color: DS.ink[400] }}>
                              {e.brand ?? '—'}{e.purchase_date ? ` · ${e.purchase_date}` : ''}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            ) : null}

            {/* Açıklama */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.ink[500] }}>
                Açıklama
              </Text>
              <TextInput
                value={desc}
                onChangeText={setDesc}
                placeholder="Örn. SprintRay Pro 2 3D Printer"
                placeholderTextColor={DS.ink[300]}
                style={{
                  paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
                  borderWidth: 1, borderColor: DS.ink[300], fontSize: 13, color: DS.ink[900],
                  ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                }}
              />
            </View>

            {/* Miktar · birim · fiyat */}
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              {([
                { label: 'Miktar',      value: qty,   set: setQty,   width: 90,  kb: 'decimal-pad' as const },
                { label: 'Birim',       value: unit,  set: setUnit,  width: 90,  kb: 'default' as const },
                { label: `Birim fiyat (${currencyLabel})`, value: price, set: setPrice, width: 160, kb: 'decimal-pad' as const },
              ]).map(f => (
                <View key={f.label} style={{ gap: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.ink[500] }}>
                    {f.label}
                  </Text>
                  <TextInput
                    value={f.value}
                    onChangeText={f.set}
                    keyboardType={f.kb}
                    placeholderTextColor={DS.ink[300]}
                    style={{
                      width: f.width, paddingHorizontal: 12, paddingVertical: 10,
                      borderRadius: 14, borderWidth: 1, borderColor: DS.ink[300],
                      fontSize: 13, color: DS.ink[900], textAlign: 'right',
                      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                    }}
                  />
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 20, paddingVertical: 14,
            borderTopWidth: 1, borderTopColor: DS.ink[100],
          }}>
            <View style={{ flex: 1 }} />
            <Pressable onPress={onClose} disabled={saving} style={{ ...webCursor }}>
              <Text style={{ fontSize: 13, color: DS.ink[500] }}>Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={saving}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
                backgroundColor: DS.ink[900], opacity: saving ? 0.5 : pressed ? 0.85 : 1,
                ...webCursor,
              })}
            >
              {saving
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Check size={14} color="#FFF" strokeWidth={2} />}
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Ekle</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default PurchaseExtraLineModal;
