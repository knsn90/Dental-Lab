/**
 * RevisionModal — teslim edilmiş siparişin revizyonunu bağlı yeni sipariş olarak açar.
 *
 * Sorumluluk seçimi fiyatı belirler:
 *   lab    → garanti / ücretsiz (kalem fiyatları 0)
 *   client → hekim kaynaklı değişiklik, orijinal fiyatlar kopyalanır
 * Aynı alan "yeniden-yapım oranı" KPI'ının kaynağıdır.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, Platform, ActivityIndicator } from 'react-native';
import { RotateCcw, X, Check, Building2, Stethoscope } from 'lucide-react-native';
import { createRevisionOrder, type RevisionResponsible } from '../api';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';

interface Props {
  visible: boolean;
  orderId: string;
  orderNumber: string;
  /** Hatalı istasyon seçeneklerini süzmek için — siparişin labı */
  labId?: string | null;
  accentColor?: string;
  onClose: () => void;
  /** Revizyon oluşturuldu → yeni siparişin id'si */
  onCreated: (newOrderId: string) => void;
}

const RESPONSIBLE_OPTS: Array<{
  key: RevisionResponsible; label: string; hint: string; icon: any;
}> = [
  { key: 'lab',    label: 'Lab kaynaklı',   hint: 'Garanti — kalem fiyatları 0 açılır', icon: Building2 },
  { key: 'client', label: 'Hekim kaynaklı', hint: 'Ücretli — orijinal fiyatlar kopyalanır', icon: Stethoscope },
];

export function RevisionModal({ visible, orderId, orderNumber, labId, accentColor = '#2563EB', onClose, onCreated }: Props) {
  const [reason, setReason] = useState('');
  const [responsible, setResponsible] = useState<RevisionResponsible | null>(null);
  const [faultStation, setFaultStation] = useState<string | null>(null);
  const [stations, setStations] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Hatalı istasyon seçenekleri — yalnız lab kaynaklı revizyonda gösterilir
  useEffect(() => {
    if (!visible || !labId) return;
    supabase.from('lab_stations').select('id, name')
      .eq('lab_profile_id', labId).eq('is_active', true).order('sequence_order')
      .then(({ data }) => setStations((data as any[]) ?? []));
  }, [visible, labId]);

  const reset = () => {
    setReason(''); setResponsible(null); setFaultStation(null); setError(''); setSaving(false);
  };

  const handleCreate = async () => {
    if (!reason.trim())  { setError('Revizyon sebebi zorunlu'); return; }
    if (!responsible)    { setError('Sorumluluk seçilmeli'); return; }
    setSaving(true); setError('');
    const res = await createRevisionOrder(
      orderId, reason.trim(), responsible, null,
      responsible === 'lab' ? faultStation : null,
    );
    setSaving(false);
    if (!res.ok || !res.id) { setError(res.error ?? 'Revizyon oluşturulamadı'); return; }
    toast.success('Revizyon siparişi oluşturuldu — planlamaya düştü.');
    reset();
    onCreated(res.id);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Pressable
          onPress={(e: any) => e.stopPropagation?.()}
          style={{ width: '100%', maxWidth: 460, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 22, gap: 16 }}
        >
          {/* Başlık */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: accentColor + '1A', alignItems: 'center', justifyContent: 'center' }}>
              <RotateCcw size={18} color={accentColor} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#0A0A0A', letterSpacing: -0.3 }}>Revizyon Oluştur</Text>
              <Text style={{ fontSize: 12.5, color: '#6B6B6B', marginTop: 2, lineHeight: 18 }}>
                {orderNumber} bağlı yeni sipariş olarak yeniden açılır. Orijinal sipariş
                teslim edilmiş olarak kalır; revizyon normal planlamaya düşer.
              </Text>
            </View>
            <Pressable onPress={onClose} style={{ padding: 4, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <X size={18} color="#9A9A9A" strokeWidth={2} />
            </Pressable>
          </View>

          {/* Sorumluluk */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: '#9A9A9A', textTransform: 'uppercase' }}>
              Sorumluluk
            </Text>
            <View style={{ gap: 8 }}>
              {RESPONSIBLE_OPTS.map(opt => {
                const active = responsible === opt.key;
                const Icon = opt.icon;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => { setResponsible(opt.key); setError(''); }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: active ? accentColor : '#EAEAEA',
                      backgroundColor: active ? accentColor + '0F' : '#FFFFFF',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <Icon size={16} color={active ? accentColor : '#9A9A9A'} strokeWidth={1.9} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13.5, fontWeight: '600', color: active ? '#0A0A0A' : '#2C2C2C' }}>{opt.label}</Text>
                      <Text style={{ fontSize: 11.5, color: '#6B6B6B', marginTop: 1 }}>{opt.hint}</Text>
                    </View>
                    {active && <Check size={16} color={accentColor} strokeWidth={2.4} />}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Hatalı istasyon — yalnız lab kaynaklıda, opsiyonel (KPI kırılımı) */}
          {responsible === 'lab' && stations.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: '#9A9A9A', textTransform: 'uppercase' }}>
                Hata hangi aşamada? (opsiyonel)
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {stations.map(st => {
                  const active = faultStation === st.id;
                  return (
                    <Pressable
                      key={st.id}
                      onPress={() => setFaultStation(active ? null : st.id)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999,
                        borderWidth: 1,
                        borderColor: active ? accentColor : '#EAEAEA',
                        backgroundColor: active ? accentColor : '#FFFFFF',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      }}
                    >
                      {active && <Check size={11} color="#FFFFFF" strokeWidth={2.6} />}
                      <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#FFFFFF' : '#2C2C2C' }}>{st.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ fontSize: 11, color: '#9A9A9A' }}>
                Yeniden-yapım raporunda "nerede hata oluyor" kırılımını besler.
              </Text>
            </View>
          )}

          {/* Sebep */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: '#9A9A9A', textTransform: 'uppercase' }}>
              Revizyon sebebi *
            </Text>
            <TextInput
              value={reason}
              onChangeText={(t) => { setReason(t); setError(''); }}
              placeholder="Hekimin talebi / tespit edilen sorun…"
              placeholderTextColor="#9A9A9A"
              multiline
              style={{
                borderWidth: 1, borderColor: '#EAEAEA', borderRadius: 12,
                paddingHorizontal: 12, paddingVertical: 10,
                fontSize: 13.5, color: '#0A0A0A', minHeight: 76, textAlignVertical: 'top',
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
              } as any}
            />
          </View>

          {!!error && (
            <Text style={{ fontSize: 12.5, color: '#DC2626', fontWeight: '500' }}>{error}</Text>
          )}

          {/* Aksiyonlar */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={onClose}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#EAEAEA', alignItems: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C2C2C' }}>Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={handleCreate}
              disabled={saving}
              style={{ flex: 1.4, paddingVertical: 12, borderRadius: 12, backgroundColor: accentColor, alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.7 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
            >
              {saving
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Revizyonu Oluştur</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
