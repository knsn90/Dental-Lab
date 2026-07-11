// AddStageModal — müdür/admin canlı siparişe manuel aşama ekler.
// İstasyon (lab_stations havuzu) + konum (hangi aşamadan sonra) seçilir →
// order_stage_add RPC (addOrderStage). Sıra otomatik yeniden düzenlenir.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, Platform, ActivityIndicator } from 'react-native';
import { X, Plus, Check } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { addOrderStage } from '../api';
import { DS } from '../../../core/theme/dsTokens';

const INK = DS.ink;

interface StageLite { id: string; sequence_order: number; station?: { name?: string } | null; station_name?: string | null }
interface LabStation { id: string; name: string; color?: string | null }

export function AddStageModal({
  visible, onClose, orderId, labId, stages, accentColor, onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  orderId: string;
  labId: string;
  stages: StageLite[];
  accentColor?: string;
  onAdded?: () => void;
}) {
  const A = accentColor ?? '#4771AB';
  const [stations, setStations] = useState<LabStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [stationId, setStationId] = useState<string | null>(null);
  const [afterSeq, setAfterSeq] = useState<number | null>(null); // null = en başa (0)
  const [saving, setSaving] = useState(false);

  // sıralı mevcut aşamalar (konum seçimi için)
  const ordered = useMemo(
    () => [...(stages ?? [])].sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0)),
    [stages],
  );

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setStationId(null);
    // varsayılan konum: en sona (son aşamadan sonra)
    setAfterSeq(ordered.length ? ordered[ordered.length - 1].sequence_order : 0);
    supabase
      .from('lab_stations')
      .select('id, name, color, sequence_hint')
      .eq('is_active', true)
      .order('sequence_hint', { ascending: true })
      .then(({ data }) => { setStations((data ?? []) as LabStation[]); setLoading(false); });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const stageLabel = (s: StageLite) => s.station?.name ?? s.station_name ?? 'Aşama';

  const submit = async () => {
    if (!stationId || saving) return;
    setSaving(true);
    const r = await addOrderStage(orderId, stationId, afterSeq ?? 0);
    setSaving(false);
    if (!r.ok) { toast.error(r.error ?? 'Aşama eklenemedi'); return; }
    toast.success('Aşama eklendi.');
    onAdded?.();
    onClose();
  };

  const tint = (a: number) => {
    try { const r = parseInt(A.slice(1, 3), 16), g = parseInt(A.slice(3, 5), 16), b = parseInt(A.slice(5, 7), 16); return `rgba(${r},${g},${b},${a})`; } catch { return A; }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: 560, maxWidth: '100%', maxHeight: '88%', backgroundColor: '#FFFFFF', borderRadius: 22, overflow: 'hidden' }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: INK[200] }}>
            <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(0.14) }}>
              <Plus size={17} color={A} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: INK[900] }}>Aşama Ekle</Text>
              <Text style={{ fontSize: 11.5, color: INK[500], marginTop: 1 }}>İstasyon + konum seç — sıra otomatik düzenlenir.</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}><X size={20} color={INK[500]} strokeWidth={1.8} /></Pressable>
          </View>

          {loading ? (
            <View style={{ padding: 48, alignItems: 'center' }}><ActivityIndicator color={A} /></View>
          ) : (
            <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ padding: 20, gap: 18 }}>
              {/* İstasyon seç */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '600', color: INK[500], letterSpacing: 1, textTransform: 'uppercase' }}>İstasyon</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {stations.map(st => {
                    const sel = stationId === st.id;
                    return (
                      <Pressable
                        key={st.id}
                        onPress={() => setStationId(st.id)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                          borderWidth: 1, borderColor: sel ? A : INK[200],
                          backgroundColor: sel ? tint(0.12) : '#FFFFFF',
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        }}
                      >
                        {st.color ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: st.color }} /> : null}
                        <Text style={{ fontSize: 12.5, fontWeight: sel ? '700' : '500', color: sel ? A : INK[700] }}>{st.name}</Text>
                      </Pressable>
                    );
                  })}
                  {stations.length === 0 && <Text style={{ fontSize: 12, color: INK[500] }}>İstasyon tanımlı değil.</Text>}
                </View>
              </View>

              {/* Konum seç */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '600', color: INK[500], letterSpacing: 1, textTransform: 'uppercase' }}>Konum (hangi aşamadan sonra)</Text>
                <View style={{ gap: 6 }}>
                  {/* En başa */}
                  <PositionRow label="En başa ekle" active={afterSeq === 0} onPress={() => setAfterSeq(0)} A={A} tint={tint} />
                  {ordered.map(s => (
                    <PositionRow
                      key={s.id}
                      label={`"${stageLabel(s)}" sonrasına`}
                      active={afterSeq === s.sequence_order}
                      onPress={() => setAfterSeq(s.sequence_order)}
                      A={A}
                      tint={tint}
                    />
                  ))}
                </View>
              </View>
            </ScrollView>
          )}

          {/* Footer */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: INK[200] }}>
            <Pressable onPress={onClose} style={{ paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: INK[500] }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!stationId || saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12,
                backgroundColor: A, opacity: (!stationId || saving) ? 0.5 : 1,
                ...(Platform.OS === 'web' && stationId && !saving ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Check size={15} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>{saving ? 'Ekleniyor…' : 'Ekle'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PositionRow({ label, active, onPress, A, tint }: { label: string; active: boolean; onPress: () => void; A: string; tint: (a: number) => string }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
        borderWidth: 1, borderColor: active ? A : INK[200],
        backgroundColor: active ? tint(0.10) : '#FFFFFF',
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      }}
    >
      <View style={{ width: 16, height: 16, borderRadius: 999, borderWidth: 1.5, borderColor: active ? A : INK[300], alignItems: 'center', justifyContent: 'center' }}>
        {active ? <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: A }} /> : null}
      </View>
      <Text style={{ fontSize: 12.5, fontWeight: active ? '700' : '500', color: active ? INK[900] : INK[700] }}>{label}</Text>
    </Pressable>
  );
}
