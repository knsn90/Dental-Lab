/**
 * ConsumptionFixModal — geçmiş bir tüketim kaydının düzeltilmesi (Adım 2).
 *
 * Düzeltme yöntemi sunucuda sabit: orijinal hareket TERS ÇEVRİLİR, düzeltilmiş
 * miktarla YENİ hareket yazılır (correct_stage_consumption). Böylece FIFO
 * katmanları yeniden hesaplanır ve eski değerin izi kalır.
 *
 * Bu modal karar vermez, kararı toplar: profil değeri mi, elle girilen miktar
 * mı, yoksa kaydın tamamen iptali mi. Yanlış kalem/aşama seçimi de burada
 * düzeltilir — çünkü miktarı doğru yazmak, yanlış kalemde işe yaramaz.
 *
 * TASARIM: DS token + inline style (ekranla aynı yöntem — DESIGN_LANGUAGE 11.8)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { AlertTriangle, Check, Search, X } from 'lucide-react-native';
import { DS } from '../../../core/theme/dsTokens';
import { toast } from '../../../core/ui/Toast';
import {
  correctConsumption, fetchOrderStageOptions, fetchItemOptions,
  type ConsumptionAuditRow, type StageOption, type ItemOption,
} from '../api';

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

const fmt = (n: number | null | undefined, digits = 4) =>
  (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: digits });

interface Props {
  visible: boolean;
  row: ConsumptionAuditRow | null;
  accentColor: string;
  onClose: () => void;
  onDone: () => void;
}

type Mode = 'profile' | 'manual';

export function ConsumptionFixModal({ visible, row, accentColor, onClose, onDone }: Props) {
  const [mode, setMode]         = useState<Mode>('profile');
  const [qty, setQty]           = useState('');
  const [note, setNote]         = useState('');
  const [stageId, setStageId]   = useState<string | null>(null);
  const [itemId, setItemId]     = useState<string | null>(null);
  const [stages, setStages]     = useState<StageOption[]>([]);
  const [items, setItems]       = useState<ItemOption[]>([]);
  const [itemQ, setItemQ]       = useState('');
  const [showItems, setShowItems] = useState(false);
  const [saving, setSaving]     = useState(false);

  /** Varsayım kurala dayanan "beklenen" değer güvenilir değil — profil seçeneği kapalı */
  const assumption = !!row?.flags?.includes('varsayim_kural');
  const hasExpected = row?.expected_qty != null && !assumption;

  useEffect(() => {
    if (!visible || !row) return;
    setMode(hasExpected ? 'profile' : 'manual');
    setQty('');
    setNote('');
    setStageId(null);
    setItemId(null);
    setItemQ('');
    setShowItems(false);
    if (row.order_id) {
      fetchOrderStageOptions(row.order_id).then(r => setStages(r.data));
    }
    fetchItemOptions().then(r => setItems(r.data));
  }, [visible, row, hasExpected]);

  const currentItem = useMemo(
    () => items.find(i => i.id === (itemId ?? row?.item_id)) ?? null,
    [items, itemId, row],
  );

  const filteredItems = useMemo(() => {
    const s = itemQ.trim().toLowerCase();
    const list = s ? items.filter(i => i.name.toLowerCase().includes(s)) : items;
    return list.slice(0, 40);
  }, [items, itemQ]);

  const apply = useCallback(async (cancel: boolean) => {
    if (!row) return;
    let newQty: number | null = null;
    if (!cancel && mode === 'manual') {
      const n = parseFloat(qty.replace(',', '.'));
      if (!isFinite(n) || n <= 0) { toast.error('Geçerli bir miktar girin'); return; }
      newQty = n;
    }
    setSaving(true);
    const res = await correctConsumption({
      movementId: row.movement_id,
      newQty,
      // Elle girilen miktar kalem biriminde okunur; profil kendi birimini taşır.
      newUnit: !cancel && mode === 'manual' ? (currentItem?.unit ?? row.item_unit) : null,
      newItemId: itemId,
      newStageId: stageId,
      cancel,
      note: note.trim() || null,
    });
    setSaving(false);
    if (!res.ok) { toast.error(res.error ?? 'Düzeltilemedi'); return; }
    toast.success(cancel ? 'Kayıt iptal edildi' : 'Düzeltme yazıldı');
    onDone();
  }, [row, mode, qty, note, itemId, stageId, currentItem, onDone]);

  if (!row) return null;

  const unitLabel = currentItem?.unit ?? row.item_unit ?? '';

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
          {/* Başlık */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 12,
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: DS.ink[100],
          }}>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.4, color: DS.ink[900] }}>
                Kaydı düzelt
              </Text>
              <Text numberOfLines={2} style={{ fontSize: 12, color: DS.ink[500] }}>
                {row.item_name} · {row.order_number ?? '—'} · {row.stage_name ?? 'aşama yok'}
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
            {/* Kayıtlı → önerilen */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 16,
              paddingHorizontal: 16, paddingVertical: 12,
              borderRadius: 14, backgroundColor: DS.ink[50],
            }}>
              <View style={{ gap: 2 }}>
                <Text style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[400] }}>
                  Kayıtlı
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900] }}>
                  {fmt(row.recorded_norm)} {row.norm_unit ?? unitLabel}
                </Text>
              </View>
              <Text style={{ fontSize: 16, color: DS.ink[300] }}>→</Text>
              <View style={{ gap: 2 }}>
                <Text style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[400] }}>
                  Profil
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '600', color: hasExpected ? DS.lab.success : DS.ink[400] }}>
                  {row.expected_norm != null ? `${fmt(row.expected_norm)} ${row.norm_unit ?? unitLabel}` : 'yok'}
                </Text>
              </View>
            </View>

            {row.basis ? (
              <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: -10 }}>
                Profil gerekçesi: {row.basis}
              </Text>
            ) : null}

            {assumption ? (
              <View style={{
                flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 12,
                borderRadius: 14, backgroundColor: 'rgba(232,155,42,0.10)',
              }}>
                <AlertTriangle size={15} color={DS.lab.warning} strokeWidth={1.8} />
                <Text style={{ flex: 1, fontSize: 12, color: DS.ink[700], lineHeight: 18 }}>
                  Bu kalemin kuralı henüz varsayım. Profil değeri güvenilir değil —
                  miktarı elle girin ya da önce kuralı onaylayın.
                </Text>
              </View>
            ) : null}

            {/* Miktar kaynağı */}
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.ink[500] }}>
                Yeni miktar
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {([
                  { k: 'profile' as Mode, l: 'Profil değerini uygula', on: hasExpected },
                  { k: 'manual'  as Mode, l: 'Elle gir',               on: true },
                ]).map(o => {
                  const active = mode === o.k;
                  return (
                    <Pressable
                      key={o.k}
                      disabled={!o.on}
                      onPress={() => setMode(o.k)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                        backgroundColor: active ? DS.ink[900] : 'rgba(0,0,0,0.05)',
                        opacity: !o.on ? 0.35 : pressed ? 0.7 : 1,
                        ...(Platform.OS === 'web' ? ({ cursor: o.on ? 'pointer' : 'not-allowed' } as any) : {}),
                      })}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '500', color: active ? '#FFF' : DS.ink[800] }}>
                        {o.l}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {mode === 'manual' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TextInput
                    value={qty}
                    onChangeText={setQty}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={DS.ink[300]}
                    style={{
                      width: 140, paddingHorizontal: 14, paddingVertical: 10,
                      borderRadius: 14, borderWidth: 1, borderColor: DS.ink[300],
                      fontSize: 14, color: DS.ink[900], textAlign: 'end' as any,
                      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                    }}
                  />
                  <Text style={{ fontSize: 13, color: DS.ink[500] }}>
                    {unitLabel} <Text style={{ color: DS.ink[400] }}>(kalem birimi)</Text>
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Aşama düzeltmesi */}
            {stages.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.ink[500] }}>
                  Aşama {stageId ? '(değiştirildi)' : '(değişmiyor)'}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {stages.map(s => {
                    const active = (stageId ?? row.stage_id) === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => setStageId(s.id === row.stage_id ? null : s.id)}
                        style={({ pressed }) => ({
                          paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                          backgroundColor: active ? accentColor + '22' : 'rgba(0,0,0,0.04)',
                          borderWidth: 1, borderColor: active ? accentColor : 'transparent',
                          opacity: pressed ? 0.7 : 1, ...webCursor,
                        })}
                      >
                        <Text style={{ fontSize: 12, color: DS.ink[800] }}>{s.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Kalem düzeltmesi */}
            <View style={{ gap: 8 }}>
              <Pressable onPress={() => setShowItems(v => !v)} style={{ ...webCursor }}>
                <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.ink[500] }}>
                  Kalem {itemId ? '(değiştirildi)' : '— değiştirmek için dokunun'}
                </Text>
              </Pressable>
              <Text numberOfLines={1} style={{ fontSize: 13, color: DS.ink[900] }}>
                {currentItem?.name ?? row.item_name}
              </Text>

              {showItems ? (
                <View style={{ gap: 8 }}>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingHorizontal: 12, height: 36, borderRadius: 999,
                    borderWidth: 1, borderColor: DS.ink[200],
                  }}>
                    <Search size={13} color={DS.ink[400]} strokeWidth={1.8} />
                    <TextInput
                      value={itemQ}
                      onChangeText={setItemQ}
                      placeholder="Kalem ara"
                      placeholderTextColor={DS.ink[400]}
                      style={{
                        flex: 1, fontSize: 13, color: DS.ink[900],
                        ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                      }}
                    />
                  </View>
                  <View style={{ maxHeight: 180, borderRadius: 14, borderWidth: 1, borderColor: DS.ink[100] }}>
                    <ScrollView>
                      {filteredItems.map(it => {
                        const active = (itemId ?? row.item_id) === it.id;
                        return (
                          <Pressable
                            key={it.id}
                            onPress={() => { setItemId(it.id === row.item_id ? null : it.id); setShowItems(false); }}
                            style={({ pressed }) => ({
                              paddingHorizontal: 14, paddingVertical: 10,
                              backgroundColor: active ? DS.ink[50] : 'transparent',
                              opacity: pressed ? 0.7 : 1, ...webCursor,
                            })}
                          >
                            <Text numberOfLines={1} style={{ fontSize: 13, color: DS.ink[900] }}>
                              {it.name}
                            </Text>
                            <Text style={{ fontSize: 11, color: DS.ink[400] }}>
                              {it.category ?? '—'} · {it.unit ?? ''}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              ) : null}
            </View>

            {/* Not */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.ink[500] }}>
                Not (opsiyonel)
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Neden düzeltiliyor?"
                placeholderTextColor={DS.ink[300]}
                style={{
                  paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
                  borderWidth: 1, borderColor: DS.ink[300], fontSize: 13, color: DS.ink[900],
                  ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                }}
              />
            </View>
          </ScrollView>

          {/* Aksiyonlar */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 20, paddingVertical: 14,
            borderTopWidth: 1, borderTopColor: DS.ink[100], flexWrap: 'wrap',
          }}>
            <Pressable
              onPress={() => apply(false)}
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
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>
                Düzelt
              </Text>
            </Pressable>

            <Pressable
              onPress={() => apply(true)}
              disabled={saving}
              style={({ pressed }) => ({
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
                backgroundColor: 'rgba(217,75,75,0.10)',
                opacity: saving ? 0.5 : pressed ? 0.7 : 1, ...webCursor,
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.lab.danger }}>
                Kaydı iptal et
              </Text>
            </Pressable>

            <View style={{ flex: 1 }} />

            <Pressable onPress={onClose} disabled={saving} style={{ ...webCursor }}>
              <Text style={{ fontSize: 13, color: DS.ink[500] }}>Vazgeç</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default ConsumptionFixModal;
