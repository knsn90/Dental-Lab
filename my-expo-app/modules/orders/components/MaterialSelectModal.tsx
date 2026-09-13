/**
 * MaterialSelectModal — Miktarsız malzeme seçimi (Envanter D2).
 *
 * Teknisyenin görevi muhasebe değil üretimdir: burada **hiçbir miktar alanı
 * yoktur.** Teknisyen yalnız kullandığı gerçek ürünü seçer; gram/ml/adet
 * hesabını standart tüketim profili yapar.
 *
 * Kurallar:
 *   • Yalnız bu istasyona izin verilen üretim malzemeleri listelenir (spec §7.2)
 *   • Aynı ürün tekrar seçilebilir → ayrı kullanım olayı (blok kırıldı, tekrar
 *     glaze vb.). Neden seçimi ZORUNLU DEĞİLDİR — zorunlu alan atlanma üretir.
 *   • Kuralı olmayan malzeme seçilebilir ama stok düşmez; kullanıcı bunu
 *     ekranda açıkça görür ve seçim yöneticiye rapor edilir.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, Platform } from 'react-native';
import { AlertTriangle, Check, Flame, Minus, Package, Plus, SkipForward, X } from '../../../core/ui/icons';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import {
  fetchStageMaterialOptions, confirmStageMaterialsV2, newIdempotencyKey,
  type StageMaterialOption,
} from '../api';

interface Props {
  visible: boolean;
  stageId: string | null;
  accentColor?: string;
  /** false → aşama geçişini caller yönetir (istasyon kanban akışı) */
  advanceStage?: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}

/** Bir kullanım olayı — aynı ürün için birden çok olabilir */
type UsageEvent = { itemId: string; kind: 'normal' | 'fire' };

const INK = { 900: '#0A0A0A', 700: '#3C3C3C', 500: '#6B6B6B', 400: '#9A9A9A' } as const;

export function MaterialSelectModal({
  visible, stageId, accentColor = '#0A0A0A', advanceStage = true, onClose, onConfirmed,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [options, setOptions] = useState<StageMaterialOption[]>([]);
  const [events, setEvents]   = useState<UsageEvent[]>([]);
  const [error, setError]     = useState<string | null>(null);
  const [idemKey, setIdemKey] = useState<string>(() => newIdempotencyKey('stage-sel'));

  const load = useCallback(async () => {
    if (!stageId) return;
    setLoading(true);
    setError(null);
    const res = await fetchStageMaterialOptions(stageId);
    if (res.error) setError(res.error);
    setOptions(res.data);
    setEvents([]);
    setIdemKey(newIdempotencyKey('stage-sel'));
    setLoading(false);
  }, [stageId]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  /** Üretim malzemesine göre grupla — teknisyen "Zirkon Blok" başlığı altında marka seçer */
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; hasRule: boolean; items: StageMaterialOption[] }>();
    for (const o of options) {
      if (!map.has(o.production_material_id)) {
        map.set(o.production_material_id, {
          name: o.production_name, hasRule: o.has_rule, items: [],
        });
      }
      map.get(o.production_material_id)!.items.push(o);
    }
    return [...map.entries()].map(([id, g]) => ({ id, ...g }));
  }, [options]);

  const countFor = (itemId: string) => events.filter(e => e.itemId === itemId).length;

  const addEvent = (itemId: string, kind: 'normal' | 'fire' = 'normal') =>
    setEvents(prev => [...prev, { itemId, kind }]);

  const removeLast = (itemId: string) =>
    setEvents(prev => {
      const idx = [...prev].reverse().findIndex(e => e.itemId === itemId);
      if (idx === -1) return prev;
      const realIdx = prev.length - 1 - idx;
      return prev.filter((_, i) => i !== realIdx);
    });

  const submit = async (selections: UsageEvent[]) => {
    if (!stageId) return;
    setSaving(true);
    const res = await confirmStageMaterialsV2(
      stageId,
      selections.map(e => ({ stock_item_id: e.itemId, usage_kind: e.kind })),
      advanceStage,
      idemKey,
    );
    setSaving(false);
    if (!res.ok) { setError(res.error ?? 'Onay başarısız'); return; }
    onConfirmed();
  };

  const noneUsed = events.length === 0;

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{
        flex: 1, backgroundColor: 'rgba(20,15,10,0.55)',
        justifyContent: 'center', alignItems: 'center', padding: 20,
      }}>
        <View style={{
          width: '100%', maxWidth: 560, maxHeight: '86%',
          backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden',
        }}>
          {/* Başlık */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <View style={{
              width: 40, height: 40, borderRadius: 20, alignItems: 'center',
              justifyContent: 'center', backgroundColor: accentColor + '1A',
            }}>
              <Package size={18} color={accentColor} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: INK[900] }}>
                Kullanılan malzemeler
              </Text>
              <Text style={{ fontSize: 12, color: INK[500], marginTop: 2 }}>
                Miktar girmenize gerek yok — sistem hesaplar
              </Text>
            </View>
            <Pressable onPress={onClose} style={{
              width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.04)',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}>
              <X size={14} color={INK[500]} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
            {loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator color={accentColor} />
              </View>
            ) : error ? (
              <View style={{ padding: 14, borderRadius: 12, backgroundColor: 'rgba(217,75,75,0.08)' }}>
                <Text style={{ fontSize: 13, color: '#9C2E2E' }}>{error}</Text>
              </View>
            ) : groups.length === 0 ? (
              <View style={{ paddingVertical: 30, alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: INK[700] }}>
                  Bu aşamada seçilebilecek malzeme yok
                </Text>
                <Text style={{ fontSize: 12, color: INK[500], textAlign: 'center', lineHeight: 17 }}>
                  Ürünler henüz üretim malzemesine bağlanmamış olabilir.
                  Stok → Ayarlar → Üretim Malzemesi Eşleştirmesi.
                </Text>
              </View>
            ) : groups.map(g => (
              <View key={g.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Text style={{
                    fontSize: 11, fontWeight: '700', color: INK[400],
                    letterSpacing: 1, textTransform: 'uppercase',
                  }}>
                    {g.name}
                  </Text>
                  {!g.hasRule && (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999,
                      backgroundColor: 'rgba(232,155,42,0.14)',
                    }}>
                      <AlertTriangle size={10} color="#B45309" strokeWidth={2} />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#B45309' }}>
                        PROFİL YOK — STOK DÜŞMEZ
                      </Text>
                    </View>
                  )}
                </View>

                <View style={{ gap: 6 }}>
                  {g.items.map(it => {
                    const n = countFor(it.stock_item_id);
                    const active = n > 0;
                    return (
                      <View key={it.stock_item_id} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
                        borderWidth: 1,
                        borderColor: active ? accentColor + '66' : 'rgba(0,0,0,0.10)',
                        backgroundColor: active ? accentColor + '0D' : 'transparent',
                      }}>
                        <Pressable
                          onPress={() => (active ? removeLast(it.stock_item_id) : addEvent(it.stock_item_id))}
                          style={{ flex: 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: INK[900] }}>
                            {it.stock_item_name}
                          </Text>
                          <Text style={{ fontSize: 11, color: INK[400], marginTop: 2 }}>
                            Stok: {Number(it.quantity) || 0} {it.stock_unit ?? ''}
                          </Text>
                        </Pressable>

                        {/* Kullanım olayı sayacı — miktar DEĞİL, kaç kez kullanıldığı */}
                        {active && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Pressable
                              onPress={() => removeLast(it.stock_item_id)}
                              style={{
                                width: 26, height: 26, borderRadius: 13, alignItems: 'center',
                                justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.05)',
                                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                              }}
                            >
                              <Minus size={12} color={INK[700]} strokeWidth={2.2} />
                            </Pressable>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: accentColor, minWidth: 14, textAlign: 'center' }}>
                              {n}
                            </Text>
                            <Pressable
                              onPress={() => addEvent(it.stock_item_id)}
                              style={{
                                width: 26, height: 26, borderRadius: 13, alignItems: 'center',
                                justifyContent: 'center', backgroundColor: accentColor,
                                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                              }}
                            >
                              <Plus size={12} color="#FFF" strokeWidth={2.4} />
                            </Pressable>
                            <Pressable
                              onPress={() => addEvent(it.stock_item_id, 'fire')}
                              style={{
                                width: 26, height: 26, borderRadius: 13, alignItems: 'center',
                                justifyContent: 'center', backgroundColor: 'rgba(217,75,75,0.10)',
                                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                              }}
                            >
                              <Flame size={12} color="#D94B4B" strokeWidth={2} />
                            </Pressable>
                          </View>
                        )}

                        {!active && (
                          <Pressable
                            onPress={() => addEvent(it.stock_item_id)}
                            style={{
                              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                              borderWidth: 1, borderColor: 'rgba(0,0,0,0.14)',
                              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '600', color: INK[700] }}>Seç</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}

            {events.length > 0 && (
              <Text style={{ fontSize: 11, color: INK[400], lineHeight: 16 }}>
                Aynı ürünü birden çok kez seçtiyseniz her biri ayrı kullanım olayı olarak
                kaydedilir. Alev simgesi kullanımı "fire" olarak işaretler — zorunlu değildir.
              </Text>
            )}
          </ScrollView>

          {/* Alt bar */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 16, paddingVertical: 14,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
            backgroundColor: '#FBF9F4',
          }}>
            <Text style={{ fontSize: 12, color: INK[500], flex: 1 }}>
              {events.length > 0 ? `${events.length} kullanım kaydedilecek` : 'Malzeme seçilmedi'}
            </Text>
            <Pressable
              onPress={() => submit(events)}
              disabled={saving || loading}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999,
                backgroundColor: noneUsed ? '#FFFFFF' : accentColor,
                borderWidth: noneUsed ? 1 : 0, borderColor: 'rgba(0,0,0,0.14)',
                opacity: saving || loading ? 0.5 : 1,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              {saving
                ? <ActivityIndicator size="small" color={noneUsed ? INK[700] : '#FFF'} />
                : noneUsed
                  ? <SkipForward size={14} color={INK[700]} strokeWidth={2.2} />
                  : <Check size={14} color="#FFF" strokeWidth={2.4} />}
              <Text style={{
                fontSize: 13, fontWeight: '600',
                color: noneUsed ? INK[700] : '#FFF',
              }}>
                {saving ? 'Kaydediliyor…'
                  : noneUsed
                    ? (advanceStage ? 'Malzeme kullanılmadı · İlerlet' : 'Malzeme kullanılmadı')
                    : (advanceStage ? 'Onayla & İlerlet' : 'Onayla')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default MaterialSelectModal;
